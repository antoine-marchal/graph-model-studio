import { create } from 'zustand';
import {
  applyToDocument,
  designToLayout,
  DESIGN_SLIDE_ID,
  findLayout,
  layoutToDesign,
  type CorporateMaster,
  type LayoutDef,
  type LayoutDesign,
  type Diagnostic,
  type DiffBaseKind,
  type ElementStyle,
  type Mutation,
  type ReviewData,
  type SlideDocument,
  tr
} from '@corporate-slides/core';
import { post } from './host';

export interface Notice {
  id: number;
  level: 'info' | 'warning' | 'error';
  message: string;
}

export type RibbonTab = 'home' | 'insert' | 'design' | 'slideshow' | 'review' | 'view' | 'format';

export interface DiffState {
  base: DiffBaseKind;
  label: string;
  /** Parsed base revision, null when no comparison is loaded. */
  doc: SlideDocument | null;
  available: DiffBaseKind[];
  error?: string;
}

/** Layout designer session: the layout is edited as the virtual slide `doc.slides[0]`. */
export interface DesignSession {
  layoutId: string;
  /** Layout as last saved, and where its objects went in the virtual slide. */
  base: LayoutDef;
  origin: LayoutDesign['origin'];
  /** Layout the virtual slide is drawn on (background, non-editable objects, placeholder styles). */
  canvasLayout: LayoutDef;
  /** The presentation as the host keeps sending it, restored on exit. */
  real: { doc: SlideDocument; master: CorporateMaster; slideId: string | null };
  undo: SlideDocument[];
  redo: SlideDocument[];
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
  /** Right-click menu at a viewport position, on the selection or on the slide itself. */
  contextMenu: { x: number; y: number; target: 'element' | 'slide' | 'text' } | null;
  /** View › Hidden objects: hidden elements drawn ghosted and selectable. */
  showHidden: boolean;
  /** Slide show running (started on this slide). */
  presenting: { slideId: string } | null;
  /** Master editing mode: layout objects editable for this slide only, or for every slide. */
  masterEdit: 'slide' | 'all' | null;
  /** Selected layout object (index in the slide's layout objects) in master editing mode. */
  masterSel: number | null;
  design: DesignSession | null;

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
  /** Open the layout designer on a layout (default: the current slide's). */
  enterDesign(layoutId?: string): void;
  exitDesign(): void;
  designUndo(redo?: boolean): void;
  set(p: Partial<Pick<EditorState, 'diff' | 'showDiff' | 'showBase' | 'ghostSlideId' | 'reviewData' | 'reviewError' | 'focusThread' | 'tab' | 'ribbonCollapsed' | 'notesOpen' | 'pane' | 'gmcDialog' | 'fitZoom' | 'connectFrom' | 'gmcEdit' | 'painter' | 'contextMenu' | 'showHidden' | 'presenting' | 'masterEdit' | 'masterSel'>>): void;
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
  contextMenu: null,
  showHidden: false,
  presenting: null,
  masterEdit: null,
  masterSel: null,
  design: null,

  set(p) {
    set(p);
  },

  setDocument(p) {
    const s = get();
    const d = s.design;
    if (d && p.master) {
      // The designed layout stays on screen; the rest (assets, other layouts) follows the host.
      set({ ready: true, ...p, doc: s.doc, confirmed: s.confirmed, master: designMaster(p.master, d.canvasLayout), slideId: s.slideId, pending: new Set(), design: { ...d, real: { doc: p.doc, master: p.master, slideId: d.real.slideId } } });
      return;
    }
    const slideId = p.doc.slides.some((x) => x.id === s.slideId) ? s.slideId : (p.doc.slides[0]?.id ?? null);
    const slide = p.doc.slides.find((x) => x.id === slideId);
    const selected = s.selected.filter((id) => slide?.elements.some((e) => e.id === id));
    set({ ready: true, ...p, confirmed: p.doc, doc: p.doc, slideId, selected, pending: new Set() });
  },

