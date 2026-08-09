import type { Node, Edge } from '@xyflow/react'
import type { CSSProperties } from 'react'
import type { GraphModel, GraphView, Position } from '@/core/model'
import { notationRegistry } from '@/core/notation'
import { contrastTextColor, deriveAccentColors, normalizeHexColor } from '@/core/notation'
import {
  runLayout, computeGanttChart, computePert,
  layoutSequenceGraph, layoutGitGraphFrame, layoutTimelineGraph, layoutTreeGraph,
  layoutMindmapGraph, layoutGridGraph,
  type LayoutNodeInput, type LayoutEdgeInput, type LayoutEngine, type GanttChart, type GanttTick, type PertResult,
  type ChartFrame, type ChartLayout, type SeqMessage, type TreeRow, type GridFrame, type AnalyticChartFrame, buildAnalyticChart, measureSankeyHeight,
} from '@/core/layout'
import type { GraphNodeData } from './nodes/GraphNode'
import { quadrantItemPosition } from './quadrant-position'

export interface LayoutSettings {
  engine: LayoutEngine
  /** ignore stored positions and lay everything out fresh */
  ignoreStored?: boolean
}

export type { GraphNodeData }
export type GraphNode = Node<GraphNodeData>
export type GraphEdge = Edge

const GENERIC_DEF = notationRegistry.getElementDef('node')!
const CONTAINER_TITLE_H = 28
const CONTAINER_PAD = 16
const CONTAINER_MIN_W = 240
const CONTAINER_MIN_H = 130

export { getVisibleElementIds, isRelationIncluded, relationKey } from '@/core/model/view-visibility'
import { getVisibleElementIds, isRelationIncluded } from '@/core/model/view-visibility'

export function nodeSizeFor(elementType: string): { width: number; height: number } {
  const def = notationRegistry.getElementDef(elementType) ?? GENERIC_DEF
  return { width: def.defaultWidth, height: def.defaultHeight }
}

function isVisibleContainer(model: GraphModel, id: string, visible: Set<string>): boolean {
  return (model.elements[id]?.children ?? []).some(c => visible.has(c))
}

/** Fishbone frame geometry for a `problem` container (relative to its origin). */
export interface IshikawaFrame {
  width: number
  height: number
  headW: number
  spineY: number
  bones: { x1: number; y1: number; x2: number; y2: number }[]
}

/** Axis chrome for a `ganttGraph` container (relative to its origin). */
export interface GanttFrame {
  /** y where the chart body (axis + rows) begins, below the title bar */
  top: number
  width: number
  height: number
  ticks: GanttTick[]
}

// Chart-container element types and which child element types they host. A
// hosted child always lays out inside its container frame (never at the top
// level) and becomes a React Flow child of it, so the whole chart moves as one.
const CONTAINER_FOR: Record<string, string> = {
  ganttTask: 'ganttGraph', ganttMilestone: 'ganttGraph', ganttSection: 'ganttGraph',
  participant: 'seqGraph', seqActor: 'seqGraph',
  commit: 'gitGraph', mergeCommit: 'gitGraph',
  timelineEvent: 'timelineGraph',
  treeNode: 'treeGraph',
  mindmapRoot: 'mindmapGraph', mindmapNode: 'mindmapGraph',
  gridItem: 'gridGraph',
  sankeyNode: 'sankeyGraph', radarSeries: 'radarChart',
  xySeries: 'xyChart', xyPoint: 'xyChart', barSeries: 'barChart',
}
const CHART_FRAME_TYPES = new Set(['seqGraph', 'gitGraph', 'timelineGraph', 'mindmapGraph'])
// containers whose children are pre-placed by a chart layout (not the graph engine)
const PREPLACED_CONTAINERS = new Set(['seqGraph', 'gitGraph', 'timelineGraph', 'treeGraph', 'mindmapGraph', 'gridGraph', 'sankeyGraph', 'radarChart', 'xyChart', 'barChart'])

interface NestedLayout {
  positions: Record<string, Position> // relative-to-parent for children, absolute for top-level
  sizes: Record<string, { width: number; height: number }> // for containers, gantt rows, manual leaves
  /** per-`problem` fishbone frame, keyed by element id */
  ishikawa: Record<string, IshikawaFrame>
  /** per-`ganttGraph` axis frame, keyed by element id */
  ganttFrames: Record<string, GanttFrame>
  /** per seq/git/timeline/mindmap container decor frame, keyed by element id */
  chartFrames: Record<string, ChartFrame>
  /** per-`gridGraph` matrix frame, keyed by element id */
  gridFrames: Record<string, GridFrame>
  analyticCharts: Record<string, AnalyticChartFrame>
  /** per-`treeGraph` file-tree forest, keyed by element id */
  treeRoots: Record<string, TreeRow[]>
  /** tree elements consumed by a treeGraph widget (not rendered as nodes) */
  consumed: Set<string>
  /** container-local right-edge anchor point per treeNode (for edges to other nodes) */
  treeAnchorOf: Record<string, { leftX: number; rightX: number; y: number }>
  /** 0..100 progress per gantt task (union across every gantt graph) */
  ganttProgress: Record<string, number>
  /** React Flow parent (the enclosing chart container) for each hosted child */
  hostOf: Record<string, string>
  /** sequence messages per seqGraph container (container-local coordinates) */
  seqMessagesByHost: Record<string, SeqMessage[]>
  /** relation ids drawn by a chart (not as normal edges) */
  suppressedRelations: Set<string>
}

