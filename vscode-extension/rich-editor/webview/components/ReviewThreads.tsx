import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  GitPullRequest,
  ListChevronsDownUp,
  MessageSquare,
  MessageSquarePlus,
  RefreshCw,
  RotateCcw,
  SendHorizontal,
} from "lucide-react";
import type { ReviewThread } from "../review";
import type { ReviewApi } from "../hooks/useReview";

/**
 * GitLab review threads rendered inside the document (after GitLab's MR
 * diff): each discussion sits right under the block its source line belongs
 * to, as a ProseMirror widget whose DOM React fills through a portal. The
 * widgets are not content: they never reach the markdown, the selection or
 * the line-number / diff-scroll block maps (renderedSourceBlocks skips them).
 */

const key = new PluginKey<DecorationSet>("reviewThreads");

export const ReviewThreads = Extension.create({
  name: "reviewThreads",
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, set) => tr.getMeta(key) ?? set.map(tr.mapping, tr.doc),
        },
        props: { decorations: (state) => key.getState(state) },
      }),
    ];
  },
});

export type ThreadState = "open" | "resolved" | "note";

export const threadState = (t: ReviewThread): ThreadState =>
  !t.resolvable ? "note" : t.resolved ? "resolved" : "open";

/** Gutter colour for a block: anything unresolved wins. */
export function blockState(threads: ReviewThread[]): ThreadState {
  const states = threads.map(threadState);
  return states.includes("open") ? "open" : states.includes("note") ? "note" : "resolved";
}

const STATE_LABEL: Record<ThreadState, string> = { open: "Open", resolved: "Resolved", note: "Comment" };
const STATE_ICON: Record<ThreadState, typeof Check> = { open: CircleDot, resolved: Check, note: MessageSquare };

/** "Antoine MARCHAL (@ant1mcl)" → name + handle. */
function splitAuthor(author: string) {
  const m = /^(.*?)\s*\((@[^)]+)\)\s*$/.exec(author);
  return m ? { name: m[1], handle: m[2] } : { name: author, handle: "" };
}

function initials(name: string) {
  const parts = name.replace(/^@/, "").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Stable avatar hue per person. */
function hue(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function ago(iso: string) {
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  if (!Number.isFinite(s)) return "";
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"], [60, "minute"], [24, "hour"], [7, "day"], [4.35, "week"], [12, "month"], [Infinity, "year"],
  ];
  let v = s;
  for (const [size, unit] of steps) {
    if (Math.abs(v) < size) return rtf.format(Math.round(v), unit);
    v /= size;
  }
  return "";
}

function StatePill({ state }: { state: ThreadState }) {
  const Icon = STATE_ICON[state];
  return (
    <span className={`rv-pill is-${state}`}>
      <Icon size={13} strokeWidth={2.5} aria-hidden />
      {STATE_LABEL[state]}
    </span>
  );
}

function Note({ note, reply }: { note: ReviewThread["notes"][number]; reply: boolean }) {
  const { name, handle } = splitAuthor(note.author);
  return (
    <li id={`review-note-${note.id}`} className={"rv-note" + (reply ? " is-reply" : "")}>
      <span className="rv-avatar" style={{ "--rv-hue": hue(name) } as React.CSSProperties} aria-hidden>
        {initials(name)}
      </span>
      <div className="rv-note-main">
        <div className="rv-note-meta">
          <b>{name}</b>
          {handle && <span className="rv-handle">{handle}</span>}
          <time dateTime={note.created} title={new Date(note.created).toLocaleString()}>
            {ago(note.created)}
          </time>
        </div>
        <p className="rv-body">{note.body}</p>
      </div>
    </li>
  );
}

/** Reply / new-comment box: collapsed to a one-line field until used. */
function Composer({
  review,
  draftKey,
  placeholder,
  submitLabel,
  startOpen,
  onSubmit,
  onCancel,
}: {
  review: ReviewApi;
  draftKey: string;
  placeholder: string;
  submitLabel: string;
  startOpen?: boolean;
  onSubmit: (text: string) => void;
  onCancel?: () => void;
}) {
  const text = review.drafts[draftKey] ?? "";
  const [open, setOpen] = useState(!!startOpen);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => input.current?.focus({ preventScroll: false }));
    return () => cancelAnimationFrame(frame);
  }, [open]);
  const ready = !!text.trim() && !review.busy;
  const submit = () => ready && onSubmit(text);
  if (!open && !text)
    return (
      <button type="button" className="rv-reply-field" onClick={() => setOpen(true)}>
        {placeholder}
      </button>
    );
  return (
    <form
      className="rv-composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={input}
        rows={3}
        value={text}
        placeholder={placeholder}
        aria-label={placeholder}
        disabled={review.busy}
        onChange={(e) => review.setDraft(draftKey, e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            e.stopPropagation();
            setOpen(false);
            onCancel?.();
          }
        }}
      />
      <div className="rv-composer-foot">
        <span className="rv-hint">Markdown · Ctrl+Enter to send</span>
        <button
          type="button"
          className="rv-btn"
          onClick={() => {
            setOpen(false);
            onCancel?.();
          }}
        >
          Cancel
        </button>
        <button type="submit" className="rv-btn is-primary" disabled={!ready}>
          <SendHorizontal size={14} aria-hidden />
          {review.busy ? "Sending…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function Thread({ thread, review }: { thread: ReviewThread; review: ReviewApi }) {
  const state = threadState(thread);
  const open = !review.collapsed.has(thread.id);
  const first = thread.notes[0];
  const count = thread.notes.length;
  return (
    <section className={`rv-thread is-${state}`} aria-label={`${STATE_LABEL[state]} discussion on line ${thread.line}`}>
      <header className="rv-thread-head">
        <button
          type="button"
          className="rv-toggle"
          aria-expanded={open}
          title={open ? "Collapse discussion" : "Expand discussion"}
          onClick={() => review.toggleThread(thread.id)}
        >
          {open ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}
          <span className="rv-line">Line {thread.line}</span>
          <span className="rv-count">
            {count} comment{count === 1 ? "" : "s"}
          </span>
          {!open && first && (
            <span className="rv-peek">
              <b>{splitAuthor(first.author).name}</b> {first.body}
            </span>
          )}
        </button>
        <StatePill state={state} />
        {thread.resolvable && review.data?.canComment && (
          <button
            type="button"
            className="rv-btn is-ghost"
            disabled={review.busy}
            onClick={() => review.send("resolve", { discussionId: thread.id, resolved: !thread.resolved })}
          >
            {thread.resolved ? <RotateCcw size={14} aria-hidden /> : <Check size={14} aria-hidden />}
            {thread.resolved ? "Reopen" : "Resolve"}
          </button>
        )}
      </header>
      {open && (
        <>
          <ol className="rv-notes">
            {thread.notes.map((note, i) => (
              <Note key={note.id} note={note} reply={i > 0} />
            ))}
          </ol>
          {review.data?.canComment && (
            <Composer
              review={review}
              draftKey={thread.id}
              placeholder="Reply…"
              submitLabel="Reply"
              onSubmit={(text) =>
                review.send("reply", { line: thread.line, discussionId: thread.id, text }, thread.id)
              }
            />
          )}
        </>
      )}
    </section>
  );
}

