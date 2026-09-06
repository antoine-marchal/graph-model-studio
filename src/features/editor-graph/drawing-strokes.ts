import { gzipSync, gunzipSync, strFromU8, strToU8 } from 'fflate'

export interface DrawingPoint { x: number; y: number }
export type DrawingStroke = DrawingPoint[]

const DRAWING_IMAGE_DATA_URL = /^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+$/i

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

function encodeBytesBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

function decodeBase64Bytes(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

export function parseDrawingStrokes(value?: string): DrawingStroke[] {
  if (!value) return []
  try {
    // Raw JSON was used before strokes became base64-encoded. Continue reading
    // it so existing drawing nodes migrate naturally on their next edit.
    let json = value
    if (!value.trimStart().startsWith('[')) {
      const bytes = decodeBase64Bytes(value)
      json = bytes[0] === 0x1f && bytes[1] === 0x8b
        ? strFromU8(gunzipSync(bytes))
        : strFromU8(bytes)
    }
    const parsed: unknown = JSON.parse(json)
    if (!Array.isArray(parsed)) return []
    return parsed.slice(0, 500).flatMap(stroke => {
      if (!Array.isArray(stroke)) return []
      const points = stroke.slice(0, 10_000).flatMap(point => {
        if (!point || typeof point !== 'object') return []
        const { x, y } = point as { x?: unknown; y?: unknown }
        return typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)
          ? [{ x: clamp01(x), y: clamp01(y) }]
          : []
      })
      return points.length ? [points] : []
    })
  } catch {
    return []
  }
}

export function serializeDrawingStrokes(strokes: DrawingStroke[]): string {
  const json = JSON.stringify(strokes.map(stroke => stroke.map(point => ({
    x: Number(clamp01(point.x).toFixed(4)),
    y: Number(clamp01(point.y).toFixed(4)),
  }))))
  return encodeBytesBase64(gzipSync(strToU8(json), { level: 9, mtime: 0 }))
}

export function drawingCanvasHeight(label: string, nodeHeight: number): number {
  return Math.max(1, nodeHeight - (label.trim() ? 26 : 0))
}

export interface DrawingCropFrame {
  canvasWidth: number
  canvasHeight: number
  cropX: number
  cropY: number
}

export function resizedDrawingCrop(
  frame: DrawingCropFrame,
  start: { x: number; y: number },
  current: { x: number; y: number },
): DrawingCropFrame {
  return {
    canvasWidth: frame.canvasWidth,
    canvasHeight: frame.canvasHeight,
    cropX: Math.max(0, frame.cropX + current.x - start.x),
    cropY: Math.max(0, frame.cropY + current.y - start.y),
  }
}

/** Only allow embedded base64 image URLs in drawing nodes. */
export function drawingImageDataUrl(value?: string): string | undefined {
  return value && DRAWING_IMAGE_DATA_URL.test(value) ? value : undefined
}

/** Exponential smoothing: 0 preserves the pointer, 100 strongly damps jitter. */
export function smoothDrawingPoint(previous: DrawingPoint, next: DrawingPoint, smoothing: number): DrawingPoint {
  const strength = Math.max(0, Math.min(100, Number.isFinite(smoothing) ? smoothing : 35)) / 100
  const alpha = 1 - strength * 0.88
  return {
    x: previous.x + (next.x - previous.x) * alpha,
    y: previous.y + (next.y - previous.y) * alpha,
  }
}

export function drawingStrokePath(stroke: DrawingStroke, width: number, height: number): string {
  if (!stroke.length) return ''
  const points = stroke.map(point => ({ x: point.x * width, y: point.y * height }))
  if (points.length === 1) return `M ${points[0].x} ${points[0].y} l 0.01 0`
  let path = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const midpoint = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 }
    path += ` Q ${points[i].x} ${points[i].y} ${midpoint.x} ${midpoint.y}`
  }
  const last = points[points.length - 1]
  return `${path} L ${last.x} ${last.y}`
}
