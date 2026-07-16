import { memo, useEffect, useRef, useState } from 'react'
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react'
import type { NodeShape, IconKind } from '@/core/notation'
import type { PertNodeValues, ChartFrame, TreeRow, GridFrame, AnalyticChartFrame } from '@/core/layout'
import { GANTT_AXIS_H } from '@/core/layout'
import type { IshikawaFrame, GanttFrame } from '../model-to-flow'
import { TreeGraphView } from './TreeGraphView'
import { GridGraphView } from './GridGraphView'
import { UmlClassBody, ErdEntityBody, NoteBody } from './UmlErdBodies'
import { NodeIcon } from './NodeIcons'
import { AnalyticChartView } from './AnalyticChartView'
import { cn } from '@/ui/primitives/cn'
import { useModelStore } from '@/store'

export interface GraphNodeData extends Record<string, unknown> {
  label: string
  elementType: string
  notation: string
  description?: string
  technology?: string
  tags?: string[]
  shape: NodeShape
  fill: string
  stroke: string
  text: string
  accent: string
  customAccent?: boolean
  icon: IconKind
  iconSrc?: string
  width: number
  height: number
  isContainer?: boolean
  /** CPM values when this node belongs to a PERT chart */
  pert?: PertNodeValues
  /** 0..100 completion for Gantt bars */
  progress?: number
  /** small badge above a dot node (e.g. a commit's `tag "v1.0"` property) */
  badge?: string
  /** element properties passed through for shapes that read them (quadrantChart labels) */
  chartProps?: Record<string, string>
  /** fishbone frame when this node is an ishikawa `problem` container */
  ishikawa?: IshikawaFrame
  /** timeline-axis frame when this node is a `ganttGraph` container */
  ganttGraph?: GanttFrame
  /** decor (lifelines/spine/lanes) when this node is a seq/git/timeline container */
  chartFrame?: ChartFrame
  /** zero-based topic depth inside a mind map */
  mindmapDepth?: number
  /** file-tree forest when this node is a `treeGraph` container */
  tree?: TreeRow[]
  /** matrix frame when this node is a `gridGraph` container */
  grid?: GridFrame
  /** Arrow endpoint relative to this item's centre, derived from its `projection`. */
  projection?: { dx: number; dy: number }
  analyticChart?: AnalyticChartFrame
}

/** Renders a raster glyph (iconSrc) when present, else the built-in SVG icon. */
function Glyph({ iconSrc, icon, color, size }: { iconSrc?: string; icon: IconKind; color: string; size: number }) {
  if (iconSrc) {
    return <img src={iconSrc} alt="" width={size} height={size} draggable={false} style={{ objectFit: 'contain' }} />
  }
  if (icon !== 'none') return <NodeIcon kind={icon} color={color} size={size} />
  return null
}

function Handles({ stroke, prominent = false }: { stroke: string; prominent?: boolean }) {
  // Keep node-level handles above embedded SVG/chart interaction layers.
  const cls = `!z-50 !border-2 !bg-zinc-50 dark:!bg-zinc-900 ${prominent ? '!h-4 !w-4' : '!h-2.5 !w-2.5'}`
  const style = { borderColor: stroke }
  return (
    <>
      <Handle id="t" type="source" position={Position.Top} className={cls} style={style} />
      <Handle id="b" type="source" position={Position.Bottom} className={cls} style={style} />
      <Handle id="l" type="source" position={Position.Left} className={cls} style={style} />
      <Handle id="r" type="source" position={Position.Right} className={cls} style={style} />
    </>
  )
}

