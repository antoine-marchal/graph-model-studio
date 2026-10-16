import React, { useState, useEffect, useRef, useCallback, useReducer } from "react";
import { Image } from "@tiptap/extension-image";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";

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

function ImageNodeView({ node, updateAttributes, selected }: any) {
  const [error, setError] = useState(false);
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
          <img
            src={src}
            alt={node.attrs.alt || ""}
            title={node.attrs.title || undefined}
            onError={() => setError(true)}
            draggable={false}
          />
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

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});
