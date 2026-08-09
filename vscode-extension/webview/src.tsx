import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import '../bundled-icons'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import '../../src/styles/global.css'
import './webview.css'
import { GraphPanel } from '../../src/app/GraphPanel'
import { PropertiesPanel } from '../../src/features/properties-panel/PropertiesPanel'
import { Explorer } from '../../src/features/explorer/Explorer'
import { Button } from '../../src/ui/components/Button'
import { ResizeHandle } from '../../src/ui/components/Resizable'
import { parseDsl } from '../../src/core/dsl/parser'
import { createDefaultView } from '../../src/core/model'
import { captureGraphPng, pngBytesToDataUrl, type GraphCaptureWorkspace } from '../../src/features/editor-graph/png-export'
import { setFileSaveAdapter, type SaveOptions } from '../../src/services/file-save'
import { useModelStore } from '../../src/store'

declare const acquireVsCodeApi: () => {
  postMessage(message: unknown): void
  getState(): unknown
  setState(state: unknown): void
}

const vscode = acquireVsCodeApi()

interface WebviewUiState {
  explorerOpen?: boolean
  explorerWidth?: number
}

const initialUiState = (vscode.getState() as WebviewUiState | undefined) ?? {}

function saveUiState(patch: Partial<WebviewUiState>) {
  vscode.setState({ ...((vscode.getState() as WebviewUiState | undefined) ?? {}), ...patch })
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : document.activeElement
  return element instanceof HTMLElement
    && element.closest('input, textarea, select, [contenteditable="true"], .inputarea') !== null
}

interface RenderMessage {
  type: 'render'
  renderId: string
  source: string
  name: string
  view?: string
  theme?: 'light' | 'dark'
  editable?: boolean
  version: string
}

interface ExportMessage {
  type: 'export'
  requestId: string
  width: number
  height: number
  theme?: 'light' | 'dark'
}

interface SaveResultMessage {
  type: 'saveResult'
  requestId: string
  saved: boolean
  error?: string
}

type HostMessage = RenderMessage | ExportMessage | SaveResultMessage

let requestSequence = 0
const pendingSaves = new Map<string, (saved: boolean) => void>()

function saveThroughHost(kind: 'text' | 'binary', content: string | Uint8Array, options: SaveOptions): Promise<boolean> {
  const requestId = `save-${++requestSequence}`
  const result = new Promise<boolean>(resolve => pendingSaves.set(requestId, resolve))
  vscode.postMessage({
    type: kind === 'text' ? 'saveText' : 'saveBinary',
    requestId,
    content: typeof content === 'string' ? content : Array.from(content),
    options,
  })
  return result
}

setFileSaveAdapter({
  saveText: (content, options) => saveThroughHost('text', content, options),
  saveBinary: (bytes, options) => saveThroughHost('binary', bytes, options),
})

