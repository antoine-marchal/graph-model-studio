/**
 * Markdown Studio chrome, Slides Studio's layout: ribbon (title bar, tabs, groups), workspace
 * (navigator | paper | inspector), status bar, master banner, notices and the context menu.
 */
import React, { useEffect } from "react";
import type { Editor } from "@tiptap/core";
import { Ribbon } from "./Ribbon";
import { NavPanel } from "./NavPanel";
import { Inspector } from "./Inspector";
import { ContextMenu } from "./ContextMenu";
import { dismissNotice, studio, useStudio } from "./store";
import { exitMasterEdit } from "./actions";
import { manualFit, setZoom } from "./PageLayer";
import { Icon } from "./icons";
import { tr } from "./ui";

export { hostRedo, hostUndo } from "./commands";

function StatusBar() {
  const pages = useStudio((s) => s.layout?.pages.length ?? 0);
  const section = useStudio((s) => (s.layout?.pages[s.currentPage - 1]?.section ?? 0) + 1);
  const current = useStudio((s) => s.currentPage);
  const words = useStudio((s) => s.words);
  const zoom = useStudio((s) => s.zoom);
  const pageView = useStudio((s) => s.pageView);
  const sync = useStudio((s) => s.sync);
  const pane = useStudio((s) => s.pane);
  const rightOpen = useStudio((s) => s.rightOpen);
  const leftOpen = useStudio((s) => s.leftOpen);
  const issues = useStudio((s) => s.sectionDiagnostics.length + (s.layout?.overflows.length ?? 0) + (s.report ? s.report.report.missing.length + s.report.report.unsupported.length : 0));
  const syncLabel = { saved: tr("Synchronisé avec la source", "Synced with the source"), pending: tr("Modification…", "Editing…"), sending: tr("Synchronisation…", "Syncing…"), conflict: tr("Conflit avec la source", "Conflict with the source"), readonly: tr("Lecture seule", "Read-only") }[sync];
  const checking = pane === "check" && rightOpen;
  return (
    <footer className="statusbar" data-testid="statusbar">
      <button type="button" className={`status-btn${leftOpen ? " is-active" : ""}`} aria-pressed={leftOpen} title={tr("Volet de navigation", "Navigation pane")} onClick={() => studio.set({ leftOpen: !leftOpen })}><Icon name="panel" size={14} /></button>
      <span className="status-item" data-testid="page-status">{pageView && pages ? tr(`Page ${current} sur ${pages}`, `Page ${current} of ${pages}`) : tr("Mode continu", "Continuous view")}</span>
      {pageView && pages > 0 && <span className="status-item">{tr(`Section ${section}`, `Section ${section}`)}</span>}
      <span className="status-item">{words.toLocaleString()} {words > 1 ? tr("mots", "words") : tr("mot", "word")}</span>
      <span className={`status-item sync${sync === "pending" || sync === "sending" ? " is-pending" : ""}${sync === "conflict" ? " is-conflict" : ""}`}>
        <span className="sync-dot" aria-hidden />
        <span data-testid="sync-state">{syncLabel}</span>
      </span>
      <button type="button" className={`status-btn diag-count${issues ? " has-warnings" : " is-clean"}${checking ? " is-active" : ""}`} data-testid="diag-count" onClick={() => studio.set(checking ? { pane: "format" } : { pane: "check", rightOpen: true })}>
        <Icon name={issues ? "warn" : "check"} size={13} />
        {issues ? tr(`${issues} point(s) à vérifier`, `${issues} issue(s)`) : tr("Aucun problème", "No issues")}
      </button>
      <span className="grow" />
      <button type="button" className={`status-btn${rightOpen ? " is-active" : ""}`} aria-pressed={rightOpen} onClick={() => studio.set({ rightOpen: !rightOpen })}><Icon name="brush" size={14} /> {tr("Inspecteur", "Inspector")}</button>
      <span className="sep" />
      <div className="zoom" role="group" aria-label="Zoom">
        <button type="button" className="status-btn" aria-label={tr("Zoom arrière", "Zoom out")} onClick={() => setZoom(zoom / 1.1, true)}><Icon name="zoomOut" size={14} /></button>
        <input type="range" min={25} max={300} step={1} value={Math.round(zoom * 100)} aria-label={tr("Niveau de zoom", "Zoom level")} onChange={(e) => setZoom(Number(e.target.value) / 100, true)} />
        <button type="button" className="status-btn" aria-label={tr("Zoom avant", "Zoom in")} onClick={() => setZoom(zoom * 1.1, true)}><Icon name="zoomIn" size={14} /></button>
        <button type="button" className="status-btn zoom-value" data-testid="zoom-value" title={tr("100 %", "100%")} onClick={() => setZoom(1, true)}>{Math.round(zoom * 100)} %</button>
        <button type="button" className="status-btn" aria-label={tr("Largeur de page", "Page width")} title={tr("Largeur de page", "Page width")} onClick={() => manualFit("width")}><Icon name="fitWidth" size={14} /></button>
        <button type="button" className="status-btn" aria-label={tr("Page entière", "Whole page")} title={tr("Page entière", "Whole page")} onClick={() => manualFit("page")}><Icon name="fit" size={14} /></button>
      </div>
    </footer>
  );
}

