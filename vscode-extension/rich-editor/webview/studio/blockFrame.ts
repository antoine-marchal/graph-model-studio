/**
 * Block frame (paper only): the hovered block wears a dashed frame. Hovering the frame itself turns
 * it blue; a click on it selects the whole block, so the ribbon and the inspector style the block at once.
 */
import { Extension } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { BLOCK_CONTAINERS } from "./actions";

const key = new PluginKey<number | null>("msBlockFrame");
/** Client px around the block, outside it, that count as the frame. */
const REACH = 9;
const SKIP = new Set(["msObject", "msPageBreak", "msSection"]);

/**
 * Blocks under the pointer, innermost first: a block, then the grouping blocks around it (columns,
 * `:::` groups, embeds). None inside floating objects (they have their own frame).
 */
function blocksUnder(view: EditorView, e: MouseEvent): number[] {
  const hit = view.posAtCoords({ left: e.clientX, top: e.clientY });
  if (!hit) return [];
  const { doc } = view.state;
  const $pos = doc.resolve(hit.pos);
  for (let d = 1; d <= $pos.depth; d++) if ($pos.node(d).type.name === "msObject") return [];
  const out: number[] = [];
  // An atom (picture, diagram…) under the pointer is its own block when it sits at block level.
  if (hit.inside >= 0) {
    const $in = doc.resolve(hit.inside);
    if ($in.depth === 0 || BLOCK_CONTAINERS.has($in.parent.type.name)) out.push(hit.inside);
  }
  for (let d = $pos.depth; d > 0; d--) if (d === 1 || BLOCK_CONTAINERS.has($pos.node(d - 1).type.name)) out.push($pos.before(d));
  return out.filter((p, i) => out.indexOf(p) === i && !SKIP.has(doc.nodeAt(p)?.type.name ?? "msObject"));
}

function rectOf(view: EditorView, pos: number | null): DOMRect | null {
  const dom = pos === null ? null : (view.nodeDOM(pos) as HTMLElement | null);
  return dom?.getBoundingClientRect ? dom.getBoundingClientRect() : null;
}

const within = (r: DOMRect | null, x: number, y: number, m = 0) => !!r && x >= r.left - m && x <= r.right + m && y >= r.top - m && y <= r.bottom + m;

/**
 * Hovered block and whether the pointer is on its frame (around it, not over it). The innermost
 * block under the pointer is hovered; the frame of the hovered block wins over the grouping block
 * around it, so a grouped block and its group are each reachable.
 */
function track(view: EditorView, e: MouseEvent): { pos: number | null; hot: boolean } {
  const { clientX: x, clientY: y } = e;
  const chain = blocksUnder(view, e);
  const under = chain.find((p) => within(rectOf(view, p), x, y)) ?? null;
  const current = key.getState(view.state) ?? null;
  const cr = rectOf(view, current);
  if (current !== null && !within(cr, x, y) && within(cr, x, y, REACH)) {
    const enclosing = under === null || (under < current && current < under + view.state.doc.nodeAt(under)!.nodeSize);
    if (enclosing) return { pos: current, hot: true };
  }
  if (under !== null) return { pos: under, hot: false };
  const near = chain.find((p) => within(rectOf(view, p), x, y, REACH)) ?? null;
  return { pos: near, hot: near !== null };
}

/** Grouping block around the block at `pos` (column, `:::` group, embed…), if any. */
function groupOf(view: EditorView, pos: number): number | null {
  const $p = view.state.doc.resolve(pos);
  for (let d = $p.depth; d > 0; d--) if (d === 1 || BLOCK_CONTAINERS.has($p.node(d - 1).type.name)) return $p.node(d).type.name === "msObject" ? null : $p.before(d);
  return null;
}

function setHover(view: EditorView, pos: number | null) {
  if ((key.getState(view.state) ?? null) !== pos) view.dispatch(view.state.tr.setMeta(key, pos).setMeta("addToHistory", false));
}

export const BlockFrame = Extension.create({
  name: "msBlockFrame",
  addProseMirrorPlugins() {
    return [
      new Plugin<number | null>({
        key,
        state: {
          init: () => null,
          apply(tr, pos) {
            const next = tr.getMeta(key);
            if (next !== undefined) return next;
            if (pos === null || !tr.docChanged) return pos;
            const mapped = tr.mapping.mapResult(pos);
            return mapped.deleted ? null : mapped.pos;
          },
        },
        props: {
          decorations(state) {
            const pos = key.getState(state);
            const node = pos == null ? null : state.doc.nodeAt(pos);
            // A selected block shows the selection frame instead.
            if (!node || (state.selection instanceof NodeSelection && state.selection.from === pos)) return null;
            return DecorationSet.create(state.doc, [Decoration.node(pos!, pos! + node.nodeSize, { class: "ms-block-hover" })]);
          },
        },
        // Capture phase: node views (embeds, diagrams…) stop the events of their own chrome.
        view(view) {
          const dom = view.dom as HTMLElement;
          const onMove = (e: MouseEvent) => {
            if (e.buttons) return;
            const { pos, hot } = track(view, e);
            setHover(view, pos);
            dom.classList.toggle("ms-frame-hot", hot && pos !== null);
          };
          const onLeave = () => {
            dom.classList.remove("ms-frame-hot");
            setHover(view, null);
          };
          const onDown = (e: MouseEvent) => {
            let pos = key.getState(view.state);
            if (e.button !== 0 || !dom.classList.contains("ms-frame-hot") || pos == null) return;
            e.preventDefault();
            e.stopPropagation();
            dom.classList.remove("ms-frame-hot");
            // Clicking the frame of the selected block selects its group (a block in a block shares its edges).
            const sel = view.state.selection;
            if (sel instanceof NodeSelection && sel.from === pos) pos = groupOf(view, pos) ?? pos;
            view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)).setMeta(key, pos));
            view.focus();
          };
          dom.addEventListener("mousemove", onMove, true);
          dom.addEventListener("mouseleave", onLeave);
          dom.addEventListener("mousedown", onDown, true);
          return {
            destroy() {
              dom.removeEventListener("mousemove", onMove, true);
              dom.removeEventListener("mouseleave", onLeave);
              dom.removeEventListener("mousedown", onDown, true);
            },
          };
        },
      }),
    ];
  },
});
