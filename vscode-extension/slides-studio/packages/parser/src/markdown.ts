import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import { Document, isMap, isSeq, parseDocument, YAMLMap, YAMLSeq } from 'yaml';
import type { Root, RootContent, PhrasingContent, Table } from 'mdast';
import {
  applyToDocument,
  assertFreeId,
  mergeRuns,
  findLayout,
  findPlaceholder,
  formatInline,
  isPlainRepresentable,
  MutationError,
  normalizePatch,
  paragraphsToContent,
  paragraphsToMarkdown,
  reorderIds,
  withMasterOverride,
  SlideDocument,
  SlideElement,
  type CorporateMaster,
  type Mutation,
  type Paragraph,
  type SlideNode,
  type TableElement,
  type TextRun,
  tr,
} from '@corporate-slides/core';
import { dslToElement, elementToDsl, patchElementNode } from './dsl.js';
import { formatZodError, type ParseOptions, type ParseResult } from './types.js';

/* ------------------------------------------------------------------ */
/* Source model                                                        */
/* ------------------------------------------------------------------ */

export interface Range {
  start: number;
  end: number;
}

export interface MdBlock {
  elementId: string;
  kind: 'title' | 'subtitle' | 'body' | 'slot' | 'image' | 'table';
  /** Source ranges of the block(s); `body` may span several top-level blocks. */
  ranges: Range[];
  /** For slots: the content between the `::: name` and `:::` lines. */
  inner?: Range;
  explicitId: boolean;
  alt?: string;
}

export interface MdSlide {
  id: string;
  explicitId: boolean;
  /** Offset of the `---` separator line that opens this slide (null for a first slide without separator). */
  sepStart: number | null;
  /** YAML text of the slide frontmatter (without the `---` lines). */
  fm: (Range & { data: Record<string, unknown> }) | null;
  bodyStart: number;
  end: number;
  blocks: MdBlock[];
  notesSlot?: MdBlock;
}

export interface MdModel {
  docFm: (Range & { data: Record<string, unknown> }) | null;
  slides: MdSlide[];
}

