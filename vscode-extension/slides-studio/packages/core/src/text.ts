import type { Paragraph, TextRun } from './schema.js';

/**
 * Inline text grammar shared by the DSL `content` strings and Markdown regeneration:
 *   **bold**, *italic*, \* escapes. Anything else is literal text.
 */
export function parseInline(src: string): TextRun[] {
  const runs: TextRun[] = [];
  let bold = false;
  let italic = false;
  let buf = '';
  const flush = () => {
    if (!buf) return;
    const run: TextRun = { text: buf };
    if (bold) run.bold = true;
    if (italic) run.italic = true;
    runs.push(run);
    buf = '';
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (c === '\\' && i + 1 < src.length && /[\\*_#`[\]-]/.test(src[i + 1]!)) {
      buf += src[++i];
    } else if (c === '*' && src[i + 1] === '*') {
      flush();
      bold = !bold;
      i++;
    } else if (c === '*') {
      flush();
      italic = !italic;
    } else {
      buf += c;
    }
  }
  flush();
  return mergeRuns(runs);
}

const escapeText = (t: string): string =>
  t
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/(^|\s)_/g, '$1\\_')
    .replace(/_(?=\s|$)/g, '\\_')
    .replace(/[`[\]]/g, (m) => '\\' + m);

export function formatInline(runs: TextRun[]): string {
  return mergeRuns(runs)
    .map((r) => {
      let t = escapeText(r.text);
      // Keep surrounding spaces outside the markers so the result stays valid Markdown.
      const lead = /^\s*/.exec(t)![0];
      const trail = /\s*$/.exec(t)![0];
      let core = t.trim();
      if (!core) return t;
      if (r.italic) core = `*${core}*`;
      if (r.bold) core = `**${core}**`;
      return lead + core + trail;
    })
    .join('');
}

export function mergeRuns(runs: TextRun[]): TextRun[] {
  const out: TextRun[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const prev = out[out.length - 1];
    if (prev && !!prev.bold === !!r.bold && !!prev.italic === !!r.italic && !!prev.underline === !!r.underline && prev.color === r.color) {
      prev.text += r.text;
    } else out.push({ ...r });
  }
  return out;
}

export const plainText = (p: Paragraph): string => p.runs.map((r) => r.text).join('');

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const HEADING_RE = /^(#{2,6})\s+(.*)$/;

/**
 * DSL `content` string → paragraphs. One line = one paragraph.
 * `- item` / `* item` = bullet, `1. item` = numbered, two spaces of indentation per level,
 * `## text` = bold sub-heading.
 */
export function contentToParagraphs(content: string): Paragraph[] {
  const lines = content.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  return lines.map((line) => {
    const m = LIST_RE.exec(line);
    if (m) {
      const p: Paragraph = { runs: parseInline(m[3]!), list: /\d/.test(m[2]!) ? 'number' : 'bullet' };
      const level = Math.min(4, Math.floor(m[1]!.replace(/\t/g, '  ').length / 2));
      if (level) p.level = level;
      return p;
    }
    const h = HEADING_RE.exec(line);
    if (h) return { runs: parseInline(h[2]!), heading: h[1]!.length };
    return { runs: parseInline(line) };
  });
}

function listMarker(p: Paragraph, index: number, all: Paragraph[]): string {
  if (p.list !== 'number') return '-';
  let n = 1;
  for (let i = index - 1; i >= 0 && all[i]!.list && (all[i]!.level ?? 0) >= (p.level ?? 0); i--) {
    if ((all[i]!.level ?? 0) === (p.level ?? 0)) {
      if (all[i]!.list !== 'number') break;
      n++;
    }
  }
  return `${n}.`;
}

function paragraphLine(p: Paragraph, index: number, all: Paragraph[], indent = '  '.repeat(p.level ?? 0)): string {
  const text = formatInline(p.runs);
  if (p.list) {
    return `${indent}${listMarker(p, index, all)} ${text}`;
  }
  if (p.heading) return `${'#'.repeat(p.heading)} ${text}`;
  // A plain paragraph that would be read back as list/heading must be escaped.
  return /^(\s*([-*+]|\d+[.)])\s|#)/.test(text) ? '\\' + text : text;
}

/** Paragraphs → DSL `content` string (inverse of `contentToParagraphs`). */
export function paragraphsToContent(paragraphs: Paragraph[]): string {
  return paragraphs.map((p, i) => paragraphLine(p, i, paragraphs)).join('\n');
}

/** Paragraphs → Markdown blocks (blank lines between paragraphs, compact lists). */
export function paragraphsToMarkdown(paragraphs: Paragraph[]): string {
  let out = '';
  // CommonMark nests a list item under its parent's content column, so indentation
  // depends on the parent markers' widths ("- " = 2, "1. " = 3).
  const columns: number[] = [];
  paragraphs.forEach((p, i) => {
    let indent = '';
    if (p.list) {
      const level = Math.min(p.level ?? 0, columns.length);
      columns.length = level;
      indent = ' '.repeat(columns.reduce((a, b) => a + b, 0));
      columns.push(listMarker(p, i, paragraphs).length + 1);
    } else columns.length = 0;
    const line = paragraphLine(p, i, paragraphs, indent);
    if (i > 0) {
      const prev = paragraphs[i - 1]!;
      out += prev.list && p.list ? '\n' : '\n\n';
    }
    out += line;
  });
  return out;
}

/** True when paragraphs only use what `content` strings can express. */
export const isPlainRepresentable = (paragraphs: Paragraph[]): boolean =>
  paragraphs.every((p) => p.runs.every((r) => !r.underline && !r.color));
