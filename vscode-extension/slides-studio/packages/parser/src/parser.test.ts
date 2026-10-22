import { describe, expect, it } from 'vitest';
import { applyToDocument, tableWeights, type Mutation, type SlideDocument } from '@corporate-slides/core';
import { applyMutations, documentToDsl, parseDsl, parseMarkdown, parseSource, withoutSource, type SourceKind } from './index.js';

export const MD = `---
title: Enterprise Architecture
master: corporate
theme: default
---

---
layout: title
---

# PLM / MES / ERP Architecture

Target landscape and integration strategy

---
layout: two-columns
---

<!-- comment kept verbatim -->
# Integration principles {#main-title}

::: left
## PLM
- Product definition
- Configuration **management**
  - Nested
:::

::: right
## MES / ERP
1. Execution orchestration
2. Resource planning
:::

::: notes
Speaker notes here.
:::
`;

export const DSL = `# Corporate deck (comment preserved)
presentation:
  title: Target Architecture
  master: corporate

slides:
  - id: architecture-overview
    layout: content
    elements:
      - id: title-1
        type: text
        content: Target Architecture
        placeholder: title

      - id: plm-box # the PLM box
        type: shape
        shape: roundRect
        x: 1.0
        y: 2.0
        w: 3.2
        h: 1.1
        style:
          fill: theme.accent1

      - id: plm-label
        type: text
        content: PLM
        x: 1.4
        y: 2.3
        w: 2.4
        h: 0.5
`;

/** Canonical comparison: no source refs, elements in stacking order without explicit z. */
function canon(doc: SlideDocument) {
  const d = withoutSource(doc);
  for (const s of d.slides) {
    s.elements = s.elements
      .map((e, i) => ({ e, z: e.z ?? i, i }))
      .sort((a, b) => a.z - b.z || a.i - b.i)
      .map(({ e }) => {
        const { z: _z, ...rest } = e;
        return rest as typeof e;
      });
  }
  return d;
}

/** Source edit must be equivalent to the canonical edit (the round-trip contract). */
function checkRoundTrip(kind: SourceKind, src: string, mutations: Mutation[]) {
  const before = parseSource(src, kind);
  expect(before.errors).toEqual([]);
  const text = applyMutations(src, kind, mutations);
  const after = parseSource(text, kind);
  expect(after.errors).toEqual([]);
  expect(canon(after.doc)).toEqual(canon(applyToDocument(before.doc, mutations)));
  return text;
}

