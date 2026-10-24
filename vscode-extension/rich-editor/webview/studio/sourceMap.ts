/**
 * Source preservation for the rich editor. Every top-level ProseMirror node is tied (by node
 * identity — ProseMirror nodes are immutable, unchanged blocks keep their object) to the source
 * range it was parsed from. Saving reuses the exact source text of every unchanged block and the
 * original whitespace between them; only new or edited blocks are serialized. An incoming source
 * change replaces only the blocks it touches, so caret, node views and scroll elsewhere stay.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { DOMParser as PMDOMParser, DOMSerializer, Fragment, type Node as PMNode, type Schema } from "@tiptap/pm/model";
import { remarkGroupDirectives } from "../conversion-utils";

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkGroupDirectives);

export interface Range {
  start: number;
  end: number;
}
export type NodeRanges = Map<PMNode, Range>;

const isSourceBlock = (n: any) => n.type !== "definition" && n.type !== "footnoteDefinition";

/** Ranges of the top-level blocks of `body`, in the order markdownToHtml stamps them (`data-ms-blk`). */
export function sourceBlocks(body: string): Range[] {
  const tree = parser.runSync(parser.parse(body)) as any;
  return (tree.children as any[]).filter(isSourceBlock).map((n) => ({ start: n.position?.start.offset ?? 0, end: n.position?.end.offset ?? 0 }));
}

const blkOf = (node: PMNode): number | undefined => {
  const v = node.attrs?.msBlk;
  return v === null || v === undefined || v === "" ? undefined : Number(v);
};

/**
 * Freshly loaded document → ranges, from the block stamps; nodes without a stamp take the only
 * unclaimed block between their stamped neighbours (when there is exactly one).
 */
export function mapLoadedDoc(doc: PMNode, ranges: Range[]): NodeRanges {
  const map: NodeRanges = new Map();
  const nodes: PMNode[] = [];
  doc.forEach((n) => void nodes.push(n));
  const idx: (number | undefined)[] = nodes.map((n) => {
    const b = blkOf(n);
    return b !== undefined && b >= 0 && b < ranges.length ? b : undefined;
  });
  for (let i = 0; i < nodes.length; ) {
    if (idx[i] !== undefined) {
      i++;
      continue;
    }
    let j = i;
    while (j < nodes.length && idx[j] === undefined) j++;
    const lo = i > 0 ? idx[i - 1]! : -1;
    const hi = j < nodes.length ? idx[j]! : ranges.length;
    if (hi - lo === 2) for (let k = i; k < j; k++) idx[k] = lo + 1;
    i = j;
  }
  nodes.forEach((n, i) => idx[i] !== undefined && map.set(n, ranges[idx[i]!]));
  return map;
}

/** One node → Markdown (the existing HTML → Markdown pipeline). */
export function nodeHtml(schema: Schema, node: PMNode): string {
  const div = document.createElement("div");
  div.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(Fragment.from(node)));
  return div.innerHTML;
}

const blank = (s: string) => !/\S/.test(s);

/**
 * Body text for `doc`: unchanged blocks (same node object, whole group present, range used once)
 * keep their exact source; others go through `toMarkdown`. Returns the ranges of the output.
 */
export function serializeBody(doc: PMNode, base: string, map: NodeRanges, toMarkdown: (node: PMNode) => string): { text: string; map: NodeRanges } {
  const groupSize = new Map<string, number>();
  const key = (r: Range) => `${r.start}:${r.end}`;
  const nodes: PMNode[] = [];
  doc.forEach((n) => void nodes.push(n));
  for (const n of nodes) {
    const r = map.get(n);
    if (r) groupSize.set(key(r), (groupSize.get(key(r)) ?? 0) + 1);
  }
  // Group sizes as loaded (nodes of a group no longer present make it incomplete).
  const loaded = new Map<string, number>();
  for (const r of map.values()) loaded.set(key(r), (loaded.get(key(r)) ?? 0) + 1);

  type Piece = { text: string; nodes: PMNode[]; src?: Range };
  const pieces: Piece[] = [];
  const used = new Set<string>();
  for (let i = 0; i < nodes.length; ) {
    const r = map.get(nodes[i]);
    if (r && !used.has(key(r))) {
      let j = i;
      while (j < nodes.length && map.get(nodes[j]) === r) j++;
      if (j - i === loaded.get(key(r)) && groupSize.get(key(r)) === j - i) {
        used.add(key(r));
        pieces.push({ text: base.slice(r.start, r.end), nodes: nodes.slice(i, j), src: r });
        i = j;
        continue;
      }
    }
    pieces.push({ text: toMarkdown(nodes[i]).replace(/\s+$/, ""), nodes: [nodes[i]] });
    i++;
  }

  let text = "";
  const out: NodeRanges = new Map();
  const first = pieces.find((p) => p.text);
  if (first?.src && blank(base.slice(0, first.src.start))) text = base.slice(0, first.src.start);
  else if (first) text = /^\s*/.exec(base)![0].replace(/[^\n\r]/g, "");
  let prev: Piece | undefined;
  for (const p of pieces) {
    if (!p.text && !p.src) {
      for (const n of p.nodes) out.set(n, { start: text.length, end: text.length });
      continue;
    }
    if (prev) {
      const gap = prev.src && p.src && p.src.start >= prev.src.end ? base.slice(prev.src.end, p.src.start) : null;
      text += gap !== null && blank(gap) && /\n/.test(gap) ? gap : "\n\n";
    }
    const start = text.length;
    text += p.text;
    for (const n of p.nodes) out.set(n, { start, end: text.length });
    prev = p;
  }
  if (prev?.src && blank(base.slice(prev.src.end))) text += base.slice(prev.src.end);
  else if (prev && (base.endsWith("\n") || !base)) text += /\r\n$/.test(base) ? "\r\n" : "\n";
  return { text, map: out };
}

