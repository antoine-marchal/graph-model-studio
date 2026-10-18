import { create } from 'zustand';
import {
  applyToDocument,
  type CorporateMaster,
  type Diagnostic,
  type DiffBaseKind,
  type ElementStyle,
  type Mutation,
  type ReviewData,
  type SlideDocument,
} from '@corporate-slides/core';
import { post } from './host';

export interface Notice {
  id: number;
  level: 'info' | 'warning' | 'error';
  message: string;
}

export type RibbonTab = 'home' | 'insert' | 'review' | 'view' | 'format';

export interface DiffState {
  base: DiffBaseKind;
  label: string;
  /** Parsed base revision, null when no comparison is loaded. */
  doc: SlideDocument | null;
  available: DiffBaseKind[];
  error?: string;
}

export interface EditorState {
  ready: boolean;
  fileName: string;
  sourceKind: 'markdown' | 'dsl';
  version: number;
  /** Last document confirmed by the host (source of truth). */
  confirmed: SlideDocument | null;
  /** Document displayed: confirmed + optimistic pending edits. */
  doc: SlideDocument | null;
  master: CorporateMaster | null;
  assetUrls: Record<string, string>;
  diagnostics: Diagnostic[];
  parseErrors: string[];
  slideId: string | null;
  selected: string[];
  editingId: string | null;
  zoom: number | 'fit';
  showGrid: boolean;
  snap: boolean;
  notices: Notice[];
  pending: Set<string>;
  reference: { slideIndex: number; url: string | null; message?: string } | null;
  /** Merge request revision: visual edits are disabled. */
  readOnly: boolean;
  review: { mr: string; side: 'old' | 'new' } | null;
  diff: DiffState;
  showDiff: boolean;
  /** Show the base revision of the current slide instead of the working version. */
  showBase: boolean;
  /** Deleted slide (from the base revision) displayed read-only. */
  ghostSlideId: string | null;
  reviewData: ReviewData | null;
  reviewError: string;
  focusThread: string | null;
  tab: RibbonTab;
  ribbonCollapsed: boolean;
  notesOpen: boolean;
  pane: 'format' | 'comments';
  gmcDialog: boolean;
  /** Zoom factor of the "fit" setting, published by the canvas. */
  fitZoom: number;
  /** Connector drawing mode: null = off, '' = pick the source element, id = pick the target. */
  connectFrom: string | null;
  /** Diagram source (.gmc) open in the inline Graph Model Studio editor. */
  gmcEdit: string | null;
  /** Format painter armed with this style: applied to the next element selected. */
  painter: ElementStyle | null;

  setDocument(p: { version: number; fileName: string; sourceKind: 'markdown' | 'dsl'; doc: SlideDocument; master: CorporateMaster | null; assetUrls: Record<string, string>; diagnostics: Diagnostic[]; parseErrors: string[]; readOnly: boolean; review: EditorState['review'] }): void;
  mutate(mutations: Mutation[]): void;
  /** Local-only geometry preview during drags (not sent to the host). */
  preview(mutations: Mutation[]): void;
  cancelPreview(): void;
  ack(txId: string, version: number): void;
  reject(txId: string, reason: string): void;
  select(slideId: string | null, ids?: string[], additive?: boolean): void;
  setEditing(id: string | null): void;
  setZoom(z: number | 'fit'): void;
  toggleGrid(): void;
  toggleSnap(): void;
  notify(level: Notice['level'], message: string): void;
  dismiss(id: number): void;
  setReference(r: EditorState['reference']): void;
  set(p: Partial<Pick<EditorState, 'diff' | 'showDiff' | 'showBase' | 'ghostSlideId' | 'reviewData' | 'reviewError' | 'focusThread' | 'tab' | 'ribbonCollapsed' | 'notesOpen' | 'pane' | 'gmcDialog' | 'fitZoom' | 'connectFrom' | 'gmcEdit' | 'painter'>>): void;
}

let txCounter = 0;
let noticeCounter = 0;

