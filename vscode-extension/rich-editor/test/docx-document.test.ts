// Word document → .paper and Word template → masters with furniture: a generated package whose
// body holds a floating rectangle with text, a custom geometry group, a floating picture, a layout
// table, a content control, a page color and two sections.
// Run: node --import tsx --test rich-editor/test/docx-document.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as d from "docx";
import JSZip from "jszip";
import { importDocument, importMasters } from "../src/docx/importDocument";
import { customPaths, toX } from "../src/docx/drawingml";
import { readMeta } from "../document/meta";
import { ordered } from "../src/docx/importTemplate";

const logo = readFileSync(path.join(__dirname, "fixtures", "report", "assets", "logo.png"));
const NS = 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

const anchorRect = `<w:p><w:r><w:drawing><wp:anchor behindDoc="1" relativeHeight="5" simplePos="0" locked="0" layoutInCell="1" allowOverlap="1" distT="0" distB="0" distL="0" distR="0">
<wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>0</wp:posOffset></wp:positionV>
<wp:extent cx="2540000" cy="1270000"/><wp:wrapNone/><wp:docPr id="11" name="Band 1"/>
<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2540000" cy="1270000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:schemeClr val="accent1"><a:lumMod val="75000"/></a:schemeClr></a:solidFill><a:ln><a:noFill/></a:ln></wps:spPr>
<wps:txbx><w:txbxContent><w:sdt><w:sdtPr><w:alias w:val="Issue"/><w:showingPlcHdr/></w:sdtPr><w:sdtContent><w:p><w:r><w:t>ISSUE #10</w:t></w:r></w:p></w:sdtContent></w:sdt></w:txbxContent></wps:txbx><wps:bodyPr anchor="ctr"/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>`;

// A group: a custom geometry circle drawn with arcs, in child coordinates scaled ×100.
const group = `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="914400" cy="914400"/><wp:docPr id="12" name="Icon 1" descr="bell graphic"/>
<a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"><wpg:wgp><wpg:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/><a:chOff x="0" y="0"/><a:chExt cx="9144" cy="9144"/></a:xfrm></wpg:grpSpPr>
<wps:wsp><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="9144" cy="9144"/></a:xfrm><a:custGeom><a:avLst/><a:gdLst><a:gd name="half" fmla="*/ w 1 2"/></a:gdLst><a:pathLst><a:path w="9144" h="9144"><a:moveTo><a:pt x="0" y="half"/></a:moveTo><a:arcTo wR="half" hR="half" stAng="10800000" swAng="21600000"/><a:close/></a:path></a:pathLst></a:custGeom><a:noFill/><a:ln w="25400"><a:solidFill><a:srgbClr val="4455A2"/></a:solidFill></a:ln></wps:spPr><wps:bodyPr/></wps:wsp>
</wpg:wgp></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;

const cell = (body: string, w: number) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/></w:tcPr>${body}</w:tc>`;
const layoutTable = `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="6000"/><w:gridCol w:w="400"/><w:gridCol w:w="2600"/></w:tblGrid>
<w:tr>${cell('<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Ready to settle?</w:t></w:r></w:p><w:p><w:r><w:t>Article body.</w:t></w:r></w:p>', 6000)}${cell("<w:p/>", 400)}${cell('<w:p><w:r><w:rPr><w:b/><w:color w:val="C00000"/></w:rPr><w:t>What is new</w:t></w:r></w:p><w:p><w:r><w:t>Sidebar text</w:t></w:r></w:p>', 2600)}</w:tr></w:tbl>`;

async function sample(): Promise<Buffer> {
  const doc = new d.Document({
    background: { color: "C5E8F7" },
    sections: [
      { children: [new d.Paragraph({ children: [new d.ImageRun({ type: "png", data: logo, transformation: { width: 120, height: 40 }, floating: { horizontalPosition: { relative: d.HorizontalPositionRelativeFrom.PAGE, offset: 914400 }, verticalPosition: { relative: d.VerticalPositionRelativeFrom.PAGE, offset: 457200 } } })] }), new d.Paragraph("BODY_MARK"), new d.Paragraph("End of the first section")] },
      { properties: { page: { size: { orientation: d.PageOrientation.LANDSCAPE } } }, children: [new d.Paragraph("Second section")] },
    ],
  });
  const zip = await JSZip.loadAsync(await d.Packer.toBuffer(doc));
  const xml = await zip.file("word/document.xml")!.async("string");
  const body = xml.replace(/<w:document([^>]*)>/, (_, a) => `<w:document${a.replace(/xmlns:(wp|a|wps|wpg|pic)="[^"]*"/g, "")} ${NS}>`).replace(/<w:p>(?:(?!<w:p>).)*?BODY_MARK.*?<\/w:p>/s, `${anchorRect}${group}${layoutTable}<w:p><w:sdt><w:sdtPr><w:showingPlcHdr/></w:sdtPr><w:sdtContent><w:r><w:t>Type the content here.</w:t></w:r></w:sdtContent></w:sdt></w:p>`);
  zip.file("word/document.xml", body);
  return zip.generateAsync({ type: "nodebuffer" });
}

