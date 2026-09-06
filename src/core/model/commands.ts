import type { GraphElement, GraphRelation, GraphView, Position, Size } from './types'

export type AddElementPayload = Omit<GraphElement, 'children' | 'tags' | 'properties'> &
  Partial<Pick<GraphElement, 'children' | 'tags' | 'properties'>>

export type UpdateElementPayload = { id: string } & Partial<Omit<GraphElement, 'id'>>

export type DeleteElementPayload = { id: string }

export type AddRelationPayload = Omit<GraphRelation, 'tags' | 'properties' | 'direction' | 'type'> &
  Partial<Pick<GraphRelation, 'tags' | 'properties' | 'direction' | 'type'>>

export type UpdateRelationPayload = { id: string } & Partial<Omit<GraphRelation, 'id'>>

export type DeleteRelationPayload = { id: string }

export type UpdateViewPayload = { id: string } & Partial<Omit<GraphView, 'id'>>

export type ApplyLayoutPayload = {
  viewId: string
  positions: Record<string, Position>
}

export type SetNodeSizePayload = {
  viewId: string
  id: string
  size: Size
}

export type ResizeNodesPayload = {
  viewId: string
  sizes: Record<string, Size>
  positions: Record<string, Position>
  /** Optional element-property updates committed atomically with the resize. */
  elementProperties?: Record<string, Record<string, string>>
}

export type ReparentElementPayload = {
  viewId: string
  id: string
  parentId?: string
  position: Position
}

export type ApplyElementFormatPayload = {
  viewId: string
  id: string
  properties: Record<string, string>
  size: Size
}

export type ApplyRelationFormatPayload = {
  id: string
  type: string
  direction: GraphRelation['direction']
  sourceHandle?: GraphRelation['sourceHandle']
  targetHandle?: GraphRelation['targetHandle']
  properties: Record<string, string>
}

export type ReplaceXySeriesPointsPayload = {
  seriesId: string
  points: { x: number; y: number; size?: number }[]
}

export type ModelCommand =
  | { type: 'ADD_ELEMENT'; payload: AddElementPayload }
  | { type: 'UPDATE_ELEMENT'; payload: UpdateElementPayload }
  | { type: 'DELETE_ELEMENT'; payload: DeleteElementPayload }
  | { type: 'DELETE_ELEMENTS'; payload: { ids: string[] } }
  | { type: 'ADD_RELATION'; payload: AddRelationPayload }
  | { type: 'UPDATE_RELATION'; payload: UpdateRelationPayload }
  | { type: 'REORDER_RELATION'; payload: { id: string; targetId: string; position: 'before' | 'after' } }
  | { type: 'DELETE_RELATION'; payload: DeleteRelationPayload }
  | { type: 'DELETE_RELATIONS'; payload: { ids: string[] } }
  | { type: 'ADD_VIEW'; payload: GraphView }
  | { type: 'UPDATE_VIEW'; payload: UpdateViewPayload }
  | { type: 'DELETE_VIEW'; payload: { id: string } }
  | { type: 'APPLY_LAYOUT'; payload: ApplyLayoutPayload }
  | { type: 'SET_NODE_SIZE'; payload: SetNodeSizePayload }
  | { type: 'RESIZE_NODES'; payload: ResizeNodesPayload }
  | { type: 'REPARENT_ELEMENT'; payload: ReparentElementPayload }
  | { type: 'APPLY_ELEMENT_FORMAT'; payload: ApplyElementFormatPayload }
  | { type: 'APPLY_RELATION_FORMAT'; payload: ApplyRelationFormatPayload }
  | { type: 'REPLACE_XY_SERIES_POINTS'; payload: ReplaceXySeriesPointsPayload }
  | { type: 'REPLACE_MODEL'; payload: import('./types').GraphModel }
