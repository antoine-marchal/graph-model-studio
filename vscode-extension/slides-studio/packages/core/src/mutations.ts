import { z } from 'zod';
import { AnchorPoint, CellStyle, Geometry, GroupPath, PresetName, ColAlign, TextRun, ConnectorSide, ElementStyle, Id, MasterOverride, Paragraph, ShapeKind, SlideElement, type SlideDocument, type SlideNode } from './schema.js';
import { round4 } from './units.js';
import { tr } from './i18n.js';

/**
 * Typed mutations emitted by the visual editor. They are validated by the extension host,
 * applied to the *source text* by the parser package (format-preserving), and can be applied
 * to a canonical `SlideDocument` with `applyToDocument` (used for optimistic UI and tests).
 */
const num = z.number().finite();
export const ElementPatch = z
  .object({
    x: num.optional(),
    y: num.optional(),
    w: num.min(0).optional(),
    h: num.min(0).optional(),
    rotation: num.optional(),
    /** Style keys to set; a key set to `null` removes the override. */
    style: z.record(z.string(), z.unknown()).optional(),
    paragraphs: z.array(Paragraph).optional(),
    placeholder: z.string().nullable().optional(),
    locked: z.boolean().optional(),
    /** Stacking order (layers panel); `null` back to document order. */
    z: z.number().int().min(0).max(10_000).nullable().optional(),
    name: z.string().max(120).nullable().optional(),
    hidden: z.boolean().optional(),
    /** `null` takes the element out of its group. */
    group: GroupPath.nullable().optional(),
    src: z.string().optional(),
    fit: z.enum(['stretch', 'contain', 'cover']).optional(),
    rows: z.array(z.array(z.string())).optional(),
    header: z.boolean().optional(),
    headerColumn: z.boolean().optional(),
    colAlign: z.array(ColAlign.nullable()).optional(),
    colWidths: z.array(z.number().positive()).optional(),
    rowHeights: z.array(z.number().positive()).optional(),
    /** `null` removes every cell override. */
    cellStyles: z.array(z.array(CellStyle.nullable())).nullable().optional(),
    cellRuns: z.array(z.array(z.array(TextRun).nullable())).nullable().optional(),
    shape: z.union([ShapeKind, PresetName]).optional(),
    geometry: Geometry.nullable().optional(),
    crop: z.object({ l: z.number(), t: z.number(), r: z.number(), b: z.number() }).nullable().optional(),
    merges: z.array(z.object({ r: z.number().int().min(0), c: z.number().int().min(0), rs: z.number().int().min(1), cs: z.number().int().min(1) })).nullable().optional(),
    /** `null` restores the preset's default geometry. */
    adjust: z.record(z.string().regex(/^adj\d?$/), z.number().finite()).nullable().optional(),
    from: Id.optional(),
    to: Id.optional(),
    route: z.enum(['straight', 'elbow', 'curved']).optional(),
    fromSide: ConnectorSide.optional(),
    toSide: ConnectorSide.optional(),
    /** `null` detaches the end from its free point (back to `fromSide` / `toSide`). */
    fromPoint: AnchorPoint.nullable().optional(),
    toPoint: AnchorPoint.nullable().optional(),
  })
  .strict();
export type ElementPatch = z.infer<typeof ElementPatch>;

export const Mutation = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('updateElement'), slideId: Id, elementId: Id, patch: ElementPatch }),
  z.object({ kind: z.literal('addElement'), slideId: Id, element: SlideElement }),
  z.object({ kind: z.literal('deleteElement'), slideId: Id, elementId: Id }),
  /** Change an element's id (connectors pointing at it are updated by separate `updateElement`s). */
  z.object({ kind: z.literal('renameElement'), slideId: Id, elementId: Id, newId: Id }),
  z.object({ kind: z.literal('reorderElement'), slideId: Id, elementId: Id, direction: z.enum(['front', 'back', 'forward', 'backward']) }),
  z.object({ kind: z.literal('addSlide'), slideId: Id, layout: z.string().min(1), afterSlideId: Id.optional(), title: z.string().optional() }),
  z.object({ kind: z.literal('deleteSlide'), slideId: Id }),
  z.object({ kind: z.literal('duplicateSlide'), slideId: Id, newSlideId: Id }),
  z.object({ kind: z.literal('moveSlide'), slideId: Id, toIndex: z.number().int().min(0) }),
  z.object({ kind: z.literal('setSlideLayout'), slideId: Id, layout: z.string().min(1) }),
  z.object({ kind: z.literal('setNotes'), slideId: Id, notes: z.string() }),
  /** Change (or with `null`, restore) one static object of the layout on this slide only. */
  z.object({ kind: z.literal('setMasterOverride'), slideId: Id, index: z.number().int().min(0).max(9999), override: MasterOverride.nullable() }),
  /**
   * `shared: true`: the text of this placeholder becomes the deck-wide value of every slide whose
   * layout has the placeholder (their own values are dropped). `false`: this slide gets its own copy.
   */
  z.object({ kind: z.literal('shareText'), slideId: Id, elementId: Id, shared: z.boolean() }),
]);
export type Mutation = z.infer<typeof Mutation>;

