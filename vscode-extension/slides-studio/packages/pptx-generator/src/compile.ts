import pptxgen from 'pptxgenjs-plus';
import { isAbsolute, join, resolve } from 'node:path';
import {
  findLayout,
  layoutForSlide,
  masterAssetOf,
  renderedImageSrc,
  imageFit,
  paragraphLook,
  resolveColor,
  resolveFont,
  resolveSlide,
  tableWeights,
  THEME_SLOTS,
  type CorporateMaster,
  type LayoutDef,
  type Paragraph,
  type ResolvedElement,
  type SlideDocument,
  type SlideElement,
  tr
} from '@corporate-slides/core';

export interface CompileOptions {
  /** Directory containing corporate-master.json and its assets/. */
  masterDir: string;
  /** Directory of the presentation source (image paths are relative to it). */
  sourceDir: string;
  /** Intrinsic pixel size of a picture source, for `contain` / `cover` pictures. */
  imageSize?: (src: string) => { width: number; height: number } | undefined;
}

export interface CompileStats {
  slides: number;
  nativeText: number;
  nativeShapes: number;
  nativeImages: number;
  nativeTables: number;
  placeholderBound: number;
  flattened: { slideId: string; elementId: string; reason: string }[];
  unsupported: string[];
  layoutsUsed: string[];
  /** Layout id → distinct image sources in registration order (for the OOXML media adapter). */
  layoutMedia: Map<string, string[]>;
  /** Preset adjustments pptxgenjs cannot write, injected into `a:avLst` after generation. */
  adjustments: { slide: number; name: string; values: Record<string, number> }[];
}

type PptxGen = InstanceType<typeof pptxgen>;
type TextProps = { text: string; options?: Record<string, unknown> };

const emptyStats = (): CompileStats => ({ slides: 0, nativeText: 0, nativeShapes: 0, nativeImages: 0, nativeTables: 0, placeholderBound: 0, flattened: [], unsupported: [], layoutsUsed: [], layoutMedia: new Map(), adjustments: [] });

const PH_TYPE: Record<string, string> = { title: 'title', subtitle: 'body', body: 'body', pic: 'pic', chart: 'chart', tbl: 'tbl', media: 'media', other: 'body' };
/** Elements whose geometry is a rectangle: OOXML connection sites 0..3 = top, left, bottom, right. */
const RECT_SITES = { top: 0, left: 1, bottom: 2, right: 3 } as const;
const rectLike = (el: SlideElement | undefined) => !!el && (el.type === 'text' || el.type === 'image' || (el.type === 'shape' && ['rect', 'roundRect', 'snip1Rect', 'flowChartTerminator'].includes(el.shape)));

/**
 * Native connector geometry (preset + transform) reproducing the editor's routing.
 * Elbow/curved connectors between facing sides use the `*Connector3` presets (rotated 90° when
 * vertical); between perpendicular sides the one-corner `*Connector2` preset, which always leaves
 * horizontally, so the connector is drawn reversed when the route starts vertically.
 */
export function connectorShape(r: ResolvedElement): { type: string; x: number; y: number; w: number; h: number; flipH: boolean; flipV: boolean; rotate?: number; reversed: boolean } {
  const p = r.path!;
  const route = r.element.type === 'connector' ? (r.element.route ?? 'straight') : 'straight';
  const box = { x: Math.min(p.x1, p.x2), y: Math.min(p.y1, p.y2), w: Math.abs(p.x2 - p.x1), h: Math.abs(p.y2 - p.y1) };
  const horiz = (s: string) => s === 'left' || s === 'right';
  if (route === 'straight') return { type: 'straightConnector1', ...box, flipH: p.x2 < p.x1, flipV: p.y2 < p.y1, reversed: false };
  const family = route === 'curved' ? 'curvedConnector' : 'bentConnector';
  if (horiz(p.fromSide) && horiz(p.toSide)) return { type: `${family}3`, ...box, flipH: p.x2 < p.x1, flipV: p.y2 < p.y1, reversed: false };
  if (!horiz(p.fromSide) && !horiz(p.toSide)) {
    // Rotated 90° clockwise: the unflipped path starts top-right, leaves downwards and ends bottom-left.
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    return { type: `${family}3`, x: cx - box.h / 2, y: cy - box.w / 2, w: box.h, h: box.w, rotate: 90, flipH: p.y1 > p.y2, flipV: p.x1 < p.x2, reversed: false };
  }
  const reversed = !horiz(p.fromSide);
  const [sx, sy, ex, ey] = reversed ? [p.x2, p.y2, p.x1, p.y1] : [p.x1, p.y1, p.x2, p.y2];
  return { type: `${family}2`, ...box, flipH: ex < sx, flipV: ey < sy, reversed };
}

