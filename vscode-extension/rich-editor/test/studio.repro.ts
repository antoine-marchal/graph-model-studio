// Temporary repro of reported studio bugs (not part of the suite).
import { chromium, listen, open, server, docText } from "./studio.harness";

const shots = process.argv[2] ?? "";
const para = (i: number) => `Paragraph ${i}: ${"Revenue grew steadily while costs stayed flat and the platform team shipped ahead of schedule. ".repeat(3)}`;
const DOC = ["# Report", "", ...Array.from({ length: 30 }, (_, i) => para(i) + "\n")].join("\n");
const info = (p: any) => p.evaluate(() => ({
  pages: document.querySelectorAll(".ms-page").length,
  objs: [...document.querySelectorAll<HTMLElement>(".ms-object")].map((e) => ({ id: e.dataset.id, top: Math.round(parseFloat(e.style.top)), anchorY: Math.round(Number(e.dataset.anchorY)) })),
  gmc: document.querySelectorAll("[data-type=gmcBlock], .gmc-block-preview").length,
}));

(async () => {
  await listen();
  const browser = await chromium.launch();
  try {
    // D. headings in a fresh doc
    {
      const { p } = await open(browser, "# T\n\nAlpha line.\n\nBeta line.\n", { height: 1000 });
      await p.locator(".ProseMirror p", { hasText: "Alpha line." }).click();
      await p.keyboard.press("End");
      await p.keyboard.press("Enter");
      await p.keyboard.type("### Titre trois");
      await p.keyboard.press("Enter");
      await p.keyboard.type("#### Titre quatre");
      await p.keyboard.press("Enter");
      await p.keyboard.type("x");
      await p.waitForTimeout(1200);
      console.log("D doc:", JSON.stringify(await docText(p)));
      console.log("D dom:", await p.evaluate(() => [...document.querySelectorAll(".ProseMirror > *")].map((h) => h.tagName + ":" + (h.textContent ?? "").slice(0, 20)).join(" | ")));
      if (shots) await p.screenshot({ path: `${shots}/repro-headings.png` });
      await p.close();
    }
    // A. drag in document coordinates
    const { p, errors } = await open(browser, DOC, { height: 1000 });
    await p.locator(".ProseMirror p", { hasText: "Paragraph 3:" }).click();
    await p.getByRole("tab", { name: "Insert" }).click();
    await p.getByRole("button", { name: "Text box" }).click();
    await p.waitForTimeout(800);
    const zoom = await p.evaluate(() => (window as any).__studio.get().zoom);
    for (const dy of [150, 300, 300, 300]) {
      const before = await info(p);
      const box = await p.locator(".ms-sel-frame").boundingBox();
      if (!box) { console.log("no frame"); break; }
      await p.mouse.move(box.x + 30, box.y + 20);
      await p.mouse.down();
      for (let i = 1; i <= 10; i++) await p.mouse.move(box.x + 30, box.y + 20 + (dy * i) / 10);
      await p.mouse.up();
      await p.waitForTimeout(1500);
      const after = await info(p);
      console.log(`A drag +${dy}px (zoom ${zoom}): top ${before.objs[0]?.top} -> ${after.objs[0]?.top} (expected ${Math.round(before.objs[0]?.top + dy / zoom)}) anchor ${after.objs[0]?.anchorY} pages ${after.pages}`);
    }
    console.log("errors", errors.slice(0, 5));
  } finally {
    await browser.close();
    server.close();
  }
})();
