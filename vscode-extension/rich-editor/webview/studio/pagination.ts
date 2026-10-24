/**
 * Paginated editing in ONE ProseMirror view (continuous selection, caret moves, copy / paste, IME
 * and undo across pages). Pages are derived, never stored:
 *
 *   1. static decorations: section column geometry (node styles) and text-wrap floats of anchored
 *      objects (a float with `shape-outside` reserving the object's area in its anchor paragraph);
 *   2. measure top-level blocks in content coordinates (DOM y minus page spacers above);
 *   3. document/paginate.ts decides breaks (lines, table rows with repeated headers, keep rules);
 *   4. each break becomes a spacer widget (page bottom margin + gap + next page top margin);
 *   5. page boxes go to the store (PageLayer draws paper, headers, footers) and positioned objects
 *      are placed relative to their anchor paragraph or its page.
 *
 * Runs after document changes (debounced, never during IME composition), resizes, font and image
 * loads; stops when a pass changes nothing, and after a few passes without a document change.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import { paginate, type Block, type Line, type Row } from "../../document/paginate";
import { contentHeight, contentWidth, type ResolvedPage } from "../../document/schema";
import { ptToPx } from "../../document/units";
import { defaultStyleFor } from "../../document/styles";
import { objectOf, resolveDocument, studio, type Layout, type PageBox } from "./store";
import { parseBlockProps } from "../extensions/StudioNodes";

export const paginationKey = new PluginKey<DecorationSet>("msPagination");
export const PAGE_GAP = 28;
const TEXT_TYPES = new Set(["paragraph", "heading", "blockquote", "bulletList", "orderedList", "taskList", "codeBlock"]);
const MAX_PASSES = 4;

const px = ptToPx;

interface Geometry {
  pages: ResolvedPage[];
  paperWidth: number;
}

function geometry(): Geometry {
  const pages = studio.get().sections.map((s) => s.page);
  return { pages, paperWidth: Math.max(...pages.map((p) => px(p.width)), 1) };
}

const pageLeft = (g: Geometry, page: ResolvedPage) => (g.paperWidth - px(page.width)) / 2;

/** Section index of every top-level node (a section break starts the next section after it). */
function sectionIndexes(doc: PMNode): number[] {
  const out: number[] = [];
  let s = 0;
  doc.forEach((n) => {
    out.push(s);
    if (n.type.name === "msSection") s++;
  });
  return out;
}

function sectionMarkers(doc: PMNode): Record<string, unknown>[] {
  const markers: Record<string, unknown>[] = [];
  doc.forEach((n) => {
    if (n.type.name !== "msSection") return;
    try {
      markers.push(JSON.parse(n.attrs.props || "{}"));
    } catch {
      markers.push({});
    }
  });
  return markers;
}

/** Column geometry of later sections + wrap floats of anchored objects. */
function staticDecorations(state: EditorState, g: Geometry, paged: boolean): Decoration[] {
  const decos: Decoration[] = [];
  const doc = state.doc;
  const sec = sectionIndexes(doc);
  const tops: { node: PMNode; pos: number }[] = [];
  doc.forEach((node, pos) => void tops.push({ node, pos }));
  tops.forEach(({ node, pos }, i) => {
    if (!paged || sec[i] === 0 || node.type.name === "msObject") return;
    const page = g.pages[Math.min(sec[i], g.pages.length - 1)];
    decos.push(Decoration.node(pos, pos + node.nodeSize, { style: `margin-left:${pageLeft(g, page) + px(page.margins.left)}px;width:${px(contentWidth(page))}px`, "data-ms-section": String(sec[i]) }));
  });
  tops.forEach(({ node }, i) => {
    if (node.type.name !== "msObject") return;
    const d = objectOf(String(node.attrs.id));
    if (!d || d.placement !== "anchored" || d.plane === "behind" || (d.hidden && !studio.get().showHidden) || d.wrap === "none" || d.type === "connector") return;
    let a = i + 1;
    while (a < tops.length && (tops[a].node.type.name === "msObject" || tops[a].node.type.name === "msSection" || tops[a].node.type.name === "msPageBreak")) a++;
    const anchor = tops[a];
    if (!anchor) return;
    let textPos = -1;
    if (anchor.node.isTextblock) textPos = anchor.pos + 1;
    else anchor.node.descendants((n, p) => {
      if (textPos >= 0) return false;
      if (n.isTextblock) textPos = anchor.pos + 1 + p + 1;
      return textPos < 0;
    });
    const page = g.pages[Math.min(sec[a], g.pages.length - 1)];
    const col = px(contentWidth(page));
    const x = Math.max(0, px(d.box.x));
    const y = Math.max(0, px(d.box.y));
    const w = px(d.box.width);
    const h = px(d.box.height);
    const dist = 6;
    const wrap = d.wrap ?? "square";
    let css: string;
    if (wrap === "topBottom" || textPos < 0) css = `float:left;width:${col}px;height:${y + h + dist}px;shape-outside:inset(${y}px 0 0 0)`;
    else if (x + w / 2 < col / 2) css = `float:left;width:${Math.min(col, x + w + dist)}px;height:${y + h + dist}px;shape-outside:inset(${y}px 0 0 ${x}px)`;
    else css = `float:right;width:${Math.min(col, col - x + dist)}px;height:${y + h + dist}px;shape-outside:inset(${y}px ${Math.max(0, col - x - w)}px 0 0)`;
    const key = `wrap-${node.attrs.id}-${css}`;
    if (textPos >= 0) decos.push(Decoration.widget(textPos, () => floatEl(css, String(node.attrs.id)), { side: -1, key, ignoreSelection: true }));
    else decos.push(Decoration.widget(anchor.pos, () => floatEl(`${css};float:none;display:block`, String(node.attrs.id)), { side: -1, key, ignoreSelection: true }));
  });
  return decos;
}

