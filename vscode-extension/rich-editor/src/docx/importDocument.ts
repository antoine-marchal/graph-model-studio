/**
 * Word document (.docx / .dotx) → `.paper` source. The page design (styles, theme, page setup,
 * headers / footers) becomes a master through `importTemplate`; the body becomes Markdown:
 *
 * * paragraphs keep their named style (`::: id` groups, `blocks.<id>.style`), alignment and
 *   spacing; headings become `#` headings, numbered / bulleted paragraphs lists; direct character
 *   formatting becomes bold / italic / strike and `<span style>` (color, size, font, highlight);
 * * content controls (placeholders) keep their text (the prompt when they show it);
 * * pictures → images (inline) or picture objects (floating); shapes / text boxes → editable
 *   shapes with their text; custom geometry → `custom` shapes; groups and other drawings → SVG
 *   pictures generated from the DrawingML;
 * * layout tables (several blocks per cell, no grid look) → side-by-side columns; data tables →
 *   Markdown tables with their column widths;
 * * page breaks and section breaks (size, orientation, margins, columns) → break groups.
 *
 * What is approximated or dropped is reported. The package is untrusted (see importTemplate).
 */
import { posix } from "node:path";
import type JSZip from "jszip";
import { writeMeta } from "../../document/meta";
import { fenced } from "../../document/groups";
import { emuToPt, twipToPt, ptToPx, round2 } from "../../document/units";
import { STUDIO_VERSION, type BlockProps, type ImportReportItem, type MasterDef, type ObjectDescriptor, type SectionProps, type StudioMeta, type StyleDef } from "../../document/schema";
import { importTemplate, loadPackage, ordered, paragraphProps, rels, runProps, settleLineHeight, slug, type ImportedTemplate, type Rel } from "./importTemplate";
import { NATIVE_SHAPES, colorOf, hasPictureFill, customGeometry, drawingSvg, find, first, kid, kids, objectStyle, paintOf, textOf, toX, type SchemeColors, type X } from "./drawingml";

export interface ImportedDocument {
  /** The `.paper` source (frontmatter + Markdown body). */
  source: string;
  /** Pictures and generated SVGs, by file name (saved in `assetsDir`). */
  assets: Map<string, Uint8Array>;
  report: ImportReportItem[];
  /** The page design, to save as the document's master. */
  template: ImportedTemplate;
}

export interface ImportDocumentOptions {
  /** Folder of the assets relative to the `.paper` file (`report.assets`). */
  assetsDir: string;
  /** Master id the document uses (the caller saves `template` under it). */
  master?: string;
}

const PICTURE_EXT = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".svg", ".webp"];
const num = (v: string | undefined, d = 0) => (v === undefined || v === "" || isNaN(Number(v)) ? d : Number(v));

interface Section {
  width: number;
  height: number;
  margins: { top: number; right: number; bottom: number; left: number; header: number; footer: number };
  props: SectionProps;
}

interface Ctx {
  zip: JSZip;
  rels: Map<string, Rel>;
  scheme: SchemeColors;
  fonts: { heading: string; body: string };
  styles: Record<string, StyleDef>;
  numbering: Map<string, string[]>;
  assetsDir: string;
  assets: Map<string, Uint8Array>;
  mediaNames: Map<string, string>;
  report: Map<string, { status: ImportReportItem["status"]; count: number; detail: string }>;
  ids: Set<string>;
  meta: { blocks: Record<string, BlockProps>; breaks: NonNullable<StudioMeta["breaks"]>; objects: Record<string, ObjectDescriptor> };
  /** Stacking order of floating objects (Word's relativeHeight). */
  z: { id: string; height: number }[];
  sections: Section[];
  section: number;
  svgCount: number;
}

function note(ctx: Ctx, feature: string, status: ImportReportItem["status"], detail: string) {
  const hit = ctx.report.get(feature);
  if (hit) hit.count++;
  else ctx.report.set(feature, { status, count: 1, detail });
}

function freeId(ctx: Ctx, base: string): string {
  let clean = base.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  if (!/^[a-z]/.test(clean)) clean = `b-${clean}`.replace(/-$/, "");
  let id = clean;
  for (let i = 2; ctx.ids.has(id); i++) id = `${clean}-${i}`;
  ctx.ids.add(id);
  return id;
}

/* Text ------------------------------------------------------------------ */

const escapeText = (s: string) => s.replace(/([\\`*_[\]<>|~])/g, "\\$1").replace(/\{\{/g, "\\{\\{");
/** Escapes that only matter at the start of a line (headings, lists, quotes). */
const escapeLineStart = (s: string) => s.replace(/^(\s*)([#>+-]|\d+[.)])(\s)/, (_, a, b, c) => `${a}\\${b}${c}`);

interface Fmt {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  css?: string;
  href?: string;
}

const fmtKey = (f: Fmt) => `${f.bold ? "b" : ""}${f.italic ? "i" : ""}${f.strike ? "s" : ""}|${f.css ?? ""}|${f.href ?? ""}`;

/** Direct run formatting worth keeping (the paragraph style carries the rest). */
function runFmt(rPr: X | undefined, ctx: Ctx, style: StyleDef | undefined): Fmt {
  if (!rPr) return {};
  const direct = runProps(xmlObject(rPr), new Set());
  // Character style (its basedOn chain) under the direct formatting; the paragraph style is the base.
  const rStyle = kid(rPr, "w:rStyle")?.a["w:val"];
  const charRun = rStyle && rStyle !== "PlaceholderText" ? Object.assign({}, ...styleChain(ctx, rStyle).reverse().map((s) => s.run ?? {})) : {};
  const props = { ...charRun, ...direct };
  const base = style?.run ?? {};
  const f: Fmt = {};
  if (props.bold !== undefined && props.bold !== !!base.bold) f.bold = props.bold;
  if (props.italic !== undefined && props.italic !== !!base.italic) f.italic = props.italic;
  if (props.strike) f.strike = true;
  const css: string[] = [];
  const color = props.color;
  if (color && color !== base.color) {
    const hex = color.startsWith("theme.") ? ctx.scheme[color.slice(6)] : color;
    if (hex) css.push(`color:#${hex}`);
  }
  if (props.highlight) css.push(`background-color:#${props.highlight}`);
  const hl = kid(rPr, "w:highlight")?.a["w:val"];
  if (hl && hl !== "none") css.push(`background-color:${hl}`);
  if (props.size && props.size !== base.size) css.push(`font-size:${props.size}pt`);
  const font = props.font === "theme.heading" ? ctx.fonts.heading : props.font === "theme.body" ? ctx.fonts.body : props.font;
  const baseFont = base.font === "theme.heading" ? ctx.fonts.heading : base.font === "theme.body" ? ctx.fonts.body : base.font;
  if (font && font !== baseFont) css.push(`font-family:${font}`);
  if (css.length) f.css = css.join(";");
  return f;
}

const runFmtSize = (rPr: X | undefined): number | undefined => (kid(rPr, "w:sz") ? num(kid(rPr, "w:sz")!.a["w:val"]) / 2 : undefined);

/** X element → the attribute-object shape the template importer's helpers read. */
function xmlObject(x: X): any {
  const o: any = {};
  for (const [k, v] of Object.entries(x.a)) o[`@_${k}`] = v;
  for (const c of x.c) if (c.n !== "#text") o[c.n] = xmlObject(c);
  return o;
}

interface Inline {
  text: string;
  fmt: Fmt;
  raw?: boolean;
}

/** Segments → Markdown, merging neighbours with the same formatting. */
function inlineMarkdown(segs: Inline[]): string {
  const merged: Inline[] = [];
  for (const s of segs) {
    const last = merged[merged.length - 1];
    if (last && !last.raw && !s.raw && fmtKey(last.fmt) === fmtKey(s.fmt)) last.text += s.text;
    else merged.push({ ...s });
  }
  return merged
    .map((s) => {
      if (s.raw) return s.text;
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s.text)!;
      let core = m[2];
      if (!core) return s.text;
      core = escapeText(core);
      if (s.fmt.css) core = `<span style="${s.fmt.css}">${core}</span>`;
      if (s.fmt.strike) core = `~~${core}~~`;
      if (s.fmt.italic) core = `*${core}*`;
      if (s.fmt.bold) core = `**${core}**`;
      if (s.fmt.href) core = `[${core}](${s.fmt.href})`;
      return `${m[1]}${core}${m[3]}`;
    })
    .join("")
    .replace(/[ \t]+\n/g, (m) => (m.endsWith("\\\n") ? m : "\n"));
}

