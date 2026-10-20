import { explicitStyle, resolveSlide, round4, tr, uniqueId, type CellStyle, type ElementStyle, type Mutation, type SlideElement } from '@corporate-slides/core';
import { post } from './host';
import { currentSlide, useEditor } from './store';
import { freshGroups } from './Format';

/*
 * Clipboard: copy / cut / paste of slide elements (between slides and decks), plus paste of
 * plain text (text box), images (saved next to the deck by the host) and spreadsheet ranges
 * (Excel / Sheets copy as HTML or TSV → native table, keeping cell fill, bold and text color).
 * Excel also puts a picture of the range on the clipboard: the table always wins over it. The format painter copies an element
 * style and applies it to the next element selected (or with Ctrl+Shift+C / Ctrl+Shift+V).
 */

const MIME = 'application/x-corporate-slides+json';

interface Clip {
  slideId: string;
  elements: SlideElement[];
  text: string;
  pastes: number;
}
/** Last copy: the system clipboard may drop the custom MIME type (VS Code webviews do on some hosts). */
let last: Clip | null = null;

const editableTarget = (t: EventTarget | null) => t instanceof HTMLElement && !!t.closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]');
/** Clipboard events belong to the canvas only when no text field or inline editor has focus. */
const ours = (e: Event) => !useEditor.getState().editingId && !editableTarget(e.target) && !editableTarget(document.activeElement);

function plainText(el: SlideElement): string {
  if (el.type === 'table') return el.rows.map((r) => r.join('\t')).join('\n');
  if ('paragraphs' in el && el.paragraphs) return el.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n');
  if ('content' in el && typeof el.content === 'string') return el.content;
  return '';
}

/** The selected elements with explicit geometry; connectors only when both ends are copied. */
function selection(): Clip | null {
  const st = useEditor.getState();
  const slide = currentSlide(st);
  if (!slide || !st.master || !st.selected.length) return null;
  const resolved = new Map(resolveSlide(slide, st.master).elements.map((r) => [r.element.id, r]));
  const ids = new Set(st.selected);
  const elements = slide.elements
    .filter((e) => ids.has(e.id) && (e.type !== 'connector' || (ids.has(e.from) && ids.has(e.to))))
    .map((e) => {
      const { source: _s, z: _z, shared: _sh, ...rest } = e as SlideElement & { source?: unknown; shared?: boolean };
      const r = resolved.get(e.id);
      if (e.type === 'connector' || !r) return rest as SlideElement;
      const placed = { ...rest, x: r.box.x, y: r.box.y, w: r.box.w, h: r.box.h } as SlideElement;
      // A copied placeholder stays a placeholder and keeps the look it inherited, whatever the target layout.
      return (r.placeholder ? { ...placed, style: explicitStyle(r) } : placed) as SlideElement;
    });
  // Elements without text still need a recognisable clipboard text (the host may only relay text).
  const text = elements.map(plainText).filter(Boolean).join('\n') || `[Corporate Slides : ${elements.length} ${elements.length > 1 ? tr('éléments', 'elements') : tr('élément', 'element')}]`;
  return elements.length ? { slideId: slide.id, elements, text, pastes: 0 } : null;
}


function writeClip(clip: Clip, data: DataTransfer | null) {
  last = clip;
  data?.setData(MIME, JSON.stringify({ elements: clip.elements, slideId: clip.slideId }));
  data?.setData('text/plain', clip.text);
}

function cutSelection() {
  const st = useEditor.getState();
  const slide = currentSlide(st);
  if (!slide) return;
  const gone = new Set(st.selected);
  for (const e of slide.elements) if (e.type === 'connector' && (gone.has(e.from) || gone.has(e.to))) gone.add(e.id);
  st.mutate([...gone].map((elementId) => ({ kind: 'deleteElement' as const, slideId: slide.id, elementId })));
  st.select(slide.id, []);
}

/* ------------------------------ paste ------------------------------ */

function pasteElements(elements: SlideElement[], fromSlide: string, clip?: Clip) {
  const st = useEditor.getState();
  const slide = currentSlide(st);
  if (!slide || st.readOnly) return;
  const taken = slide.elements.map((e) => e.id);
  const remap = new Map<string, string>();
  for (const e of elements) {
    const id = uniqueId(e.type, [...taken, ...remap.values()]);
    remap.set(e.id, id);
  }
  // Same slide: each paste steps down-right so copies do not stack invisibly. Another slide: exact source position.
  const n = fromSlide !== slide.id ? 0 : clip ? ++clip.pastes : 1;
  const d = 0.2 * n;
  const regroup = freshGroups(slide);
  const ms: Mutation[] = elements.map((e) => {
    const el = { ...e, id: remap.get(e.id)! } as SlideElement & { x?: number; y?: number };
    el.group = regroup(e.group);
    if (!el.group) delete el.group;
    if (el.type === 'connector') return { kind: 'addElement', slideId: slide.id, element: { ...el, from: remap.get(el.from) ?? el.from, to: remap.get(el.to) ?? el.to } };
    if (el.x !== undefined) el.x = round4(el.x + d);
    if (el.y !== undefined) el.y = round4(el.y + d);
    return { kind: 'addElement', slideId: slide.id, element: el };
  });
  st.mutate(ms);
  st.select(slide.id, [...remap.values()]);
}

