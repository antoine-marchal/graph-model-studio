import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { fmtNumber, mergeRuns, tableWeights, tr, type CellStyle, type ElementPatch, type ResolvedElement, type TextRun } from '@corporate-slides/core';
import { PPI, tableCellStyle, tableTextCss, tokenHex } from '@corporate-slides/renderer';
import { useEditor } from './store';
import { Icon, type IconName } from './icons';
import { Menu, PaletteGrid, PaletteMenu } from './Panels';
import { htmlTableGrid, tsvRows } from './clipboard';
import { formatSelection, RunView, textBeforeCaret } from './Canvas';
import { inlineEditor } from './Format';

/*
 * Table editing with the Markdown Studio UX: cells edited in place, Tab / Enter / arrows move
 * between cells, drag or Shift+click selects a range (count, Σ and average shown), a floating
 * toolbar inserts / deletes rows and columns and aligns them, and the fill handle extends a
 * series over the cells it is dragged across, and column / row borders drag to resize. Cells and
 * ranges take a background and a border (color, width, dash); a spreadsheet range pasted into a cell
 * fills the grid from there, growing the table. Edits are applied as one mutation on exit (Escape,
 * or a click anywhere outside the table).
 */

type Align = 'left' | 'center' | 'right' | null;
type VAlign = 'top' | 'middle' | 'bottom';
interface Rect {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}
const norm = (a: { r: number; c: number }, b: { r: number; c: number }): Rect => ({ r0: Math.min(a.r, b.r), c0: Math.min(a.c, b.c), r1: Math.max(a.r, b.r), c1: Math.max(a.c, b.c) });

/** Last pointer press: editing opened by a double-click starts in the clicked cell. */
let lastPointer = { x: -1, y: -1 };
window.addEventListener('pointerdown', (e) => (lastPointer = { x: e.clientX, y: e.clientY }), true);

const NUM_RE = /^[-+]?(\d+[.,]?\d*|[.,]\d+)$/;
const parseNum = (t: string): number | null => {
  const c = t.trim().replace(/[\s ]/g, '').replace(/^[$€£¥]|[$€£¥%]$/g, '');
  return c && NUM_RE.test(c) ? parseFloat(c.replace(',', '.')) : null;
};
const fmt = (n: number) => fmtNumber(n);
/** Cell look plus, while editing, its formatted text runs (split into `cellStyles` / `cellRuns` on commit). */
type Cell = (CellStyle & { runs?: TextRun[] }) | null;
const plain = (runs: TextRun[]) => runs.map((r) => r.text).join('');
const marked = (runs: TextRun[]) => runs.some((r) => Object.keys(r).length > 1);

/** Runs of a contentEditable cell: bold / italic / underline tags, `data-color`, `data-size` spans. */
function cellRuns(td: HTMLElement): TextRun[] {
  const out: TextRun[] = [];
  const walk = (n: Node, m: Omit<TextRun, 'text'>) => {
    if (n.nodeType === Node.TEXT_NODE) {
      const text = n.textContent ?? '';
      if (text) out.push({ text, ...m });
      return;
    }
    if (!(n instanceof HTMLElement)) return;
    // Shift+Enter line breaks.
    if (n.tagName === 'BR') return void out.push({ text: '\n', ...m });
    const st = n.style;
    const next: Omit<TextRun, 'text'> = { ...m };
    if (n.tagName === 'B' || n.tagName === 'STRONG' || Number(st.fontWeight) >= 600 || st.fontWeight === 'bold') next.bold = true;
    if (n.tagName === 'I' || n.tagName === 'EM' || st.fontStyle === 'italic') next.italic = true;
    if (n.tagName === 'U' || st.textDecoration.includes('underline')) next.underline = true;
    if (n.dataset.color) next.color = n.dataset.color as TextRun['color'];
    if (n.dataset.size) next.size = Number(n.dataset.size);
    if (n.dataset.caps) next.caps = n.dataset.caps as TextRun['caps'];
    if (n.dataset.font) next.font = n.dataset.font;
    if (n.dataset.run) Object.assign(next, JSON.parse(n.dataset.run));
    n.childNodes.forEach((c) => walk(c, next));
  };
  td.childNodes.forEach((c) => walk(c, {}));
  return mergeRuns(out);
}
type CellPatch = Partial<Record<keyof CellStyle, unknown>>;
const BORDER_WIDTHS = [0.5, 1, 1.5, 2.25, 3, 4.5, 6];
const DASHES = [
  { id: 'solid', fr: 'Continu', en: 'Solid' },
  { id: 'dash', fr: 'Tirets', en: 'Dashed' },
  { id: 'dot', fr: 'Pointillés', en: 'Dotted' },
] as const;
const sameCells = (a: Cell[][], b: Cell[][]) => JSON.stringify(a) === JSON.stringify(b);

/** Values continuing `seed` over `count` cells: numeric series, "Item 3" series, or repetition. */
export function fillSeries(seed: string[], count: number): string[] {
  const nums = seed.map(parseNum);
  if (seed.length >= 2 && nums.every((n) => n !== null)) {
    const step = (nums[nums.length - 1]! - nums[0]!) / (seed.length - 1);
    const decimals = Math.max(...seed.map((s) => (s.split(/[.,]/)[1] ?? '').length));
    return Array.from({ length: count }, (_, i) => (nums[nums.length - 1]! + step * (i + 1)).toFixed(decimals));
  }
  const m = seed.map((s) => /^(.*?)(\d+)(\D*)$/.exec(s));
  if (seed.length && m.every((x) => x && x[1] === m[0]![1] && x[3] === m[0]![3]) && !(seed.length === 1 && nums[0] !== null)) {
    const vals = m.map((x) => Number(x![2]));
    const step = vals.length >= 2 ? (vals[vals.length - 1]! - vals[0]!) / (vals.length - 1) : 1;
    const width = m[0]![2]!.length;
    return Array.from({ length: count }, (_, i) => `${m[0]![1]}${String(Math.round(vals[vals.length - 1]! + step * (i + 1))).padStart(width, '0')}${m[0]![3]}`);
  }
  return Array.from({ length: count }, (_, i) => seed[i % seed.length] ?? '');
}

