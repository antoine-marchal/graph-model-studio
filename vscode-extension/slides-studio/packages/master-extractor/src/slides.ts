import type JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { posix } from 'node:path';
import {
  findLayout,
  round4,
  ShapeKind,
  SlideElement,
  tr,
  type CellStyle,
  type CorporateMaster,
  type ElementStyle,
  type LayoutDef,
  type Paragraph,
  type PlaceholderDef,
  type SlideDocument,
  type SlideNode,
  type TextRun,
} from '@corporate-slides/core';
import { readRels, readText, type Rel } from './ooxml.js';
import { loadZipSafely } from './safety.js';

/*
 * PowerPoint slides → canonical `SlideDocument` (the masters themselves come from `importTemplate`).
 * Text boxes, placeholders, preset shapes, pictures, tables, connectors and groups are converted
 * natively: geometry in inches, colors as theme tokens when the slide uses scheme colors, runs with
 * bold / italic / underline / color, lists, cell fills and borders. What has no equivalent (charts,
 * SmartArt, custom geometry, slide backgrounds…) is reported, never silently dropped.
 */

/** preserveOrder keeps the z-order of mixed `p:sp` / `p:pic` / `p:graphicFrame` siblings. */
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', preserveOrder: true, trimValues: false });

type X = Record<string, unknown>;
const tagOf = (n: X) => Object.keys(n).find((k) => k !== ':@') ?? '';
const kids = (n: X | undefined): X[] => {
  const v = n ? n[tagOf(n)] : undefined;
  return Array.isArray(v) ? (v as X[]) : [];
};
const attr = (n: X | undefined, a: string): string | undefined => {
  const v = (n?.[':@'] as Record<string, string> | undefined)?.[a];
  return v === undefined ? v : decodeXml(String(v));
};
const child = (n: X | undefined, tag: string): X | undefined => kids(n).find((k) => tagOf(k) === tag);
const all = (n: X | undefined, tag: string): X[] => kids(n).filter((k) => tagOf(k) === tag);
const path = (n: X | undefined, ...tags: string[]): X | undefined => tags.reduce<X | undefined>((c, t) => child(c, t), n);
const textOf = (n: X | undefined): string => decodeXml(kids(n).map((k) => (typeof k['#text'] === 'string' || typeof k['#text'] === 'number' ? String(k['#text']) : '')).join(''));
const emu = (v: string | undefined) => round4(Number(v ?? 0) / 914400);

export interface ConvertedMedia {
  /** File name under `media/`, next to the deck. */
  name: string;
  data: Uint8Array;
}

export interface ConvertResult {
  doc: SlideDocument;
  media: ConvertedMedia[];
  warnings: string[];
  stats: { slides: number; elements: number; images: number; tables: number; skipped: number };
}

/* ------------------------------------------------------------------ */
/* Colors                                                              */
/* ------------------------------------------------------------------ */

const SCHEME: Record<string, string> = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2', dk1: 'dk1', lt1: 'lt1', dk2: 'dk2', lt2: 'lt2', accent1: 'accent1', accent2: 'accent2', accent3: 'accent3', accent4: 'accent4', accent5: 'accent5', accent6: 'accent6', hlink: 'hlink', folHlink: 'folHlink' };
const PRESET: Record<string, string> = { white: 'FFFFFF', black: '000000', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', gray: '808080' };

/** `a:solidFill` (or any color holder) → color token; `undefined` when absent, `none` for `a:noFill`. */
function colorOf(holder: X | undefined, master: CorporateMaster): string | undefined {
  if (!holder) return undefined;
  if (child(holder, 'a:noFill')) return 'none';
  const fill = child(holder, 'a:solidFill') ?? holder;
  const srgb = child(fill, 'a:srgbClr');
  if (srgb) return themeToken((attr(srgb, 'val') ?? '000000').toUpperCase(), master);
  const sys = child(fill, 'a:sysClr');
  if (sys) return `#${(attr(sys, 'lastClr') ?? '000000').toUpperCase()}`;
  const prst = child(fill, 'a:prstClr');
  if (prst) return `#${PRESET[attr(prst, 'val') ?? ''] ?? '000000'}`;
  const sc = child(fill, 'a:schemeClr');
  if (!sc) return undefined;
  const slot = SCHEME[attr(sc, 'val') ?? ''];
  if (!slot) return undefined;
  // lumMod / lumOff → the palette variant PowerPoint shows in its theme grid.
  const mod = Number(attr(child(sc, 'a:lumMod'), 'val') ?? 100000) / 1000;
  const off = Number(attr(child(sc, 'a:lumOff'), 'val') ?? 0) / 1000;
  let variant: string | null = null;
  if (off > 0) variant = `lighter${[80, 60, 40, 25].reduce((a, b) => (Math.abs(b - off) < Math.abs(a - off) ? b : a))}`;
  else if (mod < 100) variant = `darker${[25, 50].reduce((a, b) => (Math.abs(b - (100 - mod)) < Math.abs(a - (100 - mod)) ? b : a))}`;
  return variant && master.theme.palette[slot]?.[variant] ? `theme.${slot}.${variant}` : `theme.${slot}`;
}

/** A literal color that is exactly a theme color (or tint / shade) reads back as its token. */
function themeToken(hex: string, master: CorporateMaster): string {
  for (const [slot, v] of Object.entries(master.theme.colors)) if (v.toUpperCase() === hex) return `theme.${slot}`;
  for (const [slot, variants] of Object.entries(master.theme.palette)) for (const [k, v] of Object.entries(variants)) if (k !== 'base' && v.toUpperCase() === hex) return `theme.${slot}.${k}`;
  return `#${hex}`;
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeXml = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (XML_ENTITIES[e] ?? m)));