/* Drawings -------------------------------------------------------------- */

async function media(ctx: Ctx, rId: string | undefined): Promise<string | undefined> {
  const rel = rId ? ctx.rels.get(rId) : undefined;
  if (!rel || rel.external) {
    if (rel?.external) note(ctx, "Linked picture", "unsupported", "Externally linked pictures are not fetched.");
    return undefined;
  }
  if (ctx.mediaNames.has(rel.target)) return ctx.mediaNames.get(rel.target);
  const file = ctx.zip.file(rel.target);
  if (!file) return undefined;
  const ext = posix.extname(rel.target).toLowerCase();
  if (!PICTURE_EXT.includes(ext)) {
    note(ctx, "Picture format", "unsupported", `${ext} pictures (EMF / WMF / TIFF) are not imported; insert them as PNG or SVG.`);
    return undefined;
  }
  let name = `${posix.basename(rel.target, ext).replace(/[^\w-]/g, "_")}${ext}`;
  for (let i = 2; ctx.assets.has(name); i++) name = `${posix.basename(rel.target, ext).replace(/[^\w-]/g, "_")}-${i}${ext}`;
  ctx.assets.set(name, await file.async("uint8array"));
  ctx.mediaNames.set(rel.target, name);
  return name;
}

async function dataUrl(ctx: Ctx, rId: string): Promise<string | undefined> {
  const rel = ctx.rels.get(rId);
  if (!rel || rel.external) return undefined;
  const file = ctx.zip.file(rel.target);
  const ext = posix.extname(rel.target).toLowerCase().slice(1);
  if (!file || !["png", "jpg", "jpeg", "gif"].includes(ext)) return undefined;
  return `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${await file.async("base64")}`;
}

/** A drawing as an SVG asset; returns its file name. */
async function svgAsset(ctx: Ctx, graphic: X, cx: number, cy: number, name: string): Promise<string> {
  const pictures = new Map<string, string | undefined>();
  for (const blip of find(graphic, "a:blip")) {
    const rId = blip.a["r:embed"];
    if (rId && !pictures.has(rId)) pictures.set(rId, await dataUrl(ctx, rId));
  }
  const svg = drawingSvg(graphic, cx, cy, {
    scheme: ctx.scheme,
    picture: (rId) => pictures.get(rId),
    report: (feature, detail) => note(ctx, feature, "flattened", detail),
  });
  const file = `${slug(name).replace(/^template$/, "drawing") || "drawing"}-${++ctx.svgCount}.svg`;
  ctx.assets.set(file, new TextEncoder().encode(svg));
  return file;
}

const imageMd = (alt: string, file: string, ctx: Ctx, widthPt?: number) =>
  `![${escapeText(alt)}](${ctx.assetsDir}/${file})${widthPt ? `{width=${Math.round(ptToPx(widthPt))}px}` : ""}`;

/** The graphic payload of a drawing: picture, shape or group. */
function graphicOf(container: X): X | undefined {
  const data = first(container, "a:graphicData");
  return data?.c.find((c) => ["pic:pic", "wps:wsp", "wpg:wgp"].includes(c.n));
}

interface FloatResult {
  id: string;
  md: string;
}

/** Inline drawing → Markdown image. */
async function inlineDrawing(inline: X, ctx: Ctx): Promise<string> {
  const g = graphicOf(inline);
  const ext = kid(inline, "wp:extent");
  const cx = num(ext?.a.cx);
  const cy = num(ext?.a.cy);
  const docPr = kid(inline, "wp:docPr");
  const alt = docPr?.a.descr ?? docPr?.a.title ?? "";
  if (!g) {
    note(ctx, "Inline object", "unsupported", "Charts, SmartArt and embedded objects are not imported.");
    return "";
  }
  if (g.n === "pic:pic") {
    const file = await media(ctx, first(g, "a:blip")?.a["r:embed"]);
    if (!file) return "";
    note(ctx, "Inline pictures", "supported", "Kept as images with their width.");
    return imageMd(alt, file, ctx, emuToPt(cx));
  }
  const file = await svgAsset(ctx, g, cx, Math.max(cy, 1), docPr?.a.name ?? "drawing");
  note(ctx, "Inline shapes and groups", "flattened", "Drawn as SVG pictures (vector) at their size.");
  return imageMd("", file, ctx, Math.max(emuToPt(cx), 1));
}

