import type { GraphElement, GraphModel, GraphRelation } from '../model'

/** Chart-local geometry for one element (relative to its container origin). */
export interface SpecialPlacement {
  x: number
  y: number
  width: number
  height: number
}

export interface DecorLine {
  x1: number
  y1: number
  x2: number
  y2: number
  dash?: string
  width?: number
  color?: string
}

export interface DecorText {
  x: number
  y: number
  text: string
  size?: number
  color?: string
  anchor?: 'start' | 'middle' | 'end'
  bold?: boolean
}

/** Background furniture (lifelines, spine, lane lines) for a chart container. */
export interface ChartFrame {
  lines: DecorLine[]
  texts: DecorText[]
}

const MINDMAP_BLUE = '#087CB5'
const MINDMAP_DEEP = '#71767A'

/** A sequence message drawn between two lifeline points (container-local). */
export interface SeqMessage {
  relId: string
  sx: number
  tx: number
  y: number
}

/** Result of laying out one chart container's children. */
export interface ChartLayout {
  /** container-local placement per child */
  placements: Record<string, SpecialPlacement>
  width: number
  height: number
  frame: ChartFrame
  /** sequence messages (empty for other charts) */
  messages: SeqMessage[]
  /** relation ids replaced by the chart's own drawing (sequence messages) */
  suppressed: string[]
}

const EDGE_COLOR = 'var(--edge)'
const TEXT_COLOR = 'var(--fg-subtle)'
const TITLE = 28 // container title-bar height (matches CONTAINER_TITLE_H)
const PADX = 16
const PADY = 12

function defSize(el: GraphElement, fallbackW: number, fallbackH: number) {
  return { width: el.size?.width ?? fallbackW, height: el.size?.height ?? fallbackH }
}

const empty = (): Pick<ChartLayout, 'placements' | 'frame' | 'messages' | 'suppressed'> => ({
  placements: {}, frame: { lines: [], texts: [] }, messages: [], suppressed: [],
})

/**
 * Sequence diagram: participants become columns with dashed lifelines; the
 * relations between them are drawn as ordered horizontal messages.
 */
export function layoutSequenceGraph(participants: GraphElement[], relations: GraphRelation[]): ChartLayout {
  const out = { ...empty(), width: 240, height: 160 } as ChartLayout
  if (participants.length === 0) return out

  const COL = 184
  const sizes = participants.map(p => defSize(p, p.type === 'seqActor' ? 90 : 140, p.type === 'seqActor' ? 96 : 52))
  const headH = Math.max(...sizes.map(s => s.height))
  const centerX = (i: number) => PADX + 74 + i * COL
  const headTop = TITLE + PADY

  const partIds = new Set(participants.map(p => p.id))
  const msgs = relations.filter(r => partIds.has(r.sourceId) && partIds.has(r.targetId))
  const STEP = 38
  const firstY = headTop + headH + 34
  const lastCenter = centerX(participants.length - 1)

  const width = lastCenter + 74 + PADX
  const height = firstY + Math.max(msgs.length, 1) * STEP + PADY + 6

  participants.forEach((p, i) => {
    const s = sizes[i]
    // bottom-align the heads so every lifeline starts at the same y
    out.placements[p.id] = { x: centerX(i) - s.width / 2, y: headTop + (headH - s.height), width: s.width, height: s.height }
    out.frame.lines.push({ x1: centerX(i), y1: headTop + headH + 2, x2: centerX(i), y2: height - PADY, dash: '5 4', color: EDGE_COLOR })
  })

  const idx = new Map(participants.map((p, i) => [p.id, i]))
  msgs.forEach((r, k) => {
    out.suppressed.push(r.id)
    const sx = centerX(idx.get(r.sourceId)!)
    const tx = r.sourceId === r.targetId ? sx + 66 : centerX(idx.get(r.targetId)!)
    out.messages.push({ relId: r.id, sx, tx, y: firstY + k * STEP })
  })

  out.width = width
  out.height = height
  return out
}

/**
 * Git graph: commits flow left→right in declaration order; the `branch`
 * property assigns each a horizontal lane.
 */
