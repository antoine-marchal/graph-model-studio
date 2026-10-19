import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReviewThread, SlideDocument } from '@corporate-slides/core';
import { Icon } from './icons';
import { post } from './host';
import { currentSlide, useEditor } from './store';
import { diffDocs, type DocDiff } from './diff';
import { tr } from '@corporate-slides/core';

export interface Anchor {
  thread: ReviewThread;
  /** 1-based display number, in document order. */
  n: number;
  slideId: string | null;
  elementId?: string;
}

/** Map a review thread's source line to the slide and (narrowest) element defined there. */
export function anchorOf(doc: SlideDocument, line: number): { slideId: string | null; elementId?: string } {
  for (const s of doc.slides) {
    if (!s.source || line < s.source.startLine || line > s.source.endLine) continue;
    const hits = s.elements.filter((e) => e.source && e.source.startLine <= line && line <= e.source.endLine);
    hits.sort((a, b) => a.source!.endLine - a.source!.startLine - (b.source!.endLine - b.source!.startLine));
    return { slideId: s.id, elementId: hits[0]?.id };
  }
  return { slideId: null };
}

export function useAnchors(): Anchor[] {
  const doc = useEditor((s) => s.confirmed);
  const data = useEditor((s) => s.reviewData);
  return useMemo(() => {
    if (!doc || !data) return [];
    return [...data.threads].sort((a, b) => a.line - b.line).map((thread, i) => ({ thread, n: i + 1, ...anchorOf(doc, thread.line) }));
  }, [doc, data]);
}

export function useDiff(): DocDiff | null {
  const base = useEditor((s) => s.diff.doc);
  const doc = useEditor((s) => s.doc);
  return useMemo(() => (base && doc ? diffDocs(base, doc) : null), [base, doc]);
}

let requestId = 0;
export function sendReview(action: 'load' | 'create' | 'reply' | 'resolve', fields: { line?: number; text?: string; discussionId?: string; resolved?: boolean } = {}) {
  useEditor.getState().set({ reviewError: '' });
  post({ type: 'review', action, requestId: ++requestId, ...fields });
}

const when = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

function Composer({ placeholder, submit, onCancel, autoFocus, testId }: { placeholder: string; submit: (text: string) => void; onCancel?: () => void; autoFocus?: boolean; testId?: string }) {
  const [text, setText] = useState('');
  const send = () => text.trim() && (submit(text.trim()), setText(''));
  return (
    <div className="composer">
      <textarea
        className="textarea"
        rows={2}
        value={text}
        placeholder={placeholder}
        autoFocus={autoFocus}
        data-testid={testId}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send();
          if (e.key === 'Escape') onCancel?.();
        }}
      />
      <div className="composer-actions">
        <span className="hint">{tr('Ctrl+Entrée pour publier', 'Ctrl+Enter to post')}</span>
        <span className="grow" />
        {onCancel && <button className="btn" onClick={onCancel}>{tr('Annuler', 'Cancel')}</button>}
        <button className="btn btn-primary" disabled={!text.trim()} onClick={send}>{tr('Publier', 'Post')}</button>
      </div>
    </div>
  );
}

function ThreadCard({ a, focused }: { a: Anchor; focused: boolean }) {
  const doc = useEditor((s) => s.doc);
  const canComment = useEditor((s) => !!s.reviewData?.canComment);
  const { select, set } = useEditor.getState();
  const ref = useRef<HTMLElement>(null);
  const [replying, setReplying] = useState(false);
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focused]);
  const slideIndex = doc?.slides.findIndex((s) => s.id === a.slideId) ?? -1;
  const t = a.thread;
  return (
    <article ref={ref} className={`thread${focused ? ' is-focused' : ''}${t.resolved ? ' is-resolved' : ''}`} data-testid={`thread-${t.id}`}>
      <button
        className="thread-anchor"
        onClick={() => {
          if (a.slideId) select(a.slideId, a.elementId ? [a.elementId] : []);
          set({ focusThread: t.id });
        }}
      >
        <span className="pin-num">{a.n}</span>
        <span className="thread-where">
          {slideIndex >= 0 ? tr(`Diapositive ${slideIndex + 1}`, `Slide ${slideIndex + 1}`) : tr('En-tête du document', 'Document header')}
          {a.elementId && <code> · {a.elementId}</code>}
        </span>
        <span className="hint">{tr('ligne', 'line')} {t.line}</span>
      </button>
      {t.notes.map((n) => (
        <div key={n.id} className="note">
          <header>
            <strong>{n.author.replace(/\s*\(@.*\)$/, '')}</strong>
            <span className="hint">{when(n.created)}</span>
          </header>
          <p>{n.body}</p>
        </div>
      ))}
      <footer className="thread-actions">
        {t.resolvable && (
          <button className="btn" onClick={() => sendReview('resolve', { discussionId: t.id, resolved: !t.resolved })}>
            <Icon name={t.resolved ? 'refresh' : 'check'} /> {t.resolved ? tr('Rouvrir', 'Reopen') : tr('Résoudre', 'Resolve')}
          </button>
        )}
        {canComment && !replying && (
          <button className="btn" onClick={() => setReplying(true)}>{tr('Répondre', 'Reply')}</button>
        )}
      </footer>
      {replying && <Composer placeholder={tr("Répondre…", "Reply…")} autoFocus submit={(text) => (sendReview('reply', { discussionId: t.id, text }), setReplying(false))} onCancel={() => setReplying(false)} />}
    </article>
  );
}

