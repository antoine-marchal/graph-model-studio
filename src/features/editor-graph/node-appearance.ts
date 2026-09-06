import type { NodeShape } from '@/core/notation'

const CONTAINER_SHAPES = new Set<NodeShape>([
  'container',
  'chartFrame',
  'ganttGraph',
  'quadrantChart',
  'treeGraph',
  'gridGraph',
  'analyticChart',
])

export function supportsTransparentBackground(elementType: string, shape: NodeShape, childCount: number): boolean {
  return elementType === 'drawing' || childCount > 0 || CONTAINER_SHAPES.has(shape)
}

export function hasTransparentBackground(properties?: Record<string, string>): boolean {
  return properties?.transparentBackground?.toLowerCase() === 'true'
}