function floatEl(css: string, id: string): HTMLElement {
  const el = document.createElement("span");
  el.className = "ms-wrap-float";
  el.dataset.object = id;
  el.setAttribute("style", css);
  el.contentEditable = "false";
  el.setAttribute("aria-hidden", "true");
  return el;
}

function spacerEl(tag: "div" | "span", h: number, page: number): HTMLElement {
  const el = document.createElement(tag);
  el.className = "ms-page-spacer";
  el.dataset.msSpacer = "1";
  el.dataset.h = String(h);
  el.dataset.page = String(page);
  el.style.height = `${h}px`;
  if (tag === "span") el.style.display = "block";
  el.contentEditable = "false";
  el.setAttribute("aria-hidden", "true");
  return el;
}

function rowSpacerEl(h: number, page: number): HTMLElement {
  const tr = document.createElement("tr");
  tr.className = "ms-page-spacer ms-row-spacer";
  tr.dataset.msSpacer = "1";
  tr.dataset.h = String(h);
  tr.dataset.page = String(page);
  tr.contentEditable = "false";
  tr.setAttribute("aria-hidden", "true");
  const td = document.createElement("td");
  td.colSpan = 99;
  td.style.height = `${h}px`;
  tr.appendChild(td);
  return tr;
}

class Paginator {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private frame = 0;
  private passes = 0;
  private staticSet: Decoration[] = [];
  private staticKey = "";
  private spacerKey = "";
  private spacers: Decoration[] = [];
  private ro: ResizeObserver;
  private unsubscribe: () => void;
  private markersKey = "";
  private lastStore = "";
  private onLoad = (e: Event) => {
    if ((e.target as HTMLElement)?.tagName === "IMG") this.schedule(30, true);
  };

  constructor(private view: EditorView) {
    this.ro = new ResizeObserver(() => this.schedule(60));
    this.ro.observe(view.dom);
    view.dom.addEventListener("load", this.onLoad, true);
    void document.fonts?.ready.then(() => this.schedule(0, true));
    document.fonts?.addEventListener?.("loadingdone", () => this.schedule(0, true));
    this.unsubscribe = studio.subscribe(() => {
      const s = studio.get();
      const key = JSON.stringify([s.pageView, s.sections.map((x) => [x.page, x.props]), s.meta?.objects, s.showHidden, s.zoom]);
      if (key !== this.lastStore) {
        this.lastStore = key;
        this.schedule(0, true);
      }
    });
    this.schedule(0);
  }

  update(view: EditorView, prev: EditorState): void {
    this.view = view;
    if (view.state.doc !== prev.doc) {
      this.passes = 0;
      this.schedule(view.state.doc.content.size > 200_000 ? 250 : 90);
    }
  }

  destroy(): void {
    this.ro.disconnect();
    this.unsubscribe();
    this.view.dom.removeEventListener("load", this.onLoad, true);
    if (this.timer) clearTimeout(this.timer);
    cancelAnimationFrame(this.frame);
  }