/** Right-hand comments pane: GitLab discussions of the merge request, anchored to slides and elements. */
export function CommentsPane() {
  const review = useEditor((s) => s.review);
  const data = useEditor((s) => s.reviewData);
  const error = useEditor((s) => s.reviewError);
  const focus = useEditor((s) => s.focusThread);
  const slide = useEditor(currentSlide);
  const selected = useEditor((s) => s.selected);
  const anchors = useAnchors();
  const [composing, setComposing] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const { set } = useEditor.getState();
  const target = slide && (selected.length === 1 ? slide.elements.find((e) => e.id === selected[0]) : undefined);
  const line = target?.source?.startLine ?? slide?.source?.startLine;
  const shown = anchors.filter((a) => !onlyOpen || !a.thread.resolved);
  const open = anchors.filter((a) => !a.thread.resolved).length;

  return (
    <aside className="inspector comments-pane" aria-label={tr("Commentaires", "Comments")}>
      <div className="insp-head">
        <span className="insp-kind">{tr('Commentaires', 'Comments')}</span>
        {review && <code className="insp-id">{review.mr} · {review.side === 'new' ? tr('modifié', 'edited') : 'base'}</code>}
        <span className="grow" />
        {review && <button className="ibtn" title={tr("Actualiser", "Refresh")} aria-label={tr("Actualiser les commentaires", "Refresh comments")} onClick={() => sendReview('load')}><Icon name="refresh" /></button>}
        <button className="ibtn" title={tr("Fermer", "Close")} aria-label={tr("Fermer le volet", "Close the pane")} onClick={() => set({ pane: 'format' })}><Icon name="close" /></button>
      </div>
      {!review ? (
        <div className="pane-empty">
          <Icon name="comment" size={20} />
          <p>{tr('Les discussions GitLab de la merge request s’affichent ici, aussi sur ce fichier local, dès que sa version a été ouverte une fois depuis la liste des modifications de la merge request (extension Project Integration).', 'The merge request’s GitLab discussions show here, on this local file too, once its version was opened from the merge request changes list (Project Integration extension).')}</p>
        </div>
      ) : (
        <div className="threads">
          {error && <p className="pane-error" role="alert">{error}</p>}
          {data?.notice && <p className="pane-notice" role="status">{data.notice}</p>}
          {data?.canCreate && (composing ? (
            <div className="thread is-draft">
              <p className="hint">{tr('Sur', 'On')} {target ? <code>{target.id}</code> : tr('la diapositive', 'the slide')} · {tr('ligne', 'line')} {line ?? 1}</p>
              <Composer placeholder={tr("Nouveau commentaire (Markdown)…", "New comment (Markdown)…")} autoFocus testId="new-comment" submit={(text) => (sendReview('create', { line: line ?? 1, text }), setComposing(false))} onCancel={() => setComposing(false)} />
            </div>
          ) : (
            <button className="btn btn-block" onClick={() => setComposing(true)} disabled={!line}>
              <Icon name="commentPlus" /> {tr('Commenter', 'Comment on')} {target ? tr(`« ${target.id} »`, `“${target.id}”`) : tr('cette diapositive', 'this slide')}
            </button>
          ))}
          <div className="threads-filter">
            <span className="hint">{open} {open > 1 ? tr('ouvertes', 'open') : tr('ouverte', 'open')} · {anchors.length - open} {anchors.length - open > 1 ? tr('résolues', 'resolved') : tr('résolue', 'resolved')}</span>
            <span className="grow" />
            <label className="check"><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> {tr('Ouvertes seulement', 'Open only')}</label>
          </div>
          {!data && !error && <p className="hint">{tr('Chargement des discussions…', 'Loading discussions…')}</p>}
          {data && shown.length === 0 && <p className="hint">{tr('Aucune discussion sur ce fichier.', 'No discussion on this file.')}</p>}
          {shown.map((a) => <ThreadCard key={a.thread.id} a={a} focused={focus === a.thread.id} />)}
        </div>
      )}
    </aside>
  );
}
