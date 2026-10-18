import React, { useCallback, useEffect, useState } from "react";
import type { Editor } from "@tiptap/react";
import { sourceBlockLines } from "../sourceLines";
import { renderedSourceBlocks } from "../review";
import { MessageSquare, MessageSquarePlus } from "lucide-react";
import type { ReviewApi } from "../hooks/useReview";
import { blockState } from "./ReviewThreads";

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

export function LineNumbers({ editor, markdown, review }: {
  editor: Editor;
  markdown?: string;
  /** GitLab review: per-block comment markers (coloured by thread state) and "add comment". */
  review?: ReviewApi;
}) {
  const [lines, setLines] = useState<number[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [left, setLeft] = useState(0);
  const [current, setCurrent] = useState(-1);
  const [aligned, setAligned] = useState(true);

  useEffect(() => {
    if (markdown !== undefined) {
      try { setLines(sourceBlockLines(markdown)); } catch { setLines([]); }
    }
  }, [markdown]);

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
    const blocks = renderedSourceBlocks(root, lines.length);
    setAligned(blocks.length === lines.length);
    blocks.forEach((child, i) => {
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
    // Toolbar / sticky headings above the document shift it without resizing it.
    const container = document.querySelector<HTMLElement>(".editor-container");
    // StickyHeadings mounts its bar on scroll, so watch for new children too.
    const watch = () => container && Array.from(container.children).forEach((el) => el !== root && observer.observe(el));
    watch();
    const mutations = new MutationObserver(() => {
      watch();
      layout();
    });
    if (container) mutations.observe(container, { childList: true });
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
      mutations.disconnect();
      editor.off("update", onUpdate);
      editor.off("selectionUpdate", onSelection);
    };
  }, [editor, layout]);

  return (
    <div className={"line-numbers" + (review ? " is-review" : "")} aria-hidden={review ? undefined : true} style={{ left }}>
      {marks.map((m, i) => {
        if (!review)
          return (
            <span
              key={i}
              className={"line-number" + (i === current ? " current" : "")}
              style={{ top: m.top, height: m.height }}
            >
              {m.line}
            </span>
          );
        const threads = review.byBlock.get(i) ?? [];
        const notes = threads.reduce((n, t) => n + t.notes.length, 0);
        const state = threads.length ? blockState(threads) : "";
        const expanded = threads.some((t) => !review.collapsed.has(t.id));
        const canAdd = aligned && review.aligned && !!review.data?.canCreate;
        return (
          <span key={i} className="line-number rv-gutter" style={{ top: m.top, minHeight: m.height }}>
            {threads.length > 0 ? (
              <button
                type="button"
                className={`rv-marker is-${state}`}
                aria-expanded={expanded}
                aria-label={`${notes} comment${notes === 1 ? "" : "s"} on line ${m.line}, ${expanded ? "collapse" : "expand"}`}
                title={expanded ? "Collapse discussions" : "Expand discussions"}
                onClick={() => threads.forEach((t) => review.toggleThread(t.id, !expanded))}
              >
                <MessageSquare size={13} strokeWidth={2.5} aria-hidden />
                {notes}
              </button>
            ) : (
              canAdd && (
                <button
                  type="button"
                  className="rv-add"
                  aria-label={`Comment on line ${m.line}`}
                  title={`Comment on line ${m.line}`}
                  onClick={() => review.openComposer(m.line)}
                >
                  <MessageSquarePlus size={14} aria-hidden />
                </button>
              )
            )}
            <span className="rv-num">{m.line}</span>
          </span>
        );
      })}
    </div>
  );
}
