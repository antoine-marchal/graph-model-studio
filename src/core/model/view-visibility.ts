import type { GraphModel, GraphView } from './types'

/** Resolve a (possibly qualified) include pattern id to a flat element id. */
function resolvePatternId(ref: string, model: GraphModel): string | undefined {
  if (model.elements[ref]) return ref
  const last = ref.split('.').pop()
  if (last && model.elements[last]) return last
  return undefined
}

/** Add an element and all of its descendants to `ids`. */
function addWithDescendants(model: GraphModel, id: string, ids: Set<string>) {
  if (!model.elements[id] || ids.has(id)) return
  ids.add(id)
  for (const c of model.elements[id].children) addWithDescendants(model, c, ids)
}

/** Add only the descendants of an element (not the element itself). */
function addDescendantsOnly(model: GraphModel, id: string, ids: Set<string>) {
  const el = model.elements[id]
  if (!el) return
  for (const c of el.children) addWithDescendants(model, c, ids)
}

/** The set of element ids rendered for a view, honouring include patterns
 *  ("*", "nodeId", "nodeId.*"). Only explicitly-included elements are shown:
 *  a container is rendered around its children only when it too is included. */
export function getVisibleElementIds(model: GraphModel, view: GraphView): Set<string> {
  if (view.includeAll) return new Set(Object.keys(model.elements))
  const ids = new Set<string>()
  for (const pattern of view.includedElements) {
    if (pattern === '*') { for (const id of Object.keys(model.elements)) ids.add(id); continue }
    if (pattern.endsWith('.*')) {
      // "nodeId.*" → every descendant, but NOT the node itself
      const prefix = resolvePatternId(pattern.slice(0, -2), model)
      if (prefix) addDescendantsOnly(model, prefix, ids)
    } else {
      // "nodeId" → just that node (no ancestors pulled in)
      const rid = resolvePatternId(pattern, model)
      if (rid) ids.add(rid)
    }
  }
  return ids
}

/** Relation visibility key for the view's includedRelations set. */
export function relationKey(sourceId: string, targetId: string): string {
  return `${sourceId}>${targetId}`
}

/** Is a relation visible in this view? (independent of endpoint visibility) */
export function isRelationIncluded(view: GraphView, sourceId: string, targetId: string): boolean {
  if (view.includeAllRelations !== false) return true
  return (view.includedRelations ?? []).includes(relationKey(sourceId, targetId))
}
