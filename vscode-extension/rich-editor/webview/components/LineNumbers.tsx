import React, { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { sourceBlockLines } from "../sourceLines";

/**
 * Source line numbers in the left margin of the reading column (after nuza):
 * one per top-level block, the markdown line that block starts on, lined up
 * with the block's first line. The block holding the caret reads brighter.
 *
 * Lines come from the latest markdown (`btrmk:source` events from
 * useEditorState) and are matched to the editor's top-level blocks by
 * order. // chisle: order match; a paragraph of several images (split into
 * one block per image by the editor) shifts the numbers after it.
 */

interface Mark {
  top: number;
  height: number;
  line: number;
}

export function LineNumbers({ editor }: { editor: Editor }) {
  const [lines, setLines] = useState<number[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [left, setLeft] = useState(0);
  const [current, setCurrent] = useState(-1);

  useEffect(() => {
    const onSource = (e: Event) => {
      try {
        setLines(sourceBlockLines((e as CustomEvent<string>).detail));
      } catch {
        /* keep previous numbers on parse failure */
      }
    };
    window.addEventListener("btrmk:source", onSource);
    return () => window.removeEventListener("btrmk:source", onSource);
  }, []);

  const layout = useCallback(() => {
    const container = document.querySelector<HTMLElement>(".editor-container");
    const root = editor.view.dom as HTMLElement;
    if (!container) return;
    const base = container.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const padLeft = parseFloat(getComputedStyle(root).paddingLeft) || 0;
    setLeft(rootRect.left - base.left + padLeft);
    const next: Mark[] = [];
    Array.from(root.children).forEach((child, i) => {
      if (i >= lines.length) return;
      const el = child as HTMLElement;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4 || 20;
      next.push({
        top: rect.top - base.top + container.scrollTop + (parseFloat(style.paddingTop) || 0),
        height: lineHeight,
        line: lines[i],
      });
    });
    setMarks(next);
  }, [editor, lines]);

  useEffect(() => {
    layout();
    const root = editor.view.dom as HTMLElement;
    const observer = new ResizeObserver(() => layout());
    observer.observe(root);
    const onUpdate = () => requestAnimationFrame(layout);
    const onSelection = () => {
      const { $head } = editor.state.selection;
      setCurrent($head.depth > 0 ? $head.index(0) : -1);
    };
    editor.on("update", onUpdate);
    editor.on("selectionUpdate", onSelection);
    onSelection();
    return () => {
      observer.disconnect();
      editor.off("update", onUpdate);
      editor.off("selectionUpdate", onSelection);
    };
  }, [editor, layout]);

  return (
    <div className="line-numbers" aria-hidden style={{ left }}>
      {marks.map((m, i) => (
        <span
          key={i}
          className={"line-number" + (i === current ? " current" : "")}
          style={{ top: m.top, height: m.height }}
        >
          {m.line}
        </span>
      ))}
    </div>
  );
}
