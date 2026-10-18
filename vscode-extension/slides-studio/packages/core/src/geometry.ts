import type { AnchorPoint, ArrowHead, ConnectorSide, CorporateMaster, ElementStyle, LayoutDef, LevelStyle, Numbering, PlaceholderDef, SlideElement, SlideNode } from './schema.js';
import { findLayout, resolveColor, resolveFont } from './theme.js';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Fully resolved style: literal colors (RRGGBB or null) and literal font families. */
export interface ResolvedStyle {
  fill: string | null;
  line: string | null;
  lineWidth: number;
  dash: 'solid' | 'dash' | 'dot';
  transparency: number;
  fontFace: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: 'left' | 'center' | 'right' | 'justify';
  valign: 'top' | 'middle' | 'bottom';
  lineSpacing: number;
  /** Text insets [top, right, bottom, left] in inches (PowerPoint default 0.05/0.1). */
  margin: [number, number, number, number];
  /** Corner radius in inches (roundRect, snip1Rect); null = preset default (15 % of the short side). */
  radius: number | null;
  startArrow: ArrowHead;
  endArrow: ArrowHead;
  bullet: string | null;
  numbering: Numbering;
}

/** Resolved end points of a connector, in slide inches. */
export interface ConnectorPath {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  fromSide: Exclude<ConnectorSide, 'auto'>;
  toSide: Exclude<ConnectorSide, 'auto'>;
  /** True when an end sits on a free point rather than a side midpoint (no native connection site). */
  freeFrom?: boolean;
  freeTo?: boolean;
}

export interface ResolvedElement {
  element: SlideElement;
  box: Box;
  style: ResolvedStyle;
  placeholder?: PlaceholderDef;
  levels: LevelStyle[];
  z: number;
  /** True when geometry is inherited from the layout placeholder. */
  inheritedGeometry: boolean;
  /** Connectors only: end points (absent when an end is missing). */
  path?: ConnectorPath;
}

export const DEFAULT_MARGIN: [number, number, number, number] = [0.05, 0.1, 0.05, 0.1];

/** Default geometry for elements with neither explicit geometry nor placeholder. */
export function defaultBox(el: SlideElement, master: Pick<CorporateMaster, 'dimensions'>): Box {
  const { width, height } = master.dimensions;
  if ((el.type === 'shape' && el.shape === 'line') || el.type === 'connector') return { x: width * 0.25, y: height / 2, w: width / 2, h: 0 };
  return { x: width * 0.25, y: height * 0.35, w: width / 2, h: height * 0.3 };
}

/**
 * Find the placeholder an element is bound to. Keys are resolved exactly, then by aliases:
 * `content` → `body`, `left` → first body placeholder by x, `right` → second.
 */
export function findPlaceholder(layout: LayoutDef | undefined, key: string | undefined): PlaceholderDef | undefined {
  if (!layout || !key) return undefined;
  const exact = layout.placeholders.find((p) => p.key === key);
  if (exact) return exact;
  const bodies = layout.placeholders.filter((p) => p.type === 'body').sort((a, b) => a.x - b.x || a.y - b.y);
  if (key === 'content' || key === 'text') return bodies[0];
  if (key === 'left') return bodies[0];
  if (key === 'right') return bodies[1];
  // Semantic fallbacks between subtitle and body so Markdown stays layout-agnostic.
  if (key === 'subtitle') return bodies[0];
  if (key === 'body') return layout.placeholders.find((p) => p.type === 'subtitle');
  return undefined;
}

export function resolveElement(el: SlideElement, index: number, layout: LayoutDef | undefined, master: CorporateMaster): ResolvedElement {
  const ph = findPlaceholder(layout, el.placeholder);
  const fallback = ph ? { x: ph.x, y: ph.y, w: ph.w, h: ph.h } : defaultBox(el, master);
  const box: Box = { x: el.x ?? fallback.x, y: el.y ?? fallback.y, w: el.w ?? fallback.w, h: el.h ?? fallback.h };
  const inheritedGeometry = !!ph && el.x === undefined && el.y === undefined && el.w === undefined && el.h === undefined;
  return {
    element: el,
    box,
    style: resolveStyle(el, ph, master),
    placeholder: ph,
    levels: ph?.levels ?? [],
    z: el.z ?? index,
    inheritedGeometry,
  };
}