/** Recursive layout that auto-sizes containers around their children. */
export function computeNestedLayout(
  model: GraphModel,
  view: GraphView,
  settings: LayoutSettings = { engine: 'layered' },
): NestedLayout {
  const engine = settings.engine
  const visible = getVisibleElementIds(model, view)
  // These collections and indexes are shared by every nested layout level.
  // Building them once avoids repeated Object.keys/filter/indexOf scans for
  // charts and deeply nested groups.
  const elements = Object.values(model.elements)
  const relations = Object.values(model.relations)

  // A chart child (gantt row, sequence participant, commit, timeline event)
  // always lays out inside its enclosing chart container — never at the top
  // level — so it moves with the frame. Its React Flow parent is that container
  // even when nested deeper in the DSL. Orphans (no matching container ancestor)
  // fall back to the normal graph layout so they can be dragged into a frame.
  const nearestContainer = (id: string): string | undefined => {
    const wantType = CONTAINER_FOR[model.elements[id]?.type ?? '']
    if (!wantType) return undefined
    let cur = model.elements[id]?.parentId
    while (cur) {
      if (model.elements[cur]?.type === wantType && visible.has(cur)) return cur
      cur = model.elements[cur]?.parentId
    }
    return undefined
  }
  const hostOf: Record<string, string> = {}
  for (const el of elements) {
    if (!visible.has(el.id)) continue
    const host = nearestContainer(el.id)
    if (host) hostOf[el.id] = host
  }

  const childrenOf = new Map<string, string[]>()
  const hostedByContainer = new Map<string, string[]>()
  const ROOT = '__root__'
  childrenOf.set(ROOT, [])
  for (const el of elements) {
    if (!visible.has(el.id)) continue
    // hosted chart children are re-parented onto their container (flattening any
    // intermediate nesting); everything else follows its DSL parent
    const key = hostOf[el.id] ?? (el.parentId && visible.has(el.parentId) ? el.parentId : ROOT)
    if (!childrenOf.has(key)) childrenOf.set(key, [])
    childrenOf.get(key)!.push(el.id)
    const host = hostOf[el.id]
    if (host) {
      const hosted = hostedByContainer.get(host)
      if (hosted) hosted.push(el.id)
      else hostedByContainer.set(host, [el.id])
    }
  }

  const positions: Record<string, Position> = {}
  const sizes: Record<string, { width: number; height: number }> = {}
  const ishikawa: Record<string, IshikawaFrame> = {}
  const ganttFrames: Record<string, GanttFrame> = {}
  const chartFrames: Record<string, ChartFrame> = {}
  const gridFrames: Record<string, GridFrame> = {}
  const analyticCharts: Record<string, AnalyticChartFrame> = {}
  const treeRoots: Record<string, TreeRow[]> = {}
  const consumed = new Set<string>()
  const treeAnchorOf: Record<string, { leftX: number; rightX: number; y: number }> = {}
  const seqMessagesByHost: Record<string, SeqMessage[]> = {}
  const suppressedRelations = new Set<string>()
  const stored = view.layoutPositions ?? {}

  const hostedIds = (containerId: string) => hostedByContainer.get(containerId) ?? []
  const hostedChildren = (containerId: string) => hostedIds(containerId).map(cid => model.elements[cid])

  // one gantt chart per ganttGraph, scheduled over just that graph's rows
  const ganttCharts: Record<string, GanttChart> = {}
  const ganttProgress: Record<string, number> = {}
  // container-local placement per hosted child (gantt + seq/git/timeline)
  const chartPlacement: Record<string, { x: number; y: number; width: number; height: number }> = {}
  const containerSize: Record<string, { width: number; height: number }> = {}

  for (const el of elements) {
    if (!visible.has(el.id)) continue
    if (el.type === 'ganttGraph') {
      const hosted = new Set(hostedIds(el.id))
      const chart = computeGanttChart(model, hosted)
      if (!chart) continue
      ganttCharts[el.id] = chart
      for (const rid of Object.keys(chart.placements)) chartPlacement[rid] = chart.placements[rid]
      Object.assign(ganttProgress, chart.progress)
    } else if (CHART_FRAME_TYPES.has(el.type)) {
      const hosted = new Set(hostedIds(el.id))
      const kids = hostedChildren(el.id)
      let layout: ChartLayout
      if (el.type === 'seqGraph') {
        layout = layoutSequenceGraph(kids, relations)
        seqMessagesByHost[el.id] = layout.messages
        for (const rid of layout.suppressed) suppressedRelations.add(rid)
      } else if (el.type === 'gitGraph') {
        layout = layoutGitGraphFrame(kids)
      } else if (el.type === 'mindmapGraph') {
        layout = layoutMindmapGraph(model, el.id, hosted)
      } else {
        layout = layoutTimelineGraph(kids)
      }
      chartFrames[el.id] = layout.frame
      containerSize[el.id] = { width: layout.width, height: layout.height }
      for (const cid of Object.keys(layout.placements)) chartPlacement[cid] = layout.placements[cid]
    } else if (el.type === 'gridGraph') {
      const hosted = new Set(hostedIds(el.id))
      const gl = layoutGridGraph(model, el.id, hosted, (view.nodeSizes ?? {})[el.id], view.nodeSizes ?? {})
      gridFrames[el.id] = gl.frame
      containerSize[el.id] = { width: gl.frame.width, height: gl.frame.height }
      for (const cid of Object.keys(gl.placements)) chartPlacement[cid] = gl.placements[cid]
    } else if (el.type === 'treeGraph') {
      // tree elements are consumed by the widget: they render as file-tree rows
      // inside the container, not as separate nodes, and their relations are hidden
      const hosted = new Set(hostedIds(el.id))
      const tl = layoutTreeGraph(model, el.id, hosted)
      treeRoots[el.id] = tl.roots
      containerSize[el.id] = { width: tl.width, height: tl.height }
      for (const cid of hosted) {
        consumed.add(cid)
        chartPlacement[cid] = { x: 0, y: 0, width: 0, height: 0 }
        if (tl.rowAnchors[cid]) treeAnchorOf[cid] = tl.rowAnchors[cid]
      }
    } else if (['sankeyGraph', 'radarChart', 'xyChart', 'barChart'].includes(el.type)) {
      const def = notationRegistry.getElementDef(el.type)!
      const manual = (view.nodeSizes ?? {})[el.id]
      // Explicit analytic-chart sizes are exact (within a small usable floor),
      // so users can shrink as well as grow them. An unpinned Sankey derives its
      // height from the tallest depth column and therefore reacts to new links.
      const width = manual ? Math.max(160, manual.width) : def.defaultWidth
      const height = manual
        ? Math.max(120, manual.height)
        : el.type === 'sankeyGraph' ? measureSankeyHeight(model, el.id, visible) : def.defaultHeight
      const frame = buildAnalyticChart(model, el.id, width, height, visible)
      if (frame) analyticCharts[el.id] = frame
      containerSize[el.id] = { width, height }
      const hosted = hostedIds(el.id)
      for (const cid of hosted) {
        const child = model.elements[cid]
        const isEmbeddedSeries =
          (frame?.kind === 'radar' && child?.type === 'radarSeries') ||
          (frame?.kind === 'xy' && child?.type === 'xySeries') ||
          (frame?.kind === 'bar' && child?.type === 'barSeries')
        if (isEmbeddedSeries) {
          const seriesIndex = frame.series.findIndex(series => series.id === cid)
          chartPlacement[cid] = { x: 5 + Math.max(0, seriesIndex) * 110, y: 38, width: 104, height: 20 }
        } else {
          consumed.add(cid)
          chartPlacement[cid] = { x: 0, y: 0, width: 0, height: 0 }
        }
      }
      if (el.type === 'sankeyGraph') {
        const hostedSet = new Set(hosted)
        for (const rel of relations) if (hostedSet.has(rel.sourceId) && hostedSet.has(rel.targetId)) suppressedRelations.add(rel.id)
      }
    }
  }
  // Relations within the same file-tree widget carry no additional meaning;
  // cross-tree relations must remain visible through both row anchors.
  if (consumed.size) {
    for (const rel of relations) {
      if (
        consumed.has(rel.sourceId) && consumed.has(rel.targetId) &&
        hostOf[rel.sourceId] === hostOf[rel.targetId]
      ) suppressedRelations.add(rel.id)
    }
  }

  // hosted children are placed by their container and ignore both the graph
  // layout and any stored positions
  const fixedPlacement = (id: string) => (hostOf[id] ? chartPlacement[id] : undefined)

  function layoutLevel(parentKey: string): { width: number; height: number } {
    const kids = childrenOf.get(parentKey) ?? []
    if (kids.length === 0) return { width: 0, height: 0 }

    const viewSizes = view.nodeSizes ?? {}
    // resolve child sizes (recurse into nested containers first)
    for (const kid of kids) {
      const fp = fixedPlacement(kid)
      if (fp) {
        // A draggable embedded series can itself receive ordinary children.
        // Populate their positions while retaining the series' fixed legend size.
        if (isVisibleContainer(model, kid, visible)) layoutLevel(kid)
        sizes[kid] = { width: fp.width, height: fp.height }
      } else if (isVisibleContainer(model, kid, visible)) {
        sizes[kid] = layoutLevel(kid)
      } else {
        const manual = viewSizes[kid]
        const s = nodeSizeFor(model.elements[kid].type)
        sizes[kid] = manual ?? { width: s.width, height: s.height }
      }
    }

    // quadrant charts place their children from `x "0.7" y "0.3"` properties
    // (0..1, origin bottom-left) instead of running a graph layout
    if (parentKey !== ROOT && model.elements[parentKey]?.type === 'quadrantChart') {
      const def = notationRegistry.getElementDef('quadrantChart')!
      const manual = (view.nodeSizes ?? {})[parentKey]
      const W = Math.max(manual?.width ?? 0, def.defaultWidth)
      const H = Math.max(manual?.height ?? 0, def.defaultHeight)
      for (const kid of kids) {
        if (model.elements[kid].type === 'quadrantItem') {
          const props = model.elements[kid].properties ?? {}
          const px = Math.max(0, Math.min(1, parseFloat(props['x'] ?? '0.5') || 0.5))
          const py = Math.max(0, Math.min(1, parseFloat(props['y'] ?? '0.5') || 0.5))
          positions[kid] = quadrantItemPosition(px, py, { width: W, height: H }, sizes[kid])
        } else {
          positions[kid] = (!settings.ignoreStored ? stored[kid] : undefined)
            ?? { x: CONTAINER_PAD, y: CONTAINER_TITLE_H + CONTAINER_PAD }
        }
      }
      return { width: W, height: H }
    }

    // ganttGraph container: place its rows on the date scale below a title bar,
    // and draw the timeline axis behind them (see the ganttGraph node render)
    if (parentKey !== ROOT && model.elements[parentKey]?.type === 'ganttGraph') {
      const chart = ganttCharts[parentKey]
      const TITLE = CONTAINER_TITLE_H
      const PADX = CONTAINER_PAD
      for (const kid of kids) {
        const pl = chart?.placements[kid]
        positions[kid] = pl ? { x: PADX + pl.x, y: TITLE + pl.y } : { x: PADX, y: TITLE }
      }
      const manual = (view.nodeSizes ?? {})[parentKey]
      const bodyW = chart?.axis.width ?? 240
      const bodyH = chart?.axis.height ?? 120
      const W = Math.max(PADX * 2 + bodyW, manual?.width ?? 0)
      const H = Math.max(TITLE + bodyH + CONTAINER_PAD, manual?.height ?? 0)
      ganttFrames[parentKey] = { top: TITLE, width: W, height: H, ticks: chart?.axis.ticks ?? [] }
      return { width: W, height: H }
    }

    // Native chart children use computed container-local placements. Ordinary
    // nodes/groups may also be nested in a chart; keep their stored coordinates
    // so they can be freely placed like children of any generic container.
    if (parentKey !== ROOT && PREPLACED_CONTAINERS.has(model.elements[parentKey]?.type ?? '')) {
      for (const kid of kids) {
        const placement = chartPlacement[kid]
        positions[kid] = placement
          ? { x: placement.x, y: placement.y }
          : (!settings.ignoreStored ? stored[kid] : undefined) ?? { x: CONTAINER_PAD, y: CONTAINER_TITLE_H + CONTAINER_PAD }
      }
      const manual = (view.nodeSizes ?? {})[parentKey]
      const cs = containerSize[parentKey] ?? { width: 240, height: 160 }
      return { width: Math.max(cs.width, manual?.width ?? 0), height: Math.max(cs.height, manual?.height ?? 0) }
    }

    // ishikawa `cause` container: stack its sub-causes vertically under the title
    if (parentKey !== ROOT && model.elements[parentKey]?.type === 'cause') {
      let y = CONTAINER_TITLE_H + 8
      let maxW = 0
      for (const kid of kids) {
        const s = sizes[kid]
        positions[kid] = { x: CONTAINER_PAD, y }
        y += s.height + 6
        maxW = Math.max(maxW, s.width)
      }
      const manual = (view.nodeSizes ?? {})[parentKey]
      return {
        width: Math.max(150, maxW + 2 * CONTAINER_PAD, manual?.width ?? 0),
        height: Math.max(CONTAINER_TITLE_H + 20, y - 6 + 8, manual?.height ?? 0),
      }
    }

    // ishikawa `problem` container: fishbone frame (causes alternate around a
    // horizontal spine that points at the problem head on the right)
    if (parentKey !== ROOT && model.elements[parentKey]?.type === 'problem') {
      const frame = layoutFishbone(kids, sizes, positions, (view.nodeSizes ?? {})[parentKey])
      ishikawa[parentKey] = frame
      return { width: frame.width, height: frame.height }
    }

    const isRoot = parentKey === ROOT
    const verticalLane = !isRoot && model.elements[parentKey]?.type === 'lane'
    const offX = isRoot ? 40 : verticalLane ? CONTAINER_TITLE_H + CONTAINER_PAD : CONTAINER_PAD
    const offY = isRoot ? 40 : verticalLane ? CONTAINER_PAD : CONTAINER_TITLE_H + CONTAINER_PAD

    const kidSet = new Set(kids)
    const graphKids = kids.filter(id => !fixedPlacement(id))
    const lnodes: LayoutNodeInput[] = graphKids.map(id => ({ id, width: sizes[id].width, height: sizes[id].height }))
    // Lift each relation endpoint to whichever kid (at this level) contains it.
    // This lets the layout "see" cross-container relations (e.g. a child of one
    // container linked to a child of another) and place the containers sensibly,
    // instead of only counting edges whose both endpoints sit directly here.
    const liftToKid = (id: string): string | undefined => {
      let cur: string | undefined = id
      while (cur && model.elements[cur]) {
        if (kidSet.has(cur)) return cur
        const par: string | undefined = model.elements[cur].parentId
        cur = par && visible.has(par) ? par : undefined
      }
      return undefined
    }
    const ledges: LayoutEdgeInput[] = []
    const seenEdge = new Set<string>()
    for (const rel of relations) {
      if (!isRelationIncluded(view, rel.sourceId, rel.targetId)) continue
      const a = liftToKid(rel.sourceId)
      const b = liftToKid(rel.targetId)
      if (!a || !b || a === b) continue
      if (fixedPlacement(a) || fixedPlacement(b)) continue // chart-placed rows don't steer the layout
      const k = `${a}->${b}`
      if (seenEdge.has(k)) continue
      seenEdge.add(k)
      ledges.push({ source: a, target: b })
    }
    const allGraphKidsStored = !settings.ignoreStored && graphKids.every(id => !!stored[id])
    const laid = allGraphKidsStored ? {} : runLayout(engine, lnodes, ledges, {
      direction: view.layoutDirection,
      layerGap: view.layoutDirection === 'lr' || view.layoutDirection === 'rl' ? 100 : 70,
      nodeGap: 44,
      origin: { x: offX, y: offY },
    })

    for (const kid of kids) {
      const fp = fixedPlacement(kid)
      if (fp) {
        positions[kid] = { x: offX + fp.x, y: offY + fp.y }
        continue
      }
      const useStored = !settings.ignoreStored && stored[kid]
      const proposed = useStored ? stored[kid] : (laid[kid] ?? { x: offX, y: offY })
      positions[kid] = verticalLane
        ? { x: Math.max(offX, proposed.x), y: Math.max(offY, proposed.y) }
        : proposed
    }

    if (isRoot) return { width: 0, height: 0 }
    let maxX = 0
    let maxY = 0
    for (const kid of kids) {
      const p = positions[kid]
      const s = sizes[kid]
      maxX = Math.max(maxX, p.x + s.width)
      maxY = Math.max(maxY, p.y + s.height)
    }
    const def = notationRegistry.getElementDef(model.elements[parentKey].type)
    const minW = def?.shape === 'container' ? 300 : CONTAINER_MIN_W
    // a manual (per-view) size can only grow a container, never shrink it below its children
    const manual = (view.nodeSizes ?? {})[parentKey]
    return {
      width: Math.max(minW, maxX + CONTAINER_PAD, manual?.width ?? 0),
      height: Math.max(CONTAINER_MIN_H, maxY + CONTAINER_PAD, manual?.height ?? 0),
    }
  }

  layoutLevel(ROOT)
  return { positions, sizes, ishikawa, ganttFrames, chartFrames, gridFrames, analyticCharts, treeRoots, consumed, treeAnchorOf, ganttProgress, hostOf, seqMessagesByHost, suppressedRelations }
}

