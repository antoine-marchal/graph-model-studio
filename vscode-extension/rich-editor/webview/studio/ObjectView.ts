/**
 * Node view of a positioned object (`msObject`). Its body (image, text box paragraphs) stays in
 * the single ProseMirror document — one editable copy, continuous selection and undo — but is
 * drawn absolutely positioned by the layout pass (pagination.ts → layoutObjects). A click selects
 * the object; a double-click enters its text (Escape leaves to the object).
 */
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorView, NodeView } from "@tiptap/pm/view";
import { resolveColor } from "../../document/styles";
import type { ObjectDescriptor, Theme } from "../../document/schema";
import { ptToPx } from "../../document/units";
import { objectOf, studio } from "./store";
import { connectClick } from "./actions";

const SVG_NS = "http://www.w3.org/2000/svg";

/** SVG for a shape of `w`×`h` px. */
export function shapeSvg(d: ObjectDescriptor, w: number, h: number, theme: Theme): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(Math.max(1, w)));
  svg.setAttribute("height", String(Math.max(1, h)));
  svg.setAttribute("aria-hidden", "true");
  svg.style.overflow = "visible";
  const style = d.style ?? {};
  const fill = style.fill === null ? "none" : `#${resolveColor(style.fill ?? (d.type === "textbox" ? null : "theme.accent1"), theme) ?? "FFFFFF"}`;
  const stroke = style.line === null ? "none" : `#${resolveColor(style.line ?? (d.shape === "line" ? "theme.dk1" : d.type === "textbox" ? "theme.dk2" : undefined), theme) ?? "none"}`;
  const sw = ptToPx(style.lineWidth ?? 1);
  const el = (tag: string, attrs: Record<string, string | number>) => {
    const e = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
    e.setAttribute("fill", tag === "line" ? "none" : d.type === "textbox" && style.fill === undefined ? "none" : fill);
    e.setAttribute("stroke", stroke === "#none" ? "none" : stroke);
    e.setAttribute("stroke-width", String(sw));
    if (style.dash === "dash") e.setAttribute("stroke-dasharray", `${sw * 4} ${sw * 3}`);
    if (style.dash === "dot") e.setAttribute("stroke-dasharray", `${sw} ${sw * 2}`);
    if (style.transparency) e.setAttribute("opacity", String(1 - style.transparency / 100));
    svg.appendChild(e);
  };
  const r = Math.min(w, h) / 6;
  switch (d.shape ?? (d.type === "textbox" ? "rect" : "rect")) {
    case "ellipse": el("ellipse", { cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2 }); break;
    case "roundRect": el("rect", { x: 0, y: 0, width: w, height: h, rx: r, ry: r }); break;
    case "triangle": el("polygon", { points: `${w / 2},0 ${w},${h} 0,${h}` }); break;
    case "diamond": el("polygon", { points: `${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}` }); break;
    case "rightArrow": el("polygon", { points: `0,${h * 0.25} ${w * 0.65},${h * 0.25} ${w * 0.65},0 ${w},${h / 2} ${w * 0.65},${h} ${w * 0.65},${h * 0.75} 0,${h * 0.75}` }); break;
    case "chevron": el("polygon", { points: `0,0 ${w * 0.75},0 ${w},${h / 2} ${w * 0.75},${h} 0,${h} ${w * 0.25},${h / 2}` }); break;
    case "line": el("line", { x1: 0, y1: 0, x2: w, y2: h }); break;
    default: el("rect", { x: 0, y: 0, width: w, height: h });
  }
  return svg;
}

/**
 * Caret for text editing in the object at `pos`: the clicked point when it is in one of its
 * paragraphs, else the nearest end of one of them — never a position outside the object
 * (`Selection.near` from a point between two of its blocks would leave it).
 */
export function caretInside(view: EditorView, pos: number, at?: number): TextSelection {
  const doc = view.state.doc;
  const obj = doc.nodeAt(pos)!;
  const want = at ?? pos + obj.nodeSize;
  let best: { pos: number; d: number } | null = null;
  obj.descendants((n, p) => {
    if (!n.isTextblock) return true;
    const start = pos + 1 + p + 1;
    const end = start + n.content.size;
    const c = Math.min(Math.max(want, start), end);
    if (!best || Math.abs(c - want) < best.d) best = { pos: c, d: Math.abs(c - want) };
    return false;
  });
  return TextSelection.create(doc, best ? (best as { pos: number }).pos : pos + 1);
}