function centered(w: number, h: number) {
  const m = useEditor.getState().master;
  const W = m?.dimensions.width ?? 13.33, H = m?.dimensions.height ?? 7.5;
  return { x: round4((W - w) / 2), y: round4((H - h) / 2), w, h };
}

function addNew(el: Omit<SlideElement, 'id'>) {
  pasteElements([{ ...el, id: el.type } as SlideElement], '');
}

/** CSS color (`#RGB`, `#RRGGBB`, `rgb()`, `windowtext`…) → `#RRGGBB`, or null for transparent / unknown. */
function cssHex(v: string | undefined | null): string | null {
  const s = (v ?? '').trim().toLowerCase();
  if (!s || s === 'transparent' || s === 'none' || s === 'inherit') return null;
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return `#${[...m[1]!].map((c) => c + c).join('')}`.toUpperCase();
  m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) return `#${m[1]}`.toUpperCase();
  const rgb = /^rgba?\((\d+)\D+(\d+)\D+(\d+)(?:\D+([\d.]+))?/.exec(s);
  if (rgb && (rgb[4] === undefined || Number(rgb[4]) > 0)) return `#${[rgb[1], rgb[2], rgb[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  return s === 'white' ? '#FFFFFF' : s === 'black' || s === 'windowtext' ? '#000000' : null;
}

/** Declarations of a CSS block / inline style, lower-cased keys. */
const decls = (css: string) => Object.fromEntries(css.split(';').map((d) => d.split(':')).filter((p) => p.length >= 2).map(([k, ...v]) => [k!.trim().toLowerCase(), v.join(':').trim()]));

/** First table in clipboard HTML (Excel, Sheets, Word, web pages): texts and cell look (fill, bold, color). */
export function htmlTableGrid(html: string): { rows: string[][]; styles: (CellStyle | null)[][] } | null {
  const dom = new DOMParser().parseFromString(html, 'text/html');
  const table = dom.querySelector('table');
  if (!table) return null;
  // Excel styles cells through classes (`.xl65 { background:#FFC000; }`) in a <style> block.
  const classes = new Map<string, Record<string, string>>();
  for (const st of dom.querySelectorAll('style')) for (const m of (st.textContent ?? '').matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)) classes.set(m[1]!, decls(m[2]!));
  const rows: string[][] = [];
  const styles: (CellStyle | null)[][] = [];
  for (const row of table.querySelectorAll('tr')) {
    const cells = [...row.querySelectorAll('th, td')];
    rows.push(cells.map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim()));
    styles.push(cells.map((c) => {
      const d = { ...Object.assign({}, ...[...c.classList].map((k) => classes.get(k) ?? {})), ...decls(c.getAttribute('style') ?? '') } as Record<string, string>;
      const fill = cssHex(c.getAttribute('bgcolor')) ?? cssHex(d['background-color'] ?? d.background?.split(/\s+/)[0]);
      const color = cssHex(d.color);
      const bold = c.tagName === 'TH' || /^(bold|[6-9]00)$/.test(d['font-weight'] ?? '') || !!c.querySelector('b, strong');
      const s: CellStyle = {};
      if (fill && fill !== '#FFFFFF') s.fill = fill as CellStyle['fill'];
      if (color && color !== '#000000') s.color = color as CellStyle['color'];
      if (bold) s.bold = true;
      return Object.keys(s).length ? s : null;
    }));
  }
  return rows.some((r) => r.length) ? { rows, styles } : null;
}

/** Rows of the first table in clipboard HTML. */
export const htmlTableRows = (html: string): string[][] | null => htmlTableGrid(html)?.rows ?? null;

/** Tab-separated grid (spreadsheet copy as text), or null for ordinary text. */
export function tsvRows(text: string): string[][] | null {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
  return lines.some((l) => l.includes('\t')) ? lines.map((l) => l.split('\t').map((c) => c.trim())) : null;
}