/** Resolve an asset path from the master directory, refusing anything that escapes it. */
function masterAsset(masterDir: string, rel: string): string {
  const p = resolve(masterDir, rel);
  if (!p.startsWith(resolve(masterDir))) throw new Error(tr(`Chemin de ressource hors du dossier du masque : ${rel}`, `Resource path outside the master folder: ${rel}`));
  return p;
}

/**
 * Build the pptxgenjs-plus master definition for a corporate layout (the master adapter).
 * Footer/date zones receive the presentation metadata; placeholders get unique, stable names.
 */
export function layoutToSlideMaster(layout: LayoutDef, master: CorporateMaster, doc: SlideDocument, masterDir: string, ctx?: { opts: CompileOptions; stats: CompileStats }): Record<string, unknown> {
  const objects: Record<string, unknown>[] = [];
  // Objects designed like slide elements are resolved together (connectors find their ends).
  const meta = (role: string) => (role === 'footer' ? doc.metadata.footer : role === 'date' ? doc.metadata.date : undefined);
  const designed = layout.objects.flatMap((o) => {
    const el = o.object.element as SlideElement | undefined;
    if (!el) return [];
    const value = meta(o.role);
    return [value !== undefined && (el.type === 'text' || el.type === 'shape') ? { ...el, paragraphs: [{ runs: [{ text: value }] }] } : el];
  });
  const resolved = designed.length ? resolveSlide({ id: 'layout', layout: '', elements: designed }, master).elements : [];
  const sink = masterSink(objects);
  const emit = { master, opts: ctx?.opts ?? { masterDir, sourceDir: masterDir }, stats: ctx?.stats ?? emptyStats(), where: `layout ${layout.id}`, all: resolved };
  for (const o of layout.objects) {
    if (o.hidden) continue;
    const el = o.object.element as SlideElement | undefined;
    if (el) {
      const r = resolved.find((x) => x.element.id === el.id);
      if (r && !((o.role === 'footer' || o.role === 'date') && !meta(o.role))) emitElement(sink, r, emit);
      continue;
    }
    const obj = structuredClone(o.object) as Record<string, Record<string, unknown>>;
    if (o.role === 'footer' || o.role === 'date') {
      const value = o.role === 'footer' ? doc.metadata.footer : doc.metadata.date;
      if (!value) continue;
      obj.text!.text = value;
    }
    if (obj.image?.path) {
      obj.image.path = masterAsset(masterDir, String(obj.image.path));
      if (o.crop) {
        // pptxgenjs-plus crop: frame = w/h, window = sizing box in the same units (srcRect = window / frame).
        const w = Number(obj.image.w), h = Number(obj.image.h);
        obj.image.sizing = { type: 'crop', x: o.crop.l * w, y: o.crop.t * h, w: (1 - o.crop.l - o.crop.r) * w, h: (1 - o.crop.t - o.crop.b) * h };
      }
    }
    objects.push(obj);
  }
  for (const p of layout.placeholders) {
    const options: Record<string, unknown> = { name: p.key, type: PH_TYPE[p.type] ?? 'body', x: p.x, y: p.y, w: p.w, h: p.h };
    for (const k of ['fontFace', 'fontSize', 'color', 'bold', 'italic', 'align', 'valign', 'margin'] as const) {
      if (p.style[k] !== undefined) options[k] = p.style[k];
    }
    objects.push({ placeholder: { options, text: p.prompt ?? '' } });
  }
  const bgAsset = layout.background.assetId ? master.assets.find((a) => a.id === layout.background.assetId) : undefined;
  return {
    title: layout.id,
    background: bgAsset ? { path: masterAsset(masterDir, bgAsset.file) } : { color: layout.background.color ?? 'FFFFFF' },
    ...(layout.slideNumber ? { slideNumber: layout.slideNumber } : {}),
    objects,
  };
}