const SLIDE_FM_KEYS = new Set(['id', 'layout', 'notes', 'hidden', 'masterOverrides', 'elements']);
const DOC_FM_KEYS = new Set(['title', 'author', 'subject', 'footer', 'date', 'master', 'theme', 'constraints', 'shared']);
const SEP_RE = /^---[ \t]*$/;
const FENCE_RE = /^\s*(```|~~~)/;
const SLOT_OPEN_RE = /^:::[ \t]*([A-Za-z][\w-]*)(?:[ \t]*\{#([A-Za-z0-9][\w-]*)\})?[ \t]*$/;
const SLOT_CLOSE_RE = /^:::[ \t]*$/;
const ID_SUFFIX_RE = /\s*\{#([A-Za-z0-9][\w-]*)\}\s*$/;

interface Line {
  start: number;
  end: number; // excluding newline
  next: number; // start of next line
  text: string;
}

function splitLines(text: string, from = 0, to = text.length): Line[] {
  const lines: Line[] = [];
  let pos = from;
  while (pos < to) {
    let nl = text.indexOf('\n', pos);
    if (nl < 0 || nl >= to) nl = to;
    const end = nl > pos && text[nl - 1] === '\r' ? nl - 1 : nl;
    lines.push({ start: pos, end, next: Math.min(nl + 1, to === text.length ? text.length : to), text: text.slice(pos, end) });
    if (nl >= to) break;
    pos = nl + 1;
  }
  return lines;
}

function isSlideFrontmatter(src: string): Record<string, unknown> | null {
  const lines = src.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length || !/^[A-Za-z][\w-]*\s*:/.test(lines[0]!)) return null;
  if (lines.some((l) => !/^([A-Za-z][\w-]*\s*:|\s|-)/.test(l))) return null;
  try {
    const d = parseDocument(src);
    if (d.errors.length) return null;
    const data = d.toJSON();
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return Object.keys(data).every((k) => SLIDE_FM_KEYS.has(k)) ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function buildMdModel(text: string): MdModel {
  const lines = splitLines(text);
  let i = 0;
  let docFm: MdModel['docFm'] = null;
  if (lines[0] && SEP_RE.test(lines[0].text)) {
    const close = lines.findIndex((l, k) => k > 0 && SEP_RE.test(l.text));
    if (close > 0) {
      const range = { start: lines[1]!.start, end: lines[close]!.start };
      const parsed = parseDocument(text.slice(range.start, range.end)).toJSON();
      docFm = { ...range, data: parsed && typeof parsed === 'object' ? parsed : {} };
      i = close + 1;
    }
  }
  // Segments separated by `---` lines outside code fences.
  const segs: { sepStart: number | null; start: number; end: number }[] = [];
  let segStart = lines[i]?.start ?? text.length;
  let sepStart: number | null = null;
  let inFence = false;
  for (; i < lines.length; i++) {
    const l = lines[i]!;
    if (FENCE_RE.test(l.text)) inFence = !inFence;
    if (!inFence && SEP_RE.test(l.text)) {
      segs.push({ sepStart, start: segStart, end: l.start });
      sepStart = l.start;
      segStart = l.next;
    }
  }
  segs.push({ sepStart, start: segStart, end: text.length });

  const slides: MdSlide[] = [];
  for (let k = 0; k < segs.length; k++) {
    const seg = segs[k]!;
    const src = text.slice(seg.start, seg.end);
    if (!src.trim()) {
      // An empty segment followed by nothing meaningful: only keep it when it is a real (empty) slide between separators.
      if (seg.sepStart !== null && k + 1 < segs.length && !isSlideFrontmatter(text.slice(segs[k + 1]!.start, segs[k + 1]!.end))) {
        slides.push({ id: '', explicitId: false, sepStart: seg.sepStart, fm: null, bodyStart: seg.start, end: seg.end, blocks: [] });
      }
      continue;
    }
    const fmData = k + 1 < segs.length ? isSlideFrontmatter(src) : null;
    if (fmData) {
      const body = segs[k + 1]!;
      slides.push({ id: '', explicitId: false, sepStart: seg.sepStart, fm: { start: seg.start, end: seg.end, data: fmData }, bodyStart: body.start, end: body.end, blocks: [] });
      k++;
    } else {
      slides.push({ id: '', explicitId: false, sepStart: seg.sepStart, fm: null, bodyStart: seg.start, end: seg.end, blocks: [] });
    }
  }
  slides.forEach((s, n) => {
    const fid = s.fm?.data.id;
    s.explicitId = typeof fid === 'string' || typeof fid === 'number';
    s.id = s.explicitId ? String(fid) : `slide-${n + 1}`;
  });
  return { docFm, slides };
}

/* ------------------------------------------------------------------ */
/* Markdown body → elements                                            */
/* ------------------------------------------------------------------ */

const md = unified().use(remarkParse).use(remarkGfm);

function runsOf(nodes: PhrasingContent[], marks: Omit<TextRun, 'text'> = {}): TextRun[] {
  const out: TextRun[] = [];
  for (const n of nodes) {
    switch (n.type) {
      case 'text':
        out.push({ text: n.value.replace(/\s*\n\s*/g, ' '), ...marks });
        break;
      case 'inlineCode':
        out.push({ text: n.value, ...marks });
        break;
      case 'strong':
        out.push(...runsOf(n.children, { ...marks, bold: true }));
        break;
      case 'emphasis':
        out.push(...runsOf(n.children, { ...marks, italic: true }));
        break;
      case 'break':
        out.push({ text: ' ', ...marks });
        break;
      case 'image':
        out.push({ text: n.alt ?? '', ...marks });
        break;
      default:
        if ('children' in n) out.push(...runsOf(n.children as PhrasingContent[], marks));
        else if ('value' in n) out.push({ text: String(n.value), ...marks });
    }
  }
  return out.filter((r) => r.text);
}

function blockParagraphs(node: RootContent, level = 0): Paragraph[] {
  switch (node.type) {
    case 'paragraph':
      return [{ runs: runsOf(node.children) }];
    case 'heading':
      return [{ runs: runsOf(node.children), heading: Math.max(2, node.depth) }];
    case 'list': {
      const out: Paragraph[] = [];
      for (const item of node.children) {
        for (const child of item.children) {
          if (child.type === 'list') out.push(...blockParagraphs(child, level + 1));
          else
            for (const { heading: _h, ...p } of blockParagraphs(child, level)) {
              out.push({ ...p, list: node.ordered ? 'number' : 'bullet', ...(level ? { level } : {}) });
            }
        }
      }
      return out;
    }
    case 'blockquote':
      return node.children.flatMap((c) => blockParagraphs(c, level));
    case 'code':
      return node.value.split('\n').map((l) => ({ runs: [{ text: l }] }));
    default:
      return [];
  }
}


/** Runs Markdown can carry in a table cell: bold and italic only. */
const mdRuns = (runs: TextRun[]) => runs.every((r) => !r.underline && !r.color && r.size === undefined && !r.caps);

/** A GFM table as a table element's content: text, column alignment, bold / italic cell runs. */
function tableOf(t: Table): Pick<TableElement, 'rows' | 'colAlign' | 'cellRuns'> {
  // `<br>` is a line break inside a cell (GFM cells are one line).
  const br = (r: TextRun) => (/^<br\s*\/?>$/i.test(r.text) ? { ...r, text: '\n' } : r);
  const runs = t.children.map((row) => row.children.map((cell) => mergeRuns(runsOf(cell.children).map(br))));
  const rows = runs.map((row) => row.map((cell) => cell.map((r) => r.text).join('')));
  const marked = runs.map((row) => row.map((cell) => (cell.some((r) => r.bold || r.italic) ? cell : null)));
  const colAlign = t.align?.some(Boolean) ? t.align.map((a) => a ?? null) : undefined;
  return { rows, ...(colAlign ? { colAlign } : {}), ...(marked.some((row) => row.some(Boolean)) ? { cellRuns: marked } : {}) };
}

function stripIdSuffix(runs: TextRun[]): { runs: TextRun[]; id?: string } {
  const last = runs[runs.length - 1];
  const m = last && ID_SUFFIX_RE.exec(last.text);
  if (!last || !m) return { runs };
  const text = last.text.slice(0, m.index);
  return { runs: text ? [...runs.slice(0, -1), { ...last, text }] : runs.slice(0, -1), id: m[1] };
}

const pos = (n: { position?: { start: { offset?: number }; end: { offset?: number } } }, base: number): Range => ({
  start: base + (n.position?.start.offset ?? 0),
  end: base + (n.position?.end.offset ?? 0),
});

interface SlotInfo {
  name: string;
  id?: string;
  outer: Range;
  inner: Range;
}

function findSlots(text: string, from: number, to: number): { slots: SlotInfo[]; masked: string } {
  const lines = splitLines(text, from, to);
  const slots: SlotInfo[] = [];
  let open: { name: string; id?: string; start: number; innerStart: number } | null = null;
  let inFence = false;
  for (const l of lines) {
    if (FENCE_RE.test(l.text)) inFence = !inFence;
    if (inFence) continue;
    const o = SLOT_OPEN_RE.exec(l.text);
    if (!open && o) open = { name: o[1]!, id: o[2], start: l.start, innerStart: l.next };
    else if (open && SLOT_CLOSE_RE.test(l.text)) {
      slots.push({ name: open.name, id: open.id, outer: { start: open.start, end: l.end }, inner: { start: open.innerStart, end: l.start } });
      open = null;
    }
  }
  // Mask slot regions (keep newlines) so free-text offsets stay aligned with the source.
  let masked = text.slice(from, to);
  for (const s of slots) {
    const a = s.outer.start - from;
    const b = s.outer.end - from;
    masked = masked.slice(0, a) + masked.slice(a, b).replace(/[^\n]/g, ' ') + masked.slice(b);
  }
  return { slots, masked };
}

interface DerivedSlide {
  elements: SlideElement[];
  notes?: string;
  errors: string[];
}

/** Offsets of the k-th item of the `elements:` list inside a slide front matter (review comments anchor to it). */
function fmItemRange(text: string, fm: Range, k: number): Range | null {
  const body = text.slice(fm.start, fm.end);
  const list = /^elements:[^\n]*\n/m.exec(body);
  if (!list) return null;
  const starts: number[] = [];
  let indent: string | null = null;
  const re = /^([ \t]*)(- |\S)/gm;
  re.lastIndex = list.index + list[0].length;
  for (let m; (m = re.exec(body)); ) {
    if (m[2] !== '- ' && m[1]!.length === 0) break; // next top-level key ends the list
    if (m[2] === '- ' && (indent === null || m[1] === indent)) (indent ??= m[1]!, starts.push(m.index));
  }
  const start = starts[k];
  if (start === undefined) return null;
  const end = starts[k + 1] ?? (/^\S/m.exec(body.slice(start + 1))?.index ?? body.length - start - 1) + start + 1;
  return { start: fm.start + start, end: fm.start + Math.min(end, body.length) };
}

function deriveSlide(text: string, s: MdSlide, lineOf: (o: number) => number): DerivedSlide {
  const errors: string[] = [];
  const elements: SlideElement[] = [];
  const src = (r: Range, kind: 'markdown' | 'markdown-frontmatter' = 'markdown') => ({ kind, startLine: lineOf(r.start), endLine: lineOf(Math.max(r.start, r.end - 1)) });
  const { slots, masked } = findSlots(text, s.bodyStart, s.end);
  const tree = md.parse(masked) as Root;
  const nodes = tree.children.filter((n) => n.type !== 'html' && n.type !== 'thematicBreak');

  let titleIdx = -1;
  const bodyNodes: RootContent[] = [];
  let imageN = 0;
  let tableN = 0;
  nodes.forEach((n, k) => {
    if (titleIdx < 0 && n.type === 'heading' && n.depth === 1) {
      titleIdx = k;
      const { runs, id } = stripIdSuffix(runsOf(n.children));
      const r = pos(n, s.bodyStart);
      s.blocks.push({ elementId: id ?? 'title', kind: 'title', ranges: [r], explicitId: !!id });
      elements.push({ id: id ?? 'title', type: 'text', placeholder: 'title', paragraphs: [{ runs }], source: src(r) });
      return;
    }
    if (n.type === 'paragraph') {
      const imgs = n.children.filter((c) => c.type === 'image');
      const rest = runsOf(n.children.filter((c) => c.type !== 'image')).map((r) => r.text).join('').trim();
      const idm = /^\{#([A-Za-z0-9][\w-]*)\}$/.exec(rest);
      if (imgs.length === 1 && (!rest || idm)) {
        const img = imgs[0] as { url: string; alt?: string | null };
        const id = idm?.[1] ?? `image-${++imageN}`;
        const r = pos(n, s.bodyStart);
        s.blocks.push({ elementId: id, kind: 'image', ranges: [r], explicitId: !!idm, alt: img.alt ?? '' });
        elements.push({ id, type: 'image', placeholder: 'pic', src: img.url, ...(img.alt ? { alt: img.alt } : {}), source: src(r) });
        return;
      }
    }
    if (n.type === 'table') {
      const id = `table-${++tableN}`;
      const r = pos(n, s.bodyStart);
      s.blocks.push({ elementId: id, kind: 'table', ranges: [r], explicitId: false });
      elements.push({ id, type: 'table', header: true, ...tableOf(n), source: src(r) });
      return;
    }
    bodyNodes.push(n);
  });

  if (bodyNodes.length) {
    const first = bodyNodes[0]!;
    const isSubtitle = titleIdx >= 0 && bodyNodes.length === 1 && first.type === 'paragraph' && nodes.indexOf(first) === titleIdx + 1;
    const ranges = bodyNodes.map((n) => pos(n, s.bodyStart));
    const paragraphs = bodyNodes.flatMap((n) => blockParagraphs(n));
    const id = isSubtitle ? 'subtitle' : 'body';
    s.blocks.push({ elementId: id, kind: isSubtitle ? 'subtitle' : 'body', ranges, explicitId: false });
    elements.push({ id, type: 'text', placeholder: id, paragraphs, source: src({ start: ranges[0]!.start, end: ranges[ranges.length - 1]!.end }) });
  }
  // Tables take the body placeholder when there is no free text.
  if (!bodyNodes.length) for (const el of elements) if (el.type === 'table') { el.placeholder = 'body'; break; }

  let notes: string | undefined;
  for (const slot of slots) {
    const inner = text.slice(slot.inner.start, slot.inner.end);
    if (slot.name === 'notes') {
      notes = inner.replace(/^\n+|\s+$/g, '');
      s.notesSlot = { elementId: 'notes', kind: 'slot', ranges: [slot.outer], inner: slot.inner, explicitId: false };
      continue;
    }
    const id = slot.id ?? slot.name;
    const tree2 = md.parse(inner) as Root;
    // A block holding only a table is a table element: `::: table-1` (free, defined in the
    // frontmatter) or `::: tbl {#table-1}` (bound to the layout's table placeholder).
    const blocks = tree2.children.filter((n) => n.type !== 'html');
    if (blocks.length === 1 && blocks[0]!.type === 'table') {
      s.blocks.push({ elementId: id, kind: 'table', ranges: [slot.outer], inner: slot.inner, explicitId: !!slot.id });
      elements.push({ id, type: 'table', placeholder: slot.name, ...tableOf(blocks[0] as Table), source: src(slot.outer) });
      continue;
    }
    const paragraphs = tree2.children.flatMap((n) => blockParagraphs(n));
    s.blocks.push({ elementId: id, kind: 'slot', ranges: [slot.outer], inner: slot.inner, explicitId: !!slot.id });
    elements.push({ id, type: 'text', placeholder: slot.name, paragraphs, source: src(slot.outer) });
  }

  // Frontmatter `elements`: overrides for derived ids, full definitions otherwise.
  const fmEls = s.fm?.data.elements;
  if (fmEls !== undefined && !Array.isArray(fmEls)) errors.push(tr(`Diapositive « ${s.id} » : \`elements\` doit être une liste`, `Slide “${s.id}”: \`elements\` must be a list`));
  for (const [k, raw] of (Array.isArray(fmEls) ? fmEls : []).entries()) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const id = String(r.id ?? '');
    const target = elements.find((e) => e.id === id);
    if (target) {
      const { id: _i, type: _t, content: _c, paragraphs: _p, ...override } = r;
      const style = target.style || override.style ? { ...(target.style ?? {}), ...((override.style as object) ?? {}) } : undefined;
      const slotBlock = s.blocks.find((b) => b.inner && b.elementId === id);
      // The Markdown table is the content: stale frontmatter rows never win over it.
      if (slotBlock?.kind === 'table') delete override.rows;
      // A full definition (`type`, no `placeholder`) for a `::: id` block is a free text box / table whose content is the block.
      const free = r.type !== undefined && r.placeholder === undefined && !!slotBlock;
      const { placeholder: _ph, ...unbound } = target;
      const merged = SlideElement.safeParse({ ...(free ? unbound : target), ...override, ...(style ? { style } : {}) });
      if (merged.success) {
        Object.assign(target, merged.data);
        if (free) delete target.placeholder;
      } else errors.push(tr(`Diapositive « ${s.id} », surcharge « ${id} » : ${formatZodError(merged.error)}`, `Slide “${s.id}”, override “${id}”: ${formatZodError(merged.error)}`));
    } else {
      const parsed = SlideElement.safeParse(dslToElement(r));
      if (parsed.success) elements.push({ ...parsed.data, source: src(fmItemRange(text, s.fm!, k) ?? s.fm!, 'markdown-frontmatter') });
      else errors.push(tr(`Diapositive « ${s.id} », élément ${k + 1} : ${formatZodError(parsed.error)}`, `Slide “${s.id}”, element ${k + 1}: ${formatZodError(parsed.error)}`));
    }
  }
  return { elements, notes: notes ?? (typeof s.fm?.data.notes === 'string' ? s.fm.data.notes : undefined), errors };
}

