import * as vscode from 'vscode';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { imageSize } from 'image-size';
import { DESIGN_SLIDE_ID, findLayout, isDiagramSrc, masterAssetSrc, MutationError, newLayout, patchMasterObjects, renderedImageSrc, resolveSlide, uniqueId, WebviewMessage, type CorporateMaster, type DiffBaseKind, type HostMessage, type Mutation, type SlideDocument, tr } from '@corporate-slides/core';
import { applyMutations, parseSource, presentationKind, type SourceKind } from '@corporate-slides/parser';
import { findMasterDir, fsValidateOptions, projectRootOf, resolveImage } from '@corporate-slides/cli';
import { convertClipboardDrawing, loadMaster, slugify } from '@corporate-slides/master-extractor';
import { readPowerPointClipboard } from './pptClipboard';
import { validateDocument } from '@corporate-slides/core';
import { webviewHtml } from './webviewHtml';
import { createGmc, gmsEditorBundle, openGmc, renderGmc } from './gmc';
import { loadDiffBase, localPath, mrRef, mrTwin, reviewRequest, trackMrRevision } from './review';
import { log } from './log';

const BROWSER_IMAGE = /\.(png|jpe?g|gif|svg|webp|bmp)$/i;

interface MasterCache {
  dir: string;
  master: CorporateMaster;
  mtime: number;
}

interface PanelState {
  document: vscode.TextDocument;
  kind: SourceKind;
  panel: vscode.WebviewPanel;
  diffBase: DiffBaseKind;
  /** Version after the last edit that did not come from this editor's own transactions. */
  externalVersion: number;
  /** Zen mode turned on by this editor's slide show. */
  zen?: boolean;
}

/**
 * Custom *text* editor: the VS Code TextDocument (Markdown/DSL source) stays the single durable truth.
 * Visual edits arrive as typed mutations, are validated, applied to the source text with
 * format-preserving edits (WorkspaceEdit → native undo/redo, dirty state and save), then the
 * document is re-parsed and pushed back to the webview.
 *
 * Merge request revisions (`pi-mr:` documents from the GitLab companion) open read-only, with the
 * review threads and the visual diff against the base revision.
 */
