import React, { useEffect, useMemo, useRef, useState } from "react";
import { diffWordsWithSpace, structuredPatch } from "diff";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import { markdownToHtml, restoreTabs } from "../hooks/useVSCodeSync";
import { contentExtensions } from "../editorExtensions";
import { DiffBlock, DiffWords } from "../extensions/DiffBlock";
import { diffBlocks, similarity, type DiffEntry } from "../renderedDiff";

export type DiffMode = "source" | "rendered";
export type DiffLayout = "unified" | "side-by-side";

/**
 * Side by side, a removed / added run is laid out row by row: each removed
 * block faces an added one (or an empty pad), as in the merge request diff.
 */
function alignSides(entries: DiffEntry[]): DiffEntry[] {
  const out: DiffEntry[] = [];
  for (let i = 0; i < entries.length; ) {
    const e = entries[i];
    if (e.kind !== "del" && e.kind !== "ins") {
      out.push(e);
      i++;
      continue;
    }
    const dels: DiffEntry[] = [];
    const ins: DiffEntry[] = [];
    while (i < entries.length && (entries[i].kind === "del" || entries[i].kind === "ins")) {
      (entries[i].kind === "del" ? dels : ins).push(entries[i]);
      i++;
    }
    for (let k = 0; k < Math.max(dels.length, ins.length); k++) {
      out.push(dels[k] ?? { kind: "pad-old", md: "" });
      out.push(ins[k] ?? { kind: "pad-new", md: "" });
    }
  }
  return out;
}

/**
 * Rendered mode: both versions are diffed block by block (renderedDiff.ts)
 * and every block is rendered exactly like read mode — same markdown
 * pipeline, same Tiptap extensions (diagrams, embeds, tables, math,
 * highlights…) in a read-only editor. Added / removed / modified blocks are
 * wrapped in DiffBlock containers; modified pairs also get word-level
 * highlights (DiffWords). "Changes only" folds unchanged stretches.
 */
async function renderDiffHtml(oldContent: string, newContent: string, baseUri: string | undefined, sideBySide: boolean): Promise<{ html: string; stats: DiffStats }> {
  const { entries: raw, defs } = diffBlocks(oldContent, newContent);
  const entries = sideBySide ? alignSides(raw) : raw;
  const defsMd = defs.join("\n\n");
  const htmls = await Promise.all(
    entries.map(async (e) => {
      if (e.kind === "gap") return `<p>${e.count} unchanged block${e.count === 1 ? "" : "s"}</p>`;
      if (e.kind.startsWith("pad")) return "<p></p>";
      const html = await markdownToHtml(defsMd ? `${e.md}\n\n${defsMd}` : e.md, baseUri);
      return html.trim() || "<p></p>";
    }),
  );
  const stats: DiffStats = {
    added: raw.filter((e) => e.kind === "ins").length,
    removed: raw.filter((e) => e.kind === "del").length,
    modified: raw.filter((e) => e.kind === "new").length,
  };
  const html = entries
    .map((e, i) => {
      const attrs = [`data-diff="${e.kind}"`];
      if (e.pair !== undefined) attrs.push(`data-pair="${e.pair}"`);
      if (e.far) attrs.push(`data-far="true"`);
      return `<div data-type="diff" ${attrs.join(" ")}>${htmls[i]}</div>`;
    })
    .join("");
  return { html, stats };
}

interface DiffStats {
  added: number;
  removed: number;
  modified: number;
}

/* ------------------------------------------------------------------ */
/* Source diff: one table, so both sides stay aligned when lines wrap. */
/* ------------------------------------------------------------------ */

interface SourceRow {
  kind: "ctx" | "del" | "ins" | "mod";
  oldNo?: number;
  newNo?: number;
  oldText?: string;
  newText?: string;
}

interface SourceHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  rows: SourceRow[];
}

