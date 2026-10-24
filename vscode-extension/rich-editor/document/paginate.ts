/**
 * Pagination as a pure function of measurements. The editor is one continuous ProseMirror view;
 * blocks are measured in "content coordinates" (CSS px at zoom 1, page gaps removed), this module
 * decides where pages break, and the editor shows each break as a spacer (page bottom margin +
 * gap + next page top margin) at a document position — between blocks, before a line inside a
 * paragraph, or before a table row (with repeated header rows). Nothing here is persisted.
 *
 * One forward pass: every step either places a block or moves the page start strictly forward,
 * so the result is deterministic and terminates; a block taller than a page is placed once at a
 * page top and reported as overflow instead of being pushed from page to page.
 */

export interface Line {
  top: number;
  bottom: number;
  /** Document position where the line starts. */
  pos: number;
}

export interface Row extends Line {
  header?: boolean;
}

export interface Block {
  /** Document position before the block. */
  pos: number;
  top: number;
  /** Top of the next block (the block's advance, margins included). */
  bottom: number;
  kind: "text" | "table" | "atomic" | "pageBreak" | "sectionBreak";
  keepWithNext?: boolean;
  keepTogether?: boolean;
  pageBreakBefore?: boolean;
  widowControl?: boolean;
  /** Line boxes (text) — only asked for when the block crosses a page boundary. */
  lines?: () => Line[];
  rows?: () => Row[];
}

export interface SectionFrame {
  /** Usable body height of a page of the section, px. */
  contentHeight: number;
}

export interface Page {
  section: number;
  /** Content coordinate where the page's body starts. */
  start: number;
  /** Content coordinate the body may not pass. */
  limit: number;
  /** First page of its section (title page stories). */
  firstOfSection: boolean;
  /** Index of the first block (or of the block continued from the previous page). */
  firstBlock: number;
}

export interface Break {
  /** Content coordinate of the first thing on the new page. */
  at: number;
  pos: number;
  kind: "block" | "line" | "row";
  block: number;
  /** New page index. */
  page: number;
  /** Repeated table header rows on the new page. */
  repeatHeader?: { height: number; rows: number };
  explicit?: boolean;
}

export interface Overflow {
  block: number;
  page: number;
  height: number;
  limit: number;
}

export interface Pagination {
  pages: Page[];
  breaks: Break[];
  overflows: Overflow[];
}

const MAX_PAGES = 5000;
const EPS = 0.5;

