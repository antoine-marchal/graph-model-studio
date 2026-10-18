import { describe, expect, it } from 'vitest';
import { contentToParagraphs, formatInline, paragraphsToContent, paragraphsToMarkdown, parseInline } from './text.js';
import { applyToDocument, reorderIds } from './mutations.js';
import { SlideDocument } from './schema.js';
import { emuToInch, inchToEmu, pxToInch, inchToPx } from './units.js';

describe('units', () => {
  it('converts inch/EMU/px losslessly at 4 decimals', () => {
    expect(inchToEmu(13.3333)).toBe(12_191_970);
    expect(emuToInch(12_192_000)).toBe(13.3333);
    expect(pxToInch(inchToPx(1.2345, 0.75), 0.75)).toBe(1.2345);
  });
});

describe('inline grammar', () => {
  it('parses bold/italic and escapes', () => {
    expect(parseInline('a **b** *c* \\*d')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' ' },
      { text: 'c', italic: true },
      { text: ' *d' },
    ]);
  });
  it('round-trips runs', () => {
    const src = 'Plan **PLM** et *MES* – coût 5 \\* 3 snake_case';
    expect(formatInline(parseInline(src))).toBe(src);
  });
  it('round-trips DSL content with nested lists', () => {
    const content = '## Objectifs\nIntro\n- Un\n  - Deux\n1. A\n2. B';
    const paras = contentToParagraphs(content);
    expect(paras[0]).toMatchObject({ heading: 2 });
    expect(paras[3]).toMatchObject({ list: 'bullet', level: 1 });
    expect(paragraphsToContent(paras)).toBe(content);
  });
  it('generates CommonMark-correct nested indentation', () => {
    const md = paragraphsToMarkdown(contentToParagraphs('1. A\n  - sub\n2. B'));
    expect(md).toBe('1. A\n   - sub\n2. B');
  });
});

const doc = SlideDocument.parse({
  version: '1',
  metadata: { title: 'T' },
  masterRef: 'corporate',
  themeRef: 'default',
  dimensions: { width: 13.3333, height: 7.5 },
  slides: [
    { id: 's1', layout: 'content', elements: [
      { id: 'a', type: 'shape', shape: 'rect', x: 1, y: 1, w: 1, h: 1 },
      { id: 'b', type: 'text', x: 2, y: 2, w: 2, h: 1, paragraphs: [{ runs: [{ text: 'x' }] }] },
    ] },
  ],
});

describe('canonical mutations', () => {
  it('updates geometry with rounding and style removal', () => {
    const next = applyToDocument(doc, [
      { kind: 'updateElement', slideId: 's1', elementId: 'a', patch: { x: 1.234567, style: { fill: 'theme.accent2' } } },
    ]);
    expect(next.slides[0]!.elements[0]).toMatchObject({ x: 1.2346, style: { fill: 'theme.accent2' } });
    const back = applyToDocument(next, [{ kind: 'updateElement', slideId: 's1', elementId: 'a', patch: { style: { fill: null } } }]);
    expect(back.slides[0]!.elements[0]!.style).toBeUndefined();
    expect(doc.slides[0]!.elements[0]!.x).toBe(1);
  });
  it('reorders, duplicates and moves slides', () => {
    expect(reorderIds(doc.slides[0]!, 'b', 'back')).toEqual(['b', 'a']);
    const next = applyToDocument(doc, [
      { kind: 'duplicateSlide', slideId: 's1', newSlideId: 's2' },
      { kind: 'moveSlide', slideId: 's2', toIndex: 0 },
    ]);
    expect(next.slides.map((s) => s.id)).toEqual(['s2', 's1']);
  });
  it('rejects schema-invalid documents', () => {
    expect(() => SlideDocument.parse({ ...doc, slides: [{ id: 'bad id!', layout: 'x', elements: [] }] })).toThrow();
  });
});

describe('connectors and numbering', () => {
  it('anchors connectors on facing sides', async () => {
    const { connectorPath } = await import('./geometry.js');
    const a = { x: 1, y: 1, w: 2, h: 1 }, b = { x: 6, y: 1.5, w: 2, h: 1 };
    expect(connectorPath(a, b)).toEqual({ x1: 3, y1: 1.5, x2: 6, y2: 2, fromSide: 'right', toSide: 'left' });
    const below = { x: 1, y: 5, w: 2, h: 1 };
    expect(connectorPath(a, below)).toMatchObject({ fromSide: 'bottom', toSide: 'top', x1: 2, y1: 2, x2: 2, y2: 5 });
    expect(connectorPath(a, b, 'top', 'top')).toMatchObject({ y1: 1, y2: 1.5 });
  });
  it('labels ordered list items like PowerPoint', async () => {
    const { numberLabel } = await import('./geometry.js');
    expect(numberLabel(4, 'romanUcPeriod')).toBe('IV.');
    expect(numberLabel(28, 'alphaLcParenR')).toBe('ab)');
    expect(numberLabel(3, 'arabicParenR')).toBe('3)');
  });
});
