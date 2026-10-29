// Word templates → masters (page furniture, Word reference thumbnails) in the built studio: the
// master browser lists them with thumbnails; applying one draws its furniture on the pages.
// npx tsx rich-editor/test/studio.masters.ts <template.docx>... [--shots dir]
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { importMasters } from "../src/docx/importDocument";
import { renderSectionThumbnails } from "../src/docx/wordThumbnails";
import { chromium, listen, open, origin, server, state, useFixtures } from "./studio.harness";
import type { MasterDef } from "../document/schema";

const args = process.argv.slice(2);
const shotsAt = args.indexOf("--shots");
const shots = shotsAt >= 0 ? args.splice(shotsAt, 2)[1] : "";
(async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "paper-masters-"));
  const all: MasterDef[] = [];
  const folders: Record<string, string> = {};
  for (const file of args) {
    const data = readFileSync(file);
    const imported = await importMasters(data, path.basename(file));
    const thumbDir = path.join(dir, "thumbs", imported.family.id);
    const thumbs = await renderSectionThumbnails(data, path.extname(file), thumbDir);
    for (const m of [imported.family, ...imported.variants]) {
      const folder = path.join(dir, "masters", m.id);
      mkdirSync(path.join(folder, "assets"), { recursive: true });
      for (const [name, bytes] of imported.assets) writeFileSync(path.join(folder, "assets", name), bytes);
      const thumb = m.provenance?.section ? thumbs.get(m.provenance.section) : undefined;
      if (thumb) {
        mkdirSync(path.join(folder, "thumbnails"), { recursive: true });
        copyFileSync(path.join(thumbDir, thumb), path.join(folder, "thumbnails", "reference.png"));
        m.thumbnail = "thumbnails/reference.png";
      }
      folders[m.id] = `masters/${m.id}`;
      all.push(m);
    }
    console.log(path.basename(file), "→", [imported.family, ...imported.variants].map((m) => `${m.id} (${Object.keys(m.background ?? {}).length} drawings${m.thumbnail ? ", Word thumbnail" : ""})`).join(", "), "sections →", imported.sectionDesigns.join(","));
  }
  await listen();
  useFixtures(dir, all, Object.fromEntries(Object.entries(folders).map(([id, f]) => [id, `${origin()}/fixture/${f}`])));
  state.baseUri = `${origin()}/fixture`;
  const browser = await chromium.launch();
  try {
    const doc = `---\nmarkdownStudio:\n  version: 2\n  master: ${all[0].id}\n---\n\n# Heading\n\nBody text on a page designed by an imported master.\n`;
    const { p, errors } = await open(browser, doc, { width: 1500, height: 1000 });
    await p.waitForTimeout(1200);
    const furniture = await p.evaluate(() => document.querySelectorAll(".ms-page .ms-furniture").length);
    assert.ok(furniture > 0, "master furniture drawn on the page");
    if (shots) await p.screenshot({ path: path.join(shots, "masters-page.png") });
    await p.locator("[data-testid=tab-design], button:has-text('Design')").first().click();
    await p.locator("[data-testid=open-master-browser]").click();
    await p.waitForSelector("[data-testid=master-browser]");
    await p.waitForTimeout(800);
    const cards = await p.locator("[data-testid^=master-card-]").count();
    assert.ok(cards >= all.length, `cards: ${cards}`);
    const previews = await p.evaluate(() => [...document.querySelectorAll(".ms-master-card-thumb .ms-master-preview")].map((e) => e.querySelectorAll("img, .ms-mp-shape").length));
    console.log(JSON.stringify({ furniture, cards, drawingsPerCard: previews }));
    if (shots) await p.screenshot({ path: path.join(shots, "masters-browser.png") });
    const ref = p.locator("button:has-text('Word reference'), button:has-text('Référence Word')").first();
    if (await ref.isEnabled()) {
      await ref.click();
      await p.waitForTimeout(800);
      if (shots) await p.screenshot({ path: path.join(shots, "masters-browser-word.png") });
    }
    // Apply another master from the browser: the document's frontmatter changes.
    const other = all[all.length - 1].id;
    await p.locator(`[data-testid=master-card-${other}]`).click();
    await p.locator("[data-testid=master-apply]").click();
    await p.waitForFunction((id: string) => (window as any).__doc.text.includes(`master: ${id}`), other, { timeout: 5000 });
    console.log("errors", errors.slice(0, 8));
  } finally {
    await browser.close();
    server.close();
  }
})();