function ProjectionArrow({ projection, width, height }: {
  projection?: { dx: number; dy: number }
  width: number
  height: number
}) {
  if (!projection) return null
  const cx = width / 2
  const cy = height / 2
  const distance = Math.hypot(projection.dx, projection.dy)
  if (distance < 2) return null
  // Start at the item boundary so the line does not cross its label/fill.
  const boundaryScale = 1 / Math.sqrt(
    (projection.dx / Math.max(1, cx)) ** 2 + (projection.dy / Math.max(1, cy)) ** 2,
  )
  return (
    <svg className="pointer-events-none absolute inset-0 z-0 overflow-visible" width={width} height={height} aria-hidden>
      <line
        x1={cx + projection.dx * boundaryScale}
        y1={cy + projection.dy * boundaryScale}
        x2={cx + projection.dx}
        y2={cy + projection.dy}
        stroke="var(--edge)"
        strokeWidth={1.6}
        strokeLinecap="round"
        markerEnd="url(#gms-arrow-open)"
      />
    </svg>
  )
}

/** Meta line shown under a node label: "description / technology #tags".
 *  Falls back to the «type» badge when there is no description/technology/tags. */
function metaText(data: GraphNodeData): string | null {
  const main = [data.description, data.technology].filter(Boolean).join(' / ')
  const tags = (data.tags ?? []).filter(Boolean).map(t => `#${t}`).join(' ')
  const meta = [main, tags].filter(Boolean).join('  ')
  if (meta) return meta
  if (data.notation === 'c4' || data.notation === 'archimate' || data.notation === 'bpmn') return `«${data.elementType}»`
  return null
}

function SpecialGraphHeader({ data, stroke, accent }: { data: GraphNodeData; stroke: string; accent: string }) {
  const meta = metaText(data)
  return <div className="flex min-h-8 flex-col justify-center px-2.5 py-1" style={{ background: accent + '22', borderBottom: `1px solid ${stroke}55`, color: data.text }}>
    <span className="truncate text-[11px] font-bold uppercase tracking-wide">{data.label}</span>
    {meta && <span className="truncate text-[9px] font-normal opacity-70">{meta}</span>}
  </div>
}

function Label({ data, small }: { data: GraphNodeData; small?: boolean }) {
  const { label, text } = data
  const sub = metaText(data)
  return (
    <div className="flex flex-col items-center justify-center px-2 text-center leading-tight">
      <span className={cn('font-semibold', small ? 'text-[10px]' : 'text-xs')} style={{ color: text }}>
        {label}
      </span>
      {sub && !small && (
        <span className="mt-0.5 line-clamp-2 text-[9px] opacity-70" style={{ color: text }}>{sub}</span>
      )}
    </div>
  )
}

/** Inline rename overlay shown when this node is being edited. */
function NameEditor({ id, initial, atTop }: { id: string; initial: string; atTop?: boolean }) {
  const dispatch = useModelStore(s => s.dispatch)
  const setEditingElement = useModelStore(s => s.setEditingElement)
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  const commit = () => {
    const v = value.trim()
    if (v && v !== initial) dispatch({ type: 'UPDATE_ELEMENT', payload: { id, name: v } })
    setEditingElement(null)
  }

  return (
    <div
      className={cn('nodrag nopan absolute inset-x-1 z-20 flex', atTop ? 'top-1' : 'inset-y-0 items-center')}
      onClick={e => e.stopPropagation()}
      onDoubleClick={e => e.stopPropagation()}
    >
      <input
        ref={ref}
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          e.stopPropagation()
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') setEditingElement(null)
        }}
        className="w-full rounded border border-[var(--accent)] bg-[var(--surface-1)] px-1.5 py-0.5 text-center text-xs font-semibold text-[var(--fg)] shadow-lg outline-none"
      />
    </div>
  )
}