export function TableEditor({ r, onDone }: { r: ResolvedElement; onDone: (patch: ElementPatch | null) => void }) {
  const el = r.element;
  if (el.type !== 'table') throw new Error('TableEditor: not a table');
  const master = useEditor((s) => s.master)!;
  const width = Math.max(...el.rows.map((x) => x.length));
  const [rows, setRows] = useState<string[][]>(() => el.rows.map((row) => Array.from({ length: width }, (_, i) => row[i] ?? '')));
  const [colAlign, setColAlign] = useState<Align[]>(() => Array.from({ length: width }, (_, i) => el.colAlign?.[i] ?? null));
  const [valign, setValign] = useState<VAlign>(el.style?.valign ?? 'middle');
  const [header, setHeader] = useState(el.header !== false);
  const [headerColumn, setHeaderColumn] = useState(!!el.headerColumn);
  const [colW, setColW] = useState(() => tableWeights(el.colWidths, width));
  const [rowH, setRowH] = useState(() => tableWeights(el.rowHeights, el.rows.length));
  const initialCells = (): Cell[][] =>
    el.rows.map((row, ri) =>
      Array.from({ length: width }, (_, ci) => {
        const st = el.cellStyles?.[ri]?.[ci] ?? null;
        const runs = el.cellRuns?.[ri]?.[ci];
        return runs && plain(runs) === (row[ci] ?? '') ? { ...(st ?? {}), runs } : st;
      }),
    );
  const [cells, setCells] = useState<Cell[][]>(initialCells);
  const [sel, setSel] = useState<{ a: { r: number; c: number }; h: { r: number; c: number } }>({ a: { r: 0, c: 0 }, h: { r: 0, c: 0 } });
  const [gen, setGen] = useState(0);
  const [fill, setFill] = useState<Rect | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const done = useRef(false);
  const focusCell = useRef<{ r: number; c: number; select?: boolean } | null>(null);
  const state = useRef({ rows, colAlign, valign, header, headerColumn, colW, rowH, cells });
  state.current = { rows, colAlign, valign, header, headerColumn, colW, rowH, cells };
  /** Text as typed, kept current on every keystroke: the DOM is gone when a click outside unmounts us. */
  const typed = useRef(rows);
  useLayoutEffect(() => {
    typed.current = rows.map((row) => [...row]);
  }, [rows]);
  const rect = norm(sel.a, sel.h);
  /**
   * Formatted cell content as rendered: a snapshot taken at each rebuild (`gen`). Between rebuilds
   * the DOM is the live state, so re-renders must not replace a cell's children (that would drop
   * the caret and the text selection).
   */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shown = useMemo(() => cells.map((row) => row.map((c) => c?.runs ?? null)), [gen]);

  /**
   * Text and character formatting of one cell from its DOM, kept on `typed` and on the cell (in
   * place): on every keystroke and format, since a click outside unmounts the table before any read.
   */
  const syncCell = (td: HTMLElement, ri: number, ci: number): string => {
    const cs = state.current.cells;
    const runs = cellRuns(td);
    const cur = cs[ri]?.[ci] ?? null;
    if (cs[ri]) {
      if (marked(runs)) cs[ri]![ci] = { ...(cur ?? {}), runs };
      else if (cur?.runs) {
        const { runs: _r, ...rest } = cur;
        cs[ri]![ci] = Object.keys(rest).length ? rest : null;
      }
    }
    const text = plain(runs).trimEnd() || td.innerText.trimEnd();
    const row = typed.current[ri];
    if (row) row[ci] = text;
    return text;
  };

  /** Cell texts as typed (the DOM is the live state while editing). */
  const read = (): string[][] => {
    const t = tableRef.current;
    if (!t) return typed.current;
    return state.current.rows.map((row, ri) =>
      row.map((v, ci) => {
        const td = t.querySelector<HTMLElement>(`[data-cell="${ri}:${ci}"]`);
        return td ? syncCell(td, ri, ci) : v;
      }),
    );
  };
  /** Structural change: sync typed text, rebuild the cells, keep the caret at (r, c). */
  const restructure = (next: string[][], align: Align[], at: { r: number; c: number }, widths = colW, heights = rowH, styles = cells) => {
    setRows(next);
    setCells(styles);
    setColAlign(align);
    setColW(tableWeights(widths, next[0]?.length ?? 1));
    setRowH(tableWeights(heights, next.length));
    focusCell.current = { r: Math.max(0, Math.min(at.r, next.length - 1)), c: Math.max(0, Math.min(at.c, (next[0]?.length ?? 1) - 1)) };
    setSel({ a: focusCell.current, h: focusCell.current });
    setGen((g) => g + 1);
  };

  const commit = () => {
    if (done.current) return;
    done.current = true;
    const s = state.current;
    const next = read();
    const patch: ElementPatch = {};
    if (JSON.stringify(next) !== JSON.stringify(el.rows)) patch.rows = next;
    // Merged cells follow the grid they were made on: rows or columns added / removed unmerge them.
    if (el.merges && (next.length !== el.rows.length || (next[0]?.length ?? 0) !== width)) patch.merges = null;
    const ca = s.colAlign.slice(0, next[0]?.length ?? 0);
    if (JSON.stringify(ca) !== JSON.stringify(Array.from({ length: ca.length }, (_, i) => el.colAlign?.[i] ?? null))) patch.colAlign = ca;
    if (s.valign !== (el.style?.valign ?? 'middle')) patch.style = { valign: s.valign === 'middle' ? null : s.valign };
    if (s.header !== (el.header !== false)) patch.header = s.header;
    if (s.headerColumn !== !!el.headerColumn) patch.headerColumn = s.headerColumn;
    const round = (w: number[]) => w.map((x) => Math.round(x * 1000) / 1000);
    const same = (a: number[], b: number[]) => JSON.stringify(round(a)) === JSON.stringify(round(b));
    if (!same(s.colW, tableWeights(el.colWidths, next[0]?.length ?? 1))) patch.colWidths = round(s.colW);
    if (!same(s.rowH, tableWeights(el.rowHeights, next.length))) patch.rowHeights = round(s.rowH);
    // Runs whose text no longer matches the cell (typed over, filled, pasted) are dropped.
    const runsOf = (c: Cell, ri: number, ci: number) => (c?.runs && plain(c.runs).trimEnd() === next[ri]?.[ci] ? c.runs : null);
    const styleOf = (c: Cell): CellStyle | null => {
      if (!c) return null;
      const { runs: _r, ...st } = c;
      return Object.keys(st).length ? st : null;
    };
    const styles = s.cells.map((row) => row.map(styleOf));
    const runs = s.cells.map((row, ri) => row.map((c, ci) => runsOf(c, ri, ci)));
    const before: Cell[][] = initialCells();
    if (!sameCells(styles, before.map((row) => row.map(styleOf)))) patch.cellStyles = styles.some((row) => row.some(Boolean)) ? styles : null;
    if (JSON.stringify(runs) !== JSON.stringify(before.map((row, ri) => row.map((c, ci) => (c?.runs ? c.runs : null)))) && (runs.some((row) => row.some(Boolean)) || el.cellRuns)) patch.cellRuns = runs.some((row) => row.some(Boolean)) ? runs : null;
    onDone(Object.keys(patch).length ? patch : null);
  };
  // Ribbon Font group and text context menu: format the characters selected in the focused cell.
  const savedRange = useRef<Range | null>(null);
  const hex = (token: string) => tokenHex(token, master);
  const focusedCell = () => {
    const n = window.getSelection()?.anchorNode;
    const el = n ? (n.nodeType === Node.TEXT_NODE ? n.parentElement : (n as HTMLElement)) : null;
    const td = el?.closest<HTMLElement>('[data-cell]');
    return td && tableRef.current?.contains(td) ? td : null;
  };
  const restoreRange = () => {
    const r = savedRange.current;
    if (!r) return;
    const td = (r.startContainer.nodeType === Node.TEXT_NODE ? r.startContainer.parentElement : (r.startContainer as HTMLElement))?.closest<HTMLElement>('[data-cell]');
    td?.focus();
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(r);
    savedRange.current = null;
  };
  useLayoutEffect(() => {
    inlineEditor.current = {
      read: () => ({ paragraphs: [], from: 0, to: 0 }),
      replace: () => undefined,
      format(f) {
        restoreRange();
        const td = focusedCell();
        if (!td) return false;
        const ok = formatSelection(td, f, hex);
        const [ri, ci] = td.dataset.cell!.split(':').map(Number);
        syncCell(td, ri!, ci!);
        return ok;
      },
      saveRange() {
        const s = window.getSelection();
        savedRange.current = s?.rangeCount && focusedCell() ? s.getRangeAt(0).cloneRange() : null;
      },
      restoreRange,
      hasSelection: () => !!focusedCell() && !window.getSelection()!.isCollapsed,
      formatCells: (patch) => styleRangeRef.current(patch === 'clear' ? { color: null, bold: null, italic: null, underline: null, size: null, caps: null } : patch),
      cellStyle: () => activeRef.current,
      selectionSize() {
        const n = window.getSelection()?.anchorNode;
        const el = n ? (n.nodeType === Node.TEXT_NODE ? n.parentElement : (n as HTMLElement)) : null;
        return el && focusedCell() ? Math.round(((parseFloat(getComputedStyle(el).fontSize) * 72) / PPI) * 2) / 2 : null;
      },
    };
    return () => {
      inlineEditor.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commitRef = useRef(commit);
  commitRef.current = commit;
  // Leaving editing (click elsewhere clears editingId) unmounts us: commit then.
  useEffect(() => () => commitRef.current(), []);

  useLayoutEffect(() => {
    const start = cellAt(lastPointer.x, lastPointer.y) ?? { r: 0, c: 0 };
    focusCell.current = { ...start, select: true };
    setSel({ a: start, h: start });
  }, []);

  useLayoutEffect(() => {
    const f = focusCell.current;
    if (!f) return;
    focusCell.current = null;
    const cell = tableRef.current?.querySelector<HTMLElement>(`[data-cell="${f.r}:${f.c}"]`);
    if (!cell) return;
    cell.focus();
    const range = document.createRange();
    range.selectNodeContents(cell);
    if (!f.select) range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  });

  const go = (r0: number, c0: number, select = true) => {
    const R = rows.length, C = rows[0]?.length ?? 1;
    const r1 = Math.max(0, Math.min(R - 1, r0)), c1 = Math.max(0, Math.min(C - 1, c0));
    focusCell.current = { r: r1, c: c1, select };
    setSel({ a: { r: r1, c: c1 }, h: { r: r1, c: c1 } });
  };

  const caretAtEdge = (cell: HTMLElement, end: boolean) => {
    const s = window.getSelection();
    if (!s || !s.isCollapsed) return false;
    const range = document.createRange();
    range.selectNodeContents(cell);
    range.setEnd(s.anchorNode!, s.anchorOffset);
    const before = range.toString().length;
    return end ? before >= cell.innerText.replace(/\n$/, '').length : before === 0;
  };

  const onKeyDown = (e: React.KeyboardEvent, ri: number, ci: number) => {
    e.stopPropagation();
    const R = rows.length, C = rows[0]?.length ?? 1;
    const cell = e.currentTarget as HTMLElement;
    if (e.key === 'Escape') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      // Caret inside the text: a tab character. At the start or end of the cell: next / previous cell.
      if (!e.shiftKey && textBeforeCaret(cell, (n) => n === cell) && !caretAtEdge(cell, true)) {
        document.execCommand('insertText', false, '\t');
        void syncCell(cell, ri, ci);
        return;
      }
      const idx = ri * C + ci + (e.shiftKey ? -1 : 1);
      if (idx >= R * C) {
        const next = read();
        restructure([...next, Array(C).fill('')], colAlign, { r: R, c: 0 }, colW, [...rowH, 1 / R], [...cells, Array(C).fill(null)]);
      } else if (idx >= 0) {
        setRows(read());
        go(Math.floor(idx / C), idx % C);
      }
    } else if (e.key === 'Enter' && e.shiftKey) {
      // A line break inside the cell.
      e.preventDefault();
      document.execCommand('insertLineBreak');
      void syncCell(cell, ri, ci);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      setRows(read());
      go(ri + 1, ci);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      setRows(read());
      go(ri + (e.key === 'ArrowUp' ? -1 : 1), ci, false);
    } else if ((e.key === 'ArrowLeft' && caretAtEdge(cell, false) && ci > 0) || (e.key === 'ArrowRight' && caretAtEdge(cell, true) && ci < C - 1)) {
      e.preventDefault();
      setRows(read());
      go(ri, ci + (e.key === 'ArrowLeft' ? -1 : 1), false);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && (rect.r1 > rect.r0 || rect.c1 > rect.c0)) {
      e.preventDefault();
      clearRange();
    }
  };

  /* ------------------------------ range selection ------------------------------ */

  const cellAt = (x: number, y: number) => {
    const td = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-cell]');
    if (!td || !tableRef.current?.contains(td)) return null;
    const [r0, c0] = td.dataset.cell!.split(':').map(Number);
    return { r: r0!, c: c0! };
  };
  const onCellPointerDown = (e: React.PointerEvent, ri: number, ci: number) => {
    e.stopPropagation();
    if (e.shiftKey) {
      e.preventDefault();
      setSel((s) => ({ a: s.a, h: { r: ri, c: ci } }));
      return;
    }
    dragging.current = true;
    setSel({ a: { r: ri, c: ci }, h: { r: ri, c: ci } });
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!dragging.current && !fill) return;
      const at = cellAt(e.clientX, e.clientY);
      if (!at) return;
      if (fill) {
        // Fill handle: extend along the dominant direction only.
        const base = norm(sel.a, sel.h);
        const down = at.r - base.r1, right = at.c - base.c1, up = base.r0 - at.r, left = base.c0 - at.c;
        const best = Math.max(down, right, up, left, 0);
        setFill(best === 0 ? base : best === down ? { ...base, r1: at.r } : best === up ? { ...base, r0: at.r } : best === right ? { ...base, c1: at.c } : { ...base, c0: at.c });
        return;
      }
      setSel((s) => (s.h.r === at.r && s.h.c === at.c ? s : { a: s.a, h: at }));
      if (at.r !== sel.a.r || at.c !== sel.a.c) window.getSelection()?.removeAllRanges();
    };
    const up = () => {
      dragging.current = false;
      if (fill) applyFill(fill);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  });

  const applyFill = (target: Rect) => {
    const base = norm(sel.a, sel.h);
    setFill(null);
    const next = read();
    if (target.r1 > base.r1 || target.r0 < base.r0) {
      for (let c = base.c0; c <= base.c1; c++) {
        const seed = next.slice(base.r0, base.r1 + 1).map((row) => row[c]!);
        if (target.r1 > base.r1) fillSeries(seed, target.r1 - base.r1).forEach((v, i) => (next[base.r1 + 1 + i]![c] = v));
        else fillSeries([...seed].reverse(), base.r0 - target.r0).forEach((v, i) => (next[base.r0 - 1 - i]![c] = v));
      }
    } else if (target.c1 > base.c1 || target.c0 < base.c0) {
      for (let r = base.r0; r <= base.r1; r++) {
        const seed = next[r]!.slice(base.c0, base.c1 + 1);
        if (target.c1 > base.c1) fillSeries(seed, target.c1 - base.c1).forEach((v, i) => (next[r]![base.c1 + 1 + i] = v));
        else fillSeries([...seed].reverse(), base.c0 - target.c0).forEach((v, i) => (next[r]![base.c0 - 1 - i] = v));
      }
    } else return;
    setRows(next);
    setSel({ a: { r: target.r0, c: target.c0 }, h: { r: target.r1, c: target.c1 } });
    setGen((g) => g + 1);
  };

  /* ------------------------------ toolbar actions ------------------------------ */

  const C = rows[0]?.length ?? 1;
  const insertRow = (after: boolean) => {
    const next = read();
    const at = after ? rect.r1 + 1 : rect.r0;
    next.splice(at, 0, Array(C).fill(''));
    restructure(next, colAlign, { r: at, c: rect.c0 }, colW, [...rowH.slice(0, at), 1 / rowH.length, ...rowH.slice(at)], [...cells.slice(0, at), Array(C).fill(null), ...cells.slice(at)]);
  };
  const insertCol = (after: boolean) => {
    const at = after ? rect.c1 + 1 : rect.c0;
    const next = read().map((row) => [...row.slice(0, at), '', ...row.slice(at)]);
    restructure(next, [...colAlign.slice(0, at), null, ...colAlign.slice(at)], { r: rect.r0, c: at }, [...colW.slice(0, at), 1 / colW.length, ...colW.slice(at)], rowH, cells.map((row) => [...row.slice(0, at), null, ...row.slice(at)]));
  };
  const deleteRows = () => {
    if (rows.length - (rect.r1 - rect.r0 + 1) < 1) return;
    const keep = (_: unknown, i: number) => i < rect.r0 || i > rect.r1;
    restructure(read().filter(keep), colAlign, { r: rect.r0, c: rect.c0 }, colW, rowH.filter(keep), cells.filter(keep));
  };
  const deleteCols = () => {
    if (C - (rect.c1 - rect.c0 + 1) < 1) return;
    const keep = (_: unknown, i: number) => i < rect.c0 || i > rect.c1;
    restructure(read().map((row) => row.filter(keep)), colAlign.filter(keep), { r: rect.r0, c: rect.c0 }, colW.filter(keep), rowH, cells.map((row) => row.filter(keep)));
  };
  const alignCols = (a: Align) => {
    setRows(read());
    const current = colAlign[rect.c0] ?? null;
    setColAlign(colAlign.map((x, i) => (i >= rect.c0 && i <= rect.c1 ? (current === a ? null : a) : x)));
  };
  const clearRange = () => {
    const next = read().map((row, ri) => row.map((v, ci) => (ri >= rect.r0 && ri <= rect.r1 && ci >= rect.c0 && ci <= rect.c1 ? '' : v)));
    setRows(next);
    setGen((g) => g + 1);
  };
  /** Merge a cell style into every cell of the range (`null` values drop the key); `null` clears all formatting. */
  const styleRange = (patch: CellPatch | null) => {
    setRows(read());
    // Clearing also drops character formatting typed into the cells (it lives in the DOM).
    if (!patch) tableRef.current?.querySelectorAll<HTMLElement>('[data-cell]').forEach((td) => {
      const [ri, ci] = td.dataset.cell!.split(':').map(Number);
      if (ri! >= rect.r0 && ri! <= rect.r1 && ci! >= rect.c0 && ci! <= rect.c1 && td.children.length) td.textContent = td.innerText.replace(/\n/g, ' ');
    });
    setCells((cur) =>
      cur.map((row, ri) =>
        row.map((c, ci) => {
          if (ri < rect.r0 || ri > rect.r1 || ci < rect.c0 || ci > rect.c1) return c;
          if (!patch) return null;
          const next: Record<string, unknown> = { ...(c ?? {}) };
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === undefined) delete next[k];
            else next[k] = v;
          }
          return Object.keys(next).length ? (next as CellStyle) : null;
        }),
      ),
    );
  };
  const active = cells[rect.r0]?.[rect.c0] ?? null;
  // The ribbon bridge is registered once: it reaches the current range through refs.
  const styleRangeRef = useRef(styleRange);
  styleRangeRef.current = styleRange;
  const activeRef = useRef<Cell>(active);
  activeRef.current = active;

  /** Spreadsheet range pasted into a cell: written from the active cell, the table grows to fit. */
  const onPaste = (e: React.ClipboardEvent) => {
    e.stopPropagation();
    const html = htmlTableGrid(e.clipboardData.getData('text/html'));
    const grid = html?.rows ?? tsvRows(e.clipboardData.getData('text/plain'));
    const gw = grid ? Math.max(...grid.map((g) => g.length)) : 0;
    if (!grid || (grid.length === 1 && gw <= 1)) {
      // Single value: plain text into the cell (the cell is rich: no foreign HTML).
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\r?\n/g, ' '));
      return;
    }
    e.preventDefault();
    const next = read();
    const r0 = rect.r0, c0 = rect.c0;
    const R = Math.max(next.length, r0 + grid.length), W = Math.max(C, c0 + gw);
    const grown = Array.from({ length: R }, (_, ri) => Array.from({ length: W }, (_, ci) => next[ri]?.[ci] ?? ''));
    grid.forEach((row, i) => row.forEach((v, j) => (grown[r0 + i]![c0 + j] = v)));
    const styles = Array.from({ length: R }, (_, ri) => Array.from({ length: W }, (_, ci) => cells[ri]?.[ci] ?? null));
    html?.styles.forEach((row, i) => row.forEach((st, j) => st && (styles[r0 + i]![c0 + j] = st)));
    restructure(grown, [...colAlign, ...Array(W - C).fill(null)], { r: r0, c: c0 }, [...colW, ...Array(W - C).fill(1 / C)], [...rowH, ...Array(R - next.length).fill(1 / next.length)], styles);
    setSel({ a: { r: r0, c: c0 }, h: { r: r0 + grid.length - 1, c: c0 + gw - 1 } });
  };

  const deleteTable = () => {
    done.current = true;
    const st = useEditor.getState();
    const slideId = st.slideId;
    st.setEditing(null);
    if (slideId) st.mutate([{ kind: 'deleteElement', slideId, elementId: el.id }]);
  };

  /* ------------------------------ floating toolbar position ------------------------------ */

  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const update = () => {
      const b = wrapRef.current?.getBoundingClientRect();
      if (b) setPos({ top: Math.max(4, b.top - 38), left: Math.max(4, b.left) });
    };
    update();
    window.addEventListener('resize', update);
    document.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      document.removeEventListener('scroll', update, true);
    };
  }, []);

  const multi = rect.r1 > rect.r0 || rect.c1 > rect.c0;
  const stats = (() => {
    if (!multi) return null;
    const live = tableRef.current ? read() : rows;
    const texts: string[] = [];
    for (let i = rect.r0; i <= rect.r1; i++) for (let j = rect.c0; j <= rect.c1; j++) texts.push(live[i]?.[j] ?? '');
    const nums = texts.map(parseNum).filter((n): n is number => n !== null);
    const sum = nums.reduce((a, b) => a + b, 0);
    return { count: texts.length, numeric: nums.length, sum };
  })();
  const hold = (e: React.MouseEvent) => e.preventDefault();
  const btn = (icon: IconName, title: string, action: () => void, active = false, disabled = false) => (
    <button type="button" className={`tbl-btn${active ? ' is-active' : ''}`} title={title} aria-label={title} aria-pressed={active || undefined} disabled={disabled} onMouseDown={hold} onClick={action}>
      <Icon name={icon} />
    </button>
  );
  const align = colAlign[rect.c0] ?? null;

  const s = r.style;
  const fillRect = fill ?? null;
  const inRect = (q: Rect | null, ri: number, ci: number) => !!q && ri >= q.r0 && ri <= q.r1 && ci >= q.c0 && ci <= q.c1;

  return (
    <div ref={wrapRef} className="table-editor" style={{ position: 'absolute', inset: 0 }} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()} data-testid="table-editor">
      <table ref={tableRef} key={gen} style={{ width: '100%', height: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: `"${s.fontFace}", Arial, sans-serif`, fontSize: ((el.style?.fontSize ?? 12) / 72) * PPI, color: `#${s.color}`, ...tableTextCss(el) }}>
        <colgroup>
          {colW.map((f, ci) => (
            <col key={ci} style={{ width: `${f * 100}%` }} />
          ))}
        </colgroup>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ height: (rowH[ri] ?? 0) * r.box.h * PPI }}>
              {row.map((v, ci) => {
                const style: CSSProperties = { ...tableCellStyle(el, ri, ci, master, { header, headerColumn, valign, align: colAlign[ci] ?? null, cell: cells[ri]?.[ci] ?? null }), outline: 'none' };
                return (
                  <td
                    key={ci}
                    data-cell={`${ri}:${ci}`}
                    className={`${inRect(rect, ri, ci) && multi ? 'is-range' : ''}${sel.h.r === ri && sel.h.c === ci ? ' is-active' : ''}${inRect(fillRect, ri, ci) && !inRect(rect, ri, ci) ? ' is-fill' : ''}`}
                    style={style}
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck
                    onFocus={() => !dragging.current && setSel((x) => (x.a.r === ri && x.a.c === ci && x.h.r === ri && x.h.c === ci ? x : multi ? x : { a: { r: ri, c: ci }, h: { r: ri, c: ci } }))}
                    onPointerDown={(e) => onCellPointerDown(e, ri, ci)}
                    onKeyDown={(e) => onKeyDown(e, ri, ci)}
                    onPaste={onPaste}
                    onContextMenu={(e) => {
                      // Selected characters get the text menu (font, size, color…), as in text boxes.
                      const sel = window.getSelection();
                      if (!sel || sel.isCollapsed) return;
                      e.preventDefault();
                      e.stopPropagation();
                      inlineEditor.current?.saveRange();
                      useEditor.getState().set({ contextMenu: { x: e.clientX, y: e.clientY, target: 'text' } });
                    }}
                    onInput={(e) => void syncCell(e.currentTarget, ri, ci)}
                  >
                    {shown[ri]?.[ci] && plain(shown[ri]![ci]!).trimEnd() === v ? shown[ri]![ci]!.map((run, k) => <RunView key={k} run={run} hex={hex} />) : v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <ResizeHandles table={() => tableRef.current} onCols={setColW} onRows={setRowH} />
      <RangeFrame tableRef={tableRef} rect={fill ?? rect} dashed={!!fill} onFillStart={() => setFill(rect)} />
      {pos &&
        createPortal(
          <div className="tbl-toolbar" style={{ top: pos.top, left: pos.left }} onMouseDown={hold} role="toolbar" aria-label={tr('Tableau', 'Table')} data-testid="table-toolbar">
            {btn('rowAbove', tr('Insérer une ligne au-dessus', 'Insert row above'), () => insertRow(false))}
            {btn('rowBelow', tr('Insérer une ligne en dessous', 'Insert row below'), () => insertRow(true))}
            <span className="tbl-sep" />
            {btn('colLeft', tr('Insérer une colonne à gauche', 'Insert column left'), () => insertCol(false))}
            {btn('colRight', tr('Insérer une colonne à droite', 'Insert column right'), () => insertCol(true))}
            <span className="tbl-sep" />
            {btn('rowDelete', tr('Supprimer la ligne', 'Delete row'), deleteRows, false, rows.length <= rect.r1 - rect.r0 + 1)}
            {btn('colDelete', tr('Supprimer la colonne', 'Delete column'), deleteCols, false, C <= rect.c1 - rect.c0 + 1)}
            <span className="tbl-sep" />
            {btn('alignLeft', tr('Aligner la colonne à gauche', 'Align column left'), () => alignCols('left'), align === 'left')}
            {btn('alignCenter', tr('Centrer la colonne', 'Center column'), () => alignCols('center'), align === 'center')}
            {btn('alignRight', tr('Aligner la colonne à droite', 'Align column right'), () => alignCols('right'), align === 'right')}
            <span className="tbl-sep" />
            {btn('vTop', tr('Cellules : haut', 'Cells: top'), () => setValign('top'), valign === 'top')}
            {btn('vMiddle', tr('Cellules : milieu', 'Cells: middle'), () => setValign('middle'), valign === 'middle')}
            {btn('vBottom', tr('Cellules : bas', 'Cells: bottom'), () => setValign('bottom'), valign === 'bottom')}
            <span className="tbl-sep" />
            <PaletteMenu
              testId="cell-fill-menu"
              value={active?.fill}
              allowNone
              onChange={(v) => styleRange({ fill: v })}
              trigger={(open) => (
                <button type="button" className="tbl-btn tbl-swatch" title={tr('Couleur de fond des cellules', 'Cell background color')} aria-label={tr('Couleur de fond des cellules', 'Cell background color')} onMouseDown={hold} onClick={open} data-testid="cell-fill">
                  <Icon name="fillColor" />
                  <span className="tbl-swatch-bar" style={{ background: tokenHex(active?.fill, master) ? `#${tokenHex(active?.fill, master)}` : 'transparent' }} />
                </button>
              )}
            />
            <BorderMenu cell={active} onChange={styleRange} />
            {btn('clearFormat', tr('Effacer la mise en forme des cellules', 'Clear cell formatting'), () => styleRange(null), false, !cells.some((row, ri) => row.some((c, ci) => c && inRect(rect, ri, ci))))}
            <span className="tbl-sep" />
            {btn('tableHeader', tr("En-tête : première ligne", 'Header: first row'), () => setHeader(!header), header)}
            {btn('tableHeaderCol', tr("En-tête : première colonne", 'Header: first column'), () => setHeaderColumn(!headerColumn), headerColumn)}
            {stats && (
              <>
                <span className="tbl-sep" />
                {btn('eraser', tr('Effacer les cellules sélectionnées', 'Clear selected cells'), clearRange)}
                <span className="tbl-stats" title={tr('Plage sélectionnée', 'Selected range')}>
                  {stats.count} {tr('cellules', 'cells')}{stats.numeric > 0 && ` · Σ ${fmt(stats.sum)} · ${tr('moy.', 'avg.')} ${fmt(stats.sum / stats.numeric)}`}
                </span>
              </>
            )}
            <span className="tbl-sep" />
            {btn('trash', tr('Supprimer le tableau', 'Delete table'), deleteTable)}
          </div>,
          document.body,
        )}
    </div>
  );
}


const even = (w: number[]) => w.map(() => 1 / w.length);

/**
 * Column and row borders of a selected (not edited) table, dragged on the slide: the slide
 * previews live, the release writes `colWidths` / `rowHeights`. Double-click: edit the table (in it, a border's double-click evens the sizes).
 */
export function TableGridHandles({ r, slideId }: { r: ResolvedElement; slideId: string }) {
  const el = r.element;
  const wrapRef = useRef<HTMLDivElement>(null);
  if (el.type !== 'table') return null;
  const st = useEditor.getState();
  const patchOf = (axis: 'col' | 'row', w: number[]): ElementPatch => (axis === 'col' ? { colWidths: w.map((x) => Math.round(x * 1000) / 1000) } : { rowHeights: w.map((x) => Math.round(x * 1000) / 1000) });
  const live = (axis: 'col' | 'row') => (w: number[]) => st.preview([{ kind: 'updateElement', slideId, elementId: el.id, patch: patchOf(axis, w) }]);
  return (
    <div ref={wrapRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} className="tbl-grid-handles" data-testid="table-grid-handles">
      <ResizeHandles
        // The table drawn by the slide renderer, under this overlay.
        table={() => document.querySelector<HTMLTableElement>(`.css-slide [data-element-id="${CSS.escape(el.id)}"] table`)}
        onCols={live('col')}
        onRows={live('row')}
        onEnd={(axis, w) => st.mutate([{ kind: 'updateElement', slideId, elementId: el.id, patch: patchOf(axis, w) }])}
        // A double-click on the table opens it for editing, wherever it lands.
        onDoubleClick={() => st.setEditing(el.id)}
      />
    </div>
  );
}

/** Rendered grid of a table, in its own (unscaled) pixels: inner borders and each row's content height. */
interface Grid { cols: number[]; rows: number[]; colPx: number[]; rowPx: number[]; rowMin: number[] }
function measureGrid(t: HTMLTableElement): Grid {
  const trs = [...t.rows];
  const cells = [...(trs[0]?.cells ?? [])];
  const colPx = cells.map((c) => c.offsetWidth);
  const rowPx = trs.map((r) => r.offsetHeight);
  const edges = (xs: number[], from: number) => xs.slice(0, -1).map((_, i) => from + xs.slice(0, i + 1).reduce((a, b) => a + b, 0));
  // A row never gets smaller than its text: the tallest cell content (one line when empty).
  const rowMin = trs.map((r) =>
    Math.max(
      ...[...r.cells].map((td) => {
        const scale = td.offsetHeight / (td.getBoundingClientRect().height || td.offsetHeight || 1);
        const range = document.createRange();
        range.selectNodeContents(td);
        const cs = getComputedStyle(td);
        const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
        return Math.max(line, range.getBoundingClientRect().height * scale) + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + 2;
      }),
    ),
  );
  return { cols: edges(colPx, cells[0]?.offsetLeft ?? 0), rows: edges(rowPx, trs[0]?.offsetTop ?? 0), colPx, rowPx, rowMin };
}

/**
 * Drag handles on the inner column and row borders, placed on the borders as rendered (rows grow
 * with their text, so the stored weights alone do not say where a border is). Dragging moves size
 * between the two neighbours; a row stops at its text, a column at 24 px.
 */
export function ResizeHandles({ table, onCols, onRows, onEnd, onDoubleClick }: { table: () => HTMLTableElement | null; onCols: (w: number[]) => void; onRows: (h: number[]) => void; onEnd?: (axis: 'col' | 'row', w: number[]) => void; onDoubleClick?: () => void }) {
  const [grid, setGrid] = useState<Grid | null>(null);
  const refresh = () => {
    const t = table();
    const next = t ? measureGrid(t) : null;
    setGrid((g) => (JSON.stringify(g) === JSON.stringify(next) ? g : next));
  };
  // Every render (typing, previews, restructuring) and on any size change of the table.
  useLayoutEffect(refresh);
  useEffect(() => {
    const t = table();
    if (!t) return;
    const ro = new ResizeObserver(refresh);
    ro.observe(t);
    return () => ro.disconnect();
  });
  const start = (e: React.PointerEvent, i: number, axis: 'col' | 'row') => {
    e.preventDefault();
    e.stopPropagation();
    const t = table();
    if (!t || !grid) return;
    const px = axis === 'col' ? grid.colPx : grid.rowPx;
    const total = px.reduce((a, b) => a + b, 0) || 1;
    // Client pixels per table pixel (the slide is zoomed with a transform).
    const scale = (axis === 'col' ? t.getBoundingClientRect().width / t.offsetWidth : t.getBoundingClientRect().height / t.offsetHeight) || 1;
    const w0 = px.map((x) => x / total);
    const min = (k: number) => (axis === 'col' ? 24 : grid.rowMin[k]!) / total;
    const origin = axis === 'col' ? e.clientX : e.clientY;
    const pair = w0[i]! + w0[i + 1]!;
    const cls = axis === 'col' ? 'is-col-resizing' : 'is-row-resizing';
    document.body.classList.add(cls);
    let last = w0;
    const move = (ev: PointerEvent) => {
      const delta = ((axis === 'col' ? ev.clientX : ev.clientY) - origin) / scale / total;
      const a = Math.max(Math.min(min(i), pair / 2), Math.min(pair - Math.min(min(i + 1), pair / 2), w0[i]! + delta));
      const next = [...w0];
      next[i] = a;
      next[i + 1] = pair - a;
      last = next;
      (axis === 'col' ? onCols : onRows)(next);
    };
    const up = () => {
      document.body.classList.remove(cls);
      if (last !== w0) onEnd?.(axis, last);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  if (!grid) return null;
  return (
    <>
      {grid.cols.map((x, i) => (
        <div key={`c${i}`} className="tbl-resize is-col" style={{ left: x, top: 0, bottom: 'auto', height: grid.rowPx.reduce((a, b) => a + b, 0) }} title={tr('Glisser pour redimensionner les colonnes', 'Drag to resize the columns')} onPointerDown={(e) => start(e, i, 'col')} onDoubleClick={(e) => (e.stopPropagation(), onDoubleClick ? onDoubleClick() : onEnd?.('col', even(grid.colPx)))} data-testid="col-resize" />
      ))}
      {grid.rows.map((y, i) => (
        <div key={`r${i}`} className="tbl-resize is-row" style={{ top: y, right: 'auto', width: grid.colPx.reduce((a, b) => a + b, 0) }} title={tr('Glisser pour redimensionner les lignes', 'Drag to resize the rows')} onPointerDown={(e) => start(e, i, 'row')} onDoubleClick={(e) => (e.stopPropagation(), onDoubleClick ? onDoubleClick() : onEnd?.('row', even(grid.rowPx)))} data-testid="row-resize" />
      ))}
    </>
  );
}

/** Excel-style frame around the selected range, with the fill handle on its bottom-right corner. */
function RangeFrame({ tableRef, rect, dashed, onFillStart }: { tableRef: React.RefObject<HTMLTableElement | null>; rect: Rect; dashed: boolean; onFillStart: () => void }) {
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  // Every render: cell sizes follow typing, resizing and restructuring.
  useLayoutEffect(() => {
    const t = tableRef.current;
    const a = t?.querySelector<HTMLElement>(`[data-cell="${rect.r0}:${rect.c0}"]`);
    const b = t?.querySelector<HTMLElement>(`[data-cell="${rect.r1}:${rect.c1}"]`);
    const next = a && b ? { left: a.offsetLeft, top: a.offsetTop, width: b.offsetLeft + b.offsetWidth - a.offsetLeft, height: b.offsetTop + b.offsetHeight - a.offsetTop } : null;
    if (JSON.stringify(next) !== JSON.stringify(box)) setBox(next);
  });
  if (!box) return null;
  return (
    <div className={`tbl-range-frame${dashed ? ' is-filling' : ''}`} style={box}>
      <div
        className="tbl-fill-handle"
        title={tr('Recopier vers le bas ou la droite (série)', 'Fill down or right (series)')}
        data-testid="fill-handle"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          document.body.classList.add('is-filling');
          window.addEventListener('pointerup', () => document.body.classList.remove('is-filling'), { once: true });
          onFillStart();
        }}
      />
    </div>
  );
}

/** Border of the selected cells: color, width and dash, or no border. */
function BorderMenu({ cell, onChange }: { cell: Cell; onChange: (p: CellPatch | null) => void }) {
  const label = tr('Bordure des cellules', 'Cell borders');
  const width = cell?.lineWidth ?? 0.5;
  const dash = cell?.dash ?? 'solid';
  // Picking a width or dash on "no border" cells brings the border back.
  const visible = cell?.line === 'none' ? { line: null } : {};
  return (
    <Menu
      testId="cell-border-menu"
      trigger={(open) => (
        <button type="button" className="tbl-btn" title={label} aria-label={label} onMouseDown={(e) => e.preventDefault()} onClick={open} data-testid="cell-border">
          <Icon name="borders" />
        </button>
      )}
    >
      {(close) => (
        <div className="border-menu" onMouseDown={(e) => e.target instanceof HTMLButtonElement && e.preventDefault()}>
          <h4>{tr('Couleur', 'Color')}</h4>
          <PaletteGrid value={cell?.line} allowNone onChange={(v) => onChange({ line: v })} close={() => undefined} testId="cell-border-color" />
          <h4>{tr('Épaisseur', 'Width')}</h4>
          <div className="border-opts" role="radiogroup" aria-label={tr('Épaisseur', 'Width')}>
            {BORDER_WIDTHS.map((w) => (
              <button key={w} type="button" role="radio" aria-checked={w === width} className={`border-opt${w === width ? ' is-active' : ''}`} onClick={() => onChange({ lineWidth: w === 0.5 ? null : w, ...visible })} data-testid={`cell-border-w-${w}`}>
                <span className="border-sample" style={{ borderTopWidth: Math.max(1, (w / 72) * 96) }} />
                {fmtNumber(w, 2)} pt
              </button>
            ))}
          </div>
          <h4>{tr('Type de trait', 'Dash type')}</h4>
          <div className="border-opts" role="radiogroup" aria-label={tr('Type de trait', 'Dash type')}>
            {DASHES.map((d) => (
              <button key={d.id} type="button" role="radio" aria-checked={d.id === dash} className={`border-opt${d.id === dash ? ' is-active' : ''}`} onClick={() => onChange({ dash: d.id === 'solid' ? null : d.id, ...visible })} data-testid={`cell-border-${d.id}`}>
                <span className="border-sample" style={{ borderTopStyle: d.id === 'dash' ? 'dashed' : d.id === 'dot' ? 'dotted' : 'solid', borderTopWidth: 2 }} />
                {tr(d.fr, d.en)}
              </button>
            ))}
          </div>
          <div className="palette-actions">
            <button type="button" className="menu-item" onClick={() => (onChange({ line: 'none', lineWidth: null, dash: null }), close())} data-testid="cell-border-none">{tr('Aucune bordure', 'No border')}</button>
            <button type="button" className="menu-item" onClick={() => (onChange({ line: null, lineWidth: null, dash: null }), close())}>{tr('Bordure par défaut', 'Default border')}</button>
          </div>
        </div>
      )}
    </Menu>
  );
}
