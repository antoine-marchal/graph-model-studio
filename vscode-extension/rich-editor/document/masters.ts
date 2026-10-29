/**
 * Document masters: reusable page designs (page setup, styles, theme, header / footer stories,
 * recurring drawings, fields). Word has no slide-master equivalent: a master maps onto Word
 * styles, section properties and header / footer stories at export time.
 *
 * Sections: a document starts with one section (the frontmatter master / page); every
 * `ms:section` marker starts another. Header / footer stories follow Word's linkage: a section
 * that sets its own `master` uses that master's stories unless `headers: "link"`; a section
 * without a master links to the previous section (Word's default "Link to Previous").
 */
import { masterChain, resolveStyleSheet, type StyleSheet } from "./styles";
import { resolvePage, type MasterDef, type ObjectDescriptor, type ResolvedPage, type SectionProps, type StoryDef, type StorySet, type StudioMeta } from "./schema";

export const MASTER_FOLDER = ".markdown-studio/masters";
export const MASTER_FILE = "master.json";

export interface ResolvedSection {
  index: number;
  props: SectionProps;
  master?: MasterDef;
  chain: MasterDef[];
  page: ResolvedPage;
  headers: StorySet;
  footers: StorySet;
  /** Where the stories come from, for the UI ("Linked to previous", "Master Letterhead"…). */
  storyOrigin: "document" | "master" | "linked" | "none";
  titlePage: boolean;
  background: Record<string, ObjectDescriptor>;
  sheet: StyleSheet;
}

/** Recurring drawings of a master family (base first); a master with `inheritBackground: false` starts afresh. */
export function chainBackground(chain: MasterDef[]): Record<string, ObjectDescriptor> {
  let from = 0;
  chain.forEach((m, i) => m.inheritBackground === false && (from = i));
  return Object.assign({}, ...chain.slice(from).map((m) => m.background ?? {}));
}

export type MasterLookup = (ref: string) => MasterDef | undefined;

const hasStories = (s?: StorySet) => !!(s && (s.default || s.first || s.even));

export function resolveSections(meta: StudioMeta | null, markers: SectionProps[], lookup: MasterLookup): { sections: ResolvedSection[]; diagnostics: string[] } {
  const diagnostics: string[] = [];
  const sections: ResolvedSection[] = [];
  const all: SectionProps[] = [{}, ...markers];
  all.forEach((props, index) => {
    const prev = sections[index - 1];
    const ref = index === 0 ? meta?.master : props.master;
    const master = ref ? lookup(ref) : prev?.master;
    if (ref && !master) diagnostics.push(`Master "${ref}" was not found${index ? ` (section ${index + 1})` : ""}; using defaults`);
    const { chain, diagnostics: chainDiag } = masterChain(master, (id) => lookup(id));
    diagnostics.push(...chainDiag);
    const masterPages = chain.map((m) => m.page);
    const page = resolvePage(...masterPages, index === 0 ? meta?.page : undefined, props);
    let headers: StorySet = {};
    let footers: StorySet = {};
    let storyOrigin: ResolvedSection["storyOrigin"] = "none";
    const ownMaster = index === 0 ? !!master : !!props.master && props.headers !== "link";
    if (index === 0 && (hasStories(meta?.headers) || hasStories(meta?.footers))) {
      headers = { ...lastStories(chain, "headers"), ...meta?.headers };
      footers = { ...lastStories(chain, "footers"), ...meta?.footers };
      storyOrigin = "document";
    } else if (ownMaster || (props.headers === "master" && master)) {
      headers = lastStories(chain, "headers");
      footers = lastStories(chain, "footers");
      storyOrigin = hasStories(headers) || hasStories(footers) ? "master" : "none";
    } else if (prev) {
      headers = prev.headers;
      footers = prev.footers;
      storyOrigin = prev.storyOrigin === "none" ? "none" : "linked";
    }
    const titlePage = chain.some((m) => m.titlePage) && (index === 0 || ownMaster);
    const background = chainBackground(chain);
    const sheet = resolveStyleSheet(chain, meta?.styles);
    if (index === 0) diagnostics.push(...sheet.diagnostics);
    sections.push({ index, props, master, chain, page, headers, footers, storyOrigin, titlePage, background, sheet });
  });
  return { sections, diagnostics };
}

/** Nearest master of the family that defines header (or footer) stories. */
function lastStories(chain: MasterDef[], key: "headers" | "footers"): StorySet {
  for (let i = chain.length - 1; i >= 0; i--) if (hasStories(chain[i][key])) return { ...chain[i][key] };
  return {};
}

/** Story shown on a page: first page of a title-page section, even pages, else default. */
export function storyFor(set: StorySet, opts: { firstOfSection: boolean; titlePage: boolean; pageNumber: number; evenAndOdd: boolean }): StoryDef | undefined {
  if (opts.firstOfSection && opts.titlePage) return set.first;
  if (opts.evenAndOdd && opts.pageNumber % 2 === 0 && set.even) return set.even;
  return set.default;
}

/** Fields of a story replaced for display (export writes real Word fields instead). */
export function fillFields(markdown: string, values: { page?: number; pages?: number; title?: string; fields?: Record<string, string> }): string {
  return markdown.replace(/\{\{\s*(page|pages|title|field:([\w-]+))\s*\}\}/g, (m, key, field) => {
    if (key === "page") return values.page !== undefined ? String(values.page) : m;
    if (key === "pages") return values.pages !== undefined ? String(values.pages) : m;
    if (key === "title") return values.title ?? "";
    return values.fields?.[field] ?? "";
  });
}

