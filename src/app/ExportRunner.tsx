import { useEffect, useRef, useState } from 'react'
import { ReactFlow, ReactFlowProvider, Background, BackgroundVariant, useReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { toPng } from 'html-to-image'
import { parseDsl } from '@/core/dsl/parser'
import { createDefaultView, type GraphModel, type GraphView } from '@/core/model'
import { modelToFlow } from '@/features/editor-graph/model-to-flow'
import { GraphNodeComponent } from '@/features/editor-graph/nodes/GraphNode'
import { GanttAxisNode } from '@/features/editor-graph/nodes/GanttAxisNode'
import { SeqPointNode, TreeAnchorNode } from '@/features/editor-graph/nodes/DecorNode'
import { FloatingEdge } from '@/features/editor-graph/edges/FloatingEdge'
import { EdgeMarkers } from '@/features/editor-graph/edges/EdgeMarkers'
import { getExporter } from '@/core/export'
import { finishExport, type ExportRequest } from '@/services/tauri'

const nodeTypes = { graphNode: GraphNodeComponent, ganttAxis: GanttAxisNode, seqPoint: SeqPointNode, treeAnchor: TreeAnchorNode }
const edgeTypes = { floating: FloatingEdge }

const FORMAT_TO_EXPORTER: Record<string, string> = {
  json: 'json', gmc: 'dsl', dsl: 'dsl',
  mermaid: 'mermaid', md: 'mermaid', plantuml: 'plantuml', puml: 'plantuml',
}

async function writeText(path: string, content: string) {
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('write_text_file', { path, content })
}
async function writeBinary(path: string, bytes: Uint8Array) {
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('write_binary_file', { path, contents: Array.from(bytes) })
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function parseModel(req: ExportRequest): GraphModel {
  let model: GraphModel
  if (req.inputName.toLowerCase().endsWith('.json')) {
    model = JSON.parse(req.inputContent) as GraphModel
  } else {
    const r = parseDsl(req.inputContent)
    if (!r.model) throw new Error('failed to parse DSL input')
    model = r.model
  }
  if (Object.keys(model.views).length === 0) model.views.default = createDefaultView()
  return model
}

/** Pick a view by id or name; falls back to the first view. */
function selectView(model: GraphModel, wanted?: string | null): GraphView {
  const views = Object.values(model.views)
  if (wanted) {
    const match = views.find(v => v.id === wanted || v.name === wanted)
    if (!match) throw new Error(`view '${wanted}' not found (have: ${views.map(v => v.name).join(', ')})`)
    return match
  }
  return views[0]
}

/** Renders the graph off-screen at a fixed size and rasterises it to PNG. */
function PngRenderer({ req, model, view }: { req: ExportRequest; model: GraphModel; view: GraphView }) {
  const { fitView } = useReactFlow()
  const ref = useRef<HTMLDivElement>(null)
  const width = req.width ?? 1600
  const height = req.height ?? 1000
  const dark = (req.theme ?? 'dark') === 'dark'
  const bg = dark ? '#0a0e16' : '#ffffff'
  const { nodes, edges } = modelToFlow(model, view, { engine: 'layered' })

  useEffect(() => {
    let done = false
    const run = async () => {
      try {
        // give layout, fonts and PNG glyphs time to settle
        await new Promise(r => setTimeout(r, 50))
        fitView({ padding: 0.12 })
        await (document as Document & { fonts?: FontFaceSet }).fonts?.ready
        await new Promise(r => setTimeout(r, 500))
        const el = ref.current!
        const dataUrl = await toPng(el, { backgroundColor: bg, width, height, cacheBust: true })
        await writeBinary(req.output, dataUrlToBytes(dataUrl))
        if (!done) finishExport(true, `Exported PNG → ${req.output} (${width}×${height})`)
      } catch (e) {
        if (!done) finishExport(false, `Export failed: ${(e as Error).message}`)
      }
    }
    run()
    return () => { done = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={ref} style={{ width, height }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        colorMode={dark ? 'dark' : 'light'}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
      >
        <EdgeMarkers />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={dark ? '#141a23' : '#c5ccd6'} />
      </ReactFlow>
    </div>
  )
}

export function ExportRunner({ request }: { request: ExportRequest }) {
  const [status, setStatus] = useState('Exporting…')
  const [png, setPng] = useState<{ model: GraphModel; view: GraphView } | null>(null)

  useEffect(() => {
    const dark = (request.theme ?? 'dark') === 'dark'
    document.documentElement.classList.toggle('dark', dark)

    let model: GraphModel
    try {
      model = parseModel(request)
    } catch (e) {
      setStatus('failed')
      finishExport(false, `Export failed: ${(e as Error).message}`)
      return
    }

    // --list-views: print the available views and quit
    if (request.format === 'list-views') {
      const lines = Object.values(model.views).map(v => `${v.id}\t${v.name}`).join('\n')
      finishExport(true, lines || '(no views)')
      return
    }

    let view: GraphView
    try {
      view = selectView(model, request.view)
    } catch (e) {
      setStatus('failed')
      finishExport(false, `Export failed: ${(e as Error).message}`)
      return
    }

    if (request.format === 'png') {
      setPng({ model, view })
      return
    }

    // text formats — no rendering required
    const run = async () => {
      try {
        const id = FORMAT_TO_EXPORTER[request.format]
        const exporter = id ? getExporter(id) : undefined
        if (!exporter) throw new Error(`unsupported format '${request.format}'`)
        const out = await exporter.export(model, view)
        const text = out instanceof Blob ? await out.text() : out
        await writeText(request.output, text)
        finishExport(true, `Exported ${request.format} → ${request.output}`)
      } catch (e) {
        finishExport(false, `Export failed: ${(e as Error).message}`)
      }
    }
    run()
  }, [request])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0e16', color: '#9aa', font: '13px monospace', padding: 16 }}>
      {png ? (
        <ReactFlowProvider>
          <PngRenderer req={request} model={png.model} view={png.view} />
        </ReactFlowProvider>
      ) : (
        <span>{status}</span>
      )}
    </div>
  )
}
