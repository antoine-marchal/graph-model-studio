import type { Position, Size } from '@/core/model'

export const QUADRANT_INSET = 26

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

/** Convert normalized quadrant coordinates (origin bottom-left) to node-local position. */
export function quadrantItemPosition(
  x: number,
  y: number,
  chart: Size,
  item: Size,
): Position {
  const usableWidth = Math.max(1, chart.width - 2 * QUADRANT_INSET)
  const usableHeight = Math.max(1, chart.height - 2 * QUADRANT_INSET)
  return {
    x: QUADRANT_INSET + clamp01(x) * usableWidth - item.width / 2,
    y: chart.height - QUADRANT_INSET - clamp01(y) * usableHeight - item.height / 2,
  }
}

/** Convert a dragged item's top-left position back to normalized coordinates. */
export function quadrantValuesFromPosition(
  position: Position,
  chart: Size,
  item: Size,
  precision = 4,
): { x: number; y: number } {
  const usableWidth = Math.max(1, chart.width - 2 * QUADRANT_INSET)
  const usableHeight = Math.max(1, chart.height - 2 * QUADRANT_INSET)
  const centerX = position.x + item.width / 2
  const centerY = position.y + item.height / 2
  const round = (value: number) => Number(clamp01(value).toFixed(precision))
  return {
    x: round((centerX - QUADRANT_INSET) / usableWidth),
    y: round((chart.height - QUADRANT_INSET - centerY) / usableHeight),
  }
}

