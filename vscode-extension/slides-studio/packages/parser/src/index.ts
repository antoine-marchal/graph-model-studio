import type { Mutation, SlideDocument } from '@corporate-slides/core';
import { applyDslMutations, parseDsl } from './dsl.js';
import { applyMarkdownMutations, parseMarkdown } from './markdown.js';
import type { ParseOptions, ParseResult, SourceKind } from './types.js';

export * from './types.js';
export { parseDsl, applyDslMutations, documentToDsl, elementToDsl, dslToElement } from './dsl.js';
export { parseMarkdown, applyMarkdownMutations, buildMdModel } from './markdown.js';

export function sourceKindOf(fileName: string): SourceKind | null {
  if (/\.(slides\.md|deck)$/i.test(fileName)) return 'markdown';
  if (/\.slides\.(ya?ml|json)$/i.test(fileName)) return 'dsl';
  return null;
}

/** Kind of a file opened explicitly as a presentation: any Markdown file reads as a Markdown deck. */
export function presentationKind(fileName: string): SourceKind | null {
  return sourceKindOf(fileName) ?? (/\.(md|markdown)$/i.test(fileName) ? 'markdown' : null);
}

/** Parse a presentation source. JSON sources are parsed by the YAML parser (JSON ⊂ YAML 1.2). */
export function parseSource(text: string, kind: SourceKind, opts: ParseOptions = {}): ParseResult {
  return kind === 'markdown' ? parseMarkdown(text, opts) : parseDsl(text, opts);
}

/**
 * Apply typed mutations to the source text and return the new text.
 * Throws `MutationError` when a mutation cannot be represented — edits are never silently dropped.
 */
export function applyMutations(text: string, kind: SourceKind, mutations: Mutation[], opts: ParseOptions = {}): string {
  if (kind === 'markdown') return applyMarkdownMutations(text, mutations, opts);
  return applyDslMutations(text, parseDsl(text, opts).doc, mutations);
}

/** Strip computed `source` refs so documents can be compared structurally. */
export function withoutSource(doc: SlideDocument): SlideDocument {
  return JSON.parse(JSON.stringify(doc, (k, v) => (k === 'source' ? undefined : v)));
}
