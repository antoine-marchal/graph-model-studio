/**
 * Standalone test harness: emulates the extension host in a plain browser (Vite dev server) so the
 * real webview UI can be driven by Playwright. It uses the same parser/mutation/validation code as
 * the extension and persists through a dev-only file bridge (vite.config.ts). Not shipped in the .vsix.
 */
import { CorporateMaster, MutationError, renderedImageSrc, validateDocument, WebviewMessage, type HostMessage, type ReviewData } from '@corporate-slides/core';
import { applyMutations, parseSource, sourceKindOf } from '@corporate-slides/parser';

const params = new URLSearchParams(location.search);
const file = params.get('file') ?? 'examples/corporate-demo/deck.slides.md';
const kind = sourceKindOf(file)!;
const dir = file.split('/').slice(0, -1).join('/');
/** `base=<file>`: revision compared by the visual diff. `review=1`: simulated GitLab merge request (read-only, threads). */
const baseFile = params.get('base');
const reviewMode = params.get('review') === '1';
let review: ReviewData | null = null;
let noteId = 100;

let text = '';
let saved = '';
let version = 1;
/** Version after the last edit not made by a webview transaction (undo, external change). */
let externalVersion = 1;
const undo: string[] = [];
const redo: string[] = [];
let master: CorporateMaster;

const toWebview = (m: HostMessage) => window.postMessage(m, '*');

function pushDocument() {
  const { doc, errors } = parseSource(text, kind, { dimensions: master.dimensions });
  const assetUrls: Record<string, string> = {};
  for (const a of master.assets) {
    const f = a.preview ?? (/\.(png|jpe?g|gif|svg)$/i.test(a.file) ? a.file : null);
    if (f) assetUrls[`master:${a.id}`] = `/__asset?path=${encodeURIComponent(`.corporate-slides/master/${f}`)}`;
  }
  for (const s of doc.slides) for (const el of s.elements) if (el.type === 'image') assetUrls[`image:${el.src}`] = `/__asset?path=${encodeURIComponent(`${dir}/${renderedImageSrc(el.src)}`)}`;
  toWebview({ type: 'document', version, fileName: file.split('/').pop()!, sourceKind: kind, doc, master, assetUrls, diagnostics: validateDocument(doc, master), parseErrors: errors, readOnly: reviewMode, review: reviewMode ? { mr: '!42', side: 'new' } : undefined });
}

async function pushBase(base: 'none' | 'head' | 'mr') {
  const text = base === 'none' || !baseFile ? null : await fetch(`/__file?path=${encodeURIComponent(baseFile)}`).then((r) => r.text());
  const doc = text === null ? null : parseSource(text, sourceKindOf(baseFile!)!, { dimensions: master.dimensions }).doc;
  toWebview({ type: 'diffBase', base, label: base === 'mr' ? 'base de !42' : 'HEAD', doc, available: reviewMode ? ['none', 'mr'] : ['none', 'head', 'mr'] });
}

