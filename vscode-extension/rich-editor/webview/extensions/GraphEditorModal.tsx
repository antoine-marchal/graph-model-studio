import { useEffect, useRef } from "react";
import { openGmcEditor } from "../../../shared/gmc-editor-shell";
import { vscodeApi } from "../vscode-api";

/**
 * Graph Model Studio's interactive editor (the shared maximized shell, same as
 * Slides Studio's) on a GMC fence or a linked .gmc file. The callers own the
 * source: `onChange` gets every edit, `onSave` (linked files) writes it.
 */
const graphEditor = { js: "", css: "", version: "" };
window.addEventListener("message", (e) => {
  if (e.data?.type === "init" && typeof e.data.gmcRuntimeUri === "string") {
    graphEditor.js = e.data.gmcEditorUri ?? "";
    graphEditor.css = e.data.gmcEditorCssUri ?? "";
    graphEditor.version = e.data.gmcVersion ?? "";
  }
});

interface GraphEditorModalProps {
  source: string;
  name: string;
  view?: string;
  theme: "light" | "dark";
  onChange(source: string): void;
  onClose(): void;
  onOpenBeside(): void;
  /** Editing a file (embed card): header Save button and Ctrl+S. */
  onSave?(): void;
  hint?: string;
}

export function GraphEditorModal(props: GraphEditorModalProps) {
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    const { source, name, view, theme, hint, onSave } = latest.current;
    const session = openGmcEditor({
      name,
      hint: hint ?? "Changes are written to the block as you edit",
      start: graphEditor.js
        ? Promise.resolve({
            js: graphEditor.js,
            css: graphEditor.css,
            render: { renderId: "modal", editable: true, version: graphEditor.version, source, name, view, theme, target: { uri: "markdown-studio", kind: "markdown" } },
          })
        : Promise.reject(new Error("the interactive graph editor is available in VS Code only")),
      onChange: (s) => latest.current.onChange(s),
      onSave: onSave && (() => latest.current.onSave?.()),
      saveButton: true,
      onClose: () => latest.current.onClose(),
      onOpenBeside: () => latest.current.onOpenBeside(),
      // Exports made from the graph editor are saved by the host.
      onFrameMessage: (m) => {
        if (m.type === "saveText" || m.type === "saveBinary") vscodeApi.postMessage({ type: "gmcSave", kind: m.type, requestId: m.requestId, content: m.content, options: m.options });
      },
      labels: onSave ? { saveTitle: "Save the .gmc file and refresh the embed (Ctrl+S)" } : undefined,
    });
    const relay = (e: MessageEvent) => {
      if (e.data?.type === "gmcSaveResult") session.send({ type: "saveResult", requestId: e.data.requestId, saved: e.data.saved, error: e.data.error });
    };
    window.addEventListener("message", relay);
    return () => {
      window.removeEventListener("message", relay);
      session.dispose();
    };
  }, []);
  return null;
}