/**
 * Arrange a problem's cause children as a fishbone and return the frame
 * geometry (spine + diagonal bones), all relative to the container origin.
 * Causes alternate top/bottom by declaration order; the head sits at the right.
 */
function layoutFishbone(
  causeIds: string[],
  sizes: Record<string, { width: number; height: number }>,
  positions: Record<string, Position>,
  manual: { width: number; height: number } | undefined,
): IshikawaFrame {
  const VPAD = 22
  const LEFT_PAD = 22
  const COL_GAP = 26
  const SPINE_GAP = 26
  const HEAD_W = 156
  const RIGHT_PAD = 18

  const columns: string[][] = []
  causeIds.forEach((id, i) => {
    const c = i >> 1
    ;(columns[c] ??= []).push(id)
  })

  const topIds = causeIds.filter((_, i) => i % 2 === 0)
  const botIds = causeIds.filter((_, i) => i % 2 === 1)
  const topH = Math.max(0, ...topIds.map(id => sizes[id]?.height ?? 0))
  const botH = Math.max(0, ...botIds.map(id => sizes[id]?.height ?? 0))
  const spineY = VPAD + topH + SPINE_GAP
  const bones: IshikawaFrame['bones'] = []

  let x = LEFT_PAD
  for (const col of columns) {
    const colW = Math.max(...col.map(id => sizes[id]?.width ?? 0))
    col.forEach((id, k) => {
      const s = sizes[id]
      const top = k === 0
      const px = x + (colW - s.width) / 2
      const py = top ? spineY - SPINE_GAP - s.height : spineY + SPINE_GAP
      positions[id] = { x: px, y: py }
    })
    x += colW + COL_GAP
  }
  const causesRight = Math.max(LEFT_PAD, x - COL_GAP)

  const headLeft = causesRight + 26
  const W = Math.max(headLeft + HEAD_W + RIGHT_PAD, manual?.width ?? 0)
  const H = Math.max(spineY + SPINE_GAP + botH + VPAD, manual?.height ?? 0)

  // bones: one diagonal from each cause box to a foot on the spine (angled
  // toward the head), drawn after positions so we know each box's rect
  causeIds.forEach((id, i) => {
    const s = sizes[id]
    const p = positions[id]
    const top = i % 2 === 0
    const cx = p.x + s.width / 2
    const footX = Math.min(cx + 64, headLeft - 8)
    bones.push({ x1: cx, y1: top ? p.y + s.height : p.y, x2: footX, y2: spineY })
  })

  return { width: W, height: H, headW: HEAD_W, spineY, bones }
}

