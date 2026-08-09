import type { GraphModel, GraphRelation, Size } from '@/core/model'
import { notationRegistry } from '@/core/notation'

const NODE_COLOR_KEYS = ['accentColor', 'backgroundColor', 'containerColor', 'color'] as const
const RELATION_COLOR_KEYS = ['accentColor', 'color'] as const

type ElementFormat = { kind: 'element'; colors: Record<string, string>; size: Size }
type RelationFormat = {
  kind: 'relation'
  type: string
  direction: GraphRelation['direction']
  sourceHandle?: GraphRelation['sourceHandle']
  targetHandle?: GraphRelation['targetHandle']
  colors: Record<string, string>
}
type FormatClipboard = ElementFormat | RelationFormat

let clipboard: FormatClipboard | null = null

function picked(properties: Record<string, string>, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.flatMap(key => properties[key] ? [[key, properties[key]]] : []))
}

function withCopiedColors(target: Record<string, string>, colors: Record<string, string>, keys: readonly string[]): Record<string, string> {
  const next = { ...target }
  for (const key of keys) delete next[key]
  return { ...next, ...colors }
}

export function copyElementFormat(model: GraphModel, viewId: string, elementId: string): boolean {
  const element = model.elements[elementId]
  const view = model.views[viewId]
  if (!element || !view) return false
  const definition = notationRegistry.getElementDef(element.type)
  clipboard = {
    kind: 'element',
    colors: picked(element.properties, NODE_COLOR_KEYS),
    size: view.nodeSizes?.[elementId] ?? element.size ?? {
      width: definition?.defaultWidth ?? 150,
      height: definition?.defaultHeight ?? 70,
    },
  }
  return true
}

export function copyRelationFormat(model: GraphModel, relationId: string): boolean {
  const relation = model.relations[relationId]
  if (!relation) return false
  clipboard = {
    kind: 'relation',
    type: relation.type,
    direction: relation.direction,
    sourceHandle: relation.sourceHandle,
    targetHandle: relation.targetHandle,
    colors: picked(relation.properties, RELATION_COLOR_KEYS),
  }
  return true
}

export function elementFormatFor(model: GraphModel, elementId: string): { properties: Record<string, string>; size: Size } | null {
  const element = model.elements[elementId]
  if (!element || clipboard?.kind !== 'element') return null
  return { properties: withCopiedColors(element.properties, clipboard.colors, NODE_COLOR_KEYS), size: clipboard.size }
}

export function relationFormatFor(model: GraphModel, relationId: string): Omit<RelationFormat, 'kind' | 'colors'> & { properties: Record<string, string> } | null {
  const relation = model.relations[relationId]
  if (!relation || clipboard?.kind !== 'relation') return null
  return {
    type: clipboard.type,
    direction: clipboard.direction,
    sourceHandle: clipboard.sourceHandle,
    targetHandle: clipboard.targetHandle,
    properties: withCopiedColors(relation.properties, clipboard.colors, RELATION_COLOR_KEYS),
  }
}

export function hasElementFormat(): boolean { return clipboard?.kind === 'element' }
export function hasRelationFormat(): boolean { return clipboard?.kind === 'relation' }

/** Test helper; the clipboard intentionally remains in memory across selections. */
export function clearFormatClipboard(): void { clipboard = null }

