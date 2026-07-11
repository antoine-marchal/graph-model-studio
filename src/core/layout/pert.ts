import type { GraphModel } from '../model'

/** Computed CPM values for one PERT node (all in abstract time units). */
export interface PertNodeValues {
  duration: number
  /** earliest start / finish (forward pass) */
  es: number
  ef: number
  /** latest start / finish (backward pass) */
  ls: number
  lf: number
  /** total float; 0 = on the critical path */
  slack: number
  critical: boolean
}

export interface PertResult {
  nodes: Record<string, PertNodeValues>
  /** relation ids that lie on a critical path */
  criticalRelations: Set<string>
  /** project duration (max EF) */
  duration: number
}

/** Parse a `duration "…"` property: plain number of time units ("5", "2.5"). */
export function parsePertDuration(raw: string | undefined): number {
  if (!raw) return 0
  const n = parseFloat(raw)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/**
 * Critical Path Method over every element with notation "pert".
 * Edges are all relations whose two endpoints are PERT elements; direction
 * `a -> b` means "b starts after a finishes". Cycles are broken by ignoring
 * back-edges (same protection style as the layered layout).
 */
export function computePert(model: GraphModel): PertResult {
  const ids = Object.values(model.elements)
    .filter(el => el.notation === 'pert')
    .map(el => el.id)
  const idSet = new Set(ids)

  const duration = new Map<string, number>()
  for (const id of ids) {
    duration.set(id, parsePertDuration(model.elements[id].properties?.['duration']))
  }

  const preds = new Map<string, string[]>()
  const succs = new Map<string, string[]>()
  for (const id of ids) { preds.set(id, []); succs.set(id, []) }
  const pertRels: { id: string; s: string; t: string }[] = []
  for (const rel of Object.values(model.relations)) {
    if (!idSet.has(rel.sourceId) || !idSet.has(rel.targetId) || rel.sourceId === rel.targetId) continue
    preds.get(rel.targetId)!.push(rel.sourceId)
    succs.get(rel.sourceId)!.push(rel.targetId)
    pertRels.push({ id: rel.id, s: rel.sourceId, t: rel.targetId })
  }

  // ── forward pass (DFS with cycle protection) ──
  const es = new Map<string, number>()
  const visiting = new Set<string>()
  function earliestStart(id: string): number {
    if (es.has(id)) return es.get(id)!
    if (visiting.has(id)) return 0 // cycle — treat as source
    visiting.add(id)
    let v = 0
    for (const p of preds.get(id)!) v = Math.max(v, earliestStart(p) + duration.get(p)!)
    visiting.delete(id)
    es.set(id, v)
    return v
  }
  for (const id of ids) earliestStart(id)

  let projectEnd = 0
  for (const id of ids) projectEnd = Math.max(projectEnd, es.get(id)! + duration.get(id)!)

  // ── backward pass ──
  const lf = new Map<string, number>()
  function latestFinish(id: string): number {
    if (lf.has(id)) return lf.get(id)!
    if (visiting.has(id)) return projectEnd
    visiting.add(id)
    let v = projectEnd
    for (const s of succs.get(id)!) v = Math.min(v, latestFinish(s) - duration.get(s)!)
    visiting.delete(id)
    lf.set(id, v)
    return v
  }
  for (const id of ids) latestFinish(id)

  const EPS = 1e-9
  const nodes: Record<string, PertNodeValues> = {}
  for (const id of ids) {
    const d = duration.get(id)!
    const nodeEs = es.get(id)!
    const nodeLf = lf.get(id)!
    const slack = nodeLf - d - nodeEs
    nodes[id] = {
      duration: d,
      es: nodeEs,
      ef: nodeEs + d,
      ls: nodeLf - d,
      lf: nodeLf,
      slack,
      critical: slack <= EPS,
    }
  }

  // a relation is critical when both endpoints are critical and the target
  // starts exactly when the source finishes (no float on the edge itself)
  const criticalRelations = new Set<string>()
  for (const r of pertRels) {
    const a = nodes[r.s]
    const b = nodes[r.t]
    if (a.critical && b.critical && Math.abs(a.ef - b.es) <= EPS) criticalRelations.add(r.id)
  }

  return { nodes, criticalRelations, duration: projectEnd }
}