export function resolveStyle(el: SlideElement, ph: PlaceholderDef | undefined, master: CorporateMaster): ResolvedStyle {
  const s: ElementStyle = el.style ?? {};
  const isTitle = ph?.type === 'title';
  const firstLevel = ph?.levels?.[0];
  const isShape = el.type === 'shape';
  const isLine = (isShape && el.shape === 'line') || el.type === 'connector';
  const defaultFill = isShape && !isLine ? 'theme.accent1' : undefined;
  const defaultLine = isLine ? 'theme.dk1' : undefined;
  return {
    fill: resolveColor(s.fill ?? defaultFill, master),
    line: resolveColor(s.line ?? defaultLine, master),
    lineWidth: s.lineWidth ?? (isLine ? 1.5 : 1),
    dash: s.dash ?? 'solid',
    transparency: s.transparency ?? 0,
    fontFace:
      resolveFont(s.fontFace, master) ?? ph?.style.fontFace ?? (isTitle ? master.theme.fonts.heading : master.theme.fonts.body),
    fontSize: s.fontSize ?? ph?.style.fontSize ?? firstLevel?.fontSize ?? (isTitle ? 32 : el.type === 'table' ? 12 : 18),
    color:
      resolveColor(s.color, master) ??
      (ph?.style.color ? ph.style.color.toUpperCase() : undefined) ??
      firstLevel?.color?.toUpperCase() ??
      (isShape && el.shape !== 'line' ? 'FFFFFF' : (master.theme.colors.dk1 ?? '000000').toUpperCase()),
    bold: s.bold ?? ph?.style.bold ?? firstLevel?.bold ?? false,
    italic: s.italic ?? ph?.style.italic ?? false,
    underline: s.underline ?? false,
    align: s.align ?? ph?.style.align ?? (isShape ? 'center' : 'left'),
    valign: s.valign ?? ph?.style.valign ?? (isShape ? 'middle' : 'top'),
    lineSpacing: s.lineSpacing ?? 1,
    margin: (ph?.style.margin as ResolvedStyle['margin'] | undefined) ?? DEFAULT_MARGIN,
    radius: s.radius ?? null,
    startArrow: s.startArrow ?? 'none',
    endArrow: s.endArrow ?? (el.type === 'connector' ? 'triangle' : 'none'),
    bullet: s.bullet ?? null,
    numbering: s.numbering ?? 'arabicPeriod',
  };
}

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const sidePoint = (b: Box, side: (typeof SIDES)[number]) =>
  side === 'top' ? { x: b.x + b.w / 2, y: b.y } : side === 'bottom' ? { x: b.x + b.w / 2, y: b.y + b.h } : side === 'left' ? { x: b.x, y: b.y + b.h / 2 } : { x: b.x + b.w, y: b.y + b.h / 2 };

/** Side a free point leaves from: the box edge it is closest to (in box-relative units). */
export function anchorSide([fx, fy]: AnchorPoint): Exclude<ConnectorSide, 'auto'> {
  const d = { top: fy, bottom: 1 - fy, left: fx, right: 1 - fx };
  return (Object.keys(d) as (keyof typeof d)[]).reduce((a, b) => (d[b] < d[a] ? b : a));
}

/** Closest point of the box outline to (px, py), as box fractions; snaps to side midpoints and corners. */
export function perimeterAnchor(b: Box, px: number, py: number, snap = 0.06): AnchorPoint {
  let fx = Math.max(0, Math.min(1, (px - b.x) / Math.max(b.w, 1e-6)));
  let fy = Math.max(0, Math.min(1, (py - b.y) / Math.max(b.h, 1e-6)));
  const side = anchorSide([fx, fy]);
  if (side === 'top') fy = 0;
  else if (side === 'bottom') fy = 1;
  else if (side === 'left') fx = 0;
  else fx = 1;
  for (const v of [0, 0.5, 1]) {
    if (Math.abs(fx - v) < snap) fx = v;
    if (Math.abs(fy - v) < snap) fy = v;
  }
  return [Math.round(fx * 1000) / 1000, Math.round(fy * 1000) / 1000];
}

