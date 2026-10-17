import { Extension, type Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { diffArrays } from "diff";
import { splitBlocks } from "../renderedDiff";
import { extractFrontmatter } from "../frontmatter";
import { vscodeApi } from "../vscode-api";

/**
 * One side of VS Code's diff editor showing a .md in the rich editor. The
 * host pairs the two panes and sends both texts (`diffPeer`): top-level
 * blocks the other side lacks are tinted (green on the modified side, red on
 * the original), a line marks where the other side has blocks this one
 * lacks, and scrolling is mirrored to the other pane, aligned by block.
 */

const key = new PluginKey("diffMarks");
let editor: Editor | null = null;
/** Class per top-level block ("" = unchanged). */
let marks: string[] = [];
/** Own top-level block index → aligned block index on the other side. */
let toPeer: number[] = [];
let cache: { doc: PMNode | null; marks: string[]; set: DecorationSet } = { doc: null, marks, set: DecorationSet.empty };

const blocks = (md: string) => splitBlocks(extractFrontmatter(md).content).blocks.map((b) => b.trim());

export function diffMarks(own: string, other: string, side: "original" | "modified") {
  const changed = side === "modified" ? "ms-diff-ins" : "ms-diff-del";
  const nextMarks: string[] = [];
  const nextToPeer: number[] = [];
  let peer = 0;
  // Peer index where the current run of removed blocks starts (-1 = none):
  // added blocks right after it replace them, else the run is a gap.
  let removedAt = -1;
  for (const part of diffArrays(blocks(other), blocks(own))) {
    for (let i = 0; i < part.value.length; i++) {
      if (part.removed) {
        if (removedAt < 0) removedAt = peer;
        peer++;
      } else if (part.added) {
        nextToPeer.push(removedAt < 0 ? peer : removedAt);
        nextMarks.push(changed);
      } else {
        nextToPeer.push(peer++);
        nextMarks.push(removedAt >= 0 && nextMarks[nextMarks.length - 1] !== changed ? "ms-diff-gap" : "");
        removedAt = -1;
      }
    }
  }
  const gap = removedAt >= 0 && nextMarks[nextMarks.length - 1] !== changed;
  if (gap && nextMarks.length) nextMarks[nextMarks.length - 1] = `${nextMarks[nextMarks.length - 1]} ms-diff-gap-after`.trim();
  return { marks: nextMarks, toPeer: nextToPeer };
}

const container = () => document.querySelector<HTMLElement>(".editor-container");

function topBlocks(): (HTMLElement | null)[] {
  const out: (HTMLElement | null)[] = [];
  editor?.state.doc.forEach((_, pos) => {
    const el = editor!.view.nodeDOM(pos);
    out.push(el instanceof HTMLElement ? el : null);
  });
  return out;
}

let mutedUntil = 0;
let frame = 0;
document.addEventListener(
  "scroll",
  (e) => {
    const box = container();
    if (!box || !marks.length || e.target !== box || Date.now() < mutedUntil || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const top = box.getBoundingClientRect().top;
      const els = topBlocks();
      const i = els.findIndex((el) => el && el.getBoundingClientRect().bottom > top);
      const rect = els[i]?.getBoundingClientRect();
      const added = /ms-diff-(ins|del)/.test(marks[i] ?? "");
      vscodeApi.postMessage({
        type: "diffScroll",
        block: i < 0 ? -1 : toPeer[i] ?? i,
        fraction: rect && !added ? Math.min(1, Math.max(0, (top - rect.top) / rect.height)) : 0,
        atEnd: box.scrollTop + box.clientHeight >= box.scrollHeight - 2,
        atStart: box.scrollTop <= 0,
      });
    });
  },
  true,
);

window.addEventListener("message", (e) => {
  const msg = e.data;
  if (msg?.type === "diffPeer" && editor) {
    ({ marks, toPeer } = diffMarks(String(msg.own), String(msg.other), msg.side === "original" ? "original" : "modified"));
    editor.view.dispatch(editor.state.tr.setMeta(key, true));
  } else if (msg?.type === "diffScrollTo") {
    const box = container();
    if (!box) return;
    mutedUntil = Date.now() + 200;
    if (msg.atStart) box.scrollTop = 0;
    else if (msg.atEnd) box.scrollTop = box.scrollHeight;
    else {
      const el = topBlocks()[msg.block];
      if (!el) return;
      const rect = el.getBoundingClientRect();
      box.scrollTop += rect.top - box.getBoundingClientRect().top + msg.fraction * rect.height;
    }
  }
});

export const DiffMarks = Extension.create({
  name: "diffMarks",

  onCreate() {
    editor = this.editor;
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        props: {
          decorations(state) {
            if (!marks.length) return null;
            if (cache.doc !== state.doc || cache.marks !== marks) {
              const decorations: Decoration[] = [];
              let i = 0;
              state.doc.forEach((node, pos) => {
                const cls = marks[i++];
                if (cls) decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: cls }));
              });
              cache = { doc: state.doc, marks, set: DecorationSet.create(state.doc, decorations) };
            }
            return cache.set;
          },
        },
      }),
    ];
  },
});
