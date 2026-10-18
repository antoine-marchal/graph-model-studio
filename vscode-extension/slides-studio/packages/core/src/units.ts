/**
 * Coordinate system
 * -----------------
 * Canonical unit: inch (same as pptx-masters and pptxgenjs-plus).
 * Origin: top-left corner of the slide, x to the right, y downwards.
 *
 *   1 in = 914 400 EMU (OOXML)        1 in = 72 pt        1 in = 96 CSS px at zoom 1
 *
 * All canonical geometry is rounded to 4 decimals (≈ 91 EMU) so that serialization
 * stays deterministic and diffs remain readable.
 */
export const EMU_PER_INCH = 914_400;
export const PT_PER_INCH = 72;
export const CSS_PX_PER_INCH = 96;

export const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;
export const inchToEmu = (inch: number): number => Math.round(inch * EMU_PER_INCH);
export const emuToInch = (emu: number): number => round4(emu / EMU_PER_INCH);
export const inchToPx = (inch: number, zoom = 1): number => inch * CSS_PX_PER_INCH * zoom;
export const pxToInch = (px: number, zoom = 1): number => round4(px / (CSS_PX_PER_INCH * zoom));
export const ptToPx = (pt: number, zoom = 1): number => (pt / PT_PER_INCH) * CSS_PX_PER_INCH * zoom;
export const ptToInch = (pt: number): number => pt / PT_PER_INCH;

/**
 * Graph Model Studio diagrams: an image whose `src` is a `.gmc` source is displayed and exported
 * through the PNG rendered next to it (`arch.gmc` → `arch.png`).
 */
export const isDiagramSrc = (src: string): boolean => /\.gmc$/i.test(src);
export const renderedImageSrc = (src: string): string => src.replace(/\.gmc$/i, '.png');
