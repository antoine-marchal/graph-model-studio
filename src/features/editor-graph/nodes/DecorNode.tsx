import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useModelStore } from '@/store'

/** Invisible 2×2 endpoint node a sequence message edge attaches to.
 *  React Flow only renders an edge when its endpoint nodes expose a handle,
 *  so it carries one invisible handle (ConnectionMode.Loose lets it serve as
 *  both source and target). Parented to its seqGraph so it moves with the frame. */
const seqHandleStyle = { opacity: 0, width: 1, height: 1, minWidth: 1, minHeight: 1, border: 'none', pointerEvents: 'none' } as const
export const SeqPointNode = memo(() => (
  <div style={{ width: 2, height: 2 }}>
    <Handle type="source" position={Position.Left} style={seqHandleStyle} isConnectable={false} />
  </div>
))

SeqPointNode.displayName = 'SeqPointNode'

/** Visible connect dot at a treeNode row's label end — drag from it to draw a
 *  relation to another node; also serves as the endpoint of existing edges. */
export const TreeAnchorNode = memo(({ data }: NodeProps) => {
  const treeNodeId = (data as { treeNodeId?: string }).treeNodeId
  const hovered = useModelStore(s => s.hoveredTreeNodeId === treeNodeId)
  const setHoveredTreeNode = useModelStore(s => s.setHoveredTreeNode)
  return (
    <div
      className="rounded-full border transition-opacity"
      style={{
        width: 6, height: 6, background: 'var(--surface-1)', borderColor: 'var(--accent)', borderWidth: 1,
        opacity: hovered ? 0.62 : 0, cursor: 'crosshair', pointerEvents: hovered ? 'auto' : 'none',
      }}
      onMouseEnter={() => treeNodeId && setHoveredTreeNode(treeNodeId)}
      onMouseLeave={() => setHoveredTreeNode(null)}
      title="Drag to link this file to another node"
    >
      {/* ConnectionMode.Loose makes one handle valid as both source and target. */}
      <Handle type="source" position={Position.Right} style={{ opacity: 0, inset: -3, width: 12, height: 12, transform: 'none', border: 'none' }} />
    </div>
  )
})

TreeAnchorNode.displayName = 'TreeAnchorNode'
