/**
 * Document geometry is canonical in points (pt), origin top-left, y downwards. Conversions happen
 * only at boundaries: CSS px in the webview, twips / half-points / EMU in DOCX.
 *
 *   72 pt = 1 in = 96 CSS px = 1440 twips = 914 400 EMU
 *
 * The inch-based constants are Slides Studio's (its canonical unit is the inch).
 */
import { CSS_PX_PER_INCH, EMU_PER_INCH, PT_PER_INCH } from "../../slides-studio/packages/core/src/units";

export const TWIPS_PER_PT = 20;
export const EMU_PER_PT = EMU_PER_INCH / PT_PER_INCH; // 12 700

export const round2 = (n: number): number => Math.round(n * 100) / 100;
export const ptToPx = (pt: number): number => (pt * CSS_PX_PER_INCH) / PT_PER_INCH;
export const pxToPt = (px: number): number => round2((px * PT_PER_INCH) / CSS_PX_PER_INCH);
export const ptToTwip = (pt: number): number => Math.round(pt * TWIPS_PER_PT);
export const twipToPt = (twip: number): number => round2(twip / TWIPS_PER_PT);
export const ptToEmu = (pt: number): number => Math.round(pt * EMU_PER_PT);
export const emuToPt = (emu: number): number => round2(emu / EMU_PER_PT);
/** DOCX font sizes are half-points. */
export const ptToHalfPt = (pt: number): number => Math.round(pt * 2);
/** docx's drawing APIs take "pixels" at 96 dpi (9525 EMU). */
export const ptToDocxPx = (pt: number): number => Math.round(ptToPx(pt));

/** Named page sizes, portrait, in pt. */
export const PAGE_SIZES = {
  A3: { width: 841.89, height: 1190.55 },
  A4: { width: 595.28, height: 841.89 },
  A5: { width: 419.53, height: 595.28 },
  Letter: { width: 612, height: 792 },
  Legal: { width: 612, height: 1008 },
} as const;
export type PageSizeName = keyof typeof PAGE_SIZES;

/** Parse a length written in a document (`12pt`, `2cm`, `0.5in`, `20mm`, `16px`, bare number = pt). */
export function parseLength(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*(pt|cm|mm|in|px)?\s*$/i.exec(value);
  if (!m) return undefined;
  const n = Number(m[1]);
  switch ((m[2] ?? "pt").toLowerCase()) {
    case "cm": return round2((n / 2.54) * PT_PER_INCH);
    case "mm": return round2((n / 25.4) * PT_PER_INCH);
    case "in": return round2(n * PT_PER_INCH);
    case "px": return pxToPt(n);
    default: return n;
  }
}
