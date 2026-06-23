import type { Node, Edge } from '@xyflow/react'
import type { GraphModel, GraphView, Position } from '@/core/model'
import { notationRegistry } from '@/core/notation'
import { runLayout, type LayoutNodeInput, type LayoutEdgeInput, type LayoutEngine } from '@/core/layout'
import type { GraphNodeData } from './nodes/GraphNode'

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

interface NestedLayout {
  positions: Record<string, Position> // relative-to-parent for children, absolute for top-level
  sizes: Record<string, { width: number; height: number }> // for containers
}

/** Recursive layout that auto-sizes containers around their children. */
export function computeNestedLayout(
  model: GraphModel,
  view: GraphView,
  settings: LayoutSettings = { engine: 'layered' },
): NestedLayout {
  const engine = settings.engine
  const visible = getVisibleElementIds(model, view)
  const childrenOf = new Map<string, string[]>()
  const ROOT = '__root__'
  childrenOf.set(ROOT, [])
  for (const el of Object.values(model.elements)) {
    if (!visible.has(el.id)) continue
    const key = el.parentId && visible.has(el.parentId) ? el.parentId : ROOT
    if (!childrenOf.has(key)) childrenOf.set(key, [])
    childrenOf.get(key)!.push(el.id)
  }

  const positions: Record<string, Position> = {}
  const sizes: Record<string, { width: number; height: number }> = {}
  const stored = view.layoutPositions ?? {}

  function layoutLevel(parentKey: string): { width: number; height: number } {
    const kids = childrenOf.get(parentKey) ?? []
    if (kids.length === 0) return { width: 0, height: 0 }

    const viewSizes = view.nodeSizes ?? {}
    // resolve child sizes (recurse into nested containers first)
    for (const kid of kids) {
      if (isVisibleContainer(model, kid, visible)) {
        sizes[kid] = layoutLevel(kid)
      } else {
        const manual = viewSizes[kid]
        const s = nodeSizeFor(model.elements[kid].type)
        sizes[kid] = manual ?? { width: s.width, height: s.height }
      }
    }

    const isRoot = parentKey === ROOT
    const offX = isRoot ? 40 : CONTAINER_PAD
    const offY = isRoot ? 40 : CONTAINER_TITLE_H + CONTAINER_PAD

    const kidSet = new Set(kids)
    const lnodes: LayoutNodeInput[] = kids.map(id => ({ id, width: sizes[id].width, height: sizes[id].height }))
    const ledges: LayoutEdgeInput[] = []
    for (const rel of Object.values(model.relations)) {
      if (kidSet.has(rel.sourceId) && kidSet.has(rel.targetId)) ledges.push({ source: rel.sourceId, target: rel.targetId })
    }
    const laid = runLayout(engine, lnodes, ledges, {
      direction: view.layoutDirection,
      layerGap: view.layoutDirection === 'lr' || view.layoutDirection === 'rl' ? 100 : 70,
      nodeGap: 44,
      origin: { x: offX, y: offY },
    })

    for (const kid of kids) {
      const useStored = !settings.ignoreStored && stored[kid]
      positions[kid] = useStored ? stored[kid] : (laid[kid] ?? { x: offX, y: offY })
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
  return { positions, sizes }
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
  const { positions, sizes } = computeNestedLayout(model, view, settings)

  // depth for z-index (deeper renders on top so leaves sit above their containers)
  const depthOf = new Map<string, number>()
  function depth(id: string): number {
    if (depthOf.has(id)) return depthOf.get(id)!
    const p = model.elements[id]?.parentId
    const d = p && visible.has(p) ? depth(p) + 1 : 0
    depthOf.set(id, d)
    return d
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

  const nodes: GraphNode[] = ordered.map(id => {
    const el = model.elements[id]
    const def = notationRegistry.getElementDef(el.type) ?? GENERIC_DEF
    const container = isVisibleContainer(model, id, visible)
    // containers auto-size around children; leaves honour a per-view manual size override
    const size = container && sizes[id]?.width
      ? sizes[id]
      : (view.nodeSizes ?? {})[id] ?? { width: def.defaultWidth, height: def.defaultHeight }
    const useParent = !!(el.parentId && visible.has(el.parentId))
    const d = depth(id)
    return {
      id,
      type: 'graphNode',
      position: positions[id] ?? { x: 40, y: 40 },
      width: size.width,
      height: size.height,
      style: { width: size.width, height: size.height },
      zIndex: d,
      data: {
        label: el.name,
        elementType: el.type,
        notation: el.notation,
        description: el.description,
        technology: el.technology,
        tags: el.tags,
        shape: def.shape,
        fill: def.fill,
        stroke: def.stroke,
        text: def.text,
        accent: def.accent,
        icon: def.icon,
        iconSrc: def.iconSrc,
        width: size.width,
        height: size.height,
        isContainer: container,
      },
      ...(useParent ? { parentId: el.parentId } : {}),
    }
  })

  // nearest visible ancestor-or-self (undefined if the whole chain is hidden)
  function liftToVisible(id: string): string | undefined {
    let cur: string | undefined = id
    while (cur && !visible.has(cur)) cur = model.elements[cur]?.parentId
    return cur && visible.has(cur) ? cur : undefined
  }

  const edges: GraphEdge[] = []
  const directKeys = new Set<string>()
  // inherited (lifted) relations between visible ancestors, grouped per ordered pair
  const inherited = new Map<string, { source: string; target: string; labels: string[] }>()

  for (const rel of Object.values(model.relations)) {
    if (!isRelationIncluded(view, rel.sourceId, rel.targetId)) continue
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
      edges.push({
        id: rel.id,
        source: rel.sourceId,
        target: rel.targetId,
        type: 'floating',
        sourceHandle: rel.sourceHandle,
        targetHandle: rel.targetHandle,
        data: { label: rel.label },
        markerStart: markerStart || undefined,
        markerEnd: markerEnd || undefined,
        style: {
          stroke: 'var(--edge)',
          strokeWidth: 1.6,
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
    const key = `${ls}->${lt}`
    const g = inherited.get(key) ?? { source: ls, target: lt, labels: [] }
    if (rel.label) g.labels.push(rel.label)
    inherited.set(key, g)
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