/** Same color once resolved (token or literal). */
function sameColor(a: string | undefined, b: string | undefined, master: CorporateMaster): boolean {
  const hex = (c: string | undefined) => {
    if (!c) return null;
    if (!c.startsWith('theme.')) return c.replace('#', '').toUpperCase();
    const [, slot, v] = c.split('.');
    return ((v ? master.theme.palette[slot!]?.[v] : master.theme.colors[slot!]) ?? '').toUpperCase() || null;
  };
  return !!a && !!b && hex(a) === hex(b);
}

/** Drop what a placeholder-bound element would inherit anyway: the deck stays as short as hand-written. */
function inheritedStripped(el: Record<string, unknown>, ph: PlaceholderDef | undefined, master: CorporateMaster): Record<string, unknown> {
  if (!ph) return el;
  const out = { ...el };
  const near = (a: unknown, b: number) => typeof a === 'number' && Math.abs(a - b) < 0.02;
  if (near(out.x, ph.x) && near(out.y, ph.y) && near(out.w, ph.w) && near(out.h, ph.h)) for (const k of ['x', 'y', 'w', 'h']) delete out[k];
  const style = { ...((out.style as ElementStyle | undefined) ?? {}) };
  const level = ph.levels?.[0];
  if (style.fontSize !== undefined && (style.fontSize === ph.style.fontSize || (ph.style.fontSize === undefined && style.fontSize === level?.fontSize))) delete style.fontSize;
  if (sameColor(style.color, ph.style.color ?? level?.color, master)) delete style.color;
  if (style.align && style.align === (ph.style.align ?? 'left')) delete style.align;
  if (style.valign && style.valign === (ph.style.valign ?? 'top')) delete style.valign;
  if (Object.keys(style).length) out.style = style;
  else delete out.style;
  return out;
}

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

interface TextInfo {
  paragraphs: Paragraph[];
  style: ElementStyle;
}

function textBody(body: X | undefined, master: CorporateMaster, ph: PlaceholderDef | undefined): TextInfo | null {
  if (!body) return null;
  const paragraphs: Paragraph[] = [];
  const sizes = new Set<number>(), colors = new Set<string | undefined>(), aligns = new Set<string>();
  let bullet: string | undefined;
  for (const p of all(body, 'a:p')) {
    const pPr = child(p, 'a:pPr');
    const level = Number(attr(pPr, 'lvl') ?? 0);
    const para: Paragraph = { runs: [] };
    if (level) para.level = Math.min(4, level);
    const algn = attr(pPr, 'algn');
    aligns.add(algn ?? '');
    const buChar = child(pPr, 'a:buChar'), buNum = child(pPr, 'a:buAutoNum'), buNone = child(pPr, 'a:buNone');
    // Body placeholders inherit their bullets from the layout unless the paragraph turns them off.
    const inherited = ph && (ph.type === 'body' || ph.type === 'other') && ph.levels?.[level]?.bullet && !buNone ? ph.levels[level]!.bullet : null;
    if (buNum || inherited?.numbered) para.list = 'number';
    else if (buChar || inherited?.char) {
      para.list = 'bullet';
      const c = attr(buChar, 'char');
      // The template's own list bullet (first level that defines one) needs no override.
      const templateChar = ph?.levels?.find((l) => l.bullet?.char)?.bullet?.char;
      if (c && c !== '•' && c !== inherited?.char && c !== templateChar) bullet = c;
    }
    // A line break inside a paragraph splits it in two (same list level and bullet).
    const flush = () => {
      paragraphs.push({ ...para, runs: para.runs });
      para.runs = [];
    };
    for (const k of kids(p)) {
      const t = tagOf(k);
      if (t === 'a:br') {
        flush();
        continue;
      }
      if (t !== 'a:r' && t !== 'a:fld') continue;
      const rPr = child(k, 'a:rPr');
      const text = textOf(child(k, 'a:t'));
      if (!text) continue;
      const run: TextRun = { text };
      if (attr(rPr, 'b') === '1' || attr(rPr, 'b') === 'true') run.bold = true;
      if (attr(rPr, 'i') === '1' || attr(rPr, 'i') === 'true') run.italic = true;
      const u = attr(rPr, 'u');
      if (u && u !== 'none') run.underline = true;
      const sz = attr(rPr, 'sz');
      if (sz) sizes.add(Number(sz) / 100);
      const color = colorOf(child(rPr, 'a:solidFill') ? rPr : undefined, master);
      colors.add(color);
      if (color && color !== 'none') run.color = color as TextRun['color'];
      para.runs.push(run);
    }
    paragraphs.push(para);
  }
  // Drop trailing empty paragraphs PowerPoint keeps after the last line.
  while (paragraphs.length > 1 && !paragraphs[paragraphs.length - 1]!.runs.length) paragraphs.pop();
  const style: ElementStyle = {};
  if (sizes.size === 1) style.fontSize = [...sizes][0]!;
  else if (sizes.size > 1) style.fontSize = Math.max(...sizes);
  // One color for every run: an element color rather than per-run colors.
  if (colors.size === 1 && [...colors][0] && [...colors][0] !== 'none') {
    style.color = [...colors][0] as ElementStyle['color'];
    for (const p of paragraphs) for (const r of p.runs) delete r.color;
  }
  const a = [...aligns][0];
  if (aligns.size === 1 && a) style.align = ({ l: 'left', ctr: 'center', r: 'right', just: 'justify' } as const)[a as 'l'] ?? undefined;
  if (!style.align) delete style.align;
  const anchor = attr(child(body, 'a:bodyPr'), 'anchor');
  if (anchor) style.valign = anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : 'top';
  if (bullet) style.bullet = bullet.slice(0, 2);
  return { paragraphs, style };
}

