/*
 * Graph Model Studio's interactive editor, maximized over the webview. Shared by Markdown Studio
 * and Slides Studio (framework-free: each studio has its own React copy and build).
 *
 * The graph editor is a webview app. VS Code's resource service worker only serves the webview
 * document itself (an `about:srcdoc` frame has no webview of its own), so its JS / CSS are fetched
 * and inlined into a srcdoc frame whose `acquireVsCodeApi` shim relays messages to the parent.
 * `<base>` keeps the app's relative asset URLs well-formed. What the edits are written to (a fence,
 * a linked file, a slide's diagram) is the caller's business: this shell only runs the session.
 */

const FRAME_SHIM =
  "(function(){var s;var send=function(m){parent.postMessage({__gmcFrame:m},'*')};" +
  'window.acquireVsCodeApi=function(){return{postMessage:send,getState:function(){return s},setState:function(v){s=v}}};' +
  "window.addEventListener('error',function(e){send({type:'frameError',message:String((e.error&&e.error.message)||e.message||'load error')})});" +
  "window.addEventListener('unhandledrejection',function(e){send({type:'frameError',message:String((e.reason&&e.reason.message)||e.reason)})});" +
  "document.addEventListener('securitypolicyviolation',function(e){send({type:'frameError',message:'Blocked by CSP: '+e.blockedURI+' ('+e.violatedDirective+')'})});" +
  "document.addEventListener('keydown',function(e){if(e.key==='Escape'){send({type:'escape'})}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();send({type:'saveShortcut'})}},true);})();";

const bundles = new Map<string, Promise<{ js: string; css: string }>>();
/** The editor's JS / CSS, fetched once (concurrent opens share the request; a failure is retried next time). */
export function loadEditorBundle(js: string, css: string): Promise<{ js: string; css: string }> {
  let p = bundles.get(js);
  if (!p) {
    const text = (url: string) => fetch(url).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status} loading ${url.split('/').pop()}`))));
    p = Promise.all([text(js), text(css)]).then(([j, c]) => ({ js: j, css: c }));
    p.catch(() => bundles.delete(js));
    bundles.set(js, p);
  }
  return p;
}

export function editorSrcdoc(files: { js: string; css: string }, nonce: string, base: string): string {
  return (
    `<!doctype html><html><head><meta charset="utf-8"><base href="${base}">` +
    `<style>${files.css.replace(/<\/style/gi, '<\\/style')}</style><style>html,body,#root{height:100%;margin:0}</style>` +
    `<script nonce="${nonce}">${FRAME_SHIM}</script></head>` +
    `<body><div id="root"></div><script nonce="${nonce}" type="module">${files.js.replace(/<\/script/gi, '<\\/script')}</script></body></html>`
  );
}

/** Nonce of the webview's own scripts, reused by the frame's inline scripts (CSP). */
function ownNonce(): string {
  const scripts = [...document.querySelectorAll<HTMLScriptElement>('script[nonce]')];
  return (scripts.find((s) => s.src) ?? scripts[0])?.nonce ?? '';
}

const STYLE = `
.gmc-shell{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:var(--vscode-editor-background,#1e1e1e);color:var(--vscode-foreground,#ccc);font:13px var(--vscode-font-family,system-ui,sans-serif)}
.gmc-shell-head{display:flex;align-items:center;gap:8px;min-height:34px;padding:0 8px 0 12px;border-bottom:1px solid var(--vscode-panel-border,rgba(128,128,128,.35))}
.gmc-shell-chip{font-size:10px;font-weight:700;letter-spacing:.06em;padding:1px 6px;border-radius:3px;background:var(--vscode-badge-background,#4d4d4d);color:var(--vscode-badge-foreground,#fff)}
.gmc-shell-title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:40%}
.gmc-shell-hint{flex:1;min-width:0;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gmc-shell-btn{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 8px;border:1px solid transparent;border-radius:4px;background:transparent;color:inherit;font:inherit;cursor:pointer}
.gmc-shell-btn:hover{background:var(--vscode-toolbar-hoverBackground,rgba(128,128,128,.2))}
.gmc-shell-btn:focus-visible{outline:1px solid var(--vscode-focusBorder,#007fd4);outline-offset:-1px}
.gmc-shell-btn svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.gmc-shell-frame{flex:1;min-height:0;width:100%;border:0;background:var(--vscode-editor-background,#1e1e1e)}
.gmc-shell-status{padding:24px;opacity:.75}
.gmc-shell-error{display:flex;align-items:center;gap:12px;padding:8px 12px;background:var(--vscode-inputValidation-errorBackground,#5a1d1d);border-bottom:1px solid var(--vscode-inputValidation-errorBorder,#be1100)}
`;

const ICONS = {
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h8V3M8 21v-7h8v7"/>',
  beside: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
};

export interface GmcEditorLabels {
  save: string;
  saveTitle: string;
  beside: string;
  besideTitle: string;
  close: string;
  loading: string;
  notStarted: string;
  failed: (message: string) => string;
  openBeside: string;
}

