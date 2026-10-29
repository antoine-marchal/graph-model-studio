/**
 * Table look of a `.paper` table, stored in its group (`blocks.<id>`), never in the body:
 *
 *   blocks:
 *     sales:
 *       table: { borderColor: "#9AA5B1", borderStyle: dashed }      # the whole table
 *       cells:                                                     # Excel-style ranges, in order
 *         "A1:D1": { fill: "#1F4E79", color: "#FFFFFF", bold: true }
 *         "A4:D4": { borderStyle: double, edges: top }
 *
 * Borders are resolved on the grid's edges (an edge shared by two cells has one look), later
 * ranges win. `edges` says which edges of the range a border applies to.
 */

export type BorderStyle = "solid" | "dashed" | "dotted" | "double" | "none";
export type BorderEdges = "all" | "outside" | "inside" | "top" | "bottom";

export interface CellLook {
  fill?: string;
  color?: string;
  bold?: boolean;
  borderColor?: string;
  borderStyle?: BorderStyle;
  /** pt */
  borderWidth?: number;
  edges?: BorderEdges;
}

export interface CellRange {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export interface Border {
  style: BorderStyle;
  width: number;
  color: string;
}

export interface ResolvedCell {
  fill?: string;
  color?: string;
  bold?: boolean;
  top?: Border;
  right?: Border;
  bottom?: Border;
  left?: Border;
}

const colName = (c: number): string => (c >= 26 ? colName(Math.floor(c / 26) - 1) : "") + String.fromCharCode(65 + (c % 26));
const colIndex = (s: string): number => [...s.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** "B2:D4" / "C3" → 0-based inclusive range (normalised), or null. */
export function parseRange(text: string): CellRange | null {
  const m = /^\s*([A-Za-z]+)(\d+)\s*(?::\s*([A-Za-z]+)(\d+)\s*)?$/.exec(text);
  if (!m) return null;
  const a = { r: Number(m[2]) - 1, c: colIndex(m[1]) };
  const b = m[3] ? { r: Number(m[4]) - 1, c: colIndex(m[3]) } : a;
  if (a.r < 0 || b.r < 0) return null;
  return { r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c), r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c) };
}

export function formatRange(r: CellRange): string {
  const a = `${colName(r.c1)}${r.r1 + 1}`;
  const b = `${colName(r.c2)}${r.r2 + 1}`;
  return a === b ? a : `${a}:${b}`;
}

const hasBorder = (l: CellLook) => l.borderColor !== undefined || l.borderStyle !== undefined || l.borderWidth !== undefined || l.edges !== undefined;

/** Resolved look of every cell of a `rows` × `cols` grid; undefined when the table has no look. */
export function resolveTableLook(rows: number, cols: number, table?: CellLook, cells?: Record<string, CellLook>): ResolvedCell[][] | undefined {
  const rules: { range: CellRange; look: CellLook }[] = [];
  if (table && Object.keys(table).length) rules.push({ range: { r1: 0, c1: 0, r2: rows - 1, c2: cols - 1 }, look: table });
  for (const [key, look] of Object.entries(cells ?? {})) {
    const range = parseRange(key);
    if (range && look) rules.push({ range, look });
  }
  if (!rules.length) return undefined;
  const grid: ResolvedCell[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({})));
  // horizontal edges h[r][c]: top of row r (r = rows: bottom of the table); vertical v[r][c]: left of column c
  const h: (Border | undefined)[][] = Array.from({ length: rows + 1 }, () => Array(cols).fill(undefined));
  const v: (Border | undefined)[][] = Array.from({ length: rows }, () => Array(cols + 1).fill(undefined));
  for (const { range, look } of rules) {
    const r2 = Math.min(range.r2, rows - 1);
    const c2 = Math.min(range.c2, cols - 1);
    for (let r = range.r1; r <= r2; r++) for (let c = range.c1; c <= c2; c++) {
      const cell = grid[r][c];
      if (look.fill !== undefined) cell.fill = look.fill;
      if (look.color !== undefined) cell.color = look.color;
      if (look.bold !== undefined) cell.bold = look.bold;
    }
    if (!hasBorder(look)) continue;
    const border: Border = { style: look.borderStyle ?? "solid", width: look.borderWidth ?? 0.75, color: look.borderColor ?? "#808080" };
    const edges = look.edges ?? "all";
    const outer = edges === "all" || edges === "outside";
    const inner = edges === "all" || edges === "inside";
    for (let r = range.r1; r <= r2 + 1; r++) for (let c = range.c1; c <= c2; c++) {
      const boundary = r === range.r1 || r === r2 + 1;
      if ((boundary && outer) || (!boundary && inner) || (edges === "top" && r === range.r1) || (edges === "bottom" && r === r2 + 1)) h[r][c] = border;
    }
    if (edges === "top" || edges === "bottom") continue;
    for (let r = range.r1; r <= r2; r++) for (let c = range.c1; c <= c2 + 1; c++) {
      const boundary = c === range.c1 || c === c2 + 1;
      if ((boundary && outer) || (!boundary && inner)) v[r][c] = border;
    }
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const cell = grid[r][c];
    cell.top = h[r][c];
    cell.bottom = h[r + 1][c];
    cell.left = v[r][c];
    cell.right = v[r][c + 1];
  }
  return grid;
}

/** CSS for one resolved cell (borders in px; `none` hides the shared edge in the collapsed model). */
export function cellCss(cell: ResolvedCell): string {
  const side = (name: string, b?: Border) => (b ? `border-${name}:${b.style === "none" ? "hidden" : `${b.style === "double" ? Math.max(3, b.width * 4 / 3) : Math.max(1, b.width * 4 / 3)}px ${b.style} ${b.color}`};` : "");
  return [
    cell.fill ? `background:${cell.fill};` : "",
    cell.color ? `color:${cell.color};` : "",
    cell.bold !== undefined ? `font-weight:${cell.bold ? 700 : 400};` : "",
    side("top", cell.top), side("right", cell.right), side("bottom", cell.bottom), side("left", cell.left),
  ].join("");
}
