/**
 * DrawingML (Word drawings) → Markdown Studio objects. A drawing becomes, by fidelity:
 *
 * * a picture (`pic:pic`) → the media part, cropped size kept;
 * * a simple preset shape (rect, ellipse, line…) with solid fill / line → an editable shape, its
 *   text box content (`wps:txbx`) kept as the object's paragraphs;
 * * a custom geometry shape (`a:custGeom`) → an editable `custom` shape carrying its SVG path
 *   (guides evaluated, arcs / Béziers converted);
 * * a group (`wpg:wgp`) or any other drawing → one SVG picture (vector, every child transformed).
 *
 * Coordinates stay in EMU inside SVGs (`viewBox` = the drawing extent), so no precision is lost.
 */
import { emuToPt } from "../../document/units";
import type { ObjectStyle, ShapeKind } from "../../document/schema";

/** Order-preserving XML element. */
export interface X {
  n: string;
  a: Record<string, string>;
  c: X[];
  t: string;
}

/** fast-xml-parser `preserveOrder` output → X elements (text nodes become `#text` elements). */
export function toX(nodes: any[]): X[] {
  const out: X[] = [];
  for (const node of nodes ?? []) {
    if (!node || typeof node !== "object") continue;
    if ("#text" in node) {
      out.push({ n: "#text", a: {}, c: [], t: String(node["#text"]) });
      continue;
    }
    const name = Object.keys(node).find((k) => k !== ":@");
    if (!name) continue;
    const a: Record<string, string> = {};
    for (const [k, v] of Object.entries(node[":@"] ?? {})) a[k.replace(/^@_/, "")] = String(v);
    const c = toX(node[name]);
    out.push({ n: name, a, c, t: c.filter((k) => k.n === "#text").map((k) => k.t).join("") });
  }
  return out;
}

export const kid = (x: X | undefined, name: string): X | undefined => x?.c.find((c) => c.n === name);
export const kids = (x: X | undefined, name: string): X[] => (x ? x.c.filter((c) => c.n === name) : []);
/** Depth-first descendants named `name` (not descending into matches). */
export function find(x: X | undefined, name: string, out: X[] = []): X[] {
  for (const c of x?.c ?? []) {
    if (c.n === name) out.push(c);
    else find(c, name, out);
  }
  return out;
}
export const first = (x: X | undefined, name: string): X | undefined => find(x, name)[0];
export const textOf = (x: X | undefined): string => (!x ? "" : x.n === "#text" ? x.t : x.c.map(textOf).join(""));
const n = (v: string | undefined, d = 0) => (v === undefined || v === "" || isNaN(Number(v)) ? d : Number(v));

/* Colors ---------------------------------------------------------------- */

export type SchemeColors = Record<string, string>;

const SCHEME_ALIAS: Record<string, string> = { tx1: "dk1", bg1: "lt1", tx2: "dk2", bg2: "lt2", phClr: "dk1" };
const PRESET: Record<string, string> = { black: "000000", white: "FFFFFF", red: "FF0000", green: "008000", blue: "0000FF", yellow: "FFFF00", gray: "808080", grey: "808080", darkGray: "A9A9A9", lightGray: "D3D3D3", orange: "FFA500" };

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (!s) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = (t + 1) % 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

