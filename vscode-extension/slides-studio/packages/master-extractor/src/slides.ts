import type JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { posix } from 'node:path';
import {
  findLayout,
  mergeRuns,
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
import { cornerRadius, readRels, readText, type Rel } from './ooxml.js';
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

/** Master plus, for a clipboard drawing, the theme of the presentation it was copied from. */
type ColorMaster = CorporateMaster & { sourceTheme?: Record<string, string>; sourceFonts?: { heading: string; body: string } };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = [0, 2, 4].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255) as [number, number, number];
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function fromHsl([h, s, l]: [number, number, number]): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}
/** DrawingML color transforms (lumMod / lumOff / satMod in HSL, tint / shade towards white / black). */
function transformed(hex: string, color: X): string {
  let [h, sat, l] = toHsl(hex);
  let rgb = hex;
  for (const k of kids(color)) {
    const v = Number(attr(k, 'val') ?? 100000) / 100000;
    const t = tagOf(k);
    if (t === 'a:lumMod') l = clamp01(l * v);
    else if (t === 'a:lumOff') l = clamp01(l + v);
    else if (t === 'a:satMod') sat = clamp01(sat * v);
    else continue;
    rgb = fromHsl([h, sat, l]);
  }
  for (const k of kids(color)) {
    const t = tagOf(k), v = Number(attr(k, 'val') ?? 100000) / 100000;
    if (t !== 'a:tint' && t !== 'a:shade') continue;
    rgb = [0, 2, 4].map((o) => {
      const c = parseInt(rgb.slice(o, o + 2), 16);
      return Math.round(t === 'a:tint' ? c + (255 - c) * (1 - v) : c * v).toString(16).padStart(2, '0');
    }).join('').toUpperCase();
  }
  return rgb;
}

/** The color element of a holder (`a:solidFill`, `a:ln`, a gradient stop or the color itself). */
function colorNode(holder: X | undefined): X | undefined {
  const fill = child(holder, 'a:solidFill') ?? holder;
  return ['a:srgbClr', 'a:schemeClr', 'a:sysClr', 'a:prstClr', 'a:scrgbClr', 'a:hslClr'].map((t) => child(fill, t)).find(Boolean);
}

/**
 * `a:solidFill` (or any color holder) → color token; `undefined` when absent, `none` for `a:noFill`.
 * The color is computed exactly (theme of the source presentation, color transforms) and written as
 * a theme token when it is one of the master's colors or tints, as a literal otherwise.
 */
function colorOf(holder: X | undefined, master: ColorMaster): string | undefined {
  if (!holder) return undefined;
  if (child(holder, 'a:noFill')) return 'none';
  const c = colorNode(holder);
  if (!c) return undefined;
  const t = tagOf(c);
  let base: string | undefined;
  if (t === 'a:srgbClr') base = (attr(c, 'val') ?? '000000').toUpperCase();
  else if (t === 'a:sysClr') base = (attr(c, 'lastClr') ?? '000000').toUpperCase();
  else if (t === 'a:prstClr') base = PRESET[attr(c, 'val') ?? ''] ?? '000000';
  else if (t === 'a:scrgbClr') base = ['r', 'g', 'b'].map((k) => Math.round(255 * clamp01(Number(attr(c, k) ?? 0) / 100000)).toString(16).padStart(2, '0')).join('').toUpperCase();
  else if (t === 'a:schemeClr') {
    const slot = SCHEME[attr(c, 'val') ?? ''];
    if (!slot) return undefined;
    const own = master.theme.colors[slot]?.toUpperCase();
    const src = master.sourceTheme?.[slot]?.toUpperCase();
    // Same theme color in both presentations, untransformed: the token itself.
    if (!kids(c).some((k) => ['a:lumMod', 'a:lumOff', 'a:tint', 'a:shade', 'a:satMod'].includes(tagOf(k))) && (!src || src === own)) return `theme.${slot}`;
    base = src ?? own;
  }
  if (!base) return undefined;
  return themeToken(transformed(base, c), master);
}

/** Fill transparency (0–100) from the color's `a:alpha`. */
function alphaOf(holder: X | undefined): number | undefined {
  const a = attr(child(colorNode(holder), 'a:alpha'), 'val');
  return a === undefined ? undefined : Math.round(100 - Number(a) / 1000);
}

