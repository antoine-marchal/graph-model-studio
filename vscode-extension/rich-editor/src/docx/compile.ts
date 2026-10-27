/**
 * Markdown Studio → editable DOCX, without Pandoc. Consumes parsed document semantics
 * (document/model.ts) plus resolved masters — never the editor DOM — so it runs from source with
 * no editor open. Ordinary text becomes real Word paragraphs with named styles; positioned
 * objects become native anchored drawings (pictures, shapes, text boxes, groups, connectors);
 * sections, header / footer stories and page fields map to Word's own. Whatever cannot be
 * represented is listed in the report: strict mode refuses to write a lossy document.
 */
import * as d from "docx";
import { ShapeGroupRun, ShapeRun } from "docx/shapes";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { parseStudioDocument, plainText, type StudioDocument, type StudioObjectRef } from "../../document/model";
import { resolveSections, type MasterLookup, type ResolvedSection } from "../../document/masters";
import { placeholderKey, placeholderValue } from "../../document/placeholders";
import { resolveColor, resolveFont, defaultStyleFor, type ResolvedStyle, type StyleSheet } from "../../document/styles";
import { ptToEmu, ptToHalfPt, ptToTwip, ptToDocxPx, pxToPt } from "../../document/units";
import { contentWidth, type BlockProps, type ObjectDescriptor, type ParagraphProps, type RunProps, type StoryDef, type Theme } from "../../document/schema";
import { groupParts } from "../../../slides-studio/packages/core/src/groups";
import { imageSize } from "./imageSize";

export interface ReportItem {
  kind: string;
  message: string;
  line?: number;
  objectId?: string;
  /** Content would be lost (blocks strict export). */
  lossy?: boolean;
}

export interface ExportReport {
  ok: boolean;
  blocked: boolean;
  mode: "strict" | "permissive";
  native: Record<string, number>;
  fallbacks: ReportItem[];
  unsupported: ReportItem[];
  missing: ReportItem[];
  fonts: string[];
  limits: string[];
  diagnostics: ReportItem[];
}

export interface CompileOptions {
  source: string;
  masters: MasterLookup;
  /** Read a file referenced by the document (images); undefined when missing or not allowed. */
  readAsset(relativePath: string, root: "document" | { master: string }): Promise<Uint8Array | undefined>;
  /** Render a diagram fence (gmc, mermaid…) to PNG; undefined when no renderer is available. */
  renderDiagram?(lang: string, code: string, meta: string): Promise<Uint8Array | undefined>;
  mode?: "strict" | "permissive";
  hidden?: "omit" | "include";
  title?: string;
}

const storyParser = unified().use(remarkParse).use(remarkGfm);

const ALIGN: Record<string, (typeof d.AlignmentType)[keyof typeof d.AlignmentType]> = {
  left: d.AlignmentType.LEFT, center: d.AlignmentType.CENTER, right: d.AlignmentType.RIGHT, justify: d.AlignmentType.JUSTIFIED,
};
const SHAPES: Record<string, string> = {
  rect: "rectangle", roundRect: "roundedRectangle", ellipse: "ellipse", triangle: "triangle", diamond: "diamond", rightArrow: "rightArrow", chevron: "chevron", line: "line",
};
const ORDERED_FORMATS = [d.LevelFormat.DECIMAL, d.LevelFormat.LOWER_LETTER, d.LevelFormat.LOWER_ROMAN];
const BULLETS = ["•", "◦", "▪"];

type Child = d.Paragraph | d.Table | d.TableOfContents;
type Inline = d.ParagraphChild;

interface Ctx {
  doc: StudioDocument;
  opts: CompileOptions;
  report: ExportReport;
  section: ResolvedSection;
  sheet: StyleSheet;
  theme: Theme;
  orderedInstances: number;
  fonts: Set<string>;
  bookmarks: Set<string>;
  usesToc: boolean;
}

const count = (ctx: Ctx, key: string, n = 1) => (ctx.report.native[key] = (ctx.report.native[key] ?? 0) + n);
const lineOf = (node: any): number | undefined => node?.position?.start?.line;

