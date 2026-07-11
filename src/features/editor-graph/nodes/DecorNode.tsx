import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'

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
export const TreeAnchorNode = memo(() => (
  <div
    className="rounded-full border transition-opacity"
    style={{ width: 9, height: 9, background: 'var(--surface-1)', borderColor: 'var(--accent)', borderWidth: 1.5, opacity: 0.55, cursor: 'crosshair' }}
    title="Drag to link this file to another node"
  >
    <Handle type="source" position={Position.Right} style={{ opacity: 0, inset: 0, width: '100%', height: '100%', transform: 'none', border: 'none' }} />
    <Handle type="target" position={Position.Left} style={{ opacity: 0, inset: 0, width: '100%', height: '100%', transform: 'none', border: 'none' }} />
  </div>
))

TreeAnchorNode.displayName = 'TreeAnchorNode'
