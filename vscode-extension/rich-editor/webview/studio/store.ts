/**
 * Studio state shared by the shell, the pagination plugin and object views: document meta
 * (frontmatter `markdownStudio`), masters, resolved sections / styles, derived page layout,
 * object selection and view options. Plain external store (useSyncExternalStore) — the
 * ProseMirror document stays in the editor; derived layout is never persisted.
 */
import { useSyncExternalStore } from "react";
import type { MasterDef, ObjectDescriptor, StudioMeta } from "../../document/schema";
import { resolveSections, type ResolvedSection } from "../../document/masters";
import type { ExportReport } from "../../src/docx/compile";

export interface MasterEntry {
  id: string;
  name: string;
  description?: string;
  basedOn?: string;
  source: "starter" | "docx" | "user";
  readonly: boolean;
  errors?: string[];
}

export interface PageBox {
  index: number;
  section: number;
  /** DOM px inside the paper (zoom 1). */
  top: number;
  left: number;
  width: number;
  height: number;
  margins: { top: number; right: number; bottom: number; left: number; header: number; footer: number };
  firstOfSection: boolean;
  number: number;
}

export interface Layout {
  pages: PageBox[];
  height: number;
  width: number;
  overflows: { block: number; page: number }[];
  /** Measure → decorations time of the last pass, ms. */
  ms: number;
}

export interface Notice {
  id: number;
  level: "info" | "warning" | "error";
  message: string;
  /** Text kept from a rejected edit, offered for copy. */
  recovery?: string;
}

export interface StudioState {
  meta: StudioMeta | null;
  metaReadOnly: boolean;
  masters: MasterDef[];
  entries: MasterEntry[];
  assetBases: Record<string, string>;
  sections: ResolvedSection[];
  sectionDiagnostics: string[];
  layout: Layout | null;
  /** Selected object ids (first = primary). */
  selection: string[];
  /** Group path entered by double-click (Slides Studio semantics). */
  groupScope: string | null;
  zoom: number;
  pageView: boolean;
  showHidden: boolean;
  showGuides: boolean;
  showRulers: boolean;
  leftTab: "outline" | "pages" | "masters";
  rightTab: "format" | "styles" | "layers" | "review";
  leftOpen: boolean;
  rightOpen: boolean;
  ribbonCollapsed: boolean;
  /** Master being edited (master edit mode), null in document mode. */
  masterEdit: MasterDef | null;
  report: { report: ExportReport; target?: string; kind: "export" | "preflight" } | null;
  notices: Notice[];
  sync: "saved" | "pending" | "sending" | "conflict" | "readonly";
  currentPage: number;
  words: number;
  title: string;
  fileName: string;
}

const listeners = new Set<() => void>();
let state: StudioState = {
  meta: null,
  metaReadOnly: false,
  masters: [],
  entries: [],
  assetBases: {},
  sections: resolveSections(null, [], () => undefined).sections,
  sectionDiagnostics: [],
  layout: null,
  selection: [],
  groupScope: null,
  zoom: 1,
  pageView: true,
  showHidden: false,
  showGuides: true,
  showRulers: true,
  leftTab: "outline",
  rightTab: "format",
  leftOpen: true,
  rightOpen: true,
  ribbonCollapsed: false,
  masterEdit: null,
  report: null,
  notices: [],
  sync: "saved",
  currentPage: 1,
  words: 0,
  title: "",
  fileName: "",
};

export const studio = {
  get: (): StudioState => state,
  set(patch: Partial<StudioState> | ((s: StudioState) => Partial<StudioState>)): void {
    const next = typeof patch === "function" ? patch(state) : patch;
    if (Object.entries(next).every(([k, v]) => (state as any)[k] === v)) return;
    state = { ...state, ...next };
    for (const l of listeners) l();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useStudio<T>(select: (s: StudioState) => T): T {
  return useSyncExternalStore(studio.subscribe, () => select(state));
}

let noticeId = 0;
export function notify(level: Notice["level"], message: string, recovery?: string): void {
  const id = ++noticeId;
  studio.set((s) => ({ notices: [...s.notices.slice(-3), { id, level, message, recovery }] }));
  if (!recovery) setTimeout(() => dismissNotice(id), level === "error" ? 9000 : 5000);
}
export const dismissNotice = (id: number) => studio.set((s) => ({ notices: s.notices.filter((n) => n.id !== id) }));

/** Section markers of the current document, kept by the pagination plugin. */
let sectionMarkers: Record<string, unknown>[] = [];

export function lookupMaster(ref: string): MasterDef | undefined {
  const { masters, masterEdit } = state;
  if (masterEdit && masterEdit.id === ref) return masterEdit;
  return masters.find((m) => m.id === ref) ?? masters.find((m) => ref.endsWith(`/${m.id}/master.json`));
}

/** Re-resolve sections after meta, masters or section markers changed. */
export function resolveDocument(markers?: Record<string, unknown>[]): void {
  if (markers) sectionMarkers = markers;
  const { sections, diagnostics } = resolveSections(state.meta, sectionMarkers as any, lookupMaster);
  studio.set({ sections, sectionDiagnostics: diagnostics });
}

export function objectOf(id: string): ObjectDescriptor | undefined {
  return state.meta?.objects?.[id];
}
