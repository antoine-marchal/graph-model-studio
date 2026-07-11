import type { AstRoot, AstElementDecl, AstRelationDecl, AstViewDecl } from '../ast'
import type { GraphModel, GraphElement, GraphRelation, GraphView, NotationKind, LayoutDirection } from '../../model'
import { createEmptyModel } from '../../model'

function inferNotation(elementType: string): NotationKind {
  const c4Types = new Set(['person', 'softwareSystem', 'container', 'component', 'codeElement'])
  const archiTypes = new Set([
    'businessActor', 'businessRole', 'businessProcess',
    'applicationComponent', 'applicationService', 'dataObject',
    'technologyNode', 'device', 'systemSoftware', 'artifact',
  ])
  const bpmnTypes = new Set([
    'startEvent', 'endEvent', 'task', 'userTask', 'serviceTask',
    'gateway', 'exclusiveGateway', 'parallelGateway', 'pool', 'lane',
  ])
  const flowTypes = new Set(['start', 'end', 'process', 'decision', 'inputOutput', 'connector'])
  const useCaseTypes = new Set(['actor', 'useCase', 'systemBoundary'])
  const treeTypes = new Set(['treeGraph', 'treeNode'])
  const pertTypes = new Set(['pertTask', 'pertMilestone'])
  const ganttTypes = new Set(['ganttGraph', 'ganttTask', 'ganttMilestone', 'ganttSection'])
  const sequenceTypes = new Set(['seqGraph', 'participant', 'seqActor'])
  const mindmapTypes = new Set(['mindmapGraph', 'mindmapRoot', 'mindmapNode'])
  const gitTypes = new Set(['gitGraph', 'commit', 'mergeCommit'])
  const ishikawaTypes = new Set(['problem', 'cause', 'subCause'])
  const quadrantTypes = new Set(['quadrantChart', 'quadrantItem'])
  const timelineTypes = new Set(['timelineGraph', 'timelineEvent'])
  const umlTypes = new Set(['umlClass', 'umlInterface', 'umlEnum', 'umlNote'])
  const erdTypes = new Set(['erdEntity'])
  const gridTypes = new Set(['gridGraph', 'gridItem'])

  if (c4Types.has(elementType)) return 'c4'
  if (archiTypes.has(elementType)) return 'archimate'
  if (bpmnTypes.has(elementType)) return 'bpmn'
  if (flowTypes.has(elementType)) return 'flowchart'
  if (useCaseTypes.has(elementType)) return 'usecase'
  if (treeTypes.has(elementType)) return 'tree'
  if (pertTypes.has(elementType)) return 'pert'
  if (ganttTypes.has(elementType)) return 'gantt'
  if (sequenceTypes.has(elementType)) return 'sequence'
  if (mindmapTypes.has(elementType)) return 'mindmap'
  if (gitTypes.has(elementType)) return 'gitgraph'
  if (ishikawaTypes.has(elementType)) return 'ishikawa'
  if (quadrantTypes.has(elementType)) return 'quadrant'
  if (timelineTypes.has(elementType)) return 'timeline'
  if (umlTypes.has(elementType)) return 'uml'
  if (erdTypes.has(elementType)) return 'erd'
  if (gridTypes.has(elementType)) return 'grid'
  return 'generic'
}

function flattenElements(
  decls: AstElementDecl[],
  elements: Record<string, GraphElement>,
  parentId?: string,
) {
  for (const decl of decls) {
    const el: GraphElement = {
      id: decl.id,
      name: decl.label,
      type: decl.elementType,
      notation: inferNotation(decl.elementType),
      description: decl.description,
      technology: decl.technology,
      tags: decl.tags ?? [],
      properties: Object.fromEntries((decl.properties ?? []).map(p => [p.key, p.value])),
      parentId,
      children: decl.children?.map(c => c.id) ?? [],
      size: decl.size,
    }
    elements[decl.id] = el
    if (decl.children?.length) {
      flattenElements(decl.children, elements, decl.id)
    }
  }
}

/** Resolve a (possibly qualified) DSL reference like "banking.web" to a flat element id. */
function resolveRelationId(ref: string, elements: Record<string, GraphElement>): string {
  if (elements[ref]) return ref
  const last = ref.split('.').pop()!
  if (elements[last]) return last
  return ref // leave dangling; renderer will simply drop the edge
}

let relCounter = 0

function convertRelation(decl: AstRelationDecl, elements: Record<string, GraphElement>): GraphRelation {
  relCounter++
  const sourceId = resolveRelationId(decl.sourceId, elements)
  const targetId = resolveRelationId(decl.targetId, elements)
  return {
    id: `rel_${sourceId}_${targetId}_${relCounter}`,
    sourceId,
    targetId,
    type: decl.relationType ?? 'rel',
    label: decl.label,
    notation: 'generic',
    direction: (decl.direction as GraphRelation['direction']) ?? 'directed',
    tags: decl.tags ?? [],
    properties: Object.fromEntries((decl.properties ?? []).map(p => [p.key, p.value])),
    sourceHandle: decl.sourceHandle as GraphRelation['sourceHandle'],
    targetHandle: decl.targetHandle as GraphRelation['targetHandle'],
  }
}

function convertView(decl: AstViewDecl): GraphView {
  const dir = (decl.autolayout?.direction ?? 'tb') as LayoutDirection

  const elementIncludes = decl.includes.filter(i => (i.target ?? 'element') === 'element')
  const relationIncludes = decl.includes.filter(i => i.target === 'relation')

  const includeAll = elementIncludes.some(i => i.pattern === '*')
  const includeAllRelations = relationIncludes.length === 0 || relationIncludes.some(i => i.pattern === '*')

  // keep element-include patterns verbatim (incl. "nodeId.*"); resolution happens in model-to-flow
  const includedElements = includeAll ? [] : elementIncludes.map(i => i.pattern).filter(p => p !== '*')
  const includedRelations = includeAllRelations ? [] : relationIncludes.map(i => i.pattern).filter(p => p !== '*')

  const layoutPositions: Record<string, { x: number; y: number }> = {}
  for (const p of decl.positions ?? []) layoutPositions[p.id] = { x: p.x, y: p.y }

  const nodeSizes: Record<string, { width: number; height: number }> = {}
  for (const s of decl.sizes ?? []) nodeSizes[s.id] = { width: s.width, height: s.height }

  return {
    id: decl.id,
    name: decl.label ?? decl.id,
    type: 'default',
    includedElements,
    includedRelations,
    includeAll,
    includeAllRelations,
    layoutMode: Object.keys(layoutPositions).length ? 'manual' : 'auto',
    layoutDirection: dir,
    filters: [],
    styleOverrides: {},
    layoutPositions,
    nodeSizes,
  }
}

export function astToModel(ast: AstRoot): GraphModel {
  relCounter = 0
  const model = createEmptyModel()

  if (ast.model) {
    flattenElements(ast.model.elements, model.elements)
    for (const rel of ast.model.relations) {
      const r = convertRelation(rel, model.elements)
      model.relations[r.id] = r
    }
  }

  if (ast.views) {
    for (const vDecl of ast.views.views) {
      model.views[vDecl.id] = convertView(vDecl)
    }
  }

  // Ensure default view
  if (Object.keys(model.views).length === 0) {
    model.views['default'] = {
      id: 'default',
      name: 'Default View',
      type: 'default',
      includedElements: [],
      includedRelations: [],
      includeAll: true,
      includeAllRelations: true,
      layoutMode: 'auto',
      layoutDirection: 'tb',
      filters: [],
      styleOverrides: {},
      layoutPositions: {},
      nodeSizes: {},
    }
  }

  return model
}
