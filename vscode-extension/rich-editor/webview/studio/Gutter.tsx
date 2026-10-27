/**
 * Page-view gutter, drawn on the paper (zoom-scaled coordinates): Notion-style handles beside the
 * hovered block (`+` adds a block below and opens the block menu; the grip drags the block, a click
 * opens its context menu) and the Markdown source line of every block, left of the vertical ruler.
 * Both are toggled from View › Show.
 */
import React, { useEffect, useState } from "react";
import type { Editor } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { studio, useStudio } from "./store";
import { getSync } from "./actions";
import { useEditorDerived } from "./hooks";
import { Icon } from "./icons";
import { tr } from "./ui";

const SKIP = new Set(["msObject", "msSection", "msPageBreak"]);

/** Paper coordinates of a client rect (the paper is CSS-scaled by the zoom). */
function paperRect(editor: Editor, el: Element) {
  const paper = editor.view.dom.parentElement!.getBoundingClientRect();
  const zoom = studio.get().zoom || 1;
  const r = el.getBoundingClientRect();
  return { top: (r.top - paper.top) / zoom, left: (r.left - paper.left) / zoom, height: r.height / zoom };
}

export function BlockHandles({ editor }: { editor: Editor }) {
  const [target, setTarget] = useState<{ pos: number; top: number; left: number } | null>(null);
  const masterEdit = useStudio((s) => !!s.masterEdit);

  useEffect(() => {
    const scroller = editor.view.dom.closest(".editor-container");
    if (!scroller) return;
    let frame = 0;
    const onMove = (e: Event) => {
      const { clientY, target: t } = e as MouseEvent;
      if ((t as HTMLElement).closest?.(".ms-block-handle")) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        let hit: { pos: number; top: number; left: number } | null = null;
        editor.state.doc.forEach((node, pos) => {
          if (hit || SKIP.has(node.type.name)) return;
          const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
          if (!dom?.getBoundingClientRect) return;
          const r = dom.getBoundingClientRect();
          if (clientY < r.top - 6 || clientY > r.bottom + 6) return;
          const p = paperRect(editor, dom);
          // Align with the first line of text.
          const line = parseFloat(getComputedStyle(dom).lineHeight) || 20;
          hit = { pos, top: p.top + Math.max(0, Math.min(line, p.height) / 2 - 11), left: p.left };
        });
        setTarget((old) => (hit ? hit : old));
      });
    };
    const onLeave = () => setTarget(null);
    const onUpdate = () => setTarget(null);
    scroller.addEventListener("mousemove", onMove);
    scroller.addEventListener("mouseleave", onLeave);
    editor.on("update", onUpdate);
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener("mousemove", onMove);
      scroller.removeEventListener("mouseleave", onLeave);
      editor.off("update", onUpdate);
    };
  }, [editor]);

  if (!target || masterEdit || !editor.isEditable) return null;
  const node = editor.state.doc.nodeAt(target.pos);
  if (!node) return null;

  const addBelow = () => {
    const end = target.pos + node.nodeSize;
    const { tr: t, schema } = editor.state;
    t.insert(end, schema.nodes.paragraph.create(null, schema.text("/")));
    t.setSelection(TextSelection.create(t.doc, end + 2));
    editor.view.dispatch(t.scrollIntoView());
    editor.view.focus();
    setTarget(null);
  };
  const onDragStart = (e: React.DragEvent) => {
    const { view } = editor;
    const selection = NodeSelection.create(view.state.doc, target.pos);
    view.dispatch(view.state.tr.setSelection(selection));
    (view as any).dragging = { slice: selection.content(), move: true };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", node.textContent);
    const dom = view.nodeDOM(target.pos) as HTMLElement | null;
    if (dom) e.dataTransfer.setDragImage(dom, 0, 0);
  };
  const openMenu = (e: React.MouseEvent) => {
    editor.view.dispatch(editor.state.tr.setSelection(node.isTextblock ? TextSelection.create(editor.state.doc, target.pos + 1) : NodeSelection.create(editor.state.doc, target.pos)));
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    studio.set({ contextMenu: { x: r.left, y: r.bottom + 4, target: { kind: "block", pos: target.pos } } });
  };
  return (
    <div className="ms-block-handle" style={{ top: target.top, left: target.left - 50 }} contentEditable={false}>
      <button type="button" className="ms-block-handle-btn" title={tr("Ajouter un bloc en dessous", "Add a block below")} aria-label={tr("Ajouter un bloc en dessous", "Add a block below")} onMouseDown={(e) => e.preventDefault()} onClick={addBelow}>
        <Icon name="plus" size={14} />
      </button>
      <button type="button" className="ms-block-handle-btn is-grip" draggable title={tr("Glisser pour déplacer · cliquer pour le menu", "Drag to move · click for the menu")} aria-label={tr("Menu du bloc", "Block menu")} aria-haspopup="menu" onMouseDown={(e) => e.stopPropagation()} onDragStart={onDragStart} onDragEnd={() => setTarget(null)} onClick={openMenu}>
        <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden fill="currentColor"><circle cx="2.5" cy="2.5" r="1.3" /><circle cx="7.5" cy="2.5" r="1.3" /><circle cx="2.5" cy="7" r="1.3" /><circle cx="7.5" cy="7" r="1.3" /><circle cx="2.5" cy="11.5" r="1.3" /><circle cx="7.5" cy="11.5" r="1.3" /></svg>
      </button>
    </div>
  );
}

/** Source line of each block, beside the page (read on idle; positions from the laid-out paper). */
export function LineNumberGutter({ editor }: { editor: Editor }) {
  const layout = useStudio((s) => s.layout);
  const current = useEditorDerived(editor, (e) => {
    const $from = e.state.selection.$from;
    return $from.depth ? $from.before(1) : -1;
  });
  const lines = useEditorDerived(editor, (e) => {
    const sync = getSync();
    const out: { pos: number; line: number; top: number }[] = [];
    if (!sync) return out;
    e.state.doc.forEach((node, pos) => {
      if (node.type.name === "msSection" || node.type.name === "msPageBreak") return;
      const line = sync.lineOf(node);
      const dom = e.view.nodeDOM(pos) as HTMLElement | null;
      if (!line || !dom?.getBoundingClientRect) return;
      out.push({ pos, line, top: Math.round(paperRect(e, dom).top) });
    });
    return out;
  }, true);
  if (!layout || !lines) return null;
  const left = Math.min(...layout.pages.map((p) => p.left)) - 26;
  return (
    <div className="ms-line-gutter" aria-hidden style={{ left, height: layout.height }}>
      {lines.map((l) => (
        <span key={l.pos} className={l.pos === current ? "is-current" : ""} style={{ top: l.top }} onClick={() => editor.chain().focus().setTextSelection(l.pos + 1).run()}>
          {l.line}
        </span>
      ))}
    </div>
  );
}