  schedule(delay: number, reset = false): void {
    if (reset) this.passes = 0;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(() => this.run());
    }, delay);
  }

  private dispatch(): void {
    const set = DecorationSet.create(this.view.state.doc, [...this.staticSet, ...this.spacers]);
    this.view.dispatch(this.view.state.tr.setMeta(paginationKey, set).setMeta("addToHistory", false));
  }

  private run(): void {
    const view = this.view;
    if (view.composing) {
      view.dom.addEventListener("compositionend", () => this.schedule(30), { once: true });
      return;
    }
    if (this.passes >= MAX_PASSES) return;
    this.passes++;
    const t0 = performance.now();
    const doc = view.state.doc;
    const markers = sectionMarkers(doc);
    const mk = JSON.stringify(markers);
    if (mk !== this.markersKey) {
      this.markersKey = mk;
      resolveDocument(markers);
    }
    const { pageView } = studio.get();
    const g = geometry();
    const root = view.dom as HTMLElement;
    const first = g.pages[0];
    root.style.setProperty("--ms-paper-w", `${g.paperWidth}px`);
    root.style.setProperty("--ms-left", `${pageLeft(g, first) + px(first.margins.left)}px`);
    root.style.setProperty("--ms-width", `${px(contentWidth(first))}px`);
    root.style.setProperty("--ms-pad-top", `${px(first.margins.top)}px`);
    root.style.setProperty("--ms-page-content-h", `${px(contentHeight(first))}px`);

    const statics = staticDecorations(view.state, g, pageView);
    const sk = statics.map((d) => `${d.from}:${(d as any).spec?.key ?? JSON.stringify((d as any).type?.attrs ?? "")}`).join("|");
    if (sk !== this.staticKey) {
      // Static decorations change the layout: apply them, then measure in the next pass.
      this.staticKey = sk;
      this.staticSet = statics;
      if (!pageView) this.spacers = [];
      this.dispatch();
      this.schedule(0);
      return;
    }
    if (!pageView) {
      if (this.spacers.length) {
        this.spacers = [];
        this.spacerKey = "";
        this.dispatch();
      }
      studio.set({ layout: null });
      layoutObjects(view, null, g);
      return;
    }

    const zoom = studio.get().zoom || 1;
    const rootRect = root.getBoundingClientRect();
    const yOf = (clientY: number) => (clientY - rootRect.top) / zoom;
    const padTop = px(first.margins.top);
    const spacerYs = [...root.querySelectorAll<HTMLElement>("[data-ms-spacer]")]
      .map((el) => ({ y: yOf(el.getBoundingClientRect().top), h: el.classList.contains("ms-repeat-header") ? el.getBoundingClientRect().height / zoom : Number(el.dataset.h) || 0 }))
      .sort((a, b) => a.y - b.y);
    const content = (domY: number) => {
      let above = 0;
      for (const s of spacerYs) if (s.y < domY - 0.5) above += s.h;
      return domY - padTop - above;
    };

    const tops: { node: PMNode; pos: number; dom: HTMLElement }[] = [];
    doc.forEach((node, pos) => {
      const dom = view.nodeDOM(pos) as HTMLElement | null;
      if (!dom || !(dom instanceof HTMLElement) || node.type.name === "msObject") return;
      tops.push({ node, pos, dom });
    });
    const secOf = sectionIndexes(doc);
    const secByPos = new Map<number, number>();
    let k = 0;
    doc.forEach((_n, pos) => void secByPos.set(pos, secOf[k++]));

    const blocks: Block[] = tops.map(({ node, pos, dom }, i) => {
      const r = dom.getBoundingClientRect();
      const top = content(yOf(r.top));
      const next = tops[i + 1];
      const bottom = next ? content(yOf(next.dom.getBoundingClientRect().top)) : content(yOf(r.bottom));
      const name = node.type.name;
      const props = parseBlockProps(node.attrs.msBlock);
      const sheet = studio.get().sections[secByPos.get(pos) ?? 0]?.sheet;
      const styleId = props.style ?? defaultStyleFor({ type: name === "codeBlock" ? "code" : name, depth: node.attrs.level });
      const style = sheet?.styles.get(styleId)?.paragraph ?? {};
      const kind: Block["kind"] = name === "msPageBreak" ? "pageBreak" : name === "msSection" ? "sectionBreak" : name === "table" ? "table" : TEXT_TYPES.has(name) ? "text" : "atomic";
      return {
        pos,
        top,
        bottom: Math.max(top, bottom),
        kind,
        keepWithNext: props.keepWithNext ?? style.keepWithNext ?? name === "heading",
        keepTogether: props.keepTogether ?? style.keepTogether,
        pageBreakBefore: props.pageBreakBefore ?? style.pageBreakBefore,
        widowControl: props.widowControl ?? style.widowControl,
        lines: kind === "text" ? () => measureLines(view, dom, yOf, content) : undefined,
        rows: kind === "table" ? () => measureRows(view, dom, yOf, content) : undefined,
      };
    });
    const sectionFrames = g.pages.map((p) => ({ contentHeight: px(contentHeight(p)) }));
    const result = paginate(blocks, sectionFrames);

    // Breaks → spacers.
    const pageTops: number[] = [0];
    result.pages.forEach((p, i) => {
      if (i) pageTops[i] = pageTops[i - 1] + px(g.pages[result.pages[i - 1].section].height) + PAGE_GAP;
    });
    const decos: Decoration[] = [];
    let shift = 0;
    const keys: string[] = [];
    for (const b of result.breaks) {
      const page = g.pages[result.pages[b.page].section];
      const desired = pageTops[b.page] + px(page.margins.top);
      const h = Math.max(0, Math.round((desired - (padTop + b.at + shift)) * 100) / 100);
      const headerH = b.repeatHeader?.height ?? 0;
      shift += h + headerH;
      const key = `sp-${b.page}-${b.kind}-${b.pos}-${h}`;
      keys.push(key);
      if (b.kind === "row") {
        const tableDom = tops[b.block]?.dom;
        const headers = [...(tableDom?.querySelectorAll<HTMLElement>("tr") ?? [])].filter((tr) => !tr.dataset.msSpacer && !tr.classList.contains("ms-repeat-header")).slice(0, b.repeatHeader?.rows ?? 0);
        decos.push(Decoration.widget(b.pos, () => rowSpacerEl(h, b.page), { side: -3, key, ignoreSelection: true }));
        headers.forEach((tr, i) => {
          decos.push(Decoration.widget(b.pos, () => {
            const clone = tr.cloneNode(true) as HTMLElement;
            clone.classList.add("ms-repeat-header");
            clone.dataset.msSpacer = "1";
            clone.contentEditable = "false";
            clone.setAttribute("aria-hidden", "true");
            return clone;
          }, { side: -2 + i * 0.01, key: `${key}-h${i}-${headerH}`, ignoreSelection: true }));
        });
      } else {
        const $pos = view.state.doc.resolve(b.pos);
        const inline = b.kind === "line" && $pos.parent.isTextblock && $pos.parentOffset > 0;
        decos.push(Decoration.widget(b.pos, () => spacerEl(inline ? "span" : "div", h, b.page), { side: -1, key, ignoreSelection: true, marks: [] }));
      }
    }
    const spacerKey = keys.join("|");
    if (spacerKey !== this.spacerKey) {
      this.spacerKey = spacerKey;
      this.spacers = decos;
      this.dispatch();
      // Spacers inside paragraphs can re-wrap a line: check once more.
      this.schedule(16);
    }

    // Page boxes for the paper layer.
    let number = 1;
    const pages: PageBox[] = result.pages.map((p, i) => {
      const page = g.pages[p.section];
      const props = studio.get().sections[p.section]?.props;
      if (p.firstOfSection && i > 0 && props?.pageNumberStart) number = props.pageNumberStart;
      const box: PageBox = {
        index: i,
        section: p.section,
        top: pageTops[i],
        left: pageLeft(g, page),
        width: px(page.width),
        height: px(page.height),
        margins: { top: px(page.margins.top), right: px(page.margins.right), bottom: px(page.margins.bottom), left: px(page.margins.left), header: px(page.margins.header), footer: px(page.margins.footer) },
        firstOfSection: p.firstOfSection,
        number,
      };
      number++;
      return box;
    });
    const last = pages[pages.length - 1];
    const layout: Layout = { pages, width: g.paperWidth, height: last ? last.top + last.height : 0, overflows: result.overflows.map((o) => ({ block: o.block, page: o.page })), ms: Math.round((performance.now() - t0) * 10) / 10 };
    root.style.minHeight = `${layout.height}px`;
    const prev = studio.get().layout;
    if (!prev || JSON.stringify(prev.pages) !== JSON.stringify(pages) || prev.overflows.length !== layout.overflows.length) studio.set({ layout });
    else if (prev) prev.ms = layout.ms;
    layoutObjects(view, layout, g);
  }
}

