/**
 * Node view of a positioned object (`msObject`). Its body (image, text box paragraphs) stays in
 * the single ProseMirror document — one editable copy, continuous selection and undo — but is
 * drawn absolutely positioned by the layout pass (pagination.ts → layoutObjects). A click selects
 * the object; a double-click enters its text (Escape leaves to the object).
 */
import { NodeSelection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorView, NodeView } from "@tiptap/pm/view";
import { resolveColor } from "../../document/styles";
import type { ObjectDescriptor, Theme } from "../../document/schema";
import { ptToPx } from "../../document/units";
import { objectOf, studio } from "./store";

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

  const render = () => {
    const id = String(current.attrs.id);
    const d = objectOf(id);
    dom.dataset.id = id;
    dom.classList.toggle("ms-object-flow", !d);
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
    const key = JSON.stringify([d, s.showHidden, s.sections[0]?.sheet.theme, s.selection.includes(String(current.attrs.id)) && s.selection.length > 1]);
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
    if (!d || d.locked?.content || !current.childCount) return;
    editing = true;
    render();
    body.focus();
    const at = e ? view.posAtCoords({ left: e.clientX, top: e.clientY }) : null;
    const pos = getPos();
    if (pos === undefined) return;
    const inside = at && at.pos > pos && at.pos < pos + current.nodeSize ? at.pos : pos + current.nodeSize - 2;
    view.dispatch(view.state.tr.setSelection((view.state.selection.constructor as any).near(view.state.doc.resolve(inside))));
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
    if (e.shiftKey) {
      const id = String(current.attrs.id);
      studio.set((s) => ({ selection: s.selection.includes(id) ? s.selection.filter((x) => x !== id) : [...s.selection, id] }));
      return;
    }
    select();
  });
  dom.addEventListener("keydown", (e) => {
    if (editing && e.key === "Escape") {
      e.preventDefault();
      editing = false;
      render();
      select();
      view.focus();
    }
  });

  // Caret leaving the body ends text editing.
  const onSelectionChange = () => {
    if (!editing) return;
    const sel = document.getSelection();
    if (sel?.anchorNode && !body.contains(sel.anchorNode)) {
      editing = false;
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
          editing = false;
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
      unsubscribe();
      document.removeEventListener("selectionchange", onSelectionChange);
    },
  };
}
