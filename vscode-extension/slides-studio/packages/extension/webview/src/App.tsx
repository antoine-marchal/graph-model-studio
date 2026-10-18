import { useEffect, useState } from 'react';
import type { CorporateMaster, Diagnostic, HostMessage, SlideDocument } from '@corporate-slides/core';
import { onHostMessage, post } from './host';
import { useEditor } from './store';
import { Canvas } from './Canvas';
import { Inspector, Navigator, NotesPane, StatusBar } from './Panels';
import { MasterBrowser } from './MasterBrowser';
import { Ribbon } from './Ribbon';
import { GmcDialog } from './GmcDialog';
import { GmcEditor } from './GmcEditor';
import { anchorOf } from './Review';
import { installClipboard, pasteHostText } from './clipboard';
import { Icon } from './icons';

export function App({ mode }: { mode: 'editor' | 'masters' }) {
  const [masters, setMasters] = useState<Extract<HostMessage, { type: 'masters' }> | null>(null);

  useEffect(() => {
    const off = onHostMessage((m) => {
      const st = useEditor.getState();
      switch (m.type) {
        case 'document':
          st.setDocument({
            version: m.version,
            fileName: m.fileName,
            sourceKind: m.sourceKind,
            doc: m.doc as SlideDocument,
            master: m.master as CorporateMaster | null,
            assetUrls: m.assetUrls,
            diagnostics: m.diagnostics as Diagnostic[],
            parseErrors: m.parseErrors,
            readOnly: !!m.readOnly,
            review: m.review ?? null,
          });
          break;
        case 'ack':
          st.ack(m.txId, m.version);
          break;
        case 'rejected':
          st.reject(m.txId, m.conflict ? `Conflit : la source a changé pendant l'édition. ${m.reason}` : m.reason);
          break;
        case 'select':
          st.select(m.slideId, m.elementId ? [m.elementId] : []);
          break;
        case 'gmcEdit':
          st.set({ gmcEdit: m.src });
          break;
        case 'clipboard':
          pasteHostText(m.text);
          break;
        case 'notice':
          st.notify(m.level, m.message);
          break;
        case 'reference':
          st.setReference(m);
          break;
        case 'masters':
          setMasters(m);
          break;
        case 'diffBase':
          // A merge request revision opens with its changes visible; local files keep them on demand.
          st.set({ diff: { base: m.base, label: m.label, doc: m.doc as SlideDocument | null, available: m.available, error: m.error }, showDiff: m.doc ? st.showDiff || m.base === 'mr' : false, showBase: m.doc ? st.showBase : false, ghostSlideId: null });
          if (m.error && m.base !== 'none') st.notify('warning', m.error);
          break;
        case 'review':
          if (m.error) st.set({ reviewError: m.error });
          else if (m.data) {
            st.set({ reviewData: m.data, reviewError: '' });
            if (m.data.focus) focusNote(m.data.focus.noteId);
          }
          break;
        case 'revealReviewComment':
          focusNote(m.noteId);
          break;
      }
    });
    post({ type: 'ready' });
    const offClipboard = installClipboard();
    return () => (off(), offClipboard());
  }, []);

  if (mode === 'masters') return masters ? <MasterBrowser data={masters} /> : <div className="loading">Chargement des masques…</div>;
  return <Editor />;
}

/** Bring a review note into view: its slide, its element and the comments pane. */
function focusNote(noteId: number) {
  const st = useEditor.getState();
  const t = st.reviewData?.threads.find((x) => x.notes.some((n) => n.id === noteId));
  if (!t || !st.confirmed) return;
  const a = anchorOf(st.confirmed, t.line);
  if (a.slideId) st.select(a.slideId, a.elementId ? [a.elementId] : []);
  st.set({ focusThread: t.id, pane: 'comments', tab: 'review' });
}

function Editor() {
  const ready = useEditor((s) => s.ready);
  const master = useEditor((s) => s.master);
  const parseErrors = useEditor((s) => s.parseErrors);
  const doc = useEditor((s) => s.doc);
  const notesOpen = useEditor((s) => s.notesOpen);
  if (!ready) return <div className="loading">Chargement de la présentation…</div>;
  if (!master) {
    return (
      <div className="empty-state">
        <h1>Aucun masque corporate importé</h1>
        <p>Importez le gabarit PowerPoint de l'entreprise pour afficher et éditer les diapositives avec ses dispositions.</p>
        <p className="hint">Palette de commandes : <code>Corporate Slides: Importer un gabarit PowerPoint</code></p>
      </div>
    );
  }
  return (
    <div className="app">
      <Ribbon />
      {parseErrors.length > 0 && (
        <div className="banner banner-error" role="alert">
          <Icon name="warn" />
          <span>
            La source contient {parseErrors.length} erreur{parseErrors.length > 1 ? 's' : ''} : {parseErrors[0]}
            {doc?.slides.length ? ' — l’aperçu montre la dernière partie lisible.' : ''}
          </span>
        </div>
      )}
      <div className="workspace">
        <Navigator />
        <main className={`center${notesOpen ? ' with-notes' : ''}`}>
          <div className="canvas-area">
            <Canvas />
            <Notices />
            <Reference />
          </div>
          {notesOpen && <NotesPane />}
        </main>
        <Inspector />
      </div>
      <StatusBar />
      <GmcDialog />
      <GmcEditor />
    </div>
  );
}

function Notices() {
  const notices = useEditor((s) => s.notices);
  const dismiss = useEditor((s) => s.dismiss);
  return (
    <div className="notices" aria-live="polite">
      {notices.map((n) => (
        <div key={n.id} className={`notice notice-${n.level}`} role={n.level === 'error' ? 'alert' : 'status'}>
          <span>{n.message}</span>
          <button className="ibtn" aria-label="Fermer" onClick={() => dismiss(n.id)}>
            <Icon name="close" />
          </button>
        </div>
      ))}
    </div>
  );
}

function Reference() {
  const ref = useEditor((s) => s.reference);
  const setReference = useEditor((s) => s.setReference);
  if (!ref) return null;
  return (
    <div className="reference" role="dialog" aria-label="Rendu de référence">
      <header>
        <strong>Rendu de référence — diapositive {ref.slideIndex + 1}</strong>
        <span className="grow" />
        <button className="ibtn" aria-label="Fermer" onClick={() => setReference(null)}>
          <Icon name="close" />
        </button>
      </header>
      {ref.url ? <img src={ref.url} alt={`Rendu PowerPoint de la diapositive ${ref.slideIndex + 1}`} /> : <p className="hint">{ref.message ?? 'Rendu en cours…'}</p>}
    </div>
  );
}
