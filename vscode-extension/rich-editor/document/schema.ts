/**
 * Markdown Studio document semantics (schema version 1). Markdown stays the source of truth:
 * ordinary content is ordinary Markdown; these types describe only the enhancements, persisted in
 * the `markdownStudio` frontmatter key (keyed by id) with the content of those ids in `::: id`
 * groups of the body (groups.ts), page / section breaks as `<!-- ms:… -->` markers, and in
 * master files (`.markdown-studio/masters/<id>/master.json`). Geometry is in pt (units.ts).
 */
import { PAGE_SIZES, parseLength, type PageSizeName } from "./units";
import type { CellLook } from "./tableLook";

export const STUDIO_VERSION = 2;

export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
  /** Distance from the page edge to the header / footer text (Word's header / footer distance). */
  header: number;
  footer: number;
}

export interface PageSetup {
  size?: PageSizeName | "custom";
  /** Portrait width / height (custom size, or resolved from `size`). */
  width?: number;
  height?: number;
  orientation?: "portrait" | "landscape";
  margins?: Partial<Margins>;
  /** Word-style newspaper columns of a section (not the side-by-side `ms-columns` containers). */
  columns?: { count: number; gap?: number };
}

export interface ResolvedPage {
  width: number;
  height: number;
  orientation: "portrait" | "landscape";
  margins: Margins;
  columns: { count: number; gap: number };
}

export type Align = "left" | "center" | "right" | "justify";

export interface ParagraphProps {
  align?: Align;
  spaceBefore?: number;
  spaceAfter?: number;
  /** Line height as a multiple of the font size (1.15 = Word's default "Multiple 1.15"). */
  lineSpacing?: number;
  indentLeft?: number;
  indentRight?: number;
  /** Positive first-line indent, negative hanging indent. */
  firstLine?: number;
  keepWithNext?: boolean;
  keepTogether?: boolean;
  pageBreakBefore?: boolean;
  /** Widow / orphan control (default on, as in Word). */
  widowControl?: boolean;
  tabs?: { pos: number; align?: "left" | "center" | "right" | "decimal"; leader?: "none" | "dot" | "hyphen" | "underscore" }[];
}

export interface RunProps {
  font?: string;
  size?: number;
  /** RRGGBB, or a theme slot `theme.accent1`. */
  color?: string;
  highlight?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  caps?: boolean;
  smallCaps?: boolean;
}

export type StyleType = "paragraph" | "character" | "table";

export interface StyleDef {
  id: string;
  name: string;
  type: StyleType;
  basedOn?: string;
  next?: string;
  /** Heading level the style stands for (1–9), for the outline and DOCX outline levels. */
  outlineLevel?: number;
  paragraph?: ParagraphProps;
  run?: RunProps;
  /** Table styles: borders / header row look. */
  table?: { borderColor?: string; borderWidth?: number; headerFill?: string; headerColor?: string; cellPadding?: number };
}

export type ThemeSlot = "dk1" | "lt1" | "dk2" | "lt2" | "accent1" | "accent2" | "accent3" | "accent4" | "accent5" | "accent6" | "hlink" | "folHlink";

export interface Theme {
  colors: Partial<Record<ThemeSlot, string>>;
  fonts: { heading: string; body: string };
}

/** Header / footer story: Markdown with `{{page}}`, `{{pages}}`, `{{title}}`, `{{field:name}}` fields. */
export interface StoryDef {
  /** Text of a master story; a document story names its `::: id` group instead (filled when resolved). */
  markdown?: string;
  id?: string;
  /** Paragraph style / alignment of the whole story (document: `blocks.<id>`, filled when resolved). */
  block?: BlockProps;
  /** Recurring drawings of this story (logos, rules), positioned relative to the page. */
  objects?: Record<string, ObjectDescriptor>;
}

export interface StorySet {
  default?: StoryDef;
  first?: StoryDef;
  even?: StoryDef;
}