/** Line boxes of a text block: text fragments grouped by line, each with the position it starts at. */
function measureLines(view: EditorView, dom: HTMLElement, yOf: (y: number) => number, content: (y: number) => number): Line[] {
  const frags: { top: number; bottom: number; left: number; clientTop: number; clientH: number }[] = [];
  const walker = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => ((n.parentElement?.closest("[contenteditable=false]") && n.parentElement.closest("[contenteditable=false]") !== dom) || !n.textContent ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const range = document.createRange();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (r.height > 0 && r.width > 0) frags.push({ top: content(yOf(r.top)), bottom: content(yOf(r.bottom)), left: r.left, clientTop: r.top, clientH: r.height });
  }
  frags.sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: (Line & { left: number; clientTop: number; clientH: number })[] = [];
  for (const f of frags) {
    const last = lines[lines.length - 1];
    if (last && f.top < last.bottom - Math.min(f.bottom - f.top, last.bottom - last.top) / 2) {
      last.bottom = Math.max(last.bottom, f.bottom);
      if (f.left < last.left) Object.assign(last, { left: f.left, clientTop: f.clientTop, clientH: f.clientH });
    } else lines.push({ top: f.top, bottom: f.bottom, pos: 0, left: f.left, clientTop: f.clientTop, clientH: f.clientH });
  }
  // Positions are only needed for the lines a page break falls on: resolve them lazily
  // (posAtCoords is the expensive part of a pagination pass).
  for (const l of lines) {
    let pos: number | undefined;
    Object.defineProperty(l, "pos", { get: () => (pos ??= view.posAtCoords({ left: l.left + 0.5, top: l.clientTop + l.clientH / 2 })?.pos ?? 0) });
  }
  return lines;
}

