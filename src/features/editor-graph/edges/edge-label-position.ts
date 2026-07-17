import { Position } from '@xyflow/react'
import type { Point } from './orthogonal-router'

export const END_LABEL_DISTANCE = 30

/** Return a point at a fraction of the total polyline length. */
export function pointOnPolyline(points: Point[], fraction: number): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return points[0]

  const lengths: number[] = []
  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    const length = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y)
    lengths.push(length)
    total += length
  }

  let remaining = total * Math.min(1, Math.max(0, fraction))
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) {
      const t = lengths[i] === 0 ? 0 : remaining / lengths[i]
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      }
    }
    remaining -= lengths[i]
  }
  return points[points.length - 1]
}

/** Return a point a fixed distance along a polyline from either endpoint. */
export function pointOnPolylineAtDistance(points: Point[], distance: number, fromTarget = false): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  const ordered = fromTarget ? [...points].reverse() : points
  let remaining = Math.max(0, distance)

  for (let i = 0; i < ordered.length - 1; i++) {
    const length = Math.hypot(ordered[i + 1].x - ordered[i].x, ordered[i + 1].y - ordered[i].y)
    if (remaining <= length) {
      const t = length === 0 ? 0 : remaining / length
      return {
        x: ordered[i].x + (ordered[i + 1].x - ordered[i].x) * t,
        y: ordered[i].y + (ordered[i + 1].y - ordered[i].y) * t,
      }
    }
    remaining -= length
  }
  return ordered[ordered.length - 1]
}

function controlOffset(distance: number, curvature: number): number {
  return distance >= 0 ? distance * 0.5 : curvature * 25 * Math.sqrt(-distance)
}

function controlPoint(point: Point, other: Point, position: Position, curvature: number): Point {
  switch (position) {
    case Position.Left:
      return { x: point.x - controlOffset(point.x - other.x, curvature), y: point.y }
    case Position.Right:
      return { x: point.x + controlOffset(other.x - point.x, curvature), y: point.y }
    case Position.Top:
      return { x: point.x, y: point.y - controlOffset(point.y - other.y, curvature) }
    default:
      return { x: point.x, y: point.y + controlOffset(other.y - point.y, curvature) }
  }
}

/** Return a point on the same cubic Bezier curve produced by React Flow. */
export function pointOnBezier(
  source: Point,
  target: Point,
  sourcePosition: Position,
  targetPosition: Position,
  fraction: number,
  curvature = 0.25,
): Point {
  const t = Math.min(1, Math.max(0, fraction))
  const u = 1 - t
  const sourceControl = controlPoint(source, target, sourcePosition, curvature)
  const targetControl = controlPoint(target, source, targetPosition, curvature)
  return {
    x: u ** 3 * source.x + 3 * u ** 2 * t * sourceControl.x + 3 * u * t ** 2 * targetControl.x + t ** 3 * target.x,
    y: u ** 3 * source.y + 3 * u ** 2 * t * sourceControl.y + 3 * u * t ** 2 * targetControl.y + t ** 3 * target.y,
  }
}

/** Return a point a fixed approximate arc distance from either Bezier endpoint. */
export function pointOnBezierAtDistance(
  source: Point,
  target: Point,
  sourcePosition: Position,
  targetPosition: Position,
  distance: number,
  fromTarget = false,
  curvature = 0.25,
): Point {
  const steps = 64
  let previousT = fromTarget ? 1 : 0
  let previous = pointOnBezier(source, target, sourcePosition, targetPosition, previousT, curvature)
  let remaining = Math.max(0, distance)

  for (let i = 1; i <= steps; i++) {
    const currentT = fromTarget ? 1 - i / steps : i / steps
    const current = pointOnBezier(source, target, sourcePosition, targetPosition, currentT, curvature)
    const segmentLength = Math.hypot(current.x - previous.x, current.y - previous.y)
    if (remaining <= segmentLength) {
      const ratio = segmentLength === 0 ? 0 : remaining / segmentLength
      const t = previousT + (currentT - previousT) * ratio
      return pointOnBezier(source, target, sourcePosition, targetPosition, t, curvature)
    }
    remaining -= segmentLength
    previousT = currentT
    previous = current
  }
  return fromTarget ? source : target
}
