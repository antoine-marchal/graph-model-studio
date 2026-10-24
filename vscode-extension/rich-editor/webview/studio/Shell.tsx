/**
 * Markdown Studio chrome (Slides Studio's neutral studio identity): title bar, ribbon, navigation
 * rail, paper well, inspector, status bar. One home per command; panels collapse in narrow views.
 */
import React, { useEffect } from "react";
import type { Editor } from "@tiptap/core";
import { Redo2, Save, Undo2, FileDown, PanelLeft, PanelRight, Minus, Plus, Maximize2 } from "lucide-react";
import { Ribbon } from "./Ribbon";
import { NavPanel } from "./NavPanel";
import { Inspector } from "./Inspector";
import { dismissNotice, studio, useStudio } from "./store";
import { getSync } from "./actions";
import { setZoom } from "./PageLayer";
import { vscodeApi } from "../vscode-api";

export const hostUndo = () => void (getSync()?.flush() ?? Promise.resolve()).then(() => vscodeApi.postMessage({ type: "undo" }));
export const hostRedo = () => void (getSync()?.flush() ?? Promise.resolve()).then(() => vscodeApi.postMessage({ type: "redo" }));
const save = () => void (getSync()?.flush() ?? Promise.resolve()).then(() => vscodeApi.postMessage({ type: "save" }));
const exportDocx = () => void (getSync()?.flush() ?? Promise.resolve()).then(() => vscodeApi.postMessage({ type: "exportDocx" }));

function TitleBar({ onSource, readonly }: { onSource: () => void; readonly: boolean }) {
  const fileName = useStudio((s) => s.fileName);
  const sync = useStudio((s) => s.sync);
  const masterEdit = useStudio((s) => s.masterEdit);
  const leftOpen = useStudio((s) => s.leftOpen);
  const rightOpen = useStudio((s) => s.rightOpen);
  return (
    <header className="ms-titlebar">
      <div className="ms-quick">
        <button className="ms-icon" onClick={() => studio.set({ leftOpen: !leftOpen })} aria-pressed={leftOpen} aria-label="Navigation panel" title="Navigation panel">
          <PanelLeft size={16} />
        </button>
        <button className="ms-icon" onClick={save} disabled={readonly} aria-label="Save" title="Save (Ctrl+S)">
          <Save size={16} />
        </button>
        <button className="ms-icon" onClick={hostUndo} disabled={readonly} aria-label="Undo" title="Undo (Ctrl+Z)">
          <Undo2 size={16} />
        </button>
        <button className="ms-icon" onClick={hostRedo} disabled={readonly} aria-label="Redo" title="Redo (Ctrl+Shift+Z)">
          <Redo2 size={16} />
        </button>
      </div>
      <div className="ms-file">
        <span className="ms-file-name">{fileName || "Untitled"}</span>
        {masterEdit && <span className="ms-chip ms-chip-accent">Master: {masterEdit.name}</span>}
        <span className={`ms-chip ms-sync-${sync}`} role="status">{{ saved: "Synced", pending: "Editing…", sending: "Saving…", conflict: "Conflict", readonly: "Read-only" }[sync]}</span>
      </div>
      <div className="ms-title-actions">
        <div className="ms-switch" role="group" aria-label="Editor mode">
          <button aria-pressed="true">Visual</button>
          <button aria-pressed="false" onClick={onSource} title="Open the Markdown source">Source</button>
        </div>
        <button className="ms-primary" onClick={exportDocx} title="Export an editable Word document">
          <FileDown size={15} /> <span className="ms-hide-narrow">Export DOCX</span>
        </button>
        <button className="ms-icon" onClick={() => studio.set({ rightOpen: !rightOpen })} aria-pressed={rightOpen} aria-label="Inspector" title="Inspector">
          <PanelRight size={16} />
        </button>
      </div>
    </header>
  );
}

function StatusBar() {
  const layout = useStudio((s) => s.layout);
  const current = useStudio((s) => s.currentPage);
  const words = useStudio((s) => s.words);
  const zoom = useStudio((s) => s.zoom);
  const pageView = useStudio((s) => s.pageView);
  const report = useStudio((s) => s.report);
  const diags = useStudio((s) => s.sectionDiagnostics.length + (s.layout?.overflows.length ?? 0));
  const issues = report ? report.report.unsupported.length + report.report.missing.length + report.report.fallbacks.length : 0;
  const section = layout?.pages[current - 1]?.section ?? 0;
  return (
    <footer className="ms-statusbar" role="status">
      {pageView && layout ? <span>Page {current} of {layout.pages.length}</span> : <span>Continuous view</span>}
      {pageView && layout && <span>Section {section + 1}</span>}
      <span>{words.toLocaleString()} words</span>
      <button className="ms-link" onClick={() => studio.set({ rightTab: "review", rightOpen: true })} title="Diagnostics and preflight">
        {diags + issues ? `⚠ ${diags + issues} issue(s)` : "No issues"}
      </button>
      {layout && <span className="ms-muted" title="Last pagination pass">layout {layout.ms} ms</span>}
      <span className="ms-spacer" />
      <button className="ms-icon" aria-label="Zoom out" onClick={() => setZoom(zoom - 0.1, true)}>
        <Minus size={14} />
      </button>
      <input aria-label="Zoom" type="range" min={25} max={300} step={5} value={Math.round(zoom * 100)} onChange={(e) => setZoom(Number(e.target.value) / 100, true)} />
      <button className="ms-icon" aria-label="Zoom in" onClick={() => setZoom(zoom + 0.1, true)}>
        <Plus size={14} />
      </button>
      <span className="ms-zoom">{Math.round(zoom * 100)}%</span>
      <button className="ms-icon" aria-label="Fit page width" title="Fit page width" onClick={() => window.dispatchEvent(new CustomEvent("ms:fit"))}>
        <Maximize2 size={14} />
      </button>
    </footer>
  );
}

function Notices() {
  const notices = useStudio((s) => s.notices);
  return (
    <div className="ms-notices" aria-live="polite">
      {notices.map((n) => (
        <div key={n.id} className={`ms-notice ms-notice-${n.level}`} role={n.level === "error" ? "alert" : "status"}>
          <span>{n.message}</span>
          {n.recovery && (
            <button onClick={() => void navigator.clipboard?.writeText(n.recovery!)} title="Copy the text that could not be written">
              Copy my version
            </button>
          )}
          <button aria-label="Dismiss" onClick={() => dismissNotice(n.id)}>×</button>
        </div>
      ))}
    </div>
  );
}

export function Shell({ editor, readonly, onSource, onFind, children }: { editor: Editor; readonly: boolean; onSource: () => void; onFind: () => void; children: React.ReactNode }) {
  const leftOpen = useStudio((s) => s.leftOpen);
  const rightOpen = useStudio((s) => s.rightOpen);
  const masterEdit = useStudio((s) => s.masterEdit);
  // Narrow panels: start with the side panels closed.
  useEffect(() => {
    if (window.innerWidth < 900) studio.set({ leftOpen: false });
    if (window.innerWidth < 700) studio.set({ rightOpen: false });
  }, []);
  return (
    <div className={`ms-studio${masterEdit ? " is-master-edit" : ""}`}>
      <TitleBar onSource={onSource} readonly={readonly} />
      <Ribbon editor={editor} readonly={readonly} onFind={onFind} />
      <div className="ms-body">
        {leftOpen && <NavPanel editor={editor} />}
        <main className="ms-well" aria-label="Document">
          {children}
        </main>
        {rightOpen && <Inspector editor={editor} readonly={readonly} />}
      </div>
      <StatusBar />
      <Notices />
    </div>
  );
}
