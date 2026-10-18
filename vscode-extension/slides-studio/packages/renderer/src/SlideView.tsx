import { memo, type CSSProperties, type ReactNode } from 'react';
import {
  isDiagramSrc,
  CSS_PX_PER_INCH,
  numberLabel,
  paragraphLook,
  resolveSlide,
  tableWeights,
  type CorporateMaster,
  type LayoutDef,
  type Paragraph,
  type ResolvedElement,
  type SlideNode,
  type StaticObject,
} from '@corporate-slides/core';

/** px per inch in the unscaled slide space; zoom is applied with a CSS transform. */
export const PPI = CSS_PX_PER_INCH;
const px = (inch: number) => inch * PPI;
const ptPx = (pt: number) => (pt / 72) * PPI;
const hex = (c: string | null | undefined) => (c ? `#${c}` : 'transparent');

export interface AssetResolver {
  /** URL for a master asset id (preview PNG for EMF/WMF), or null when not displayable. */
  masterAsset(id: string): string | null;
  /** URL for a presentation image source path. */
  image(src: string): string | null;
}

export interface SlideViewProps {
  slide: SlideNode;
  master: CorporateMaster;
  assets: AssetResolver;
  metadata?: { footer?: string; date?: string };
  slideNumber?: number;
  /** Show dashed outlines of empty layout placeholders. */
  showPlaceholders?: boolean;
  /** Element currently edited inline: rendered by `renderEditor` instead. */
  editingId?: string | null;
  renderEditor?: (r: ResolvedElement) => ReactNode;
  /** Extra layer rendered above the content in slide coordinates (selection, guides…). */
  overlay?: ReactNode;
  onElementPointerDown?: (e: React.PointerEvent, r: ResolvedElement) => void;
  onElementDoubleClick?: (e: React.MouseEvent, r: ResolvedElement) => void;
}

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

export function ParagraphsView({ r, paragraphs, master }: { r: ResolvedElement; paragraphs: Paragraph[]; master: CorporateMaster }) {
  const counters: number[] = [];
  return (
    <>
      {paragraphs.map((p, i) => {
        const look = paragraphLook(r, p);
        const level = p.level ?? 0;
        let marker: string | null = null;
        if (look.bullet) {
          if (look.bullet.numbered) {
            counters.length = level + 1;
            counters[level] = (counters[level] ?? 0) + 1;
            marker = numberLabel(counters[level]!, r.style.numbering);
          } else marker = look.bullet.char ?? '•';
        } else counters.length = 0;
        const style: CSSProperties = {
          position: 'relative',
          margin: 0,
          paddingLeft: px(look.indent),
          marginTop: i === 0 ? 0 : ptPx(4),
          fontSize: ptPx(look.fontSize),
          color: hex(look.color),
          fontWeight: look.bold ? 700 : 400,
          minHeight: `${1.2 * r.style.lineSpacing}em`,
        };
        return (
          <p key={i} style={style}>
            {marker && (
              <span aria-hidden style={{ position: 'absolute', left: px(look.indent - look.hanging), width: px(look.hanging), color: hex(look.bullet!.color), fontWeight: 400 }}>
                {marker}
              </span>
            )}
            {p.runs.map((run, k) => (
              <span
                key={k}
                style={{
                  fontWeight: run.bold ? 700 : undefined,
                  fontStyle: run.italic || r.style.italic ? 'italic' : undefined,
                  textDecoration: run.underline || r.style.underline ? 'underline' : undefined,
                  color: run.color ? hex(run.color.startsWith('theme.') ? (resolveRunColor(run.color, master) ?? look.color) : run.color.replace('#', '')) : undefined,
                }}
              >
                {run.text}
              </span>
            ))}
            {!p.runs.length && '​'}
          </p>
        );
      })}
    </>
  );
}

function resolveRunColor(token: string, master: CorporateMaster): string | null {
  const [, slot, variant] = token.split('.');
  if (!slot) return null;
  return (variant ? master.theme.palette[slot]?.[variant] : master.theme.colors[slot]) ?? null;
}

