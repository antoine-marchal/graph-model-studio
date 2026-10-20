import { round4, tr, type ElementPatch, type ResolvedElement } from '@corporate-slides/core';
import { adjOf, calloutTip, circularArrowGeom, clamp, PPI } from '@corporate-slides/renderer';
import { useEditor } from './store';

/*
 * PowerPoint's yellow handles: drag them to reshape a preset (ring thickness, corner radius, arrow
 * head and shaft, callout tail, circular arrow ends and thickness…). Values are OOXML adjustments,
 * so the exported shape matches what the handles show.
 */

interface AdjHandle {
  id: string;
  label: string;
  /** Position in the unflipped w×h box (px). */
  x: number;
  y: number;
  /** Pointer at (px, py) in the unflipped box → patch. */
  apply(px: number, py: number): ElementPatch;
}

const deg60k = (rad: number) => Math.round(((((rad * 180) / Math.PI) % 360) + 360) % 360 * 60000);

function handlesFor(r: ResolvedElement): AdjHandle[] {
  const el = r.element;
  if (el.type !== 'shape') return [];
  const w = r.box.w * PPI, h = r.box.h * PPI, ss = Math.min(w, h);
  const a = adjOf(el.shape, el.adjust);
  const set = (vals: Record<string, number>): ElementPatch => ({ adjust: { ...(el.adjust ?? {}), ...Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, Math.round(v)])) } });
  const f = (k: string) => (a[k] ?? 0) / 100000;
  const L = { radius: tr('Arrondi du coin', 'Corner rounding'), head: tr('Longueur de la pointe', 'Head length'), shaft: tr('Épaisseur du corps', 'Shaft thickness'), size: tr('Ajuster la forme', 'Adjust shape') };
  switch (el.shape) {
    case 'roundRect': {
      const rr = Math.min(r.style.radius === null ? ss / 6 : r.style.radius * PPI, ss / 2);
      return [{ id: 'radius', label: L.radius, x: rr, y: 0, apply: (px) => ({ style: { radius: round4(clamp(px, 0, ss / 2) / PPI) } }) }];
    }
    case 'snip1Rect': {
      const rr = Math.min(r.style.radius === null ? ss / 6 : r.style.radius * PPI, ss / 2);
      return [{ id: 'radius', label: L.radius, x: w - rr, y: 0, apply: (px) => ({ style: { radius: round4(clamp(w - px, 0, ss / 2) / PPI) } }) }];
    }
    case 'triangle':
      return [{ id: 'adj', label: tr('Position du sommet', 'Apex position'), x: w * f('adj'), y: 0, apply: (px) => set({ adj: (clamp(px, 0, w) / w) * 100000 }) }];
    case 'parallelogram':
    case 'trapezoid':
    case 'hexagon': {
      const max = el.shape === 'parallelogram' ? w : w / 2;
      return [{ id: 'adj', label: L.size, x: Math.min(max, ss * f('adj')), y: 0, apply: (px) => set({ adj: (clamp(px, 0, max) / ss) * 100000 }) }];
    }
    case 'octagon':
    case 'plus':
      return [{ id: 'adj', label: L.size, x: ss * f('adj'), y: 0, apply: (px) => set({ adj: (clamp(px, 0, ss / 2) / ss) * 100000 }) }];
    case 'donut':
      return [{ id: 'adj', label: tr('Épaisseur de l’anneau', 'Ring thickness'), x: ss * f('adj'), y: h / 2, apply: (px) => set({ adj: (clamp(px, 0, ss / 2) / ss) * 100000 }) }];
    case 'can':
      return [{ id: 'adj', label: tr('Hauteur du couvercle', 'Lid height'), x: w / 2, y: ss * f('adj'), apply: (_px, py) => set({ adj: (clamp(py, 0, h / 2) / ss) * 100000 }) }];
    case 'cube':
      return [{ id: 'adj', label: tr('Profondeur', 'Depth'), x: 0, y: ss * f('adj'), apply: (_px, py) => set({ adj: (clamp(py, 0, ss) / ss) * 100000 }) }];
    case 'rightArrow':
    case 'leftArrow': {
      const hd = Math.min(w, ss * f('adj2')), y0 = (h - h * f('adj1')) / 2, right = el.shape === 'rightArrow';
      return [
        { id: 'adj2', label: L.head, x: right ? w - hd : hd, y: 0, apply: (px) => set({ adj2: (clamp(right ? w - px : px, 0, w) / ss) * 100000 }) },
        { id: 'adj1', label: L.shaft, x: right ? 0 : w, y: y0, apply: (_px, py) => set({ adj1: clamp((h - 2 * py) / h, 0, 1) * 100000 }) },
      ];
    }
    case 'upArrow':
    case 'downArrow': {
      const hd = Math.min(h, ss * f('adj2')), x0 = (w - w * f('adj1')) / 2, up = el.shape === 'upArrow';
      return [
        { id: 'adj2', label: L.head, x: 0, y: up ? hd : h - hd, apply: (_px, py) => set({ adj2: (clamp(up ? py : h - py, 0, h) / ss) * 100000 }) },
        { id: 'adj1', label: L.shaft, x: x0, y: up ? h : 0, apply: (px) => set({ adj1: clamp((w - 2 * px) / w, 0, 1) * 100000 }) },
      ];
    }
    case 'leftRightArrow': {
      const hd = Math.min(w / 2, ss * f('adj2')), y0 = (h - h * f('adj1')) / 2;
      return [
        { id: 'adj2', label: L.head, x: hd, y: 0, apply: (px) => set({ adj2: (clamp(px, 0, w / 2) / ss) * 100000 }) },
        { id: 'adj1', label: L.shaft, x: hd, y: y0, apply: (_px, py) => set({ adj1: clamp((h - 2 * py) / h, 0, 1) * 100000 }) },
      ];
    }
    case 'chevron':
    case 'homePlate':
      return [{ id: 'adj', label: L.head, x: w - Math.min(w, ss * f('adj')), y: 0, apply: (px) => set({ adj: (clamp(w - px, 0, w) / ss) * 100000 }) }];
    case 'wedgeRectCallout': {
      const t = calloutTip(w, h, a);
      return [{ id: 'tip', label: tr('Pointe de la bulle', 'Callout tip'), x: t.tx, y: t.ty, apply: (px, py) => set({ adj1: ((px - w / 2) / w) * 100000, adj2: ((py - h / 2) / h) * 100000 }) }];
    }
    case 'circularArrow': {
      const g = circularArrowGeom(w, h, a);
      const angle = (px: number, py: number) => Math.atan2((py - g.cy) / Math.max(g.ry, 1), (px - g.cx) / Math.max(g.rx, 1));
      const radial = (px: number, py: number) => {
        const t = angle(px, py);
        const rc = (g.rx * g.ry) / Math.max(1e-6, Math.hypot(g.ry * Math.cos(t), g.rx * Math.sin(t)));
        return Math.abs(Math.hypot(px - g.cx, py - g.cy) - rc);
      };
      return [
        { id: 'end', label: tr('Fin de la flèche', 'Arrow end'), x: g.tip[0], y: g.tip[1], apply: (px, py) => set({ adj3: deg60k(angle(px, py)) }) },
        { id: 'start', label: tr('Début de la flèche', 'Arrow start'), x: g.start[0], y: g.start[1], apply: (px, py) => set({ adj4: deg60k(angle(px, py)) }) },
        { id: 'thick', label: tr('Épaisseur', 'Thickness'), x: g.outerStart[0], y: g.outerStart[1], apply: (px, py) => set({ adj1: (clamp(2 * radial(px, py), 1, ss / 4) / ss) * 100000, adj5: Math.max(a.adj5!, (clamp(2 * radial(px, py), 1, ss / 4) / ss) * 100000) }) },
        { id: 'head', label: tr('Largeur de la pointe', 'Head width'), x: g.head[0], y: g.head[1], apply: (px, py) => set({ adj5: (clamp(radial(px, py), g.th / 2, ss / 4) / ss) * 100000 }) },
      ];
    }
    default:
      return [];
  }
}

