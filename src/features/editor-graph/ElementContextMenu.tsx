import { useEffect, useRef, useState } from 'react'
import { useModelStore } from '@/store'
import { notationRegistry, ACCENT_PALETTE } from '@/core/notation'
import { createElementId } from '@/core/model'
import { NodeTypePicker } from './NodeTypePicker'
import { supportsTransparentBackground } from './node-appearance'
import { getNodeRects } from './node-geometry'
import {
  copyElementFormat,
  copyRelationFormat,
  pasteElementFormatCommand,
  hasElementFormat,
  hasRelationFormat,
  relationFormatFor,
} from './style-clipboard'

export type ElementMenuState =
  | { kind: 'elements'; x: number; y: number; ids: string[] }
  | { kind: 'relation'; x: number; y: number; id: string; ids?: string[] }

/** Wrap `ids` in a new container of `type` and select it. */
export function groupElements(ids: string[], type: string) {
  const { model, activeViewId, dispatch, pushRecentType, selectElements } = useModelStore.getState()
  const viewId = activeViewId ?? Object.keys(model.views)[0]
  const def = notationRegistry.getElementDef(type)
  let id = createElementId(type)
  while (model.elements[id]) id = createElementId(type)
  const parents = ids.map(member => model.elements[member]?.parentId).filter((p): p is string => !!p)
  dispatch({
    type: 'GROUP_ELEMENTS',
    payload: {
      viewId, id, type, memberIds: ids,
      name: def?.label ?? 'Group',
      notation: def?.notation ?? 'generic',
      rects: getNodeRects([...ids, ...parents]),
    },
  })
  pushRecentType(type)
  selectElements([id])
}

const item = 'flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-[var(--fg)] hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:hover:bg-transparent'
const chip = (active: boolean) =>
  `h-6 min-w-6 rounded border px-1 text-[10px] font-semibold ${active ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]' : 'border-[var(--border)] text-[var(--fg-muted)] hover:border-[var(--border-strong)]'}`
const Sep = () => <div className="my-1 h-px bg-[var(--border)]" />
const Caption = ({ children }: { children: React.ReactNode }) => (
  <div className="px-2 pb-0.5 pt-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--fg-subtle)]">{children}</div>
)

function Swatches({ value, onPick, onClear }: { value?: string; onPick: (color: string) => void; onClear: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1 px-2 py-1">
      {ACCENT_PALETTE.map(color => (
        <button key={color} type="button" title={color} aria-label={`Accent ${color}`} onClick={() => onPick(color)}
          className="h-4 w-4 rounded-sm border transition-transform hover:scale-110"
          style={{ background: color, borderColor: value === color ? 'var(--fg)' : 'transparent' }} />
      ))}
      <button type="button" title="Clear colors" onClick={onClear} className="ml-auto text-[10px] text-[var(--fg-subtle)] hover:text-[var(--fg)]">✕</button>
    </div>
  )
}

const SIDES = [['', 'A'], ['t', '↑'], ['b', '↓'], ['l', '←'], ['r', '→']] as const

