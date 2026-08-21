import type { GraphModel, GraphView, GraphElement } from '../model'

/** Rendering constants (px). */
export const GANTT_PX_PER_DAY = 28
export const GANTT_BAR_H = 30
export const GANTT_ROW_GAP = 28
export const GANTT_AXIS_H = 36
/** Breathing room between the time axis and the first scheduled row. */
export const GANTT_AXIS_TASK_GAP = 22
export const GANTT_MILESTONE_SIZE = 26
/** Horizontal breathing room between a section band and its scheduled rows. */
export const GANTT_SECTION_INSET = 20
/** Space below the final row wrapped by a section band. */
export const GANTT_SECTION_BOTTOM_INSET = 12
export const GANTT_LABEL_CHAR_WIDTH = 6.5
export const GANTT_LABEL_INNER_PADDING = 16
export const GANTT_LABEL_OUTSIDE_GAP = 6
export const GANTT_LABEL_RIGHT_PADDING = 10

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

export interface GanttSpecialLine extends GanttTick {}

export interface GanttSubTick extends GanttTick {
  showLabel: boolean
}

export interface GanttChart {
  /** per-element bar/diamond/section geometry (chart-local px, y=0 at axis top) */
  placements: Record<string, GanttPlacement>
  /** per-element schedule in day offsets from the chart origin */
  schedule: Record<string, { startDay: number; days: number }>
  totalDays: number
  /** origin date (UTC midnight) when at least one task has an explicit date */
  baseDate?: Date
  /** first displayed value for a unit-based schedule (undefined in date mode) */
  baseUnit?: number
  /** label prefix for a unit-based schedule, e.g. "PI" */
  unitPrefix: string
  pixelsPerUnit: number
  /** Extra frame width reserved for task labels rendered outside their bars. */
  labelOverflow: number
  /** Side chosen for each milestone label so it remains inside the frame. */
  milestoneLabelSide: Record<string, 'left' | 'right'>
  axis: { width: number; height: number; ticks: GanttTick[]; subTicks: GanttSubTick[]; specialLines: GanttSpecialLine[] }
  /** 0..100 completion per task (from a `progress "60"` property) */
  progress: Record<string, number>
}

export interface GanttChartOptions {
  unitPrefix?: string
  /** First unit displayed on a numeric axis, e.g. 10 for "PI10". */
  firstUnit?: number
  /** First date displayed on a date axis (YYYY-MM-DD). */
  firstDate?: string
  /** Exact chart-body width available inside a manually resized frame. */
  axisWidth?: number
  /** `2:"Today"; 2026-01-05:"Launch"` markers. */
  specialLines?: string
  /** Optional labels for subdivisions of numeric units, e.g. "IT". */
  subunitPrefix?: string
  /** Number of equal subdivisions inside each numeric unit. */
  maxSubunit?: number
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

/** Parse a plain numeric Gantt start (unit-based schedule, not a date). */
export function parseGanttUnitStart(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const value = Number(raw.trim())
  return Number.isFinite(value) ? value : undefined
}

const formatUnit = (value: number) => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)))

export function ganttTaskLabelWidth(label: string): number {
  return [...label].length * GANTT_LABEL_CHAR_WIDTH
}

export function ganttTaskLabelOutside(barWidth: number, label: string): boolean {
  return barWidth < ganttTaskLabelWidth(label) + GANTT_LABEL_INNER_PADDING
}

/** Parse labelled unit/date markers while tolerating optional quotes and spaces. */
export function parseGanttSpecialLines(raw: string | undefined): { at: string; label: string }[] {
  if (!raw) return []
  return raw.split(';').flatMap(part => {
    const match = part.trim().match(/^([^:]+)\s*:\s*(?:"([^"]*)"|'([^']*)'|(.+))$/)
    if (!match) return []
    const at = match[1].trim()
    const label = (match[2] ?? match[3] ?? match[4] ?? '').trim()
    return at && label ? [{ at, label }] : []
  })
}

