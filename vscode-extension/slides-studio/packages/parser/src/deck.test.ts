import { expect, test } from 'vitest';
import type { CorporateMaster } from '@corporate-slides/core';
import { applyMarkdownMutations, documentToDeck, parseMarkdown, sourceKindOf } from './index.js';

test('.deck files use the hybrid Markdown + YAML syntax', () => {
  expect(sourceKindOf('archi.deck')).toBe('markdown');
});

test('front-matter elements carry their own source lines (review comments anchor to them)', () => {
  const text = ['---', 'title: T', '---', '', '---', 'id: s1', 'layout: blank', 'elements:', '  - id: a', '    type: shape', '    shape: rect', '  - id: b', '    type: shape', '    shape: ellipse', '---', '', '# Titre', ''].join('\n');
  const els = parseMarkdown(text).doc.slides[0]!.elements;
  const lines = (id: string) => {
    const s = els.find((e) => e.id === id)!.source!;
    return [s.startLine, s.endLine];
  };
  expect(lines('a')).toEqual([9, 11]);
  expect(lines('b')).toEqual([12, 14]);
});

test('documentToDeck writes placeholder text as `::: id` blocks and reads it back', () => {
  const doc = parseMarkdown(['---', 'title: T', '---', '', '---', 'id: slide-5', 'layout: section', 'elements:', '  - id: body-1', '    type: text', '    placeholder: body', '    content: "1"', '  - id: body-2-1', '    type: text', '    placeholder: body-2', '    content: Sous-Titre', '---', '', '# Titre', ''].join('\n')).doc;
  const deck = documentToDeck(doc);
  expect(deck).toContain('# Titre\n\n::: body-1\n1\n:::\n\n::: body-2-1\nSous-Titre\n:::\n');
  expect(deck).not.toContain('content:');
  const strip = (d: typeof doc) => d.slides[0]!.elements.map(({ source: _s, ...e }) => e).sort((a, b) => a.id.localeCompare(b.id));
  const back = parseMarkdown(deck);
  expect(back.errors).toEqual([]);
  expect(strip(back.doc)).toEqual(strip(doc));
});

test('editing a placeholder written with `content:` moves its text to a `::: id` block', () => {
  const text = ['---', 'title: T', '---', '', '---', 'id: s1', 'layout: section', 'elements:', '  - id: body-1', '    type: text', '    placeholder: body', '    content: "1"', '---', '', '# Titre', '', '---', 'id: s2', 'layout: section', '---', '', '# Deux', ''].join('\n');
  const out = applyMarkdownMutations(text, [{ kind: 'updateElement', slideId: 's1', elementId: 'body-1', patch: { paragraphs: [{ runs: [{ text: '2' }] }] } }]);
  expect(out).toContain('    placeholder: body\n---\n\n# Titre\n\n::: body-1\n2\n:::\n\n---\nid: s2');
  expect(out).not.toContain('content:');
  const back = parseMarkdown(out);
  expect(back.errors).toEqual([]);
  expect(back.doc.slides[0]!.elements.find((e) => e.id === 'body-1')).toMatchObject({ placeholder: 'body', paragraphs: [{ runs: [{ text: '2' }] }] });
  expect(back.doc.slides).toHaveLength(2);
});

