import React, { useRef } from "react";

type Handle = "e" | "w" | "s" | "se" | "sw";

/**
 * Word-like sizing handles around an inline block's visual (picture, diagram), shown while it is
 * selected. The block is centred, so a side handle grows it on both sides (2 × the pointer delta).
 * `ratio` keeps the aspect (pictures); without it the bottom handles set the height too (diagrams).
 * Geometry is in CSS px of the document (page zoom removed); the parent previews live through
 * `onResize` and writes the size once, on release (`onCommit`: one edit, one undo step).
 */
export function ResizeFrame({ active, ratio, minWidth = 48, onResize, onCommit, children, className, style }: {
  active: boolean;
  ratio?: number;
  minWidth?: number;
  onResize(size: { width: number; height: number }): void;
  onCommit(size: { width: number; height: number; maxWidth: number }): void;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = React.useState<{ width: number; height: number } | null>(null);

  const start = (handle: Handle) => (e: React.PointerEvent) => {
    const frame = frameRef.current;
    if (!frame || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = frame.getBoundingClientRect();
    const scale = rect.width / (frame.offsetWidth || rect.width) || 1;
    const startW = frame.offsetWidth;
    const startH = frame.offsetHeight;
    const maxWidth = frame.parentElement?.clientWidth || startW;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    let size = { width: startW, height: startH };
    const move = (m: PointerEvent) => {
      const dx = (m.clientX - x0) / scale;
      const dy = (m.clientY - y0) / scale;
      let width = startW;
      if (handle === "e" || handle === "se") width = startW + 2 * dx;
      if (handle === "w" || handle === "sw") width = startW - 2 * dx;
      width = Math.round(Math.max(minWidth, Math.min(maxWidth, width)));
      let height = ratio ? width / ratio : startH;
      if (!ratio && (handle === "s" || handle === "se" || handle === "sw")) height = startH + dy;
      height = Math.round(Math.max(minWidth / 2, height));
      size = { width, height };
      setDragging(size);
      onResize(size);
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      setDragging(null);
      if (size.width !== startW || size.height !== startH) onCommit({ ...size, maxWidth });
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };

  const handles: Handle[] = ratio ? ["w", "e", "sw", "se"] : ["w", "e", "s", "sw", "se"];
  return (
    <div ref={frameRef} className={"ms-resize-frame" + (active ? " is-active" : "") + (dragging ? " is-resizing" : "") + (className ? ` ${className}` : "")} style={style}>
      {children}
      {active &&
        handles.map((h) => (
          <span key={h} className={`ms-resize-handle ms-resize-${h}`} contentEditable={false} onPointerDown={start(h)} aria-hidden="true" />
        ))}
      {dragging && <span className="ms-resize-badge" contentEditable={false}>{`${dragging.width} × ${dragging.height}`}</span>}
    </div>
  );
}
