import { Document, isMap, isSeq, LineCounter, parseDocument, Scalar, YAMLMap, YAMLSeq, stringify, type Node } from 'yaml';
import {
  contentToParagraphs,
  isPlainRepresentable,
  MutationError,
  normalizePatch,
  paragraphsToContent,
  reorderIds,
  SlideDocument,
  SlideElement,
  type Mutation,
  type Paragraph,
  type SlideNode,
} from '@corporate-slides/core';
import type { ParseResult, ParseOptions } from './types.js';
import { formatZodError } from './types.js';

/* ------------------------------------------------------------------ */
/* DSL ⇄ canonical element conversion                                 */
/* ------------------------------------------------------------------ */

const ELEMENT_KEY_ORDER = ['id', 'type', 'placeholder', 'shape', 'x', 'y', 'w', 'h', 'rotation', 'z', 'locked', 'hidden', 'name', 'content', 'paragraphs', 'src', 'alt', 'rows', 'header', 'colAlign', 'colWidths', 'rowHeights', 'from', 'to', 'route', 'fromSide', 'toSide', 'flipH', 'flipV', 'style'];

/** Canonical element → plain DSL object (deterministic key order, `content` sugar when lossless). */
export function elementToDsl(el: SlideElement): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const src = el as Record<string, unknown>;
  for (const k of ELEMENT_KEY_ORDER) {
    if (k === 'paragraphs') continue;
    if (k === 'content') {
      const paras = src.paragraphs as Paragraph[] | undefined;
      if (paras && isPlainRepresentable(paras)) out.content = paragraphsToContent(paras);
      else if (paras) out.paragraphs = paras;
    } else if (k === 'style' && src.style) {
      out.style = Object.fromEntries(Object.entries(src.style as object).sort(([a], [b]) => a.localeCompare(b)));
    } else if (src[k] !== undefined) out[k] = src[k];
  }
  return out;
}

/** Plain DSL object → canonical element input (before zod validation). */
export function dslToElement(raw: Record<string, unknown>): Record<string, unknown> {
  const el: Record<string, unknown> = { ...raw };
  if (el.type === undefined) el.type = 'text';
  if (typeof el.content === 'string' || typeof el.content === 'number') {
    el.paragraphs = contentToParagraphs(String(el.content));
  } else if (el.type === 'text' && el.paragraphs === undefined) el.paragraphs = [];
  delete el.content;
  if (typeof el.id === 'number') el.id = String(el.id);
  return el;
}

/** Deterministic DSL text for a whole document (used for new files and Markdown → DSL conversion). */
export function documentToDsl(doc: SlideDocument): string {
  const presentation: Record<string, unknown> = { title: doc.metadata.title };
  for (const k of ['author', 'subject', 'footer', 'date'] as const) if (doc.metadata[k]) presentation[k] = doc.metadata[k];
  presentation.master = doc.masterRef;
  presentation.theme = doc.themeRef;
  if (doc.constraints) presentation.constraints = doc.constraints;
  const slides = doc.slides.map((s) => {
    const o: Record<string, unknown> = { id: s.id, layout: s.layout };
    if (s.hidden) o.hidden = true;
    if (s.notes) o.notes = s.notes;
    o.elements = s.elements.map(elementToDsl);
    return o;
  });
  const d = new Document({ presentation, slides });
  blockifyStrings(d.contents as Node);
  return d.toString({ lineWidth: 0 });
}

