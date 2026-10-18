import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { Mutation, RULES, findLayout, setLocale, tr } from '@corporate-slides/core';
import { detectRenderer, importTemplate, renderPptxToPng } from '@corporate-slides/master-extractor';
import { presentationKind, sourceKindOf } from '@corporate-slides/parser';
import { BlockingDiagnosticsError, exportPptx, reportToMarkdown } from '@corporate-slides/pptx-generator';
import { findMasterDir, fsValidateOptions, importPresentation, loadMasterFor, newPresentationSource, parseWithMaster, projectRootOf } from '@corporate-slides/cli';
import { SlidesEditorProvider } from './editorProvider';
import { MasterBrowserPanel, MasterTreeProvider, workspaceMasterDir } from './masters';
import { log } from './log';
import { renderGmc } from './gmc';
import { renderedImageSrc } from '@corporate-slides/core';

export function activate(context: vscode.ExtensionContext) {
  setLocale(vscode.env.language);
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
    if (errors.length) throw new Error(`${tr('La source contient des erreurs', 'The source contains errors')} : ${errors[0]}`);
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
      const force = tr('Exporter quand même', 'Export anyway');
      const choice = await vscode.window.showWarningMessage(tr(`Export bloqué : ${e.diagnostics.length} erreur(s) de charte. ${e.diagnostics[0]!.message}`, `Export blocked: ${e.diagnostics.length} brand error(s). ${e.diagnostics[0]!.message}`), { modal: true }, force);
      if (choice !== force) return null;
      report = await run(true);
    }
    const reportPath = output.replace(/\.pptx$/, '.report.md');
    await writeFile(reportPath, reportToMarkdown(report, master));
    await writeFile(output.replace(/\.pptx$/, '.report.json'), JSON.stringify(report, null, 2));
    log.info(`Export ${output}`, report.stats);
    if (!opts.silent) {
      const s = report.stats;
      const openReport = tr('Ouvrir le rapport', 'Open report');
      const reveal = tr('Afficher le fichier', 'Reveal file');
      // Not awaited: the command completes as soon as the file is written.
      void vscode.window
        .showInformationMessage(
          tr(
            `PowerPoint généré : ${basename(output)} — ${s.slides} diapositives, ${s.nativeText} textes et ${s.nativeShapes} formes natifs, ${report.diagnostics.length} diagnostic(s).`,
            `PowerPoint generated: ${basename(output)} — ${s.slides} slides, ${s.nativeText} native texts and ${s.nativeShapes} native shapes, ${report.diagnostics.length} diagnostic(s).`,
          ),
          openReport,
          reveal,
        )
        .then((choice) => {
          if (choice === openReport) void vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(reportPath));
          if (choice === reveal) void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(output));
        });
    }
    return output;
  };

  /** New presentations are always `.deck` files (Markdown + YAML), opened in the visual editor. */
  const newFromLayout = async (layout?: string) => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) return void vscode.window.showErrorMessage(tr('Ouvrez un dossier de projet pour créer une présentation.', 'Open a project folder to create a presentation.'));
    let master;
    try {
      ({ master } = await loadMasterFor(join(folder.uri.fsPath, 'x.deck')));
    } catch {
      const importTpl = tr('Importer un gabarit', 'Import a template');
      const importPres = tr('Importer une présentation', 'Import a presentation');
      const pick = await vscode.window.showWarningMessage(tr('Aucun masque corporate importé.', 'No corporate master imported yet.'), importTpl, importPres);
      if (pick === importTpl) await vscode.commands.executeCommand('corporateSlides.importTemplate');
      if (pick === importPres) await vscode.commands.executeCommand('corporateSlides.importPresentation');
      return;
    }
    if (!layout) {
      const items = master.layouts.map((l) => ({ label: l.name, description: [l.id, ...l.aliases].join(' · '), detail: `${tr('Espaces réservés', 'Placeholders')} : ${l.placeholders.map((p) => p.key).join(', ') || tr('aucun', 'none')}`, id: l.aliases[0] ?? l.id }));
      const content = findLayout(master, 'content');
      items.sort((a, b) => (b.id === (content?.aliases[0] ?? content?.id) ? 1 : 0) - (a.id === (content?.aliases[0] ?? content?.id) ? 1 : 0));
      const picked = await vscode.window.showQuickPick(items, { title: tr('Disposition corporate des diapositives de contenu', 'Corporate layout of the content slides'), matchOnDescription: true });
      if (!picked) return;
      layout = picked.id;
    }
    const title = await vscode.window.showInputBox({ title: tr('Titre de la présentation', 'Presentation title'), value: tr('Nouvelle présentation', 'New presentation') });
    if (title === undefined) return;
    const slug = title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'presentation';
    let target = vscode.Uri.joinPath(folder.uri, 'presentations', `${slug}.deck`);
    for (let i = 2; existsSync(target.fsPath); i++) target = vscode.Uri.joinPath(folder.uri, 'presentations', `${slug}-${i}.deck`);
    await vscode.workspace.fs.writeFile(target, Buffer.from(newPresentationSource(target.fsPath, master, title, layout), 'utf8'));
    await vscode.commands.executeCommand('vscode.openWith', target, SlidesEditorProvider.deckViewType);
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

  const provider = new SlidesEditorProvider(context, diagnostics, {
    exportPptx: async (uri) => void (await exportUri(uri)),
    renderReference,
    newFromLayout: (l) => newFromLayout(l),
  });

  const guard = (fn: (...a: never[]) => Promise<unknown>) => async (...a: never[]) => {
    try {
      await fn(...a);
    } catch (e) {
      log.error('command failed', e);
      void vscode.window.showErrorMessage(`Corporate Slides : ${(e as Error).message}`, tr('Journal', 'Log')).then((c) => c && log.show());
    }
  };

  /** A `.pptx` / `.potx` of the workspace (proposed first), or one picked from disk. */
  const pickPowerPoint = async (title: string, arg?: vscode.Uri): Promise<string | undefined> => {
    if (arg?.fsPath) return arg.fsPath;
    const folder = vscode.workspace.workspaceFolders?.[0];
    const found = await vscode.workspace.findFiles('**/*.{pptx,potx}', '{**/node_modules/**,**/out/**,**/dist/**,**/.corporate-slides/**}', 50);
    const items: (vscode.QuickPickItem & { path?: string })[] = found
      .filter((u) => !basename(u.fsPath).startsWith('~$'))
      .map((u) => ({ label: basename(u.fsPath), description: folder ? relative(folder.uri.fsPath, dirname(u.fsPath)) || '.' : dirname(u.fsPath), path: u.fsPath }));
    items.push({ label: `$(folder-opened) ${tr('Parcourir…', 'Browse…')}` });
    const pick = items.length === 2 && items[0]!.path ? items[0] : await vscode.window.showQuickPick(items, { title });
    if (!pick) return undefined;
    return pick.path ?? (await vscode.window.showOpenDialog({ filters: { PowerPoint: ['pptx', 'potx'] }, canSelectMany: false, title }))?.[0]?.fsPath;
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
      if (!uri) throw new Error(tr('Aucune présentation active.', 'No active presentation.'));
      await vscode.commands.executeCommand('vscode.openWith', uri, /\.deck$/i.test(uri.path) ? SlidesEditorProvider.deckViewType : SlidesEditorProvider.viewType);
    })),
    vscode.window.registerTreeDataProvider('corporateSlides.masters', tree),

    vscode.commands.registerCommand('corporateSlides.importTemplate', guard(async (arg?: vscode.Uri) => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) throw new Error(tr('Ouvrez un dossier de projet avant d’importer un gabarit.', 'Open a project folder before importing a template.'));
      const file = await pickPowerPoint(tr('Gabarit PowerPoint corporate à importer', 'Corporate PowerPoint template to import'), arg);
      if (!file) return;
      const thumbnails = vscode.workspace.getConfiguration('corporateSlides').get<boolean>('referenceThumbnails', true);
      const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: tr('Import du gabarit corporate', 'Importing the corporate template'), cancellable: false }, (progress) =>
        importTemplate(file, folder.uri.fsPath, { thumbnails, log: (m) => (progress.report({ message: m }), log.info(m)) }),
      );
      provider.invalidateMasters();
      await tree.refresh();
      await MasterBrowserPanel.show(context, (l) => void newFromLayout(l));
      for (const n of result.notes) log.warn(n);
      void vscode.window.showInformationMessage(tr(`Gabarit importé : ${result.master.layouts.length} dispositions, méthode « définitions reconstruites ». Rapports dans ${relative(folder.uri.fsPath, result.outDir)}.`, `Template imported: ${result.master.layouts.length} layouts, “reconstructed definitions” method. Reports in ${relative(folder.uri.fsPath, result.outDir)}.`));
    })),

    // PowerPoint presentation → <name>/<name>.deck + <name>/.corporate-slides/master (its own masters) + media.
    vscode.commands.registerCommand('corporateSlides.importPresentation', guard(async (arg?: vscode.Uri) => {
      const file = await pickPowerPoint(tr('Présentation PowerPoint à convertir en .deck', 'PowerPoint presentation to convert to .deck'), arg);
      if (!file) return;
      const name = basename(file).replace(/\.(pptx|potx)$/i, '');
      let outDir = join(dirname(file), name);
      for (let i = 2; existsSync(join(outDir, `${name}.deck`)); i++) outDir = join(dirname(file), `${name}-${i}`);
      const thumbnails = vscode.workspace.getConfiguration('corporateSlides').get<boolean>('referenceThumbnails', true);
      const r = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: tr(`Import de ${basename(file)}`, `Importing ${basename(file)}`), cancellable: false }, (progress) =>
        importPresentation(file, outDir, { thumbnails, log: (m) => (progress.report({ message: m }), log.info(m)) }),
      );
      for (const w of r.warnings) log.warn(w);
      provider.invalidateMasters();
      await tree.refresh();
      await vscode.commands.executeCommand('vscode.openWith', vscode.Uri.file(r.deckPath), SlidesEditorProvider.deckViewType);
      const openReport = tr('Voir le rapport', 'View report');
      void vscode.window
        .showInformationMessage(
          tr(
            `${basename(file)} converti : ${r.stats.slides} diapositives, ${r.stats.elements} éléments natifs${r.warnings.length ? `, ${r.warnings.length} point(s) d’attention` : ''}. Masques dans ${basename(outDir)}/.corporate-slides.`,
            `${basename(file)} converted: ${r.stats.slides} slides, ${r.stats.elements} native elements${r.warnings.length ? `, ${r.warnings.length} thing(s) to check` : ''}. Masters in ${basename(outDir)}/.corporate-slides.`,
          ),
          openReport,
        )
        .then((c) => c && void vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(r.reportPath)));
    })),

    vscode.commands.registerCommand('corporateSlides.showMasters', guard(async (layoutId?: string) => MasterBrowserPanel.show(context, (l) => void newFromLayout(l), typeof layoutId === 'string' ? layoutId : undefined))),
    vscode.commands.registerCommand('corporateSlides.newPresentation', guard(() => newFromLayout())),
    vscode.commands.registerCommand('corporateSlides.openVisualEditor', guard(async (arg?: vscode.Uri) => {
      const uri = targetUri(arg);
      if (!uri) throw new Error(tr('Ouvrez un fichier .deck.', 'Open a .deck file.'));
      if (/\.deck$/i.test(uri.path)) return void (await vscode.commands.executeCommand('vscode.openWith', uri, SlidesEditorProvider.deckViewType));
      await vscode.commands.executeCommand('vscode.openWith', uri, SlidesEditorProvider.viewType, vscode.ViewColumn.Beside);
    })),
    vscode.commands.registerCommand('corporateSlides.exportPptx', guard(async (arg?: vscode.Uri) => {
      const uri = targetUri(arg);
      if (!uri) throw new Error(tr('Aucune présentation active.', 'No active presentation.'));
      const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
      if (doc?.isDirty) await doc.save();
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: tr('Export PowerPoint…', 'Exporting to PowerPoint…') }, () => exportUri(uri));
    })),
    vscode.commands.registerCommand('corporateSlides.validate', guard(async (arg?: vscode.Uri) => {
      const uri = targetUri(arg);
      if (!uri) throw new Error(tr('Aucune présentation active.', 'No active presentation.'));
      const document = await vscode.workspace.openTextDocument(uri);
      const { masterDir, master, doc, errors } = await loadOpen(uri);
      const { validateDocument } = await import('@corporate-slides/core');
      const diags = validateDocument(doc, master, fsValidateOptions(uri.fsPath, projectRootOf(masterDir)));
      provider.publishDiagnostics(document, diags, errors);
      const n = diags.filter((d) => d.severity === 'error').length + errors.length;
      const warns = diags.length - diags.filter((d) => d.severity === 'error').length;
      void vscode.window.showInformationMessage(n || diags.length ? tr(`${n} erreur(s), ${warns} avertissement(s) — voir le panneau Problèmes.`, `${n} error(s), ${warns} warning(s) — see the Problems panel.`) : tr('Présentation conforme à la charte.', 'Presentation complies with the brand guidelines.'));
      if (diags.length || errors.length) await vscode.commands.executeCommand('workbench.actions.view.problems');
      log.info('validation', diags.map((d) => `${RULES[d.rule]?.label}: ${d.message}`));
    })),
    vscode.commands.registerCommand('corporateSlides.renderReference', guard(async (arg?: vscode.Uri) => {
      const uri = targetUri(arg);
      if (!uri) throw new Error(tr('Aucune présentation active.', 'No active presentation.'));
      if (detectRenderer().kind === 'none') throw new Error(tr('Aucun moteur de rendu local : installez PowerPoint (Windows) ou LibreOffice.', 'No local renderer: install PowerPoint (Windows) or LibreOffice.'));
      const out = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: tr('Rendu de référence…', 'Reference rendering…') }, () => exportUri(uri, { silent: true }));
      if (!out) return;
      const r = await renderPptxToPng(out, out.replace(/\.pptx$/, '-png'));
      if (r.files[0]) await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(r.files[0]));
      const engine = r.renderer === 'powerpoint' ? 'PowerPoint' : 'LibreOffice';
      void vscode.window.showInformationMessage(tr(`${r.files.length} diapositive(s) rendue(s) par ${engine}.`, `${r.files.length} slide(s) rendered by ${engine}.`));
    })),

    vscode.workspace.onDidSaveTextDocument((d) => {
      // A saved diagram source re-renders its PNG when a deck uses it (or a rendering already exists).
      if (/\.gmc$/i.test(d.fileName) && (provider.referencedDiagrams().has(d.fileName) || existsSync(renderedImageSrc(d.fileName)))) {
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

  log.info(`Corporate Slides Studio ${tr('activé', 'activated')} (${tr('masque', 'master')} : ${workspaceMasterDir() ?? tr('aucun', 'none')}).`);
  // API used by the integration tests: same code path as webview transactions.
  return {
    findMasterDir,
    applyTransaction: async (uri: vscode.Uri, mutations: Mutation[]) =>
      provider.applyTransaction(await vscode.workspace.openTextDocument(uri), presentationKind(uri.fsPath)!, Mutation.array().parse(mutations)),
  };
}

export function deactivate() {}
