import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import type { MutableRefObject } from "react";
import type { Editor } from "@tiptap/react";
import { markdownToHtml, htmlToMarkdownSync, restoreTabs } from "./useVSCodeSync";
import { frontmatterBody, buildFrontmatter, defaultFrontmatter } from "../frontmatter";
import { mergeSettings, type BetterMarkdownSettings } from "../settings";
import { vscodeApi } from "../vscode-api";
import { DocumentSync } from "../studio/documentSync";
import { studio } from "../studio/store";

/** Latest markdown source, for consumers like the line-number gutter. */
function emitSource(md: string) {
  window.dispatchEvent(new CustomEvent("btrmk:source", { detail: md }));
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
  };
  return map[mime] || ".png";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

interface UseEditorStateOptions {
  editor: Editor | null;
  settingsRef: MutableRefObject<BetterMarkdownSettings>;
  handleUpdateRef: MutableRefObject<() => void>;
  applySettings: (s: BetterMarkdownSettings) => void;
  syncRef: MutableRefObject<DocumentSync | null>;
}

export function useEditorState({
  editor,
  settingsRef,
  handleUpdateRef,
  applySettings,
  syncRef,
}: UseEditorStateOptions) {
  const initialized = useRef(false);
  const baseUri = useRef("");
  const docFolderPath = useRef("");
  const filePath = useRef("");
  const isReadonly = useRef(false);
  // Opening a file must never rewrite it: transactions fired while loading
  // (node views, plugins) are not sent back until the user has interacted.
  const userTouched = useRef(false);
  useEffect(() => {
    const touch = () => (userTouched.current = true);
    // pointerdown too: resize handles cancel it, so no mousedown follows.
    const events = ["keydown", "mousedown", "pointerdown", "paste", "drop"] as const;
    for (const type of events) window.addEventListener(type, touch, true);
    return () => {
      for (const type of events) window.removeEventListener(type, touch, true);
    };
  }, []);

  const [status, setStatus] = useState<string | null>("Loading document...");
  const [readonly, setReadonly] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [diffVisible, setDiffVisible] = useState(false);
  const [diffData, setDiffData] = useState<{
    headContent: string;
    fileName: string;
  } | null>(null);
  const [imageDialogVisible, setImageDialogVisible] = useState(false);
  // YAML body of the frontmatter block (null = file has none).
  const [frontmatter, setFrontmatterState] = useState<string | null>(null);

  // Upload an image file and return the full src URL for the editor
  const uploadImage = useCallback(async (file: File): Promise<string> => {
    const name =
      file.name && file.name !== "image.png" && file.name !== "blob"
        ? file.name
        : `pasted-${Date.now()}${mimeToExt(file.type)}`;

    const base64 = await fileToBase64(file);
    return new Promise<string>((resolve, reject) => {
      const handler = (ev: MessageEvent) => {
        if (ev.data?.type === "imageUploaded") {
          window.removeEventListener("message", handler);
          if (ev.data.src) resolve(ev.data.src as string);
          else reject(new Error("Upload failed"));
        }
      };
      window.addEventListener("message", handler);
      vscodeApi.postMessage({
        type: "uploadImage",
        data: base64,
        filename: name,
      });
    });
  }, []);

  // Propagate readonly state to the Tiptap editor
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readonly);
  }, [editor, readonly]);

  // The versioned source sync (studio/documentSync.ts).
  const sync = useMemo(() => {
    if (!editor) return null;
    return new DocumentSync({
      editor,
      toHtml: (md) => markdownToHtml(md, baseUri.current),
      toMarkdown: (html) => htmlToMarkdownSync(html, baseUri.current, docFolderPath.current, settingsRef.current),
      afterLoad: () => restoreTabs(editor),
    });
  }, [editor, settingsRef]);
  syncRef.current = sync;
  const syncFrontmatterState = useCallback(() => {
    if (sync) setFrontmatterState(frontmatterBody(sync.fm));
  }, [sync]);

  // On mount: request content from host, load into editor
  useEffect(() => {
    if (!editor || !sync) return;

    const handler = async (e: MessageEvent) => {
      const msg = e.data;
      if (msg.type === "init" && !initialized.current) {
        initialized.current = true;
        if (msg.baseUri) baseUri.current = msg.baseUri;
        if (msg.docFolderPath) docFolderPath.current = msg.docFolderPath;
        if (msg.filePath) filePath.current = msg.filePath;
        if (msg.settings) {
          const merged = mergeSettings(msg.settings);
          applySettings(merged);
        }
        if (msg.isReadonly) {
          isReadonly.current = true;
          sync.readonly = true;
          setReadonly(true);
          studio.set({ sync: "readonly" });
        }
        studio.set({ fileName: String(msg.filePath ?? "").split(/[\\/]/).pop() ?? "" });
        const rawMd = (msg.content as string) || "";
        emitSource(rawMd);
        setStatus("Parsing markdown...");
        try {
          await sync.load(rawMd, Number(msg.version) || 0);
          syncFrontmatterState();
          // Place the caret: restore the last-known position for this
          // file if we have one, otherwise drop it inside the first
          // heading (usually the title). Falls back to doc start.
          const maxPos = editor.state.doc.content.size;
          let targetPos: number | null = null;
          if (typeof msg.cursorPosition === "number") {
            targetPos = Math.max(0, Math.min(msg.cursorPosition, maxPos));
          } else {
            editor.state.doc.descendants((n, pos) => {
              if (targetPos !== null) return false;
              if (n.type.name === "heading") {
                targetPos = pos + 1;
                return false;
              }
              return true;
            });
          }
          if (targetPos !== null) {
            try {
              editor.commands.setTextSelection(targetPos);
            } catch {
              // Position inside an atom: leave the default selection.
            }
          }
          editor.commands.focus();
        } catch (err: any) {
          setStatus(`Parse error: ${err?.message || err}`);
          return;
        }
        setStatus(null);
      } else if (msg.type === "update" && initialized.current) {
        await sync.onUpdate(String(msg.content), Number(msg.version));
        syncFrontmatterState();
      } else if (msg.type === "ack") {
        sync.onAck(String(msg.id), Number(msg.version));
      } else if (msg.type === "rejected") {
        sync.onRejected(String(msg.id), String(msg.reason ?? "rejected"));
      } else if (msg.type === "flushRequest") {
        await sync.flush();
        vscodeApi.postMessage({ type: "flushed", requestId: msg.requestId });
      } else if (msg.type === "insertDirective" && typeof msg.text === "string") {
        userTouched.current = true;
        editor
          .chain()
          .focus()
          .insertContent({ type: "directiveBlock", attrs: { open: msg.text } })
          .run();
      } else if (msg.type === "openSearch") {
        setSearchVisible(true);
      } else if (msg.type === "settingsUpdated") {
        const merged = mergeSettings(msg.settings);
        applySettings(merged);
      } else if (msg.type === "gitDiffResponse") {
        if (typeof msg.headContent !== "string") {
          setStatus("Not tracked by git — nothing to diff against HEAD.");
          setTimeout(() => setStatus(null), 3000);
          setDiffVisible(false);
          return;
        }
        setDiffData({ headContent: msg.headContent, fileName: msg.fileName });
      }
    };
    window.addEventListener("message", handler);
    vscodeApi.postMessage({ type: "ready" });
    return () => window.removeEventListener("message", handler);
  }, [editor, sync, applySettings, syncFrontmatterState]);

  // Restore cursor when the webview regains focus.
  // ProseMirror keeps the selection in state across blur, but the DOM
  // selection gets cleared when the window/tab loses focus. Track whether
  // the editor was the last-focused element and, on window focus, call
  // editor.commands.focus() to re-apply the DOM selection from state.
  useEffect(() => {
    if (!editor) return;
    let editorWasLastFocused = false;
    const onFocusIn = (e: FocusEvent) => {
      editorWasLastFocused = editor.view.dom.contains(e.target as Node);
    };
    const onWindowFocus = () => {
      if (editorWasLastFocused) editor.commands.focus();
    };
    document.addEventListener("focusin", onFocusIn);
    window.addEventListener("focus", onWindowFocus);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("focus", onWindowFocus);
    };
  }, [editor]);

  // Link handling: Cmd+click / Ctrl+click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      e.preventDefault();
      e.stopPropagation();
      // Embed fallback links (GitHub cards) mark themselves so a
      // plain click opens externally instead of just consuming the event.
      const alwaysExternal = anchor.getAttribute("data-external") === "true";
      if (alwaysExternal || e.metaKey || e.ctrlKey || e.button === 1) {
        vscodeApi.postMessage({ type: "openLink", href });
      }
    };
    document.addEventListener("click", handler, true);
    document.addEventListener("auxclick", handler, true);
    return () => {
      document.removeEventListener("click", handler, true);
      document.removeEventListener("auxclick", handler, true);
    };
  }, []);

  // Slash command "Image" opens the dialog
  useEffect(() => {
    const handler = () => setImageDialogVisible(true);
    window.addEventListener("btrmk:showImageDialog", handler);
    return () =>
      window.removeEventListener("btrmk:showImageDialog", handler);
  }, []);

  // Sync: editor changes → extension host (debounced, versioned).
  const handleUpdate = useCallback(() => {
    if (!initialized.current || !sync) return;
    if (isReadonly.current || !userTouched.current) return;
    sync.touched = true;
    sync.schedule();
  }, [sync]);

  // Ctrl+S, leaving the window or closing it: the pending edit goes now, then VS Code saves.
  useEffect(() => {
    if (!sync) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void sync.flush().then(() => vscodeApi.postMessage({ type: "save" }));
      }
    };
    const flush = () => void sync.flush();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [sync]);

  useEffect(() => {
    if (!editor) return;
    handleUpdateRef.current = handleUpdate;
    editor.on("update", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
    };
  }, [editor, handleUpdate, handleUpdateRef]);

  // Frontmatter edits (panel, "Add frontmatter" button, /frontmatter slash
  // command) live outside the Tiptap doc.
  const setFrontmatter = useCallback(
    (body: string | null) => {
      if (!sync) return;
      sync.setRawFrontmatter(buildFrontmatter(body));
      setFrontmatterState(body);
    },
    [sync],
  );

  const addFrontmatter = useCallback(() => {
    if (!sync || sync.fm || isReadonly.current) return;
    let title = "";
    editor?.state.doc.descendants((n) => {
      if (title) return false;
      if (n.type.name === "heading") {
        title = n.textContent.trim();
        return false;
      }
      return true;
    });
    if (!title) {
      const name = filePath.current.split(/[\\/]/).pop() || "";
      title = name.replace(/\.(md|markdown|paper)$/i, "");
    }
    userTouched.current = true;
    setFrontmatter(defaultFrontmatter(title));
    window.dispatchEvent(new CustomEvent("btrmk:expandFrontmatter"));
  }, [editor, sync, setFrontmatter]);

  useEffect(() => {
    window.addEventListener("btrmk:addFrontmatter", addFrontmatter);
    return () =>
      window.removeEventListener("btrmk:addFrontmatter", addFrontmatter);
  }, [addFrontmatter]);

  // Persist the caret position per file so reopening a file lands the user
  // where they left off. Debounced to avoid flooding the host on every
  // selection tick.
  useEffect(() => {
    if (!editor) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onSelection = () => {
      if (!initialized.current) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          const { from } = editor.state.selection;
          vscodeApi.postMessage({ type: "saveCursor", position: from });
        } catch {
          /* ignore */
        }
      }, 500);
    };
    editor.on("selectionUpdate", onSelection);
    return () => {
      if (timer) clearTimeout(timer);
      editor.off("selectionUpdate", onSelection);
    };
  }, [editor]);

  const switchToSource = useCallback(() => {
    // Pending visual edits reach the document before the text editor opens.
    void (sync?.flush() ?? Promise.resolve()).then(() => vscodeApi.postMessage({ type: "toggleEditor" }));
  }, [sync]);

  const toggleDiff = useCallback(() => {
    if (diffVisible) {
      setDiffVisible(false);
      return;
    }
    setDiffVisible(true);
    vscodeApi.postMessage({ type: "requestGitDiff" });
  }, [diffVisible]);

  // Current editor content as markdown (for the diff "new" side)
  const currentMarkdown = useMemo(() => {
    if (!sync || !diffVisible) return "";
    try {
      return sync.source();
    } catch {
      return "";
    }
  }, [sync, diffVisible, diffData]);

  return {
    status,
    readonly,
    searchVisible,
    setSearchVisible,
    diffVisible,
    setDiffVisible,
    diffData,
    imageDialogVisible,
    setImageDialogVisible,
    baseUri,
    docFolderPath,
    uploadImage,
    currentMarkdown,
    switchToSource,
    toggleDiff,
    frontmatter,
    setFrontmatter,
    addFrontmatter,
  };
}
