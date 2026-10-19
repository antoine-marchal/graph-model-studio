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

describe('master editing', async () => {
  const { layoutForSlide, resolveSlide } = await import('./geometry.js');
  const { newLayout, patchMasterObjects } = await import('./masterEdit.js');
  const logo = { role: 'logo' as const, object: { image: { x: 1, y: 1, w: 1, h: 0.5, path: 'assets/logo.png' } }, assetId: 'logo' };
  const band = { role: 'decoration' as const, object: { rect: { x: 0, y: 7, w: 13.33, h: 0.5, fill: { color: 'E50019' } } } };
  const layout = { id: 'content', name: 'Content', masterId: 'm1', sourcePart: '', aliases: [], background: {}, placeholders: [{ key: 'title', name: 't', type: 'title' as const, x: 0.5, y: 0.5, w: 12, h: 1, style: {} }], objects: [logo, band], slideNumber: null, warnings: [] };
  const master = {
    schemaVersion: 1 as const, id: 'x', name: 'x', source: { file: '', sha256: '', importedAt: '', extractor: { name: '', version: '' } }, dimensions: { width: 13.33, height: 7.5 },
    theme: { colors: { dk1: '000000', lt1: 'FFFFFF', accent1: '3E4A83' }, palette: {}, fonts: { heading: 'Arial', body: 'Arial' } },
    masters: [{ id: 'm1', name: 'M', part: '', layoutIds: ['content', 'other'], primary: true }],
    layouts: [layout, { ...structuredClone(layout), id: 'other' }], assets: [], fidelity: { method: 'native' as const, description: '' }, unsupported: [], warnings: [],
    constraints: { allowedFonts: [], fontSizes: { title: [20, 40] as [number, number], body: [10, 30] as [number, number] }, palette: [], minMargin: 0, safeArea: { x: 0, y: 0, w: 13.33, h: 7.5 }, aspectRatio: 1.77, rules: {} },
  };
  it('applies a slide override to the layout objects, and restores with null', () => {
    const doc = SlideDocument.parse({ version: '1', metadata: {}, masterRef: 'c', themeRef: 'd', dimensions: { width: 13.33, height: 7.5 }, slides: [{ id: 's', layout: 'content', elements: [] }] });
    const moved = applyToDocument(doc, [{ kind: 'setMasterOverride', slideId: 's', index: 0, override: { x: 3, hidden: false } }, { kind: 'setMasterOverride', slideId: 's', index: 1, override: { hidden: true } }]);
    const l = layoutForSlide(layout, moved.slides[0]!)!;
    expect((l.objects[0]!.object.image as { x: number }).x).toBe(3);
    expect(l.objects[1]!.hidden).toBe(true);
    expect((layout.objects[0]!.object as { image: { x: number } }).image.x).toBe(1); // the master is untouched
    expect(applyToDocument(moved, [{ kind: 'setMasterOverride', slideId: 's', index: 0, override: null }, { kind: 'setMasterOverride', slideId: 's', index: 1, override: null }]).slides[0]!.masterOverrides).toBeUndefined();
  });
  it('changes an object in every layout holding it ("all slides")', () => {
    const next = patchMasterObjects(master, 'content', 1, { fill: '00FF00' });
    for (const l of next.layouts) expect((l.objects[1]!.object.rect as { fill: { color: string } }).fill.color).toBe('00FF00');
    expect(band.object.rect.fill.color).toBe('E50019');
  });
  it('builds a layout from the slide rendering: free texts, rectangles and pictures become objects', () => {
    const slide = { id: 's', layout: 'content', elements: [
      { id: 'title', type: 'text' as const, placeholder: 'title', x: 1, paragraphs: [{ runs: [{ text: 'T' }] }] },
      { id: 'note', type: 'text' as const, x: 1, y: 6, w: 4, h: 0.4, style: { line: '#FF0000' as const }, paragraphs: [{ runs: [{ text: 'Confidentiel' }] }] },
      { id: 'box', type: 'shape' as const, shape: 'rect' as const, x: 9, y: 1, w: 2, h: 1 },
      { id: 'pic', type: 'image' as const, src: 'images/a.png', x: 2, y: 2, w: 1, h: 1 },
      { id: 'oval', type: 'shape' as const, shape: 'ellipse' as const, x: 5, y: 5, w: 1, h: 1 },
    ] };
    const made = newLayout(master, slide, 'slide', 'custom', 'Custom');
    expect(made.converted.sort()).toEqual(['box', 'note', 'pic']);
    expect(made.layout.placeholders[0]!.x).toBe(1);
    expect(made.images).toEqual([{ index: made.layout.objects.length - 1, src: 'images/a.png' }]);
    const text = made.layout.objects.find((o) => o.role === 'text')!.object.text as { text: string; options: { line?: { color: string } } };
    expect(text.text).toBe('Confidentiel');
    expect(text.options.line?.color).toBe('FF0000');
    expect(resolveSlide({ id: 'x', layout: 'content', elements: [] }, { ...master, layouts: [made.layout] } as never).layout).toBeUndefined();
  });
  it('layout designer: untouched objects keep their form; edits, additions and placeholders round-trip', async () => {
    const { designToLayout, layoutToDesign } = await import('./layoutDesign.js');
    const d = layoutToDesign(layout);
    expect(d.slide.elements.map((e) => [e.id, e.type])).toEqual([['logo-1', 'image'], ['object-1', 'shape'], ['title', 'text']]);
    const same = designToLayout(layout, d, master);
    expect(same.layout.objects).toEqual(layout.objects);
    expect(same.layout.placeholders).toEqual(layout.placeholders);
    expect(same.indexMap).toEqual({ 0: 0, 1: 1 });

    const edited = applyToDocument({ version: '1', metadata: {}, masterRef: 'c', themeRef: 'd', dimensions: { width: 13.33, height: 7.5 }, slides: [d.slide] } as never, [
      { kind: 'deleteElement', slideId: d.slide.id, elementId: 'logo-1' },
      { kind: 'updateElement', slideId: d.slide.id, elementId: 'object-1', patch: { style: { fill: 'theme.accent1' } } },
      { kind: 'addElement', slideId: d.slide.id, element: { id: 'star', type: 'shape', shape: 'star5', x: 1, y: 1, w: 1, h: 1 } },
      { kind: 'addElement', slideId: d.slide.id, element: { id: 'body-2', type: 'text', placeholder: 'body-2', x: 1, y: 2, w: 5, h: 3, paragraphs: [{ runs: [{ text: 'Cliquez ici' }] }] } },
      { kind: 'updateElement', slideId: d.slide.id, elementId: 'title', patch: { y: 0.25, style: { color: 'theme.accent1' } } },
    ]).slides[0]!;
    const out = designToLayout(layout, { slide: edited, origin: d.origin }, master);
    expect(out.indexMap).toEqual({ 0: null, 1: 0 });
    expect(out.layout.objects.map((o) => o.object.element && (o.object.element as { id: string }).id)).toEqual(['object-1', 'star']);
    expect(out.layout.objects[0]!.object.element).toMatchObject({ type: 'shape', shape: 'rect', style: { fill: 'theme.accent1' } });
    expect(out.layout.placeholders.map((p) => [p.key, p.type, p.y, p.style.color ?? null, p.prompt ?? null])).toEqual([['title', 'title', 0.25, '3E4A83', null], ['body-2', 'body', 2, null, 'Cliquez ici']]);
    // Saved again unchanged: element objects stay as they are.
    const again = designToLayout(out.layout, { slide: layoutToDesign(out.layout).slide, origin: layoutToDesign(out.layout).origin }, master);
    expect(again.layout.objects).toEqual(out.layout.objects);
  });
});

describe('caps', () => {
  it('keeps caps runs out of plain content and apart when merging', async () => {
    const { isPlainRepresentable, mergeRuns } = await import('./text.js');
    expect(isPlainRepresentable([{ runs: [{ text: 'a', caps: 'small' }] }])).toBe(false);
    expect(mergeRuns([{ text: 'a', caps: 'all' }, { text: 'b' }])).toHaveLength(2);
  });
});
