import { expect, test } from 'vitest';
import { documentToDeck, parseMarkdown, sourceKindOf } from './index.js';

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
