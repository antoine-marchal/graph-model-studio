import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { toPng } from 'html-to-image';
import { PPI, SlideView } from '@corporate-slides/renderer';
import type { CorporateMaster, Diagnostic, HostMessage, SlideDocument, SlideElement } from '@corporate-slides/core';
import { onHostMessage, post } from './host';
import { useEditor } from './store';
import { Canvas } from './Canvas';
import { Inspector, Navigator, NotesPane, StatusBar } from './Panels';
import { MasterBrowser } from './MasterBrowser';
import { Ribbon } from './Ribbon';
import { GmcDialog } from './GmcDialog';
import { GmcEditor } from './GmcEditor';
import { anchorOf } from './Review';
import { installClipboard, pasteHostText, pastePowerPointElements, pastePowerPointFallback } from './clipboard';
import { Icon } from './icons';
import { ContextMenu } from './ContextMenu';
import { Presentation, startSlideShow } from './Presentation';
import { tr } from '@corporate-slides/core';

export function App({ mode }: { mode: 'editor' | 'masters' }) {
  const [masters, setMasters] = useState<Extract<HostMessage, { type: 'masters' }> | null>(null);

  // Pointer handlers (canvas drags…) often preventDefault, which keeps the focus in a panel field:
  // any press outside the focused field blurs it, so its edit is committed without Enter.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const a = document.activeElement;
      if (!(a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement)) return;
      if (!(a.closest('.numfield') ?? a).contains(e.target as Node)) a.blur();
    };
    document.addEventListener('pointerdown', onDown, true);
    // Layout designer: undo / redo are the designer's own (VS Code's would undo the presentation).
    const onKey = (e: KeyboardEvent) => {
      const st = useEditor.getState();
      if (!st.design || !(e.ctrlKey || e.metaKey) || st.editingId) return;
      const k = e.key.toLowerCase();
      if (k !== 'z' && k !== 'y') return;
      if ((e.target as HTMLElement).closest?.('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      st.designUndo(k === 'y' || e.shiftKey);
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, []);

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
          st.reject(m.txId, m.conflict ? tr(`Conflit : la source a changé pendant l'édition. ${m.reason}`, `Conflict: the source changed while editing. ${m.reason}`) : m.reason);
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
        case 'pasteElements':
          pastePowerPointElements(m.elements as SlideElement[], m.warnings);
          break;
        case 'pasteFallback':
          pastePowerPointFallback();
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
        case 'requestThumbnail':
          void sendThumbnail();
          break;
      }
    });
    post({ type: 'ready' });
    // Keep the other side of a diff view on the same slide.
    const offSync = useEditor.subscribe((s, prev) => s.slideId && s.slideId !== prev.slideId && post({ type: 'slideShown', slideId: s.slideId }));
    const offClipboard = installClipboard();
    // F5: slide show from the beginning, Shift+F5: from the current slide (as in PowerPoint).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F5' || useEditor.getState().presenting || !useEditor.getState().doc) return;
      e.preventDefault();
      startSlideShow(e.shiftKey);
    };
    window.addEventListener('keydown', onKey);
    return () => (off(), offClipboard(), offSync(), window.removeEventListener('keydown', onKey));
  }, []);

  if (mode === 'masters') return masters ? <MasterBrowser data={masters} /> : <div className="loading">{tr('Chargement des masques…', 'Loading masters…')}</div>;
  return <Editor />;
}

/**
 * First visible slide rendered off screen at 1 px per slide pixel (1280 px wide for 16:9) and
 * sent as PNG: the host writes it next to the deck for Markdown Studio deck blocks.
 */
