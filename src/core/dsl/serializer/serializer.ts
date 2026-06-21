import type { GraphModel, GraphElement, GraphRelation, GraphView } from '../../model'

function indent(level: number): string {
  return '  '.repeat(level)
}

function quoteString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function serializeElement(el: GraphElement, elements: Record<string, GraphElement>, level = 1): string {
  const lines: string[] = []
  const i = indent(level)

  let line = `${i}${el.id} = ${el.type} ${quoteString(el.name)}`
  const hasBody =
    el.description ||
    el.technology ||
    el.size ||
    el.tags.length > 0 ||
    Object.keys(el.properties).length > 0 ||
    el.children.length > 0

  if (!hasBody) {
    lines.push(line)
    return lines.join('\n')
  }

  lines.push(line + ' {')

  if (el.description) {
    lines.push(`${indent(level + 1)}description ${quoteString(el.description)}`)
  }
  if (el.technology) {
    lines.push(`${indent(level + 1)}technology ${quoteString(el.technology)}`)
  }
  if (el.size) {
    lines.push(`${indent(level + 1)}size ${Math.round(el.size.width)} ${Math.round(el.size.height)}`)
  }
  if (el.tags.length > 0) {
    lines.push(`${indent(level + 1)}tags ${el.tags.map(quoteString).join(' ')}`)
  }
  for (const [k, v] of Object.entries(el.properties)) {
    lines.push(`${indent(level + 1)}${k} ${quoteString(v)}`)
  }

  for (const childId of el.children) {
    const child = elements[childId]
    if (child) {
      lines.push(serializeElement(child, elements, level + 1))
    }
  }

  lines.push(`${i}}`)
  return lines.join('\n')
}

function serializeRelation(rel: GraphRelation, level = 1): string {
  const i = indent(level)
  let line = `${i}${rel.sourceId} -> ${rel.targetId}`
  if (rel.type && rel.type !== 'rel') {
    line += ` : ${rel.type}`
  }
  if (rel.label) {
    line += ` ${quoteString(rel.label)}`
  }
  if (rel.sourceHandle || rel.targetHandle) {
    line += ` anchor ${rel.sourceHandle ?? '_'} ${rel.targetHandle ?? '_'}`
  }
  return line
}

function serializeView(view: GraphView): string {
  const lines: string[] = []
  const label = view.name && view.name !== view.id ? ` ${quoteString(view.name)}` : ''
  lines.push(`  view ${view.id}${label} {`)

  if (view.includeAll) {
    lines.push(`    include *`)
  } else {
    for (const el of view.includedElements) {
      lines.push(`    include ${el}`)
    }
  }

  if (view.layoutMode === 'auto' || view.layoutDirection) {
    lines.push(`    autolayout ${view.layoutDirection}`)
  }

  // persist manual node positions so the diagram round-trips exactly
  const positions = Object.entries(view.layoutPositions ?? {})
  for (const [id, pos] of positions) {
    lines.push(`    ${id} at ${Math.round(pos.x)} ${Math.round(pos.y)}`)
  }

  lines.push(`  }`)
  return lines.join('\n')
}

export function serializeModel(model: GraphModel): string {
  const parts: string[] = []

  // Collect root-level elements (no parent)
  const rootElements = Object.values(model.elements).filter(e => !e.parentId)
  const rootRelations = Object.values(model.relations)

  if (rootElements.length > 0 || rootRelations.length > 0) {
    const modelLines: string[] = ['model {']

    for (const el of rootElements) {
      modelLines.push(serializeElement(el, model.elements, 1))
    }

    if (rootRelations.length > 0) {
      modelLines.push('')
      for (const rel of rootRelations) {
        modelLines.push(serializeRelation(rel, 1))
      }
    }

    modelLines.push('}')
    parts.push(modelLines.join('\n'))
  }

  const views = Object.values(model.views)
  if (views.length > 0) {
    const viewLines: string[] = ['views {']
    for (const v of views) {
      viewLines.push(serializeView(v))
    }
    viewLines.push('}')
    parts.push(viewLines.join('\n'))
  }

  return parts.join('\n\n')
}
