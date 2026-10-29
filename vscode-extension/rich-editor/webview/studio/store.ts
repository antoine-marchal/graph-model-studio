/**
 * Studio state shared by the shell, the pagination plugin and object views: document meta
 * (frontmatter `markdownStudio`), masters, resolved sections / styles, derived page layout,
 * object selection and view options. Plain external store (useSyncExternalStore) — the
 * ProseMirror document stays in the editor; derived layout is never persisted.
 */
import { useSyncExternalStore } from "react";
import type { MasterDef, ObjectDescriptor, StudioMeta } from "../../document/schema";
import { resolveSections, type ResolvedSection } from "../../document/masters";
import { setGroupMeta, withGroupTexts } from "../../document/groups";
import type { ExportReport } from "../../src/docx/compile";

/**
 * `.paper` documents open in the paginated document studio (always print layout); `.md` files keep
 * the continuous editor. The host marks the webview body (`data-studio="paper"`).
 */
export const PAPER = typeof document !== "undefined" && document.body?.dataset.studio === "paper";

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

export type RibbonTab = "home" | "insert" | "layout" | "references" | "design" | "review" | "view" | "format";
export type Pane = "format" | "styles" | "layers" | "document" | "check";

/** What a right-click hit (context menu target). */
export type MenuTarget =
  | { kind: "text" }
  | { kind: "block"; pos: number }
  | { kind: "object" }
  | { kind: "page"; page: number }
  | { kind: "story"; page: number; story: "headers" | "footers" }
  | { kind: "master"; page?: number }
  | { kind: "outline"; pos: number };

export interface StudioState {
  meta: StudioMeta | null;
  /** Markdown of the header / footer / placeholder `::: id` groups of the text, by id. */
  groupTexts: Record<string, string>;
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
  tab: RibbonTab;
  pane: Pane;
  navMode: "outline" | "pages";
  contextMenu: { x: number; y: number; target: MenuTarget } | null;
  /** Master edit mode: selected master objects (background ids). */
  masterSel: string[];
  snap: boolean;
  /** Connector tool: null off, "" waiting for the start object, else its id. */
  connectFrom: string | null;
  /** Word's "text boundaries": margin frame on the paper. */
  showBoundaries: boolean;
  /** Notion-style block handles (+ and grip) beside the hovered block. */
  showBlockHandles: boolean;
  /** Source line numbers beside the page (left of the vertical ruler). */
  showLineNumbers: boolean;
  /** Object whose text is being edited in place (double-click). */
  editingObject: string | null;
  leftOpen: boolean;
  rightOpen: boolean;
  ribbonCollapsed: boolean;
  /** Rich editor of the header / footer being edited: the ribbon and inspector act on it. */
  storyEditor: import("@tiptap/core").Editor | null;
  /** Selected drawing of the header / footer being edited. */
  storyObjectSel: string | null;
  /** Master browser shown over the workspace. */
  mastersOpen: boolean;
  /** Master being edited (master edit mode), null in document mode. */
  masterEdit: MasterDef | null;
  /** Id of the master the edited copy replaces on the paper (a starter is edited as a new copy). */
  masterEditOf: string | null;
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
  groupTexts: {},
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
  pageView: PAPER,
  showHidden: false,
  showGuides: true,
  showRulers: true,
  tab: "home",
  pane: "format",
  navMode: "outline",
  contextMenu: null,
  masterSel: [],
  snap: true,
  connectFrom: null,
  showBoundaries: false,
  showBlockHandles: true,
  showLineNumbers: false,
  editingObject: null,
  leftOpen: true,
  rightOpen: true,
  ribbonCollapsed: false,
  mastersOpen: false,
  storyEditor: null,
  storyObjectSel: null,
  masterEdit: null,
  masterEditOf: null,
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

/** View options remembered per viewer (rulers, handles, line numbers, boundaries, snapping). */
const VIEW_KEYS = ["showRulers", "showBlockHandles", "showLineNumbers", "showBoundaries", "snap"] as const;
try {
  const saved = JSON.parse(localStorage.getItem("markdownStudio.view") ?? "{}");
  for (const k of VIEW_KEYS) if (typeof saved[k] === "boolean") (state as any)[k] = saved[k];
} catch {
  // No storage: defaults.
}
let viewKey = "";
listeners.add(() => {
  const key = JSON.stringify(Object.fromEntries(VIEW_KEYS.map((k) => [k, state[k]])));
  if (key === viewKey) return;
  viewKey = key;
  try {
    localStorage.setItem("markdownStudio.view", key);
  } catch {
    // Private storage: not remembered.
  }
});

// `::: id` groups of the text are classified with the document's current frontmatter.
setGroupMeta(() => state.meta);

// Dev / test handle (profiling and browser checks read and patch the store through it).
(globalThis as { __studio?: typeof studio }).__studio = studio;

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
  if (masterEdit && (masterEdit.id === ref || state.masterEditOf === ref || ref.endsWith(`/${state.masterEditOf}/master.json`))) return masterEdit;
  return masters.find((m) => m.id === ref) ?? masters.find((m) => ref.endsWith(`/${m.id}/master.json`));
}

/** Re-resolve sections after meta, masters or section markers changed. */
export function resolveDocument(markers?: Record<string, unknown>[]): void {
  if (markers) sectionMarkers = markers;
  const { sections, diagnostics } = resolveSections(withGroupTexts(state.meta, state.groupTexts), sectionMarkers as any, lookupMaster);
  studio.set({ sections, sectionDiagnostics: diagnostics });
}

export function objectOf(id: string): ObjectDescriptor | undefined {
  return state.meta?.objects?.[id];
}