/* ------------------------------------------------------------------ */
/* Geometry and outline                                                */
/* ------------------------------------------------------------------ */

interface Frame {
  /** Group transform: child coordinates → slide inches. */
  map: (x: number, y: number) => { x: number; y: number };
  sx: number;
  sy: number;
}
const IDENTITY: Frame = { map: (x, y) => ({ x, y }), sx: 1, sy: 1 };

function geometry(xfrm: X | undefined, f: Frame) {
  if (!xfrm) return null;
  const off = child(xfrm, 'a:off'), ext = child(xfrm, 'a:ext');
  if (!off || !ext) return null;
  const p = f.map(emu(attr(off, 'x')), emu(attr(off, 'y')));
  const g: { x: number; y: number; w: number; h: number; rotation?: number; flipH?: boolean; flipV?: boolean } = { x: round4(p.x), y: round4(p.y), w: round4(emu(attr(ext, 'cx')) * f.sx), h: round4(emu(attr(ext, 'cy')) * f.sy) };
  const rot = Number(attr(xfrm, 'rot') ?? 0) / 60000;
  if (rot) g.rotation = round4(rot > 180 ? rot - 360 : rot);
  if (attr(xfrm, 'flipH') === '1') g.flipH = true;
  if (attr(xfrm, 'flipV') === '1') g.flipV = true;
  return g;
}

const ARROWS: Record<string, ElementStyle['endArrow']> = { triangle: 'triangle', arrow: 'arrow', stealth: 'stealth', diamond: 'diamond', oval: 'oval' };

function outline(ln: X | undefined, master: CorporateMaster): ElementStyle {
  const s: ElementStyle = {};
  if (!ln) return s;
  const color = colorOf(ln, master);
  if (color) s.line = color as ElementStyle['line'];
  const w = attr(ln, 'w');
  if (w) s.lineWidth = Math.min(50, round4(Number(w) / 12700));
  const dash = attr(child(ln, 'a:prstDash'), 'val');
  if (dash && dash !== 'solid') s.dash = /dot/i.test(dash) && !/dash/i.test(dash) ? 'dot' : 'dash';
  const head = ARROWS[attr(child(ln, 'a:headEnd'), 'type') ?? ''], tail = ARROWS[attr(child(ln, 'a:tailEnd'), 'type') ?? ''];
  if (head) s.startArrow = head;
  if (tail) s.endArrow = tail;
  return s;
}

/* ------------------------------------------------------------------ */
/* Slides                                                              */
/* ------------------------------------------------------------------ */

const PH_TYPES: Record<string, PlaceholderDef['type']> = { title: 'title', ctrTitle: 'title', subTitle: 'subtitle', body: 'body', obj: 'body', pic: 'pic', tbl: 'tbl', chart: 'chart', media: 'media' };
const SKIPPED_PH = new Set(['dt', 'ftr', 'sldNum', 'hdr']);
const SHAPES = new Set<string>(ShapeKind.options);
const ROUTE = (prst: string) => (/^bentConnector/.test(prst) ? 'elbow' : /^curvedConnector/.test(prst) ? 'curved' : 'straight');
const RECT_SIDES = ['top', 'left', 'bottom', 'right'] as const;

