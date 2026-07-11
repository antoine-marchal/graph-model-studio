import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { GanttTick } from '@/core/layout'
import { GANTT_AXIS_H } from '@/core/layout'

export interface GanttAxisData extends Record<string, unknown> {
  width: number
  height: number
  ticks: GanttTick[]
}

/**
 * Non-interactive timeline behind a Gantt chart: date labels along the top
 * plus a vertical grid line per tick. Injected by model-to-flow as a
 * synthetic node (id "__gantt_axis__") when the view contains Gantt rows.
 */
export const GanttAxisNode = memo(({ data }: NodeProps) => {
  const d = data as GanttAxisData
  return (
    <div className="pointer-events-none relative" style={{ width: d.width, height: d.height }}>
      <svg width={d.width} height={d.height} className="absolute inset-0 overflow-visible">
        <line x1={0} y1={GANTT_AXIS_H - 8} x2={d.width} y2={GANTT_AXIS_H - 8} stroke="var(--border)" strokeWidth="1" />
        {d.ticks.map(t => (
          <g key={t.x}>
            <line x1={t.x} y1={GANTT_AXIS_H - 12} x2={t.x} y2={d.height} stroke="var(--border)" strokeWidth="1" strokeDasharray="2 4" />
            <text x={t.x + 3} y={GANTT_AXIS_H - 16} fontSize="9" fill="var(--fg-subtle)" fontFamily="inherit">
              {t.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
})

GanttAxisNode.displayName = 'GanttAxisNode'
