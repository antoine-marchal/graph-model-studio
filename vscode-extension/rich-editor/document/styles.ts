/**
 * Named styles: master family (base first) → named style with its `basedOn` chain → document
 * local overrides. Every resolved property remembers where it came from, for the provenance
 * inspector and "Reset to master".
 */
import type { MasterDef, ParagraphProps, RunProps, StyleDef, Theme } from "./schema";

export type StyleOrigin = `master:${string}` | "local" | "default";

export interface ResolvedStyle {
  id: string;
  name: string;
  type: StyleDef["type"];
  basedOn?: string;
  outlineLevel?: number;
  paragraph: ParagraphProps;
  run: RunProps;
  table?: StyleDef["table"];
  /** `paragraph.align` → origin of the value that won. */
  origin: Record<string, { from: StyleOrigin; style: string }>;
  /** The document overrides this style locally. */
  overridden: boolean;
}

/** Built-in defaults: what a Markdown construct maps to when no master defines it. */
export const DEFAULT_STYLES: Record<string, StyleDef> = {
  Normal: { id: "Normal", name: "Normal", type: "paragraph", paragraph: { spaceAfter: 8, lineSpacing: 1.15, widowControl: true }, run: { font: "theme.body", size: 11, color: "theme.dk1" } },
  Title: { id: "Title", name: "Title", type: "paragraph", basedOn: "Normal", next: "Normal", paragraph: { spaceAfter: 12 }, run: { font: "theme.heading", size: 28 } },
  Subtitle: { id: "Subtitle", name: "Subtitle", type: "paragraph", basedOn: "Normal", run: { size: 14, color: "theme.dk2" } },
  ...Object.fromEntries(
    [1, 2, 3, 4, 5, 6].map((n) => [
      `Heading${n}`,
      {
        id: `Heading${n}`,
        name: `Heading ${n}`,
        type: "paragraph",
        basedOn: "Normal",
        next: "Normal",
        outlineLevel: n,
        paragraph: { spaceBefore: [0, 18, 14, 12, 10, 8, 8][n], spaceAfter: 6, keepWithNext: true, keepTogether: true },
        run: { font: "theme.heading", size: [0, 20, 16, 13, 12, 11, 11][n], bold: n > 1, color: n <= 2 ? "theme.accent1" : "theme.dk1" },
      } satisfies StyleDef,
    ]),
  ),
  Quote: { id: "Quote", name: "Quote", type: "paragraph", basedOn: "Normal", paragraph: { indentLeft: 24 }, run: { italic: true, color: "theme.dk2" } },
  Caption: { id: "Caption", name: "Caption", type: "paragraph", basedOn: "Normal", paragraph: { spaceAfter: 10 }, run: { size: 9, italic: true, color: "theme.dk2" } },
  Code: { id: "Code", name: "Code", type: "paragraph", basedOn: "Normal", paragraph: { spaceAfter: 0, lineSpacing: 1 }, run: { font: "Consolas", size: 9.5 } },
  ListParagraph: { id: "ListParagraph", name: "List Paragraph", type: "paragraph", basedOn: "Normal", paragraph: { spaceAfter: 2 } },
  Header: { id: "Header", name: "Header", type: "paragraph", basedOn: "Normal", paragraph: { spaceAfter: 0 }, run: { size: 9, color: "theme.dk2" } },
  Footer: { id: "Footer", name: "Footer", type: "paragraph", basedOn: "Normal", paragraph: { spaceAfter: 0 }, run: { size: 9, color: "theme.dk2" } },
  TableGrid: { id: "TableGrid", name: "Table Grid", type: "table", table: { borderColor: "BFBFBF", borderWidth: 0.5, headerFill: "F2F2F2", cellPadding: 4 } },
  Emphasis: { id: "Emphasis", name: "Emphasis", type: "character", run: { italic: true } },
  Strong: { id: "Strong", name: "Strong", type: "character", run: { bold: true } },
  Hyperlink: { id: "Hyperlink", name: "Hyperlink", type: "character", run: { color: "theme.hlink", underline: true } },
  InlineCode: { id: "InlineCode", name: "Inline Code", type: "character", run: { font: "Consolas" } },
};

export const DEFAULT_THEME: Theme = {
  colors: { dk1: "1B1C1F", lt1: "FFFFFF", dk2: "44546A", lt2: "E7E6E6", accent1: "1F6BFF", accent2: "ED7D31", accent3: "A5A5A5", accent4: "FFC000", accent5: "5B9BD5", accent6: "70AD47", hlink: "0563C1", folHlink: "954F72" },
  fonts: { heading: "Calibri Light", body: "Calibri" },
};

/** Masters from the base of the family to `master` (basedOn chain, cycles cut). */
export function masterChain(master: MasterDef | undefined, lookup: (id: string) => MasterDef | undefined): { chain: MasterDef[]; diagnostics: string[] } {
  const chain: MasterDef[] = [];
  const diagnostics: string[] = [];
  const seen = new Set<string>();
  for (let m = master; m; m = m.basedOn ? lookup(m.basedOn) : undefined) {
    if (seen.has(m.id)) {
      diagnostics.push(`Master "${m.id}" is based on itself through ${[...seen].join(" → ")}`);
      break;
    }
    seen.add(m.id);
    chain.unshift(m);
    if (m.basedOn && !lookup(m.basedOn)) diagnostics.push(`Master "${m.id}" is based on missing master "${m.basedOn}"`);
  }
  return { chain, diagnostics };
}