function sourceHunks(oldContent: string, newContent: string): SourceHunk[] {
  const patch = structuredPatch("a", "b", oldContent, newContent, "", "", { context: 3 });
  return patch.hunks.map((h) => {
    const rows: SourceRow[] = [];
    let o = h.oldStart;
    let n = h.newStart;
    const lines = h.lines.filter((l) => !l.startsWith("\\"));
    for (let i = 0; i < lines.length; ) {
      if (lines[i][0] === " ") {
        rows.push({ kind: "ctx", oldNo: o++, newNo: n++, oldText: lines[i].slice(1), newText: lines[i].slice(1) });
        i++;
        continue;
      }
      const dels: string[] = [];
      const adds: string[] = [];
      while (i < lines.length && lines[i][0] === "-") dels.push(lines[i++].slice(1));
      while (i < lines.length && lines[i][0] === "+") adds.push(lines[i++].slice(1));
      // Pair each removed line with the next similar added line (a modified
      // line); the others stay plain removals / additions, in order.
      let j = 0;
      const addRow = () => rows.push({ kind: "ins", newNo: n++, newText: adds[j++] });
      for (const d of dels) {
        let t = j;
        while (t < adds.length && similarity(d, adds[t]) < 0.5) t++;
        if (t < adds.length) {
          while (j < t) addRow();
          rows.push({ kind: "mod", oldNo: o++, oldText: d, newNo: n++, newText: adds[j++] });
        } else rows.push({ kind: "del", oldNo: o++, oldText: d });
      }
      while (j < adds.length) addRow();
    }
    return { oldStart: h.oldStart, oldLines: h.oldLines, newStart: h.newStart, newLines: h.newLines, rows };
  });
}

/** A changed line with its changed words emphasised (only for modified pairs). */
function Words({ row, side }: { row: SourceRow; side: "old" | "new" }) {
  const text = side === "old" ? row.oldText : row.newText;
  if (row.kind !== "mod") return <>{text || "​"}</>;
  const parts = diffWordsWithSpace(row.oldText!, row.newText!);
  return (
    <>
      {parts.map((p, i) =>
        (side === "old" && p.added) || (side === "new" && p.removed) ? null : (p.added || p.removed) && p.value.trim() ? (
          <span key={i} className={side === "old" ? "src-word-del" : "src-word-ins"}>{p.value}</span>
        ) : (
          <React.Fragment key={i}>{p.value}</React.Fragment>
        ),
      )}
      {!text && "​"}
    </>
  );
}

const hunkLabel = (h: SourceHunk) =>
  h.newLines ? `Lines ${h.newStart}–${h.newStart + h.newLines - 1}` : `Removed after line ${h.newStart}`;

function SourceDiff({ oldContent, newContent, layout }: { oldContent: string; newContent: string; layout: DiffLayout }) {
  const hunks = useMemo(() => sourceHunks(oldContent, newContent), [oldContent, newContent]);
  const sbs = layout === "side-by-side";
  return (
    <table className={`src-diff ${sbs ? "is-sbs" : "is-unified"}`}>
      <colgroup>
        {sbs ? (
          <>
            <col className="src-col-ln" />
            <col className="src-col-sign" />
            <col />
            <col className="src-col-ln" />
            <col className="src-col-sign" />
            <col />
          </>
        ) : (
          <>
            <col className="src-col-ln" />
            <col className="src-col-ln" />
            <col className="src-col-sign" />
            <col />
          </>
        )}
      </colgroup>
      {hunks.map((h, hi) => (
        <tbody key={hi}>
          <tr className="src-hunk">
            <td colSpan={sbs ? 6 : 4}>{hunkLabel(h)}</td>
          </tr>
          {sbs
            ? h.rows.map((r, i) => (
                <tr key={i} className={`src-row src-${r.kind}`}>
                  <td className="src-ln">{r.oldNo}</td>
                  <td className={`src-sign${r.oldText !== undefined && r.kind !== "ctx" ? " is-del" : ""}`}>{r.oldText !== undefined && r.kind !== "ctx" ? "−" : ""}</td>
                  <td className={`src-code${r.oldText === undefined ? " is-pad" : r.kind !== "ctx" ? " is-del" : ""}`}>{r.oldText !== undefined && <Words row={r} side="old" />}</td>
                  <td className="src-ln">{r.newNo}</td>
                  <td className={`src-sign${r.newText !== undefined && r.kind !== "ctx" ? " is-ins" : ""}`}>{r.newText !== undefined && r.kind !== "ctx" ? "+" : ""}</td>
                  <td className={`src-code${r.newText === undefined ? " is-pad" : r.kind !== "ctx" ? " is-ins" : ""}`}>{r.newText !== undefined && <Words row={r} side="new" />}</td>
                </tr>
              ))
            : unifiedRows(h.rows).map(({ r, side }, i) => (
                <tr key={i} className={`src-row src-${r.kind === "ctx" ? "ctx" : side === "old" ? "del" : "ins"}`}>
                  <td className="src-ln">{side !== "new" ? r.oldNo : ""}</td>
                  <td className="src-ln">{side !== "old" ? r.newNo : ""}</td>
                  <td className={`src-sign${r.kind === "ctx" ? "" : side === "old" ? " is-del" : " is-ins"}`}>{r.kind === "ctx" ? "" : side === "old" ? "−" : "+"}</td>
                  <td className={`src-code${r.kind === "ctx" ? "" : side === "old" ? " is-del" : " is-ins"}`}><Words row={r} side={side === "new" ? "new" : "old"} /></td>
                </tr>
              ))}
        </tbody>
      ))}
    </table>
  );
}

