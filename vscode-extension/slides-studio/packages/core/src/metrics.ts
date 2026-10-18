import type { Paragraph } from './schema.js';
import { paragraphLook, type ResolvedElement } from './geometry.js';
import { plainText } from './text.js';

/**
 * Text fitting policy shared by the validator, the webview overflow badge and the export report.
 *
 * The browser renders with real font metrics; PowerPoint uses its own engine. This module is a
 * deliberately simple, deterministic *estimate* (average advance width per family, greedy word
 * wrap, line height = 1.2 × size × spacing) used to flag probable overflow, not to lay out text.
 */
const AVG_ADVANCE_EM: Record<string, number> = {
  arial: 0.52,
  'arial black': 0.66,
  'arial narrow': 0.43,
  calibri: 0.47,
  'calibri light': 0.46,
  helvetica: 0.52,
  verdana: 0.58,
  tahoma: 0.52,
  'segoe ui': 0.5,
  'times new roman': 0.45,
  georgia: 0.5,
};
const DEFAULT_ADVANCE_EM = 0.52;
export const LINE_HEIGHT = 1.2;

export function advanceEm(fontFace: string, bold: boolean): number {
  const base = AVG_ADVANCE_EM[fontFace.toLowerCase()] ?? DEFAULT_ADVANCE_EM;
  return bold ? base * 1.07 : base;
}

export function knownMetrics(fontFace: string): boolean {
  return fontFace.toLowerCase() in AVG_ADVANCE_EM;
}

/** Estimated number of wrapped lines for a paragraph in a box `widthIn` inches wide. */
export function estimateLines(text: string, fontSizePt: number, fontFace: string, bold: boolean, widthIn: number): number {
  const charW = (fontSizePt / 72) * advanceEm(fontFace, bold);
  const maxChars = Math.max(1, Math.floor(widthIn / charW));
  let lines = 1;
  let col = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const len = word.length;
    if (col === 0) {
      lines += Math.floor(Math.max(0, len - 1) / maxChars);
      col = len % maxChars || maxChars;
    } else if (col + 1 + len <= maxChars) col += 1 + len;
    else {
      lines += 1 + Math.floor(Math.max(0, len - 1) / maxChars);
      col = len % maxChars || maxChars;
    }
  }
  return lines;
}

export interface FitEstimate {
  requiredHeight: number;
  availableHeight: number;
  overflows: boolean;
}

/** Estimate whether a text-bearing element's paragraphs fit in its box. */
export function estimateFit(r: ResolvedElement, paragraphs: Paragraph[]): FitEstimate {
  const [mt, mr, mb, ml] = r.style.margin;
  const availableHeight = Math.max(0, r.box.h - mt - mb);
  let required = 0;
  for (const p of paragraphs) {
    const look = paragraphLook(r, p);
    const width = Math.max(0.1, r.box.w - ml - mr - look.indent);
    const bold = look.bold || p.runs.some((x) => x.bold);
    const size = Math.max(look.fontSize, ...p.runs.map((x) => x.size ?? 0));
    const lines = estimateLines(plainText(p) || ' ', size, r.style.fontFace, bold, width);
    required += (lines * size * LINE_HEIGHT * r.style.lineSpacing) / 72;
  }
  return { requiredHeight: required, availableHeight, overflows: required > availableHeight + 0.02 };
}
