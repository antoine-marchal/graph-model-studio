import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { ArrowDownAZ, ArrowUpZA, ChevronDown, Filter } from "lucide-react";
import {
  clearFiltersTr,
  columnValues,
  getColumnFilter,
  setColumnFilterTr,
  sortTableTr,
} from "../extensions/TableFilter";

/**
 * Excel-style header dropdowns. Hovering a table shows a ▾ button in each
 * header cell; it opens sort A→Z / Z→A, a "contains" search and a checklist
 * of the column's distinct values. Filtering only hides rows in the editor
 * (TableFilter plugin); sorting rewrites the row order.
 */

interface HoverTable {
  pos: number;
  cells: DOMRect[];
}

interface OpenMenu {
  pos: number;
  col: number;
  rect: DOMRect;
}

function tablePosOf(editor: Editor, table: HTMLTableElement): number | null {
  try {
    const $pos = editor.state.doc.resolve(editor.view.posAtDOM(table, 0));
    for (let d = $pos.depth; d > 0; d--) {
      if ($pos.node(d).type.name === "table") return $pos.before(d);
    }
  } catch {
    /* not in the doc */
  }
  return null;
}

export function TableFilterMenu({ editor, containerRef }: {
  editor: Editor;
  containerRef: React.RefObject<HTMLDivElement>;
}) {
  const [hover, setHover] = useState<HoverTable | null>(null);
  const [open, setOpen] = useState<OpenMenu | null>(null);
  const [, force] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onMove = (e: MouseEvent) => {
      if (open) return;
      const target = e.target as Element;
      if (target.closest?.(".table-filter-btn")) return;
      const table = target.closest?.(".tiptap-editor table") as HTMLTableElement | null;
      if (!table) {
        setHover(null);
        return;
      }
      const pos = tablePosOf(editor, table);
      const header = table.rows[0];
      if (pos === null || !header) return;
      setHover({ pos, cells: Array.from(header.cells, (c) => c.getBoundingClientRect()) });
    };
    const onScroll = () => {
      setHover(null);
      setOpen(null);
    };
    container.addEventListener("mousemove", onMove);
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("mousemove", onMove);
      container.removeEventListener("scroll", onScroll);
    };
  }, [containerRef, editor, open]);

  // Re-render on filter changes so the active-state of buttons updates.
  useEffect(() => {
    const onTx = () => force((n) => n + 1);
    editor.on("transaction", onTx);
    return () => {
      editor.off("transaction", onTx);
    };
  }, [editor]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <>
      {hover && !open &&
        hover.cells.map((rect, col) => {
          const active = !!getColumnFilter(editor.state, hover.pos, col);
          return (
            <button
              key={col}
              className={"table-filter-btn" + (active ? " active" : "")}
              style={{ top: rect.top + 4, left: rect.right - 22 }}
              title={active ? "Filter active — sort & filter" : "Sort & filter"}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setOpen({ pos: hover.pos, col, rect })}
            >
              {active ? <Filter size={11} /> : <ChevronDown size={12} />}
            </button>
          );
        })}
      {open && (
        <div
          ref={menuRef}
          className="table-filter-menu"
          style={{ top: open.rect.bottom + 2, left: Math.max(8, open.rect.right - 240) }}
        >
          <FilterPanel editor={editor} tablePos={open.pos} col={open.col} onDone={() => setOpen(null)} />
        </div>
      )}
    </>
  );
}

function FilterPanel({ editor, tablePos, col, onDone }: {
  editor: Editor;
  tablePos: number;
  col: number;
  onDone: () => void;
}) {
  const table = editor.state.doc.nodeAt(tablePos);
  const values = useMemo(() => (table ? columnValues(table, col) : []), [table, col]);
  const current = getColumnFilter(editor.state, tablePos, col);
  const [hidden, setHidden] = useState<Set<string>>(new Set(current?.hidden ?? []));
  const [text, setText] = useState(current?.text ?? "");
  const [search, setSearch] = useState("");

  if (!table) return null;

  const visibleValues = values.filter((v) => !search || v.value.toLowerCase().includes(search.toLowerCase()));
  const allShown = values.every((v) => !hidden.has(v.value));

  const apply = (nextHidden: Set<string>, nextText: string) => {
    editor.view.dispatch(
      setColumnFilterTr(editor.state, { tablePos, col, hidden: [...nextHidden], text: nextText.trim() }),
    );
  };

  const toggle = (value: string) => {
    const next = new Set(hidden);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setHidden(next);
    apply(next, text);
  };

  const sort = (dir: 1 | -1) => {
    const tr = sortTableTr(editor.state, tablePos, col, dir);
    if (tr) editor.view.dispatch(tr);
    onDone();
  };

  return (
    <>
      <button className="table-filter-item" onClick={() => sort(1)}>
        <ArrowDownAZ size={13} /> Sort A → Z
      </button>
      <button className="table-filter-item" onClick={() => sort(-1)}>
        <ArrowUpZA size={13} /> Sort Z → A
      </button>
      <div className="table-filter-sep" />
      <input
        className="table-filter-input"
        placeholder="Text contains…"
        value={text}
        autoFocus
        onChange={(e) => {
          setText(e.target.value);
          apply(hidden, e.target.value);
        }}
      />
      <input
        className="table-filter-input"
        placeholder="Search values"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <label className="table-filter-check">
        <input
          type="checkbox"
          checked={allShown}
          onChange={() => {
            const next = allShown ? new Set(values.map((v) => v.value)) : new Set<string>();
            setHidden(next);
            apply(next, text);
          }}
        />
        <span>(Select all)</span>
      </label>
      <div className="table-filter-values">
        {visibleValues.map((v) => (
          <label key={v.value} className="table-filter-check">
            <input type="checkbox" checked={!hidden.has(v.value)} onChange={() => toggle(v.value)} />
            <span className="table-filter-value">{v.value || "(empty)"}</span>
            <span className="table-filter-count">{v.count}</span>
          </label>
        ))}
      </div>
      <div className="table-filter-sep" />
      <div className="table-filter-footer">
        <button
          className="table-filter-item"
          onClick={() => {
            editor.view.dispatch(clearFiltersTr(editor.state, tablePos, col));
            onDone();
          }}
        >
          Clear filter
        </button>
        <button
          className="table-filter-item"
          onClick={() => {
            editor.view.dispatch(clearFiltersTr(editor.state, tablePos));
            onDone();
          }}
        >
          Clear all
        </button>
      </div>
    </>
  );
}
