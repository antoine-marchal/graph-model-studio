// Long embed card in a .paper: pages break between its blocks (no overflow), header stays with
// its first block. npx tsx rich-editor/test/studio.repro3.ts [shotsDir]
import { chromium, listen, open, server } from "./studio.harness";
const shots = process.argv[2] ?? "";
const para = (i: number) => `Item ${i}: ${"Revenue grew steadily while costs stayed flat and the platform team shipped. ".repeat(3)}`;
const body = Array.from({ length: 30 }, (_, i) => (i % 6 === 0 ? `## Part ${i}\n\n- One message per slide.\n- Do not move the logo.\n` : para(i) + "\n")).join("\n");
const DOC = `# Report\n\nIntro.\n\n<!-- embed:file="notes.md" -->\n\n${body}\n<!-- embed:end -->\n\nAfter.\n`;
const info = (p: any) => p.evaluate(() => {
  const l = (window as any).__studio.get().layout;
  return { pages: l.pages.length, overflows: l.overflows.length, ms: l.ms, spacers: document.querySelectorAll(".directive-content .ms-page-spacer, .ms-page-spacer").length };
});
(async () => {
  await listen();
  const browser = await chromium.launch();
  try {
    const { p, errors } = await open(browser, DOC, { height: 1000 });
    await p.waitForTimeout(1200);
    const r = await info(p);
    console.log(JSON.stringify(r));
    if (r.pages < 3 || r.overflows) throw new Error("embed not paginated");
    if (shots) { await p.evaluate(() => document.querySelector(".ms-page-spacer")!.scrollIntoView({ block: "center" })); await p.waitForTimeout(300); await p.screenshot({ path: `${shots}/repro-embed-pages.png` }); }
    // Collapsed card: atomic again (one unit, no spacer inside it).
    await p.locator(".directive-btn[title='Hide content']").evaluate((b: HTMLElement) => b.click());
    await p.waitForTimeout(800);
    const c = await info(p);
    const inner = await p.evaluate(() => document.querySelectorAll(".directive-content .ms-page-spacer").length);
    console.log("collapsed", JSON.stringify(c), inner);
    if (c.pages !== 1 || inner) throw new Error("collapsed embed not repaginated");
    console.log("errors", errors.slice(0, 5));
  } finally {
    await browser.close();
    server.close();
  }
})();
