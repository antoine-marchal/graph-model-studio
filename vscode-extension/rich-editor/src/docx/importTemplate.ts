/**
 * Corporate Word template (.docx / .dotx) → Markdown Studio masters. Reads the OOXML parts
 * directly (styles with document defaults and `basedOn` chains, theme colors / fonts, numbering,
 * section properties of every section, first / even / default header and footer stories with
 * their fields and pictures) and reports what it could not take over. Pages are not stored in a
 * DOCX: masters are built from section designs, never from rendered pages, and sample body
 * content is never treated as page furniture.
 *
 * The package is untrusted: size / entry / expansion limits, no path traversal, no DOCTYPE
 * (entity expansion), no macro execution, external relationships are listed but never fetched.
 */
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { posix } from "node:path";
import { createHash } from "node:crypto";
import { twipToPt, emuToPt, round2, WORD_LINE_PITCH } from "../../document/units";
import { resolvePage } from "../../document/schema";
import type { ImportReportItem, MasterDef, ObjectDescriptor, ParagraphProps, RunProps, StoryDef, StorySet, StyleDef, ThemeSlot } from "../../document/schema";

export const IMPORT_LIMITS = { maxFileBytes: 50 * 1024 * 1024, maxEntries: 3000, maxUncompressedBytes: 300 * 1024 * 1024, maxRatio: 200, maxXmlBytes: 30 * 1024 * 1024 };

export class TemplateImportError extends Error {}

export interface ImportedTemplate {
  /** Styles, theme, numbering and the first section's page design. */
  family: MasterDef;
  /** One master per further distinct section design, based on the family. */
  variants: MasterDef[];
  /** Pictures used by stories, by file name (saved under the master's `assets/`). */
  assets: Map<string, Uint8Array>;
  report: ImportReportItem[];
  fonts: string[];
  /** Per section (document order): index of its design in `[family, ...variants]`. */
  sectionDesigns: number[];
}

export const attrs = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", allowBooleanAttributes: true, processEntities: true, htmlEntities: false });
export const ordered = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", allowBooleanAttributes: true, preserveOrder: true, trimValues: false, processEntities: true, htmlEntities: false });

const isUnsafeEntryName = (name: string) =>
  name.includes("\0") || name.includes("\\") || name.startsWith("/") || /^[a-zA-Z]:/.test(name) || name.split("/").some((seg) => seg === ".." || seg === ".");

export async function loadPackage(data: Uint8Array): Promise<JSZip> {
  if (data.byteLength > IMPORT_LIMITS.maxFileBytes) throw new TemplateImportError(`File too large (${data.byteLength} bytes, limit ${IMPORT_LIMITS.maxFileBytes})`);
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new TemplateImportError("Not a Word package (the ZIP container could not be read)");
  }
  const names = Object.keys(zip.files);
  if (names.length > IMPORT_LIMITS.maxEntries) throw new TemplateImportError(`Too many entries in the package (${names.length})`);
  let total = 0;
  for (const name of names) {
    if (isUnsafeEntryName(name)) throw new TemplateImportError(`Unsafe entry name in the package: ${JSON.stringify(name)}`);
    const info = (zip.files[name] as unknown as { _data?: { uncompressedSize?: number; compressedSize?: number } })._data;
    const u = info?.uncompressedSize ?? 0;
    const c = info?.compressedSize ?? 0;
    total += u;
    if (c > 0 && u / c > IMPORT_LIMITS.maxRatio && u > 5 * 1024 * 1024) throw new TemplateImportError(`Suspicious compression ratio for ${name}`);
  }
  if (total > IMPORT_LIMITS.maxUncompressedBytes) throw new TemplateImportError(`Uncompressed content too large (${total} bytes)`);
  if (!zip.file("[Content_Types].xml") || !zip.file("word/document.xml")) throw new TemplateImportError("Not a Word document or template (word/document.xml missing)");
  return zip;
}

export async function xml(zip: JSZip, part: string, parser = attrs): Promise<any> {
  const f = zip.file(part);
  if (!f) return null;
  const text = await f.async("string");
  if (text.length > IMPORT_LIMITS.maxXmlBytes) throw new TemplateImportError(`${part} is too large`);
  if (/<!DOCTYPE/i.test(text)) throw new TemplateImportError(`${part} declares a DOCTYPE (entity expansion is not allowed)`);
  try {
    return parser.parse(text);
  } catch (err) {
    throw new TemplateImportError(`${part} is not valid XML (${err instanceof Error ? err.message : String(err)})`);
  }
}

export interface Rel {
  id: string;
  type: string;
  target: string;
  external: boolean;
}

export async function rels(zip: JSZip, part: string): Promise<Map<string, Rel>> {
  const relPart = posix.join(posix.dirname(part), "_rels", `${posix.basename(part)}.rels`);
  const parsed = await xml(zip, relPart);
  const out = new Map<string, Rel>();
  for (const r of arr(parsed?.Relationships?.Relationship)) {
    const external = r["@_TargetMode"] === "External";
    const raw = String(r["@_Target"] ?? "");
    // Targets are relative to the part's folder, or absolute from the package root ("/word/…").
    const target = external ? raw : raw.startsWith("/") ? posix.normalize(raw.slice(1)) : posix.normalize(posix.join(posix.dirname(part), raw));
    if (!external && (target.startsWith("..") || isUnsafeEntryName(target))) continue;
    out.set(String(r["@_Id"]), { id: String(r["@_Id"]), type: String(r["@_Type"] ?? "").split("/").pop() ?? "", target, external });
  }
  return out;
}

