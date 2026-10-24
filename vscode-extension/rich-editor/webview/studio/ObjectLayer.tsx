/**
 * Object manipulation over the paper: selection frames with handles, move / resize / rotate with
 * snapping guides (margins, column centre, other objects), keyboard nudges, connectors and the
 * anchor lens. Pointer movement is transient (CSS transforms); releasing commits ONE edit.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { connectorPath } from "../../../slides-studio/packages/core/src/geometry";
import { groupParts, groupUnit, inGroup } from "../../../slides-studio/packages/core/src/groups";
import { pxToPt, ptToPx } from "../../document/units";
import type { ObjectDescriptor } from "../../document/schema";
import { notify, objectOf, studio, useStudio } from "./store";
import { deleteObjects, duplicateObjects, groupObjects, reanchor, selectObject, ungroup, updateObjects } from "./actions";

interface Rect {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  anchorY: number;
  colLeft: number;
}

const SNAP = 5;
const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;

function rectOf(editor: Editor, id: string): Rect | null {
  const dom = editor.view.dom.querySelector<HTMLElement>(`.ms-object[data-id="${CSS.escape(id)}"]`);
  const d = objectOf(id);
  if (!dom || !d || dom.classList.contains("ms-object-flow")) return null;
  return { id, x: parseFloat(dom.style.left) || 0, y: parseFloat(dom.style.top) || 0, w: ptToPx(d.box.width), h: ptToPx(d.box.height), rot: d.rotation ?? 0, anchorY: Number(dom.dataset.anchorY) || 0, colLeft: Number(dom.dataset.colLeft) || 0 };
}

export function ObjectLayer({ editor }: { editor: Editor }) {
  const selection = useStudio((s) => s.selection);
  const meta = useStudio((s) => s.meta);
  const zoom = useStudio((s) => s.zoom);
  const layout = useStudio((s) => s.layout);
  const groupScope = useStudio((s) => s.groupScope);
  const [tick, setTick] = useState(0);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const drag = useRef<null | { kind: "move" | "resize" | "rotate"; handle?: string; sx: number; sy: number; start: Rect[]; moved: boolean }>(null);
  const [preview, setPreview] = useState<Rect[] | null>(null);

  useEffect(() => {
    const on = () => setTick((t) => t + 1);
    window.addEventListener("ms:objectsLaid", on);
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("ms:objectsLaid", on);
      window.removeEventListener("resize", on);
    };
  }, []);

  // A click on a grouped object selects its outermost group (inside the entered scope, one level down).
  useEffect(() => {
    if (selection.length !== 1) return;
    const d = objectOf(selection[0]);
    const unit = groupUnit(d?.group, groupScope);
    if (!unit) return;
    const members = Object.entries(meta?.objects ?? {}).filter(([, o]) => inGroup(o.group, unit)).map(([id]) => id);
    if (members.length > 1 && members.join() !== selection.join()) studio.set({ selection: members });
  }, [selection, meta, groupScope]);

  const rects = (preview ?? selection.map((id) => rectOf(editor, id)).filter((r): r is Rect => !!r));
  void tick;

  /** Snap the moving bounds to margins, column centre and other objects; returns the correction. */
  const snap = useCallback(
    (bounds: { x: number; y: number; w: number; h: number }, exclude: string[]) => {
      const xs: number[] = [];
      const ys: number[] = [];
      for (const p of layout?.pages ?? []) {
        xs.push(p.left + p.margins.left, p.left + p.width - p.margins.right, p.left + p.width / 2);
        ys.push(p.top + p.margins.top, p.top + p.height - p.margins.bottom);
      }
      for (const id of Object.keys(meta?.objects ?? {})) {
        if (exclude.includes(id)) continue;
        const r = rectOf(editor, id);
        if (!r) continue;
        xs.push(r.x, r.x + r.w, r.x + r.w / 2);
        ys.push(r.y, r.y + r.h, r.y + r.h / 2);
      }
      const best = (cands: number[], vals: number[]) => {
        let d = SNAP + 1;
        let hit: number | undefined;
        let delta = 0;
        for (const c of cands) for (const v of vals) if (Math.abs(c - v) < d) (d = Math.abs(c - v)), (hit = c), (delta = c - v);
        return { delta: hit === undefined ? 0 : delta, line: hit };
      };
      const bx = best(xs, [bounds.x, bounds.x + bounds.w, bounds.x + bounds.w / 2]);
      const by = best(ys, [bounds.y, bounds.y + bounds.h, bounds.y + bounds.h / 2]);
      setGuides({ x: bx.line !== undefined ? [bx.line] : [], y: by.line !== undefined ? [by.line] : [] });
      return { dx: bx.delta, dy: by.delta };
    },
    [layout, meta, editor],
  );

  const applyTransient = (next: Rect[]) => {
    for (const r of next) {
      const dom = editor.view.dom.querySelector<HTMLElement>(`.ms-object[data-id="${CSS.escape(r.id)}"]`);
      const start = drag.current?.start.find((s) => s.id === r.id);
      if (!dom || !start) continue;
      dom.style.transform = `translate(${r.x - start.x}px, ${r.y - start.y}px) rotate(${r.rot}deg)`;
      dom.style.width = `${r.w}px`;
      dom.style.height = `${r.h}px`;
    }
    setPreview(next);
  };

  const onPointerDown = (e: React.PointerEvent, kind: "move" | "resize" | "rotate", handle?: string) => {
    if (e.button !== 0) return;
    const start = selection.map((id) => rectOf(editor, id)).filter((r): r is Rect => !!r);
    const locked = start.filter((r) => objectOf(r.id)?.locked?.geometry);
    if (locked.length) {
      notify("info", `Geometry locked: ${locked.map((r) => objectOf(r.id)?.name ?? r.id).join(", ")}`);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind, handle, sx: e.clientX, sy: e.clientY, start, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g) return;
    const dx = (e.clientX - g.sx) / zoom;
    const dy = (e.clientY - g.sy) / zoom;
    if (!g.moved && Math.hypot(dx, dy) < 2) return;
    g.moved = true;
    if (g.kind === "move") {
      const L = Math.min(...g.start.map((r) => r.x)) + dx;
      const T = Math.min(...g.start.map((r) => r.y)) + dy;
      const R = Math.max(...g.start.map((r) => r.x + r.w)) + dx;
      const B = Math.max(...g.start.map((r) => r.y + r.h)) + dy;
      const s = e.altKey ? { dx: 0, dy: 0 } : snap({ x: L, y: T, w: R - L, h: B - T }, g.start.map((r) => r.id));
      applyTransient(g.start.map((r) => ({ ...r, x: r.x + dx + s.dx, y: r.y + dy + s.dy })));
    } else if (g.kind === "resize" && g.start.length === 1) {
      const r = g.start[0];
      const h = g.handle!;
      let { x, y, w, h: hh } = r;
      if (h.includes("e")) w = Math.max(4, r.w + dx);
      if (h.includes("s")) hh = Math.max(4, r.h + dy);
      if (h.includes("w")) (w = Math.max(4, r.w - dx)), (x = r.x + r.w - w);
      if (h.includes("n")) (hh = Math.max(4, r.h - dy)), (y = r.y + r.h - hh);
      const keep = (objectOf(r.id)?.type === "image") !== e.shiftKey && h.length === 2;
      if (keep && r.w && r.h) {
        const ratio = r.w / r.h;
        if (w / hh > ratio) w = hh * ratio;
        else hh = w / ratio;
        if (h.includes("w")) x = r.x + r.w - w;
        if (h.includes("n")) y = r.y + r.h - hh;
      }
      applyTransient([{ ...r, x, y, w, h: hh }]);
    } else if (g.kind === "rotate" && g.start.length === 1) {
      const r = g.start[0];
      const root = editor.view.dom.getBoundingClientRect();
      const cx = root.left + (r.x + r.w / 2) * zoom;
      const cy = root.top + (r.y + r.h / 2) * zoom;
      let deg = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
      if (e.shiftKey) deg = Math.round(deg / 15) * 15;
      applyTransient([{ ...r, rot: Math.round(((deg % 360) + 360) % 360) }]);
    }
  };

  const onPointerUp = () => {
    const g = drag.current;
    drag.current = null;
    setGuides({ x: [], y: [] });
    const next = preview;
    setPreview(null);
    for (const r of g?.start ?? []) {
      const dom = editor.view.dom.querySelector<HTMLElement>(`.ms-object[data-id="${CSS.escape(r.id)}"]`);
      if (dom) dom.style.transform = r.rot ? `rotate(${r.rot}deg)` : "";
    }
    if (g && !g.moved && g.start.length === 1) {
      // A click on the frame (re)selects the object itself: copy, delete and nudges act on it.
      selectObject(g.start[0].id);
      editor.view.focus();
      return;
    }
    if (!g?.moved || !next) return;
    commit(g.start, next);
    // The gesture ends with the object selected in the document too.
    if (next.length === 1) requestAnimationFrame(() => (selectObject(next[0].id), editor.view.focus()));
  };

  /** One edit for the whole gesture; a lone anchored object dropped on another paragraph moves its anchor there. */
  const commit = (start: Rect[], next: Rect[]) => {
    const patches: Record<string, Partial<ObjectDescriptor>> = {};
    for (const r of next) {
      const s = start.find((x) => x.id === r.id)!;
      const d = objectOf(r.id)!;
      patches[r.id] = {
        box: { x: Math.round((d.box.x + pxToPt(r.x - s.x)) * 100) / 100, y: Math.round((d.box.y + pxToPt(r.y - s.y)) * 100) / 100, width: pxToPt(r.w), height: pxToPt(r.h) },
        ...(r.rot !== s.rot ? { rotation: r.rot || undefined } : {}),
      };
    }
    if (next.length === 1) {
      const r = next[0];
      const d = objectOf(r.id)!;
      if (d.placement === "anchored" && Math.abs(r.y - start[0].y) > 24) {
        const root = editor.view.dom.getBoundingClientRect();
        const hit = editor.view.posAtCoords({ left: root.left + (r.colLeft + 4) * zoom, top: root.top + r.y * zoom + 2 });
        if (hit) {
          const $p = editor.state.doc.resolve(Math.min(hit.pos, editor.state.doc.content.size));
          const blockPos = $p.depth ? $p.before(1) : hit.pos;
          const block = editor.state.doc.nodeAt(blockPos);
          const dom = block ? (editor.view.nodeDOM(blockPos) as HTMLElement | null) : null;
          const currentAnchor = r.anchorY;
          if (block && dom && block.type.name !== "msObject") {
            const top = (dom.getBoundingClientRect().top - root.top) / zoom;
            if (Math.abs(top - currentAnchor) > 1) {
              reanchor(r.id, blockPos, { ...patches[r.id].box!, y: Math.round(pxToPt(r.y - top) * 100) / 100 });
              return;
            }
          }
        }
      }
    }
    updateObjects(patches);
  };

  // Keyboard: nudges (one commit per burst), delete, duplicate, group, escape.
  useEffect(() => {
    let burst: { start: Rect[]; dx: number; dy: number } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onKey = (e: KeyboardEvent) => {
      const sel = studio.get().selection;
      const nodeSel = editor.state.selection instanceof NodeSelection && editor.state.selection.node.type.name === "msObject";
      if (!sel.length || (!nodeSel && sel.length < 2) || document.activeElement?.closest(".ms-object.is-editing, input, textarea, select")) return;
      const step = e.shiftKey ? 10 : 1;
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (arrows[e.key]) {
        e.preventDefault();
        e.stopPropagation();
        if (sel.some((id) => objectOf(id)?.locked?.geometry)) return notify("info", "Geometry locked.");
        burst ??= { start: sel.map((id) => rectOf(editor, id)).filter((r): r is Rect => !!r), dx: 0, dy: 0 };
        burst.dx += ptToPx(arrows[e.key][0]);
        burst.dy += ptToPx(arrows[e.key][1]);
        drag.current = { kind: "move", sx: 0, sy: 0, start: burst.start, moved: true };
        applyTransient(burst.start.map((r) => ({ ...r, x: r.x + burst!.dx, y: r.y + burst!.dy })));
        drag.current = null;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          const b = burst!;
          burst = null;
          for (const r of b.start) {
            const dom = editor.view.dom.querySelector<HTMLElement>(`.ms-object[data-id="${CSS.escape(r.id)}"]`);
            if (dom) dom.style.transform = r.rot ? `rotate(${r.rot}deg)` : "";
          }
          setPreview(null);
          updateObjects(Object.fromEntries(b.start.map((r) => {
            const d = objectOf(r.id)!;
            return [r.id, { box: { ...d.box, x: Math.round((d.box.x + pxToPt(b.dx)) * 100) / 100, y: Math.round((d.box.y + pxToPt(b.dy)) * 100) / 100 } }];
          })));
        }, 400);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && sel.length > 1) {
        e.preventDefault();
        deleteObjects(sel);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateObjects(sel);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (e.shiftKey) {
          const g = groupParts(objectOf(sel[0])?.group)[0];
          if (g) ungroup(g);
        } else groupObjects(sel);
      } else if (e.key === "Escape") {
        const { groupScope: scope } = studio.get();
        if (scope) return studio.set({ groupScope: scope.includes("/") ? scope.slice(0, scope.lastIndexOf("/")) : null });
        const pos = editor.state.selection.to;
        editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(Math.min(pos, editor.state.doc.content.size)))));
        studio.set({ selection: [] });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [editor]);

  // Connectors between objects (drawn here; their geometry follows the targets).
  const connectors = Object.entries(meta?.objects ?? {}).filter(([, d]) => d.type === "connector" && (!d.hidden || studio.get().showHidden));
  const primary = rects[0];
  const pd = primary ? objectOf(primary.id) : undefined;

  return (
    <div className="ms-object-layer" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
      <svg className="ms-connectors" aria-hidden="true">
        <defs>
          <marker id="ms-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
          </marker>
        </defs>
        {connectors.map(([id, c]) => {
          const a = c.from && (preview?.find((r) => r.id === c.from!.id) ?? rectOf(editor, c.from.id));
          const b = c.to && (preview?.find((r) => r.id === c.to!.id) ?? rectOf(editor, c.to.id));
          if (!a || !b) return null;
          const p = connectorPath({ x: a.x, y: a.y, w: a.w, h: a.h }, { x: b.x, y: b.y, w: b.w, h: b.h }, c.from?.side ?? "auto", c.to?.side ?? "auto");
          const elbow = c.route === "elbow";
          const mid = (p.fromSide === "left" || p.fromSide === "right") ? `${(p.x1 + p.x2) / 2},${p.y1} ${(p.x1 + p.x2) / 2},${p.y2}` : `${p.x1},${(p.y1 + p.y2) / 2} ${p.x2},${(p.y1 + p.y2) / 2}`;
          return (
            <polyline
              key={id}
              data-id={id}
              className={selection.includes(id) ? "is-selected" : ""}
              points={elbow ? `${p.x1},${p.y1} ${mid} ${p.x2},${p.y2}` : `${p.x1},${p.y1} ${p.x2},${p.y2}`}
              fill="none"
              strokeWidth={ptToPx(c.style?.lineWidth ?? 1)}
              markerEnd={c.style?.endArrow === "none" ? undefined : "url(#ms-arrow)"}
              markerStart={c.style?.startArrow && c.style.startArrow !== "none" ? "url(#ms-arrow)" : undefined}
              onPointerDown={(e) => (e.stopPropagation(), studio.set({ selection: [id] }))}
            />
          );
        })}
        {guides.x.map((x) => <line key={`gx${x}`} className="ms-guide" x1={x} x2={x} y1={0} y2={layout?.height ?? 4000} />)}
        {guides.y.map((y) => <line key={`gy${y}`} className="ms-guide" y1={y} y2={y} x1={0} x2={layout?.width ?? 2000} />)}
      </svg>
      {primary && pd && (
        <div className="ms-anchor-lens" style={{ left: primary.colLeft - 22, top: pd.placement === "page" ? primary.anchorY : primary.anchorY }} title={pd.placement === "anchored" ? "Anchored to this paragraph: moves with the text" : "Positioned on the page of this paragraph"}>
          <span aria-hidden="true">⚓</span>
        </div>
      )}
      {rects.map((r, i) => {
        const d = objectOf(r.id);
        if (!d) return null;
        const single = rects.length === 1;
        return (
          <div
            key={r.id}
            className={`ms-sel-frame${d.locked?.geometry ? " is-locked" : ""}${i === 0 ? " is-primary" : ""}`}
            style={{ left: r.x, top: r.y, width: r.w, height: Math.max(r.h, 1), transform: r.rot ? `rotate(${r.rot}deg)` : undefined }}
            onPointerDown={(e) => onPointerDown(e, "move")}
            onDoubleClick={() => {
              const g = d.group;
              if (g) studio.set({ groupScope: groupUnit(g, studio.get().groupScope), selection: [r.id] });
              else (editor.view.dom.querySelector(`.ms-object[data-id="${CSS.escape(r.id)}"]`) as HTMLElement | null)?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
            }}
            role="group"
            aria-label={`${d.name ?? r.id}: ${Math.round(d.box.width)} × ${Math.round(d.box.height)} pt`}
          >
            {single && !d.locked?.geometry && HANDLES.map((h) => <span key={h} className={`ms-handle ms-handle-${h}`} onPointerDown={(e) => onPointerDown(e, "resize", h)} />)}
            {single && !d.locked?.geometry && d.type !== "connector" && <span className="ms-handle ms-handle-rotate" title="Rotate (Shift: 15° steps)" onPointerDown={(e) => onPointerDown(e, "rotate")} />}
            {i === 0 && (
              <span className="ms-sel-label">
                {d.name ?? r.id} · {Math.round(pxToPt(r.w))}×{Math.round(pxToPt(r.h))} pt{d.placement === "page" ? " · on page" : " · moves with text"}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