function Notices() {
  const notices = useStudio((s) => s.notices);
  return (
    <div className="notices" aria-live="polite">
      {notices.map((n) => (
        <div key={n.id} className={`notice notice-${n.level}`} role={n.level === "error" ? "alert" : "status"}>
          <span>{n.message}</span>
          {n.recovery && (
            <button type="button" className="btn" onClick={() => void navigator.clipboard?.writeText(n.recovery!)}>{tr("Copier ma version", "Copy my version")}</button>
          )}
          <button type="button" className="ibtn" aria-label={tr("Fermer", "Close")} onClick={() => dismissNotice(n.id)}><Icon name="close" /></button>
        </div>
      ))}
    </div>
  );
}

/** Reminder of the master editing mode and its scope, with a way out (Slides Studio's banner). */
function MasterBanner() {
  const master = useStudio((s) => s.masterEdit);
  if (!master) return null;
  return (
    <div className="master-banner" role="status" data-testid="master-banner">
      <Icon name="masterEdit" />
      <span>{tr("Modification du masque", "Editing the master")} <code>{master.name}</code> — {tr("tous les documents qui l’utilisent sont modifiés.", "every document using it changes.")}</span>
      <span className="grow" />
      <button type="button" className="btn" onClick={() => void exitMasterEdit(false)}>{tr("Abandonner", "Discard")}</button>
      <button type="button" className="btn btn-primary" data-testid="close-master-edit" onClick={() => void exitMasterEdit(true)}>{tr("Terminer", "Done")}</button>
    </div>
  );
}

export function Shell({ editor, readonly, onSource, children }: { editor: Editor; readonly: boolean; onSource: () => void; children: React.ReactNode }) {
  const leftOpen = useStudio((s) => s.leftOpen);
  const rightOpen = useStudio((s) => s.rightOpen);
  const masterEdit = useStudio((s) => !!s.masterEdit);
  // Narrow panels: start with the side panes closed (Slides Studio collapses the same way).
  useEffect(() => {
    if (window.innerWidth < 900) studio.set({ leftOpen: false });
    if (window.innerWidth < 700) studio.set({ rightOpen: false });
  }, []);
  // Chrome buttons never take the focus: the text selection, an object's text or a table cell
  // being edited stays active (and visible) while ribbon tabs, menus and tools are used.
  useEffect(() => {
    const keep = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest?.(".ribbon-wrap, .menu, .statusbar, .inspector, .master-banner")) return;
      if (t.closest("input, textarea, select, [contenteditable='true'], [draggable='true']")) return;
      e.preventDefault();
    };
    document.addEventListener("mousedown", keep, true);
    return () => document.removeEventListener("mousedown", keep, true);
  }, []);
  return (
    <div className={`app ms-studio${leftOpen ? "" : " no-nav"}${rightOpen ? "" : " no-inspector"}${masterEdit ? " is-master-edit" : ""}`}>
      <Ribbon editor={editor} readonly={readonly} onSource={onSource} />
      <div className="workspace">
        {leftOpen && <NavPanel editor={editor} />}
        <main className="center" aria-label={tr("Document", "Document")}>
          <div className="canvas-area">
            {children}
            <MasterBanner />
            <Notices />
          </div>
        </main>
        {rightOpen && <Inspector editor={editor} readonly={readonly} />}
      </div>
      <StatusBar />
      <ContextMenu editor={editor} />
    </div>
  );
}