const story = (markdown: string): StoryDef => ({ markdown });

/** Starter library: a body family plus page designs based on it. */
export function starterMasters(): MasterDef[] {
  const body: MasterDef = {
    id: "studio-body",
    name: "Body",
    description: "Default report body: A4, Calibri, accent headings, page numbers in the footer.",
    page: { size: "A4", margins: { top: 72, right: 68, bottom: 72, left: 68, header: 32, footer: 32 } },
    theme: { colors: { accent1: "1F6BFF", dk2: "44546A" }, fonts: { heading: "Calibri Light", body: "Calibri" } },
    styles: {
      Normal: { id: "Normal", name: "Normal", type: "paragraph", paragraph: { spaceAfter: 8, lineSpacing: 1.15 }, run: { font: "theme.body", size: 11 } },
      Lead: { id: "Lead", name: "Lead", type: "paragraph", basedOn: "Normal", paragraph: { spaceAfter: 12 }, run: { size: 13, color: "theme.dk2" } },
      Callout: { id: "Callout", name: "Callout", type: "paragraph", basedOn: "Normal", paragraph: { indentLeft: 12, indentRight: 12 }, run: { color: "theme.accent1" } },
    },
    headers: { default: story("{{title}}") },
    footers: { default: story("Page {{page}} of {{pages}}") },
    fields: { client: { label: "Client" }, version: { label: "Version", default: "1.0" } },
    provenance: { source: "starter" },
  };
  return [
    body,
    {
      id: "studio-cover",
      name: "Cover",
      description: "Cover page: no header or footer, accent band behind the title.",
      basedOn: "studio-body",
      page: { margins: { top: 216 } },
      background: {
        band: { type: "shape", shape: "rect", placement: "page", relativeTo: "page", box: { x: 0, y: 0, width: 595.28, height: 180 }, plane: "behind", style: { fill: "theme.accent1", line: null }, locked: { geometry: true, content: true }, name: "Cover band" },
      },
      styles: { Title: { id: "Title", name: "Title", type: "paragraph", basedOn: "Normal", run: { size: 34, color: "theme.dk1", font: "theme.heading" } } },
      headers: {},
      footers: {},
      provenance: { source: "starter" },
    },
    {
      id: "studio-chapter",
      name: "Chapter opener",
      description: "Starts on a new page with a large chapter heading and a rule.",
      basedOn: "studio-body",
      page: { margins: { top: 144 } },
      styles: { Heading1: { id: "Heading1", name: "Heading 1", type: "paragraph", basedOn: "Normal", outlineLevel: 1, paragraph: { spaceAfter: 18, keepWithNext: true }, run: { size: 28, color: "theme.accent1", font: "theme.heading" } } },
      titlePage: true,
      headers: { first: story(""), default: story("{{title}}") },
      footers: { first: story(""), default: story("Page {{page}} of {{pages}}") },
      background: {
        rule: { type: "shape", shape: "line", placement: "page", relativeTo: "margin", box: { x: 0, y: -24, width: 459.28, height: 0 }, plane: "behind", style: { line: "theme.accent1", lineWidth: 2 }, locked: { geometry: true }, name: "Chapter rule" },
      },
      provenance: { source: "starter" },
    },
    {
      id: "studio-letterhead",
      name: "Letterhead",
      description: "Letter: sender block in the first-page header, contact line in the footer.",
      basedOn: "studio-body",
      page: { size: "A4", margins: { top: 126, bottom: 90 } },
      titlePage: true,
      headers: { first: story("**{{field:company}}**  \n{{field:address}}"), default: story("{{field:company}}") },
      footers: { first: story("{{field:contact}}"), default: story("Page {{page}}") },
      fields: { company: { label: "Company", default: "Company name" }, address: { label: "Address" }, contact: { label: "Contact line" } },
      provenance: { source: "starter" },
    },
    {
      id: "studio-landscape",
      name: "Landscape appendix",
      description: "Landscape pages for wide tables and diagrams.",
      basedOn: "studio-body",
      page: { orientation: "landscape", margins: { top: 54, bottom: 54, left: 54, right: 54 } },
      headers: { default: story("Appendix — {{title}}") },
      footers: { default: story("Page {{page}}") },
      provenance: { source: "starter" },
    },
  ];
}

/** Validate untrusted master JSON (from disk); returns the problems found, empty when usable. */
export function validateMaster(value: unknown): string[] {
  const errors: string[] = [];
  const m = value as MasterDef;
  if (!m || typeof m !== "object") return ["master.json is not an object"];
  if (typeof m.id !== "string" || !/^[a-z0-9][\w-]{0,63}$/i.test(m.id)) errors.push("id must be a short identifier");
  if (typeof m.name !== "string" || !m.name.trim()) errors.push("name is required");
  if (!m.page || typeof m.page !== "object") errors.push("page is required");
  for (const [id, s] of Object.entries(m.styles ?? {})) {
    if (!s || typeof s !== "object") errors.push(`style ${id} is not an object`);
    else if (s.type && !["paragraph", "character", "table"].includes(s.type)) errors.push(`style ${id}: unknown type ${s.type}`);
  }
  return errors;
}