/** Yellow handles over the selected shape (rendered inside its selection frame, slide px). */
export function AdjustHandles({ r, zoom }: { r: ResolvedElement; zoom: number }) {
  const el = r.element;
  const slideId = useEditor((s) => s.slideId);
  if (el.type !== 'shape' || el.locked) return null;
  const hs = handlesFor(r);
  if (!hs.length || !slideId) return null;
  const w = r.box.w * PPI, h = r.box.h * PPI;
  const flipX = (x: number) => (el.flipH ? w - x : x), flipY = (y: number) => (el.flipV ? h - y : y);
  const size = 9 / zoom;

  const start = (e: React.PointerEvent, hd: AdjHandle) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const frame = (e.currentTarget as HTMLElement).closest('.overlay')!.getBoundingClientRect();
    const rot = ((el.rotation ?? 0) * Math.PI) / 180;
    const cx = r.box.x * PPI + w / 2, cy = r.box.y * PPI + h / 2;
    // Pointer → unrotated, unflipped box coordinates.
    const local = (ev: PointerEvent) => {
      const sx = (ev.clientX - frame.left) / zoom - cx, sy = (ev.clientY - frame.top) / zoom - cy;
      const x = sx * Math.cos(-rot) - sy * Math.sin(-rot) + w / 2, y = sx * Math.sin(-rot) + sy * Math.cos(-rot) + h / 2;
      return [flipX(x), flipY(y)] as const;
    };
    let last: ElementPatch | null = null;
    const st = useEditor.getState();
    const move = (ev: PointerEvent) => {
      const [x, y] = local(ev);
      last = hd.apply(x, y);
      st.preview([{ kind: 'updateElement', slideId, elementId: el.id, patch: last }]);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('is-adjusting');
      if (last) st.mutate([{ kind: 'updateElement', slideId, elementId: el.id, patch: last }]);
      else st.cancelPreview();
    };
    document.body.classList.add('is-adjusting');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <>
      {hs.map((hd) => (
        <div
          key={hd.id}
          className="adjust-handle"
          role="slider"
          aria-label={hd.label}
          title={hd.label}
          data-testid={`adjust-${hd.id}`}
          onPointerDown={(e) => start(e, hd)}
          onDoubleClick={(e) => {
            // Double-click: back to the preset's default geometry.
            e.stopPropagation();
            useEditor.getState().mutate([{ kind: 'updateElement', slideId, elementId: el.id, patch: el.shape === 'roundRect' || el.shape === 'snip1Rect' ? { style: { radius: null } } : { adjust: null } }]);
          }}
          style={{ left: flipX(hd.x), top: flipY(hd.y), width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, borderWidth: 1.25 / zoom }}
        />
      ))}
    </>
  );
}