export function parseMarkdown(text: string, opts: ParseOptions = {}): ParseResult & { model: MdModel } {
  const model = buildMdModel(text);
  const errors: string[] = [];
  const lineStarts = [0];
  for (let k = 0; k < text.length; k++) if (text[k] === '\n') lineStarts.push(k + 1);
  const lineOf = (o: number) => {
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid]! <= o) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
  const fm = model.docFm?.data ?? {};
  for (const k of Object.keys(fm)) if (!DOC_FM_KEYS.has(k)) errors.push(tr(`Clé d'en-tête inconnue : « ${k} »`, `Unknown header key: “${k}”`));
  const slides: SlideNode[] = model.slides.map((s) => {
    const d = deriveSlide(text, s, lineOf);
    errors.push(...d.errors);
    const startLine = lineOf(s.sepStart ?? s.bodyStart);
    return {
      id: s.id,
      layout: String(s.fm?.data.layout ?? 'content'),
      ...(d.notes ? { notes: d.notes } : {}),
      ...(s.fm?.data.hidden ? { hidden: true } : {}),
      ...(s.fm?.data.masterOverrides ? { masterOverrides: s.fm.data.masterOverrides as SlideNode['masterOverrides'] } : {}),
      elements: d.elements,
      source: { kind: 'markdown', startLine, endLine: lineOf(Math.max(s.bodyStart, s.end - 1)) },
    };
  });
  if (opts.master && model.docFm) injectShared(slides, sharedValues(fm), opts.master, { kind: 'markdown-frontmatter', startLine: lineOf(model.docFm.start), endLine: lineOf(Math.max(model.docFm.start, model.docFm.end - 1)) });
  const candidate = {
    version: '1',
    metadata: { title: String(fm.title ?? tr('Présentation', 'Presentation')), author: fm.author, subject: fm.subject, footer: fm.footer, date: fm.date },
    masterRef: String(fm.master ?? 'corporate'),
    themeRef: String(fm.theme ?? 'default'),
    dimensions: opts.dimensions ?? { width: 13.3333, height: 7.5 },
    constraints: fm.constraints,
    slides,
  };
  const r = SlideDocument.safeParse(candidate);
  if (r.success) return { doc: r.data, errors, model };
  errors.push(formatZodError(r.error));
  return { doc: { ...candidate, metadata: { title: candidate.metadata.title }, constraints: undefined, slides: slides.filter((s) => /^[A-Za-z0-9][\w-]*$/.test(s.id)) } as SlideDocument, errors, model };
}