export function layoutGitGraphFrame(commits: GraphElement[]): ChartLayout {
  const out = { ...empty(), width: 240, height: 140 } as ChartLayout
  if (commits.length === 0) return out

  const LABW = 84
  const COLW = 60
  const LANEH = 58
  const lanes: string[] = []
  const laneOf = new Map<string, number>()
  for (const c of commits) {
    const b = c.properties?.['branch'] ?? 'main'
    if (!lanes.includes(b)) lanes.push(b)
    laneOf.set(c.id, lanes.indexOf(b))
  }
  const top = TITLE + PADY
  const laneMid = (l: number) => top + l * LANEH + LANEH / 2

  commits.forEach((c, i) => {
    const s = defSize(c, c.type === 'mergeCommit' ? 30 : 26, c.type === 'mergeCommit' ? 30 : 26)
    const cx = LABW + COLW / 2 + i * COLW
    const cy = laneMid(laneOf.get(c.id)!)
    out.placements[c.id] = { x: cx - s.width / 2, y: cy - s.height / 2, width: s.width, height: s.height }
  })

  const width = LABW + commits.length * COLW + 24
  const height = top + lanes.length * LANEH + PADY
  lanes.forEach((b, l) => {
    out.frame.lines.push({ x1: LABW - 16, y1: laneMid(l), x2: width - 8, y2: laneMid(l), dash: '2 6', color: EDGE_COLOR })
    out.frame.texts.push({ x: 8, y: laneMid(l) + 3, text: b, size: 10, bold: true, color: TEXT_COLOR })
  })

  out.width = width
  out.height = height
  return out
}

/**
 * Mindmap: a central root with branches radiating outward. Nodes are placed on
 * concentric rings by depth; each subtree gets an angular slice proportional to
 * its leaf count. Connectors are drawn as frame lines (rendered by chartFrame).
 */
