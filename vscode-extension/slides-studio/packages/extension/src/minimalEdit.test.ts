import { expect, it } from 'vitest';
import { minimalEdit, withEol } from '../../../../shared/minimal-edit';

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const wellFormed = (s: string) => !LONE_SURROGATE.test(s);
const apply =(before: string, after: string) => {
  const c = minimalEdit(before, after);
  return c ? before.slice(0, c.start) + c.text + before.slice(c.end) : before;
};

it('replaces only the changed span, never inside a surrogate pair', () => {
  expect(minimalEdit('same', 'same')).toBeNull();
  expect(minimalEdit('# Title\n\nbody\n', '# Title\n\nbody text\n')).toEqual({ start: 13, end: 13, text: ' text' });
  for (const [a, b] of [['a😀b', 'a😃b'], ['x😀', 'x'], ['😀😀', '😀'], ['aa', 'aaa'], ['', 'new'], ['old', '']]) {
    expect(apply(a!, b!)).toBe(b);
    const c = minimalEdit(a!, b!)!;
    expect(wellFormed(c.text)).toBe(true);
    expect(wellFormed(a!.slice(c.start, c.end))).toBe(true);
  }
  expect(withEol('a\nb\r\nc', true)).toBe('a\r\nb\r\nc');
});
