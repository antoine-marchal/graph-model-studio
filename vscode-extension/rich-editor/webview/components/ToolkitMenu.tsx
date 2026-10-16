import React, { useEffect, useRef, useState } from "react";
import { vscodeApi } from "../vscode-api";

/**
 * Graph Model Studio / Markdown toolkit commands for the open document.
 * The host runs them with this document's URI (see "runCommand" in
 * src/provider.ts), since the rich editor has no active text editor.
 */
const ACTIONS: { label: string; command: string }[] = [
  { label: "Update embeds & TOC", command: "markdown-embed.update" },
  { label: "Update embeds in workspace", command: "markdown-embed.updateWorkspace" },
  { label: "Export as HTML", command: "markdownToolkit.exportHtml" },
  { label: "Export as PDF", command: "markdownToolkit.exportPdf" },
  { label: "Export as PNG", command: "markdownToolkit.exportPng" },
  { label: "Export as DOCX (Pandoc)", command: "markdownToolkit.exportDocx" },
  { label: "Export all GMC diagrams (PNG)", command: "gmc.exportAllMarkdownDiagrams" },
  { label: "Slides: preview", command: "slides.preview" },
  { label: "Slides: export PDF", command: "slides.exportPdf" },
  { label: "Slides: export PPTX", command: "slides.exportPptx" },
  { label: "Slides: export editable PPTX", command: "slides.exportPptxEditable" },
];

export function ToolkitMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div className="toolkit-menu" ref={ref}>
      <button
        className={"diff-button" + (open ? " active" : "")}
        onClick={() => setOpen((v) => !v)}
        title="Embeds, export and slides"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Tools
      </button>
      {open && (
        <div className="toolkit-menu-list" role="menu">
          {ACTIONS.map((a) => (
            <button
              key={a.command}
              role="menuitem"
              className="toolkit-menu-item"
              onClick={() => {
                setOpen(false);
                vscodeApi.postMessage({ type: "runCommand", command: a.command });
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
