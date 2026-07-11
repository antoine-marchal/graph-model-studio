import type { GraphModel, GraphView, GraphElement } from '../model'

/** Rendering constants (px). */
export const GANTT_PX_PER_DAY = 28
export const GANTT_BAR_H = 30
export const GANTT_ROW_GAP = 10
export const GANTT_AXIS_H = 36
export const GANTT_MILESTONE_SIZE = 26

export interface GanttPlacement {
  x: number
  y: number
  width: number
  height: number
}

export interface GanttTick {
  x: number
  label: string
}

export interface GanttChart {
  /** per-element bar/diamond/section geometry (chart-local px, y=0 at axis top) */
  placements: Record<string, GanttPlacement>
  /** per-element schedule in day offsets from the chart origin */
  schedule: Record<string, { startDay: number; days: number }>
  totalDays: number
  /** origin date (UTC midnight) when at least one task has an explicit date */
  baseDate?: Date
  axis: { width: number; height: number; ticks: GanttTick[] }
  /** 0..100 completion per task (from a `progress "60"` property) */
  progress: Record<string, number>
}

const DAY_MS = 86_400_000

/** Parse "YYYY-MM-DD" to a UTC date; returns undefined for anything else. */
export function parseGanttDate(raw: string | undefined): Date | undefined {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return undefined
  const d = new Date(raw.trim() + 'T00:00:00Z')
  return Number.isNaN(d.getTime()) ? undefined : d
}

/** Parse a duration in days: "5", "5d", "2w" (weeks). */
export function parseGanttDuration(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const m = raw.trim().match(/^(\d+(?:\.\d+)?)\s*([dw]?)$/i)
  if (!m) return undefined
  const n = parseFloat(m[1])
  if (!Number.isFinite(n) || n < 0) return undefined
  return m[2].toLowerCase() === 'w' ? n * 7 : n
}

function isGanttRow(el: GraphElement): boolean {
  // the ganttGraph frame is a container, not a scheduled row
  return el.notation === 'gantt' && el.type !== 'ganttGraph'
}

/**
 * Schedule + place every visible Gantt element of a view.
 *
 * - `start "YYYY-MM-DD"` pins a task to a date; `duration "5d"` / `end "…"`
 *   set its length (default 1 day, milestones 0).
 * - Tasks without an explicit start begin when their dependencies end
 *   (`a -> b` means b starts after a finishes), else at the chart origin.
 * - Rows follow declaration order; `ganttSection` rows span the whole chart.
 */
