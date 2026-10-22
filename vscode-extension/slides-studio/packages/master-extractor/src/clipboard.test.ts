import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import type { CorporateMaster } from '@corporate-slides/core';
import { convertClipboardDrawing } from './slides.js';

const master = {
  dimensions: { width: 13.3333, height: 7.5 },
  theme: { colors: { accent1: '3E4A83', dk1: '262626', lt1: 'FFFFFF' }, palette: { accent1: { lighter40: '7E8AC2' } }, fonts: { heading: 'Arial', body: 'Arial' } },
  layouts: [],
} as unknown as CorporateMaster;

const A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"';
/** What PowerPoint puts in "Art::GVML ClipFormat" for a rounded rectangle with text and a 2×2 table. */
const DRAWING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:graphic ${A}><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/lockedCanvas">
<lc:lockedCanvas xmlns:lc="http://schemas.openxmlformats.org/drawingml/2006/lockedCanvas">
<a:nvGrpSpPr><a:cNvPr id="0" name=""/><a:cNvGrpSpPr/></a:nvGrpSpPr>
<a:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="4572000" cy="2743200"/><a:chOff x="914400" y="914400"/><a:chExt cx="4572000" cy="2743200"/></a:xfrm></a:grpSpPr>
<a:sp><a:nvSpPr><a:cNvPr id="4" name="Rounded Rectangle 3"/><a:cNvSpPr/></a:nvSpPr>
<a:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="1828800" cy="914400"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 30000"/></a:avLst></a:prstGeom><a:solidFill><a:schemeClr val="accent1"><a:lumMod val="60000"/><a:lumOff val="40000"/></a:schemeClr></a:solidFill></a:spPr>
<a:txSp><a:txBody><a:bodyPr anchor="ctr"/><a:lstStyle/><a:p><a:r><a:rPr lang="fr-FR" sz="2000" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:rPr><a:t>Étape 1</a:t></a:r></a:p></a:txBody><a:useSpRect/></a:txSp></a:sp>
<a:graphicFrame><a:nvGraphicFramePr><a:cNvPr id="5" name="Table 4"/><a:cNvGraphicFramePr/></a:nvGraphicFramePr>
<a:xfrm><a:off x="3657600" y="914400"/><a:ext cx="1828800" cy="740664"/></a:xfrm>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1"/><a:tblGrid><a:gridCol w="914400"/><a:gridCol w="914400"/></a:tblGrid>
<a:tr h="370332"><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>A</a:t></a:r></a:p></a:txBody><a:tcPr><a:solidFill><a:srgbClr val="FFC000"/></a:solidFill></a:tcPr></a:tc><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>B</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc></a:tr>
<a:tr h="370332"><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>1</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc><a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>2</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc></a:tr>
</a:tbl></a:graphicData></a:graphic></a:graphicFrame>
</lc:lockedCanvas></a:graphicData></a:graphic>`;

describe('PowerPoint clipboard (GVML) → elements', () => {
  it('converts shapes with their text, color, corner and tables with their cells, at their slide position', async () => {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types/>');
    zip.file('clipboard/drawings/drawing1.xml', DRAWING);
    const { elements } = await convertClipboardDrawing(await zip.generateAsync({ type: 'uint8array' }), master);
    expect(elements.map((e) => e.type)).toEqual(['shape', 'table']);
    const [shape, table] = elements;
    expect(shape).toMatchObject({ type: 'shape', shape: 'roundRect', x: 1, y: 1, w: 2, h: 1, style: { fill: 'theme.accent1.lighter40', radius: 0.3, fontSize: 20, color: 'theme.lt1' } });
    expect(shape?.type === 'shape' && shape.paragraphs?.[0]?.runs).toEqual([{ text: 'Étape 1', bold: true }]);
    expect(table).toMatchObject({ type: 'table', x: 4, rows: [['A', 'B'], ['1', '2']] });
    expect(table?.type === 'table' && table.cellStyles?.[0]?.[0]).toEqual({ fill: '#FFC000' });
  });

  it('keeps the corner of a rounded, outlined text box (default adj = 1/6 of the short side)', async () => {
    const box = `<a:sp><a:nvSpPr><a:cNvPr id="6" name="TextBox 5"/><a:cNvSpPr txBox="1"/></a:nvSpPr>
