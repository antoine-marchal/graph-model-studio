import type { GraphModel } from '@/core/model'
import { deriveAccentColors, normalizeHexColor } from '@/core/notation'

export interface SankeyNodeFrame { id: string; label: string; x: number; y: number; width: number; height: number; color: string; stroke: string; selectedStroke: string }
export interface SankeyLinkFrame { id: string; source: string; target: string; value: number; color: string; selectedColor?: string; sourceY: number; targetY: number; sourceThickness: number; targetThickness: number }
export interface SankeyFrame { kind: 'sankey'; width: number; height: number; nodes: SankeyNodeFrame[]; links: SankeyLinkFrame[] }
export interface RadarSeriesFrame { id: string; label: string; values: number[]; color: string; stroke: string }
export interface RadarFrame { kind: 'radar'; width: number; height: number; axes: string[]; max: number; series: RadarSeriesFrame[] }
export interface XyPointFrame { id: string; x: number; y: number; size: number; label?: string }
export interface XySeriesFrame { id: string; label: string; color: string; stroke: string; points: XyPointFrame[] }
export interface XyFrame { kind: 'xy'; width: number; height: number; xLabel?: string; yLabel?: string; xMin: number; xMax: number; yMin: number; yMax: number; connect: boolean; regression: boolean; series: XySeriesFrame[] }
export interface BarSeriesFrame { id: string; label: string; values: number[]; color: string; stroke: string }
export interface BarFrame { kind: 'bar'; width: number; height: number; categories: string[]; xLabel?: string; yLabel?: string; stacked: boolean; series: BarSeriesFrame[] }
export type AnalyticChartFrame = SankeyFrame | RadarFrame | XyFrame | BarFrame

const COLORS = ['#3B82F6', '#EC4899', '#10B981', '#F59E0B', '#8B5CF6', '#06B6D4', '#EF4444']
const list = (raw?: string) => (raw ?? '').split(';').map(s => s.trim()).filter(Boolean)
const num = (raw: string | undefined, fallback = 0) => { const n = Number(raw); return Number.isFinite(n) ? n : fallback }
const elementColors = (properties: Record<string, string>, fallback: string) => {
  const customAccent = normalizeHexColor(properties.accentColor)
  const backgroundColor = normalizeHexColor(properties.backgroundColor)
  if (customAccent) {
    const derived = deriveAccentColors(customAccent)
    return { color: backgroundColor ?? derived.tertiary, stroke: derived.primary, selectedStroke: derived.secondary }
  }
  const color = backgroundColor ?? normalizeHexColor(properties.color) ?? fallback
  return { color, stroke: color, selectedStroke: color }
}

const SANKEY_TOP = 58
const SANKEY_BOTTOM = 48
const SANKEY_GAP = 12

function sankeyMetrics(model: GraphModel, id: string, visibleIds: ReadonlySet<string>) {
  const chart = model.elements[id]
  if (!chart || chart.type !== 'sankeyGraph') return undefined
  const items = chart.children.map(cid => model.elements[cid]).filter(e => e?.type === 'sankeyNode' && visibleIds.has(e.id))
  const ids = new Set(items.map(e => e.id))
  const rawLinks = Object.values(model.relations).filter(r => ids.has(r.sourceId) && ids.has(r.targetId)).map((r, i) => {
    const customAccent = normalizeHexColor(r.properties?.accentColor)
    return {
      id: r.id,
      source: r.sourceId,
      target: r.targetId,
      value: Math.max(0.1, num(r.properties?.value, num(r.label, 1))),
      color: customAccent ?? normalizeHexColor(r.properties?.color) ?? COLORS[i % COLORS.length],
      selectedColor: customAccent ? deriveAccentColors(customAccent).secondary : undefined,
    }
  })
  const incoming: Record<string, number> = {}, outgoing: Record<string, number> = {}, totals: Record<string, number> = {}
  for (const item of items) {
    incoming[item.id] = rawLinks.filter(l => l.target === item.id).reduce((a, l) => a + l.value, 0)
    outgoing[item.id] = rawLinks.filter(l => l.source === item.id).reduce((a, l) => a + l.value, 0)
    totals[item.id] = Math.max(incoming[item.id], outgoing[item.id], 1)
  }
  const maxTotal = Math.max(1, ...Object.values(totals))
  const scale = 90 / maxTotal
  const depth: Record<string, number> = Object.fromEntries(items.map(e => [e.id, 0]))
  for (let pass = 0; pass < items.length; pass++) for (const l of rawLinks) depth[l.target] = Math.max(depth[l.target] ?? 0, (depth[l.source] ?? 0) + 1)
  const groups = new Map<number, typeof items>()
  for (const item of items) groups.set(depth[item.id], [...(groups.get(depth[item.id]) ?? []), item])
  return { items, rawLinks, incoming, outgoing, totals, scale, depth, groups }
}

/** Natural frame height changes when Sankey links move nodes into new depth columns. */
export function measureSankeyHeight(
  model: GraphModel,
  id: string,
  visibleIds: ReadonlySet<string> = new Set(Object.keys(model.elements)),
): number {
  const metrics = sankeyMetrics(model, id, visibleIds)
  if (!metrics || metrics.items.length === 0) return 160
  let tallest = 0
  for (const group of metrics.groups.values()) {
    const nodesHeight = group.reduce((sum, item) =>
      sum + Math.max(16, num(item.properties?.height, metrics.totals[item.id] * metrics.scale)), 0)
    tallest = Math.max(tallest, nodesHeight + Math.max(0, group.length - 1) * SANKEY_GAP)
  }
  return Math.max(160, Math.ceil(SANKEY_TOP + tallest + SANKEY_BOTTOM))
}

