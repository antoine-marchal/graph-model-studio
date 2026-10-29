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
  const readStory = async (rId: string): Promise<StoryDef | undefined> => {
    const rel = docRels.get(rId);
    if (!rel || rel.external) return undefined;
    if (storyCache.has(rel.target)) return storyCache.get(rel.target);
    const story = await parseStory(zip, rel.target, assets, add, counter);
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
    // Word: a missing header / footer reference links to the previous section's story.
    const headers: StorySet = { ...prevHeaders };
    const footers: StorySet = { ...prevFooters };
    for (const ref of arr(s["w:headerReference"])) {
      const story = await readStory(ref["@_r:id"]);
      if (story) headers[(ref["@_w:type"] ?? "default") as keyof StorySet] = story;
    }
    for (const ref of arr(s["w:footerReference"])) {
      const story = await readStory(ref["@_r:id"]);
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

/**
 * A header / footer part → Markdown story with fields, plus its pictures (anchored → page
 * objects, inline → images in the Markdown). Shapes other than pictures, content controls and
 * VML are reported.
 */
async function parseStory(zip: JSZip, part: string, assets: Map<string, Uint8Array>, add: (f: string, s: ImportReportItem["status"], d?: string, p?: string) => void, counter: { n: number }): Promise<StoryDef> {
  const tree = await xml(zip, part, ordered);
  const partRels = await rels(zip, part);
  const objects: Record<string, ObjectDescriptor> = {};
  const lines: string[] = [];
  const tag = (n: any) => Object.keys(n).find((k) => k !== ":@");
  const children = (n: any) => (n[tag(n)!] ?? []) as any[];
  const find = (nodes: any[], name: string): any[] => nodes.flatMap((n) => (tag(n) === name ? [n] : typeof n === "object" && Array.isArray(n[tag(n)!]) ? find(children(n), name) : []));
  const story = (tree as any[]).find((n) => tag(n) === "w:hdr" || tag(n) === "w:ftr");
  const content = story ? children(story) : [];
  for (const node of content) {
    const name = tag(node);
    if (name === "w:sdt") add("Content control in a story", "flattened", "Kept as its text.", part);
    if (name === "w:tbl") add("Table in a story", "flattened", "Cells are kept as lines of text.", part);
    const paragraphs = name === "w:p" ? [node] : find(children(node), "w:p");
    for (const p of paragraphs) {
      let text = "";
      let field: string | null = null;
      let inResult = false;
      const visit = (nodes: any[]) => {
        for (const n of nodes) {
          const t = tag(n);
          if (t === "w:fldSimple") {
            text += fieldToken(String(n[":@"]?.["@_w:instr"] ?? ""), plain(children(n)));
            continue;
          }
          if (t === "w:fldChar") {
            const type = n[":@"]?.["@_w:fldCharType"];
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
            field += plain(children(n));
            continue;
          }
          if (t === "w:t" && !(field !== null && inResult) && field === null) text += plain(children(n)).replace(/([*_`[\]\\{}])/g, "\\$1");
          if (t === "w:tab") text += " ";
          if (t === "w:br") text += "  \n";
          if (t === "w:drawing") {
            const pic = drawingObject(n, partRels, zip, assets, part, add, counter);
            if (pic) {
              void pic.then((o) => o && (objects[o.id] = o.object));
              pendingPictures.push(pic);
            }
            continue;
          }
          if (t === "w:pict" || t === "mc:AlternateContent") {
            if (t === "w:pict") add("VML drawing (watermark or legacy shape)", "unsupported", "Not imported.", part);
            if (t === "mc:AlternateContent") {
              const choice = find(children(n), "w:drawing");
              if (choice.length) visit([choice[0]]);
              continue;
            }
            continue;
          }
          if (Array.isArray(n[t!])) visit(children(n));
        }
      };
      const pendingPictures: Promise<unknown>[] = [];
      visit(children(p));
      await Promise.all(pendingPictures);
      if (text.trim()) lines.push(text.trim());
    }
  }
  return { markdown: lines.join("\n\n"), ...(Object.keys(objects).length ? { objects } : {}) };
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

async function drawingObject(node: any, partRels: Map<string, Rel>, zip: JSZip, assets: Map<string, Uint8Array>, part: string, add: (f: string, s: ImportReportItem["status"], d?: string, p?: string) => void, counter: { n: number }): Promise<{ id: string; object: ObjectDescriptor } | undefined> {
  const tag = (n: any) => Object.keys(n).find((k) => k !== ":@");
  const kids = (n: any): any[] => (Array.isArray(n?.[tag(n)!]) ? n[tag(n)!] : []);
  const find = (nodes: any[], name: string): any[] => nodes.flatMap((n) => (tag(n) === name ? [n] : find(kids(n), name)));
  const anchor = find(kids(node), "wp:anchor")[0] ?? find(kids(node), "wp:inline")[0];
  if (!anchor) return undefined;
  const blip = find(kids(anchor), "a:blip")[0];
  const extent = find(kids(anchor), "wp:extent")[0]?.[":@"];
  const width = emuToPt(Number(extent?.["@_cx"] ?? 0));
  const height = emuToPt(Number(extent?.["@_cy"] ?? 0));
  if (!blip) {
    const shape = find(kids(anchor), "wps:wsp")[0];
    if (shape) {
      const geom = find(kids(shape), "a:prstGeom")[0]?.[":@"]?.["@_prst"];
      const fill = find(kids(find(kids(shape), "wps:spPr")[0] ?? {}), "a:srgbClr")[0]?.[":@"]?.["@_val"];
      const pos = position(anchor, find, kids);
      const id = `shape${++counter.n}`;
      add("Shape in a story", "supported", `${geom ?? "shape"} kept as a page object (text inside shapes is not kept).`, part);
      return { id, object: { type: "shape", shape: geom === "ellipse" ? "ellipse" : geom === "line" ? "line" : "rect", placement: "page", relativeTo: pos.relativeTo, box: { x: pos.x, y: pos.y, width, height }, plane: pos.behind ? "behind" : "front", style: fill ? { fill: String(fill).toUpperCase(), line: null } : undefined, locked: { geometry: true } } };
    }
    add("Drawing in a story", "unsupported", "Only pictures and simple shapes are imported.", part);
    return undefined;
  }
  const rel = partRels.get(blip[":@"]?.["@_r:embed"]);
  if (!rel || rel.external) {
    add("Linked picture", "unsupported", "Externally linked pictures are not fetched.", part);
    return undefined;
  }
  const file = zip.file(rel.target);
  if (!file) return undefined;
  const ext = posix.extname(rel.target).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".gif", ".bmp"].includes(ext)) {
    add("Picture format", "unsupported", `${posix.basename(rel.target)} (${ext}) is not imported; use PNG or JPEG.`, part);
    return undefined;
  }
  const name = `${posix.basename(rel.target, ext).replace(/[^\w-]/g, "_")}${ext}`;
  assets.set(name, await file.async("uint8array"));
  const pos = position(anchor, find, kids);
  const id = `picture${++counter.n}`;
  add("Picture in a story", "supported", `${name} (${Math.round(width)}×${Math.round(height)} pt) kept as a recurring page object.`, part);
  return { id, object: { type: "image", placement: "page", relativeTo: pos.relativeTo, box: { x: pos.x, y: pos.y, width, height }, src: `assets/${name}`, alt: find(kids(anchor), "wp:docPr")[0]?.[":@"]?.["@_descr"] ?? "", plane: pos.behind ? "behind" : "front", locked: { geometry: true } } };
}

function position(anchor: any, find: (n: any[], name: string) => any[], kids: (n: any) => any[]): { x: number; y: number; relativeTo: "page" | "margin"; behind: boolean } {
  const h = find(kids(anchor), "wp:positionH")[0];
  const v = find(kids(anchor), "wp:positionV")[0];
  const offset = (n: any) => emuToPt(Number(plain(kids(find(kids(n ?? {}), "wp:posOffset")[0] ?? {})) || 0));
  const relH = h?.[":@"]?.["@_relativeFrom"];
  return { x: offset(h), y: offset(v), relativeTo: relH === "page" ? "page" : "margin", behind: anchor[":@"]?.["@_behindDoc"] === "1" };
}
