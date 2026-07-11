import { useState, useCallback } from 'react'
import type { TreeRow } from '@/core/layout'
import { TREE_ROW_H, TREE_INDENT } from '@/core/layout'

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

function Rows({ nodes, depth, collapsed, toggle, accent, text }: {
  nodes: TreeRow[]
  depth: number
  collapsed: Set<string>
  toggle: (id: string) => void
  accent: string
  text: string
}) {
  return (
    <>
      {nodes.map(n => {
        const has = n.children.length > 0
        const isCol = collapsed.has(n.id)
        return (
          <div key={n.id}>
            <div
              className="flex items-center gap-1 rounded-sm px-1 hover:bg-[var(--surface-2)]"
              style={{ height: TREE_ROW_H, paddingLeft: 4 + depth * TREE_INDENT }}
              onClick={e => { if (has) { e.stopPropagation(); toggle(n.id) } }}
              role={has ? 'button' : undefined}
            >
              <span className="flex w-3 shrink-0 justify-center text-[9px]" style={{ color: text }}>
                {has ? (isCol ? '▸' : '▾') : ''}
              </span>
              {has ? <FolderIcon open={!isCol} color={accent} /> : <FileIcon color={accent} />}
              <span className="truncate text-[12px]" style={{ color: text }}>{n.label}</span>
            </div>
            {has && !isCol && (
              <Rows nodes={n.children} depth={depth + 1} collapsed={collapsed} toggle={toggle} accent={accent} text={text} />
            )}
          </div>
        )
      })}
    </>
  )
}

/** Windows-Explorer-style collapsible file tree rendered inside a treeGraph. */
export function TreeGraphView({ roots, accent, text }: { roots: TreeRow[]; accent: string; text: string }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggle = useCallback((id: string) => {
    setCollapsed(s => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }, [])
  return (
    <div className="nodrag nowheel h-full w-full overflow-auto py-1">
      <Rows nodes={roots} depth={0} collapsed={collapsed} toggle={toggle} accent={accent} text={text} />
    </div>
  )
}
