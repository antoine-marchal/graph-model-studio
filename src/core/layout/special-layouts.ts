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

/** One row of a treeGraph file-tree widget. */
export interface TreeRow {
  id: string
  label: string
  type: string
  children: TreeRow[]
}

export interface TreeGraphLayout {
  roots: TreeRow[]
  width: number
  height: number
}

export const TREE_ROW_H = 24
export const TREE_INDENT = 16

/**
 * File-tree (Windows Explorer style) structure for a `treeGraph` container.
 * Builds a forest from parentId nesting of the hosted tree elements and sizes
 * the widget for the fully-expanded tree. Collapse/expand is handled live in
 * the node component, so it does not affect the computed size.
 */
export function layoutTreeGraph(model: GraphModel, containerId: string, hostedIds: Set<string>): TreeGraphLayout {
  const build = (id: string): TreeRow => {
    const el = model.elements[id]
    const kids = (el.children ?? []).filter(c => hostedIds.has(c))
    return { id, label: el.name, type: el.type, children: kids.map(build) }
  }
  // roots = hosted elements sitting directly in the container
  const roots = [...hostedIds]
    .filter(id => model.elements[id]?.parentId === containerId)
    .map(build)

  let rows = 0
  let maxW = 0
  const walk = (r: TreeRow, depth: number) => {
    rows++
    maxW = Math.max(maxW, depth * TREE_INDENT + 30 + r.label.length * 7 + 18)
    r.children.forEach(c => walk(c, depth + 1))
  }
  roots.forEach(r => walk(r, 0))

  const width = Math.max(200, maxW + PADX * 2)
  const height = TITLE + PADY + Math.max(rows, 1) * TREE_ROW_H + PADY
  return { roots, width, height }
}

/**
 * Timeline: events run left→right in declaration order, alternating above and
 * below a horizontal spine; the `date` property prints on the spine.
 */
export function layoutTimelineGraph(events: GraphElement[]): ChartLayout {
  const out = { ...empty(), width: 240, height: 200 } as ChartLayout
  if (events.length === 0) return out

  const STEP = 180
  const sizes = events.map(e => defSize(e, 150, 64))
  const maxCardH = Math.max(...sizes.map(s => s.height))
  const spineY = TITLE + PADY + maxCardH + 46
  const tickX = (i: number) => PADX + 60 + i * STEP

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

  const width = tickX(events.length - 1) + 60 + PADX
  const height = spineY + 46 + maxCardH + PADY
  out.frame.lines.push({ x1: PADX, y1: spineY, x2: width - PADX, y2: spineY, width: 2.4, color: EDGE_COLOR })

  out.width = width
  out.height = height
  return out
}