/** Render multi-line strings as `|` literal blocks for readability. */
function blockifyStrings(node: Node | null | undefined): void {
  if (!node) return;
  if (isMap(node) || isSeq(node)) for (const item of node.items as unknown[]) {
    const n = (item as { value?: Node }).value ?? (item as Node);
    blockifyStrings(n as Node);
  }
  else if (node instanceof Scalar && typeof node.value === 'string' && node.value.includes('\n')) node.type = 'BLOCK_LITERAL';
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

export function parseDsl(text: string, opts: ParseOptions = {}): ParseResult {
  const lc = new LineCounter();
  const ydoc = parseDocument(text, { lineCounter: lc, keepSourceTokens: false });
  const errors = ydoc.errors.map((e) => `Ligne ${e.linePos?.[0]?.line ?? '?'} : ${e.message.split('\n')[0]}`);
  const line = (offset: number | undefined) => (offset === undefined ? 0 : lc.linePos(offset).line);
  const root = ydoc.contents;
  const pres = (isMap(root) ? (root.get('presentation') as YAMLMap | undefined) : undefined)?.toJSON?.() ?? {};
  const slidesNode = isMap(root) ? root.get('slides') : undefined;

  const slides: SlideNode[] = [];
  if (isSeq(slidesNode)) {
    slidesNode.items.forEach((item, i) => {
      if (!isMap(item)) {
        errors.push(`Diapositive ${i + 1} : objet attendu`);
        return;
      }
      const raw = item.toJSON() as Record<string, unknown>;
      const elementsNode = item.get('elements');
      const elements: SlideElement[] = [];
      if (isSeq(elementsNode)) {
        elementsNode.items.forEach((en, j) => {
          if (!isMap(en)) return;
          const r = SlideElement.safeParse(dslToElement(en.toJSON() as Record<string, unknown>));
          if (!r.success) {
            errors.push(`Diapositive ${i + 1}, élément ${j + 1} (ligne ${line(en.range?.[0])}) : ${formatZodError(r.error)}`);
            return;
          }
          elements.push({ ...r.data, source: { kind: 'dsl', startLine: line(en.range?.[0]), endLine: line(en.range?.[1]) } });
        });
      }
      slides.push({
        id: String(raw.id ?? `slide-${i + 1}`),
        layout: String(raw.layout ?? 'content'),
        ...(raw.notes ? { notes: String(raw.notes) } : {}),
        ...(raw.hidden ? { hidden: true } : {}),
        elements,
        source: { kind: 'dsl', startLine: line(item.range?.[0]), endLine: line(item.range?.[1]) },
      });
    });
  } else if (slidesNode !== undefined) errors.push('`slides` doit être une liste');

  const candidate = {
    version: '1',
    metadata: { title: pres.title ?? 'Présentation', author: pres.author, subject: pres.subject, footer: pres.footer, date: pres.date },
    masterRef: String(pres.master ?? 'corporate'),
    themeRef: String(pres.theme ?? 'default'),
    dimensions: opts.dimensions ?? { width: 13.3333, height: 7.5 },
    constraints: pres.constraints,
    slides,
  };
  const r = SlideDocument.safeParse(candidate);
  if (!r.success) {
    errors.push(formatZodError(r.error));
    return { doc: { ...candidate, constraints: undefined, metadata: { title: String(candidate.metadata.title) }, slides: slides.filter((s) => /^[A-Za-z0-9][\w-]*$/.test(s.id)) } as SlideDocument, errors };
  }
  return { doc: r.data, errors };
}

/* ------------------------------------------------------------------ */
/* Format-preserving mutation application                             */
/* ------------------------------------------------------------------ */

function slidesSeq(d: Document): YAMLSeq {
  let seq = d.get('slides');
  if (!isSeq(seq)) {
    seq = d.createNode([]);
    d.set('slides', seq);
  }
  return seq as YAMLSeq;
}

function findSlide(d: Document, slideId: string, docModel: SlideDocument): { node: YAMLMap; index: number } {
  const seq = slidesSeq(d);
  const index = docModel.slides.findIndex((s) => s.id === slideId);
  const node = seq.items[index];
  if (index < 0 || !isMap(node)) throw new MutationError(`Diapositive « ${slideId} » introuvable`);
  return { node, index };
}

function findElement(slide: YAMLMap, elementId: string): { seq: YAMLSeq; node: YAMLMap; index: number } {
  const seq = slide.get('elements');
  if (!isSeq(seq)) throw new MutationError(`Élément « ${elementId} » introuvable`);
  const index = seq.items.findIndex((n) => isMap(n) && String(n.get('id')) === elementId);
  if (index < 0) throw new MutationError(`Élément « ${elementId} » introuvable`);
  return { seq, node: seq.items[index] as YAMLMap, index };
}

const textNode = (d: Document, s: string) => {
  const n = d.createNode(s) as Scalar;
  if (s.includes('\n')) n.type = 'BLOCK_LITERAL';
  return n;
};

/** Apply an element patch to a YAML map node holding a DSL element (also used by Markdown frontmatter). */
export function patchElementNode(d: Document, node: YAMLMap, patch: ReturnType<typeof normalizePatch>, opts: { allowText: boolean }): void {
  const { style, paragraphs, placeholder, ...rest } = patch;
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) node.set(k, Array.isArray(v) ? d.createNode(v) : v);
  if (placeholder === null) node.delete('placeholder');
  else if (placeholder !== undefined) node.set('placeholder', placeholder);
  if (style) {
    let sm = node.get('style');
    if (!isMap(sm)) {
      sm = d.createNode({});
      node.set('style', sm);
    }
    for (const [k, v] of Object.entries(style)) {
      if (v === null) (sm as YAMLMap).delete(k);
      else (sm as YAMLMap).set(k, v);
    }
    if ((sm as YAMLMap).items.length === 0) node.delete('style');
  }
  if (paragraphs) {
    if (!opts.allowText) throw new MutationError('Texte non modifiable ici');
    if (isPlainRepresentable(paragraphs)) {
      node.delete('paragraphs');
      node.set('content', textNode(d, paragraphsToContent(paragraphs)));
    } else {
      node.delete('content');
      node.set('paragraphs', d.createNode(paragraphs));
    }
  }
}