export const Transaction = z.object({ id: z.string().max(64), baseVersion: z.number().int(), mutations: z.array(Mutation).min(1).max(200) });
export type Transaction = z.infer<typeof Transaction>;

export class MutationError extends Error {}

const roundGeom = <T extends Record<string, unknown>>(patch: T): T => {
  const out: Record<string, unknown> = { ...patch };
  for (const k of ['x', 'y', 'w', 'h', 'rotation']) if (typeof out[k] === 'number') out[k] = round4(out[k] as number);
  return out as T;
};

/** Normalize a patch: round geometry, validate style values. */
export function normalizePatch(patch: ElementPatch): ElementPatch {
  const p = roundGeom(patch);
  if (p.style) {
    const set = Object.fromEntries(Object.entries(p.style).filter(([, v]) => v !== null));
    ElementStyle.partial().parse(set);
  }
  return p;
}

export function getSlide(doc: SlideDocument, slideId: string): SlideNode {
  const s = doc.slides.find((x) => x.id === slideId);
  if (!s) throw new MutationError(tr(`Diapositive « ${slideId} » introuvable`, `Slide “${slideId}” not found`));
  return s;
}

export function assertFreeId(slide: SlideNode, id: string): void {
  if (slide.elements.some((e) => e.id === id)) throw new MutationError(tr(`Identifiant « ${id} » déjà utilisé`, `Identifier “${id}” already used`));
}

/** Sorted stacking order after a reorder, as element ids back→front. */
export function reorderIds(slide: SlideNode, elementId: string, direction: 'front' | 'back' | 'forward' | 'backward'): string[] {
  const order = slide.elements
    .map((e, i) => ({ id: e.id, z: e.z ?? i, i }))
    .sort((a, b) => a.z - b.z || a.i - b.i)
    .map((e) => e.id);
  const idx = order.indexOf(elementId);
  if (idx < 0) throw new MutationError(tr(`Élément « ${elementId} » introuvable`, `Element “${elementId}” not found`));
  order.splice(idx, 1);
  const to = direction === 'front' ? order.length : direction === 'back' ? 0 : direction === 'forward' ? Math.min(order.length, idx + 1) : Math.max(0, idx - 1);
  order.splice(to, 0, elementId);
  return order;
}

/**
 * Pure canonical application, copy-on-write: only the slides and elements a mutation touches are
 * copied, everything else keeps its identity (memoized thumbnails / slide views stay valid).
 * Source-level application lives in @corporate-slides/parser.
 */
