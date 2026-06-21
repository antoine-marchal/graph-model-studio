import { tokenize } from './lexer'
import { Parser, type ParseResult } from './parser'
import { astToModel } from './ast-to-model'
import type { GraphModel } from '../../model'
import type { Diagnostic } from '../../model'

export { tokenize, Parser, astToModel }
export type { ParseResult }

export interface DslParseResult {
  model: GraphModel | null
  diagnostics: Diagnostic[]
  success: boolean
}

export function parseDsl(source: string): DslParseResult {
  try {
    const tokens = tokenize(source)
    const parser = new Parser(tokens)
    const result = parser.parse()

    const diagnostics: Diagnostic[] = result.errors.map(e => ({
      severity: 'error' as const,
      message: e.message,
      line: e.line,
      column: e.column,
      source: 'parser',
    }))

    if (!result.ast) {
      return { model: null, diagnostics, success: false }
    }

    const model = astToModel(result.ast)
    model.diagnostics = diagnostics

    return {
      model,
      diagnostics,
      success: diagnostics.filter(d => d.severity === 'error').length === 0,
    }
  } catch (err) {
    return {
      model: null,
      diagnostics: [{
        severity: 'error',
        message: err instanceof Error ? err.message : String(err),
        source: 'parser',
      }],
      success: false,
    }
  }
}
