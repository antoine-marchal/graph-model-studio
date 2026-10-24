// Writes a fixture's DOCX and prints its export report (Word / LibreOffice interop checks).
// Usage: npx tsx rich-editor/test/export-fixture.ts <fixture.md> <out.docx> [masters-dir]
import { readFileSync, existsSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { compileDocx } from "../src/docx/compile";
import { starterMasters } from "../document/masters";
import type { MasterDef } from "../document/schema";

const [input, output, mastersDir] = process.argv.slice(2);
if (!input || !output) throw new Error("usage: export-fixture.ts <fixture.md> <out.docx> [masters-dir]");
const masters = new Map<string, MasterDef>(starterMasters().map((m) => [m.id, m]));
if (mastersDir) {
  for (const id of readdirSync(mastersDir)) {
    const file = path.join(mastersDir, id, "master.json");
    if (existsSync(file)) masters.set(id, JSON.parse(readFileSync(file, "utf8")));
  }
}
const dir = path.dirname(input);
compileDocx({
  source: readFileSync(input, "utf8"),
  masters: (id) => masters.get(id),
  readAsset: async (rel, root) => {
    const base = root === "document" ? dir : path.join(mastersDir ?? dir, root.master);
    const file = path.resolve(base, rel);
    return existsSync(file) ? readFileSync(file) : undefined;
  },
}).then(({ buffer, report }) => {
  if (buffer) writeFileSync(output, buffer);
  console.log(JSON.stringify(report, null, 1));
});