export class SlidesEditorProvider implements vscode.CustomTextEditorProvider {
  static readonly viewType = 'corporateSlides.editor';
  /** Same editor, registered as the default for `.deck` files. */
  static readonly deckViewType = 'corporateSlides.deck';
  private masters = new Map<string, MasterCache>();
  /** Documents being edited by `applyTransaction` (their change events are our own). */
  private applying = new Set<string>();
  private panels = new Map<string, Set<PanelState>>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly diagnostics: vscode.DiagnosticCollection,
    private readonly commands: { exportPptx(uri: vscode.Uri): Promise<void>; renderReference(uri: vscode.Uri, slideIndex: number): Promise<vscode.Uri | null>; newFromLayout(layout: string): Promise<void> },
  ) {
    // A merge request revision opened from the companion lends its discussions to the local copy.
    vscode.workspace.textDocuments.forEach(trackMrRevision);
    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument((d) => {
        if (!trackMrRevision(d)) return;
        for (const p of this.allPanels()) {
          if (p.document.uri.scheme !== 'file' || mrTwin(p.document.uri)?.toString() !== d.uri.toString()) continue;
          void this.pushDocument(p);
          void this.relayReview(p.document, (m) => p.panel.webview.postMessage(m), { action: 'load' });
        }
      }),
    );
  }

  async getMaster(fileUri: vscode.Uri): Promise<MasterCache | null> {
    const dir = findMasterDir(localPath(fileUri));
    if (!dir) return null;
    const json = join(dir, 'corporate-master.json');
    const mtime = (await vscode.workspace.fs.stat(vscode.Uri.file(json))).mtime;
    const cached = this.masters.get(dir);
    if (cached && cached.mtime === mtime) return cached;
    const entry = { dir, master: await loadMaster(json), mtime };
    this.masters.set(dir, entry);
    return entry;
  }

  /** Write the corporate master after a visual edit; every deck using it is refreshed. */
  private async writeMaster(dir: string, master: CorporateMaster): Promise<void> {
    await writeFile(join(dir, 'corporate-master.json'), JSON.stringify(master, null, 2) + '\n', 'utf8');
    await writeFile(join(dir, 'layouts.json'), JSON.stringify(master.layouts, null, 2) + '\n', 'utf8');
    this.masters.delete(dir);
    for (const p of this.allPanels()) if (findMasterDir(localPath(p.document.uri)) === dir) void this.pushDocument(p);
  }

  /** New layout in the corporate master; the slide switches to it (a blank layout gets a new slide). */
  private async createLayout(state: PanelState, msg: Extract<WebviewMessage, { type: 'createLayout' }>, send: (m: HostMessage) => void): Promise<void> {
    const { document, kind } = state;
    const m = await this.getMaster(document.uri);
    if (!m) throw new Error(tr('Aucun masque corporate importé.', 'No corporate master imported.'));
    const { doc } = this.parse(document, kind, m.master);
    const slide = doc.slides.find((s) => s.id === msg.slideId);
    if (!slide) throw new Error(tr(`Diapositive « ${msg.slideId} » introuvable`, `Slide “${msg.slideId}” not found`));
    const master = structuredClone(m.master);
    const id = uniqueId(slugify(msg.name), master.layouts.flatMap((l) => [l.id, ...l.aliases]));
    const made = newLayout(master, slide, msg.from, id, msg.name);
    // Slide pictures become master assets (copied next to the master: the layout must not depend on the deck).
    const local = localPath(document.uri);
    const root = projectRootOf(m.dir);
    let n = 0;
    for (const im of made.images) {
      const obj = made.layout.objects[im.index]!;
      const src = resolveImage(dirname(local), renderedImageSrc(im.src), root);
      if (!src || !existsSync(src)) {
        obj.hidden = true;
        continue;
      }
      const assetId = `${id}-${++n}`;
      const file = `assets/${assetId}${extname(src).toLowerCase()}`;
      await mkdir(join(m.dir, 'assets'), { recursive: true });
      await copyFile(src, join(m.dir, file));
      master.assets.push({ id: assetId, file, originalPart: '', format: extname(src).slice(1).toLowerCase() });
      (obj.object.image as Record<string, unknown>).path = file;
      obj.assetId = assetId;
    }
    master.layouts.push(made.layout);
    master.masters.find((x) => x.id === made.layout.masterId)?.layoutIds.push(id);
    await this.writeMaster(m.dir, master);
    const ms: Mutation[] =
      msg.from === 'blank'
        ? [{ kind: 'addSlide', slideId: uniqueId('slide', doc.slides.map((s) => s.id)), layout: id, afterSlideId: slide.id }]
        : [
            { kind: 'setSlideLayout', slideId: slide.id, layout: id },
            // The slide's master overrides are part of the new layout now.
            ...Object.keys(slide.masterOverrides ?? {}).map((k) => ({ kind: 'setMasterOverride' as const, slideId: slide.id, index: Number(k), override: null })),
            ...made.converted.map((elementId) => ({ kind: 'deleteElement' as const, slideId: slide.id, elementId })),
          ];
    if (document.uri.scheme === 'file') {
      const error = await this.applyTransaction(document, kind, ms);
      if (error) throw new Error(error);
    }
    send({ type: 'notice', level: 'info', message: tr(`Disposition « ${msg.name} » ajoutée au masque (${id}).`, `Layout “${msg.name}” added to the master (${id}).`) });
  }

  /** Layout designer save: the layout replaces its master version; this deck's master overrides follow their objects. */
  private async saveLayout(state: PanelState, msg: Extract<WebviewMessage, { type: 'saveLayout' }>): Promise<void> {
    const { document, kind } = state;
    const m = await this.getMaster(document.uri);
    if (!m) throw new Error(tr('Aucun masque corporate importé.', 'No corporate master imported.'));
    if (!m.master.layouts.some((l) => l.id === msg.layout.id)) throw new Error(tr(`Disposition « ${msg.layout.id} » introuvable`, `Layout “${msg.layout.id}” not found`));
    const master = { ...m.master, layouts: m.master.layouts.map((l) => (l.id === msg.layout.id ? msg.layout : l)) };
    const { doc } = this.parse(document, kind, m.master);
    await this.writeMaster(m.dir, master);
    const ms: Mutation[] = [];
    for (const s of doc.slides) {
      const ovs = s.masterOverrides;
      if (!ovs || findLayout(m.master, s.layout)?.id !== msg.layout.id) continue;
      const moved = Object.entries(ovs).map(([k, ov]) => [k, msg.indexMap[k] ?? null, ov] as const);
      if (moved.every(([k, to]) => String(to) === k)) continue;
      for (const [k] of moved) ms.push({ kind: 'setMasterOverride', slideId: s.id, index: Number(k), override: null });
      for (const [, to, ov] of moved) if (to !== null) ms.push({ kind: 'setMasterOverride', slideId: s.id, index: to, override: ov });
    }
    if (ms.length && document.uri.scheme === 'file') {
      const error = await this.applyTransaction(document, kind, ms);
      if (error) throw new Error(error);
    }
  }

  /** Delete a slide master with all its layouts, after a modal warning and the master's name typed back. */
  private async deleteMaster(state: PanelState, msg: Extract<WebviewMessage, { type: 'deleteMaster' }>, send: (m: HostMessage) => void): Promise<void> {
    const { document, kind } = state;
    const m = await this.getMaster(document.uri);
    if (!m) throw new Error(tr('Aucun masque corporate importé.', 'No corporate master imported.'));
    const target = m.master.masters.find((x) => x.id === msg.masterId);
    if (!target) throw new Error(tr(`Masque « ${msg.masterId} » introuvable`, `Master “${msg.masterId}” not found`));
    const others = m.master.masters.filter((x) => x !== target);
    if (!others.length) throw new Error(tr('Impossible de supprimer le seul masque du modèle.', 'Cannot delete the only master of the template.'));
    const doomed = new Set(m.master.layouts.filter((l) => l.masterId === target.id).map((l) => l.id));
    const kept = m.master.layouts.filter((l) => !doomed.has(l.id));
    const { doc } = this.parse(document, kind, m.master);
    const users = doc.slides.filter((s) => doomed.has(findLayout(m.master, s.layout)?.id ?? ''));
    const yes = tr('Supprimer définitivement', 'Delete permanently');
    const ok = await vscode.window.showWarningMessage(
      tr(`Supprimer le masque « ${target.name} » et ses ${doomed.size} dispositions ?`, `Delete master “${target.name}” and its ${doomed.size} layouts?`),
      {
        modal: true,
        detail: tr(
          `Cette action modifie le masque corporate partagé (corporate-master.json) et ne peut pas être annulée depuis l’éditeur. ${users.length} diapositive(s) de cette présentation changeront de disposition ; les autres présentations utilisant ces dispositions seront en erreur.`,
          `This changes the shared corporate master (corporate-master.json) and cannot be undone from the editor. ${users.length} slide(s) of this presentation will change layout; other presentations using these layouts will report errors.`,
        ),
      },
      yes,
    );
    if (ok !== yes) return;
    const typed = await vscode.window.showInputBox({
      title: tr('Confirmer la suppression du masque', 'Confirm master deletion'),
      prompt: tr(`Tapez « ${target.name} » pour confirmer`, `Type “${target.name}” to confirm`),
      ignoreFocusOut: true,
      validateInput: (v) => (v === target.name ? null : tr('Le nom ne correspond pas', 'The name does not match')),
    });
    if (typed !== target.name) return;
    const master = structuredClone(m.master);
    master.masters = master.masters.filter((x) => x.id !== target.id);
    master.layouts = master.layouts.filter((l) => !doomed.has(l.id));
    if (!master.masters.some((x) => x.primary)) master.masters[0]!.primary = true;
    // Slides move to the layout of the same name in the remaining masters, else the primary master's first layout.
    const primary = master.masters.find((x) => x.primary)!;
    const fallback = kept.find((l) => l.masterId === primary.id) ?? kept[0]!;
    await this.writeMaster(m.dir, master);
    const ms: Mutation[] = users.flatMap((s) => {
      const name = findLayout(m.master, s.layout)?.name;
      const to = kept.find((l) => l.name === name) ?? fallback;
      return [{ kind: 'setSlideLayout' as const, slideId: s.id, layout: to.id }, ...Object.keys(s.masterOverrides ?? {}).map((k) => ({ kind: 'setMasterOverride' as const, slideId: s.id, index: Number(k), override: null }))];
    });
    if (ms.length && document.uri.scheme === 'file') {
      const error = await this.applyTransaction(document, kind, ms);
      if (error) throw new Error(error);
    }
    send({ type: 'notice', level: 'info', message: tr(`Masque « ${target.name} » supprimé (${doomed.size} dispositions).`, `Master “${target.name}” deleted (${doomed.size} layouts).`) });
  }

  /** Rename or (after confirmation) delete a layout; this deck's slides follow. */
  private async editLayout(state: PanelState, msg: Extract<WebviewMessage, { type: 'renameLayout' | 'deleteLayout' }>, send: (m: HostMessage) => void): Promise<void> {
    const { document, kind } = state;
    const m = await this.getMaster(document.uri);
    if (!m) throw new Error(tr('Aucun masque corporate importé.', 'No corporate master imported.'));
    const master = structuredClone(m.master);
    const layout = master.layouts.find((l) => l.id === msg.layoutId);
    if (!layout) throw new Error(tr(`Disposition « ${msg.layoutId} » introuvable`, `Layout “${msg.layoutId}” not found`));
    const { doc } = this.parse(document, kind, m.master);
    const users = doc.slides.filter((s) => findLayout(m.master, s.layout)?.id === msg.layoutId);
    let target: string;
    if (msg.type === 'renameLayout') {
      if (master.layouts.some((l) => l !== layout && (l.id === msg.newId || l.aliases.includes(msg.newId))))
        throw new Error(tr(`Identifiant « ${msg.newId} » déjà utilisé`, `Identifier “${msg.newId}” already used`));
      target = msg.newId;
      layout.aliases = [...new Set([...layout.aliases.filter((a) => a !== msg.newId), layout.id])];
      layout.id = msg.newId;
      for (const x of master.masters) x.layoutIds = x.layoutIds.map((id) => (id === msg.layoutId ? msg.newId : id));
    } else {
      const others = master.layouts.filter((l) => l !== layout);
      const fallback = others.find((l) => l.masterId === layout.masterId) ?? others[0];
      if (!fallback) throw new Error(tr('Impossible de supprimer la dernière disposition du masque.', 'Cannot delete the last layout of the master.'));
      const yes = tr('Supprimer', 'Delete');
      const detail = users.length
        ? tr(`${users.length} diapositive(s) de cette présentation passeront sur « ${fallback.name} ». Les autres présentations utilisant cette disposition seront en erreur.`, `${users.length} slide(s) of this presentation will switch to “${fallback.name}”. Other presentations using this layout will report errors.`)
        : tr('Les autres présentations utilisant cette disposition seront en erreur.', 'Other presentations using this layout will report errors.');
      const ok = await vscode.window.showWarningMessage(tr(`Supprimer la disposition « ${layout.name} » (${layout.id}) du masque corporate ?`, `Delete layout “${layout.name}” (${layout.id}) from the corporate master?`), { modal: true, detail }, yes);
      if (ok !== yes) return;
      target = fallback.id;
      master.layouts = others;
      for (const x of master.masters) x.layoutIds = x.layoutIds.filter((id) => id !== layout.id);
    }
    await this.writeMaster(m.dir, master);
    const ms: Mutation[] = users.map((s) => ({ kind: 'setSlideLayout', slideId: s.id, layout: target }));
    if (msg.type === 'deleteLayout') for (const s of users) for (const k of Object.keys(s.masterOverrides ?? {})) ms.push({ kind: 'setMasterOverride', slideId: s.id, index: Number(k), override: null });
    if (ms.length && document.uri.scheme === 'file') {
      const error = await this.applyTransaction(document, kind, ms);
      if (error) throw new Error(error);
    }
    send({ type: 'notice', level: 'info', message: msg.type === 'renameLayout' ? tr(`Disposition renommée en « ${target} ».`, `Layout renamed to “${target}”.`) : tr(`Disposition « ${layout.id} » supprimée.`, `Layout “${layout.id}” deleted.`) });
  }

  private *allPanels(): Iterable<PanelState> {
    for (const set of this.panels.values()) yield* set;
  }

  invalidateMasters(): void {
    this.masters.clear();
    for (const p of this.allPanels()) p.panel.webview.postMessage({ type: 'notice', level: 'info', message: tr('Masque corporate mis à jour.', 'Corporate master updated.') } satisfies HostMessage);
  }

  /** Re-push every open deck that mentions the diagram (after its PNG was re-rendered). */
  /**
   * A diagram was re-rendered: its PNG may have a new aspect ratio. Image boxes showing it are
   * re-proportioned (same width and center, height fitted; limited to the safe area) so the
   * rendering is never stretched, then the decks are refreshed.
   */
  async refreshImages(file: string): Promise<void> {
    const name = basename(file);
    let ratio: number | null = null;
    try {
      const d = imageSize(readFileSync(renderedImageSrc(file)));
      if (d.width && d.height) ratio = d.width / d.height;
    } catch {
      /* no rendering yet */
    }
    const fitted = new Set<string>();
    for (const p of this.allPanels()) {
      if (!p.document.getText().includes(name)) continue;
      const key = p.document.uri.toString();
      if (ratio && p.document.uri.scheme === 'file' && !fitted.has(key)) {
        fitted.add(key);
        await this.fitDiagram(p, file, ratio).catch((e) => log.error('diagram ratio', e));
      }
      void this.pushDocument(p);
    }
  }

  private async fitDiagram({ document, kind }: PanelState, file: string, ratio: number): Promise<void> {
    const m = await this.getMaster(document.uri);
    if (!m) return;
    const { doc } = this.parse(document, kind, m.master);
    const dir = dirname(localPath(document.uri));
    const sa = m.master.constraints.safeArea;
    const ms: Mutation[] = [];
    for (const slide of doc.slides) {
      for (const r of resolveSlide(slide, m.master).elements) {
        const el = r.element;
        if (el.type !== 'image' || resolve(dir, el.src) !== resolve(file) || r.box.h <= 0) continue;
        if (Math.abs(r.box.w / r.box.h / ratio - 1) < 0.01) continue;
        let w = r.box.w, h = w / ratio;
        if (h > sa.h) (h = sa.h), (w = h * ratio);
        const cx = r.box.x + r.box.w / 2, cy = r.box.y + r.box.h / 2;
        ms.push({ kind: 'updateElement', slideId: slide.id, elementId: el.id, patch: { x: round(cx - w / 2), y: round(cy - h / 2), w: round(w), h: round(h) } });
      }
    }
    if (ms.length) {
      const error = await this.applyTransaction(document, kind, ms);
      if (error) log.warn(`diagram ratio not applied: ${error}`);
    }
  }

  /** `.gmc` sources referenced by the open decks. */
  referencedDiagrams(): Set<string> {
    const out = new Set<string>();
    for (const p of this.allPanels()) {
      const dir = dirname(localPath(p.document.uri));
      for (const m of p.document.getText().matchAll(/[\w./\\-]+\.gmc\b/gi)) out.add(resolve(dir, m[0]));
    }
    return out;
  }

  /** Called by the GitLab companion (`corporateSlides.revealReviewComment`) to focus a review note. */
  async revealReviewComment(uri: vscode.Uri, focus: { noteId: number; line: number }): Promise<boolean> {
    let states = [...(this.panels.get(uri.toString()) ?? [])];
    if (!states.length) {
      await vscode.commands.executeCommand('vscode.openWith', uri, SlidesEditorProvider.deckViewType);
      states = [...(this.panels.get(uri.toString()) ?? [])];
    }
    for (const s of states) s.panel.webview.postMessage({ type: 'revealReviewComment', noteId: focus.noteId } satisfies HostMessage);
    return states.length > 0;
  }

  async resolveCustomTextEditor(document: vscode.TextDocument, panel: vscode.WebviewPanel): Promise<void> {
    const kind = presentationKind(document.uri.path);
    if (!kind) throw new Error(tr('Type de fichier non pris en charge', 'Unsupported file type'));
    const local = localPath(document.uri);
    const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(local));
    const roots = [vscode.Uri.joinPath(this.context.extensionUri, 'dist'), vscode.Uri.file(dirname(local)), this.context.globalStorageUri];
    if (folder) roots.push(folder.uri);
    const masterDir = findMasterDir(local);
    if (masterDir) roots.push(vscode.Uri.file(masterDir));
    roots.push(gmsEditorBundle(this.context.extension).dir);
    panel.webview.options = { enableScripts: true, localResourceRoots: roots };
    panel.webview.html = webviewHtml(panel.webview, this.context.extensionUri, 'editor');

    const key = document.uri.toString();
    const state: PanelState = { document, kind, panel, diffBase: mrRef(document.uri)?.side === 'new' ? 'mr' : 'head', externalVersion: document.version };
    if (!this.panels.has(key)) this.panels.set(key, new Set());
    this.panels.get(key)!.add(state);

    let disposed = false;
    const send = (m: HostMessage) => !disposed && panel.webview.postMessage(m);
    let timer: NodeJS.Timeout | undefined;
    const pushDocument = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void this.pushDocument(state).catch((e) => log.error('push failed', e)), 30);
    };

    const subs: vscode.Disposable[] = [
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.toString() !== key || !e.contentChanges.length) return;
        if (!this.applying.has(key)) state.externalVersion = e.document.version;
        pushDocument();
      }),
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (e.textEditor.document.uri.toString() !== key || e.kind === vscode.TextEditorSelectionChangeKind.Command) return;
        void this.selectFromSource(document, kind, e.selections[0]!.active.line + 1).then((sel) => sel && send({ type: 'select', ...sel }));
      }),
      panel.webview.onDidReceiveMessage((raw) => void this.onMessage(raw, state, send, pushDocument)),
    ];
    panel.onDidDispose(() => {
      disposed = true;
      if (state.zen) void presentationMode(false);
      clearTimeout(timer);
      this.panels.get(key)?.delete(state);
      subs.forEach((s) => s.dispose());
    });
  }

  private parse(document: vscode.TextDocument, kind: SourceKind, master: CorporateMaster | null) {
    return parseSource(document.getText(), kind, master ? { dimensions: master.dimensions, master } : {});
  }

  async pushDocument({ document, kind, panel }: PanelState): Promise<void> {
    const m = await this.getMaster(document.uri);
    const { doc, errors } = this.parse(document, kind, m?.master ?? null);
    const local = localPath(document.uri);
    const assetUrls: Record<string, string> = {};
    let diags: ReturnType<typeof validateDocument> = [];
    if (m) {
      for (const a of m.master.assets) {
        const file = a.preview ?? (BROWSER_IMAGE.test(a.file) ? a.file : null);
        if (file) assetUrls[`master:${a.id}`] = panel.webview.asWebviewUri(vscode.Uri.file(join(m.dir, file))).toString();
      }
      const root = projectRootOf(m.dir);
      for (const s of doc.slides) for (const el of s.elements) {
        if (el.type !== 'image') continue;
        const p = resolveImage(dirname(local), el.src, root);
        // mtime query: a re-rendered diagram PNG replaces the cached image.
        if (p && existsSync(p) && BROWSER_IMAGE.test(p)) assetUrls[`image:${el.src}`] = `${panel.webview.asWebviewUri(vscode.Uri.file(p))}?v=${statSync(p).mtimeMs}`;
      }
      diags = validateDocument(doc, m.master, fsValidateOptions(local, root));
      if (document.uri.scheme === 'file') this.publishDiagnostics(document, diags, errors);
    }
    const twin = mrTwin(document.uri);
    const mr = mrRef(document.uri) ?? (twin ? mrRef(twin) : undefined);
    panel.webview.postMessage({
      type: 'document',
      version: document.version,
      fileName: basename(document.uri.path),
      sourceKind: kind,
      doc,
      master: m?.master ?? null,
      assetUrls,
      diagnostics: diags,
      parseErrors: errors,
      readOnly: document.uri.scheme !== 'file',
      review: mr ? { mr: `!${mr.iid}`, side: mr.side } : undefined,
    } satisfies HostMessage);
  }

  private async pushDiffBase(state: PanelState, master: CorporateMaster | null): Promise<void> {
    const base = await loadDiffBase(state.document, state.diffBase);
    const available: DiffBaseKind[] = mrRef(state.document.uri) ? (mrRef(state.document.uri)!.side === 'new' ? ['none', 'mr'] : ['none']) : ['none', 'head', 'mr'];
    const doc = base.text === null ? null : parseSource(base.text, state.kind, master ? { dimensions: master.dimensions, master } : {}).doc;
    state.panel.webview.postMessage({ type: 'diffBase', base: state.diffBase, label: base.label, doc, available, error: base.error } satisfies HostMessage);
  }

  publishDiagnostics(document: vscode.TextDocument, diags: ReturnType<typeof validateDocument>, parseErrors: string[]): void {
    const out: vscode.Diagnostic[] = [];
    for (const d of diags) {
      const line = Math.max(0, (d.source?.startLine ?? 1) - 1);
      const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER);
      const diag = new vscode.Diagnostic(range, d.message, d.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning);
      diag.source = 'Corporate Slides';
      diag.code = d.rule;
      out.push(diag);
    }
    for (const e of parseErrors) {
      const line = Math.max(0, Number(/[Ll]igne (\d+)/.exec(e)?.[1] ?? 1) - 1);
      out.push(Object.assign(new vscode.Diagnostic(new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER), e, vscode.DiagnosticSeverity.Error), { source: 'Corporate Slides' }));
    }
    this.diagnostics.set(document.uri, out);
  }

  private async selectFromSource(document: vscode.TextDocument, kind: SourceKind, line: number): Promise<{ slideId: string; elementId?: string } | null> {
    const m = await this.getMaster(document.uri);
    const { doc } = this.parse(document, kind, m?.master ?? null);
    for (const s of doc.slides) {
      const el = s.elements.find((e) => e.source && e.source.kind !== 'markdown-frontmatter' && e.source.startLine <= line && line <= e.source.endLine);
      if (el) return { slideId: s.id, elementId: el.id };
      if (s.source && s.source.startLine <= line && line <= s.source.endLine) return { slideId: s.id };
    }
    return null;
  }

  private async onMessage(raw: unknown, state: PanelState, send: (m: HostMessage) => void, push: () => void) {
    const { document, kind, panel } = state;
    const parsed = WebviewMessage.safeParse(raw);
    if (!parsed.success) {
      log.warn('Rejected malformed webview message', parsed.error.issues[0]);
      return;
    }
    const msg = parsed.data;
    const readOnly = document.uri.scheme !== 'file';
    try {
      switch (msg.type) {
        case 'ready': {
          await this.pushDocument(state);
          await this.pushDiffBase(state, (await this.getMaster(document.uri))?.master ?? null);
          if (mrRef(document.uri) || mrTwin(document.uri)) void this.relayReview(document, send, { action: 'load' });
          break;
        }
        case 'mutate': {
          if (readOnly) {
            send({ type: 'rejected', txId: msg.tx.id, reason: tr('Révision de merge request : lecture seule.', 'Merge request revision: read-only.'), conflict: false });
            return;
          }
          // Transactions are re-applied to the current text, so only an edit made elsewhere (text
          // editor, undo, git…) after the webview's base version is a conflict: rapid visual edits
          // sent before our own re-parse arrives stay valid.
          if (msg.tx.baseVersion < state.externalVersion) {
            send({ type: 'rejected', txId: msg.tx.id, reason: tr('Modification ignorée car la source a été modifiée entre-temps. L’aperçu a été rechargé.', 'Edit ignored because the source changed in the meantime. The preview was reloaded.'), conflict: true });
            await this.pushDocument(state);
            return;
          }
          const error = await this.applyTransaction(document, kind, msg.tx.mutations);
          if (error) {
            send({ type: 'rejected', txId: msg.tx.id, reason: error, conflict: false });
            return;
          }
          send({ type: 'ack', txId: msg.tx.id, version: document.version });
          push();
          break;
        }
        case 'undo':
        case 'redo':
          panel.reveal(undefined, false);
          await vscode.commands.executeCommand(msg.type);
          break;
        case 'save':
          if (!readOnly) await document.save();
          break;
        case 'export':
          await this.commands.exportPptx(document.uri);
          break;
        case 'validate': {
          await this.pushDocument(state);
          await vscode.commands.executeCommand('workbench.actions.view.problems');
          break;
        }
        case 'slideShown': {
          // Both sides of a diff (file + git revision) are the same path under different schemes.
          const same = (u: vscode.Uri) => u.path.toLowerCase() === document.uri.path.toLowerCase();
          for (const p of this.allPanels()) if (p !== state && same(p.document.uri)) p.panel.webview.postMessage({ type: 'select', slideId: msg.slideId } satisfies HostMessage);
          break;
        }
        case 'openSource':
          await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default', panel.viewColumn);
          break;
        case 'editMaster': {
          if (readOnly) break;
          const m = await this.getMaster(document.uri);
          if (m) await this.writeMaster(m.dir, patchMasterObjects(m.master, msg.layoutId, msg.index, msg.patch));
          break;
        }
        case 'createLayout':
          if (!readOnly) await this.createLayout(state, msg, send);
          break;
        case 'saveLayout':
          if (!readOnly) await this.saveLayout(state, msg);
          break;
        case 'deleteMaster':
          if (!readOnly) await this.deleteMaster(state, msg, send);
          break;
        case 'renameLayout':
        case 'deleteLayout':
          if (!readOnly) await this.editLayout(state, msg, send);
          break;
        case 'presentation':
          if (msg.active !== !!state.zen) {
            state.zen = msg.active;
            await presentationMode(msg.active);
          }
          break;
        case 'reveal': {
          const m = await this.getMaster(document.uri);
          const { doc } = this.parse(document, kind, m?.master ?? null);
          const slide = doc.slides.find((s) => s.id === msg.slideId);
          const src = (msg.elementId ? slide?.elements.find((e) => e.id === msg.elementId)?.source : undefined) ?? slide?.source;
          const editor = await vscode.window.showTextDocument(document, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false });
          if (src) {
            const range = new vscode.Range(src.startLine - 1, 0, src.endLine - 1, Number.MAX_SAFE_INTEGER);
            editor.selection = new vscode.Selection(range.start, range.start);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
          }
          break;
        }
        case 'pickImage':
          if (!readOnly) await this.insertImage(document, kind, msg.slideId, send);
          break;
        case 'pasteImage': {
          if (readOnly) break;
          const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' }[msg.mime];
          if (msg.slideId === DESIGN_SLIDE_ID) {
            await this.designImages(document, [{ name: `colle.${ext}`, data: Buffer.from(msg.data, 'base64') }], send);
            break;
          }
          const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
          const file = join(dirname(document.uri.fsPath), 'images', `colle-${stamp}.${ext}`);
          await mkdir(dirname(file), { recursive: true });
          await writeFile(file, Buffer.from(msg.data, 'base64'));
          await this.addImage(document, kind, msg.slideId, file, send);
          break;
        }
        case 'pastePowerPoint': {
          if (readOnly) break;
          const m = await this.getMaster(document.uri);
          const bytes = m ? await readPowerPointClipboard(join(this.context.globalStorageUri.fsPath, 'clipboard')) : null;
          const conv = bytes && m ? await convertClipboardDrawing(bytes, m.master).catch((e) => (log.error('PowerPoint paste', e), null)) : null;
          if (!conv?.elements.length) {
            send({ type: 'pasteFallback' });
            break;
          }
          // Pictures go to images/ next to the deck, like pasted images (to the master's assets in the layout designer).
          const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
          const names = new Map<string, string>();
          if (msg.slideId === DESIGN_SLIDE_ID) {
            const srcs = await this.addMasterAssets(document, conv.media.map((md) => ({ name: md.name, data: md.data })));
            conv.media.forEach((md, i) => names.set(`media/${md.name}`, srcs[i]!));
            conv.media.length = 0;
          }
          for (const md of conv.media) {
            const name = `ppt-${stamp}-${md.name}`;
            await mkdir(join(dirname(document.uri.fsPath), 'images'), { recursive: true });
            await writeFile(join(dirname(document.uri.fsPath), 'images', name), md.data);
            names.set(`media/${md.name}`, `images/${name}`);
          }
          const elements = conv.elements.map((e) => (e.type === 'image' && names.has(e.src) ? { ...e, src: names.get(e.src)! } : e));
          for (const w of conv.warnings) log.warn(w);
          send({ type: 'pasteElements', elements, warnings: conv.warnings });
          break;
        }
        case 'readClipboard':
          send({ type: 'clipboard', text: await vscode.env.clipboard.readText() });
          break;
        case 'renderReference': {
          send({ type: 'reference', slideIndex: msg.slideIndex, url: null, message: tr('Rendu PowerPoint en cours…', 'PowerPoint rendering…') });
          const png = await this.commands.renderReference(document.uri, msg.slideIndex);
          // Inline data URI: the render lives outside the webview's resource roots fixed at open time.
          send({ type: 'reference', slideIndex: msg.slideIndex, url: png ? `data:image/png;base64,${readFileSync(png.fsPath).toString('base64')}` : null, message: png ? undefined : tr('Aucun moteur de rendu local (PowerPoint ou LibreOffice) disponible.', 'No local renderer (PowerPoint or LibreOffice) available.') });
          break;
        }
        case 'newFromLayout':
          await this.commands.newFromLayout(msg.layout);
          break;
        case 'setDiffBase':
          state.diffBase = msg.base;
          await this.pushDiffBase(state, (await this.getMaster(document.uri))?.master ?? null);
          break;
        case 'review': {
          const { type: _t, requestId, ...request } = msg;
          await this.relayReview(document, send, request, requestId);
          break;
        }
        case 'listGmc': {
          const found = await vscode.workspace.findFiles('**/*.gmc', '{**/node_modules/**,**/out/**,**/dist/**}', 200);
          const dir = dirname(localPath(document.uri));
          send({ type: 'gmcFiles', files: found.map((u) => relative(dir, u.fsPath).split(sep).join('/')).sort() });
          break;
        }
        case 'insertGmc':
          if (!readOnly) await this.insertGmc(state, msg, send);
          break;
        case 'gmcOpen': {
          const file = this.diagramPath(document, msg.src);
          const name = basename(file);
          const gms = gmsEditorBundle(this.context.extension);
          if (!existsSync(file)) throw new Error(tr(`Diagramme introuvable : ${msg.src}`, `Diagram not found: ${msg.src}`));
          const open = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === file);
          send({
            type: 'gmcEditor',
            src: msg.src,
            name,
            source: open ? open.getText() : readFileSync(file, 'utf8'),
            editorJs: panel.webview.asWebviewUri(gms.js).toString(),
            editorCss: panel.webview.asWebviewUri(gms.css).toString(),
            version: gms.version,
          });
          break;
        }
        case 'gmcWrite': {
          if (readOnly) break;
          const file = this.diagramPath(document, msg.src);
          const open = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === file);
          // An open (possibly dirty) editor of the diagram receives the edit; otherwise the file is written.
          if (open) {
            if (open.getText() !== msg.source) await replaceMinimal(open, open.getText(), msg.source);
          } else await vscode.workspace.fs.writeFile(vscode.Uri.file(file), Buffer.from(msg.source, 'utf8'));
          break;
        }
        case 'gmcClose': {
          if (!msg.changed || readOnly) break;
          const file = this.diagramPath(document, msg.src);
          const open = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === file);
          // Saving an open diagram re-renders it through the onDidSave hook (extension.ts).
          if (open?.isDirty) await open.save();
          else await renderGmc(file).then(() => this.refreshImages(file));
          break;
        }
        case 'editGmc':
        case 'refreshGmc': {
          const file = this.diagramPath(document, msg.src);
          if (!existsSync(file)) throw new Error(tr(`Diagramme introuvable : ${msg.src}`, `Diagram not found: ${msg.src}`));
          if (msg.type === 'editGmc') await openGmc(file);
          else await renderGmc(file).then(() => this.refreshImages(file));
          break;
        }
      }
    } catch (e) {
      log.error('webview message failed', e);
      send({ type: 'notice', level: 'error', message: (e as Error).message });
    }
  }

  private async relayReview(document: vscode.TextDocument, send: (m: HostMessage) => void, request: { action: string; line?: number; text?: string; discussionId?: string; resolved?: boolean }, requestId?: number) {
    try {
      send({ type: 'review', requestId, action: request.action, data: await reviewRequest(document, request) });
    } catch (e) {
      send({ type: 'review', requestId, action: request.action, error: (e as Error).message });
    }
  }

  /** Absolute path of a diagram source, refused when it leaves the project. */
  private diagramPath(document: vscode.TextDocument, src: string): string {
    const local = localPath(document.uri);
    const masterDir = findMasterDir(local);
    const root = masterDir ? projectRootOf(masterDir) : (vscode.workspace.getWorkspaceFolder(vscode.Uri.file(local))?.uri.fsPath ?? dirname(local));
    const p = resolve(dirname(local), src);
    if (!isDiagramSrc(src) || !p.startsWith(resolve(root) + sep)) throw new Error(tr(`Chemin de diagramme refusé : ${src}`, `Diagram path refused: ${src}`));
    return p;
  }

  private async insertGmc(state: PanelState, msg: Extract<WebviewMessage, { type: 'insertGmc' }>, send: (m: HostMessage) => void) {
    const { document, kind } = state;
    const file = this.diagramPath(document, msg.path);
    const title = basename(file, '.gmc').replace(/[-_]+/g, ' ');
    if (msg.create) await createGmc(file, title.charAt(0).toUpperCase() + title.slice(1));
    else if (!existsSync(file)) throw new Error(tr(`Diagramme introuvable : ${msg.path}`, `Diagram not found: ${msg.path}`));

    const m = await this.getMaster(document.uri);
    if (!m) throw new Error(tr('Aucun masque corporate importé.', 'No corporate master imported.'));
    if (msg.slideId === DESIGN_SLIDE_ID) {
      // A layout cannot depend on the deck: the diagram's current rendering is copied into the master.
      await renderGmc(file);
      const png = renderedImageSrc(file);
      return this.designImages(document, [{ name: basename(png), data: readFileSync(png), alt: title }], send);
    }
    const { doc } = this.parse(document, kind, m.master);
    const slide = doc.slides.find((s) => s.id === msg.slideId);
    if (!slide) throw new Error(tr('Diapositive introuvable.', 'Slide not found.'));
    const rendered = await renderGmc(file).then(() => true, (e) => (send({ type: 'notice', level: 'warning', message: (e as Error).message }), false));
    // Fit the rendered aspect ratio into the safe area (16:10 default when the render failed).
    const sa = m.master.constraints.safeArea;
    let ratio = 1600 / 1000;
    try {
      const d = rendered ? imageSize(readFileSync(renderedImageSrc(file))) : null;
      if (d?.width && d.height) ratio = d.width / d.height;
    } catch {
      /* keep default ratio */
    }
    const w = round(Math.min(sa.w * 0.8, sa.h * 0.75 * ratio));
    const h = round(w / ratio);
    const id = uniqueId('diagram', slide.elements.map((e) => e.id));
    const src = relative(dirname(localPath(document.uri)), file).split(sep).join('/');
    const W = m.master.dimensions.width, H = m.master.dimensions.height;
    const error = await this.applyTransaction(document, kind, [{ kind: 'addElement', slideId: slide.id, element: { id, type: 'image', src, x: round((W - w) / 2), y: round((H - h) / 2 + 0.3), w, h, alt: title } }]);
    if (error) throw new Error(error);
    send({ type: 'select', slideId: slide.id, elementId: id });
    // A new diagram opens straight in the interactive editor modal.
    if (msg.create) send({ type: 'gmcEdit', src });
  }

  /** Apply validated mutations to the source document. Returns an error message, or null on success. */
  async applyTransaction(document: vscode.TextDocument, kind: SourceKind, mutations: Mutation[]): Promise<string | null> {
    const m = await this.getMaster(document.uri);
    const before = document.getText();
    let after: string;
    try {
      after = applyMutations(before, kind, mutations, m ? { dimensions: m.master.dimensions, master: m.master } : {});
    } catch (e) {
      return e instanceof MutationError ? e.message : tr(`Modification impossible : ${(e as Error).message}`, `Edit failed: ${(e as Error).message}`);
    }
    const key = document.uri.toString();
    this.applying.add(key);
    try {
      return (await replaceMinimal(document, before, after)) ? null : tr('VS Code a refusé la modification du fichier source.', 'VS Code refused to change the source file.');
    } finally {
      this.applying.delete(key);
    }
  }

  /** Files copied into the corporate master's assets; returns their `@master/<id>` sources. */
  private async addMasterAssets(document: vscode.TextDocument, files: { name: string; data: Uint8Array }[]): Promise<string[]> {
    const m = await this.getMaster(document.uri);
    if (!m) throw new Error(tr('Aucun masque corporate importé.', 'No corporate master imported.'));
    if (!files.length) return [];
    const master = structuredClone(m.master);
    await mkdir(join(m.dir, 'assets'), { recursive: true });
    const out: string[] = [];
    for (const f of files) {
      const ext = extname(f.name).toLowerCase();
      const id = uniqueId(slugify(basename(f.name, ext)) || 'image', master.assets.map((a) => a.id));
      const file = `assets/${id}${ext}`;
      await writeFile(join(m.dir, file), f.data);
      master.assets.push({ id, file, originalPart: '', format: ext.slice(1) });
      out.push(masterAssetSrc(id));
    }
    await this.writeMaster(m.dir, master);
    return out;
  }

  /** Layout designer: pictures become master assets, then elements the webview adds to the layout. */
  private async designImages(document: vscode.TextDocument, files: { name: string; data: Uint8Array; alt?: string }[], send: (m: HostMessage) => void): Promise<void> {
    const m = await this.getMaster(document.uri);
    if (!m) return;
    const srcs = await this.addMasterAssets(document, files);
    const W = m.master.dimensions.width, H = m.master.dimensions.height;
    const elements = files.map((f, i) => {
      let w = 4, h = 3;
      try {
        const d = imageSize(f.data);
        if (d.width && d.height) h = round(w * (d.height / d.width));
      } catch {
        /* keep default box */
      }
      return { id: 'image', type: 'image' as const, src: srcs[i]!, x: round((W - w) / 2), y: round((H - h) / 2), w, h, ...(f.alt ? { alt: f.alt } : {}) };
    });
    send({ type: 'pasteElements', elements, warnings: [] });
  }

  private async insertImage(document: vscode.TextDocument, kind: SourceKind, slideId: string, send: (m: HostMessage) => void) {
    const picked = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { Images: ['png', 'jpg', 'jpeg', 'gif', 'svg'] }, title: tr('Insérer une image', 'Insert a picture') });
    if (!picked?.[0]) return;
    if (slideId === DESIGN_SLIDE_ID) return this.designImages(document, [{ name: basename(picked[0].fsPath), data: readFileSync(picked[0].fsPath), alt: basename(picked[0].fsPath, extname(picked[0].fsPath)) }], send);
    const srcDir = dirname(document.uri.fsPath);
    let file = picked[0].fsPath;
    // Images outside the presentation folder are copied next to it so the deck stays self-contained.
    if (!file.startsWith(srcDir + sep)) {
      const target = join(srcDir, 'images', basename(file));
      await mkdir(dirname(target), { recursive: true });
      if (!existsSync(target)) await copyFile(file, target);
      file = target;
    }
    await this.addImage(document, kind, slideId, file, send);
  }

  /** Add an image element (4 in wide, native aspect ratio) centred on the slide and select it. */
  private async addImage(document: vscode.TextDocument, kind: SourceKind, slideId: string, file: string, send: (m: HostMessage) => void) {
    const srcDir = dirname(document.uri.fsPath);
    const rel = relative(srcDir, file).split(sep).join('/');
    const m = await this.getMaster(document.uri);
    const { doc } = this.parse(document, kind, m?.master ?? null);
    const slide = doc.slides.find((s) => s.id === slideId);
    if (!slide || !m) return;
    let w = 4, h = 3;
    try {
      const d = imageSize(readFileSync(file));
      if (d.width && d.height) h = round(w * (d.height / d.width));
    } catch {
      /* keep default box */
    }
    const id = uniqueId('image', slide.elements.map((e) => e.id));
    const W = m.master.dimensions.width, H = m.master.dimensions.height;
    const text = applyMutations(document.getText(), kind, [{ kind: 'addElement', slideId, element: { id, type: 'image', src: rel, x: round((W - w) / 2), y: round((H - h) / 2), w, h, alt: basename(file, extname(file)) } }], { dimensions: m.master.dimensions, master: m.master });
    if (await replaceMinimal(document, document.getText(), text)) send({ type: 'select', slideId, elementId: id });
  }
}