export function computeGanttChart(model: GraphModel, visibleIds: Set<string>): GanttChart | null {
  const rows = Object.values(model.elements).filter(el => visibleIds.has(el.id) && isGanttRow(el))
  if (rows.length === 0) return null

  const schedulable = rows.filter(el => el.type !== 'ganttSection')
  const idSet = new Set(schedulable.map(el => el.id))

  // dependency edges among scheduled rows
  const preds = new Map<string, string[]>()
  for (const el of schedulable) preds.set(el.id, [])
  for (const rel of Object.values(model.relations)) {
    if (idSet.has(rel.sourceId) && idSet.has(rel.targetId) && rel.sourceId !== rel.targetId) {
      preds.get(rel.targetId)!.push(rel.sourceId)
    }
  }

  // explicit dates establish the chart origin
  const explicitStart = new Map<string, Date>()
  for (const el of schedulable) {
    const d = parseGanttDate(el.properties?.['start'])
    if (d) explicitStart.set(el.id, d)
  }
  let baseDate: Date | undefined
  for (const d of explicitStart.values()) {
    if (!baseDate || d.getTime() < baseDate.getTime()) baseDate = d
  }

  const durations = new Map<string, number>()
  for (const el of schedulable) {
    if (el.type === 'ganttMilestone') { durations.set(el.id, 0); continue }
    let days = parseGanttDuration(el.properties?.['duration'])
    if (days === undefined) {
      // `end` is inclusive: start 01-01 end 01-05 = 5 days
      const s = explicitStart.get(el.id)
      const e = parseGanttDate(el.properties?.['end'])
      if (s && e && e.getTime() >= s.getTime()) days = (e.getTime() - s.getTime()) / DAY_MS + 1
    }
    durations.set(el.id, days ?? 1)
  }

  // ── schedule (DFS, cycle-safe) ──
  const startDay = new Map<string, number>()
  const visiting = new Set<string>()
  function resolveStart(id: string): number {
    if (startDay.has(id)) return startDay.get(id)!
    if (visiting.has(id)) return 0
    visiting.add(id)
    let day: number
    const exp = explicitStart.get(id)
    if (exp && baseDate) {
      day = (exp.getTime() - baseDate.getTime()) / DAY_MS
    } else {
      day = 0
      for (const p of preds.get(id)!) day = Math.max(day, resolveStart(p) + durations.get(p)!)
    }
    visiting.delete(id)
    startDay.set(id, day)
    return day
  }
  for (const el of schedulable) resolveStart(el.id)

  let totalDays = 1
  for (const el of schedulable) {
    totalDays = Math.max(totalDays, startDay.get(el.id)! + Math.max(durations.get(el.id)!, el.type === 'ganttMilestone' ? 0.5 : 0))
  }
  totalDays = Math.ceil(totalDays)

  // ── placement ──
  const placements: Record<string, GanttPlacement> = {}
  const schedule: Record<string, { startDay: number; days: number }> = {}
  const progress: Record<string, number> = {}
  const chartW = totalDays * GANTT_PX_PER_DAY

  // A section groups the rows that follow it until the next section (whether
  // those tasks are nested inside it in the DSL or just declared after it), so
  // it renders as a band wrapping its own header row plus every task row.
  const rowY = (row: number) => GANTT_AXIS_H + row * (GANTT_BAR_H + GANTT_ROW_GAP)
  const sectionEnd = new Map<string, number>()
  rows.forEach((el, i) => {
    if (el.type !== 'ganttSection') return
    let end = i
    for (let j = i + 1; j < rows.length; j++) {
      if (rows[j].type === 'ganttSection') break
      end = j
    }
    sectionEnd.set(el.id, end)
  })

  rows.forEach((el, row) => {
    const y = rowY(row)
    if (el.type === 'ganttSection') {
      const endRow = sectionEnd.get(el.id) ?? row
      const bottom = rowY(endRow) + GANTT_BAR_H
      placements[el.id] = { x: 0, y, width: chartW, height: bottom - y }
      return
    }
    const day = startDay.get(el.id)!
    const days = durations.get(el.id)!
    schedule[el.id] = { startDay: day, days }
    const p = parseFloat(el.properties?.['progress'] ?? '')
    if (Number.isFinite(p)) progress[el.id] = Math.max(0, Math.min(100, p))
    if (el.type === 'ganttMilestone') {
      placements[el.id] = {
        x: day * GANTT_PX_PER_DAY - GANTT_MILESTONE_SIZE / 2,
        y: y + (GANTT_BAR_H - GANTT_MILESTONE_SIZE) / 2,
        width: GANTT_MILESTONE_SIZE,
        height: GANTT_MILESTONE_SIZE,
      }
    } else {
      placements[el.id] = {
        x: day * GANTT_PX_PER_DAY,
        y,
        width: Math.max(days * GANTT_PX_PER_DAY, 10),
        height: GANTT_BAR_H,
      }
    }
  })

  // ── axis ticks: daily up to 3 weeks, else weekly ──
  const step = totalDays > 21 ? 7 : 1
  const ticks: GanttTick[] = []
  for (let d = 0; d <= totalDays; d += step) {
    let label: string
    if (baseDate) {
      const dt = new Date(baseDate.getTime() + d * DAY_MS)
      label = `${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
    } else {
      label = `D${d + 1}`
    }
    ticks.push({ x: d * GANTT_PX_PER_DAY, label })
  }

  const chartH = GANTT_AXIS_H + rows.length * (GANTT_BAR_H + GANTT_ROW_GAP)
  return { placements, schedule, totalDays, baseDate, axis: { width: chartW, height: chartH, ticks }, progress }
}

/** True when a view contains at least one visible Gantt element. */
export function viewHasGantt(model: GraphModel, _view: GraphView, visibleIds: Set<string>): boolean {
  for (const id of visibleIds) {
    const el = model.elements[id]
    if (el && isGanttRow(el)) return true
  }
  return false
}