export function layoutMindmapGraph(model: GraphModel, containerId: string, hostedIds: Set<string>): ChartLayout {
  const out = { ...empty(), width: 320, height: 260 } as ChartLayout
  const hosted = new Set([...hostedIds].filter(id => !!model.elements[id]))
  const kidsOf = (id: string) => (model.elements[id]?.children ?? [])
    .filter((child, index, all) => hosted.has(child) && child !== id && all.indexOf(child) === index)
  const roots = [...hosted].filter(id => {
    const parent = model.elements[id].parentId
    return parent === containerId || !hosted.has(parent ?? '')
  })
  // Keep disconnected/cyclic components visible instead of silently dropping them.
  const reachable = new Set<string>()
  const markReachable = (id: string) => {
    if (reachable.has(id)) return
    reachable.add(id)
    kidsOf(id).forEach(markReachable)
  }
  roots.forEach(markReachable)
  for (const id of hosted) {
    if (!reachable.has(id)) { roots.push(id); markReachable(id) }
  }
  if (roots.length === 0) return out

  const leafCount = new Map<string, number>()
  const leaves = (id: string, path = new Set<string>()): number => {
    if (leafCount.has(id)) return leafCount.get(id)!
    if (path.has(id)) return 1
    const nextPath = new Set(path).add(id)
    const k = kidsOf(id).filter(child => !nextPath.has(child))
    const n = k.length ? k.reduce((sum, child) => sum + leaves(child, nextPath), 0) : 1
    leafCount.set(id, n); return n
  }
  const single = roots.length === 1
  const depthIds = new Map<number, string[]>()
  const depthById = new Map<string, number>()
  const seenDepth = new Set<string>()
  const collectDepths = (id: string, depth: number) => {
    if (seenDepth.has(id)) return
    seenDepth.add(id)
    depthById.set(id, depth)
    const ids = depthIds.get(depth) ?? []
    ids.push(id); depthIds.set(depth, ids)
    for (const child of kidsOf(id)) collectDepths(child, depth + 1)
  }
  roots.forEach(root => collectDepths(root, single ? 0 : 1))
  const size = (id: string) => {
    const depth = depthById.get(id) ?? 2
    const diameter = depth === 0 ? 190 : depth === 1 ? 132 : depth === 2 ? 104 : Math.max(72, 92 - (depth - 3) * 6)
    return defSize(model.elements[id], diameter, diameter)
  }

  // Grow each ring to fit both the radial node widths and the total tangential
  // footprint at that depth. This prevents dense branches from overlapping.
  const radii: number[] = [0]
  const maxDepth = Math.max(0, ...depthIds.keys())
  for (let depth = 1; depth <= maxDepth; depth++) {
    const ids = depthIds.get(depth) ?? []
    // Axis-aligned node boxes need their diagonal footprint at 45-degree
    // positions; arc length based on diameter alone can still overlap there.
    const circumference = ids.reduce((sum, id) => {
      const nodeSize = size(id)
      return sum + Math.hypot(nodeSize.width, nodeSize.height) + 28
    }, 0)
    const previousIds = depthIds.get(depth - 1) ?? []
    const previousHalfWidth = Math.max(0, ...previousIds.map(id => size(id).width / 2))
    const currentHalfWidth = Math.max(0, ...ids.map(id => size(id).width / 2))
    const radialClearance = radii[depth - 1] + previousHalfWidth + currentHalfWidth + 54
    radii[depth] = Math.max(radialClearance, circumference / (Math.PI * 2))
  }

  const cx = radii[maxDepth] + 160
  const cy = radii[maxDepth] + 160 + TITLE
  const centers: Record<string, { x: number; y: number }> = {}
  const placed = new Set<string>()

  const place = (id: string, depth: number, a0: number, a1: number) => {
    if (placed.has(id)) return
    placed.add(id)
    const ang = (a0 + a1) / 2
    const r = radii[depth] ?? radii[radii.length - 1]
    const x = cx + r * Math.cos(ang)
    const y = cy + r * Math.sin(ang)
    centers[id] = { x, y }
    const s = size(id)
    out.placements[id] = { x: x - s.width / 2, y: y - s.height / 2, width: s.width, height: s.height }
    const kids = kidsOf(id).filter(kid => !placed.has(kid))
    const tot = leaves(id)
    let a = a0
    for (const kid of kids) {
      const b = a + (a1 - a0) * (leaves(kid) / tot)
      place(kid, depth + 1, a, b)
      const childDepth = depthById.get(kid) ?? depth + 1
      out.frame.lines.push({
        x1: x, y1: y, x2: centers[kid].x, y2: centers[kid].y,
        width: childDepth <= 2 ? 3 : 1.8,
        color: childDepth <= 2 ? MINDMAP_BLUE : MINDMAP_DEEP,
      })
      a = b
    }
  }

  if (single) {
    place(roots[0], 0, 0, Math.PI * 2)
  } else {
    const tot = roots.reduce((s, r) => s + leaves(r), 0)
    let a = 0
    for (const r of roots) { const b = a + Math.PI * 2 * (leaves(r) / tot); place(r, 1, a, b); a = b }
  }

  // Derive and normalize the frame from actual rectangles so custom node sizes
  // cannot be clipped by an estimated radius.
  const boxes = Object.values(out.placements)
  const minX = Math.min(...boxes.map(p => p.x))
  const minY = Math.min(...boxes.map(p => p.y))
  const maxX = Math.max(...boxes.map(p => p.x + p.width))
  const maxY = Math.max(...boxes.map(p => p.y + p.height))
  const dx = PADX - minX
  const dy = TITLE + PADY - minY
  for (const p of boxes) { p.x += dx; p.y += dy }
  for (const line of out.frame.lines) { line.x1 += dx; line.x2 += dx; line.y1 += dy; line.y2 += dy }
  out.width = Math.max(320, maxX - minX + PADX * 2)
  out.height = Math.max(260, maxY - minY + TITLE + PADY * 2)
  return out
}

/** Cell + item geometry for a gridGraph (AMDEC-style N×M matrix). */
export interface GridFrame {
  cols: number
  rows: number
  cellW: number
  cellH: number
  originX: number
  originY: number
  xLabel?: string
  yLabel?: string
  xHeaders: string[]
  yHeaders: string[]
  /** background fill per "row,col" (1-based) */
  cellBg: Record<string, string>
  width: number
  height: number
}

export interface GridLayout {
  placements: Record<string, SpecialPlacement>
  frame: GridFrame
}