/** Unified order, as git shows it: a changed run's removed lines, then its added lines. */
function unifiedRows(rows: SourceRow[]): { r: SourceRow; side: "both" | "old" | "new" }[] {
  const out: { r: SourceRow; side: "both" | "old" | "new" }[] = [];
  for (let i = 0; i < rows.length; ) {
    if (rows[i].kind === "ctx") {
      out.push({ r: rows[i++], side: "both" });
      continue;
    }
    const run: SourceRow[] = [];
    while (i < rows.length && rows[i].kind !== "ctx") run.push(rows[i++]);
    for (const r of run) if (r.oldText !== undefined) out.push({ r, side: "old" });
    for (const r of run) if (r.newText !== undefined) out.push({ r, side: "new" });
  }
  return out;
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
  const sideBySide = layout === "side-by-side";

  // Rendered diff — block diff rendered by a read-only read-mode editor.
  const [rendered, setRendered] = useState<{ html: string; stats: DiffStats } | null>(null);
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
        const out = await renderDiffHtml(oldContent, newContent, baseUri, sideBySide);
        if (!cancelled) setRendered(out);
      } catch (e: any) {
        if (!cancelled) setRenderedErr(e?.message || String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, oldContent, newContent, noChanges, baseUri, sideBySide]);

  const renderedHtml = rendered?.html ?? "";
  useEffect(() => {
    if (diffEditor && renderedHtml) {
      diffEditor.commands.setContent(renderedHtml, { emitUpdate: false });
      restoreTabs(diffEditor);
    }
  }, [diffEditor, renderedHtml]);

  // --- Navigation through rendered-diff hunks (Prev / Next, j / k, ↑ / ↓) ---
  const renderedRef = useRef<HTMLDivElement | null>(null);
  const [hunks, setHunks] = useState<HTMLElement[]>([]);
  // -1 = nothing focused yet: the diff doesn't auto-highlight on open.
  const [cursor, setCursor] = useState(-1);

  useEffect(() => {
    if (mode !== "rendered" || !renderedHtml) {
      setHunks([]);
      setCursor(-1);
      return;
    }
    const id = requestAnimationFrame(() => {
      const root = renderedRef.current;
      if (!root) return;
      // One stop per hunk: a modified pair, or one side-by-side row, counts once.
      const firsts = Array.from(
        root.querySelectorAll<HTMLElement>('.diff-block:is([data-diff="ins"], [data-diff="del"], [data-diff="old"], [data-diff="new"])'),
      ).filter((el) => {
        const prev = el.previousElementSibling as HTMLElement | null;
        if (el.dataset.diff === "new") return !(prev?.dataset.diff === "old" && prev.dataset.pair === el.dataset.pair);
        if (el.dataset.diff === "ins" && sideBySide) return !(prev && /^(del|pad-old)$/.test(prev.dataset.diff ?? ""));
        return true;
      });
      setHunks(firsts);
      setCursor(-1);
    });
    return () => cancelAnimationFrame(id);
  }, [renderedHtml, mode, diffEditor, sideBySide]);

  // Mark the focused hunk and center it in .diff-body (scrollIntoView would
  // also shift outer scroll containers in integrated mode).
  useEffect(() => {
    hunks.forEach((el, i) => el.classList.toggle("diff-hunk-current", i === cursor));
    if (cursor < 0) return;
    const el = hunks[cursor];
    const body = renderedRef.current?.parentElement;
    if (!el || !body) return;
    const bodyRect = body.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    body.scrollTo({ top: Math.max(0, body.scrollTop + (elRect.top - bodyRect.top) - (body.clientHeight - elRect.height) / 2), behavior: "smooth" });
  }, [hunks, cursor]);

  const gotoHunk = (delta: number) => {
    if (hunks.length === 0) return;
    setCursor((c) => (c < 0 ? (delta > 0 ? 0 : hunks.length - 1) : (c + delta + hunks.length) % hunks.length));
  };

  useEffect(() => {
    if (mode !== "rendered" || hunks.length === 0) return;
    const h = (e: KeyboardEvent) => {
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

  const stats = mode === "rendered" ? rendered?.stats : undefined;

  return (
    <div className="diff-view">
      <div className="diff-toolbar">
        <div className="diff-toolbar-left">
          <span className="diff-title" title={fileName}>
            {title ?? "Diff vs HEAD"}
            <span className="diff-file">{fileName}</span>
          </span>
          {stats && (
            <span className="diff-stats" aria-label={`${stats.added} added, ${stats.removed} removed, ${stats.modified} modified blocks`}>
              {stats.added > 0 && <span className="diff-stat is-ins">+{stats.added}</span>}
              {stats.removed > 0 && <span className="diff-stat is-del">−{stats.removed}</span>}
              {stats.modified > 0 && <span className="diff-stat is-mod">~{stats.modified}</span>}
            </span>
          )}
        </div>
        <div className="diff-toolbar-right">
          {mode === "rendered" && hunks.length > 0 && (
            <div className="diff-nav" role="group" aria-label="Changes">
              <button className="diff-icon-btn" onClick={() => gotoHunk(-1)} title="Previous change (k / ↑)" aria-label="Previous change">
                <ChevronUp size={15} />
              </button>
              <span className="diff-nav-counter">
                {cursor < 0 ? "–" : cursor + 1} / {hunks.length}
              </span>
              <button className="diff-icon-btn" onClick={() => gotoHunk(1)} title="Next change (j / ↓)" aria-label="Next change">
                <ChevronDown size={15} />
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
          <div className="settings-segmented" role="group" aria-label="Diff mode">
            <button className={"settings-segment" + (mode === "rendered" ? " active" : "")} aria-pressed={mode === "rendered"} onClick={() => onModeChange("rendered")} title="Block diff rendered like read mode">
              Rendered
            </button>
            <button className={"settings-segment" + (mode === "source" ? " active" : "")} aria-pressed={mode === "source"} onClick={() => onModeChange("source")} title="Line diff of the raw markdown">
              Source
            </button>
          </div>
          <div className="settings-segmented" role="group" aria-label="Layout">
            <button className={"settings-segment" + (layout === "unified" ? " active" : "")} aria-pressed={layout === "unified"} onClick={() => onLayoutChange("unified")}>
              Unified
            </button>
            <button className={"settings-segment" + (sideBySide ? " active" : "")} aria-pressed={sideBySide} onClick={() => onLayoutChange("side-by-side")}>
              Side by side
            </button>
          </div>
          <button className="diff-icon-btn diff-close" onClick={onClose} title="Close diff" aria-label="Close diff">
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="diff-body">
        {noChanges ? (
          <div className="diff-empty">No changes</div>
        ) : mode === "source" ? (
          <SourceDiff oldContent={oldContent} newContent={newContent} layout={layout} />
        ) : renderedErr ? (
          <div className="diff-empty">Rendered diff failed: {renderedErr}</div>
        ) : renderedHtml ? (
          <div ref={renderedRef} className={"diff-rendered-doc" + (changesOnly ? " changes-only" : "") + (sideBySide ? " is-sbs" : "")}>
            {sideBySide && (
              <div className="diff-sides" aria-hidden>
                <span>Before</span>
                <span>After</span>
              </div>
            )}
            <EditorContent editor={diffEditor} />
          </div>
        ) : (
          <div className="diff-empty">Rendering…</div>
        )}
      </div>
    </div>
  );
}
