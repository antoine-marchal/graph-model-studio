import pptxgen from 'pptxgenjs-plus';
import { isAbsolute, join, resolve } from 'node:path';
import {
  findLayout,
  renderedImageSrc,
  paragraphLook,
  resolveColor,
  resolveSlide,
  tableWeights,
  THEME_SLOTS,
  type CorporateMaster,
  type LayoutDef,
  type Paragraph,
  type ResolvedElement,
  type SlideDocument,
  type SlideElement,
} from '@corporate-slides/core';

export interface CompileOptions {
  /** Directory containing corporate-master.json and its assets/. */
  masterDir: string;
  /** Directory of the presentation source (image paths are relative to it). */
  sourceDir: string;
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
}

type PptxGen = InstanceType<typeof pptxgen>;
type TextProps = { text: string; options?: Record<string, unknown> };

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
  if (!p.startsWith(resolve(masterDir))) throw new Error(`Chemin de ressource hors du dossier du masque : ${rel}`);
  return p;
}

/**
 * Build the pptxgenjs-plus master definition for a corporate layout (the master adapter).
 * Footer/date zones receive the presentation metadata; placeholders get unique, stable names.
 */
export function layoutToSlideMaster(layout: LayoutDef, master: CorporateMaster, doc: SlideDocument, masterDir: string): Record<string, unknown> {
  const objects: Record<string, unknown>[] = [];
  for (const o of layout.objects) {
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
    objects.push({ placeholder: { options, text: '' } });
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
        options.paraSpaceBefore = i === 0 ? 0 : 4;
      }
      options.fontSize = look.fontSize;
      options.color = resolveColor(run.color, master) ?? look.color;
      if (run.bold || look.bold) options.bold = true;
      if (run.italic || r.style.italic) options.italic = true;
      if (run.underline || r.style.underline) options.underline = { style: 'sng' };
      if (k === runs.length - 1 && i < paragraphs.length - 1) options.breakLine = true;
      out.push({ text: run.text, options });
    });
  });
  return out;
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

  const stats: CompileStats = { slides: 0, nativeText: 0, nativeShapes: 0, nativeImages: 0, nativeTables: 0, placeholderBound: 0, flattened: [], unsupported: [], layoutsUsed: [], layoutMedia: new Map() };

  // Register only the layouts the document uses (keeps files small and deterministic).
  for (const slide of doc.slides) {
    const layout = findLayout(master, slide.layout);
    if (!layout) throw new Error(`Disposition « ${slide.layout} » introuvable (diapositive « ${slide.id} »)`);
    if (stats.layoutsUsed.includes(layout.id)) continue;
    stats.layoutsUsed.push(layout.id);
    const def = layoutToSlideMaster(layout, master, doc, opts.masterDir) as { background?: { path?: string }; objects: Record<string, { path?: string }>[] };
    const media: string[] = [];
    for (const p of [def.background?.path, ...def.objects.map((o) => o.image?.path)]) if (p && !media.includes(p)) media.push(p);
    stats.layoutMedia.set(layout.id, media);
    pres.defineSlideMaster(def as unknown as Parameters<PptxGen['defineSlideMaster']>[0]);
  }

  for (const slide of doc.slides) {
    const rs = resolveSlide(slide, master);
    const s = pres.addSlide({ masterName: rs.layout!.id });
    stats.slides++;
    if (slide.notes) s.addNotes(slide.notes);
    if (slide.hidden) s.hidden = true;
    for (const r of rs.elements) {
      const el = r.element;
      if (el.hidden) continue;
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
          if (el.style?.fill || el.style?.line) Object.assign(opts2, fillLine(r));
          s.addText(textRuns(r, el.paragraphs, master) as never, opts2 as never);
          stats.nativeText++;
          if (bound) stats.placeholderBound++;
          break;
        }
        case 'shape': {
          const base = { ...common, ...fillLine(r), ...(el.flipH ? { flipH: true } : {}), ...(el.flipV ? { flipV: true } : {}) };
          if (el.shape === 'roundRect' || el.shape === 'snip1Rect') (base as Record<string, unknown>).rectRadius = r.style.radius ?? Math.min(r.box.w, r.box.h) * 0.15;
          // Preset names are the OOXML prstGeom names; `line` is pptxgenjs' straight line.
          if (el.paragraphs?.length) {
            s.addText(textRuns(r, el.paragraphs, master) as never, { ...base, ...textBoxOptions(r), shape: el.shape } as never);
          } else s.addShape(el.shape as never, base as never);
          stats.nativeShapes++;
          break;
        }
        case 'image': {
          const file = renderedImageSrc(el.src);
          const path = isAbsolute(file) ? file : join(opts.sourceDir, file);
          s.addImage({ ...boxOptions(r), path, ...(el.alt ? { altText: el.alt } : {}), objectName: el.id } as never);
          stats.nativeImages++;
          break;
        }
        case 'connector': {
          if (!r.path) {
            stats.unsupported.push(`${slide.id}/${el.id} : connecteur sans extrémités (« ${el.from} » → « ${el.to} »)`);
            break;
          }
          const g = connectorShape(r);
          const byId = new Map(rs.elements.map((x) => [x.element.id, x.element]));
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
            ...(rectLike(byId.get(from)) ? { start: { shape: from, site: RECT_SITES[fromSide] } } : {}),
            ...(rectLike(byId.get(to)) ? { end: { shape: to, site: RECT_SITES[toSide] } } : {}),
            line: Object.fromEntries(Object.entries(line).filter(([, v]) => v !== undefined)),
          } as never);
          stats.nativeShapes++;
          break;
        }
        case 'table': {
          const header = el.header !== false;
          const head = resolveColor('theme.accent1', master) ?? '3E4A83';
          const rows = el.rows.map((row, ri) =>
            row.map((text, ci) => ({ text, options: { ...(ri === 0 && header ? { bold: true, color: 'FFFFFF', fill: { color: head } } : {}), ...(el.colAlign?.[ci] ? { align: el.colAlign[ci] } : {}) } })),
          );
          const cols = Math.max(...el.rows.map((x) => x.length));
          s.addTable(rows as never, {
            ...boxOptions(r),
            fontFace: r.style.fontFace,
            fontSize: el.style?.fontSize ?? 12,
            color: r.style.color,
            border: { type: 'solid', pt: 0.5, color: resolveColor('theme.dk1.lighter60', master) ?? 'A8A8A8' },
            colW: tableWeights(el.colWidths, cols).map((f) => f * r.box.w),
            ...(el.rowHeights ? { rowH: tableWeights(el.rowHeights, el.rows.length).map((f) => f * r.box.h) } : {}),
            valign: el.style?.valign ?? 'middle',
          } as never);
          stats.nativeTables++;
          break;
        }
      }
    }
  }
  return { pres, stats };
}
