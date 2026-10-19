import { describe, expect, it } from 'vitest';
import { flattenPart } from './ooxml.js';

const pic = (x: number, y: number, cx: number, cy: number) =>
  `<p:pic><p:nvPicPr><p:cNvPr id="3" name="Image"/></p:nvPicPr><p:blipFill><a:blip r:embed="rId2"/></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm></p:spPr></p:pic>`;
const group = (inner: string, hidden = '') =>
  `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="2" name="G"${hidden}/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="1000" y="2000"/><a:ext cx="200" cy="100"/><a:chOff x="0" y="0"/><a:chExt cx="100" cy="100"/></a:xfrm></p:grpSpPr>${inner}</p:grpSp>`;

describe('flattenPart', () => {
  it('moves group children to slide coordinates, nested groups included', () => {
    const out = flattenPart(`<p:spTree>${group(pic(10, 20, 30, 40) + group(pic(0, 0, 10, 10)))}</p:spTree>`);
    expect(out).not.toContain('grpSp');
    expect(out).toContain('<a:off x="1020" y="2020"/><a:ext cx="60" cy="40"/>');
    // inner group: (0,0) → (1000,2000), x scaled by 2; outer group applies the same transform again
    expect(out).toContain('<a:off x="3000" y="4000"/><a:ext cx="40" cy="10"/>');
  });

  it('drops hidden groups and freeform children, keeps the Fallback of alternate content', () => {
    const free = '<p:sp><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1" cy="1"/></a:xfrm><a:custGeom/></p:spPr></p:sp>';
    expect(flattenPart(group(pic(0, 0, 1, 1), ' hidden="1"'))).toBe('');
    expect(flattenPart(group(free))).toBe('');
    expect(flattenPart('<mc:AlternateContent><mc:Choice Requires="x">A</mc:Choice><mc:Fallback>B</mc:Fallback></mc:AlternateContent>')).toBe('B');
  });
});

describe('outlineIn', () => {
  it('reads explicit, theme-referenced and disabled outlines', async () => {
    const { outlineIn } = await import('./ooxml.js');
    const { outlineHex } = await import('./normalize.js');
    expect(outlineIn('<p:spPr><a:ln w="38100"><a:solidFill><a:srgbClr val="ff0000"/></a:solidFill><a:prstDash val="dash"/></a:ln></p:spPr>')).toEqual({ color: { srgb: 'FF0000' }, width: 3, dash: 'dash' });
    expect(outlineIn('<p:spPr><a:ln><a:noFill/></a:ln></p:spPr><p:style><a:lnRef idx="2"><a:schemeClr val="accent1"/></a:lnRef></p:style>')).toBe('none');
    const ref = outlineIn('<p:spPr/><p:style><a:lnRef idx="1"><a:schemeClr val="accent1"><a:lumMod val="50000"/></a:schemeClr></a:lnRef></p:style>');
    expect(ref).toEqual({ color: { scheme: 'accent1', lumMod: 0.5 }, width: 0.75 });
    expect(outlineHex((ref as { color: { scheme: string } }).color, { accent1: 'FF0000' })).toBe('800000');
    expect(outlineIn('<p:spPr><a:prstGeom prst="rect"/></p:spPr>')).toBeUndefined();
  });
});
