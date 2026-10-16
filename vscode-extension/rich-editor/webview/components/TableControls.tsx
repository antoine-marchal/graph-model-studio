import React, { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { CellSelection } from "@tiptap/pm/tables";
import {
  PanelTopOpen,
  PanelBottomOpen,
  PanelLeftOpen,
  PanelRightOpen,
  TableRowsSplit,
  TableColumnsSplit,
  Trash2,
  Eraser,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
} from "lucide-react";
import { alignColumnsTr, type CellAlign } from "../extensions/TableFilter";
import type { BetterMarkdownSettings } from "../settings";

/**
 * Excel-like summary of a cell range (drag across cells or Shift+click):
 * cell count, and sum / average of the cells that hold numbers.
 */
export function rangeStats(texts: string[]): { count: number; numeric: number; sum: number } {
  let numeric = 0;
  let sum = 0;
  for (const t of texts) {
    const cleaned = t.trim().replace(/[\s,\u00a0]/g, "").replace(/^[$€£¥]|[$€£¥%]$/g, "");
    if (cleaned && /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(cleaned)) {
      numeric++;
      sum += parseFloat(cleaned);
    }
  }
  return { count: texts.length, numeric, sum };
}

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

interface TableControlsProps {
  editor: Editor | null;
  containerRef: React.RefObject<HTMLElement | null>;
  verticalAlign: BetterMarkdownSettings["tableVerticalAlign"];
  onVerticalAlign: (v: BetterMarkdownSettings["tableVerticalAlign"]) => void;
}

interface Position {
  top: number;
  left: number;
}

// Walk up from a DOM node until we find a <table> element inside the editor.
function findTableAncestor(node: Node | null, root: HTMLElement): HTMLTableElement | null {
  let current: Node | null = node;
  while (current && current !== root) {
    if (current instanceof HTMLTableElement) return current;
    current = current.parentNode;
  }
  return null;
}

export function TableControls({ editor, containerRef, verticalAlign, onVerticalAlign }: TableControlsProps) {
  const [position, setPosition] = useState<Position | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editor) return;

    const update = () => {
      if (!editor.isEditable || !editor.isActive("table")) {
        setPosition(null);
        return;
      }
      const container = containerRef.current;
      if (!container) return;

      const { from } = editor.state.selection;
      let domNode: Node | null = null;
      try {
        domNode = editor.view.domAtPos(from).node;
      } catch {
        setPosition(null);
        return;
      }
      const table = findTableAncestor(domNode, editor.view.dom as HTMLElement);
      if (!table) {
        setPosition(null);
        return;
      }

      const tableRect = table.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      // Hide the toolbar when the table has scrolled past the visible
      // container bounds — otherwise position: fixed keeps it floating.
      if (
        tableRect.bottom < containerRect.top ||
        tableRect.top > containerRect.bottom
      ) {
        setPosition(null);
        return;
      }
      // Clamp top to the container's top edge so the toolbar stays
      // visible while scrolled inside a long table.
      const toolbarHeight = 30;
      const rawTop = tableRect.top - toolbarHeight - 2;
      const top = Math.max(containerRect.top + 4, rawTop);
      // Right-aligned to the table, but never past its left edge when the
      // table is narrower than the toolbar.
      const width = toolbarRef.current?.offsetWidth ?? 0;
      setPosition({ top, left: Math.max(tableRect.right, tableRect.left + width) });
    };

    update();
    editor.on("selectionUpdate", update);
    editor.on("update", update);
    editor.on("transaction", update);

    const container = containerRef.current;
    container?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      editor.off("selectionUpdate", update);
      editor.off("update", update);
      editor.off("transaction", update);
      container?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [editor, containerRef]);

  if (!editor || !position) return null;

  const selection = editor.state.selection;
  const range =
    selection instanceof CellSelection
      ? (() => {
          const texts: string[] = [];
          selection.forEachCell((cell) => texts.push(cell.textContent));
          return texts.length > 1 ? rangeStats(texts) : null;
        })()
      : null;

  // Prevent the toolbar from stealing focus (which would clear the table
  // selection and hide the toolbar before the click lands).
  const hold = (e: React.MouseEvent) => e.preventDefault();

  const align: CellAlign =
    editor.getAttributes("tableCell").align ?? editor.getAttributes("tableHeader").align ?? null;
  const setAlign = (a: CellAlign) => {
    const tr = alignColumnsTr(editor.state, a === align ? null : a);
    if (tr) editor.view.dispatch(tr);
    return !!tr;
  };

  const btn = (
    title: string,
    icon: React.ReactNode,
    action: () => boolean | void,
    active = false,
  ) => (
    <button
      type="button"
      className={`table-ctrl-btn${active ? " active" : ""}`}
      aria-pressed={active || undefined}
      title={title}
      aria-label={title}
      onMouseDown={hold}
      onClick={() => {
        action();
      }}
    >
      {icon}
    </button>
  );

  return (
    <div
      ref={toolbarRef}
      className="table-controls"
      style={{ top: position.top, left: position.left }}
      onMouseDown={hold}
    >
      {btn(
        "Add row above",
        <PanelTopOpen size={14} />,
        () => editor.chain().focus().addRowBefore().run(),
      )}
      {btn(
        "Add row below",
        <PanelBottomOpen size={14} />,
        () => editor.chain().focus().addRowAfter().run(),
      )}
      <span className="table-ctrl-sep" />
      {btn(
        "Add column left",
        <PanelLeftOpen size={14} />,
        () => editor.chain().focus().addColumnBefore().run(),
      )}
      {btn(
        "Add column right",
        <PanelRightOpen size={14} />,
        () => editor.chain().focus().addColumnAfter().run(),
      )}
      <span className="table-ctrl-sep" />
      {btn(
        "Delete row",
        <TableRowsSplit size={14} />,
        () => editor.chain().focus().deleteRow().run(),
      )}
      {btn(
        "Delete column",
        <TableColumnsSplit size={14} />,
        () => editor.chain().focus().deleteColumn().run(),
      )}
      <span className="table-ctrl-sep" />
      {btn("Align column left", <AlignLeft size={14} />, () => setAlign("left"), align === "left")}
      {btn("Center column", <AlignCenter size={14} />, () => setAlign("center"), align === "center")}
      {btn("Align column right", <AlignRight size={14} />, () => setAlign("right"), align === "right")}
      <span className="table-ctrl-sep" />
      {btn("Cells: top (all tables)", <AlignStartHorizontal size={14} />, () => onVerticalAlign("top"), verticalAlign === "top")}
      {btn("Cells: middle (all tables)", <AlignCenterHorizontal size={14} />, () => onVerticalAlign("middle"), verticalAlign === "middle")}
      {btn("Cells: bottom (all tables)", <AlignEndHorizontal size={14} />, () => onVerticalAlign("bottom"), verticalAlign === "bottom")}
      <span className="table-ctrl-sep" />
      {range && (
        <>
          {btn("Clear selected cells", <Eraser size={14} />, () => editor.chain().focus().deleteSelection().run())}
          <span className="table-ctrl-stats" title="Selected range">
            {range.count} cells
            {range.numeric > 0 && ` · Σ ${fmt(range.sum)} · avg ${fmt(range.sum / range.numeric)}`}
          </span>
          <span className="table-ctrl-sep" />
        </>
      )}
      {btn(
        "Delete table",
        <Trash2 size={14} />,
        () => editor.chain().focus().deleteTable().run(),
      )}
    </div>
  );
}
