import { lazy, Suspense, useState, useEffect, useCallback } from 'react'
import { useModelStore } from '@/store'
import { Button } from '@/ui/components/Button'
import { getStorageProvider } from '@/services/storage'
import { parseDsl } from '@/core/dsl/parser'
import { serializeModel } from '@/core/dsl/serializer'
import { isTauri, minimizeWindow, toggleMaximizeWindow, closeWindow } from '@/services/tauri'
import { demoGraphs } from '@/demos/catalog'
import appIcon from '../../../icon.png'

type ViewMode = 'split' | 'code' | 'graph'

const APP_VERSION = __APP_VERSION__
const TAURI = isTauri()
const ExportDialog = lazy(() => import('@/features/model-import-export/ExportDialog').then(module => ({ default: module.ExportDialog })))

export function Titlebar({ layoutFlags }: { layoutFlags?: { explorerOpen: boolean; propsOpen: boolean } }) {
  const isDirty = useModelStore(s => s.isDirty)
  const fileName = useModelStore(s => s.fileName)
  const theme = useModelStore(s => s.theme)
  const toggleTheme = useModelStore(s => s.toggleTheme)
  const newModel = useModelStore(s => s.newModel)
  const loadModel = useModelStore(s => s.loadModel)
  const setFileName = useModelStore(s => s.setFileName)
  const setFilePath = useModelStore(s => s.setFilePath)
  const setDirty = useModelStore(s => s.setDirty)
  const undo = useModelStore(s => s.undo)
  const redo = useModelStore(s => s.redo)
  const canUndo = useModelStore(s => s.past.length > 0)
  const canRedo = useModelStore(s => s.future.length > 0)

  const [showExport, setShowExport] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const v = localStorage.getItem('gms:viewmode')
      if (v === 'split' || v === 'code' || v === 'graph') return v
    } catch { /* ignore */ }
    return 'split'
  })

  const updateViewMode = (mode: ViewMode) => {
    setViewMode(mode)
    try { localStorage.setItem('gms:viewmode', mode) } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('gms:viewmode', { detail: mode }))
  }

  const handleSave = useCallback(async () => {
    const provider = getStorageProvider()
    const state = useModelStore.getState()
    const dsl = serializeModel(state.model)
    const current = state.fileName
    const suggested = current ?? `${state.model.metadata.title.replace(/\s+/g, '-').toLowerCase() || 'model'}.gmc`
    // untitled → always prompt with the native file browser (like exporting a .gmc)
    const saved = current
      ? await provider.save(dsl, suggested)
      : await provider.saveAs(dsl, suggested)
    if (saved) {
      state.setFileName(saved)
      setDirty(false)
    }
  }, [setDirty])

  useEffect(() => {
    const onSave = (e: Event) => { e.preventDefault?.(); handleSave() }
    window.addEventListener('gms:save', onSave)
    return () => window.removeEventListener('gms:save', onSave)
  }, [handleSave])

  const handleOpen = async () => {
    const provider = getStorageProvider()
    const result = await provider.open()
    if (!result) return
    const { content, name, path } = result
    setFileName(name)
    setFilePath(path ?? null)
    if (name.endsWith('.json')) {
      try { loadModel(JSON.parse(content)) } catch { alert('Invalid JSON model file') }
    } else {
      const r = parseDsl(content)
      if (r.model) loadModel(r.model, content)
      else alert('Failed to parse model file')
    }
  }

  const handleNew = () => {
    if (isDirty && !confirm('Discard unsaved changes?')) return
    newModel()
    setFileName(null)
    setFilePath(null)
  }

  const handleDemo = (demoId: string) => {
    if (!demoId) return
    if (isDirty && !confirm('Discard unsaved changes and open the demo?')) return
    const demo = demoGraphs.find(item => item.id === demoId)
    if (!demo) return
    const result = parseDsl(demo.source)
    if (!result.model) {
      alert(`Failed to parse the ${demo.title} demo`)
      return
    }
    loadModel(result.model, demo.source)
    // A demo is a template, not an opened file: Save must prompt for a new path.
    setFileName(null)
    setFilePath(null)
  }

  return (
    <header
      data-tauri-drag-region
      className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-1)] px-2.5 shadow-[var(--shadow-sm)]"
    >
      <Button
        size="icon" variant="ghost" title="Toggle explorer"
        onClick={() => window.dispatchEvent(new CustomEvent('gms:toggle-explorer'))}
        className={layoutFlags && !layoutFlags.explorerOpen ? 'text-[var(--fg-subtle)]' : 'bg-[var(--accent-soft)] text-[var(--accent)]'}
      ><span className="text-base leading-none">▥</span></Button>

      <div data-tauri-drag-region className="flex min-w-0 items-center gap-2.5 pr-1">
        <img src={appIcon} alt="" className="h-7 w-7 shrink-0 rounded-lg object-contain shadow-sm" draggable={false} />
        <div data-tauri-drag-region className="flex min-w-0 flex-col leading-none">
          <span className="whitespace-nowrap text-[12px] font-bold tracking-tight text-[var(--fg)]">Graph Model Studio</span>
          <span className="mt-1 text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--fg-subtle)]">Visual modeling · v{APP_VERSION}</span>
        </div>
      </div>

      <div className="mx-0.5 h-6 w-px bg-[var(--border)]" />

      <nav className="flex items-center gap-0.5 rounded-lg bg-[var(--surface-2)] p-0.5" aria-label="File actions">
        <Button size="sm" variant="ghost" onClick={handleNew}>New</Button>
        <Button size="sm" variant="ghost" onClick={handleOpen}>Open</Button>
        <select
          aria-label="Open a demo graph"
          defaultValue=""
          onChange={event => {
            handleDemo(event.currentTarget.value)
            event.currentTarget.value = ''
          }}
          className="h-7 max-w-[104px] cursor-pointer rounded-md border-0 bg-transparent px-1.5 text-[11px] font-medium text-[var(--fg-muted)] outline-none hover:bg-[var(--surface-raised)] hover:text-[var(--fg)] focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          title="Open a built-in demo graph"
        >
          <option value="">Demos</option>
          {demoGraphs.map(demo => (
            <option key={demo.id} value={demo.id} title={demo.description}>{demo.title}</option>
          ))}
        </select>
        <Button size="sm" variant={isDirty ? 'default' : 'ghost'} onClick={handleSave} title="Save (Ctrl/Cmd+S)">Save</Button>
        <Button size="sm" variant="ghost" onClick={() => setShowExport(true)}>Export</Button>
      </nav>

      <div className="flex items-center gap-0.5">
        <Button size="icon" variant="ghost" onClick={undo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)">↶</Button>
        <Button size="icon" variant="ghost" onClick={redo} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)">↷</Button>
      </div>

      <div className="flex gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-0.5 shadow-inner" aria-label="Workspace view">
        {(['split', 'code', 'graph'] as const).map(m => (
          <button
            key={m}
            onClick={() => updateViewMode(m)}
            aria-pressed={viewMode === m}
            className={`h-7 rounded-md px-2.5 text-[11px] font-medium capitalize transition-all ${
              viewMode === m ? 'bg-[var(--surface-raised)] text-[var(--accent)] shadow-[var(--shadow-sm)]' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="ml-auto flex min-w-0 items-center gap-1.5">
        <span
          className="flex h-7 min-w-0 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 text-[11px] text-[var(--fg-muted)]"
          title={isDirty ? 'Unsaved changes' : 'All changes saved'}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: isDirty ? 'var(--warning)' : 'var(--success)', boxShadow: `0 0 0 3px ${isDirty ? 'color-mix(in srgb, var(--warning) 14%, transparent)' : 'color-mix(in srgb, var(--success) 14%, transparent)'}` }}
          />
          <span className="max-w-[130px] truncate font-medium">{fileName ?? 'Untitled'}</span>
        </span>
        <Button size="icon" variant="ghost" onClick={toggleTheme} title="Toggle theme">
          <span className="text-base">{theme === 'dark' ? '☀' : '☾'}</span>
        </Button>
        <Button
          size="icon" variant="ghost" title="Toggle properties"
          onClick={() => window.dispatchEvent(new CustomEvent('gms:toggle-props'))}
          className={layoutFlags && !layoutFlags.propsOpen ? 'text-[var(--fg-subtle)]' : 'bg-[var(--accent-soft)] text-[var(--accent)]'}
        ><span className="text-base leading-none">▤</span></Button>

        {TAURI && (
          <>
            <div className="mx-1 h-6 w-px bg-[var(--border)]" />
            <div className="flex items-center">
              <button
                onClick={() => minimizeWindow()}
                title="Minimize"
                className="flex h-7 w-9 items-center justify-center rounded text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface-2)]"
              >─</button>
              <button
                onClick={() => toggleMaximizeWindow()}
                title="Maximize"
                className="flex h-7 w-9 items-center justify-center rounded text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface-2)]"
              >▢</button>
              <button
                onClick={() => closeWindow()}
                title="Close"
                className="flex h-7 w-9 items-center justify-center rounded text-[var(--fg-muted)] transition-colors hover:bg-red-600 hover:text-white"
              >✕</button>
            </div>
          </>
        )}
      </div>

      {showExport && <Suspense fallback={null}><ExportDialog onClose={() => setShowExport(false)} /></Suspense>}
    </header>
  )
}
