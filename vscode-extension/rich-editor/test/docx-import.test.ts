// Corporate template import: a generated .docx with style inheritance, theme, numbering,
// letterhead picture, first / even / default stories and three sections; unsupported parts are
// reported; unsafe packages are refused. Run: node --import tsx --test rich-editor/test/docx-import.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as d from "docx";
import JSZip from "jszip";
import { importTemplate, TemplateImportError } from "../src/docx/importTemplate";
import { compileDocx } from "../src/docx/compile";
import { resolveSections } from "../document/masters";
import type { MasterDef } from "../document/schema";

const logo = readFileSync(path.join(__dirname, "fixtures", "report", "assets", "logo.png"));

async function template(): Promise<Buffer> {
  const header = (text: string, withLogo = false) =>
    new d.Header({
      children: [
        new d.Paragraph({
          children: [
            ...(withLogo
              ? [new d.ImageRun({ type: "png", data: logo, transformation: { width: 120, height: 40 }, altText: { name: "logo", description: "Contoso logo", title: "logo" }, floating: { horizontalPosition: { relative: d.HorizontalPositionRelativeFrom.PAGE, offset: 457200 }, verticalPosition: { relative: d.VerticalPositionRelativeFrom.PAGE, offset: 228600 } } })]
              : []),
            new d.TextRun(text),
          ],
        }),
      ],
    });
  const doc = new d.Document({
    evenAndOddHeaderAndFooters: true,
    styles: {
      default: { document: { run: { font: "Georgia", size: 21 }, paragraph: { spacing: { after: 160 } } } },
      paragraphStyles: [
        { id: "Heading1", name: "heading 1", basedOn: "Normal", next: "Normal", run: { size: 36, bold: true, color: "1F3864" }, paragraph: { keepNext: true, spacing: { before: 360, after: 120 }, outlineLevel: 0 } },
        { id: "CorpBody", name: "Corp Body", basedOn: "Normal", run: { color: "333333" }, paragraph: { spacing: { line: 300 }, indent: { left: 360 } } },
        { id: "CorpLead", name: "Corp Lead", basedOn: "CorpBody", run: { size: 26, italics: true } },
      ],
      characterStyles: [{ id: "CorpStrong", name: "Corp Strong", run: { bold: true, color: "C00000" } }],
    },
    numbering: { config: [{ reference: "corp", levels: [{ level: 0, format: d.LevelFormat.BULLET, text: "▪", alignment: d.AlignmentType.LEFT }, { level: 1, format: d.LevelFormat.DECIMAL, text: "%2.", alignment: d.AlignmentType.LEFT }] }] },
    sections: [
      {
        properties: { titlePage: true, page: { size: { width: 11906, height: 16838 }, margin: { top: 1800, bottom: 1440, left: 1300, right: 1300, header: 600, footer: 500 } } },
        headers: { first: header("", true), default: header("Contoso — confidential"), even: header("Contoso — even page") },
        footers: { default: new d.Footer({ children: [new d.Paragraph({ children: [new d.TextRun({ children: ["Page ", d.PageNumber.CURRENT, " of ", d.PageNumber.TOTAL_PAGES] })] })] }) },
        children: [new d.Paragraph({ style: "Heading1", text: "Sample title" }), new d.Paragraph({ style: "CorpBody", text: "Sample body text that is template content." }), new d.Paragraph({ style: "CorpBody", text: "More sample text." }), new d.Paragraph({ numbering: { reference: "corp", level: 0 }, text: "Sample bullet" })],
      },
      { properties: { page: { size: { width: 11906, height: 16838, orientation: d.PageOrientation.LANDSCAPE } } }, children: [new d.Paragraph("Landscape sample")] },
      { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1300, right: 1300 } } }, headers: { default: header("Annex") }, children: [new d.Paragraph("Annex sample")] },
    ],
  });
  const zip = await JSZip.loadAsync(await d.Packer.toBuffer(doc));
  // Corporate theme, a VML watermark, an external relationship and a macro project.
  const theme = await zip.file("word/theme/theme1.xml")!.async("string");
  zip.file("word/theme/theme1.xml", theme.replace(/<a:accent1>[\s\S]*?<\/a:accent1>/, '<a:accent1><a:srgbClr val="E4002B"/></a:accent1>').replace(/(<a:majorFont>\s*<a:latin typeface=")[^"]*/, "$1Montserrat"));
  const headers = Object.keys(zip.files).filter((n) => /^word\/header\d+\.xml$/.test(n));
  const h = await zip.file(headers[headers.length - 1])!.async("string");
  zip.file(headers[headers.length - 1], h.replace("</w:hdr>", '<w:p><w:r><w:pict><v:shape id="wm"/></w:pict></w:r></w:p></w:hdr>'));
  const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
  zip.file("word/_rels/document.xml.rels", rels.replace("</Relationships>", '<Relationship Id="rIdExt" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://tracker.example/x.png" TargetMode="External"/></Relationships>'));
  zip.file("word/vbaProject.bin", "not executed");
  return zip.generateAsync({ type: "nodebuffer" });
}

