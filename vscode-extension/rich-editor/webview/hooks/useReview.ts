import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { vscodeApi } from "../vscode-api";
import { sourceBlockLines } from "../sourceLines";
import { reviewBlockIndex, sourceBlockCount, type ReviewData, type ReviewThread } from "../review";

/** A new-discussion composer: source line + block it renders under (-1 = top of file). */
export interface ReviewComposer {
  line: number;
  index: number;
}

/**
 * GitLab rendered review state. Threads are anchored to the top-level block
 * holding their source line and rendered inline under it (ReviewThreads);
 * a block-count mismatch (one source block rendered as several nodes) means
 * no exact mapping, so every thread then stacks at the top of the file.
 */
export function useReview(editor: Editor | null) {
  const [enabled, setEnabled] = useState(false);
  const [source, setSource] = useState("");
  const [data, setData] = useState<ReviewData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [composer, setComposer] = useState<ReviewComposer | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<{ noteId: number; seq: number } | null>(null);
  const [docVersion, setDocVersion] = useState(0);
  const pending = useRef<{ id: number; draftKey?: string } | null>(null);
  const nextId = useRef(0);

  const send = useCallback((action: string, fields: Record<string, unknown> = {}, key?: string) => {
    if (pending.current) return;
    const id = ++nextId.current;
    pending.current = { id, draftKey: key };
    setBusy(true);
    setError("");
    vscodeApi.postMessage({ type: "review", action, requestId: id, ...fields });
  }, []);

  const reveal = useCallback((noteId: number) => setFocus((f) => ({ noteId, seq: (f?.seq ?? 0) + 1 })), []);

  useEffect(() => {
    const onMessage = ({ data: msg }: MessageEvent) => {
      if (msg?.type === "init") {
        setEnabled(!!msg.reviewEnabled);
        setSource(msg.content ?? "");
      } else if (msg?.type === "reviewResult") {
        if (msg.requestId === undefined && pending.current) return;
        if (msg.requestId !== undefined && msg.requestId !== pending.current?.id) return;
        setBusy(false);
        if (msg.error) setError(String(msg.error));
        else if (msg.data) {
          setData(msg.data);
          setError("");
          const key = pending.current?.draftKey;
          if (key && (msg.action === "create" || msg.action === "reply")) {
            setDrafts((old) => ({ ...old, [key]: "" }));
            if (msg.action === "create") setComposer(null);
          }
          if (msg.data.focus?.noteId) reveal(msg.data.focus.noteId);
        }
        pending.current = null;
      } else if (msg?.type === "revealReviewComment") {
        if (msg.focus?.noteId) reveal(msg.focus.noteId);
        send("load");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [send, reveal]);

  useEffect(() => {
    if (!editor) return;
    // "transaction", not "update": the initial load sets content without emitting updates.
    const bump = ({ transaction }: { transaction: { docChanged: boolean } }) =>
      transaction.docChanged && setDocVersion((v) => v + 1);
    editor.on("transaction", bump);
    return () => {
      editor.off("transaction", bump);
    };
  }, [editor]);

  const lines = useMemo(() => {
    try {
      return sourceBlockLines(source);
    } catch {
      return [];
    }
  }, [source]);
  const aligned = useMemo(
    () => !!editor && lines.length > 0 && sourceBlockCount(editor.state.doc, lines.length) === lines.length,
    // docVersion: re-check whenever the rendered document changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, lines, docVersion],
  );
  const indexOf = useCallback((line: number) => (aligned ? reviewBlockIndex(lines, line) : -1), [aligned, lines]);
  const byBlock = useMemo(() => {
    const map = new Map<number, ReviewThread[]>();
    for (const t of data?.threads ?? []) {
      const i = indexOf(t.line);
      map.set(i, [...(map.get(i) ?? []), t]);
    }
    return map;
  }, [data, indexOf]);

  return {
    enabled,
    source,
    data,
    error,
    busy,
    send,
    lines,
    aligned,
    byBlock,
    docVersion,
    drafts,
    setDraft: (key: string, value: string) => setDrafts((old) => ({ ...old, [key]: value })),
    composer,
    openComposer: (line: number) => setComposer({ line, index: indexOf(line) }),
    closeComposer: () => setComposer(null),
    collapsed,
    toggleThread: (id: string, open?: boolean) =>
      setCollapsed((old) => {
        const next = new Set(old);
        if (open ?? next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    focus,
    reveal,
  };
}

export type ReviewApi = ReturnType<typeof useReview>;
