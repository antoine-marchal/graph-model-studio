import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  anchorSide,
  estimateFit,
  perimeterAnchor,
  pointSide,
  findPlaceholder,
  isDiagramSrc,
  mergeRuns,
  numberLabel,
  paragraphLook,
  resolveSlide,
  round4,
  uniqueId,
  type Box,
  type Mutation,
  type Paragraph,
  type ResolvedElement,
  type SlideElement,
  type TextRun,
  tr,
} from '@corporate-slides/core';
import { PPI, SlideView, textBoxStyle, tokenHex, type AssetResolver } from '@corporate-slides/renderer';
import { currentSlide, useEditor } from './store';
import { useAnchors, useDiff } from './Review';
import { Icon } from './icons';
import { connectMutation, deleteMutations, duplicateMutations, inlineEditor, type RunFormat } from './Format';
import { TableEditor } from './TableEditor';
import { AdjustHandles } from './Adjust';
import { post } from './host';

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const SNAP_PX = 6;
const GRID_IN = 0.125;

interface Guide {
  axis: 'x' | 'y';
  at: number;
}

interface DragState {
  kind: 'move' | 'resize';
  handle?: Handle;
  startX: number;
  startY: number;
  boxes: Map<string, Box>;
  moved: boolean;
  last: Mutation[];
}

export function useAssets(): AssetResolver {
  const assetUrls = useEditor((s) => s.assetUrls);
  return useMemo(
    () => ({
      masterAsset: (id: string) => assetUrls[`master:${id}`] ?? null,
      image: (src: string) => assetUrls[`image:${src}`] ?? null,
    }),
    [assetUrls],
  );
}

