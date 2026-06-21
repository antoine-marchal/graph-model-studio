export type TokenKind =
  | 'LBRACE'
  | 'RBRACE'
  | 'ARROW'
  | 'COLON'
  | 'DOT'
  | 'EQ'
  | 'STAR'
  | 'STRING'
  | 'NUMBER'
  | 'IDENT'
  | 'KEYWORD'
  | 'EOF'
  | 'NEWLINE'

export interface Token {
  kind: TokenKind
  value: string
  line: number
  column: number
  offset: number
}

const KEYWORDS = new Set([
  'model',
  'views',
  'view',
  'include',
  'autolayout',
  'of',
  'description',
  'technology',
  'tags',
  'properties',
  'archimate',
  'bpmn',
  'flowchart',
])

export function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let pos = 0
  let line = 1
  let col = 1

  function peek(offset = 0): string {
    return source[pos + offset] ?? ''
  }

  function advance(): string {
    const ch = source[pos++]
    if (ch === '\n') {
      line++
      col = 1
    } else {
      col++
    }
    return ch
  }

  function skipWhitespaceAndComments() {
    while (pos < source.length) {
      const ch = peek()
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        advance()
      } else if (ch === '/' && peek(1) === '/') {
        while (pos < source.length && peek() !== '\n') advance()
      } else {
        break
      }
    }
  }

  while (pos < source.length) {
    skipWhitespaceAndComments()
    if (pos >= source.length) break

    const startLine = line
    const startCol = col
    const startOffset = pos
    const ch = peek()

    if (ch === '{') {
      advance()
      tokens.push({ kind: 'LBRACE', value: '{', line: startLine, column: startCol, offset: startOffset })
    } else if (ch === '}') {
      advance()
      tokens.push({ kind: 'RBRACE', value: '}', line: startLine, column: startCol, offset: startOffset })
    } else if (ch === ':') {
      advance()
      tokens.push({ kind: 'COLON', value: ':', line: startLine, column: startCol, offset: startOffset })
    } else if (ch === '.') {
      advance()
      tokens.push({ kind: 'DOT', value: '.', line: startLine, column: startCol, offset: startOffset })
    } else if (ch === '=') {
      advance()
      tokens.push({ kind: 'EQ', value: '=', line: startLine, column: startCol, offset: startOffset })
    } else if (ch === '*') {
      advance()
      tokens.push({ kind: 'STAR', value: '*', line: startLine, column: startCol, offset: startOffset })
    } else if (ch === '-' && peek(1) === '>') {
      advance(); advance()
      tokens.push({ kind: 'ARROW', value: '->', line: startLine, column: startCol, offset: startOffset })
    } else if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(peek(1)))) {
      let num = advance() // consume sign or first digit
      while (pos < source.length && /[0-9.]/.test(peek())) num += advance()
      tokens.push({ kind: 'NUMBER', value: num, line: startLine, column: startCol, offset: startOffset })
    } else if (ch === '"') {
      advance()
      let str = ''
      while (pos < source.length && peek() !== '"') {
        if (peek() === '\\') { advance(); str += advance() }
        else str += advance()
      }
      if (pos < source.length) advance() // closing "
      tokens.push({ kind: 'STRING', value: str, line: startLine, column: startCol, offset: startOffset })
    } else if (/[a-zA-Z_]/.test(ch)) {
      let word = ''
      while (pos < source.length && /[a-zA-Z0-9_.]/.test(peek())) {
        word += advance()
      }
      const kind: TokenKind = KEYWORDS.has(word) ? 'KEYWORD' : 'IDENT'
      tokens.push({ kind, value: word, line: startLine, column: startCol, offset: startOffset })
    } else {
      // skip unknown char
      advance()
    }
  }

  tokens.push({ kind: 'EOF', value: '', line, column: col, offset: pos })
  return tokens
}