export function createObjectView({ node, view, getPos }: { node: PMNode; view: EditorView; getPos: () => number | undefined }): NodeView {
  let current = node;
  let editing = false;
  const dom = document.createElement("div");
  dom.className = "ms-object";
  const art = document.createElement("div");
  art.className = "ms-object-art";
  const body = document.createElement("div");
  body.className = "ms-object-body";
  dom.append(art, body);

  const setEditing = (on: boolean) => {
    editing = on;
    const id = String(current.attrs.id);
    const now = studio.get().editingObject;
    if (on && now !== id) studio.set({ editingObject: id });
    else if (!on && now === id) studio.set({ editingObject: null });
  };

  const render = () => {
    const id = String(current.attrs.id);
    const d = objectOf(id);
    dom.dataset.id = id;
    dom.classList.toggle("ms-object-flow", !d);
    // Continuous view: every positioned object sits in the text flow, at its anchor.
    dom.classList.toggle("ms-object-inline", !!d && !studio.get().pageView);
    dom.classList.toggle("is-editing", editing);
    if (!d) {
      body.contentEditable = "true";
      art.replaceChildren();
      return;
    }
    const { showHidden, sections, selection } = studio.get();
    dom.dataset.type = d.type;
    dom.dataset.placement = d.placement;
    dom.classList.toggle("is-hidden", !!d.hidden);
    dom.classList.toggle("is-revealed", !!d.hidden && showHidden);
    dom.classList.toggle("is-behind", d.plane === "behind");
    dom.classList.toggle("is-locked", !!d.locked?.geometry);
    dom.classList.toggle("is-multi", selection.includes(id) && selection.length > 1);
    dom.setAttribute("aria-label", `${d.name ?? id} (${d.type})`);
    const w = ptToPx(d.box.width);
    const h = ptToPx(d.box.height);
    dom.style.width = `${w}px`;
    dom.style.height = `${h}px`;
    dom.style.transform = d.rotation ? `rotate(${d.rotation}deg)` : "";
    art.replaceChildren(d.type === "shape" || d.type === "textbox" ? shapeSvg(d, w, h, sections[0].sheet.theme) : document.createTextNode(""));
    const pad = ptToPx(d.style?.padding ?? (d.type === "image" ? 0 : 4));
    body.style.padding = `${pad}px`;
    body.style.justifyContent = d.style?.valign === "middle" || (d.type === "shape" && !d.style?.valign) ? "center" : d.style?.valign === "bottom" ? "flex-end" : "flex-start";
    body.style.textAlign = d.style?.align ?? (d.type === "shape" ? "center" : "");
    body.style.color = d.style?.color ? `#${resolveColor(d.style.color, sections[0].sheet.theme)}` : "";
    body.contentEditable = editing && !d.locked?.content ? "true" : "false";
  };

  let lastKey = "";
  const unsubscribe = studio.subscribe(() => {
    const s = studio.get();
    const d = objectOf(String(current.attrs.id));
    const key = JSON.stringify([d, s.showHidden, s.pageView, s.sections[0]?.sheet.theme, s.selection.includes(String(current.attrs.id)) && s.selection.length > 1]);
    if (key !== lastKey) {
      lastKey = key;
      render();
    }
  });

  const select = () => {
    const pos = getPos();
    if (pos === undefined) return;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
  };
  const enter = (e?: MouseEvent) => {
    const d = objectOf(String(current.attrs.id));
    if (!d || d.locked?.content || d.type === "image" || d.type === "connector") return;
    let pos = getPos();
    if (pos === undefined) return;
    // A shape gets its (empty) text paragraph on first edit, as in Slides Studio / PowerPoint.
    if (!current.childCount) {
      view.dispatch(view.state.tr.insert(pos + 1, view.state.schema.nodes.paragraph.create()));
      pos = getPos();
      if (pos === undefined) return;
    }
    setEditing(true);
    render();
    body.focus();
    const at = e && (e.clientX || e.clientY) ? view.posAtCoords({ left: e.clientX, top: e.clientY }) : null;
    view.dispatch(view.state.tr.setSelection(caretInside(view, pos, at?.pos)));
  };
  dom.addEventListener("dblclick", (e) => {
    if (editing) return;
    e.preventDefault();
    enter(e);
  });
  dom.addEventListener("mousedown", (e) => {
    if (editing || e.button !== 0) return;
    // Object manipulation: the overlay (ObjectLayer) handles the drag; here only the selection.
    e.preventDefault();
    if (connectClick(String(current.attrs.id))) return;
    if (e.shiftKey) {
      const id = String(current.attrs.id);
      studio.set((s) => ({ selection: s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id] }));
      return;
    }
    select();
  });
  // Escape leaves the text to the object. Keys reach the editor root (the body is not focused
  // on its own), so listen there.
  const onKey = (e: KeyboardEvent) => {
    if (!editing || e.key !== "Escape" || view.composing) return;
    e.preventDefault();
    e.stopPropagation();
    setEditing(false);
    render();
    select();
    view.focus();
  };
  view.dom.addEventListener("keydown", onKey, true);

  // Caret leaving the body ends text editing.
  const onSelectionChange = () => {
    if (!editing) return;
    const sel = document.getSelection();
    if (sel?.anchorNode && !body.contains(sel.anchorNode) && !(sel.anchorNode as Element).closest?.(".ribbon-wrap, .inspector")) {
      setEditing(false);
      render();
    }
  };
  document.addEventListener("selectionchange", onSelectionChange);

  render();
  return {
    dom,
    contentDOM: body,
    update(next) {
      if (next.type !== current.type) return false;
      current = next;
      render();
      return true;
    },
    selectNode() {
      dom.classList.add("is-selected");
      const id = String(current.attrs.id);
      if (!studio.get().selection.includes(id) || studio.get().selection.length > 1) studio.set({ selection: [id] });
    },
    deselectNode() {
      dom.classList.remove("is-selected");
      if (editing) {
        // Leaving with the caret elsewhere ends text editing.
        const pos = getPos();
        const sel = view.state.selection;
        if (pos === undefined || sel.from < pos || sel.to > pos + current.nodeSize) {
          setEditing(false);
          render();
        }
      }
    },
    stopEvent(e) {
      return !editing && (e.type === "mousedown" || e.type === "dblclick" || e.type.startsWith("drag"));
    },
    ignoreMutation(m) {
      // Only the body is document content; our own frame / art / style changes are not.
      return !body.contains(m.target as globalThis.Node) || (m.type === "attributes" && m.target === body);
    },
    destroy() {
      if (editing) setEditing(false);
      unsubscribe();
      view.dom.removeEventListener("keydown", onKey, true);
      document.removeEventListener("selectionchange", onSelectionChange);
    },
  };
}
