import { z } from 'zod'

// ─── Notation kinds ──────────────────────────────────────────────────────────

export const NotationKindSchema = z.enum([
  'c4',
  'archimate',
  'bpmn',
  'flowchart',
  'usecase',
  'tree',
  'pert',
  'gantt',
  'sequence',
  'mindmap',
  'gitgraph',
  'ishikawa',
  'quadrant',
  'timeline',
  'generic',
])
export type NotationKind = z.infer<typeof NotationKindSchema>

// ─── Element types ───────────────────────────────────────────────────────────

export const C4ElementTypes = [
  'person',
  'softwareSystem',
  'container',
  'component',
  'codeElement',
] as const

export const ArchiMateElementTypes = [
  'businessActor',
  'businessRole',
  'businessProcess',
  'applicationComponent',
  'applicationService',
  'dataObject',
  'technologyNode',
  'device',
  'systemSoftware',
  'artifact',
] as const

export const BpmnElementTypes = [
  'startEvent',
  'endEvent',
  'task',
  'userTask',
  'serviceTask',
  'gateway',
  'exclusiveGateway',
  'parallelGateway',
  'pool',
  'lane',
] as const

export const FlowchartElementTypes = [
  'start',
  'end',
  'process',
  'decision',
  'inputOutput',
  'connector',
] as const

export const UseCaseElementTypes = ['actor', 'useCase', 'systemBoundary'] as const

export const TreeElementTypes = ['treeGraph', 'treeRoot', 'treeNode', 'treeLeaf'] as const

export const PertElementTypes = ['pertTask', 'pertMilestone'] as const

export const GanttElementTypes = ['ganttGraph', 'ganttTask', 'ganttMilestone', 'ganttSection'] as const

export const SequenceElementTypes = ['seqGraph', 'participant', 'seqActor'] as const

export const MindmapElementTypes = ['mindmapRoot', 'mindmapNode'] as const

export const GitGraphElementTypes = ['gitGraph', 'commit', 'mergeCommit'] as const

export const IshikawaElementTypes = ['problem', 'cause', 'subCause'] as const

export const QuadrantElementTypes = ['quadrantChart', 'quadrantItem'] as const

export const TimelineElementTypes = ['timelineGraph', 'timelineEvent'] as const

export const GenericElementTypes = ['node', 'group', 'external'] as const

export type C4ElementType = (typeof C4ElementTypes)[number]
export type ArchiMateElementType = (typeof ArchiMateElementTypes)[number]
export type BpmnElementType = (typeof BpmnElementTypes)[number]
export type FlowchartElementType = (typeof FlowchartElementTypes)[number]
export type UseCaseElementType = (typeof UseCaseElementTypes)[number]
export type TreeElementType = (typeof TreeElementTypes)[number]
export type PertElementType = (typeof PertElementTypes)[number]
export type GanttElementType = (typeof GanttElementTypes)[number]
export type SequenceElementType = (typeof SequenceElementTypes)[number]
export type MindmapElementType = (typeof MindmapElementTypes)[number]
export type GitGraphElementType = (typeof GitGraphElementTypes)[number]
export type IshikawaElementType = (typeof IshikawaElementTypes)[number]
export type QuadrantElementType = (typeof QuadrantElementTypes)[number]
export type TimelineElementType = (typeof TimelineElementTypes)[number]
export type GenericElementType = (typeof GenericElementTypes)[number]

export type ElementType =
  | C4ElementType
  | ArchiMateElementType
  | BpmnElementType
  | FlowchartElementType
  | UseCaseElementType
  | TreeElementType
  | PertElementType
  | GanttElementType
  | SequenceElementType
  | MindmapElementType
  | GitGraphElementType
  | IshikawaElementType
  | QuadrantElementType
  | TimelineElementType
  | GenericElementType

// ─── Relation types ──────────────────────────────────────────────────────────

export type RelationType =
  | 'rel'
  | 'composition'
  | 'aggregation'
  | 'assignment'
  | 'realization'
  | 'serving'
  | 'access'
  | 'triggering'
  | 'flow'
  | 'influence'
  | 'specialization'
  | 'association'
  | 'sequenceFlow'
  | 'messageFlow'
  | 'include'
  | 'extend'
  | 'generalization'
  | 'branch'
  | 'dependsOn'
  | 'message'
  | 'asyncMessage'
  | 'replyMessage'