export type FeatureStatus = "supported" | "preserved" | "flattened" | "unsupported";

export interface ImportReportItem {
  feature: string;
  status: FeatureStatus;
  detail?: string;
  part?: string;
}

export interface MasterDef {
  /** Stable id (folder name), independent of the display name. */
  id: string;
  name: string;
  description?: string;
  /** Styles, theme and numbering are inherited from this master (a family's base design). */
  basedOn?: string;
  page: PageSetup;
  theme?: Theme;
  styles?: Record<string, StyleDef>;
  numbering?: { bullet?: string[]; ordered?: ("decimal" | "lowerLetter" | "upperLetter" | "lowerRoman" | "upperRoman")[] };
  headers?: StorySet;
  footers?: StorySet;
  /** Different first page header / footer (Word's titlePg). */
  titlePage?: boolean;
  /** Different odd / even pages (Word's evenAndOddHeaders, document-wide in DOCX). */
  evenAndOdd?: boolean;
  /** Recurring page drawings drawn behind the body (backgrounds, bands, watermarks). */
  background?: Record<string, ObjectDescriptor>;
  /** Semantic fields offered to documents (title, client, version…), with defaults. */
  fields?: Record<string, { label: string; default?: string }>;
  constraints?: { allowedStyles?: string[]; lockedStyles?: string[] };
  provenance?: {
    source: "starter" | "docx" | "user";
    file?: string;
    importedAt?: string;
    sha256?: string;
    /** Section of the template the page design came from (1-based). */
    section?: number;
    report?: ImportReportItem[];
  };
}

export type Placement = "inline" | "anchored" | "page";
export type Wrap = "square" | "topBottom" | "none";
export type Plane = "front" | "behind";
export type ShapeKind = "rect" | "roundRect" | "ellipse" | "triangle" | "diamond" | "rightArrow" | "chevron" | "line";

export interface ObjectStyle {
  fill?: string | null;
  line?: string | null;
  lineWidth?: number;
  dash?: "solid" | "dash" | "dot";
  /** 0 (opaque) – 100 (invisible). */
  transparency?: number;
  color?: string;
  fontSize?: number;
  align?: Align;
  valign?: "top" | "middle" | "bottom";
  padding?: number;
  startArrow?: "none" | "triangle" | "arrow";
  endArrow?: "none" | "triangle" | "arrow";
}

export interface ConnectorEnd {
  id: string;
  side?: "auto" | "top" | "right" | "bottom" | "left";
}

/**
 * A positioned object. Its content (image, text box body) lives once, in the Markdown body between
 * its `ms:object` markers; this descriptor holds only geometry and appearance.
 */
export interface ObjectDescriptor {
  type: "image" | "textbox" | "shape" | "connector";
  /** anchored: follows the paragraph after its marker; page: relative to the page / margin frame of that paragraph's page. */
  placement: Placement;
  relativeTo?: "margin" | "page";
  /** pt; anchored: x from the column / margin left, y from the anchor paragraph top. */
  box: { x: number; y: number; width: number; height: number };
  rotation?: number;
  wrap?: Wrap;
  plane?: Plane;
  z?: number;
  locked?: { content?: boolean; geometry?: boolean };
  hidden?: boolean;
  name?: string;
  /** Group path, outermost first (`cards/card-1`), as in Slides Studio. */
  group?: string;
  shape?: ShapeKind;
  style?: ObjectStyle;
  /** Connectors: end points attached to other objects by id. */
  from?: ConnectorEnd;
  to?: ConnectorEnd;
  route?: "straight" | "elbow";
  /** Image without a body (recurring master drawings). Body images use the Markdown image. */
  src?: string;
  alt?: string;
  /** Master / story text boxes: their text (Markdown inline), stored in the master. */
  text?: string;
  /**
   * Master placeholder: the box shows a document value — `title`, `subtitle`, `date`, `page`,
   * `pages` or `field:<name>` — and exports as the matching Word field.
   */
  placeholder?: string;
}

