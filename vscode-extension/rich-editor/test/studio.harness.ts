// Stub VS Code host for the built Markdown Studio webview (dist/rich-editor): serves the page,
// implements the versioned edit protocol, masters and the GMC runtime. Shared by the browser
// checks (studio.browser.ts) and the repro / profile scripts.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { starterMasters } from "../document/masters";

export const root = path.resolve(__dirname, "..", "..");
// eslint-disable-next-line @typescript-eslint/no-var-requires
export const { chromium } = require(path.join(root, "slides-studio/node_modules/@playwright/test"));
export let masters = starterMasters();
export let fixtureDir = path.join(__dirname, "fixtures", "report");
/** Serve another folder under /fixture/ and other masters (imported documents). */
export let assetBases: Record<string, string> = {};
export const useFixtures = (dir: string, extra: typeof masters = [], bases: Record<string, string> = {}) => ((fixtureDir = dir), (masters = [...extra, ...starterMasters()]), (assetBases = bases));
const entriesOf = () => masters.map((m) => ({ id: m.id, name: m.name, basedOn: m.basedOn, source: m.provenance?.source ?? "starter", readonly: m.id.startsWith("studio-") }));

export const state = {
  content: "",
  theme: "light" as "light" | "dark",
  lang: "en",
  /** `.paper` document (paginated studio); false = a `.md` (continuous editor). */
  paper: true,
  baseUri: "https://file+.vscode-resource.vscode-cdn.net/c%3A/docs",
};

const page = () => `<!doctype html><html lang="${state.lang}"><head><meta charset="utf-8"><link href="/dist/rich-editor/editor.css" rel="stylesheet"></head>
<body class="vscode-${state.theme}"${state.paper ? ' data-studio="paper"' : ""}><div id="root"></div>
<script>
window.__doc = { text: ${JSON.stringify(state.content)}, version: 1 };
window.__edits = []; window.__msgs = [];
const reply = (m) => setTimeout(() => window.postMessage(m, '*'));
const apply = (text, changes) => { let out = '', at = 0; for (const c of changes) { out += text.slice(at, c.start) + c.text; at = c.end; } return out + text.slice(at); };
window.__external = (text) => { window.__doc = { text, version: window.__doc.version + 1 }; reply({ type: 'update', content: text, version: window.__doc.version }); };
window.acquireVsCodeApi = () => ({
  postMessage(m) {
    window.__msgs.push(m);
    if (m.type === 'ready') {
      reply({ type: 'init', content: window.__doc.text, version: window.__doc.version, baseUri: ${JSON.stringify(state.baseUri)}, docFolderPath: 'c:/docs', filePath: 'c:/docs/report.md', isReadonly: false, settings: { pageView: true }, gmcRuntimeUri: '/dist/markdown-preview/runtime.js', gmcEditorUri: '', gmcEditorCssUri: '', gmcVersion: 't' });
      reply({ type: 'mastersResult', entries: ${JSON.stringify(entriesOf())}, masters: ${JSON.stringify(masters)}, assetBases: ${JSON.stringify(assetBases)} });
    }
    if (m.type === 'edit') {
      window.__edits.push(m);
      if (m.baseVersion !== window.__doc.version) { reply({ type: 'rejected', id: m.id, reason: 'stale', conflict: true }); reply({ type: 'update', content: window.__doc.text, version: window.__doc.version }); return; }
      const applied = apply(window.__doc.text, m.changes);
      // VS Code keeps a CRLF document CRLF: inserted line breaks change, the panel gets the text back.
      const text = window.__crlf ? applied.replace(/\\r?\\n/g, '\\r\\n') : applied;
      window.__doc = { text, version: window.__doc.version + 1 };
      reply({ type: 'ack', id: m.id, version: window.__doc.version });
      if (text !== applied) reply({ type: 'update', content: text, version: window.__doc.version });
    }
    if (m.type === 'masters') reply({ type: 'mastersResult', requestId: m.requestId, entries: ${JSON.stringify(entriesOf())}, masters: ${JSON.stringify(masters)}, assetBases: ${JSON.stringify(assetBases)} });
    if (m.type === 'masterAction') {
      window.__masters = window.__masters || ${JSON.stringify(masters)};
      if (m.action === 'save') window.__masters = [...window.__masters.filter((x) => x.id !== m.master.id), m.master];
      reply({ requestId: m.requestId, masters: window.__masters, entries: window.__masters.map((x) => ({ id: x.id, name: x.name, source: x.id.startsWith('studio-') ? 'starter' : 'user', readonly: x.id.startsWith('studio-') })), assetBases: {}, result: { documents: [] } });
    }
  },
  getState() {}, setState() {},
});
</script><script type="module" src="/dist/rich-editor/webview.js"></script></body></html>`;

export const server = http.createServer((req, res) => {
  const url = (req.url ?? "/").split("?")[0];
  if (url === "/") return res.end(page());
  if (url.startsWith("/fixture/")) {
    const f = path.join(fixtureDir, url.slice("/fixture/".length));
    if (!f.startsWith(fixtureDir) || !fs.existsSync(f)) return (res.statusCode = 404), res.end();
    const ext = path.extname(f).toLowerCase();
    res.setHeader("content-type", ext === ".svg" ? "image/svg+xml" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png");
    return res.end(fs.readFileSync(f));
  }
  const file = path.join(root, url);
  if (!file.startsWith(path.join(root, "dist")) || !fs.existsSync(file)) return (res.statusCode = 404), res.end();
  res.setHeader("content-type", file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "application/octet-stream");
  res.end(fs.readFileSync(file));
});

export const listen = () => new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
export const origin = () => `http://127.0.0.1:${(server.address() as { port: number }).port}`;

/** Open a document in a fresh page; resolves once the paper is laid out. */
export async function open(browser: any, doc: string, opts: { width?: number; height?: number; theme?: "light" | "dark"; lang?: string; paper?: boolean } = {}) {
  state.content = doc;
  state.paper = opts.paper ?? true;
  state.theme = opts.theme ?? "light";
  state.lang = opts.lang ?? "en";
  const p = await browser.newPage({ viewport: { width: opts.width ?? 1400, height: opts.height ?? 900 } });
  const errors: string[] = [];
  p.on("pageerror", (e: Error) => errors.push(e.message));
  p.on("console", (m: any) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
  p.on("response", (r: any) => r.status() === 404 && !/favicon/.test(r.url()) && errors.push(`404 ${r.url()}`));
  await p.goto(`${origin()}/`);
  await p.waitForSelector(".ProseMirror");
  if (state.paper) await p.waitForFunction(() => document.querySelectorAll(".ms-page").length > 0, null, { timeout: 15000 });
  await p.waitForTimeout(800);
  return { p, errors };
}

export const docText = (p: any): Promise<string> => p.evaluate(() => (window as any).__doc.text as string);
export const editCount = (p: any): Promise<number> => p.evaluate(() => (window as any).__edits.length as number);
