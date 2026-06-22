import { useState, useEffect, useCallback } from 'react'
import { useModelStore } from '@/store'
import { Button } from '@/ui/components/Button'
import { getStorageProvider } from '@/services/storage'
import { parseDsl } from '@/core/dsl/parser'
import { serializeModel } from '@/core/dsl/serializer'
import { ExportDialog } from '@/features/model-import-export/ExportDialog'
import { isTauri, minimizeWindow, toggleMaximizeWindow, closeWindow } from '@/services/tauri'

type ViewMode = 'split' | 'code' | 'graph'

const APP_VERSION = __APP_VERSION__
const TAURI = isTauri()

export function Titlebar({ layoutFlags }: { layoutFlags?: { explorerOpen: boolean; propsOpen: boolean } }) {
  const isDirty = useModelStore(s => s.isDirty)
  const fileName = useModelStore(s => s.fileName)
  const theme = useModelStore(s => s.theme)
  const toggleTheme = useModelStore(s => s.toggleTheme)
  const newModel = useModelStore(s => s.newModel)
  const loadModel = useModelStore(s => s.loadModel)
  const setFileName = useModelStore(s => s.setFileName)
  const setDirty = useModelStore(s => s.setDirty)
  const undo = useModelStore(s => s.undo)
  const redo = useModelStore(s => s.redo)
  const canUndo = useModelStore(s => s.past.length > 0)
  const canRedo = useModelStore(s => s.future.length > 0)

  const [showExport, setShowExport] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('split')

  const updateViewMode = (mode: ViewMode) => {
    setViewMode(mode)
    window.dispatchEvent(new CustomEvent('gms:viewmode', { detail: mode }))
  }

  const handleSave = useCallback(async () => {
    const provider = getStorageProvider()
    const dsl = serializeModel(useModelStore.getState().model)
    const name = useModelStore.getState().fileName
      ?? `${useModelStore.getState().model.metadata.title.replace(/\s+/g, '-').toLowerCase()}.gmc`
    const ok = await provider.save(dsl, name)
    if (ok) setDirty(false)
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
    const { content, name } = result
    setFileName(name)
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
  }

  return (
    <header
      data-tauri-drag-region
      className="flex h-10 shrink-0 items-center gap-1.5 border-b border-[var(--border)] bg-[var(--surface-1)] px-3"
    >
      <Button
        size="icon" variant="ghost" title="Toggle explorer"
        onClick={() => window.dispatchEvent(new CustomEvent('gms:toggle-explorer'))}
        className={layoutFlags && !layoutFlags.explorerOpen ? 'text-[var(--fg-subtle)]' : 'text-[var(--accent)]'}
      >▥</Button>

      <div data-tauri-drag-region className="flex min-w-0 items-center gap-2">
        <span className="text-sm font-bold text-[var(--accent)]">Graph Model Studio</span>
        <span className="text-xs text-[var(--fg-subtle)]">v{APP_VERSION}</span>
      </div>

      <div className="mx-1.5 h-4 w-px bg-[var(--border)]" />

      <Button size="sm" variant="ghost" onClick={handleNew}>New</Button>
      <Button size="sm" variant="ghost" onClick={handleOpen}>Open</Button>
      <Button size="sm" variant="ghost" onClick={handleSave} title="Ctrl/Cmd+S">Save{isDirty ? ' •' : ''}</Button>
      <Button size="sm" variant="ghost" onClick={() => setShowExport(true)}>Export</Button>

      <div className="mx-1.5 h-4 w-px bg-[var(--border)]" />

      <Button size="icon" variant="ghost" onClick={undo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)">↶</Button>
      <Button size="icon" variant="ghost" onClick={redo} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)">↷</Button>

      <div className="mx-1.5 h-4 w-px bg-[var(--border)]" />

      <div className="flex gap-0.5 rounded border border-[var(--border)] p-0.5">
        {(['split', 'code', 'graph'] as const).map(m => (
          <button
            key={m}
            onClick={() => updateViewMode(m)}
            className={`rounded px-2 py-0.5 text-xs capitalize transition-colors ${
              viewMode === m ? 'bg-[var(--accent)] text-[var(--accent-fg)]' : 'text-[var(--fg-muted)] hover:bg-[var(--surface-2)]'
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="truncate text-xs text-[var(--fg-subtle)]">
          {fileName ?? 'unsaved'}{isDirty && <span className="text-amber-500"> ●</span>}
        </span>
        <Button size="icon" variant="ghost" onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? '☀' : '☾'}
        </Button>
        <Button
          size="icon" variant="ghost" title="Toggle properties"
          onClick={() => window.dispatchEvent(new CustomEvent('gms:toggle-props'))}
          className={layoutFlags && !layoutFlags.propsOpen ? 'text-[var(--fg-subtle)]' : 'text-[var(--accent)]'}
        >▤</Button>

        {TAURI && (
          <>
            <div className="mx-1 h-4 w-px bg-[var(--border)]" />
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

      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
    </header>
  )
}
