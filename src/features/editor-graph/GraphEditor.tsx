import { useCallback, useMemo, useEffect, useState, useRef } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  type Connection,
  type NodeChange,
  type EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
  BackgroundVariant,
  ConnectionMode,
  Panel,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useModelStore } from '@/store'
import {
  modelToFlow,
  computeAutoLayout,
  type GraphNode,
  type GraphEdge,
} from './model-to-flow'
import { GraphNodeComponent } from './nodes/GraphNode'
import { GanttAxisNode } from './nodes/GanttAxisNode'
import { SeqPointNode, TreeAnchorNode } from './nodes/DecorNode'
import { FloatingEdge } from './edges/FloatingEdge'
import { EdgeMarkers } from './edges/EdgeMarkers'
import { Button } from '@/ui/components/Button'
import { nanoid } from './nanoid'
import { notationRegistry } from '@/core/notation'
import {
  alignNodes, computeGanttChart, formatGanttStart, GANTT_MILESTONE_SIZE, GANTT_PX_PER_DAY,
  runLayoutSubset, LAYOUT_ENGINES, type LayoutEngine,
} from '@/core/layout'
import { NodeContextMenu, type ContextMenuState } from './NodeContextMenu'
import { saveBinaryFile, filtersForExt } from '@/services/file-save'
import { createElementId } from '@/core/model'
import type { GraphCaptureWorkspace } from './png-export'
import {
  absoluteNodePosition,
  constrainDragPosition,
  droppedPosition,
  positionsCenteredAt,
  relationEndpoints,
  type DragAxis,
} from './graph-interactions'
import {
  copyElementFormat,
  copyRelationFormat,
  elementFormatFor,
  relationFormatFor,
} from './style-clipboard'
import { quadrantValuesFromPosition } from './quadrant-position'

const nodeTypes = { graphNode: GraphNodeComponent, ganttAxis: GanttAxisNode, seqPoint: SeqPointNode, treeAnchor: TreeAnchorNode }

// chart-container children reorder along one axis on drag (horizontal charts by
// x, gantt rows by y) rather than moving freely on the canvas
const CHART_CHILD_AXIS: Record<string, 'x' | 'y' | undefined> = {
  participant: 'x', seqActor: 'x', commit: 'x', mergeCommit: 'x', timelineEvent: 'x',
  ganttTask: 'y', ganttMilestone: 'y', ganttSection: 'y',
}
const edgeTypes = { floating: FloatingEdge }

/** Decode a "data:image/png;base64,…" URL into raw bytes. */
function descendantIds(model: ReturnType<typeof useModelStore.getState>['model'], id: string): Set<string> {
  const out = new Set<string>()
  const stack = [...(model.elements[id]?.children ?? [])]
  while (stack.length) {
    const c = stack.pop()!
    if (out.has(c)) continue
    out.add(c)
    stack.push(...(model.elements[c]?.children ?? []))
  }
  return out
}

function ganttHostId(model: ReturnType<typeof useModelStore.getState>['model'], id: string): string | undefined {
  let current: string | undefined = model.elements[id]?.type === 'ganttGraph' ? id : model.elements[id]?.parentId
  while (current) {
    if (model.elements[current]?.type === 'ganttGraph') return current
    current = model.elements[current]?.parentId
  }
  return undefined
}

function ganttChartFor(model: ReturnType<typeof useModelStore.getState>['model'], hostId: string) {
  const hosted = new Set(Object.values(model.elements)
    .filter(element => element.id !== hostId && ganttHostId(model, element.id) === hostId)
    .map(element => element.id))
  const properties = model.elements[hostId]?.properties
  return computeGanttChart(model, hosted, {
    unitPrefix: properties?.prefix ?? 'D',
    firstUnit: Number(properties?.firstUnit),
    firstDate: properties?.firstDate,
  })
}

