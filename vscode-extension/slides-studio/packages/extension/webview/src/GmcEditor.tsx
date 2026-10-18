import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { HostMessage } from '@corporate-slides/core';
import { onHostMessage, post } from './host';
import { useEditor } from './store';
import { Icon } from './icons';
import { tr } from '@corporate-slides/core';

/*
 * Graph Model Studio's interactive editor in a modal over the slide (same approach as its
 * Markdown Studio embed). It is a webview app: VS Code's resource service worker only serves the
 * webview document itself, so its bundle is fetched and inlined into a srcdoc frame whose
 * `acquireVsCodeApi` shim relays messages to us. Edits are written to the .gmc file as you go;
 * closing re-renders the PNG shown on the slide.
 */
const FRAME_SHIM =
  "(function(){var s;var send=function(m){parent.postMessage({__gmcFrame:m},'*')};" +
  'window.acquireVsCodeApi=function(){return{postMessage:send,getState:function(){return s},setState:function(v){s=v}}};' +
  "window.addEventListener('error',function(e){send({type:'frameError',message:String((e.error&&e.error.message)||e.message||'load error')})});" +
  "window.addEventListener('unhandledrejection',function(e){send({type:'frameError',message:String((e.reason&&e.reason.message)||e.reason)})});" +
  "document.addEventListener('keydown',function(e){if(e.key==='Escape'){send({type:'escape'})}},true);})();";

type EditorInfo = Extract<HostMessage, { type: 'gmcEditor' }>;

const bundles = new Map<string, Promise<{ js: string; css: string }>>();
function loadBundle(js: string, css: string) {
  let p = bundles.get(js);
  if (!p) {
    const text = (url: string) => fetch(url).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status} : ${url.split('/').pop()}`))));
    p = Promise.all([text(js), text(css)]).then(([j, c]) => ({ js: j, css: c }));
    p.catch(() => bundles.delete(js));
    bundles.set(js, p);
  }
  return p;
}

function srcdoc(files: { js: string; css: string }, base: string): string {
  const nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce ?? '';
  return (
    `<!doctype html><html><head><meta charset="utf-8"><base href="${base}">` +
    `<style>${files.css.replace(/<\/style/gi, '<\\/style')}</style><style>html,body,#root{height:100%;margin:0}</style>` +
    `<script nonce="${nonce}">${FRAME_SHIM}</script></head>` +
    `<body><div id="root"></div><script nonce="${nonce}" type="module">${files.js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`
  );
}

export function GmcEditor() {
  const src = useEditor((s) => s.gmcEdit);
  return src ? <GmcModal key={src} src={src} /> : null;
}

function GmcModal({ src }: { src: string }) {
  const { set } = useEditor.getState();
  const readOnly = useEditor((s) => s.readOnly);
  const frame = useRef<HTMLIFrameElement>(null);
  const [info, setInfo] = useState<EditorInfo | null>(null);
  const [doc, setDoc] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const changed = useRef(false);
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; source: string } | null>(null);

  const flush = () => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    post({ type: 'gmcWrite', src, source: p.source });
  };
  const close = () => {
    flush();
    post({ type: 'gmcClose', src, changed: changed.current });
    set({ gmcEdit: null });
  };
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    post({ type: 'gmcOpen', src });
    return onHostMessage((m) => {
      if (m.type !== 'gmcEditor' || m.src !== src) return;
      if (m.error || !m.editorJs || !m.editorCss) return setError(m.error ?? tr('Éditeur indisponible.', 'Editor unavailable.'));
      setInfo(m);
      loadBundle(m.editorJs, m.editorCss).then(
        (files) => setDoc(srcdoc(files, m.editorJs!.replace(/[^/]*$/, ''))),
        (e) => setError((e as Error).message),
      );
    });
  }, [src]);

  useEffect(() => {
    if (ready || error) return;
    const t = setTimeout(() => setError((e) => e || tr("L'éditeur de diagramme n'a pas démarré.", "The diagram editor did not start.")), 10_000);
    return () => clearTimeout(t);
  }, [ready, error]);

  useEffect(() => {
    if (!info) return;
    const send = (m: unknown) => frame.current?.contentWindow?.postMessage(m, '*');
    const receive = (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return;
      const m = (e.data as { __gmcFrame?: { type: string; source?: string; message?: string } })?.__gmcFrame;
      if (!m) return;
      if (m.type === 'frameError') setError((x) => x || String(m.message));
      else if (m.type === 'escape') closeRef.current();
      else if (m.type === 'ready') {
        setReady(true);
        setError('');
        const theme = document.body.classList.contains('vscode-light') ? 'light' : 'dark';
        send({ type: 'render', renderId: 'slides', editable: !readOnly, version: info.version, source: info.source, name: info.name, theme, target: { uri: 'corporate-slides', kind: 'file' } });
      } else if (m.type === 'sourceChanged' && typeof m.source === 'string' && !readOnly) {
        changed.current = true;
        if (pending.current) clearTimeout(pending.current.timer);
        const source = m.source;
        pending.current = { source, timer: setTimeout(flush, 400) };
      }
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    window.addEventListener('message', receive);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('message', receive);
      window.removeEventListener('keydown', key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info, readOnly]);

  return createPortal(
    <div className="gmc-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="gmc-modal" role="dialog" aria-label={tr(`Diagramme ${src}`, `Diagram ${src}`)} data-testid="gmc-editor">
        <header className="gmc-modal-head">
          <span className="chip">GMC</span>
          <strong>{info?.name ?? src}</strong>
          <span className="hint">{readOnly ? tr('Lecture seule', 'Read-only') : tr('Les modifications sont enregistrées dans le fichier .gmc ; le rendu de la diapositive est actualisé à la fermeture.', 'Changes are saved to the .gmc file; the slide rendering refreshes on close.')}</span>
          <span className="grow" />
          <button type="button" className="ibtn has-label" title={tr("Ouvrir Graph Model Studio dans un onglet à côté", "Open Graph Model Studio in a tab to the side")} onClick={() => (close(), post({ type: 'editGmc', src }))}>
            <Icon name="external" /> {tr('À côté', 'To the side')}
          </button>
          <button type="button" className="ibtn" aria-label={tr("Fermer (Échap)", "Close (Esc)")} title={tr("Fermer (Échap)", "Close (Esc)")} onClick={close} data-testid="gmc-close">
            <Icon name="close" />
          </button>
        </header>
        {error && !ready && (
          <div className="gmc-modal-error" role="alert">
            {error}
            <button type="button" className="btn" onClick={() => (close(), post({ type: 'editGmc', src }))}>{tr('Ouvrir à côté', 'Open to the side')}</button>
          </div>
        )}
        {doc ? <iframe ref={frame} className="gmc-modal-frame" srcDoc={doc} title="Graph Model Studio" /> : !error && <p className="gmc-modal-loading">{tr('Chargement de l\'éditeur de diagramme…', 'Loading the diagram editor…')}</p>}
      </div>
    </div>,
    document.body,
  );
}