/** Deck-wide placeholder values (`shared:` in the deck header): placeholder key → Markdown. */
function sharedValues(fm: Record<string, unknown>): Record<string, string> {
  const v = fm.shared;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v).filter(([k, t]) => /^[A-Za-z][\w-]*$/.test(k) && (typeof t === 'string' || typeof t === 'number')).map(([k, t]) => [k, String(t)]));
}

/**
 * Shared values fill the matching placeholder of every slide whose layout has it, unless the slide
 * has its own element there (its specific value). The injected elements are flagged `shared`.
 */
function injectShared(slides: SlideNode[], shared: Record<string, string>, master: CorporateMaster, source: SlideElement['source']): void {
  for (const [key, body] of Object.entries(shared)) {
    const paragraphs = (md.parse(body) as Root).children.flatMap((n) => blockParagraphs(n));
    for (const slide of slides) {
      const layout = findLayout(master, slide.layout);
      const ph = findPlaceholder(layout, key);
      if (!ph || slide.elements.some((e) => e.placeholder && findPlaceholder(layout, e.placeholder) === ph)) continue;
      const taken = new Set(slide.elements.map((e) => e.id));
      let id = key;
      for (let n = 1; taken.has(id); n++) id = `${key}-shared${n > 1 ? `-${n}` : ''}`;
      slide.elements.push({ id, type: 'text', placeholder: key, paragraphs: structuredClone(paragraphs), shared: true, source });
    }
  }
}

/** Edit (or create) the deck header. */
function editDocFm(text: string, fn: (d: Document) => void): string {
  const { docFm } = buildMdModel(text);
  const d = docFm ? parseDocument(text.slice(docFm.start, docFm.end)) : new Document({});
  fn(d);
  let y = d.toString({ lineWidth: 0 });
  if (!y.endsWith('\n')) y += '\n';
  return docFm ? splice(text, docFm, y) : `---\n${y}---\n\n${text}`;
}

/** Set `shared.<key>` in the deck header (multi-line values as block literals). */
function setShared(d: Document, key: string, body: string): void {
  if (!isMap(d.get('shared'))) d.set('shared', d.createNode({}));
  const node = d.createNode(body);
  if (body.includes('\n')) (node as { type?: string }).type = 'BLOCK_LITERAL';
  (d.get('shared') as YAMLMap).set(key, node);
}

const isShared = (doc: SlideDocument, si: number, id: string) => doc.slides[si]?.elements.some((e) => e.id === id && e.type === 'text' && e.shared) ?? false;
const sharedLocked = () => new MutationError(tr('Texte partagé par plusieurs diapositives : détachez-le (icône en haut à droite) pour le modifier ici.', 'Text shared by several slides: detach it (top-right icon) to change it here.'));

/* ------------------------------------------------------------------ */
/* Format-preserving edits                                             */
/* ------------------------------------------------------------------ */

const splice = (text: string, r: Range, insert: string) => text.slice(0, r.start) + insert + text.slice(r.end);

/** Edit (or create) the frontmatter of slide `index`. */
function editSlideFm(text: string, index: number, fn: (d: Document) => void): string {
  const model = buildMdModel(text);
  const s = model.slides[index];
  if (!s) throw new MutationError(tr(`Diapositive ${index + 1} introuvable`, `Slide ${index + 1} not found`));
  if (s.fm) {
    const d = parseDocument(text.slice(s.fm.start, s.fm.end));
    fn(d);
    let y = d.toString({ lineWidth: 0 });
    if (!y.endsWith('\n')) y += '\n';
    return splice(text, s.fm, y);
  }
  const d = new Document({});
  fn(d);
  const y = d.toString({ lineWidth: 0 });
  if (s.sepStart !== null) {
    const lineEnd = text.indexOf('\n', s.sepStart);
    const at = lineEnd < 0 ? text.length : lineEnd + 1;
    return text.slice(0, at) + (lineEnd < 0 ? '\n' : '') + y + '---\n' + text.slice(at);
  }
  const prefix = s.bodyStart === 0 ? '---\n---\n' : '';
  return text.slice(0, s.bodyStart) + prefix + '---\n' + y + '---\n' + text.slice(s.bodyStart);
}

function fmElementsSeq(d: Document): YAMLSeq {
  let seq = d.get('elements');
  if (!isSeq(seq)) {
    seq = d.createNode([]);
    d.set('elements', seq);
  }
  return seq as YAMLSeq;
}

