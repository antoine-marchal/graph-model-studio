// Import a Word document as a .paper next to `out` (assets in `<name>.assets/`) and print the report.
// Run: npx tsx rich-editor/test/import-docx-fixture.ts <file.docx> <out.paper>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { importDocument } from "../src/docx/importDocument";

const [file, out] = process.argv.slice(2);
const assetsDir = `${path.basename(out, ".paper")}.assets`;
importDocument(readFileSync(file), path.basename(file), { assetsDir, master: "imported" }).then((r) => {
  writeFileSync(out, r.source);
  mkdirSync(path.join(path.dirname(out), assetsDir), { recursive: true });
  for (const [name, bytes] of r.assets) writeFileSync(path.join(path.dirname(out), assetsDir, name), bytes);
  writeFileSync(out.replace(/\.paper$/, ".master.json"), JSON.stringify(r.template.family, null, 2));
  for (const item of r.report) console.log(`${item.status.padEnd(11)} ${item.feature}${item.detail ? ` — ${item.detail}` : ""}`);
});