async function sendThumbnail() {
  const st = useEditor.getState();
  // The layout designer swaps in a virtual slide: the deck itself is kept in `design.real`.
  const { doc, master } = st.design?.real ?? st;
  const { assetUrls } = st;
  const slide = doc?.slides.find((s) => !s.hidden) ?? doc?.slides[0];
  if (!doc || !master || !slide) return;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    const assets = { masterAsset: (id: string) => assetUrls[`master:${id}`] ?? null, image: (src: string) => assetUrls[`image:${src}`] ?? null };
    root.render(<SlideView slide={slide} master={master} assets={assets} metadata={doc.metadata} slideNumber={1} />);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await Promise.all([...host.querySelectorAll('img')].map((img) => img.decode().catch(() => undefined)));
    await document.fonts.ready;
    const target = host.firstElementChild as HTMLElement | null;
    if (!target) return;
    const url = await toPng(target, { width: master.dimensions.width * PPI, height: master.dimensions.height * PPI, pixelRatio: 1, cacheBust: true });
    post({ type: 'thumbnail', data: url.slice(url.indexOf(',') + 1) });
  } catch (e) {
    console.warn('thumbnail failed', e);
  } finally {
    root.unmount();
    host.remove();
  }
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
  const readOnly = useEditor((s) => s.readOnly);
  const pane = useEditor((s) => s.pane);
  if (!ready) return <div className="loading">{tr('Chargement de la présentation…', 'Loading the presentation…')}</div>;
  if (!master) {
    return (
      <div className="empty-state">
        <h1>{tr('Aucun masque corporate importé', 'No corporate master imported')}</h1>
        <p>{tr('Importez le gabarit PowerPoint de l\'entreprise pour afficher et éditer les diapositives avec ses dispositions.', 'Import your company\'s PowerPoint template to show and edit slides with its layouts.')}</p>
        <p className="hint">{tr('Palette de commandes :', 'Command palette:')} <code>{tr('Corporate Slides: Importer un gabarit PowerPoint', 'Corporate Slides: Import a PowerPoint Template')}</code></p>
      </div>
    );
  }
  return (
    <div className={`app${readOnly && pane !== 'comments' ? ' no-inspector' : ''}`}>
      <Ribbon />
      {parseErrors.length > 0 && (
        <div className="banner banner-error" role="alert">
          <Icon name="warn" />
          <span>
            {tr('La source contient', 'The source contains')} {parseErrors.length} {parseErrors.length > 1 ? tr('erreurs', 'errors') : tr('erreur', 'error')} : {parseErrors[0]}
            {doc?.slides.length ? tr(' — l’aperçu montre la dernière partie lisible.', ' — the preview shows the last readable part.') : ''}
          </span>
        </div>
      )}
      <div className="workspace">
        <Navigator />
        <main className={`center${notesOpen ? ' with-notes' : ''}`}>
          <div className="canvas-area">
            <Canvas />
            <MasterBanner />
            <Notices />
            <Reference />
          </div>
          {notesOpen && <NotesPane />}
        </main>
        {(!readOnly || pane === 'comments') && <Inspector />}
      </div>
      <StatusBar />
      <GmcDialog />
      <GmcEditor />
      <ContextMenu />
      <Presentation />
    </div>
  );
}

/** Reminder of the master editing mode and its scope, with a way out. */
function MasterBanner() {
  const mode = useEditor((s) => s.masterEdit);
  const design = useEditor((s) => s.design);
  if (!mode) return null;
  if (design)
    return (
      <div className="master-banner" role="status" data-testid="master-banner">
        <Icon name="masterEdit" />
        <span>
          {tr('Conception de la disposition', 'Designing layout')} <code>{design.base.name}</code> — {tr('toutes les diapositives qui l’utilisent sont modifiées.', 'every slide using it changes.')}
        </span>
        <span className="grow" />
        <button type="button" className="btn" data-testid="close-master-edit" onClick={() => useEditor.getState().exitDesign()}>{tr('Fermer le mode masque', 'Close master view')}</button>
      </div>
    );
  return (
    <div className="master-banner" role="status" data-testid="master-banner">
      <Icon name="masterEdit" />
      <span>
        {mode === 'all'
          ? tr('Modification du masque — toutes les diapositives utilisant ce masque sont modifiées.', 'Editing the master — every slide using this master changes.')
          : tr('Modification du masque — pour cette diapositive uniquement.', 'Editing the master — for this slide only.')}
      </span>
      <span className="grow" />
      <button type="button" className="btn" data-testid="close-master-edit" onClick={() => useEditor.getState().set({ masterEdit: null, masterSel: null })}>{tr('Fermer le mode masque', 'Close master view')}</button>
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
          <button className="ibtn" aria-label={tr("Fermer", "Close")} onClick={() => dismiss(n.id)}>
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
    <div className="reference" role="dialog" aria-label={tr("Rendu de référence", "Reference rendering")}>
      <header>
        <strong>{tr('Rendu de référence — diapositive', 'Reference rendering — slide')} {ref.slideIndex + 1}</strong>
        <span className="grow" />
        <button className="ibtn" aria-label={tr("Fermer", "Close")} onClick={() => setReference(null)}>
          <Icon name="close" />
        </button>
      </header>
      {ref.url ? <img src={ref.url} alt={tr(`Rendu PowerPoint de la diapositive ${ref.slideIndex + 1}`, `PowerPoint rendering of slide ${ref.slideIndex + 1}`)} /> : <p className="hint">{ref.message ?? tr('Rendu en cours…', 'Rendering…')}</p>}
    </div>
  );
}
