// Browser checks of the built Markdown Studio webview (dist/rich-editor) against a stub host that
// implements the versioned edit protocol. Run after `pnpm run build:rich-editor`:
//   npx tsx rich-editor/test/studio.browser.ts [--shots <dir>]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { starterMasters } from "../document/masters";

const root = path.resolve(__dirname, "..", "..");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { chromium } = require(path.join(root, "slides-studio/node_modules/@playwright/test"));
const shotsArg = process.argv.indexOf("--shots");
const shots = shotsArg > 0 ? process.argv[shotsArg + 1] : "";
const masters = starterMasters();

const page = (content: string, theme: "light" | "dark") => `<!doctype html><html><head><meta charset="utf-8"><link href="/dist/rich-editor/editor.css" rel="stylesheet"></head>
<body class="vscode-${theme}"><div id="root"></div>
<script>
window.__doc = { text: ${JSON.stringify(content)}, version: 1 };
window.__edits = []; window.__msgs = [];
const reply = (m) => setTimeout(() => window.postMessage(m, '*'));
const apply = (text, changes) => { let out = '', at = 0; for (const c of changes) { out += text.slice(at, c.start) + c.text; at = c.end; } return out + text.slice(at); };
window.__external = (text) => { window.__doc = { text, version: window.__doc.version + 1 }; reply({ type: 'update', content: text, version: window.__doc.version }); };
window.acquireVsCodeApi = () => ({
  postMessage(m) {
    window.__msgs.push(m);
    if (m.type === 'ready') {
      reply({ type: 'init', content: window.__doc.text, version: window.__doc.version, baseUri: ${JSON.stringify(baseUri)}, docFolderPath: 'c:/docs', filePath: 'c:/docs/report.md', isReadonly: false, settings: { pageView: true }, gmcRuntimeUri: '', gmcEditorUri: '', gmcEditorCssUri: '', gmcVersion: 't' });
      reply({ type: 'mastersResult', entries: ${JSON.stringify(masters.map((m) => ({ id: m.id, name: m.name, source: "starter", readonly: true })))}, masters: ${JSON.stringify(masters)}, assetBases: {} });
    }
    if (m.type === 'edit') {
      window.__edits.push(m);
      if (m.baseVersion !== window.__doc.version) { reply({ type: 'rejected', id: m.id, reason: 'stale', conflict: true }); reply({ type: 'update', content: window.__doc.text, version: window.__doc.version }); return; }
      window.__doc = { text: apply(window.__doc.text, m.changes), version: window.__doc.version + 1 };
      reply({ type: 'ack', id: m.id, version: window.__doc.version });
    }
    if (m.type === 'masters') reply({ type: 'mastersResult', requestId: m.requestId, entries: [], masters: ${JSON.stringify(masters)}, assetBases: {} });
  },
  getState() {}, setState() {},
});
</script><script type="module" src="/dist/rich-editor/webview.js"></script></body></html>`;

let content = "";
let theme: "light" | "dark" = "light";
let baseUri = "https://file+.vscode-resource.vscode-cdn.net/c%3A/docs";
const fixtureDir = path.join(__dirname, "fixtures", "report");
const server = http.createServer((req, res) => {
  const url = (req.url ?? "/").split("?")[0];
  if (url === "/") return res.end(page(content, theme));
  if (url.startsWith("/fixture/")) {
    const f = path.join(fixtureDir, url.slice("/fixture/".length));
    if (!f.startsWith(fixtureDir) || !fs.existsSync(f)) return (res.statusCode = 404), res.end();
    res.setHeader("content-type", "image/png");
    return res.end(fs.readFileSync(f));
  }
  const file = path.join(root, url);
  if (!file.startsWith(path.join(root, "dist")) || !fs.existsSync(file)) return (res.statusCode = 404), res.end();
  res.setHeader("content-type", file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "application/octet-stream");
  res.end(fs.readFileSync(file));
});

const para = (i: number) => `Paragraph ${i}: ${"Revenue grew steadily while costs stayed flat and the platform team shipped ahead of schedule. ".repeat(4)}`;
const ROWS = Array.from({ length: 60 }, (_, i) => `| R${i} | ${i * 3} |`).join("\n");
const DOC = [
  "---",
  "title: Report # keep",
  "custom: { keep: true }",
  "---",
  "",
  "# Report",
  "",
  "* star bullets stay",
  "* second",
  "",
  "Some __underscore bold__ and *star emphasis* stay as written.",
  "",
  ...Array.from({ length: 24 }, (_, i) => para(i) + "\n"),
  "## Table",
  "",
  "| Row | Value |",
  "|-----|------:|",
  ROWS,
  "",
  "```js",
  "const x  =  1;   // spacing kept",
  "```",
  "",
  "Last paragraph.",
  "",
].join("\n");