const GRID_HEAD = 30 // header band thickness (px)
const GRID_AXIS = 22 // axis-title band thickness

/** Parse "2,3=#f00; 1,1=#0f0" into { "2,3": "#f00", … }. */
function parseCellBg(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (raw ?? '').split(';')) {
    const m = part.trim().match(/^(\d+)\s*,\s*(\d+)\s*=\s*(\S+)$/)
    if (m) out[`${m[1]},${m[2]}`] = m[3]
  }
  return out
}

/**
 * Grid / matrix (e.g. a 5×5 AMDEC): a labelled N×M table. `gridItem` children
 * carry `row`/`col` (1-based) and stack inside their cell; drag-drop moves them
 * between cells (see the drag handler). Cells can be labelled via headers and
 * given fixed background colours.
 */
export function layoutGridGraph(
  model: GraphModel,
  containerId: string,
  hostedIds: Set<string>,
  targetSize?: { width: number; height: number },
  itemSizes: Record<string, { width: number; height: number }> = {},
): GridLayout {
  const p = model.elements[containerId]?.properties ?? {}
  const cols = Math.max(1, parseInt(p['cols'] ?? '5', 10) || 5)
  const rows = Math.max(1, parseInt(p['rows'] ?? '5', 10) || 5)
  const preferredCellW = Math.max(80, parseInt(p['cellW'] ?? '110', 10) || 110)
  const preferredCellH = Math.max(56, parseInt(p['cellH'] ?? '84', 10) || 84)
  const xHeaders = (p['xHeaders'] ?? '').split(';').map(s => s.trim()).filter(Boolean)
  const yHeaders = (p['yHeaders'] ?? '').split(';').map(s => s.trim()).filter(Boolean)
  const cellBg = parseCellBg(p['cellBg'])

  const gridMargin = GRID_AXIS + GRID_HEAD
  const originX = gridMargin
  const originY = TITLE + gridMargin
  // A manually enlarged matrix distributes all additional interior space
  // across its columns and rows instead of leaving an empty area on the right
  // or bottom. Explicit cell sizes remain the minimum geometry.
  const cellW = Math.max(preferredCellW, targetSize ? (targetSize.width - gridMargin * 2) / cols : 0)
  const cellH = Math.max(preferredCellH, targetSize ? (targetSize.height - TITLE - gridMargin * 2) / rows : 0)

  // stack items within their cell
  const items = [...hostedIds].map(id => model.elements[id]).filter(Boolean)
  const perCellOffset = new Map<string, number>()
  const placements: Record<string, SpecialPlacement> = {}
  for (const it of items) {
    const r = Math.min(rows, Math.max(1, parseInt(it.properties?.['row'] ?? '1', 10) || 1))
    const c = Math.min(cols, Math.max(1, parseInt(it.properties?.['col'] ?? '1', 10) || 1))
    const key = `${r},${c}`
    const offset = perCellOffset.get(key) ?? 0
    const fallback = defSize(it, cellW - 12, 26)
    const requested = itemSizes[it.id] ?? fallback
    const availableHeight = Math.max(18, cellH - 12 - offset)
    const width = Math.min(Math.max(48, requested.width), cellW - 12)
    const height = Math.min(Math.max(18, requested.height), availableHeight)
    placements[it.id] = {
      x: originX + (c - 1) * cellW + 6,
      y: originY + (r - 1) * cellH + 6 + offset,
      width,
      height,
    }
    perCellOffset.set(key, offset + height + 4)
  }

  const width = gridMargin + cols * cellW + gridMargin
  const height = TITLE + gridMargin + rows * cellH + gridMargin
  return {
    placements,
    frame: { cols, rows, cellW, cellH, originX, originY, xLabel: p['xLabel'], yLabel: p['yLabel'], xHeaders, yHeaders, cellBg, width, height },
  }
}

/** One row of a treeGraph file-tree widget. */
export interface TreeRow {
  id: string
  label: string
  type: string
  /** custom icon path from the `icon` property (relative to the .gmc, or absolute) */
  icon?: string
  children: TreeRow[]
}

export interface TreeGraphLayout {
  roots: TreeRow[]
  width: number
  height: number
  /** container-local anchor point (right edge of each row) for edges to a treeNode */
  rowAnchors: Record<string, { leftX: number; rightX: number; y: number }>
}