function fmEntry(d: Document, id: string, create: boolean): YAMLMap | null {
  const seq = fmElementsSeq(d);
  let node = seq.items.find((n) => isMap(n) && String(n.get('id')) === id) as YAMLMap | undefined;
  if (!node && create) {
    node = d.createNode({ id }) as YAMLMap;
    seq.add(node);
  }
  return node ?? null;
}

function dropEmptyElements(d: Document) {
  const seq = d.get('elements');
  if (isSeq(seq)) {
    seq.items = seq.items.filter((n) => !(isMap(n) && n.items.length === 1 && n.has('id')));
    if (!seq.items.length) d.delete('elements');
  }
}

/** The slide frontmatter has `key` on element `id`. */
const fmHas = (s: MdSlide, id: string, key: string) =>
  Array.isArray(s.fm?.data.elements) && (s.fm.data.elements as Record<string, unknown>[]).some((e) => e && String(e.id) === id && e[key] !== undefined);

const slideIndex = (model: MdModel, slideId: string) => {
  const i = model.slides.findIndex((s) => s.id === slideId);
  if (i < 0) throw new MutationError(tr(`Diapositive « ${slideId} » introuvable`, `Slide “${slideId}” not found`));
  return i;
};

function chunkOf(text: string, s: MdSlide): string {
  const start = s.sepStart ?? s.bodyStart;
  let chunk = text.slice(start, s.end);
  if (s.sepStart === null) chunk = '---\n' + chunk;
  if (!chunk.endsWith('\n')) chunk += '\n';
  return chunk;
}

/** GFM table; cells with bold / italic runs keep them as Markdown emphasis. */
function tableMarkdown(rows: string[][], colAlign: (string | null)[] = [], runs?: (TextRun[] | null)[][] | null): string {
  const cell = (text: string, ri: number, ci: number) => {
    const r = runs?.[ri]?.[ci];
    return formatInline(r && mdRuns(r) && r.map((x) => x.text).join('') === text ? r : [{ text }]).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
  };
  const width = Math.max(...rows.map((r) => r.length));
  const grid = rows.map((r, ri) => Array.from({ length: width }, (_, ci) => cell(r[ci] ?? '', ri, ci)));
  // Prettified: every column padded to its widest cell, following its alignment.
  const w = Array.from({ length: width }, (_, ci) => Math.max(3, ...grid.map((r) => [...r[ci]!].length)));
  const pad = (s: string, ci: number) => {
    const gap = w[ci]! - [...s].length;
    const a = colAlign[ci];
    return a === 'right' ? ' '.repeat(gap) + s : a === 'center' ? ' '.repeat(gap >> 1) + s + ' '.repeat(gap - (gap >> 1)) : s + ' '.repeat(gap);
  };
  const sep = w.map((n, i) => ({ left: `:${'-'.repeat(n - 1)}`, center: `:${'-'.repeat(n - 2)}:`, right: `${'-'.repeat(n - 1)}:` })[colAlign[i] as 'left'] ?? '-'.repeat(n));
  const line = (r: string[]) => `| ${r.map(pad).join(' | ')} |`;
  const [head, ...rest] = grid;
  return [line(head!), `| ${sep.join(' | ')} |`, ...rest.map(line)].join('\n');
}

/** Cell runs Markdown cannot hold (colors, sizes…) stay in the frontmatter as `cellRuns`. */
const runsInMarkdown = (runs: (TextRun[] | null)[][] | null | undefined) => !runs || runs.every((row) => row.every((c) => !c || mdRuns(c)));

/**
 * A table as a `::: id` block: its opener (`table-1`, or `tbl {#table-1}` when bound to a
 * placeholder), the Markdown table, and its frontmatter entry (geometry, headers, styles…) without
 * what the block says, or null when the block says everything.
 */
function tableSlot(e: TableElement): { head: string; body: string; dsl: Record<string, unknown> | null } {
  const body = tableMarkdown(e.rows, e.colAlign ?? [], e.cellRuns);
  const dsl = elementToDsl(e);
  delete dsl.rows;
  delete dsl.colAlign;
  if (runsInMarkdown(e.cellRuns)) delete dsl.cellRuns;
  const ph = e.placeholder && /^[A-Za-z][\w-]*$/.test(e.placeholder) ? e.placeholder : null;
  if (ph) {
    delete dsl.placeholder;
    delete dsl.type;
  }
  return { head: ph && ph !== e.id ? `${ph} {#${e.id}}` : e.id, body, dsl: Object.keys(dsl).length > 1 ? dsl : null };
}