/** Position of a floating drawing in the editor's frames (Word's anchor frames converted). */
function anchorPlacement(anchor: X, w: number, h: number, sec: Section): Pick<ObjectDescriptor, "placement" | "relativeTo" | "box"> {
  const H = kid(anchor, "wp:positionH");
  const V = kid(anchor, "wp:positionV");
  const fromH = H?.a.relativeFrom ?? "column";
  const fromV = V?.a.relativeFrom ?? "paragraph";
  const cw = sec.width - sec.margins.left - sec.margins.right;
  const ch = sec.height - sec.margins.top - sec.margins.bottom;
  // Frame origin / size in page coordinates.
  const hFrame = (): [number, number] => {
    switch (fromH) {
      case "page": return [0, sec.width];
      case "leftMargin": case "insideMargin": return [0, sec.margins.left];
      case "rightMargin": case "outsideMargin": return [sec.width - sec.margins.right, sec.margins.right];
      default: return [sec.margins.left, cw];
    }
  };
  const vFrame = (): [number, number] => {
    switch (fromV) {
      case "page": return [0, sec.height];
      case "topMargin": return [0, sec.margins.top];
      case "bottomMargin": return [sec.height - sec.margins.bottom, sec.margins.bottom];
      default: return [sec.margins.top, ch];
    }
  };
  const pos = (node: X | undefined, [origin, size]: [number, number], extent: number, near: string[], far: string[]) => {
    const off = kid(node, "wp:posOffset");
    if (off) return origin + emuToPt(num(off.t.trim()));
    const align = kid(node, "wp:align")?.t.trim() ?? near[0];
    if (far.includes(align)) return origin + size - extent;
    if (align === "center") return origin + (size - extent) / 2;
    return origin;
  };
  if (anchor.a.simplePos === "1") {
    const sp = kid(anchor, "wp:simplePos");
    return { placement: "page", relativeTo: "page", box: { x: emuToPt(num(sp?.a.x)), y: emuToPt(num(sp?.a.y)), width: w, height: h } };
  }
  const x = pos(H, hFrame(), w, ["left", "inside"], ["right", "outside"]);
  if (fromV === "paragraph" || fromV === "line") {
    const y = emuToPt(num(kid(V, "wp:posOffset")?.t.trim()));
    return { placement: "anchored", box: { x: round2(x - sec.margins.left), y: round2(y), width: w, height: h } };
  }
  const y = pos(V, vFrame(), h, ["top"], ["bottom"]);
  const marginBased = fromH !== "page" && !["page", "topMargin", "bottomMargin"].includes(fromV) && !["leftMargin", "rightMargin", "insideMargin", "outsideMargin"].includes(fromH);
  return marginBased
    ? { placement: "page", relativeTo: "margin", box: { x: round2(x - sec.margins.left), y: round2(y - sec.margins.top), width: w, height: h } }
    : { placement: "page", relativeTo: "page", box: { x: round2(x), y: round2(y), width: w, height: h } };
}

/** Floating drawing → object descriptor + its `::: id` group. */
async function floatingDrawing(anchor: X, ctx: Ctx): Promise<FloatResult | undefined> {
  const g = graphicOf(anchor);
  const ext = kid(anchor, "wp:extent");
  const cx = num(ext?.a.cx);
  const cy = num(ext?.a.cy);
  const w = emuToPt(cx);
  const h = emuToPt(cy);
  const docPr = kid(anchor, "wp:docPr");
  const name = docPr?.a.name ?? "object";
  if (!g) {
    note(ctx, "Floating object", "unsupported", "Charts, SmartArt and embedded objects are not imported.");
    return undefined;
  }
  const sec = ctx.sections[Math.min(ctx.section, ctx.sections.length - 1)];
  const place = anchorPlacement(anchor, w, h, sec);
  const wrapNode = anchor.c.find((c) => c.n.startsWith("wp:wrap"));
  const behind = anchor.a.behindDoc === "1";
  const wrap: ObjectDescriptor["wrap"] = behind || !wrapNode || wrapNode.n === "wp:wrapNone" ? "none" : wrapNode.n === "wp:wrapTopAndBottom" ? "topBottom" : "square";
  const base: Omit<ObjectDescriptor, "type"> = { ...place, ...(place.placement === "anchored" || wrap !== "none" ? { wrap } : { wrap }), plane: behind ? "behind" : "front", name };
  const decorative = docPr?.a.descr === "Decorative" || !!first(docPr, "adec:decorative");
  let id: string;
  let descriptor: ObjectDescriptor;
  let body = "";
  if (g.n === "pic:pic") {
    const file = await media(ctx, first(g, "a:blip")?.a["r:embed"]);
    if (!file) return undefined;
    id = freeId(ctx, name.replace(/\s+\d+$/, "") || "picture");
    descriptor = { type: "image", ...base };
    body = imageMd(decorative ? "" : docPr?.a.descr ?? "", file, ctx);
    note(ctx, "Floating pictures", "supported", "Picture objects at their Word position, wrap and layer.");
  } else if (g.n === "wps:wsp") {
    const spPr = kid(g, "wps:spPr");
    const paint = paintOf(spPr, kid(g, "wps:style"), ctx.scheme);
    const prst = kid(spPr, "a:prstGeom")?.a.prst;
    const cust = kid(spPr, "a:custGeom");
    const kind = hasPictureFill(g) ? undefined : prst ? NATIVE_SHAPES[prst] : cust ? "custom" : undefined;
    const txbx = first(g, "w:txbxContent");
    if (!kind) {
      const file = await svgAsset(ctx, g, cx, Math.max(cy, 1), name);
      id = freeId(ctx, name.replace(/\s+\d+$/, "") || "drawing");
      descriptor = { type: "image", ...base };
      body = imageMd("", file, ctx);
      note(ctx, "Picture-filled and uncommon shapes", "flattened", "Drawn as SVG pictures (their text is not editable).");
    } else {
      id = freeId(ctx, name.replace(/\s+\d+$/, "") || "shape");
      const isLine = kind === "line";
      const style = objectStyle(paint, isLine);
      const bodyPr = kid(g, "wps:bodyPr");
      if (txbx) {
        const anchorV = bodyPr?.a.anchor;
        if (anchorV === "ctr") style.valign = "middle";
        else if (anchorV === "b") style.valign = "bottom";
        const ins = num(bodyPr?.a.lIns, 91440);
        if (ins !== 91440) style.padding = emuToPt(ins);
      }
      const plain = !paint.fill && !paint.line;
      descriptor = { type: txbx && (plain || kind === "rect") && plain ? "textbox" : "shape", ...base, ...(kind !== "rect" || !txbx || !plain ? { shape: kind } : {}), style };
      const xf = kid(spPr, "a:xfrm");
      if (num(xf?.a.rot)) descriptor.rotation = round2(num(xf?.a.rot) / 60000);
      if (isLine && xf?.a.flipV === "1") descriptor.box = { ...descriptor.box, y: descriptor.box.y + h, height: -h };
      if (cust) {
        const geometry = customGeometry(cust, cx, cy);
        if (geometry) descriptor.geometry = geometry;
        note(ctx, "Custom geometry shapes", "supported", "Editable custom shapes (path kept); exported to Word as rectangles.");
      } else note(ctx, "Shapes and text boxes", "supported", "Editable shapes with fill, outline, rotation and their text.");
      if (txbx) body = (await blocks(txbx.c, ctx, { inObject: true })).join("\n\n");
    }
  } else {
    const file = await svgAsset(ctx, g, cx, Math.max(cy, 1), name);
    id = freeId(ctx, name.replace(/\s+\d+$/, "") || "group");
    descriptor = { type: "image", ...base };
    body = imageMd("", file, ctx);
    note(ctx, "Groups", "flattened", "Grouped drawings become one SVG picture (vector).");
  }
  ctx.meta.objects[id] = descriptor;
  ctx.z.push({ id, height: num(anchor.a.relativeHeight) });
  return { id, md: fenced(id, body) };
}

/* Paragraphs ------------------------------------------------------------ */

