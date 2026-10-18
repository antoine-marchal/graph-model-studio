import { expect, test } from 'vitest';
import { parseMarkdown, sourceKindOf } from './index.js';

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
