import { useState, useCallback, useMemo } from 'react'
import type { TreeRow } from '@/core/layout'
import { TREE_ROW_H, TREE_INDENT } from '@/core/layout'
import { useModelStore } from '@/store'

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

function Rows({ nodes, depth, collapsed, toggle, accent, resolve, onDropRow }: {
  nodes: TreeRow[]
  depth: number
  collapsed: Set<string>
  toggle: (id: string) => void
  accent: string
  resolve: (icon: string) => string
  onDropRow: (draggedId: string, targetId: string, frac: number) => void
}) {
  const selectedIds = useModelStore(s => s.selectedElementIds)
  const selectElement = useModelStore(s => s.selectElement)
  const setHoveredTreeNode = useModelStore(s => s.setHoveredTreeNode)
  return (
    <>
      {nodes.map(n => {
        const has = n.children.length > 0
        const isCol = collapsed.has(n.id)
        const selected = selectedIds.includes(n.id)
        return (
          <div key={n.id}>
            <div
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
              <button
                type="button"
                className="nodrag flex h-4 w-3 shrink-0 items-center justify-center rounded-sm text-[9px] hover:bg-[var(--surface-3)]"
                style={{ color: 'var(--fg)' }}
                onClick={e => { e.stopPropagation(); if (has) toggle(n.id) }}
                aria-label={has ? (isCol ? `Expand ${n.label}` : `Collapse ${n.label}`) : undefined}
                tabIndex={has ? 0 : -1}
              >
                {has ? (isCol ? '▸' : '▾') : ''}
              </button>
              {n.icon
                ? <img src={resolve(n.icon)} alt="" width={14} height={14} draggable={false} className="shrink-0 object-contain" />
                : has ? <FolderIcon open={!isCol} color={accent} /> : <FileIcon color={accent} />}
              <span className="truncate text-[12px] font-medium text-[var(--fg)]">{n.label}</span>
            </div>
            {has && !isCol && (
              <Rows nodes={n.children} depth={depth + 1} collapsed={collapsed} toggle={toggle} accent={accent} resolve={resolve} onDropRow={onDropRow} />
            )}
          </div>
        )
      })}
    </>
  )
}

/** Windows-Explorer-style collapsible file tree rendered inside a treeGraph. */
export function TreeGraphView({ roots, accent }: { roots: TreeRow[]; accent: string }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const resolve = useIconResolver()
  const elements = useModelStore(s => s.model.elements)
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
    <div className="nodrag nowheel h-full w-full overflow-auto py-1">
      <Rows nodes={roots} depth={0} collapsed={collapsed} toggle={toggle} accent={accent} resolve={resolve} onDropRow={onDropRow} />
    </div>
  )
}