/** `sectionOf[i]` = section index of block i (breaks move to the next section after them). */
export function paginate(blocks: Block[], sections: SectionFrame[], opts: { minLines?: number } = {}): Pagination {
  const minLines = opts.minLines ?? 2;
  const pages: Page[] = [];
  const breaks: Break[] = [];
  const overflows: Overflow[] = [];
  let section = 0;
  const frame = () => sections[Math.min(section, sections.length - 1)] ?? { contentHeight: 1000 };
  const open = (start: number, firstBlock: number, firstOfSection: boolean, extra = 0) => {
    pages.push({ section, start, limit: start + frame().contentHeight - extra, firstOfSection, firstBlock });
  };
  open(blocks[0]?.top ?? 0, 0, true);
  const page = () => pages[pages.length - 1];
  const newPage = (b: Omit<Break, "page">, firstOfSection = false): boolean => {
    if (pages.length >= MAX_PAGES) return false;
    if (b.at <= page().start + EPS && !b.explicit && !firstOfSection) return false;
    breaks.push({ ...b, page: pages.length });
    open(b.at, b.block, firstOfSection, b.repeatHeader?.height ?? 0);
    return true;
  };

  /** Bottom of the first piece of block j that must share a page with a keep-with-next predecessor. */
  const firstPiece = (j: number): number => {
    const b = blocks[j];
    if (!b) return -Infinity;
    if (b.kind === "text" && !b.keepTogether && b.bottom - b.top > 0) {
      const lines = b.lines?.() ?? [];
      if (lines.length > minLines) return lines[minLines - 1].bottom;
    }
    if (b.kind === "table") {
      const rows = b.rows?.() ?? [];
      const body = rows.findIndex((r) => !r.header);
      if (body >= 0) return rows[body].bottom;
    }
    return b.bottom;
  };

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind === "pageBreak" || b.kind === "sectionBreak") {
      const next = blocks[i + 1];
      if (b.kind === "sectionBreak") section++;
      if (next) newPage({ at: next.top, pos: next.pos, kind: "block", block: i + 1, explicit: true }, b.kind === "sectionBreak");
      else if (b.kind === "sectionBreak") page().section = section;
      continue;
    }
    if (b.pageBreakBefore && i > 0) newPage({ at: b.top, pos: b.pos, kind: "block", block: i, explicit: true });

    // Keep with next: the block and the first piece of the next one share a page.
    if (b.bottom <= page().limit + EPS) {
      if (b.keepWithNext && blocks[i + 1] && blocks[i + 1].kind !== "pageBreak" && blocks[i + 1].kind !== "sectionBreak") {
        const need = firstPiece(i + 1);
        if (need > page().limit + EPS) {
          // Move the whole keep-with-next run that ends here, when it fits on a page.
          let k = i;
          while (k > 0 && blocks[k - 1].keepWithNext && blocks[k - 1].top > page().start + EPS && blocks[k - 1].kind !== "sectionBreak" && blocks[k - 1].kind !== "pageBreak") k--;
          if (need - blocks[k].top <= frame().contentHeight && newPage({ at: blocks[k].top, pos: blocks[k].pos, kind: "block", block: k })) {
            i = k - 1;
            continue;
          }
        }
      }
      continue;
    }

    // Does not fit. Unsplittable (or kept together and not taller than a page): next page.
    const height = b.bottom - b.top;
    const splittable = b.kind === "text" || b.kind === "table";
    const together = !splittable || (b.keepTogether && height <= frame().contentHeight);
    if (together) {
      if (b.top > page().start + EPS) newPage({ at: b.top, pos: b.pos, kind: "block", block: i });
      if (b.bottom > page().limit + EPS && (!splittable || height > frame().contentHeight)) {
        if (!splittable) overflows.push({ block: i, page: pages.length - 1, height, limit: frame().contentHeight });
      }
      if (!splittable || b.bottom <= page().limit + EPS) continue;
    }

    if (b.kind === "table") {
      const rows = b.rows?.() ?? [];
      const headerRows = rows.filter((r, k) => r.header && rows.slice(0, k).every((x) => x.header));
      const headerHeight = headerRows.length ? headerRows[headerRows.length - 1].bottom - headerRows[0].top : 0;
      const repeat = headerRows.length && headerHeight < frame().contentHeight / 2 ? { height: headerHeight, rows: headerRows.length } : undefined;
      let r = headerRows.length;
      // Not even one body row fits: the whole table moves (once).
      if (rows[r] && rows[r].bottom > page().limit + EPS && b.top > page().start + EPS) newPage({ at: b.top, pos: b.pos, kind: "block", block: i });
      for (; r < rows.length; r++) {
        const row = rows[r];
        if (row.bottom <= page().limit + EPS) continue;
        if (row.top <= page().start + EPS) {
          overflows.push({ block: i, page: pages.length - 1, height: row.bottom - row.top, limit: frame().contentHeight });
          continue;
        }
        newPage({ at: row.top, pos: row.pos, kind: "row", block: i, repeatHeader: repeat });
        if (row.bottom > page().limit + EPS) overflows.push({ block: i, page: pages.length - 1, height: row.bottom - row.top, limit: frame().contentHeight });
      }
      continue;
    }

    // Text: break between lines, keeping `minLines` at the bottom (orphans) and top (widows).
    const lines = b.lines?.() ?? [];
    if (lines.length < 2) {
      if (b.top > page().start + EPS) newPage({ at: b.top, pos: b.pos, kind: "block", block: i });
      continue;
    }
    let from = 0;
    while (from < lines.length) {
      let k = from - 1;
      while (k + 1 < lines.length && lines[k + 1].bottom <= page().limit + EPS) k++;
      if (k === lines.length - 1) break;
      const widowControl = b.widowControl !== false && lines.length - from >= 2 * minLines;
      if (widowControl) {
        if (lines.length - (k + 1) < minLines) k = lines.length - minLines - 1;
        if (k - from + 1 < minLines && from === 0) k = from - 1;
      }
      if (k < from) {
        // No line fits on this page: the paragraph (or its rest) starts on the next one.
        const at = from === 0 ? b.top : lines[from].top;
        const pos = from === 0 ? b.pos : lines[from].pos;
        if (!newPage({ at, pos, kind: from === 0 ? "block" : "line", block: i })) {
          // Already at a page top: a line taller than the page. Place it and continue.
          overflows.push({ block: i, page: pages.length - 1, height: lines[from].bottom - lines[from].top, limit: frame().contentHeight });
          k = from;
          if (k === lines.length - 1) break;
          if (!newPage({ at: lines[k + 1].top, pos: lines[k + 1].pos, kind: "line", block: i })) break;
          from = k + 1;
        }
        continue;
      }
      if (!newPage({ at: lines[k + 1].top, pos: lines[k + 1].pos, kind: "line", block: i })) break;
      from = k + 1;
    }
  }
  return { pages, breaks, overflows };
}