test('free text boxes keep their text in a `::: id` block, renamed with the element', () => {
  const base = ['---', 'title: T', '---', '', '---', 'id: s1', 'layout: blank', '---', '', '# Titre', ''].join('\n');
  const doc = () => parseMarkdown(out).doc;
  let out = applyMarkdownMutations(base, [{ kind: 'addElement', slideId: 's1', element: { id: 'text-1', type: 'text', x: 1, y: 1, w: 3, h: 1, paragraphs: [{ runs: [{ text: 'Bonjour' }] }] } }]);
  expect(out).toContain('::: text-1\nBonjour\n:::');
  expect(out).not.toContain('content:');
  expect(doc().slides[0]!.elements.find((e) => e.id === 'text-1')).toMatchObject({ type: 'text', x: 1, paragraphs: [{ runs: [{ text: 'Bonjour' }] }] });
  expect(doc().slides[0]!.elements.find((e) => e.id === 'text-1')!.placeholder).toBeUndefined();
  out = applyMarkdownMutations(out, [{ kind: 'updateElement', slideId: 's1', elementId: 'text-1', patch: { paragraphs: [{ runs: [{ text: 'Salut' }] }] } }]);
  out = applyMarkdownMutations(out, [{ kind: 'renameElement', slideId: 's1', elementId: 'text-1', newId: 'greeting' }]);
  expect(out).toContain('::: greeting\nSalut\n:::');
  expect(out).toContain('- id: greeting');
  expect(doc().slides[0]!.elements.find((e) => e.id === 'greeting')).toMatchObject({ x: 1, paragraphs: [{ runs: [{ text: 'Salut' }] }] });
  // An empty box still gets its block, filled on first edit.
  out = applyMarkdownMutations(out, [{ kind: 'addElement', slideId: 's1', element: { id: 'text-2', type: 'text', x: 1, y: 3, w: 3, h: 1, paragraphs: [] } }]);
  out = applyMarkdownMutations(out, [{ kind: 'updateElement', slideId: 's1', elementId: 'text-2', patch: { paragraphs: [{ runs: [{ text: 'Deux' }] }] } }]);
  expect(out).toContain('::: text-2\nDeux\n:::');
});

test('shared placeholder values fill every slide with the placeholder; a slide can detach its own copy', () => {
  const ph = (key: string) => ({ key, name: key, type: 'body', x: 1, y: 1, w: 4, h: 1, style: {} });
  const master = { dimensions: { width: 13.3333, height: 7.5 }, layouts: [{ id: 'a', name: 'a', aliases: [], placeholders: [ph('title'), ph('tag')], objects: [] }, { id: 'b', name: 'b', aliases: [], placeholders: [ph('title')], objects: [] }] } as unknown as CorporateMaster;
  const opts = { master };
  const text = ['---', 'title: T', '---', '', '---', 'id: s1', 'layout: a', '---', '', '::: tag', 'Confidentiel', ':::', '', '---', 'id: s2', 'layout: a', '---', '', '::: tag', 'Autre', ':::', '', '---', 'id: s3', 'layout: b', '---', ''].join('\n');
  const tag = (t: string, s: number) => parseMarkdown(t, opts).doc.slides[s]!.elements.find((e) => e.placeholder === 'tag') as { paragraphs?: unknown; shared?: boolean } | undefined;
  let out = applyMarkdownMutations(text, [{ kind: 'shareText', slideId: 's1', elementId: 'tag', shared: true }], opts);
  expect(out).toContain('shared:\n  tag: Confidentiel');
  expect(out).not.toContain('::: tag');
  expect(tag(out, 0)).toMatchObject({ shared: true, paragraphs: [{ runs: [{ text: 'Confidentiel' }] }] });
  expect(tag(out, 1)).toMatchObject({ shared: true });
  expect(tag(out, 2)).toBeUndefined();
  // Editing the shared text on any slide changes the deck-wide value.
  out = applyMarkdownMutations(out, [{ kind: 'updateElement', slideId: 's2', elementId: 'tag', patch: { paragraphs: [{ runs: [{ text: 'Interne' }] }] } }], opts);
  expect(tag(out, 0)?.paragraphs).toEqual([{ runs: [{ text: 'Interne' }] }]);
  expect(() => applyMarkdownMutations(out, [{ kind: 'updateElement', slideId: 's2', elementId: 'tag', patch: { x: 2 } }], opts)).toThrow();
  // Detach on slide 2, then change it there only.
  out = applyMarkdownMutations(out, [{ kind: 'shareText', slideId: 's2', elementId: 'tag', shared: false }], opts);
  out = applyMarkdownMutations(out, [{ kind: 'updateElement', slideId: 's2', elementId: 'tag', patch: { paragraphs: [{ runs: [{ text: 'Public' }] }] } }], opts);
  expect(tag(out, 1)).toMatchObject({ paragraphs: [{ runs: [{ text: 'Public' }] }] });
  expect(tag(out, 1)!.shared).toBeFalsy();
  expect(tag(out, 0)?.paragraphs).toEqual([{ runs: [{ text: 'Interne' }] }]);
});