<a:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="2743200" cy="1828800"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom><a:ln w="12700"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:ln></a:spPr>
<a:txSp><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Note</a:t></a:r></a:p></a:txBody><a:useSpRect/></a:txSp></a:sp>`;
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types/>');
    zip.file('clipboard/drawings/drawing1.xml', DRAWING.replace('<a:graphicFrame>', `${box}<a:graphicFrame>`));
    const { elements } = await convertClipboardDrawing(await zip.generateAsync({ type: 'uint8array' }), master);
    expect(elements[1]).toMatchObject({ type: 'text', style: { line: '#FF0000', radius: 0.3333 } });
  });

  it('keeps groups, freeforms, any preset, rich text, source theme colors, crops and merged cells', async () => {
    const xfrm = (x: number, y: number, w = 914400, h = 914400) => `<a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`;
    const sp = (id: number, name: string, geom: string, extra = '', text = '') =>
      `<a:sp><a:nvSpPr><a:cNvPr id="${id}" name="${name}"/><a:cNvSpPr/></a:nvSpPr><a:spPr>${xfrm(914400 * id, 914400)}${geom}${extra}</a:spPr>${text}</a:sp>`;
    const heart = sp(2, 'Heart 1', '<a:prstGeom prst="heart"><a:avLst/></a:prstGeom>', '<a:solidFill><a:schemeClr val="accent1"><a:alpha val="40000"/></a:schemeClr></a:solidFill>');
    const free = sp(3, 'Freeform 2', '<a:custGeom><a:avLst/><a:gdLst/><a:pathLst><a:path w="100" h="100"><a:moveTo><a:pt x="0" y="100"/></a:moveTo><a:lnTo><a:pt x="50" y="0"/></a:lnTo><a:cubicBezTo><a:pt x="60" y="10"/><a:pt x="90" y="40"/><a:pt x="100" y="100"/></a:cubicBezTo><a:close/></a:path></a:pathLst></a:custGeom>');
    const rich = `<a:txSp><a:txBody><a:bodyPr lIns="0" tIns="0" rIns="0" bIns="0"/><a:lstStyle/>
<a:p><a:pPr algn="ctr"><a:spcAft><a:spcPts val="600"/></a:spcAft></a:pPr><a:r><a:rPr sz="2400" b="1"><a:latin typeface="Georgia"/></a:rPr><a:t>Big</a:t></a:r><a:r><a:rPr sz="1200" strike="sngStrike" baseline="30000"><a:latin typeface="+mj-lt"/></a:rPr><a:t>2</a:t></a:r></a:p>
<a:p><a:pPr algn="r"/><a:r><a:rPr sz="1200"><a:highlight><a:srgbClr val="FFFF00"/></a:highlight></a:rPr><a:t>right</a:t></a:r></a:p></a:txBody><a:useSpRect/></a:txSp>`;
    const text = sp(4, 'Rectangle 3', '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>', '<a:solidFill><a:schemeClr val="accent2"/></a:solidFill>', rich);
    const group = `<a:grpSp><a:nvGrpSpPr><a:cNvPr id="10" name="Outer"/><a:cNvGrpSpPr/></a:nvGrpSpPr><a:grpSpPr>${xfrm(0, 0, 9144000, 9144000).replace('</a:xfrm>', '<a:chOff x="0" y="0"/><a:chExt cx="9144000" cy="9144000"/></a:xfrm>')}</a:grpSpPr>
