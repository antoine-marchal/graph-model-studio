import React, { useEffect, useMemo, useRef, useState } from "react";
import { createTwoFilesPatch } from "diff";
import { html as diff2html } from "diff2html";
import { useEditor, EditorContent } from "@tiptap/react";
import { markdownToHtml } from "../hooks/useVSCodeSync";
import { contentExtensions } from "../editorExtensions";
import { DiffBlock, DiffWords } from "../extensions/DiffBlock";
import { diffBlocks } from "../renderedDiff";

export type DiffMode = "source" | "rendered";
export type DiffLayout = "unified" | "side-by-side";

/**
 * Rendered mode: both versions are diffed block by block (renderedDiff.ts)
 * and every block is rendered exactly like read mode — same markdown
 * pipeline, same Tiptap extensions (diagrams, embeds, tables, math,
 * highlights…) in a read-only editor. Added / removed / modified blocks are
 * wrapped in DiffBlock containers; modified pairs also get word-level
 * highlights (DiffWords). "Changes only" folds unchanged stretches.
 */
async function renderDiffHtml(oldContent: string, newContent: string, baseUri?: string): Promise<string> {
  const { entries, defs } = diffBlocks(oldContent, newContent);
  const defsMd = defs.join("\n\n");
  const htmls = await Promise.all(
    entries.map(async (e) => {
      if (e.kind === "gap") return `<p>⋯ ${e.count} unchanged block${e.count === 1 ? "" : "s"}</p>`;
      const html = await markdownToHtml(defsMd ? `${e.md}\n\n${defsMd}` : e.md, baseUri);
      return html.trim() || "<p></p>";
    }),
  );
  return entries
    .map((e, i) => {
      const attrs = [`data-diff="${e.kind}"`];
      if (e.pair !== undefined) attrs.push(`data-pair="${e.pair}"`);
      if (e.far) attrs.push(`data-far="true"`);
      return `<div data-type="diff" ${attrs.join(" ")}>${htmls[i]}</div>`;
    })
    .join("");
}

interface DiffViewProps {
  oldContent: string;
  newContent: string;
  fileName: string;
  layout: DiffLayout;
  mode: DiffMode;
  onClose: () => void;
  onLayoutChange: (layout: DiffLayout) => void;
  onModeChange: (mode: DiffMode) => void;
  title?: string; // e.g. "Diff vs HEAD" or "abc123 → def456"
  /** Webview URI of the document folder, for relative images. */
  baseUri?: string;
}