// ─── Layout ──────────────────────────────────────────────────────────────────

export const LayoutDirectionSchema = z.enum(['lr', 'rl', 'tb', 'bt'])
export type LayoutDirection = z.infer<typeof LayoutDirectionSchema>

export const LayoutModeSchema = z.enum(['auto', 'manual', 'fixed'])
export type LayoutMode = z.infer<typeof LayoutModeSchema>

// ─── Core graph entities ─────────────────────────────────────────────────────

export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
})
export type Position = z.infer<typeof PositionSchema>

export const SizeSchema = z.object({
  width: z.number(),
  height: z.number(),
})
export type Size = z.infer<typeof SizeSchema>

export const GraphElementSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  notation: NotationKindSchema,
  description: z.string().optional(),
  technology: z.string().optional(),
  tags: z.array(z.string()).default([]),
  properties: z.record(z.string()).default({}),
  parentId: z.string().optional(),
  children: z.array(z.string()).default([]),
  position: PositionSchema.optional(),
  size: SizeSchema.optional(),
})
export type GraphElement = z.infer<typeof GraphElementSchema>

export const GraphRelationSchema = z.object({
  id: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
  type: z.string().default('rel'),
  label: z.string().optional(),
  notation: NotationKindSchema,
  direction: z.enum(['directed', 'undirected', 'bidirectional']).default('directed'),
  tags: z.array(z.string()).default([]),
  properties: z.record(z.string()).default({}),
  /** pinned anchor side on the source/target node ('t'|'b'|'l'|'r'); undefined = floating */
  sourceHandle: z.enum(['t', 'b', 'l', 'r']).optional(),
  targetHandle: z.enum(['t', 'b', 'l', 'r']).optional(),
})
export type GraphRelation = z.infer<typeof GraphRelationSchema>

export const GraphViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().default('default'),
  notation: NotationKindSchema.optional(),
  description: z.string().optional(),
  includedElements: z.array(z.string()).default([]),
  /** relation visibility keys "sourceId>targetId" (used when includeAllRelations is false) */
  includedRelations: z.array(z.string()).default([]),
  includeAll: z.boolean().default(false),
  /** when true (default) every relation between visible elements is shown */
  includeAllRelations: z.boolean().default(true),
  layoutMode: LayoutModeSchema.default('auto'),
  layoutDirection: LayoutDirectionSchema.default('tb'),
  filters: z.array(z.string()).default([]),
  styleOverrides: z.record(z.unknown()).default({}),
  layoutPositions: z.record(PositionSchema).default({}),
  /** per-view manual node sizes (size belongs to a view, not the element) */
  nodeSizes: z.record(SizeSchema).default({}),
})
export type GraphView = z.infer<typeof GraphViewSchema>

export const GraphModelMetadataSchema = z.object({
  title: z.string().default('Untitled Model'),
  description: z.string().optional(),
  author: z.string().optional(),
  version: z.string().default('1.0.0'),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})
export type GraphModelMetadata = z.infer<typeof GraphModelMetadataSchema>

export const DiagnosticSchema = z.object({
  severity: z.enum(['error', 'warning', 'info']),
  message: z.string(),
  line: z.number().optional(),
  column: z.number().optional(),
  source: z.string().optional(),
})
export type Diagnostic = z.infer<typeof DiagnosticSchema>

export const GraphModelSchema = z.object({
  metadata: GraphModelMetadataSchema,
  elements: z.record(GraphElementSchema),
  relations: z.record(GraphRelationSchema),
  views: z.record(GraphViewSchema),
  diagnostics: z.array(DiagnosticSchema).default([]),
})
export type GraphModel = z.infer<typeof GraphModelSchema>

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function createEmptyModel(title = 'Untitled Model'): GraphModel {
  return {
    metadata: {
      title,
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    elements: {},
    relations: {},
    views: {},
    diagnostics: [],
  }
}

export function createDefaultView(): GraphView {
  return {
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