async function open(browser: any, doc: string, opts: { width?: number; theme?: "light" | "dark" } = {}) {
  content = doc;
  theme = opts.theme ?? "light";
  const p = await browser.newPage({ viewport: { width: opts.width ?? 1400, height: 900 } });
  const errors: string[] = [];
  p.on("pageerror", (e: Error) => errors.push(e.message));
  p.on("console", (m: any) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  p.on("response", (r: any) => r.status() === 404 && !/favicon/.test(r.url()) && errors.push(`404 ${r.url()}`));
  await p.goto(`http://127.0.0.1:${(server.address() as any).port}/`);
  await p.waitForSelector(".ProseMirror");
  await p.waitForFunction(() => document.querySelectorAll(".ms-page").length > 0, null, { timeout: 15000 });
  await p.waitForTimeout(800);
  return { p, errors };
}

(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch();
  try {
    // 1. Opening is a no-op; pages are derived.
    const { p, errors } = await open(browser, DOC);
    const pages = await p.locator(".ms-page").count();
    assert.ok(pages >= 3, `paginated (${pages} pages)`);
    assert.equal((await p.evaluate(() => (window as any).__edits.length)), 0, "opening never writes");
    // Table rows split onto pages with a repeated header row.
    const repeated = await p.locator("tr.ms-repeat-header").count();
    assert.ok(repeated >= 1, "table header repeated after a page break");
    // Content stays in one editor: no paragraph duplicated.
    const count = await p.evaluate(() => [...document.querySelectorAll(".ProseMirror p")].filter((e) => e.textContent?.startsWith("Paragraph 5:")).length);
    assert.equal(count, 1);
    if (shots) await p.screenshot({ path: path.join(shots, "studio-light.png") });

    // 2. Typing in one paragraph changes only that span; everything else keeps its exact source.
    await p.locator(".ProseMirror p", { hasText: "Paragraph 20:" }).click();
    await p.evaluate(() => {
      const el = [...document.querySelectorAll(".ProseMirror p")].find((e) => e.textContent?.startsWith("Paragraph 20:"))!;
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let last: Node | null = null;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) last = n;
      const range = document.createRange();
      range.setStart(last!, last!.textContent!.length);
      range.collapse(true);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
    });
    await p.waitForTimeout(100);
    await p.keyboard.type(" Added.");
    await p.waitForFunction(() => (window as any).__edits.length > 0 && (window as any).__doc.text.includes("Added."), null, { timeout: 5000 });
    const after = await p.evaluate(() => (window as any).__doc.text as string);
    const expected = DOC.replace(para(20), `${para(20).trimEnd()} Added.`);
    if (after !== expected) {
      let i = 0;
      while (after[i] === expected[i]) i++;
      throw new Error(`source changed outside the edit at ${i}:\n--- got\n${JSON.stringify(after.slice(i - 80, i + 160))}\n--- expected\n${JSON.stringify(expected.slice(i - 80, i + 160))}`);
    }
    const edit = await p.evaluate(() => (window as any).__edits[0]);
    assert.equal(edit.changes.length, 1);
    assert.ok(edit.changes[0].end - edit.changes[0].start < 200, "minimal span");

    // 3. External change elsewhere while typing is pending: both survive.
    await p.keyboard.type(" More");
    await p.evaluate(() => (window as any).__external((window as any).__doc.text.replace("Last paragraph.", "Last paragraph, edited elsewhere.")));
    await p.waitForTimeout(1200);
    const merged = await p.evaluate(() => (window as any).__doc.text as string);
    assert.ok(merged.includes("Added. More"), "local typing kept");
    assert.ok(merged.includes("Last paragraph, edited elsewhere."), "external change kept");

    // 4. Undo goes to VS Code (one history), not ProseMirror.
    const before = await p.evaluate(() => (window as any).__msgs.length);
    await p.keyboard.press("Control+z");
    await p.waitForTimeout(200);
    const undoMsgs = await p.evaluate((n: number) => (window as any).__msgs.slice(n).map((m: any) => m.type), before);
    assert.ok(undoMsgs.includes("undo"), `undo routed to the host (${undoMsgs})`);

    // 5. Insert a text box from the ribbon: marker + descriptor in one edit; nudge burst = one edit.
    await p.locator(".ProseMirror p", { hasText: "Paragraph 2:" }).click();
    await p.getByRole("tab", { name: "Insert" }).click();
    const editsBefore = await p.evaluate(() => (window as any).__edits.length);
    await p.getByRole("button", { name: "Text box" }).click();
    await p.waitForFunction((n: number) => (window as any).__edits.length > n && (window as any).__doc.text.includes("ms:object"), editsBefore, { timeout: 5000 });
    const withBox = await p.evaluate(() => (window as any).__doc.text as string);
    assert.match(withBox, /objects:\n\s+textbox:/);
    assert.match(withBox, /<!-- ms:object \{"id":"textbox"\} -->\n\nText\n\n<!-- ms:endobject -->/, withBox.slice(withBox.indexOf("ms:object") - 200, withBox.indexOf("ms:object") + 200));
    assert.ok(withBox.startsWith("---\ntitle: Report # keep\ncustom: { keep: true }\n"), "other frontmatter untouched");
    await p.waitForTimeout(300);
    const nudgeBase = await p.evaluate(() => (window as any).__edits.length);
    for (let i = 0; i < 5; i++) await p.keyboard.press("ArrowRight");
    await p.waitForTimeout(900);
    const nudges = await p.evaluate((n: number) => (window as any).__edits.length - n, nudgeBase);
    assert.equal(nudges, 1, "five nudges = one edit");
    assert.match(await p.evaluate(() => (window as any).__doc.text as string), /box: \{ x: 5, y: 6, width: 200, height: 70 \}/);
    // Drag the selection frame: transient movement, one commit.
    const frame = p.locator(".ms-sel-frame");
    const box = await frame.boundingBox();
    const dragBase = await p.evaluate(() => (window as any).__edits.length);
    await p.mouse.move(box!.x + 40, box!.y + 30);
    await p.mouse.down();
    for (let i = 1; i <= 10; i++) await p.mouse.move(box!.x + 40 + i * 6, box!.y + 30 + i);
    await p.mouse.up();
    await p.waitForTimeout(700);
    assert.equal(await p.evaluate((n: number) => (window as any).__edits.length - n, dragBase), 1, "one drag = one edit");
    if (shots) await p.screenshot({ path: path.join(shots, "studio-object.png") });
    // Copy / paste of an object: the copy gets a fresh id and its own descriptor.
    // Headless Chromium has no system clipboard: keep what the editor copies, paste it back.
    await p.evaluate(() => document.addEventListener("copy", (e) => ((window as any).__copied = { html: e.clipboardData!.getData("text/html"), text: e.clipboardData!.getData("text/plain") })));
    const selectedBefore = await p.evaluate(() => document.querySelector(".ms-object.is-selected")?.getAttribute("data-id"));
    await p.keyboard.press("Control+c");
    await p.waitForFunction(() => !!(window as any).__copied?.html, null, { timeout: 2000 }).catch(async (e: Error) => {
      throw new Error(`${e.message}: selected=${selectedBefore} ${JSON.stringify(await p.evaluate(() => ({ active: document.activeElement?.className, copied: (window as any).__copied })))}`);
    });
    await p.locator(".ProseMirror p", { hasText: "Paragraph 6:" }).click();
    await p.keyboard.press("Control+v");
    await p.waitForTimeout(300);
    if (!(await p.evaluate(() => (window as any).__doc.text.includes('"id":"textbox-2"') || document.querySelectorAll(".ms-object").length > 1))) {
      await p.evaluate(() => {
        const dt = new DataTransfer();
        dt.setData("text/html", (window as any).__copied.html);
        dt.setData("text/plain", (window as any).__copied.text);
        document.querySelector(".tiptap-editor")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
      });
    }
    await p.waitForFunction(() => (window as any).__doc.text.includes('"id":"textbox-2"'), null, { timeout: 5000 }).catch(async (e: Error) => {
      const dbg = await p.evaluate(() => ({ copied: (window as any).__copied?.html?.slice(0, 200), objects: document.querySelectorAll(".ms-object").length, ids: [...((window as any).__doc.text as string).matchAll(/ms:object (\{[^}]*\})/g)].map((m) => m[1]), around: (window as any).__doc.text.split("Paragraph 6:")[0].slice(-120) }));
      throw new Error(`${e.message}; selected before copy: ${selectedBefore}; ${JSON.stringify(dbg)}`);
    });
    await p.waitForFunction(() => /\n\s+textbox-2:\n/.test((window as any).__doc.text), null, { timeout: 5000 });
    const ids = await p.evaluate(() => [...((window as any).__doc.text as string).matchAll(/<!-- ms:object \{"id":"([^"]+)"\} -->/g)].map((m) => m[1]));
    assert.deepEqual(ids.sort(), ["textbox", "textbox-2"], "pasted object has a unique id");
    assert.deepEqual(errors.filter((e) => !/favicon|ERR_|net::/.test(e)), [], "no page errors");
    await p.close();

    // 6. Corporate report fixture: master furniture, anchored image / text box, page-relative stamp,
    // group with a connector, landscape section.
    baseUri = `http://127.0.0.1:${(server.address() as any).port}/fixture`;
    const fx = await open(browser, fs.readFileSync(path.join(fixtureDir, "report.md"), "utf8"));
    await fx.p.waitForTimeout(1500);
    const fxInfo = await fx.p.evaluate(() => ({
      pages: document.querySelectorAll(".ms-page").length,
      landscape: [...document.querySelectorAll<HTMLElement>(".ms-page")].some((el) => el.offsetWidth > el.offsetHeight),
      objects: [...document.querySelectorAll<HTMLElement>(".ms-object")].map((el) => ({ id: el.dataset.id, left: parseFloat(el.style.left), top: parseFloat(el.style.top), hidden: el.classList.contains("is-hidden"), flow: el.classList.contains("ms-object-flow") })),
      connectors: document.querySelectorAll(".ms-connectors polyline").length,
      floats: document.querySelectorAll(".ms-wrap-float").length,
      footer: document.querySelector(".ms-story-footers .ms-story-text")?.textContent,
      header: document.querySelector(".ms-story-headers .ms-story-text")?.textContent,
      images: [...document.querySelectorAll<HTMLImageElement>(".ms-object img")].map((i) => i.complete && i.naturalWidth > 0),
    }));
    assert.ok(fxInfo.pages >= 4, `fixture paginated (${fxInfo.pages})`);
    assert.ok(fxInfo.landscape, "landscape appendix section");
    assert.equal(fxInfo.connectors, 1, "connector drawn between its objects");
    assert.ok(fxInfo.floats >= 2, "anchored objects reserve wrap areas");
    assert.ok(fxInfo.objects.every((o: any) => o.flow || Number.isFinite(o.left)), "objects positioned");
    assert.ok(fxInfo.objects.find((o: any) => o.id === "ghost")?.hidden, "hidden object hidden");
    assert.match(fxInfo.footer ?? "", /^Page 1 of \d+$/);
    assert.equal(fxInfo.header, "Quarterly review");
    assert.ok(fxInfo.images.every(Boolean), "anchored picture loaded");
    assert.equal(await fx.p.evaluate(() => (window as any).__edits.length), 0, "opening the fixture writes nothing");
    if (shots) {
      await fx.p.screenshot({ path: path.join(shots, "fixture-p1.png") });
      await fx.p.evaluate(() => document.querySelector(".editor-container")!.scrollTo(0, (document.querySelectorAll<HTMLElement>(".ms-page")[1].offsetTop) * 1));
      await fx.p.waitForTimeout(300);
      await fx.p.screenshot({ path: path.join(shots, "fixture-p2.png") });
      await fx.p.evaluate(() => document.querySelector(".editor-container")!.scrollTo(0, 1e6));
      await fx.p.waitForTimeout(300);
      await fx.p.screenshot({ path: path.join(shots, "fixture-last.png") });
    }
    assert.deepEqual(fx.errors.filter((e) => !/favicon|net::/.test(e)), [], "no page errors on the fixture");
    await fx.p.close();
    baseUri = "https://file+.vscode-resource.vscode-cdn.net/c%3A/docs";

    // 7. Responsiveness on long documents (typing → edit sent, pagination pass time).
    for (const n of [20, 100]) {
      const long = ["# Long", "", ...Array.from({ length: n * 9 }, (_, i) => (i % 40 === 0 ? `## Part ${i}\n\n` : "") + para(i) + "\n")].join("\n");
      const lp = await open(browser, long);
      await lp.p.waitForTimeout(1500);
      const pagesN = await lp.p.locator(".ms-page").count();
      await lp.p.locator(".ProseMirror p", { hasText: "Paragraph 3:" }).click();
      const t0 = Date.now();
      await lp.p.keyboard.type("abcdefghij", { delay: 0 });
      const typeMs = Date.now() - t0;
      await lp.p.waitForFunction(() => (window as any).__edits.length > 0, null, { timeout: 10000 });
      await lp.p.waitForTimeout(800);
      const layoutMs = await lp.p.evaluate(() => document.querySelector(".ms-statusbar")?.textContent?.match(/layout ([\d.]+) ms/)?.[1]);
      const frame = await lp.p.evaluate(() => new Promise<number>((r) => {
        const t = performance.now();
        requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now() - t)));
      }));
      console.log(`perf: ${n}-page target → ${pagesN} pages; typing 10 chars ${typeMs} ms; pagination pass ${layoutMs} ms; idle frame ${frame.toFixed(1)} ms`);
      assert.ok(pagesN >= n * 0.8, `long document paginated (${pagesN})`);
      await lp.p.close();
    }

    // 8. Dark chrome, narrow panel.
    const dark = await open(browser, "# Dark\n\nText.\n", { theme: "dark", width: 640 });
    if (shots) await dark.p.screenshot({ path: path.join(shots, "studio-dark-narrow.png") });
    assert.equal(await dark.p.locator(".ms-nav").count(), 0, "navigation collapsed in a narrow panel");
    await dark.p.close();
    console.log("studio browser checks passed");
  } finally {
    await browser.close();
    server.close();
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
  server.close();
});