export function DiffView({
  oldContent,
  newContent,
  fileName,
  layout,
  mode,
  onClose,
  onLayoutChange,
  onModeChange,
  title,
  baseUri,
}: DiffViewProps) {
  const noChanges = oldContent === newContent;

  // Source-level diff (line-based via diff2html)
  const sourceHtml = useMemo(() => {
    if (mode !== "source" || noChanges) return "";
    const patch = createTwoFilesPatch(
      fileName,
      fileName,
      oldContent,
      newContent,
      "",
      "",
      { context: 3 },
    );
    return diff2html(patch, {
      drawFileList: false,
      outputFormat: layout === "unified" ? "line-by-line" : "side-by-side",
      matching: "lines",
      colorScheme: "dark" as any,
    });
  }, [mode, oldContent, newContent, fileName, layout, noChanges]);

  // Rendered diff — block diff rendered by a read-only read-mode editor.
  const [renderedHtml, setRenderedHtml] = useState<string>("");
  const [renderedErr, setRenderedErr] = useState<string | null>(null);
  const [changesOnly, setChangesOnly] = useState(true);
  const diffEditor = useEditor(
    {
      extensions: [...contentExtensions(), DiffBlock, DiffWords],
      editable: false,
      editorProps: { attributes: { class: "tiptap-editor diff-doc" } },
    },
    [],
  );

  useEffect(() => {
    if (mode !== "rendered" || noChanges) return;
    let cancelled = false;
    (async () => {
      try {
        setRenderedErr(null);
        const html = await renderDiffHtml(oldContent, newContent, baseUri);
        if (!cancelled) setRenderedHtml(html);
      } catch (e: any) {
        if (!cancelled) setRenderedErr(e?.message || String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, oldContent, newContent, noChanges, baseUri]);

  useEffect(() => {
    if (diffEditor && renderedHtml) diffEditor.commands.setContent(renderedHtml, { emitUpdate: false });
  }, [diffEditor, renderedHtml]);

  // --- Navigation through rendered-diff hunks ---
  // node-htmldiff tags each logical change with data-operation-index="N".
  // We collect the first element of each group, sort by DOM order, and let
  // the user step through with Prev/Next (and j/k / ArrowUp/ArrowDown).
  const renderedRef = useRef<HTMLDivElement | null>(null);
  const [hunks, setHunks] = useState<HTMLElement[]>([]);
  // -1 = nothing focused yet. Only becomes a real index once the user
  // presses Prev/Next, so the diff doesn't auto-highlight the first
  // hunk on open.
  const [cursor, setCursor] = useState(-1);

  useEffect(() => {
    if (mode !== "rendered" || !renderedHtml) {
      setHunks([]);
      setCursor(-1);
      return;
    }
    // Wait for the DOM to be populated after setting innerHTML
    const id = requestAnimationFrame(() => {
      const root = renderedRef.current;
      if (!root) return;
      const firsts = Array.from(
        root.querySelectorAll<HTMLElement>('.diff-block:is([data-diff="ins"], [data-diff="del"], [data-diff="old"], [data-diff="new"])'),
      ).filter((el) => {
        if (el.dataset.diff !== "new") return true;
        const prev = el.previousElementSibling as HTMLElement | null;
        return !(prev?.dataset.diff === "old" && prev.dataset.pair === el.dataset.pair);
      });
      setHunks(firsts);
      setCursor(-1);
    });
    return () => cancelAnimationFrame(id);
  }, [renderedHtml, mode, diffEditor]);

  // Apply "current" class to the focused hunk and scroll it into view.
  // Skipped when cursor === -1 (initial state, no user navigation yet).
  // We manually scroll the .diff-body container instead of using
  // scrollIntoView, which walks the ancestor chain and can shift outer
  // scroll containers (e.g. the editor-container in integrated mode).
  useEffect(() => {
    hunks.forEach((el, i) => {
      if (i === cursor) el.classList.add("diff-hunk-current");
      else el.classList.remove("diff-hunk-current");
    });
    if (cursor < 0) return;
    const el = hunks[cursor];
    const body = renderedRef.current?.parentElement;
    if (!el || !body) return;
    const bodyRect = body.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const target =
      body.scrollTop +
      (elRect.top - bodyRect.top) -
      (body.clientHeight - elRect.height) / 2;
    body.scrollTo({
      top: Math.max(0, target),
      behavior: "smooth",
    });
  }, [hunks, cursor]);

  const gotoHunk = (delta: number) => {
    if (hunks.length === 0) return;
    setCursor((c) => {
      // First press: land on 0 (Next) or last (Prev) instead of wrapping
      if (c < 0) return delta > 0 ? 0 : hunks.length - 1;
      return (c + delta + hunks.length) % hunks.length;
    });
  };

  // Keyboard shortcuts while the diff is open
  useEffect(() => {
    if (mode !== "rendered" || hunks.length === 0) return;
    const h = (e: KeyboardEvent) => {
      // Ignore if typing in an input/textarea
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        gotoHunk(1);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        gotoHunk(-1);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [mode, hunks.length]);

  return (
    <div className="diff-view">
      <div className="diff-toolbar">
        <div className="diff-toolbar-left">
          <span className="diff-title">
            {title ?? "Diff vs HEAD"} · {fileName}
          </span>
        </div>
        <div className="diff-toolbar-right">
          {mode === "rendered" && hunks.length > 0 && (
            <div className="diff-nav">
              <button
                className="diff-nav-btn"
                onClick={() => gotoHunk(-1)}
                title="Previous change (k / ↑)"
                aria-label="Previous change"
              >
                ↑
              </button>
              <span className="diff-nav-counter">
                {cursor < 0 ? "—" : cursor + 1} / {hunks.length}
              </span>
              <button
                className="diff-nav-btn"
                onClick={() => gotoHunk(1)}
                title="Next change (j / ↓)"
                aria-label="Next change"
              >
                ↓
              </button>
            </div>
          )}
          {mode === "rendered" && (
            <button
              className={"settings-segment diff-changes-only" + (changesOnly ? " active" : "")}
              onClick={() => setChangesOnly((v) => !v)}
              title="Fold unchanged blocks"
              aria-pressed={changesOnly}
            >
              Changes only
            </button>
          )}
          <div className="settings-segmented">
            <button
              className={
                "settings-segment" + (mode === "source" ? " active" : "")
              }
              onClick={() => onModeChange("source")}
              title="Line-by-line diff of the raw markdown"
            >
              Source
            </button>
            <button
              className={
                "settings-segment" + (mode === "rendered" ? " active" : "")
              }
              onClick={() => onModeChange("rendered")}
              title="Block diff rendered like read mode"
            >
              Rendered
            </button>
          </div>
          {mode === "source" && (
            <div className="settings-segmented">
              <button
                className={
                  "settings-segment" + (layout === "unified" ? " active" : "")
                }
                onClick={() => onLayoutChange("unified")}
              >
                Unified
              </button>
              <button
                className={
                  "settings-segment" +
                  (layout === "side-by-side" ? " active" : "")
                }
                onClick={() => onLayoutChange("side-by-side")}
              >
                Side-by-side
              </button>
            </div>
          )}
          <button className="diff-close" onClick={onClose} title="Close diff">
            ×
          </button>
        </div>
      </div>
      <div className="diff-body">
        {noChanges ? (
          <div className="diff-empty">No changes</div>
        ) : mode === "source" ? (
          <div
            className="diff-html"
            dangerouslySetInnerHTML={{ __html: sourceHtml }}
          />
        ) : renderedErr ? (
          <div className="diff-empty">Rendered diff failed: {renderedErr}</div>
        ) : renderedHtml ? (
          <div ref={renderedRef} className={"diff-rendered-doc" + (changesOnly ? " changes-only" : "")}>
            <EditorContent editor={diffEditor} />
          </div>
        ) : (
          <div className="diff-empty">Rendering…</div>
        )}
      </div>
    </div>
  );
}
