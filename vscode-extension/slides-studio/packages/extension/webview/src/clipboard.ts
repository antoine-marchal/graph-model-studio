import { resolveSlide, round4, uniqueId, type ElementStyle, type Mutation, type SlideElement } from '@corporate-slides/core';
import { post } from './host';
import { currentSlide, useEditor } from './store';

/*
 * Clipboard: copy / cut / paste of slide elements (between slides and decks), plus paste of
 * plain text (text box), images (saved next to the deck by the host) and spreadsheet ranges
 * (Excel / Sheets copy as HTML or TSV → native table). The format painter copies an element
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
  const boxes = new Map(resolveSlide(slide, st.master).elements.map((r) => [r.element.id, r.box]));
  const ids = new Set(st.selected);
  const elements = slide.elements
    .filter((e) => ids.has(e.id) && (e.type !== 'connector' || (ids.has(e.from) && ids.has(e.to))))
    .map((e) => {
      const { source: _s, z: _z, ...rest } = e as SlideElement & { source?: unknown };
      const b = boxes.get(e.id);
      return (e.type === 'connector' || !b ? rest : { ...rest, x: b.x, y: b.y, w: b.w, h: b.h }) as SlideElement;
    });
  // Elements without text still need a recognisable clipboard text (the host may only relay text).
  const text = elements.map(plainText).filter(Boolean).join('\n') || `[Corporate Slides : ${elements.length} élément${elements.length > 1 ? 's' : ''}]`;
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
  // Same slide: each paste steps down-right so copies do not stack invisibly.
  const n = clip ? ++clip.pastes - (fromSlide === slide.id ? 0 : 1) : fromSlide === slide.id ? 1 : 0;
  const d = 0.2 * n;
  const ms: Mutation[] = elements.map((e) => {
    const el = { ...e, id: remap.get(e.id)! } as SlideElement & { x?: number; y?: number };
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

/** Rows of the first table in clipboard HTML (Excel, Sheets, Word, web pages). */
export function htmlTableRows(html: string): string[][] | null {
  const table = new DOMParser().parseFromString(html, 'text/html').querySelector('table');
  if (!table) return null;
  const rows = [...table.querySelectorAll('tr')].map((tr) => [...tr.querySelectorAll('th, td')].map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim()));
  return rows.some((r) => r.length) ? rows : null;
}

/** Tab-separated grid (spreadsheet copy as text), or null for ordinary text. */
export function tsvRows(text: string): string[][] | null {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
  return lines.some((l) => l.includes('\t')) ? lines.map((l) => l.split('\t').map((c) => c.trim())) : null;
}

function pasteTable(rows: string[][]) {
  const width = Math.max(...rows.map((r) => r.length));
  const grid = rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
  addNew({ type: 'table', header: true, rows: grid, ...centered(round4(Math.min(11, Math.max(4, width * 1.8))), round4(Math.min(6, grid.length * 0.4))) } as never);
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
  if (!mime) return st.notify('warning', `Format d’image non pris en charge : ${blob.type}`);
  const reader = new FileReader();
  reader.onload = () => post({ type: 'pasteImage', slideId: slide.id, mime, data: String(reader.result).replace(/^data:[^,]*,/, '') });
  reader.readAsDataURL(blob);
}

/** Paste from a DataTransfer (Ctrl+V) — richest first: our elements, image, table, text. */
function pasteData(data: DataTransfer) {
  const own = data.getData(MIME);
  if (own) {
    const p = JSON.parse(own) as { elements: SlideElement[]; slideId: string };
    return pasteElements(p.elements, p.slideId, last && JSON.stringify(last.elements) === JSON.stringify(p.elements) ? last : undefined);
  }
  const text = data.getData('text/plain');
  if (last && text && text === last.text) return pasteElements(last.elements, last.slideId, last);
  const image = [...data.items].find((i) => i.kind === 'file' && i.type.startsWith('image/'))?.getAsFile();
  if (image) return pasteImage(image);
  const rows = htmlTableRows(data.getData('text/html'));
  if (rows) return pasteTable(rows);
  pasteText(text);
}

/** Ribbon "Coller": the async clipboard API when the webview allows it, else the host's clipboard text. */
export async function pasteFromRibbon() {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const img = item.types.find((t) => t.startsWith('image/'));
      if (img) return pasteImage(await item.getType(img));
    }
    for (const item of items) {
      if (item.types.includes('text/html')) {
        const rows = htmlTableRows(await (await item.getType('text/html')).text());
        if (rows) return pasteTable(rows);
      }
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
      if (s) useEditor.getState().notify('info', 'Mise en forme copiée : Ctrl+Maj+V pour l’appliquer.');
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