/** In-memory stand-in for the Project Integration companion. */
function reviewAction(msg: Extract<WebviewMessage, { type: 'review' }>) {
  const now = new Date().toISOString();
  if (!review) {
    const line = (re: RegExp) => text.split('\n').findIndex((l) => re.test(l)) + 1 || 1;
    review = {
      mr: '!42', side: 'new', canComment: true, canCreate: true, threads: [
        { id: 'd1', line: line(/^# Architecture/), resolved: false, resolvable: true, notes: [{ id: 1, author: 'Claire Martin (@cmartin)', body: 'Le titre devrait mentionner la cible 2027.', created: now }, { id: 2, author: 'Paul Durand (@pdurand)', body: 'D’accord, je corrige.', created: now }] },
        { id: 'd2', line: line(/id: mes-box/), resolved: false, resolvable: true, notes: [{ id: 3, author: 'Claire Martin (@cmartin)', body: 'Utiliser theme.accent2 pour le MES, comme dans le schéma directeur.', created: now }] },
        { id: 'd3', line: line(/^# Feuille de route/), resolved: true, resolvable: true, notes: [{ id: 4, author: 'Inès Leroy (@ileroy)', body: 'Planning validé par le comité.', created: now }] },
      ],
    };
  }
  if (msg.action === 'create') review.threads.push({ id: `d${++noteId}`, line: msg.line ?? 1, resolved: false, resolvable: true, notes: [{ id: ++noteId, author: 'Vous (@me)', body: msg.text ?? '', created: now }] });
  const t = review.threads.find((x) => x.id === msg.discussionId);
  if (msg.action === 'reply' && t) t.notes.push({ id: ++noteId, author: 'Vous (@me)', body: msg.text ?? '', created: now });
  if (msg.action === 'resolve' && t) t.resolved = !!msg.resolved;
  toWebview({ type: 'review', requestId: msg.requestId, action: msg.action, data: structuredClone(review) });
}

function setText(next: string) {
  text = next;
  version++;
  pushDocument();
}

async function save() {
  await fetch(`/__file?path=${encodeURIComponent(file)}`, { method: 'PUT', body: text });
  saved = text;
}

window.acquireVsCodeApi = () => ({
  getState: () => undefined,
  setState: () => {},
  postMessage(raw: unknown) {
    const parsed = WebviewMessage.safeParse(raw);
    if (!parsed.success) return console.error('invalid message', raw);
    const msg = parsed.data;
    switch (msg.type) {
      case 'ready':
        if (params.get('mode') === 'masters') {
          const assetUrls: Record<string, string> = {};
          const thumbnails: Record<string, string> = {};
          for (const a of master.assets) {
            const f = a.preview ?? (/\.(png|jpe?g|gif|svg)$/i.test(a.file) ? a.file : null);
            if (f) assetUrls[`master:${a.id}`] = `/__asset?path=${encodeURIComponent(`.corporate-slides/master/${f}`)}`;
          }
          for (const l of master.layouts) if (l.thumbnail) thumbnails[l.id] = `/__asset?path=${encodeURIComponent(`.corporate-slides/master/${l.thumbnail}`)}`;
          return toWebview({ type: 'masters', master, assetUrls, thumbnails, focusLayout: params.get('layout') ?? undefined });
        }
        pushDocument();
        void pushBase(reviewMode ? 'mr' : 'head');
        if (reviewMode) reviewAction({ type: 'review', action: 'load', requestId: 0 });
        return;
      case 'setDiffBase':
        return void pushBase(msg.base);
      case 'review':
        return reviewAction(msg);
      case 'listGmc':
        return toWebview({ type: 'gmcFiles', files: ['diagrams/landscape.gmc'] });
      case 'insertGmc': {
        const { doc } = parseSource(text, kind, { dimensions: master.dimensions });
        const slide = doc.slides.find((s) => s.id === msg.slideId)!;
        const id = ['diagram', ...Array.from({ length: 50 }, (_, i) => `diagram-${i + 1}`)].find((x) => !slide.elements.some((e) => e.id === x))!;
        undo.push(text);
        setText(applyMutations(text, kind, [{ kind: 'addElement', slideId: slide.id, element: { id, type: 'image', src: msg.path, x: 2.67, y: 1.6, w: 8, h: 4.5, alt: 'Diagramme' } }], { dimensions: master.dimensions }));
        return toWebview({ type: 'select', slideId: slide.id, elementId: id });
      }
      case 'mutate': {
        if (reviewMode) return toWebview({ type: 'rejected', txId: msg.tx.id, reason: 'Révision de merge request : lecture seule.', conflict: false });
        if (msg.tx.baseVersion < externalVersion) {
          toWebview({ type: 'rejected', txId: msg.tx.id, reason: 'conflit de version', conflict: true });
          return pushDocument();
        }
        try {
          const next = applyMutations(text, kind, msg.tx.mutations, { dimensions: master.dimensions });
          undo.push(text);
          redo.length = 0;
          setText(next);
          toWebview({ type: 'ack', txId: msg.tx.id, version });
        } catch (e) {
          toWebview({ type: 'rejected', txId: msg.tx.id, reason: e instanceof MutationError ? e.message : String(e), conflict: false });
        }
        return;
      }
      case 'undo':
        if (undo.length) (redo.push(text), setText(undo.pop()!), (externalVersion = version));
        return;
      case 'redo':
        if (redo.length) (undo.push(text), setText(redo.pop()!), (externalVersion = version));
        return;
      case 'save':
        return void save();
      case 'readClipboard':
        return void navigator.clipboard.readText().then((t) => toWebview({ type: 'clipboard', text: t }), () => toWebview({ type: 'clipboard', text: '' }));
      case 'slideShown':
        return;
      case 'pastePowerPoint':
        return void toWebview({ type: 'pasteFallback' });
      case 'saveLayout':
        // Layout designer: the master is kept in memory (the shared test master is never written).
        master = { ...master, layouts: master.layouts.map((l) => (l.id === msg.layout.id ? msg.layout : l)) };
        return pushDocument();
      default:
        toWebview({ type: 'notice', level: 'info', message: `« ${msg.type} » est géré par l'extension VS Code (indisponible dans le harnais).` });
    }
  },
});

declare global {
  interface Window {
    __harness: { text(): string; dirty(): boolean; save(): Promise<void>; version(): number; setExternal(t: string): void; master(): CorporateMaster };
  }
}
window.__harness = { text: () => text, dirty: () => text !== saved, save, version: () => version, setExternal: (t) => (setText(t), (externalVersion = version)), master: () => master };

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    void save();
  }
});

const [t, m] = await Promise.all([fetch(`/__file?path=${encodeURIComponent(file)}`).then((r) => r.text()), fetch('/__master').then((r) => r.json())]);
text = saved = t;
master = CorporateMaster.parse(m);
if (params.get('theme') === 'light') document.body.classList.add('vscode-light');
else document.body.classList.add('vscode-dark');
if (params.get('mode') === 'masters') document.getElementById('root')!.dataset.mode = 'masters';
await import('../src/main');
