import { beforeAll, describe, expect, it } from 'vitest';
import type { SlideDocument } from '@corporate-slides/core';

// The store talks to the host through `window`; a frame queue stands in for requestAnimationFrame.
const posted: unknown[] = [];
let frames: (() => void)[] = [];
const flush = () => {
  const f = frames;
  frames = [];
  f.forEach((cb) => cb());
};
Object.assign(globalThis, {
  window: { acquireVsCodeApi: () => ({ postMessage: (m: unknown) => posted.push(m), getState: () => undefined, setState: () => {} }), addEventListener() {}, removeEventListener() {} },
  requestAnimationFrame: (cb: () => void) => frames.push(cb),
  cancelAnimationFrame: (id: number) => id && (frames[id - 1] = () => {}),
});

let store: typeof import('./store');
beforeAll(async () => {
  store = await import('./store');
});

const box = (id: string, x: number) => ({ id, type: 'shape', shape: 'rect', x, y: 0, w: 1, h: 1 });
const deck = (): SlideDocument =>
  ({ version: '1', metadata: {}, masterRef: 'c', themeRef: 'd', dimensions: { width: 13.33, height: 7.5 }, slides: [{ id: 's1', layout: 'x', elements: [box('a', 0), box('b', 1)] }, { id: 's2', layout: 'x', elements: [box('c', 0)] }] }) as never;
const load = (doc: SlideDocument) =>
  store.useEditor.getState().setDocument({ version: 1, fileName: 'f', sourceKind: 'dsl', doc, master: null, assetUrls: {}, diagnostics: [], parseErrors: [], readOnly: false, review: null });
const move = (x: number) => [{ kind: 'updateElement' as const, slideId: 's1', elementId: 'a', patch: { x } }];
const xOf = () => store.useEditor.getState().doc!.slides[0]!.elements[0]!.x;

describe('gesture previews', () => {
  it('apply at most once per frame, then commit once from the gesture baseline', () => {
    load(deck());
    const s = store.useEditor.getState();
    const other = s.doc!.slides[1];
    s.preview(move(1));
    s.preview(move(2));
    s.preview(move(3));
    expect(frames).toHaveLength(1);
    expect(xOf()).toBe(0);
    flush();
    expect(xOf()).toBe(3);
    expect(store.useEditor.getState().doc!.slides[1]).toBe(other);
    posted.length = 0;
    s.preview(move(4));
    s.mutate(move(5));
    flush();
    expect(xOf()).toBe(5);
    expect(posted).toHaveLength(1);
  });

  it('keeps unacknowledged optimistic edits as the preview baseline', () => {
    load(deck());
    const s = store.useEditor.getState();
    s.mutate([{ kind: 'updateElement', slideId: 's1', elementId: 'b', patch: { y: 9 } }]);
    s.preview(move(2));
    flush();
    expect(store.useEditor.getState().doc!.slides[0]!.elements[1]!.y).toBe(9);
    s.cancelPreview();
    flush();
    expect(xOf()).toBe(0);
    expect(store.useEditor.getState().doc!.slides[0]!.elements[1]!.y).toBe(9);
  });

  it('host updates keep the identity of unchanged slides', () => {
    load(deck());
    const before = store.useEditor.getState().doc!;
    const next = deck();
    next.slides[0]!.elements[0]!.x = 7;
    load(next);
    const after = store.useEditor.getState().doc!;
    expect(after.slides[1]).toBe(before.slides[1]);
    expect(after.slides[0]!.elements[1]).toBe(before.slides[0]!.elements[1]);
    expect(after.slides[0]!.elements[0]!.x).toBe(7);
  });
});
