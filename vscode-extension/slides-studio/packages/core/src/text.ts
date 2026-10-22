import type { Paragraph, TextRun } from './schema.js';

/*
 * Inline text grammar shared by the DSL `content` strings and Markdown regeneration:
 *   **bold**, *italic*, \* escapes, and `[text]{color=theme.accent2 size=24 font="Segoe UI" underline}`
 *   spans for every other character format. Paragraph formats (and a format shared by all the runs
 *   of consecutive paragraphs) are written by `paragraphsToMarkdown` as `::: {align=center}` blocks.
 */

/** Attributes of a span or a block: `key=value`, `key="quoted value"` or a bare flag. */
export type Attrs = Record<string, string | true>;

export function parseAttrs(src: string): Attrs {
  const out: Attrs = {};
  const re = /([A-Za-z][\w-]*)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"'}]+)))?/g;
  for (let m; (m = re.exec(src)); ) out[m[1]!] = m[2] ?? m[3] ?? m[4] ?? true;
  return out;
}

export function formatAttrs(a: Attrs): string {
  return Object.entries(a)
    .map(([k, v]) => (v === true ? k : `${k}=${/^[^\s"'{}]+$/.test(v) ? v : `"${v.replace(/"/g, "'")}"`}`))
    .join(' ');
}

const COLOR_RE = /^(none|theme\.[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)?|#?[0-9a-fA-F]{6})$/;
const flag = (v: string | true | undefined) => v === true || v === 'true';
const num = (v: string | true | undefined, min: number, max: number) => {
  const n = typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};

/** Span attributes of a run: everything `**` / `*` cannot say. */
export function runAttrs(r: Omit<TextRun, 'text'>): Attrs {
  const a: Attrs = {};
  if (r.color) a.color = r.color;
  if (r.size !== undefined) a.size = String(r.size);
  if (r.font) a.font = r.font;
  if (r.underline) a.underline = true;
  if (r.strike) a.strike = true;
  if (r.caps) a.caps = r.caps;
  if (r.highlight) a.highlight = r.highlight;
  if (r.baseline) a[r.baseline] = true;
  return a;
}

/** Run format of span / block attributes (unknown keys and invalid values are ignored). */
export function attrsToRun(a: Attrs): Omit<TextRun, 'text'> {
  const r: Omit<TextRun, 'text'> = {};
  if (flag(a.bold)) r.bold = true;
  if (flag(a.italic)) r.italic = true;
  if (flag(a.underline)) r.underline = true;
  if (flag(a.strike)) r.strike = true;
  if (typeof a.color === 'string' && COLOR_RE.test(a.color)) r.color = a.color;
  if (typeof a.highlight === 'string' && COLOR_RE.test(a.highlight)) r.highlight = a.highlight;
  const size = num(a.size, 4, 400);
  if (size !== undefined) r.size = size;
  if (typeof a.font === 'string' && a.font.length <= 80) r.font = a.font;
  if (a.caps === 'small' || a.caps === 'all' || a.caps === 'none') r.caps = a.caps;
  if (flag(a.super)) r.baseline = 'super';
  else if (flag(a.sub)) r.baseline = 'sub';
  return r;
}

/** Block attributes of a paragraph's own format (alignment, spacing). */
export function paragraphAttrs(p: Paragraph): Attrs {
  const a: Attrs = {};
  if (p.align) a.align = p.align;
  if (p.spaceBefore !== undefined) a.before = String(p.spaceBefore);
  if (p.spaceAfter !== undefined) a.after = String(p.spaceAfter);
  if (p.lineSpacing !== undefined) a.spacing = String(p.lineSpacing);
  return a;
}

export function attrsToParagraph(a: Attrs): Pick<Paragraph, 'align' | 'spaceBefore' | 'spaceAfter' | 'lineSpacing'> {
  const p: Pick<Paragraph, 'align' | 'spaceBefore' | 'spaceAfter' | 'lineSpacing'> = {};
  if (a.align === 'left' || a.align === 'center' || a.align === 'right' || a.align === 'justify') p.align = a.align;
  const before = num(a.before, 0, 400), after = num(a.after, 0, 400), spacing = num(a.spacing, 0.5, 4);
  if (before !== undefined) p.spaceBefore = before;
  if (after !== undefined) p.spaceAfter = after;
  if (spacing !== undefined) p.lineSpacing = spacing;
  return p;
}

/** Apply a format as defaults: what a run already says wins (inner spans win over outer ones). */
export function withDefaults(runs: TextRun[], format: Omit<TextRun, 'text'>): TextRun[] {
  return runs.map((r) => ({ ...format, ...r }));
}

/**
 * Spans of an inline string: opening `[` offset → closing `]` offset, attribute source and end
 * (after `}`). Escaped brackets are text; a `[` without a matching `]{…}` is text too.
 */
export function spanPairs(src: string): Map<number, { close: number; attrs: string; end: number }> {
  const pairs = new Map<number, { close: number; attrs: string; end: number }>();
  const open: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') i++;
    else if (c === '[') open.push(i);
    else if (c === ']' && open.length) {
      const start = open.pop()!;
      const m = /^\{([^{}\n]*)\}/.exec(src.slice(i + 1));
      if (m) pairs.set(start, { close: i, attrs: m[1]!, end: i + 1 + m[0].length });
    }
  }
  return pairs;
}

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
  const pairs = spanPairs(src);
  /** Open spans: first run index, closing offset, attributes. */
  const spans: { from: number; close: number; attrs: string; end: number }[] = [];
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    const span = spans[spans.length - 1];
    if (span && i === span.close) {
      flush();
      spans.pop();
      const format = attrsToRun(parseAttrs(span.attrs));
      runs.splice(span.from, runs.length - span.from, ...withDefaults(runs.slice(span.from), format));
      i = span.end - 1;
    } else if (c === '[' && pairs.has(i)) {
      flush();
      spans.push({ from: runs.length, ...pairs.get(i)! });
    } else if (c === '\\' && i + 1 < src.length && /[\\*_#`[\]{}:-]/.test(src[i + 1]!)) {
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
      const t = escapeText(r.text);
      // Keep surrounding spaces outside the markers so the result stays valid Markdown.
      const lead = /^\s*/.exec(t)![0];
      const trail = /\s*$/.exec(t)![0];
      let core = t.trim();
      if (!core) return t;
      if (r.italic) core = `*${core}*`;
      if (r.bold) core = `**${core}**`;
      const attrs = runAttrs(r);
      if (Object.keys(attrs).length) core = `[${core}]{${formatAttrs(attrs)}}`;
      return lead + core + trail;
    })
    .join('');
}

