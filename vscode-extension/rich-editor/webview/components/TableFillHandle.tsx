import React, { useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import type { EditorState } from "@tiptap/pm/state";
import { fillTr, type CellRect } from "../extensions/TableFilter";

/**
 * Excel fill handle: the small square at the bottom-right corner of the
 * selected cell / range. Drag it down, up, left or right to extend the
 * content (series continue, text repeats) over the new cells.
 */

interface Sel {
  tablePos: number;
  rect: CellRect;
  map: TableMap;
}

function currentSel(state: EditorState): Sel | null {
  const sel = state.selection;
  const $cell = sel instanceof CellSelection ? sel.$anchorCell : null;
  let $pos = $cell ?? sel.$from;
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d);
    if (node.type.spec.tableRole !== "table") continue;
    const map = TableMap.get(node);
    const start = $pos.start(d);
    let rect: CellRect;
    if (sel instanceof CellSelection) {
      rect = map.rectBetween(sel.$anchorCell.pos - start, sel.$headCell.pos - start);
    } else {
      const cellDepth = d + 2;
      if ($pos.depth < cellDepth) return null;
      rect = map.findCell($pos.before(cellDepth) - start);
    }
    return { tablePos: $pos.before(d), rect, map };
  }
  return null;
}

function cellDom(editor: Editor, sel: Sel, row: number, col: number): HTMLElement | null {
  return editor.view.nodeDOM(sel.tablePos + 1 + sel.map.map[row * sel.map.width + col]) as HTMLElement | null;
}

export function TableFillHandle({ editor }: { editor: Editor | null }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const sel = editor.isEditable ? currentSel(editor.state) : null;
      const dom = sel && cellDom(editor, sel, sel.rect.bottom - 1, sel.rect.right - 1);
      if (!dom) return setPos(null);
      const r = dom.getBoundingClientRect();
      setPos({ x: r.right, y: r.bottom });
    };
    update();
    editor.on("transaction", update);
    window.addEventListener("resize", update);
    document.addEventListener("scroll", update, true);
    return () => {
      editor.off("transaction", update);
      window.removeEventListener("resize", update);
      document.removeEventListener("scroll", update, true);
    };
  }, [editor]);

  if (!editor || !pos) return null;

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const start = currentSel(editor.state);
    if (!start) return;
    const { view } = editor;
    const src = start.rect;
    let dst: CellRect = src;
    view.dom.classList.add("fill-dragging");

    const cellUnder = (ev: MouseEvent): { row: number; col: number } | null => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("td, th") as HTMLElement | null;
      if (!el || !view.dom.contains(el)) return null;
      const table = view.state.doc.nodeAt(start.tablePos);
      if (!table) return null;
      const $p = view.state.doc.resolve(view.posAtDOM(el, 0));
      for (let d = $p.depth; d > 0; d--) {
        const role = $p.node(d).type.spec.tableRole;
        if (role === "cell" || role === "header_cell") {
          if ($p.before(d - 2) !== start.tablePos) return null;
          const r = start.map.findCell($p.before(d) - start.tablePos - 1);
          return { row: r.top, col: r.left };
        }
      }
      return null;
    };

    const move = (ev: MouseEvent) => {
      const c = cellUnder(ev);
      if (!c) return;
      // One axis, whichever leaves the source range further (Excel).
      const dy = c.row < src.top ? c.row - src.top : c.row >= src.bottom ? c.row - src.bottom + 1 : 0;
      const dx = c.col < src.left ? c.col - src.left : c.col >= src.right ? c.col - src.right + 1 : 0;
      dst = Math.abs(dy) >= Math.abs(dx)
        ? { ...src, top: Math.min(src.top, c.row), bottom: Math.max(src.bottom, c.row + 1) }
        : { ...src, left: Math.min(src.left, c.col), right: Math.max(src.right, c.col + 1) };
      const tableStart = start.tablePos + 1;
      const anchor = tableStart + start.map.map[dst.top * start.map.width + dst.left];
      const head = tableStart + start.map.map[(dst.bottom - 1) * start.map.width + dst.right - 1];
      view.dispatch(view.state.tr.setSelection(CellSelection.create(view.state.doc, anchor, head)));
    };

    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      view.dom.classList.remove("fill-dragging");
      if (dst === src) return;
      const tr = fillTr(view.state, start.tablePos, src, dst);
      if (tr) view.dispatch(tr);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div
      className="table-fill-handle"
      style={{ left: pos.x, top: pos.y }}
      title="Drag to fill (series continue, text repeats)"
      onMouseDown={onMouseDown}
    />
  );
}
