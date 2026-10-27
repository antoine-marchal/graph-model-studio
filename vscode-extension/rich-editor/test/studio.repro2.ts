import { chromium, listen, open, server, docText } from "./studio.harness";
const shots = process.argv[2] ?? "";
const para = (i: number) => `Paragraph ${i}: ${"Revenue grew steadily while costs stayed flat and the platform team shipped ahead of schedule. ".repeat(3)}`;
const DOC = ["# Report", "", ...Array.from({ length: 14 }, (_, i) => para(i) + "\n")].join("\n");
const info = (p: any) => p.evaluate(() => ({
  pages: document.querySelectorAll(".ms-page").length,
  objs: [...document.querySelectorAll<HTMLElement>(".ms-object")].map((e) => ({ id: e.dataset.id, top: Math.round(parseFloat(e.style.top)), h: e.offsetHeight })),
  gmc: document.querySelectorAll(".gmc-block-preview").length,
  sel: (window as any).__studio.get().selection,
}));
(async () => {
  await listen();
  const browser = await chromium.launch();
  try {
    const { p, errors } = await open(browser, DOC, { height: 1000 });
    await p.waitForTimeout(500);
    await p.locator(".ProseMirror p", { hasText: "Paragraph 2:" }).click();
    await p.keyboard.press("End");
    await p.keyboard.press("Enter");
    await p.keyboard.type("/gmc");
    await p.waitForTimeout(300);
    await p.keyboard.press("Enter");
    await p.waitForTimeout(2500);
    console.log("inserted", JSON.stringify(await info(p)));
    const g = p.locator(".gmc-block-preview").first();
    const gb = await g.boundingBox();
    console.log("gmc box", JSON.stringify(gb));
    // Drag the inline diagram like a user moving it.
    for (const dy of [250, -150]) {
      const bb = await g.boundingBox();
      await p.mouse.move(bb!.x + 200, bb!.y + 100);
      await p.mouse.down();
      for (let i = 1; i <= 12; i++) await p.mouse.move(bb!.x + 200, bb!.y + 100 + (dy * i) / 12);
      await p.mouse.up();
      for (let i = 0; i < 3; i++) { await p.waitForTimeout(800); console.log("inline drag", dy, i, JSON.stringify(await info(p))); }
      const t = await docText(p);
      console.log("fences", (t.match(/```gmc/g) ?? []).length);
    }
    if (shots) await p.screenshot({ path: `${shots}/repro-gmc-inline-drag.png` });
    console.log("errors", errors.slice(0, 5));
  } finally {
    await browser.close();
    server.close();
  }
})();
