/*
 * Preset-geometry adjustments, with OOXML names and units (`adj`, `adj1`…; lengths in 1/100000 of
 * the short side or of a side, angles in 1/60000 degree) so they export as `a:avLst` unchanged and
 * PowerPoint draws the same shape. Defaults are PowerPoint's.
 */

export const ADJ_DEFAULTS: Record<string, Record<string, number>> = {
  triangle: { adj: 50000 },
  parallelogram: { adj: 25000 },
  trapezoid: { adj: 25000 },
  hexagon: { adj: 25000 },
  octagon: { adj: 29289 },
  plus: { adj: 25000 },
  donut: { adj: 25000 },
  can: { adj: 25000 },
  cube: { adj: 25000 },
  rightArrow: { adj1: 50000, adj2: 50000 },
  leftArrow: { adj1: 50000, adj2: 50000 },
  upArrow: { adj1: 50000, adj2: 50000 },
  downArrow: { adj1: 50000, adj2: 50000 },
  leftRightArrow: { adj1: 50000, adj2: 50000 },
  chevron: { adj: 50000 },
  homePlate: { adj: 50000 },
  wedgeRectCallout: { adj1: -20833, adj2: 62500 },
  // thickness, head angle, end angle, start angle, head width
  circularArrow: { adj1: 12500, adj2: 1142319, adj3: 20457681, adj4: 10800000, adj5: 12500 },
};

/** Effective adjustments of a shape: defaults overridden by the element's own values. */
export function adjOf(kind: string, adjust?: Record<string, number>): Record<string, number> {
  return { ...(ADJ_DEFAULTS[kind] ?? {}), ...(adjust ?? {}) };
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const rad = (a60k: number) => ((a60k / 60000) * Math.PI) / 180;

/** Circular arrow geometry in a w×h box (px): band, head and the points the handles sit on. */
export function circularArrowGeom(w: number, h: number, a: Record<string, number>) {
  const ss = Math.min(w, h);
  const th = (ss * clamp(a.adj1!, 0, 25000)) / 100000;
  const hw = Math.max(th / 2, (ss * clamp(a.adj5!, 0, 25000)) / 100000);
  const rx = w / 2 - hw, ry = h / 2 - hw;
  const cx = w / 2, cy = h / 2;
  const start = rad(a.adj4!), end = rad(a.adj3!), headA = rad(clamp(a.adj2!, 0, 5400000));
  let sweep = end - start;
  while (sweep <= 0) sweep += 2 * Math.PI;
  const bodyEnd = start + Math.max(0, sweep - headA);
  const at = (dr: number, t: number) => [cx + (rx + dr) * Math.cos(t), cy + (ry + dr) * Math.sin(t)] as const;
  const o0 = at(th / 2, start), o1 = at(th / 2, bodyEnd), i1 = at(-th / 2, bodyEnd), i0 = at(-th / 2, start);
  const hOut = at(hw, bodyEnd), hIn = at(-hw, bodyEnd), tip = at(0, start + sweep);
  const large = sweep - headA > Math.PI ? 1 : 0;
  const d = `M ${o0[0]} ${o0[1]} A ${rx + th / 2} ${ry + th / 2} 0 ${large} 1 ${o1[0]} ${o1[1]} L ${hOut[0]} ${hOut[1]} L ${tip[0]} ${tip[1]} L ${hIn[0]} ${hIn[1]} L ${i1[0]} ${i1[1]} A ${rx - th / 2} ${ry - th / 2} 0 ${large} 0 ${i0[0]} ${i0[1]} Z`;
  return { d, tip, start: at(0, start), outerStart: o0, head: hOut, cx, cy, rx, ry, th, hw };
}

/** Tail tip and base side of the rectangular callout. */
export function calloutTip(w: number, h: number, a: Record<string, number>) {
  const tx = w / 2 + (w * a.adj1!) / 100000, ty = h / 2 + (h * a.adj2!) / 100000;
  const dx = a.adj1! / 100000, dy = a.adj2! / 100000;
  const side = Math.abs(dy) - 0.5 > Math.abs(dx) - 0.5 ? (dy > 0 ? 'bottom' : 'top') : dx > 0 ? 'right' : 'left';
  return { tx, ty, side: (Math.abs(dx) <= 0.5 && Math.abs(dy) <= 0.5 ? 'bottom' : side) as 'top' | 'bottom' | 'left' | 'right' };
}