/** Side midpoint equivalent of a point, or null when it is a free point. */
export function pointSide([fx, fy]: AnchorPoint): Exclude<ConnectorSide, 'auto'> | null {
  if (fx === 0.5 && fy === 0) return 'top';
  if (fx === 0.5 && fy === 1) return 'bottom';
  if (fx === 0 && fy === 0.5) return 'left';
  if (fx === 1 && fy === 0.5) return 'right';
  return null;
}

/**
 * End points of a connector between two boxes; `auto` sides face each other along the dominant axis.
 * Free points (box fractions) take precedence over sides.
 */
export function connectorPath(a: Box, b: Box, fromSide: ConnectorSide = 'auto', toSide: ConnectorSide = 'auto', fromPoint?: AnchorPoint, toPoint?: AnchorPoint): ConnectorPath {
  const dx = b.x + b.w / 2 - (a.x + a.w / 2);
  const dy = b.y + b.h / 2 - (a.y + a.h / 2);
  const horizontal = Math.abs(dx) - (a.w + b.w) / 2 > Math.abs(dy) - (a.h + b.h) / 2;
  const fs = fromPoint ? anchorSide(fromPoint) : fromSide !== 'auto' ? fromSide : horizontal ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'bottom' : 'top';
  const ts = toPoint ? anchorSide(toPoint) : toSide !== 'auto' ? toSide : horizontal ? (dx >= 0 ? 'left' : 'right') : dy >= 0 ? 'top' : 'bottom';
  const at = (box: Box, p: AnchorPoint) => ({ x: box.x + p[0] * box.w, y: box.y + p[1] * box.h });
  const p1 = fromPoint ? at(a, fromPoint) : sidePoint(a, fs), p2 = toPoint ? at(b, toPoint) : sidePoint(b, ts);
  return {
    x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, fromSide: fs, toSide: ts,
    ...(fromPoint && !pointSide(fromPoint) ? { freeFrom: true } : {}),
    ...(toPoint && !pointSide(toPoint) ? { freeTo: true } : {}),
  };
}

export interface ResolvedSlide {
  slide: SlideNode;
  layout: LayoutDef | undefined;
  elements: ResolvedElement[];
}

