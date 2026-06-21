export interface AstPosition {
  line: number
  column: number
  offset: number
}

export interface AstSpan {
  start: AstPosition
  end: AstPosition
}

export interface AstNode {
  kind: string
  span?: AstSpan
}

// ─── Leaf values ─────────────────────────────────────────────────────────────

export interface AstIdentifier extends AstNode {
  kind: 'Identifier'
  name: string
}

export interface AstString extends AstNode {
  kind: 'String'
  value: string
}

export interface AstProperty extends AstNode {
  kind: 'Property'
  key: string
  value: string
}

// ─── Model block ─────────────────────────────────────────────────────────────

export interface AstElementDecl extends AstNode {
  kind: 'ElementDecl'
  id: string
  elementType: string
  label: string
  description?: string
  technology?: string
  tags: string[]
  properties: AstProperty[]
  children: AstElementDecl[]
  size?: { width: number; height: number }
}

export interface AstRelationDecl extends AstNode {
  kind: 'RelationDecl'
  sourceId: string
  targetId: string
  relationType?: string
  label?: string
  tags: string[]
  properties: AstProperty[]
  sourceHandle?: string
  targetHandle?: string
}

export interface AstModelBlock extends AstNode {
  kind: 'ModelBlock'
  elements: AstElementDecl[]
  relations: AstRelationDecl[]
}

// ─── Views block ─────────────────────────────────────────────────────────────

export interface AstIncludeDirective extends AstNode {
  kind: 'IncludeDirective'
  pattern: string
}

export interface AstAutolayoutDirective extends AstNode {
  kind: 'AutolayoutDirective'
  direction: string
}

export interface AstNodePosition {
  id: string
  x: number
  y: number
}

export interface AstViewDecl extends AstNode {
  kind: 'ViewDecl'
  id: string
  label?: string
  ofTarget?: string
  includes: AstIncludeDirective[]
  autolayout?: AstAutolayoutDirective
  properties: AstProperty[]
  positions: AstNodePosition[]
}

export interface AstViewsBlock extends AstNode {
  kind: 'ViewsBlock'
  views: AstViewDecl[]
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export interface AstRoot extends AstNode {
  kind: 'Root'
  model?: AstModelBlock
  views?: AstViewsBlock
}