  mutate(mutations) {
    const { doc, version, readOnly } = get();
    if (!doc || !mutations.length) return;
    if (readOnly) return get().notify('info', tr('Révision de merge request : la présentation est en lecture seule.', 'Merge request revision: the presentation is read-only.'));
    if (get().design) return designApply(get, set, mutations);
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

  enterDesign(layoutId) {
    if (get().design) get().exitDesign();
    const s = get();
    const slide = currentSlide(s);
    const base = !s.master ? undefined : layoutId ? s.master.layouts.find((l) => l.id === layoutId) : slide ? findLayout(s.master, slide.layout) : undefined;
    if (!s.doc || !s.master || !base) return;
    const d = layoutToDesign(base);
    const doc = { ...s.doc, slides: [d.slide] };
    set({
      design: { layoutId: base.id, base, origin: d.origin, canvasLayout: d.layout, real: { doc: s.doc, master: s.master, slideId: s.slideId }, undo: [], redo: [] },
      doc,
      confirmed: doc,
      master: designMaster(s.master, d.layout),
      slideId: DESIGN_SLIDE_ID,
      selected: [],
      editingId: null,
      masterEdit: 'all',
      masterSel: null,
      connectFrom: null,
    });
  },
  exitDesign() {
    const d = get().design;
    if (!d) return;
    set({ design: null, doc: d.real.doc, confirmed: d.real.doc, master: d.real.master, slideId: d.real.slideId, selected: [], editingId: null, masterEdit: null, masterSel: null });
  },
  designUndo(redo = false) {
    const d = get().design;
    const doc = get().doc;
    const prev = (redo ? d?.redo : d?.undo)?.at(-1);
    if (!d || !doc || !prev) return;
    const undo = redo ? [...d.undo, doc] : d.undo.slice(0, -1);
    const redoStack = redo ? d.redo.slice(0, -1) : [...d.redo, doc];
    set({ doc: prev, confirmed: prev, design: { ...d, undo, redo: redoStack }, editingId: null });
    saveDesign(get, set);
  },

  select(slideId, ids = [], additive = false) {
    // Picking one element of a group picks the whole group.
    const els = get().doc?.slides.find((x) => x.id === slideId)?.elements ?? [];
    const groups = new Set(ids.map((id) => els.find((e) => e.id === id)?.group).filter(Boolean));
    if (groups.size) ids = [...new Set([...ids, ...els.filter((e) => e.group && groups.has(e.group)).map((e) => e.id)])];
    set((s) => {
      if (slideId !== s.slideId || s.ghostSlideId) return { slideId, selected: ids, editingId: null, ghostSlideId: null, connectFrom: null, masterSel: null };
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

/** The master as the designer draws it: the designed layout reduced to what is not an element. */
function designMaster(master: CorporateMaster, canvasLayout: LayoutDef): CorporateMaster {
  return { ...master, layouts: master.layouts.map((l) => (l.id === canvasLayout.id ? canvasLayout : l)) };
}

type Get = () => EditorState;
type Put = (p: Partial<EditorState>) => void;

function designApply(get: Get, set: Put, mutations: Mutation[]) {
  const { doc, design } = get();
  let next: SlideDocument;
  try {
    next = applyToDocument(doc!, mutations);
  } catch (e) {
    get().notify('error', (e as Error).message);
    return;
  }
  // A renamed element keeps its link to the layout object it stands for.
  const origin = { ...design!.origin };
  for (const m of mutations) if (m.kind === 'renameElement' && origin[m.elementId]) (origin[m.newId] = origin[m.elementId]!), delete origin[m.elementId];
  set({ doc: next, confirmed: next, design: { ...design!, origin, undo: [...design!.undo.slice(-99), doc!], redo: [] } });
  saveDesign(get, set);
}

/** Change the designed layout itself (background…), then save it. */
export function updateDesignLayout(patch: Partial<Pick<LayoutDef, 'background' | 'name'>>) {
  const { design, master } = useEditor.getState();
  if (!design || !master) return;
  const canvasLayout = { ...design.canvasLayout, ...patch };
  useEditor.setState({ design: { ...design, base: { ...design.base, ...patch }, canvasLayout }, master: designMaster(master, canvasLayout) });
  saveDesign(useEditor.getState, useEditor.setState);
}

/** Write the designed layout to the corporate master (the host re-pushes every deck using it). */
function saveDesign(get: Get, set: Put) {
  const { doc, design } = get();
  const slide = doc?.slides[0];
  if (!design || !slide) return;
  const { layout, indexMap, origin } = designToLayout(design.base, { slide, origin: design.origin }, design.real.master);
  set({ design: { ...design, base: layout, origin } });
  post({ type: 'saveLayout', layout, indexMap });
}

export const currentSlide = (s: EditorState) => s.doc?.slides.find((x) => x.id === s.slideId) ?? null;
