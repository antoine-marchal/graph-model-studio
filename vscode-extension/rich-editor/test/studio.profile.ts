// CPU profile of the built webview on a heavy realistic document (README × 4 with code, tables,
// Mermaid, math): load, typing, scrolling. Prints the top self-time functions and timings.
// Run: node rich-editor/esbuild.mjs --dev && npx tsx rich-editor/test/studio.profile.ts [--continuous]
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..", "..");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { chromium } = require(path.join(root, "slides-studio/node_modules/@playwright/test"));
const pageView = !process.argv.includes("--continuous");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const extra = "\n\n```mermaid\ngraph LR\n  A[Plan] --> B[Build] --> C[Ship]\n```\n\n$$\n\\int_0^1 x^2 dx = \\frac13\n$$\n\n| A | B | C |\n|---|---|---|\n" + Array.from({ length: 30 }, (_, i) => `| ${i} | value ${i} | **bold** \`code\` |`).join("\n") + "\n\n```ts\n" + Array.from({ length: 60 }, (_, i) => `const v${i} = compute(${i}, "text");`).join("\n") + "\n```\n";
const doc = `---\ntitle: Heavy\n---\n\n${Array.from({ length: 4 }, () => readme + extra).join("\n\n")}`;
const page = `<!doctype html><html><head><link href="/dist/rich-editor/editor.css" rel="stylesheet"></head><body class="vscode-light"><div id="root"></div><script>
window.__doc={text:${JSON.stringify(doc)},version:1};window.__edits=0;
const ap=(t,cs)=>{let o='',a=0;for(const c of cs){o+=t.slice(a,c.start)+c.text;a=c.end}return o+t.slice(a)};
window.acquireVsCodeApi=()=>({postMessage(m){ if(m.type==='ready') setTimeout(()=>window.postMessage({type:'init',content:window.__doc.text,version:1,baseUri:'',docFolderPath:'',filePath:'c:/heavy.md',settings:{pageView:${pageView}}},'*'));
 if(m.type==='edit'){window.__edits++;window.__doc={text:ap(window.__doc.text,m.changes),version:window.__doc.version+1};setTimeout(()=>window.postMessage({type:'ack',id:m.id,version:window.__doc.version},'*'))}},getState(){},setState(){}});
</script><script type="module" src="/dist/rich-editor/webview.js"></script></body></html>`;
const server = http.createServer((req, res) => {
  const u = (req.url ?? "/").split("?")[0];
  if (u === "/") return res.end(page);
  const f = path.join(root, u);
  if (!f.startsWith(path.join(root, "dist")) || !fs.existsSync(f)) return (res.statusCode = 404), res.end();
  res.setHeader("content-type", f.endsWith(".js") ? "text/javascript" : f.endsWith(".css") ? "text/css" : "application/octet-stream");
  res.end(fs.readFileSync(f));
});

function top(profile: any, n = 25) {
  const self = new Map<string, number>();
  const dt = profile.timeDeltas as number[];
  const byId = new Map(profile.nodes.map((x: any) => [x.id, x]));
  profile.samples.forEach((id: number, i: number) => {
    const node: any = byId.get(id);
    const f = node.callFrame;
    const key = `${f.functionName || "(anon)"} ${path.basename(f.url || "")}:${f.lineNumber}`;
    self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0) / 1000);
  });
  return [...self].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v.toFixed(1).padStart(8)} ms  ${k}`).join("\n");
}

(async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  // React commits while typing, counted through the devtools hook (each one rescans the selection).
  // (A string: tsx would wrap a function with helpers the page does not have.)
  await p.addInitScript({
    content: `
      window.__commits = 0;
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
        supportsFiber: true, renderers: new Map(), inject: () => 1, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, checkDCE() {},
        onCommitFiberRoot(_id, root) {
          if (!window.__track) return;
          window.__commits++;
        },
      };`,
  });
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  await cdp.send("Profiler.start");
  const t0 = Date.now();
  await p.goto(`http://127.0.0.1:${(server.address() as any).port}/`);
  await p.waitForSelector(pageView ? ".ms-page" : ".ProseMirror p", { timeout: 60000 });
  await p.waitForTimeout(3000);
  console.log(`load+settle: ${Date.now() - t0} ms; pages ${await p.locator(".ms-page").count()}`);
  console.log("== load\n" + top((await cdp.send("Profiler.stop")).profile));

  await p.locator(".ProseMirror p").nth(40).click();
  await p.waitForTimeout(500);
  await cdp.send("Profiler.start");
  await p.evaluate(() => {
    const w = window as any;
    w.__track = true;
    w.__sets = {};
    const set = w.__studio.set;
    w.__studio.set = (patch: any) => {
      const before = w.__studio.get();
      const next = typeof patch === "function" ? patch(before) : patch;
      for (const k of Object.keys(next)) if (before[k] !== next[k]) w.__sets[k] = (w.__sets[k] || 0) + 1;
      set(next);
    };
  });
  const lat = await p.evaluate(async () => {
    const out: number[] = [];
    for (let i = 0; i < 40; i++) {
      const t = performance.now();
      document.execCommand("insertText", false, "x");
      await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
      out.push(performance.now() - t);
      await new Promise((r) => setTimeout(r, 35));
    }
    out.sort((a, b) => a - b);
    return { median: out[20], p90: out[36], max: out[39] };
  });
  await p.waitForTimeout(1500);
  console.log(`typing: median ${lat.median.toFixed(1)} ms, p90 ${lat.p90.toFixed(1)} ms, max ${lat.max.toFixed(1)} ms; edits ${await p.evaluate(() => (window as any).__edits)}`);
  console.log("== typing\n" + top((await cdp.send("Profiler.stop")).profile));
  console.log(`React commits during typing: ${await p.evaluate(() => (window as any).__commits)} for 40 keystrokes`);
  console.log(`store changes during typing: ${JSON.stringify(await p.evaluate(() => (window as any).__sets))}`);
  await p.evaluate(() => ((window as any).__track = false));

  await cdp.send("Profiler.start");
  const scroll = await p.evaluate(async () => {
    const el = document.querySelector(".editor-container")!;
    const t = performance.now();
    let frames = 0;
    for (let y = 0; y < 20000; y += 400) {
      el.scrollTop = y;
      await new Promise((r) => requestAnimationFrame(r));
      frames++;
    }
    return (performance.now() - t) / frames;
  });
  console.log(`scroll: ${scroll.toFixed(1)} ms/frame`);
  console.log("== scroll\n" + top((await cdp.send("Profiler.stop")).profile, 12));
  await browser.close();
  server.close();
})();