/** Flat layered layout for all visible elements (used by "Layout all" — ignores nesting). */
export function buildLayoutInputs(model: GraphModel, view: GraphView): { nodes: LayoutNodeInput[]; edges: LayoutEdgeInput[] } {
  const visible = getVisibleElementIds(model, view)
  const nodes: LayoutNodeInput[] = []
  for (const el of Object.values(model.elements)) {
    if (!visible.has(el.id)) continue
    const { width, height } = nodeSizeFor(el.type)
    nodes.push({ id: el.id, width, height })
  }
  const edges: LayoutEdgeInput[] = []
  for (const rel of Object.values(model.relations)) {
    if (visible.has(rel.sourceId) && visible.has(rel.targetId)) edges.push({ source: rel.sourceId, target: rel.targetId })
  }
  return { nodes, edges }
}

export function computeAutoLayout(
  model: GraphModel,
  view: GraphView,
  settings: LayoutSettings = { engine: 'layered', ignoreStored: true },
): Record<string, Position> {
  const { positions } = computeNestedLayout(model, view, settings)
  return positions
}

export function modelToFlow(
  model: GraphModel,
  view: GraphView,
  settings: LayoutSettings = { engine: 'layered' },
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const visible = getVisibleElementIds(model, view)
  const { positions, sizes, ishikawa, ganttFrames, chartFrames, gridFrames, analyticCharts, treeRoots, consumed, treeAnchorOf, ganttProgress, hostOf, seqMessagesByHost, suppressedRelations } = computeNestedLayout(model, view, settings)

  // every treeNode gets a small connect dot at its label end so the user can
  // drag a relation from it; existing DSL relations reuse the same anchor
  const anchorId = (id: string, side: 'l' | 'r') => `__treeanchor_${id}_${side}`
  const sankeyAnchorId = (id: string, side: 'l' | 'r') => `__sankeyanchor_${id}_${side}`
  const endpointCenterX = (id: string) => {
    const displayId = hostOf[id] ?? id
    const p = positions[displayId]
    const s = sizes[displayId]
    return (p?.x ?? 0) + (s?.width ?? 0) / 2
  }
  const treeEdgeSide = (endpoint: string, other: string) => {
    if (!consumed.has(endpoint) || !treeAnchorOf[endpoint]) return endpoint
    return anchorId(endpoint, endpointCenterX(other) < endpointCenterX(endpoint) ? 'l' : 'r')
  }
  const sankeyEdgeSide = (endpoint: string, other: string): 'l' | 'r' | undefined => {
    if (!consumed.has(endpoint) || model.elements[endpoint]?.type !== 'sankeyNode') return undefined
    const host = hostOf[endpoint]
    const frame = host ? analyticCharts[host] : undefined
    if (!host || frame?.kind !== 'sankey') return undefined
    const embedded = frame.nodes.find(n => n.id === endpoint)
    if (!embedded) return undefined
    const embeddedCenterX = (positions[host]?.x ?? 0) + embedded.x + embedded.width / 2
    return endpointCenterX(other) < embeddedCenterX ? 'l' : 'r'
  }
  const edgeEndpoint = (endpoint: string, other: string) => {
    const sankeySide = sankeyEdgeSide(endpoint, other)
    return sankeySide ? sankeyAnchorId(endpoint, sankeySide) : treeEdgeSide(endpoint, other)
  }
  const neededAnchors = new Set<string>(Object.keys(treeAnchorOf).filter(id => visible.has(id)))

  const projectionFor = (id: string): { dx: number; dy: number } | undefined => {
    const el = model.elements[id]
    if (el?.type !== 'gridItem' && el?.type !== 'quadrantItem') return undefined
    const raw = el.properties?.['projection']?.trim()
    if (!raw) return undefined
    const parts = raw.split(/[\s,]+/).filter(Boolean)
    if (parts.length !== 2) return undefined
    const parentId = hostOf[id] ?? el.parentId
    if (!parentId) return undefined
    let tx: number
    let ty: number
    if (el.type === 'gridItem') {
      const frame = gridFrames[parentId]
      if (!frame) return undefined
      const row = Number(parts[0])
      const col = Number(parts[1])
      if (!Number.isInteger(row) || !Number.isInteger(col) || row < 1 || row > frame.rows || col < 1 || col > frame.cols) return undefined
      tx = frame.originX + (col - 0.5) * frame.cellW
      ty = frame.originY + (row - 0.5) * frame.cellH
    } else {
      const x = Number(parts[0])
      const y = Number(parts[1])
      if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined
      const px = Math.max(0, Math.min(1, x))
      const py = Math.max(0, Math.min(1, y))
      const parentSize = sizes[parentId]
      if (!parentSize) return undefined
      const inset = 26
      tx = inset + px * (parentSize.width - 2 * inset)
      ty = parentSize.height - inset - py * (parentSize.height - 2 * inset)
    }
    const position = positions[id]
    const size = sizes[id]
    if (!position || !size) return undefined
    return {
      dx: tx - (position.x + size.width / 2),
      dy: ty - (position.y + size.height / 2),
    }
  }

  // CPM values when the view shows PERT nodes (computed over the whole model
  // so partial views still display consistent numbers)
  let pert: PertResult | null = null
  for (const id of visible) {
    if (model.elements[id]?.notation === 'pert') { pert = computePert(model); break }
  }

  // depth for z-index (deeper renders on top so leaves sit above their containers)
  const depthOf = new Map<string, number>()
  function depth(id: string): number {
    if (depthOf.has(id)) return depthOf.get(id)!
    const p = model.elements[id]?.parentId
    const d = p && visible.has(p) ? depth(p) + 1 : 0
    depthOf.set(id, d)
    return d
  }

  function mindmapDepth(id: string): number | undefined {
    if (model.elements[id]?.notation !== 'mindmap' || model.elements[id]?.type === 'mindmapGraph') return undefined
    const host = hostOf[id]
    if (!host) return undefined
    let current = id
    let topicDepth = 0
    const seenParents = new Set<string>()
    while (model.elements[current]?.parentId && model.elements[current].parentId !== host) {
      if (seenParents.has(current)) break
      seenParents.add(current)
      current = model.elements[current].parentId!
      topicDepth++
    }
    return topicDepth
  }

  // emit containers before their children (React Flow requirement for parentId)
  const ordered: string[] = []
  const seen = new Set<string>()
  function emit(id: string) {
    if (seen.has(id) || !visible.has(id)) return
    const p = model.elements[id]?.parentId
    if (p && visible.has(p)) emit(p)
    seen.add(id)
    ordered.push(id)
  }
  for (const id of Object.keys(model.elements)) if (visible.has(id)) emit(id)

  const nodes: GraphNode[] = ordered.filter(id => !consumed.has(id)).map(id => {
    const el = model.elements[id]
    const def = notationRegistry.getElementDef(el.type) ?? GENERIC_DEF
    const analyticHost = hostOf[id] ? analyticCharts[hostOf[id]] : undefined
    const embeddedSeries = analyticHost && analyticHost.kind !== 'sankey'
      ? analyticHost.series.find(series => series.id === id)
      : undefined
    const customAccent = normalizeHexColor(el.properties?.accentColor)
    const accentColors = customAccent ? deriveAccentColors(customAccent) : undefined
    const container = isVisibleContainer(model, id, visible)
    const nodeColor = normalizeHexColor(el.properties?.backgroundColor)
    const containerColor = normalizeHexColor(el.properties?.containerColor)
    const fill = container
      ? containerColor ?? nodeColor ?? accentColors?.container ?? def.fill
      : nodeColor ?? accentColors?.tertiary ?? def.fill
    const hasCustomColor = !!(accentColors || nodeColor || containerColor)
    // containers auto-size around children; chart-placed children are chart-sized;
    // other leaves honour a per-view manual size override
    const placed = !!hostOf[id]
    const size = (container && sizes[id]?.width) || (placed && sizes[id])
      ? sizes[id]
      : (view.nodeSizes ?? {})[id] ?? { width: def.defaultWidth, height: def.defaultHeight }
    // a hosted chart child's React Flow parent is its container frame (so it
    // moves with the frame), regardless of any DSL nesting
    const rfParent = hostOf[id] ?? (el.parentId && visible.has(el.parentId) ? el.parentId : undefined)
    const useParent = !!rfParent
    const d = depth(id)
    return {
      id,
      type: 'graphNode',
      position: positions[id] ?? { x: 40, y: 40 },
      width: size.width,
      height: size.height,
      style: {
        width: size.width,
        height: size.height,
        '--node-selection': accentColors?.secondary ?? '#3B82F6',
      } as CSSProperties,
      zIndex: d,
      data: {
        label: el.name,
        elementType: el.type,
        notation: el.notation,
        description: el.description,
        technology: el.technology,
        tags: el.tags,
        shape: def.shape,
        fill,
        stroke: accentColors?.primary ?? def.stroke,
        text: hasCustomColor ? contrastTextColor(fill) : def.text,
        accent: accentColors?.primary ?? def.accent,
        customAccent: hasCustomColor,
        icon: def.icon,
        iconSrc: def.iconSrc,
        width: size.width,
        height: size.height,
        // Chart-hosted items retain their notation shape even when they own DSL
        // descendants. The chart host provides grouping; the topic is not a box.
        isContainer: container && !placed,
        pert: pert?.nodes[id],
        progress: ganttProgress[id],
        badge: el.notation === 'gitgraph' ? el.properties?.['tag'] : undefined,
        // pass raw properties for shapes that render them (quadrant/UML/ERD/note)
        chartProps: el.type === 'quadrantChart' || el.notation === 'uml' || el.notation === 'erd' ? el.properties : undefined,
        ishikawa: ishikawa[id],
        ganttGraph: ganttFrames[id],
        chartFrame: chartFrames[id],
        mindmapDepth: mindmapDepth(id),
        grid: gridFrames[id],
        analyticChart: analyticCharts[id],
        tree: treeRoots[id],
        projection: projectionFor(id),
        linkedViewId: model.views[el.properties?.linkedView]?.id,
        linkedViewName: model.views[el.properties?.linkedView]?.name,
        embeddedSeries: !!embeddedSeries,
        seriesColor: embeddedSeries?.color,
        seriesStroke: embeddedSeries?.stroke,
      },
      ...(useParent ? { parentId: rfParent } : {}),
    }
  })

  // sequence message endpoints: invisible points parented to their seqGraph so
  // they move with the frame; positions are container-local
  for (const [hostId, msgs] of Object.entries(seqMessagesByHost)) {
    for (const msg of msgs) {
      for (const [suffix, x] of [['s', msg.sx], ['t', msg.tx]] as const) {
        nodes.push({
          id: `__seqpt_${msg.relId}_${suffix}`,
          type: 'seqPoint',
          parentId: hostId,
          position: { x: x - 1, y: msg.y - 1 },
          draggable: false,
          selectable: false,
          focusable: false,
          connectable: false,
          zIndex: 1200,
          width: 2,
          height: 2,
          data: {},
        } as unknown as GraphNode)
      }
    }
  }

  // tree anchors: invisible points on the tree frame's right edge, parented to
  // the treeGraph so they move with it
  for (const nodeId of neededAnchors) {
    const host = hostOf[nodeId]
    const a = treeAnchorOf[nodeId]
    if (!host || !a) continue
    for (const side of ['l', 'r'] as const) {
      nodes.push({
        id: anchorId(nodeId, side),
        type: 'treeAnchor',
        parentId: host,
        position: { x: side === 'l' ? a.leftX : a.rightX, y: a.y - 3 },
        draggable: false,
        selectable: false,
        focusable: false,
        connectable: true,
        zIndex: 1200,
        width: 6,
        height: 6,
        data: { treeNodeId: nodeId, side },
      } as unknown as GraphNode)
    }
  }

  // Embedded Sankey bars are drawn inside one React Flow host node. Invisible
  // child points give persisted external relations real endpoints at each bar,
  // while the visible overlay handles remain responsible for interactive drag.
  for (const [hostId, frame] of Object.entries(analyticCharts)) {
    if (frame.kind !== 'sankey') continue
    for (const embedded of frame.nodes) {
      for (const side of ['l', 'r'] as const) {
        const x = side === 'l' ? embedded.x : embedded.x + embedded.width
        nodes.push({
          id: sankeyAnchorId(embedded.id, side),
          type: 'seqPoint',
          parentId: hostId,
          position: { x: x - 1, y: embedded.y - 1 },
          draggable: false,
          selectable: false,
          focusable: false,
          connectable: false,
          zIndex: 1200,
          width: 2,
          height: 2,
          data: {},
        } as unknown as GraphNode)
      }
    }
  }

  // nearest visible ancestor-or-self (undefined if the whole chain is hidden)
  function liftToVisible(id: string): string | undefined {
    let cur: string | undefined = id
    while (cur && !visible.has(cur)) cur = model.elements[cur]?.parentId
    return cur && visible.has(cur) ? cur : undefined
  }

  // is `ancestor` a (transitive) parent of `descendant`?
  function isAncestorOf(ancestor: string, descendant: string): boolean {
    let p = model.elements[descendant]?.parentId
    while (p) {
      if (p === ancestor) return true
      p = model.elements[p]?.parentId
    }
    return false
  }

  const edges: GraphEdge[] = []
  const directKeys = new Set<string>()
  // inherited (lifted) relations between visible ancestors, grouped per ordered pair
  const inherited = new Map<string, { source: string; target: string; labels: string[] }>()

  for (const rel of Object.values(model.relations)) {
    if (!isRelationIncluded(view, rel.sourceId, rel.targetId)) continue
    // sequence messages are drawn by the seqGraph, not as normal edges
    if (suppressedRelations.has(rel.id)) continue
    if (visible.has(rel.sourceId) && visible.has(rel.targetId)) {
      // ── direct edge: both endpoints visible ──
      directKeys.add(`${rel.sourceId}->${rel.targetId}`)
      const rdef = notationRegistry.getRelationDef(rel.type)
      const dashed = rdef?.lineStyle === 'dashed'
      const dotted = rdef?.lineStyle === 'dotted'
      // notation-correct markers come from the registry; direction adds/removes heads
      let markerStart: string | undefined = rdef?.markerStart
      let markerEnd: string | undefined = rdef?.markerEnd ?? 'gms-arrow-open'
      if (rel.direction === 'undirected') { markerStart = undefined; markerEnd = undefined }
      if (rel.direction === 'bidirectional') { markerStart = markerStart ?? 'gms-arrow-open' }
      // UML use-case stereotypes label themselves when no explicit label is set
      let label = rel.label
      if (!label && (rel.type === 'include' || rel.type === 'extend')) label = `«${rel.type}»`
      const critical = pert?.criticalRelations.has(rel.id) ?? false
      const relationAccent = normalizeHexColor(rel.properties?.accentColor)
      const relationColors = relationAccent ? deriveAccentColors(relationAccent) : undefined
      // a consumed treeNode endpoint is redirected to its frame-edge anchor
      const eSource = edgeEndpoint(rel.sourceId, rel.targetId)
      const eTarget = edgeEndpoint(rel.targetId, rel.sourceId)
      // if a tree endpoint has no anchor (not linked out / collapsed away), skip
      if ((consumed.has(rel.sourceId) && eSource === rel.sourceId) || (consumed.has(rel.targetId) && eTarget === rel.targetId)) continue
      edges.push({
        id: rel.id,
        source: eSource,
        target: eTarget,
        type: 'floating',
        sourceHandle: consumed.has(rel.sourceId) ? undefined : rel.sourceHandle,
        targetHandle: consumed.has(rel.targetId) ? undefined : rel.targetHandle,
        data: { label, sourceLabel: rel.properties?.['sourceCard'], targetLabel: rel.properties?.['targetCard'], selectedStroke: relationColors?.secondary },
        markerStart: markerStart || undefined,
        markerEnd: markerEnd || undefined,
        style: {
          stroke: relationColors?.primary ?? (critical ? '#D32F2F' : 'var(--edge)'),
          strokeWidth: critical ? 2.4 : 1.6,
          strokeDasharray: dashed ? '6 4' : dotted ? '2 3' : undefined,
        },
        zIndex: 1000, // edges above containers
      })
      continue
    }
    // ── inherited edge: lift hidden endpoint(s) to their visible ancestor ──
    const ls = liftToVisible(rel.sourceId)
    const lt = liftToVisible(rel.targetId)
    if (!ls || !lt || ls === lt) continue // nothing visible to connect, or self-loop
    // drop deduced ascending/descending edges: a relation that, after lifting,
    // links a node to one of its own ancestors (e.g. b->c collapsing to b->A)
    if (isAncestorOf(ls, lt) || isAncestorOf(lt, ls)) continue
    const key = `${ls}->${lt}`
    const g = inherited.get(key) ?? { source: ls, target: lt, labels: [] }
    if (rel.label) g.labels.push(rel.label)
    inherited.set(key, g)
  }

  // sequence messages: straight edges between the lifeline points, keyed by the
  // relation id so selection/deletion still hit the model
  for (const msgs of Object.values(seqMessagesByHost)) {
    for (const msg of msgs) {
      const rel = model.relations[msg.relId]
      if (!rel) continue
      const rdef = notationRegistry.getRelationDef(rel.type)
      const relationAccent = normalizeHexColor(rel.properties?.accentColor)
      const relationColors = relationAccent ? deriveAccentColors(relationAccent) : undefined
      edges.push({
        id: rel.id,
        source: `__seqpt_${msg.relId}_s`,
        target: `__seqpt_${msg.relId}_t`,
        type: 'floating',
        data: { label: rel.label, selectedStroke: relationColors?.secondary },
        markerEnd: rdef?.markerEnd ?? 'gms-arrow-filled',
        markerStart: rdef?.markerStart,
        style: {
          stroke: relationColors?.primary ?? 'var(--edge)',
          strokeWidth: 1.6,
          strokeDasharray: rdef?.lineStyle === 'dashed' ? '6 4' : rdef?.lineStyle === 'dotted' ? '2 3' : undefined,
        },
        zIndex: 1000,
      })
    }
  }

  // emit one aggregated edge per visible pair; its label is the underlying
  // relation labels concatenated with "/" (deduped, order-preserving)
  for (const [key, g] of inherited) {
    if (directKeys.has(key)) continue // a direct edge already conveys this link
    const label = [...new Set(g.labels)].join('/')
    edges.push({
      id: `inherited:${key}`,
      source: g.source,
      target: g.target,
      type: 'floating',
      data: { label: label || undefined },
      markerEnd: 'gms-arrow-open',
      style: { stroke: 'var(--edge)', strokeWidth: 1.4, strokeDasharray: '5 4', opacity: 0.85 },
      zIndex: 1000,
    })
  }

  return { nodes, edges }
}
