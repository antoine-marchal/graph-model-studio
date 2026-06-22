import { useEffect, useMemo, useRef, useState } from 'react'
import { notationRegistry } from '@/core/notation'
import type { ElementTypeDefinition } from '@/core/notation'
import type { NotationKind } from '@/core/model'
import { useModelStore } from '@/store'
import { NodeIcon } from './nodes/NodeIcons'

const NOTATIONS = notationRegistry.getNotations()
const ALL_TYPES = notationRegistry.getAllElementTypes()

export function TypeSwatch({ t, size = 16 }: { t: ElementTypeDefinition; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-sm"
      style={{ width: size, height: size, background: t.fill, border: `1.5px solid ${t.stroke}` }}
    >
      {t.iconSrc
        ? <img src={t.iconSrc} alt="" width={size * 0.72} height={size * 0.72} draggable={false} style={{ objectFit: 'contain' }} />
        : t.icon !== 'none' && <NodeIcon kind={t.icon} color={t.accent} size={size * 0.62} />}
    </span>
  )
}

/**
 * Searchable, keyboard-navigable list of every element type. Used both by the
 * canvas right-click "add node" menu and the Properties "Type" field.
 */
export function NodeTypePicker({
  onPick,
  onClose,
  showRecents = true,
  currentType,
  autoFocus = true,
}: {
  onPick: (type: string) => void
  onClose?: () => void
  showRecents?: boolean
  currentType?: string
  autoFocus?: boolean
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const recentTypes = useModelStore(s => s.recentTypes)

  const recents = useMemo(
    () => (showRecents ? (recentTypes.map(t => notationRegistry.getElementDef(t)).filter(Boolean) as ElementTypeDefinition[]) : []),
    [recentTypes, showRecents],
  )

  const { flat, grouped } = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q) {
      const matches = ALL_TYPES.filter(t =>
        t.label.toLowerCase().includes(q) ||
        t.type.toLowerCase().includes(q) ||
        (t.group ?? '').toLowerCase().includes(q) ||
        t.notation.toLowerCase().includes(q),
      )
      return { flat: matches, grouped: null as null | Record<NotationKind, ElementTypeDefinition[]> }
    }
    const byNotation = {} as Record<NotationKind, ElementTypeDefinition[]>
    const flatList: ElementTypeDefinition[] = [...recents]
    for (const { kind } of NOTATIONS) {
      const types = notationRegistry.getElementTypes(kind)
      if (types.length) { byNotation[kind] = types; flatList.push(...types) }
    }
    return { flat: flatList, grouped: byNotation }
  }, [query, recents])

  useEffect(() => { setActive(0) }, [query])
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
    node?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const pick = (t?: ElementTypeDefinition) => { if (t) onPick(t.type) }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, flat.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(flat[active]) }
  }

  let idx = -1
  const item = (t: ElementTypeDefinition) => {
    idx++
    const i = idx
    const isCurrent = t.type === currentType
    return (
      <button
        key={t.type + i}
        data-idx={i}
        onMouseEnter={() => setActive(i)}
        onClick={() => pick(t)}
        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs ${
          i === active ? 'bg-[var(--accent)] text-[var(--accent-fg)]' : 'text-[var(--fg)] hover:bg-[var(--surface-2)]'
        }`}
      >
        <TypeSwatch t={t} />
        <span className="truncate">{t.label}</span>
        {isCurrent && <span className={`shrink-0 ${i === active ? 'opacity-90' : 'text-[var(--accent)]'}`}>✓</span>}
        <span className={`ml-auto shrink-0 text-[9px] uppercase ${i === active ? 'opacity-80' : 'text-[var(--fg-subtle)]'}`}>{t.notation}</span>
      </button>
    )
  }

  return (
    <div onKeyDown={onKeyDown} className="flex max-h-[inherit] min-h-0 flex-col">
      <div className="border-b border-[var(--border)] p-2">
        <input
          autoFocus={autoFocus}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search node types…"
          className="w-full rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--fg)] placeholder-[var(--fg-subtle)] focus:border-[var(--accent)] focus:outline-none"
        />
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1">
        {flat.length === 0 && <p className="px-2 py-3 text-center text-xs text-[var(--fg-subtle)]">No matches</p>}
        {grouped ? (
          <>
            {recents.length > 0 && (
              <div className="mb-1">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--fg-subtle)]">Recent</div>
                {recents.map(t => item(t))}
              </div>
            )}
            {NOTATIONS.map(({ kind, label }) => {
              const types = grouped[kind]
              if (!types?.length) return null
              return (
                <div key={kind} className="mb-1">
                  <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--fg-subtle)]">{label}</div>
                  {types.map(t => item(t))}
                </div>
              )
            })}
          </>
        ) : (
          flat.map(t => item(t))
        )}
      </div>

      <div className="border-t border-[var(--border)] px-2 py-1 text-[10px] text-[var(--fg-subtle)]">
        ↑↓ navigate · ↵ select · esc close
      </div>
    </div>
  )
}
