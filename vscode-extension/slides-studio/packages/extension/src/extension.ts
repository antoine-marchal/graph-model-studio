import * as vscode from 'vscode';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import { join } from 'node:path';
import * as vm from 'node:vm';
import type * as Main from './main';

/*
 * Activation entry. The combined extension activates on Markdown too, and Slides Studio's code
 * (schemas, parser, PowerPoint import / export) costs most of the activation time: this entry only
 * registers what VS Code needs right away and loads the rest (`main.cjs`, a separate bundle) the
 * first time a presentation, a command, the masters view or a diagram save needs it.
 */

/** Every command of `main.ts`: a stand-in loads the implementation, then runs the real command. */
const COMMANDS = [
  'corporateSlides.revealReviewComment',
  'corporateSlides.toggleEditor',
  'corporateSlides.importTemplate',
  'corporateSlides.importPresentation',
  'corporateSlides.showMasters',
  'corporateSlides.newPresentation',
  'corporateSlides.openVisualEditor',
  'corporateSlides.exportPptx',
  'corporateSlides.validate',
  'corporateSlides.renderReference',
];
const VIEW_TYPES = ['corporateSlides.editor', 'corporateSlides.deck'];
const isDeck = (d?: vscode.TextDocument) => !!d && (d.languageId === 'deck' || /\.slides\.md$/i.test(d.fileName));

type Loaded = ReturnType<typeof Main.activate>;

export function activate(context: vscode.ExtensionContext) {
  let loaded: Loaded | undefined;
  const stubs: vscode.Disposable[] = [];
  const treeChanged = new vscode.EventEmitter<void>();
  const load = (): Loaded => {
    if (loaded) return loaded;
    stubs.splice(0).forEach((d) => d.dispose());
    loaded = loadMain(context.globalStorageUri.fsPath).activate(context);
    context.subscriptions.push(loaded.tree.onDidChangeTreeData(() => treeChanged.fire()));
    treeChanged.fire();
    return loaded;
  };

  for (const id of COMMANDS) stubs.push(vscode.commands.registerCommand(id, (...args: unknown[]) => (load(), vscode.commands.executeCommand(id, ...args))));
  const provider: vscode.CustomTextEditorProvider = { resolveCustomTextEditor: (doc, panel) => load().provider.resolveCustomTextEditor(doc, panel) };
  type Node = Parameters<Loaded['tree']['getTreeItem']>[0];
  const tree: vscode.TreeDataProvider<Node> = {
    onDidChangeTreeData: treeChanged.event,
    // No master in the workspace: the view shows its welcome content, nothing to load.
    getChildren: (n) => (loaded || n || hasMaster() ? load().tree.getChildren(n) : []),
    getTreeItem: (n) => load().tree.getTreeItem(n),
  };
  context.subscriptions.push(
    ...stubs.map((s) => ({ dispose: () => s.dispose() })),
    treeChanged,
    ...VIEW_TYPES.map((v) => vscode.window.registerCustomEditorProvider(v, provider, { webviewOptions: { retainContextWhenHidden: true } })),
    vscode.window.registerTreeDataProvider('corporateSlides.masters', tree),
    // Deck sources get folding (registered by main) as soon as one is shown.
    vscode.window.onDidChangeActiveTextEditor((e) => isDeck(e?.document) && load()),
    // A diagram saved before anything else loaded may still have a rendering to refresh.
    vscode.workspace.onDidSaveTextDocument((d) => !loaded && /\.gmc$/i.test(d.fileName) && load().onSave(d)),
  );
  if (vscode.window.visibleTextEditors.some((e) => isDeck(e.document))) load();

  // API used by the integration tests: same code path as webview transactions.
  return {
    findMasterDir: (from: string) => load().api.findMasterDir(from),
    applyTransaction: (...a: Parameters<Loaded['api']['applyTransaction']>) => load().api.applyTransaction(...a),
  };
}

/**
 * `main.cjs`, compiled with V8's code cache (kept in global storage, keyed by the bundle's size and
 * date): compiling its 4 MB is most of its load time. Any problem falls back to a plain `require`.
 */
function loadMain(cacheDir: string): typeof Main {
  const file = join(__dirname, 'main.cjs');
  // Dynamic `import()` inside the bundle (pptxgenjs) needs the main context's loader.
  const loader = vm.constants?.USE_MAIN_CONTEXT_DEFAULT_LOADER;
  if (!loader) return require(file);
  let script: vm.Script, cache: string, cachedData: Buffer | undefined;
  try {
    const st = statSync(file);
    cache = join(cacheDir, `slides-main-${st.size}-${Math.round(st.mtimeMs)}.v8cache`);
    cachedData = existsSync(cache) ? readFileSync(cache) : undefined;
    script = new vm.Script(Module.wrap(readFileSync(file, 'utf8')), { filename: file, cachedData, importModuleDynamically: loader });
  } catch {
    return require(file);
  }
  const m = new Module(file, module);
  m.filename = file;
  (script.runInThisContext() as (...a: unknown[]) => void)(m.exports, createRequire(file), m, file, __dirname);
  m.loaded = true;
  if (!cachedData || script.cachedDataRejected) {
    // Later, so the cache also holds the functions compiled by the first editor opening.
    setTimeout(() => {
      try {
        mkdirSync(cacheDir, { recursive: true });
        writeFileSync(cache, script.createCachedData());
        for (const f of readdirSync(cacheDir)) if (f.startsWith('slides-main-') && join(cacheDir, f) !== cache) unlinkSync(join(cacheDir, f));
      } catch {
        /* the cache is only an optimization */
      }
    }, 5000).unref?.();
  }
  return m.exports as typeof Main;
}

function hasMaster(): boolean {
  return (vscode.workspace.workspaceFolders ?? []).some((f) => existsSync(join(f.uri.fsPath, '.corporate-slides', 'master', 'corporate-master.json')));
}

export function deactivate() {}
