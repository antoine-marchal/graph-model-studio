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

export type ModelCommand =
  | { type: 'ADD_ELEMENT'; payload: AddElementPayload }
  | { type: 'UPDATE_ELEMENT'; payload: UpdateElementPayload }
  | { type: 'DELETE_ELEMENT'; payload: DeleteElementPayload }
  | { type: 'ADD_RELATION'; payload: AddRelationPayload }
  | { type: 'UPDATE_RELATION'; payload: UpdateRelationPayload }
  | { type: 'DELETE_RELATION'; payload: DeleteRelationPayload }
  | { type: 'ADD_VIEW'; payload: GraphView }
  | { type: 'UPDATE_VIEW'; payload: UpdateViewPayload }
  | { type: 'DELETE_VIEW'; payload: { id: string } }
  | { type: 'APPLY_LAYOUT'; payload: ApplyLayoutPayload }
  | { type: 'SET_NODE_SIZE'; payload: SetNodeSizePayload }
  | { type: 'REPLACE_MODEL'; payload: import('./types').GraphModel }
