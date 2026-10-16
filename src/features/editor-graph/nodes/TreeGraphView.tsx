import { useState, useCallback, useMemo, useLayoutEffect, useRef } from 'react'
import { useReactFlow } from '@xyflow/react'
import type { TreeRow } from '@/core/layout'
import { TREE_ROW_H, TREE_INDENT } from '@/core/layout'
import { useModelStore } from '@/store'
import { GLYPH_PREFIX, isCharIcon, TreeIconChar } from './tree-icons'

function FolderIcon({ open, color }: { open: boolean; color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" className="shrink-0">
      {open
        ? <path d="M1.5 3.5h4l1.2 1.4H14a.8.8 0 0 1 .78 1l-1 4.6a1 1 0 0 1-.98.8H2.2a1 1 0 0 1-1-1V4.3a.8.8 0 0 1 .8-.8Z" fill={color} opacity="0.9" />
        : <path d="M1.5 3.5h4l1.2 1.4H14a.9.9 0 0 1 .9.9v5.3a.9.9 0 0 1-.9.9H2.4a.9.9 0 0 1-.9-.9V4.3a.8.8 0 0 1 .8-.8Z" fill={color} opacity="0.9" />}
    </svg>
  )
}

function FileIcon({ color }: { color: string }) {
  return (
    <svg width="12" height="14" viewBox="0 0 14 16" className="shrink-0">
      <path d="M3 1h5l3.5 3.5V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1Z" fill="none" stroke={color} strokeWidth="1.2" />
      <path d="M8 1v3.5h3.5" fill="none" stroke={color} strokeWidth="1.2" />
    </svg>
  )
}

/** Resolve a treeNode `icon` path: http(s)/data/blob as-is; anything else is
 *  treated as a file path — absolute, or relative to the open .gmc's folder —
 *  and converted to an asset URL the webview can load (Tauri). */
function useIconResolver(): (icon: string) => string {
  const filePath = useModelStore(s => s.filePath)
  return useMemo(() => {
    const dir = filePath ? filePath.replace(/[/\\][^/\\]*$/, '') : ''
    const sep = filePath && filePath.includes('\\') ? '\\' : '/'
    const isAbs = (p: string) => /^(https?:|data:|blob:|file:|asset:)/i.test(p) || /^([a-zA-Z]:[\\/]|[/\\])/.test(p)
    const toAsset = (abs: string): string => {
      if (/^(https?:|data:|blob:)/i.test(abs)) return abs
      const w = window as unknown as { __TAURI__?: { core?: { convertFileSrc?: (p: string) => string } } }
      const conv = w.__TAURI__?.core?.convertFileSrc
      try { return conv ? conv(abs) : abs } catch { return abs }
    }
    return (icon: string) => toAsset(isAbs(icon) ? icon : (dir ? dir + sep + icon : icon))
  }, [filePath])
}

const DND_MIME = 'application/gms-tree-id'

/** Inline rename of a tree row; commits on Enter/blur, cancels on Escape. */
function RowNameEditor({ id }: { id: string }) {
  const initial = useModelStore.getState().model.elements[id]?.name ?? ''
  const [value, setValue] = useState(initial)
  const close = () => useModelStore.getState().setEditingElement(null)
  const commit = () => {
    const next = value.trim()
    if (next && next !== initial) useModelStore.getState().dispatch({ type: 'UPDATE_ELEMENT', payload: { id, name: next } })
    close()
  }
  return (
    <input
      autoFocus
      onFocus={event => event.currentTarget.select()}
      value={value}
      onChange={event => setValue(event.target.value)}
      onBlur={commit}
      onClick={event => event.stopPropagation()}
      onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter') commit(); if (event.key === 'Escape') close() }}
      className="nodrag min-w-0 flex-1 rounded border border-[var(--accent)] bg-[var(--surface-1)] px-1 text-[12px] font-medium text-[var(--fg)] outline-none"
    />
  )
}

interface RowOptions {
  collapsed: Set<string>
  toggle: (id: string) => void
  accent: string
  resolve: (icon: string) => string
  onDropRow: (draggedId: string, targetId: string, frac: number) => void
  showLinks: boolean
  showToggles: boolean
}

// row geometry (px): content starts at 4 + depth * TREE_INDENT, then a 12px
// toggle, 4px gap, 14px icon; hierarchy lines run under the parent's icon
const ICON_CENTER = 4 + 12 + 4 + 7