function pasteTable(rows: string[][], styles?: (CellStyle | null)[][]) {
  const width = Math.max(...rows.map((r) => r.length));
  const grid = rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
  const cellStyles = styles?.some((r) => r.some(Boolean)) ? grid.map((r, ri) => r.map((_, ci) => styles[ri]?.[ci] ?? null)) : undefined;
  // A styled first row is the sheet's own header: keep its look instead of the corporate header band.
  const header = !cellStyles?.[0]?.some(Boolean);
  addNew({ type: 'table', header, rows: grid, ...(cellStyles ? { cellStyles } : {}), ...centered(round4(Math.min(11, Math.max(4, width * 1.8))), round4(Math.min(6, grid.length * 0.4))) } as never);
}

function pasteText(text: string) {
  const t = text.replace(/\r\n?/g, '\n').trim();
  if (!t) return;
  const rows = tsvRows(t);
  if (rows) return pasteTable(rows);
  const lines = t.split('\n');
  addNew({ type: 'text', paragraphs: lines.map((l) => ({ runs: [{ text: l }] })), ...centered(6, round4(Math.min(5, 0.5 + lines.length * 0.35))) } as never);
}

function pasteImage(blob: Blob) {
  const st = useEditor.getState();
  const slide = currentSlide(st);
  if (!slide) return;
  const mime = (['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'] as const).find((t) => t === blob.type);
  if (!mime) return st.notify('warning', `${tr('Format d’image non pris en charge', 'Unsupported image format')} : ${blob.type}`);
  const reader = new FileReader();
  reader.onload = () => post({ type: 'pasteImage', slideId: slide.id, mime, data: String(reader.result).replace(/^data:[^,]*,/, '') });
  reader.readAsDataURL(blob);
}

/** Clipboard HTML written by PowerPoint (shapes, text boxes, tables copied from a slide). */
const fromPowerPoint = (html: string) => /PowerPoint\.Slide|schemas-microsoft-com:office:powerpoint/i.test(html);

/** What the clipboard held when a PowerPoint paste was handed to the host (used if it falls back). */
let pendingPowerPoint: { html: string; text: string; image: Blob | null } | null = null;

/** Host answer to `pastePowerPoint`: native elements, keeping their slide position. */
export function pastePowerPointElements(elements: SlideElement[], warnings: string[]) {
  pendingPowerPoint = null;
  pasteElements(elements, '');
  if (warnings.length) useEditor.getState().notify('warning', `${tr('Collage PowerPoint', 'PowerPoint paste')} : ${warnings[0]}${warnings.length > 1 ? ` (+${warnings.length - 1})` : ''}`);
}

/** Host could not read PowerPoint's drawing: paste the HTML / picture / text instead. */
export function pastePowerPointFallback() {
  const p = pendingPowerPoint;
  pendingPowerPoint = null;
  if (!p) return;
  const grid = htmlTableGrid(p.html);
  if (grid) return pasteTable(grid.rows, grid.styles);
  if (p.image) return pasteImage(p.image);
  pasteText(p.text);
}

function handOverToHost(html: string, text: string, image: Blob | null) {
  const slide = currentSlide(useEditor.getState());
  if (!slide) return;
  pendingPowerPoint = { html, text, image };
  post({ type: 'pastePowerPoint', slideId: slide.id });
}

/** Paste from a DataTransfer (Ctrl+V) — richest first: our elements, PowerPoint objects, table, image, text. */
function pasteData(data: DataTransfer) {
  const own = data.getData(MIME);
  if (own) {
    const p = JSON.parse(own) as { elements: SlideElement[]; slideId: string };
    return pasteElements(p.elements, p.slideId, last && JSON.stringify(last.elements) === JSON.stringify(p.elements) ? last : undefined);
  }
  const text = data.getData('text/plain');
  if (last && text && text === last.text) return pasteElements(last.elements, last.slideId, last);
  const html = data.getData('text/html');
  if (fromPowerPoint(html)) return handOverToHost(html, text, [...data.items].find((i) => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile() ?? null);
  // Spreadsheets copy HTML + TSV + a picture of the range: the table comes first.
  const grid = htmlTableGrid(data.getData('text/html'));
  if (grid) return pasteTable(grid.rows, grid.styles);
  const rows = tsvRows(text);
  if (rows) return pasteTable(rows);
  const image = [...data.items].find((i) => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile();
  if (image) return pasteImage(image);
  pasteText(text);
}

/** Ribbon "Coller": the async clipboard API when the webview allows it, else the host's clipboard text. */
export async function pasteFromRibbon() {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      if (item.types.includes('text/html')) {
        const html = await (await item.getType('text/html')).text();
        if (fromPowerPoint(html)) {
          const img = item.types.find((t) => t.startsWith('image/'));
          return handOverToHost(html, item.types.includes('text/plain') ? await (await item.getType('text/plain')).text() : '', img ? await item.getType(img) : null);
        }
        const grid = htmlTableGrid(html);
        if (grid) return pasteTable(grid.rows, grid.styles);
      }
      if (item.types.includes('text/plain')) {
        const rows = tsvRows(await (await item.getType('text/plain')).text());
        if (rows) return pasteTable(rows);
      }
    }
    for (const item of items) {
      const img = item.types.find((t) => t.startsWith('image/'));
      if (img) return pasteImage(await item.getType(img));
    }
    const text = await navigator.clipboard.readText();
    pasteHostText(text);
  } catch {
    post({ type: 'readClipboard' });
  }
}