export const arr = <T = any>(v: T | T[] | undefined | null): T[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
export const val = (node: any, key = "@_w:val"): string | undefined => (node && typeof node === "object" ? node[key] : undefined);
const on = (node: any): boolean | undefined => (node === undefined ? undefined : !["0", "false", "off"].includes(String(val(node) ?? "1")));
const num = (v: unknown): number | undefined => (v === undefined || v === "" || isNaN(Number(v)) ? undefined : Number(v));

const THEME_COLOR: Record<string, ThemeSlot> = {
  dark1: "dk1", light1: "lt1", dark2: "dk2", light2: "lt2", text1: "dk1", background1: "lt1", text2: "dk2", background2: "lt2",
  accent1: "accent1", accent2: "accent2", accent3: "accent3", accent4: "accent4", accent5: "accent5", accent6: "accent6", hyperlink: "hlink", followedHyperlink: "folHlink",
};

export function runProps(rPr: any, fonts: Set<string>): RunProps {
  if (!rPr) return {};
  const out: RunProps = {};
  const f = rPr["w:rFonts"];
  if (f) {
    const theme = f["@_w:asciiTheme"] ?? f["@_w:hAnsiTheme"];
    if (theme) out.font = /^major/.test(theme) ? "theme.heading" : "theme.body";
    else if (f["@_w:ascii"] ?? f["@_w:hAnsi"]) {
      out.font = f["@_w:ascii"] ?? f["@_w:hAnsi"];
      fonts.add(out.font!);
    }
  }
  const sz = num(val(rPr["w:sz"]));
  if (sz) out.size = sz / 2;
  const color = rPr["w:color"];
  if (color) {
    const theme = color["@_w:themeColor"];
    if (theme && THEME_COLOR[theme]) out.color = `theme.${THEME_COLOR[theme]}`;
    else if (/^[0-9A-F]{6}$/i.test(val(color) ?? "")) out.color = val(color)!.toUpperCase();
  }
  const shd = rPr["w:shd"]?.["@_w:fill"];
  if (shd && /^[0-9A-F]{6}$/i.test(shd)) out.highlight = shd.toUpperCase();
  for (const [key, prop] of [["w:b", "bold"], ["w:i", "italic"], ["w:strike", "strike"], ["w:caps", "caps"], ["w:smallCaps", "smallCaps"]] as const) {
    const v = on(rPr[key]);
    if (v !== undefined) out[prop] = v;
  }
  if (rPr["w:u"] && val(rPr["w:u"]) !== "none") out.underline = true;
  const spacing = num(val(rPr["w:spacing"]));
  if (spacing) out.spacing = twipToPt(spacing);
  return out;
}

export function paragraphProps(pPr: any): ParagraphProps & { outlineLevel?: number } {
  if (!pPr) return {};
  const out: ParagraphProps & { outlineLevel?: number } = {};
  const jc = val(pPr["w:jc"]);
  if (jc) out.align = jc === "both" || jc === "distribute" ? "justify" : jc === "end" ? "right" : jc === "start" ? "left" : (["left", "center", "right"].includes(jc) ? (jc as "left") : undefined);
  const sp = pPr["w:spacing"];
  if (sp) {
    if (num(sp["@_w:before"]) !== undefined) out.spaceBefore = twipToPt(Number(sp["@_w:before"]));
    if (num(sp["@_w:after"]) !== undefined) out.spaceAfter = twipToPt(Number(sp["@_w:after"]));
    if (num(sp["@_w:line"]) !== undefined && (sp["@_w:lineRule"] ?? "auto") === "auto") out.lineSpacing = round2(Number(sp["@_w:line"]) / 240);
    // Exact / at-least line heights (pt) become multiples once the font size is known (settleLineHeights).
    else if (num(sp["@_w:line"]) !== undefined) (out as LineExact).lineExact = { pt: twipToPt(Number(sp["@_w:line"])), atLeast: sp["@_w:lineRule"] === "atLeast" };
  }
  const ind = pPr["w:ind"];
  if (ind) {
    const left = num(ind["@_w:left"] ?? ind["@_w:start"]);
    const right = num(ind["@_w:right"] ?? ind["@_w:end"]);
    if (left) out.indentLeft = twipToPt(left);
    if (right) out.indentRight = twipToPt(right);
    if (num(ind["@_w:firstLine"])) out.firstLine = twipToPt(Number(ind["@_w:firstLine"]));
    if (num(ind["@_w:hanging"])) out.firstLine = -twipToPt(Number(ind["@_w:hanging"]));
  }
  for (const [key, prop] of [["w:keepNext", "keepWithNext"], ["w:keepLines", "keepTogether"], ["w:pageBreakBefore", "pageBreakBefore"], ["w:widowControl", "widowControl"]] as const) {
    const v = on(pPr[key]);
    if (v !== undefined) out[prop] = v;
  }
  const outline = num(val(pPr["w:outlineLvl"]));
  if (outline !== undefined && outline < 9) out.outlineLevel = outline + 1;
  return out;
}

type LineExact = { lineExact?: { pt: number; atLeast: boolean } };

/** Exact / at-least line heights → line spacing multiples of the font size (`size` pt). */
export function settleLineHeight(p: ParagraphProps | undefined, size: number): void {
  const exact = (p as LineExact | undefined)?.lineExact;
  if (!p || !exact) return;
  delete (p as LineExact).lineExact;
  // The editor multiplies line spacing by the font's line pitch (cssLineHeight): an exact height divides it out.
  const m = round2(exact.pt / Math.max(1, size) / WORD_LINE_PITCH);
  if (!exact.atLeast || m > 1) p.lineSpacing = m;
}

/** Settle every style's exact line height with the font size it inherits. */
function settleStyleLineHeights(styles: Record<string, StyleDef>): void {
  const sizeOf = (id: string | undefined, depth = 0): number => {
    const s = id ? styles[id] : undefined;
    return s?.run?.size ?? (s?.basedOn && depth < 12 ? sizeOf(s.basedOn, depth + 1) : styles.Normal?.run?.size ?? 11);
  };
  for (const s of Object.values(styles)) settleLineHeight(s.paragraph, sizeOf(s.id));
}

function compactProps<T extends object>(o: T): T | undefined {
  return Object.keys(o).length ? o : undefined;
}

/** Section properties of every section: paragraph-level sectPr (sections before the last), then the body's own. */
function sectionsOf(document: any): any[] {
  const body = document?.["w:document"]?.["w:body"];
  const out: any[] = [];
  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    for (const p of arr(node["w:p"])) if (p?.["w:pPr"]?.["w:sectPr"]) out.push(p["w:pPr"]["w:sectPr"]);
    for (const key of ["w:sdt", "w:sdtContent", "w:customXml"]) for (const child of arr(node[key])) walk(child);
  };
  walk(body);
  if (body?.["w:sectPr"]) out.push(body["w:sectPr"]);
  return out;
}

