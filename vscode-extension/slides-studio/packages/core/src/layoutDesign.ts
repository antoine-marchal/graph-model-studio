import type { CorporateMaster, ElementStyle, LayoutDef, Paragraph, PlaceholderDef, SlideElement, SlideNode, StaticObject } from './schema.js';
import { resolveSlide } from './geometry.js';
import { round4 } from './units.js';

/*
 * Layout designer: a layout is edited as if it were a slide. Its static objects and placeholders
 * become the elements of a virtual slide (the whole editor works on it), then are converted back.
 * Objects edited in the designer are stored as `{ element: SlideElement }` static objects, which
 * the renderer and the PPTX compiler draw like slide elements; untouched objects keep their
 * original pptx-masters form.
 */

/** Pictures stored in the corporate master: `@master/<assetId>` (master-relative, not deck-relative). */
export const MASTER_SRC = '@master/';
export const masterAssetSrc = (assetId: string): string => `${MASTER_SRC}${assetId}`;
export const masterAssetOf = (src: string): string | null => (src.startsWith(MASTER_SRC) ? src.slice(MASTER_SRC.length) : null);

/** Id of the virtual slide edited by the layout designer. */
export const DESIGN_SLIDE_ID = 'layout-design';

export interface LayoutDesign {
  /** Virtual slide: one element per editable layout object and per placeholder. */
  slide: SlideNode;
  /** Layout the virtual slide is drawn on: background, objects that cannot be edited, placeholder styles. */
  layout: LayoutDef;
  /** Element id → original object index and its conversion (to detect untouched objects); placeholders: index -1 and their key. */
  origin: Record<string, { index: number; json: string }>;
}

/** Identity of an element regardless of its visibility (hiding keeps an object's native form). */
const signature = (el: SlideElement) => JSON.stringify({ ...el, hidden: undefined, source: undefined });

const PH_TYPES = ['title', 'subtitle', 'body', 'pic', 'chart', 'tbl', 'media'] as const;
/** Placeholder type of a new placeholder, from its key (`body-2` → body). */
export const placeholderTypeOf = (key: string): PlaceholderDef['type'] => PH_TYPES.find((t) => key === t || key.startsWith(`${t}-`)) ?? 'other';

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const colorOf = (v: unknown): string | undefined => (v && typeof v === 'object' && typeof (v as { color?: unknown }).color === 'string' ? (v as { color: string }).color.toUpperCase() : undefined);
const paragraphsOf = (text: string): Paragraph[] => text.split('\n').map((t) => ({ runs: t ? [{ text: t }] : [] }));
const textOf = (ps: Paragraph[] | undefined): string => (ps ?? []).map((p) => p.runs.map((r) => r.text).join('')).join('\n');
const geom = (g: Record<string, unknown>) => ({
  x: num(g.x) ?? 0,
  y: num(g.y) ?? 0,
  w: num(g.w) ?? 0,
  h: num(g.h) ?? 0,
  ...(num(g.rotate) ? { rotation: num(g.rotate) } : {}),
});
const clean = <T extends object>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

function lineStyle(line: unknown): Partial<ElementStyle> {
  const l = (line ?? {}) as { color?: string; width?: number; dashType?: string };
  if (!l.color) return {};
  return clean({ line: l.color.toUpperCase(), lineWidth: num(l.width), dash: l.dashType ? (l.dashType === 'sysDot' ? 'dot' : 'dash') : undefined }) as Partial<ElementStyle>;
}

/** A static object as a slide element, or null when it has no faithful element form. */
export function staticToElement(o: StaticObject, id: string): SlideElement | null {
  const [kind, raw] = Object.entries(o.object)[0] ?? [];
  if (!kind || !raw || typeof raw !== 'object') return null;
  const v = raw as Record<string, unknown>;
  const hidden = o.hidden ? { hidden: true } : {};
  if (kind === 'element') return { ...(v as SlideElement), id, ...hidden };
  if (kind === 'rect' || kind === 'roundRect') {
    const fill = v.fill as { color?: string; transparency?: number } | undefined;
    const style = clean({ fill: fill?.color ? fill.color.toUpperCase() : 'none', transparency: num(fill?.transparency), ...lineStyle(v.line), radius: num(v.rectRadius) }) as ElementStyle;
    return { id, type: 'shape', shape: v.rectRadius || kind === 'roundRect' ? 'roundRect' : 'rect', ...geom(v), style, ...hidden };
  }
  if (kind === 'line') {
    const l = lineStyle(v.line);
    return { id, type: 'shape', shape: 'line', ...geom(v), style: clean({ ...l, line: l.line ?? '000000' }) as ElementStyle, ...(v.flipH ? { flipH: true } : {}), ...(v.flipV ? { flipV: true } : {}), ...hidden };
  }
  if (kind === 'text') {
    if (typeof v.text !== 'string' && v.text !== undefined) return null;
    const opts = (v.options ?? {}) as Record<string, unknown>;
    const style = clean({
      fontFace: typeof opts.fontFace === 'string' ? opts.fontFace : undefined,
      fontSize: num(opts.fontSize),
      color: typeof opts.color === 'string' ? opts.color.toUpperCase() : undefined,
      bold: opts.bold ? true : undefined,
      italic: opts.italic ? true : undefined,
      align: opts.align as ElementStyle['align'],
      valign: opts.valign as ElementStyle['valign'],
      fill: colorOf(opts.fill),
      ...lineStyle(opts.line),
      radius: num(opts.rectRadius),
    }) as ElementStyle;
    return { id, type: 'text', ...geom(opts), paragraphs: paragraphsOf((v.text as string | undefined) ?? ''), style, ...hidden };
  }
  if (kind === 'image' && o.assetId && !o.crop) return { id, type: 'image', src: masterAssetSrc(o.assetId), ...geom(v), ...hidden };
  return null;
}