${heart}<a:grpSp><a:nvGrpSpPr><a:cNvPr id="11" name="Inner"/><a:cNvGrpSpPr/></a:nvGrpSpPr><a:grpSpPr>${xfrm(0, 0, 9144000, 9144000).replace('</a:xfrm>', '<a:chOff x="0" y="0"/><a:chExt cx="9144000" cy="9144000"/></a:xfrm>')}</a:grpSpPr>${free}</a:grpSp></a:grpSp>`;
    const pic = `<a:pic><a:nvPicPr><a:cNvPr id="7" name="Picture 6"/><a:cNvPicPr/></a:nvPicPr><a:blipFill><a:blip r:embed="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:srcRect l="10000" r="20000"/></a:blipFill><a:spPr>${xfrm(0, 2743200)}<a:prstGeom prst="rect"/></a:spPr></a:pic>`;
    const merged = DRAWING.replace('<a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>A</a:t>', '<a:tc gridSpan="2"><a:txBody><a:bodyPr/><a:p><a:r><a:t>A</a:t>').replace('<a:tc><a:txBody><a:bodyPr/><a:p><a:r><a:t>B</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>', '<a:tc hMerge="1"><a:txBody><a:bodyPr/><a:p><a:r><a:t>B</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>');
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<Types/>');
    zip.file('clipboard/drawings/drawing1.xml', merged.replace('<a:graphicFrame>', `${group}${text}${pic}<a:graphicFrame>`));
    zip.file('clipboard/drawings/_rels/drawing1.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/></Relationships>');
    zip.file('clipboard/media/image1.png', new Uint8Array([137, 80, 78, 71]));
    // Copied from a presentation whose accent2 is green and heading font Georgia.
    zip.file('clipboard/theme/theme1.xml', `<a:theme ${A}><a:themeElements><a:clrScheme name="x"><a:dk1><a:sysClr val="windowText" lastClr="262626"/></a:dk1><a:accent1><a:srgbClr val="3E4A83"/></a:accent1><a:accent2><a:srgbClr val="00B050"/></a:accent2></a:clrScheme><a:fontScheme name="f"><a:majorFont><a:latin typeface="Georgia"/></a:majorFont><a:minorFont><a:latin typeface="Arial"/></a:minorFont></a:fontScheme></a:themeElements></a:theme>`);
    const { elements, warnings } = await convertClipboardDrawing(await zip.generateAsync({ type: 'uint8array' }), master);
    const by = (id: string) => elements.find((e) => e.id === id)!;
    expect(warnings).toEqual([]);
    expect(by('heart-1')).toMatchObject({ type: 'shape', shape: 'heart', group: 'outer', style: { fill: 'theme.accent1', transparency: 60 } });
    expect(by('freeform-2')).toMatchObject({ shape: 'custom', group: 'outer/inner', geometry: { paths: [{ w: 100, h: 100, d: 'M 0 100 L 50 0 C 60 10 90 40 100 100 Z' }] } });
    const t = by('rectangle-3');
    // The source's accent2 (green) is not the master's: a literal color, not a token.
    expect(t).toMatchObject({ type: 'shape', style: { fill: '#00B050', margin: [0, 0, 0, 0] } });
    expect(t.type === 'shape' && t.paragraphs).toEqual([
      { align: 'center', spaceAfter: 6, runs: [{ text: 'Big', size: 24, bold: true, font: 'Georgia' }, { text: '2', size: 12, strike: true, baseline: 'super', font: 'Georgia' }] },
      { align: 'right', runs: [{ text: 'right', size: 12, highlight: '#FFFF00' }] },
    ]);
    expect(by('picture-6')).toMatchObject({ type: 'image', crop: { l: 0.1, t: 0, r: 0.2, b: 0 } });
    expect(elements.find((e) => e.type === 'table')).toMatchObject({ merges: [{ r: 0, c: 0, rs: 1, cs: 2 }] });
  });
});
