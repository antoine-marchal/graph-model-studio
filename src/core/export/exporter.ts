import type { GraphModel, GraphView } from '../model'

export interface Exporter {
  id: string
  label: string
  extension: string
  mimeType: string
  export(model: GraphModel, view?: GraphView): Promise<string | Blob>
}

export const jsonExporter: Exporter = {
  id: 'json',
  label: 'JSON',
  extension: '.json',
  mimeType: 'application/json',
  async export(model) {
    return JSON.stringify(model, null, 2)
  },
}

export const dslExporter: Exporter = {
  id: 'dsl',
  label: 'DSL (.gmc)',
  extension: '.gmc',
  mimeType: 'text/plain',
  async export(model) {
    const { serializeModel } = await import('../dsl/serializer')
    return serializeModel(model)
  },
}

/** sanitise an id so it is a valid Mermaid/PlantUML node id */
function safeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_]/g, '_')
}

function visibleSet(model: GraphModel, view?: GraphView): Set<string> {
  if (!view || view.includeAll) return new Set(Object.keys(model.elements))
  const ids = new Set(view.includedElements)
  for (const id of [...ids]) {
    let p = model.elements[id]?.parentId
    while (p) { ids.add(p); p = model.elements[p]?.parentId }
  }
  return ids
}

export const mermaidExporter: Exporter = {
  id: 'mermaid',
  label: 'Mermaid',
  extension: '.md',
  mimeType: 'text/plain',
  async export(model, view) {
    const dir = view?.layoutDirection
    const rankdir = dir === 'tb' || dir === 'bt' ? 'TD' : 'LR'
    const visible = visibleSet(model, view)
    const lines: string[] = ['```mermaid', `graph ${rankdir}`]

    // emit nested elements as subgraphs
    const emitted = new Set<string>()
    const childrenOf = (pid?: string) =>
      Object.values(model.elements).filter(e => visible.has(e.id) && e.parentId === pid)

    const walk = (pid: string | undefined, depth: number) => {
      const pad = '  '.repeat(depth + 1)
      for (const el of childrenOf(pid)) {
        if (emitted.has(el.id)) continue
        emitted.add(el.id)
        const kids = childrenOf(el.id)
        if (kids.length) {
          lines.push(`${pad}subgraph ${safeId(el.id)}["${el.name}"]`)
          walk(el.id, depth + 1)
          lines.push(`${pad}end`)
        } else {
          lines.push(`${pad}${safeId(el.id)}["${el.name}"]`)
        }
      }
    }
    walk(undefined, 0)

    for (const rel of Object.values(model.relations)) {
      if (!visible.has(rel.sourceId) || !visible.has(rel.targetId)) continue
      const label = rel.label ? `|${rel.label}|` : ''
      const arrow = rel.direction === 'undirected' ? '---' : '-->'
      lines.push(`  ${safeId(rel.sourceId)} ${arrow}${label} ${safeId(rel.targetId)}`)
    }

    lines.push('```')
    return lines.join('\n')
  },
}

export const plantumlExporter: Exporter = {
  id: 'plantuml',
  label: 'PlantUML',
  extension: '.puml',
  mimeType: 'text/plain',
  async export(model, view) {
    const visible = visibleSet(model, view)
    const lines: string[] = ['@startuml', 'left to right direction', 'skinparam shadowing false']

    const childrenOf = (pid?: string) =>
      Object.values(model.elements).filter(e => visible.has(e.id) && e.parentId === pid)
    const emitted = new Set<string>()
    const walk = (pid: string | undefined, depth: number) => {
      const pad = '  '.repeat(depth)
      for (const el of childrenOf(pid)) {
        if (emitted.has(el.id)) continue
        emitted.add(el.id)
        const kids = childrenOf(el.id)
        if (kids.length) {
          lines.push(`${pad}rectangle "${el.name}" as ${safeId(el.id)} {`)
          walk(el.id, depth + 1)
          lines.push(`${pad}}`)
        } else {
          lines.push(`${pad}rectangle "${el.name}" as ${safeId(el.id)}`)
        }
      }
    }
    walk(undefined, 0)

    for (const rel of Object.values(model.relations)) {
      if (!visible.has(rel.sourceId) || !visible.has(rel.targetId)) continue
      const arrow = rel.direction === 'undirected' ? '--' : '-->'
      const label = rel.label ? ` : ${rel.label}` : ''
      lines.push(`${safeId(rel.sourceId)} ${arrow} ${safeId(rel.targetId)}${label}`)
    }

    lines.push('@enduml')
    return lines.join('\n')
  },
}

export const exporters: Exporter[] = [jsonExporter, dslExporter, mermaidExporter, plantumlExporter]

export function getExporter(id: string): Exporter | undefined {
  return exporters.find(e => e.id === id)
}