/** A literal color that is (nearly exactly) a theme color or tint reads back as its token. */
function themeToken(hex: string, master: CorporateMaster): string {
  const near = (v: string) => [0, 2, 4].every((k) => Math.abs(parseInt(v.slice(k, k + 2), 16) - parseInt(hex.slice(k, k + 2), 16)) <= 2);
  for (const [slot, v] of Object.entries(master.theme.colors)) if (near(v.toUpperCase())) return `theme.${slot}`;
  for (const [slot, variants] of Object.entries(master.theme.palette)) for (const [k, v] of Object.entries(variants)) if (k !== 'base' && near(v.toUpperCase())) return `theme.${slot}.${k}`;
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

const ALIGN = { l: 'left', ctr: 'center', r: 'right', just: 'justify', dist: 'justify' } as const;

/** Run format of an `a:rPr` / `a:defRPr` (only what it states). */
function runFormat(rPr: X | undefined, master: ColorMaster): Omit<TextRun, 'text'> {
  const r: Omit<TextRun, 'text'> = {};
  if (!rPr) return r;
  const on = (k: string) => attr(rPr, k) === '1' || attr(rPr, k) === 'true';
  if (on('b')) r.bold = true;
  if (on('i')) r.italic = true;
  const u = attr(rPr, 'u');
  if (u && u !== 'none') r.underline = true;
  const st = attr(rPr, 'strike');
  if (st && st !== 'noStrike') r.strike = true;
  const sz = attr(rPr, 'sz');
  if (sz) r.size = Math.min(400, Math.max(4, Number(sz) / 100));
  const cap = attr(rPr, 'cap');
  if (cap === 'small' || cap === 'all') r.caps = cap;
  const base = Number(attr(rPr, 'baseline') ?? 0);
  if (base > 0) r.baseline = 'super';
  else if (base < 0) r.baseline = 'sub';
  const color = child(rPr, 'a:solidFill') ? colorOf(rPr, master) : undefined;
  if (color && color !== 'none') r.color = color as TextRun['color'];
  const hl = child(rPr, 'a:highlight') ? colorOf(child(rPr, 'a:highlight'), master) : undefined;
  if (hl && hl !== 'none') r.highlight = hl as TextRun['highlight'];
  const face = attr(child(rPr, 'a:latin'), 'typeface');
  // Theme fonts stay theme fonts, unless the source presentation's differ from the master's.
  const src = master.sourceFonts;
  if (face?.startsWith('+mj')) r.font = src && src.heading !== master.theme.fonts.heading ? src.heading : 'theme.heading';
  else if (face?.startsWith('+mn')) r.font = src && src.body !== master.theme.fonts.body ? src.body : 'theme.body';
  else if (face) r.font = face;
  return r;
}

const RUN_FIELDS = ['size', 'color', 'font'] as const;
const SAME = <T,>(xs: T[]) => xs.length > 0 && xs.every((x) => x === xs[0]);

function textBody(body: X | undefined, master: ColorMaster, ph: PlaceholderDef | undefined): TextInfo | null {
  if (!body) return null;
  const paragraphs: Paragraph[] = [];
  let bullet: string | undefined;
  // Defaults of the text body's own list style (level 1), as PowerPoint applies them.
  const lst = runFormat(path(body, 'a:lstStyle', 'a:lvl1pPr', 'a:defRPr'), master);
  for (const p of all(body, 'a:p')) {
    const pPr = child(p, 'a:pPr');
    const level = Number(attr(pPr, 'lvl') ?? 0);
    const para: Paragraph = { runs: [] };
    if (level) para.level = Math.min(4, level);
    // Own alignment, else the text body's list style for the level (text boxes often center there).
    const algn = (attr(pPr, 'algn') ?? attr(path(body, 'a:lstStyle', `a:lvl${level + 1}pPr`), 'algn')) as keyof typeof ALIGN | undefined;
    if (algn && ALIGN[algn]) para.align = ALIGN[algn];
    const pts = (tag: string) => {
      const v = attr(path(pPr, tag, 'a:spcPts'), 'val');
      return v === undefined ? undefined : Math.min(400, Number(v) / 100);
    };
    const before = pts('a:spcBef'), after = pts('a:spcAft');
    if (before !== undefined) para.spaceBefore = before;
    if (after !== undefined) para.spaceAfter = after;
    const lnPct = attr(path(pPr, 'a:lnSpc', 'a:spcPct'), 'val');
    if (lnPct) para.lineSpacing = Math.min(4, Math.max(0.5, Math.round(Number(lnPct) / 1000) / 100));
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
    const paraDefaults = { ...lst, ...runFormat(child(pPr, 'a:defRPr'), master) };
    // A line break inside a paragraph splits it in two (same list level, bullet and format).
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
      const text = textOf(child(k, 'a:t'));
      if (!text) continue;
      para.runs.push({ text, ...paraDefaults, ...runFormat(child(k, 'a:rPr'), master) });
    }
    // A space between two runs of the same format takes it (PowerPoint often leaves it unformatted).
    const fmt = (r: TextRun | undefined) => (r ? JSON.stringify({ ...r, text: '' }) : '');
    para.runs = mergeRuns(para.runs.map((r, i, a) => (/^\s+$/.test(r.text) && a[i - 1] && fmt(a[i - 1]) === fmt(a[i + 1]) ? { ...a[i - 1]!, text: r.text } : r)));
    paragraphs.push(para);
  }
  // Drop trailing empty paragraphs PowerPoint keeps after the last line.
  while (paragraphs.length > 1 && !paragraphs[paragraphs.length - 1]!.runs.length) paragraphs.pop();
  const style: ElementStyle = {};
  // What every run says becomes the element's style (the deck stays short); the rest stays on runs.
  const runs = paragraphs.flatMap((p) => p.runs);
  for (const k of RUN_FIELDS) {
    const vs = runs.map((r) => r[k]);
    if (!SAME(vs) || vs[0] === undefined) continue;
    if (k === 'size') style.fontSize = vs[0] as number;
    else if (k === 'color') style.color = vs[0] as ElementStyle['color'];
    else style.fontFace = vs[0] as string;
    for (const r of runs) delete r[k];
  }
  const aligns = paragraphs.map((p) => p.align);
  if (SAME(aligns) && aligns[0]) {
    style.align = aligns[0];
    for (const p of paragraphs) delete p.align;
  }
  const spacings = paragraphs.map((p) => p.lineSpacing);
  if (SAME(spacings) && spacings[0] !== undefined) {
    style.lineSpacing = spacings[0];
    for (const p of paragraphs) delete p.lineSpacing;
  }
  const bodyPr = child(body, 'a:bodyPr');
  const anchor = attr(bodyPr, 'anchor');
  if (anchor) style.valign = anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : 'top';
  // Insets (EMU) when the text body states them; PowerPoint defaults are 0.1 in / 0.05 in.
  const ins = ['tIns', 'rIns', 'bIns', 'lIns'].map((k) => attr(bodyPr, k));
  if (ins.some((v) => v !== undefined)) style.margin = ins.map((v, i) => (v === undefined ? (i % 2 ? 0.1 : 0.05) : Math.min(10, emu(v)))) as ElementStyle['margin'];
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

/** `a:custGeom` → freeform paths (SVG M / L / C / Q / Z in each path's coordinates); arcs become cubic curves. */
export function customGeometry(cg: X, boxW: number, boxH: number): { paths: { w: number; h: number; d: string; fill?: boolean; stroke?: boolean }[] } | null {
  // Guides of pasted freeforms are constants (`val N`); anything else resolves to 0.
  const guides = new Map(all(child(cg, 'a:gdLst'), 'a:gd').map((gd) => [attr(gd, 'name') ?? '', Number(/^val (-?[\d.]+)$/.exec(attr(gd, 'fmla') ?? '')?.[1] ?? 0)]));
  const v = (x: string | undefined) => (x === undefined ? 0 : Number.isFinite(Number(x)) ? Number(x) : (guides.get(x) ?? 0));
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const paths: { w: number; h: number; d: string; fill?: boolean; stroke?: boolean }[] = [];
  for (const p of all(child(cg, 'a:pathLst'), 'a:path')) {
    const w = v(attr(p, 'w')) || Math.round(boxW * 914400), h = v(attr(p, 'h')) || Math.round(boxH * 914400);
    const d: string[] = [];
    let cx = 0, cy = 0;
    const pt = (n: X | undefined) => [v(attr(n, 'x')), v(attr(n, 'y'))] as const;
    for (const k of kids(p)) {
      const t = tagOf(k);
      const pts = all(k, 'a:pt').map(pt);
      if (t === 'a:moveTo' || t === 'a:lnTo') {
        [cx, cy] = pts[0] ?? [cx, cy];
        d.push(`${t === 'a:moveTo' ? 'M' : 'L'} ${r2(cx)} ${r2(cy)}`);
      } else if (t === 'a:cubicBezTo' && pts.length === 3) {
        d.push(`C ${pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join(' ')}`);
        [cx, cy] = pts[2]!;
      } else if (t === 'a:quadBezTo' && pts.length === 2) {
        d.push(`Q ${pts.map(([x, y]) => `${r2(x)} ${r2(y)}`).join(' ')}`);
        [cx, cy] = pts[1]!;
      } else if (t === 'a:arcTo') {
        const wR = v(attr(k, 'wR')), hR = v(attr(k, 'hR'));
        const st = (v(attr(k, 'stAng')) / 60000) * (Math.PI / 180), sw = (v(attr(k, 'swAng')) / 60000) * (Math.PI / 180);
        const ox = cx - wR * Math.cos(st), oy = cy - hR * Math.sin(st);
        const n = Math.max(1, Math.ceil(Math.abs(sw) / (Math.PI / 2)));
        for (let i = 0; i < n; i++) {
          const a1 = st + (sw * i) / n, a2 = st + (sw * (i + 1)) / n;
          const q = (4 / 3) * Math.tan((a2 - a1) / 4);
          const x1 = ox + wR * Math.cos(a1), y1 = oy + hR * Math.sin(a1), x4 = ox + wR * Math.cos(a2), y4 = oy + hR * Math.sin(a2);
          d.push(`C ${r2(x1 - q * wR * Math.sin(a1))} ${r2(y1 + q * hR * Math.cos(a1))} ${r2(x4 + q * wR * Math.sin(a2))} ${r2(y4 - q * hR * Math.cos(a2))} ${r2(x4)} ${r2(y4)}`);
          [cx, cy] = [x4, y4];
        }
      } else if (t === 'a:close') d.push('Z');
    }
    if (d.length) paths.push({ w, h, d: d.join(' '), ...(attr(p, 'fill') === 'none' ? { fill: false } : {}), ...(attr(p, 'stroke') === '0' || attr(p, 'stroke') === 'false' ? { stroke: false } : {}) });
  }
  return paths.length ? { paths } : null;
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
  const groupTaken = new Set<string>();
  const push = (raw: Record<string, unknown>, shapeId: string | undefined, group?: string) => {
    // PowerPoint groups stay groups (placeholders cannot be grouped).
    if (group && !raw.placeholder) raw.group = group;
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

  const walk = async (tree: X | undefined, f: Frame, group?: string): Promise<void> => {
    for (const n of kids(tree)) {
      const tag = tagOf(n);
      if (tag === 'mc:AlternateContent') {
        await walk(child(n, 'mc:Fallback') ?? child(n, 'mc:Choice'), f, group);
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
        // Nested group path; past 8 levels, members join the deepest one.
        let gid = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'group';
        if (!/^[a-z0-9]/.test(gid)) gid = `group-${gid}`;
        for (let i = 2; groupTaken.has(gid); i++) gid = `${gid.replace(/-\d+$/, '')}-${i}`;
        groupTaken.add(gid);
        const sub = group && group.split('/').length >= 8 ? group : group ? `${group}/${gid}` : gid;
        if (attr(gx, 'rot')) warnings.push(`${where} : ${tr('rotation du groupe', 'rotation of group')} « ${name} » ${tr('non reprise (ses éléments gardent la leur)', 'not kept (its elements keep their own)')}`);
        if (!off || !ext || !chOff || !chExt) {
          await walk(n, f, sub);
          continue;
        }
        const sx = Number(attr(chExt, 'cx')) ? Number(attr(ext, 'cx')) / Number(attr(chExt, 'cx')) : 1;
        const sy = Number(attr(chExt, 'cy')) ? Number(attr(ext, 'cy')) / Number(attr(chExt, 'cy')) : 1;
        const o = f.map(emu(attr(off, 'x')), emu(attr(off, 'y')));
        const cx = emu(attr(chOff, 'x')), cy = emu(attr(chOff, 'y'));
        await walk(n, { map: (x, y) => ({ x: o.x + (x - cx) * sx * f.sx, y: o.y + (y - cy) * sy * f.sy }), sx: sx * f.sx, sy: sy * f.sy }, sub);
        continue;
      }

      if (tag === 'p:sp') {
        const g = geometry(child(spPr, 'a:xfrm'), f);
        const phDef = ph ? matchPlaceholder(layout, phType, attr(ph, 'idx')) : undefined;
        const text = textBody(child(n, 'p:txBody'), master, phDef);
        const hasText = !!text?.paragraphs.some((p) => p.runs.length);
        const prst = attr(child(spPr, 'a:prstGeom'), 'prst');
        const grad = child(spPr, 'a:gradFill');
        // A gradient is approximated by its first stop (PowerPoint's dominant color).
        const fill = grad ? colorOf(child(child(grad, 'a:gsLst'), 'a:gs'), master) : colorOf(spPr && (child(spPr, 'a:solidFill') || child(spPr, 'a:noFill')) ? spPr : undefined, master);
        const t = alphaOf(child(spPr, 'a:solidFill') ? spPr : undefined);
        const alpha = t ? { transparency: t } : {};
        // Quick-styled shapes take their fill and text color from the theme references of `p:style`.
        const fillRef = path(n, 'p:style', 'a:fillRef');
        const styleFill = !fill && fillRef && attr(fillRef, 'idx') !== '0' ? colorOf(fillRef, master) : undefined;
        const fontRefC = colorOf(path(n, 'p:style', 'a:fontRef'), master);
        const fontRefColor = fontRefC && fontRefC !== 'none' ? { color: fontRefC as ElementStyle['color'] } : {};
        const line = outline(child(spPr, 'a:ln'), master);
        // Quick-styled shapes take their outline from the theme line the `p:style` references.
        const lnRef = path(n, 'p:style', 'a:lnRef');
        if (!line.line && lnRef && attr(lnRef, 'idx') !== '0' && !child(child(spPr, 'a:ln'), 'a:noFill')) {
          const c = colorOf(lnRef, master);
          if (c && c !== 'none') Object.assign(line, { line: c, ...(line.lineWidth ? {} : { lineWidth: 0.75 }) });
        }
        // Preset adjustments (avLst); a rounded text box or placeholder keeps its corner radius.
        const gds = all(path(spPr, 'a:prstGeom', 'a:avLst'), 'a:gd').map((gd) => [attr(gd, 'name') ?? '', Number(/val (-?\d+)/.exec(attr(gd, 'fmla') ?? '')?.[1])] as const).filter(([k, v]) => /^adj\d?$/.test(k) && Number.isFinite(v));
        const adjOf = gds.find(([k]) => k === 'adj')?.[1];
        if (prst === 'roundRect' && g) line.radius = cornerRadius(adjOf, g.w, g.h);
        const custom = child(spPr, 'a:custGeom') && g ? customGeometry(child(spPr, 'a:custGeom')!, g.w, g.h) : null;
        if (grad) warnings.push(`${where} : ${tr('dégradé de', 'gradient of')} « ${name} » ${tr('remplacé par sa couleur principale', 'replaced by its main color')}`);
        if (child(spPr, 'a:blipFill')) warnings.push(`${where} : ${tr('image de remplissage de', 'picture fill of')} « ${name} » ${tr('non reprise', 'not kept')}`);
        if (ph) {
          if (!hasText) continue; // empty placeholder: the layout shows it
          const key = phDef?.key;
          const kind = phDef?.type === 'title' ? 'title' : phDef?.type === 'subtitle' ? 'subtitle' : phDef?.type === 'body' && !bodyTaken ? 'body' : (key ?? 'text');
          if (kind === 'body') bodyTaken = true;
          if (!phDef && !g) warnings.push(`${where} : ${tr('espace réservé sans équivalent dans la disposition', 'placeholder with no match in the layout')} « ${name} »`);
          push(inheritedStripped({ id: idFor(kind, 'text'), type: 'text', ...(key ? { placeholder: key } : {}), ...(g ? { x: g.x, y: g.y, w: g.w, h: g.h, ...(g.rotation ? { rotation: g.rotation } : {}) } : {}), ...hidden, paragraphs: text!.paragraphs, ...styleOf({ ...text!.style, ...(fill && fill !== 'none' ? { fill, ...alpha } : {}), ...line }) }, phDef, master), shapeId);
          continue;
        }
        if (!g) continue;
        const isTextBox = !custom && (attr(child(nv, 'p:cNvSpPr'), 'txBox') === '1' || ((!prst || prst === 'rect') && (!fill || fill === 'none') && !styleFill && !line.line && hasText));
        const geom = { x: g.x, y: g.y, w: g.w, h: g.h, ...(g.rotation ? { rotation: g.rotation } : {}) };
        if (isTextBox) {
          push({ id: idFor(name, 'text'), type: 'text', name, ...geom, ...hidden, paragraphs: text?.paragraphs ?? [], ...styleOf({ ...fontRefColor, ...(text?.style ?? {}), ...(fill && fill !== 'none' ? { fill, ...alpha } : {}), ...line }) }, shapeId, group);
          continue;
        }
        // Presets without an editor drawing keep their name: PowerPoint gets them back exactly.
        const shape = custom ? 'custom' : prst && (SHAPES.has(prst) || /^[a-z][A-Za-z0-9]{1,40}$/.test(prst)) ? prst : 'rect';
        // Shapes center their text by default.
        if (text?.style.align === 'center') delete text.style.align;
        if (text?.style.valign === 'middle') delete text.style.valign;
        // roundRect / snip1Rect corners become the radius, other adjustments are kept as is.
        const corner = shape === 'roundRect' || shape === 'snip1Rect';
        const adjust = !corner && gds.length ? { adjust: Object.fromEntries(gds) } : {};
        if (shape === 'snip1Rect') line.radius = cornerRadius(adjOf, g.w, g.h);
        push({
          id: idFor(name, 'shape'), type: 'shape', name, shape, ...(custom ? { geometry: custom } : {}), ...geom, ...hidden, ...adjust,
          ...(g.flipH ? { flipH: true } : {}), ...(g.flipV ? { flipV: true } : {}),
          ...(hasText ? { paragraphs: text!.paragraphs } : {}),
          ...styleOf({ ...fontRefColor, ...(text?.style ?? {}), ...(fill ? { fill, ...alpha } : styleFill && styleFill !== 'none' ? { fill: styleFill } : {}), ...line }),
        }, shapeId, group);
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
        const src = path(n, 'p:blipFill', 'a:srcRect');
        const cut = (k: string) => Math.max(-1, Math.min(1, Number(attr(src, k) ?? 0) / 100000));
        const crop = src && ['l', 't', 'r', 'b'].some((k) => attr(src, k)) ? { crop: { l: cut('l'), t: cut('t'), r: cut('r'), b: cut('b') } } : {};
        const mediaName = posix.basename(rel.target);
        if (!media.has(mediaName)) media.set(mediaName, { name: mediaName, data: await file.async('uint8array') });
        const phDef = ph ? matchPlaceholder(layout, phType ?? 'pic', attr(ph, 'idx')) : undefined;
        const descr = attr(cNvPr, 'descr');
        push(inheritedStripped({ id: idFor(name, 'image'), type: 'image', name, src: `media/${mediaName}`, ...(descr ? { alt: descr } : {}), ...(phDef ? { placeholder: phDef.key } : {}), ...(g ? { x: g.x, y: g.y, w: g.w, h: g.h, ...(g.rotation ? { rotation: g.rotation } : {}) } : {}), ...crop, ...hidden, ...styleOf(outline(child(spPr, 'a:ln'), master)) }, phDef, master), shapeId, group);
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
          raw: { id: idFor(name, 'connector'), name, route: ROUTE(prst), ...hidden, g, prst, avLst: all(path(spPr, 'a:prstGeom', 'a:avLst'), 'a:gd').map((gd) => [attr(gd, 'name') ?? '', Number(/val (-?\d+)/.exec(attr(gd, 'fmla') ?? '')?.[1])] as const).filter(([k, v]) => /^adj\d?$/.test(k) && Number.isFinite(v)), ...styleOf(style), ...(group ? { group } : {}) },
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
        push({ id: idFor(name, 'table'), type: 'table', name, x: g.x, y: g.y, w: g.w, h: g.h, ...hidden, ...tableOf(tbl, master) }, shapeId, group);
        stats.tables++;
        continue;
      }

      if (tag === '#text' || tag === 'p:contentPart' || tag === 'p:extLst' || tag.startsWith('p:nv') || tag === 'p:grpSpPr') continue;
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
      // Unattached: the connector's own preset, geometry and flips, exactly where PowerPoint draws it.
      const prst = String(c.raw.prst);
      const bent = /^(bent|curved)Connector[2-5]$/.test(prst);
      const flips = bent ? { ...(g.flipH ? { flipH: true } : {}), ...(g.flipV ? { flipV: true } : {}) } : g.flipH !== g.flipV ? { flipV: true } : {};
      const adj = c.raw.avLst as [string, number][];
      push({ ...c.raw, type: 'shape', shape: bent ? prst : 'line', id: c.raw.id, x: g.x, y: g.y, w: g.w, h: g.h, ...(g.rotation ? { rotation: g.rotation } : {}), ...flips, ...(bent && adj.length ? { adjust: Object.fromEntries(adj) } : {}) }, c.shapeId);
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
  // The copied shapes' colors and fonts are those of the presentation they come from.
  const themePart = Object.keys(zip.files).find((n) => /theme\/theme\d*\.xml$/.test(n));
  const source = themePart ? sourceTheme((await readText(zip, themePart)) ?? '') : {};
  const m2: ColorMaster = { ...master, ...source };
  const relById = new Map((await readRels(zip, part)).map((r) => [r.id, r]));
  const media = new Map<string, ConvertedMedia>();
  const warnings: string[] = [];
  const stats = { slides: 0, elements: 0, images: 0, tables: 0, skipped: 0 };
  // The canvas' own group transform is the copied shapes' bounding box: children keep slide positions.
  const elements = await convertTree(canvas ? { root: kids(canvas).filter((k) => tagOf(k) !== 'p:nvGrpSpPr' && tagOf(k) !== 'p:grpSpPr') } : undefined, { zip, master: m2, layout: undefined, relById, where: tr('Presse-papiers', 'Clipboard'), media, warnings, stats });
  return { elements, media: [...media.values()], warnings };
}

/** Color scheme and fonts of a theme part (the presentation a clipboard drawing was copied from). */
function sourceTheme(xml: string): Pick<ColorMaster, 'sourceTheme' | 'sourceFonts'> {
  const theme = (parser.parse(xml) as X[]).find((n) => tagOf(n) === 'a:theme');
  const elements = child(theme, 'a:themeElements');
  const scheme = child(elements, 'a:clrScheme');
  const colors: Record<string, string> = {};
  for (const k of kids(scheme)) {
    const c = kids(k)[0];
    const hex = c && (tagOf(c) === 'a:srgbClr' ? attr(c, 'val') : tagOf(c) === 'a:sysClr' ? attr(c, 'lastClr') : undefined);
    if (hex) colors[tagOf(k).replace(/^a:/, '')] = hex.toUpperCase();
  }
  const fonts = child(elements, 'a:fontScheme');
  const heading = attr(path(fonts, 'a:majorFont', 'a:latin'), 'typeface'), body = attr(path(fonts, 'a:minorFont', 'a:latin'), 'typeface');
  return { ...(Object.keys(colors).length ? { sourceTheme: colors } : {}), ...(heading && body ? { sourceFonts: { heading, body } } : {}) };
}

/**
 * The same copied shapes, pasted by PowerPoint into a blank presentation and saved (`pptx`): its
 * slide XML is native (text box list styles, bullets… that the clipboard drawing simplifies).
 * Colors and fonts follow the source presentation's theme, carried by the clipboard drawing.
 */
export async function convertPastedSlide(pptx: Uint8Array, gvml: Uint8Array | null, master: CorporateMaster): Promise<{ elements: SlideElement[]; media: ConvertedMedia[]; warnings: string[] }> {
  const zip = await loadZipSafely(pptx);
  const clip = gvml ? await loadZipSafely(gvml).catch(() => null) : null;
  const themePart = clip && Object.keys(clip.files).find((n) => /theme\/theme\d*\.xml$/.test(n));
  const m2: ColorMaster = { ...master, ...(themePart ? sourceTheme((await readText(clip!, themePart)) ?? '') : {}) };
  const part = 'ppt/slides/slide1.xml';
  const relById = new Map((await readRels(zip, part)).map((r) => [r.id, r]));
  const doc = (parser.parse((await readText(zip, part)) ?? '') as X[]).find((n) => tagOf(n) === 'p:sld');
  const media = new Map<string, ConvertedMedia>();
  const warnings: string[] = [];
  const stats = { slides: 0, elements: 0, images: 0, tables: 0, skipped: 0 };
  const elements = await convertTree(path(doc, 'p:cSld', 'p:spTree'), { zip, master: m2, layout: undefined, relById, where: tr('Presse-papiers', 'Clipboard'), media, warnings, stats });
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

function tableOf(tbl: X, master: ColorMaster) {
  const cols = all(child(tbl, 'a:tblGrid'), 'a:gridCol').map((c) => Number(attr(c, 'w') ?? 1));
  const trs = all(tbl, 'a:tr');
  const rows: string[][] = [];
  const cellStyles: (CellStyle | null)[][] = [];
  const cellRuns: (TextRun[] | null)[][] = [];
  const merges: { r: number; c: number; rs: number; cs: number }[] = [];
  trs.forEach((r, ri) => {
    const row: string[] = [], styles: (CellStyle | null)[] = [], formatted: (TextRun[] | null)[] = [];
    all(r, 'a:tc').forEach((tc, ci) => {
      const span = Number(attr(tc, 'gridSpan') ?? 1), rspan = Number(attr(tc, 'rowSpan') ?? 1);
      if (span > 1 || rspan > 1) merges.push({ r: ri, c: ci, rs: Math.max(1, rspan), cs: Math.max(1, span) });
      const merged = attr(tc, 'hMerge') === '1' || attr(tc, 'vMerge') === '1';
      const body = child(tc, 'a:txBody');
      const text = merged ? null : textBody(body, master, undefined);
      // Paragraphs of a cell are lines of one cell text.
      const runs = text ? text.paragraphs.flatMap((p, i) => (i ? [{ text: '\n' }, ...p.runs] : p.runs)) : [];
      const plain = runs.map((x) => x.text).join('');
      row.push(plain);
      const pr = child(tc, 'a:tcPr');
      const s: CellStyle = {};
      const fill = colorOf(pr && (child(pr, 'a:solidFill') || child(pr, 'a:noFill')) ? pr : undefined, master);
      if (fill) s.fill = fill as CellStyle['fill'];
      const ln = child(pr, 'a:lnB') ?? child(pr, 'a:lnT') ?? child(pr, 'a:lnL');
      if (ln) {
        const o = outline(ln, master);
        if (child(ln, 'a:noFill')) s.line = 'none';
        else if (o.line) s.line = o.line as CellStyle['line'];
        if (o.lineWidth !== undefined && s.line !== 'none') s.lineWidth = Math.min(20, o.lineWidth);
        if (o.dash) s.dash = o.dash;
      }
      // The cell's text format: one for the whole cell when every run shares it, runs otherwise.
      const st = text?.style ?? {};
      if (st.color && st.color !== 'none') s.color = st.color as CellStyle['color'];
      if (st.fontSize) s.size = st.fontSize;
      if (st.align && st.align !== 'justify') s.align = st.align;
      const anchor = attr(pr, 'anchor');
      if (anchor) s.valign = anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : 'top';
      if (runs.length && runs.every((x) => x.bold)) {
        s.bold = true;
        for (const x of runs) delete x.bold;
      }
      const rich = mergeRuns(runs);
      formatted.push(rich.some((x) => Object.keys(x).length > 1) ? rich : null);
      styles.push(Object.keys(s).length ? s : null);
    });
    rows.push(row);
    cellStyles.push(styles);
    cellRuns.push(formatted);
  });
  // What the editor draws anyway is not repeated per cell: the grid border, the body text color
  // and the corporate header band (accent fill, light bold text on the first row).
  const grid = 'theme.dk1.lighter60';
  for (const row of cellStyles) for (const s of row) {
    if (!s) continue;
    if (s.line === grid && (s.lineWidth ?? 0.5) === 0.5 && !s.dash) (delete s.line, delete s.lineWidth);
    if (s.color === 'theme.dk1') delete s.color;
    if (s.size === 12) delete s.size;
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
    ...(cellRuns.some((r) => r.some(Boolean)) ? { cellRuns } : {}),
    ...(merges.length ? { merges } : {}),
  };
}
