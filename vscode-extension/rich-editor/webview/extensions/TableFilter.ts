import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { Fragment, Slice, type Node as PMNode, type Schema } from "@tiptap/pm/model";
import { TableMap, selectedRect } from "@tiptap/pm/tables";

/**
 * Excel-style column filters for tables. View-only: filtered rows are hidden
 * with a decoration (`tr.row-filtered`), never removed from the document, so
 * the markdown is untouched. Filters follow their table through edits
 * (positions are mapped) and vanish when the table is deleted.
 *
 * Sorting (sortTableByColumn) is a real edit: it reorders the body rows.
 */

export interface ColumnFilter {
  tablePos: number;
  col: number;
  /** Cell values (trimmed text) that are hidden. */
  hidden: string[];
  /** Case-insensitive "contains" text filter; "" = none. */
  text: string;
}

type Meta =
  | { type: "set"; filter: ColumnFilter }
  | { type: "clear"; tablePos: number; col?: number };

export const tableFilterKey = new PluginKey<ColumnFilter[]>("tableFilter");

export function cellText(cell: PMNode | null | undefined): string {
  return (cell?.textContent ?? "").trim();
}

function rowHidden(row: PMNode, filters: ColumnFilter[]): boolean {
  return filters.some((f) => {
    const value = cellText(row.maybeChild(f.col));
    if (f.hidden.includes(value)) return true;
    return !!f.text && !value.toLowerCase().includes(f.text.toLowerCase());
  });
}

function decorations(state: EditorState, filters: ColumnFilter[]): DecorationSet {
  if (filters.length === 0) return DecorationSet.empty;
  const out: Decoration[] = [];
  const byTable = new Map<number, ColumnFilter[]>();
  for (const f of filters) byTable.set(f.tablePos, [...(byTable.get(f.tablePos) ?? []), f]);
  for (const [tablePos, tableFilters] of byTable) {
    const table = state.doc.nodeAt(tablePos);
    if (!table || table.type.name !== "table") continue;
    let rowPos = tablePos + 1;
    table.forEach((row, _offset, index) => {
      if (index === 0) {
        // Mark filtered header cells.
        let cellPos = rowPos + 1;
        row.forEach((cell, _o, col) => {
          if (tableFilters.some((f) => f.col === col)) {
            out.push(Decoration.node(cellPos, cellPos + cell.nodeSize, { class: "filter-active" }));
          }
          cellPos += cell.nodeSize;
        });
      } else if (rowHidden(row, tableFilters)) {
        out.push(Decoration.node(rowPos, rowPos + row.nodeSize, { class: "row-filtered" }));
      }
      rowPos += row.nodeSize;
    });
  }
  return DecorationSet.create(state.doc, out);
}