function NewDiscussion({ review }: { review: ReviewApi }) {
  const c = review.composer!;
  const max = review.source.split(/\r?\n/).length;
  return (
    <section className="rv-thread is-draft" aria-label={`New comment on line ${c.line}`}>
      <header className="rv-thread-head">
        <span className="rv-toggle is-static">
          <MessageSquarePlus size={15} aria-hidden />
          <span className="rv-line">New comment</span>
          {review.aligned ? (
            <span className="rv-count">on line {c.line}</span>
          ) : (
            <label className="rv-count">
              on line{" "}
              <input
                type="number"
                className="rv-line-input"
                min={1}
                max={max}
                value={c.line}
                onChange={(e) => e.target.valueAsNumber > 0 && review.openComposer(e.target.valueAsNumber)}
              />
            </label>
          )}
        </span>
      </header>
      <Composer
        review={review}
        draftKey={`line:${c.line}`}
        placeholder="Write a comment…"
        submitLabel="Comment"
        startOpen
        onSubmit={(text) => review.send("create", { line: c.line, text }, `line:${c.line}`)}
        onCancel={review.closeComposer}
      />
    </section>
  );
}

/** Mounts one widget slot per commented block and portals its threads into it. */
export function ReviewLayer({ editor, review }: { editor: Editor; review: ReviewApi }) {
  const slots = useRef(new Map<number, HTMLElement>());
  const slot = (i: number) => {
    let el = slots.current.get(i);
    if (!el) {
      el = document.createElement("div");
      el.className = "rv-slot";
      el.contentEditable = "false";
      slots.current.set(i, el);
    }
    return el;
  };
  const groups = useMemo(() => {
    const ids = new Set(review.byBlock.keys());
    if (review.composer) ids.add(review.composer.index);
    return [...ids].sort((a, b) => a - b);
  }, [review.byBlock, review.composer]);

  useLayoutEffect(() => {
    const ends: number[] = [];
    editor.state.doc.forEach((node, pos) => ends.push(pos + node.nodeSize));
    const decorations = groups.map((i) => {
      const el = slot(i);
      const pos = i < 0 ? 0 : ends[i] ?? editor.state.doc.content.size;
      return Decoration.widget(pos, el, {
        key: `rv-${i}`,
        side: i < 0 ? -1 : 1,
        stopEvent: () => true,
        ignoreSelection: true,
      });
    });
    editor.view.dispatch(editor.state.tr.setMeta(key, DecorationSet.create(editor.state.doc, decorations)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, groups, review.docVersion]);

  // Reveal a note (host "reveal comment", or the one just posted): expand, scroll, flash.
  useEffect(() => {
    if (!review.focus) return;
    const thread = review.data?.threads.find((t) => t.notes.some((n) => n.id === review.focus!.noteId));
    if (!thread) return;
    review.toggleThread(thread.id, true);
    const frame = requestAnimationFrame(() => {
      const el = document.getElementById(`review-note-${review.focus!.noteId}`);
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.remove("is-flash");
      void el.offsetWidth;
      el.classList.add("is-flash");
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review.focus, review.data]);

  return (
    <>
      {groups.map((i) => {
        const el = slot(i);
        const threads = review.byBlock.get(i) ?? [];
        return createPortal(
          <div className={"rv-stack" + (i < 0 ? " is-top" : "")}>
            {i < 0 && threads.length > 0 && (
              <p className="rv-stack-note">
                {review.aligned
                  ? "Comments outside the rendered blocks"
                  : "Rendered blocks do not map 1:1 to source lines here, so comments are listed at the top."}
              </p>
            )}
            {threads.map((t) => (
              <Thread key={t.id} thread={t} review={review} />
            ))}
            {review.composer?.index === i && <NewDiscussion review={review} />}
          </div>,
          el,
          `rv-${i}`,
        );
      })}
    </>
  );
}

/** Review header, merged into the editor toolbar row. */
export function ReviewBar({ review }: { review: ReviewApi }) {
  const { data, error, busy } = review;
  const threads = data?.threads ?? [];
  const unresolved = threads.filter((t) => threadState(t) === "open");
  const resolved = threads.filter((t) => threadState(t) === "resolved").length;
  const cursor = useRef(-1);
  const nextUnresolved = () => {
    if (!unresolved.length) return;
    cursor.current = (cursor.current + 1) % unresolved.length;
    const note = unresolved[cursor.current].notes[0];
    if (note) review.reveal(note.id);
  };
  const allCollapsed = threads.length > 0 && threads.every((t) => review.collapsed.has(t.id));
  return (
    <div className="rv-bar" role="region" aria-label="Merge request review" aria-busy={busy}>
      <span className="rv-info">
      <span className="rv-mr">
        <GitPullRequest size={14} aria-hidden />
        {data?.mr || "Review"}
      </span>
      {data && <span className={`rv-side is-${data.side}`}>{data.side === "old" ? "Original" : "Modified"}</span>}
      {data && (
        <span className="rv-tally">
          {threads.length} discussion{threads.length === 1 ? "" : "s"}
          {unresolved.length > 0 && (
            <>
              {" · "}
              <span className="is-open">{unresolved.length} unresolved</span>
            </>
          )}
          {resolved > 0 && (
            <>
              {" · "}
              <span className="is-resolved">{resolved} resolved</span>
            </>
          )}
        </span>
      )}
      {!data && !error && <span className="rv-tally" role="status">Loading comments…</span>}
      {error && (
        <span className="rv-error" role="alert">
          {error}
        </span>
      )}
      {data && !data.canComment && <span className="rv-tally">File absent on this side · comment on the other side</span>}
      {data?.canComment && !data.canCreate && (
        <span className="rv-tally">No line mapping for this revision · replies still work</span>
      )}
      </span>
      <span className="rv-bar-tools">
        {data?.canCreate && !review.aligned && (
          <button type="button" className="rv-icon" title="New comment" onClick={() => review.openComposer(1)}>
            <MessageSquarePlus size={16} aria-hidden />
          </button>
        )}
        <button
          type="button"
          className="rv-icon"
          title="Next unresolved discussion"
          aria-label="Next unresolved discussion"
          disabled={!unresolved.length}
          onClick={nextUnresolved}
        >
          <CircleDot size={16} aria-hidden />
        </button>
        <button
          type="button"
          className="rv-icon"
          title={allCollapsed ? "Expand all discussions" : "Collapse all discussions"}
          aria-label={allCollapsed ? "Expand all discussions" : "Collapse all discussions"}
          disabled={!threads.length}
          onClick={() => threads.forEach((t) => review.toggleThread(t.id, allCollapsed))}
        >
          <ListChevronsDownUp size={16} aria-hidden />
        </button>
        <button
          type="button"
          className="rv-icon"
          title="Refresh comments"
          aria-label="Refresh comments"
          disabled={busy}
          onClick={() => review.send("load")}
        >
          <RefreshCw size={16} className={busy ? "rv-spin" : undefined} aria-hidden />
        </button>
      </span>
    </div>
  );
}