export interface SectionProps {
  id?: string;
  master?: string;
  orientation?: "portrait" | "landscape";
  size?: PageSizeName | "custom";
  width?: number;
  height?: number;
  margins?: Partial<Margins>;
  columns?: { count: number; gap?: number };
  /** How the section starts (Word section types). */
  break?: "nextPage" | "continuous" | "oddPage" | "evenPage";
  /** `link` (Word's "link to previous", the default) keeps the previous section's headers / footers. */
  headers?: "link" | "master";
  pageNumberStart?: number;
}

export interface BlockProps extends ParagraphProps {
  id?: string;
  style?: string;
  /** Table column widths / row heights (px, null = auto). */
  cols?: (number | null)[];
  rows?: (number | null)[];
  /** Table look: the whole table, and cell ranges (`"A1:D1"`) applied in order (tableLook.ts). */
  table?: CellLook;
  cells?: Record<string, CellLook>;
}

export interface StudioMeta {
  version: number;
  /** Master id (`.markdown-studio/masters/<id>/master.json`) or a path relative to the document. */
  master?: string;
  page?: PageSetup;
  /** Local style overrides on top of the master: keys set here win; deleting a key resets it to the master. */
  styles?: Record<string, Partial<StyleDef>>;
  fields?: Record<string, string>;
  /** Master placeholders this document fills: their text is the `::: <key>` group. */
  placeholders?: string[];
  /** Properties of the `::: id` block groups (and of document stories), by id. */
  blocks?: Record<string, BlockProps>;
  /** Page breaks (`page: true`) and section breaks (their section properties) at their empty `::: id` group. */
  breaks?: Record<string, SectionProps & { page?: true }>;
  objects?: Record<string, ObjectDescriptor>;
  /** Document headers / footers replacing the master's (Word: unlinked first section stories). */
  headers?: StorySet;
  footers?: StorySet;
  export?: { mode?: "strict" | "permissive"; hidden?: "omit" | "include" };
}

const ID_RE = /^[A-Za-z][\w-]{0,63}$/;
export const isValidId = (id: unknown): id is string => typeof id === "string" && ID_RE.test(id);

export const DEFAULT_MARGINS: Margins = { top: 72, right: 72, bottom: 72, left: 72, header: 36, footer: 36 };

export function resolvePage(...layers: (PageSetup | SectionProps | undefined)[]): ResolvedPage {
  let size: PageSizeName | "custom" = "A4";
  let width: number | undefined;
  let height: number | undefined;
  let orientation: "portrait" | "landscape" = "portrait";
  const margins = { ...DEFAULT_MARGINS };
  let columns = { count: 1, gap: 36 };
  for (const layer of layers) {
    if (!layer) continue;
    if (layer.size) size = layer.size;
    if (layer.width) width = parseLength(layer.width);
    if (layer.height) height = parseLength(layer.height);
    if (layer.orientation) orientation = layer.orientation;
    for (const [k, v] of Object.entries(layer.margins ?? {})) {
      const n = parseLength(v);
      if (n !== undefined && n >= 0 && k in margins) margins[k as keyof Margins] = n;
    }
    if (layer.columns && layer.columns.count >= 1) columns = { count: Math.min(6, Math.round(layer.columns.count)), gap: parseLength(layer.columns.gap) ?? 36 };
  }
  const named = size !== "custom" ? PAGE_SIZES[size] : undefined;
  let w = width ?? named?.width ?? PAGE_SIZES.A4.width;
  let h = height ?? named?.height ?? PAGE_SIZES.A4.height;
  if (w > h) [w, h] = [h, w];
  if (orientation === "landscape") [w, h] = [h, w];
  return { width: w, height: h, orientation, margins, columns };
}

/** Content box of a page (inside the margins), pt. */
export const contentWidth = (p: ResolvedPage): number => p.width - p.margins.left - p.margins.right;
export const contentHeight = (p: ResolvedPage): number => p.height - p.margins.top - p.margins.bottom;
