import type { SlideDocument } from '@corporate-slides/core';
import type { ZodError } from 'zod';

export type SourceKind = 'markdown' | 'dsl';

export interface ParseOptions {
  /** Slide dimensions from the corporate master (inches). */
  dimensions?: { width: number; height: number };
}

export interface ParseResult {
  doc: SlideDocument;
  /** Non-fatal problems (French, user-facing). The document contains everything that could be parsed. */
  errors: string[];
}

export function formatZodError(e: ZodError): string {
  return e.issues
    .slice(0, 3)
    .map((i) => `${i.path.join('.') || '(racine)'} : ${i.message}`)
    .join(' ; ');
}