export async function compileDocx(opts: CompileOptions): Promise<{ buffer?: Buffer; report: ExportReport }> {
  const mode = opts.mode ?? "permissive";
  const report: ExportReport = { ok: false, blocked: false, mode, native: {}, fallbacks: [], unsupported: [], missing: [], fonts: [], limits: [], diagnostics: [] };
  const doc = parseStudioDocument(opts.source);
  for (const diag of doc.diagnostics) report.diagnostics.push({ kind: "source", message: diag.message, line: diag.line, objectId: diag.objectId });
  const { sections, diagnostics } = resolveSections(doc.meta, doc.sections.map((s) => s.props), opts.masters);
  for (const message of diagnostics) report.diagnostics.push({ kind: "master", message });
  const hiddenMode = opts.hidden ?? doc.meta?.export?.hidden ?? "omit";
  const title = opts.title ?? doc.title ?? "";
  report.limits.push(
    "Automatic line and page breaks are computed by Word and can differ from the editor's pagination; explicit page and section breaks are kept.",
    "Page number and table-of-contents fields show cached values until Word updates fields.",
  );

  const ctx: Ctx = { doc, opts, report, section: sections[0], sheet: sections[0].sheet, theme: sections[0].sheet.theme, orderedInstances: 0, fonts: new Set(), bookmarks: new Set(), usesToc: false };

  // Objects grouped by the block they anchor to.
  const anchored = new Map<number, StudioObjectRef[]>();
  for (const o of doc.objects) {
    if (!o.descriptor) continue;
    if (o.descriptor.hidden && hiddenMode === "omit") {
      report.diagnostics.push({ kind: "hidden", message: `Hidden object "${o.id}" is not exported`, objectId: o.id, line: o.line });
      continue;
    }
    const list = anchored.get(o.anchor) ?? [];
    list.push(o);
    anchored.set(o.anchor, list);
  }

  const outSections: { section: ResolvedSection; children: Child[] }[] = [{ section: sections[0], children: [] }];
  let sectionIndex = 0;
  let pendingRuns: Inline[] = [];
  const blocks = doc.blocks;
  for (let i = 0; i <= blocks.length; i++) {
    const objs = anchored.get(i);
    if (objs?.length) pendingRuns.push(...(await drawingRuns(objs, ctx)));
    const node = blocks[i];
    if (!node) break;
    const out = outSections[outSections.length - 1];
    if (node.type === "studioBreak") {
      if (node.kind === "section") {
        sectionIndex++;
        ctx.section = sections[sectionIndex];
        ctx.sheet = ctx.section.sheet;
        outSections.push({ section: ctx.section, children: [] });
        count(ctx, "sections");
      } else {
        out.children.push(new d.Paragraph({ children: [...flushRuns(), new d.PageBreak()] }));
        count(ctx, "pageBreaks");
      }
      continue;
    }
    if (node.type === "studioObject") {
      // Described objects are drawings anchored to the next block; undescribed ones stay in flow.
      if (!doc.meta?.objects?.[node.id]) out.children.push(...(await blockChildren(node.children, ctx, {})));
      continue;
    }
    // Anchored drawings go into the first paragraph of their block (Word anchors to paragraphs);
    // a block that starts with no paragraph (a table) gets an empty anchor paragraph before it.
    const lead = { runs: flushRuns() };
    const children = await blockChildren([node], ctx, { lead });
    if (lead.runs.length) out.children.push(new d.Paragraph({ spacing: { before: 0, after: 0, line: 20, lineRule: d.LineRuleType.EXACT }, children: lead.runs }));
    out.children.push(...children);
  }
  if (pendingRuns.length) outSections[outSections.length - 1].children.push(new d.Paragraph({ children: flushRuns() }));
  function flushRuns(): Inline[] {
    const runs = pendingRuns;
    pendingRuns = [];
    return runs;
  }

  // Sections, with their stories.
  const docxSections: d.ISectionOptions[] = [];
  for (const { section, children } of outSections) {
    ctx.section = section;
    ctx.sheet = section.sheet;
    const page = section.page;
    const props = section.props;
    const headers: Record<string, d.Header> = {};
    const footers: Record<string, d.Footer> = {};
    if (section.storyOrigin !== "linked") {
      const backgroundRuns = await drawingRuns(
        Object.entries(section.background).map(([id, descriptor]) => ({ id, descriptor, body: [], anchor: 0, line: 0 })),
        ctx,
        { master: section.chain[section.chain.length - 1]?.id },
      );
      for (const kind of ["default", "first", "even"] as const) {
        const h = section.headers[kind];
        const f = section.footers[kind];
        const needsBackground = backgroundRuns.length && (kind === "default" || (kind === "first" && section.titlePage));
        if (h || needsBackground) {
          const own = await storyDrawings(h, "headers", kind, section, ctx);
          headers[kind] = new d.Header({ children: await storyParagraphs(h, ctx, title, "Header", [...(needsBackground ? backgroundRuns : []), ...own]) });
          count(ctx, "headers");
        }
        if (f) {
          footers[kind] = new d.Footer({ children: await storyParagraphs(f, ctx, title, "Footer", await storyDrawings(f, "footers", kind, section, ctx)) });
          count(ctx, "footers");
        }
      }
    }
    docxSections.push({
      properties: {
        type: { nextPage: d.SectionType.NEXT_PAGE, continuous: d.SectionType.CONTINUOUS, oddPage: d.SectionType.ODD_PAGE, evenPage: d.SectionType.EVEN_PAGE }[props.break ?? "nextPage"],
        titlePage: section.titlePage,
        page: {
          size: { width: ptToTwip(Math.min(page.width, page.height)), height: ptToTwip(Math.max(page.width, page.height)), orientation: page.orientation === "landscape" ? d.PageOrientation.LANDSCAPE : d.PageOrientation.PORTRAIT },
          margin: { top: ptToTwip(page.margins.top), right: ptToTwip(page.margins.right), bottom: ptToTwip(page.margins.bottom), left: ptToTwip(page.margins.left), header: ptToTwip(page.margins.header), footer: ptToTwip(page.margins.footer) },
          ...(props.pageNumberStart ? { pageNumbers: { start: props.pageNumberStart } } : {}),
        },
        ...(page.columns.count > 1 ? { column: { count: page.columns.count, space: ptToTwip(page.columns.gap), equalWidth: true } } : {}),
      },
      headers: Object.keys(headers).length ? headers : undefined,
      footers: Object.keys(footers).length ? footers : undefined,
      children: children.length ? children : [new d.Paragraph("")],
    });
  }

  const styles = docxStyles(sections[0].sheet, ctx);
  report.fonts = [...ctx.fonts].sort();
  if (report.fonts.length) report.limits.push(`Fonts are not embedded: ${report.fonts.join(", ")} must be installed where the document is opened.`);
  const lossy = [...report.fallbacks, ...report.unsupported, ...report.missing].filter((i) => i.lossy);
  if (mode === "strict" && lossy.length) {
    report.blocked = true;
    return { report };
  }

  const document = new d.Document({
    title,
    creator: "Markdown Studio",
    evenAndOddHeaderAndFooters: sections.some((s) => s.chain.some((m) => m.evenAndOdd)),
    features: ctx.usesToc ? { updateFields: true } : undefined,
    customProperties: Object.entries(fieldValues(ctx)).map(([name, value]) => ({ name, value })),
    styles,
    numbering: { config: numberingConfig() },
    sections: docxSections,
  });
  const buffer = await d.Packer.toBuffer(document);
  report.ok = true;
  return { buffer, report };
}

/* ------------------------------------------------------------------ */
/* Styles and numbering                                                */
/* ------------------------------------------------------------------ */

function runOptions(run: RunProps, theme: Theme, fonts?: Set<string>): d.IRunStylePropertiesOptions {
  const font = resolveFont(run.font, theme);
  if (font && fonts) fonts.add(font);
  const color = resolveColor(run.color, theme);
  const highlight = resolveColor(run.highlight, theme);
  return {
    ...(font ? { font } : {}),
    ...(run.size ? { size: ptToHalfPt(run.size) } : {}),
    ...(color ? { color } : {}),
    ...(highlight ? { shading: { type: d.ShadingType.CLEAR, fill: highlight, color: "auto" } } : {}),
    ...(run.bold !== undefined ? { bold: run.bold } : {}),
    ...(run.italic !== undefined ? { italics: run.italic } : {}),
    ...(run.underline ? { underline: {} } : {}),
    ...(run.strike ? { strike: true } : {}),
    ...(run.caps ? { allCaps: true } : {}),
    ...(run.smallCaps ? { smallCaps: true } : {}),
  };
}

