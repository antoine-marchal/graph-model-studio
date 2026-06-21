import { useModelStore } from '@/store'

export function StatusBar() {
  const model = useModelStore(s => s.model)
  const parseError = useModelStore(s => s.parseError)
  const diagnostics = useModelStore(s => s.diagnostics)
  const activeViewId = useModelStore(s => s.activeViewId)
  const selCount = useModelStore(s => s.selectedElementIds.length)

  const errors = diagnostics.filter(d => d.severity === 'error').length
  const warnings = diagnostics.filter(d => d.severity === 'warning').length

  return (
    <footer className="flex h-6 shrink-0 items-center gap-4 border-t border-[var(--border)] bg-[var(--surface-1)] px-3 text-[11px] text-[var(--fg-subtle)]">
      <span>{Object.keys(model.elements).length} elements</span>
      <span>{Object.keys(model.relations).length} relations</span>
      <span>{Object.keys(model.views).length} views</span>
      {activeViewId && <span>view: {model.views[activeViewId]?.name}</span>}
      {selCount > 0 && <span className="text-[var(--accent)]">{selCount} selected</span>}
      <span className="ml-auto">
        {parseError ? (
          <span className="text-red-500">⚠ {errors} error{errors !== 1 ? 's' : ''}</span>
        ) : warnings > 0 ? (
          <span className="text-amber-500">⚠ {warnings} warning{warnings !== 1 ? 's' : ''}</span>
        ) : (
          <span className="text-emerald-500">✓ Valid</span>
        )}
      </span>
    </footer>
  )
}
