import { expect, test } from 'vitest';
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
