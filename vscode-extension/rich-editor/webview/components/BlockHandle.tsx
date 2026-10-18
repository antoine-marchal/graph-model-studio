import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";
import { AlignCenter, AlignLeft, AlignRight, ArrowDown, ArrowUp, Columns3, Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import { HIGHLIGHT_COLORS, blockAlign, highlightBlockTr, setBlockAlignTr, type BlockAlign } from "../extensions/BlockStyle";

/**
 * Notion-style block handle. Hovering any top-level block (paragraph,
 * heading, table, GMC/mermaid diagram, code, math, HTML…) shows a `+` and a
 * grip in the left margin:
 *   - `+` inserts an empty paragraph below (type `/` for the block menu);
 *   - dragging the grip moves the block (ProseMirror drop handling);
 *   - clicking the grip opens Delete / Duplicate / Move up / Move down.
 * Inside a columns layout the handle targets the block under the pointer in
 * its column; the menu's "Columns layout" switches to the layout itself.
 */

interface Target {
  /** Index in the parent (the doc, or a column). */
  index: number;
  pos: number;
  /** Position of the parent column, -1 for the doc. */
  parentPos: number;
  top: number;
  left: number;
  /** The columns layout holding this block, if any. */
  outer?: Target;
}

export function BlockHandle({ editor, containerRef, gutter = 0 }: {
  editor: Editor;
  containerRef: React.RefObject<HTMLDivElement>;
  /** Extra left offset (px) so the handle clears the line-number gutter. */
  gutter?: number;
}) {
  const [target, setTarget] = useState<Target | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);

  /** Block under the pointer: top-level by clientY, then inside columns by clientX. */
  const locate = useCallback(
    (clientX: number, clientY: number): Target | null => {
      const container = containerRef.current;
      if (!container) return null;
      const { view } = editor;
      const base = container.getBoundingClientRect();
      const handleLeft = (el: HTMLElement) =>
        el.getBoundingClientRect().left - base.left + (parseFloat(getComputedStyle(el).paddingLeft) || 0) - 52;

      const find = (parent: PMNode, parentPos: number, left: number, outer?: Target): Target | null => {
        const start = parentPos + 1;
        let found: Target | null = null;
        let above: Target | null = null;
        for (let index = 0, offset = 0; index < parent.childCount && !found; offset += parent.child(index).nodeSize, index++) {
          const pos = start + offset;
          const dom = view.nodeDOM(pos) as HTMLElement | null;
          if (!dom || dom.nodeType !== 1) continue;
          const rect = dom.getBoundingClientRect();
          const style = getComputedStyle(dom);
          const lineHeight = parseFloat(style.lineHeight) || 24;
          const t: Target = {
            index,
            pos,
            parentPos,
            top: rect.top - base.top + container.scrollTop + Math.max(0, (Math.min(lineHeight, rect.height) - 24) / 2),
            left,
            outer,
          };
          if (rect.top <= clientY) above = t;
          const marginTop = parseFloat(style.marginTop) || 0;
          const marginBottom = parseFloat(style.marginBottom) || 0;
          if (clientY >= rect.top - marginTop && clientY <= rect.bottom + marginBottom) found = t;
        }
        // Below the end of a short column: its last block.
        const hit = found ?? (outer ? above : null);
        if (!hit) return null;
        const node = view.state.doc.nodeAt(hit.pos);
        if (node?.type.name !== "columns") return hit;
        // The column under clientX (the last one starting left of it).
        let colPos = -1;
        let colDom: HTMLElement | null = null;
        for (let i = 0, offset = 0; i < node.childCount; offset += node.child(i).nodeSize, i++) {
          const pos = hit.pos + 1 + offset;
          const dom = view.nodeDOM(pos) as HTMLElement | null;
          if (!dom || dom.nodeType !== 1) continue;
          if (!colDom || clientX >= dom.getBoundingClientRect().left) {
            colPos = pos;
            colDom = dom;
          }
        }
        const column = colDom ? view.state.doc.nodeAt(colPos) : null;
        if (!column || !colDom) return hit;
        return find(column, colPos, handleLeft(colDom), hit) ?? hit;
      };

      return find(view.state.doc, -1, handleLeft(view.dom) - gutter);
    },
    [editor, containerRef, gutter],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onMove = (e: MouseEvent) => {
      if (menuOpen || !editor.isEditable) return;
      if (handleRef.current?.contains(e.target as Node)) return;
      const next = locate(e.clientX, e.clientY);
      // Keep the handle while the pointer travels from the block to it.
      if (next) setTarget(next);
    };
    const onLeave = () => {
      if (!menuOpen) setTarget(null);
    };
    container.addEventListener("mousemove", onMove);
    container.addEventListener("mouseleave", onLeave);
    return () => {
      container.removeEventListener("mousemove", onMove);
      container.removeEventListener("mouseleave", onLeave);
    };
  }, [containerRef, editor, locate, menuOpen]);

  // Auto-scroll while dragging near the top/bottom edge (wheel events don't
  // fire during a native drag). dragover repeats ~every 50ms even when still.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const EDGE = 80;
    const onDragOver = (e: DragEvent) => {
      const r = container.getBoundingClientRect();
      const up = e.clientY - r.top;
      const down = r.bottom - e.clientY;
      if (up < EDGE) container.scrollTop -= Math.ceil((EDGE - up) / 2);
      else if (down < EDGE) container.scrollTop += Math.ceil((EDGE - down) / 2);
    };
    container.addEventListener("dragover", onDragOver);
    return () => container.removeEventListener("dragover", onDragOver);
  }, [containerRef]);

  // Hide on edits (positions shift) unless the menu is in use.
  useEffect(() => {
    const onUpdate = () => {
      if (!menuOpen) setTarget(null);
    };
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
    };
  }, [editor, menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !handleRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [menuOpen]);

  if (!target || !editor.isEditable) return null;

  const { doc } = editor.state;
  const parent = target.parentPos < 0 ? doc : doc.nodeAt(target.parentPos);
  if (!parent || target.index >= parent.childCount) return null;
  const node = parent.child(target.index);
  const end = target.pos + node.nodeSize;

  const act = (fn: () => void) => {
    fn();
    setMenuOpen(false);
    setTarget(null);
    editor.commands.focus();
  };

  const remove = () =>
    act(() => {
      const { tr, schema } = editor.state;
      // A container (doc, column) keeps at least one block.
      if (parent.childCount === 1) tr.replaceWith(target.pos, end, schema.nodes.paragraph.create());
      else tr.delete(target.pos, end);
      editor.view.dispatch(tr);
    });

  const duplicate = () => act(() => editor.view.dispatch(editor.state.tr.insert(end, node)));

  const move = (dir: -1 | 1) =>
    act(() => {
      const neighbourIndex = target.index + dir;
      if (neighbourIndex < 0 || neighbourIndex >= parent.childCount) return;
      const neighbour = parent.child(neighbourIndex);
      const tr = editor.state.tr.delete(target.pos, end);
      tr.insert(dir < 0 ? target.pos - neighbour.nodeSize : target.pos + neighbour.nodeSize, node);
      editor.view.dispatch(tr);
    });

  const addBelow = () =>
    act(() => {
      const { tr, schema } = editor.state;
      tr.insert(end, schema.nodes.paragraph.create());
      editor.view.dispatch(tr);
      editor.commands.setTextSelection(end + 1);
    });

  const onDragStart = (e: React.DragEvent) => {
    const { view } = editor;
    const selection = NodeSelection.create(view.state.doc, target.pos);
    view.dispatch(view.state.tr.setSelection(selection));
    const slice = selection.content();
    (view as any).dragging = { slice, move: true };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", node.textContent);
    const dom = view.nodeDOM(target.pos) as HTMLElement | null;
    if (dom) e.dataTransfer.setDragImage(dom, 0, 0);
    setMenuOpen(false);
  };

  return (
    <div
      ref={handleRef}
      className="block-handle"
      style={{ top: target.top, left: target.left }}
      contentEditable={false}
    >
      <button className="block-handle-btn" title="Add a block below" onClick={addBelow}>
        <Plus size={14} />
      </button>
      <button
        className="block-handle-btn"
        title="Drag to move · click for options"
        draggable
        onDragStart={onDragStart}
        onDragEnd={() => setTarget(null)}
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <GripVertical size={14} />
      </button>
      {menuOpen && (
        <div className="block-handle-menu" role="menu" ref={menuRef}>
          <div className="block-handle-menu-title">{node.type.name.replace(/([A-Z])/g, " $1").toLowerCase()}</div>
          <button role="menuitem" onClick={remove} className="danger">
            <Trash2 size={13} /> Delete
          </button>
          <button role="menuitem" onClick={duplicate}>
            <Copy size={13} /> Duplicate
          </button>
          <button role="menuitem" onClick={() => move(-1)} disabled={target.index === 0}>
            <ArrowUp size={13} /> Move up
          </button>
          <button role="menuitem" onClick={() => move(1)} disabled={target.index >= parent.childCount - 1}>
            <ArrowDown size={13} /> Move down
          </button>
          {target.outer && (
            <button role="menuitem" onClick={() => setTarget(target.outer!)} title="Move, duplicate or delete the whole columns layout">
              <Columns3 size={13} /> Columns layout…
            </button>
          )}
          <div className="block-handle-menu-title">align</div>
          <div className="block-handle-menu-row">
            {(["left", "center", "right"] as BlockAlign[]).map((a) => (
              <button
                key={a}
                className={blockAlign(node) === a ? "active" : ""}
                title={`Align ${a}`}
                aria-label={`Align ${a}`}
                onClick={() => act(() => {
                  const tr = setBlockAlignTr(editor.state, target.pos, a);
                  if (tr) editor.view.dispatch(tr);
                })}
              >
                {a === "left" ? <AlignLeft size={13} /> : a === "center" ? <AlignCenter size={13} /> : <AlignRight size={13} />}
              </button>
            ))}
          </div>
          {node.isTextblock || node.type.name === "alignBlock" || node.type.name === "blockquote" ? (
            <>
              <div className="block-handle-menu-title">highlight</div>
              <div className="block-handle-menu-row">
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c}
                    className="hl-swatch"
                    data-color={c}
                    title={c}
                    aria-label={`Highlight ${c}`}
                    onClick={() => act(() => {
                      const tr = highlightBlockTr(editor.state, target.pos, c);
                      if (tr) editor.view.dispatch(tr);
                    })}
                  />
                ))}
                <button
                  className="hl-swatch hl-none"
                  title="No highlight"
                  aria-label="No highlight"
                  onClick={() => act(() => {
                    const tr = highlightBlockTr(editor.state, target.pos, null);
                    if (tr) editor.view.dispatch(tr);
                  })}
                />
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