function Rows({ nodes, depth, options }: { nodes: TreeRow[]; depth: number; options: RowOptions }) {
  const { collapsed, toggle, accent, resolve, onDropRow, showLinks, showToggles } = options
  const selectedIds = useModelStore(s => s.selectedElementIds)
  const selectElement = useModelStore(s => s.selectElement)
  const setHoveredTreeNode = useModelStore(s => s.setHoveredTreeNode)
  const editingId = useModelStore(s => s.editingElementId)
  return (
    <>
      {nodes.map(n => {
        const has = n.children.length > 0
        const isCol = collapsed.has(n.id)
        const selected = selectedIds.includes(n.id)
        return (
          <div key={n.id} className="relative">
            {showLinks && depth > 0 && (
              <span aria-hidden className="pointer-events-none absolute" style={{
                left: ICON_CENTER + (depth - 1) * TREE_INDENT, top: TREE_ROW_H / 2,
                width: TREE_INDENT - 9, borderTop: `1px solid ${accent}`, opacity: 0.55,
              }} />
            )}
            <div
              data-tree-row={n.id}
              data-element-id={n.id}
              className={`flex cursor-grab items-center gap-1 rounded-sm px-1 hover:bg-[var(--surface-2)] ${selected ? 'bg-[var(--accent)]/15 ring-1 ring-inset ring-[var(--accent)]/35' : ''}`}
              style={{ height: TREE_ROW_H, paddingLeft: 4 + depth * TREE_INDENT }}
              draggable
              onMouseEnter={() => setHoveredTreeNode(n.id)}
              onMouseLeave={() => setHoveredTreeNode(null)}
              onClick={e => {
                e.stopPropagation()
                selectElement(n.id, { additive: e.ctrlKey || e.metaKey })
              }}
              onDragStart={e => { e.stopPropagation(); e.dataTransfer.setData(DND_MIME, n.id); e.dataTransfer.effectAllowed = 'move' }}
              onDragOver={e => { if (e.dataTransfer.types.includes(DND_MIME)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
              onDrop={e => {
                const id = e.dataTransfer.getData(DND_MIME)
                if (!id) return
                e.preventDefault(); e.stopPropagation()
                const rect = e.currentTarget.getBoundingClientRect()
                onDropRow(id, n.id, (e.clientY - rect.top) / Math.max(1, rect.height))
              }}
              role="button"
              aria-selected={selected}
            >
              {showToggles ? <button
                type="button"
                className="nodrag relative z-[1] flex h-4 w-3 shrink-0 items-center justify-center rounded-sm text-[9px] hover:bg-[var(--surface-3)]"
                style={{ color: 'var(--fg)' }}
                onClick={e => { e.stopPropagation(); if (has) toggle(n.id) }}
                aria-label={has ? (isCol ? `Expand ${n.label}` : `Collapse ${n.label}`) : undefined}
                tabIndex={has ? 0 : -1}
              >
                {has ? (isCol ? '▸' : '▾') : ''}
              </button> : <span className="w-3 shrink-0" />}
              {n.icon && (n.icon.startsWith(GLYPH_PREFIX) || isCharIcon(n.icon))
                ? <TreeIconChar icon={n.icon} color={accent} />
                : n.icon
                ? <img src={resolve(n.icon)} alt="" width={14} height={14} draggable={false} className="shrink-0 object-contain" />
                : has ? <FolderIcon open={!isCol} color={accent} /> : <FileIcon color={accent} />}
              {editingId === n.id
                ? <RowNameEditor id={n.id} />
                : <span data-tree-label className="truncate text-[12px] font-medium text-[var(--fg)]">{n.label}</span>}
            </div>
            {has && !isCol && (
              <div className="relative">
                {showLinks && (
                  // trunk from the parent's icon down to the last child's stub
                  <span aria-hidden className="pointer-events-none absolute" style={{
                    left: ICON_CENTER + depth * TREE_INDENT, top: 0,
                    height: rowsAbove(n.children, collapsed) + TREE_ROW_H / 2,
                    borderLeft: `1px solid ${accent}`, opacity: 0.55,
                  }} />
                )}
                <Rows nodes={n.children} depth={depth + 1} options={options} />
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}

/** Height of the visible rows above the last sibling's own row. */
function rowsAbove(siblings: TreeRow[], collapsed: Set<string>): number {
  const count = (row: TreeRow): number => 1 + (collapsed.has(row.id) ? 0 : row.children.reduce((sum, child) => sum + count(child), 0))
  return siblings.slice(0, -1).reduce((sum, row) => sum + count(row), 0) * TREE_ROW_H
}

const treeAnchorId = (id: string, side: 'l' | 'r') => `__treeanchor_${id}_${side}`

/** Windows-Explorer-style collapsible file tree rendered inside a treeGraph. */
export function TreeGraphView({ hostId, roots, accent }: { hostId: string; roots: TreeRow[]; accent: string }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const resolve = useIconResolver()
  const elements = useModelStore(s => s.model.elements)
  const showLinks = elements[hostId]?.properties?.showLinks === 'true'
  const showToggles = elements[hostId]?.properties?.showToggles !== 'false'
  const containerRef = useRef<HTMLDivElement>(null)
  const { getNode, updateNode, getZoom } = useReactFlow()
  // The layout only estimates label widths; snap the connect anchors to the
  // rendered labels (rows hidden by a collapse anchor at their visible ancestor).
  useLayoutEffect(() => {
    const container = containerRef.current
    const host = container?.closest('.react-flow__node')
    if (!container || !host) return
    const zoom = getZoom()
    const origin = host.getBoundingClientRect()
    const place = (row: TreeRow, fallback: HTMLElement | null) => {
      const own = container.querySelector<HTMLElement>(`[data-tree-row="${CSS.escape(row.id)}"]`) ?? fallback
      const label = own?.querySelector<HTMLElement>('[data-tree-label]')
      if (own && label) {
        const rowRect = own.getBoundingClientRect()
        const labelRect = label.getBoundingClientRect()
        const y = (rowRect.top + rowRect.height / 2 - origin.top) / zoom - 3
        const targets = {
          l: { x: (labelRect.left - origin.left) / zoom - 25, y },
          r: { x: (labelRect.right - origin.left) / zoom + 4, y },
        }
        for (const side of ['l', 'r'] as const) {
          const anchor = getNode(treeAnchorId(row.id, side))
          const next = targets[side]
          if (anchor && (Math.abs(anchor.position.x - next.x) > 0.5 || Math.abs(anchor.position.y - next.y) > 0.5)) {
            updateNode(anchor.id, { position: next })
          }
        }
      }
      for (const child of row.children) place(child, collapsed.has(row.id) ? own : null)
    }
    for (const root of roots) place(root, null)
  })
  const reorderSiblings = useModelStore(s => s.reorderSiblings)
  const dispatch = useModelStore(s => s.dispatch)
  const toggle = useCallback((id: string) => {
    setCollapsed(s => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }, [])
  // top/bottom 30% of a row reorders around it; the middle embeds into it. A
  // node can't be dropped into its own descendant.
  const isDescendant = useCallback((maybeAncestor: string, id: string): boolean => {
    let p = elements[id]?.parentId
    while (p) { if (p === maybeAncestor) return true; p = elements[p]?.parentId }
    return false
  }, [elements])
  const onDropRow = useCallback((draggedId: string, targetId: string, frac: number) => {
    if (draggedId === targetId || isDescendant(draggedId, targetId)) return
    if (frac >= 0.3 && frac <= 0.7) {
      // embed as a child of target (reparent)
      if (elements[draggedId]?.parentId !== targetId) dispatch({ type: 'UPDATE_ELEMENT', payload: { id: draggedId, parentId: targetId } })
      return
    }
    // reorder within the target's parent (before/after)
    const dp = elements[targetId]?.parentId
    if (!dp) return
    if (elements[draggedId]?.parentId !== dp) { dispatch({ type: 'UPDATE_ELEMENT', payload: { id: draggedId, parentId: dp } }); return }
    const kids = elements[dp].children.filter(id => id !== draggedId)
    let at = kids.indexOf(targetId)
    if (at < 0) return
    if (frac > 0.7) at += 1
    kids.splice(at, 0, draggedId)
    reorderSiblings(dp, kids)
  }, [elements, reorderSiblings, dispatch, isDescendant])
  return (
    <div ref={containerRef} className="nodrag nowheel h-full w-full overflow-auto py-1">
      <Rows nodes={roots} depth={0} options={{ collapsed, toggle, accent, resolve, onDropRow, showLinks, showToggles }} />
    </div>
  )
}
