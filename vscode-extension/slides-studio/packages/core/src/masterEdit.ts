import type { CorporateMaster, LayoutDef, MasterOverride, SlideNode, StaticObject } from './schema.js';
import { layoutForSlide, overrideStaticObject, resolveSlide } from './geometry.js';
import { findLayout } from './theme.js';
import { round4 } from './units.js';
import { tr } from './i18n.js';

/**
 * Master editing "for every slide": the object is changed in its layout and in every other layout
 * holding the very same object (objects inherited from the slide master are copied into each layout).
 * Hidden objects are kept (flagged), so slide overrides keyed by object index stay aligned.
 */
export function patchMasterObjects(master: CorporateMaster, layoutId: string, index: number, patch: MasterOverride): CorporateMaster {
  const layout = master.layouts.find((l) => l.id === layoutId);
  const target = layout?.objects[index];
  if (!layout || !target) throw new Error(`Master object ${layoutId}#${index} not found`);
  const before = JSON.stringify(target);
  const next = structuredClone(master);
  for (const l of next.layouts) {
    l.objects = l.objects.map((o, i) => ((l.id === layoutId && i === index) || JSON.stringify(o) === before ? patchObject(o, patch) : o));
  }
  return next;
}

function patchObject(o: StaticObject, patch: MasterOverride): StaticObject {
  const { hidden, ...rest } = patch;
  const out = overrideStaticObject(o, rest);
  if (hidden === true) out.hidden = true;
  else if (hidden === false) delete out.hidden;
  return out;
}

export type NewLayoutSource = 'blank' | 'duplicate' | 'slide';

export interface NewLayout {
  layout: LayoutDef;
  /** Slide elements turned into layout objects (to remove from the slide). */
  converted: string[];
  /** Layout objects that are slide pictures: `src` is relative to the presentation, to copy into the master. */
  images: { index: number; src: string }[];
}

/**
 * A new layout from scratch, from the slide's current layout (as rendered, overrides included), or
 * from the slide's current rendering: its free texts, rectangles, lines and pictures become static
 * objects of the layout; placeholder-bound texts keep their placeholder, moved to where they are.
 */
export function newLayout(master: CorporateMaster, slide: SlideNode, from: NewLayoutSource, id: string, name: string): NewLayout {
  const base = findLayout(master, slide.layout);
  const masterId = base?.masterId ?? master.masters.find((m) => m.primary)?.id ?? master.masters[0]?.id ?? 'master-1';
  const empty: LayoutDef = { id, name, masterId, sourcePart: '', aliases: [], background: { color: base?.background.color ?? 'FFFFFF' }, placeholders: [], objects: [], slideNumber: null, warnings: [] };
  if (from === 'blank' || !base) return { layout: empty, converted: [], images: [] };
  const layout: LayoutDef = { ...structuredClone(layoutForSlide(base, slide)!), id, name, sourcePart: '', aliases: [], thumbnail: undefined, warnings: [] };
  layout.objects = layout.objects.filter((o) => !o.hidden);
  if (from === 'duplicate') return { layout, converted: [], images: [] };

  const converted: string[] = [];
  const images: NewLayout['images'] = [];
  const rs = resolveSlide(slide, master);
  for (const r of rs.elements) {
    const el = r.element;
    if (el.hidden) continue;
    const s = r.style;
    const g = { x: round4(r.box.x), y: round4(r.box.y), w: round4(r.box.w), h: round4(r.box.h), ...(el.rotation ? { rotate: el.rotation } : {}) };
    const fill = s.fill ? { fill: { color: s.fill, ...(s.transparency ? { transparency: s.transparency } : {}) } } : {};
    const line = s.line ? { line: { color: s.line, width: s.lineWidth, ...(s.dash !== 'solid' ? { dashType: s.dash === 'dot' ? 'sysDot' : 'dash' } : {}) } } : {};
    const paragraphs = el.type === 'text' || el.type === 'shape' ? (el.paragraphs ?? []) : [];
    const text = paragraphs.map((p) => p.runs.map((x) => x.text).join('')).join('\n');
    const textObject = (withChrome: boolean): StaticObject => ({
      role: 'text',
      object: {
        text: {
          text,
          options: {
            ...g,
            fontFace: s.fontFace, fontSize: s.fontSize, color: s.color, align: s.align, valign: s.valign, margin: s.margin,
            ...(s.bold ? { bold: true } : {}), ...(s.italic ? { italic: true } : {}),
            ...(withChrome ? { ...(el.style?.fill ? fill : {}), ...line, ...(s.radius ? { shape: 'roundRect', rectRadius: s.radius } : {}) } : {}),
          },
        },
      },
    });
    if (el.type === 'text' && r.placeholder) {
      const ph = layout.placeholders.find((p) => p.key === r.placeholder!.key);
      if (ph) Object.assign(ph, { x: g.x, y: g.y, w: g.w, h: g.h });
      continue;
    }
    if (el.type === 'text') {
      layout.objects.push(textObject(true));
      converted.push(el.id);
    } else if (el.type === 'shape' && (el.shape === 'rect' || el.shape === 'roundRect')) {
      layout.objects.push({ role: 'decoration', object: { rect: { ...g, ...fill, ...line, ...(el.shape === 'roundRect' ? { rectRadius: s.radius ?? Math.min(g.w, g.h) / 6 } : {}) } } });
      if (text.trim()) layout.objects.push(textObject(false));
      converted.push(el.id);
    } else if (el.type === 'shape' && el.shape === 'line') {
      layout.objects.push({ role: 'decoration', object: { line: { ...g, line: { color: s.line ?? s.color, width: s.lineWidth } } } });
      converted.push(el.id);
    } else if (el.type === 'image') {
      images.push({ index: layout.objects.length, src: el.src });
      layout.objects.push({ role: 'decoration', object: { image: { ...g, path: el.src } } });
      converted.push(el.id);
    }
    // Other shapes, tables and connectors have no static-object form: they stay on the slide.
  }
  return { layout, converted, images };
}

/**
 * Copy of a layout in the same master, right after the original (template order and the master's
 * layout list). Assets are shared. Returns the copy's id.
 */
export function duplicateLayout(master: CorporateMaster, layoutId: string): string {
  const i = master.layouts.findIndex((l) => l.id === layoutId);
  const src = master.layouts[i];
  if (!src) throw new Error(tr(`Disposition « ${layoutId} » introuvable`, `Layout “${layoutId}” not found`));
  const taken = new Set(master.layouts.flatMap((l) => [l.id, ...l.aliases]));
  let id = `${src.id}-copie`;
  for (let n = 2; taken.has(id); n++) id = `${src.id}-copie-${n}`;
  const copy: LayoutDef = { ...structuredClone(src), id, name: tr(`${src.name} (copie)`, `${src.name} (copy)`), aliases: [], sourcePart: '', ooxmlType: undefined };
  master.layouts.splice(i + 1, 0, copy);
  for (const m of master.masters) {
    const k = m.layoutIds.indexOf(src.id);
    if (k >= 0) m.layoutIds.splice(k + 1, 0, id);
  }
  return id;
}