export function applyDslMutations(text: string, model: SlideDocument, mutations: Mutation[]): string {
  const d = parseDocument(text);
  if (d.errors.length) throw new MutationError('Le fichier source contient des erreurs YAML : corrigez-les avant toute édition visuelle');
  let current = model;
  for (const m of mutations) {
    switch (m.kind) {
      case 'updateElement': {
        const { node: sn } = findSlide(d, m.slideId, current);
        const { node } = findElement(sn, m.elementId);
        patchElementNode(d, node, normalizePatch(m.patch), { allowText: true });
        break;
      }
      case 'addElement': {
        const { node: sn } = findSlide(d, m.slideId, current);
        let seq = sn.get('elements');
        if (!isSeq(seq)) {
          seq = d.createNode([]);
          sn.set('elements', seq);
        }
        const n = d.createNode(elementToDsl(m.element)) as Node;
        blockifyStrings(n);
        (seq as YAMLSeq).add(n);
        break;
      }
      case 'deleteElement': {
        const { node: sn } = findSlide(d, m.slideId, current);
        const { seq, index } = findElement(sn, m.elementId);
        seq.delete(index);
        break;
      }
      case 'reorderElement': {
        const { node: sn, index } = findSlide(d, m.slideId, current);
        const order = reorderIds(current.slides[index]!, m.elementId, m.direction);
        const seq = sn.get('elements') as YAMLSeq;
        const byId = new Map(seq.items.map((n) => [String((n as YAMLMap).get('id')), n]));
        seq.items = order.map((id) => byId.get(id)!).filter(Boolean);
        for (const n of seq.items) (n as YAMLMap).delete('z');
        break;
      }
      case 'addSlide': {
        const seq = slidesSeq(d);
        const after = m.afterSlideId ? current.slides.findIndex((s) => s.id === m.afterSlideId) : seq.items.length - 1;
        const elements = m.title !== undefined ? [{ id: 'title', type: 'text', placeholder: 'title', content: m.title }] : [];
        seq.items.splice(after + 1, 0, d.createNode({ id: m.slideId, layout: m.layout, elements }) as YAMLMap);
        break;
      }
      case 'deleteSlide': {
        const { index } = findSlide(d, m.slideId, current);
        slidesSeq(d).delete(index);
        break;
      }
      case 'duplicateSlide': {
        const { node, index } = findSlide(d, m.slideId, current);
        const copy = node.clone() as YAMLMap;
        copy.set('id', m.newSlideId);
        slidesSeq(d).items.splice(index + 1, 0, copy);
        break;
      }
      case 'moveSlide': {
        const { node, index } = findSlide(d, m.slideId, current);
        const seq = slidesSeq(d);
        seq.items.splice(index, 1);
        seq.items.splice(Math.min(m.toIndex, seq.items.length), 0, node);
        break;
      }
      case 'setSlideLayout':
        findSlide(d, m.slideId, current).node.set('layout', m.layout);
        break;
      case 'setNotes': {
        const { node } = findSlide(d, m.slideId, current);
        if (m.notes) node.set('notes', textNode(d, m.notes));
        else node.delete('notes');
        break;
      }
    }
    // Re-derive the model so subsequent mutations in the transaction see consistent indexes.
    current = parseDsl(d.toString({ lineWidth: 0 }), { dimensions: current.dimensions }).doc;
  }
  return d.toString({ lineWidth: 0 });
}

export const dslStringify = (v: unknown) => stringify(v, { lineWidth: 0 });
