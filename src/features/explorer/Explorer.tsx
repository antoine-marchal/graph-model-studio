import { useState } from 'react'
import { useModelStore } from '@/store'
import { cn } from '@/ui/primitives/cn'
import { notationRegistry } from '@/core/notation'
import { NodeIcon } from '@/features/editor-graph/nodes/NodeIcons'
import { getVisibleElementIds, isRelationIncluded } from '@/core/model/view-visibility'

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 pb-1.5 pt-3">
      <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-[var(--fg-subtle)]">{title}</span>
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

/** A small tri-state-free visibility checkbox. */
function VisCheckbox({ checked, onToggle, title }: { checked: boolean; onToggle: () => void; title: string }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onToggle() }}
      title={title}
      className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[9px] leading-none transition-all',
        checked
          ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)] shadow-sm'
          : 'border-[var(--border-strong)] bg-[var(--surface-1)] text-transparent hover:border-[var(--accent)]',
      )}
    >
      ✓
    </button>
  )
}

const ELEMENT_MIME = 'application/gms-element-ids'
const RELATION_MIME = 'application/gms-relation-ids'

export function Explorer() {
  const model = useModelStore(s => s.model)
  const activeViewId = useModelStore(s => s.activeViewId)
  const selectedElementIds = useModelStore(s => s.selectedElementIds)
  const selectedRelationId = useModelStore(s => s.selectedRelationId)
  const setActiveView = useModelStore(s => s.setActiveView)
  const selectElement = useModelStore(s => s.selectElement)
  const selectRelation = useModelStore(s => s.selectRelation)
  const requestHighlight = useModelStore(s => s.requestHighlight)
  const requestFocusProperties = useModelStore(s => s.requestFocusProperties)
  const createView = useModelStore(s => s.createView)
  const deleteView = useModelStore(s => s.deleteView)
  const addElementsToView = useModelStore(s => s.addElementsToView)
  const addRelationsToView = useModelStore(s => s.addRelationsToView)
  const toggleElementInView = useModelStore(s => s.toggleElementInView)
  const toggleRelationInView = useModelStore(s => s.toggleRelationInView)

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dragOverView, setDragOverView] = useState<string | null>(null)

  const onElementDragStart = (e: React.DragEvent, id: string) => {
    const ids = selectedElementIds.includes(id) && selectedElementIds.length > 1 ? selectedElementIds : [id]
    e.dataTransfer.setData(ELEMENT_MIME, JSON.stringify(ids))
    e.dataTransfer.effectAllowed = 'copy'
  }
  const onRelationDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData(RELATION_MIME, JSON.stringify([id]))
    e.dataTransfer.effectAllowed = 'copy'
  }
  const onViewDrop = (e: React.DragEvent, viewId: string) => {
    e.preventDefault()
    setDragOverView(null)
    const rawEl = e.dataTransfer.getData(ELEMENT_MIME)
    const rawRel = e.dataTransfer.getData(RELATION_MIME)
    try {
      if (rawEl) addElementsToView(viewId, JSON.parse(rawEl) as string[])
      if (rawRel) addRelationsToView(viewId, JSON.parse(rawRel) as string[])
      if (rawEl || rawRel) setActiveView(viewId)
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
  const visibleEls = activeView ? getVisibleElementIds(model, activeView) : null
  const rootElements = Object.values(model.elements).filter(e => !e.parentId)
  const relations = Object.values(model.relations)

  function ElementRow({ id, depth }: { id: string; depth: number }) {
    const el = model.elements[id]
    if (!el) return null
    const kids = el.children.filter(c => model.elements[c])
    const isContainer = kids.length > 0
    const isCollapsed = collapsed.has(id)
    const selected = selectedElementIds.includes(id)
    const visible = !visibleEls || visibleEls.has(id)
    return (
      <div>
        <div
          className={cn(
            'group mx-1 flex w-[calc(100%-8px)] items-center gap-1 rounded-md py-1.5 pr-2 text-xs transition-colors hover:bg-[var(--surface-2)]',
            selected ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]' : 'text-[var(--fg-muted)]',
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
          {activeView && (
            <VisCheckbox
              checked={visible}
              onToggle={() => toggleElementInView(activeView.id, id)}
              title={visible ? 'Hide in this view' : 'Show in this view'}
            />
          )}
          <button
            draggable
            onDragStart={e => onElementDragStart(e, id)}
            onClick={() => selectElement(id)}
            onDoubleClick={() => { selectElement(id); requestHighlight('element', id, { focus: true }); requestFocusProperties() }}
            title="Drag onto a view to include it there"
            className={cn('flex min-w-0 flex-1 cursor-grab items-center gap-1.5 text-left active:cursor-grabbing', !visible && 'opacity-45')}
          >
            <TypeSwatch type={el.type} />
            <span className="truncate">{el.name}</span>
            <span className="ml-auto shrink-0 text-[10px] text-[var(--fg-subtle)] opacity-0 group-hover:opacity-100">{el.type}</span>
          </button>
        </div>
        {isContainer && !isCollapsed && kids.map(c => <ElementRow key={c} id={c} depth={depth + 1} />)}
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[var(--surface-1)]">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--border)] px-3">
        <span className="grid h-5 w-5 place-items-center rounded-md bg-[var(--accent-soft)] text-[11px] text-[var(--accent)]">⌘</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--fg-muted)]">Explorer</span>
      </div>

      <SectionHeader
        title="Views"
        action={
          <button onClick={() => createView()} title="Add view" className="grid h-5 w-5 place-items-center rounded-md bg-[var(--surface-2)] text-sm leading-none text-[var(--fg-muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]">＋</button>
        }
      />
      {views.map(v => (
        <div
          key={v.id}
          onDragOver={e => { if (e.dataTransfer.types.includes(ELEMENT_MIME) || e.dataTransfer.types.includes(RELATION_MIME)) { e.preventDefault(); setDragOverView(v.id) } }}
          onDragLeave={() => setDragOverView(c => (c === v.id ? null : c))}
          onDrop={e => onViewDrop(e, v.id)}
          className={cn(
            'group mx-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-[var(--surface-2)]',
            dragOverView === v.id && 'outline-dashed outline-1 outline-[var(--accent)] bg-[var(--accent)]/10',
            v.id === activeViewId ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent)]' : 'text-[var(--fg-muted)]',
          )}
        >
          <button onClick={() => setActiveView(v.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
            <span className="text-[var(--fg-subtle)]">◈</span><span className="truncate">{v.name}</span>
          </button>
          {views.length > 1 && (
            <button onClick={() => deleteView(v.id)} title="Delete view" className="shrink-0 px-1 text-[var(--fg-subtle)] opacity-0 hover:text-red-500 group-hover:opacity-100">✕</button>
          )}
        </div>
      ))}
      <p className="mx-2 mt-1.5 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-[9px] leading-relaxed text-[var(--fg-subtle)]"><span className="font-semibold text-[var(--fg-muted)]">Tip</span> · Drag items onto a view, or use the checkboxes to control visibility.</p>

      <div className="mx-3 mt-2 border-t border-[var(--border)]" />
      <SectionHeader title={`Elements (${Object.keys(model.elements).length})`} />
      {rootElements.length === 0 && <p className="px-3 py-1 text-xs text-[var(--fg-subtle)]">No elements</p>}
      {rootElements.map(el => <ElementRow key={el.id} id={el.id} depth={0} />)}

      <div className="mx-3 mt-2 border-t border-[var(--border)]" />
      <SectionHeader title={`Relations (${relations.length})`} />
      {relations.length === 0 && <p className="px-3 py-1 text-xs text-[var(--fg-subtle)]">No relations</p>}
      {relations.map(rel => {
        const shown = !activeView || (isRelationIncluded(activeView, rel.sourceId, rel.targetId)
          && (!visibleEls || (visibleEls.has(rel.sourceId) && visibleEls.has(rel.targetId))))
        const endpointsVisible = !visibleEls || (visibleEls.has(rel.sourceId) && visibleEls.has(rel.targetId))
        const selected = selectedRelationId === rel.id
        return (
          <div
            key={rel.id}
            className={cn(
              'group mx-1 flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] transition-colors hover:bg-[var(--surface-2)]',
              selected ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]' : 'text-[var(--fg-subtle)]',
            )}
          >
            {activeView && (
              <VisCheckbox
                checked={shown}
                onToggle={() => toggleRelationInView(activeView.id, rel.id)}
                title={endpointsVisible ? (shown ? 'Hide in this view' : 'Show in this view') : 'Both endpoints must be visible'}
              />
            )}
            <button
              draggable
              onDragStart={e => onRelationDragStart(e, rel.id)}
              onClick={() => selectRelation(rel.id)}
              onDoubleClick={() => { selectRelation(rel.id); requestHighlight('relation', rel.id, { focus: true }); requestFocusProperties() }}
              title="Drag onto a view to include it there"
              className={cn('flex min-w-0 flex-1 cursor-grab items-center gap-1 text-left active:cursor-grabbing', !shown && 'opacity-45')}
            >
              <span className="truncate">{model.elements[rel.sourceId]?.name ?? rel.sourceId}</span>
              <span>→</span>
              <span className="truncate">{model.elements[rel.targetId]?.name ?? rel.targetId}</span>
              {rel.label && <span className="ml-auto shrink-0 truncate text-[10px] text-[var(--fg-subtle)] opacity-0 group-hover:opacity-100">{rel.label}</span>}
            </button>
          </div>
        )
      })}
      <div className="h-4" />
    </div>
  )
}
