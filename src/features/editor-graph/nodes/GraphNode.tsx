import { memo, useEffect, useRef, useState } from 'react'
import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/react'
import type { NodeShape, IconKind } from '@/core/notation'
import { NodeIcon } from './NodeIcons'
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
  icon: IconKind
  iconSrc?: string
  width: number
  height: number
  isContainer?: boolean
}

/** Renders a raster glyph (iconSrc) when present, else the built-in SVG icon. */
function Glyph({ iconSrc, icon, color, size }: { iconSrc?: string; icon: IconKind; color: string; size: number }) {
  if (iconSrc) {
    return <img src={iconSrc} alt="" width={size} height={size} draggable={false} style={{ objectFit: 'contain' }} />
  }
  if (icon !== 'none') return <NodeIcon kind={icon} color={color} size={size} />
  return null
}

function Handles({ stroke }: { stroke: string }) {
  const cls = '!h-2 !w-2 !border-2 !bg-zinc-50 dark:!bg-zinc-900'
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

/** Meta line shown under a node label: "description / technology #tags".
 *  Falls back to the «type» badge when there is no description/technology/tags. */
function metaText(data: GraphNodeData): string | null {
  const main = [data.description, data.technology].filter(Boolean).join(' / ')
  const tags = (data.tags ?? []).filter(Boolean).map(t => `#${t}`).join(' ')
  const meta = [main, tags].filter(Boolean).join('  ')
  if (meta) return meta
  if (data.notation !== 'generic' && data.notation !== 'flowchart') return `«${data.elementType}»`
  return null
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
  const ring = selected ? 'ring-2 ring-offset-1 ring-blue-500 dark:ring-offset-zinc-900' : ''

  let body: JSX.Element

  // ── Container / group / swimlane ──
  if (d.isContainer || shape === 'container') {
    body = (
      <div
        className={cn('relative flex h-full w-full flex-col overflow-hidden rounded-lg', ring)}
        style={{ background: accent + '12', border: `1.5px solid ${stroke}` }}
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
  } else {
    // ── Rectangle family ──
    const radius = shape === 'stadium' ? 'rounded-full' : shape === 'roundedRectangle' ? 'rounded-xl' : 'rounded-sm'
    body = (
      <div className={cn('relative flex h-full w-full items-center justify-center', radius, ring)} style={{ background: fill, border: `2px solid ${stroke}` }}>
        <Handles stroke={stroke} />
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
  const resizable = shape !== 'person'
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
