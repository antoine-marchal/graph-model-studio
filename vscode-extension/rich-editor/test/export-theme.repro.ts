// HTML export from a dark VS Code: the snapshot must come out light.
// npx tsx rich-editor/test/export-theme.repro.ts [outDir]
import fs from "node:fs";
import { chromium, listen, open, server } from "./studio.harness";
const out = process.argv[2] ?? "";
const DOC = "# Title\n\n<!-- embed:toc -->\n\n## Table of contents\n\n- [Title](#title)\n  - [Été & co](#été--co)\n  - [Intro](#intro)\n  - [Intro](#intro-1)\n\n<!-- embed:toc:end -->\n\n## Été & co\n\nText\n\n## Intro\n\n## Intro\n\nSome **text** and `code` and a [link](https://x).\n\n> quote\n";
(async () => {
  await listen();
  const browser = await chromium.launch();
  try {
    const { p, errors } = await open(browser, DOC, { theme: "dark", paper: false });
    // What VS Code injects in a dark theme.
    await p.evaluate(() => {
      const s = document.documentElement.style;
      for (const [k, v] of Object.entries({ "--vscode-editor-background": "#1e1e1e", "--vscode-editor-foreground": "#d4d4d4", "--vscode-foreground": "#cccccc", "--vscode-textCodeBlock-background": "#0a0a0a", "--vscode-textLink-foreground": "#3794ff", "--vscode-font-family": "Segoe UI", "--vscode-editor-font-family": "Consolas" })) s.setProperty(k, v);
      document.body.setAttribute("data-vscode-theme-kind", "vscode-dark");
    });
    await p.waitForTimeout(800);
    const html: string = await p.evaluate(() => new Promise((resolve) => {
      const w = window as any;
      const n = w.__msgs.length;
      window.postMessage({ type: "exportSnapshot", requestId: "r1", theme: "light" }, "*");
      const t = setInterval(() => { const m = w.__msgs.slice(n).find((x: any) => x.type === "exportSnapshotResult"); if (m) { clearInterval(t); resolve(m.html ?? "ERR " + m.error); } }, 50);
    }));
    if (out) fs.writeFileSync(`${out}/export.html`, html);
    const q = await browser.newPage({ colorScheme: "dark" });
    await q.setContent(html);
    const colors = await q.evaluate(`(() => {
      function c(sel) { const el = document.querySelector(sel); if (!el) return null; const s = getComputedStyle(el); return s.color + " / " + s.backgroundColor; }
      return { html: c("html"), body: c("body"), chain: [...document.querySelectorAll(".btrmk-export-chain")].map((e) => e.className + " " + getComputedStyle(e).backgroundColor + " " + getComputedStyle(e).color), editor: c(".tiptap-editor"), p: c(".tiptap-editor p"), h1: c("h1"), code: c("p code"), pre: c("pre"), th: c("th"), bq: c("blockquote"), links: [...document.querySelectorAll("a")].map(a => a.getAttribute("href") + " -> " + !!document.getElementById(decodeURIComponent((a.getAttribute("href")||"").slice(1)))), ids: [...document.querySelectorAll("[id]")].map(e => e.tagName + "#" + e.id), bodyAttrs: [...document.body.attributes].map(a => a.name + "=" + a.value) };
    })()`);
    console.log(JSON.stringify(colors, null, 1));
    if (out) await q.screenshot({ path: `${out}/export.png`, fullPage: true });
    console.log("errors", errors.slice(0, 5));
  } finally {
    await browser.close();
    server.close();
  }
})();