export function resolveTheme(chain: MasterDef[]): Theme {
  const theme: Theme = { colors: { ...DEFAULT_THEME.colors }, fonts: { ...DEFAULT_THEME.fonts } };
  for (const m of chain) {
    Object.assign(theme.colors, m.theme?.colors);
    Object.assign(theme.fonts, m.theme?.fonts);
  }
  return theme;
}

/** `theme.accent1` → RRGGBB; plain colors normalized to upper-case RRGGBB without `#`. */
export function resolveColor(value: string | undefined | null, theme: Theme): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("theme.")) return theme.colors[value.slice(6) as keyof Theme["colors"]]?.toUpperCase();
  const hex = value.replace(/^#/, "");
  if (/^[0-9a-f]{6}$/i.test(hex)) return hex.toUpperCase();
  if (/^[0-9a-f]{3}$/i.test(hex)) return hex.replace(/./g, (c) => c + c).toUpperCase();
  return undefined;
}

export const resolveFont = (value: string | undefined, theme: Theme): string | undefined =>
  value === "theme.heading" ? theme.fonts.heading : value === "theme.body" ? theme.fonts.body : value;

export interface StyleSheet {
  styles: Map<string, ResolvedStyle>;
  theme: Theme;
  diagnostics: string[];
}

/**
 * All styles visible to a document. Layer order: defaults, each master of the family, local
 * overrides. Within a layer a style's own props win over its `basedOn` parent.
 */
export function resolveStyleSheet(chain: MasterDef[], local: Record<string, Partial<StyleDef>> | undefined): StyleSheet {
  const diagnostics: string[] = [];
  const theme = resolveTheme(chain);
  // Merged definitions (own props only) and where each prop was set.
  const defs = new Map<string, { def: StyleDef; origin: Record<string, { from: StyleOrigin; style: string }>; overridden: boolean }>();
  const layer = (styles: Record<string, Partial<StyleDef>> | undefined, from: StyleOrigin) => {
    for (const [id, s] of Object.entries(styles ?? {})) {
      const prev = defs.get(id);
      const def: StyleDef = {
        ...(prev?.def ?? { id, name: s.name ?? id, type: s.type ?? "paragraph" }),
        ...pick(s, ["name", "type", "basedOn", "next", "outlineLevel"]),
        paragraph: { ...prev?.def.paragraph, ...s.paragraph },
        run: { ...prev?.def.run, ...s.run },
        ...(s.table || prev?.def.table ? { table: { ...prev?.def.table, ...s.table } } : {}),
      };
      const origin = { ...prev?.origin };
      for (const group of ["paragraph", "run", "table"] as const) {
        for (const key of Object.keys(s[group] ?? {})) origin[`${group}.${key}`] = { from, style: id };
      }
      defs.set(id, { def, origin, overridden: (prev?.overridden ?? false) || from === "local" });
    }
  };
  layer(DEFAULT_STYLES, "default");
  for (const m of chain) layer(m.styles, `master:${m.id}`);
  if (local) {
    for (const id of Object.keys(local)) if (!defs.has(id) && !local[id]?.type) diagnostics.push(`Local style "${id}" has no definition in the master; created as a paragraph style`);
    layer(local, "local");
  }

  const resolved = new Map<string, ResolvedStyle>();
  const resolve = (id: string, stack: string[]): ResolvedStyle | undefined => {
    const hit = resolved.get(id);
    if (hit) return hit;
    const entry = defs.get(id);
    if (!entry) return undefined;
    if (stack.includes(id)) {
      diagnostics.push(`Style "${id}" is based on itself (${[...stack, id].join(" → ")}); inheritance cut`);
      return undefined;
    }
    const { def, origin, overridden } = entry;
    let parent: ResolvedStyle | undefined;
    if (def.basedOn) {
      parent = resolve(def.basedOn, [...stack, id]);
      if (!parent && !stack.includes(def.basedOn) && !defs.has(def.basedOn) && !WORD_IMPLICIT.has(def.basedOn)) diagnostics.push(`Style "${id}" is based on missing style "${def.basedOn}"`);
      if (parent && parent.type !== def.type) parent = undefined;
    }
    const out: ResolvedStyle = {
      id,
      name: def.name,
      type: def.type,
      basedOn: def.basedOn,
      outlineLevel: def.outlineLevel,
      paragraph: { ...parent?.paragraph, ...def.paragraph },
      run: { ...parent?.run, ...def.run },
      table: def.table || parent?.table ? { ...parent?.table, ...def.table } : undefined,
      origin: { ...parent?.origin, ...origin },
      overridden,
    };
    resolved.set(id, out);
    return out;
  };
  for (const id of defs.keys()) resolve(id, []);
  return { styles: resolved, theme, diagnostics };
}

/** Word's implicit base styles: templates base styles on them without defining them. */
const WORD_IMPLICIT = new Set(["DefaultParagraphFont", "TableNormal", "NoList"]);

const pick = <T extends object, K extends keyof T>(o: T, keys: K[]): Partial<T> =>
  Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]])) as unknown as Partial<T>;

/** The local overrides minus `id` (Reset to master); undefined when nothing is left. */
export function resetStyle(local: Record<string, Partial<StyleDef>> | undefined, id: string): Record<string, Partial<StyleDef>> | undefined {
  if (!local || !(id in local)) return local;
  const { [id]: _drop, ...rest } = local;
  return Object.keys(rest).length ? rest : undefined;
}

/** Style id a Markdown block maps to when it carries no explicit `style`. */
export function defaultStyleFor(node: { type: string; depth?: number }): string {
  switch (node.type) {
    case "heading": return `Heading${Math.min(6, Math.max(1, node.depth ?? 1))}`;
    case "blockquote": return "Quote";
    case "code": return "Code";
    case "table": return "TableGrid";
    default: return "Normal";
  }
}
