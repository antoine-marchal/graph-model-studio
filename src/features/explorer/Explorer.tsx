import { useState } from 'react'
import { useModelStore } from '@/store'
import { cn } from '@/ui/primitives/cn'
import { notationRegistry } from '@/core/notation'
import { NodeIcon } from '@/features/editor-graph/nodes/NodeIcons'

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 pb-1 pt-2.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--fg-subtle)]">{title}</span>
      {action}
    </div>
  )
}

function TypeSwatch({ type }: { type: string }) {
  const def = notationRegistry.getElementDef(type)
  if (!def) return <span className="h-3.5 w-3.5 shrink-0 rounded-sm bg-[var(--surface-3)]" />
  return (
    <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm" style={{ background: def.fill, border: `1px solid ${def.stroke}` }}>
      {def.icon !== 'none' && <NodeIcon kind={def.icon} color={def.accent} size={9} />}
    </span>
  )
}

const ELEMENT_MIME = 'application/gms-element-ids'

export function Explorer() {
  const model = useModelStore(s => s.model)
  const activeViewId = useModelStore(s => s.activeViewId)
  const selectedElementIds = useModelStore(s => s.selectedElementIds)
  const setActiveView = useModelStore(s => s.setActiveView)
  const selectElement = useModelStore(s => s.selectElement)
  const requestHighlight = useModelStore(s => s.requestHighlight)
  const requestFocusProperties = useModelStore(s => s.requestFocusProperties)
  const createView = useModelStore(s => s.createView)
  const deleteView = useModelStore(s => s.deleteView)
  const addElementsToView = useModelStore(s => s.addElementsToView)
  const removeElementFromView = useModelStore(s => s.removeElementFromView)

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dragOverView, setDragOverView] = useState<string | null>(null)

  const onElementDragStart = (e: React.DragEvent, id: string) => {
    const ids = selectedElementIds.includes(id) && selectedElementIds.length > 1 ? selectedElementIds : [id]
    e.dataTransfer.setData(ELEMENT_MIME, JSON.stringify(ids))
    e.dataTransfer.effectAllowed = 'copy'
  }
  const onViewDrop = (e: React.DragEvent, viewId: string) => {
    e.preventDefault()
    setDragOverView(null)
    const raw = e.dataTransfer.getData(ELEMENT_MIME)
    if (!raw) return
    try {
      const ids = JSON.parse(raw) as string[]
      addElementsToView(viewId, ids)
      setActiveView(viewId)
    } catch { /* ignore */ }
  }
  const toggle = (id: string) =>
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const views = Object.values(model.views)
  const activeView = activeViewId ? model.views[activeViewId] : undefined
  const isCustomActive = !!activeView && !activeView.includeAll
  const rootElements = Object.values(model.elements).filter(e => !e.parentId)
  const relations = Object.values(model.relations)

  function ElementRow({ id, depth }: { id: string; depth: number }) {
    const el = model.elements[id]
    if (!el) return null
    const kids = el.children.filter(c => model.elements[c])
    const isContainer = kids.length > 0
    const isCollapsed = collapsed.has(id)
    const selected = selectedElementIds.includes(id)
    return (
      <div>
        <div
          className={cn(
            'group flex w-full items-center gap-1 py-1 pr-2 text-xs transition-colors hover:bg-[var(--surface-2)]',
            selected ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'text-[var(--fg-muted)]',
          )}
          style={{ paddingLeft: 6 + depth * 12 }}
        >
          {isContainer ? (
            <button onClick={() => toggle(id)} className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[var(--fg-subtle)] hover:text-[var(--fg)]">
              {isCollapsed ? '▸' : '▾'}
            </button>
          ) : (
            <span className="h-3.5 w-3.5 shrink-0" />
          )}
          <button
            draggable
            onDragStart={e => onElementDragStart(e, id)}
            onClick={() => selectElement(id)}
            onDoubleClick={() => { selectElement(id); requestHighlight('element', id, { focus: true }); requestFocusProperties() }}
            title="Drag onto a view to include it there"
            className="flex min-w-0 flex-1 cursor-grab items-center gap-1.5 text-left active:cursor-grabbing"
          >
            <TypeSwatch type={el.type} />
            <span className="truncate">{el.name}</span>
            <span className="ml-auto shrink-0 text-[10px] text-[var(--fg-subtle)] opacity-0 group-hover:opacity-100">{el.type}</span>
          </button>
          {isCustomActive && activeView!.includedElements.includes(id) && (
            <button
              onClick={() => removeElementFromView(activeView!.id, id)}
              title="Remove from current view"
              className="shrink-0 px-1 text-[var(--fg-subtle)] opacity-0 hover:text-red-500 group-hover:opacity-100"
            >−</button>
          )}
        </div>
        {isContainer && !isCollapsed && kids.map(c => <ElementRow key={c} id={c} depth={depth + 1} />)}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-[var(--border)] px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]">Explorer</span>
      </div>

      <SectionHeader
        title={`Views (${views.length})`}
        action={
          <button onClick={() => createView()} title="Add view" className="rounded px-1 text-sm leading-none text-[var(--fg-subtle)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]">＋</button>
        }
      />
      {views.map(v => {
        const scope = v.includeAll ? 'all' : `${v.includedElements.length}`
        return (
          <div
            key={v.id}
            onDragOver={e => { if (e.dataTransfer.types.includes(ELEMENT_MIME)) { e.preventDefault(); setDragOverView(v.id) } }}
            onDragLeave={() => setDragOverView(c => (c === v.id ? null : c))}
            onDrop={e => onViewDrop(e, v.id)}
            className={cn(
              'group flex items-center gap-1.5 px-3 py-1 text-xs transition-colors hover:bg-[var(--surface-2)]',
              dragOverView === v.id && 'outline-dashed outline-1 outline-[var(--accent)] bg-[var(--accent)]/10',
              v.id === activeViewId ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'text-[var(--fg-muted)]',
            )}
          >
            <button onClick={() => setActiveView(v.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
              <span className="text-[var(--fg-subtle)]">◈</span><span className="truncate">{v.name}</span>
              <span className="ml-auto shrink-0 rounded bg-[var(--surface-3)] px-1 text-[9px] text-[var(--fg-subtle)]" title={v.includeAll ? 'Includes all elements' : `${v.includedElements.length} included element(s)`}>{scope}</span>
            </button>
            {views.length > 1 && (
              <button onClick={() => deleteView(v.id)} title="Delete view" className="shrink-0 px-1 text-[var(--fg-subtle)] opacity-0 hover:text-red-500 group-hover:opacity-100">✕</button>
            )}
          </div>
        )
      })}
      <p className="px-3 py-1 text-[10px] text-[var(--fg-subtle)]">Tip: drag elements onto a view to include them.</p>

      <div className="my-1 border-t border-[var(--border)]" />
      <SectionHeader title={`Elements (${Object.keys(model.elements).length})`} />
      {rootElements.length === 0 && <p className="px-3 py-1 text-xs text-[var(--fg-subtle)]">No elements</p>}
      {rootElements.map(el => <ElementRow key={el.id} id={el.id} depth={0} />)}

      <div className="my-1 border-t border-[var(--border)]" />
      <SectionHeader title={`Relations (${relations.length})`} />
      {relations.length === 0 && <p className="px-3 py-1 text-xs text-[var(--fg-subtle)]">No relations</p>}
      {relations.map(rel => (
        <div key={rel.id} className="flex items-center gap-1 px-3 py-1 text-[11px] text-[var(--fg-subtle)]">
          <span className="truncate">{model.elements[rel.sourceId]?.name ?? rel.sourceId}</span>
          <span>→</span>
          <span className="truncate">{model.elements[rel.targetId]?.name ?? rel.targetId}</span>
        </div>
      ))}
      <div className="h-4" />
    </div>
  )
}