function GraphEditorInner() {
  const model = useModelStore(s => s.model)
  const activeViewId = useModelStore(s => s.activeViewId)
  const theme = useModelStore(s => s.theme)
  const selectedElementIds = useModelStore(s => s.selectedElementIds)
  const selectedRelationId = useModelStore(s => s.selectedRelationId)
  const selectElements = useModelStore(s => s.selectElements)
  const selectRelation = useModelStore(s => s.selectRelation)
  const requestHighlight = useModelStore(s => s.requestHighlight)
  const requestFocusProperties = useModelStore(s => s.requestFocusProperties)
  const dispatch = useModelStore(s => s.dispatch)
  const setViewPositions = useModelStore(s => s.setViewPositions)
  const setEditingElement = useModelStore(s => s.setEditingElement)
  const duplicateElements = useModelStore(s => s.duplicateElements)
  const pushRecentType = useModelStore(s => s.pushRecentType)
  const layoutEngine = useModelStore(s => s.layoutEngine)
  const setLayoutEngine = useModelStore(s => s.setLayoutEngine)
  const snapToGrid = useModelStore(s => s.snapToGrid)
  const toggleSnapToGrid = useModelStore(s => s.toggleSnapToGrid)
  const showMinimap = useModelStore(s => s.showMinimap)
  const toggleMinimap = useModelStore(s => s.toggleMinimap)
  const edgeRouting = useModelStore(s => s.edgeRouting)
  const toggleEdgeRouting = useModelStore(s => s.toggleEdgeRouting)
  const addElementsToView = useModelStore(s => s.addElementsToView)
  const reorderSiblings = useModelStore(s => s.reorderSiblings)

  const { screenToFlowPosition, fitView, getNodes, getEdges, getNodesBounds } = useReactFlow()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const clipboard = useRef<string[]>([])
  const mouseScreenPosition = useRef<{ x: number; y: number } | null>(null)
  const shiftPressed = useRef(false)
  const dragGesture = useRef<{
    primaryId: string
    starts: Map<string, { x: number; y: number }>
  } | null>(null)
  const rectangularSelectionInProgress = useRef(false)

  const activeView = activeViewId ? model.views[activeViewId] : Object.values(model.views)[0]
  const viewId = activeView?.id ?? 'default'

  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [menu, setMenu] = useState<ContextMenuState | null>(null)

  useEffect(() => {
    const workspace = wrapperRef.current as GraphCaptureWorkspace | null
    if (!workspace) return
    workspace.__gmsGetContentBounds = () => getNodesBounds(getNodes().filter(node => !node.hidden))
    return () => { delete workspace.__gmsGetContentBounds }
  }, [getNodes, getNodesBounds])

  const flow = useMemo(
    () => (activeView ? modelToFlow(model, activeView, { engine: layoutEngine }) : { nodes: [], edges: [] }),
    [model, activeView, layoutEngine],
  )
  // rebuild graph when the model/view changes (carry over current selection)
  useEffect(() => {
    const selEl = new Set(useModelStore.getState().selectedElementIds)
    const selRel = useModelStore.getState().selectedRelationId
    setNodes(flow.nodes.map(n => (selEl.has(n.id) ? { ...n, selected: true } : n)))
    setEdges(flow.edges.map(e => (e.id === selRel ? { ...e, selected: true } : e)))
  }, [flow])
  // A view switch replaces the canvas contents. Wait for React Flow to measure
  // the new nodes, then frame that view just like the toolbar's Fit action.
  useEffect(() => {
    if (!activeViewId) return
    const timer = window.setTimeout(() => fitView({ duration: 0, padding: 0.2 }), 50)
    return () => window.clearTimeout(timer)
  }, [activeViewId, fitView])
  // mirror store selection (e.g. explorer clicks) into React Flow so Delete works there too
  useEffect(() => {
    const selEl = new Set(selectedElementIds)
    setNodes(nds => nds.map(n => (!!n.selected === selEl.has(n.id) ? n : { ...n, selected: selEl.has(n.id) })))
    setEdges(eds => eds.map(e => (!!e.selected === (e.id === selectedRelationId) ? e : { ...e, selected: e.id === selectedRelationId })))
  }, [selectedElementIds, selectedRelationId])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const gesture = dragGesture.current
    let effectiveChanges = changes
    if (gesture && shiftPressed.current) {
      const primary = changes.find(change => change.type === 'position' && change.id === gesture.primaryId)
      const primaryStart = gesture.starts.get(gesture.primaryId)
      if (primary?.type === 'position' && primary.position && primaryStart) {
        const axis: DragAxis = Math.abs(primary.position.x - primaryStart.x) >= Math.abs(primary.position.y - primaryStart.y)
          ? 'horizontal'
          : 'vertical'
        effectiveChanges = changes.map(change => {
          if (change.type !== 'position' || !change.position) return change
          const start = gesture.starts.get(change.id)
          return start ? { ...change, position: constrainDragPosition(start, change.position, axis) } : change
        })
      }
    }
    setNodes(nds => applyNodeChanges(effectiveChanges, nds) as GraphNode[])
  }, [])
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges(eds => applyEdgeChanges(changes, eds) as GraphEdge[])
  }, [])

  const onConnect = useCallback((c: Connection) => {
    // a connection from a treeNode's dot carries the anchor id — map back to the
    // real treeNode so the relation is stored against it
    // Embedded Sankey nodes share their chart's React Flow node. Their handle
    // carries the real model element id so relations still target the children.
    const endpoints = relationEndpoints(c)
    if (!endpoints) return
    const id = `rel_${endpoints.sourceId}_${endpoints.targetId}_${nanoid(4)}`
    // A connection point is only an interaction affordance. New relations stay
    // floating so routing may choose the best side as nodes move; users can pin
    // anchors explicitly from the relation properties afterwards.
    const elements = useModelStore.getState().model.elements
    const snakeRelation = elements[endpoints.sourceId]?.notation === 'snake' && elements[endpoints.targetId]?.notation === 'snake'
    dispatch({
      type: 'ADD_RELATION',
      payload: {
        id,
        ...endpoints,
        notation: snakeRelation ? 'snake' : 'generic',
        type: snakeRelation ? 'snakeFlow' : 'rel',
      },
    })
  }, [dispatch])

  // ── selection → highlight code (no focus) ──
  const commitSelection = useCallback(
    ({ nodes: selNodes, edges: selEdges }: { nodes: { id: string }[]; edges: { id: string }[] }) => {
      if (selEdges.length === 1 && selNodes.length === 0) {
        selectRelation(selEdges[selEdges.length - 1].id)
        requestHighlight('relation', selEdges[0].id)
      } else if (selNodes.length > 0) {
        const ids = selNodes.map(n => n.id)
        selectElements(ids)
        if (ids.length === 1) requestHighlight('element', ids[0])
      } else {
        selectElements([])
      }
    },
    [selectElements, selectRelation, requestHighlight],
  )

  const onSelectionChange = useCallback(
    (selection: { nodes: { id: string }[]; edges: { id: string }[] }) => {
      // React Flow updates the marquee selection on every crossed node. Keep
      // those visual updates inside its local canvas state and synchronize the
      // global store only once on pointer-up; otherwise Explorer, Inspector and
      // embedded charts all rerender repeatedly during a single gesture.
      if (rectangularSelectionInProgress.current) return
      commitSelection(selection)
    },
    [commitSelection],
  )

  const onSelectionStart = useCallback(() => {
    rectangularSelectionInProgress.current = true
  }, [])

  const onSelectionEnd = useCallback(() => {
    rectangularSelectionInProgress.current = false
    requestAnimationFrame(() => {
      commitSelection({
        nodes: getNodes().filter(candidate => candidate.selected),
        edges: getEdges().filter(candidate => candidate.selected),
      })
    })
  }, [commitSelection, getEdges, getNodes])

  // double-click a node → inline rename on the canvas
  const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: { id: string }) => {
    selectElements([node.id])
    setEditingElement(node.id)
  }, [selectElements, setEditingElement])
  const onEdgeDoubleClick = useCallback((_: React.MouseEvent, edge: { id: string }) => {
    selectRelation(edge.id)
    requestHighlight('relation', edge.id, { focus: true })
    requestFocusProperties()
  }, [selectRelation, requestHighlight, requestFocusProperties])

  const onNodesDelete = useCallback((deleted: { id: string }[]) => {
    dispatch({ type: 'DELETE_ELEMENTS', payload: { ids: deleted.map(node => node.id) } })
  }, [dispatch])
  const onEdgesDelete = useCallback((deleted: { id: string }[]) => {
    dispatch({ type: 'DELETE_RELATIONS', payload: { ids: deleted.map(edge => edge.id) } })
  }, [dispatch])

  // ── drag commit + drop-to-reparent + drag-to-sort ──
  const onNodeDragStart = useCallback(
    (event: React.MouseEvent, node: GraphNode, dragged: GraphNode[]) => {
      shiftPressed.current = event.shiftKey
      const moving = dragged.some(candidate => candidate.id === node.id) ? dragged : [node, ...dragged]
      dragGesture.current = {
        primaryId: node.id,
        starts: new Map(moving.map(candidate => [candidate.id, { ...candidate.position }])),
      }
    },
    [],
  )

  const onNodeDragStop = useCallback(
    (event: React.MouseEvent, node: GraphNode, dragged: GraphNode[]) => {
      const gesture = dragGesture.current
      dragGesture.current = null
      if (gesture && shiftPressed.current) {
        const primaryStart = gesture.starts.get(gesture.primaryId)
        const primary = dragged.find(candidate => candidate.id === gesture.primaryId) ?? node
        if (primaryStart) {
          const axis: DragAxis = Math.abs(primary.position.x - primaryStart.x) >= Math.abs(primary.position.y - primaryStart.y)
            ? 'horizontal'
            : 'vertical'
          dragged = dragged.map(candidate => {
            const start = gesture.starts.get(candidate.id)
            return start ? { ...candidate, position: constrainDragPosition(start, candidate.position, axis) } : candidate
          })
          node = dragged.find(candidate => candidate.id === node.id)
            ?? { ...node, position: constrainDragPosition(primaryStart, node.position, axis) }
        }
      }
      if (dragged.length === 1) {
        const el = model.elements[node.id]
        const currentGanttHost = el && (el.type === 'ganttTask' || el.type === 'ganttMilestone')
          ? ganttHostId(model, el.id)
          : undefined
        if (el && currentGanttHost) {
          const chart = ganttChartFor(model, currentGanttHost)
          if (chart) {
            const timelineX = node.position.x - 16 + (el.type === 'ganttMilestone' ? GANTT_MILESTONE_SIZE / 2 : 0)
            const hostNode = nodes.find(candidate => candidate.id === currentGanttHost)
            const scale = hostNode?.data.ganttGraph?.pixelsPerUnit ?? GANTT_PX_PER_DAY
            const offset = Math.max(0, Math.round(timelineX / scale))
            dispatch({
              type: 'UPDATE_ELEMENT',
              payload: { id: el.id, properties: { ...el.properties, start: formatGanttStart(chart, offset) } },
            })
          }
          const siblings = Object.values(model.elements).filter(candidate => candidate.parentId === el.parentId && CHART_CHILD_AXIS[candidate.type])
          const live = new Map(nodes.map(candidate => [candidate.id, candidate.position]))
          const ordered = siblings.map(candidate => candidate.id)
            .sort((a, b) => (a === node.id ? node.position.y : live.get(a)?.y ?? 0) - (b === node.id ? node.position.y : live.get(b)?.y ?? 0))
          if (el.parentId && ordered.length > 1) reorderSiblings(el.parentId, ordered)
          return
        }
        // gridItem dropped into the matrix → snap to the cell under it (row/col)
        if (el?.type === 'gridItem') {
          const parent = nodes.find(n => n.id === node.parentId)
          const gf = (parent?.data as { grid?: { cols: number; rows: number; cellW: number; cellH: number; originX: number; originY: number } })?.grid
          if (gf) {
            const cx = node.position.x + (node.width ?? 0) / 2
            const cy = node.position.y + (node.height ?? 0) / 2
            const col = Math.min(gf.cols, Math.max(1, Math.floor((cx - gf.originX) / gf.cellW) + 1))
            const row = Math.min(gf.rows, Math.max(1, Math.floor((cy - gf.originY) / gf.cellH) + 1))
            const props = { ...el.properties, row: String(row), col: String(col) }
            dispatch({ type: 'UPDATE_ELEMENT', payload: { id: node.id, properties: props } })
            return
          }
        }
        // Quadrant items are positioned by normalized x/y properties rather
        // than stored layout coordinates. Convert the visual drop back into
        // that coordinate system so the model and DSL follow the drag.
        if (el?.type === 'quadrantItem' && el.parentId && model.elements[el.parentId]?.type === 'quadrantChart') {
          const parent = nodes.find(candidate => candidate.id === el.parentId)
          if (parent) {
            const values = quadrantValuesFromPosition(
              node.position,
              {
                width: parent.measured?.width ?? parent.width ?? 480,
                height: parent.measured?.height ?? parent.height ?? 380,
              },
              {
                width: node.measured?.width ?? node.width ?? 16,
                height: node.measured?.height ?? node.height ?? 16,
              },
            )
            dispatch({
              type: 'UPDATE_ELEMENT',
              payload: { id: node.id, properties: { ...el.properties, x: String(values.x), y: String(values.y) } },
            })
            return
          }
        }
        // chart children (gantt/seq/git/timeline rows) reorder among their model
        // siblings by drop position instead of moving freely
        const axis = el ? CHART_CHILD_AXIS[el.type] : undefined
        if (axis && el?.parentId) {
          const sibs = Object.values(model.elements).filter(e => e.parentId === el.parentId && CHART_CHILD_AXIS[e.type])
          const live = new Map(nodes.map(n => [n.id, n.position]))
          const coord = (id: string) => (id === node.id ? node.position : live.get(id))?.[axis] ?? 0
          const ordered = sibs.map(e => e.id).sort((a, b) => coord(a) - coord(b))
          reorderSiblings(el.parentId, ordered)
          return
        }
        const desc = descendantIds(model, node.id)
        const draggedById = new Map(dragged.map(candidate => [candidate.id, candidate]))
        const liveNodes = nodes.map(candidate => draggedById.get(candidate.id) ?? candidate)
        const drop = screenToFlowPosition({ x: event.clientX, y: event.clientY })
        // The pointer, rather than an arbitrary amount of node overlap, decides
        // the destination. Any model node may receive a child and thereby become
        // a container; nested targets still prefer the smallest node.
        const candidates = liveNodes.filter(candidate => {
          if (candidate.id === node.id || desc.has(candidate.id) || !model.elements[candidate.id]) return false
          if ((el?.type === 'ganttTask' || el?.type === 'ganttMilestone')
            && !['ganttGraph', 'ganttSection'].includes(model.elements[candidate.id].type)) return false
          const origin = absoluteNodePosition(candidate, liveNodes)
          const width = candidate.measured?.width ?? candidate.width ?? 0
          const height = candidate.measured?.height ?? candidate.height ?? 0
          return drop.x >= origin.x && drop.x <= origin.x + width && drop.y >= origin.y && drop.y <= origin.y + height
        })
        let target: GraphNode | undefined
        for (const n of candidates) {
          const a = (n.width ?? 1) * (n.height ?? 1)
          const ta = target ? (target.width ?? 1) * (target.height ?? 1) : Infinity
          if (a < ta) target = n
        }
        const newParent = target?.id
        if (newParent !== el?.parentId) {
          const position = droppedPosition(node, target, liveNodes)
          dispatch({ type: 'REPARENT_ELEMENT', payload: { viewId, id: node.id, parentId: newParent, position } })
          const newGanttHost = target && (model.elements[target.id]?.type === 'ganttGraph' ? target.id : ganttHostId(model, target.id))
          if (el && newGanttHost && (el.type === 'ganttTask' || el.type === 'ganttMilestone')) {
            const chart = ganttChartFor(model, newGanttHost)
            const hostNode = liveNodes.find(candidate => candidate.id === newGanttHost)
            const hostOrigin = hostNode ? absoluteNodePosition(hostNode, liveNodes) : { x: 0, y: 0 }
            const scale = hostNode?.data.ganttGraph?.pixelsPerUnit ?? GANTT_PX_PER_DAY
            const offset = Math.max(0, Math.round((drop.x - hostOrigin.x - 16) / scale))
            dispatch({
              type: 'UPDATE_ELEMENT',
              payload: {
                id: el.id,
                properties: { ...el.properties, start: formatGanttStart(chart ?? { baseUnit: 1 }, offset) },
              },
            })
          }
          return
        }
      }
      const positions: Record<string, { x: number; y: number }> = {}
      for (const n of dragged) positions[n.id] = n.position
      if (Object.keys(positions).length) dispatch({ type: 'APPLY_LAYOUT', payload: { viewId, positions } })
    },
    [dispatch, viewId, model, nodes, reorderSiblings, screenToFlowPosition],
  )

  useEffect(() => {
    const updateShift = (event: KeyboardEvent) => { shiftPressed.current = event.shiftKey }
    const clearShift = () => { shiftPressed.current = false }
    window.addEventListener('keydown', updateShift)
    window.addEventListener('keyup', updateShift)
    window.addEventListener('blur', clearShift)
    return () => {
      window.removeEventListener('keydown', updateShift)
      window.removeEventListener('keyup', updateShift)
      window.removeEventListener('blur', clearShift)
    }
  }, [])

  // ── add node ──
  const addNodeAt = useCallback((elementType: string, flowX: number, flowY: number) => {
    const def = notationRegistry.getElementDef(elementType)
    let id = createElementId(elementType)
    while (model.elements[id]) id = createElementId(elementType)
    dispatch({
      type: 'ADD_ELEMENT',
      payload: {
        id,
        name: def?.label ?? 'New Element',
        type: elementType,
        notation: def?.notation ?? 'generic',
        position: { x: flowX - (def?.defaultWidth ?? 150) / 2, y: flowY - (def?.defaultHeight ?? 70) / 2 },
      },
    })
    pushRecentType(elementType)
    setTimeout(() => { selectElements([id]); setEditingElement(id) }, 0)
  }, [dispatch, model.elements, selectElements, setEditingElement, pushRecentType])

  // ── context menu ──
  const onPaneContextMenu = useCallback((e: React.MouseEvent | MouseEvent) => {
    e.preventDefault()
    const me = e as React.MouseEvent
    const fp = screenToFlowPosition({ x: me.clientX, y: me.clientY })
    setMenu({ x: me.clientX, y: me.clientY, flowX: fp.x, flowY: fp.y })
  }, [screenToFlowPosition])
  const openAddMenuFromButton = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect()
    const cx = (rect?.left ?? 0) + 70
    const cy = (rect?.top ?? 0) + 56
    const fp = screenToFlowPosition({ x: cx + 140, y: cy + 140 })
    setMenu({ x: cx, y: cy, flowX: fp.x, flowY: fp.y })
  }, [screenToFlowPosition])

  // ── auto layout ──
  // "All" deliberately starts fresh; "Selected" preserves the surrounding layout.
  const runAutoLayout = useCallback((scope: 'all' | 'selected') => {
    if (!activeView) return
    if (scope === 'all') {
      setViewPositions(viewId, computeAutoLayout(model, activeView, { engine: layoutEngine, ignoreStored: true }), false)
    } else {
      // Positions are parent-relative, so layout each selected sibling group in
      // its own coordinate space. This preserves nested containers and charts.
      const graphNodes = nodes.filter(node => model.elements[node.id])
      const selected = graphNodes.filter(node => node.selected)
      if (selected.length === 0) return
      const parentOf = new Map(nodes.map(node => [node.id, node.parentId]))
      const groups = new Map<string, typeof selected>()
      for (const node of selected) {
        const key = node.parentId ?? '__root__'
        groups.set(key, [...(groups.get(key) ?? []), node])
      }

      const positions: Record<string, { x: number; y: number }> = {}
      for (const group of groups.values()) {
        const groupIds = new Set(group.map(node => node.id))
        const liftToGroup = (endpoint: string): string | undefined => {
          let current: string | undefined = endpoint
          const visited = new Set<string>()
          while (current && !visited.has(current)) {
            if (groupIds.has(current)) return current
            visited.add(current)
            current = parentOf.get(current)
          }
          return undefined
        }
        const layoutEdges = edges.flatMap(edge => {
          const source = liftToGroup(edge.source)
          const target = liftToGroup(edge.target)
          return source && target && source !== target ? [{ source, target }] : []
        })
        const layoutNodes = group.map(node => ({
          id: node.id,
          width: node.measured?.width ?? node.width ?? 150,
          height: node.measured?.height ?? node.height ?? 70,
        }))
        const current = Object.fromEntries(group.map(node => [node.id, node.position]))
        Object.assign(positions, runLayoutSubset(layoutEngine, layoutNodes, layoutEdges, current, groupIds, {
          direction: activeView.layoutDirection,
          layerGap: activeView.layoutDirection === 'lr' || activeView.layoutDirection === 'rl' ? 100 : 70,
          nodeGap: 44,
        }))
      }
      if (Object.keys(positions).length === 0) return
      setViewPositions(viewId, positions, true)
    }
    setTimeout(() => fitView({ duration: 300, padding: 0.2 }), 50)
  }, [activeView, model, nodes, edges, viewId, setViewPositions, fitView, layoutEngine])

  const alignSelection = useCallback((alignment: 'vertical' | 'horizontal') => {
    const selected = nodes.filter(node => node.selected && model.elements[node.id])
    const groups = new Map<string, typeof selected>()
    for (const node of selected) {
      const key = node.parentId ?? '__root__'
      groups.set(key, [...(groups.get(key) ?? []), node])
    }

    const positions: Record<string, { x: number; y: number }> = {}
    for (const group of groups.values()) {
      const layoutNodes = group.map(node => ({
        id: node.id,
        width: node.measured?.width ?? node.width ?? 150,
        height: node.measured?.height ?? node.height ?? 70,
      }))
      const current = Object.fromEntries(group.map(node => [node.id, node.position]))
      Object.assign(positions, alignNodes(layoutNodes, current, alignment))
    }
    if (Object.keys(positions).length) setViewPositions(viewId, positions, true)
  }, [model.elements, nodes, setViewPositions, viewId])

  const canAlignSelection = (() => {
    const parentCounts = new Map<string, number>()
    for (const node of nodes) {
      if (!node.selected || !model.elements[node.id]) continue
      const key = node.parentId ?? '__root__'
      const count = (parentCounts.get(key) ?? 0) + 1
      if (count >= 2) return true
      parentCounts.set(key, count)
    }
    return false
  })()

  // ── duplicate / copy / paste ──
  const duplicateSelection = useCallback(() => {
    const ids = nodes.filter(n => n.selected).map(n => n.id)
    if (!ids.length) return
    const created = duplicateElements(ids)
    setTimeout(() => selectElements(created), 0)
  }, [nodes, duplicateElements, selectElements])

  // ── export PNG: transparent background, auto-cropped to content, with arrows ──
  const exportPng = useCallback(async () => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const base = model.metadata.title.replace(/\s+/g, '-').toLowerCase() || 'diagram'
    const { captureGraphPng } = await import('./png-export')
    const bytes = await captureGraphPng(wrapper)
    await saveBinaryFile(bytes, { defaultName: `${base}.png`, filters: filtersForExt('png') })
  }, [model])

  // keyboard: duplicate / rename / copy / paste (when canvas has focus, not editing text)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase()
      const typing = tag === 'input' || tag === 'textarea' || document.activeElement?.classList.contains('inputarea')
      if (typing) return
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && e.shiftKey && key === 'c') {
        e.preventDefault()
        const state = useModelStore.getState()
        if (state.selectedRelationId) copyRelationFormat(state.model, state.selectedRelationId)
        else if (state.activeViewId && state.selectedElementId) copyElementFormat(state.model, state.activeViewId, state.selectedElementId)
      } else if (mod && e.shiftKey && key === 'v') {
        e.preventDefault()
        const state = useModelStore.getState()
        if (state.selectedRelationId) {
          const format = relationFormatFor(state.model, state.selectedRelationId)
          if (format) dispatch({ type: 'APPLY_RELATION_FORMAT', payload: { id: state.selectedRelationId, ...format } })
        } else if (state.activeViewId && state.selectedElementId) {
          const format = elementFormatFor(state.model, state.selectedElementId)
          if (format) dispatch({ type: 'APPLY_ELEMENT_FORMAT', payload: { viewId: state.activeViewId, id: state.selectedElementId, ...format } })
        }
      } else if (mod && key === 'd') {
        e.preventDefault(); duplicateSelection()
      } else if (mod && key === 'c') {
        e.preventDefault()
        clipboard.current = [...useModelStore.getState().selectedElementIds]
      } else if (mod && key === 'v') {
        e.preventDefault()
        if (clipboard.current.length) {
          const state = useModelStore.getState()
          const copied = clipboard.current.filter(id => !!state.model.elements[id])
          const copiedSet = new Set(copied)
          const roots = copied.filter(id => {
            let parent = state.model.elements[id]?.parentId
            while (parent) {
              if (copiedSet.has(parent)) return false
              parent = state.model.elements[parent]?.parentId
            }
            return true
          })
          const targetId = state.selectedElementIds.length === 1 && state.model.elements[state.selectedElementIds[0]]
            ? state.selectedElementIds[0]
            : null
          const created = duplicateElements(copied, { parentId: targetId })
          const point = mouseScreenPosition.current
            ? screenToFlowPosition(mouseScreenPosition.current)
            : (() => {
            const rect = wrapperRef.current?.getBoundingClientRect()
            return screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 0) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 0) / 2 })
          })()
          const liveNodes = getNodes()
          const sourceGeometry = roots.flatMap((sourceId, index) => {
            const source = liveNodes.find(node => node.id === sourceId)
            const createdId = created[index]
            if (!source || !createdId) return []
            return [{
              id: createdId,
              position: absoluteNodePosition(source, liveNodes),
              size: {
                width: source.measured?.width ?? source.width ?? 150,
                height: source.measured?.height ?? source.height ?? 70,
              },
            }]
          })
          const targetNode = targetId ? liveNodes.find(node => node.id === targetId) : undefined
          const targetOrigin = targetNode ? absoluteNodePosition(targetNode, liveNodes) : undefined
          const localPoint = targetOrigin ? { x: point.x - targetOrigin.x, y: point.y - targetOrigin.y } : point
          const positions = positionsCenteredAt(localPoint, sourceGeometry)
          if (state.activeViewId && Object.keys(positions).length) setViewPositions(state.activeViewId, positions, true)
          setTimeout(() => selectElements(created), 0)
        }
      } else if (e.key === 'F2') {
        const sel = nodes.filter(n => n.selected).map(n => n.id)
        if (sel.length === 1) setEditingElement(sel[0])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nodes, dispatch, duplicateSelection, duplicateElements, getNodes, screenToFlowPosition, selectElements, setEditingElement, setViewPositions])

  const toggleBtn = (active: boolean) =>
    active ? 'bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]' : ''

  // ── drag elements from the Explorer onto the canvas to include them in the view ──
  const ELEMENT_MIME = 'application/gms-element-ids'
  const onCanvasDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(ELEMENT_MIME)) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])
  const onCanvasDrop = useCallback((e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(ELEMENT_MIME)
    if (!raw || !activeView) return
    e.preventDefault()
    // "all" views already contain everything — dropping there would silently
    // turn the view custom and hide the rest, so ignore it
    if (activeView.includeAll) return
    try {
      const ids = JSON.parse(raw) as string[]
      addElementsToView(activeView.id, ids)
      const p = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      const positions: Record<string, { x: number; y: number }> = {}
      ids.forEach((id, i) => { positions[id] = { x: p.x + i * 28, y: p.y + i * 28 } })
      setViewPositions(activeView.id, positions, true)
    } catch { /* ignore malformed payload */ }
  }, [activeView, addElementsToView, screenToFlowPosition, setViewPositions])

  return (
    <div
      ref={wrapperRef}
      className="gms-graph-workspace h-full w-full"
      onPointerMove={event => { mouseScreenPosition.current = { x: event.clientX, y: event.clientY } }}
      onDragOver={onCanvasDragOver}
      onDrop={onCanvasDrop}
    >
      <EdgeMarkers />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onSelectionStart={onSelectionStart}
        onSelectionEnd={onSelectionEnd}
        onNodeDoubleClick={onNodeDoubleClick}
        onEdgeDoubleClick={onEdgeDoubleClick}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onPaneContextMenu={onPaneContextMenu}
        onPaneClick={() => { selectElements([]); selectRelation(null); setMenu(null); setEditingElement(null) }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        multiSelectionKeyCode={['Meta', 'Control']}
        selectionKeyCode={['Meta', 'Control']}
        deleteKeyCode={['Delete', 'Backspace']}
        // don't let the canvas swallow Space (pan) or grab focused-node keys —
        // in the Tauri webview this otherwise blocks typing a space
        panActivationKeyCode={null}
        disableKeyboardA11y
        snapToGrid={snapToGrid}
        snapGrid={[16, 16]}
        elevateNodesOnSelect
        elevateEdgesOnSelect
        fitView
        colorMode={theme}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={snapToGrid ? BackgroundVariant.Lines : BackgroundVariant.Dots}
          gap={snapToGrid ? 16 : 20}
          size={1}
          color={
            theme === 'dark'
              ? (snapToGrid ? '#171f2b' : '#273242')
              : (snapToGrid ? '#e2e6ec' : '#abb1b9')
          }
        />
        <Controls />
        {showMinimap && <MiniMap pannable zoomable nodeColor={n => (n.data as { stroke?: string })?.stroke ?? '#888'} />}

        <Panel position="top-left" className="gms-canvas-toolbar flex flex-nowrap items-center">
          <Button size="sm" variant="outline" onClick={openAddMenuFromButton} title="Add node (or right-click canvas)">＋ <span className="wide-label">Node</span></Button>
          <div className="mx-0.5 h-5 w-px bg-[var(--border)]" />
          <select
            value={layoutEngine}
            onChange={e => setLayoutEngine(e.target.value as LayoutEngine)}
            title="Layout engine"
            className="h-7 rounded-md border-0 bg-transparent px-1.5 text-xs font-medium text-[var(--fg-muted)] focus:outline-none"
          >
            {LAYOUT_ENGINES.map(en => <option key={en.id} value={en.id}>{en.label}</option>)}
          </select>
          <Button size="sm" variant="outline" onClick={() => runAutoLayout('all')} title="Auto-layout the whole view">⤢ <span className="wide-label">Layout</span></Button>
          <Button size="sm" variant="outline" onClick={() => runAutoLayout('selected')} title="Layout selected nodes only"><span className="wide-label">Selection</span><span className="compact-only">Sel.</span></Button>
          <Button size="sm" variant="outline" disabled={!canAlignSelection} onClick={() => alignSelection('vertical')} title="Align selected node centres on a vertical line" aria-label="Align vertically">↕</Button>
          <Button size="sm" variant="outline" disabled={!canAlignSelection} onClick={() => alignSelection('horizontal')} title="Align selected node centres on a horizontal line" aria-label="Align horizontally">↔</Button>
          <Button size="sm" variant="outline" onClick={() => fitView({ duration: 300, padding: 0.2 })}>Fit</Button>
        </Panel>

        <Panel position="top-right" className="gms-canvas-toolbar gms-secondary-toolbar flex items-center">
          <Button size="sm" variant="outline" onClick={duplicateSelection} title="Duplicate selection (Ctrl/Cmd+D)" aria-label="Duplicate selection">⧉</Button>
          <Button
            size="sm" variant="outline"
            className={toggleBtn(edgeRouting === 'orthogonal')}
            onClick={toggleEdgeRouting}
            title="Smart routing: orthogonal edges that avoid nodes"
          >↳ <span className="wide-label">Route</span></Button>
          <Button size="sm" variant="outline" className={toggleBtn(snapToGrid)} onClick={toggleSnapToGrid} title="Snap to grid">⌗ <span className="wide-label">Snap</span></Button>
          <Button size="sm" variant="outline" className={toggleBtn(showMinimap)} onClick={toggleMinimap} title="Toggle minimap">▭ <span className="wide-label">Map</span></Button>
          <Button size="sm" variant="outline" onClick={exportPng} title="Export PNG of the current view">⤓ <span className="wide-label">PNG</span></Button>
        </Panel>
      </ReactFlow>

      {menu && <NodeContextMenu state={menu} onPick={addNodeAt} onClose={() => setMenu(null)} />}
    </div>
  )
}

export function GraphEditor() {
  return (
    <ReactFlowProvider>
      <GraphEditorInner />
    </ReactFlowProvider>
  )
}
