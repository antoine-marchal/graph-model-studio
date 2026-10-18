import type { SlideDocument, SlideElement, SlideNode } from '@corporate-slides/core';

export type Change = 'added' | 'modified';

export interface DocDiff {
  slides: Map<string, Change>;
  elements: Map<string, Map<string, Change>>;
  /** Elements present in the base slide but gone from the current one. */
  removedElements: Map<string, SlideElement[]>;
  /** Slides deleted since the base, anchored after the surviving slide that preceded them (null = first). */
  removedSlides: { slide: SlideNode; after: string | null }[];
  count: number;
}

/** Structural identity: source positions move with every edit above, so they never count as changes. */
const sig = (v: unknown) => JSON.stringify(v, (k, x) => (k === 'source' ? undefined : x));

/** Slide/element changes between a base revision and the current document, keyed by stable ids. */
export function diffDocs(base: SlideDocument, doc: SlideDocument): DocDiff {
  const out: DocDiff = { slides: new Map(), elements: new Map(), removedElements: new Map(), removedSlides: [], count: 0 };
  const baseSlides = new Map(base.slides.map((s) => [s.id, s]));
  const current = new Set(doc.slides.map((s) => s.id));

  for (const s of doc.slides) {
    const b = baseSlides.get(s.id);
    if (!b) {
      out.slides.set(s.id, 'added');
      out.count++;
      continue;
    }
    const before = new Map(b.elements.map((e) => [e.id, e]));
    const changes = new Map<string, Change>();
    for (const e of s.elements) {
      const old = before.get(e.id);
      if (!old) changes.set(e.id, 'added');
      else if (sig(old) !== sig(e)) changes.set(e.id, 'modified');
    }
    const ids = new Set(s.elements.map((e) => e.id));
    const removed = b.elements.filter((e) => !ids.has(e.id));
    const slideChanged = b.layout !== s.layout || (b.notes ?? '') !== (s.notes ?? '') || !!b.hidden !== !!s.hidden;
    if (changes.size) out.elements.set(s.id, changes);
    if (removed.length) out.removedElements.set(s.id, removed);
    if (changes.size || removed.length || slideChanged) {
      out.slides.set(s.id, 'modified');
      out.count += changes.size + removed.length + (slideChanged ? 1 : 0);
    }
  }

  let after: string | null = null;
  for (const b of base.slides) {
    if (current.has(b.id)) after = b.id;
    else {
      out.removedSlides.push({ slide: b, after });
      out.count++;
    }
  }
  return out;
}