const RUN_KEYS = ['bold', 'italic', 'underline', 'color', 'size', 'caps', 'font', 'strike', 'highlight', 'baseline'] as const;
const sameFormat = (a: TextRun, b: TextRun) => RUN_KEYS.every((k) => (k === 'bold' || k === 'italic' || k === 'underline' || k === 'strike' ? !!a[k] === !!b[k] : a[k] === b[k]));

export function mergeRuns(runs: TextRun[]): TextRun[] {
  const out: TextRun[] = [];
  for (const r of runs) {
    if (!r.text) continue;
    const prev = out[out.length - 1];
    if (prev && sameFormat(prev, r)) prev.text += r.text;
    else out.push({ ...r });
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
  // A plain paragraph that would be read back as list/heading/block fence must be escaped.
  return /^(\s*([-*+]|\d+[.)])\s|#|:::)/.test(text) ? '\\' + text : text;
}

/** Paragraphs → DSL `content` string (inverse of `contentToParagraphs`). */
export function paragraphsToContent(paragraphs: Paragraph[]): string {
  return paragraphs.map((p, i) => paragraphLine(p, i, paragraphs)).join('\n');
}

/**
 * Block attributes of a paragraph: its own format plus the run format all its runs share (bold and
 * italic excepted: Markdown says those with `**` / `*`).
 */
export function blockAttrs(p: Paragraph): Attrs {
  const a = paragraphAttrs(p);
  const runs = p.runs.filter((r) => r.text);
  if (!runs.length) return a;
  const each = runs.map(runAttrs);
  for (const [k, v] of Object.entries(each[0]!)) if (each.every((x) => x[k] === v)) a[k] = v;
  return a;
}

/** The paragraph without what its block says (see `blockAttrs`). */
function insideBlock(p: Paragraph, a: Attrs): Paragraph {
  const { align: _a, spaceBefore: _b, spaceAfter: _c, lineSpacing: _d, ...rest } = p;
  const shared = attrsToRun(a);
  return {
    ...rest,
    runs: p.runs.map((r) => {
      const out = { ...r } as Record<string, unknown>;
      for (const k of Object.keys(shared)) if (k !== 'bold' && k !== 'italic') delete out[k];
      return out as TextRun;
    }),
  };
}

function flowMarkdown(paragraphs: Paragraph[], all: Paragraph[], offset: number): string {
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
      columns.push(listMarker(all[offset + i]!, offset + i, all).length + 1);
    } else columns.length = 0;
    const line = paragraphLine(p, offset + i, all, indent);
    if (i > 0) {
      const prev = paragraphs[i - 1]!;
      out += prev.list && p.list ? '\n' : '\n\n';
    }
    out += line;
  });
  return out;
}

/**
 * Paragraphs → Markdown blocks (blank lines between paragraphs, compact lists). Consecutive
 * paragraphs sharing a format are wrapped in a `::: {attrs}` … `:::` block.
 */
export function paragraphsToMarkdown(paragraphs: Paragraph[]): string {
  const keys = paragraphs.map((p) => formatAttrs(blockAttrs(p)));
  const parts: string[] = [];
  for (let i = 0; i < paragraphs.length; ) {
    let j = i;
    while (j + 1 < paragraphs.length && keys[j + 1] === keys[i]) j++;
    const group = paragraphs.slice(i, j + 1);
    if (keys[i]) {
      const a = blockAttrs(paragraphs[i]!);
      parts.push(`::: {${keys[i]}}\n${flowMarkdown(group.map((p) => insideBlock(p, a)), paragraphs, i)}\n:::`);
    } else parts.push(flowMarkdown(group, paragraphs, i));
    i = j + 1;
  }
  return parts.join('\n\n');
}

/** Longest `:::` fence inside a Markdown body (a block holding it needs a longer one). */
export function fenceFor(body: string): string {
  const inner = Math.max(0, ...[...body.matchAll(/^(:{3,})/gm)].map((m) => m[1]!.length));
  return ':'.repeat(inner ? Math.max(4, inner + 1) : 3);
}

/** True when paragraphs only use what `content` strings can express (no paragraph formats). */
export const isPlainRepresentable = (paragraphs: Paragraph[]): boolean =>
  paragraphs.every((p) => !p.align && p.spaceBefore === undefined && p.spaceAfter === undefined && p.lineSpacing === undefined);