/** A color element (`a:srgbClr`, `a:schemeClr`…) with its modifiers → RRGGBB + opacity. */
export function colorOf(x: X | undefined, scheme: SchemeColors): { hex: string; alpha: number } | undefined {
  if (!x) return undefined;
  let hex: string | undefined;
  if (x.n === "a:srgbClr") hex = x.a.val;
  else if (x.n === "a:schemeClr") hex = scheme[SCHEME_ALIAS[x.a.val] ?? x.a.val];
  else if (x.n === "a:sysClr") hex = x.a.lastClr ?? (x.a.val === "window" ? "FFFFFF" : "000000");
  else if (x.n === "a:prstClr") hex = PRESET[x.a.val];
  else if (x.n === "a:scrgbClr") hex = [x.a.r, x.a.g, x.a.b].map((v) => Math.round((n(v) / 100000) * 255).toString(16).padStart(2, "0")).join("");
  if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) return undefined;
  let [r, g, b] = [0, 2, 4].map((i) => parseInt(hex!.slice(i, i + 2), 16) / 255);
  let alpha = 1;
  for (const m of x.c) {
    const v = n(m.a.val) / 100000;
    if (m.n === "a:alpha") alpha = v;
    else if (m.n === "a:tint") [r, g, b] = [r, g, b].map((c) => c * v + (1 - v));
    else if (m.n === "a:shade") [r, g, b] = [r, g, b].map((c) => c * v);
    else if (["a:lumMod", "a:lumOff", "a:satMod", "a:satOff"].includes(m.n)) {
      const [h, s, l] = rgbToHsl(r, g, b);
      const next = m.n === "a:lumMod" ? [h, s, l * v] : m.n === "a:lumOff" ? [h, s, l + v] : m.n === "a:satMod" ? [h, s * v, l] : [h, s + v, l];
      [r, g, b] = hslToRgb(next[0], Math.min(1, Math.max(0, next[1])), Math.min(1, Math.max(0, next[2])));
    }
  }
  const out = [r, g, b].map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
  return { hex: out, alpha: Math.round(alpha * 1000) / 1000 };
}

const COLOR_TAGS = ["a:srgbClr", "a:schemeClr", "a:sysClr", "a:prstClr", "a:scrgbClr"];
const colorChild = (x: X | undefined) => x?.c.find((c) => COLOR_TAGS.includes(c.n));

export interface Paint {
  fill?: { hex: string; alpha: number } | null;
  line?: { hex: string; alpha: number; width: number; dash?: string; cap?: string } | null;
}

/** Fill and outline of a shape: its `spPr`, falling back to its `wps:style` references. */
export function paintOf(spPr: X | undefined, style: X | undefined, scheme: SchemeColors, inherited?: Paint): Paint {
  const out: Paint = {};
  const fillNode = spPr?.c.find((c) => ["a:solidFill", "a:noFill", "a:gradFill", "a:pattFill", "a:grpFill", "a:blipFill"].includes(c.n));
  if (fillNode?.n === "a:noFill") out.fill = null;
  else if (fillNode?.n === "a:solidFill") out.fill = colorOf(colorChild(fillNode), scheme) ?? null;
  else if (fillNode?.n === "a:gradFill") out.fill = colorOf(colorChild(first(fillNode, "a:gs")), scheme) ?? null;
  else if (fillNode?.n === "a:pattFill") out.fill = colorOf(colorChild(kid(fillNode, "a:fgClr")), scheme) ?? null;
  else if (fillNode?.n === "a:grpFill") out.fill = inherited?.fill;
  else if (style && n(kid(style, "a:fillRef")?.a.idx) > 0) out.fill = colorOf(colorChild(kid(style, "a:fillRef")), scheme);
  const ln = kid(spPr, "a:ln");
  const lnRef = kid(style, "a:lnRef");
  const lineFill = ln?.c.find((c) => ["a:solidFill", "a:noFill", "a:gradFill"].includes(c.n));
  const width = ln?.a.w !== undefined ? n(ln.a.w) : [0, 9525, 19050, 28575][Math.min(3, n(lnRef?.a.idx))] || 9525;
  let color: { hex: string; alpha: number } | undefined | null;
  if (lineFill?.n === "a:noFill") color = null;
  else if (lineFill?.n === "a:solidFill") color = colorOf(colorChild(lineFill), scheme);
  else if (lineFill?.n === "a:gradFill") color = colorOf(colorChild(first(lineFill, "a:gs")), scheme);
  else if (lnRef && n(lnRef.a.idx) > 0) color = colorOf(colorChild(lnRef), scheme);
  else color = ln || lnRef ? undefined : null;
  out.line = color ? { ...color, width, dash: kid(ln, "a:prstDash")?.a.val, cap: ln?.a.cap } : color === null ? null : inherited?.line ?? null;
  if (out.fill === undefined) out.fill = spPr && !fillNode && !style ? inherited?.fill ?? null : out.fill ?? null;
  return out;
}

/* Geometry -------------------------------------------------------------- */