function unionBox(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

/** Best snap offset for a set of moving coordinates against candidate lines. */
function snapAxis(moving: number[], candidates: number[], threshold: number): { delta: number; at: number | null } {
  let best = { delta: 0, at: null as number | null, dist: threshold };
  for (const m of moving) for (const c of candidates) {
    const d = c - m;
    if (Math.abs(d) < best.dist) best = { delta: d, at: c, dist: Math.abs(d) };
  }
  return { delta: best.delta, at: best.at };
}

export function Canvas() {
  const doc = useEditor((s) => s.doc);
  const master = useEditor((s) => s.master);
  const slide = useEditor(currentSlide);
  const selected = useEditor((s) => s.selected);
  const editingId = useEditor((s) => s.editingId);
  const zoomSetting = useEditor((s) => s.zoom);
  const showGrid = useEditor((s) => s.showGrid);
  const showHidden = useEditor((s) => s.showHidden);
  const snap = useEditor((s) => s.snap);
  const readOnly = useEditor((s) => s.readOnly);
  const showDiff = useEditor((s) => s.showDiff);
  const showBase = useEditor((s) => s.showBase);
  const ghostSlideId = useEditor((s) => s.ghostSlideId);
  const baseDoc = useEditor((s) => s.diff.doc);
  const baseLabel = useEditor((s) => s.diff.label);
  const focusThread = useEditor((s) => s.focusThread);
  const { select, setEditing, mutate, preview, cancelPreview, setZoom, set } = useEditor.getState();
  const assets = useAssets();
  const diff = useDiff();
  const anchors = useAnchors();

  const wellRef = useRef<HTMLDivElement>(null);
  const [wellSize, setWellSize] = useState({ w: 800, h: 600 });
  const [guides, setGuides] = useState<Guide[]>([]);
  const drag = useRef<DragState | null>(null);
  /** Element created by double-clicking a placeholder: removed again if left empty. */
  const fresh = useRef<string | null>(null);
  const connectFrom = useEditor((s) => s.connectFrom);
  /** Rubber-band selection rectangle, in slide inches. */
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  /** Element under a dragged connector end: its outline and snap points are shown. */
  const [endTarget, setEndTarget] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = wellRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWellSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = master?.dimensions.width ?? 13.3333;
  const H = master?.dimensions.height ?? 7.5;
  const fitZoom = Math.max(0.1, Math.min((wellSize.w - 64) / (W * PPI), (wellSize.h - 64) / (H * PPI)));
  const zoom = zoomSetting === 'fit' ? fitZoom : zoomSetting;
  useEffect(() => set({ fitZoom: Math.round(fitZoom * 100) / 100 }), [fitZoom, set]);
  const inPerPx = 1 / (PPI * zoom);

  const resolved = useMemo(() => (slide && master ? resolveSlide(slide, master) : null), [slide, master]);
  const byId = useMemo(() => new Map(resolved?.elements.map((r) => [r.element.id, r]) ?? []), [resolved]);
  const selection = selected.map((id) => byId.get(id)).filter((r): r is ResolvedElement => !!r);

  const candidates = useCallback(
    (exclude: Set<string>) => {
      const xs = [0, W / 2, W];
      const ys = [0, H / 2, H];
      for (const r of resolved?.elements ?? []) {
        if (exclude.has(r.element.id) || r.element.hidden) continue;
        xs.push(r.box.x, r.box.x + r.box.w / 2, r.box.x + r.box.w);
        ys.push(r.box.y, r.box.y + r.box.h / 2, r.box.y + r.box.h);
      }
      for (const p of resolved?.layout?.placeholders ?? []) {
        xs.push(p.x, p.x + p.w);
        ys.push(p.y, p.y + p.h);
      }
      const sa = master?.constraints.safeArea;
      if (sa) {
        xs.push(sa.x, sa.x + sa.w);
        ys.push(sa.y, sa.y + sa.h);
      }
      return { xs, ys };
    },
    [resolved, master, W, H],
  );

  /* ------------------------------ pointer ------------------------------ */

  const startDrag = (e: React.PointerEvent, kind: DragState['kind'], handle?: Handle) => {
    if (!slide || readOnly) return;
    const st = useEditor.getState();
    const ids = st.selected.filter((id) => !byId.get(id)?.element.locked && byId.get(id)?.element.type !== 'connector');
    if (!ids.length) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = {
      kind,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      boxes: new Map(ids.map((id) => [id, { ...byId.get(id)!.box }])),
      moved: false,
      last: [],
    };
  };

  const onElementPointerDown = (e: React.PointerEvent, r: ResolvedElement) => {
    if (!slide || e.button !== 0) return;
    if (editingId === r.element.id) return;
    const st = useEditor.getState();
    if (st.connectFrom !== null) {
      e.stopPropagation();
      if (r.element.type === 'connector') return;
      if (!st.connectFrom || !slide.elements.some((x) => x.id === st.connectFrom)) return void set({ connectFrom: r.element.id });
      if (st.connectFrom === r.element.id) return;
      const { m, id } = connectMutation(slide, st.connectFrom, r.element.id);
      mutate([m]);
      set({ connectFrom: null });
      select(slide.id, [id]);
      return;
    }
    if (r.element.type === 'connector') {
      e.stopPropagation();
      select(slide.id, [r.element.id], e.shiftKey);
      return;
    }
    if (e.shiftKey) {
      select(slide.id, [r.element.id], true);
      return;
    }
    if (!st.selected.includes(r.element.id)) select(slide.id, [r.element.id]);
    if (!r.element.locked) startDrag(e, 'move');
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !slide) return;
    const dxPx = e.clientX - d.startX;
    const dyPx = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dxPx, dyPx) < 3) return;
    d.moved = true;
    let dx = dxPx * inPerPx;
    let dy = dyPx * inPerPx;
    const threshold = SNAP_PX * inPerPx;
    const exclude = new Set(d.boxes.keys());
    const { xs, ys } = candidates(exclude);
    const g: Guide[] = [];
    const mutations: Mutation[] = [];
    const disableSnap = e.altKey || !snap;

    if (d.kind === 'move') {
      const u = unionBox([...d.boxes.values()]);
      if (!disableSnap) {
        const sx = snapAxis([u.x + dx, u.x + dx + u.w / 2, u.x + dx + u.w], xs, threshold);
        const sy = snapAxis([u.y + dy, u.y + dy + u.h / 2, u.y + dy + u.h], ys, threshold);
        if (sx.at !== null) (dx += sx.delta), g.push({ axis: 'x', at: sx.at });
        else if (showGrid) dx = Math.round((u.x + dx) / GRID_IN) * GRID_IN - u.x;
        if (sy.at !== null) (dy += sy.delta), g.push({ axis: 'y', at: sy.at });
        else if (showGrid) dy = Math.round((u.y + dy) / GRID_IN) * GRID_IN - u.y;
      }
      for (const [id, b] of d.boxes) {
        mutations.push({ kind: 'updateElement', slideId: slide.id, elementId: id, patch: { x: round4(b.x + dx), y: round4(b.y + dy), w: round4(b.w), h: round4(b.h) } });
      }
    } else {
      const [id, b] = [...d.boxes.entries()][0]!;
      const h = d.handle!;
      let { x, y, w, h: hh } = b;
      let left = x, right = x + w, top = y, bottom = y + hh;
      if (h.includes('w')) left += dx;
      if (h.includes('e')) right += dx;
      if (h.includes('n')) top += dy;
      if (h.includes('s')) bottom += dy;
      if (!disableSnap) {
        if (h.includes('w')) { const s = snapAxis([left], xs, threshold); if (s.at !== null) { left += s.delta; g.push({ axis: 'x', at: s.at }); } }
        if (h.includes('e')) { const s = snapAxis([right], xs, threshold); if (s.at !== null) { right += s.delta; g.push({ axis: 'x', at: s.at }); } }
        if (h.includes('n')) { const s = snapAxis([top], ys, threshold); if (s.at !== null) { top += s.delta; g.push({ axis: 'y', at: s.at }); } }
        if (h.includes('s')) { const s = snapAxis([bottom], ys, threshold); if (s.at !== null) { bottom += s.delta; g.push({ axis: 'y', at: s.at }); } }
      }
      const el = byId.get(id)!.element;
      const isLine = el.type === 'shape' && el.shape === 'line';
      const min = 0.05;
      if (right - left < min) h.includes('w') ? (left = right - min) : (right = left + min);
      if (!isLine && bottom - top < min) h.includes('n') ? (top = bottom - min) : (bottom = top + min);
      if (isLine && bottom < top) bottom = top;
      // Shift (or images by default) keeps the aspect ratio on corner handles.
      const keepRatio = h.length === 2 && (e.shiftKey !== (el.type === 'image')) && b.h > 0;
      if (keepRatio) {
        const ratio = b.w / b.h;
        const nw = right - left;
        const nh = nw / ratio;
        if (h.includes('n')) top = bottom - nh;
        else bottom = top + nh;
      }
      x = left; y = top; w = right - left; hh = bottom - top;
      mutations.push({ kind: 'updateElement', slideId: slide.id, elementId: id, patch: { x: round4(x), y: round4(y), w: round4(w), h: round4(hh) } });
    }
    d.last = mutations;
    setGuides(g);
    preview(mutations);
  };

  /**
   * Drag a connector end anywhere around any element: the end follows the element outline (side
   * midpoints and corners snap), re-attaching `from`/`to`. Midpoints keep a native side, other
   * positions store a free point.
   */
  const startEndDrag = (e: React.PointerEvent, r: ResolvedElement, end: 'from' | 'to') => {
    const el = r.element;
    if (!slide || readOnly || el.type !== 'connector' || el.locked || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const frame = (e.currentTarget as HTMLElement).closest('.overlay')!.getBoundingClientRect();
    const other = end === 'from' ? el.to : el.from;
    let last: Mutation | null = null;
    const move = (ev: PointerEvent) => {
      const px = (ev.clientX - frame.left) * inPerPx, py = (ev.clientY - frame.top) * inPerPx;
      const pad = 0.15;
      const hit = [...(resolved?.elements ?? [])].reverse().find((x) => x.element.type !== 'connector' && !x.element.hidden && x.element.id !== other && px >= x.box.x - pad && px <= x.box.x + x.box.w + pad && py >= x.box.y - pad && py <= x.box.y + x.box.h + pad);
      const target = hit ?? byId.get(end === 'from' ? el.from : el.to);
      if (!target) return;
      const point = perimeterAnchor(target.box, px, py, ev.altKey ? 0 : 0.06);
      const side = pointSide(point);
      const at = side ? { side, point: null } : { side: anchorSide(point), point };
      last = {
        kind: 'updateElement',
        slideId: slide.id,
        elementId: el.id,
        patch: end === 'from' ? { from: target.element.id, fromSide: at.side, fromPoint: at.point } : { to: target.element.id, toSide: at.side, toPoint: at.point },
      };
      setEndTarget(target.element.id);
      preview([last]);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('is-dragging-end');
      setEndTarget(null);
      if (last) mutate([last]);
      else cancelPreview();
    };
    document.body.classList.add('is-dragging-end');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setGuides([]);
    if (!d) return;
    if (d.moved && d.last.length) mutate(d.last);
    else cancelPreview();
  };

  /**
   * Rubber-band selection: elements entirely inside the rectangle are selected (added to the
   * selection with Ctrl / Shift). A Ctrl+click without drag toggles the element under the pointer.
   */
  const startMarquee = (e: React.PointerEvent, additive: boolean) => {
    if (!slide || !resolved) return;
    e.preventDefault();
    e.stopPropagation();
    const frame = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const at = (cx: number, cy: number) => ({ x: (cx - frame.left) / zoom / PPI, y: (cy - frame.top) / zoom / PPI });
    const p0 = at(e.clientX, e.clientY);
    const sx = e.clientX, sy = e.clientY;
    const base = additive ? useEditor.getState().selected : [];
    const hitId = (e.target as HTMLElement).closest<HTMLElement>('[data-element-id]')?.dataset.elementId;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true;
      const p = at(ev.clientX, ev.clientY);
      const r = { x0: Math.min(p0.x, p.x), y0: Math.min(p0.y, p.y), x1: Math.max(p0.x, p.x), y1: Math.max(p0.y, p.y) };
      setMarquee(r);
      const inside = resolved.elements.filter((x) => !x.element.hidden && x.box.x >= r.x0 && x.box.y >= r.y0 && x.box.x + x.box.w <= r.x1 && x.box.y + x.box.h <= r.y1).map((x) => x.element.id);
      select(slide.id, [...new Set([...base, ...inside])]);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.classList.remove('is-marquee');
      setMarquee(null);
      if (!moved && hitId && additive) {
        const cur = useEditor.getState().selected;
        select(slide.id, cur.includes(hitId) ? cur.filter((x) => x !== hitId) : [...cur, hitId]);
      }
    };
    document.body.classList.add('is-marquee');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /* ------------------------------ keyboard ------------------------------ */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useEditor.getState();
      const target = e.target as HTMLElement;
      if (st.editingId || target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const sl = currentSlide(st);
      if (!sl) return;
      const ids = st.selected;
      if (e.key === 'Escape') {
        if (st.connectFrom !== null) return void set({ connectFrom: null });
        return void select(sl.id, []);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        return void select(sl.id, sl.elements.filter((x) => !x.hidden).map((x) => x.id));
      }
      if (!ids.length) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        mutate(deleteMutations(sl, ids));
        select(sl.id, []);
      } else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = e.shiftKey ? 0.25 : 0.05;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const ms: Mutation[] = [];
        for (const id of ids) {
          const r = byId.get(id);
          if (!r || r.element.locked || r.element.type === 'connector') continue;
          ms.push({ kind: 'updateElement', slideId: sl.id, elementId: id, patch: { x: round4(r.box.x + dx), y: round4(r.box.y + dy), w: r.box.w, h: r.box.h } });
        }
        mutate(ms);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        const { ms, ids: newIds } = duplicateMutations(sl, ids.map((id) => byId.get(id)).filter((r): r is ResolvedElement => !!r));
        mutate(ms);
        select(sl.id, newIds);
      } else if (e.key === 'Enter' && ids.length === 1) {
        const r = byId.get(ids[0]!);
        if (r && (r.element.type === 'text' || r.element.type === 'table' || (r.element.type === 'shape' && r.element.shape !== 'line'))) {
          e.preventDefault();
          setEditing(ids[0]!);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [byId, mutate, select, setEditing, set]);

  const onWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const z = Math.min(4, Math.max(0.1, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    setZoom(Math.round(z * 100) / 100);
  };

  if (!doc || !master || !slide) return <div ref={wellRef} className="well" />;

  // Read-only views of the base revision: a deleted slide, or the reference version of this slide.
  const ghost = ghostSlideId ? baseDoc?.slides.find((s) => s.id === ghostSlideId) : undefined;
  const baseSlide = ghost ?? (showBase ? (baseDoc?.slides.find((s) => s.id === slide.id) ?? null) : undefined);
  if (baseSlide !== undefined) {
    return (
      <div ref={wellRef} className="well is-base" onWheel={onWheel}>
        <div className="base-banner" role="status">
          <Icon name="history" />
          {ghost ? tr(`Diapositive supprimée depuis ${baseLabel}`, `Slide deleted since ${baseLabel}`) : baseSlide ? tr(`Version de référence (${baseLabel}) — lecture seule`, `Reference version (${baseLabel}) — read-only`) : tr(`Diapositive absente de ${baseLabel} (ajoutée)`, `Slide missing from ${baseLabel} (added)`)}
          <button className="btn" onClick={() => set({ ghostSlideId: null, showBase: false })}>{tr('Revenir à la version actuelle', 'Back to the current version')}</button>
        </div>
        <div className="stage" style={{ minWidth: W * PPI * zoom + 64, minHeight: H * PPI * zoom + 64 }}>
          {baseSlide ? (
            <div className="slide-frame" style={{ width: W * PPI * zoom, height: H * PPI * zoom }} data-testid="base-canvas">
              <div style={{ transform: `scale(${zoom})`, transformOrigin: '0 0', width: W * PPI, height: H * PPI, pointerEvents: 'none' }}>
                <SlideView slide={baseSlide} master={master} assets={assets} metadata={baseDoc?.metadata} />
              </div>
            </div>
          ) : (
            <p className="hint">{tr('Rien à afficher pour cette version.', 'Nothing to show for this version.')}</p>
          )}
        </div>
      </div>
    );
  }

  const slideIndex = doc.slides.findIndex((s) => s.id === slide.id);
  const handleSize = 8 / zoom;
  const stroke = 1.5 / zoom;

  const overlay = (
    <div className="overlay" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {showGrid && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: `linear-gradient(to right, var(--grid) ${1 / zoom}px, transparent ${1 / zoom}px), linear-gradient(to bottom, var(--grid) ${1 / zoom}px, transparent ${1 / zoom}px)`,
            backgroundSize: `${PPI * 0.25}px ${PPI * 0.25}px`,
          }}
        />
      )}
      {selection.map((r) => {
        const fit = (r.element.type === 'text' || r.element.type === 'shape') && r.element.paragraphs?.length ? estimateFit(r, r.element.paragraphs) : null;
        const style: CSSProperties = {
          position: 'absolute',
          left: r.box.x * PPI,
          top: r.box.y * PPI,
          width: Math.max(r.box.w * PPI, 1),
          height: Math.max(r.box.h * PPI, 1),
          outline: `${stroke}px solid var(--accent)`,
          transform: r.element.rotation ? `rotate(${r.element.rotation}deg)` : undefined,
        };
        const single = selection.length === 1 && !r.element.locked && editingId !== r.element.id && r.element.type !== 'connector';
        if (r.element.type === 'connector' && r.path) {
          const dot = (x: number, y: number, end: 'from' | 'to') => (
            <div
              key={end}
              className={`connector-end${readOnly || r.element.locked ? '' : ' is-draggable'}`}
              data-testid={`connector-${end}`}
              title={tr('Glisser pour rattacher l’extrémité n’importe où autour d’une forme (milieux et coins aimantés, Alt pour un placement libre)', 'Drag to attach the end anywhere around a shape (midpoints and corners snap, Alt for free placement)')}
              onPointerDown={(e) => startEndDrag(e, r, end)}
              style={{ left: (x - r.box.x) * PPI, top: (y - r.box.y) * PPI, width: handleSize * 1.4, height: handleSize * 1.4, marginLeft: -handleSize * 0.7, marginTop: -handleSize * 0.7, borderWidth: stroke }}
            />
          );
          return (
            <div key={r.element.id} style={{ ...style, outline: 'none' }} data-selection={r.element.id}>
              {dot(r.path.x1, r.path.y1, 'from')}
              {dot(r.path.x2, r.path.y2, 'to')}
            </div>
          );
        }
        return (
          <div key={r.element.id} style={style} data-selection={r.element.id}>
            {single &&
              HANDLES.map((h) => {
                const left = h.includes('w') ? 0 : h.includes('e') ? 100 : 50;
                const top = h.includes('n') ? 0 : h.includes('s') ? 100 : 50;
                return (
                  <div
                    key={h}
                    data-handle={h}
                    role="presentation"
                    onPointerDown={(e) => startDrag(e, 'resize', h)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    style={{
                      position: 'absolute',
                      left: `${left}%`,
                      top: `${top}%`,
                      width: handleSize,
                      height: handleSize,
                      marginLeft: -handleSize / 2,
                      marginTop: -handleSize / 2,
                      background: '#fff',
                      border: `${stroke}px solid var(--accent)`,
                      borderRadius: 2 / zoom,
                      pointerEvents: 'auto',
                      cursor: `${h}-resize`,
                    }}
                  />
                );
              })}
            {single && <AdjustHandles r={r} zoom={zoom} />}
            {r.element.locked && <span className="tag" style={{ fontSize: 11 / zoom, top: -18 / zoom }}>{tr('verrouillé', 'locked')}</span>}
            {fit?.overflows && (
              <span className="tag tag-warn" style={{ fontSize: 11 / zoom, bottom: -18 / zoom, top: 'auto' }} title={tr("Estimation : le texte risque de déborder dans PowerPoint", "Estimate: the text may overflow in PowerPoint")}>
                {tr('débordement probable', 'likely overflow')}
              </span>
            )}
          </div>
        );
      })}
      {marquee && (
        <div className="marquee" data-testid="marquee" style={{ left: marquee.x0 * PPI, top: marquee.y0 * PPI, width: (marquee.x1 - marquee.x0) * PPI, height: (marquee.y1 - marquee.y0) * PPI, borderWidth: stroke }} />
      )}
      {endTarget && byId.get(endTarget) && (() => {
        const b = byId.get(endTarget)!.box;
        const dots = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]] as const;
        return (
          <div className="anchor-target" style={{ left: b.x * PPI, top: b.y * PPI, width: b.w * PPI, height: b.h * PPI, outlineWidth: stroke }}>
            {dots.map(([fx, fy]) => (
              <span key={`${fx}-${fy}`} className="anchor-dot" style={{ left: `${fx * 100}%`, top: `${fy * 100}%`, width: handleSize * 0.8, height: handleSize * 0.8 }} />
            ))}
          </div>
        );
      })()}
      {showDiff && <DiffMarks slideId={slide.id} byId={byId} diff={diff} zoom={zoom} />}
      {anchors.filter((a) => a.slideId === slide.id).map((a, i) => {
        const r = a.elementId ? byId.get(a.elementId) : undefined;
        const x = r ? r.box.x + r.box.w : 0.25 + i * 0.35;
        const y = r ? r.box.y : 0.25;
        return (
          <button
            key={a.thread.id}
            className={`pin${a.thread.resolved ? ' is-resolved' : ''}${focusThread === a.thread.id ? ' is-focused' : ''}`}
            style={{ left: x * PPI, top: y * PPI, transform: `translate(-50%, -50%) scale(${1 / zoom})` }}
            title={`${a.thread.notes[0]?.author ?? ''} : ${a.thread.notes[0]?.body ?? ''}`}
            aria-label={tr(`Commentaire ${a.n}`, `Comment ${a.n}`)}
            data-testid={`pin-${a.thread.id}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => set({ focusThread: a.thread.id, pane: 'comments' })}
          >
            <Icon name="comment" size={14} />
            <span>{a.n}</span>
          </button>
        );
      })}
      {guides.map((g, i) => (
        <div
          key={i}
          className="guide"
          style={g.axis === 'x' ? { position: 'absolute', left: g.at * PPI, top: 0, bottom: 0, width: stroke } : { position: 'absolute', top: g.at * PPI, left: 0, right: 0, height: stroke }}
        />
      ))}
    </div>
  );

  return (
    <div
      ref={wellRef}
      className={`well${connectFrom !== null ? ' is-connecting' : ''}`}
      onWheel={onWheel}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('stage')) select(slide.id, []);
      }}
      onContextMenu={(e) => {
        const t = e.target as HTMLElement;
        // Text being edited keeps the native menu (spelling, cut / copy / paste of the selection).
        if (t.closest('[contenteditable], input, textarea, .tbl-toolbar') || connectFrom !== null) return;
        e.preventDefault();
        const id = t.closest<HTMLElement>('[data-element-id]')?.dataset.elementId ?? t.closest<HTMLElement>('[data-selection]')?.dataset.selection;
        const st = useEditor.getState();
        if (id && !st.selected.includes(id)) select(slide.id, [id]);
        if (!id) select(slide.id, []);
        set({ contextMenu: { x: e.clientX, y: e.clientY, target: id ? 'element' : 'slide' } });
      }}
    >
      {connectFrom !== null && (
        <div className="connect-banner" role="status" data-testid="connect-banner">
          <Icon name="connector" />
          {connectFrom ? <>{tr('Cliquez sur l’élément d’arrivée (départ :', 'Click the end element (start:')} <code>{connectFrom}</code>)</> : tr('Cliquez sur l’élément de départ du connecteur', 'Click the start element of the connector')}
          <button className="btn" onClick={() => set({ connectFrom: null })}>{tr('Annuler (Échap)', 'Cancel (Esc)')}</button>
        </div>
      )}
      <div className="stage" style={{ minWidth: W * PPI * zoom + 64, minHeight: H * PPI * zoom + 64 }}>
        <div
          className="slide-frame"
          style={{ width: W * PPI * zoom, height: H * PPI * zoom }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerDownCapture={(e) => {
            // Ctrl + drag draws a selection rectangle anywhere, even starting on an element.
            if ((e.ctrlKey || e.metaKey) && e.button === 0 && !editingId && connectFrom === null) startMarquee(e, true);
          }}
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('[data-element-id], [data-handle], .connector-end')) return;
            if (!e.shiftKey) select(slide.id, []);
            if (e.button === 0 && connectFrom === null) startMarquee(e, e.shiftKey);
          }}
          onDoubleClick={(e) => {
            if (readOnly || connectFrom !== null || (e.target as HTMLElement).closest('[data-element-id]')) return;
            // Double-click in an empty layout placeholder: type straight into it, as in PowerPoint.
            const rect = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - rect.left) / zoom / PPI, y = (e.clientY - rect.top) / zoom / PPI;
            const bound = new Set(resolved?.elements.map((r) => r.placeholder?.key));
            const ph = resolved?.layout?.placeholders.find((p) => !bound.has(p.key) && p.type !== 'pic' && x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
            if (!ph || findPlaceholder(resolved?.layout, ph.key) !== ph) return;
            const id = uniqueId(ph.key.replace(/[^A-Za-z0-9_-]/g, '') || 'text', slide.elements.map((x) => x.id));
            mutate([{ kind: 'addElement', slideId: slide.id, element: { id, type: 'text', placeholder: ph.key, paragraphs: [] } }]);
            fresh.current = id;
            select(slide.id, [id]);
            setEditing(id);
          }}
          data-testid="slide-canvas"
        >
          <div style={{ transform: `scale(${zoom})`, transformOrigin: '0 0', width: W * PPI, height: H * PPI }}>
            <SlideView
              slide={slide}
              master={master}
              assets={assets}
              metadata={doc.metadata}
              slideNumber={slideIndex + 1}
              showPlaceholders
              showHidden={showHidden}
              editingId={editingId}
              renderEditor={(r) => r.element.type === 'table' ? <TableEditor r={r} onDone={(patch) => {
                setEditing(null);
                if (patch) mutate([{ kind: 'updateElement', slideId: slide.id, elementId: r.element.id, patch }]);
              }} /> : <InlineEditor r={r} onDone={(paras) => {
                setEditing(null);
                if (paras) mutate([{ kind: 'updateElement', slideId: slide.id, elementId: r.element.id, patch: { paragraphs: paras } }]);
                else if (fresh.current === r.element.id) mutate([{ kind: 'deleteElement', slideId: slide.id, elementId: r.element.id }]);
                if (fresh.current === r.element.id) fresh.current = null;
              }} />}
              overlay={overlay}
              onElementPointerDown={onElementPointerDown}
              onElementDoubleClick={(e, r) => {
                if (r.element.locked || readOnly || useEditor.getState().connectFrom !== null) return;
                if (r.element.type === 'image' && isDiagramSrc(r.element.src)) {
                  e.stopPropagation();
                  set({ gmcEdit: r.element.src });
                  return;
                }
                if (r.element.type === 'text' || r.element.type === 'table' || (r.element.type === 'shape' && r.element.shape !== 'line')) {
                  e.stopPropagation();
                  select(slide.id, [r.element.id]);
                  setEditing(r.element.id);
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ inline text editing ------------------------------ */

type Marks = { bold?: boolean; italic?: boolean; underline?: boolean; color?: string; size?: number };

/** Paragraph DOM of the editor → canonical paragraphs (runs keep bold/italic/underline/color). */
function readParagraphs(root: HTMLElement): Paragraph[] {
  const out: Paragraph[] = [];
  for (const block of [...root.childNodes]) {
    const data = block instanceof HTMLElement ? block.dataset : undefined;
    const base = (first: boolean): Paragraph => {
      const p: Paragraph = { runs: [] };
      if (data?.list === 'bullet' || data?.list === 'number') p.list = data.list;
      if (data?.level && Number(data.level)) p.level = Number(data.level);
      if (first && data?.heading) p.heading = Number(data.heading);
      return p;
    };
    let cur = base(true);
    let pendingBreak = false;
    const flushBreak = () => {
      if (!pendingBreak) return;
      out.push(cur);
      cur = base(false);
      pendingBreak = false;
    };
    const walk = (n: Node, m: Marks) => {
      if (n.nodeType === Node.TEXT_NODE) {
        const text = (n.textContent ?? '').replace(/​/g, '');
        if (!text) return;
        flushBreak();
        const run: TextRun = { text };
        if (m.bold) run.bold = true;
        if (m.italic) run.italic = true;
        if (m.underline) run.underline = true;
        if (m.color) run.color = m.color as TextRun['color'];
        if (m.size) run.size = m.size;
        cur.runs.push(run);
        return;
      }
      if (!(n instanceof HTMLElement)) return;
      if (n.tagName === 'BR') {
        flushBreak();
        pendingBreak = true;
        return;
      }
      const st = n.style;
      const next: Marks = {
        bold: m.bold || n.tagName === 'B' || n.tagName === 'STRONG' || Number(st.fontWeight) >= 600 || st.fontWeight === 'bold',
        italic: m.italic || n.tagName === 'I' || n.tagName === 'EM' || st.fontStyle === 'italic',
        underline: m.underline || n.tagName === 'U' || st.textDecoration.includes('underline'),
        color: n.dataset.color ?? m.color,
        size: n.dataset.size ? Number(n.dataset.size) : m.size,
      };
      // Chrome splits paragraphs with nested <div>s when Enter is pressed inside a block.
      const nested = n !== block && (n.tagName === 'DIV' || n.tagName === 'P');
      if (nested && (cur.runs.length || pendingBreak)) {
        pendingBreak = false;
        out.push(cur);
        cur = base(false);
      }
      n.childNodes.forEach((c) => walk(c, next));
      if (nested) pendingBreak = true;
    };
    if (block.nodeType === Node.TEXT_NODE) walk(block, {});
    else block.childNodes.forEach((c) => walk(c, {}));
    cur.runs = mergeRuns(cur.runs);
    out.push(cur);
  }
  return out.length ? out : [{ runs: [] }];
}

export function RunView({ run, hex }: { run: TextRun; hex: (token: string) => string | null }) {
  let node: ReactNode = run.text;
  if (run.underline) node = <u>{node}</u>;
  if (run.italic) node = <i>{node}</i>;
  if (run.bold) node = <b>{node}</b>;
  if (run.size) node = <span data-size={run.size} style={{ fontSize: (run.size / 72) * PPI }}>{node}</span>;
  return run.color ? <span data-color={run.color} style={{ color: hex(run.color) ? `#${hex(run.color)}` : undefined }}>{node}</span> : <>{node}</>;
}


/**
 * Apply size / color to the selected text (wrapping each selected piece of each line in a span), or
 * strip every mark. Bold / italic / underline go through the native commands, which toggle.
 */
export function formatSelection(root: HTMLElement, f: RunFormat, hex: (token: string) => string | null): boolean {
  const sel = window.getSelection();
  if (!sel?.rangeCount || sel.isCollapsed) return false;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return false;
  if (f !== 'clear' && (f.bold !== undefined || f.italic !== undefined || f.underline !== undefined)) {
    document.execCommand(f.bold !== undefined ? 'bold' : f.italic !== undefined ? 'italic' : 'underline');
    return true;
  }
  // Text boxes have one block per paragraph; a table cell is a single line.
  const lines = root.querySelector(':scope > [data-line]') ? [...root.children].filter((l) => range.intersectsNode(l)) : [root];
  const made: Node[] = [];
  for (const line of lines) {
    const r = document.createRange();
    r.selectNodeContents(line);
    if (line.contains(range.startContainer)) r.setStart(range.startContainer, range.startOffset);
    if (line.contains(range.endContainer)) r.setEnd(range.endContainer, range.endOffset);
    if (r.collapsed) continue;
    const frag = r.extractContents();
    let node: Node;
    if (f === 'clear') node = document.createTextNode(frag.textContent ?? '');
    else {
      const key = f.size !== undefined ? 'size' : 'color';
      const value = key === 'size' ? f.size : f.color;
      // The new value replaces the same mark inside the selection; null only removes it.
      frag.querySelectorAll<HTMLElement>(`[data-${key}]`).forEach((el) => el.replaceWith(...el.childNodes));
      const span = document.createElement('span');
      if (value !== null && value !== undefined) {
        span.dataset[key] = String(value);
        if (key === 'size') span.style.fontSize = `${(Number(value) / 72) * PPI}px`;
        else if (hex(String(value))) span.style.color = `#${hex(String(value))}`;
      }
      span.append(frag);
      node = span;
    }
    r.insertNode(node);
    made.push(node);
  }
  if (made.length) {
    const nr = document.createRange();
    nr.setStartBefore(made[0]!);
    nr.setEndAfter(made[made.length - 1]!);
    sel.removeAllRanges();
    sel.addRange(nr);
  }
  return true;
}

function InlineEditor({ r, onDone }: { r: ResolvedElement; onDone: (p: Paragraph[] | null) => void }) {
  const original: Paragraph[] = (r.element.type === 'text' || r.element.type === 'shape' ? r.element.paragraphs : undefined) ?? [];
  const [paras, setParas] = useState<Paragraph[]>(original.length ? original : [{ runs: [] }]);
  const [gen, setGen] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);
  const lastEl = useRef<HTMLDivElement | null>(null);
  const done = useRef(false);
  /** Paragraph index to put the caret in after a re-render (paragraph tools). */
  const caretAt = useRef<number | null>(null);
  const remounting = useRef(false);
  /** Selection kept while the text context menu has focus. */
  const savedRange = useRef<Range | null>(null);
  const master = useEditor((s) => s.master);
  const hex = (token: string) => (master ? tokenHex(token, master) : token.startsWith('#') ? token.slice(1) : null);
  const restoreRange = () => {
    const el = ref.current;
    if (!el || !savedRange.current) return;
    el.focus();
    const s = window.getSelection();
    s?.removeAllRanges();
    s?.addRange(savedRange.current);
    savedRange.current = null;
  };

  const commit = () => {
    const el = ref.current ?? lastEl.current;
    if (done.current || !el) return;
    done.current = true;
    const result = readParagraphs(el);
    const clean = (ps: Paragraph[]) => JSON.stringify(ps.map((p) => ({ ...p, runs: mergeRuns(p.runs) })));
    const empty = result.every((p) => !p.runs.length) && !original.length;
    onDone(empty || clean(result) === clean(original) ? null : result);
  };

  useLayoutEffect(() => {
    const el = ref.current!;
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    if (caretAt.current === null) range.selectNodeContents(el);
    else {
      const block = el.children[Math.min(caretAt.current, el.children.length - 1)];
      range.selectNodeContents(block ?? el);
      range.collapse(false);
    }
    sel?.removeAllRanges();
    sel?.addRange(range);
    remounting.current = false;
  }, [gen]);

  // A click elsewhere on the canvas clears `editingId` on pointerdown, unmounting the editor
  // before blur fires: commit on unmount too, or the typed text is silently dropped.
  useLayoutEffect(() => {
    inlineEditor.current = {
      read() {
        const el = ref.current!;
        const paragraphs = readParagraphs(el);
        const sel = window.getSelection();
        const indexOf = (n: Node | null | undefined) => {
          let b: Node | null | undefined = n;
          while (b && b.parentNode !== el) b = b.parentNode;
          const i = b ? [...el.childNodes].indexOf(b as ChildNode) : -1;
          return i < 0 ? 0 : Math.min(i, paragraphs.length - 1);
        };
        const a = indexOf(sel?.anchorNode), f = indexOf(sel?.focusNode);
        return { paragraphs, from: Math.min(a, f), to: Math.max(a, f) };
      },
      format(f) {
        const el = ref.current;
        if (!el) return false;
        restoreRange();
        return formatSelection(el, f, hex);
      },
      saveRange() {
        const s = window.getSelection();
        savedRange.current = s?.rangeCount && ref.current?.contains(s.getRangeAt(0).commonAncestorContainer) ? s.getRangeAt(0).cloneRange() : null;
      },
      restoreRange,
      hasSelection() {
        const s = window.getSelection();
        return !!s && !s.isCollapsed && !!ref.current?.contains(s.anchorNode);
      },
      selectionSize() {
        const s = window.getSelection();
        const n = s?.anchorNode;
        const el = n ? (n.nodeType === Node.TEXT_NODE ? n.parentElement : (n as HTMLElement)) : null;
        return el && ref.current?.contains(el) ? Math.round((parseFloat(getComputedStyle(el).fontSize) * 72 / PPI) * 2) / 2 : null;
      },
      replace(next) {
        const sel = window.getSelection();
        const el = ref.current!;
        let b: Node | null | undefined = sel?.focusNode;
        while (b && b.parentNode !== el) b = b.parentNode;
        caretAt.current = Math.max(0, b ? [...el.childNodes].indexOf(b as ChildNode) : next.length - 1);
        remounting.current = true;
        setParas(next);
        setGen((g) => g + 1);
      },
    };
    return () => {
      inlineEditor.current = null;
      commit();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counters: number[] = [];
  const lineStyle = (p: Paragraph): CSSProperties => {
    const look = paragraphLook(r, p);
    return { paddingLeft: look.indent * PPI, fontSize: (look.fontSize / 72) * PPI, color: `#${look.color}`, fontWeight: look.bold ? 700 : 400, minHeight: '1.2em', position: 'relative' };
  };
  const marker = (p: Paragraph): string | undefined => {
    const level = p.level ?? 0;
    if (!p.list) {
      counters.length = 0;
      return undefined;
    }
    if (p.list === 'number') {
      counters.length = level + 1;
      counters[level] = (counters[level] ?? 0) + 1;
      return numberLabel(counters[level]!, r.style.numbering);
    }
    return paragraphLook(r, p).bullet?.char ?? '•';
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      ref.current?.blur();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const ed = inlineEditor.current!;
      const { paragraphs, from, to } = ed.read();
      ed.replace(paragraphs.map((p, i) => {
        if (i < from || i > to) return p;
        const level = Math.max(0, Math.min(4, (p.level ?? 0) + (e.shiftKey ? -1 : 1)));
        const q: Paragraph = { ...p, list: p.list ?? 'bullet' };
        if (level) q.level = level;
        else delete q.level;
        return q;
      }));
    }
    // Ctrl+B/I/U are handled natively by contentEditable; stopPropagation keeps VS Code from seeing them.
  };

  return (
    <div
      key={gen}
      ref={(n) => {
        ref.current = n;
        if (n) lastEl.current = n;
      }}
      className="inline-editor"
      contentEditable
      suppressContentEditableWarning
      spellCheck
      data-testid="inline-editor"
      style={{ ...textBoxStyle(r), outline: 'none', cursor: 'text', whiteSpace: 'pre-wrap' }}
      onBlur={() => !remounting.current && useEditor.getState().contextMenu?.target !== 'text' && commit()}
      onContextMenu={(e) => {
        // A text selection gets its own menu (font, size, color…); a bare caret keeps the native one.
        const s = window.getSelection();
        if (!s || s.isCollapsed) return;
        e.preventDefault();
        e.stopPropagation();
        inlineEditor.current?.saveRange();
        useEditor.getState().set({ contextMenu: { x: e.clientX, y: e.clientY, target: 'text' } });
      }}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {paras.map((p, i) => (
        <div key={i} data-line="" data-list={p.list} data-level={p.level} data-heading={p.heading} data-marker={marker(p)} style={lineStyle(p)}>
          {p.runs.length ? p.runs.map((run, k) => <RunView key={k} run={run} hex={hex} />) : <br />}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------ visual diff ------------------------------ */

const CHANGE_LABEL = { added: tr('Ajouté', 'Added'), modified: tr('Modifié', 'Changed') } as const;

/** Change outlines over the current slide, plus hatched ghosts where base elements were removed. */
function DiffMarks({ slideId, byId, diff, zoom }: { slideId: string; byId: Map<string, ResolvedElement>; diff: ReturnType<typeof useDiff>; zoom: number }) {
  const master = useEditor((s) => s.master);
  const baseDoc = useEditor((s) => s.diff.doc);
  if (!diff || !master) return null;
  const changes = diff.elements.get(slideId);
  const baseSlide = baseDoc?.slides.find((s) => s.id === slideId);
  const removed = baseSlide ? resolveSlide(baseSlide, master).elements.filter((r) => diff.removedElements.get(slideId)?.some((e) => e.id === r.element.id)) : [];
  const tag = { fontSize: 10 / zoom, top: -16 / zoom };
  const box = (r: ResolvedElement): CSSProperties => ({ position: 'absolute', left: r.box.x * PPI, top: r.box.y * PPI, width: Math.max(r.box.w * PPI, 2), height: Math.max(r.box.h * PPI, 2), outlineWidth: 2 / zoom, outlineOffset: 2 / zoom });
  return (
    <>
      {[...(changes ?? [])].map(([id, change]) => {
        const r = byId.get(id);
        return r ? (
          <div key={id} className={`diff-mark diff-${change === 'added' ? 'add' : 'mod'}`} style={box(r)} data-diff={change} data-testid={`diff-mark-${id}`}>
            <span className="tag" style={tag}>{CHANGE_LABEL[change]}</span>
          </div>
        ) : null;
      })}
      {removed.map((r) => (
        <div key={`del-${r.element.id}`} className="diff-mark diff-del" style={box(r)} data-diff="removed" data-testid={`diff-mark-${r.element.id}`}>
          <span className="tag" style={tag}>{tr('Supprimé', 'Deleted')} · {r.element.id}</span>
        </div>
      ))}
    </>
  );
}