function textRuns(r: ResolvedElement, paragraphs: Paragraph[], master: CorporateMaster): TextProps[] {
  const out: TextProps[] = [];
  paragraphs.forEach((p, i) => {
    const look = paragraphLook(r, p);
    const runs = p.runs.length ? p.runs : [{ text: '' }];
    runs.forEach((run, k) => {
      const options: Record<string, unknown> = {};
      if (k === 0) {
        if (look.bullet) {
          options.bullet = look.bullet.numbered
            ? { type: 'number', numberType: r.style.numbering, indent: look.hanging * 72 }
            : { characterCode: look.bullet.char!.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0'), color: look.bullet.color, indent: look.hanging * 72 };
          options.indentLevel = p.level ?? 0;
        } else options.bullet = false;
        options.paraSpaceBefore = p.spaceBefore ?? (i === 0 ? 0 : 4);
        if (p.spaceAfter) options.paraSpaceAfter = p.spaceAfter;
        if (p.align) options.align = p.align;
        if (p.lineSpacing) options.lineSpacingMultiple = p.lineSpacing;
      }
      options.fontSize = run.size ?? look.fontSize;
      options.color = resolveColor(run.color, master) ?? look.color;
      if (run.bold || look.bold) options.bold = true;
      if (run.italic || r.style.italic) options.italic = true;
      if (run.underline || r.style.underline) options.underline = { style: 'sng' };
      if (run.strike) options.strike = 'sngStrike';
      if (run.font) options.fontFace = resolveFont(run.font, master) ?? run.font;
      const highlight = resolveColor(run.highlight, master);
      if (highlight) options.highlight = highlight;
      if (run.baseline === 'super') options.superscript = true;
      else if (run.baseline === 'sub') options.subscript = true;
      const caps = run.caps ?? r.style.caps;
      if (caps !== 'none') options.caps = caps;
      if (k === runs.length - 1 && i < paragraphs.length - 1) options.breakLine = true;
      out.push({ text: run.text, options });
    });
  });
  return out;
}

/** Freeform paths as pptxgenjs-plus `custGeom` options (SVG M / L / C / Q / Z → path points). */
export function customGeometry(g: NonNullable<Extract<SlideElement, { type: 'shape' }>['geometry']>): Record<string, unknown> {
  const W = g.paths[0]!.w, H = g.paths[0]!.h;
  const paths = g.paths.map((p) => {
    const sx = W / p.w, sy = H / p.h;
    const pts: Record<string, unknown>[] = [];
    const tokens = p.d.match(/[MLCQZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
    let cmd = 'M';
    for (let i = 0; i < tokens.length; ) {
      if (/^[MLCQZ]$/i.test(tokens[i]!)) cmd = tokens[i++]!.toUpperCase();
      const n = (k: number) => Number(tokens[i + k]);
      if (cmd === 'Z') {
        pts.push({ close: true });
        cmd = 'M';
        continue;
      }
      if (cmd === 'M') (pts.push({ x: n(0) * sx, y: n(1) * sy, moveTo: true }), (i += 2), (cmd = 'L'));
      else if (cmd === 'L') (pts.push({ x: n(0) * sx, y: n(1) * sy }), (i += 2));
      else if (cmd === 'C') (pts.push({ x: n(4) * sx, y: n(5) * sy, curve: { type: 'cubic', x1: n(0) * sx, y1: n(1) * sy, x2: n(2) * sx, y2: n(3) * sy } }), (i += 6));
      else if (cmd === 'Q') (pts.push({ x: n(2) * sx, y: n(3) * sy, curve: { type: 'quadratic', x1: n(0) * sx, y1: n(1) * sy } }), (i += 4));
      else i++;
    }
    return pts;
  });
  return { paths, pathW: W, pathH: H };
}

function boxOptions(r: ResolvedElement): Record<string, number | boolean> {
  const o: Record<string, number | boolean> = { x: r.box.x, y: r.box.y, w: r.box.w, h: r.box.h };
  if (r.element.rotation) o.rotate = r.element.rotation;
  return o;
}

function textBoxOptions(r: ResolvedElement): Record<string, unknown> {
  const s = r.style;
  return {
    fontFace: s.fontFace,
    align: s.align,
    valign: s.valign,
    margin: s.margin,
    ...(s.lineSpacing !== 1 ? { lineSpacingMultiple: s.lineSpacing } : {}),
  };
}

function fillLine(r: ResolvedElement): Record<string, unknown> {
  const s = r.style;
  const o: Record<string, unknown> = {};
  if (s.fill) o.fill = { color: s.fill, ...(s.transparency ? { transparency: s.transparency } : {}) };
  if (s.line) {
    o.line = {
      color: s.line,
      width: s.lineWidth,
      ...(s.dash !== 'solid' ? { dashType: s.dash === 'dot' ? 'sysDot' : 'dash' } : {}),
      ...(s.startArrow !== 'none' ? { beginArrowType: s.startArrow } : {}),
      ...(s.endArrow !== 'none' ? { endArrowType: s.endArrow } : {}),
    };
  }
  return o;
}

/** Drawing calls shared by slides and slide masters (see `masterSink`). */
interface Sink {
  addText(runs: unknown, opts: unknown): void;
  addShape(type: unknown, opts: unknown): void;
  addImage(opts: unknown): void;
  addTable(rows: unknown, opts: unknown): void;
  addConnector(opts: unknown): void;
  /** Native group (`p:grpSp`), children placed relative to its origin; absent on slide masters. */
  addGroup?(opts: unknown, build: (g: Sink) => void): void;
}

/** Drawing order of a slide with its groups: a group is drawn where its first member is. */
type DrawNode = { r: ResolvedElement } | { group: string; children: DrawNode[] };

/**
 * Elements (back to front) → tree of nested groups (`group: 'a/b'`). Placeholders and tables cannot
 * live in a PowerPoint group: they stay at the slide level, in their place.
 */
export function drawTree(rs: ResolvedElement[], depth = 0): DrawNode[] {
  const out: (DrawNode | { group: string; members: ResolvedElement[] })[] = [];
  const groups = new Map<string, { group: string; members: ResolvedElement[] }>();
  for (const r of rs) {
    const parts = r.element.group?.split('/') ?? [];
    if (parts.length <= depth || r.placeholder || r.element.type === 'table') {
      out.push({ r });
      continue;
    }
    const key = parts.slice(0, depth + 1).join('/');
    let g = groups.get(key);
    if (!g) {
      g = { group: key, members: [] };
      groups.set(key, g);
      out.push(g);
    }
    g.members.push(r);
  }
  return out.map((n) => ('members' in n ? { group: n.group, children: drawTree(n.members, depth + 1) } : n));
}

const leaves = (n: DrawNode): ResolvedElement[] => ('r' in n ? [n.r] : n.children.flatMap(leaves));

/** A resolved element moved into a group's coordinates. */
function shifted(r: ResolvedElement, o: { x: number; y: number }): ResolvedElement {
  if (!o.x && !o.y) return r;
  const p = r.path;
  return { ...r, box: { ...r.box, x: r.box.x - o.x, y: r.box.y - o.y }, ...(p ? { path: { ...p, x1: p.x1 - o.x, y1: p.y1 - o.y, x2: p.x2 - o.x, y2: p.y2 - o.y } } : {}) };
}

function emitNodes(s: Sink, nodes: DrawNode[], ctx: EmitContext, origin = { x: 0, y: 0 }): void {
  for (const n of nodes) {
    if ('r' in n) {
      emitElement(s, shifted(n.r, origin), ctx);
      continue;
    }
    const rs = leaves(n);
    if (!s.addGroup || rs.length < 2) {
      emitNodes(s, n.children, ctx, origin);
      continue;
    }
    const x0 = Math.min(...rs.map((r) => r.box.x)), y0 = Math.min(...rs.map((r) => r.box.y));
    const x1 = Math.max(...rs.map((r) => r.box.x + r.box.w)), y1 = Math.max(...rs.map((r) => r.box.y + r.box.h));
    s.addGroup({ x: x0 - origin.x, y: y0 - origin.y, w: Math.max(x1 - x0, 0.01), h: Math.max(y1 - y0, 0.01), objectName: n.group.split('/').pop() }, (g) => emitNodes(g, n.children, ctx, { x: x0, y: y0 }));
  }
}

/** pptxgenjs-plus group builder as a sink (no tables in groups: they never get there). */
function groupSink(g: { addText: Function; addShape: Function; addImage: Function; addConnector: Function; addGroup: Function }): Sink {
  return {
    addText: (t, o) => g.addText(t, o),
    addShape: (t, o) => g.addShape(t, o),
    addImage: (o) => g.addImage(o),
    addTable: () => undefined,
    addConnector: (o) => g.addConnector(o),
    addGroup: (o, build) => g.addGroup(o, (inner: never) => build(groupSink(inner))),
  };
}

interface EmitContext {
  master: CorporateMaster;
  opts: CompileOptions;
  stats: CompileStats;
  /** Slide id (or `layout <id>`) for messages. */
  where: string;
  /** 1-based slide number for post-generation patches; absent on slide masters. */
  slideNo?: number;
  all: ResolvedElement[];
}

/** Collects master objects (`{ text }`, `{ shape }`, `{ image }`, `{ table }`) instead of drawing on a slide. */
function masterSink(objects: Record<string, unknown>[]): Sink {
  return {
    addText: (text, options) => objects.push({ text: { text, options } }),
    addShape: (type, options) => objects.push({ shape: { type, options } }),
    addImage: (options) => objects.push({ image: options }),
    addTable: (rows, options) => objects.push({ table: { rows, options } }),
    // No connection sites on a master: the connector is drawn as its preset shape.
    addConnector: ({ type, start: _s, end: _e, ...options }: Record<string, unknown>) => objects.push({ shape: { type, options } }),
  } as Sink;
}

/** Image file of a picture source: master assets (`@master/<id>`) or a path relative to the presentation. */
function imagePath(src: string, master: CorporateMaster, opts: CompileOptions): string {
  const asset = masterAssetOf(src);
  if (asset) {
    const a = master.assets.find((x) => x.id === asset);
    if (!a) throw new Error(tr(`Ressource du masque introuvable : ${asset}`, `Master asset not found: ${asset}`));
    return masterAsset(opts.masterDir, a.file);
  }
  const file = renderedImageSrc(src);
  return isAbsolute(file) ? file : join(opts.sourceDir, file);
}

function emitElement(s: Sink, r: ResolvedElement, { master, opts, stats, where, slideNo, all }: EmitContext): void {
  const el = r.element;
    const bound = r.placeholder && (el.type === 'text' || el.type === 'image');
    // Placeholder-bound elements only pass the axes the author overrode, so PowerPoint keeps inheritance.
    const geom = bound
      ? Object.fromEntries((['x', 'y', 'w', 'h'] as const).filter((k) => el[k] !== undefined).map((k) => [k, r.box[k]]))
      : boxOptions(r);
    const common = { ...geom, ...(el.rotation ? { rotate: el.rotation } : {}), objectName: el.id, ...(el.locked ? { lock: { noMove: true, noResize: true } } : {}) };
    switch (el.type) {
      case 'text': {
        const opts2: Record<string, unknown> = { ...common, ...textBoxOptions(r) };
        if (bound) opts2.placeholder = r.placeholder!.key;
        if (el.style?.fill || el.style?.line || r.placeholder?.style.fill || r.placeholder?.style.line) Object.assign(opts2, fillLine(r));
        if (r.style.radius) Object.assign(opts2, { shape: 'roundRect', rectRadius: r.style.radius });
        s.addText(textRuns(r, el.paragraphs, master) as never, opts2 as never);
        stats.nativeText++;
        if (bound) stats.placeholderBound++;
        break;
      }
      case 'shape': {
        const base = { ...common, ...fillLine(r), ...(el.flipH ? { flipH: true } : {}), ...(el.flipV ? { flipV: true } : {}) };
        if (el.shape === 'roundRect' || el.shape === 'snip1Rect') (base as Record<string, unknown>).rectRadius = r.style.radius ?? Math.min(r.box.w, r.box.h) / 6;
        // Preset names are the OOXML prstGeom names; `line` is pptxgenjs' straight line.
        if (el.adjust && el.shape !== 'roundRect' && el.shape !== 'snip1Rect') if (slideNo !== undefined) stats.adjustments.push({ slide: slideNo, name: el.id, values: el.adjust });
        // Freeforms: `a:custGeom` with the same paths (coordinates in the first path's space).
        const geom = el.shape === 'custom' && el.geometry ? customGeometry(el.geometry) : null;
        const kind = geom ? 'custGeom' : el.shape;
        if (geom) Object.assign(base, geom);
        if (el.paragraphs?.length) {
          s.addText(textRuns(r, el.paragraphs, master) as never, { ...base, ...textBoxOptions(r), shape: kind } as never);
        } else s.addShape(kind as never, base as never);
        stats.nativeShapes++;
        break;
      }
      case 'image': {
        const path = imagePath(el.src, master, opts);
        // contain: the picture box shrinks to the original ratio, centered; cover: the full box, cropped.
        const fit = imageFit(el);
        const size = fit !== 'stretch' ? opts.imageSize?.(el.src) : undefined;
        let place: Record<string, unknown> = boxOptions(r);
        if (size && size.width > 0 && size.height > 0 && r.box.w > 0 && r.box.h > 0) {
          const ar = size.width / size.height, bar = r.box.w / r.box.h;
          if (fit === 'contain') {
            const w = ar > bar ? r.box.w : r.box.h * ar, h = ar > bar ? r.box.w / ar : r.box.h;
            place = { ...place, x: r.box.x + (r.box.w - w) / 2, y: r.box.y + (r.box.h - h) / 2, w, h };
          } else {
            // pptxgenjs-plus crop: window in frame units (srcRect = window / frame).
            const fx = ar > bar ? bar / ar : 1, fy = ar > bar ? 1 : ar / bar;
            place = { ...place, sizing: { type: 'crop', x: ((1 - fx) / 2) * r.box.w, y: ((1 - fy) / 2) * r.box.h, w: fx * r.box.w, h: fy * r.box.h } };
          }
        }
        // Cropped picture (pptxgenjs-plus crop: window in frame units, srcRect = window / frame).
        if (el.crop && !place.sizing) {
          const c = el.crop;
          place = { ...place, sizing: { type: 'crop', x: c.l * r.box.w, y: c.t * r.box.h, w: (1 - c.l - c.r) * r.box.w, h: (1 - c.t - c.b) * r.box.h } };
        }
        s.addImage({ ...place, path, ...(el.alt ? { altText: el.alt } : {}), objectName: el.id } as never);
        // Pictures have no outline option in pptxgenjs: the border is an unfilled rectangle on top.
        if (r.style.line) s.addShape('rect' as never, { ...boxOptions(r), line: fillLine(r).line, objectName: `${el.id}-border` } as never);
        stats.nativeImages++;
        break;
      }
      case 'connector': {
        if (!r.path) {
          stats.unsupported.push(tr(`${where}/${el.id} : connecteur sans extrémités (« ${el.from} » → « ${el.to} »)`, `${where}/${el.id}: connector without ends (“${el.from}” → “${el.to}”)`));
          break;
        }
        const g = connectorShape(r);
        const byId = new Map(all.map((x) => [x.element.id, x.element]));
        const [from, to, fromSide, toSide] = g.reversed ? [el.to, el.from, r.path.toSide, r.path.fromSide] : [el.from, el.to, r.path.fromSide, r.path.toSide];
        const line = (fillLine(r).line ?? {}) as Record<string, unknown>;
        if (g.reversed) [line.beginArrowType, line.endArrowType] = [line.endArrowType, line.beginArrowType];
        s.addConnector({
          type: g.type,
          x: g.x, y: g.y, w: g.w, h: g.h,
          ...(g.rotate ? { rotate: g.rotate } : {}),
          ...(g.flipH ? { flipH: true } : {}),
          ...(g.flipV ? { flipV: true } : {}),
          objectName: el.id,
          // Free points have no native connection site: the connector is drawn at its position, unattached.
          ...(rectLike(byId.get(from)) && !(g.reversed ? r.path.freeTo : r.path.freeFrom) ? { start: { shape: from, site: RECT_SITES[fromSide] } } : {}),
          ...(rectLike(byId.get(to)) && !(g.reversed ? r.path.freeFrom : r.path.freeTo) ? { end: { shape: to, site: RECT_SITES[toSide] } } : {}),
          line: Object.fromEntries(Object.entries(line).filter(([, v]) => v !== undefined)),
        } as never);
        stats.nativeShapes++;
        break;
      }
      case 'table': {
        const header = el.header !== false;
        const head = resolveColor('theme.accent1', master) ?? '3E4A83';
        const headTint = resolveColor('theme.accent1.lighter80', master) ?? 'DDE1EE';
        const border = (line: string | undefined, width: number | undefined, dash: string | undefined, fallback: string) =>
          line === 'none' ? { type: 'none' } : { type: dash && dash !== 'solid' ? 'dash' : 'solid', pt: width ?? 0.5, color: resolveColor(line, master) ?? fallback };
        const grid = resolveColor('theme.dk1.lighter60', master) ?? 'A8A8A8';
        const tableBorder = border(el.style?.line, el.style?.lineWidth, el.style?.dash, grid);
        const covered = (ri: number, ci: number) => (el.merges ?? []).some((m) => ri >= m.r && ri < m.r + m.rs && ci >= m.c && ci < m.c + m.cs && !(ri === m.r && ci === m.c));
        const rows = el.rows.map((row, ri) =>
          row.flatMap((text, ci) => {
            // Merged cells: the first carries colspan / rowspan, the covered ones are left out.
            if (covered(ri, ci)) return [];
            const merge = el.merges?.find((m) => m.r === ri && m.c === ci);
            const cs = el.cellStyles?.[ri]?.[ci];
            const fill = cs?.fill && cs.fill !== 'none' ? resolveColor(cs.fill, master) : null;
            // Formatted cells: pptxgenjs takes an array of runs as the cell text.
            const runs = el.cellRuns?.[ri]?.[ci];
            const rich = runs && runs.map((x) => x.text).join('') === text
              ? runs.map((x) => ({ text: x.text, options: { ...(x.bold ? { bold: true } : {}), ...(x.italic ? { italic: true } : {}), ...(x.underline ? { underline: { style: 'sng' } } : {}), ...(x.color ? { color: resolveColor(x.color, master) ?? undefined } : {}), ...(x.size ? { fontSize: x.size } : {}), ...(x.strike ? { strike: 'sngStrike' } : {}), ...(x.font ? { fontFace: resolveFont(x.font, master) ?? x.font } : {}), ...(x.highlight && resolveColor(x.highlight, master) ? { highlight: resolveColor(x.highlight, master) } : {}), ...(x.baseline ? { [x.baseline === 'super' ? 'superscript' : 'subscript']: true } : {}),...((x.caps ?? cs?.caps ?? el.style?.caps) && (x.caps ?? cs?.caps ?? el.style?.caps) !== 'none' ? { caps: x.caps ?? cs?.caps ?? el.style?.caps } : {}) } }))
              : null;
            const caps = cs?.caps ?? el.style?.caps;
            return [{
              // Caps live on runs in pptxgenjs: a plain cell with caps becomes a single run.
              text: rich ?? (caps && caps !== 'none' ? [{ text, options: { caps } }] : text),
              options: {
                ...(el.style?.bold ? { bold: true } : {}),
                ...(el.style?.italic ? { italic: true } : {}),
                ...(el.style?.underline ? { underline: { style: 'sng' } } : {}),
                ...(ri === 0 && header ? { bold: true, color: 'FFFFFF', fill: { color: head } } : ci === 0 && el.headerColumn ? { bold: true, fill: { color: headTint } } : {}),
                ...(el.colAlign?.[ci] ? { align: el.colAlign[ci] } : {}),
                ...(fill ? { fill: { color: fill } } : {}),
                ...(cs?.color ? { color: resolveColor(cs.color, master) ?? undefined } : {}),
                ...(cs?.bold !== undefined ? { bold: cs.bold } : {}),
                ...(cs?.italic ? { italic: true } : {}),
                ...(cs?.underline ? { underline: { style: 'sng' } } : {}),
                ...(cs?.size ? { fontSize: cs.size } : {}),
                ...(cs?.align ? { align: cs.align } : {}),
                ...(cs?.valign ? { valign: cs.valign } : {}),
                ...(cs?.line || cs?.lineWidth !== undefined || cs?.dash ? { border: border(cs.line ?? el.style?.line, cs.lineWidth ?? el.style?.lineWidth, cs.dash ?? el.style?.dash, grid) } : {}),
                ...(merge && merge.cs > 1 ? { colspan: merge.cs } : {}),
                ...(merge && merge.rs > 1 ? { rowspan: merge.rs } : {}),
              },
            }];
          }),
        );
        const cols = Math.max(...el.rows.map((x) => x.length));
        s.addTable(rows as never, {
          ...boxOptions(r),
          fontFace: r.style.fontFace,
          fontSize: el.style?.fontSize ?? 12,
          color: r.style.color,
          border: tableBorder,
          colW: tableWeights(el.colWidths, cols).map((f) => f * r.box.w),
          ...(el.rowHeights ? { rowH: tableWeights(el.rowHeights, el.rows.length).map((f) => f * r.box.h) } : {}),
          valign: el.style?.valign ?? 'middle',
        } as never);
        stats.nativeTables++;
        break;
      }
    }
}

export function buildPresentation(doc: SlideDocument, master: CorporateMaster, opts: CompileOptions): { pres: PptxGen; stats: CompileStats } {
  const pres = new pptxgen();
  pres.defineLayout({ name: 'CORPORATE', width: master.dimensions.width, height: master.dimensions.height });
  pres.layout = 'CORPORATE';
  pres.theme = {
    headFontFace: master.theme.fonts.heading,
    bodyFontFace: master.theme.fonts.body,
    themeColors: THEME_SLOTS.map((k) => master.theme.colors[k] ?? '000000'),
  };
  pres.title = doc.metadata.title;
  if (doc.metadata.author) pres.author = doc.metadata.author;
  if (doc.metadata.subject) pres.subject = doc.metadata.subject;
  pres.company = master.name;

  const stats = emptyStats();

  // Register only the layouts the document uses (keeps files small and deterministic). A slide with
  // master overrides gets its own variant of the layout (`<layout>~<slide>`).
  const masterNames = new Map<string, string>();
  for (const slide of doc.slides) {
    const base = findLayout(master, slide.layout);
    if (!base) throw new Error(tr(`Disposition « ${slide.layout} » introuvable (diapositive « ${slide.id} »)`, `Layout “${slide.layout}” not found (slide “${slide.id}”)`));
    const variant = layoutForSlide(base, slide)!;
    const layout = variant === base ? base : { ...variant, id: `${base.id}~${slide.id}` };
    masterNames.set(slide.id, layout.id);
    if (stats.layoutsUsed.includes(layout.id)) continue;
    stats.layoutsUsed.push(layout.id);
    const def = layoutToSlideMaster(layout, master, doc, opts.masterDir, { opts, stats }) as { background?: { path?: string }; objects: Record<string, { path?: string }>[] };
    const media: string[] = [];
    for (const p of [def.background?.path, ...def.objects.map((o) => o.image?.path)]) if (p && !media.includes(p)) media.push(p);
    stats.layoutMedia.set(layout.id, media);
    pres.defineSlideMaster(def as unknown as Parameters<PptxGen['defineSlideMaster']>[0]);
  }

  for (const slide of doc.slides) {
    const rs = resolveSlide(slide, master);
    const s = pres.addSlide({ masterName: masterNames.get(slide.id) ?? rs.layout!.id });
    stats.slides++;
    if (slide.notes) s.addNotes(slide.notes);
    if (slide.hidden) s.hidden = true;
    const visible = rs.elements.filter((r) => !r.element.hidden);
    const sink: Sink = { ...(s as unknown as Sink), addText: (t, o) => s.addText(t as never, o as never), addShape: (t, o) => s.addShape(t as never, o as never), addImage: (o) => s.addImage(o as never), addTable: (t, o) => s.addTable(t as never, o as never), addConnector: (o) => (s as unknown as Sink).addConnector(o), addGroup: (o, build) => (s as unknown as { addGroup: Function }).addGroup(o, (g: never) => build(groupSink(g))) };
    emitNodes(sink, drawTree(visible), { master, opts, stats, where: slide.id, slideNo: stats.slides, all: rs.elements });
  }
  return { pres, stats };
}