/**
 * Shape guide formulas (ECMA-376 §20.1.9.11): `*\/ x y z`, `+- x y z`, `+/ x y z`, `?: x y z`,
 * `abs`, `at2`, `cat2`, `cos`, `max`, `min`, `mod`, `pin`, `sat2`, `sin`, `sqrt`, `tan`, `val`.
 * Angles are 60 000ths of a degree.
 */
function guideEnv(w: number, h: number): Map<string, number> {
  const ss = Math.min(w, h);
  const env = new Map<string, number>([["w", w], ["h", h], ["l", 0], ["t", 0], ["r", w], ["b", h], ["hc", w / 2], ["vc", h / 2], ["ss", ss], ["ls", Math.max(w, h)], ["cd2", 10800000], ["cd4", 5400000], ["cd8", 2700000], ["3cd4", 16200000], ["3cd8", 8100000], ["5cd8", 13500000], ["7cd8", 18900000]]);
  for (const d of [2, 3, 4, 5, 6, 8, 10, 12, 16, 24, 32]) {
    env.set(`wd${d}`, w / d);
    env.set(`hd${d}`, h / d);
    env.set(`ssd${d}`, ss / d);
  }
  return env;
}

const ANG = Math.PI / 10800000;

function evalGuide(fmla: string, env: Map<string, number>): number {
  const [op, ...args] = fmla.trim().split(/\s+/);
  const v = (i: number) => {
    const a = args[i];
    if (a === undefined) return 0;
    return env.has(a) ? env.get(a)! : Number(a) || 0;
  };
  switch (op) {
    case "*/": return v(2) ? (v(0) * v(1)) / v(2) : 0;
    case "+-": return v(0) + v(1) - v(2);
    case "+/": return v(2) ? (v(0) + v(1)) / v(2) : 0;
    case "?:": return v(0) > 0 ? v(1) : v(2);
    case "abs": return Math.abs(v(0));
    case "at2": return Math.atan2(v(1), v(0)) / ANG;
    case "cat2": return v(0) * Math.cos(Math.atan2(v(2), v(1)));
    case "cos": return v(0) * Math.cos(v(1) * ANG);
    case "max": return Math.max(v(0), v(1));
    case "min": return Math.min(v(0), v(1));
    case "mod": return Math.sqrt(v(0) ** 2 + v(1) ** 2 + v(2) ** 2);
    case "pin": return v(1) < v(0) ? v(0) : v(1) > v(2) ? v(2) : v(1);
    case "sat2": return v(0) * Math.sin(Math.atan2(v(2), v(1)));
    case "sin": return v(0) * Math.sin(v(1) * ANG);
    case "sqrt": return Math.sqrt(Math.max(0, v(0)));
    case "tan": return v(0) * Math.tan(v(1) * ANG);
    case "val": return v(0);
    default: return 0;
  }
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export interface PathPart {
  d: string;
  fill: boolean;
  stroke: boolean;
}

/** `a:custGeom` → SVG paths in a `w`×`h` (EMU) box. */
export function customPaths(custGeom: X, w: number, h: number, scale = 1): PathPart[] {
  const S = (v: number) => Math.round(v * scale * 100) / 100;
  const env = guideEnv(w, h);
  for (const gd of [...kids(kid(custGeom, "a:avLst"), "a:gd"), ...kids(kid(custGeom, "a:gdLst"), "a:gd")]) env.set(gd.a.name, evalGuide(gd.a.fmla ?? "val 0", env));
  const parts: PathPart[] = [];
  for (const p of kids(kid(custGeom, "a:pathLst"), "a:path")) {
    const pw = n(p.a.w, w) || w;
    const ph = n(p.a.h, h) || h;
    const sx = pw ? w / pw : 1;
    const sy = ph ? h / ph : 1;
    // Guides are expressed in shape coordinates; numbers in path coordinates.
    const coord = (v: string | undefined, s: number) => (v !== undefined && env.has(v) ? env.get(v)! : n(v) * s);
    const pt = (x: X | undefined) => [coord(x?.a.x, sx), coord(x?.a.y, sy)] as const;
    let d = "";
    let cx = 0;
    let cy = 0;
    for (const cmd of p.c) {
      const pts = kids(cmd, "a:pt").map(pt);
      if (cmd.n === "a:moveTo" && pts[0]) {
        [cx, cy] = pts[0];
        d += `M${S(cx)} ${S(cy)}`;
      } else if (cmd.n === "a:lnTo" && pts[0]) {
        [cx, cy] = pts[0];
        d += `L${S(cx)} ${S(cy)}`;
      } else if (cmd.n === "a:cubicBezTo" && pts.length === 3) {
        d += `C${pts.map(([x, y]) => `${S(x)} ${S(y)}`).join(" ")}`;
        [cx, cy] = pts[2];
      } else if (cmd.n === "a:quadBezTo" && pts.length === 2) {
        d += `Q${pts.map(([x, y]) => `${S(x)} ${S(y)}`).join(" ")}`;
        [cx, cy] = pts[1];
      } else if (cmd.n === "a:arcTo") {
        const wR = coord(cmd.a.wR, sx);
        const hR = coord(cmd.a.hR, sy);
        const st = (env.has(cmd.a.stAng) ? env.get(cmd.a.stAng)! : n(cmd.a.stAng)) * ANG;
        const sw = (env.has(cmd.a.swAng) ? env.get(cmd.a.swAng)! : n(cmd.a.swAng)) * ANG;
        if (!wR || !hR) continue;
        // The current point lies on the ellipse at the start angle; find the end point.
        const at = (a: number) => {
          // Angles are visual (as on a circle stretched to the ellipse).
          const t = Math.atan2(wR * Math.sin(a), hR * Math.cos(a));
          return [wR * Math.cos(t), hR * Math.sin(t)] as const;
        };
        const [sx0, sy0] = at(st);
        const [ex0, ey0] = at(st + sw);
        const ox = cx - sx0;
        const oy = cy - sy0;
        const ex = ox + ex0;
        const ey = oy + ey0;
        if (Math.abs(sw) >= 2 * Math.PI - 1e-6) {
          // Full ellipse: two half arcs.
          const [mx, my] = at(st + sw / 2);
          d += `A${S(wR)} ${S(hR)} 0 0 ${sw > 0 ? 1 : 0} ${S(ox + mx)} ${S(oy + my)}A${S(wR)} ${S(hR)} 0 0 ${sw > 0 ? 1 : 0} ${S(ex)} ${S(ey)}`;
        } else d += `A${S(wR)} ${S(hR)} 0 ${Math.abs(sw) > Math.PI ? 1 : 0} ${sw > 0 ? 1 : 0} ${S(ex)} ${S(ey)}`;
        cx = ex;
        cy = ey;
      } else if (cmd.n === "a:close") d += "Z";
    }
    if (d) parts.push({ d, fill: p.a.fill !== "none", stroke: p.a.stroke !== "0" && p.a.stroke !== "false" });
  }
  return parts;
}

/** Preset geometries the editor draws natively. */
export const NATIVE_SHAPES: Record<string, ShapeKind> = {
  rect: "rect", roundRect: "roundRect", ellipse: "ellipse", triangle: "triangle", diamond: "diamond", rightArrow: "rightArrow", chevron: "chevron",
  line: "line", straightConnector1: "line",
};

/** SVG outline of a preset geometry (`w`×`h`); unknown presets draw their bounding box. */
function presetPath(prst: string, w: number, h: number): string {
  const r = Math.min(w, h) / 6;
  switch (prst) {
    case "ellipse": case "flowChartConnector": return `M0 ${h / 2}A${w / 2} ${h / 2} 0 1 1 ${w} ${h / 2}A${w / 2} ${h / 2} 0 1 1 0 ${h / 2}Z`;
    case "roundRect": case "flowChartAlternateProcess": return `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${h - r}A${r} ${r} 0 0 1 ${w - r} ${h}H${r}A${r} ${r} 0 0 1 0 ${h - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`;
    case "triangle": return `M${w / 2} 0L${w} ${h}L0 ${h}Z`;
    case "rtTriangle": return `M0 0L${w} ${h}L0 ${h}Z`;
    case "diamond": case "flowChartDecision": return `M${w / 2} 0L${w} ${h / 2}L${w / 2} ${h}L0 ${h / 2}Z`;
    case "rightArrow": return `M0 ${h / 4}H${w * 0.65}V0L${w} ${h / 2}L${w * 0.65} ${h}V${h * 0.75}H0Z`;
    case "leftArrow": return `M${w} ${h / 4}H${w * 0.35}V0L0 ${h / 2}L${w * 0.35} ${h}V${h * 0.75}H${w}Z`;
    case "chevron": return `M0 0H${w * 0.75}L${w} ${h / 2}L${w * 0.75} ${h}H0L${w * 0.25} ${h / 2}Z`;
    case "homePlate": return `M0 0H${w * 0.8}L${w} ${h / 2}L${w * 0.8} ${h}H0Z`;
    case "parallelogram": return `M${w * 0.25} 0H${w}L${w * 0.75} ${h}H0Z`;
    case "hexagon": return `M${w * 0.25} 0H${w * 0.75}L${w} ${h / 2}L${w * 0.75} ${h}H${w * 0.25}L0 ${h / 2}Z`;
    case "pentagon": return `M${w / 2} 0L${w} ${h * 0.38}L${w * 0.81} ${h}H${w * 0.19}L0 ${h * 0.38}Z`;
    case "line": case "straightConnector1": case "bentConnector3": return `M0 0L${w} ${h}`;
    default: return `M0 0H${w}V${h}H0Z`;
  }
}

/* SVG ------------------------------------------------------------------- */

export interface SvgContext {
  scheme: SchemeColors;
  /** Picture bytes as a data URL (SVG pictures cannot load external files). */
  picture: (rId: string) => string | undefined;
  report: (feature: string, detail: string) => void;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

function paintAttrs(p: Paint, part?: PathPart, scale = 1): string {
  const fill = part && !part.fill ? null : p.fill;
  const line = part && !part.stroke ? null : p.line;
  let s = fill ? ` fill="#${fill.hex}"${fill.alpha < 1 ? ` fill-opacity="${fill.alpha}"` : ""}` : ` fill="none"`;
  if (line) {
    const lw = line.width / scale;
    s += ` stroke="#${line.hex}" stroke-width="${Math.round(Math.max(1 / scale, lw) * 100) / 100}"${line.alpha < 1 ? ` stroke-opacity="${line.alpha}"` : ""}`;
    s += ` stroke-linecap="${line.cap === "rnd" ? "round" : line.cap === "sq" ? "square" : "butt"}" stroke-linejoin="round"`;
    if (line.dash && line.dash !== "solid") s += ` stroke-dasharray="${/dot/i.test(line.dash) ? `${lw} ${lw * 2}` : `${lw * 4} ${lw * 3}`}"`;
  }
  return s;
}

/** `a:xfrm` → SVG transform placing a `w`×`h` child at its offset, with rotation / flips. */
function xfrmOf(x: X | undefined): { x: number; y: number; w: number; h: number; rot: number; flipH: boolean; flipV: boolean } {
  return {
    x: n(kid(x, "a:off")?.a.x), y: n(kid(x, "a:off")?.a.y), w: n(kid(x, "a:ext")?.a.cx), h: n(kid(x, "a:ext")?.a.cy),
    rot: n(x?.a.rot) / 60000, flipH: x?.a.flipH === "1", flipV: x?.a.flipV === "1",
  };
}

function placeTransform(f: ReturnType<typeof xfrmOf>): string {
  const t = [`translate(${r1(f.x)} ${r1(f.y)})`];
  if (f.rot || f.flipH || f.flipV) {
    t.push(`translate(${r1(f.w / 2)} ${r1(f.h / 2)})`);
    if (f.rot) t.push(`rotate(${r1(f.rot)})`);
    if (f.flipH || f.flipV) t.push(`scale(${f.flipH ? -1 : 1} ${f.flipV ? -1 : 1})`);
    t.push(`translate(${r1(-f.w / 2)} ${r1(-f.h / 2)})`);
  }
  return t.join(" ");
}

/** Text of a shape's text box as plain lines (SVG pictures keep text approximately). */
function svgText(txbx: X | undefined, w: number, scheme: SchemeColors, scale: number): string {
  const paras = find(txbx, "w:p");
  if (!paras.length) return "";
  let y = 0;
  let out = "";
  for (const p of paras) {
    const text = textOf({ n: "", a: {}, t: "", c: find(p, "w:t") });
    const sz = (n(first(p, "w:sz")?.a["w:val"], 22) / 2) * 12700 / scale;
    y += sz * 1.2;
    if (!text.trim()) continue;
    const jc = first(p, "w:jc")?.a["w:val"];
    const color = first(p, "w:color")?.a["w:val"];
    const anchor = jc === "center" ? "middle" : jc === "right" || jc === "end" ? "end" : "start";
    const x = anchor === "middle" ? w / 2 : anchor === "end" ? w : 0;
    out += `<text x="${r1(x)}" y="${r1(y)}" font-size="${r1(sz)}" text-anchor="${anchor}" fill="#${/^[0-9a-f]{6}$/i.test(color ?? "") ? color : scheme.dk1 ?? "000000"}" font-family="${esc(first(p, "w:rFonts")?.a["w:ascii"] ?? "Calibri")}"${first(p, "w:b") ? ' font-weight="bold"' : ""}>${esc(text)}</text>`;
  }
  return out;
}

/** One shape / picture / group element (group child coordinates) → SVG markup. */
function svgNode(x: X, ctx: SvgContext, inherited?: Paint, scale = 1): string {
  if (x.n === "wpg:grpSp" || x.n === "wpg:wgp") {
    const grpSpPr = kid(x, "wpg:grpSpPr");
    const xf = kid(grpSpPr, "a:xfrm");
    const paint = paintOf(grpSpPr, undefined, ctx.scheme, inherited);
    const f = xfrmOf(xf);
    const chOff = kid(xf, "a:chOff");
    const chExt = kid(xf, "a:chExt");
    const sx = xf && n(chExt?.a.cx) ? f.w / n(chExt?.a.cx) : 1;
    const sy = xf && n(chExt?.a.cy) ? f.h / n(chExt?.a.cy) : 1;
    // Line widths are EMU at the page scale: children draw them divided by the group scale.
    const inner = scale * Math.sqrt(Math.abs(sx * sy)) || scale;
    const children = x.c.filter((c) => ["wps:wsp", "wpg:grpSp", "pic:pic"].includes(c.n)).map((c) => svgNode(c, ctx, { fill: paint.fill ?? inherited?.fill, line: inherited?.line }, inner));
    if (!xf) return children.join("");
    // wgp (the root) is drawn in its own extent: only the child-space mapping applies.
    const place = x.n === "wpg:wgp" ? "" : `${placeTransform(f)} `;
    return `<g transform="${place}scale(${sx} ${sy}) translate(${-n(chOff?.a.x)} ${-n(chOff?.a.y)})">${children.join("")}</g>`;
  }
  if (x.n === "pic:pic") {
    const spPr = kid(x, "pic:spPr");
    const f = xfrmOf(kid(spPr, "a:xfrm"));
    const rId = first(x, "a:blip")?.a["r:embed"];
    const href = rId ? ctx.picture(rId) : undefined;
    if (!href) return "";
    return `<image transform="${placeTransform(f)}" width="${r1(f.w)}" height="${r1(f.h)}" preserveAspectRatio="none" href="${href}"/>`;
  }
  const spPr = kid(x, "wps:spPr");
  const f = xfrmOf(kid(spPr, "a:xfrm"));
  const paint = paintOf(spPr, kid(x, "wps:style"), ctx.scheme, inherited);
  const cust = kid(spPr, "a:custGeom");
  const prst = kid(spPr, "a:prstGeom")?.a.prst ?? "rect";
  let body = "";
  if (cust) for (const part of customPaths(cust, f.w, f.h)) body += `<path d="${part.d}" fill-rule="evenodd"${paintAttrs(paint, part, scale)}/>`;
  else {
    if (!NATIVE_SHAPES[prst] && !["flowChartConnector", "flowChartAlternateProcess", "flowChartDecision", "rtTriangle", "leftArrow", "homePlate", "parallelogram", "hexagon", "pentagon"].includes(prst)) ctx.report("Preset shape", `${prst} drawn as its bounding box`);
    body = `<path d="${presetPath(prst, f.w, f.h)}"${paintAttrs(NATIVE_SHAPES[prst] === "line" ? { ...paint, fill: null } : paint, undefined, scale)}/>`;
  }
  // Picture fill (a photo in a circle…): the picture clipped by the outline, drawn under it.
  const blipId = first(kid(spPr, "a:blipFill"), "a:blip")?.a["r:embed"];
  const href = blipId ? ctx.picture(blipId) : undefined;
  if (href) {
    const id = `clip${++clipCount}`;
    const outline = cust ? customPaths(cust, f.w, f.h).map((p) => p.d).join("") : presetPath(prst, f.w, f.h);
    body = `<clipPath id="${id}"><path d="${outline}"/></clipPath><image width="${r1(f.w)}" height="${r1(f.h)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})" href="${href}"/>${body.replace(/ fill="#[0-9A-F]{6}"( fill-opacity="[\d.]+")?/gi, ' fill="none"')}`;
  }
  body += svgText(first(x, "wps:txbx"), f.w, ctx.scheme, scale);
  return `<g transform="${placeTransform(f)}">${body}</g>`;
}

let clipCount = 0;

/** Whether a shape is filled with a picture (drawn as an SVG picture, not a native shape). */
export const hasPictureFill = (wsp: X): boolean => !!kid(kid(wsp, "wps:spPr"), "a:blipFill");

/** A drawing's graphic (`a:graphicData` child) as a standalone SVG of `cx`×`cy` EMU. */
export function drawingSvg(graphic: X, cx: number, cy: number, ctx: SvgContext): string {
  // A lone shape has its own offset inside the drawing: draw it at the origin.
  const inner = graphic.n === "wps:wsp" || graphic.n === "pic:pic" ? svgNode(withOrigin(graphic), ctx) : svgNode(graphic, ctx);
  const pad = Math.max(0, ...find(graphic, "a:ln").map((l) => n(l.a.w))) / 2;
  const vb = `${r1(-pad)} ${r1(-pad)} ${r1(cx + 2 * pad)} ${r1(cy + 2 * pad)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${r1(emuToPt(cx + 2 * pad))}pt" height="${r1(emuToPt(cy + 2 * pad))}pt" overflow="visible">${inner}</svg>`;
}

function withOrigin(x: X): X {
  const clone = (e: X): X => ({ ...e, a: e.n === "a:off" ? { ...e.a, x: "0", y: "0" } : e.a, c: e.c.map(clone) });
  const spPr = x.c.find((c) => c.n === "wps:spPr" || c.n === "pic:spPr");
  return spPr ? { ...x, c: x.c.map((c) => (c === spPr ? clone(c) : c)) } : x;
}

/* Native objects -------------------------------------------------------- */

/** Paint → object style (theme-free RRGGBB, transparency in %). */
export function objectStyle(p: Paint, isLine = false): ObjectStyle {
  const style: ObjectStyle = {};
  style.fill = isLine ? null : p.fill ? p.fill.hex : null;
  if (!isLine && p.fill && p.fill.alpha < 1) style.transparency = Math.round((1 - p.fill.alpha) * 100);
  style.line = p.line ? p.line.hex : null;
  if (p.line) style.lineWidth = Math.round(emuToPt(p.line.width) * 100) / 100;
  if (p.line?.dash && p.line.dash !== "solid") style.dash = /dot/i.test(p.line.dash) ? "dot" : "dash";
  return style;
}

/** Custom geometry → `{ w, h, d }` in pt (the editor scales it to the object box). */
export function customGeometry(custGeom: X, w: number, h: number): { w: number; h: number; d: string; open?: boolean } | undefined {
  const parts = customPaths(custGeom, w, h, 1 / 12700);
  if (!parts.length) return undefined;
  const d = parts.map((p) => p.d).join("");
  return { w: emuToPt(w), h: emuToPt(h), d, ...(parts.every((p) => !p.fill) ? { open: true } : {}) };
}
