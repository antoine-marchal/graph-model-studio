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