export const TREE_ROW_H = 24
export const TREE_INDENT = 16

/**
 * File-tree (Windows Explorer style) structure for a `treeGraph` container.
 * Only `treeNode` elements are used: a node with children renders as a folder,
 * a childless node as a file. Builds a forest from parentId nesting and sizes
 * the widget for the fully-expanded tree. Collapse/expand is live-only.
 */
export function layoutTreeGraph(model: GraphModel, containerId: string, hostedIds: Set<string>): TreeGraphLayout {
  const build = (id: string): TreeRow => {
    const el = model.elements[id]
    const kids = (el.children ?? []).filter(c => hostedIds.has(c))
    return { id, label: el.name, type: el.type, icon: el.properties?.['icon'], children: kids.map(build) }
  }
  const roots = [...hostedIds]
    .filter(id => model.elements[id]?.parentId === containerId)
    .map(build)

  const top = TITLE + PADY
  const rowAnchors: Record<string, { leftX: number; rightX: number; y: number }> = {}
  let rowIdx = 0
  let maxW = 0
  const walk = (r: TreeRow, depth: number) => {
    const y = top + rowIdx * TREE_ROW_H + TREE_ROW_H / 2
    // anchor sits just past the end of the label (where the connect dot renders)
    const labelEnd = depth * TREE_INDENT + 30 + r.label.length * 6.6 + 16
    rowAnchors[r.id] = { leftX: depth * TREE_INDENT + 17, rightX: labelEnd, y }
    rowIdx++
    maxW = Math.max(maxW, labelEnd + 16)
    r.children.forEach(c => walk(c, depth + 1))
  }
  roots.forEach(r => walk(r, 0))

  const width = Math.max(200, maxW + PADX)
  const height = TITLE + PADY + Math.max(rowIdx, 1) * TREE_ROW_H + PADY
  for (const id of Object.keys(rowAnchors)) rowAnchors[id].rightX = Math.min(rowAnchors[id].rightX, width - 10)
  return { roots, width, height, rowAnchors }
}

/**
 * Timeline: events run left→right in declaration order, alternating above and
 * below a horizontal spine; the `date` property prints on the spine.
 */
export function layoutTimelineGraph(events: GraphElement[]): ChartLayout {
  const out = { ...empty(), width: 240, height: 200 } as ChartLayout
  if (events.length === 0) return out

  // generous interior margin so cards never touch the frame edges
  const MARGIN = 28
  const STEP = 190
  const sizes = events.map(e => defSize(e, 150, 64))
  const maxCardH = Math.max(...sizes.map(s => s.height))
  const spineY = TITLE + MARGIN + maxCardH + 46
  const firstX = PADX + MARGIN + Math.max(...sizes.map(s => s.width)) / 2
  const tickX = (i: number) => firstX + i * STEP

  events.forEach((e, i) => {
    const s = sizes[i]
    const top = i % 2 === 0
    const y = top ? spineY - 46 - s.height : spineY + 46
    out.placements[e.id] = { x: tickX(i) - s.width / 2, y, width: s.width, height: s.height }
    out.frame.lines.push({ x1: tickX(i), y1: top ? y + s.height : y, x2: tickX(i), y2: spineY, color: EDGE_COLOR })
    out.frame.lines.push({ x1: tickX(i), y1: spineY - 5, x2: tickX(i), y2: spineY + 5, width: 3, color: EDGE_COLOR })
    const date = e.properties?.['date']
    if (date) out.frame.texts.push({ x: tickX(i), y: top ? spineY + 18 : spineY - 10, text: date, size: 10, anchor: 'middle', bold: true, color: TEXT_COLOR })
  })

  const width = tickX(events.length - 1) + Math.max(...sizes.map(s => s.width)) / 2 + MARGIN + PADX
  const height = spineY + 46 + maxCardH + MARGIN
  out.frame.lines.push({ x1: PADX + MARGIN / 2, y1: spineY, x2: width - PADX - MARGIN / 2, y2: spineY, width: 2.4, color: EDGE_COLOR })

  out.width = width
  out.height = height
  return out
}
