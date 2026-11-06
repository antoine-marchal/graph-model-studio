import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { diffArrays, diffWords } from "diff";
import { remarkGroupDirectives } from "./conversion-utils";
import { extractFrontmatter, frontmatterBody } from "./frontmatter";

/**
 * Rendered diff, block by block: both versions are split into top-level
 * markdown blocks (directive cards and aligned blocks count as one), the
 * block sequences are diffed, and each block is then rendered by the same
 * pipeline + Tiptap extensions as read mode (DiffView / DiffBlock).
 */

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkGroupDirectives);

export interface MdBlocks {
  blocks: string[];
  /** 1-based source line where each block starts (frontmatter = line 1). */
  lines: number[];
  /** Link / footnote definitions — appended to every block so references resolve. */
  defs: string[];
}

/** Git on Windows hands back LF blobs next to CRLF working copies: compare text, not line endings. */
export const normalizeEol = (md: string) => md.replace(/\r\n?/g, "\n");

export function splitBlocks(md: string): MdBlocks {
  const { content, frontmatter } = extractFrontmatter(normalizeEol(md));
  const offset = frontmatter ? frontmatter.split("\n").length - 1 : 0;
  const tree = parser.runSync(parser.parse(content)) as any;
  const blocks: string[] = [];
  const lines: number[] = [];
  const defs: string[] = [];
  if (frontmatter) {
    blocks.push("```yaml\n" + (frontmatterBody(frontmatter) ?? "").replace(/\n+$/, "") + "\n```");
    lines.push(1);
  }
  for (const node of tree.children as any[]) {
    if (!node.position) continue;
    const src = content.slice(node.position.start.offset, node.position.end.offset);
    if (node.type === "definition" || node.type === "footnoteDefinition") defs.push(src);
    else {
      blocks.push(src);
      lines.push(node.position.start.line + offset);
    }
  }
  return { blocks, lines, defs };
}

export type DiffKind = "same" | "ins" | "del" | "old" | "new" | "gap" | "pad-old" | "pad-new";

export interface DiffEntry {
  kind: DiffKind;
  md: string;
  /** Shared by an `old` / `new` pair (a modified block). */
  pair?: number;
  /** Unchanged block far from any change (hidden in "changes only"). */
  far?: boolean;
  /** For `gap`: how many hidden blocks it stands for. */
  count?: number;
  /** New-version source line of the block (same / ins / new): anchors review threads. */
  line?: number;
  /** Earlier-version source line of the block (same / del / old): the "before" line number. */
  oldLine?: number;
}

/** Share of characters two blocks have in common (0–1). */
export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (!max) return 1;
  let same = 0;
  for (const part of diffWords(a, b)) if (!part.added && !part.removed) same += part.value.length;
  return same / max;
}

export function diffBlocks(oldMd: string, newMd: string, context = 1): { entries: DiffEntry[]; defs: string[] } {
  const a = splitBlocks(oldMd);
  const b = splitBlocks(newMd);
  const raw: DiffEntry[] = [];
  let pair = 0;
  // Index into the new version, to give each new-side block its source line.
  let ni = 0;
  const lineOf = (md: string) => {
    // Added runs are consumed in order, so the next matching block is this one.
    while (ni < b.blocks.length && b.blocks[ni] !== md) ni++;
    return b.lines[ni++];
  };
  let oi = 0;
  const oldLineOf = (md: string) => {
    while (oi < a.blocks.length && a.blocks[oi] !== md) oi++;
    return a.lines[oi++];
  };
  const parts = diffArrays(a.blocks, b.blocks);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part.added && !part.removed) {
      for (const md of part.value) raw.push({ kind: "same", md, line: lineOf(md), oldLine: oldLineOf(md) });
      continue;
    }
    // A removed run next to an added run: pair similar blocks as "modified".
    const next = parts[i + 1];
    const removed = part.removed ? part.value : next?.removed ? next.value : [];
    const added = part.added ? part.value : next?.added ? next.value : [];
    if ((part.removed && next?.added) || (part.added && next?.removed)) i++;
    const n = Math.max(removed.length, added.length);
    const dels: DiffEntry[] = [];
    const ins: DiffEntry[] = [];
    for (let k = 0; k < n; k++) {
      const o = removed[k];
      const w = added[k];
      if (o !== undefined && w !== undefined && similarity(o, w) >= 0.4) {
        // Flush so the pair stays adjacent: old directly above new.
        raw.push(...dels.splice(0), ...ins.splice(0));
        raw.push({ kind: "old", md: o, pair, oldLine: oldLineOf(o) }, { kind: "new", md: w, pair, line: lineOf(w) });
        pair++;
      } else {
        if (o !== undefined) dels.push({ kind: "del", md: o, oldLine: oldLineOf(o) });
        if (w !== undefined) ins.push({ kind: "ins", md: w, line: lineOf(w) });
      }
    }
    raw.push(...dels, ...ins);
  }

  // Unchanged blocks more than `context` blocks from a change are "far";
  // each run of them is announced by one gap entry.
  const changed = raw.map((e) => e.kind !== "same");
  const near = raw.map((_, i) => {
    for (let d = -context; d <= context; d++) if (changed[i + d]) return true;
    return false;
  });
  const entries: DiffEntry[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i].kind !== "same" || near[i]) {
      entries.push(raw[i]);
      continue;
    }
    let j = i;
    while (j < raw.length && raw[j].kind === "same" && !near[j]) j++;
    entries.push({ kind: "gap", md: "", count: j - i });
    for (let k = i; k < j; k++) entries.push({ ...raw[k], far: true });
    i = j - 1;
  }
  return { entries, defs: [...new Set([...b.defs, ...a.defs])] };
}