const EN: GmcEditorLabels = {
  save: 'save',
  saveTitle: 'Save (Ctrl+S)',
  beside: 'beside',
  besideTitle: 'Open the graph editor in a VS Code tab beside',
  close: 'Close (Esc)',
  loading: 'Loading the graph editor…',
  notStarted: 'The graph editor did not start.',
  failed: (m) => `Could not load the graph editor here: ${m}`,
  openBeside: 'open beside instead',
};

export interface GmcEditorOptions {
  name: string;
  hint: string;
  /** Bundle URLs and the `render` message (source, view, theme, editable…), once the source is known. */
  start: Promise<{ js: string; css: string; render: Record<string, unknown> }>;
  /** Every edit made in the graph editor (not called when the render message says `editable: false`). */
  onChange?(source: string): void;
  /** Ctrl+S in the editor; with `saveButton`, also a header button. */
  onSave?(): void;
  saveButton?: boolean;
  /** The user asked to close (Escape, close button): flush, then dispose the session. */
  onClose(): void;
  onOpenBeside(): void;
  /** Other messages of the graph editor (exports…), with a way to answer it. */
  onFrameMessage?(message: { type: string; [k: string]: unknown }, send: (m: unknown) => void): void;
  labels?: Partial<GmcEditorLabels>;
}

export interface GmcEditorSession {
  /** Post a message to the graph editor. */
  send(message: unknown): void;
  /** Remove the editor and give focus back to where it was opened from. */
  dispose(): void;
}

/** Open the graph editor maximized over the webview (dialog semantics, focus kept inside until closed). */
export function openGmcEditor(o: GmcEditorOptions): GmcEditorSession {
  const L = { ...EN, ...o.labels };
  if (!document.getElementById('gmc-shell-style')) {
    const style = document.createElement('style');
    style.id = 'gmc-shell-style';
    style.textContent = STYLE;
    document.head.append(style);
  }
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const el = (tag: string, cls: string, text?: string) => {
    const e = document.createElement(tag);
    e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const button = (icon: keyof typeof ICONS, label: string, title: string, onClick: () => void, testId: string) => {
    const b = el('button', 'gmc-shell-btn') as HTMLButtonElement;
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.dataset.testid = testId;
    b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg>`;
    if (label) b.append(el('span', '', label));
    b.addEventListener('click', onClick);
    return b;
  };

  const root = el('div', 'gmc-shell');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', `Graph Model Studio — ${o.name}`);
  root.dataset.testid = 'gmc-editor';
  const head = el('div', 'gmc-shell-head');
  head.append(el('span', 'gmc-shell-chip', 'GMC'), el('span', 'gmc-shell-title', o.name), el('span', 'gmc-shell-hint', o.hint));
  if (o.onSave && o.saveButton) head.append(button('save', L.save, L.saveTitle, () => o.onSave?.(), 'gmc-save'));
  head.append(button('beside', L.beside, L.besideTitle, () => o.onOpenBeside(), 'gmc-beside'), button('close', '', L.close, () => o.onClose(), 'gmc-close'));
  const status = el('div', 'gmc-shell-status', L.loading);
  root.append(head, status);
  document.body.append(root);

  let frame: HTMLIFrameElement | null = null;
  let ready = false;
  let render: Record<string, unknown> | null = null;
  let error: HTMLElement | null = null;
  let disposed = false;
  const send = (m: unknown) => frame?.contentWindow?.postMessage(m, '*');
  const fail = (message: string) => {
    if (ready || error || disposed) return;
    error = el('div', 'gmc-shell-error');
    error.setAttribute('role', 'alert');
    error.append(el('span', '', L.failed(message)), button('beside', L.openBeside, L.besideTitle, () => o.onOpenBeside(), 'gmc-open-beside'));
    head.after(error);
    status.remove();
  };
  const timer = setTimeout(() => fail(L.notStarted), 10_000);

  o.start
    .then(async (s) => {
      const files = await loadEditorBundle(s.js, s.css);
      if (disposed) return;
      render = s.render;
      frame = document.createElement('iframe');
      frame.className = 'gmc-shell-frame';
      frame.title = 'Graph Model Studio';
      frame.srcdoc = editorSrcdoc(files, ownNonce(), s.js.replace(/[^/]*$/, ''));
      status.replaceWith(frame);
      frame.focus();
    })
    .catch((e) => fail(e instanceof Error ? e.message : String(e)));

  const receive = (e: MessageEvent) => {
    if (!frame || e.source !== frame.contentWindow) return;
    const m = (e.data as { __gmcFrame?: { type: string; [k: string]: unknown } } | null)?.__gmcFrame;
    if (!m) return;
    if (m.type === 'frameError') fail(String(m.message));
    else if (m.type === 'escape') o.onClose();
    else if (m.type === 'saveShortcut') o.onSave?.();
    else if (m.type === 'ready') {
      ready = true;
      clearTimeout(timer);
      error?.remove();
      error = null;
      send({ type: 'render', ...render });
    } else if (m.type === 'sourceChanged') {
      if (typeof m.source === 'string' && render?.editable !== false) o.onChange?.(m.source);
    } else o.onFrameMessage?.(m, send);
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      o.onClose();
    }
  };
  window.addEventListener('message', receive);
  window.addEventListener('keydown', key, true);
  return {
    send,
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(timer);
      window.removeEventListener('message', receive);
      window.removeEventListener('keydown', key, true);
      root.remove();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    },
  };
}