export function buildAnalyticChart(
  model: GraphModel,
  id: string,
  width: number,
  height: number,
  visibleIds: ReadonlySet<string> = new Set(Object.keys(model.elements)),
): AnalyticChartFrame | undefined {
  const chart = model.elements[id]
  if (!chart) return undefined
  const children = chart.children.map(cid => model.elements[cid]).filter(e => e && visibleIds.has(e.id))
  if (chart.type === 'sankeyGraph') {
    const metrics = sankeyMetrics(model, id, visibleIds)!
    const { rawLinks, incoming, outgoing, totals, scale, depth, groups } = metrics
    const maxDepth = Math.max(1, ...Object.values(depth))
    const nodes: SankeyNodeFrame[] = []
    for (const [d, group] of groups) {
      const available = Math.max(20, height - 100)
      const gap = group.length > 1 ? Math.max(2, Math.min(12, (available - group.length * 8) / (group.length - 1))) : 0
      const requested = group.map(item => Math.max(16, num(item.properties?.height, totals[item.id] * scale)))
      const usable = Math.max(group.length * 2, available - gap * (group.length - 1))
      const fit = Math.min(1, usable / requested.reduce((sum, value) => sum + value, 0))
      let cursor = SANKEY_TOP
      group.forEach((item, i) => {
        const nodeHeight = requested[i] * fit
        const colors = elementColors(item.properties, COLORS[nodes.length % COLORS.length])
        nodes.push({
          id: item.id, label: item.name, x: 54 + d * (width - 108) / maxDepth, y: cursor + nodeHeight / 2,
          width: 16, height: nodeHeight, ...colors,
        })
        cursor += nodeHeight + gap
      })
    }
    const byId = new Map(nodes.map(n => [n.id, n])), sourceOffset: Record<string, number> = {}, targetOffset: Record<string, number> = {}
    const links: SankeyLinkFrame[] = rawLinks.map(l => {
      const a = byId.get(l.source)!, b = byId.get(l.target)!
      // Allocate each end from that node's actual rendered height. A custom
      // node height therefore widens/narrows its attached Sankey ribbons.
      const sourceThickness = Math.max(2, l.value / Math.max(outgoing[l.source], l.value) * a.height)
      const targetThickness = Math.max(2, l.value / Math.max(incoming[l.target], l.value) * b.height)
      const so = sourceOffset[l.source] ?? -a.height / 2, to = targetOffset[l.target] ?? -b.height / 2
      sourceOffset[l.source] = so + sourceThickness; targetOffset[l.target] = to + targetThickness
      return { ...l, sourceThickness, targetThickness, sourceY: a.y + so + sourceThickness / 2, targetY: b.y + to + targetThickness / 2 }
    })
    return { kind: 'sankey', width, height, nodes, links }
  }
  if (chart.type === 'radarChart') {
    const axes = list(chart.properties?.axes)
    const series = children.filter(e => e.type === 'radarSeries').map((e, i) => ({ id: e.id, label: e.name, values: list(e.properties?.values).map(v => num(v)), ...elementColors(e.properties, COLORS[i % COLORS.length]) }))
    const observed = Math.max(1, ...series.flatMap(s => s.values))
    return { kind: 'radar', width, height, axes: axes.length >= 3 ? axes : ['A', 'B', 'C', 'D', 'E'], max: Math.max(1, num(chart.properties?.max, observed)), series }
  }
  if (chart.type === 'xyChart') {
    const seriesEls = children.filter(e => e.type === 'xySeries')
    const series = seriesEls.map((s, i) => ({
      id: s.id, label: s.name, ...elementColors(s.properties, COLORS[i % COLORS.length]),
      points: s.children.map(pid => model.elements[pid]).filter(p => p?.type === 'xyPoint' && visibleIds.has(p.id)).map(p => ({ id: p.id, x: num(p.properties?.x), y: num(p.properties?.y), size: Math.max(3, num(p.properties?.size, 6)), label: p.name })),
    }))
    const points = series.flatMap(s => s.points)
    const xs = points.map(p => p.x), ys = points.map(p => p.y)
    let xMin = num(chart.properties?.xMin, xs.length ? Math.min(...xs) : 0), xMax = num(chart.properties?.xMax, xs.length ? Math.max(...xs) : 10)
    let yMin = num(chart.properties?.yMin, ys.length ? Math.min(...ys) : 0), yMax = num(chart.properties?.yMax, ys.length ? Math.max(...ys) : 10)
    if (xMin === xMax) { xMin -= 1; xMax += 1 } if (yMin === yMax) { yMin -= 1; yMax += 1 }
    return { kind: 'xy', width, height, xLabel: chart.properties?.xLabel, yLabel: chart.properties?.yLabel, xMin, xMax, yMin, yMax, connect: chart.properties?.connect !== 'false', regression: chart.properties?.regression === 'true', series }
  }
  if (chart.type === 'barChart') {
    const categories = list(chart.properties?.categories)
    const series = children.filter(e => e.type === 'barSeries').map((e, i) => ({ id: e.id, label: e.name, values: list(e.properties?.values).map(v => num(v)), ...elementColors(e.properties, COLORS[i % COLORS.length]) }))
    return { kind: 'bar', width, height, categories, xLabel: chart.properties?.xLabel, yLabel: chart.properties?.yLabel, stacked: chart.properties?.mode === 'stacked', series }
  }
}