/** Replace the Markdown text of a derived element. */
function rewriteBlock(text: string, block: MdBlock, paragraphs: Paragraph[]): string {
  switch (block.kind) {
    case 'title': {
      const runs = paragraphs.flatMap((p, i) => (i ? [{ text: ' ' }, ...p.runs] : p.runs));
      return splice(text, block.ranges[0]!, `# ${formatInline(runs)}${block.explicitId ? ` {#${block.elementId}}` : ''}`);
    }
    case 'subtitle':
      return splice(text, block.ranges[0]!, paragraphsToMarkdown(paragraphs) || ' ');
    case 'slot': {
      const body = paragraphsToMarkdown(paragraphs);
      return splice(text, block.inner!, body ? body + '\n' : '');
    }
    case 'body': {
      const first = block.ranges[0]!;
      const last = block.ranges[block.ranges.length - 1]!;
      // Keep non-body blocks (images, tables, comments) that sit between body blocks.
      const kept: string[] = [];
      let cursor = first.start;
      for (const r of block.ranges) {
        const gap = text.slice(cursor, r.start).trim();
        if (gap) kept.push(gap);
        cursor = r.end;
      }
      const body = paragraphsToMarkdown(paragraphs);
      return splice(text, { start: first.start, end: last.end }, [body, ...kept].filter(Boolean).join('\n\n'));
    }
    default:
      throw new MutationError(tr('Ce bloc ne contient pas de texte', 'This block holds no text'));
  }
}

function applyOne(text: string, m: Mutation, current: SlideDocument, opts: ParseOptions = {}): string {
  const model = buildMdModel(text);
  // Recompute derived blocks for the slide(s) we touch.
  const parsedModel = parseMarkdown(text).model;
  const structural = m.kind === 'addSlide' || m.kind === 'deleteSlide' || m.kind === 'duplicateSlide' || m.kind === 'moveSlide';
  if (structural) {
    // Materialize implicit slide ids first so they survive reordering.
    const implicit = model.slides.findIndex((s) => !s.explicitId);
    if (implicit >= 0) {
      const id = model.slides[implicit]!.id;
      return applyOne(editSlideFm(text, implicit, (d) => d.set('id', id)), m, current, opts);
    }
  }
  switch (m.kind) {
    case 'updateElement': {
      const si = slideIndex(model, m.slideId);
      const slide = parsedModel.slides[si]!;
      const block = slide.blocks.find((b) => b.elementId === m.elementId);
      const patch = normalizePatch(m.patch);
      const { paragraphs, src, rows, colAlign, ...rest } = patch;
      let out = text;
      if (block) {
        if (paragraphs && !isPlainRepresentable(paragraphs)) {
          // Run colors, sizes and underlines have no Markdown syntax: the element leaves the Markdown
          // body and becomes a full definition in the slide frontmatter (same id, nothing lost).
          const cur = current.slides[si]?.elements.find((e) => e.id === m.elementId);
          if (!cur) throw new MutationError(`${tr('Élément introuvable', 'Element not found')} : ${m.elementId}`);
          const { source: _s, ...el } = cur as SlideElement & { source?: unknown };
          const next = applyToDocument({ ...current, slides: [{ ...current.slides[si]!, elements: [el as SlideElement] }] }, [{ ...m, slideId: current.slides[si]!.id }]).slides[0]!.elements[0]!;
          let out2 = text;
          for (const r of [...block.ranges].sort((a, b) => b.start - a.start)) {
            const after = /^[ \t]*\r?\n?[ \t]*\r?\n?/.exec(out2.slice(r.end))![0];
            out2 = splice(out2, { start: r.start, end: r.end + after.length }, '');
          }
          return editSlideFm(out2, si, (d) => {
            const seq = fmElementsSeq(d);
            seq.items = seq.items.filter((n) => !(isMap(n) && String(n.get('id')) === m.elementId));
            seq.add(d.createNode(elementToDsl(next)));
          });
        }
        if (paragraphs) out = rewriteBlock(out, block, paragraphs);
        else if (src !== undefined && block.kind === 'image') {
          out = splice(out, block.ranges[0]!, `![${block.alt ?? ''}](${src.replace(/[()\s]/g, encodeURIComponent)})${block.explicitId ? ` {#${block.elementId}}` : ''}`);
        } else if ((rows || colAlign || rest.cellRuns !== undefined) && block.kind === 'table') {
          const cur = current.slides[si]?.elements.find((e) => e.id === m.elementId);
          const curT = cur?.type === 'table' ? cur : undefined;
          const cellRuns = rest.cellRuns !== undefined ? rest.cellRuns : curT?.cellRuns;
          const table = tableMarkdown(rows ?? curT?.rows ?? [['']], colAlign ?? curT?.colAlign ?? [], cellRuns);
          out = block.inner ? splice(out, block.inner, `${table}\n`) : splice(out, block.ranges[0]!, table);
          // Bold / italic live in the Markdown table; a frontmatter copy would override them.
          if (runsInMarkdown(cellRuns)) rest.cellRuns = fmHas(parsedModel.slides[si]!, m.elementId, 'cellRuns') ? null : undefined;
        }
        const geometryOrStyle = Object.values(rest).some((v) => v !== undefined);
        if (geometryOrStyle) out = editSlideFm(out, si, (d) => patchElementNode(d, fmEntry(d, m.elementId, true)!, rest, { allowText: false }));
        return out;
      }
      const el = current.slides[si]?.elements.find((e) => e.id === m.elementId);
      if (!el) throw new MutationError(tr(`Élément « ${m.elementId} » introuvable`, `Element “${m.elementId}” not found`));
      if (el.type === 'text' && el.shared) {
        // Editing a shared text changes it on every slide showing it; anything else needs a detached copy.
        if (!paragraphs || Object.values(rest).some((v) => v !== undefined) || src !== undefined || rows || colAlign || !isPlainRepresentable(paragraphs)) throw sharedLocked();
        return editDocFm(out, (d) => setShared(d, el.placeholder!, paragraphsToMarkdown(paragraphs)));
      }
      const fmNode = (d: Document) => {
        const node = fmEntry(d, m.elementId, false);
        if (!node) throw new MutationError(tr(`Élément « ${m.elementId} » introuvable dans l'en-tête`, `Element “${m.elementId}” not found in the header`));
        return node;
      };
      // A placeholder whose text sits in the header (`content:`) moves to a `::: id` block once edited.
      const { source: _src, ...bare } = el as SlideElement & { source?: unknown };
      const slot = slotBody(applyToDocument({ ...current, slides: [{ ...current.slides[si]!, elements: [bare as SlideElement] }] }, [{ ...m, slideId: current.slides[si]!.id }]).slides[0]!.elements[0]!);
      if (slot !== null) {
        const { paragraphs: _p, src: _s, rows: _r, colAlign: _c, ...p } = patch;
        out = editSlideFm(out, si, (d) => {
          const node = fmNode(d);
          patchElementNode(d, node, p, { allowText: false });
          node.delete('content');
          node.delete('paragraphs');
        });
        return appendSlot(out, si, m.elementId, slot);
      }
      return editSlideFm(out, si, (d) => {
        const node = fmNode(d);
        const { src: _s, rows: _r, ...p } = patch;
        patchElementNode(d, node, p, { allowText: true });
        if (src !== undefined) node.set('src', src);
        if (rows) node.set('rows', d.createNode(rows));
        if (colAlign) node.set('colAlign', d.createNode(colAlign));
      });
    }
    case 'addElement': {
      const si = slideIndex(model, m.slideId);
      if (current.slides[si]?.elements.some((e) => e.id === m.element.id)) throw new MutationError(tr(`Identifiant « ${m.element.id} » déjà utilisé`, `Identifier “${m.element.id}” already used`));
      const table = m.element.type === 'table' && /^[A-Za-z][\w-]*$/.test(m.element.id) ? tableSlot(m.element) : null;
      const dsl = table ? table.dsl : elementToDsl(m.element);
      const slot = table?.body ?? slotBody(m.element);
      if (slot !== null) delete dsl?.content;
      const out = dsl ? editSlideFm(text, si, (d) => fmElementsSeq(d).add(d.createNode(dsl))) : text;
      return slot === null ? out : appendSlot(out, si, table?.head ?? m.element.id, slot);
    }
    case 'deleteElement': {
      const si = slideIndex(model, m.slideId);
      if (isShared(current, si, m.elementId)) throw sharedLocked();
      const block = parsedModel.slides[si]!.blocks.find((b) => b.elementId === m.elementId);
      let out = text;
      if (block) {
        for (const r of [...block.ranges].sort((a, b) => b.start - a.start)) {
          // also swallow the following blank line
          const after = /^[ \t]*\r?\n?[ \t]*\r?\n?/.exec(out.slice(r.end))![0];
          out = splice(out, { start: r.start, end: r.end + after.length }, '');
        }
      }
      const s2 = buildMdModel(out).slides[si];
      if (s2?.fm && Array.isArray(s2.fm.data.elements)) {
        out = editSlideFm(out, si, (d) => {
          const seq = fmElementsSeq(d);
          seq.items = seq.items.filter((n) => !(isMap(n) && String(n.get('id')) === m.elementId));
          if (!seq.items.length) d.delete('elements');
        });
      }
      return out;
    }
    case 'renameElement': {
      const si = slideIndex(model, m.slideId);
      if (isShared(current, si, m.elementId)) throw sharedLocked();
      assertFreeId(current.slides[si]!, m.newId);
      const block = parsedModel.slides[si]!.blocks.find((b) => b.elementId === m.elementId);
      // Frontmatter entry (override or full definition) follows the new id.
      const renameFm = (t: string) =>
        Array.isArray(buildMdModel(t).slides[si]?.fm?.data.elements) ? editSlideFm(t, si, (d) => fmEntry(d, m.elementId, false)?.set('id', m.newId)) : t;
      if (!block) return renameFm(text);
      const r = block.ranges[0]!;
      if (block.kind === 'title' || block.kind === 'image') return renameFm(splice(text, r, `${text.slice(r.start, r.end).replace(ID_SUFFIX_RE, '')} {#${m.newId}}`));
      if (block.kind === 'slot' || block.inner) {
        const eol = text.indexOf('\n', r.start);
        const end = eol < 0 ? r.end : text[eol - 1] === '\r' ? eol - 1 : eol;
        const name = SLOT_OPEN_RE.exec(text.slice(r.start, end))?.[1] ?? m.elementId;
        // A free text box's block is named after its id; a placeholder's keeps the placeholder name.
        const free = current.slides[si]?.elements.find((e) => e.id === m.elementId)?.placeholder === undefined;
        return renameFm(splice(text, { start: r.start, end }, free || name === m.newId ? `::: ${m.newId}` : `::: ${name} {#${m.newId}}`));
      }
      // Subtitle, body, table: no id syntax in Markdown → full definition in the slide frontmatter
      // (a table keeps its content as Markdown in a `::: id` block).
      const cur = current.slides[si]?.elements.find((e) => e.id === m.elementId);
      if (!cur) throw new MutationError(`${tr('Élément introuvable', 'Element not found')} : ${m.elementId}`);
      const { source: _s, ...el } = cur as SlideElement & { source?: unknown };
      let out = text;
      for (const rr of [...block.ranges].sort((a, b) => b.start - a.start)) {
        const after = /^[ \t]*\r?\n?[ \t]*\r?\n?/.exec(out.slice(rr.end))![0];
        out = splice(out, { start: rr.start, end: rr.end + after.length }, '');
      }
      const table = el.type === 'table' && /^[A-Za-z][\w-]*$/.test(m.newId) ? tableSlot({ ...el, id: m.newId }) : null;
      const dsl = table ? table.dsl : elementToDsl({ ...(el as SlideElement), id: m.newId });
      if (dsl || Array.isArray(buildMdModel(out).slides[si]?.fm?.data.elements)) {
        out = editSlideFm(out, si, (d) => {
          const seq = fmElementsSeq(d);
          seq.items = seq.items.filter((n) => !(isMap(n) && String(n.get('id')) === m.elementId));
          if (dsl) seq.add(d.createNode(dsl));
          if (!seq.items.length) d.delete('elements');
        });
      }
      return table ? appendSlot(out, si, table.head, table.body) : out;
    }
    case 'reorderElement': {
      const si = slideIndex(model, m.slideId);
      const order = reorderIds(current.slides[si]!, m.elementId, m.direction);
      return editSlideFm(text, si, (d) => {
        order.forEach((id, z) => fmEntry(d, id, true)!.set('z', z));
        dropEmptyElements(d);
      });
    }
    case 'addSlide': {
      if (model.slides.some((s) => s.id === m.slideId)) throw new MutationError(tr(`Identifiant « ${m.slideId} » déjà utilisé`, `Identifier “${m.slideId}” already used`));
      const after = m.afterSlideId ? model.slides[slideIndex(model, m.afterSlideId)] : model.slides[model.slides.length - 1];
      const at = after ? after.end : text.length;
      const chunk = `---\nid: ${m.slideId}\nlayout: ${m.layout}\n---\n\n${m.title !== undefined ? `# ${formatInline([{ text: m.title }])}\n\n` : ''}`;
      const before = text.slice(0, at);
      return before + (before.endsWith('\n') || !before ? '' : '\n') + chunk + text.slice(at);
    }
    case 'deleteSlide': {
      const s = model.slides[slideIndex(model, m.slideId)]!;
      return splice(text, { start: s.sepStart ?? s.bodyStart, end: s.end }, '');
    }
    case 'duplicateSlide': {
      const si = slideIndex(model, m.slideId);
      if (model.slides.some((s) => s.id === m.newSlideId)) throw new MutationError(tr(`Identifiant « ${m.newSlideId} » déjà utilisé`, `Identifier “${m.newSlideId}” already used`));
      const s = model.slides[si]!;
      const chunk = chunkOf(text, s);
      const before = text.slice(0, s.end);
      const out = before + (before.endsWith('\n') ? '' : '\n') + chunk + text.slice(s.end);
      return editSlideFm(out, si + 1, (d) => d.set('id', m.newSlideId));
    }
    case 'moveSlide': {
      const si = slideIndex(model, m.slideId);
      const s = model.slides[si]!;
      const chunk = chunkOf(text, s);
      let out = splice(text, { start: s.sepStart ?? s.bodyStart, end: s.end }, '');
      const rest = buildMdModel(out).slides;
      const target = rest[Math.min(m.toIndex, rest.length)];
      const at = target ? (target.sepStart ?? target.bodyStart) : out.length;
      const before = out.slice(0, at);
      out = before + (before.endsWith('\n') || !before ? '' : '\n') + chunk + out.slice(at);
      return out;
    }
    case 'setSlideLayout':
      return editSlideFm(text, slideIndex(model, m.slideId), (d) => d.set('layout', m.layout));
    case 'setNotes': {
      const si = slideIndex(model, m.slideId);
      const slot = parsedModel.slides[si]!.notesSlot;
      if (slot) return splice(text, slot.inner!, m.notes ? m.notes.replace(/\n*$/, '\n') : '');
      return editSlideFm(text, si, (d) => (m.notes ? d.set('notes', m.notes) : d.delete('notes')));
    }
    case 'setMasterOverride': {
      const si = slideIndex(model, m.slideId);
      const next = withMasterOverride(current.slides[si]?.masterOverrides, m.index, m.override);
      return editSlideFm(text, si, (d) => (next ? d.set('masterOverrides', d.createNode(next)) : d.delete('masterOverrides')));
    }
    case 'shareText': {
      const si = slideIndex(model, m.slideId);
      const el = current.slides[si]?.elements.find((e) => e.id === m.elementId);
      if (el?.type !== 'text' || !el.placeholder) throw new MutationError(tr(`Élément « ${m.elementId} » : pas un espace réservé de texte`, `Element “${m.elementId}” is not a text placeholder`));
      if (!m.shared) {
        if (!el.shared) return text;
        // This slide gets its own copy, which then hides the shared value here.
        const { source: _s, shared: _sh, ...own } = el;
        const body = slotBody(own);
        if (body !== null && own.id === own.placeholder) return appendSlot(text, si, own.id, body);
        const dsl = elementToDsl(own);
        if (body !== null) delete dsl.content;
        const out = editSlideFm(text, si, (d) => fmElementsSeq(d).add(d.createNode(dsl)));
        return body === null ? out : appendSlot(out, si, own.id, body);
      }
      if (el.shared) return text;
      if (!isPlainRepresentable(el.paragraphs)) throw new MutationError(tr('Seul du texte Markdown simple peut être partagé (pas de couleurs ni de tailles par mot).', 'Only plain Markdown text can be shared (no per-word colors or sizes).'));
      const key = el.placeholder;
      let out = editDocFm(text, (d) => setShared(d, key, paragraphsToMarkdown(el.paragraphs)));
      // Every slide follows the shared value: own values in the same placeholder are dropped (last slide first).
      const layoutOf = (k: number) => (opts.master ? findLayout(opts.master, current.slides[k]!.layout) : undefined);
      for (let k = current.slides.length - 1; k >= 0; k--) {
        const ph = findPlaceholder(layoutOf(k), key);
        for (const e of current.slides[k]!.elements) {
          const same = e.placeholder === key || (!!ph && !!e.placeholder && findPlaceholder(layoutOf(k), e.placeholder) === ph);
          if (same && e.type === 'text' && !e.shared) out = applyOne(out, { kind: 'deleteElement', slideId: current.slides[k]!.id, elementId: e.id }, parseMarkdown(out, opts).doc, opts);
        }
      }
      return out;
    }
  }
}

export function applyMarkdownMutations(text: string, mutations: Mutation[], opts: ParseOptions = {}): string {
  let out = text;
  for (const m of mutations) {
    const current = parseMarkdown(out, opts).doc;
    out = applyOne(out, m, current, opts);
  }
  return out;
}

/** Convert a parsed Markdown presentation to the full DSL (explicit, lossless conversion). */
export { documentToDsl as markdownToDsl } from './dsl.js';

/**
 * Whole document → `.deck` text (new files, PowerPoint import). Each slide's title becomes its
 * `# heading` when it is plain text; every other element is a full definition in the slide
 * frontmatter, so geometry and styles survive exactly.
 */
export function documentToDeck(doc: SlideDocument): string {
  const fm: Record<string, unknown> = { title: doc.metadata.title };
  for (const k of ['author', 'subject', 'footer', 'date'] as const) if (doc.metadata[k]) fm[k] = doc.metadata[k];
  fm.master = doc.masterRef;
  fm.theme = doc.themeRef;
  if (doc.constraints) fm.constraints = doc.constraints;
  const yaml = (v: Record<string, unknown>) => {
    const d = new Document(v);
    blockify(d.contents);
    return d.toString({ lineWidth: 0 });
  };
  let out = `---\n${yaml(fm)}---\n`;
  for (const s of doc.slides) {
    const head: Record<string, unknown> = { id: s.id, layout: s.layout };
    if (s.hidden) head.hidden = true;
    if (s.notes) head.notes = s.notes;
    if (s.masterOverrides) head.masterOverrides = s.masterOverrides;
    const title = s.elements.find((e) => e.id === 'title' && e.type === 'text' && e.placeholder === 'title' && e.paragraphs.length === 1 && isPlainRepresentable(e.paragraphs) && !e.paragraphs[0]!.list);
    const rest: Record<string, unknown>[] = [];
    const slots: string[] = [];
    for (const e of s.elements) {
      const { source: _s, ...el } = e as SlideElement & { source?: unknown };
      if (e === title) {
        // The heading carries the text; geometry and style stay as a frontmatter override.
        const { id: _i, type: _t, paragraphs: _p, placeholder: _ph, ...over } = el as Record<string, unknown>;
        if (Object.keys(over).length) rest.push({ id: 'title', ...over });
        continue;
      }
      if (e.type === 'table' && /^[A-Za-z][\w-]*$/.test(e.id)) {
        const t = tableSlot(el as TableElement);
        slots.push(`::: ${t.head}\n${t.body}\n:::\n`);
        if (t.dsl) rest.push(t.dsl);
        continue;
      }
      const dsl = elementToDsl(el as SlideElement);
      const body = slotBody(e);
      if (body !== null) {
        // Text lives in a `::: id` block; the frontmatter entry keeps placeholder, geometry and style.
        delete dsl.content;
        slots.push(`::: ${e.id}\n${body}\n:::\n`);
      }
      rest.push(dsl);
    }
    if (rest.length) head.elements = rest;
    out += `\n---\n${yaml(head)}---\n\n`;
    if (title?.type === 'text') out += `# ${formatInline(title.paragraphs[0]!.runs)}\n`;
    for (const sl of slots) out += `\n${sl}`;
  }
  return out;
}

/** Markdown for a `::: id` block holding a text box's text, or null when it would not read back identically. */
function slotBody(e: SlideElement): string | null {
  if (e.type !== 'text' || e.id === 'notes' || !/^[A-Za-z][\w-]*$/.test(e.id) || (e.placeholder && !e.paragraphs.length) || !isPlainRepresentable(e.paragraphs)) return null;
  const body = paragraphsToMarkdown(e.paragraphs);
  if ((e.placeholder && !body.trim()) || body.split('\n').some((l) => SLOT_OPEN_RE.test(l) || SLOT_CLOSE_RE.test(l))) return null;
  const back = (md.parse(body) as Root).children.flatMap((n) => blockParagraphs(n));
  return paragraphsToContent(back) === paragraphsToContent(e.paragraphs) ? body : null;
}

/** Append a `::: id` block (`head`: `id` or `placeholder {#id}`) at the end of slide `index`'s body. */
function appendSlot(text: string, index: number, head: string, body: string): string {
  const s = buildMdModel(text).slides[index]!;
  const before = text.slice(0, s.end).replace(/\s*$/, '');
  return `${before}\n\n::: ${head}\n${body}\n:::\n${s.end < text.length ? '\n' : ''}${text.slice(s.end)}`;
}

function blockify(node: unknown): void {
  if (isMap(node) || isSeq(node)) for (const item of node.items as unknown[]) blockify((item as { value?: unknown }).value ?? item);
  else if (node && typeof node === 'object' && 'value' in node && typeof (node as { value: unknown }).value === 'string' && ((node as { value: string }).value).includes('\n')) (node as { type?: string }).type = 'BLOCK_LITERAL';
}