export const GraphNodeComponent = memo(({ id, data, selected }: NodeProps) => {
  const d = data as GraphNodeData
  const { shape, fill, stroke, text, accent, icon, iconSrc, width, height } = d
  const editing = useModelStore(s => s.editingElementId === id)
  const dispatch = useModelStore(s => s.dispatch)
  const activeViewId = useModelStore(s => s.activeViewId)
  const ring = selected ? 'ring-2 ring-offset-1 ring-[var(--node-selection)] dark:ring-offset-zinc-900' : ''

  let body: JSX.Element

  // ── UML class / interface / enum (compartmented box) ──
  if (shape === 'umlClass') {
    body = (
      <div className={cn('relative flex h-full w-full flex-col overflow-hidden rounded-sm', ring)} style={{ background: fill, border: `1.5px solid ${stroke}` }}>
        <Handles stroke={stroke} />
        <UmlClassBody label={d.label} elementType={d.elementType} props={d.chartProps ?? {}} stroke={stroke} text={text} />
      </div>
    )
  } else if (shape === 'erdEntity') {
    body = (
      <div className={cn('relative flex h-full w-full flex-col overflow-hidden rounded-sm', ring)} style={{ background: fill, border: `1.5px solid ${stroke}` }}>
        <Handles stroke={stroke} />
        <ErdEntityBody label={d.label} props={d.chartProps ?? {}} stroke={stroke} text={text} accent={accent} />
      </div>
    )
  } else if (shape === 'note') {
    body = (
      <div className={cn('relative h-full w-full', ring && 'rounded ' + ring)}>
        <Handles stroke={stroke} />
        <NoteBody label={d.label} fill={fill} stroke={stroke} text={text} width={width} height={height} />
      </div>
    )
  } else if (d.notation === 'mindmap' && d.elementType !== 'mindmapGraph') {
    const depth = d.mindmapDepth ?? (d.elementType === 'mindmapRoot' ? 0 : 1)
    const root = depth === 0
    const primary = depth === 1
    const secondary = depth === 2
    const background = d.customAccent ? fill : root ? '#08A1DD' : primary ? '#087CB5' : secondary ? '#FFFFFF' : '#A3A7AA'
    const border = d.customAccent ? stroke : root || primary ? background : secondary ? '#303234' : '#8A8E91'
    const foreground = d.customAccent ? text : root || primary || depth >= 3 ? '#FFFFFF' : '#27292B'
    body = (
      <div
        className={cn('relative flex h-full w-full items-center justify-center rounded-full text-center', ring && 'rounded-full ' + ring)}
        style={{ background, border: `${root ? 3 : 2}px solid ${border}`, color: foreground }}
      >
        <Handles stroke={border} prominent />
        <div className="flex max-w-[82%] flex-col items-center leading-tight">
          <span className={cn(root ? 'text-xl font-bold' : primary ? 'text-sm font-medium' : 'text-xs font-semibold')}>{d.label}</span>
          {metaText(d) && <span className="mt-0.5 line-clamp-2 text-[9px] opacity-75">{metaText(d)}</span>}
        </div>
      </div>
    )
  } else if (shape === 'gridGraph') {
    body = (
      <div className={cn('relative flex h-full w-full flex-col overflow-hidden rounded-lg', ring)} style={{ background: fill, border: `1.5px solid ${stroke}` }}>
        <Handles stroke={stroke} />
        <SpecialGraphHeader data={d} stroke={stroke} accent={accent} />
        {d.grid && <GridGraphView frame={d.grid} stroke={stroke} text={text} accent={accent} />}
      </div>
    )
  } else if (shape === 'treeGraph') {
    body = (
      <div className={cn('relative flex h-full w-full flex-col overflow-hidden rounded-lg', ring)} style={{ background: fill, border: `1.5px solid ${stroke}` }}>
        <Handles stroke={stroke} />
        <SpecialGraphHeader data={d} stroke={stroke} accent={accent} />
        <div className="min-h-0 flex-1 px-1">
          <TreeGraphView roots={d.tree ?? []} accent={accent} />
        </div>
      </div>
    )
  } else if (shape === 'analyticChart' && d.analyticChart) {
    body = (
      <div className={cn('relative h-full w-full overflow-visible rounded-lg', ring)} style={{ background: fill, border: `1.5px solid ${stroke}` }}>
        <Handles stroke={stroke} />
        <div className="relative z-10"><SpecialGraphHeader data={d} stroke={stroke} accent={accent} /></div>
        <AnalyticChartView frame={d.analyticChart} />
      </div>
    )
  } else if (d.chartFrame) {
    const cf = d.chartFrame
    body = d.elementType === 'mindmapGraph' ? (
      // A mind map lives directly on the canvas. Its graph element is only an
      // invisible grouping/layout surface, not a titled chart container.
      <div className="relative h-full w-full rounded-lg" style={d.customAccent ? { background: fill, border: `1.5px solid ${stroke}` } : undefined}>
        <svg className="pointer-events-none absolute inset-0 overflow-visible" width="100%" height="100%">
          {cf.lines.map((l, i) => (
            <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.color ?? 'var(--edge)'} strokeWidth={l.width ?? 1.2} strokeDasharray={l.dash} strokeLinecap="round" />
          ))}
        </svg>
        <div className="pointer-events-none absolute left-4 top-1 flex flex-col" style={{ color: d.customAccent ? text : 'var(--fg-subtle)' }}>
          <span className="text-xs font-bold uppercase tracking-[0.16em]">{d.label}</span>
          {metaText(d) && <span className="text-[9px] font-normal normal-case tracking-normal opacity-75">{metaText(d)}</span>}
        </div>
        {selected && <div className="pointer-events-none absolute inset-0 rounded-lg border border-dashed border-blue-500/35" />}
      </div>
    ) : (
      <div className={cn('relative h-full w-full overflow-hidden rounded-lg', ring)} style={{ background: fill, border: `1.5px solid ${stroke}` }}>
        <Handles stroke={stroke} />
        <SpecialGraphHeader data={d} stroke={stroke} accent={accent} />
        <svg className="pointer-events-none absolute inset-0 overflow-visible" width="100%" height="100%">
          {cf.lines.map((l, i) => (
            <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.color ?? 'var(--edge)'} strokeWidth={l.width ?? 1.2} strokeDasharray={l.dash} strokeLinecap="round" />
          ))}
          {cf.texts.map((t, i) => (
            <text key={i} x={t.x} y={t.y} fontSize={t.size ?? 10} fill={t.color ?? 'var(--fg-muted)'} textAnchor={t.anchor ?? 'start'} fontWeight={t.bold ? 700 : 400} fontFamily="inherit">{t.text}</text>
          ))}
        </svg>
      </div>
    )
  } else if (d.ganttGraph) {
    const fr = d.ganttGraph
    const axisTop = fr.top
    const axisBase = axisTop + GANTT_AXIS_H
    body = (
      <div className={cn('relative h-full w-full overflow-hidden rounded-lg', ring)} style={{ background: fill, border: `1.5px solid ${stroke}` }}>
        <Handles stroke={stroke} />
        <SpecialGraphHeader data={d} stroke={stroke} accent={accent} />
        <svg className="pointer-events-none absolute inset-0 overflow-visible" width="100%" height="100%">
          <line x1={8} y1={axisBase} x2={width - 8} y2={axisBase} stroke={stroke} strokeWidth={1} strokeOpacity={0.6} />
          {fr.ticks.map((t, i) => (
            <g key={i}>
              <line x1={16 + t.x} y1={axisBase} x2={16 + t.x} y2={height - 8} stroke={stroke} strokeWidth={1} strokeOpacity={0.22} strokeDasharray="2 4" />
              <text x={16 + t.x + 3} y={axisBase - 5} fontSize={9} fill="var(--fg-muted)" fontWeight={600} fontFamily="inherit">{t.label}</text>
            </g>
          ))}
        </svg>
      </div>
    )
  } else if (d.ishikawa) {
    const fb = d.ishikawa
    body = (
      <div className={cn('relative h-full w-full', ring && 'rounded-lg ' + ring)}>
        <Handles stroke={stroke} />
        <svg className="pointer-events-none absolute inset-0 overflow-visible" width="100%" height="100%">
          {/* spine into the head */}
          <line x1={8} y1={fb.spineY} x2={width - fb.headW} y2={fb.spineY} stroke={accent} strokeWidth={2.4} />
          <line x1={width - fb.headW - 11} y1={fb.spineY - 7} x2={width - fb.headW} y2={fb.spineY} stroke={accent} strokeWidth={2.4} />
          <line x1={width - fb.headW - 11} y1={fb.spineY + 7} x2={width - fb.headW} y2={fb.spineY} stroke={accent} strokeWidth={2.4} />
          {fb.bones.map((b, i) => (
            <line key={i} x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2} stroke={accent} strokeWidth={1.6} strokeOpacity={0.75} />
          ))}
        </svg>
        {/* head box at the right, vertically centred on the spine */}
        <div
          className="absolute flex items-center justify-center rounded-md px-2 text-center text-xs font-bold"
          style={{
            right: 6, top: fb.spineY - 30, width: fb.headW - 14, height: 60,
            background: fill, border: `2px solid ${stroke}`, color: text,
          }}
        >
          <div className="flex flex-col items-center">
            <span>{d.label}</span>
            {metaText(d) && <span className="mt-0.5 line-clamp-2 text-[9px] font-normal opacity-75">{metaText(d)}</span>}
          </div>
        </div>
      </div>
    )
  } else if (shape === 'quadrantChart') {
    const p = d.chartProps ?? {}
    const qLabel = (key: string, cls: string) =>
      p[key] ? <span className={cn('absolute z-0 text-[10px] font-bold uppercase tracking-wide text-[var(--fg-muted)]', cls)}>{p[key]}</span> : null
    body = (
      <div className={cn('relative h-full w-full overflow-hidden rounded-md', ring)} style={{ background: fill, border: `1.5px solid ${stroke}` }}>
        <Handles stroke={stroke} />
        <svg className="absolute inset-0" width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
          <rect x={width / 2} y={0} width={width / 2} height={height / 2} fill={accent} opacity="0.16" />
          <rect x={0} y={height / 2} width={width / 2} height={height / 2} fill={accent} opacity="0.16" />
          <rect x={0} y={0} width={width / 2} height={height / 2} fill={accent} opacity="0.07" />
          <rect x={width / 2} y={height / 2} width={width / 2} height={height / 2} fill={accent} opacity="0.07" />
          <line x1={width / 2} y1={0} x2={width / 2} y2={height} stroke={stroke} strokeWidth="1" opacity="0.5" />
          <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke={stroke} strokeWidth="1" opacity="0.5" />
        </svg>
        {/* mermaid order: q1 top-right, q2 top-left, q3 bottom-left, q4 bottom-right */}
        {qLabel('q1', 'right-2 top-1')}
        {qLabel('q2', 'left-2 top-1')}
        {qLabel('q3', 'left-2 bottom-1')}
        {qLabel('q4', 'right-2 bottom-1')}
        {p.xLabel && <span className="absolute bottom-1 left-1/2 z-0 -translate-x-1/2 text-[10px] font-semibold text-[var(--fg-muted)]">{p.xLabel}</span>}
        {p.yLabel && (
          <span className="absolute left-1 top-1/2 z-0 origin-center -translate-y-1/2 -rotate-90 text-[10px] font-semibold text-[var(--fg-muted)]">{p.yLabel}</span>
        )}
        <span className="absolute left-1/2 top-1 z-0 -translate-x-1/2 text-[11px] font-bold text-[var(--fg)]">{d.label}</span>
      </div>
    )
  } else if (d.elementType === 'lane') {
    body = (
      <div
        className={cn('relative h-full w-full overflow-hidden rounded-sm', ring)}
        style={{ background: d.customAccent ? fill : accent + '10', border: `1.5px solid ${stroke}` }}
      >
        <Handles stroke={stroke} />
        <div
          className="absolute inset-y-0 left-0 flex w-7 items-center justify-center text-[11px] font-bold uppercase tracking-wide"
          style={{ background: accent + '24', color: text, borderRight: `1px solid ${stroke}66` }}
        >
          <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>{d.label}</span>
        </div>
      </div>
    )
  } else if (d.isContainer || shape === 'container') {
    body = (
      <div
        className={cn('relative flex h-full w-full flex-col overflow-hidden rounded-lg', ring)}
        style={{ background: d.customAccent ? fill : accent + '12', border: `1.5px solid ${stroke}` }}
      >
        <Handles stroke={stroke} />
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide"
          style={{ background: accent + '26', color: text, borderBottom: `1px solid ${stroke}66` }}
        >
          <Glyph iconSrc={iconSrc} icon={icon} color={accent} size={14} />
          <span className="truncate">{d.label}</span>
          {metaText(d) && (
            <span className="ml-auto truncate text-[9px] font-normal normal-case opacity-70" title={metaText(d) ?? undefined}>
              {metaText(d)}
            </span>
          )}
        </div>
      </div>
    )
  } else if (shape === 'person') {
    body = (
      <div className={cn('relative flex flex-col items-center', ring && 'rounded-lg ' + ring)} style={{ width, height }}>
        <Handles stroke={stroke} />
        <svg width="34" height="34" viewBox="0 0 34 34">
          <circle cx="17" cy="9" r="7" fill={fill} stroke={stroke} strokeWidth="2" />
          <path d="M3 33c0-8 6-13 14-13s14 5 14 13z" fill={fill} stroke={stroke} strokeWidth="2" />
        </svg>
        <div className="mt-1 w-full rounded-md px-2 py-1.5 text-center" style={{ background: fill, border: `2px solid ${stroke}` }}>
          <Label data={d} />
        </div>
      </div>
    )
  } else if (shape === 'circle' || shape === 'thickCircle' || shape === 'doubleCircle') {
    const borderWidth = shape === 'thickCircle' ? 4 : 2
    body = (
      <div
        className={cn('relative flex h-full w-full items-center justify-center rounded-full', ring && 'rounded-full ' + ring)}
        style={{ background: fill, border: `${borderWidth}px solid ${stroke}` }}
      >
        <Handles stroke={stroke} />
        {shape === 'doubleCircle' && <div className="absolute rounded-full" style={{ inset: 3, border: `2px solid ${stroke}` }} />}
        <span className="px-1 text-center text-[9px] font-semibold" style={{ color: text }}>{d.label}</span>
      </div>
    )
  } else if (shape === 'diamond') {
    const isGateway = d.notation === 'bpmn'
    body = (
      <div className={cn('relative flex h-full w-full items-center justify-center', ring && 'rounded ' + ring)}>
        <Handles stroke={stroke} />
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="absolute inset-0">
          <polygon points={`${width / 2},2 ${width - 2},${height / 2} ${width / 2},${height - 2} 2,${height / 2}`} fill={fill} stroke={stroke} strokeWidth="2" />
        </svg>
        {isGateway && icon !== 'none' ? (
          <div className="relative z-10"><NodeIcon kind={icon} color={accent} size={Math.min(width, height) * 0.4} /></div>
        ) : (
          <span className="relative z-10 max-w-[80%] text-center text-[9px] font-semibold" style={{ color: text }}>{d.label}</span>
        )}
      </div>
    )
  } else if (shape === 'parallelogram') {
    const skew = 14
    body = (
      <div className={cn('relative flex h-full w-full items-center justify-center', ring && 'rounded ' + ring)}>
        <Handles stroke={stroke} />
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="absolute inset-0">
          <polygon points={`${skew},2 ${width - 2},2 ${width - skew},${height - 2} 2,${height - 2}`} fill={fill} stroke={stroke} strokeWidth="2" />
        </svg>
        <div className="relative z-10"><Label data={d} /></div>
      </div>
    )
  } else if (shape === 'ellipse') {
    body = (
      <div className={cn('relative flex h-full w-full items-center justify-center', ring && 'rounded-full ' + ring)}>
        <Handles stroke={stroke} />
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="absolute inset-0">
          <ellipse cx={width / 2} cy={height / 2} rx={width / 2 - 2} ry={height / 2 - 2} fill={fill} stroke={stroke} strokeWidth="2" />
        </svg>
        <div className="relative z-10"><Label data={d} /></div>
      </div>
    )
  } else if (shape === 'stickFigure') {
    // UML actor: stick figure with the name underneath
    body = (
      <div className={cn('relative flex h-full w-full flex-col items-center justify-end', ring && 'rounded-lg ' + ring)}>
        <Handles stroke={stroke} />
        <svg width="46" height="64" viewBox="0 0 46 64" className="shrink-0">
          <circle cx="23" cy="10" r="8" fill={fill} stroke={stroke} strokeWidth="2.5" />
          <line x1="23" y1="18" x2="23" y2="40" stroke={stroke} strokeWidth="2.5" />
          <line x1="5" y1="26" x2="41" y2="26" stroke={stroke} strokeWidth="2.5" />
          <line x1="23" y1="40" x2="8" y2="60" stroke={stroke} strokeWidth="2.5" />
          <line x1="23" y1="40" x2="38" y2="60" stroke={stroke} strokeWidth="2.5" />
        </svg>
        <span className="mt-1 max-w-full truncate px-1 text-center text-xs font-semibold" style={{ color: 'var(--fg)' }}>{d.label}</span>
      </div>
    )
  } else if (shape === 'pertBox') {
    // CPM box: ES | duration | EF / label / LS | slack | LF
    const p = d.pert
    const border = p?.critical && !d.customAccent ? '#D32F2F' : stroke
    const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
    body = (
      <div className={cn('relative flex h-full w-full flex-col overflow-hidden rounded-md', ring)} style={{ background: fill, border: `2px solid ${border}` }}>
        <Handles stroke={border} />
        {p ? (
          <>
            <div className="grid flex-1 grid-cols-3 text-center text-[9px] font-medium" style={{ color: text, borderBottom: `1px solid ${border}55` }}>
              <span className="flex items-center justify-center" title="Earliest start">{fmt(p.es)}</span>
              <span className="flex items-center justify-center border-x" style={{ borderColor: border + '55' }} title="Duration">{fmt(p.duration)}</span>
              <span className="flex items-center justify-center" title="Earliest finish">{fmt(p.ef)}</span>
            </div>
            <div className="flex flex-[1.4] flex-col items-center justify-center px-1 text-center text-[11px] font-semibold" style={{ color: text }}><span>{d.label}</span>{metaText(d) && <span className="text-[8px] font-normal opacity-75">{metaText(d)}</span>}</div>
            <div className="grid flex-1 grid-cols-3 text-center text-[9px] font-medium" style={{ color: text, borderTop: `1px solid ${border}55` }}>
              <span className="flex items-center justify-center" title="Latest start">{fmt(p.ls)}</span>
              <span className="flex items-center justify-center border-x" style={{ borderColor: border + '55' }} title="Slack">{fmt(p.slack)}</span>
              <span className="flex items-center justify-center" title="Latest finish">{fmt(p.lf)}</span>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center"><Label data={d} /></div>
        )}
      </div>
    )
  } else if (shape === 'ganttBar') {
    const prog = d.progress
    const labelOutside = width < d.label.length * 6.5 + 16
    body = (
      <div className={cn('relative h-full w-full rounded', ring)} style={{ background: fill, border: `1.5px solid ${stroke}` }}>
        <Handles stroke={stroke} />
        {prog !== undefined && (
          <div className="absolute inset-y-0 left-0 rounded-l" style={{ width: `${prog}%`, background: stroke, opacity: 0.55 }} />
        )}
        <div
          className={cn('absolute inset-y-0 z-10 flex items-center whitespace-nowrap text-[10px] font-semibold', labelOutside ? 'left-full pl-1.5' : 'left-2')}
          style={{ color: labelOutside ? 'var(--fg)' : text }}
        >
          {d.label}
        </div>
      </div>
    )
  } else if (shape === 'ganttMilestone') {
    body = (
      <div className={cn('relative h-full w-full', ring && 'rounded ' + ring)}>
        <Handles stroke={stroke} />
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="absolute inset-0">
          <polygon points={`${width / 2},1 ${width - 1},${height / 2} ${width / 2},${height - 1} 1,${height / 2}`} fill={fill} stroke={stroke} strokeWidth="1.5" />
        </svg>
        <span className="absolute left-full top-1/2 z-10 ml-1.5 -translate-y-1/2 whitespace-nowrap text-[10px] font-semibold" style={{ color: 'var(--fg)' }}>{d.label}</span>
      </div>
    )
  } else if (shape === 'dot') {
    // small disc with the label below (commits, quadrant items)
    body = (
      <div className={cn('relative h-full w-full', ring && 'rounded-full ' + ring)}>
        <Handles stroke={stroke} />
        <ProjectionArrow projection={d.projection} width={width} height={height} />
        <div className="relative z-10 h-full w-full rounded-full" style={{ background: fill, border: `2.5px solid ${stroke}` }} />
        {d.badge && (
          <span className="absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded border border-[var(--border)] bg-[var(--surface-1)] px-1 text-[9px] font-semibold" style={{ color: 'var(--fg)' }}>
            {d.badge}
          </span>
        )}
        <span className="absolute left-1/2 top-full z-10 mt-1 flex -translate-x-1/2 flex-col items-center whitespace-nowrap text-[10px] font-semibold" style={{ color: 'var(--fg)' }}>
          <span>{d.label}</span>{metaText(d) && <span className="text-[8px] font-normal opacity-70">{metaText(d)}</span>}
        </span>
      </div>
    )
  } else if (shape === 'ganttSection') {
    // a band wrapping its task rows (task bars paint on top via z-index)
    body = (
      <div className={cn('relative h-full w-full overflow-hidden rounded-sm', ring)} style={{ background: fill, borderLeft: `3px solid ${stroke}` }}>
        <Handles stroke={stroke} />
        <span className="absolute left-2 top-1 truncate text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--fg-muted)' }}>{d.label}</span>
      </div>
    )
  } else {
    // ── Rectangle family ──
    const radius = shape === 'stadium' ? 'rounded-full' : shape === 'roundedRectangle' ? 'rounded-xl' : 'rounded-sm'
    body = (
      <div className={cn('relative flex h-full w-full items-center justify-center', radius, ring)} style={{ background: fill, border: `2px solid ${stroke}` }}>
        <Handles stroke={stroke} />
        {d.elementType === 'gridItem' && <ProjectionArrow projection={d.projection} width={width} height={height} />}
        {(iconSrc || icon !== 'none') && (
          <div
            className={cn('absolute top-1.5 opacity-90', d.notation === 'bpmn' ? 'left-1.5' : 'right-1.5')}
          ><Glyph iconSrc={iconSrc} icon={icon} color={accent} size={17} /></div>
        )}
        <Label data={d} />
      </div>
    )
  }

  const isContainer = d.isContainer || shape === 'container'
  // resize works on leaves and containers; a container can only grow past its
  // auto-fit size, never shrink below its children (clamped in model-to-flow)
  // gantt geometry derives from dates/durations — resizing it would be undone on the next layout
  const resizable = shape !== 'person' && shape !== 'stickFigure'
    && shape !== 'ganttBar' && shape !== 'ganttMilestone' && shape !== 'ganttSection'
  const resizer = resizable && (
    <NodeResizer
      isVisible={selected}
      minWidth={48}
      minHeight={32}
      lineClassName="!border-[var(--accent)]"
      handleClassName="!h-2 !w-2 !rounded-sm !border !border-[var(--accent)] !bg-[var(--surface-1)]"
      onResizeEnd={(_, p) => {
        if (activeViewId) {
          // size belongs to the view, not the element
          dispatch({ type: 'SET_NODE_SIZE', payload: { viewId: activeViewId, id, size: { width: Math.round(p.width), height: Math.round(p.height) } } })
          dispatch({ type: 'APPLY_LAYOUT', payload: { viewId: activeViewId, positions: { [id]: { x: p.x, y: p.y } } } })
        }
      }}
    />
  )

  if (!editing && !resizer) return body
  return (
    <>
      {resizer}
      {body}
      {editing && <NameEditor id={id} initial={d.label} atTop={isContainer} />}
    </>
  )
})

GraphNodeComponent.displayName = 'GraphNodeComponent'