test("a corporate template becomes a master family with variants and a report", async () => {
  const { family, variants, assets, report, fonts } = await importTemplate(await template(), "Contoso Report.docx", new Date("2026-10-24T00:00:00Z"));
  // Styles with inheritance and document defaults folded into Normal.
  assert.equal(family.id, "contoso-report");
  assert.equal(family.styles!.CorpLead.basedOn, "CorpBody");
  assert.equal(family.styles!.CorpLead.run!.size, 13);
  assert.equal(family.styles!.CorpBody.paragraph!.lineSpacing, 1.25);
  assert.equal(family.styles!.CorpBody.paragraph!.indentLeft, 18);
  assert.equal(family.styles!.Normal.run!.font, "Georgia");
  assert.equal(family.styles!.Heading1.outlineLevel, 1);
  assert.equal(family.styles!.Heading1.paragraph!.keepWithNext, true);
  assert.equal(family.styles!.CorpStrong.type, "character");
  // Theme and numbering.
  assert.equal(family.theme!.colors.accent1, "E4002B");
  assert.equal(family.theme!.fonts.heading, "Montserrat");
  assert.equal(family.numbering?.bullet?.[0], "▪", "the list the template uses comes first");
  assert.ok(fonts.includes("Georgia") && fonts.includes("Montserrat"));
  // First section: page design and stories, letterhead picture as a recurring page object.
  assert.equal(family.page.margins!.top, 90);
  assert.equal(family.page.margins!.header, 30);
  assert.equal(family.titlePage, true);
  assert.equal(family.evenAndOdd, true);
  assert.equal(family.headers!.default!.markdown, "Contoso — confidential");
  assert.equal(family.headers!.even!.markdown, "Contoso — even page");
  assert.equal(family.footers!.default!.markdown, "Page {{page}} of {{pages}}");
  const pictures = Object.values(family.headers!.first!.objects ?? {});
  assert.equal(pictures.length, 1);
  assert.equal(pictures[0].relativeTo, "page");
  assert.equal(pictures[0].box.x, 36);
  assert.ok(assets.has(pictures[0].src!.replace("assets/", "")));
  // Landscape section links to the previous stories; the annex has its own header.
  assert.equal(variants.length, 2);
  assert.equal(variants[0].page.orientation, "landscape");
  assert.equal(variants[0].headers!.default!.markdown, "Contoso — confidential");
  assert.equal(variants[1].headers!.default!.markdown, "Annex");
  assert.ok(variants.every((v) => v.basedOn === family.id));
  // Report: supported, flattened and unsupported features, with provenance.
  const status = (feature: string) => report.find((r) => r.feature.startsWith(feature))?.status;
  assert.equal(status("Named styles"), "supported");
  assert.equal(status("Numbering"), "flattened");
  assert.equal(status("Macros"), "unsupported");
  assert.equal(status("External relationship"), "unsupported");
  assert.equal(status("VML drawing"), "unsupported");
  assert.equal(status("Sample body content"), "unsupported");
  assert.equal(family.provenance?.source, "docx");
  assert.match(family.provenance!.sha256!, /^[0-9a-f]{64}$/);
});

test("imported masters drive styles, sections and stories of an export", async () => {
  const { family, variants, assets } = await importTemplate(await template(), "Contoso Report.docx");
  const masters = new Map<string, MasterDef>([family, ...variants].map((m) => [m.id, m]));
  const src = `---\nmarkdownStudio:\n  version: 1\n  master: ${family.id}\n---\n\n# Title\n\n<!-- ms:block {"style":"CorpLead"} -->\nLead.\n\n<!-- ms:section {"master":"${variants[0].id}"} -->\n\nWide.\n`;
  const { sections } = resolveSections({ version: 1, master: family.id }, [{ master: variants[0].id }], (id) => masters.get(id));
  assert.equal(sections[1].page.orientation, "landscape");
  assert.equal(sections[1].sheet.styles.get("CorpLead")?.run.italic, true, "variant inherits the family styles");
  const { buffer, report } = await compileDocx({
    source: src,
    masters: (id) => masters.get(id),
    readAsset: async (rel, root) => (root !== "document" ? assets.get(rel.replace("assets/", "")) : undefined),
  });
  assert.ok(buffer && report.ok, JSON.stringify(report.missing));
  const zip = await JSZip.loadAsync(buffer!);
  const styles = await zip.file("word/styles.xml")!.async("string");
  assert.match(styles, /w:styleId="CorpLead"[\s\S]*?<w:basedOn w:val="CorpBody"\/>/);
  const doc = await zip.file("word/document.xml")!.async("string");
  assert.match(doc, /<w:titlePg\/>/);
  const headerXml = await Promise.all(Object.keys(zip.files).filter((n) => /^word\/header\d+\.xml$/.test(n)).map((n) => zip.file(n)!.async("string")));
  assert.ok(headerXml.some((x) => /<wp:anchor[\s\S]*relativeFrom="page"/.test(x)), "letterhead picture exported in the first-page header");
});

test("unsafe or invalid packages are refused before parsing", async () => {
  const traversal = new JSZip();
  traversal.file("[Content_Types].xml", "<Types/>");
  traversal.file("word/document.xml", "<w:document/>");
  traversal.file("../evil.xml", "x");
  await assert.rejects(importTemplate(await traversal.generateAsync({ type: "nodebuffer" }), "t.docx"), TemplateImportError);

  const doctype = await JSZip.loadAsync(await template());
  doctype.file("word/styles.xml", '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><w:styles>&a;</w:styles>');
  await assert.rejects(importTemplate(await doctype.generateAsync({ type: "nodebuffer" }), "t.docx"), /DOCTYPE/);

  await assert.rejects(importTemplate(Buffer.from("plain text"), "t.docx"), /Not a Word package/);
  const noDoc = new JSZip();
  noDoc.file("[Content_Types].xml", "<Types/>");
  await assert.rejects(importTemplate(await noDoc.generateAsync({ type: "nodebuffer" }), "t.docx"), /document\.xml missing/);
});