describe('Markdown parsing', () => {
  it('parses frontmatter, slides, title/subtitle, slots, lists and notes', () => {
    const { doc, errors } = parseMarkdown(MD);
    expect(errors).toEqual([]);
    expect(doc.metadata.title).toBe('Enterprise Architecture');
    expect(doc.slides.map((s) => s.layout)).toEqual(['title', 'two-columns']);
    const [s1, s2] = doc.slides;
    expect(s1!.elements.map((e) => `${e.id}:${e.placeholder}`)).toEqual(['title:title', 'subtitle:subtitle']);
    expect(s2!.elements.map((e) => e.id)).toEqual(['main-title', 'left', 'right']);
    const left = s2!.elements[1]!;
    expect(left.type === 'text' && left.paragraphs).toEqual([
      { runs: [{ text: 'PLM' }], heading: 2 },
      { runs: [{ text: 'Product definition' }], list: 'bullet' },
      { runs: [{ text: 'Configuration ' }, { text: 'management', bold: true }], list: 'bullet' },
      { runs: [{ text: 'Nested' }], list: 'bullet', level: 1 },
    ]);
    expect(s2!.notes).toBe('Speaker notes here.');
    expect(s2!.elements[0]!.source).toMatchObject({ kind: 'markdown', startLine: 20 });
  });

  it('is deterministic', () => {
    expect(parseMarkdown(MD).doc).toEqual(parseMarkdown(MD).doc);
  });

  it('edits title text in place, keeping ids, comments and other text', () => {
    const text = checkRoundTrip('markdown', MD, [
      { kind: 'updateElement', slideId: 'slide-2', elementId: 'main-title', patch: { paragraphs: [{ runs: [{ text: 'Principes ' }, { text: "d'intégration", bold: true }] }] } },
    ]);
    expect(text).toContain("# Principes **d'intégration** {#main-title}");
    expect(text).toContain('<!-- comment kept verbatim -->');
    expect(text.replace(/# Principes.*\n/, '')).toBe(MD.replace(/# Integration.*\n/, ''));
  });

  it('keeps colored / sized runs in Markdown as spans, paragraph formats as `:::` blocks', () => {
    const runs = [{ text: 'x', color: 'theme.accent1' as const }, { text: 'y', size: 40 }];
    const inline = applyMutations(MD, 'markdown', [{ kind: 'updateElement', slideId: 'slide-2', elementId: 'main-title', patch: { paragraphs: [{ runs }] } }]);
    expect(inline).toContain('# [x]{color=theme.accent1}[y]{size=40} {#main-title}');
    expect((parseSource(inline, 'markdown').doc.slides[1]!.elements.find((e) => e.id === 'main-title') as { paragraphs: unknown[] }).paragraphs).toEqual([{ runs }]);
    // Slots hold styled paragraphs in nested blocks (the slot fence grows to `::::`).
    const paras = [{ runs: [{ text: 'Lead', size: 24 }], align: 'center' as const }, { runs: [{ text: 'Plain' }] }];
    const slot = applyMutations(MD, 'markdown', [{ kind: 'updateElement', slideId: 'slide-2', elementId: 'right', patch: { paragraphs: paras } }]);
    expect(slot).toContain('::: {align=center size=24}\nLead\n:::\n\nPlain');
    expect((parseSource(slot, 'markdown').doc.slides[1]!.elements.find((e) => e.id === 'right') as { paragraphs: unknown[] }).paragraphs).toEqual(paras);
    const added = applyMutations(MD, 'markdown', [{ kind: 'addElement', slideId: 'slide-2', element: { id: 'box', type: 'text', x: 1, y: 1, w: 2, h: 1, paragraphs: paras } }]);
    expect(added).toContain(':::: box\n::: {align=center size=24}');
    expect((parseSource(added, 'markdown').doc.slides[1]!.elements.find((e) => e.id === 'box') as { paragraphs: unknown[] }).paragraphs).toEqual(paras);
    // A title with a paragraph format cannot be a `#` heading: it moves to the frontmatter.
    const text = applyMutations(MD, 'markdown', [{ kind: 'updateElement', slideId: 'slide-2', elementId: 'main-title', patch: { paragraphs: [{ runs, align: 'center' }] } }]);
    expect(text).not.toContain('{#main-title}');
    const el = parseSource(text, 'markdown').doc.slides.find((s) => s.id === 'slide-2')!.elements.find((e) => e.id === 'main-title')!;
    expect(el.type === 'text' && el.paragraphs[0]).toEqual({ runs, align: 'center' });
    expect(el.placeholder).toBe('title');
  });

  it('stores geometry and style edits as frontmatter overrides', () => {
    const text = checkRoundTrip('markdown', MD, [
      { kind: 'updateElement', slideId: 'slide-2', elementId: 'left', patch: { x: 1.23456, y: 2, w: 5, h: 3, style: { color: 'theme.accent1' } } },
    ]);
    expect(text).toContain('layout: two-columns\nelements:\n  - id: left\n    x: 1.2346');
  });

  it('edits slot and subtitle text', () => {
    checkRoundTrip('markdown', MD, [
      { kind: 'updateElement', slideId: 'slide-2', elementId: 'right', patch: { paragraphs: [{ runs: [{ text: 'A' }], list: 'number' }, { runs: [{ text: 'B' }], list: 'number', level: 1 }] } },
      { kind: 'updateElement', slideId: 'slide-1', elementId: 'subtitle', patch: { paragraphs: [{ runs: [{ text: 'Nouveau sous-titre' }] }] } },
    ]);
  });

  it('adds, styles, reorders and deletes free elements', () => {
    checkRoundTrip('markdown', MD, [
      { kind: 'addElement', slideId: 'slide-1', element: { id: 'box', type: 'shape', shape: 'rect', x: 1, y: 1, w: 2, h: 1, style: { fill: 'theme.accent3' } } },
      { kind: 'updateElement', slideId: 'slide-1', elementId: 'box', patch: { x: 3, style: { fill: 'theme.accent2' } } },
      { kind: 'reorderElement', slideId: 'slide-1', elementId: 'box', direction: 'back' },
      { kind: 'deleteElement', slideId: 'slide-1', elementId: 'subtitle' },
    ]);
  });

  it('handles slide structure: add, duplicate, move, layout, notes, delete', () => {
    const text = checkRoundTrip('markdown', MD, [
      { kind: 'addSlide', slideId: 'new', layout: 'content', title: 'Nouvelle', afterSlideId: 'slide-1' },
      { kind: 'duplicateSlide', slideId: 'slide-1', newSlideId: 'copy' },
      { kind: 'moveSlide', slideId: 'slide-2', toIndex: 0 },
      { kind: 'setSlideLayout', slideId: 'new', layout: 'two-columns' },
      { kind: 'setNotes', slideId: 'slide-2', notes: 'Autres notes' },
      { kind: 'setNotes', slideId: 'new', notes: 'Notes en en-tête' },
      { kind: 'deleteSlide', slideId: 'copy' },
    ]);
    expect(parseMarkdown(text).doc.slides.map((s) => s.id)).toEqual(['slide-2', 'slide-1', 'new']);
  });
});

describe('DSL', () => {
  it('parses the DSL with content sugar and defaults', () => {
    const { doc, errors } = parseDsl(DSL);
    expect(errors).toEqual([]);
    const els = doc.slides[0]!.elements;
    expect(els.map((e) => e.type)).toEqual(['text', 'shape', 'text']);
    expect(els[1]).toMatchObject({ shape: 'roundRect', x: 1, style: { fill: 'theme.accent1' } });
  });

  it('reports schema errors with line numbers', () => {
    const { errors } = parseDsl('slides:\n  - id: a\n    layout: x\n    elements:\n      - id: e\n        type: shape\n        shape: Not-A-Shape\n');
    expect(errors[0]).toMatch(/ligne 5/);
  });

  it('applies edits preserving comments and blank lines', () => {
    const text = checkRoundTrip('dsl', DSL, [
      { kind: 'updateElement', slideId: 'architecture-overview', elementId: 'plm-box', patch: { x: 2.5, w: 4, style: { fill: 'theme.accent2' } } },
      { kind: 'updateElement', slideId: 'architecture-overview', elementId: 'plm-label', patch: { paragraphs: [{ runs: [{ text: 'PLM' }] }, { runs: [{ text: 'Teamcenter' }], list: 'bullet' }] } },
    ]);
    expect(text).toContain('# Corporate deck (comment preserved)');
    expect(text).toContain('- id: plm-box # the PLM box');
    expect(text).toContain('content: |-\n          PLM\n          - Teamcenter');
  });

  it('applies structural edits', () => {
    checkRoundTrip('dsl', DSL, [
      { kind: 'addSlide', slideId: 's2', layout: 'two-columns', title: 'Deux' },
      { kind: 'duplicateSlide', slideId: 'architecture-overview', newSlideId: 'dup' },
      { kind: 'moveSlide', slideId: 's2', toIndex: 0 },
      { kind: 'reorderElement', slideId: 'dup', elementId: 'title-1', direction: 'front' },
      { kind: 'addElement', slideId: 's2', element: { id: 'img', type: 'image', src: 'images/a.png', x: 1, y: 1, w: 2, h: 2 } },
      { kind: 'deleteElement', slideId: 'dup', elementId: 'plm-label' },
      { kind: 'setNotes', slideId: 's2', notes: 'ligne 1\nligne 2' },
      { kind: 'deleteSlide', slideId: 'architecture-overview' },
    ]);
  });

  it('serializes deterministically and round-trips Markdown → DSL', () => {
    const md = parseMarkdown(MD).doc;
    const dsl = documentToDsl(md);
    expect(documentToDsl(md)).toBe(dsl);
    expect(canon(parseDsl(dsl).doc)).toEqual(canon(md));
  });

  it('rejects remote image URLs', () => {
    const { errors } = parseDsl('slides:\n  - id: a\n    layout: x\n    elements:\n      - id: i\n        type: image\n        src: https://evil.example/x.png\n');
    expect(errors.join()).toMatch(/URL distante/);
  });
});

describe('tables and connectors in sources', () => {
  const md = `---\ntitle: T\n---\n\n---\nid: s\nlayout: content\n---\n\n# Plan\n\n| A | B |\n| --- | ---: |\n| 1 | 2 |\n`;
  it('keeps GFM column alignment and rewrites it from the editor', () => {
    const { doc } = parseMarkdown(md);
    const t = doc.slides[0]!.elements.find((e) => e.type === 'table')!;
    expect(t.type === 'table' && t.colAlign).toEqual([null, 'right']);
    const out = applyMutations(md, 'markdown', [{ kind: 'updateElement', slideId: 's', elementId: t.id, patch: { colAlign: ['center', null], rows: [['A', 'B'], ['1', '2'], ['3', '4']] } }]);
    expect(out).toContain('| :-: | --- |');
    expect(out).toContain('|  3  | 4   |');
  });
  it('stores resized column widths / row heights of a Markdown table in the front matter', () => {
    const t = parseMarkdown(md).doc.slides[0]!.elements.find((e) => e.type === 'table')!;
    const out = applyMutations(md, 'markdown', [{ kind: 'updateElement', slideId: 's', elementId: t.id, patch: { colWidths: [0.7, 0.3], rowHeights: [0.4, 0.6] } }]);
    const t2 = parseMarkdown(out).doc.slides[0]!.elements.find((e) => e.type === 'table')!;
    expect(t2.type === 'table' && [t2.colWidths, t2.rowHeights]).toEqual([[0.7, 0.3], [0.4, 0.6]]);
    expect(tableWeights([0.7], 3).map((x) => Math.round(x * 100))).toEqual([33, 33, 33]);
    expect(tableWeights([2, 1], 2)).toEqual([2 / 3, 1 / 3]);
  });
  it('writes new tables as Markdown in a `::: id` block, edits them there, keeps runs and headers', () => {
    const rows = [['Name', 'Value'], ['a|b', 'x\ty'], ['*star*', '']];
    const added = applyMutations(md, 'markdown', [{ kind: 'addElement', slideId: 's', element: { id: 'kpi', type: 'table', x: 1, y: 2, w: 6, h: 2, rows, headerColumn: true } }]);
    // Prettified: every column padded to its widest cell.
    expect(added).toContain('::: kpi\n| Name     | Value |\n| -------- | ----- |\n| a\\|b     | x\ty   |\n| \\*star\\* |       |\n:::');
    expect(added).not.toMatch(/rows:/);
    const t = parseMarkdown(added).doc.slides[0]!.elements.find((e) => e.id === 'kpi')!;
    expect(t).toMatchObject({ type: 'table', rows, headerColumn: true, x: 1, w: 6 });
    expect(t.placeholder).toBeUndefined();
    // Shift+Enter line breaks travel as `<br>`.
    const br = applyMutations(added, 'markdown', [{ kind: 'updateElement', slideId: 's', elementId: 'kpi', patch: { rows: [['Name', 'Value'], ['two\nlines', ''], ['', '']] } }]);
    expect(br).toContain('| two<br>lines |       |');
    expect(parseMarkdown(br).doc.slides[0]!.elements.find((e) => e.id === 'kpi')).toMatchObject({ rows: [['Name', 'Value'], ['two\nlines', ''], ['', '']] });
    const bold = [[null, null], [[{ text: 'a|b', bold: true }], null], [null, null]];
    const edited = applyMutations(added, 'markdown', [{ kind: 'updateElement', slideId: 's', elementId: 'kpi', patch: { rows: [...rows, ['n', '3']], cellRuns: bold, header: false } }]);
    expect(edited).toContain('| **a\\|b** | x\ty   |');
    expect(edited).toContain('| n        | 3     |');
    expect(edited).not.toMatch(/cellRuns/);
    const t2 = parseMarkdown(edited).doc.slides[0]!.elements.find((e) => e.id === 'kpi')!;
    expect(t2).toMatchObject({ rows: [...rows, ['n', '3']], header: false, headerColumn: true });
    expect(t2.type === 'table' && t2.cellRuns?.[1]?.[0]).toEqual([{ text: 'a|b', bold: true }]);
    // Colors are spans in the Markdown cell.
    const red = applyMutations(edited, 'markdown', [{ kind: 'updateElement', slideId: 's', elementId: 'kpi', patch: { cellRuns: [[null, null], [[{ text: 'a|b', color: '#FF0000' }], null], [null, null], [null, null]] } }]);
    expect(red).not.toMatch(/cellRuns:/);
    expect(red).toContain('[a\\|b]{color=#FF0000}');
    expect(parseMarkdown(red).doc.slides[0]!.elements.find((e) => e.id === 'kpi')).toMatchObject({ cellRuns: [[null, null], [[{ text: 'a|b', color: '#FF0000' }], null], [null, null], [null, null]] });
  });
  it('binds a `::: tbl {#id}` table block to the table placeholder', () => {
    const src = md.replace('| A | B |', '::: tbl {#budget}\n| A | B |').replace('| 1 | 2 |\n', '| 1 | 2 |\n:::\n');
    const t = parseMarkdown(src).doc.slides[0]!.elements.find((e) => e.type === 'table')!;
    expect(t).toMatchObject({ id: 'budget', placeholder: 'tbl', rows: [['A', 'B'], ['1', '2']] });
    const renamed = applyMutations(src, 'markdown', [{ kind: 'renameElement', slideId: 's', elementId: 'budget', newId: 'costs' }]);
    expect(renamed).toContain('::: tbl {#costs}');
    // Filling an empty table placeholder writes the block only (no frontmatter entry).
    const filled = applyMutations(md, 'markdown', [{ kind: 'addElement', slideId: 's', element: { id: 'table', type: 'table', placeholder: 'tbl', rows: [['Q', 'Total'], ['1', '']] } }]);
    expect(filled).toContain('::: tbl {#table}\n| Q   | Total |');
    expect(filled).not.toContain('elements:');
    expect(parseMarkdown(filled).doc.slides[0]!.elements.find((e) => e.id === 'table')).toMatchObject({ placeholder: 'tbl', rows: [['Q', 'Total'], ['1', '']] });
    // Placeholder ↔ free table, cell styles and sizes kept both ways.
    const styled = applyMutations(src, 'markdown', [{ kind: 'updateElement', slideId: 's', elementId: 'budget', patch: { cellStyles: [[{ fill: '#FF0000' }, null], [null, { bold: true }]], rowHeights: [1, 2] } }]);
    const freed = applyMutations(styled, 'markdown', [{ kind: 'updateElement', slideId: 's', elementId: 'budget', patch: { placeholder: null, x: 1, y: 2, w: 5, h: 2 } }]);
    expect(freed).toContain('::: budget\n');
    const free = parseMarkdown(freed).doc.slides[0]!.elements.find((e) => e.id === 'budget');
    expect(free).toMatchObject({ type: 'table', x: 1, w: 5, rows: [['A', 'B'], ['1', '2']], rowHeights: [1, 2], cellStyles: [[{ fill: '#FF0000' }, null], [null, { bold: true }]] });
    expect(free).not.toHaveProperty('placeholder');
    const bound = applyMutations(freed, 'markdown', [{ kind: 'updateElement', slideId: 's', elementId: 'budget', patch: { placeholder: 'tbl' } }]);
    expect(bound).toContain('::: tbl {#budget}');
    expect(parseMarkdown(bound).doc.slides[0]!.elements.find((e) => e.id === 'budget')).toMatchObject({ placeholder: 'tbl', rowHeights: [1, 2], cellStyles: [[{ fill: '#FF0000' }, null], [null, { bold: true }]] });
  });
  it('stores connectors and arrow/bullet styles in the front matter', () => {
    const add: Mutation[] = [
      { kind: 'addElement', slideId: 's', element: { id: 'a', type: 'shape', shape: 'can', x: 1, y: 1, w: 1, h: 1 } },
      { kind: 'addElement', slideId: 's', element: { id: 'b', type: 'shape', shape: 'hexagon', x: 4, y: 1, w: 1, h: 1, style: { radius: 0.2 } } },
      { kind: 'addElement', slideId: 's', element: { id: 'c', type: 'connector', from: 'a', to: 'b', route: 'elbow', style: { endArrow: 'stealth' } } },
    ];
    const out = applyMutations(md, 'markdown', add);
    const { doc, errors } = parseMarkdown(out);
    expect(errors).toEqual([]);
    const c = doc.slides[0]!.elements.find((e) => e.id === 'c');
    expect(c).toMatchObject({ type: 'connector', from: 'a', to: 'b', route: 'elbow', style: { endArrow: 'stealth' } });
    const moved = applyMutations(out, 'markdown', [{ kind: 'updateElement', slideId: 's', elementId: 'c', patch: { route: 'curved', fromSide: 'bottom' } }]);
    expect(parseMarkdown(moved).doc.slides[0]!.elements.find((e) => e.id === 'c')).toMatchObject({ route: 'curved', fromSide: 'bottom' });
  });
});

describe('renameElement', () => {
  const ids = (text: string, kind: SourceKind, i: number) => parseSource(text, kind).doc.slides[i]!.elements.map((e) => e.id);
  const sid = (i: number) => parseMarkdown(MD).doc.slides[i]!.id;

  it('renames Markdown titles, slots and derived blocks, keeping the text', () => {
    let out = applyMutations(MD, 'markdown', [{ kind: 'renameElement', slideId: sid(0), elementId: 'title', newId: 'headline' }]);
    expect(out).toContain('# PLM / MES / ERP Architecture {#headline}');
    out = applyMutations(out, 'markdown', [{ kind: 'renameElement', slideId: sid(1), elementId: 'main-title', newId: 'principles' }]);
    expect(out).toContain('# Integration principles {#principles}');
    out = applyMutations(out, 'markdown', [{ kind: 'renameElement', slideId: sid(1), elementId: 'left', newId: 'plm' }]);
    expect(out).toContain('::: left {#plm}');
    out = applyMutations(out, 'markdown', [{ kind: 'renameElement', slideId: sid(0), elementId: 'subtitle', newId: 'tagline' }]);
    const s0 = parseMarkdown(out).doc.slides[0]!;
    expect(s0.elements.map((e) => e.id).sort()).toEqual(['headline', 'tagline']);
    expect(s0.elements.find((e) => e.id === 'tagline')).toMatchObject({ placeholder: 'subtitle', paragraphs: [{ runs: [{ text: 'Target landscape and integration strategy' }] }] });
    expect(ids(out, 'markdown', 1)).toContain('plm');
  });

  it('renames DSL elements and refuses a taken id', () => {
    const dsl = documentToDsl(parseMarkdown(MD).doc);
    const out = applyMutations(dsl, 'dsl', [{ kind: 'renameElement', slideId: sid(1), elementId: 'left', newId: 'plm' }]);
    expect(ids(out, 'dsl', 1)).toContain('plm');
    expect(() => applyMutations(dsl, 'dsl', [{ kind: 'renameElement', slideId: sid(1), elementId: 'left', newId: 'right' }])).toThrow(/already used|déjà utilisé/);
  });
});