interface BlockOpts {
  inObject?: boolean;
  inColumn?: boolean;
  /** Column nesting depth (layout tables inside layout tables). */
  depth?: number;
}

interface Para {
  md: string;
  group?: { key: string; base: string; props: BlockProps };
  /** Object groups to place before the block that follows them. */
  floats: string[];
  pageBreakAfter: boolean;
  sectionEnd?: X;
}

function styleChain(ctx: Ctx, id: string | undefined): StyleDef[] {
  const out: StyleDef[] = [];
  for (let s = id ? ctx.styles[id] : undefined, i = 0; s && i < 12; s = s.basedOn ? ctx.styles[s.basedOn] : undefined, i++) out.push(s);
  return out;
}

const outlineOf = (chain: StyleDef[]) => chain.find((s) => s.outlineLevel)?.outlineLevel;

async function paragraph(p: X, ctx: Ctx, opts: BlockOpts): Promise<Para> {
  const pPr = kid(p, "w:pPr");
  const styleId = kid(pPr, "w:pStyle")?.a["w:val"] ?? Object.values(ctx.styles).find((s) => s.type === "paragraph" && s.id === "Normal")?.id;
  const chain = styleChain(ctx, styleId);
  const style = chain[0];
  const segs: Inline[] = [];
  const floats: string[] = [];
  let pageBreakAfter = false;
  let field = 0;
  let inResult = false;
  const effective = { ...Object.assign({}, ...chain.slice().reverse().map((s) => s.run ?? {})) };
  const visit = async (nodes: X[], href?: string) => {
    for (const node of nodes) {
      switch (node.n) {
        case "w:r": {
          const fmt = { ...runFmt(kid(node, "w:rPr"), ctx, { ...style, run: effective } as StyleDef), ...(href ? { href } : {}) };
          for (const c of node.c) {
            if (c.n === "w:fldChar") {
              const t = c.a["w:fldCharType"];
              if (t === "begin") field++;
              else if (t === "separate") inResult = true;
              else if (t === "end") (field = Math.max(0, field - 1)), (inResult = false);
              continue;
            }
            if (field && !inResult) continue;
            if (c.n === "w:t") segs.push({ text: c.t, fmt });
            else if (c.n === "w:tab" || c.n === "w:ptab") segs.push({ text: " ", fmt: {} });
            else if (c.n === "w:noBreakHyphen") segs.push({ text: "-", fmt });
            else if (c.n === "w:sym") segs.push({ text: String.fromCharCode(parseInt(c.a["w:char"] ?? "20", 16) & 0xff || 32), fmt });
            else if (c.n === "w:br") {
              if (c.a["w:type"] === "page") pageBreakAfter = true;
              else if (c.a["w:type"] !== "column") segs.push({ text: "\\\n", fmt: {}, raw: true });
            } else if (c.n === "w:drawing" || c.n === "mc:AlternateContent") await drawingIn(c);
            else if (c.n === "w:pict") note(ctx, "VML drawings (legacy shapes, watermarks)", "unsupported", "Not imported.");
            else if (c.n === "w:object") note(ctx, "Embedded OLE objects", "unsupported", "Not imported.");
          }
          break;
        }
        case "w:hyperlink": {
          const rel = node.a["r:id"] ? ctx.rels.get(node.a["r:id"]) : undefined;
          const target = rel?.external ? rel.target : node.a["w:anchor"] ? `#${node.a["w:anchor"]}` : undefined;
          await visit(node.c, target && /^(https?:|mailto:|#)/i.test(target) ? target.replace(/[()\s]/g, encodeURIComponent) : undefined);
          break;
        }
        case "w:sdt":
          note(ctx, "Content controls (placeholders)", "flattened", "Kept as their text (the placeholder prompt when it is showing).");
          await visit(kid(node, "w:sdtContent")?.c ?? [], href);
          break;
        case "w:smartTag": case "w:customXml": case "w:ins": case "w:fldSimple": case "w:sdtContent":
          await visit(node.c, href);
          break;
        case "mc:AlternateContent":
          await drawingIn(node);
          break;
        default:
          break;
      }
    }
  };
  const drawingIn = async (c: X) => {
    const drawing = c.n === "w:drawing" ? c : first(kid(c, "mc:Choice"), "w:drawing");
    if (!drawing) {
      if (c.n === "mc:AlternateContent") note(ctx, "VML drawings (legacy shapes, watermarks)", "unsupported", "Not imported.");
      return;
    }
    const inline = kid(drawing, "wp:inline");
    const anchor = kid(drawing, "wp:anchor");
    if (inline) {
      const md = await inlineDrawing(inline, ctx);
      if (md) segs.push({ text: md, fmt: {}, raw: true });
    } else if (anchor && !opts.inObject) {
      const f = await floatingDrawing(anchor, ctx);
      if (f) floats.push(f.md);
    } else if (anchor) note(ctx, "Floating drawings inside text boxes", "unsupported", "Not imported.");
  };
  await visit(p.c);
  let text = inlineMarkdown(segs).trim();
  const sectionEnd = kid(pPr, "w:sectPr");
  if (!text) return { md: "", floats, pageBreakAfter, ...(sectionEnd ? { sectionEnd } : {}) };
  text = escapeLineStart(text);
  // Lists.
  const numPr = kid(pPr, "w:numPr") ?? chain.map((s) => (s as any).__numPr as X | undefined).find(Boolean);
  const numId = kid(numPr, "w:numId")?.a["w:val"];
  const level = num(kid(numPr, "w:ilvl")?.a["w:val"]);
  let md = text;
  const outline = outlineOf(chain);
  const isList = numId && numId !== "0" && ctx.numbering.has(numId);
  if (isList) {
    const fmt = ctx.numbering.get(numId!)![level] ?? "bullet";
    md = `${"   ".repeat(level)}${fmt === "bullet" ? "-" : "1."} ${text}`;
    note(ctx, "Lists", "flattened", "Bulleted and numbered paragraphs become Markdown lists (number formats come from the master).");
  } else if (outline && outline <= 6 && !opts.inObject) md = `${"#".repeat(outline)} ${text.replace(/\\\n/g, " ")}`;
  // Block group: named style (unless implied by the Markdown) + direct paragraph formatting.
  const { outlineLevel: _o, ...direct } = paragraphProps(xmlObject(pPr ?? { n: "w:pPr", a: {}, c: [], t: "" }));
  const props: BlockProps = { ...direct };
  settleLineHeight(props, runFmtSize(kid(first(p, "w:r"), "w:rPr")) ?? chain.find((s) => s.run?.size)?.run?.size ?? ctx.styles.Normal?.run?.size ?? 11);
  const implied = !styleId || styleId === "Normal" || (outline && styleId === `Heading${outline}`) || (isList && /^List/.test(styleId));
  if (styleId && !implied && ctx.styles[styleId]) props.style = styleId;
  delete props.widowControl;
  if (opts.inObject) delete props.style;
  const key = JSON.stringify(props);
  const group = key !== "{}" ? { key, base: style?.name ?? styleId ?? "block", props } : undefined;
  return { md, ...(group ? { group } : {}), floats, pageBreakAfter, ...(sectionEnd ? { sectionEnd } : {}) };
}

/* Tables ---------------------------------------------------------------- */

interface Cell {
  /** Grid columns covered: [start, end). */
  start: number;
  end: number;
  width: number;
  merged: boolean;
  shade?: string;
  /** Visible top / bottom border (a rule above / below the cell content). */
  top?: boolean;
  bottom?: boolean;
  content: X[];
}

const visibleBorder = (b: X | undefined) => !!b && !["nil", "none", ""].includes(b.a["w:val"] ?? "none");

function rowsOf(tbl: X): { cells: Cell[]; height: number }[] {
  const grid = kids(kid(tbl, "w:tblGrid"), "w:gridCol").map((g) => num(g.a["w:w"]));
  return kids(tbl, "w:tr").map((tr) => {
    let col = num(kid(kid(tr, "w:trPr"), "w:gridBefore")?.a["w:val"]);
    const cells: Cell[] = [];
    const tcs = tr.c.flatMap((c) => (c.n === "w:tc" ? [c] : c.n === "w:sdt" ? kids(kid(c, "w:sdtContent"), "w:tc") : []));
    for (const tc of tcs) {
      const tcPr = kid(tc, "w:tcPr");
      const span = Math.max(1, num(kid(tcPr, "w:gridSpan")?.a["w:val"], 1));
      const vMerge = kid(tcPr, "w:vMerge");
      const fill = kid(tcPr, "w:shd")?.a["w:fill"];
      const borders = kid(tcPr, "w:tcBorders");
      const width = grid.slice(col, col + span).reduce((a, b) => a + b, 0) || num(kid(tcPr, "w:tcW")?.a["w:w"]);
      cells.push({
        start: col, end: col + span, width, merged: !!vMerge && vMerge.a["w:val"] !== "restart",
        ...(fill && /^[0-9A-F]{6}$/i.test(fill) && fill.toUpperCase() !== "FFFFFF" ? { shade: fill.toUpperCase() } : {}),
        ...(visibleBorder(kid(borders, "w:top")) ? { top: true } : {}),
        ...(visibleBorder(kid(borders, "w:bottom")) ? { bottom: true } : {}),
        content: tc.c.filter((c) => c.n !== "w:tcPr"),
      });
      col += span;
    }
    const trH = kid(kid(tr, "w:trPr"), "w:trHeight");
    return { cells, height: trH ? twipToPt(num(trH.a["w:val"])) : 0 };
  });
}

const hasContent = (nodes: X[]) => nodes.some((n) => find(n, "w:t").some((t) => t.t.trim()) || find(n, "w:drawing").length > 0);

function isDataTable(rows: { cells: Cell[] }[], ctx: Ctx): boolean {
  if (rows.length < 2) return false;
  if (rows.some((r) => r.cells.length < 2)) return false;
  for (const r of rows)
    for (const c of r.cells) {
      if (c.merged || c.end - c.start > 1) return false;
      const paras = c.content.filter((n) => n.n === "w:p" || n.n === "w:sdt" || n.n === "w:tbl");
      if (paras.length > 1 || c.content.some((n) => n.n === "w:tbl") || find({ n: "", a: {}, c: c.content, t: "" }, "w:drawing").length) return false;
      const styleId = first({ n: "", a: {}, c: c.content, t: "" }, "w:pStyle")?.a["w:val"];
      if (styleId && outlineOf(styleChain(ctx, styleId))) return false;
    }
  return true;
}

const cellText = async (c: Cell, ctx: Ctx) => (await blocks(c.content, ctx, { inColumn: true, inObject: true })).join("<br>").replace(/\n/g, " ").replace(/\|/g, "\\|") || " ";

/** Spacer reserving `h` pt of empty height in a column (rows sized for floating pictures). */
function spacer(ctx: Ctx, h: number): string {
  const id = freeId(ctx, "spacer");
  ctx.meta.blocks[id] = { spaceBefore: round2(Math.max(0, h - 14)), spaceAfter: 0 };
  return fenced(id, "&nbsp;");
}

interface Col {
  flex: number;
  md: string;
  fill?: string;
}

/**
 * Side-by-side columns. Word layout tables space their columns with narrow empty columns: those
 * are dropped (the editor's column gap stands for them).
 */
const columnsMd = (all: Col[]) => {
  const total = all.reduce((a, c) => a + c.flex, 0);
  const empty = (md: string) => !md.trim() || /^(::: spacer[\w-]*\n&nbsp;\n:::\s*)+$/.test(md.trim());
  const cols = all.filter((c) => !empty(c.md) || c.flex > total * 0.15);
  if (cols.length === 1 && !cols[0].fill) return cols[0].md;
  // Columns shaded alike: one shaded box behind them all.
  const shared = cols.length > 1 && cols.every((c) => c.fill && c.fill === cols[0].fill) ? cols[0].fill : undefined;
  return columnsHtml(shared ? cols.map(({ fill: _f, ...c }) => c) : cols, shared);
};

const columnsHtml = (cols: Col[], fill?: string) =>
  [`<div class="ms-columns" style="display:flex;gap:24px${fill ? `;background:#${fill};padding:12px` : ""}">`, ...cols.flatMap((c) => [`<div class="ms-column" style="flex:${c.flex};min-width:0${c.fill ? `;background:#${c.fill};padding:12px` : ""}">`, c.md.trim() || "&nbsp;", "</div>"]), "</div>"].join("\n\n");

/** A rule (cell border above / below its content). */
const RULE = "---";

/** One rule where a cell's bottom border meets the next cell's top border. */
const dedupeRules = (parts: string[]): string[] => parts.filter((p, i) => p !== RULE || parts[i - 1] !== RULE);

async function cellBlocks(c: Cell, ctx: Ctx, opts: BlockOpts, floats: string[]): Promise<string[]> {
  const out = await blocks(c.content, ctx, opts, floats);
  return [...(c.top ? [RULE] : []), ...out, ...(c.bottom ? [RULE] : [])];
}

async function table(tbl: X, ctx: Ctx, opts: BlockOpts, floats: string[]): Promise<string[]> {
  const rows = rowsOf(tbl);
  if (!rows.length) return [];
  if (isDataTable(rows, ctx)) {
    note(ctx, "Tables", "supported", "Data tables become Markdown tables with their column widths; cell shading and borders use the table look of the master.");
    const lines: string[] = [];
    const widths = rows[0].cells.map((c) => c.width);
    for (const [i, r] of rows.entries()) {
      lines.push(`| ${(await Promise.all(r.cells.map((c) => cellText(c, ctx)))).join(" | ")} |`);
      if (i === 0) lines.push(`|${r.cells.map(() => " --- ").join("|")}|`);
    }
    if (opts.inColumn || opts.inObject) return [lines.join("\n")];
    const id = freeId(ctx, "table");
    ctx.meta.blocks[id] = { cols: widths.map((w) => Math.round(ptToPx(twipToPt(w)))) };
    return [fenced(id, lines.join("\n"))];
  }
  const depth = opts.depth ?? 0;
  const inner: BlockOpts = { ...opts, inColumn: true, depth: depth + 1 };
  // Inside text boxes, or columns already nested twice: the cells are stacked.
  if (opts.inObject || depth >= 2) {
    const out: string[] = [];
    for (const r of rows) for (const c of r.cells) if (!c.merged) out.push(...(await cellBlocks(c, ctx, inner, floats)));
    if (depth >= 2) note(ctx, "Deeply nested layout tables", "flattened", "Cells three levels deep are stacked.");
    return out;
  }
  note(ctx, "Layout tables", "flattened", "Tables used for page layout become side-by-side columns: cell shading → column background, cell top / bottom borders → rules, nested tables → nested columns.");
  const out = await layoutRows(rows, ctx, inner, floats, depth);
  if (rows.some((r) => r.cells.some((c) => c.shade))) note(ctx, "Cell shading", "supported", "Shaded layout cells become column backgrounds.");
  return out;
}

type Rows = { cells: Cell[]; height: number }[];

/**
 * Layout table rows → blocks. Bands: rows joined by vertical merges are laid out together. In a
 * band, the columns are the grid segments no cell crosses; each segment stacks the band's cells
 * (rows) falling in it — recursively, so a segment whose rows have their own merges becomes
 * nested columns — and rows stay aligned across columns while merged cells span their rows.
 */
async function layoutRows(rows: Rows, ctx: Ctx, inner: BlockOpts, floats: string[], depth: number): Promise<string[]> {
  const bands: Rows[] = [];
  for (const r of rows) {
    if (bands.length && r.cells.some((c) => c.merged)) bands[bands.length - 1].push(r);
    else bands.push([r]);
  }
  const live = (r: Rows[number]) => r.cells.filter((c) => !c.merged);
  const filled = (cs: Cell[]) => cs.some((c) => hasContent(c.content) || c.top || c.bottom);
  /** Rows of a segment stacked in one column (a row with several cells becomes nested columns). */
  const stack = async (band: Rows): Promise<string[]> => {
    const parts: string[] = [];
    for (const r of band) {
      const cells = live(r);
      if (!filled(cells)) {
        if (r.height > 20 && band.length > 1) parts.push(spacer(ctx, r.height));
        continue;
      }
      if (cells.length === 1 || depth >= 3) {
        for (const c of cells) parts.push(...(await cellBlocks(c, ctx, { ...inner, depth: depth + 1 }, floats)));
        continue;
      }
      const sub: Col[] = [];
      for (const c of cells) sub.push({ flex: round2(c.width / 1000) || 1, md: (await cellBlocks(c, ctx, { ...inner, depth: depth + 1 }, floats)).join("\n\n"), ...(c.shade ? { fill: c.shade } : {}) });
      parts.push(columnsMd(sub));
    }
    return parts;
  };
  const out: string[] = [];
  for (const band of bands) {
    const edges = new Set<number>();
    for (const r of band) for (const c of r.cells) (edges.add(c.start), edges.add(c.end));
    const cuts = [...edges].sort((a, b) => a - b).filter((g) => !band.some((r) => r.cells.some((c) => c.start < g && g < c.end)));
    if (!band.some((r) => filled(live(r)))) {
      const h = band.reduce((a, r) => a + r.height, 0);
      if (h > 20) out.push(spacer(ctx, h));
      continue;
    }
    if (cuts.length <= 2) {
      out.push(...dedupeRules(await stack(band)));
      continue;
    }
    const segments: Col[] = [];
    for (let s = 0; s + 1 < cuts.length; s++) {
      const [a, b] = [cuts[s], cuts[s + 1]];
      const segRows: Rows = band.map((r) => ({ height: r.height, cells: r.cells.filter((c) => c.start >= a && c.end <= b) }));
      const width = Math.max(0, ...segRows.map((r) => r.cells.reduce((sum, c) => sum + c.width, 0)));
      const fills = new Set(segRows.flatMap((r) => live(r).map((c) => c.shade)));
      // Rows of the segment with merges of their own: nested layout.
      const nested = segRows.some((r) => live(r).length > 1) && segRows.some((r) => r.cells.some((c) => c.merged)) && depth < 3;
      const parts = nested ? await layoutRows(segRows, ctx, inner, floats, depth + 1) : await stack(segRows);
      // Trailing empty rows only pad the column (their height comes from the other columns).
      while (parts.length && /^::: spacer/.test(parts[parts.length - 1])) parts.pop();
      const fill = fills.size === 1 ? [...fills][0] : undefined;
      segments.push({ flex: round2(width / 1000) || 1, md: dedupeRules(parts).join("\n\n"), ...(fill ? { fill } : {}) });
    }
    out.push(columnsMd(segments));
  }
  return out;
}

/* Block flow ------------------------------------------------------------ */

/**
 * Block-level nodes → Markdown blocks. Floating objects found in cells / columns are hoisted to
 * `floats` (they anchor to the top-level block holding them); at the top level they precede
 * their anchor block.
 */
async function blocks(nodes: X[], ctx: Ctx, opts: BlockOpts = {}, hoist?: string[]): Promise<string[]> {
  const out: string[] = [];
  const pendingFloats: string[] = [];
  let open: { key: string; id: string; items: string[] } | null = null;
  const closeGroup = () => {
    if (!open) return;
    out.push(fenced(open.id, open.items.join("\n\n")));
    open = null;
  };
  const emit = (md: string, group?: Para["group"]) => {
    if (!group) {
      closeGroup();
      out.push(md);
      return;
    }
    if (open && open.key === group.key) {
      open.items.push(md);
      return;
    }
    closeGroup();
    const id = freeId(ctx, group.base);
    ctx.meta.blocks[id] = group.props;
    open = { key: group.key, id, items: [md] };
  };
  const flushFloats = (floats: string[]) => {
    if (!floats.length) return;
    if (hoist) hoist.push(...floats);
    else {
      closeGroup();
      pendingFloats.push(...floats);
    }
  };
  const place = (md: string, group?: Para["group"]) => {
    if (pendingFloats.length) {
      closeGroup();
      out.push(...pendingFloats.splice(0));
    }
    emit(md, group);
  };
  const walk = async (list: X[]) => {
    for (const node of list) {
      if (node.n === "w:p") {
        const p = await paragraph(node, ctx, opts);
        flushFloats(p.floats);
        if (p.md) place(p.md, p.group);
        if (p.pageBreakAfter && !opts.inColumn && !opts.inObject) {
          closeGroup();
          const id = freeId(ctx, "pagebreak");
          ctx.meta.breaks[id] = { page: true };
          place(fenced(id, ""));
        }
        if (p.sectionEnd && !opts.inColumn && !opts.inObject) {
          ctx.section++;
          const next = ctx.sections[ctx.section];
          if (next) {
            closeGroup();
            const id = freeId(ctx, `section-${ctx.section + 1}`);
            ctx.meta.breaks[id] = next.props;
            place(fenced(id, ""));
          }
        }
      } else if (node.n === "w:tbl") {
        const floats: string[] = [];
        const tableBlocks = await table(node, ctx, opts, floats);
        flushFloats(floats);
        if (floats.length && !hoist) note(ctx, "Floating objects anchored in tables", "flattened", "Anchored to the block holding the table; their vertical position may shift.");
        for (const b of tableBlocks) place(b);
      } else if (node.n === "w:sdt") {
        note(ctx, "Content controls (placeholders)", "flattened", "Kept as their text (the placeholder prompt when it is showing).");
        await walk(kid(node, "w:sdtContent")?.c ?? []);
      } else if (["w:customXml", "w:ins", "w:smartTag"].includes(node.n)) await walk(node.c);
      else if (node.n === "w:altChunk") note(ctx, "Embedded HTML / RTF chunks", "unsupported", "Not imported.");
    }
  };
  await walk(nodes);
  closeGroup();
  // Objects with no block after them anchor to an empty paragraph.
  if (pendingFloats.length) out.push(...pendingFloats, "&nbsp;");
  return out;
}

/* Sections -------------------------------------------------------------- */

function sectionOf(sectPr: X | undefined, first?: Section): Section {
  const pgSz = kid(sectPr, "w:pgSz");
  const pgMar = kid(sectPr, "w:pgMar");
  const w = twipToPt(num(pgSz?.a["w:w"], 11906));
  const h = twipToPt(num(pgSz?.a["w:h"], 16838));
  const m = (k: string, d: number) => (pgMar?.a[`w:${k}`] !== undefined ? twipToPt(Math.abs(num(pgMar.a[`w:${k}`]))) : d);
  const margins = { top: m("top", 72), right: m("right", 72), bottom: m("bottom", 72), left: m("left", 72), header: m("header", 36), footer: m("footer", 36) };
  const cols = num(kid(sectPr, "w:cols")?.a["w:num"], 1);
  const type = kid(sectPr, "w:type")?.a["w:val"];
  const props: SectionProps = { break: type === "continuous" ? "continuous" : type === "oddPage" ? "oddPage" : type === "evenPage" ? "evenPage" : "nextPage" };
  if (!first || first.width !== w || first.height !== h) Object.assign(props, { size: "custom", width: Math.min(w, h), height: Math.max(w, h), orientation: w > h ? "landscape" : "portrait" });
  if (!first || JSON.stringify(first.margins) !== JSON.stringify(margins)) props.margins = margins;
  if (cols > 1) props.columns = { count: cols, gap: twipToPt(num(kid(sectPr, "w:cols")?.a["w:space"], 720)) };
  const start = kid(sectPr, "w:pgNumType")?.a["w:start"];
  if (start !== undefined) props.pageNumberStart = num(start, 1);
  return { width: w, height: h, margins, props };
}

/* Entry points ---------------------------------------------------------- */

async function prepare(data: Uint8Array, fileName: string, assetsDir: string) {
  const zip = await loadPackage(data);
  const template = await importTemplate(data, fileName);
  const docRels = await rels(zip, "word/document.xml");
  const tree = toX(ordered.parse(await zip.file("word/document.xml")!.async("string")));
  const docNode = tree.find((n) => n.n === "w:document");
  const body = kid(docNode, "w:body");
  if (!body) throw new Error("word/document.xml has no body");
  // Theme colors for drawings (scheme names as in DrawingML).
  const scheme: SchemeColors = { ...(template.family.theme?.colors as Record<string, string>) };
  // Numbering: numId → level formats.
  const numbering = new Map<string, string[]>();
  const numPart = [...docRels.values()].find((r) => r.type === "numbering" && !r.external)?.target;
  if (numPart && zip.file(numPart)) {
    const nt = toX(ordered.parse(await zip.file(numPart)!.async("string")));
    const root = nt.find((n) => n.n === "w:numbering");
    const abstracts = new Map(kids(root, "w:abstractNum").map((a) => [a.a["w:abstractNumId"], kids(a, "w:lvl").map((l) => kid(l, "w:numFmt")?.a["w:val"] ?? "bullet")]));
    for (const nn of kids(root, "w:num")) numbering.set(nn.a["w:numId"], abstracts.get(kid(nn, "w:abstractNumId")?.a["w:val"] ?? "") ?? []);
  }
  // Styles carrying a list (numPr in the style): remember it for their paragraphs.
  const styles = { ...(template.family.styles ?? {}) };
  const stylesPart = [...docRels.values()].find((r) => r.type === "styles" && !r.external)?.target;
  if (stylesPart && zip.file(stylesPart)) {
    const st = toX(ordered.parse(await zip.file(stylesPart)!.async("string")));
    for (const s of kids(st.find((n) => n.n === "w:styles"), "w:style")) {
      const numPr = kid(kid(s, "w:pPr"), "w:numPr");
      const def = styles[s.a["w:styleId"]];
      if (numPr && def) Object.defineProperty(def, "__numPr", { value: numPr, enumerable: false });
    }
  }
  const sectPrs = [...find(body, "w:sectPr")];
  const firstSection = sectionOf(sectPrs[0]);
  const sections = sectPrs.map((s, i) => (i ? sectionOf(s, firstSection) : firstSection));
  if (!sections.length) sections.push(firstSection);
  const ctx: Ctx = {
    zip, rels: docRels, scheme, fonts: template.family.theme?.fonts ?? { heading: "Calibri Light", body: "Calibri" }, styles, numbering, assetsDir, assets: new Map(), mediaNames: new Map(), report: new Map(), ids: new Set(),
    meta: { blocks: {}, breaks: {}, objects: {} }, z: [], sections, section: 0, svgCount: 0,
  };
  for (const id of ["header", "footer", "header-first", "footer-first", "header-even", "footer-even"]) ctx.ids.add(id);
  // Page color (Word's page background).
  const bg = kid(docNode, "w:background");
  const bgColor = bg?.a["w:color"] && /^[0-9A-F]{6}$/i.test(bg.a["w:color"]) ? bg.a["w:color"].toUpperCase() : bg?.a["w:themeColor"] ? colorOf({ n: "a:schemeClr", a: { val: bg.a["w:themeColor"].replace(/^background/, "bg").replace(/^text/, "tx") }, c: [], t: "" }, scheme)?.hex : undefined;
  return { template, body, docNode, ctx, firstSection, bgColor };
}

const reportOf = (ctx: Ctx): ImportReportItem[] => [...ctx.report.entries()].map(([feature, r]) => ({ feature, status: r.status, detail: `${r.detail}${r.count > 1 ? ` (${r.count}×)` : ""}`, part: "word/document.xml" }));

export async function importDocument(data: Uint8Array, fileName: string, opts: ImportDocumentOptions): Promise<ImportedDocument> {
  const { template, body, docNode, ctx, firstSection, bgColor } = await prepare(data, fileName, opts.assetsDir);
  const out = await blocks(body.c, ctx);
  // Page color → a full-page rectangle behind everything, on every page (master background).
  if (bgColor) {
    template.family.background = { ...template.family.background, "page-color": pageColor(bgColor, firstSection) };
    note(ctx, "Page color", "supported", "A full-page background of the master.");
  }
  // Stacking: Word's relativeHeight order → z per plane.
  ctx.z.sort((a, b) => a.height - b.height).forEach((o, i) => (ctx.meta.objects[o.id].z = i + 1));

  const meta: StudioMeta = {
    version: STUDIO_VERSION,
    ...(opts.master ? { master: opts.master } : {}),
    ...(Object.keys(ctx.meta.blocks).length ? { blocks: ctx.meta.blocks } : {}),
    ...(Object.keys(ctx.meta.breaks).length ? { breaks: ctx.meta.breaks } : {}),
    ...(Object.keys(ctx.meta.objects).length ? { objects: ctx.meta.objects } : {}),
  };
  const title = textOf(first(docNode, "w:t")).trim();
  const bodyText = `${out.join("\n\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
  const withTitle = `---\ntitle: ${JSON.stringify(fileName.replace(/\.(docx|dotx)$/i, "") || title || "Document")}\n---\n\n${bodyText}`;
  const source = writeMeta(withTitle, meta);
  return { source, assets: ctx.assets, report: [...template.report.filter((r) => r.feature !== "Sample body content"), ...reportOf(ctx)], template };
}

/** Background signature of a page design (dedupes sections that look the same). */
const designKey = (designId: string, background: Record<string, ObjectDescriptor>) =>
  JSON.stringify([designId, Object.values(background).map((o) => [o.type, o.box, o.src ?? o.geometry?.d.length ?? o.style, o.text])]);

/**
 * Word template → masters with their page furniture. On top of `importTemplate` (styles, theme,
 * page setup, header / footer stories), the floating drawings of every section — page color,
 * shapes, custom shapes, vector groups, pictures, text boxes — become the background of its
 * master, one master per distinct page design (typically a cover and inner pages). Text boxes
 * keep their text; a content control inside one becomes a placeholder of the master. Body text
 * stays sample content (reported). Drawings anchored to a paragraph are placed as if that
 * paragraph started the page (templates anchor their furniture there); the report says so.
 */
export async function importMasters(data: Uint8Array, fileName: string): Promise<ImportedTemplate> {
  const { template, body, ctx, firstSection, bgColor } = await prepare(data, fileName, "assets");
  const perSection: Record<string, ObjectDescriptor>[] = ctx.sections.map(() => ({}));
  let approximate = 0;
  for (const node of body.c) {
    for (const anchor of find(node, "wp:anchor")) {
      const f = await floatingDrawing(anchor, ctx);
      if (!f) continue;
      const d = ctx.meta.objects[f.id];
      const sec = ctx.sections[Math.min(ctx.section, ctx.sections.length - 1)];
      const bodyMd = /^::: [\w-]+\n([\s\S]*?)\n?:::$/.exec(f.md)?.[1] ?? "";
      const out: ObjectDescriptor = { ...d, placement: "page", relativeTo: "page", locked: { geometry: true } };
      delete out.wrap;
      if (d.placement === "anchored") approximate++;
      if (d.placement === "anchored" || d.relativeTo === "margin") out.box = { ...d.box, x: round2(d.box.x + sec.margins.left), y: round2(d.box.y + sec.margins.top) };
      const picture = /!\[[^\]]*\]\(assets\/([^)]+)\)/.exec(bodyMd);
      if (d.type === "image" && picture) out.src = `assets/${picture[1]}`;
      else if (bodyMd.trim()) {
        out.text = bodyMd.trim();
        const sdt = first(anchor, "w:sdt");
        if (sdt) {
          const pr = kid(sdt, "w:sdtPr");
          const xpath = kid(pr, "w:dataBinding")?.a["w:xpath"] ?? "";
          const name = kid(pr, "w:alias")?.a["w:val"] ?? kid(pr, "w:tag")?.a["w:val"] ?? "";
          out.placeholder = /dc:title/.test(xpath) ? "title" : /dc:subject/.test(xpath) ? "subtitle" : /PublishDate|dcterms:created/.test(xpath) ? "date" : `field:${slug(name || f.id)}`;
          note(ctx, "Placeholders", "supported", "Content controls in text boxes become master placeholders (their prompt is kept).");
        }
      }
      perSection[Math.min(ctx.section, perSection.length - 1)][f.id] = out;
    }
    if (node.n === "w:p" && kid(kid(node, "w:pPr"), "w:sectPr")) ctx.section++;
  }
  ctx.z.sort((a, b) => a.height - b.height).forEach((o, i) => {
    for (const objects of perSection) if (objects[o.id]) objects[o.id].z = i + 1;
  });
  if (approximate) note(ctx, "Furniture anchored to paragraphs", "flattened", "Placed from the top of its section; check its position in master edit mode.");
  if (bgColor) note(ctx, "Page color", "supported", "A full-page background of every master.");

  // One master per distinct (page design, furniture) pair; the first keeps the family id and the styles.
  const designs = [template.family, ...template.variants];
  const byKey = new Map<string, number>();
  const masters: MasterDef[] = [];
  const sectionDesigns: number[] = [];
  for (const [i, objects] of perSection.entries()) {
    const design = designs[template.sectionDesigns[i] ?? 0] ?? template.family;
    const background: Record<string, ObjectDescriptor> = { ...design.background, ...(bgColor ? { "page-color": pageColor(bgColor, ctx.sections[i] ?? firstSection) } : {}), ...objects };
    const key = designKey(design.id, background);
    if (!byKey.has(key)) {
      const provenance = { ...template.family.provenance!, section: i + 1 };
      if (!masters.length) masters.push({ ...template.family, background, provenance });
      else {
        const { styles: _s, theme: _t, numbering: _n, ...page } = design;
        masters.push({ ...page, id: `${template.family.id}-${i + 1}`, name: `${template.family.name} — page ${i + 1}`, description: `Section ${i + 1} page design of ${fileName}`, basedOn: template.family.id, inheritBackground: false, background, provenance });
      }
      byKey.set(key, masters.length - 1);
    }
    sectionDesigns.push(byKey.get(key)!);
  }
  if (masters.length > 1) masters[0].name = `${template.family.name} — page 1`;
  const report = [...template.report, ...reportOf(ctx)];
  for (const m of masters) m.provenance = { ...m.provenance!, report };
  const [family, ...variants] = masters;
  return { ...template, family, variants, assets: new Map([...template.assets, ...ctx.assets]), report, sectionDesigns };
}

export const pageColor = (hex: string, sec: { width: number; height: number }): ObjectDescriptor => ({
  type: "shape", shape: "rect", placement: "page", relativeTo: "page", box: { x: 0, y: 0, width: sec.width, height: sec.height }, plane: "behind", z: 0,
  style: { fill: hex, line: null }, locked: { geometry: true, content: true }, name: "Page color",
});