export function textBoxStyle(r: ResolvedElement): CSSProperties {
  const [mt, mr, mb, ml] = r.style.margin;
  return {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: r.style.valign === 'middle' ? 'center' : r.style.valign === 'bottom' ? 'flex-end' : 'flex-start',
    padding: `${px(mt)}px ${px(mr)}px ${px(mb)}px ${px(ml)}px`,
    fontFamily: `"${r.style.fontFace}", Arial, sans-serif`,
    textAlign: r.style.align,
    lineHeight: 1.2 * r.style.lineSpacing,
    overflowWrap: 'break-word',
    whiteSpace: 'pre-wrap',
  };
}

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

/** Regular polygon (or star when `inner` is given) inscribed in the box, first point at the top. */
function polygon(n: number, w: number, h: number, inner?: number): string {
  const pts: string[] = [];
  const count = inner ? n * 2 : n;
  for (let i = 0; i < count; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    const k = inner && i % 2 ? inner : 1;
    pts.push(`${w / 2 + (w / 2) * k * Math.cos(a)} ${h / 2 + (h / 2) * k * Math.sin(a)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

/** SVG path of a preset geometry in a w×h box (px). `radius` is the corner size in px. */
export function shapePath(kind: string, w: number, h: number, radius = Math.min(w, h) * 0.15): string {
  const m = Math.min(w, h);
  const head = Math.min(w * 0.5, h * 0.5);
  switch (kind) {
    case 'triangle':
      return `M ${w / 2} 0 L ${w} ${h} L 0 ${h} Z`;
    case 'rtTriangle':
      return `M 0 0 L 0 ${h} L ${w} ${h} Z`;
    case 'diamond':
      return `M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z`;
    case 'parallelogram':
      return `M ${m * 0.25} 0 L ${w} 0 L ${w - m * 0.25} ${h} L 0 ${h} Z`;
    case 'trapezoid':
      return `M ${m * 0.25} 0 L ${w - m * 0.25} 0 L ${w} ${h} L 0 ${h} Z`;
    case 'pentagon':
      return polygon(5, w, h);
    case 'star5':
      return polygon(5, w, h, 0.38);
    case 'hexagon': {
      const a = m * 0.25;
      return `M ${a} 0 L ${w - a} 0 L ${w} ${h / 2} L ${w - a} ${h} L ${a} ${h} L 0 ${h / 2} Z`;
    }
    case 'octagon': {
      const a = m * 0.29;
      return `M ${a} 0 L ${w - a} 0 L ${w} ${a} L ${w} ${h - a} L ${w - a} ${h} L ${a} ${h} L 0 ${h - a} L 0 ${a} Z`;
    }
    case 'plus': {
      const a = m * 0.25;
      return `M ${a} 0 L ${w - a} 0 L ${w - a} ${a} L ${w} ${a} L ${w} ${h - a} L ${w - a} ${h - a} L ${w - a} ${h} L ${a} ${h} L ${a} ${h - a} L 0 ${h - a} L 0 ${a} L ${a} ${a} Z`;
    }
    case 'donut': {
      const d = m * 0.25;
      const ell = (rx: number, ry: number) => `M ${w / 2 - rx} ${h / 2} a ${rx} ${ry} 0 1 0 ${2 * rx} 0 a ${rx} ${ry} 0 1 0 ${-2 * rx} 0 Z`;
      return `${ell(w / 2, h / 2)} ${ell(Math.max(0, w / 2 - d), Math.max(0, h / 2 - d))}`;
    }
    case 'can': {
      const ry = m * 0.125;
      return `M 0 ${ry} A ${w / 2} ${ry} 0 0 1 ${w} ${ry} L ${w} ${h - ry} A ${w / 2} ${ry} 0 0 1 0 ${h - ry} Z`;
    }
    case 'cube': {
      const d = m * 0.25;
      return `M 0 ${d} L ${d} 0 L ${w} 0 L ${w} ${h - d} L ${w - d} ${h} L 0 ${h} Z`;
    }
    case 'rightArrow':
      return `M 0 ${h * 0.25} L ${w - head} ${h * 0.25} L ${w - head} 0 L ${w} ${h / 2} L ${w - head} ${h} L ${w - head} ${h * 0.75} L 0 ${h * 0.75} Z`;
    case 'leftArrow':
      return `M ${w} ${h * 0.25} L ${head} ${h * 0.25} L ${head} 0 L 0 ${h / 2} L ${head} ${h} L ${head} ${h * 0.75} L ${w} ${h * 0.75} Z`;
    case 'upArrow':
      return `M ${w * 0.25} ${h} L ${w * 0.25} ${head} L 0 ${head} L ${w / 2} 0 L ${w} ${head} L ${w * 0.75} ${head} L ${w * 0.75} ${h} Z`;
    case 'downArrow':
      return `M ${w * 0.25} 0 L ${w * 0.25} ${h - head} L 0 ${h - head} L ${w / 2} ${h} L ${w} ${h - head} L ${w * 0.75} ${h - head} L ${w * 0.75} 0 Z`;
    case 'leftRightArrow': {
      const hd = Math.min(w * 0.25, h * 0.5);
      return `M 0 ${h / 2} L ${hd} 0 L ${hd} ${h * 0.25} L ${w - hd} ${h * 0.25} L ${w - hd} 0 L ${w} ${h / 2} L ${w - hd} ${h} L ${w - hd} ${h * 0.75} L ${hd} ${h * 0.75} L ${hd} ${h} Z`;
    }
    case 'chevron':
      return `M 0 0 L ${w - head} 0 L ${w} ${h / 2} L ${w - head} ${h} L 0 ${h} L ${head} ${h / 2} Z`;
    case 'homePlate':
      return `M 0 0 L ${w - head} 0 L ${w} ${h / 2} L ${w - head} ${h} L 0 ${h} Z`;
    case 'flowChartDocument':
      return `M 0 0 L ${w} 0 L ${w} ${h * 0.83} C ${w * 0.72} ${h * 0.66} ${w * 0.5} ${h * 1.06} 0 ${h * 0.9} Z`;
    case 'wedgeRectCallout':
      return `M 0 0 L ${w} 0 L ${w} ${h} L ${w * 0.4167} ${h} L ${w * 0.2917} ${h * 1.125} L ${w * 0.1667} ${h} L 0 ${h} Z`;
    case 'snip1Rect': {
      const r = Math.min(radius, m / 2);
      return `M 0 0 L ${w - r} 0 L ${w} ${r} L ${w} ${h} L 0 ${h} Z`;
    }
    default:
      return '';
  }
}

/** SVG marker for an arrowhead, sized relative to the stroke like PowerPoint's "medium" heads. */
function ArrowMarker({ id, kind, color, start }: { id: string; kind: string; color: string; start?: boolean }) {
  if (kind === 'none') return null;
  const shape =
    kind === 'arrow' ? <path d="M 0 0 L 10 5 L 0 10" fill="none" stroke={color} strokeWidth={1.5} /> :
    kind === 'stealth' ? <path d="M 0 0 L 10 5 L 0 10 L 3 5 Z" fill={color} /> :
    kind === 'diamond' ? <path d="M 0 5 L 5 0 L 10 5 L 5 10 Z" fill={color} /> :
    kind === 'oval' ? <circle cx={5} cy={5} r={4} fill={color} /> :
    <path d="M 0 0 L 10 5 L 0 10 Z" fill={color} />;
  return (
    <marker id={id} viewBox="0 0 10 10" refX={kind === 'diamond' || kind === 'oval' ? 5 : 9} refY={5} markerWidth={4} markerHeight={4} markerUnits="strokeWidth" orient={start ? 'auto-start-reverse' : 'auto'}>
      {shape}
    </marker>
  );
}

/** Path data of a connector in its own box (px), following its routing. */
export function connectorD(r: ResolvedElement): string {
  const p = r.path!;
  const route = r.element.type === 'connector' ? r.element.route : undefined;
  const x1 = px(p.x1 - r.box.x), y1 = px(p.y1 - r.box.y), x2 = px(p.x2 - r.box.x), y2 = px(p.y2 - r.box.y);
  const horiz = (s: string) => s === 'left' || s === 'right';
  if (route === 'elbow') {
    if (horiz(p.fromSide) && horiz(p.toSide)) return `M ${x1} ${y1} H ${(x1 + x2) / 2} V ${y2} H ${x2}`;
    if (!horiz(p.fromSide) && !horiz(p.toSide)) return `M ${x1} ${y1} V ${(y1 + y2) / 2} H ${x2} V ${y2}`;
    return horiz(p.fromSide) ? `M ${x1} ${y1} H ${x2} V ${y2}` : `M ${x1} ${y1} V ${y2} H ${x2}`;
  }
  if (route === 'curved') {
    const d = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) / 2;
    const out = (s: string, x: number, y: number) => (s === 'left' ? [x - d, y] : s === 'right' ? [x + d, y] : s === 'top' ? [x, y - d] : [x, y + d]);
    const [c1x, c1y] = out(p.fromSide, x1, y1), [c2x, c2y] = out(p.toSide, x2, y2);
    return `M ${x1} ${y1} C ${c1x} ${c1y} ${c2x} ${c2y} ${x2} ${y2}`;
  }
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

/** Lines and connectors: stroke with arrowheads, plus a wide invisible hit area. */
function StrokeSvg({ r, d }: { r: ResolvedElement; d: string }) {
  const s = r.style;
  const color = hex(s.line ?? s.color);
  const sw = Math.max(1, ptPx(s.lineWidth));
  const dash = s.dash === 'dash' ? `${sw * 4} ${sw * 3}` : s.dash === 'dot' ? `${sw} ${sw * 2}` : undefined;
  const id = `arr-${r.element.id}`;
  return (
    <svg width={Math.max(px(r.box.w), 1)} height={Math.max(px(r.box.h), 1)} style={{ position: 'absolute', inset: 0, overflow: 'visible' }}>
      <defs>
        <ArrowMarker id={`${id}-s`} kind={s.startArrow} color={color} start />
        <ArrowMarker id={`${id}-e`} kind={s.endArrow} color={color} />
      </defs>
      <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(12, sw + 8)} style={{ pointerEvents: 'stroke' }} />
      <path d={d} fill="none" stroke={color} strokeWidth={sw} strokeDasharray={dash} strokeLinejoin="round" markerStart={s.startArrow !== 'none' ? `url(#${id}-s)` : undefined} markerEnd={s.endArrow !== 'none' ? `url(#${id}-e)` : undefined} />
    </svg>
  );
}

function ShapeSvg({ r }: { r: ResolvedElement }) {
  const el = r.element;
  if (el.type !== 'shape') return null;
  const w = px(r.box.w);
  const h = px(r.box.h);
  const s = r.style;
  if (el.shape === 'line') return <StrokeSvg r={r} d={`M 0 ${el.flipV ? h : 0} L ${w} ${el.flipV ? 0 : h}`} />;
  const stroke = s.line ? hex(s.line) : 'none';
  const sw = s.line ? ptPx(s.lineWidth) : 0;
  const dash = s.dash === 'dash' ? `${sw * 4} ${sw * 3}` : s.dash === 'dot' ? `${sw} ${sw * 2}` : undefined;
  const fill = s.fill ? hex(s.fill) : 'none';
  const fillOpacity = 1 - s.transparency / 100;
  const common = { fill, fillOpacity, stroke, strokeWidth: sw, strokeDasharray: dash, vectorEffect: 'non-scaling-stroke' as const };
  const radius = Math.min(s.radius === null ? Math.min(w, h) * 0.15 : px(s.radius), Math.min(w, h) / 2);
  let shape: ReactNode;
  if (el.shape === 'rect') shape = <rect x={0} y={0} width={w} height={h} {...common} />;
  else if (el.shape === 'roundRect') shape = <rect x={0} y={0} width={w} height={h} rx={radius} ry={radius} {...common} />;
  else if (el.shape === 'flowChartTerminator') shape = <rect x={0} y={0} width={w} height={h} rx={Math.min(w, h) / 2} ry={Math.min(w, h) / 2} {...common} />;
  else if (el.shape === 'ellipse') shape = <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...common} />;
  else if (el.shape === 'can') {
    const ry = Math.min(w, h) * 0.125;
    shape = (
      <>
        <path d={shapePath('can', w, h)} {...common} />
        <ellipse cx={w / 2} cy={ry} rx={w / 2} ry={ry} {...common} />
        <ellipse cx={w / 2} cy={ry} rx={w / 2} ry={ry} fill="#fff" fillOpacity={0.25} />
      </>
    );
  } else if (el.shape === 'cube') {
    const d = Math.min(w, h) * 0.25;
    shape = (
      <>
        <path d={shapePath('cube', w, h)} {...common} />
        <path d={`M 0 ${d} L ${d} 0 L ${w} 0 L ${w - d} ${d} Z`} fill="#fff" fillOpacity={0.3} />
        <path d={`M ${w - d} ${d} L ${w} 0 L ${w} ${h - d} L ${w - d} ${h} Z`} fill="#000" fillOpacity={0.2} />
        <path d={`M 0 ${d} L ${w - d} ${d} L ${w} 0 M ${w - d} ${d} L ${w - d} ${h}`} fill="none" stroke={stroke} strokeWidth={sw} />
      </>
    );
  } else shape = <path d={shapePath(el.shape, w, h, radius)} fillRule="evenodd" {...common} />;
  const flip = [el.flipH ? 'scaleX(-1)' : '', el.flipV ? 'scaleY(-1)' : ''].join(' ').trim();
  return (
    <svg width={Math.max(w, 1)} height={Math.max(h, 1)} style={{ position: 'absolute', inset: 0, overflow: 'visible', transform: flip || undefined }}>
      {shape}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Static layout objects (pptx-masters format)                          */
/* ------------------------------------------------------------------ */

function StaticObjectView({ o, assets, metadata }: { o: StaticObject; assets: AssetResolver; metadata?: SlideViewProps['metadata'] }) {
  const [kind, raw] = Object.entries(o.object)[0] ?? [];
  const v = (raw ?? {}) as Record<string, unknown>;
  const opts = (kind === 'text' ? (v.options as Record<string, unknown>) : v) ?? {};
  const n = (k: string) => (typeof opts[k] === 'number' ? (opts[k] as number) : 0);
  const box: CSSProperties = { position: 'absolute', left: px(n('x')), top: px(n('y')), width: px(n('w')), height: px(n('h')), transform: opts.rotate ? `rotate(${opts.rotate}deg)` : undefined };
  if (kind === 'rect') {
    const fill = (v.fill as { color?: string; transparency?: number } | undefined) ?? {};
    const line = v.line as { color?: string; width?: number } | undefined;
    return <div style={{ ...box, background: hex(fill.color), opacity: fill.transparency ? 1 - fill.transparency / 100 : undefined, border: line?.color ? `${ptPx(line.width ?? 1)}px solid #${line.color}` : undefined, borderRadius: v.rectRadius ? px(v.rectRadius as number) : undefined }} />;
  }
  if (kind === 'line') {
    const line = (v.line as { color?: string; width?: number }) ?? {};
    return (
      <svg style={{ ...box, overflow: 'visible' }}>
        <line x1={0} y1={0} x2={px(n('w'))} y2={px(n('h'))} stroke={hex(line.color ?? '000000')} strokeWidth={ptPx(line.width ?? 1)} />
      </svg>
    );
  }
  if (kind === 'image') {
    const url = o.assetId ? assets.masterAsset(o.assetId) : null;
    if (!url) return <div style={{ ...box, background: 'repeating-linear-gradient(45deg, #0001 0 6px, #0002 6px 12px)' }} title="Image non prévisualisable" />;
    const c = o.crop;
    if (!c) return <img src={url} alt="" draggable={false} style={{ ...box, objectFit: 'fill' }} />;
    const W = px(n('w')), H = px(n('h'));
    const iw = W / Math.max(0.01, 1 - c.l - c.r), ih = H / Math.max(0.01, 1 - c.t - c.b);
    return (
      <div style={{ ...box, overflow: 'hidden' }}>
        <img src={url} alt="" draggable={false} style={{ position: 'absolute', left: -c.l * iw, top: -c.t * ih, width: iw, height: ih, maxWidth: 'none' }} />
      </div>
    );
  }
  if (kind === 'text') {
    let text = typeof v.text === 'string' ? v.text : Array.isArray(v.text) ? (v.text as { text?: string }[]).map((t) => t.text ?? '').join('') : '';
    if (o.role === 'footer') text = metadata?.footer ?? '';
    if (o.role === 'date') text = metadata?.date ?? '';
    if (!text) return null;
    const m = (Array.isArray(opts.margin) ? opts.margin : [0.05, 0.1, 0.05, 0.1]) as number[];
    return (
      <div
        style={{
          ...box,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: opts.valign === 'middle' ? 'center' : opts.valign === 'bottom' ? 'flex-end' : 'flex-start',
          padding: `${px(m[0] ?? 0)}px ${px(m[1] ?? 0)}px ${px(m[2] ?? 0)}px ${px(m[3] ?? 0)}px`,
          fontFamily: `"${(opts.fontFace as string) ?? 'Arial'}", Arial, sans-serif`,
          fontSize: ptPx((opts.fontSize as number) ?? 18),
          color: hex((opts.color as string) ?? '000000'),
          fontWeight: opts.bold ? 700 : 400,
          textAlign: (opts.align as CSSProperties['textAlign']) ?? 'left',
          lineHeight: 1.2,
          whiteSpace: 'pre-wrap',
          background: (opts.fill as { color?: string } | undefined)?.color ? hex((opts.fill as { color: string }).color) : undefined,
        }}
      >
        {text}
      </div>
    );
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Elements                                                            */
/* ------------------------------------------------------------------ */

export function elementBoxStyle(r: ResolvedElement): CSSProperties {
  return {
    position: 'absolute',
    left: px(r.box.x),
    top: px(r.box.y),
    width: Math.max(px(r.box.w), 1),
    height: Math.max(px(r.box.h), 1),
    transform: r.element.rotation ? `rotate(${r.element.rotation}deg)` : undefined,
  };
}

/** Box decoration of a text element (fill/border), also kept under the inline editor. */
const textChrome = (r: ResolvedElement): CSSProperties => ({
  background: r.element.style?.fill ? hex(r.style.fill) : undefined,
  border: r.element.style?.line ? `${ptPx(r.style.lineWidth)}px solid ${hex(r.style.line)}` : undefined,
});

/** What stays visible behind the inline text editor: the shape geometry or the text box decoration. */
function EditingBackdrop({ r }: { r: ResolvedElement }) {
  if (r.element.type === 'shape') return <ShapeSvg r={r} />;
  return <div style={{ position: 'absolute', inset: 0, ...textChrome(r) }} />;
}

function ElementView({ r, master, assets }: { r: ResolvedElement; master: CorporateMaster; assets: AssetResolver }) {
  const el = r.element;
  const s = r.style;
  switch (el.type) {
    case 'text':
      return (
        <div style={{ ...textBoxStyle(r), ...textChrome(r) }}>
          <ParagraphsView r={r} paragraphs={el.paragraphs} master={master} />
        </div>
      );
    case 'shape':
      return (
        <>
          <ShapeSvg r={r} />
          {el.paragraphs?.length ? (
            <div style={textBoxStyle(r)}>
              <ParagraphsView r={r} paragraphs={el.paragraphs} master={master} />
            </div>
          ) : null}
        </>
      );
    case 'image': {
      const url = assets.image(el.src);
      return url ? (
        <img src={url} alt={el.alt ?? ''} draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }} />
      ) : (
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'repeating-linear-gradient(45deg,#8881 0 8px,#8882 8px 16px)', color: '#666', fontSize: 14, fontFamily: 'system-ui' }}>
          {isDiagramSrc(el.src) ? `Diagramme non rendu : ${el.src}` : `Image introuvable : ${el.src}`}
        </div>
      );
    }
    case 'connector':
      return r.path ? <StrokeSvg r={r} d={connectorD(r)} /> : null;
    case 'table': {
      const cols = Math.max(...el.rows.map((x) => x.length));
      const head = master.theme.colors.accent1 ?? '3E4A83';
      const rowF = tableWeights(el.rowHeights, el.rows.length);
      return (
        <table style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: `"${s.fontFace}", Arial, sans-serif`, fontSize: ptPx(el.style?.fontSize ?? 12), color: hex(s.color) }}>
          <colgroup>
            {tableWeights(el.colWidths, cols).map((f, ci) => (
              <col key={ci} style={{ width: `${f * 100}%` }} />
            ))}
          </colgroup>
          <tbody>
            {el.rows.map((row, ri) => (
              <tr key={ri} style={el.rowHeights ? { height: `${rowF[ri]! * 100}%` } : undefined}>
                {Array.from({ length: cols }, (_, ci) => (
                  <td key={ci} data-cell={`${ri}:${ci}`} style={{ border: `0.5pt solid #${master.theme.palette.dk1?.lighter60 ?? 'A8A8A8'}`, padding: '0 8px', verticalAlign: el.style?.valign ?? 'middle', textAlign: el.colAlign?.[ci] ?? undefined, ...(ri === 0 && el.header !== false ? { background: `#${head}`, color: '#fff', fontWeight: 700 } : {}) }}>
                    {row[ci] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* Slide                                                               */
/* ------------------------------------------------------------------ */

export function LayoutBackground({ layout, master, assets, metadata, slideNumber }: { layout: LayoutDef | undefined; master: CorporateMaster; assets: AssetResolver; metadata?: SlideViewProps['metadata']; slideNumber?: number }) {
  if (!layout) return null;
  const bgAsset = layout.background.assetId ? assets.masterAsset(layout.background.assetId) : null;
  const sn = layout.slideNumber as Record<string, number | string> | null;
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, background: bgAsset ? `center / cover url("${bgAsset}")` : hex(layout.background.color ?? 'FFFFFF') }} />
      {layout.objects.map((o, i) => (
        <StaticObjectView key={i} o={o} assets={assets} metadata={metadata} />
      ))}
      {sn && slideNumber !== undefined && (
        <div
          style={{
            position: 'absolute',
            left: px(Number(sn.x ?? 0)),
            top: px(Number(sn.y ?? 0)),
            width: px(Number(sn.w ?? 0.5)),
            height: px(Number(sn.h ?? 0.3)),
            fontFamily: `"${sn.fontFace ?? master.theme.fonts.body}", Arial, sans-serif`,
            fontSize: ptPx(Number(sn.fontSize ?? 10)),
            color: hex(String(sn.color ?? '000000')),
            textAlign: (sn.align as CSSProperties['textAlign']) ?? 'right',
            padding: `${px(0.05)}px ${px(0.1)}px`,
          }}
        >
          {slideNumber}
        </div>
      )}
    </>
  );
}

export const SlideView = memo(function SlideView(props: SlideViewProps) {
  const { slide, master, assets } = props;
  const rs = resolveSlide(slide, master);
  const bound = new Set(rs.elements.map((r) => r.placeholder?.key).filter(Boolean));
  return (
    <div
      className="css-slide"
      data-slide-id={slide.id}
      style={{ position: 'relative', width: px(master.dimensions.width), height: px(master.dimensions.height), overflow: 'hidden', background: '#fff', isolation: 'isolate' }}
    >
      <LayoutBackground layout={rs.layout} master={master} assets={assets} metadata={props.metadata} slideNumber={props.slideNumber} />
      {props.showPlaceholders &&
        rs.layout?.placeholders
          .filter((p) => !bound.has(p.key))
          .map((p) => (
            <div
              key={p.key}
              data-placeholder={p.key}
              style={{ position: 'absolute', left: px(p.x), top: px(p.y), width: px(p.w), height: px(p.h), outline: '1.5px dashed #8a8f9877', outlineOffset: -1, color: '#8a8f98', font: '600 13px system-ui', padding: 6, pointerEvents: 'none' }}
            >
              {p.key}
            </div>
          ))}
      {rs.elements.map((r) =>
        r.element.hidden ? null : (
          <div
            key={r.element.id}
            data-element-id={r.element.id}
            style={elementBoxStyle(r)}
            onPointerDown={props.onElementPointerDown ? (e) => props.onElementPointerDown!(e, r) : undefined}
            onDoubleClick={props.onElementDoubleClick ? (e) => props.onElementDoubleClick!(e, r) : undefined}
          >
            {props.editingId === r.element.id && props.renderEditor ? (
              <>
                <EditingBackdrop r={r} />
                {props.renderEditor(r)}
              </>
            ) : (
              <ElementView r={r} master={master} assets={assets} />
            )}
          </div>
        ),
      )}
      {props.overlay}
    </div>
  );
});

/** Layout preview without content (master browser, layout pickers). */
export function LayoutPreview({ layout, master, assets }: { layout: LayoutDef; master: CorporateMaster; assets: AssetResolver }) {
  return (
    <div style={{ position: 'relative', width: px(master.dimensions.width), height: px(master.dimensions.height), overflow: 'hidden', background: '#fff' }}>
      <LayoutBackground layout={layout} master={master} assets={assets} />
      {layout.placeholders.map((p) => (
        <div key={p.key} style={{ position: 'absolute', left: px(p.x), top: px(p.y), width: px(p.w), height: px(p.h), outline: '2px dashed #8a8f98', outlineOffset: -2, color: '#6b7079', font: '600 22px system-ui', padding: 10 }}>
          {p.key}
        </div>
      ))}
    </div>
  );
}