function StudioGraph({ message }: { message: RenderMessage }) {
  const parsed = useMemo(() => parseDsl(message.source), [message.source])
  const [hydratedRenderId, setHydratedRenderId] = useState<string | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [inspectorWidth, setInspectorWidth] = useState(280)
  const [explorerOpen, setExplorerOpen] = useState(initialUiState.explorerOpen ?? false)
  const [explorerWidth, setExplorerWidth] = useState(initialUiState.explorerWidth ?? 220)
  const theme = useModelStore(state => state.theme)
  const toggleTheme = useModelStore(state => state.toggleTheme)
  const undo = useModelStore(state => state.undo)
  const redo = useModelStore(state => state.redo)
  const canUndo = useModelStore(state => state.past.length > 0)
  const canRedo = useModelStore(state => state.future.length > 0)
  const syncTimer = useRef<number | undefined>(undefined)

  const handleToggleTheme = () => {
    toggleTheme()
    vscode.postMessage({ type: 'themeChanged', theme: useModelStore.getState().theme })
  }

  useEffect(() => {
    saveUiState({ explorerOpen, explorerWidth })
  }, [explorerOpen, explorerWidth])

  useLayoutEffect(() => {
    const model = parsed.model
    if (!model) {
      setHydratedRenderId(message.renderId)
      return
    }
    if (Object.keys(model.views).length === 0) {
      const view = createDefaultView()
      model.views[view.id] = view
    }
    const preferredView = message.view
      ? Object.values(model.views).find(view => view.id === message.view || view.name === message.view)
      : undefined
    const activeViewId = preferredView?.id ?? Object.keys(model.views)[0] ?? null
    const theme = message.theme ?? 'dark'

    useModelStore.setState({
      model,
      dslSource: message.source,
      activeViewId,
      selectedElementIds: [],
      selectedElementId: null,
      selectedRelationId: null,
      diagnostics: parsed.diagnostics,
      parseError: !parsed.success,
      theme,
      fileName: message.name,
      filePath: null,
      isDirty: false,
      past: [],
      future: [],
    })
    setHydratedRenderId(message.renderId)
  }, [message, parsed])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  useEffect(() => {
    if (!message.editable) return

    const handleHistoryShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || isTextEditingTarget(event.target)) return

      const key = event.key.toLowerCase()
      const state = useModelStore.getState()
      if (key === 'z' && !event.shiftKey && state.past.length > 0) {
        event.preventDefault()
        state.undo()
      } else if ((key === 'y' || (key === 'z' && event.shiftKey)) && state.future.length > 0) {
        event.preventDefault()
        state.redo()
      }
    }

    window.addEventListener('keydown', handleHistoryShortcut)
    return () => window.removeEventListener('keydown', handleHistoryShortcut)
  }, [message.editable])

  useEffect(() => {
    if (hydratedRenderId !== message.renderId || !message.editable) return
    let previousSource = useModelStore.getState().dslSource
    const unsubscribe = useModelStore.subscribe(state => {
      if (state.dslSource === previousSource) return
      previousSource = state.dslSource
      if (syncTimer.current) window.clearTimeout(syncTimer.current)
      syncTimer.current = window.setTimeout(() => {
        vscode.postMessage({
          type: 'sourceChanged',
          renderId: message.renderId,
          source: useModelStore.getState().dslSource,
        })
      }, 120)
    })
    return () => {
      unsubscribe()
      if (syncTimer.current) window.clearTimeout(syncTimer.current)
    }
  }, [hydratedRenderId, message.editable, message.renderId])

  useEffect(() => {
    if (hydratedRenderId !== message.renderId) return
    if (!parsed.model) {
      vscode.postMessage({ type: 'rendered', renderId: message.renderId })
      return
    }
    let cancelled = false
    let frame = 0
    let attempts = 0
    const reportWhenMeasured = () => {
      if (cancelled) return
      const workspace = document.querySelector('.gms-graph-workspace') as GraphCaptureWorkspace | null
      const bounds = workspace?.__gmsGetContentBounds?.()
      if ((bounds && bounds.width > 0 && bounds.height > 0) || attempts++ >= 30) {
        vscode.postMessage({ type: 'rendered', renderId: message.renderId })
        return
      }
      frame = requestAnimationFrame(reportWhenMeasured)
    }
    frame = requestAnimationFrame(reportWhenMeasured)
    return () => {
      cancelled = true
      cancelAnimationFrame(frame)
    }
  }, [hydratedRenderId, message.renderId, parsed.model])

  useEffect(() => {
    const receive = (event: MessageEvent<HostMessage>) => {
      if (event.data.type !== 'export') return
      const request = event.data
      const run = async () => {
        try {
          const wrapper = document.querySelector('.gms-graph-workspace') as HTMLElement | null
          if (!wrapper) throw new Error('The original graph canvas is not ready.')
          const bytes = await captureGraphPng(wrapper)
          const dataUrl = await pngBytesToDataUrl(bytes)
          vscode.postMessage({ type: 'exportResult', requestId: request.requestId, dataUrl })
        } catch (error) {
          vscode.postMessage({
            type: 'exportResult',
            requestId: request.requestId,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
      void run()
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [])

  if (hydratedRenderId !== message.renderId) return null
  if (!parsed.model) {
    return (
      <main className="gmc-empty">
        <h1>Unable to render GMC</h1>
        {parsed.diagnostics.map((diagnostic, index) => (
          <p key={index}>{diagnostic.line ?? 1}:{diagnostic.column ?? 1} — {diagnostic.message}</p>
        ))}
      </main>
    )
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 bg-[var(--surface-0)] text-[var(--fg)]">
      {explorerOpen && (
        <>
          <aside
            className="relative z-10 flex shrink-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--surface-1)] shadow-[3px_0_12px_rgba(0,0,0,0.025)]"
            style={{ width: explorerWidth }}
          >
            <Explorer />
          </aside>
          <ResizeHandle
            onResize={delta => setExplorerWidth(width => Math.max(160, Math.min(480, width + delta)))}
            onDoubleClick={() => setExplorerOpen(false)}
          />
        </>
      )}
      <GraphPanel
        headerActions={(
          <>
            <span
              className="mr-1 rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--fg-subtle)]"
              title={`Graph Model Studio v${message.version}`}
            >
              v{message.version}
            </span>
            <Button
              size="icon"
              variant="ghost"
              onClick={undo}
              disabled={!message.editable || !canUndo}
              title="Undo (Ctrl/Cmd+Z)"
              aria-label="Undo"
            >
              <span className="text-base leading-none">↶</span>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={redo}
              disabled={!message.editable || !canRedo}
              title="Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)"
              aria-label="Redo"
            >
              <span className="text-base leading-none">↷</span>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setExplorerOpen(open => !open)}
              title="Toggle explorer"
              className={explorerOpen ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--fg-subtle)]'}
            >
              <span className="text-base leading-none">▥</span>
            </Button>
            <Button size="icon" variant="ghost" onClick={handleToggleTheme} title="Toggle theme">
              <span className="text-base">{theme === 'dark' ? '☀' : '☾'}</span>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setInspectorOpen(open => !open)}
              title="Toggle inspector"
              className={inspectorOpen ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-[var(--fg-subtle)]'}
            >
              <span className="text-base leading-none">▤</span>
            </Button>
          </>
        )}
      />
      {inspectorOpen && (
        <>
          <ResizeHandle
            onResize={delta => setInspectorWidth(width => Math.max(200, Math.min(520, width - delta)))}
            onDoubleClick={() => setInspectorOpen(false)}
          />
          <aside
            className="relative z-10 flex shrink-0 flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--surface-1)] shadow-[-3px_0_12px_rgba(0,0,0,0.025)]"
            style={{ width: inspectorWidth }}
          >
            <PropertiesPanel />
          </aside>
        </>
      )}
    </div>
  )
}

function App() {
  const [message, setMessage] = useState<RenderMessage | null>(null)

  useEffect(() => {
    const receive = (event: MessageEvent<HostMessage>) => {
      if (event.data.type === 'render') setMessage(event.data)
      if (event.data.type === 'saveResult') {
        pendingSaves.get(event.data.requestId)?.(event.data.saved)
        pendingSaves.delete(event.data.requestId)
      }
    }
    window.addEventListener('message', receive)
    vscode.postMessage({ type: 'ready' })
    return () => window.removeEventListener('message', receive)
  }, [])

  if (!message) return <main className="gmc-empty"><p>Open a GMC document to render its graph.</p></main>
  return <StudioGraph message={message} />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
)