/** Match a slide placeholder (`p:ph type idx`) to a layout placeholder. */
function matchPlaceholder(layout: LayoutDef | undefined, type: string | undefined, idx: string | undefined): PlaceholderDef | undefined {
  if (!layout) return undefined;
  const t = PH_TYPES[type ?? 'body'] ?? 'body';
  return (idx !== undefined ? layout.placeholders.find((p) => p.idx === idx && (p.type === t || t === 'body')) : undefined) ?? layout.placeholders.find((p) => p.type === t) ?? (t === 'subtitle' ? layout.placeholders.find((p) => p.type === 'body') : undefined);
}

interface TreeContext {
  zip: JSZip;
  master: CorporateMaster;
  layout: LayoutDef | undefined;
  /** Relationships of the part holding the tree (pictures). */
  relById: Map<string, Rel>;
  /** "Slide 3" etc., prefixed to warnings. */
  where: string;
  media: Map<string, ConvertedMedia>;
  warnings: string[];
  stats: ConvertResult['stats'];
}

/** A DrawingML shape tree (slide `p:spTree`, clipboard locked canvas…) → canonical elements. */
async function convertTree(tree: X | undefined, ctx: TreeContext): Promise<SlideElement[]> {
  const { zip, master, layout, relById, where, media, warnings, stats } = ctx;
  const elements: SlideElement[] = [];
  const taken = new Set<string>();
  /** OOXML shape id → element id, for connectors. */
  const byShapeId = new Map<string, string>();
  const idFor = (preferred: string, kind: string) => {
    let base = preferred.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || kind;
    if (!/^[a-z0-9]/.test(base)) base = `${kind}-${base}`;
    let id = base;
    for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
    taken.add(id);
    return id;
  };
  const push = (raw: Record<string, unknown>, shapeId: string | undefined) => {
    if (!raw.name || String(raw.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') === raw.id) delete raw.name;
    const r = SlideElement.safeParse(raw);
    if (!r.success) {
      stats.skipped++;
      warnings.push(`${where} : ${tr('élément ignoré', 'element skipped')} « ${String(raw.name ?? raw.id)} » (${r.error.issues[0]?.path.join('.')} : ${r.error.issues[0]?.message})`);
      return;
    }
    elements.push(r.data);
    if (shapeId) byShapeId.set(shapeId, r.data.id);
    stats.elements++;
  };
  const pendingConnectors: { raw: Record<string, unknown>; st?: [string, number]; end?: [string, number]; shapeId?: string }[] = [];
  let bodyTaken = false;

  const walk = async (tree: X | undefined, f: Frame): Promise<void> => {
    for (const n of kids(tree)) {
      const tag = tagOf(n);
      if (tag === 'mc:AlternateContent') {
        await walk(child(n, 'mc:Fallback') ?? child(n, 'mc:Choice'), f);
        continue;
      }
      const nv = child(n, tag === 'p:sp' ? 'p:nvSpPr' : tag === 'p:pic' ? 'p:nvPicPr' : tag === 'p:cxnSp' ? 'p:nvCxnSpPr' : tag === 'p:graphicFrame' ? 'p:nvGraphicFramePr' : 'p:nvGrpSpPr');
      const cNvPr = child(nv, 'p:cNvPr');
      const name = attr(cNvPr, 'name') ?? '';
      const shapeId = attr(cNvPr, 'id');
      const hidden = attr(cNvPr, 'hidden') === '1' ? { hidden: true } : {};
      const ph = path(nv, 'p:nvPr', 'p:ph');
      const phType = attr(ph, 'type');
      if (ph && SKIPPED_PH.has(phType ?? '')) continue; // footer, date and number come from the master
      const spPr = child(n, 'p:spPr');

      if (tag === 'p:grpSp') {
        const gx = path(n, 'p:grpSpPr', 'a:xfrm');
        const off = child(gx, 'a:off'), ext = child(gx, 'a:ext'), chOff = child(gx, 'a:chOff'), chExt = child(gx, 'a:chExt');
        if (!off || !ext || !chOff || !chExt) {
          await walk(n, f);
          continue;
        }
        const sx = Number(attr(chExt, 'cx')) ? Number(attr(ext, 'cx')) / Number(attr(chExt, 'cx')) : 1;
        const sy = Number(attr(chExt, 'cy')) ? Number(attr(ext, 'cy')) / Number(attr(chExt, 'cy')) : 1;
        const o = f.map(emu(attr(off, 'x')), emu(attr(off, 'y')));
        const cx = emu(attr(chOff, 'x')), cy = emu(attr(chOff, 'y'));
        await walk(n, { map: (x, y) => ({ x: o.x + (x - cx) * sx * f.sx, y: o.y + (y - cy) * sy * f.sy }), sx: sx * f.sx, sy: sy * f.sy });
        continue;
      }

      if (tag === 'p:sp') {
        const g = geometry(child(spPr, 'a:xfrm'), f);
        const phDef = ph ? matchPlaceholder(layout, phType, attr(ph, 'idx')) : undefined;
        const text = textBody(child(n, 'p:txBody'), master, phDef);
        const hasText = !!text?.paragraphs.some((p) => p.runs.length);
        const prst = attr(child(spPr, 'a:prstGeom'), 'prst');
        const fill = colorOf(spPr && (child(spPr, 'a:solidFill') || child(spPr, 'a:noFill')) ? spPr : undefined, master);
        const line = outline(child(spPr, 'a:ln'), master);
        if (child(spPr, 'a:custGeom')) warnings.push(`${where} : ${tr('forme libre', 'freeform shape')} « ${name} » ${tr('convertie en rectangle', 'converted to a rectangle')}`);
        if (child(spPr, 'a:gradFill')) warnings.push(`${where} : ${tr('dégradé de', 'gradient of')} « ${name} » ${tr('non repris', 'not kept')}`);
        if (ph) {
          if (!hasText) continue; // empty placeholder: the layout shows it
          const key = phDef?.key;
          const kind = phDef?.type === 'title' ? 'title' : phDef?.type === 'subtitle' ? 'subtitle' : phDef?.type === 'body' && !bodyTaken ? 'body' : (key ?? 'text');
          if (kind === 'body') bodyTaken = true;
          if (!phDef && !g) warnings.push(`${where} : ${tr('espace réservé sans équivalent dans la disposition', 'placeholder with no match in the layout')} « ${name} »`);
          push(inheritedStripped({ id: idFor(kind, 'text'), type: 'text', ...(key ? { placeholder: key } : {}), ...(g ? { x: g.x, y: g.y, w: g.w, h: g.h, ...(g.rotation ? { rotation: g.rotation } : {}) } : {}), ...hidden, paragraphs: text!.paragraphs, ...styleOf({ ...text!.style, ...(fill && fill !== 'none' ? { fill } : {}), ...line }) }, phDef, master), shapeId);
          continue;
        }
        if (!g) continue;
        const isTextBox = attr(child(nv, 'p:cNvSpPr'), 'txBox') === '1' || ((!prst || prst === 'rect') && (!fill || fill === 'none') && !line.line && hasText);
        const geom = { x: g.x, y: g.y, w: g.w, h: g.h, ...(g.rotation ? { rotation: g.rotation } : {}) };
        if (isTextBox) {
          push({ id: idFor(name, 'text'), type: 'text', name, ...geom, ...hidden, paragraphs: text?.paragraphs ?? [], ...styleOf({ ...(text?.style ?? {}), ...(fill && fill !== 'none' ? { fill } : {}), ...line }) }, shapeId);
          continue;
        }
        const shape = prst && SHAPES.has(prst) ? prst : 'rect';
        // Shapes center their text by default.
        if (text?.style.align === 'center') delete text.style.align;
        if (text?.style.valign === 'middle') delete text.style.valign;
        if (prst && !SHAPES.has(prst)) warnings.push(`${where} : ${tr('forme', 'shape')} « ${prst} » ${tr('remplacée par un rectangle', 'replaced by a rectangle')} (« ${name} »)`);
        // Preset adjustments (avLst): roundRect / snip1Rect corners become the radius, the rest is kept as is.
        const gds = all(path(spPr, 'a:prstGeom', 'a:avLst'), 'a:gd').map((gd) => [attr(gd, 'name') ?? '', Number(/val (-?\d+)/.exec(attr(gd, 'fmla') ?? '')?.[1])] as const).filter(([k, v]) => /^adj\d?$/.test(k) && Number.isFinite(v));
        const corner = (shape === 'roundRect' || shape === 'snip1Rect') && gds.find(([k]) => k === 'adj');
        const adjust = !corner && gds.length ? { adjust: Object.fromEntries(gds) } : {};
        if (corner) line.radius = round4((corner[1] / 100000) * Math.min(g.w, g.h));
        push({
          id: idFor(name, 'shape'), type: 'shape', name, shape, ...geom, ...hidden, ...adjust,
          ...(g.flipH ? { flipH: true } : {}), ...(g.flipV ? { flipV: true } : {}),
          ...(hasText ? { paragraphs: text!.paragraphs } : {}),
          ...styleOf({ ...(text?.style ?? {}), ...(fill ? { fill } : {}), ...line }),
        }, shapeId);
        continue;
      }

      if (tag === 'p:pic') {
        const g = geometry(child(spPr, 'a:xfrm'), f);
        const blip = path(n, 'p:blipFill', 'a:blip');
        const rel = relById.get(attr(blip, 'r:embed') ?? '');
        if (!rel || rel.external) {
          stats.skipped++;
          warnings.push(`${where} : ${tr('image liée (externe) ignorée', 'linked (external) picture skipped')} « ${name} »`);
          continue;
        }
        const file = zip.file(rel.target);
        const ext = posix.extname(rel.target).toLowerCase();
        if (!file || !/^\.(png|jpe?g|gif|svg|bmp|webp|emf|wmf)$/.test(ext)) {
          stats.skipped++;
          warnings.push(`${where} : ${tr('image illisible', 'unreadable picture')} « ${name} »`);
          continue;
        }
        if (/^\.(emf|wmf)$/.test(ext)) warnings.push(`${where} : ${tr('image EMF/WMF', 'EMF/WMF picture')} « ${name} » ${tr(': aperçu limité dans l’éditeur', ': limited preview in the editor')}`);
        if (attr(path(n, 'p:blipFill', 'a:srcRect'), 'l') || attr(path(n, 'p:blipFill', 'a:srcRect'), 't')) warnings.push(`${where} : ${tr('rognage de', 'crop of')} « ${name} » ${tr('non repris', 'not kept')}`);
        const mediaName = posix.basename(rel.target);
        if (!media.has(mediaName)) media.set(mediaName, { name: mediaName, data: await file.async('uint8array') });
        const phDef = ph ? matchPlaceholder(layout, phType ?? 'pic', attr(ph, 'idx')) : undefined;
        const descr = attr(cNvPr, 'descr');
        push(inheritedStripped({ id: idFor(name, 'image'), type: 'image', name, src: `media/${mediaName}`, ...(descr ? { alt: descr } : {}), ...(phDef ? { placeholder: phDef.key } : {}), ...(g ? { x: g.x, y: g.y, w: g.w, h: g.h, ...(g.rotation ? { rotation: g.rotation } : {}) } : {}), ...hidden, ...styleOf(outline(child(spPr, 'a:ln'), master)) }, phDef, master), shapeId);
        stats.images++;
        continue;
      }

      if (tag === 'p:cxnSp') {
        const g = geometry(child(spPr, 'a:xfrm'), f);
        if (!g) continue;
        const c = child(nv, 'p:cNvCxnSpPr');
        const st = child(c, 'a:stCxn'), en = child(c, 'a:endCxn');
        const prst = attr(child(spPr, 'a:prstGeom'), 'prst') ?? 'straightConnector1';
        const style = outline(child(spPr, 'a:ln'), master);
        pendingConnectors.push({
          raw: { id: idFor(name, 'connector'), name, route: ROUTE(prst), ...hidden, g, ...styleOf(style) },
          st: st ? [attr(st, 'id') ?? '', Number(attr(st, 'idx') ?? 0)] : undefined,
          end: en ? [attr(en, 'id') ?? '', Number(attr(en, 'idx') ?? 0)] : undefined,
          shapeId,
        });
        continue;
      }

      if (tag === 'p:graphicFrame') {
        const data = path(n, 'a:graphic', 'a:graphicData');
        const tbl = child(data, 'a:tbl');
        const g = geometry(child(n, 'p:xfrm') ?? child(n, 'a:xfrm'), f);
        if (!tbl || !g) {
          stats.skipped++;
          const uri = attr(data, 'uri') ?? '';
          warnings.push(`${where} : ${/chart/.test(uri) ? tr('graphique', 'chart') : /diagram/.test(uri) ? 'SmartArt' : tr('objet', 'object')} « ${name} » ${tr('non converti', 'not converted')}`);
          continue;
        }
        push({ id: idFor(name, 'table'), type: 'table', name, x: g.x, y: g.y, w: g.w, h: g.h, ...hidden, ...tableOf(tbl, master) }, shapeId);
        stats.tables++;
        continue;
      }

      if (tag === 'p:contentPart' || tag === 'p:extLst' || tag.startsWith('p:nv') || tag === 'p:grpSpPr') continue;
      if (tag) {
        stats.skipped++;
        warnings.push(`${where} : ${tr('élément non pris en charge', 'unsupported element')} <${tag}> « ${name} »`);
      }
    }
  };
  await walk(tree, IDENTITY);

  // Connectors last: they need the element ids of both ends. Unattached ones become lines.
  for (const c of pendingConnectors) {
    const g = c.raw.g as NonNullable<ReturnType<typeof geometry>>;
    delete c.raw.g;
    const from = c.st && byShapeId.get(c.st[0]), to = c.end && byShapeId.get(c.end[0]);
    const side = (idx: number, elId: string) => {
      const e = elements.find((x) => x.id === elId);
      return e && (e.type === 'text' || e.type === 'image' || (e.type === 'shape' && ['rect', 'roundRect', 'snip1Rect', 'flowChartTerminator'].includes(e.shape))) ? RECT_SIDES[idx] : undefined;
    };
    if (from && to && from !== to) {
      const fs = side(c.st![1], from), ts = side(c.end![1], to);
      push({ ...c.raw, type: 'connector', from, to, ...(fs ? { fromSide: fs } : {}), ...(ts ? { toSide: ts } : {}) }, c.shapeId);
    } else {
      push({ ...c.raw, type: 'shape', shape: 'line', id: c.raw.id, x: g.x, y: g.y, w: g.w, h: g.h, ...(g.flipH !== g.flipV ? { flipV: true } : {}) }, c.shapeId);
    }
  }

  return elements;
}

/**
 * PowerPoint's clipboard drawing ("Art::GVML ClipFormat": a small OOXML package whose
 * `clipboard/drawings/drawing1.xml` holds the copied shapes in a locked canvas) → elements, with
 * the same conversion as slides. Locked-canvas shapes use `a:` names: they are mapped to `p:`.
 */
export async function convertClipboardDrawing(bytes: Uint8Array, master: CorporateMaster): Promise<{ elements: SlideElement[]; media: ConvertedMedia[]; warnings: string[] }> {
  const zip = await loadZipSafely(bytes);
  const part = Object.keys(zip.files).find((n) => /drawings\/drawing\d*\.xml$/.test(n));
  if (!part) return { elements: [], media: [], warnings: [tr('Presse-papiers PowerPoint sans dessin', 'PowerPoint clipboard without a drawing')] };
  let xml = (await readText(zip, part)) ?? '';
  xml = xml
    .replace(/<a:txSp>\s*<a:txBody>([\s\S]*?)<\/a:txBody>[\s\S]*?<\/a:txSp>/g, '<p:txBody>$1</p:txBody>')
    .replace(/<(\/?)a:(sp|nvSpPr|cNvSpPr|spPr|pic|nvPicPr|cNvPicPr|blipFill|grpSp|nvGrpSpPr|cNvGrpSpPr|grpSpPr|cxnSp|nvCxnSpPr|cNvCxnSpPr|graphicFrame|nvGraphicFramePr|cNvGraphicFramePr|cNvPr)([\s>/])/g, '<$1p:$2$3');
  const find = (nodes: X[]): X | undefined => {
    for (const n of nodes) {
      if (tagOf(n) === 'lc:lockedCanvas') return n;
      const k = find(kids(n));
      if (k) return k;
    }
    return undefined;
  };
  const canvas = find(parser.parse(xml) as X[]);
  const relById = new Map((await readRels(zip, part)).map((r) => [r.id, r]));
  const media = new Map<string, ConvertedMedia>();
  const warnings: string[] = [];
  const stats = { slides: 0, elements: 0, images: 0, tables: 0, skipped: 0 };
  // The canvas' own group transform is the copied shapes' bounding box: children keep slide positions.
  const elements = await convertTree(canvas ? { root: kids(canvas).filter((k) => tagOf(k) !== 'p:nvGrpSpPr' && tagOf(k) !== 'p:grpSpPr') } : undefined, { zip, master, layout: undefined, relById, where: tr('Presse-papiers', 'Clipboard'), media, warnings, stats });
  return { elements, media: [...media.values()], warnings };
}

export async function convertSlides(zip: JSZip, master: CorporateMaster): Promise<ConvertResult> {
  const warnings: string[] = [];
  const media = new Map<string, ConvertedMedia>();
  const stats = { slides: 0, elements: 0, images: 0, tables: 0, skipped: 0 };
  const presXml = parser.parse((await readText(zip, 'ppt/presentation.xml')) ?? '') as X[];
  const pres = presXml.find((n) => tagOf(n) === 'p:presentation');
  const presRels = new Map((await readRels(zip, 'ppt/presentation.xml')).map((r) => [r.id, r.target]));
  const slideParts = all(child(pres, 'p:sldIdLst'), 'p:sldId').map((s) => presRels.get(attr(s, 'r:id') ?? '')).filter((p): p is string => !!p);
  const core = (await readText(zip, 'docProps/core.xml')) ?? '';
  const title = decodeXml(/<dc:title>([^<]*)<\/dc:title>/.exec(core)?.[1]?.trim() ?? '');
  const author = decodeXml(/<dc:creator>([^<]*)<\/dc:creator>/.exec(core)?.[1]?.trim() ?? '');

  const slides: SlideNode[] = [];
  for (const [si, part] of slideParts.entries()) {
    const rels = await readRels(zip, part);
    const relById = new Map(rels.map((r) => [r.id, r]));
    const layoutPart = rels.find((r) => r.type === 'slideLayout')?.target;
    const layout = master.layouts.find((l) => l.sourcePart === layoutPart) ?? findLayout(master, 'content') ?? master.layouts[0];
    const doc = (parser.parse((await readText(zip, part)) ?? '') as X[]).find((n) => tagOf(n) === 'p:sld');
    const slideId = `slide-${si + 1}`;
    const where = tr(`Diapositive ${si + 1}`, `Slide ${si + 1}`);
    const elements = await convertTree(path(doc, 'p:cSld', 'p:spTree'), { zip, master, layout, relById, where, media, warnings, stats });
    if (child(path(doc, 'p:cSld'), 'p:bg')) warnings.push(`${where} : ${tr('arrière-plan propre à la diapositive non repris (celui de la disposition s’applique)', 'slide-specific background not kept (the layout one applies)')}`);

    // Speaker notes: the body placeholder of the notes slide.
    let notes: string | undefined;
    const notesPart = rels.find((r) => r.type === 'notesSlide')?.target;
    if (notesPart) {
      const nd = (parser.parse((await readText(zip, notesPart)) ?? '') as X[]).find((x) => tagOf(x) === 'p:notes');
      const body = all(path(nd, 'p:cSld', 'p:spTree'), 'p:sp').find((sp) => attr(path(sp, 'p:nvSpPr', 'p:nvPr', 'p:ph'), 'type') === 'body');
      notes = all(child(body, 'p:txBody'), 'a:p').map((p) => kids(p).filter((k) => tagOf(k) === 'a:r').map((r) => textOf(child(r, 'a:t'))).join('')).join('\n').trim() || undefined;
    }
    slides.push({ id: slideId, layout: layout ? (layout.aliases[0] ?? layout.id) : 'content', ...(notes ? { notes } : {}), ...(attr(doc, 'show') === '0' ? { hidden: true } : {}), elements });
    stats.slides++;
  }

  return {
    doc: {
      version: '1',
      metadata: { title: title || tr('Présentation importée', 'Imported presentation'), ...(author ? { author } : {}) },
      masterRef: 'corporate',
      themeRef: 'default',
      dimensions: master.dimensions,
      slides,
    },
    media: [...media.values()],
    warnings,
    stats,
  };
}

/** Only non-empty styles are written. */
function styleOf(s: ElementStyle): { style?: ElementStyle } {
  const clean = Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined)) as ElementStyle;
  return Object.keys(clean).length ? { style: clean } : {};
}