/** Convert an offset on a computed chart back to the persisted `start` value. */
export function formatGanttStart(chart: Pick<GanttChart, 'baseDate' | 'baseUnit'>, offset: number): string {
  if (chart.baseDate) {
    return new Date(chart.baseDate.getTime() + offset * DAY_MS).toISOString().slice(0, 10)
  }
  return formatUnit((chart.baseUnit ?? 1) + offset)
}

/** Convert a resized task width to a duration while retaining useful legacy suffixes. */
export function formatGanttDuration(units: number, start: string | undefined, previous: string | undefined): string {
  const value = Math.max(0, units)
  if (parseGanttDate(start)) {
    if (/w\s*$/i.test(previous ?? '') && value % 7 === 0) return `${formatUnit(value / 7)}w`
    return `${formatUnit(value)}d`
  }
  return formatUnit(value)
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
export function computeGanttChart(
  model: GraphModel,
  visibleIds: Set<string>,
  options: GanttChartOptions = {},
): GanttChart | null {
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
  let baseDate = parseGanttDate(options.firstDate)
  if (!baseDate) for (const d of explicitStart.values()) {
    if (!baseDate || d.getTime() < baseDate.getTime()) baseDate = d
  }
  // A chart containing dates stays in date mode. Otherwise plain numeric starts
  // define a unit scale (PI, sprint, iteration, etc.).
  const explicitUnitStart = new Map<string, number>()
  if (!baseDate) {
    for (const el of schedulable) {
      const value = parseGanttUnitStart(el.properties?.['start'])
      if (value !== undefined) explicitUnitStart.set(el.id, value)
    }
  }
  const configuredFirstUnit = options.firstUnit
  const baseUnit = baseDate
    ? undefined
    : Number.isFinite(configuredFirstUnit) ? configuredFirstUnit : 1
  const unitPrefix = options.unitPrefix ?? 'D'

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
    const unit = explicitUnitStart.get(id)
    if (exp && baseDate) {
      day = (exp.getTime() - baseDate.getTime()) / DAY_MS
    } else if (unit !== undefined && baseUnit !== undefined) {
      day = unit - baseUnit
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
  const requestedTimelineW = options.axisWidth === undefined
    ? undefined
    : Math.max(1, options.axisWidth - GANTT_SECTION_INSET * 2)
  const pixelsPerUnit = requestedTimelineW === undefined
    ? GANTT_PX_PER_DAY
    : requestedTimelineW / totalDays
  const timelineW = totalDays * pixelsPerUnit
  const chartW = timelineW + GANTT_SECTION_INSET * 2

  // A section groups the rows that follow it until the next section (whether
  // those tasks are nested inside it in the DSL or just declared after it), so
  // it renders as a band wrapping its own header row plus every task row.
  const rowY = (row: number) => GANTT_AXIS_H + GANTT_AXIS_TASK_GAP + row * (GANTT_BAR_H + GANTT_ROW_GAP)
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
      const bottom = rowY(endRow) + GANTT_BAR_H + GANTT_SECTION_BOTTOM_INSET
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
        x: GANTT_SECTION_INSET + day * pixelsPerUnit - GANTT_MILESTONE_SIZE / 2,
        y: y + (GANTT_BAR_H - GANTT_MILESTONE_SIZE) / 2,
        width: GANTT_MILESTONE_SIZE,
        height: GANTT_MILESTONE_SIZE,
      }
    } else {
      placements[el.id] = {
        x: GANTT_SECTION_INSET + day * pixelsPerUnit,
        y,
        width: Math.max(days * pixelsPerUnit, 10),
        height: GANTT_BAR_H,
      }
    }
  })

  // ── axis ticks: thin labels when a manually narrowed scale would overlap ──
  const widestAxisLabel = baseDate
    ? '00-00'
    : `${unitPrefix}${formatUnit((baseUnit ?? 1) + totalDays)}`
  const labelSpacing = Math.max(28, [...widestAxisLabel].length * 5.4 + 4)
  const responsiveStep = options.axisWidth === undefined ? 1 : Math.ceil(labelSpacing / pixelsPerUnit)
  const step = Math.max(totalDays > 21 ? 7 : 1, responsiveStep)
  const ticks: GanttTick[] = []
  for (let d = 0; d <= totalDays; d += step) {
    let label: string
    if (baseDate) {
      const dt = new Date(baseDate.getTime() + d * DAY_MS)
      label = `${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
    } else {
      label = `${unitPrefix}${formatUnit((baseUnit ?? 1) + d)}`
    }
    ticks.push({ x: GANTT_SECTION_INSET + d * pixelsPerUnit, label })
  }

  const subTicks: GanttSubTick[] = []
  // Preserve intentional whitespace exactly like the main unit prefix
  // (`subunitPrefix "IT "` renders `IT 1`).
  const subunitPrefix = options.subunitPrefix ?? ''
  const maxSubunit = Math.floor(options.maxSubunit ?? 0)
  if (!baseDate && subunitPrefix.trim() && maxSubunit > 0) {
    const subunitWidth = pixelsPerUnit / maxSubunit
    const widestSubunitLabel = `${subunitPrefix}${maxSubunit}`
    const subunitLabelSpacing = Math.max(24, [...widestSubunitLabel].length * 5.2 + 4)
    const subunitStep = Math.max(1, Math.ceil(subunitLabelSpacing / subunitWidth))
    for (let unit = 0; unit < totalDays; unit++) {
      for (let subunit = 0; subunit < maxSubunit; subunit++) {
        const index = subunit + 1
        subTicks.push({
          x: GANTT_SECTION_INSET + unit * pixelsPerUnit + subunit * subunitWidth,
          label: `${subunitPrefix}${formatUnit(index)}`,
          showLabel: subunit === 0 || subunit % subunitStep === 0,
        })
      }
    }
  }

  const specialLines: GanttSpecialLine[] = []
  for (const marker of parseGanttSpecialLines(options.specialLines)) {
    const markerDate = parseGanttDate(marker.at)
    const markerUnit = parseGanttUnitStart(marker.at)
    const offset = baseDate && markerDate
      ? (markerDate.getTime() - baseDate.getTime()) / DAY_MS
      : !baseDate && markerUnit !== undefined
        ? markerUnit - (baseUnit ?? 1)
        : undefined
    if (offset !== undefined && offset >= 0 && offset <= totalDays) {
      specialLines.push({ x: GANTT_SECTION_INSET + offset * pixelsPerUnit, label: marker.label })
    }
  }

  const chartH = GANTT_AXIS_H + GANTT_AXIS_TASK_GAP + rows.length * (GANTT_BAR_H + GANTT_ROW_GAP)
  let requiredContentRight = chartW
  const milestoneLabelSide: Record<string, 'left' | 'right'> = {}
  for (const el of schedulable) {
    const placement = placements[el.id]
    const labelWidth = ganttTaskLabelWidth(el.name)
    if (el.type === 'ganttMilestone') {
      const availableLeft = placement.x - GANTT_LABEL_OUTSIDE_GAP
      const side = labelWidth <= availableLeft ? 'left' : 'right'
      milestoneLabelSide[el.id] = side
      if (side === 'right') {
        requiredContentRight = Math.max(
          requiredContentRight,
          placement.x + placement.width + GANTT_LABEL_OUTSIDE_GAP + labelWidth + GANTT_LABEL_RIGHT_PADDING,
        )
      }
      continue
    }
    if (!ganttTaskLabelOutside(placement.width, el.name)) continue
    requiredContentRight = Math.max(
      requiredContentRight,
      placement.x + placement.width + GANTT_LABEL_OUTSIDE_GAP + labelWidth + GANTT_LABEL_RIGHT_PADDING,
    )
  }
  const labelOverflow = Math.max(0, requiredContentRight - chartW)
  return { placements, schedule, totalDays, baseDate, baseUnit, unitPrefix, pixelsPerUnit, labelOverflow, milestoneLabelSide, axis: { width: chartW, height: chartH, ticks, subTicks, specialLines }, progress }
}

/** True when a view contains at least one visible Gantt element. */
export function viewHasGantt(model: GraphModel, _view: GraphView, visibleIds: Set<string>): boolean {
  for (const id of visibleIds) {
    const el = model.elements[id]
    if (el && isGanttRow(el)) return true
  }
  return false
}