function paragraphOptions(p: ParagraphProps): d.IParagraphStylePropertiesOptions {
  const lineSpacing = p.lineSpacing ? Math.round(p.lineSpacing * 240) : undefined;
  return {
    ...(p.align ? { alignment: ALIGN[p.align] } : {}),
    ...(p.spaceBefore !== undefined || p.spaceAfter !== undefined || lineSpacing
      ? { spacing: { ...(p.spaceBefore !== undefined ? { before: ptToTwip(p.spaceBefore) } : {}), ...(p.spaceAfter !== undefined ? { after: ptToTwip(p.spaceAfter) } : {}), ...(lineSpacing ? { line: lineSpacing, lineRule: d.LineRuleType.AUTO } : {}) } }
      : {}),
    ...(p.indentLeft || p.indentRight || p.firstLine
      ? { indent: { ...(p.indentLeft ? { left: ptToTwip(p.indentLeft) } : {}), ...(p.indentRight ? { right: ptToTwip(p.indentRight) } : {}), ...(p.firstLine && p.firstLine > 0 ? { firstLine: ptToTwip(p.firstLine) } : {}), ...(p.firstLine && p.firstLine < 0 ? { hanging: ptToTwip(-p.firstLine) } : {}) } }
      : {}),
    ...(p.keepWithNext ? { keepNext: true } : {}),
    ...(p.keepTogether ? { keepLines: true } : {}),
    ...(p.pageBreakBefore ? { pageBreakBefore: true } : {}),
    ...(p.widowControl !== undefined ? { widowControl: p.widowControl } : {}),
    ...(p.tabs?.length ? { tabStops: p.tabs.map((t) => ({ type: ({ left: d.TabStopType.LEFT, center: d.TabStopType.CENTER, right: d.TabStopType.RIGHT, decimal: d.TabStopType.DECIMAL } as const)[t.align ?? "left"], position: ptToTwip(t.pos), ...(t.leader && t.leader !== "none" ? { leader: ({ dot: "dot", hyphen: "hyphen", underscore: "underscore" } as const)[t.leader] } : {}) })) } : {}),
  };
}

/** Word's own names for built-in styles, so Word recognizes them (navigation pane, TOC). */
const BUILTIN_NAMES: Record<string, string> = Object.fromEntries([
  ["Normal", "Normal"], ["Title", "Title"], ["Subtitle", "Subtitle"], ["Quote", "Quote"], ["Caption", "caption"], ["Header", "header"], ["Footer", "footer"], ["ListParagraph", "List Paragraph"], ["Hyperlink", "Hyperlink"], ["Strong", "Strong"], ["Emphasis", "Emphasis"],
  ...[1, 2, 3, 4, 5, 6].map((n) => [`Heading${n}`, `heading ${n}`]),
]);

function docxStyles(sheet: StyleSheet, ctx: Ctx): d.IStylesOptions {
  const paragraphStyles: d.IParagraphStyleOptions[] = [];
  const characterStyles: d.ICharacterStyleOptions[] = [];
  for (const s of sheet.styles.values()) {
    if (s.type === "table") continue;
    const base = {
      id: s.id,
      name: BUILTIN_NAMES[s.id] ?? s.name,
      ...(s.basedOn && sheet.styles.get(s.basedOn)?.type === s.type ? { basedOn: s.basedOn } : {}),
      quickFormat: true,
      run: runOptions(s.run, sheet.theme, ctx.fonts),
    };
    if (s.type === "character") characterStyles.push(base);
    else paragraphStyles.push({ ...base, ...(styleNext(s) ? { next: styleNext(s) } : {}), paragraph: { ...paragraphOptions(s.paragraph), ...(s.outlineLevel ? { outlineLevel: s.outlineLevel - 1 } : {}) } });
  }
  count(ctx, "styles", paragraphStyles.length + characterStyles.length);
  return { paragraphStyles, characterStyles };
}
const styleNext = (s: ResolvedStyle) => (s.outlineLevel || s.id === "Title" ? "Normal" : undefined);

function numberingConfig(): d.INumberingOptions["config"] {
  const levels = (ordered: boolean) =>
    Array.from({ length: 9 }, (_, level) => ({
      level,
      format: ordered ? ORDERED_FORMATS[level % 3] : d.LevelFormat.BULLET,
      text: ordered ? `%${level + 1}.` : BULLETS[level % 3],
      alignment: d.AlignmentType.LEFT,
      style: { paragraph: { indent: { left: ptToTwip(18 * (level + 1)), hanging: ptToTwip(14) } } },
    }));
  return [
    { reference: "ms-bullet", levels: levels(false) },
    { reference: "ms-ordered", levels: levels(true) },
  ];
}

function fieldValues(ctx: Ctx): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of ctx.section.chain) for (const [k, f] of Object.entries(m.fields ?? {})) if (f.default) out[k] = f.default;
  return { ...out, ...ctx.doc.meta?.fields };
}

/* ------------------------------------------------------------------ */
/* Blocks                                                              */
/* ------------------------------------------------------------------ */

interface BlockEnv {
  align?: string;
  quote?: boolean;
  list?: { ordered: boolean; level: number; instance: number; checked?: boolean | null };
  inTable?: boolean;
  style?: string;
  /** Runs (anchored drawings) the first paragraph emitted takes; emptied once taken. */
  lead?: { runs: Inline[] };
}

function styleOf(node: any, ctx: Ctx, env: BlockEnv): { id: string; props: BlockProps } {
  const props: BlockProps = node.data?.msBlock ?? {};
  let id = props.style ?? env.style ?? (env.quote ? "Quote" : env.list ? "ListParagraph" : defaultStyleFor(node));
  if (!ctx.sheet.styles.has(id)) {
    ctx.report.fallbacks.push({ kind: "style", message: `Style "${id}" is not defined; Normal used`, line: lineOf(node) });
    id = "Normal";
  }
  const allowed = ctx.section.chain.flatMap((m) => m.constraints?.allowedStyles ?? []);
  if (allowed.length && !allowed.includes(id)) ctx.report.diagnostics.push({ kind: "style", message: `Style "${id}" is not allowed by the master`, line: lineOf(node) });
  return { id, props };
}

function paragraph(node: any, runs: Inline[], ctx: Ctx, env: BlockEnv, extra: d.IParagraphOptions = {}): d.Paragraph {
  const { id, props } = styleOf(node, ctx, env);
  const { id: blockId, style: _style, ...local } = props;
  const lead = env.lead?.runs.splice(0) ?? [];
  const children: Inline[] = [...runs];
  if (blockId && !ctx.bookmarks.has(blockId)) {
    ctx.bookmarks.add(blockId);
    children.unshift(new d.Bookmark({ id: blockId, children: [] }) as unknown as Inline);
  }
  const para = new d.Paragraph({
    style: id,
    ...paragraphOptions({ ...(env.align ? { align: env.align as ParagraphProps["align"] } : {}), ...local }),
    ...(env.list ? { numbering: { reference: env.list.ordered ? "ms-ordered" : "ms-bullet", level: Math.min(8, env.list.level), ...(env.list.ordered ? { instance: env.list.instance } : {}) } } : {}),
    ...extra,
    children: [...lead, ...children],
  });
  count(ctx, node.type === "heading" ? "headings" : "paragraphs");
  return para;
}

