import { Extension, Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { diffWords } from "diff";

/**
 * Rendered-diff container: one per diffed block, `kind` = same / ins / del /
 * old / new / gap (see renderedDiff.ts). Only registered in DiffView.
 */
export const DiffBlock = Node.create({
  name: "diffBlock",
  group: "block",
  content: "block+",
  isolating: true,

  addAttributes() {
    const attr = (name: string, fallback: string | null = null) => ({
      default: fallback,
      parseHTML: (el: HTMLElement) => el.getAttribute(`data-${name}`) ?? fallback,
      renderHTML: (a: any) => (a[name] != null ? { [`data-${name}`]: a[name] } : {}),
    });
    return { diff: attr("diff", "same"), pair: attr("pair"), far: attr("far") };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="diff"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-type": "diff", class: "diff-block" }, HTMLAttributes), 0];
  },
});

/**
 * The block's text — textblocks (paragraphs, table cells…) separated by a
 * newline so words in neighbouring cells don't merge — and a map from
 * offsets in it to document positions.
 */
function textOf(node: PMNode, nodePos: number) {
  const runs: { start: number; pos: number; len: number }[] = [];
  let text = "";
  let parent: PMNode | null = null;
  node.descendants((child, pos, par) => {
    if (!child.isText) return true;
    if (par !== parent && text) text += "\n";
    parent = par;
    runs.push({ start: text.length, pos: nodePos + 1 + pos, len: child.text!.length });
    text += child.text!;
    return false;
  });
  return { text, at: positionAt(runs) };
}

function positionAt(runs: { start: number; pos: number; len: number }[]) {
  return (o: number, end = false) => {
    for (const r of runs) {
      if (end ? o > r.start && o <= r.start + r.len : o >= r.start && o < r.start + r.len) return r.pos + (o - r.start);
    }
    return null;
  };
}

function wordDecorations(doc: PMNode): DecorationSet {
  const pairs = new Map<string, { node: PMNode; pos: number; kind: string }[]>();
  doc.forEach((node, pos) => {
    if (node.type.name !== "diffBlock" || node.attrs.pair == null) return;
    const list = pairs.get(node.attrs.pair) ?? [];
    list.push({ node, pos, kind: node.attrs.diff });
    pairs.set(node.attrs.pair, list);
  });
  const out: Decoration[] = [];
  for (const list of pairs.values()) {
    const oldB = list.find((x) => x.kind === "old");
    const newB = list.find((x) => x.kind === "new");
    if (!oldB || !newB) continue;
    const { text: oldText, at: oldAt } = textOf(oldB.node, oldB.pos);
    const { text: newText, at: newAt } = textOf(newB.node, newB.pos);
    let o = 0;
    let n = 0;
    for (const part of diffWords(oldText, newText)) {
      const len = part.value.length;
      if (part.removed || part.added) {
        const at = part.removed ? oldAt : newAt;
        // One decoration per textblock piece (separators map to nothing).
        let start = part.removed ? o : n;
        for (const piece of part.value.split("\n")) {
          const from = at(start);
          const to = at(start + piece.length, true);
          if (from != null && to != null && to > from && piece.trim()) {
            out.push(Decoration.inline(from, to, { class: part.removed ? "diff-word-del" : "diff-word-ins" }));
          }
          start += piece.length + 1;
        }
      }
      if (!part.added) o += len;
      if (!part.removed) n += len;
    }
  }
  return DecorationSet.create(doc, out);
}

const wordDiffKey = new PluginKey<DecorationSet>("diffWords");

/** Word-level highlights inside modified (old/new) block pairs. */
export const DiffWords = Extension.create({
  name: "diffWords",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: wordDiffKey,
        state: {
          init: (_c, state) => wordDecorations(state.doc),
          apply: (tr, set) => (tr.docChanged ? wordDecorations(tr.doc) : set),
        },
        props: { decorations: (state) => wordDiffKey.getState(state) },
      }),
    ];
  },
});
