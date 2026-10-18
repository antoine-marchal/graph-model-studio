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
});
