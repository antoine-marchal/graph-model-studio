import type { Token } from './lexer'
import type {
  AstRoot,
  AstModelBlock,
  AstElementDecl,
  AstRelationDecl,
  AstViewsBlock,
  AstViewDecl,
  AstIncludeDirective,
  AstAutolayoutDirective,
  AstProperty,
  AstNodePosition,
  AstNodeSize,
} from '../ast'

export interface ParseError {
  message: string
  line: number
  column: number
}

export interface ParseResult {
  ast: AstRoot | null
  errors: ParseError[]
}

export class Parser {
  private pos = 0
  private readonly errors: ParseError[] = []

  constructor(private readonly tokens: Token[]) {}

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]
  }

  private advance(): Token {
    const t = this.tokens[this.pos]
    if (this.pos < this.tokens.length - 1) this.pos++
    return t
  }

  private check(...kinds: string[]): boolean {
    return kinds.includes(this.peek().kind) || kinds.includes(this.peek().value)
  }

  private eat(...kinds: string[]): Token | null {
    if (this.check(...kinds)) return this.advance()
    return null
  }

  private expect(kind: string, value?: string): Token | null {
    const t = this.peek()
    if (t.kind === kind || t.value === kind || (value !== undefined && t.value === value)) {
      return this.advance()
    }
    this.errors.push({
      message: `Expected '${value ?? kind}' but got '${t.value}'`,
      line: t.line,
      column: t.column,
    })
    return null
  }

  private isIdent(): boolean {
    const t = this.peek()
    return t.kind === 'IDENT' || t.kind === 'KEYWORD'
  }

  private eatIdent(): Token | null {
    if (this.isIdent()) return this.advance()
    return null
  }

  private eatNumber(): number | null {
    if (this.peek().kind === 'NUMBER') return parseFloat(this.advance().value)
    return null
  }

  parse(): ParseResult {
    const ast = this.parseRoot()
    return { ast, errors: this.errors }
  }

  private parseRoot(): AstRoot {
    let model: AstModelBlock | undefined
    let views: AstViewsBlock | undefined

    while (!this.check('EOF')) {
      if (this.check('model') || (this.peek().kind === 'IDENT' && this.peek().value === 'model')) {
        this.advance()
        model = this.parseModelBlock()
      } else if (this.check('views')) {
        this.advance()
        views = this.parseViewsBlock()
      } else {
        // skip unknown token
        this.advance()
      }
    }

    return { kind: 'Root', model, views }
  }

  private parseModelBlock(): AstModelBlock {
    const elements: AstElementDecl[] = []
    const relations: AstRelationDecl[] = []

    this.expect('LBRACE', '{')

    while (!this.check('RBRACE') && !this.check('EOF')) {
      // Check for relation: ident -> ident or ident.path -> ident.path
      if (this.isRelationDecl()) {
        const rel = this.parseRelationDecl()
        if (rel) relations.push(rel)
      } else if (this.isIdent()) {
        const elem = this.parseElementDecl()
        if (elem) elements.push(elem)
      } else {
        this.advance()
      }
    }

    this.expect('RBRACE', '}')
    return { kind: 'ModelBlock', elements, relations }
  }

  private isRelationDecl(): boolean {
    // Look ahead: ident (. ident)* ->
    let i = 0
    while (
      (this.peek(i).kind === 'IDENT' || this.peek(i).kind === 'KEYWORD') ||
      this.peek(i).kind === 'DOT'
    ) {
      if (this.peek(i).kind === 'ARROW') break
      i++
      if (i > 10) break
    }
    // Now check if we see ARROW
    for (let j = 0; j <= i + 2; j++) {
      if (this.peek(j).kind === 'ARROW') return true
      if (this.peek(j).kind === 'EOF' || this.peek(j).kind === 'LBRACE' || this.peek(j).kind === 'RBRACE') break
    }
    return false
  }

  private parseQualifiedIdent(): string {
    let id = this.eatIdent()?.value ?? ''
    while (this.check('DOT')) {
      this.advance()
      const part = this.eatIdent()
      if (part) id += '.' + part.value
    }
    return id
  }

  private parseRelationDecl(): AstRelationDecl | null {
    const sourceId = this.parseQualifiedIdent()
    if (!this.eat('ARROW')) return null
    const targetId = this.parseQualifiedIdent()

    // optional : relationType
    let relationType: string | undefined
    if (this.check('COLON')) {
      this.advance()
      relationType = this.eatIdent()?.value
    }

    // optional label string
    let label: string | undefined
    if (this.peek().kind === 'STRING') {
      label = this.advance().value
    }

    // optional : relationType after label too (tolerate either order)
    if (this.check('COLON') && !relationType) {
      this.advance()
      relationType = this.eatIdent()?.value
    }

    // optional direction keyword (directed | undirected | bidirectional)
    let direction: string | undefined
    if (['directed', 'undirected', 'bidirectional'].includes(this.peek().value)) {
      direction = this.advance().value
    }

    // optional anchor <source> <target> — pinned edge endpoints ('t'|'b'|'l'|'r'|'_')
    let sourceHandle: string | undefined
    let targetHandle: string | undefined
    if (this.peek().value === 'anchor') {
      this.advance()
      const s = this.eatIdent()?.value
      const t = this.eatIdent()?.value
      if (s && s !== '_') sourceHandle = s
      if (t && t !== '_') targetHandle = t
    }

    const tags: string[] = []
    const properties: AstProperty[] = []

    // optional block
    if (this.check('LBRACE')) {
      this.advance()
      while (!this.check('RBRACE') && !this.check('EOF')) {
        const inner = this.parseBodyDirective()
        if (inner?.kind === 'Property') properties.push(inner as AstProperty)
        else this.advance()
      }
      this.eat('RBRACE')
    }

    return { kind: 'RelationDecl', sourceId, targetId, relationType, label, direction, tags, properties, sourceHandle, targetHandle }
  }

  private parseElementDecl(): AstElementDecl | null {
    // id = type "label"  OR  type "label"  OR  id = type "label" { ... }
    const first = this.eatIdent()
    if (!first) return null

    let id: string
    let elementType: string

    if (this.check('EQ')) {
      // id = type "label"
      this.advance()
      id = first.value
      elementType = this.eatIdent()?.value ?? 'node'
    } else {
      // type "label" — use generated id
      elementType = first.value
      id = elementType + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
    }

    // label
    let label = id
    if (this.peek().kind === 'STRING') {
      label = this.advance().value
    }

    let description: string | undefined
    let technology: string | undefined
    let size: { width: number; height: number } | undefined
    const tags: string[] = []
    const properties: AstProperty[] = []
    const children: AstElementDecl[] = []

    // optional body block
    if (this.check('LBRACE')) {
      this.advance()

      while (!this.check('RBRACE') && !this.check('EOF')) {
        if (this.isRelationDecl()) {
          // nested relations not collected here — skip for now
          this.skipToEndOfStatement()
        } else if (this.check('description')) {
          this.advance()
          if (this.peek().kind === 'STRING') description = this.advance().value
        } else if (this.check('technology')) {
          this.advance()
          if (this.peek().kind === 'STRING') technology = this.advance().value
        } else if (this.peek().value === 'size' && this.peek(1).kind === 'NUMBER') {
          this.advance()
          const w = this.eatNumber()
          const h = this.eatNumber()
          if (w != null && h != null) size = { width: w, height: h }
        } else if (this.check('tags')) {
          this.advance()
          while (this.peek().kind === 'STRING') {
            tags.push(this.advance().value)
          }
        } else if (this.isIdent()) {
          // nested element or property
          const saved = this.pos
          const child = this.parseElementDecl()
          if (child) {
            children.push(child)
          } else {
            this.pos = saved
            this.advance()
          }
        } else {
          this.advance()
        }
      }

      this.eat('RBRACE')
    }

    return {
      kind: 'ElementDecl',
      id,
      elementType,
      label,
      description,
      technology,
      tags,
      properties,
      children,
      size,
    }
  }

  private parseBodyDirective(): AstProperty | null {
    if (!this.isIdent()) return null
    const key = this.eatIdent()!.value
    let value = ''
    if (this.peek().kind === 'STRING') {
      value = this.advance().value
    } else if (this.isIdent()) {
      value = this.eatIdent()!.value
    }
    return { kind: 'Property', key, value }
  }

  private skipToEndOfStatement() {
    let depth = 0
    while (!this.check('EOF')) {
      const t = this.peek()
      if (t.kind === 'LBRACE') depth++
      else if (t.kind === 'RBRACE') {
        if (depth === 0) break
        depth--
      }
      this.advance()
      if (depth === 0 && (t.kind === 'RBRACE' || t.kind === 'NEWLINE')) break
    }
  }

  private parseViewsBlock(): AstViewsBlock {
    const views: AstViewDecl[] = []
    this.expect('LBRACE', '{')

    while (!this.check('RBRACE') && !this.check('EOF')) {
      if (this.check('view')) {
        this.advance()
        const v = this.parseViewDecl()
        if (v) views.push(v)
      } else {
        this.advance()
      }
    }

    this.expect('RBRACE', '}')
    return { kind: 'ViewsBlock', views }
  }

  private parseViewDecl(): AstViewDecl | null {
    const id = this.eatIdent()?.value
    if (!id) return null

    let label: string | undefined
    let ofTarget: string | undefined

    if (this.peek().kind === 'STRING') {
      label = this.advance().value
    }

    if (this.check('of')) {
      this.advance()
      ofTarget = this.parseQualifiedIdent()
    }

    const includes: AstIncludeDirective[] = []
    let autolayout: AstAutolayoutDirective | undefined
    const properties: AstProperty[] = []
    const positions: AstNodePosition[] = []
    const sizes: AstNodeSize[] = []

    this.expect('LBRACE', '{')

    while (!this.check('RBRACE') && !this.check('EOF')) {
      // "<id> at <x> <y>" — persisted node position for this view
      if (this.isIdent() && this.peek(1).value === 'at' && this.peek(2).kind === 'NUMBER') {
        const pid = this.parseQualifiedIdent()
        this.advance() // 'at'
        const x = this.eatNumber()
        const y = this.eatNumber()
        if (x != null && y != null) positions.push({ id: pid, x, y })
        continue
      }
      // "<id> size <w> <h>" — per-view manual node size
      if (this.isIdent() && this.peek(1).value === 'size' && this.peek(2).kind === 'NUMBER') {
        const sid = this.parseQualifiedIdent()
        this.advance() // 'size'
        const w = this.eatNumber()
        const h = this.eatNumber()
        if (w != null && h != null) sizes.push({ id: sid, width: w, height: h })
        continue
      }
      if (this.check('include') || this.peek().value === 'include_relations') {
        const isRel = this.peek().value === 'include_relations'
        this.advance()
        const target = isRel ? 'relation' as const : 'element' as const
        // comma-separated list: "include a, b" === "include a" + "include b"
        this.parseIncludeItem(isRel, target, includes)
        while (this.check('COMMA')) {
          this.advance()
          this.parseIncludeItem(isRel, target, includes)
        }
      } else if (this.check('autolayout')) {
        this.advance()
        const dir = this.isIdent() ? this.eatIdent()!.value : 'tb'
        autolayout = { kind: 'AutolayoutDirective', direction: dir }
      } else if (this.isIdent()) {
        const prop = this.parseBodyDirective()
        if (prop) properties.push(prop)
      } else {
        this.advance()
      }
    }

    this.expect('RBRACE', '}')
    return { kind: 'ViewDecl', id, label, ofTarget, includes, autolayout, properties, positions, sizes }
  }

  /** Parse one include pattern (the part after `include` / a comma). */
  private parseIncludeItem(
    isRel: boolean,
    target: 'relation' | 'element',
    includes: AstIncludeDirective[],
  ): void {
    if (this.check('STAR')) {
      this.advance()
      includes.push({ kind: 'IncludeDirective', pattern: '*', target })
    } else if (isRel && this.isRelationDecl()) {
      // include_relations src -> tgt  → stored as the "src>tgt" visibility key
      const src = this.parseQualifiedIdent()
      this.eat('ARROW')
      const tgt = this.parseQualifiedIdent()
      includes.push({ kind: 'IncludeDirective', pattern: `${src}>${tgt}`, target })
    } else if (this.isIdent()) {
      let pattern = this.parseQualifiedIdent()
      // "<id>.*" — the trailing dot is lexed into the ident, followed by STAR
      if (pattern.endsWith('.') && this.check('STAR')) {
        this.advance()
        pattern += '*'
      } else if (this.check('DOT')) {
        this.advance()
        if (this.check('STAR')) { this.advance(); pattern += '.*' }
      }
      includes.push({ kind: 'IncludeDirective', pattern, target })
    }
  }
}