/** Compact right-click menu mirroring the Inspector actions for nodes and relations. */
export function ElementContextMenu({ state, onClose, onDuplicate }: {
  state: ElementMenuState
  onClose: () => void
  onDuplicate: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [picker, setPicker] = useState<'type' | 'group' | null>(null)
  const model = useModelStore(s => s.model)
  const activeViewId = useModelStore(s => s.activeViewId)
  const dispatch = useModelStore(s => s.dispatch)

  useEffect(() => {
    // capture phase: React Flow's node drag stops the event from bubbling
    const onDown = (e: MouseEvent) => {
      if (!ref.current || ref.current.contains(e.target as Node)) return
      // flush a pending multiplicity field (unmounting skips its blur)
      if (ref.current.contains(document.activeElement)) (document.activeElement as HTMLElement).blur()
      onClose()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('keydown', onKey) }
  }, [onClose])

  const run = (action: () => void) => () => { action(); onClose() }
  let body: React.ReactNode = null

  if (state.kind === 'relation') {
    const relation = model.relations[state.id]
    if (!relation) return null
    const setProp = (key: string, value: string) => {
      const properties = { ...relation.properties }
      if (value) properties[key] = value; else delete properties[key]
      dispatch({ type: 'UPDATE_RELATION', payload: { id: relation.id, properties } })
    }
    const anchorRow = (label: string, key: 'sourceHandle' | 'targetHandle') => (
      <div className="flex items-center gap-1 px-2 py-0.5">
        <span className="w-12 text-[10px] text-[var(--fg-muted)]">{label}</span>
        {SIDES.map(([side, glyph]) => (
          <button key={side} type="button" title={side ? `Anchor ${glyph}` : 'Auto'} className={chip((relation[key] ?? '') === side)}
            onClick={() => dispatch({ type: 'UPDATE_RELATION', payload: { id: relation.id, [key]: (side || undefined) as 't' | 'b' | 'l' | 'r' | undefined } })}>
            {glyph}
          </button>
        ))}
      </div>
    )
    body = (
      <>
        <button className={item} onClick={run(() => {
          const s = useModelStore.getState()
          s.selectRelation(relation.id)
          s.setEditingRelation(relation.id)
        })}>✎ Edit label…</button>
        <div className="flex gap-1 px-2 py-1">
          {([['directed', '→'], ['bidirectional', '↔'], ['undirected', '—']] as const).map(([direction, glyph]) => (
            <button key={direction} type="button" title={direction} className={chip(relation.direction === direction)}
              onClick={() => dispatch({ type: 'UPDATE_RELATION', payload: { id: relation.id, direction } })}>{glyph}</button>
          ))}
        </div>
        <Caption>Multiplicity</Caption>
        <div className="flex items-center gap-1 px-2 py-0.5">
          {(['sourceCard', 'targetCard'] as const).map(key => (
            <input key={`${key}:${relation.properties?.[key] ?? ''}`} defaultValue={relation.properties?.[key] ?? ''}
              placeholder={key === 'sourceCard' ? 'Source 1' : 'Target 0..*'} aria-label={key === 'sourceCard' ? 'Source multiplicity' : 'Target multiplicity'}
              onBlur={e => setProp(key, e.target.value.trim())}
              onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur() }}
              className="h-6 w-full min-w-0 rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 text-[11px] text-[var(--fg)] focus:border-[var(--accent)] focus:outline-none" />
          ))}
        </div>
        <Caption>Anchors</Caption>
        {anchorRow('Source', 'sourceHandle')}
        {anchorRow('Target', 'targetHandle')}
        <Caption>Accent</Caption>
        <Swatches value={relation.properties?.accentColor} onPick={c => setProp('accentColor', c)} onClear={() => setProp('accentColor', '')} />
        <Sep />
        <button className={item} onClick={run(() => copyRelationFormat(useModelStore.getState().model, relation.id))}>Copy style</button>
        <button className={item} disabled={!hasRelationFormat()} onClick={run(() => {
          // Every selected relation takes the style, not only the one right-clicked.
          for (const id of state.ids ?? [relation.id]) {
            const format = relationFormatFor(useModelStore.getState().model, id)
            if (format) dispatch({ type: 'APPLY_RELATION_FORMAT', payload: { id, ...format } })
          }
        })}>{state.ids && state.ids.length > 1 ? `Paste style on ${state.ids.length} relations` : 'Paste style'}</button>
        <Sep />
        <button className={`${item} !text-red-500`} onClick={run(() => dispatch({ type: 'DELETE_RELATION', payload: { id: relation.id } }))}>Delete relation</button>
      </>
    )
  } else if (state.ids.length > 1) {
    const ids = state.ids
    body = (
      <>
        <Caption>{ids.length} elements</Caption>
        <button className={item} onClick={() => setPicker('group')}>▣ Create group…</button>
        <button className={item} onClick={run(onDuplicate)}>⧉ Duplicate</button>
        <button className={item} disabled={!activeViewId || !hasElementFormat()} onClick={run(() => {
          const command = activeViewId && pasteElementFormatCommand(useModelStore.getState().model, activeViewId, ids)
          if (command) dispatch(command)
        })}>Paste style</button>
        <Sep />
        <button className={`${item} !text-red-500`} onClick={run(() => dispatch({ type: 'DELETE_ELEMENTS', payload: { ids } }))}>Delete {ids.length} elements</button>
      </>
    )
  } else {
    const element = model.elements[state.ids[0]]
    if (!element) return null
    const def = notationRegistry.getElementDef(element.type)
    const canTransparent = def
      ? supportsTransparentBackground(element.type, def.shape, element.children.length)
      : element.type === 'drawing' || element.children.length > 0
    const setProp = (key: string, value: string) => {
      const properties = { ...element.properties }
      if (value) properties[key] = value; else delete properties[key]
      dispatch({ type: 'UPDATE_ELEMENT', payload: { id: element.id, properties } })
    }
    const toggle = (key: string, label: string) => (
      <label className={`${item} cursor-pointer`}>
        <input type="checkbox" checked={element.properties?.[key] === 'true'} onChange={e => setProp(key, e.target.checked ? 'true' : '')} className="h-3 w-3 accent-[var(--accent)]" />
        {label}
      </label>
    )
    body = (
      <>
        <Caption>{def?.label ?? element.type}</Caption>
        <button className={item} onClick={run(() => {
          const s = useModelStore.getState()
          s.selectElements([element.id])
          s.setEditingElement(element.id)
        })}>✎ Rename</button>
        <button className={item} onClick={() => setPicker('type')}>◇ Change type…</button>
        <button className={item} onClick={run(onDuplicate)}>⧉ Duplicate</button>
        <Sep />
        {toggle('onTop', 'On top')}
        {canTransparent && toggle('transparentBackground', 'Transparent background')}
        <Caption>Accent</Caption>
        <Swatches value={element.properties?.accentColor} onPick={c => setProp('accentColor', c)} onClear={() => {
          const properties = { ...element.properties }
          delete properties.accentColor; delete properties.backgroundColor; delete properties.containerColor
          dispatch({ type: 'UPDATE_ELEMENT', payload: { id: element.id, properties } })
        }} />
        <Sep />
        <button className={item} disabled={!activeViewId} onClick={run(() => {
          if (activeViewId) copyElementFormat(useModelStore.getState().model, activeViewId, element.id)
        })}>Copy style</button>
        <button className={item} disabled={!activeViewId || !hasElementFormat()} onClick={run(() => {
          const command = activeViewId && pasteElementFormatCommand(useModelStore.getState().model, activeViewId, [element.id])
          if (command) dispatch(command)
        })}>Paste style</button>
        <button className={item} onClick={run(() => useModelStore.getState().requestFocusProperties())}>More in Inspector…</button>
        <Sep />
        <button className={`${item} !text-red-500`} onClick={run(() => dispatch({ type: 'DELETE_ELEMENT', payload: { id: element.id } }))}>Delete</button>
      </>
    )
  }

  const left = Math.min(state.x, window.innerWidth - 260)
  const top = Math.min(state.y, window.innerHeight - (picker ? 380 : 340))
  return (
    <div ref={ref} onContextMenu={e => e.preventDefault()}
      className={`fixed z-50 flex max-h-[70vh] flex-col overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-1 shadow-2xl ${picker ? 'w-60' : 'w-52'}`}
      style={{ left: Math.max(4, left), top: Math.max(4, top) }}>
      {picker && state.kind === 'elements' ? (
        <NodeTypePicker
          currentType={picker === 'type' ? model.elements[state.ids[0]]?.type : undefined}
          showRecents={picker === 'group'}
          onPick={type => {
            if (picker === 'group') groupElements(state.ids, type)
            else {
              const def = notationRegistry.getElementDef(type)
              const element = model.elements[state.ids[0]]
              dispatch({ type: 'UPDATE_ELEMENT', payload: { id: state.ids[0], type, notation: def?.notation ?? element?.notation } })
            }
            onClose()
          }}
          onClose={onClose}
        />
      ) : body}
    </div>
  )
}
