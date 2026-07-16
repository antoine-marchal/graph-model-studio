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
  type Node,
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
import { alignNodes, runLayoutSubset, LAYOUT_ENGINES, type LayoutEngine } from '@/core/layout'
import { NodeContextMenu, type ContextMenuState } from './NodeContextMenu'
import { saveBinaryFile, filtersForExt } from '@/services/file-save'
import { createElementId } from '@/core/model'
import { captureGraphPng, type GraphCaptureWorkspace } from './png-export'

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

  const { screenToFlowPosition, fitView, getIntersectingNodes, getNodes, getNodesBounds } = useReactFlow()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const clipboard = useRef<string[]>([])

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
  // mirror store selection (e.g. explorer clicks) into React Flow so Delete works there too
  useEffect(() => {
    const selEl = new Set(selectedElementIds)
    setNodes(nds => nds.map(n => (!!n.selected === selEl.has(n.id) ? n : { ...n, selected: selEl.has(n.id) })))
    setEdges(eds => eds.map(e => (!!e.selected === (e.id === selectedRelationId) ? e : { ...e, selected: e.id === selectedRelationId })))
  }, [selectedElementIds, selectedRelationId])

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes(nds => applyNodeChanges(changes, nds) as GraphNode[])
  }, [])
  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdges(eds => applyEdgeChanges(changes, eds) as GraphEdge[])
  }, [])

  const onConnect = useCallback((c: Connection) => {
    // a connection from a treeNode's dot carries the anchor id — map back to the
    // real treeNode so the relation is stored against it
    const unanchor = (v: string | null | undefined) => {
      if (!v?.startsWith('__treeanchor_')) return v
      return v.slice('__treeanchor_'.length).replace(/_[lr]$/, '')
    }
    // Embedded Sankey nodes share their chart's React Flow node. Their handle
    // carries the real model element id so relations still target the children.
    const unsankey = (node: string | null | undefined, handle: string | null | undefined) => {
      if (!handle?.startsWith('sankey:')) return node
      const match = /^sankey:(.+):[lr]$/.exec(handle)
      return match?.[1] ?? node
    }
    const source = unsankey(unanchor(c.source), c.sourceHandle)
    const target = unsankey(unanchor(c.target), c.targetHandle)
    if (!source || !target || source === target) return
    const anchored = source !== c.source || target !== c.target
    const id = `rel_${source}_${target}_${nanoid(4)}`
    const sh = (anchored ? undefined : c.sourceHandle ?? undefined) as 't' | 'b' | 'l' | 'r' | undefined
    const th = (anchored ? undefined : c.targetHandle ?? undefined) as 't' | 'b' | 'l' | 'r' | undefined
    dispatch({ type: 'ADD_RELATION', payload: { id, sourceId: source, targetId: target, notation: 'generic', sourceHandle: sh, targetHandle: th } })
  }, [dispatch])

  // ── selection → highlight code (no focus) ──
  const onSelectionChange = useCallback(
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
    for (const n of deleted) dispatch({ type: 'DELETE_ELEMENT', payload: { id: n.id } })
  }, [dispatch])
  const onEdgesDelete = useCallback((deleted: { id: string }[]) => {
    for (const e of deleted) dispatch({ type: 'DELETE_RELATION', payload: { id: e.id } })
  }, [dispatch])

  // ── drag commit + drop-to-reparent + drag-to-sort ──
  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: GraphNode, dragged: GraphNode[]) => {
      if (dragged.length === 1) {
        const el = model.elements[node.id]
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
        // any overlapping model node (not self / not a descendant / not synthetic) can become the new parent
        const inter = (getIntersectingNodes(node) as Node[])
          .filter(n => n.id !== node.id && !desc.has(n.id) && !!model.elements[n.id])
        let target: Node | null = null
        for (const n of inter) {
          const a = (n.width ?? 1) * (n.height ?? 1)
          const ta = target ? (target.width ?? 1) * (target.height ?? 1) : Infinity
          if (a < ta) target = n
        }
        const newParent = target?.id
        if (newParent !== el?.parentId) {
          dispatch({ type: 'UPDATE_ELEMENT', payload: { id: node.id, parentId: newParent } })
          return
        }
      }
      const positions: Record<string, { x: number; y: number }> = {}
      for (const n of dragged) positions[n.id] = n.position
      if (Object.keys(positions).length) dispatch({ type: 'APPLY_LAYOUT', payload: { viewId, positions } })
    },
    [dispatch, viewId, model, getIntersectingNodes, nodes, reorderSiblings],
  )

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
      if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault(); duplicateSelection()
      } else if (mod && e.key.toLowerCase() === 'c') {
        clipboard.current = [...useModelStore.getState().selectedElementIds]
      } else if (mod && e.key.toLowerCase() === 'v') {
        if (clipboard.current.length) {
          const selectedTarget = useModelStore.getState().selectedElementId
          const created = duplicateElements(clipboard.current, { parentId: selectedTarget })
          setTimeout(() => selectElements(created), 0)
        }
      } else if (e.key === 'F2') {
        const sel = nodes.filter(n => n.selected).map(n => n.id)
        if (sel.length === 1) setEditingElement(sel[0])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nodes, duplicateSelection, duplicateElements, selectElements, setEditingElement])

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
    <div ref={wrapperRef} className="gms-graph-workspace h-full w-full" onDragOver={onCanvasDragOver} onDrop={onCanvasDrop}>
      <EdgeMarkers />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onSelectionChange={onSelectionChange}
        onNodeDoubleClick={onNodeDoubleClick}
        onEdgeDoubleClick={onEdgeDoubleClick}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onNodeDragStop={onNodeDragStop}
        onPaneContextMenu={onPaneContextMenu}
        onPaneClick={() => { selectElements([]); selectRelation(null); setMenu(null); setEditingElement(null) }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        multiSelectionKeyCode={['Meta', 'Control']}
        selectionKeyCode="Shift"
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
