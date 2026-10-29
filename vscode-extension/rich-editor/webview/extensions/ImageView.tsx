import React, { useState, useEffect, useRef, useCallback, useReducer } from "react";
import { Image } from "@tiptap/extension-image";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { ResizeFrame } from "./ResizeFrame";
import { imageWidthAttr } from "../../document/imageSize";

/**
 * Freshly generated images (`.gmc` embed PNGs rendered by this webview), keyed
 * by file path. The file on disk is rewritten in place, so its URL alone would
 * keep showing the webview's cached copy.
 */
const overrides = new Map<string, string>();
const OVERRIDE_EVENT = "btrmk:image-override";

function imageKey(src: string): string {
  try {
    return decodeURIComponent(new URL(src, location.href).pathname).toLowerCase();
  } catch {
    return src;
  }
}

export function setImageOverride(src: string, dataUrl: string): void {
  overrides.set(imageKey(src), dataUrl);
  window.dispatchEvent(new Event(OVERRIDE_EVENT));
}

function ImageNodeView({ node, updateAttributes, selected, editor }: any) {
  const [error, setError] = useState(false);
  const [ratio, setRatio] = useState<number | undefined>();
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const width = imageWidthAttr(node.attrs.width);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    window.addEventListener(OVERRIDE_EVENT, rerender);
    return () => window.removeEventListener(OVERRIDE_EVENT, rerender);
  }, []);
  const src = node.attrs.src ? overrides.get(imageKey(node.attrs.src)) ?? node.attrs.src : node.attrs.src;
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(node.attrs.alt || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCaption(node.attrs.alt || "");
  }, [node.attrs.alt]);

  useEffect(() => {
    setError(false);
  }, [node.attrs.src]);

  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [editing]);

  const saveCaption = useCallback(() => {
    updateAttributes({ alt: caption });
    setEditing(false);
  }, [caption, updateAttributes]);

  return (
    <NodeViewWrapper
      className={"image-block" + (selected ? " selected" : "")}
      data-drag-handle=""
    >
      <figure>
        {error ? (
          <div className="image-placeholder">
            <span className="image-placeholder-icon">&#128247;</span>
            <span>Image not found</span>
            <span className="image-placeholder-path">
              {node.attrs.src?.split("/").pop() || "unknown"}
            </span>
          </div>
        ) : (
          <ResizeFrame
            active={selected && editor.isEditable && !!ratio}
            ratio={ratio}
            style={liveWidth ? { width: liveWidth } : width ? { width } : undefined}
            onResize={(s) => setLiveWidth(s.width)}
            onCommit={(s) => {
              setLiveWidth(null);
              // Percent of the text width: the picture follows the page / panel width.
              const pct = Math.round((s.width / s.maxWidth) * 100);
              updateAttributes({ width: pct >= 99 ? null : `${pct}%` });
            }}
          >
            <img
              src={src}
              alt={node.attrs.alt || ""}
              title={node.attrs.title || undefined}
              onError={() => setError(true)}
              onLoad={(e) => {
                const img = e.currentTarget;
                if (img.naturalWidth && img.naturalHeight) setRatio(img.naturalWidth / img.naturalHeight);
              }}
              draggable={false}
            />
          </ResizeFrame>
        )}
        <figcaption onClick={() => setEditing(true)}>
          {editing ? (
            <input
              ref={inputRef}
              type="text"
              className="image-caption-input"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onBlur={saveCaption}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === "Escape") {
                  e.preventDefault();
                  saveCaption();
                }
              }}
              placeholder=""
            />
          ) : (
            <span className="image-caption-text">
              {node.attrs.alt || ""}
            </span>
          )}
        </figcaption>
      </figure>
    </NodeViewWrapper>
  );
}

export const ImageBlock = Image.extend({
  // Force block-level so images aren't inline
  inline: false,
  group: "block",

  addAttributes() {
    return {
      ...this.parent?.(),
      // `{width=60%}` after the image in Markdown (document/imageSize.ts).
      width: {
        default: null,
        parseHTML: (el: HTMLElement) => imageWidthAttr(el.getAttribute("width")) || null,
        renderHTML: (a: Record<string, unknown>) => (a.width ? { width: a.width } : {}),
      },
      height: { default: null, rendered: false },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});
