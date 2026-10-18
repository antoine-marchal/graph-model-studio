import { Node, Mark, Extension, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
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

/**
 * Side-by-side columns (`<div class="ms-columns">` / `<div class="ms-column">`,
 * see COLUMNS_OPEN in conversion-utils). Each column holds any blocks.
 */
export const Columns = Node.create({
  name: "columns",
  group: "block",
  content: "column+",
  defining: true,
  isolating: true,
  draggable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="columns"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-type": "columns", class: "ms-columns" }, HTMLAttributes), 0];
  },

  addProseMirrorPlugins() {
    return [columnResizePlugin()];
  },
});

export const Column = Node.create({
  name: "column",
  content: "block+",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      // Relative width (flex-grow): 1 = equal share.
      flex: {
        default: 1,
        parseHTML: (el: HTMLElement) => Number(el.getAttribute("data-flex")) || 1,
        renderHTML: (a: any) =>
          a.flex && a.flex !== 1 ? { "data-flex": String(a.flex), style: `flex-grow:${a.flex}` } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-type": "column", class: "ms-column" }, HTMLAttributes), 0];
  },
});

/**
 * Drag the gap between two columns to resize them (double-click resets all
 * to equal). The pair keeps its total flex; while dragging, widths are node
 * decorations (no re-render of the columns' content), committed on mouseup
 * as one undoable step.
 */
const columnResizeKey = new PluginKey<Record<number, number> | null>("columnResize");
const GAP_HIT = 10;
const MIN_COL_PX = 60;

function columnEls(colsEl: Element): HTMLElement[] {
  return [...colsEl.children].filter((c) => c.classList.contains("ms-column")) as HTMLElement[];
}

/** Index of the column left of the gap under clientX, or -1. */
function gapAt(colsEl: Element, x: number): number {
  const cols = columnEls(colsEl);
  for (let i = 0; i < cols.length - 1; i++) {
    const mid = (cols[i].getBoundingClientRect().right + cols[i + 1].getBoundingClientRect().left) / 2;
    if (Math.abs(x - mid) <= GAP_HIT) return i;
  }
  return -1;
}

/** Positions of the column nodes of the columns layout rendered as colsEl. */
function columnPositions(view: EditorView, colsEl: Element): number[] | null {
  const $in = view.state.doc.resolve(view.posAtDOM(colsEl, 0));
  if ($in.parent.type.name !== "columns") return null;
  const out: number[] = [];
  let pos = $in.start();
  $in.parent.forEach((col) => {
    out.push(pos);
    pos += col.nodeSize;
  });
  return out;
}

function columnResizePlugin(): Plugin {
  // On body: ProseMirror reverts class changes on its own DOM.
  const setHover = (on: boolean) => document.body.classList.toggle("col-resize-hover", on);

  return new Plugin<Record<number, number> | null>({
    key: columnResizeKey,
    state: {
      init: () => null,
      apply: (tr, v) => {
        const meta = tr.getMeta(columnResizeKey);
        if (meta !== undefined) return meta;
        return tr.docChanged ? null : v;
      },
    },
    props: {
      decorations(state) {
        const live = columnResizeKey.getState(state);
        if (!live) return null;
        return DecorationSet.create(
          state.doc,
          Object.entries(live).map(([p, flex]) => {
            const pos = Number(p);
            return Decoration.node(pos, pos + state.doc.nodeAt(pos)!.nodeSize, { style: `flex-grow:${flex}` });
          }),
        );
      },
      handleDOMEvents: {
        mousemove(view, e) {
          if (!view.editable || e.buttons) return false;
          const colsEl = (e.target as HTMLElement).closest?.(".ms-columns");
          setHover(!!colsEl && gapAt(colsEl, e.clientX) >= 0);
          return false;
        },
        mouseleave() {
          setHover(false);
          return false;
        },
        dblclick(view, e) {
          if (!view.editable) return false;
          const colsEl = (e.target as HTMLElement).closest?.(".ms-columns");
          if (!colsEl || gapAt(colsEl, e.clientX) < 0) return false;
          const positions = columnPositions(view, colsEl);
          if (!positions) return false;
          const tr = view.state.tr;
          for (const p of positions) tr.setNodeAttribute(p, "flex", 1);
          view.dispatch(tr);
          e.preventDefault();
          return true;
        },
        mousedown(view, e) {
          if (!view.editable || e.button !== 0) return false;
          const colsEl = (e.target as HTMLElement).closest?.(".ms-columns");
          const i = colsEl ? gapAt(colsEl, e.clientX) : -1;
          const positions = colsEl && i >= 0 ? columnPositions(view, colsEl) : null;
          if (!colsEl || !positions) return false;
          e.preventDefault();

          const [a, b] = columnEls(colsEl).slice(i, i + 2);
          const [pa, pb] = positions.slice(i, i + 2);
          const fa = view.state.doc.nodeAt(pa)!.attrs.flex || 1;
          const fb = view.state.doc.nodeAt(pb)!.attrs.flex || 1;
          const wa = a.getBoundingClientRect().width;
          const pair = wa + b.getBoundingClientRect().width;
          const sum = fa + fb;
          const x0 = e.clientX;
          let next: [number, number] = [fa, fb];
          document.body.classList.add("col-resizing");

          const onMove = (ev: MouseEvent) => {
            const w = Math.min(Math.max(wa + ev.clientX - x0, MIN_COL_PX), pair - MIN_COL_PX);
            const na = Math.round((sum * w * 100) / pair) / 100;
            next = [na, Math.round((sum - na) * 100) / 100];
            view.dispatch(view.state.tr.setMeta(columnResizeKey, { [pa]: next[0], [pb]: next[1] }));
          };
          const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            document.body.classList.remove("col-resizing");
            const tr = view.state.tr.setMeta(columnResizeKey, null);
            // Snap a near-equal pair back to the default.
            const equal = Math.abs(next[0] - next[1]) < 0.04 && Math.abs(sum - 2) < 0.01;
            if (next[0] !== fa) {
              tr.setNodeAttribute(pa, "flex", equal ? 1 : next[0]);
              tr.setNodeAttribute(pb, "flex", equal ? 1 : next[1]);
            }
            view.dispatch(tr);
          };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
          return true;
        },
      },
    },
  });
}

/** Insert an empty `count`-column layout and put the caret in its first column. */
export function insertColumns(editor: any, count: number): void {
  const content = {
    type: "columns",
    content: Array.from({ length: count }, () => ({ type: "column", content: [{ type: "paragraph" }] })),
  };
  editor.chain().focus().insertContent(content).run();
  // insertContent leaves the caret after the content (last column).
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name !== "columns") continue;
    // columns > column > paragraph: three opening tokens in.
    editor.commands.setTextSelection($from.before(d) + 3);
    return;
  }
}

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
