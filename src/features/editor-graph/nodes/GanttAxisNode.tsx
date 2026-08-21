import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { GanttSubTick, GanttTick } from '@/core/layout'
import { GANTT_AXIS_H } from '@/core/layout'

export interface GanttAxisData extends Record<string, unknown> {
  width: number
  height: number
  axisTop: number
  offsetX: number
  ticks: GanttTick[]
  subTicks: GanttSubTick[]
  specialLines: GanttTick[]
  stroke: string
}

/**
 * Non-interactive timeline overlay. Its node z-index keeps the unit/special
 * lines above section bands while tasks, milestones and relations stay above it.
 */
export const GanttAxisNode = memo(({ data }: NodeProps) => {
  const d = data as GanttAxisData
  const axisBase = d.axisTop + GANTT_AXIS_H
  return (
    <div className="pointer-events-none relative" style={{ width: d.width, height: d.height }}>
      <svg width={d.width} height={d.height} className="absolute inset-0 overflow-visible">
        <line x1={8} y1={axisBase} x2={d.width - 8} y2={axisBase} stroke={d.stroke} strokeWidth={1} strokeOpacity={0.6} />
        {d.ticks.map(t => (
          <g key={t.x}>
            <line x1={d.offsetX + t.x} y1={axisBase} x2={d.offsetX + t.x} y2={d.height - 8} stroke={d.stroke} strokeWidth={1} strokeOpacity={0.22} strokeDasharray="2 4" />
            <text x={d.offsetX + t.x + 3} y={axisBase - 5} fontSize="9" fontWeight="600" fill="var(--fg-muted)" fontFamily="inherit">
              {t.label}
            </text>
          </g>
        ))}
        {d.subTicks.map((t, i) => (
          <g key={`sub-${i}`}>
            <line x1={d.offsetX + t.x} y1={axisBase} x2={d.offsetX + t.x} y2={d.height - 8} stroke={d.stroke} strokeWidth={1} strokeOpacity={0.22} strokeDasharray="2 4" />
            {t.showLabel && (
              <text x={d.offsetX + t.x + 3} y={axisBase + 13} fontSize="8" fontWeight="500" fill="var(--fg-muted)" fontFamily="inherit">
                {t.label}
              </text>
            )}
          </g>
        ))}
        {d.specialLines.map((line, i) => (
          <g key={`special-${i}`}>
            <line x1={d.offsetX + line.x} y1={d.axisTop + 3} x2={d.offsetX + line.x} y2={d.height - 8} stroke="#DC2626" strokeWidth={2} />
            <text x={d.offsetX + line.x + 4} y={axisBase - 16} fontSize={10} fill="#DC2626" fontWeight={700} fontFamily="inherit">{line.label}</text>
          </g>
        ))}
      </svg>
    </div>
  )
})

GanttAxisNode.displayName = 'GanttAxisNode'