/** Text read by the host (`vscode.env.clipboard`), or by the ribbon. */
export function pasteHostText(text: string) {
  // Unreadable or empty system clipboard: fall back to the last copy made here.
  if (last && (!text || text === last.text)) return pasteElements(last.elements, last.slideId, last);
  pasteText(text);
}

/** Ribbon "Copier" / "Couper": run the native command so the system clipboard gets the elements too. */
export function copyFromRibbon(cut: boolean) {
  const clip = selection();
  if (!clip) return;
  let fired = false;
  const once = (e: ClipboardEvent) => {
    fired = true;
    e.preventDefault();
    writeClip(clip, e.clipboardData);
  };
  document.addEventListener('copy', once, { once: true, capture: true });
  document.execCommand('copy');
  document.removeEventListener('copy', once, { capture: true });
  if (!fired) {
    last = clip;
    void navigator.clipboard?.writeText(clip.text).catch(() => undefined);
  }
  if (cut) cutSelection();
}

/* ------------------------------ format painter ------------------------------ */

/** Style of the single selected element, for the format painter. */
export function copyStyle(): ElementStyle | null {
  const st = useEditor.getState();
  const el = currentSlide(st)?.elements.find((e) => e.id === st.selected[0]);
  return el ? { ...(el.style ?? {}) } : null;
}

/** Replace the style of the selected elements (keys absent from `style` are removed). */
export function applyStyle(style: ElementStyle, ids = useEditor.getState().selected) {
  const st = useEditor.getState();
  const slide = currentSlide(st);
  if (!slide || st.readOnly) return;
  const ms = slide.elements
    .filter((e) => ids.includes(e.id))
    .map((e) => ({ kind: 'updateElement' as const, slideId: slide.id, elementId: e.id, patch: { style: { ...Object.fromEntries(Object.keys(e.style ?? {}).map((k) => [k, null])), ...style } } }));
  if (ms.length) st.mutate(ms);
}

/* ------------------------------ wiring ------------------------------ */

/** Document-level clipboard listeners and the painter hook; returns the cleanup. */
export function installClipboard(): () => void {
  const onCopy = (e: ClipboardEvent) => {
    if (!ours(e)) return;
    const clip = selection();
    if (!clip) return;
    e.preventDefault();
    writeClip(clip, e.clipboardData);
    if (e.type === 'cut' && !useEditor.getState().readOnly) cutSelection();
  };
  const onPaste = (e: ClipboardEvent) => {
    if (!ours(e) || !e.clipboardData || useEditor.getState().readOnly) return;
    e.preventDefault();
    pasteData(e.clipboardData);
  };
  const onKey = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || !ours(e)) return;
    const k = e.key.toLowerCase();
    if (k === 'c') {
      e.preventDefault();
      const s = copyStyle();
      if (s) useEditor.getState().notify('info', tr('Mise en forme copiée : Ctrl+Maj+V pour l’appliquer.', 'Formatting copied: Ctrl+Shift+V to apply it.'));
      painterStyle = s;
    } else if (k === 'v' && painterStyle) {
      e.preventDefault();
      applyStyle(painterStyle);
    }
  };
  // Format painter armed: the next element selected receives the style.
  const unsub = useEditor.subscribe((s, prev) => {
    if (!s.painter || s.selected === prev.selected || !s.selected.length) return;
    const style = s.painter;
    s.set({ painter: null });
    applyStyle(style, s.selected);
  });
  document.addEventListener('copy', onCopy);
  document.addEventListener('cut', onCopy);
  document.addEventListener('paste', onPaste);
  window.addEventListener('keydown', onKey);
  return () => {
    unsub();
    document.removeEventListener('copy', onCopy);
    document.removeEventListener('cut', onCopy);
    document.removeEventListener('paste', onPaste);
    window.removeEventListener('keydown', onKey);
  };
}

/** Style held by Ctrl+Shift+C. */
let painterStyle: ElementStyle | null = null;

/** Context menu "Copy formatting": same slot as Ctrl+Shift+C. */
export function copyFormat(): boolean {
  painterStyle = copyStyle();
  return !!painterStyle;
}

/** Context menu "Paste formatting": same as Ctrl+Shift+V. */
export function pasteFormat(): void {
  if (painterStyle) applyStyle(painterStyle);
}

export const hasCopiedFormat = (): boolean => !!painterStyle;
