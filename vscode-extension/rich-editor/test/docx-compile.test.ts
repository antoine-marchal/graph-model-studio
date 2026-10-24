// Native DOCX export from source (no Pandoc, no editor): unzips the package and checks real Word
// parts. Run: node --import tsx --test rich-editor/test/docx-compile.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { compileDocx, type CompileOptions } from "../src/docx/compile";
import { starterMasters } from "../document/masters";

const dir = path.join(__dirname, "fixtures", "report");
const source = readFileSync(path.join(dir, "report.md"), "utf8");
const masters = new Map(starterMasters().map((m) => [m.id, m]));
const options = (src: string, extra: Partial<CompileOptions> = {}): CompileOptions => ({
  source: src,
  masters: (id) => masters.get(id),
  readAsset: async (rel) => {
    const file = path.join(dir, rel);
    return existsSync(file) ? readFileSync(file) : undefined;
  },
  ...extra,
});

async function unzip(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const text = async (name: string) => (await zip.file(name)?.async("string")) ?? "";
  return { zip, names: Object.keys(zip.files), text };
}

test("corporate report compiles to native Word parts", async () => {
  const { buffer, report } = await compileDocx(options(source));
  assert.ok(buffer, "written");
  assert.equal(report.ok, true);
  const { names, text } = await unzip(buffer!);
  const doc = await text("word/document.xml");
  const styles = await text("word/styles.xml");

  // Real paragraphs with named styles, never page images.
  assert.match(doc, /<w:pStyle w:val="Heading1"\/>/);
  assert.match(doc, /<w:pStyle w:val="Lead"\/>/);
  assert.match(styles, /w:styleId="Lead"[\s\S]*?<w:basedOn w:val="Normal"\/>/);
  assert.match(styles, /w:styleId="Heading1"[\s\S]*?<w:name w:val="heading 1"\/>/);
  assert.ok((doc.match(/<w:p>|<w:p /g) ?? []).length > 40);
  // Styled span and highlight.
  assert.match(doc, /<w:color w:val="C62828"\/>[\s\S]*?two risks/);
  // Lists → numbering part with bullets and restartable ordered instances.
  assert.ok(names.includes("word/numbering.xml"));
  assert.match(doc, /<w:numPr>/);
  // Table with a repeating header row.
  assert.match(doc, /<w:tblHeader\/>/);
  assert.ok((doc.match(/<w:tbl>/g) ?? []).length >= 2);
  // Anchored picture with alt text, wrap and paragraph-relative position.
  assert.match(doc, /<wp:anchor[\s\S]*?<wp:positionV relativeFrom="paragraph">[\s\S]*?<wp:wrapSquare[\s\S]*?descr="Architecture overview"/);
  // Text box, page-relative shape, and a group whose connector stays attached.
  assert.match(doc, /<wps:txbx>[\s\S]*?figures are unaudited/);
  assert.match(doc, /<wp:positionH relativeFrom="margin">/);
  assert.match(doc, /<wpg:wgp>[\s\S]*?<wps:cNvCnPr>[\s\S]*?<a:stCxn [\s\S]*?<a:endCxn /);
  // Hidden objects are omitted by default.
  assert.ok(!/name="ghost"/.test(doc));
  // Sections: portrait then landscape, header / footer stories with page fields.
  const sects = doc.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/g) ?? [];
  assert.equal(sects.length, 2);
  assert.match(sects[1], /w:orient="landscape"/);
  assert.ok(names.some((n) => /^word\/header\d+\.xml$/.test(n)));
  const footers = await Promise.all(names.filter((n) => /^word\/footer\d+\.xml$/.test(n)).map(text));
  assert.ok(footers.some((f) => /PAGE/.test(f) && /NUMPAGES/.test(f)));
  // Explicit page break, TOC field, bookmarks and hyperlinks.
  assert.match(doc, /<w:br w:type="page"\/>/);
  assert.match(doc, /TOC \\h \\o/);
  assert.match(doc, /<w:bookmarkStart w:name="appendix"/);
  assert.match(doc, /<w:hyperlink [^>]*w:anchor="appendix"/);
  assert.match(doc, /<w:hyperlink [^>]*r:id="/);

  // Every relationship id used by the body resolves, and its media exists.
  const rels = await text("word/_rels/document.xml.rels");
  for (const id of new Set([...doc.matchAll(/r:(?:id|embed)="([^"]+)"/g)].map((m) => m[1]))) {
    const target = new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`).exec(rels)?.[1];
    assert.ok(target, `relationship ${id} resolves`);
    if (target!.startsWith("media/")) assert.ok(names.includes(`word/${target}`), `media ${target} exists`);
  }
  assert.ok((await text("[Content_Types].xml")).includes("image/png"));

  // Report: native counts, documented limits, hidden object noted.
  assert.ok(report.native.anchoredImages >= 1 && report.native.textBoxes >= 1 && report.native.connectors === 1 && report.native.groups === 1);
  assert.ok(report.native.sections === 1 && report.native.tables >= 2 && report.native.fields >= 2);
  assert.ok(report.diagnostics.some((d) => /Hidden object "ghost"/.test(d.message)));
  assert.ok(report.limits.length >= 2);
  assert.deepEqual(report.missing, []);
  assert.ok(report.fonts.includes("Calibri"), "fonts the document needs are listed");
});

test("strict export refuses lossy content; permissive writes and reports it", async () => {
  const broken = source.replace("assets/architecture.png", "assets/missing.png");
  const strict = await compileDocx(options(broken, { mode: "strict" }));
  assert.equal(strict.buffer, undefined);
  assert.equal(strict.report.blocked, true);
  assert.ok(strict.report.missing.some((m) => /missing\.png/.test(m.message)));
  const permissive = await compileDocx(options(broken, { mode: "permissive" }));
  assert.ok(permissive.buffer);
  assert.equal(permissive.report.ok, true);
  assert.ok(permissive.report.missing.length >= 1);
});

test("plain Markdown without frontmatter or master exports", async () => {
  const { buffer, report } = await compileDocx(options("# Hello\n\nPlain *text* with `code`.\n\n```mermaid\ngraph TD; A-->B\n```\n"));
  assert.ok(buffer);
  const doc = await (await unzip(buffer!)).text("word/document.xml");
  assert.match(doc, /Hello/);
  assert.ok(report.fallbacks.some((f) => f.kind === "diagram"), "unrendered diagram reported");
});