function measureRows(view: EditorView, dom: HTMLElement, yOf: (y: number) => number, content: (y: number) => number): Row[] {
  const rows: Row[] = [];
  for (const tr of dom.querySelectorAll<HTMLElement>("tr")) {
    if (tr.dataset.msSpacer || tr.classList.contains("ms-repeat-header")) continue;
    const r = tr.getBoundingClientRect();
    let pos: number;
    try {
      pos = view.posAtDOM(tr, 0) - 1;
    } catch {
      continue;
    }
    rows.push({ top: content(yOf(r.top)), bottom: content(yOf(r.bottom)), pos, header: !!tr.querySelector("th") && !tr.querySelector("td") });
  }
  return rows;
}

/** Place positioned objects: anchored → anchor paragraph; page → its page frame (or margin frame). */
export function layoutObjects(view: EditorView, layout: Layout | null, g = geometry()): void {
  const root = view.dom as HTMLElement;
  const zoom = studio.get().zoom || 1;
  const rootRect = root.getBoundingClientRect();
  const tops: { node: PMNode; pos: number }[] = [];
  view.state.doc.forEach((node, pos) => void tops.push({ node, pos }));
  const sec = sectionIndexes(view.state.doc);
  tops.forEach(({ node, pos }, i) => {
    if (node.type.name !== "msObject") return;
    const dom = view.nodeDOM(pos) as HTMLElement | null;
    const d = objectOf(String(node.attrs.id));
    if (!dom || !d) return;
    let a = i + 1;
    while (a < tops.length && ["msObject", "msSection", "msPageBreak"].includes(tops[a].node.type.name)) a++;
    const anchorDom = tops[a] ? (view.nodeDOM(tops[a].pos) as HTMLElement | null) : null;
    const anchorY = anchorDom ? (anchorDom.getBoundingClientRect().top - rootRect.top) / zoom : (root.scrollHeight || 0);
    const page = g.pages[Math.min(sec[a] ?? sec[i], g.pages.length - 1)];
    let colLeft = layout ? pageLeft(g, page) + px(page.margins.left) : anchorDom ? (anchorDom.getBoundingClientRect().left - rootRect.left) / zoom : 0;
    let x = colLeft + px(d.box.x);
    let y = anchorY + px(d.box.y);
    if (d.placement === "page" && layout) {
      const box = layout.pages.find((p) => anchorY >= p.top && anchorY < p.top + p.height + PAGE_GAP) ?? layout.pages[layout.pages.length - 1];
      if (box) {
        const relPage = d.relativeTo === "page";
        x = box.left + (relPage ? 0 : box.margins.left) + px(d.box.x);
        y = box.top + (relPage ? 0 : box.margins.top) + px(d.box.y);
        colLeft = box.left + box.margins.left;
      }
    }
    dom.style.left = `${x}px`;
    dom.style.top = `${y}px`;
    dom.style.zIndex = d.plane === "behind" ? "-1" : String(2 + (d.z ?? 0));
    dom.dataset.anchorY = String(anchorY);
    dom.dataset.colLeft = String(colLeft);
  });
  window.dispatchEvent(new CustomEvent("ms:objectsLaid"));
}

export const Pagination = Extension.create({
  name: "msPagination",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: paginationKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, set) => tr.getMeta(paginationKey) ?? set.map(tr.mapping, tr.doc),
        },
        props: { decorations: (state) => paginationKey.getState(state) },
        view: (view) => new Paginator(view),
      }),
    ];
  },
});
