import { useEffect, useRef, useState } from 'react'
import { Titlebar } from './layout/Titlebar'
import { StatusBar } from './layout/StatusBar'
import { Explorer } from '@/features/explorer/Explorer'
import { CodeEditor } from '@/features/editor-code/CodeEditor'
import { GraphEditor } from '@/features/editor-graph/GraphEditor'
import { PropertiesPanel } from '@/features/properties-panel/PropertiesPanel'
import { ResizeHandle } from '@/ui/components/Resizable'
import { useModelStore } from '@/store'
import { getCliFile } from '@/services/tauri'
import { getStorageProvider } from '@/services/storage'
import { parseDsl } from '@/core/dsl/parser'

type ViewMode = 'split' | 'code' | 'graph'

const VIEWMODE_KEY = 'gms:viewmode'
function loadViewMode(): ViewMode {
  try {
    const v = localStorage.getItem(VIEWMODE_KEY)
    if (v === 'split' || v === 'code' || v === 'graph') return v
  } catch { /* ignore */ }
  return 'split'
}

interface LayoutState {
  explorerW: number
  propsW: number
  codeFrac: number
  explorerOpen: boolean
  propsOpen: boolean
}
const LAYOUT_KEY = 'gms:layout'
const DEFAULT_LAYOUT: LayoutState = { explorerW: 220, propsW: 264, codeFrac: 0.46, explorerOpen: true, propsOpen: true }