/** Reference definitions of a body, appended when a fragment of it is parsed on its own. */
const definitions = (body: string) => (body.match(/^ {0,3}\[[^\]\n]+\]:[ \t]*\S.*$/gm) ?? []).join("\n");

export interface BodyUpdate {
  /** Document position range to replace and its new content. */
  from: number;
  to: number;
  content: Fragment;
  /** Output ranges for every top-level node after the update (old nodes keep identity). */
  map: (newDoc: PMNode) => NodeRanges;
}

/**
 * Plan the replacement turning the editor content (`oldBody`, ranges `map`) into `newBody`:
 * the top-level blocks touched by the changed span are re-parsed, the rest stay. Null when the
 * mapping cannot place the change (the caller reloads everything).
 */
export async function planBodyUpdate(doc: PMNode, schema: Schema, oldBody: string, map: NodeRanges, newBody: string, toHtml: (md: string) => Promise<string>): Promise<BodyUpdate | null> {
  if (oldBody === newBody) return null;
  let s = 0;
  const max = Math.min(oldBody.length, newBody.length);
  while (s < max && oldBody.charCodeAt(s) === newBody.charCodeAt(s)) s++;
  let eo = oldBody.length;
  let en = newBody.length;
  while (eo > s && en > s && oldBody.charCodeAt(eo - 1) === newBody.charCodeAt(en - 1)) eo--, en--;
  const delta = newBody.length - oldBody.length;

  const tops: { node: PMNode; pos: number; r?: Range }[] = [];
  doc.forEach((node, pos) => void tops.push({ node, pos, r: map.get(node) }));
  if (tops.some((t) => !t.r)) return null;
  // Touched blocks: ranges intersecting [s, eo] (a change in the gap touches its neighbours).
  let i0 = tops.findIndex((t) => t.r!.end >= s);
  if (i0 < 0) i0 = tops.length - 1;
  let i1 = -1;
  for (let k = tops.length - 1; k >= 0; k--) if (tops[k].r!.start <= eo) {
    i1 = k;
    break;
  }
  if (i1 < 0) i1 = 0;
  if (i1 < i0) [i0, i1] = [i1, i0];
  // Whole groups.
  while (i0 > 0 && tops[i0 - 1].r === tops[i0].r) i0--;
  while (i1 < tops.length - 1 && tops[i1 + 1].r === tops[i1].r) i1++;
  const segStart = Math.min(tops[i0].r!.start, s);
  const segEndOld = Math.max(tops[i1].r!.end, eo);
  const segEnd = segEndOld + delta;
  if (segEnd < segStart) return null;
  const segment = newBody.slice(segStart, segEnd);
  const defs = definitions(newBody);
  const html = await toHtml(defs ? `${segment}\n\n${defs}\n` : segment);
  const container = document.createElement("div");
  container.innerHTML = html;
  const parsed = PMDOMParser.fromSchema(schema).parse(container);
  const segRanges = sourceBlocks(segment).map((r) => ({ start: r.start + segStart, end: r.end + segStart }));
  const content = parsed.content;
  const from = tops[i0].pos;
  const to = tops[i1].pos + tops[i1].node.nodeSize;
  return {
    from,
    to,
    content,
    map: (newDoc) => {
      const out: NodeRanges = new Map();
      const fresh = new Set<PMNode>();
      content.forEach((n) => void fresh.add(n));
      const local = mapLoadedDoc(schema.topNodeType.create(null, content), segRanges.map((r) => ({ start: r.start - segStart, end: r.end - segStart })));
      newDoc.forEach((n) => {
        const old = map.get(n);
        if (old && !fresh.has(n)) out.set(n, old.end <= s ? old : { start: old.start + delta, end: old.end + delta });
        else {
          const r = local.get(n);
          if (r) out.set(n, { start: r.start + segStart, end: r.end + segStart });
        }
      });
      return out;
    },
  };
}