export function applyToDocument(doc: SlideDocument, mutations: Mutation[]): SlideDocument {
  const next: SlideDocument = { ...doc, slides: [...doc.slides] };
  const own = new WeakSet<object>();
  /** The slide, copied (with its element array) the first time this batch writes to it. */
  const getSlideW = (slideId: string): SlideNode => {
    const s = getSlide(next, slideId);
    if (own.has(s)) return s;
    const copy = { ...s, elements: [...s.elements] };
    own.add(copy);
    next.slides[next.slides.indexOf(s)] = copy;
    return copy;
  };
  const elementW = (slide: SlideNode, el: SlideElement): SlideElement => {
    if (own.has(el)) return el;
    const copy = { ...el } as SlideElement;
    own.add(copy);
    slide.elements[slide.elements.indexOf(el)] = copy;
    return copy;
  };
  for (const m of mutations) {
    switch (m.kind) {
      case 'updateElement': {
        const slide = getSlideW(m.slideId);
        const found = slide.elements.find((e) => e.id === m.elementId);
        if (!found) throw new MutationError(tr(`Élément « ${m.elementId} » introuvable`, `Element “${m.elementId}” not found`));
        const el = elementW(slide, found);
        const { style, placeholder, ...rest } = normalizePatch(m.patch);
        for (const [k, v] of Object.entries(rest)) {
          if (v === null) delete (el as Record<string, unknown>)[k];
          else if (v !== undefined) (el as Record<string, unknown>)[k] = v;
        }
        if (placeholder === null) delete el.placeholder;
        else if (placeholder !== undefined) el.placeholder = placeholder;
        if (style) {
          const s: Record<string, unknown> = { ...(el.style ?? {}) };
          for (const [k, v] of Object.entries(style)) if (v === null) delete s[k]; else s[k] = v;
          el.style = Object.keys(s).length ? (s as typeof el.style) : undefined;
          if (!el.style) delete el.style;
        }
        break;
      }
      case 'addElement': {
        const slide = getSlideW(m.slideId);
        if (slide.elements.some((e) => e.id === m.element.id)) throw new MutationError(tr(`Identifiant « ${m.element.id} » déjà utilisé`, `Identifier “${m.element.id}” already used`));
        slide.elements.push(structuredClone(m.element));
        break;
      }
      case 'deleteElement': {
        const slide = getSlideW(m.slideId);
        slide.elements = slide.elements.filter((e) => e.id !== m.elementId);
        break;
      }
      case 'renameElement': {
        const slide = getSlideW(m.slideId);
        const el = slide.elements.find((e) => e.id === m.elementId);
        if (!el) throw new MutationError(tr(`Élément « ${m.elementId} » introuvable`, `Element “${m.elementId}” not found`));
        assertFreeId(slide, m.newId);
        elementW(slide, el).id = m.newId;
        break;
      }
      case 'reorderElement': {
        const slide = getSlideW(m.slideId);
        const order = reorderIds(slide, m.elementId, m.direction);
        for (const e of [...slide.elements]) elementW(slide, e).z = order.indexOf(e.id);
        break;
      }
      case 'addSlide': {
        if (next.slides.some((s) => s.id === m.slideId)) throw new MutationError(tr(`Identifiant « ${m.slideId} » déjà utilisé`, `Identifier “${m.slideId}” already used`));
        const idx = m.afterSlideId ? next.slides.findIndex((s) => s.id === m.afterSlideId) + 1 : next.slides.length;
        const elements: SlideNode['elements'] = m.title !== undefined ? [{ id: 'title', type: 'text', placeholder: 'title', paragraphs: [{ runs: [{ text: m.title }] }] }] : [];
        next.slides.splice(idx, 0, { id: m.slideId, layout: m.layout, elements });
        break;
      }
      case 'deleteSlide':
        getSlide(next, m.slideId);
        next.slides = next.slides.filter((s) => s.id !== m.slideId);
        break;
      case 'duplicateSlide': {
        const src = getSlide(next, m.slideId);
        if (next.slides.some((s) => s.id === m.newSlideId)) throw new MutationError(tr(`Identifiant « ${m.newSlideId} » déjà utilisé`, `Identifier “${m.newSlideId}” already used`));
        const copy = structuredClone(src);
        copy.id = m.newSlideId;
        next.slides.splice(next.slides.indexOf(src) + 1, 0, copy);
        break;
      }
      case 'moveSlide': {
        const src = getSlide(next, m.slideId);
        next.slides.splice(next.slides.indexOf(src), 1);
        next.slides.splice(Math.min(m.toIndex, next.slides.length), 0, src);
        break;
      }
      case 'setSlideLayout':
        getSlideW(m.slideId).layout = m.layout;
        break;
      case 'setNotes': {
        const s = getSlideW(m.slideId);
        if (m.notes) s.notes = m.notes;
        else delete s.notes;
        break;
      }
      case 'setMasterOverride': {
        const s = getSlideW(m.slideId);
        s.masterOverrides = withMasterOverride(s.masterOverrides, m.index, m.override);
        if (!s.masterOverrides) delete s.masterOverrides;
        break;
      }
      case 'shareText': {
        // Approximation for optimistic UI: slides without the placeholder are only known with the master.
        const slide = getSlideW(m.slideId);
        const found = slide.elements.find((e) => e.id === m.elementId);
        if (found?.type !== 'text' || !found.placeholder) throw new MutationError(tr(`Élément « ${m.elementId} » : pas un espace réservé de texte`, `Element “${m.elementId}” is not a text placeholder`));
        const el = elementW(slide, found) as typeof found;
        if (!m.shared) delete el.shared;
        else {
          el.shared = true;
          // Deck-wide by design: every slide carrying the placeholder takes the text.
          for (const s0 of [...next.slides])
            for (const e of s0.elements)
              if (e !== el && e.type === 'text' && e.placeholder === el.placeholder) {
                const s = getSlideW(s0.id);
                Object.assign(elementW(s, e), { paragraphs: structuredClone(el.paragraphs), shared: true });
              }
        }
        break;
      }
    }
  }
  return next;
}

/** Overrides map after setting (or clearing, with `null` / an empty override) one object's entry. */
export function withMasterOverride(cur: SlideNode['masterOverrides'], index: number, override: MasterOverride | null): SlideNode['masterOverrides'] {
  const out = { ...(cur ?? {}) };
  if (override && Object.keys(override).length) out[String(index)] = override;
  else delete out[String(index)];
  return Object.keys(out).length ? out : undefined;
}

/** Generate an id not present in `taken`, e.g. `shape-3`. */
export function uniqueId(prefix: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  for (let i = 1; ; i++) if (!set.has(`${prefix}-${i}`)) return `${prefix}-${i}`;
}