export const slug = (s: string) => s.toLowerCase().replace(/\.(docx|dotx)$/i, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "template";

export async function importTemplate(data: Uint8Array, fileName: string, now = new Date()): Promise<ImportedTemplate> {
  const zip = await loadPackage(data);
  const report: ImportReportItem[] = [];
  const fonts = new Set<string>();
  const add = (feature: string, status: ImportReportItem["status"], detail?: string, part?: string) => report.push({ feature, status, ...(detail ? { detail } : {}), ...(part ? { part } : {}) });

  if (zip.file("word/vbaProject.bin")) add("Macros (VBA project)", "unsupported", "Macros are never executed or kept.", "word/vbaProject.bin");
  const docRels = await rels(zip, "word/document.xml");
  // Part names vary (Office templates ship `theme11.xml`, `fontTable2.xml`…): follow the relationships.
  const partOf = (type: string, fallback: string) => [...docRels.values()].find((r) => r.type === type && !r.external)?.target ?? fallback;
  for (const r of docRels.values()) if (r.external && r.type !== "hyperlink") add("External relationship", "unsupported", `${r.type} → ${r.target} is not fetched.`, "word/_rels/document.xml.rels");
  if (zip.file(partOf("fontTable", "word/fontTable.xml")) && /w:embed(Regular|Bold|Italic)/.test((await zip.file(partOf("fontTable", "word/fontTable.xml"))!.async("string")) ?? "")) add("Embedded fonts", "unsupported", "Embedded fonts are not extracted (font licensing); install the fonts instead.", "word/fontTable.xml");

  // Font classes (roman / swiss / modern…) for the fallback of fonts that are not installed.
  const fontTable = await xml(zip, partOf("fontTable", "word/fontTable.xml"));
  const fontClasses: NonNullable<MasterDef["fontClasses"]> = {};
  for (const f of arr(fontTable?.["w:fonts"]?.["w:font"])) {
    const name = f["@_w:name"];
    const family = val(f["w:family"]);
    const fixed = val(f["w:pitch"]) === "fixed";
    if (name) fontClasses[name] = fixed || family === "modern" ? "mono" : family === "roman" ? "serif" : family === "script" ? "script" : "sans";
  }

  // Theme.
  const theme = await xml(zip, partOf("theme", "word/theme/theme1.xml"));
  const scheme = theme?.["a:theme"]?.["a:themeElements"];
  const colors: Partial<Record<ThemeSlot, string>> = {};
  for (const slot of ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"] as ThemeSlot[]) {
    const c = scheme?.["a:clrScheme"]?.[`a:${slot}`];
    const hex = c?.["a:srgbClr"]?.["@_val"] ?? c?.["a:sysClr"]?.["@_lastClr"];
    if (hex) colors[slot] = String(hex).toUpperCase();
  }
  const heading = scheme?.["a:fontScheme"]?.["a:majorFont"]?.["a:latin"]?.["@_typeface"];
  const bodyFont = scheme?.["a:fontScheme"]?.["a:minorFont"]?.["a:latin"]?.["@_typeface"];
  for (const f of [heading, bodyFont]) if (f) fonts.add(f);
  if (theme) add("Theme colors and fonts", "supported", `${Object.keys(colors).length} colors; headings ${heading ?? "?"}, body ${bodyFont ?? "?"}`, partOf("theme", "word/theme/theme1.xml"));
  else add("Theme", "unsupported", "No theme part; defaults are used.");

  // Styles: document defaults go into Normal.
  const stylesXml = await xml(zip, partOf("styles", "word/styles.xml"));
  const root = stylesXml?.["w:styles"];
  const styles: Record<string, StyleDef> = {};
  const defaultRun = runProps(root?.["w:docDefaults"]?.["w:rPrDefault"]?.["w:rPr"], fonts);
  const defaultPara = paragraphProps(root?.["w:docDefaults"]?.["w:pPrDefault"]?.["w:pPr"]);
  let skipped = 0;
  for (const s of arr(root?.["w:style"])) {
    const type = s["@_w:type"];
    const id = String(s["@_w:styleId"] ?? "");
    if (!id || !["paragraph", "character", "table"].includes(type)) {
      if (type === "numbering") skipped++;
      continue;
    }
    const { outlineLevel, ...paragraph } = paragraphProps(s["w:pPr"]);
    const def: StyleDef = {
      id,
      name: String(val(s["w:name"]) ?? id),
      type,
      ...(val(s["w:basedOn"]) ? { basedOn: val(s["w:basedOn"]) } : {}),
      ...(val(s["w:next"]) ? { next: val(s["w:next"]) } : {}),
      ...(outlineLevel ? { outlineLevel } : /^Heading([1-9])$/.test(id) ? { outlineLevel: Number(id.slice(7)) } : {}),
      ...(compactProps(paragraph) ? { paragraph } : {}),
      ...(compactProps(runProps(s["w:rPr"], fonts)) ? { run: runProps(s["w:rPr"], fonts) } : {}),
    };
    if (type === "table") {
      const b = s["w:tblPr"]?.["w:tblBorders"];
      const top = b?.["w:top"] ?? b?.["w:insideH"];
      const first = arr(s["w:tblStylePr"]).find((t) => t["@_w:type"] === "firstRow");
      def.table = {
        ...(top?.["@_w:color"] && top["@_w:color"] !== "auto" ? { borderColor: String(top["@_w:color"]).toUpperCase() } : {}),
        ...(num(top?.["@_w:sz"]) ? { borderWidth: Number(top["@_w:sz"]) / 8 } : {}),
        ...(first?.["w:tcPr"]?.["w:shd"]?.["@_w:fill"] && first["w:tcPr"]["w:shd"]["@_w:fill"] !== "auto" ? { headerFill: String(first["w:tcPr"]["w:shd"]["@_w:fill"]).toUpperCase() } : {}),
      };
    }
    if (id === "Normal" || s["@_w:default"] === "1" && type === "paragraph") {
      def.run = { ...defaultRun, ...def.run };
      def.paragraph = { ...defaultPara, ...def.paragraph };
    }
    styles[id] = def;
  }
  if (!styles.Normal) styles.Normal = { id: "Normal", name: "Normal", type: "paragraph", run: defaultRun, paragraph: defaultPara };
  settleStyleLineHeights(styles);
  const counts = { paragraph: 0, character: 0, table: 0 };
  for (const s of Object.values(styles)) counts[s.type]++;
  add("Named styles", "supported", `${counts.paragraph} paragraph, ${counts.character} character, ${counts.table} table styles with basedOn inheritance and document defaults`, "word/styles.xml");
  if (skipped) add("Numbering styles", "flattened", `${skipped} list styles reduced to bullet / numbering formats`, "word/styles.xml");
  if (counts.table) add("Table style details", "flattened", "Borders and header row shading are kept; banding, conditional cell formats and cell margins per region are not.", "word/styles.xml");

  // Numbering: bullet characters and ordered formats of the first lists defined.
  const numbering = await xml(zip, partOf("numbering", "word/numbering.xml"));
  const bullet: string[] = [];
  const orderedFormats: NonNullable<MasterDef["numbering"]>["ordered"] = [];
  // Lists the template uses (body or styles) first, then the rest in definition order.
  const usedNumIds = new Set([...(((await zip.file("word/document.xml")!.async("string")) + ((await zip.file("word/styles.xml")?.async("string")) ?? "")).matchAll(/<w:numId w:val="(\d+)"/g))].map((m) => m[1]));
  const usedAbstract = new Set(arr(numbering?.["w:numbering"]?.["w:num"]).filter((n) => usedNumIds.has(String(n["@_w:numId"]))).map((n) => String(val(n["w:abstractNumId"]))));
  const abstracts = arr(numbering?.["w:numbering"]?.["w:abstractNum"]);
  abstracts.sort((x, y) => Number(usedAbstract.has(String(y["@_w:abstractNumId"]))) - Number(usedAbstract.has(String(x["@_w:abstractNumId"]))));
  for (const abs of abstracts) {
    for (const lvl of arr(abs["w:lvl"]).slice(0, 3)) {
      const fmt = val(lvl["w:numFmt"]);
      if (fmt === "bullet" && bullet.length < 3) bullet.push(String(val(lvl["w:lvlText"]) ?? "•"));
      else if (fmt && ["decimal", "lowerLetter", "upperLetter", "lowerRoman", "upperRoman"].includes(fmt) && orderedFormats.length < 3) orderedFormats.push(fmt as "decimal");
    }
  }
  if (numbering) add("Numbering", "flattened", `Bullet characters (${bullet.join(" ") || "none"}) and ordered formats (${orderedFormats.join(", ") || "none"}); indents and restart rules use Markdown list nesting.`, "word/numbering.xml");

  const settings = await xml(zip, partOf("settings", "word/settings.xml"));
  const evenAndOdd = settings?.["w:settings"]?.["w:evenAndOddHeaders"] !== undefined;

  // Sections and their stories.
  const document = await xml(zip, "word/document.xml");
  const sects = sectionsOf(document);
  if (!sects.length) add("Section properties", "unsupported", "The document has no section properties; A4 defaults are used.");
  const assets = new Map<string, Uint8Array>();
  const storyCache = new Map<string, StoryDef>();
  const counter = { n: 0 };
  // Story text line height: the Header / Footer style's font size (else Normal's), Word's single spacing.
  const sizeOf = (id: string): number => styles[id]?.run?.size ?? (styles[id]?.basedOn && styles[id].basedOn !== id ? sizeOf(styles[id].basedOn!) : styles.Normal?.run?.size ?? 11);
  const readStory = async (rId: string, kind: "headers" | "footers", page: StoryPage): Promise<StoryDef | undefined> => {
    const rel = docRels.get(rId);
    if (!rel || rel.external) return undefined;
    // A story shared by sections is laid out on the first section's page that uses it.
    if (storyCache.has(rel.target)) return storyCache.get(rel.target);
    const line = round2(sizeOf(kind === "headers" ? "Header" : "Footer") * WORD_LINE_PITCH);
    const story = await parseStory(zip, rel.target, assets, add, counter, kind, page, line);
    storyCache.set(rel.target, story);
    return story;
  };
  type Design = { page: MasterDef["page"]; headers: StorySet; footers: StorySet; titlePage: boolean; signature: string; index: number };
  const designs: Design[] = [];
  const sectionDesigns: number[] = [];
  let prevHeaders: StorySet = {};
  let prevFooters: StorySet = {};
  for (const [index, s] of sects.entries()) {
    const pgSz = s["w:pgSz"];
    const pgMar = s["w:pgMar"];
    const w = num(pgSz?.["@_w:w"]);
    const h = num(pgSz?.["@_w:h"]);
    const landscape = pgSz?.["@_w:orient"] === "landscape" || (w !== undefined && h !== undefined && w > h);
    const page: MasterDef["page"] = {
      size: "custom",
      ...(w && h ? { width: twipToPt(Math.min(w, h)), height: twipToPt(Math.max(w, h)) } : {}),
      orientation: landscape ? "landscape" : "portrait",
      margins: Object.fromEntries((["top", "right", "bottom", "left", "header", "footer"] as const).filter((k) => num(pgMar?.[`@_w:${k}`]) !== undefined).map((k) => [k, twipToPt(Math.abs(Number(pgMar[`@_w:${k}`])))])),
      ...(num(s["w:cols"]?.["@_w:num"]) && Number(s["w:cols"]["@_w:num"]) > 1 ? { columns: { count: Number(s["w:cols"]["@_w:num"]), gap: twipToPt(Number(s["w:cols"]["@_w:space"] ?? 720)) } } : {}),
    };
    // Page as printed, with Word's default margins where the section sets none.
    const printed = resolvePage(page);
    const geo: StoryPage = { width: printed.width, height: printed.height, margins: { ...printed.margins, ...(page.margins?.header === undefined ? { header: 36 } : {}), ...(page.margins?.footer === undefined ? { footer: 36 } : {}) } };
    // Word: a missing header / footer reference links to the previous section's story.
    const headers: StorySet = { ...prevHeaders };
    const footers: StorySet = { ...prevFooters };
    for (const ref of arr(s["w:headerReference"])) {
      const story = await readStory(ref["@_r:id"], "headers", geo);
      if (story) headers[(ref["@_w:type"] ?? "default") as keyof StorySet] = story;
    }
    for (const ref of arr(s["w:footerReference"])) {
      const story = await readStory(ref["@_r:id"], "footers", geo);
      if (story) footers[(ref["@_w:type"] ?? "default") as keyof StorySet] = story;
    }
    prevHeaders = headers;
    prevFooters = footers;
    const titlePage = on(s["w:titlePg"]) ?? false;
    const signature = JSON.stringify([page, headers, footers, titlePage]);
    if (!designs.some((d) => d.signature === signature)) designs.push({ page, headers, footers, titlePage, signature, index });
    sectionDesigns.push(designs.findIndex((d) => d.signature === signature));
  }
  add("Section page designs", "supported", `${sects.length} section(s), ${designs.length} distinct page design(s): size, orientation, margins, header / footer distances${designs.some((d) => d.page.columns) ? ", newspaper columns" : ""}`, "word/document.xml");
  if (designs.some((d) => d.titlePage)) add("Different first page", "supported", "First-page header / footer stories are kept.");
  if (evenAndOdd) add("Different odd and even pages", "supported", "Even-page stories are kept.", "word/settings.xml");
  const bodyParagraphs = arr(document?.["w:document"]?.["w:body"]?.["w:p"]).length;
  if (bodyParagraphs > 1) add("Sample body content", "unsupported", `${bodyParagraphs} body paragraphs are template sample content and are not imported as page furniture.`, "word/document.xml");

  const base = slug(fileName);
  const sha256 = createHash("sha256").update(data).digest("hex");
  const provenance = (section?: number) => ({ source: "docx" as const, file: fileName, importedAt: now.toISOString(), sha256, ...(section ? { section } : {}), report });
  const [first, ...rest] = designs.length ? designs : [{ page: { size: "A4" as const }, headers: {}, footers: {}, titlePage: false, signature: "", index: 0 }];
  const family: MasterDef = {
    id: base,
    name: fileName.replace(/\.(docx|dotx)$/i, ""),
    description: `Imported from ${fileName}`,
    page: first.page,
    theme: { colors, fonts: { heading: heading ?? bodyFont ?? "Calibri Light", body: bodyFont ?? heading ?? "Calibri" } },
    styles,
    ...(bullet.length || orderedFormats.length ? { numbering: { ...(bullet.length ? { bullet } : {}), ...(orderedFormats.length ? { ordered: orderedFormats } : {}) } } : {}),
    headers: first.headers,
    footers: first.footers,
    titlePage: first.titlePage,
    evenAndOdd,
    ...(Object.keys(fontClasses).length ? { fontClasses } : {}),
    provenance: provenance(first.index + 1),
  };
  const variants: MasterDef[] = rest.map((d, i) => ({
    id: `${base}-${i + 2}`,
    name: `${family.name} — section ${d.index + 1}${d.page.orientation === "landscape" ? " (landscape)" : ""}`,
    description: `Section ${d.index + 1} page design of ${fileName}`,
    basedOn: base,
    page: d.page,
    headers: d.headers,
    footers: d.footers,
    titlePage: d.titlePage,
    provenance: provenance(d.index + 1),
  }));
  return { family, variants, assets, report, fonts: [...fonts].sort(), sectionDesigns: sectionDesigns.length ? sectionDesigns : [0] };
}

/** Page geometry a story is laid out on (pt, as printed: landscape width > height). */
export interface StoryPage {
  width: number;
  height: number;
  margins: { top: number; right: number; bottom: number; left: number; header: number; footer: number };
}

type Add = (f: string, s: ImportReportItem["status"], d?: string, p?: string) => void;
type Obj = { id: string; object: ObjectDescriptor };

interface StoryCtx {
  zip: JSZip;
  part: string;
  rels: Map<string, Rel>;
  assets: Map<string, Uint8Array>;
  add: Add;
  counter: { n: number };
  page: StoryPage;
  /** Line height of the story's text, pt (from its paragraph style's font size). */
  line: number;
}

/**
 * A header / footer part → Markdown story with fields, plus its drawings: pictures, shapes (with
 * their text), groups and VML pictures become page objects placed where Word draws them —
 * anchored ones from their offset / alignment against the page, the margins or the paragraph,
 * inline ones in the header / footer band at their paragraph's alignment. The story's alignment
 * and paragraph style are kept when all its paragraphs share them.
 */
async function parseStory(zip: JSZip, part: string, assets: Map<string, Uint8Array>, add: Add, counter: { n: number }, kind: "headers" | "footers", page: StoryPage, line: number): Promise<StoryDef> {
  const tree = await xml(zip, part, ordered);
  const ctx: StoryCtx = { zip, part, rels: await rels(zip, part), assets, add, counter, page, line };
  // Drawings whose vertical place depends on where the story starts (footers grow upwards).
  const placed: ((storyTop: number) => Obj[])[] = [];
  const lines: string[] = [];
  const aligns = new Set<string>();
  const pStyles = new Set<string>();
  // Room taken on the text line by inline drawings beside the text (one text paragraph only).
  const reserve = { left: 0, right: 0, paragraphs: 0 };
  const story = (tree as any[]).find((n) => tagOf(n) === "w:hdr" || tagOf(n) === "w:ftr");
  const content = story ? kidsOf(story) : [];
  // Top of the paragraph being read, from the story's first line (pt).
  let cursor = 0;
  for (const node of content) {
    const name = tagOf(node);
    if (name === "w:sdt") add("Content control in a story", "flattened", "Kept as its text.", part);
    if (name === "w:tbl") add("Table in a story", "flattened", "Cells are kept as lines of text.", part);
    const paragraphs = name === "w:p" ? [node] : findAll(kidsOf(node), "w:p");
    for (const p of paragraphs) {
      const pPr = child(p, "w:pPr");
      const jc = at(child(pPr, "w:jc"), "w:val") ?? "left";
      const align = jc === "center" ? "center" : jc === "right" || jc === "end" ? "right" : "left";
      const styleId = at(child(pPr, "w:pStyle"), "w:val");
      let text = "";
      let field: string | null = null;
      let inResult = false;
      let breaks = 0;
      const inlines: (Inline & { afterText: boolean })[] = [];
      const top = cursor;
      const visit = async (nodes: any[]): Promise<void> => {
        for (const n of nodes) {
          const t = tagOf(n);
          if (t === "w:pPr") continue;
          if (t === "w:fldSimple") {
            text += fieldToken(String(at(n, "w:instr") ?? ""), plain(kidsOf(n)));
            continue;
          }
          if (t === "w:fldChar") {
            const type = at(n, "w:fldCharType");
            if (type === "begin") field = "";
            else if (type === "separate") inResult = true;
            else if (type === "end") {
              if (field !== null) text += fieldToken(field, "");
              field = null;
              inResult = false;
            }
            continue;
          }
          if (t === "w:instrText" && field !== null) {
            field += plain(kidsOf(n));
            continue;
          }
          if (t === "w:t" && field === null) text += plain(kidsOf(n)).replace(/([*_`[\]\\{}])/g, "\\$1");
          if (t === "w:tab" || t === "w:ptab") text += " ";
          if (t === "w:br") (text += "  \n"), breaks++;
          if (t === "w:drawing") {
            const d = await drawingObjects(n, ctx);
            if (d?.inline) inlines.push({ ...d.inline, afterText: !!text.trim() });
            else if (d?.anchored) placed.push((storyTop) => d.anchored!(storyTop + top));
            continue;
          }
          if (t === "w:pict") {
            const pic = await vmlPicture(n, ctx);
            if (pic) placed.push((storyTop) => [pic(storyTop + top)]);
            else add("VML drawing (watermark or legacy shape)", "unsupported", "Only VML pictures are imported.", part);
            continue;
          }
          if (t === "mc:AlternateContent") {
            // The DrawingML choice, else the VML fallback.
            const choice = findAll(kidsOf(n), "w:drawing");
            await visit(choice.length ? choice.slice(0, 1) : findAll(kidsOf(n), "w:pict").slice(0, 1));
            continue;
          }
          if (Array.isArray(n[t!])) await visit(kidsOf(n));
        }
      };
      await visit(kidsOf(p));
      void inResult;
      const height = Math.max(line * (breaks + 1), ...inlines.map((i) => i.h));
      // Inline drawings sit side by side on the paragraph's line, at its alignment.
      if (inlines.length) {
        const total = inlines.reduce((sum, i) => sum + i.w, 0);
        const frame = page.width - page.margins.left - page.margins.right;
        let x = page.margins.left + (align === "center" ? (frame - total) / 2 : align === "right" ? frame - total : 0);
        for (const i of inlines) {
          const left = x;
          placed.push((storyTop) => i.build(left, storyTop + top + height - i.h));
          x += i.w;
        }
      }
      cursor += height;
      if (text.trim() && inlines.length) {
        reserve.paragraphs++;
        // Word lays the text and the drawings on one line: the text keeps clear of them.
        const room = (list: typeof inlines) => list.reduce((sum, i) => sum + i.w, 0) + (list.length ? 6 : 0);
        if (align === "right") reserve.right = round2(room(inlines.filter((i) => i.afterText)));
        else if (align === "left") reserve.left = round2(room(inlines.filter((i) => !i.afterText)));
      }
      if (text.trim()) {
        lines.push(text.trim());
        aligns.add(align);
        pStyles.add(styleId ?? "");
      }
    }
  }
  // Word: the header grows down from its distance to the page edge, the footer up from its own.
  const storyTop = kind === "headers" ? page.margins.header : page.height - page.margins.footer - cursor;
  const objects: Record<string, ObjectDescriptor> = {};
  for (const build of placed) for (const { id, object } of build(storyTop)) objects[id] = object;
  const onlyAlign = aligns.size === 1 ? [...aligns][0] : undefined;
  const onlyStyle = pStyles.size === 1 ? [...pStyles][0] : undefined;
  const indents = lines.length === 1 && reserve.paragraphs === 1 ? { ...(reserve.left ? { indentLeft: reserve.left } : {}), ...(reserve.right ? { indentRight: reserve.right } : {}) } : {};
  const block = { ...(onlyAlign && onlyAlign !== "left" ? { align: onlyAlign as "center" | "right" } : {}), ...(onlyStyle ? { style: onlyStyle } : {}), ...indents };
  return { markdown: lines.join("\n\n"), ...(Object.keys(block).length ? { block } : {}), ...(Object.keys(objects).length ? { objects } : {}) };
}

const plain = (nodes: any[]): string => nodes.map((n) => (typeof n?.["#text"] !== "undefined" ? String(n["#text"]) : Array.isArray(n?.[Object.keys(n)[0]]) ? plain(n[Object.keys(n)[0]]) : "")).join("");

function fieldToken(instr: string, cached: string): string {
  const code = instr.trim().split(/\s+/)[0]?.toUpperCase();
  if (code === "PAGE") return "{{page}}";
  if (code === "NUMPAGES" || code === "SECTIONPAGES") return "{{pages}}";
  if (code === "TITLE") return "{{title}}";
  const prop = /^DOCPROPERTY\s+"?([\w-]+)"?/i.exec(instr.trim());
  if (prop) return `{{field:${prop[1]}}}`;
  return cached;
}

/* DrawingML ------------------------------------------------------------- */

const tagOf = (n: any): string | undefined => (n && typeof n === "object" ? Object.keys(n).find((k) => k !== ":@") : undefined);
const kidsOf = (n: any): any[] => (Array.isArray(n?.[tagOf(n)!]) ? n[tagOf(n)!] : []);
const findAll = (nodes: any[], name: string): any[] => nodes.flatMap((n) => (tagOf(n) === name ? [n] : findAll(kidsOf(n), name)));
const first = (n: any, name: string): any => findAll(kidsOf(n), name)[0];
/** Direct child only (a group's own transform, not a member's). */
const child = (n: any, name: string): any => kidsOf(n).find((k) => tagOf(k) === name);
const at = (n: any, key: string): string | undefined => n?.[":@"]?.[`@_${key}`];

const SCHEME: Record<string, ThemeSlot> = { tx1: "dk1", bg1: "lt1", tx2: "dk2", bg2: "lt2", dk1: "dk1", lt1: "lt1", dk2: "dk2", lt2: "lt2", accent1: "accent1", accent2: "accent2", accent3: "accent3", accent4: "accent4", accent5: "accent5", accent6: "accent6", hlink: "hlink", folHlink: "folHlink" };
const PRESETS: Record<string, NonNullable<ObjectDescriptor["shape"]>> = { rect: "rect", roundRect: "roundRect", ellipse: "ellipse", triangle: "triangle", rtTriangle: "triangle", diamond: "diamond", rightArrow: "rightArrow", chevron: "chevron", homePlate: "chevron", line: "line", straightConnector1: "line" };

/** Color in a fill / line node: RGB or a theme slot (`theme.accent1`), `null` for noFill, alpha as transparency. */
function colorOf(node: any): { color?: string | null; transparency?: number } {
  if (!node) return {};
  if (child(node, "a:noFill")) return { color: null };
  const solid = tagOf(node) === "a:solidFill" ? node : child(node, "a:solidFill");
  if (!solid) return {};
  const rgb = child(solid, "a:srgbClr");
  const scheme = child(solid, "a:schemeClr");
  const sys = child(solid, "a:sysClr");
  const c = rgb ?? scheme ?? sys;
  const alpha = Number(at(child(c, "a:alpha"), "val") ?? 100000);
  const color = rgb ? String(at(rgb, "val")).toUpperCase() : scheme && SCHEME[at(scheme, "val") ?? ""] ? `theme.${SCHEME[at(scheme, "val")!]}` : sys ? String(at(sys, "lastClr") ?? "000000").toUpperCase() : undefined;
  return { color, ...(alpha < 100000 ? { transparency: Math.round(100 - alpha / 1000) } : {}) };
}

interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Text of a text box (`wps:txbx`) with the look of its first run. */
function shapeText(sp: any): { text?: string; color?: string; fontSize?: number; align?: "center" | "right" } {
  const box = first(sp, "wps:txbx");
  if (!box) return {};
  const text = findAll(kidsOf(box), "w:p").map((p) => findAll(kidsOf(p), "w:t").map((t) => plain(kidsOf(t))).join("")).filter(Boolean).join("\n");
  const rPr = first(box, "w:rPr");
  const sz = Number(at(child(rPr, "w:sz"), "w:val") ?? 0);
  const color = child(rPr, "w:color");
  const themeColor = at(color, "w:themeColor");
  const jc = at(first(box, "w:jc"), "w:val");
  return {
    ...(text ? { text } : {}),
    ...(sz ? { fontSize: sz / 2 } : {}),
    ...(themeColor && THEME_COLOR[themeColor] ? { color: `theme.${THEME_COLOR[themeColor]}` } : /^[0-9A-F]{6}$/i.test(at(color, "w:val") ?? "") ? { color: at(color, "w:val")!.toUpperCase() } : {}),
    ...(jc === "center" ? { align: "center" as const } : jc === "right" || jc === "end" ? { align: "right" as const } : {}),
  };
}

/** A picture of the story part → `assets/<name>` (PNG, JPEG, GIF, BMP). */
async function pictureAsset(rId: string | undefined, ctx: StoryCtx): Promise<string | undefined> {
  const rel = rId ? ctx.rels.get(rId) : undefined;
  if (!rel || rel.external) {
    ctx.add("Linked picture", "unsupported", "Externally linked pictures are not fetched.", ctx.part);
    return undefined;
  }
  const file = ctx.zip.file(rel.target);
  if (!file) return undefined;
  const ext = posix.extname(rel.target).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".gif", ".bmp"].includes(ext)) {
    ctx.add("Picture format", "unsupported", `${posix.basename(rel.target)} (${ext}) is not imported; use PNG or JPEG.`, ctx.part);
    return undefined;
  }
  const name = `${posix.basename(rel.target, ext).replace(/[^\w-]/g, "_")}${ext}`;
  ctx.assets.set(name, await file.async("uint8array"));
  return `assets/${name}`;
}

/** One shape or picture (`wps:wsp`, `pic:pic`) drawn in `frame` (page pt). Never locked: masters are edited. */
async function memberObject(node: any, frame: Frame, ctx: StoryCtx, base: Partial<ObjectDescriptor>): Promise<Obj | undefined> {
  const spPr = child(node, "wps:spPr") ?? child(node, "pic:spPr");
  const rot = Number(at(child(spPr, "a:xfrm"), "rot") ?? 0) / 60000;
  const turn = rot ? { rotation: Math.round(rot * 100) / 100 } : {};
  const box = { x: round2(frame.x), y: round2(frame.y), width: round2(frame.width), height: round2(frame.height) };
  const blip = first(node, "a:blip");
  if (blip) {
    const src = await pictureAsset(at(blip, "r:embed"), ctx);
    if (!src) return undefined;
    const alpha = Number(at(child(blip, "a:alphaModFix"), "amt") ?? 100000);
    ctx.add("Picture in a story", "supported", `${src.slice(7)} (${Math.round(box.width)}×${Math.round(box.height)} pt) kept as a page object.`, ctx.part);
    return { id: `picture${++ctx.counter.n}`, object: { type: "image", placement: "page", relativeTo: "page", box, src, ...turn, ...(alpha < 100000 ? { style: { transparency: Math.round(100 - alpha / 1000) } } : {}), ...base } };
  }
  if (tagOf(node) !== "wps:wsp") return undefined;
  const geom = at(child(spPr, "a:prstGeom"), "prst");
  const custom = !!child(spPr, "a:custGeom");
  const fill = colorOf(spPr);
  const ln = child(spPr, "a:ln");
  const line = colorOf(ln);
  // Theme style references give the look a shape does not set itself.
  const style = child(node, "wps:style");
  const ref = (name: string) => {
    const r = child(style, name);
    return r && at(r, "idx") !== "0" ? colorOf({ "a:solidFill": kidsOf(r) }) : {};
  };
  const refFill = ref("a:fillRef");
  const refLine = ref("a:lnRef");
  const t = shapeText(node);
  const shape = custom ? "rect" : PRESETS[geom ?? "rect"] ?? "rect";
  if (custom || (geom && !PRESETS[geom])) ctx.add("Shape geometry", "flattened", `${custom ? "Custom geometry" : geom} drawn as a rectangle.`, ctx.part);
  const look: NonNullable<ObjectDescriptor["style"]> = {
    fill: fill.color !== undefined ? fill.color : refFill.color ?? null,
    line: line.color !== undefined ? line.color : refLine.color ?? null,
    ...(at(ln, "w") ? { lineWidth: emuToPt(Number(at(ln, "w"))) } : {}),
    ...(fill.transparency ? { transparency: fill.transparency } : {}),
    ...(t.color ? { color: t.color } : {}),
    ...(t.fontSize ? { fontSize: t.fontSize } : {}),
    ...(t.align ? { align: t.align } : {}),
  };
  const textOnly = !!t.text && shape === "rect" && !look.fill && !look.line;
  ctx.add(textOnly ? "Text box in a story" : "Shape in a story", "supported", `${geom ?? "shape"} kept as a page object${t.text ? " with its text" : ""}.`, ctx.part);
  return { id: `${textOnly ? "textbox" : "shape"}${++ctx.counter.n}`, object: { type: textOnly ? "textbox" : "shape", ...(textOnly ? {} : { shape }), placement: "page", relativeTo: "page", box, ...turn, style: look, ...(t.text ? { text: t.text } : {}), ...base } };
}

type Inline = { w: number; h: number; build: (x: number, y: number) => Obj[] };

/**
 * A `w:drawing` → page objects, built in a 0,0 frame then moved: anchored drawings to their
 * position (offset or alignment against the page, the margins, a margin area or the paragraph),
 * inline ones onto their paragraph's line by the caller. Groups are flattened into members (one
 * `group`), each mapped from the group's child coordinates.
 */
async function drawingObjects(node: any, ctx: StoryCtx): Promise<{ anchored?: (paragraphTop: number) => Obj[]; inline?: Inline } | undefined> {
  const anchor = first(node, "wp:anchor");
  const host = anchor ?? first(node, "wp:inline");
  if (!host) return undefined;
  const extent = child(host, "wp:extent");
  const width = emuToPt(Number(at(extent, "cx") ?? 0));
  const height = emuToPt(Number(at(extent, "cy") ?? 0));
  const docPr = child(host, "wp:docPr");
  const name = at(docPr, "name");
  const alt = at(docPr, "descr");
  const top = kidsOf(first(host, "a:graphicData")).find((k) => ["wps:wsp", "pic:pic", "wpg:wgp"].includes(tagOf(k)!));
  if (!top) {
    ctx.add("Drawing in a story", "unsupported", "Charts, SmartArt and drawing canvases are not imported.", ctx.part);
    return undefined;
  }
  const base: Partial<ObjectDescriptor> = { plane: at(anchor, "behindDoc") === "1" ? "behind" : "front", ...(alt ? { alt } : {}) };
  const unit: Obj[] = [];
  if (tagOf(top) !== "wpg:wgp") {
    const o = await memberObject(top, { x: 0, y: 0, width, height }, ctx, { ...base, ...(name ? { name } : {}) });
    if (o) unit.push(o);
  } else {
    const walk = async (group: any, gf: Frame, path: string) => {
      const xfrm = child(child(group, "wpg:grpSpPr"), "a:xfrm");
      const chOff = child(xfrm, "a:chOff");
      const chExt = child(xfrm, "a:chExt");
      const sx = gf.width / Math.max(0.01, emuToPt(Number(at(chExt, "cx") ?? 1)));
      const sy = gf.height / Math.max(0.01, emuToPt(Number(at(chExt, "cy") ?? 1)));
      for (const m of kidsOf(group)) {
        const t = tagOf(m);
        if (t !== "wps:wsp" && t !== "pic:pic" && t !== "wpg:grpSp") continue;
        const mx = child(child(m, t === "wpg:grpSp" ? "wpg:grpSpPr" : t === "pic:pic" ? "pic:spPr" : "wps:spPr"), "a:xfrm");
        const f: Frame = {
          x: gf.x + (emuToPt(Number(at(child(mx, "a:off"), "x") ?? 0)) - emuToPt(Number(at(chOff, "x") ?? 0))) * sx,
          y: gf.y + (emuToPt(Number(at(child(mx, "a:off"), "y") ?? 0)) - emuToPt(Number(at(chOff, "y") ?? 0))) * sy,
          width: emuToPt(Number(at(child(mx, "a:ext"), "cx") ?? 0)) * sx,
          height: emuToPt(Number(at(child(mx, "a:ext"), "cy") ?? 0)) * sy,
        };
        if (t === "wpg:grpSp") await walk(m, f, `${path}/group${++ctx.counter.n}`);
        else {
          const o = await memberObject(m, f, ctx, { ...base, group: path });
          if (o) unit.push(o);
        }
      }
    };
    await walk(top, { x: 0, y: 0, width, height }, (name ?? `group${++ctx.counter.n}`).replace(/[^\w-]+/g, "-"));
    if (unit.length) ctx.add("Group in a story", "supported", `${unit.length} member(s) kept as page objects of one group.`, ctx.part);
  }
  if (!unit.length) return undefined;
  const moved = (dx: number, dy: number): Obj[] => unit.map(({ id, object }) => ({ id, object: { ...object, box: { ...object.box, x: round2(object.box.x + dx), y: round2(object.box.y + dy) } } }));
  if (!anchor) return { inline: { w: width, h: height, build: moved } };
  const pos = anchorPosition(anchor, width, height, ctx);
  return { anchored: (paragraphTop) => moved(pos.x, pos.y(paragraphTop)) };
}

/** Page position (pt) of an anchored drawing; `y` needs the paragraph's top for paragraph / line anchors. */
function anchorPosition(anchor: any, w: number, h: number, ctx: StoryCtx): { x: number; y: (paragraphTop: number) => number } {
  const { page } = ctx;
  const m = page.margins;
  const ph = child(anchor, "wp:positionH");
  const pv = child(anchor, "wp:positionV");
  const offset = (n: any) => emuToPt(Number(plain(kidsOf(child(n, "wp:posOffset")))) || 0);
  const alignOf = (n: any) => (child(n, "wp:align") ? plain(kidsOf(child(n, "wp:align"))).trim() : undefined);
  const relH = at(ph, "relativeFrom") ?? "column";
  const [h0, h1] = relH === "page" ? [0, page.width] : relH === "leftMargin" || relH === "insideMargin" ? [0, m.left] : relH === "rightMargin" || relH === "outsideMargin" ? [page.width - m.right, page.width] : [m.left, page.width - m.right];
  const ah = alignOf(ph);
  const x = ah ? (ah === "center" ? h0 + (h1 - h0 - w) / 2 : ah === "right" || ah === "outside" ? h1 - w : h0) : h0 + offset(ph);
  const relV = at(pv, "relativeFrom") ?? "paragraph";
  const av = alignOf(pv);
  return {
    x: round2(x),
    y: (paragraphTop) => {
      const [v0, v1] = relV === "page" ? [0, page.height] : relV === "margin" ? [m.top, page.height - m.bottom] : relV === "topMargin" || relV === "insideMargin" ? [0, m.top] : relV === "bottomMargin" || relV === "outsideMargin" ? [page.height - m.bottom, page.height] : [paragraphTop, paragraphTop + ctx.line];
      return round2(av ? (av === "center" ? v0 + (v1 - v0 - h) / 2 : av === "bottom" || av === "outside" ? v1 - h : v0) : v0 + offset(pv));
    },
  };
}

/**
 * VML picture (`w:pict` › `v:shape` › `v:imagedata`: legacy logos and picture watermarks): its
 * CSS-like style gives the size and the offset or alignment against the page or the margins.
 */
async function vmlPicture(pict: any, ctx: StoryCtx): Promise<((paragraphTop: number) => Obj) | undefined> {
  const shape = findAll(kidsOf(pict), "v:shape")[0];
  const data = shape && findAll(kidsOf(shape), "v:imagedata")[0];
  if (!data) return undefined;
  const src = await pictureAsset(at(data, "r:id"), ctx);
  if (!src) return undefined;
  const raw = String(at(shape, "style") ?? "");
  const css: Record<string, string> = Object.fromEntries(raw.split(";").map((d) => d.split(":").map((x) => x.trim())).filter((d) => d.length === 2));
  const len = (v?: string) => {
    const n = parseFloat(v ?? "0") || 0;
    return /in$/.test(v ?? "") ? n * 72 : /cm$/.test(v ?? "") ? (n * 72) / 2.54 : /mm$/.test(v ?? "") ? (n * 72) / 25.4 : /px$/.test(v ?? "") ? n * 0.75 : n;
  };
  const w = len(css.width);
  const h = len(css.height);
  const m = ctx.page.margins;
  const [h0, h1] = css["mso-position-horizontal-relative"] === "page" ? [0, ctx.page.width] : [m.left, ctx.page.width - m.right];
  const ah = css["mso-position-horizontal"];
  const x = ah === "center" ? h0 + (h1 - h0 - w) / 2 : ah === "right" ? h1 - w : ah === "left" ? h0 : h0 + len(css["margin-left"] ?? css.left);
  const relV = css["mso-position-vertical-relative"];
  const av = css["mso-position-vertical"];
  const id = `picture${++ctx.counter.n}`;
  const watermark = /WaterMark/i.test(String(at(shape, "id") ?? ""));
  ctx.add(watermark ? "Picture watermark" : "VML picture in a story", "supported", `${src.slice(7)} kept as a page object.`, ctx.part);
  return (paragraphTop) => {
    const [v0, v1] = relV === "page" ? [0, ctx.page.height] : relV === "margin" ? [m.top, ctx.page.height - m.bottom] : [paragraphTop, paragraphTop + ctx.line];
    const y = av === "center" ? v0 + (v1 - v0 - h) / 2 : av === "bottom" ? v1 - h : av === "top" ? v0 : v0 + len(css["margin-top"] ?? css.top);
    return { id, object: { type: "image", placement: "page", relativeTo: "page", box: { x: round2(x), y: round2(y), width: round2(w), height: round2(h) }, src, plane: watermark || /z-index:\s*-/.test(raw) ? "behind" : "front", ...(watermark ? { name: "Watermark" } : {}) } };
  };
}
