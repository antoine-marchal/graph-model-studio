import { Node, Mark, Extension, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";

/**
 * Block alignment, saved the way GitHub renders it:
 * `<div align="center">` + blank line + block + blank line + `</div>`
 * (grouped by remarkGroupDirectives, split back by rehypeUnwrapDirectives).
 */
export type BlockAlign = "left" | "center" | "right";

export const AlignBlock = Node.create({
  name: "alignBlock",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      align: {
        default: "center",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-align") ?? "center",
        renderHTML: (a: any) => ({ "data-align": a.align }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="align"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-type": "align", class: "align-block" }, HTMLAttributes), 0];
  },
});

/** Align the top-level block at `pos` (left = unwrap: it's the default). */
export function setBlockAlignTr(state: EditorState, pos: number, align: BlockAlign): Transaction | null {
  const node = state.doc.nodeAt(pos);
  const type = state.schema.nodes.alignBlock;
  if (!node || !type) return null;
  const tr = state.tr;
  if (node.type === type) {
    if (align === "left") tr.replaceWith(pos, pos + node.nodeSize, node.content);
    else tr.setNodeMarkup(pos, undefined, { align });
  } else {
    if (align === "left") return null;
    tr.replaceWith(pos, pos + node.nodeSize, type.create({ align }, node));
  }
  return tr;
}

export function blockAlign(node: PMNode): BlockAlign {
  return node.type.name === "alignBlock" ? node.attrs.align : "left";
}

/**
 * Notion-style highlight: `<mark data-color="…">` (plain `<mark>` = yellow).
 * Inline HTML in markdown, rendered by GitHub as a yellow mark.
 */
export const HIGHLIGHT_COLORS = ["yellow", "red", "orange", "green", "blue", "purple", "pink", "gray"] as const;
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number];

export const Highlight = Mark.create({
  name: "highlight",

  addAttributes() {
    return {
      color: {
        default: "yellow",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-color") || "yellow",
        renderHTML: (a: any) => (a.color && a.color !== "yellow" ? { "data-color": a.color } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "mark" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["mark", mergeAttributes({ class: "hl" }, HTMLAttributes), 0];
  },
});

/** Highlight (or with `null`, clear) all text of the block at `pos`. */
export function highlightBlockTr(state: EditorState, pos: number, color: HighlightColor | null): Transaction | null {
  const node = state.doc.nodeAt(pos);
  const type = state.schema.marks.highlight;
  if (!node || !type) return null;
  const from = pos + 1;
  const to = pos + node.nodeSize - 1;
  const tr = state.tr.removeMark(from, to, type);
  if (color) tr.addMark(from, to, type.create({ color }));
  return tr;
}

/**
 * `#tag` chips (nuza style). View-only decoration: the markdown keeps the
 * plain text. Skips code, links and URL fragments.
 */
export const HASHTAG_RE = /(^|[\s(])(#[\p{L}_][\p{L}\p{N}_/-]*)/gu;

const hashtagKey = new PluginKey<DecorationSet>("hashtags");

function hashtagDecorations(doc: PMNode): DecorationSet {
  const out: Decoration[] = [];
  doc.descendants((node, pos, parent) => {
    if (node.type.spec.code) return false;
    if (!node.isText || !node.text) return true;
    if (parent?.type.spec.code) return false;
    if (node.marks.some((m) => m.type.name === "code" || m.type.name === "link")) return false;
    for (const m of node.text.matchAll(HASHTAG_RE)) {
      const start = pos + (m.index ?? 0) + m[1].length;
      out.push(Decoration.inline(start, start + m[2].length, { class: "hashtag" }));
    }
    return false;
  });
  return DecorationSet.create(doc, out);
}

export const Hashtags = Extension.create({
  name: "hashtags",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: hashtagKey,
        state: {
          init: (_c, state) => hashtagDecorations(state.doc),
          apply: (tr, set) => (tr.docChanged ? hashtagDecorations(tr.doc) : set),
        },
        props: {
          decorations: (state) => hashtagKey.getState(state),
        },
      }),
    ];
  },
});