async function blockChildren(nodes: any[], ctx: Ctx, env: BlockEnv): Promise<Child[]> {
  const out: Child[] = [];
  for (const node of nodes) out.push(...(await block(node, ctx, env)));
  return out;
}

async function block(node: any, ctx: Ctx, env: BlockEnv): Promise<Child[]> {
  switch (node.type) {
    case "heading":
    case "paragraph": {
      // A paragraph that is only a diagram image or a deck link keeps its paragraph.
      const runs = await inlines(node.children, ctx, {});
      if (env.list?.checked !== undefined && env.list.checked !== null) runs.unshift(new d.TextRun(env.list.checked ? "☑ " : "☐ "));
      return [paragraph(node, runs, ctx, env)];
    }
    case "blockquote": {
      const first = node.children[0];
      const alert = first?.type === "paragraph" && first.children[0]?.type === "text" ? /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/.exec(first.children[0].value) : null;
      if (alert) {
        first.children[0] = { ...first.children[0], value: first.children[0].value.slice(alert[0].length) };
        first.children.unshift({ type: "strong", children: [{ type: "text", value: `${alert[1][0]}${alert[1].slice(1).toLowerCase()}: ` }] });
      }
      return blockChildren(node.children, ctx, { ...env, quote: true });
    }
    case "list": {
      const out: Child[] = [];
      const instance = node.ordered ? ++ctx.orderedInstances : 0;
      const level = env.list ? env.list.level + 1 : 0;
      count(ctx, "lists");
      for (const item of node.children) {
        const [head, ...rest] = item.children;
        const itemEnv: BlockEnv = { ...env, list: { ordered: !!node.ordered, level, instance, checked: item.checked } };
        if (head) out.push(...(await block(head, ctx, itemEnv)));
        for (const child of rest) out.push(...(await block(child, ctx, child.type === "list" ? { ...env, list: { ordered: !!node.ordered, level, instance } } : { ...env, style: "ListParagraph", list: undefined })));
      }
      return out;
    }
    case "code":
      return codeBlock(node, ctx, env);
    case "math":
      ctx.report.fallbacks.push({ kind: "math", message: "Display math exported as linear Office Math text", line: lineOf(node) });
      return [paragraph(node, [new d.Math({ children: [new d.MathRun(node.value)] })], ctx, { ...env, align: "center" })];
    case "table":
      return [await table(node, ctx, env)];
    case "thematicBreak":
      return [new d.Paragraph({ border: { bottom: { color: "BFBFBF", space: 1, style: d.BorderStyle.SINGLE, size: 6 } }, children: [] })];
    case "alignGroup":
      return blockChildren(node.children, ctx, { ...env, align: node.align });
    case "columnsGroup":
      return [await columns(node, ctx, env)];
    case "columnGroup":
      return blockChildren(node.children, ctx, env);
    case "directiveGroup": {
      if (/embed:toc/i.test(node.open)) {
        ctx.usesToc = true;
        count(ctx, "fields");
        ctx.report.limits.push("The table of contents is a Word field: Word updates it when the document is opened (confirm the prompt) or with F9.");
        return [new d.TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-3" })];
      }
      return blockChildren(node.children, ctx, env);
    }
    case "studioObject":
      return blockChildren(node.children, ctx, env);
    case "html": {
      const value = String(node.value).trim();
      if (/^<!--[\s\S]*-->$/.test(value)) return [];
      const text = value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      ctx.report.unsupported.push({ kind: "html", message: `Raw HTML block exported as plain text: ${value.slice(0, 60)}`, line: lineOf(node), lossy: !text });
      return text ? [paragraph(node, [new d.TextRun(text)], ctx, env)] : [];
    }
    case "definition":
    case "footnoteDefinition":
      if (node.type === "footnoteDefinition") ctx.report.unsupported.push({ kind: "footnote", message: "Footnotes are exported as plain paragraphs", line: lineOf(node) });
      return node.type === "footnoteDefinition" ? blockChildren(node.children, ctx, env) : [];
    default:
      ctx.report.unsupported.push({ kind: node.type, message: `Unsupported block "${node.type}" skipped`, line: lineOf(node), lossy: true });
      return [];
  }
}

async function codeBlock(node: any, ctx: Ctx, env: BlockEnv): Promise<Child[]> {
  const lang = String(node.lang ?? "").toLowerCase();
  if (["gmc", "graphmodel", "mermaid"].includes(lang)) {
    const png = await ctx.opts.renderDiagram?.(lang, node.value, node.meta ?? "").catch(() => undefined);
    if (png) {
      const run = imageRun(png, "png", ctx, `${lang} diagram`, contentWidth(ctx.section.page));
      if (run) {
        ctx.report.fallbacks.push({ kind: "diagram", message: `${lang} diagram exported as a picture (its source stays in the Markdown)`, line: lineOf(node) });
        return [paragraph(node, [run], ctx, { ...env, align: "center" })];
      }
    }
    ctx.report.fallbacks.push({ kind: "diagram", message: `${lang} diagram could not be rendered; exported as its source code`, line: lineOf(node) });
  }
  count(ctx, "codeBlocks");
  const lines = String(node.value ?? "").split("\n");
  return lines.map((text, i) =>
    paragraph(node, [new d.TextRun({ text: text.replace(/\t/g, "    ") || " " })], ctx, { ...env, style: "Code" }, {
      shading: { type: d.ShadingType.CLEAR, fill: "F3F4F6", color: "auto" },
      ...(i < lines.length - 1 ? { keepNext: true } : {}),
    }),
  );
}

async function table(node: any, ctx: Ctx, env: BlockEnv): Promise<d.Table> {
  const style = ctx.sheet.styles.get(node.data?.msBlock?.style ?? "TableGrid")?.table ?? {};
  const border = { style: d.BorderStyle.SINGLE, size: Math.max(2, Math.round((style.borderWidth ?? 0.5) * 8)), color: (style.borderColor ?? "BFBFBF").replace("#", "") };
  const width = contentWidth(ctx.section.page);
  const colCount = Math.max(...node.children.map((r: any) => r.children.length));
  const pxWidths = (node.children[0]?.children ?? []).map((c: any) => Number(String(c.data?.hProperties?.colwidth ?? "").split(",")[0]) || 0);
  const fixed = pxWidths.reduce((a: number, b: number) => a + b, 0);
  const columnWidths = Array.from({ length: colCount }, (_, c) => (fixed ? ptToTwip((pxToPt(pxWidths[c] || fixed / colCount) / pxToPt(fixed)) * width) : ptToTwip(width / colCount)));
  const rows: d.TableRow[] = [];
  for (const [r, row] of node.children.entries()) {
    const header = r === 0;
    const cells: d.TableCell[] = [];
    for (const [c, cell] of row.children.entries()) {
      const align = node.align?.[c];
      const runs = await inlines(cell.children, ctx, header ? { bold: true, color: style.headerColor } : {});
      cells.push(new d.TableCell({
        width: { size: columnWidths[c] ?? columnWidths[0], type: d.WidthType.DXA },
        margins: { top: ptToTwip(style.cellPadding ?? 4), bottom: ptToTwip(style.cellPadding ?? 4), left: ptToTwip(style.cellPadding ?? 4), right: ptToTwip(style.cellPadding ?? 4) },
        ...(header && style.headerFill ? { shading: { type: d.ShadingType.CLEAR, fill: style.headerFill.replace("#", ""), color: "auto" } } : {}),
        children: [new d.Paragraph({ style: "Normal", spacing: { after: 0 }, ...(align ? { alignment: ALIGN[align] } : {}), children: runs })],
      }));
    }
    rows.push(new d.TableRow({ tableHeader: header, cantSplit: true, children: cells }));
  }
  count(ctx, "tables");
  return new d.Table({
    rows,
    columnWidths,
    width: { size: columnWidths.reduce((a, b) => a + b, 0), type: d.WidthType.DXA },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    ...(env.align === "center" ? { alignment: d.AlignmentType.CENTER } : {}),
  });
}

/** Side-by-side Markdown column containers: a borderless one-row layout table (not Word section columns). */
async function columns(node: any, ctx: Ctx, env: BlockEnv): Promise<d.Table> {
  const cols = node.children.filter((c: any) => c.type === "columnGroup");
  const total = cols.reduce((a: number, c: any) => a + (c.flex || 1), 0) || 1;
  const width = contentWidth(ctx.section.page);
  const none = { style: d.BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const cells: d.TableCell[] = [];
  for (const col of cols) {
    const children = (await blockChildren(col.children, ctx, env)).filter((c): c is d.Paragraph | d.Table => !(c instanceof d.TableOfContents));
    cells.push(new d.TableCell({ width: { size: ptToTwip((width * (col.flex || 1)) / total), type: d.WidthType.DXA }, children: children.length ? children : [new d.Paragraph("")] }));
  }
  ctx.report.fallbacks.push({ kind: "columns", message: "Side-by-side column container exported as a borderless layout table", line: lineOf(node) });
  return new d.Table({ rows: [new d.TableRow({ children: cells })], width: { size: ptToTwip(width), type: d.WidthType.DXA }, borders: { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none } });
}

/* ------------------------------------------------------------------ */
/* Inline content                                                      */
/* ------------------------------------------------------------------ */

interface RunEnv extends d.IRunOptions {
  style?: string;
}

async function inlines(nodes: any[], ctx: Ctx, env: RunEnv): Promise<Inline[]> {
  const out: Inline[] = [];
  const htmlStack: string[] = [];
  for (const node of nodes) {
    const tagEnv: RunEnv = { ...env, ...(htmlStack.includes("sub") ? { subScript: true } : {}), ...(htmlStack.includes("sup") ? { superScript: true } : {}), ...(htmlStack.includes("u") ? { underline: {} } : {}) };
    switch (node.type) {
      case "text":
        out.push(...textRuns(node.value, tagEnv));
        break;
      case "strong":
        out.push(...(await inlines(node.children, ctx, { ...tagEnv, bold: true })));
        break;
      case "emphasis":
        out.push(...(await inlines(node.children, ctx, { ...tagEnv, italics: true })));
        break;
      case "delete":
        out.push(...(await inlines(node.children, ctx, { ...tagEnv, strike: true })));
        break;
      case "inlineCode":
        out.push(new d.TextRun({ ...tagEnv, text: node.value, style: "InlineCode", font: "Consolas", shading: { type: d.ShadingType.CLEAR, fill: "F3F4F6", color: "auto" } }));
        break;
      case "break":
        out.push(new d.TextRun({ ...tagEnv, break: 1 }));
        break;
      case "inlineMath":
        ctx.report.fallbacks.push({ kind: "math", message: "Inline math exported as linear Office Math text", line: lineOf(node) });
        out.push(new d.Math({ children: [new d.MathRun(node.value)] }));
        break;
      case "highlight": {
        const fill = HIGHLIGHT_FILL[node.color] ?? HIGHLIGHT_FILL.yellow;
        out.push(...(await inlines(node.children, ctx, { ...tagEnv, shading: { type: d.ShadingType.CLEAR, fill, color: "auto" } })));
        break;
      }
      case "styledSpan": {
        const css = Object.fromEntries(String(node.style ?? "").split(";").filter(Boolean).map((decl: string) => decl.split(":").map((s) => s.trim())));
        const run: RunProps = {
          ...(css.color ? { color: cssColor(css.color) } : {}),
          ...(css["background-color"] ? { highlight: cssColor(css["background-color"]) } : {}),
          ...(css["font-size"] ? { size: cssSize(css["font-size"]) } : {}),
          ...(css["font-family"] ? { font: css["font-family"].split(",")[0].replace(/["']/g, "").trim() } : {}),
        };
        const styleId = node.msStyle && ctx.sheet.styles.get(node.msStyle)?.type === "character" ? node.msStyle : undefined;
        if (node.msStyle && !styleId) ctx.report.fallbacks.push({ kind: "style", message: `Character style "${node.msStyle}" is not defined`, line: lineOf(node) });
        out.push(...(await inlines(node.children, ctx, { ...tagEnv, ...(runOptions(run, ctx.theme, ctx.fonts) as RunEnv), ...(styleId ? { style: styleId } : {}) })));
        break;
      }
      case "link":
      case "linkReference": {
        const url = node.url ?? ctx.doc.blocks.find((b) => b.type === "definition" && b.identifier === node.identifier)?.url ?? "";
        const children = (await inlines(node.children, ctx, { ...tagEnv, style: "Hyperlink" })).filter((c): c is d.TextRun => c instanceof d.TextRun);
        count(ctx, "hyperlinks");
        if (url.startsWith("#")) out.push(new d.InternalHyperlink({ anchor: url.slice(1), children }));
        else if (url) out.push(new d.ExternalHyperlink({ link: url, children }));
        else out.push(...children);
        break;
      }
      case "image":
      case "imageReference": {
        const run = await markdownImage(node, ctx, contentWidth(ctx.section.page));
        if (run) out.push(run);
        break;
      }
      case "html": {
        const tag = /^<(\/?)(sub|sup|u|ins|br|kbd)\b[^>]*>$/i.exec(String(node.value).trim());
        if (tag?.[2].toLowerCase() === "br") out.push(new d.TextRun({ break: 1 }));
        else if (tag) {
          const name = tag[2].toLowerCase() === "ins" ? "u" : tag[2].toLowerCase();
          if (tag[1]) htmlStack.splice(htmlStack.lastIndexOf(name), 1);
          else htmlStack.push(name);
        } else if (!/^<!--/.test(String(node.value))) ctx.report.unsupported.push({ kind: "html", message: `Inline HTML ${String(node.value).slice(0, 40)} dropped`, line: lineOf(node) });
        break;
      }
      default:
        if (node.children) out.push(...(await inlines(node.children, ctx, tagEnv)));
        else if (typeof node.value === "string") out.push(...textRuns(node.value, tagEnv));
    }
  }
  return out;
}

/** Text with `{{field}}`-free content; tabs become Word tabs. */
function textRuns(text: string, env: RunEnv): d.TextRun[] {
  return text.split("\t").flatMap((part, i) => [...(i ? [new d.TextRun({ ...env, children: [new d.Tab()] })] : []), ...(part ? [new d.TextRun({ ...env, text: part })] : [])]);
}

const HIGHLIGHT_FILL: Record<string, string> = { yellow: "FBF3DB", red: "FDEBEC", orange: "FBECDD", green: "EDF3EC", blue: "E7F3F8", purple: "F4F0F7", pink: "FAF1F5", gray: "F1F1EF" };
const cssColor = (v: string) => {
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(v);
  return rgb ? rgb.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, "0")).join("").toUpperCase() : v;
};
const cssSize = (v: string) => {
  const m = /^([\d.]+)\s*(pt|px)?$/i.exec(v);
  if (!m) return undefined;
  return m[2]?.toLowerCase() === "px" ? pxToPt(Number(m[1])) : Number(m[1]);
};

async function markdownImage(node: any, ctx: Ctx, maxWidth: number): Promise<Inline | undefined> {
  const url = String(node.url ?? ctx.doc.blocks.find((b) => b.type === "definition" && b.identifier === node.identifier)?.url ?? "");
  const alt = String(node.alt ?? "");
  if (/^https?:/i.test(url)) {
    ctx.report.missing.push({ kind: "image", message: `Remote image ${url} is not downloaded; its alt text is used`, line: lineOf(node), lossy: true });
    return new d.TextRun({ text: alt ? `[${alt}]` : "[image]", italics: true });
  }
  const data = url ? await ctx.opts.readAsset(decodeURI(url.split(/[?#]/)[0]), "document") : undefined;
  if (!data) {
    ctx.report.missing.push({ kind: "image", message: `Image ${url || "(no source)"} was not found`, line: lineOf(node), lossy: true });
    return new d.TextRun({ text: alt ? `[${alt}]` : "[image]", italics: true });
  }
  const type = imageType(data);
  if (!type) {
    ctx.report.unsupported.push({ kind: "image", message: `Image ${url}: only PNG, JPEG, GIF and BMP are exported`, line: lineOf(node), lossy: true });
    return new d.TextRun({ text: alt ? `[${alt}]` : "[image]", italics: true });
  }
  return imageRun(data, type, ctx, alt, maxWidth);
}

function imageType(data: Uint8Array): "png" | "jpg" | "gif" | "bmp" | undefined {
  if (data[0] === 0x89 && data[1] === 0x50) return "png";
  if (data[0] === 0xff && data[1] === 0xd8) return "jpg";
  if (data[0] === 0x47 && data[1] === 0x49) return "gif";
  if (data[0] === 0x42 && data[1] === 0x4d) return "bmp";
  return undefined;
}

function imageRun(data: Uint8Array, type: "png" | "jpg" | "gif" | "bmp", ctx: Ctx, alt: string, maxWidth: number, floating?: d.IFloating, box?: { width: number; height: number }): d.ImageRun | undefined {
  const size = imageSize(data);
  let width = box?.width ?? (size ? pxToPt(size.width) : 200);
  let height = box?.height ?? (size ? pxToPt(size.height) : 150);
  if (!box && width > maxWidth) {
    height = (height * maxWidth) / width;
    width = maxWidth;
  }
  const maxHeight = ctx.section.page.height - ctx.section.page.margins.top - ctx.section.page.margins.bottom;
  if (!box && height > maxHeight) {
    width = (width * maxHeight) / height;
    height = maxHeight;
  }
  count(ctx, "images");
  return new d.ImageRun({ type, data, transformation: { width: ptToDocxPx(width), height: ptToDocxPx(height) }, altText: { name: alt || "image", description: alt, title: alt }, ...(floating ? { floating } : {}) });
}

/* ------------------------------------------------------------------ */
/* Positioned objects                                                  */
/* ------------------------------------------------------------------ */

function floatingOf(o: ObjectDescriptor, z: number): d.IFloating {
  const page = o.placement === "page";
  const relH = page ? (o.relativeTo === "page" ? d.HorizontalPositionRelativeFrom.PAGE : d.HorizontalPositionRelativeFrom.MARGIN) : d.HorizontalPositionRelativeFrom.COLUMN;
  const relV = page ? (o.relativeTo === "page" ? d.VerticalPositionRelativeFrom.PAGE : d.VerticalPositionRelativeFrom.MARGIN) : d.VerticalPositionRelativeFrom.PARAGRAPH;
  const wrap = page || o.plane === "behind" ? "none" : (o.wrap ?? "square");
  return {
    horizontalPosition: { relative: relH, offset: ptToEmu(o.box.x) },
    verticalPosition: { relative: relV, offset: ptToEmu(o.box.y) },
    allowOverlap: true,
    behindDocument: o.plane === "behind",
    lockAnchor: !!o.locked?.geometry,
    wrap: { type: wrap === "square" ? d.TextWrappingType.SQUARE : wrap === "topBottom" ? d.TextWrappingType.TOP_AND_BOTTOM : d.TextWrappingType.NONE, ...(wrap === "square" ? { side: d.TextWrappingSide.BOTH_SIDES } : {}) },
    zIndex: z,
  };
}

const line = (style: ObjectDescriptor["style"], theme: Theme) => {
  if (style?.line === null) return undefined;
  const color = resolveColor(style?.line ?? undefined, theme) ?? "1B1C1F";
  return { color, width: style?.lineWidth ?? 1, ...(style?.dash && style.dash !== "solid" ? { dash: style.dash } : {}), ...(style?.startArrow && style.startArrow !== "none" ? { startArrow: style.startArrow } : {}), ...(style?.endArrow && style.endArrow !== "none" ? { endArrow: style.endArrow } : {}) } as any;
};
const fill = (style: ObjectDescriptor["style"], theme: Theme) => (style?.fill === null ? undefined : resolveColor(style?.fill ?? undefined, theme));

async function textBoxParagraphs(o: StudioObjectRef, ctx: Ctx): Promise<d.Paragraph[]> {
  const c = o.descriptor!;
  // Master text boxes keep their text in the descriptor; placeholders become the matching Word field.
  if (!o.body.length && (c.text !== undefined || c.placeholder)) return [masterTextParagraph(c, ctx)];
  const kids = await blockChildren(o.body, ctx, {});
  return kids.filter((k): k is d.Paragraph => k instanceof d.Paragraph);
}

/** Floating runs for the objects anchored at one block. Connected objects export as one group (Word keeps connectors attached inside a group). */
async function drawingRuns(objs: StudioObjectRef[], ctx: Ctx, root: "document" | { master?: string } = "document"): Promise<Inline[]> {
  const out: Inline[] = [];
  const byId = new Map(objs.map((o) => [o.id, o]));
  // Group membership: explicit group path, else connector components.
  const unit = new Map<string, string>();
  for (const o of objs) unit.set(o.id, groupParts(o.descriptor!.group)[0] ? `g:${groupParts(o.descriptor!.group)[0]}` : `o:${o.id}`);
  for (const o of objs) {
    const c = o.descriptor!;
    if (c.type !== "connector") continue;
    const ends = [c.from?.id, c.to?.id].filter((id): id is string => !!id && byId.has(id));
    if (ends.length !== 2) {
      ctx.report.unsupported.push({ kind: "connector", message: `Connector "${o.id}" joins objects anchored elsewhere (or missing); not exported`, objectId: o.id, lossy: true });
      unit.delete(o.id);
      continue;
    }
    const target = unit.get(ends[0])!;
    for (const id of [o.id, ends[1]]) {
      const from = unit.get(id)!;
      for (const [k, v] of unit) if (v === from) unit.set(k, target);
    }
  }
  const units = new Map<string, StudioObjectRef[]>();
  for (const o of objs) {
    const u = unit.get(o.id);
    if (!u) continue;
    units.set(u, [...(units.get(u) ?? []), o]);
  }
  let z = 1;
  for (const [key, members] of units) {
    const sorted = [...members].sort((a, b) => (a.descriptor!.z ?? 0) - (b.descriptor!.z ?? 0));
    if (sorted.length === 1 && sorted[0].descriptor!.type !== "connector") {
      const run = await singleDrawing(sorted[0], ctx, z++, root);
      if (run) out.push(run);
      continue;
    }
    const boxes = sorted.filter((o) => o.descriptor!.type !== "connector").map((o) => o.descriptor!.box);
    const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
    const x1 = Math.max(...boxes.map((b) => b.x + b.width)), y1 = Math.max(...boxes.map((b) => b.y + b.height));
    const children: any[] = [];
    for (const o of sorted) {
      const c = o.descriptor!;
      const transformation = { width: ptToDocxPx(c.box.width), height: ptToDocxPx(c.box.height), offset: { left: ptToDocxPx(c.box.x - x0), top: ptToDocxPx(c.box.y - y0) }, ...(c.rotation ? { rotation: c.rotation } : {}) };
      if (c.type === "connector") {
        children.push({ type: "connector", from: c.from!.id, to: c.to!.id, route: c.route ?? "straight", line: line({ endArrow: "triangle", ...c.style }, ctx.theme), altText: { name: c.name ?? o.id } });
        count(ctx, "connectors");
      } else if (c.type === "image") {
        const img = await objectImage(o, ctx, root);
        if (img) children.push({ type: "picture", id: o.id, image: { type: img.type, data: img.data }, transformation, altText: { name: c.name ?? o.id, description: img.alt } });
      } else {
        children.push({ type: SHAPES[c.shape ?? "rect"] ?? "rectangle", id: o.id, transformation, fill: fill(c.style, ctx.theme), line: line(c.style, ctx.theme), children: c.type === "textbox" || o.body.length ? await textBoxParagraphs(o, ctx) : undefined, altText: { name: c.name ?? o.id } });
        count(ctx, c.type === "textbox" ? "textBoxes" : "shapes");
      }
    }
    const anchor = { ...sorted.find((o) => o.descriptor!.type !== "connector")!.descriptor!, box: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } };
    if (!children.length) continue;
    out.push(new ShapeGroupRun({ children, transformation: { width: ptToDocxPx(x1 - x0), height: ptToDocxPx(y1 - y0) }, floating: floatingOf(anchor, z++) as any, altText: { name: key.slice(2) } }));
    count(ctx, "groups");
    if (key.startsWith("o:")) ctx.report.diagnostics.push({ kind: "group", message: `Objects joined by connectors (${sorted.map((o) => o.id).join(", ")}) export as one drawing group so Word keeps the connectors attached` });
  }
  return out;
}

async function objectImage(o: StudioObjectRef, ctx: Ctx, root: "document" | { master?: string }): Promise<{ data: Uint8Array; type: "png" | "jpg" | "gif" | "bmp"; alt: string } | undefined> {
  const imageNode = findImage(o.body);
  const src = imageNode?.url ?? o.descriptor!.src;
  const alt = imageNode?.alt ?? o.descriptor!.alt ?? "";
  if (!src) return undefined;
  const data = await ctx.opts.readAsset(decodeURI(String(src)), root === "document" || !root.master ? "document" : { master: root.master });
  if (!data) {
    ctx.report.missing.push({ kind: "image", message: `Image ${src} of object "${o.id}" was not found`, objectId: o.id, lossy: true });
    return undefined;
  }
  const type = imageType(data);
  if (!type) {
    ctx.report.unsupported.push({ kind: "image", message: `Image ${src} of object "${o.id}" is not PNG/JPEG/GIF/BMP`, objectId: o.id, lossy: true });
    return undefined;
  }
  return { data, type, alt };
}

function findImage(nodes: any[]): any {
  for (const n of nodes) {
    if (n.type === "image") return n;
    const hit = n.children && findImage(n.children);
    if (hit) return hit;
  }
  return undefined;
}

async function singleDrawing(o: StudioObjectRef, ctx: Ctx, z: number, root: "document" | { master?: string }): Promise<Inline | undefined> {
  const c = o.descriptor!;
  const floating = c.placement === "inline" ? undefined : floatingOf(c, c.z ?? z);
  if (c.type === "image") {
    const img = await objectImage(o, ctx, root);
    if (!img) return undefined;
    const run = imageRun(img.data, img.type, ctx, img.alt, Infinity, floating, c.box);
    count(ctx, "anchoredImages");
    return run;
  }
  const children = c.type === "textbox" || o.body.length ? await textBoxParagraphs(o, ctx) : undefined;
  count(ctx, c.type === "textbox" ? "textBoxes" : "shapes");
  return new ShapeRun({
    type: (SHAPES[c.shape ?? "rect"] ?? "rectangle") as any,
    transformation: { width: ptToDocxPx(c.box.width), height: ptToDocxPx(Math.max(c.box.height, c.shape === "line" ? 0 : 1)), ...(c.rotation ? { rotation: c.rotation } : {}) },
    fill: fill(c.style ?? (c.type === "textbox" ? { fill: null } : undefined), ctx.theme),
    line: line(c.style, ctx.theme),
    ...(children ? { children } : {}),
    ...(floating ? { floating: floating as any } : {}),
    altText: { name: c.name ?? o.id },
  }) as unknown as Inline;
}

/**
 * Text of a master box. A text placeholder carries the document's own text (frontmatter field of
 * its key; the title falls back to the document title); date, page and page count become fields.
 */
function masterTextParagraph(c: ObjectDescriptor, ctx: Ctx): d.Paragraph {
  const title = ctx.opts.title ?? ctx.doc.title ?? "";
  const fields = fieldValues(ctx);
  const color = c.style?.color ? resolveColor(c.style.color, ctx.theme) : undefined;
  const run: d.IRunOptions = { ...(c.style?.fontSize ? { size: c.style.fontSize * 2 } : {}), ...(color ? { color } : {}) };
  const alignment = c.style?.align === "center" ? d.AlignmentType.CENTER : c.style?.align === "right" ? d.AlignmentType.RIGHT : c.style?.align === "justify" ? d.AlignmentType.JUSTIFIED : undefined;
  const ph = c.placeholder && placeholderKey(c.placeholder);
  let children: Inline[];
  if (ph === "date") (children = [new d.SimpleField('DATE \\@ "d MMMM yyyy"', new Date().toLocaleDateString())]), count(ctx, "fields");
  else if (ph === "page" || ph === "pages") (children = [new d.TextRun({ ...run, children: [ph === "page" ? d.PageNumber.CURRENT : d.PageNumber.TOTAL_PAGES] })]), count(ctx, "fields");
  else if (ph) children = [new d.TextRun({ ...run, text: placeholderValue(ph, fields, title) })];
  else children = (storyParser.parse(c.text ?? "") as any).children.flatMap((n: any) => withFields(n, title, fields, ctx, run));
  return new d.Paragraph({ ...(alignment ? { alignment } : {}), spacing: { before: 0, after: 0 }, children });
}

/* ------------------------------------------------------------------ */
/* Header / footer stories                                             */
/* ------------------------------------------------------------------ */

/** Recurring drawings of a story (letterhead logos…), read from the master that defines the story. */
async function storyDrawings(story: StoryDef | undefined, key: "headers" | "footers", kind: "default" | "first" | "even", section: ResolvedSection, ctx: Ctx): Promise<Inline[]> {
  if (!story?.objects) return [];
  const owner = [...section.chain].reverse().find((m) => m[key]?.[kind] === story) ?? section.chain[section.chain.length - 1];
  return drawingRuns(Object.entries(story.objects).map(([id, descriptor]) => ({ id, descriptor, body: [], anchor: 0, line: 0 })), ctx, { master: owner?.id });
}

async function storyParagraphs(story: StoryDef | undefined, ctx: Ctx, title: string, style: "Header" | "Footer", drawings: Inline[]): Promise<d.Paragraph[]> {
  const tree = storyParser.parse(story?.markdown ?? "") as any;
  const fields = fieldValues(ctx);
  const out: d.Paragraph[] = [];
  const paragraphs = tree.children.filter((n: any) => n.type === "paragraph" || n.type === "heading");
  if (!paragraphs.length) paragraphs.push({ type: "paragraph", children: [] });
  // The story's own style / alignment (`blocks.<id>`, a master story's `block`) override Header / Footer.
  const align = story?.block?.align;
  paragraphs.forEach((node: any, i: number) => out.push(new d.Paragraph({ style: story?.block?.style ?? style, ...(align ? { alignment: ALIGN[align] } : {}), children: [...(i === 0 ? drawings : []), ...withFields(node, title, fields, ctx)] })));
  return out;
}

/** Story text with `{{page}}`, `{{pages}}`, `{{title}}`, `{{field:x}}` turned into Word fields. */
function withFields(node: any, title: string, fields: Record<string, string>, ctx: Ctx, base: d.IRunOptions = {}): Inline[] {
  const out: Inline[] = [];
  const visit = (n: any, env: d.IRunOptions) => {
    if (n.type === "text") {
      for (const part of String(n.value).split(/(\{\{\s*(?:page|pages|title|field:[\w-]+)\s*\}\})/)) {
        if (!part) continue;
        const f = /^\{\{\s*(page|pages|title|field:([\w-]+))\s*\}\}$/.exec(part);
        if (!f) out.push(new d.TextRun({ ...env, text: part }));
        else if (f[1] === "page") out.push(new d.TextRun({ ...env, children: [d.PageNumber.CURRENT] }));
        else if (f[1] === "pages") out.push(new d.TextRun({ ...env, children: [d.PageNumber.TOTAL_PAGES] }));
        else if (f[1] === "title") out.push(new d.SimpleField("TITLE", title));
        else out.push(new d.SimpleField(`DOCPROPERTY ${f[2]}`, fields[f[2]] ?? ""));
        if (f) count(ctx, "fields");
      }
      return;
    }
    if (n.type === "break") return void out.push(new d.TextRun({ break: 1 }));
    const next = n.type === "strong" ? { ...env, bold: true } : n.type === "emphasis" ? { ...env, italics: true } : env;
    for (const c of n.children ?? []) visit(c, next);
  };
  visit(node, base);
  return out;
}

export { plainText };