test("custom geometry: guides and arcs become an SVG path", () => {
  const [geom] = toX(ordered.parse('<a:custGeom xmlns:a="x"><a:gdLst><a:gd name="half" fmla="*/ w 1 2"/></a:gdLst><a:pathLst><a:path w="100" h="100"><a:moveTo><a:pt x="0" y="half"/></a:moveTo><a:lnTo><a:pt x="100" y="half"/></a:lnTo><a:arcTo wR="50" hR="50" stAng="0" swAng="10800000"/><a:close/></a:path></a:pathLst></a:custGeom>'));
  const [part] = customPaths(geom, 200, 200);
  assert.match(part.d, /^M0 100L200 100A100 100 0 0 1 0 100Z$/);
});

test("a Word document becomes a .paper: objects, columns, styles, sections, page color", async () => {
  const r = await importDocument(await sample(), "Newsletter.docx", { assetsDir: "Newsletter.assets", master: "newsletter" });
  const { meta } = readMeta(r.source);
  assert.equal(meta?.master, "newsletter");
  const objects = Object.values(meta?.objects ?? {});
  const band = objects.find((o) => o.name === "Band 1")!;
  assert.equal(band.type, "shape");
  assert.equal(band.placement, "page");
  assert.equal(band.plane, "behind");
  assert.deepEqual(band.box, { x: 0, y: 0, width: 200, height: 100 });
  assert.equal(band.style?.valign, "middle");
  assert.match(band.style?.fill ?? "", /^[0-9A-F]{6}$/);
  assert.match(r.source, /::: band\nISSUE #10\n:::/, "text box keeps its content control text");
  const picture = objects.find((o) => o.type === "image")!;
  assert.deepEqual([picture.box.x, picture.box.y, picture.relativeTo], [72, 36, "page"]);
  assert.match(r.source, /!\[[^\]]*\]\(Newsletter\.assets\/[\w-]+\.png\)/);
  // The group is an SVG picture with its stroke compensated for the group scale.
  const svgName = [...r.assets.keys()].find((n) => n.endsWith(".svg"))!;
  const svg = new TextDecoder().decode(r.assets.get(svgName));
  assert.match(svg, /stroke-width="254"/);
  assert.match(svg, /<path d="M0 4572A4572 4572/);
  // Layout table → two columns (the narrow empty spacer column is dropped).
  assert.equal((r.source.match(/class="ms-column"/g) ?? []).length, 2);
  assert.match(r.source, /# Ready to settle\?/);
  assert.match(r.source, /\*\*<span style="color:#C00000">What is new<\/span>\*\*/);
  assert.match(r.source, /Type the content here\./);
  // Second section: landscape break; page color → master background.
  const brk = Object.values(meta?.breaks ?? {})[0];
  assert.equal(brk.orientation, "landscape");
  assert.equal(r.template.family.background?.["page-color"]?.style?.fill, "C5E8F7");
  assert.ok(r.report.some((x) => x.feature === "Layout tables"));
});

test("a Word template becomes masters with its page furniture, one per page design", async () => {
  const t = await importMasters(await sample(), "Newsletter.dotx");
  assert.equal(t.variants.length, 1, "two sections with different furniture → two masters");
  assert.deepEqual(t.sectionDesigns, [0, 1]);
  const bg = t.family.background!;
  assert.ok(bg["page-color"], "page color on every master");
  const placeholder = Object.values(bg).find((o) => o.placeholder);
  assert.equal(placeholder?.placeholder, "field:issue");
  assert.equal(placeholder?.text, "ISSUE #10");
  const pic = Object.values(bg).find((o) => o.type === "image")!;
  assert.match(pic.src ?? "", /^assets\/.+\.png$/);
  assert.ok(t.assets.has(pic.src!.slice(7)));
  assert.equal(t.variants[0].inheritBackground, false);
  assert.equal(t.variants[0].basedOn, t.family.id);
});
