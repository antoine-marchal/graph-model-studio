import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { existsSync as exists } from 'node:fs';
import { Mutation, RULES, findLayout } from '@corporate-slides/core';
import { detectRenderer, importTemplate, renderPptxToPng } from '@corporate-slides/master-extractor';
import { documentToDsl, presentationKind, sourceKindOf } from '@corporate-slides/parser';
import { BlockingDiagnosticsError, exportPptx, reportToMarkdown } from '@corporate-slides/pptx-generator';
import { findMasterDir, fsValidateOptions, loadMasterFor, newPresentationSource, parseWithMaster, projectRootOf } from '@corporate-slides/cli';
import { SlidesEditorProvider } from './editorProvider';
import { MasterBrowserPanel, MasterTreeProvider, workspaceMasterDir } from './masters';
import { log } from './log';
import { renderGmc } from './gmc';
import { renderedImageSrc } from '@corporate-slides/core';

export function activate(context: vscode.ExtensionContext) {
  const diagnostics = vscode.languages.createDiagnosticCollection('corporate-slides');
  const tree = new MasterTreeProvider();
  void tree.refresh();

  /** Resolve the presentation targeted by a command (argument, active text editor or active custom editor). */
  const targetUri = (arg?: vscode.Uri): vscode.Uri | undefined => {
    if (arg instanceof vscode.Uri) return arg;
    const ed = vscode.window.activeTextEditor?.document.uri;
    if (ed && sourceKindOf(ed.fsPath)) return ed;
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    if (tab instanceof vscode.TabInputCustom && sourceKindOf(tab.uri.fsPath)) return tab.uri;
    return undefined;
  };

  const loadOpen = async (uri: vscode.Uri) => {
    const text = (await vscode.workspace.openTextDocument(uri)).getText();
    const { masterDir, master } = await loadMasterFor(uri.fsPath);
    const kind = presentationKind(uri.fsPath)!;
    const { doc, errors } = parseWithMaster(text, kind, master);
    return { masterDir, master, doc, errors, kind };
  };

  const exportUri = async (uri: vscode.Uri, opts: { silent?: boolean; output?: string } = {}) => {
    const { masterDir, master, doc, errors } = await loadOpen(uri);
    if (errors.length) throw new Error(`La source contient des erreurs : ${errors[0]}`);
    const folder = vscode.workspace.getConfiguration('corporateSlides').get<string>('exportFolder', 'out');
    const name = basename(uri.fsPath).replace(/\.(slides\.(md|ya?ml|json)|deck|md|markdown)$/i, '');
    const output = opts.output ?? join(dirname(uri.fsPath), folder, `${name}.pptx`);
    const run = (force: boolean) =>
      exportPptx(doc, master, { output, masterDir, sourceDir: dirname(uri.fsPath), force, ...fsValidateOptions(uri.fsPath, projectRootOf(masterDir)) });
    let report;
    try {
      report = await run(false);
    } catch (e) {
      if (!(e instanceof BlockingDiagnosticsError) || opts.silent) throw e;
      const choice = await vscode.window.showWarningMessage(`Export bloqué : ${e.diagnostics.length} erreur(s) de charte. ${e.diagnostics[0]!.message}`, { modal: true }, 'Exporter quand même');
      if (choice !== 'Exporter quand même') return null;
      report = await run(true);
    }
    const reportPath = output.replace(/\.pptx$/, '.report.md');
    await writeFile(reportPath, reportToMarkdown(report, master));
    await writeFile(output.replace(/\.pptx$/, '.report.json'), JSON.stringify(report, null, 2));
    log.info(`Export ${output}`, report.stats);
    if (!opts.silent) {
      const s = report.stats;
      // Not awaited: the command completes as soon as the file is written.
      void vscode.window
        .showInformationMessage(
          `PowerPoint généré : ${basename(output)} — ${s.slides} diapositives, ${s.nativeText} textes et ${s.nativeShapes} formes natifs, ${report.diagnostics.length} diagnostic(s).`,
          'Ouvrir le rapport',
          'Afficher le fichier',
        )
        .then((choice) => {
          if (choice === 'Ouvrir le rapport') void vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(reportPath));
          if (choice === 'Afficher le fichier') void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(output));
        });
    }
    return output;
  };

  const newFromLayout = async (layout?: string) => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return void vscode.window.showErrorMessage('Ouvrez un dossier de projet pour créer une présentation.');
    let master;
    try {
      ({ master } = await loadMasterFor(join(folder.uri.fsPath, 'x.slides.md')));
    } catch {
      const pick = await vscode.window.showWarningMessage('Aucun masque corporate importé.', 'Importer un gabarit');
      if (pick) await vscode.commands.executeCommand('corporateSlides.importTemplate');
      return;
    }
    const format = await vscode.window.showQuickPick(
      [
        { label: 'Deck', description: '.deck — Markdown + YAML, ouvert dans l’éditeur visuel', ext: '.deck' },
        { label: 'Markdown', description: '.slides.md — contenu narratif', ext: '.slides.md' },
        { label: 'DSL déclaratif', description: '.slides.yaml — positionnement précis', ext: '.slides.yaml' },
      ],
      { title: 'Nouvelle présentation — format source' },
    );
    if (!format) return;
    if (!layout) {
      const items = master.layouts.map((l) => ({ label: l.name, description: [l.id, ...l.aliases].join(' · '), detail: `Espaces réservés : ${l.placeholders.map((p) => p.key).join(', ') || 'aucun'}`, id: l.aliases[0] ?? l.id }));
      const content = findLayout(master, 'content');
      items.sort((a, b) => (b.id === (content?.aliases[0] ?? content?.id) ? 1 : 0) - (a.id === (content?.aliases[0] ?? content?.id) ? 1 : 0));
      const picked = await vscode.window.showQuickPick(items, { title: 'Disposition corporate des diapositives de contenu', matchOnDescription: true });
      if (!picked) return;
      layout = picked.id;
    }
    const title = await vscode.window.showInputBox({ title: 'Titre de la présentation', value: 'Nouvelle présentation' });
    if (title === undefined) return;
    const slug = title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'presentation';
    let target = vscode.Uri.joinPath(folder.uri, 'presentations', `${slug}${format.ext}`);
    for (let i = 2; existsSync(target.fsPath); i++) target = vscode.Uri.joinPath(folder.uri, 'presentations', `${slug}-${i}${format.ext}`);
    await vscode.workspace.fs.writeFile(target, Buffer.from(newPresentationSource(target.fsPath, master, title, layout), 'utf8'));
    if (format.ext === '.deck') return void (await vscode.commands.executeCommand('vscode.openWith', target, SlidesEditorProvider.deckViewType));
    await vscode.window.showTextDocument(target, { viewColumn: vscode.ViewColumn.One });
    await vscode.commands.executeCommand('vscode.openWith', target, SlidesEditorProvider.viewType, vscode.ViewColumn.Beside);
  };

  const renderReference = async (uri: vscode.Uri, slideIndex: number): Promise<vscode.Uri | null> => {
    if (detectRenderer().kind === 'none') return null;
    await vscode.workspace.fs.createDirectory(context.globalStorageUri);
    const dir = await mkdtemp(join(context.globalStorageUri.fsPath, 'ref-'));
    const out = await exportUri(uri, { silent: true, output: join(dir, 'reference.pptx') }).catch((e) => {
      if (e instanceof BlockingDiagnosticsError) return null;
      throw e;
    });
    if (!out) return null;
    const r = await renderPptxToPng(out, join(dir, 'png'));
    const f = r.files[slideIndex];
    return f ? vscode.Uri.file(f) : null;
  };

  const convertToDsl = async (uri: vscode.Uri) => {
    if (sourceKindOf(uri.fsPath) !== 'markdown') return void vscode.window.showInformationMessage('Le fichier est déjà au format DSL.');
    const { doc } = await loadOpen(uri);
    const target = vscode.Uri.file(uri.fsPath.replace(/\.(slides\.md|deck)$/i, '.slides.yaml'));
    if (existsSync(target.fsPath)) return void vscode.window.showErrorMessage(`${basename(target.fsPath)} existe déjà.`);
    await vscode.workspace.fs.writeFile(target, Buffer.from(documentToDsl(doc), 'utf8'));
    await vscode.window.showTextDocument(target);
    void vscode.window.showInformationMessage('Conversion explicite effectuée : la géométrie de chaque élément est désormais exprimée dans le DSL. Le fichier Markdown est conservé.');
  };

  const provider = new SlidesEditorProvider(context, diagnostics, {
    exportPptx: async (uri) => void (await exportUri(uri)),
    renderReference,
    convertToDsl,
    newFromLayout: (l) => newFromLayout(l),
  });

  const guard = (fn: (...a: never[]) => Promise<unknown>) => async (...a: never[]) => {
    try {
      await fn(...a);
    } catch (e) {
      log.error('command failed', e);
      void vscode.window.showErrorMessage(`Corporate Slides : ${(e as Error).message}`, 'Journal').then((c) => c && log.show());
    }
  };

  context.subscriptions.push(
    diagnostics,
    vscode.window.registerCustomEditorProvider(SlidesEditorProvider.viewType, provider, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.window.registerCustomEditorProvider(SlidesEditorProvider.deckViewType, provider, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand('corporateSlides.revealReviewComment', (uri: vscode.Uri, focus: { noteId: number; line: number }) => provider.revealReviewComment(uri, focus)),
    vscode.commands.registerCommand('corporateSlides.toggleEditor', guard(async () => {
      const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
      if (input instanceof vscode.TabInputCustom && sourceKindOf(input.uri.path)) return void (await vscode.commands.executeCommand('vscode.openWith', input.uri, 'default'));
      const uri = targetUri();
      if (!uri) throw new Error('Aucune présentation active.');
      await vscode.commands.executeCommand('vscode.openWith', uri, /\.deck$/i.test(uri.path) ? SlidesEditorProvider.deckViewType : SlidesEditorProvider.viewType);
    })),
    vscode.window.registerTreeDataProvider('corporateSlides.masters', tree),

    vscode.commands.registerCommand('corporateSlides.importTemplate', guard(async (arg?: vscode.Uri) => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) throw new Error('Ouvrez un dossier de projet avant d’importer un gabarit.');
      let file = arg?.fsPath;
      if (!file) {
        const found = await vscode.workspace.findFiles('**/*.{pptx,potx}', '{**/node_modules/**,**/out/**,**/dist/**,**/.corporate-slides/**}', 50);
        const items: (vscode.QuickPickItem & { path?: string })[] = found
          .filter((u) => !basename(u.fsPath).startsWith('~$'))
          .map((u) => ({ label: basename(u.fsPath), description: relative(folder.uri.fsPath, dirname(u.fsPath)) || '.', path: u.fsPath }));
        items.push({ label: '$(folder-opened) Parcourir…' });
        const pick = items.length === 2 && items[0]!.path ? items[0] : await vscode.window.showQuickPick(items, { title: 'Gabarit PowerPoint corporate à importer' });
        if (!pick) return;
        file = pick.path ?? (await vscode.window.showOpenDialog({ filters: { PowerPoint: ['pptx', 'potx'] }, canSelectMany: false }))?.[0]?.fsPath;
        if (!file) return;
      }
      const thumbnails = vscode.workspace.getConfiguration('corporateSlides').get<boolean>('referenceThumbnails', true);
      const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Import du gabarit corporate', cancellable: false }, (progress) =>
        importTemplate(file!, folder.uri.fsPath, { thumbnails, log: (m) => (progress.report({ message: m }), log.info(m)) }),
      );
      provider.invalidateMasters();
      await tree.refresh();
      await MasterBrowserPanel.show(context, (l) => void newFromLayout(l));
      for (const n of result.notes) log.warn(n);
      void vscode.window.showInformationMessage(`Gabarit importé : ${result.master.layouts.length} dispositions, méthode « définitions reconstruites ». Rapports dans ${relative(folder.uri.fsPath, result.outDir)}.`);
    })),

    vscode.commands.registerCommand('corporateSlides.showMasters', guard(async (layoutId?: string) => MasterBrowserPanel.show(context, (l) => void newFromLayout(l), typeof layoutId === 'string' ? layoutId : undefined))),
    vscode.commands.registerCommand('corporateSlides.newPresentation', guard(() => newFromLayout())),
    vscode.commands.registerCommand('corporateSlides.openVisualEditor', guard(async (arg?: vscode.Uri) => {
      const uri = targetUri(arg);
      if (!uri) throw new Error('Ouvrez un fichier .deck, .slides.md ou .slides.yaml.');
      if (/\.deck$/i.test(uri.path)) return void (await vscode.commands.executeCommand('vscode.openWith', uri, SlidesEditorProvider.deckViewType));
      await vscode.commands.executeCommand('vscode.openWith', uri, SlidesEditorProvider.viewType, vscode.ViewColumn.Beside);
    })),
    vscode.commands.registerCommand('corporateSlides.exportPptx', guard(async (arg?: vscode.Uri) => {
      const uri = targetUri(arg);
      if (!uri) throw new Error('Aucune présentation active.');
      const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
      if (doc?.isDirty) await doc.save();
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Export PowerPoint…' }, () => exportUri(uri));
    })),
    vscode.commands.registerCommand('corporateSlides.validate', guard(async (arg?: vscode.Uri) => {
      const uri = targetUri(arg);
      if (!uri) throw new Error('Aucune présentation active.');
      const document = await vscode.workspace.openTextDocument(uri);
      const { masterDir, master, doc, errors } = await loadOpen(uri);
      const { validateDocument } = await import('@corporate-slides/core');
      const diags = validateDocument(doc, master, fsValidateOptions(uri.fsPath, projectRootOf(masterDir)));
      provider.publishDiagnostics(document, diags, errors);
      const n = diags.filter((d) => d.severity === 'error').length + errors.length;
      void vscode.window.showInformationMessage(n || diags.length ? `${n} erreur(s), ${diags.length - diags.filter((d) => d.severity === 'error').length} avertissement(s) — voir le panneau Problèmes.` : 'Présentation conforme à la charte.');
      if (diags.length || errors.length) await vscode.commands.executeCommand('workbench.actions.view.problems');
      log.info('validation', diags.map((d) => `${RULES[d.rule]?.label}: ${d.message}`));
    })),
    vscode.commands.registerCommand('corporateSlides.convertToDsl', guard(async (arg?: vscode.Uri) => {
      const uri = targetUri(arg);
      if (uri) await convertToDsl(uri);
    })),
    vscode.commands.registerCommand('corporateSlides.renderReference', guard(async (arg?: vscode.Uri) => {
      const uri = targetUri(arg);
      if (!uri) throw new Error('Aucune présentation active.');
      if (detectRenderer().kind === 'none') throw new Error('Aucun moteur de rendu local : installez PowerPoint (Windows) ou LibreOffice.');
      const out = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Rendu de référence…' }, () => exportUri(uri, { silent: true }));
      if (!out) return;
      const r = await renderPptxToPng(out, out.replace(/\.pptx$/, '-png'));
      if (r.files[0]) await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(r.files[0]));
      void vscode.window.showInformationMessage(`${r.files.length} diapositive(s) rendue(s) par ${r.renderer === 'powerpoint' ? 'PowerPoint' : 'LibreOffice'}.`);
    })),

    vscode.workspace.onDidSaveTextDocument((d) => {
      // A saved diagram source re-renders its PNG when a deck uses it (or a rendering already exists).
      if (/\.gmc$/i.test(d.fileName) && (provider.referencedDiagrams().has(d.fileName) || exists(renderedImageSrc(d.fileName)))) {
        void renderGmc(d.fileName).then(() => provider.refreshImages(d.fileName), (e) => log.error('gmc render', e));
      }
      if (d.fileName.endsWith('corporate-master.json')) {
        provider.invalidateMasters();
        void tree.refresh();
      }
    }),
  );

  const watcher = vscode.workspace.createFileSystemWatcher('**/.corporate-slides/master/corporate-master.json');
  const onMasterChange = () => {
    provider.invalidateMasters();
    void tree.refresh();
    void MasterBrowserPanel.refresh();
  };
  watcher.onDidChange(onMasterChange);
  watcher.onDidCreate(onMasterChange);
  watcher.onDidDelete(onMasterChange);
  context.subscriptions.push(watcher);

  log.info(`Corporate Slides Studio activé (masque : ${workspaceMasterDir() ?? 'aucun'}).`);
  // API used by the integration tests: same code path as webview transactions.
  return {
    findMasterDir,
    applyTransaction: async (uri: vscode.Uri, mutations: Mutation[]) =>
      provider.applyTransaction(await vscode.workspace.openTextDocument(uri), presentationKind(uri.fsPath)!, Mutation.array().parse(mutations)),
  };
}

export function deactivate() {}
