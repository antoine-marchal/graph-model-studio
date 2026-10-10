export type NodeRect = { x: number; y: number; width: number; height: number }

// The mounted graph editor publishes absolute node rects here so panels outside
// its ReactFlowProvider (the inspector) can act on on-canvas geometry.
let provider: ((ids: string[]) => Record<string, NodeRect>) | null = null

export function setNodeRectProvider(next: typeof provider) { provider = next }
export function getNodeRects(ids: string[]): Record<string, NodeRect> | undefined { return provider?.(ids) }