export const TableFilter = Extension.create({
  name: "tableFilter",

  // GFM column alignment (`:---:`); rehype-remark reads the `align` attr.
  addGlobalAttributes() {
    return [
      {
        types: ["tableCell", "tableHeader"],
        attributes: {
          align: {
            default: null,
            parseHTML: (el: HTMLElement) => {
              const v = el.getAttribute("align") || el.style.textAlign;
              return v === "left" || v === "center" || v === "right" ? v : null;
            },
            renderHTML: (a: Record<string, unknown>) => (a.align ? { align: a.align } : {}),
          },
        },
      },
      {
        // Dragged row height (px); saved in the `<!-- ms-table:… -->` comment.
        types: ["tableRow"],
        attributes: {
          height: {
            default: null,
            parseHTML: (el: HTMLElement) => Number(el.getAttribute("data-height")) || null,
            renderHTML: (a: Record<string, unknown>) =>
              a.height ? { "data-height": String(a.height), style: `height: ${a.height}px` } : {},
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      rowResizePlugin(),
      new Plugin<ColumnFilter[]>({
        key: tableFilterKey,
        state: {
          init: () => [],
          apply(tr: Transaction, filters: ColumnFilter[], _old, newState) {
            let next = filters;
            if (tr.docChanged) {
              next = next
                .map((f) => {
                  // assoc -1: a table replaced in place (e.g. sorted) keeps its start.
                  return { ...f, tablePos: tr.mapping.map(f.tablePos, -1) };
                })
                .filter((f): f is ColumnFilter => !!f && newState.doc.nodeAt(f.tablePos)?.type.name === "table");
            }
            const meta = tr.getMeta(tableFilterKey) as Meta | undefined;
            if (meta?.type === "set") {
              const f = meta.filter;
              next = next.filter((x) => !(x.tablePos === f.tablePos && x.col === f.col));
              if (f.hidden.length > 0 || f.text) next = [...next, f];
            } else if (meta?.type === "clear") {
              next = next.filter(
                (x) => !(x.tablePos === meta.tablePos && (meta.col === undefined || x.col === meta.col)),
              );
            }
            return next;
          },
        },
        // GFM alignment belongs to the column: pasted cells and new rows
        // take the header cell's alignment.
        appendTransaction(trs, _old, state) {
          return trs.some((tr) => tr.docChanged) ? syncColumnAlignTr(state) : null;
        },
        props: {
          decorations(state) {
            return decorations(state, tableFilterKey.getState(state) ?? []);
          },
        },
      }),
    ];
  },
});

/**
 * Drag the bottom edge of a row to set its height (columns use
 * prosemirror-tables' own column resizing).
 */
function rowResizePlugin(): Plugin {
  const EDGE = 4;
  const rowAt = (view: EditorView, e: MouseEvent): { pos: number; el: HTMLTableRowElement } | null => {
    const cell = (e.target as HTMLElement | null)?.closest?.("td, th") as HTMLElement | null;
    if (!cell || !view.dom.contains(cell)) return null;
    if (cell.getBoundingClientRect().bottom - e.clientY > EDGE) return null;
    const $pos = view.state.doc.resolve(view.posAtDOM(cell, 0));
    for (let d = $pos.depth; d > 0; d--) {
      if ($pos.node(d).type.spec.tableRole === "row") {
        return { pos: $pos.before(d), el: cell.parentElement as HTMLTableRowElement };
      }
    }
    return null;
  };
  return new Plugin({
    props: {
      handleDOMEvents: {
        mousemove(view, e) {
          view.dom.classList.toggle("row-resize-cursor", !!rowAt(view, e as MouseEvent));
          return false;
        },
        mousedown(view, event) {
          const e = event as MouseEvent;
          const hit = e.button === 0 ? rowAt(view, e) : null;
          if (!hit) return false;
          e.preventDefault();
          const startY = e.clientY;
          const startH = hit.el.getBoundingClientRect().height;
          let height = startH;
          const move = (m: MouseEvent) => {
            height = Math.max(24, Math.round(startH + m.clientY - startY));
            hit.el.style.height = `${height}px`;
          };
          const up = () => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
            const row = view.state.doc.nodeAt(hit.pos);
            if (row && height !== Math.round(startH)) {
              view.dispatch(view.state.tr.setNodeMarkup(hit.pos, undefined, { ...row.attrs, height }));
            }
          };
          window.addEventListener("mousemove", move);
          window.addEventListener("mouseup", up);
          return true;
        },
      },
    },
  });
}

export function getColumnFilter(state: EditorState, tablePos: number, col: number): ColumnFilter | undefined {
  return (tableFilterKey.getState(state) ?? []).find((f) => f.tablePos === tablePos && f.col === col);
}

export function setColumnFilterTr(state: EditorState, filter: ColumnFilter): Transaction {
  return state.tr.setMeta(tableFilterKey, { type: "set", filter } satisfies Meta);
}

export function clearFiltersTr(state: EditorState, tablePos: number, col?: number): Transaction {
  return state.tr.setMeta(tableFilterKey, { type: "clear", tablePos, col } satisfies Meta);
}

/** Distinct body values of a column, with counts, sorted naturally. */
export function columnValues(table: PMNode, col: number): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  table.forEach((row, _o, index) => {
    if (index === 0) return;
    const v = cellText(row.maybeChild(col));
    counts.set(v, (counts.get(v) ?? 0) + 1);
  });
  return Array.from(counts, ([value, count]) => ({ value, count })).sort((a, b) =>
    a.value.localeCompare(b.value, undefined, { numeric: true, sensitivity: "base" }),
  );
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Reorder body rows by a column (header row stays first). Empty cells sort last. */
export function sortTableTr(state: EditorState, tablePos: number, col: number, dir: 1 | -1): Transaction | null {
  const table = state.doc.nodeAt(tablePos);
  if (!table || table.type.name !== "table" || table.childCount < 3) return null;
  const rows: PMNode[] = [];
  table.forEach((row) => rows.push(row));
  const [header, ...body] = rows;
  const sorted = body
    .map((row, i) => ({ row, i, v: cellText(row.maybeChild(col)) }))
    .sort((a, b) => {
      if (!a.v !== !b.v) return a.v ? -1 : 1;
      return dir * collator.compare(a.v, b.v) || a.i - b.i;
    })
    .map((x) => x.row);
  const next = table.type.create(table.attrs, [header, ...sorted], table.marks);
  return state.tr.replaceWith(tablePos, tablePos + table.nodeSize, next);
}

export type CellAlign = "left" | "center" | "right" | null;

/** Align the selected columns (GFM alignment is per column, so every row). */
export function alignColumnsTr(state: EditorState, align: CellAlign): Transaction | null {
  let rect;
  try {
    rect = selectedRect(state);
  } catch {
    return null;
  }
  const { map, table, tableStart, left, right } = rect;
  const tr = state.tr;
  const seen = new Set<number>();
  for (let row = 0; row < map.height; row++) {
    for (let col = left; col < right; col++) {
      const rel = map.map[row * map.width + col];
      if (seen.has(rel)) continue;
      seen.add(rel);
      tr.setNodeMarkup(tableStart + rel, undefined, { ...table.nodeAt(rel)!.attrs, align });
    }
  }
  return tr;
}

/** Give every cell its column's header alignment; null when already consistent. */
export function syncColumnAlignTr(state: EditorState): Transaction | null {
  const tr = state.tr;
  state.doc.descendants((node, pos) => {
    if (node.type.spec.tableRole !== "table") return true;
    const map = TableMap.get(node);
    for (let col = 0; col < map.width; col++) {
      const align = node.nodeAt(map.map[col])?.attrs.align ?? null;
      for (let row = 1; row < map.height; row++) {
        const rel = map.map[row * map.width + col];
        const cell = node.nodeAt(rel);
        if (cell && cell.attrs.align !== undefined && cell.attrs.align !== align) {
          tr.setNodeMarkup(pos + 1 + rel, undefined, { ...cell.attrs, align });
        }
      }
    }
    return false;
  });
  return tr.docChanged ? tr : null;
}

/** Copied cell range → TSV (what Excel / Sheets put on the clipboard). */
export function sliceToTsv(slice: Slice): string | null {
  const rows: string[] = [];
  slice.content.descendants((node) => {
    if (node.type.spec.tableRole !== "row") return true;
    const cells: string[] = [];
    node.forEach((c) => cells.push(c.textBetween(0, c.content.size, " ").replace(/[\t\n]/g, " ")));
    rows.push(cells.join("\t"));
    return false;
  });
  return rows.length ? rows.join("\n") : null;
}

/**
 * Plain-text cell range (TSV, or one value per line) → table node, so
 * pasting it into a cell / cell selection fills the cells the way Excel
 * does (prosemirror-tables' handlePaste takes it from there).
 */
export function tsvToTable(schema: Schema, text: string): PMNode | null {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
  if (lines.length < 2 && !text.includes("\t")) return null;
  const { table, tableRow, tableCell, paragraph } = schema.nodes;
  return table.create(
    null,
    lines.map((line) =>
      tableRow.create(
        null,
        line.split("\t").map((v) => tableCell.create(null, paragraph.create(null, v ? schema.text(v) : undefined))),
      ),
    ),
  );
}

export function tsvToTableSlice(schema: Schema, text: string): Slice | null {
  const node = tsvToTable(schema, text);
  return node ? new Slice(Fragment.from(node), 0, 0) : null;
}

export interface CellRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Excel fill-handle values: the value at offset `k` from the start of
 * `source` (k may be < 0 or ≥ length). Numbers — or text ending in a number
 * with a shared prefix ("Item 1") — continue their linear series (a single
 * plain number is copied, like Excel); anything else repeats the pattern.
 */
export function fillValue(source: string[], k: number): { series: boolean; value: string; from: number } {
  const n = source.length;
  const from = ((k % n) + n) % n;
  const parts = source.map((s) => /^(.*?)(-?\d+(?:\.\d+)?)$/.exec(s.trim()));
  if (parts.every((p) => p) && parts.every((p) => p![1] === parts[0]![1])) {
    const nums = parts.map((p) => parseFloat(p![2]));
    const step = n > 1 ? (nums[n - 1] - nums[0]) / (n - 1) : parts[0]![1] ? 1 : 0;
    const linear = nums.every((v, i) => Math.abs(v - (nums[0] + step * i)) < 1e-9);
    if (linear && step !== 0) {
      const decimals = Math.max(0, ...parts.map((p) => p![2].split(".")[1]?.length ?? 0));
      return { series: true, value: parts[0]![1] + (nums[0] + step * k).toFixed(decimals), from };
    }
  }
  return { series: false, value: source[from], from };
}

/**
 * Extend `src` to `dst` (same columns, more rows — or same rows, more
 * columns) with fillValue. Repeated cells copy the source cell's content
 * (formatting included); series cells get the computed text.
 */
export function fillTr(state: EditorState, tablePos: number, src: CellRect, dst: CellRect): Transaction | null {
  const table = state.doc.nodeAt(tablePos);
  if (!table || table.type.spec.tableRole !== "table") return null;
  const map = TableMap.get(table);
  const vertical = dst.left === src.left && dst.right === src.right;
  if (!vertical && !(dst.top === src.top && dst.bottom === src.bottom)) return null;
  const at = (row: number, col: number) => map.map[row * map.width + col];
  const tr = state.tr;
  const { paragraph } = state.schema.nodes;
  const lanes = vertical ? [src.left, src.right] : [src.top, src.bottom];
  const [start, end] = vertical ? [src.top, src.bottom] : [src.left, src.right];
  const [dStart, dEnd] = vertical ? [dst.top, dst.bottom] : [dst.left, dst.right];
  for (let lane = lanes[0]; lane < lanes[1]; lane++) {
    const cellAt = (i: number) => (vertical ? at(i, lane) : at(lane, i));
    const sources: PMNode[] = [];
    for (let i = start; i < end; i++) sources.push(table.nodeAt(cellAt(i))!);
    const texts = sources.map((c) => c.textContent);
    for (let i = dStart; i < dEnd; i++) {
      if (i >= start && i < end) continue;
      const rel = cellAt(i);
      const cell = table.nodeAt(rel)!;
      const { series, value, from } = fillValue(texts, i - start);
      const content = series
        ? Fragment.from(paragraph.create(null, value ? state.schema.text(value) : undefined))
        : sources[from].content;
      const pos = tr.mapping.map(tablePos + 1 + rel);
      tr.replaceWith(pos + 1, pos + 1 + cell.content.size, content);
    }
  }
  return tr.docChanged ? tr : null;
}