export const useEditor = create<EditorState>((set, get) => ({
  ready: false,
  fileName: '',
  sourceKind: 'markdown',
  version: 0,
  confirmed: null,
  doc: null,
  master: null,
  assetUrls: {},
  diagnostics: [],
  parseErrors: [],
  slideId: null,
  selected: [],
  editingId: null,
  zoom: 'fit',
  showGrid: false,
  snap: true,
  notices: [],
  pending: new Set(),
  reference: null,
  readOnly: false,
  review: null,
  diff: { base: 'none', label: '', doc: null, available: [] },
  showDiff: false,
  showBase: false,
  ghostSlideId: null,
  reviewData: null,
  reviewError: '',
  focusThread: null,
  tab: 'home',
  ribbonCollapsed: false,
  notesOpen: true,
  pane: 'format',
  gmcDialog: false,
  fitZoom: 1,
  connectFrom: null,
  gmcEdit: null,
  painter: null,

  set(p) {
    set(p);
  },

  setDocument(p) {
    const s = get();
    const slideId = p.doc.slides.some((x) => x.id === s.slideId) ? s.slideId : (p.doc.slides[0]?.id ?? null);
    const slide = p.doc.slides.find((x) => x.id === slideId);
    const selected = s.selected.filter((id) => slide?.elements.some((e) => e.id === id));
    set({ ready: true, ...p, confirmed: p.doc, doc: p.doc, slideId, selected, pending: new Set() });
  },

  mutate(mutations) {
    const { doc, version, readOnly } = get();
    if (!doc || !mutations.length) return;
    if (readOnly) return get().notify('info', 'Révision de merge request : la présentation est en lecture seule.');
    let next: SlideDocument;
    try {
      next = applyToDocument(doc, mutations);
    } catch (e) {
      get().notify('error', (e as Error).message);
      return;
    }
    const id = `tx-${Date.now().toString(36)}-${++txCounter}`;
    set((s) => ({ doc: next, pending: new Set(s.pending).add(id) }));
    post({ type: 'mutate', tx: { id, baseVersion: version, mutations } });
  },

  preview(mutations) {
    const base = get().confirmed;
    if (!base) return;
    try {
      set({ doc: applyToDocument(base, mutations) });
    } catch {
      /* ignore invalid previews */
    }
  },
  cancelPreview() {
    set((s) => ({ doc: s.confirmed }));
  },

  ack(txId, version) {
    set((s) => {
      const pending = new Set(s.pending);
      pending.delete(txId);
      return { pending, version: Math.max(s.version, version) };
    });
  },
  reject(txId, reason) {
    set((s) => {
      const pending = new Set(s.pending);
      pending.delete(txId);
      return { pending, doc: s.confirmed };
    });
    get().notify('error', reason);
  },

  select(slideId, ids = [], additive = false) {
    set((s) => {
      if (slideId !== s.slideId || s.ghostSlideId) return { slideId, selected: ids, editingId: null, ghostSlideId: null, connectFrom: null };
      if (!additive) return { selected: ids, editingId: s.editingId && ids.includes(s.editingId) ? s.editingId : null };
      const sel = new Set(s.selected);
      for (const id of ids) sel.has(id) ? sel.delete(id) : sel.add(id);
      return { selected: [...sel], editingId: null };
    });
  },
  setEditing(editingId) {
    set({ editingId: get().readOnly || get().showBase ? null : editingId });
  },
  setZoom(zoom) {
    set({ zoom });
  },
  toggleGrid() {
    set((s) => ({ showGrid: !s.showGrid }));
  },
  toggleSnap() {
    set((s) => ({ snap: !s.snap }));
  },
  notify(level, message) {
    const id = ++noticeCounter;
    set((s) => ({ notices: [...s.notices.slice(-3), { id, level, message }] }));
    if (level !== 'error') setTimeout(() => get().dismiss(id), 5000);
  },
  dismiss(id) {
    set((s) => ({ notices: s.notices.filter((n) => n.id !== id) }));
  },
  setReference(reference) {
    set({ reference });
  },
}));

export const currentSlide = (s: EditorState) => s.doc?.slides.find((x) => x.id === s.slideId) ?? null;