function tableOf(tbl: X, master: CorporateMaster) {
  const cols = all(child(tbl, 'a:tblGrid'), 'a:gridCol').map((c) => Number(attr(c, 'w') ?? 1));
  const trs = all(tbl, 'a:tr');
  const rows: string[][] = [];
  const cellStyles: (CellStyle | null)[][] = [];
  for (const r of trs) {
    const row: string[] = [], styles: (CellStyle | null)[] = [];
    for (const tc of all(r, 'a:tc')) {
      const merged = attr(tc, 'hMerge') === '1' || attr(tc, 'vMerge') === '1';
      row.push(merged ? '' : all(child(tc, 'a:txBody'), 'a:p').map((p) => kids(p).filter((k) => tagOf(k) === 'a:r' || tagOf(k) === 'a:fld').map((k) => textOf(child(k, 'a:t'))).join('')).join(' ').trim());
      const pr = child(tc, 'a:tcPr');
      const s: CellStyle = {};
      const fill = colorOf(pr && (child(pr, 'a:solidFill') || child(pr, 'a:noFill')) ? pr : undefined, master);
      if (fill) s.fill = fill as CellStyle['fill'];
      const ln = child(pr, 'a:lnB') ?? child(pr, 'a:lnT') ?? child(pr, 'a:lnL');
      if (ln) {
        const o = outline(ln, master);
        if (o.line) s.line = o.line as CellStyle['line'];
        if (o.lineWidth !== undefined) s.lineWidth = Math.min(20, o.lineWidth);
        if (o.dash) s.dash = o.dash;
      }
      const rPr = path(child(tc, 'a:txBody'), 'a:p', 'a:r', 'a:rPr');
      if (attr(rPr, 'b') === '1') s.bold = true;
      const color = colorOf(child(rPr, 'a:solidFill') ? rPr : undefined, master);
      if (color && color !== 'none') s.color = color as CellStyle['color'];
      styles.push(Object.keys(s).length ? s : null);
    }
    rows.push(row);
    cellStyles.push(styles);
  }
  // What the editor draws anyway is not repeated per cell: the grid border, the body text color
  // and the corporate header band (accent fill, light bold text on the first row).
  const grid = 'theme.dk1.lighter60';
  for (const row of cellStyles) for (const s of row) {
    if (!s) continue;
    if (s.line === grid && (s.lineWidth ?? 0.5) === 0.5 && !s.dash) (delete s.line, delete s.lineWidth);
    if (s.color === 'theme.dk1') delete s.color;
  }
  const band = (s: CellStyle | null) => s?.fill === 'theme.accent1' && s.color === 'theme.lt1' && s.bold;
  const header = attr(child(tbl, 'a:tblPr'), 'firstRow') === '1' || (cellStyles[0]?.length ? cellStyles[0].every(band) : false);
  if (header) for (const s of cellStyles[0] ?? []) if (band(s)) (delete s!.fill, delete s!.color, delete s!.bold);
  const clean = cellStyles.map((r) => r.map((s) => (s && Object.keys(s).length ? s : null)));
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0) || 1;
  const heights = trs.map((r) => Number(attr(r, 'h') ?? 1) || 1);
  const even = (a: number[]) => a.every((x) => Math.abs(x - a[0]!) < 1e-3 * a[0]!);
  return {
    rows: rows.length ? rows : [['']],
    ...(header ? {} : { header: false }),
    ...(even(cols) ? {} : { colWidths: cols.map((c) => round4(c / sum(cols))).map((x) => x || 0.01) }),
    ...(even(heights) ? {} : { rowHeights: heights.map((h) => round4(h / sum(heights))).map((x) => x || 0.01) }),
    ...(clean.some((r) => r.some(Boolean)) ? { cellStyles: clean } : {}),
  };
}
