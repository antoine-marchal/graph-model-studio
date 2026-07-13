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
    <footer className="relative z-20 flex h-7 shrink-0 items-center gap-3 border-t border-[var(--border)] bg-[var(--surface-1)] px-3 text-[10px] font-medium text-[var(--fg-subtle)] shadow-[0_-1px_4px_rgba(0,0,0,0.025)]">
      <span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-indigo-400" />{Object.keys(model.elements).length} elements</span>
      <span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-sky-400" />{Object.keys(model.relations).length} relations</span>
      <span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-violet-400" />{Object.keys(model.views).length} views</span>
      {activeViewId && <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5">View · {model.views[activeViewId]?.name}</span>}
      {selCount > 0 && <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-[var(--accent)]">{selCount} selected</span>}
      <span className="ml-auto font-semibold">
        {parseError ? (
          <span className="text-[var(--danger)]">● {errors} error{errors !== 1 ? 's' : ''}</span>
        ) : warnings > 0 ? (
          <span className="text-[var(--warning)]">● {warnings} warning{warnings !== 1 ? 's' : ''}</span>
        ) : (
          <span className="flex items-center gap-1.5 text-[var(--success)]"><i className="h-1.5 w-1.5 rounded-full bg-current" />Model valid</span>
        )}
      </span>
    </footer>
  )
}