/** The layout as a virtual slide (see `LayoutDesign`). */
export function layoutToDesign(layout: LayoutDef): LayoutDesign {
  const elements: SlideElement[] = [];
  const origin: LayoutDesign['origin'] = {};
  const background: StaticObject[] = [];
  const taken = new Set<string>(layout.placeholders.map((p) => p.key));
  const freeId = (want: string | undefined, prefix: string) => {
    let id = want && ID_RE.test(want) && !taken.has(want) ? want : '';
    for (let i = 1; !id; i++) if (!taken.has(`${prefix}-${i}`)) id = `${prefix}-${i}`;
    taken.add(id);
    return id;
  };
  layout.objects.forEach((o, index) => {
    const stored = (o.object.element as SlideElement | undefined)?.id;
    const el = Object.keys(o.object).length ? staticToElement(o, freeId(stored, o.role === 'logo' ? 'logo' : 'object')) : null;
    if (!el) {
      if (Object.keys(o.object).length) background.push(o);
      return;
    }
    elements.push(el);
    origin[el.id] = { index, json: signature(el) };
  });
  for (const p of layout.placeholders) {
    const id = ID_RE.test(p.key) ? p.key : freeId(undefined, p.type);
    elements.push({ id, type: 'text', placeholder: p.key, x: p.x, y: p.y, w: p.w, h: p.h, paragraphs: paragraphsOf(p.prompt ?? p.key) });
    origin[id] = { index: -1, json: p.key };
  }
  return {
    slide: { id: DESIGN_SLIDE_ID, layout: layout.id, elements },
    layout: { ...layout, objects: background },
    origin,
  };
}

/** Placeholder style keys an element style can set. */
const PH_STYLE_KEYS = ['fontFace', 'fontSize', 'color', 'bold', 'italic', 'align', 'valign', 'line', 'lineWidth', 'dash', 'fill', 'radius', 'margin'] as const;

/**
 * The layout after a design session: elements back to static objects (in stacking order) and
 * placeholders. `indexMap` maps former object indexes to new ones (null = deleted), so slide
 * master overrides can follow their object; `origin` describes the result for the next save.
 */
export function designToLayout(base: LayoutDef, design: Pick<LayoutDesign, 'slide' | 'origin'>, master: CorporateMaster): { layout: LayoutDef; indexMap: Record<number, number | null>; origin: LayoutDesign['origin'] } {
  const design0 = { ...master, layouts: [...master.layouts.filter((l) => l.id !== base.id), { ...base, objects: [] }] };
  const resolved = resolveSlide(design.slide, design0).elements;
  const objects: StaticObject[] = [];
  const placeholders: PlaceholderDef[] = [];
  const indexMap: Record<number, number | null> = {};
  const origin: LayoutDesign['origin'] = {};
  // Objects without an element form stay at the back, as they were drawn in the designer.
  base.objects.forEach((o, i) => {
    if (Object.keys(o.object).length && !staticToElement(o, 'x')) (indexMap[i] = objects.length), objects.push(o);
  });
  const keys = new Set<string>();
  for (const r of resolved) {
    const el = r.element;
    const from = design.origin[el.id];
    if (el.placeholder && el.type === 'text') {
      const orig = base.placeholders.find((p) => p.key === (from?.index === -1 ? from.json : el.placeholder));
      const key = keys.has(el.placeholder) ? el.id : el.placeholder;
      keys.add(key);
      const style = { ...(orig?.style ?? {}) } as PlaceholderDef['style'];
      for (const k of PH_STYLE_KEYS) {
        const val = el.style?.[k];
        if (val === undefined) continue;
        // Placeholder colors are literal: theme tokens are resolved.
        (style as Record<string, unknown>)[k] = k === 'color' || k === 'line' || k === 'fill' ? (val === 'none' ? undefined : (r.style[k] ?? undefined)) : val;
      }
      const prompt = textOf(el.paragraphs);
      placeholders.push(clean({
        ...(orig ?? {}),
        key,
        name: orig?.name ?? key,
        type: orig?.type ?? placeholderTypeOf(key),
        x: round4(r.box.x), y: round4(r.box.y), w: round4(r.box.w), h: round4(r.box.h),
        style: clean(style),
        prompt: prompt && prompt !== key ? prompt : undefined,
      }) as PlaceholderDef);
      origin[el.id] = { index: -1, json: key };
      continue;
    }
    const orig = from && from.index >= 0 ? base.objects[from.index] : undefined;
    let o: StaticObject;
    const { source: _s, ...bare } = el as SlideElement & { source?: unknown };
    if (orig && signature(el) === from!.json) o = clean({ ...orig, hidden: el.hidden ? true : undefined }) as StaticObject;
    else {
      const stored = { ...bare, x: round4(r.box.x), y: round4(r.box.y), w: round4(r.box.w), h: round4(r.box.h) } as SlideElement;
      delete stored.hidden;
      delete stored.z;
      o = clean({ role: orig?.role ?? (el.type === 'image' ? 'logo' : el.type === 'text' ? 'text' : 'decoration'), object: { element: stored }, ...(el.hidden ? { hidden: true } : {}) }) as StaticObject;
    }
    if (orig) indexMap[from!.index] = objects.length;
    origin[el.id] = { index: objects.length, json: signature(el) };
    objects.push(o);
  }
  base.objects.forEach((_, i) => (indexMap[i] ??= null));
  return { layout: { ...base, objects, placeholders }, indexMap, origin };
}