/** Zen mode settings of the slide show: whole screen, no tabs, bars or centered layout. */
const SHOW_ZEN: Record<string, unknown> = {
  fullScreen: true, showTabs: 'none', centerLayout: false, hideStatusBar: true, hideActivityBar: true, hideLineNumbers: true, silentNotifications: true,
};
let savedZen: Record<string, unknown> | undefined;
let maximizedGroup = false;

/**
 * Slide show full screen: zen mode with `SHOW_ZEN` (user values restored afterwards) and the
 * editor group maximized so other groups disappear. The webview cannot go native full screen.
 */
async function presentationMode(active: boolean): Promise<void> {
  const zen = vscode.workspace.getConfiguration('zenMode');
  if (active) {
    savedZen = Object.fromEntries(Object.keys(SHOW_ZEN).map((k) => [k, zen.inspect(k)?.globalValue]));
    for (const [k, v] of Object.entries(SHOW_ZEN)) await zen.update(k, v, vscode.ConfigurationTarget.Global);
    maximizedGroup = vscode.window.tabGroups.all.length > 1;
    if (maximizedGroup) await vscode.commands.executeCommand('workbench.action.toggleMaximizeEditorGroup');
    await vscode.commands.executeCommand('workbench.action.toggleZenMode');
    return;
  }
  await vscode.commands.executeCommand('workbench.action.toggleZenMode');
  if (maximizedGroup) await vscode.commands.executeCommand('workbench.action.toggleMaximizeEditorGroup');
  maximizedGroup = false;
  for (const [k, v] of Object.entries(savedZen ?? {})) await zen.update(k, v, vscode.ConfigurationTarget.Global);
  savedZen = undefined;
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;

/** Replace only the changed span so cursors, folding and undo granularity stay sensible. */
export async function replaceMinimal(document: vscode.TextDocument, before: string, after: string): Promise<boolean> {
  if (before === after) return true;
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endB = before.length, endA = after.length;
  while (endB > start && endA > start && before[endB - 1] === after[endA - 1]) (endB--, endA--);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(document.positionAt(start), document.positionAt(endB)), after.slice(start, endA));
  return vscode.workspace.applyEdit(edit);
}

export type { SlideDocument };
