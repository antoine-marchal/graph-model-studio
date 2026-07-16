import { GraphEditor } from '@/features/editor-graph/GraphEditor'
import { useModelStore } from '@/store'
import type { ReactNode } from 'react'

/** The exact graph pane shared by the desktop app and the VS Code extension. */
export function GraphPanel({ headerActions }: { headerActions?: ReactNode } = {}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <PanelHeader label="Graph">
        <ViewTabs />
        {headerActions && <div className="ml-auto flex items-center gap-1">{headerActions}</div>}
      </PanelHeader>
      <div className="flex-1 overflow-hidden"><GraphEditor /></div>
    </div>
  )
}

function PanelHeader({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-1)] px-3">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_0_3px_var(--accent-soft)]" />
      <span className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--fg-muted)]">{label}</span>
      {children}
    </div>
  )
}

function ViewTabs() {
  const model = useModelStore(state => state.model)
  const activeViewId = useModelStore(state => state.activeViewId)
  const setActiveView = useModelStore(state => state.setActiveView)
  const views = Object.values(model.views)
  if (views.length <= 1) return null
  return (
    <div className="ml-2 flex gap-0.5 rounded-md bg-[var(--surface-2)] p-0.5">
      {views.map(view => (
        <button
          key={view.id}
          onClick={() => setActiveView(view.id)}
          className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
            view.id === activeViewId
              ? 'bg-[var(--surface-raised)] text-[var(--accent)] shadow-[var(--shadow-sm)]'
              : 'text-[var(--fg-subtle)] hover:text-[var(--fg)]'
          }`}
        >
          {view.name}
        </button>
      ))}
    </div>
  )
}