function loadLayout(): LayoutState {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (raw) return { ...DEFAULT_LAYOUT, ...(JSON.parse(raw) as Partial<LayoutState>) }
  } catch { /* ignore */ }
  return DEFAULT_LAYOUT
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function App() {
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode)
  const [layout, setLayout] = useState<LayoutState>(loadLayout)
  const centerRef = useRef<HTMLDivElement>(null)
  const theme = useModelStore(s => s.theme)
  const undo = useModelStore(s => s.undo)
  const redo = useModelStore(s => s.redo)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // Open a file passed on launch (CLI arg or .gmc double-click) once at startup.
  useEffect(() => {
    let cancelled = false
    getCliFile().then(file => {
      if (cancelled || !file) return
      const { loadModel, setFileName } = useModelStore.getState()
      const name = file.path.split(/[/\\]/).pop() ?? file.path
      setFileName(name)
      // remember the real path so Ctrl+S writes back here instead of prompting
      getStorageProvider().setCurrentPath(file.path)
      if (name.endsWith('.json')) {
        try { loadModel(JSON.parse(file.content)) } catch { /* ignore malformed */ }
      } else {
        const r = parseDsl(file.content)
        if (r.model) loadModel(r.model, file.content)
      }
    })
    return () => { cancelled = true }
  }, [])

  // persist layout (debounced via rAF is overkill; localStorage write is cheap)
  useEffect(() => {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)) } catch { /* ignore */ }
  }, [layout])

  useEffect(() => {
    const onViewMode = (e: Event) => {
      const mode = (e as CustomEvent<ViewMode>).detail
      setViewMode(mode)
      try { localStorage.setItem(VIEWMODE_KEY, mode) } catch { /* ignore */ }
    }
    const onToggleExplorer = () => setLayout(l => ({ ...l, explorerOpen: !l.explorerOpen }))
    const onToggleProps = () => setLayout(l => ({ ...l, propsOpen: !l.propsOpen }))
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent('gms:save'))
      } else if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') {
        // let the code editor own undo when it is focused
        const tag = (document.activeElement?.tagName ?? '').toLowerCase()
        if (tag !== 'textarea' && !document.activeElement?.classList.contains('inputarea')) {
          e.preventDefault(); undo()
        }
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        const tag = (document.activeElement?.tagName ?? '').toLowerCase()
        if (tag !== 'textarea' && !document.activeElement?.classList.contains('inputarea')) {
          e.preventDefault(); redo()
        }
      }
    }
    window.addEventListener('gms:viewmode', onViewMode)
    window.addEventListener('gms:toggle-explorer', onToggleExplorer)
    window.addEventListener('gms:toggle-props', onToggleProps)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('gms:viewmode', onViewMode)
      window.removeEventListener('gms:toggle-explorer', onToggleExplorer)
      window.removeEventListener('gms:toggle-props', onToggleProps)
      window.removeEventListener('keydown', onKey)
    }
  }, [undo, redo])

  const showCode = viewMode === 'split' || viewMode === 'code'
  const showGraph = viewMode === 'split' || viewMode === 'graph'

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--surface-0)] text-[var(--fg)]">
      <Titlebar layoutFlags={{ explorerOpen: layout.explorerOpen, propsOpen: layout.propsOpen }} />
      <div className="flex flex-1 overflow-hidden">
        {layout.explorerOpen && (
          <>
            <aside
              className="flex shrink-0 flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--surface-1)]"
              style={{ width: layout.explorerW }}
            >
              <Explorer />
            </aside>
            <ResizeHandle
              onResize={d => setLayout(l => ({ ...l, explorerW: clamp(l.explorerW + d, 160, 480) }))}
              onDoubleClick={() => setLayout(l => ({ ...l, explorerOpen: false }))}
            />
          </>
        )}

        <main ref={centerRef} className="flex flex-1 overflow-hidden">
          {showCode && (
            <div
              className="flex min-w-0 flex-col"
              style={{ flexBasis: viewMode === 'split' ? `${layout.codeFrac * 100}%` : '100%', flexGrow: viewMode === 'split' ? 0 : 1 }}
            >
              <PanelHeader label="DSL" />
              <div className="flex-1 overflow-hidden"><CodeEditor /></div>
            </div>
          )}

          {showCode && showGraph && (
            <ResizeHandle
              onResize={d => {
                const w = centerRef.current?.clientWidth ?? 1
                setLayout(l => ({ ...l, codeFrac: clamp(l.codeFrac + d / w, 0.15, 0.85) }))
              }}
              onDoubleClick={() => setLayout(l => ({ ...l, codeFrac: 0.46 }))}
            />
          )}

          {showGraph && (
            <div className="flex min-w-0 flex-1 flex-col">
              <PanelHeader label="Graph"><ViewTabs /></PanelHeader>
              <div className="flex-1 overflow-hidden"><GraphEditor /></div>
            </div>
          )}
        </main>

        {layout.propsOpen && (
          <>
            <ResizeHandle
              onResize={d => setLayout(l => ({ ...l, propsW: clamp(l.propsW - d, 200, 520) }))}
              onDoubleClick={() => setLayout(l => ({ ...l, propsOpen: false }))}
            />
            <aside
              className="flex shrink-0 flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--surface-1)]"
              style={{ width: layout.propsW }}
            >
              <PropertiesPanel />
            </aside>
          </>
        )}
      </div>
      <StatusBar />
    </div>
  )
}

function PanelHeader({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-7 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-1)] px-3">
      <span className="text-[11px] font-medium text-[var(--fg-subtle)]">{label}</span>
      {children}
    </div>
  )
}

function ViewTabs() {
  const model = useModelStore(s => s.model)
  const activeViewId = useModelStore(s => s.activeViewId)
  const setActiveView = useModelStore(s => s.setActiveView)
  const views = Object.values(model.views)
  if (views.length <= 1) return null
  return (
    <div className="ml-2 flex gap-0.5">
      {views.map(v => (
        <button
          key={v.id}
          onClick={() => setActiveView(v.id)}
          className={`rounded px-2 py-0.5 text-[11px] transition-colors ${
            v.id === activeViewId ? 'bg-[var(--surface-3)] text-[var(--fg)]' : 'text-[var(--fg-subtle)] hover:text-[var(--fg-muted)]'
          }`}
        >
          {v.name}
        </button>
      ))}
    </div>
  )
}
