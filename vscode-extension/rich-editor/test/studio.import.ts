// Word document → .paper, opened in the built studio: pages, objects, columns, pictures.
// npx tsx rich-editor/test/studio.import.ts <file.docx> [shotsDir]
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { importDocument } from "../src/docx/importDocument";
import { chromium, listen, open, origin, server, state, useFixtures } from "./studio.harness";

const [file, shots = ""] = process.argv.slice(2);
(async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "paper-import-"));
  const r = await importDocument(readFileSync(file), path.basename(file), { assetsDir: "doc.assets", master: "imported" });
  mkdirSync(path.join(dir, "doc.assets"));
  for (const [name, bytes] of r.assets) writeFileSync(path.join(dir, "doc.assets", name), bytes);
  useFixtures(dir, [{ ...r.template.family, id: "imported" }]);
  await listen();
  state.baseUri = `${origin()}/fixture`;
  const browser = await chromium.launch();
  try {
    const { p, errors } = await open(browser, r.source, { width: 1500, height: 1100 });
    await p.waitForTimeout(2500);
    const info = await p.evaluate(() => ({
      pages: document.querySelectorAll(".ms-page").length,
      objects: document.querySelectorAll(".ms-object").length,
      columns: document.querySelectorAll(".ms-columns, [data-type=columns], .columns-group").length,
      images: [...document.querySelectorAll<HTMLImageElement>(".ProseMirror img")].map((i) => ({ ok: i.complete && i.naturalWidth > 0, src: i.src.split("/").pop() })),
      groupsLeft: (document.querySelector(".ProseMirror")?.textContent ?? "").match(/::: [\w-]+/g)?.slice(0, 5) ?? [],
    }));
    console.log(JSON.stringify(info));
    if (shots) {
      mkdirSync(shots, { recursive: true });
      // Whole pages, as Word renders them (compare with Word's page images).
      await p.evaluate(() => (window as any).__studio.set({ zoom: 0.5 }));
      await p.waitForTimeout(1500);
      const n = Math.min(info.pages, 6);
      for (let i = 0; i < n; i++) {
        const page = p.locator(".ms-page").nth(i);
        await page.scrollIntoViewIfNeeded();
        await p.waitForTimeout(300);
        await page.screenshot({ path: path.join(shots, `${path.basename(file, ".docx")}-page${i + 1}.png`) });
      }
    }
    console.log("errors", errors.slice(0, 8));
  } finally {
    await browser.close();
    server.close();
  }
})();
