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
import { toPng } from 'html-to-image'
import { useModelStore } from '@/store'
import {
  modelToFlow,
  computeAutoLayout,
  buildLayoutInputs,
  type GraphNode,
  type GraphEdge,
} from './model-to-flow'
import { GraphNodeComponent } from './nodes/GraphNode'
import { FloatingEdge } from './edges/FloatingEdge'
import { EdgeMarkers } from './edges/EdgeMarkers'
import { Button } from '@/ui/components/Button'
import { nanoid } from './nanoid'
import { notationRegistry } from '@/core/notation'
import { runLayoutSubset, LAYOUT_ENGINES, type LayoutEngine } from '@/core/layout'
import { NodeContextMenu, type ContextMenuState } from './NodeContextMenu'
import { saveBinaryFile, filtersForExt } from '@/services/file-save'

const nodeTypes = { graphNode: GraphNodeComponent }
const edgeTypes = { floating: FloatingEdge }

/** Decode a "data:image/png;base64,…" URL into raw bytes. */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

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

  const { screenToFlowPosition, fitView, getIntersectingNodes } = useReactFlow()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const clipboard = useRef<string[]>([])

  const activeView = activeViewId ? model.views[activeViewId] : Object.values(model.views)[0]
  const viewId = activeView?.id ?? 'default'

  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [menu, setMenu] = useState<ContextMenuState | null>(null)

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
    if (!c.source || !c.target || c.source === c.target) return
    const id = `rel_${c.source}_${c.target}_${nanoid(4)}`
    const sh = (c.sourceHandle ?? undefined) as 't' | 'b' | 'l' | 'r' | undefined
    const th = (c.targetHandle ?? undefined) as 't' | 'b' | 'l' | 'r' | undefined
    dispatch({ type: 'ADD_RELATION', payload: { id, sourceId: c.source, targetId: c.target, notation: 'generic', sourceHandle: sh, targetHandle: th } })
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

  // ── drag commit + drop-to-reparent ──
  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: GraphNode, dragged: GraphNode[]) => {
      if (dragged.length === 1) {
        const el = model.elements[node.id]
        const desc = descendantIds(model, node.id)
        // any overlapping node (not self / not a descendant) can become the new parent
        const inter = (getIntersectingNodes(node) as Node[]).filter(n => n.id !== node.id && !desc.has(n.id))
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
    [dispatch, viewId, model, getIntersectingNodes],
  )

  // ── add node ──
  const addNodeAt = useCallback((elementType: string, flowX: number, flowY: number) => {
    const def = notationRegistry.getElementDef(elementType)
    const id = `${elementType}_${nanoid(5)}`
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
  }, [dispatch, selectElements, setEditingElement, pushRecentType])

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
  const runAutoLayout = useCallback((scope: 'all' | 'selected') => {
    if (!activeView) return
    const selectedIds = nodes.filter(n => n.selected).map(n => n.id)
    if (scope === 'selected' && selectedIds.length < 2) scope = 'all'
    if (scope === 'all') {
      setViewPositions(viewId, computeAutoLayout(model, activeView, { engine: layoutEngine, ignoreStored: true }), false)
    } else {
      const { nodes: lin, edges: led } = buildLayoutInputs(model, activeView)
      const current: Record<string, { x: number; y: number }> = {}
      for (const n of nodes) current[n.id] = n.position
      const positions = runLayoutSubset(layoutEngine, lin, led, current, new Set(selectedIds), {
        direction: activeView.layoutDirection, layerGap: 90, nodeGap: 48,
      })
      setViewPositions(viewId, positions, true)
    }
    setTimeout(() => fitView({ duration: 300, padding: 0.2 }), 50)
  }, [activeView, model, nodes, viewId, setViewPositions, fitView, layoutEngine])

  // ── duplicate / copy / paste ──
  const duplicateSelection = useCallback(() => {
    const ids = nodes.filter(n => n.selected).map(n => n.id)
    if (!ids.length) return
    const created = duplicateElements(ids)
    setTimeout(() => selectElements(created), 0)
  }, [nodes, duplicateElements, selectElements])

  // ── export PNG ──
  const exportPng = useCallback(async () => {
    const el = wrapperRef.current?.querySelector('.react-flow__viewport') as HTMLElement | null
    if (!el) return
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--surface-0').trim() || '#0a0e16'
    const rect = (wrapperRef.current as HTMLElement).getBoundingClientRect()
    const dataUrl = await toPng(el, {
      backgroundColor: bg,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      style: { transform: el.style.transform },
    })
    const base = model.metadata.title.replace(/\s+/g, '-').toLowerCase() || 'diagram'
    const bytes = dataUrlToBytes(dataUrl)
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
        clipboard.current = nodes.filter(n => n.selected).map(n => n.id)
      } else if (mod && e.key.toLowerCase() === 'v') {
        if (clipboard.current.length) {
          const created = duplicateElements(clipboard.current)
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
    <div ref={wrapperRef} className="h-full w-full" onDragOver={onCanvasDragOver} onDrop={onCanvasDrop}>
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

        <Panel position="top-left" className="flex flex-wrap items-center gap-1">
          <Button size="sm" variant="outline" onClick={openAddMenuFromButton} title="Add node (or right-click canvas)">＋ Node</Button>
          <div className="mx-0.5 h-5 w-px bg-[var(--border)]" />
          <select
            value={layoutEngine}
            onChange={e => setLayoutEngine(e.target.value as LayoutEngine)}
            title="Layout engine"
            className="h-7 rounded border border-[var(--border)] bg-[var(--surface-1)] px-1.5 text-xs text-[var(--fg-muted)] focus:outline-none"
          >
            {LAYOUT_ENGINES.map(en => <option key={en.id} value={en.id}>{en.label}</option>)}
          </select>
          <Button size="sm" variant="outline" onClick={() => runAutoLayout('all')} title="Auto-layout the whole view">⤢ All</Button>
          <Button size="sm" variant="outline" onClick={() => runAutoLayout('selected')} title="Layout selected nodes only">⤢ Selected</Button>
          <Button size="sm" variant="outline" onClick={() => fitView({ duration: 300, padding: 0.2 })}>Fit</Button>
        </Panel>

        <Panel position="top-right" className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={duplicateSelection} title="Duplicate selection (Ctrl/Cmd+D)">⧉ Duplicate</Button>
          <Button
            size="sm" variant="outline"
            className={toggleBtn(edgeRouting === 'orthogonal')}
            onClick={toggleEdgeRouting}
            title="Smart routing: orthogonal edges that avoid nodes"
          >↳ Route</Button>
          <Button size="sm" variant="outline" className={toggleBtn(snapToGrid)} onClick={toggleSnapToGrid} title="Snap to grid">⌗ Snap</Button>
          <Button size="sm" variant="outline" className={toggleBtn(showMinimap)} onClick={toggleMinimap} title="Toggle minimap">▭ Map</Button>
          <Button size="sm" variant="outline" onClick={exportPng} title="Export PNG of the current view">⤓ PNG</Button>
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