/** Resolve all elements of a slide, sorted back-to-front. */
export function resolveSlide(slide: SlideNode, master: CorporateMaster): ResolvedSlide {
  const layout = findLayout(master, slide.layout);
  const elements = slide.elements.map((el, i) => resolveElement(el, i, layout, master));
  // Connectors take their geometry from the elements they link.
  const byId = new Map(elements.map((r) => [r.element.id, r]));
  for (const r of elements) {
    const el = r.element;
    if (el.type !== 'connector') continue;
    const a = byId.get(el.from), b = byId.get(el.to);
    if (!a || !b || a.element.type === 'connector' || b.element.type === 'connector') continue;
    r.path = connectorPath(a.box, b.box, el.fromSide, el.toSide, el.fromPoint, el.toPoint);
    const { x1, y1, x2, y2 } = r.path;
    r.box = { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
  }
  elements.sort((a, b) => a.z - b.z);
  return { slide, layout, elements };
}

/** Effective fit of a picture: placeholder pictures keep their ratio unless told otherwise. */
export const imageFit = (el: { fit?: 'stretch' | 'contain' | 'cover'; placeholder?: string }): 'stretch' | 'contain' | 'cover' => el.fit ?? (el.placeholder ? 'contain' : 'stretch');

export const intersects = (a: Box, b: Box): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export const intersectionArea = (a: Box, b: Box): number =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/** Bounding box of a static pptx-masters object (`{ rect: {x,y,w,h} }`, `{ text: { options: {x…} } }`…). */
export function staticObjectBox(obj: Record<string, unknown>): Box | null {
  const [kind, raw] = Object.entries(obj)[0] ?? [];
  if (!kind || !raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const g = (kind === 'text' || kind === 'placeholder' ? (r.options as Record<string, unknown>) : r) ?? {};
  const n = (v: unknown) => (typeof v === 'number' ? v : 0);
  return { x: n(g.x), y: n(g.y), w: n(g.w), h: n(g.h) };
}

export interface ParagraphLook {
  fontSize: number;
  color: string;
  bold: boolean;
  bullet: { char?: string; color: string; numbered: boolean } | null;
  /** Left indent of the text in inches (bullet hangs in front of it). */
  indent: number;
  /** Width reserved for the bullet in inches. */
  hanging: number;
}

/**
 * Paragraph appearance shared by the browser renderer, the PPTX compiler and overflow estimates.
 * List levels map onto the template's level styles starting at the first level that defines a bullet
 * (many corporate templates keep level 1 bullet-less for plain body text).
 */
export function paragraphLook(r: ResolvedElement, p: { list?: 'bullet' | 'number'; level?: number; heading?: number }): ParagraphLook {
  const level = p.level ?? 0;
  const firstBullet = r.levels.findIndex((l) => l.bullet && (l.bullet.char || l.bullet.numbered));
  const tl = p.list ? r.levels[Math.min(level + Math.max(0, firstBullet), Math.max(0, r.levels.length - 1))] : r.levels[0];
  const explicitSize = r.element.style?.fontSize;
  const explicitColor = r.element.style?.color;
  const fontSize = explicitSize ?? (r.placeholder?.type === 'title' ? r.style.fontSize : (tl?.fontSize ?? r.style.fontSize));
  const color = explicitColor ? r.style.color : (tl?.color?.toUpperCase() ?? r.style.color);
  const bold = !!p.heading || r.style.bold;
  // Headings inside a body scale up a little (h2 ≈ +30 %, h6 ≈ +5 %), as in PowerPoint outlines.
  const headingSize = p.heading ? Math.round(fontSize * (1 + (7 - p.heading) * 0.06) * 2) / 2 : fontSize;
  if (!p.list) return { fontSize: headingSize, color, bold, bullet: null, indent: p.heading ? 0 : Math.max(0, tl?.marginLeft ?? 0), hanging: 0 };
  const hanging = tl?.indent !== undefined && tl.indent < 0 ? -tl.indent : 0.25;
  return {
    fontSize,
    color,
    bold,
    bullet: { char: p.list === 'number' ? undefined : (r.style.bullet ?? tl?.bullet?.char ?? '•'), color: tl?.bullet?.color?.toUpperCase() ?? color, numbered: p.list === 'number' },
    indent: tl?.marginLeft ?? hanging * (level + 1),
    hanging,
  };
}

const roman = (n: number): string => {
  let out = '';
  for (const [v, s] of [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']] as const) {
    while (n >= v) (out += s), (n -= v);
  }
  return out;
};
const alpha = (n: number): string => (n > 26 ? alpha(Math.floor((n - 1) / 26)) : '') + String.fromCharCode(97 + ((n - 1) % 26));

/** Marker text of the n-th (1-based) item of an ordered list, as PowerPoint draws it. */
export function numberLabel(n: number, scheme: Numbering): string {
  switch (scheme) {
    case 'arabicParenR': return `${n})`;
    case 'alphaLcPeriod': return `${alpha(n)}.`;
    case 'alphaUcPeriod': return `${alpha(n).toUpperCase()}.`;
    case 'alphaLcParenR': return `${alpha(n)})`;
    case 'romanLcPeriod': return `${roman(n)}.`;
    case 'romanUcPeriod': return `${roman(n).toUpperCase()}.`;
    default: return `${n}.`;
  }
}

/** Table column widths / row heights as fractions summing to 1; missing entries get the average weight. */
export function tableWeights(w: number[] | undefined, n: number): number[] {
  const known = (w ?? []).slice(0, n).filter((x) => x > 0);
  const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const v = Array.from({ length: n }, (_, i) => (w?.[i] && w[i]! > 0 ? w[i]! : avg));
  const sum = v.reduce((a, b) => a + b, 0);
  return v.map((x) => x / sum);
}
