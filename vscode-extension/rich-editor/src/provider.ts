import * as vscode from "vscode";
import * as path from "path";
import { SETTING_KEYS } from "../webview/settings";
import { onCustomCssChange, readCustomCss } from "./customCss";
import { gmcViewNames } from "../webview/conversion-utils";
import { sendReview } from "./review";

const CONFIG_NAMESPACE = "markdownStudio";
const CURSORS_KEY = "betterMarkdown.cursors";
const CONSENT_SHOWN_KEY = "betterMarkdown.consentShown";

/** Commands the rich editor may run against its document (see "runCommand"). */
const TOOLKIT_COMMANDS = new Set([
  "gmc.openPreview",
  "gmc.exportMarkdownDiagram",
  "gmc.exportAllMarkdownDiagrams",
  "markdown-embed.update",
  "markdown-embed.updateWorkspace",
  "markdownToolkit.export",
  "betterMarkdown.insertEmbed",
  "betterMarkdown.insertLink",
  "betterMarkdown.insertToc",
  "markdownToolkit.exportHtml",
  "markdownToolkit.exportPdf",
  "markdownToolkit.exportPng",
  "markdownToolkit.exportDocx",
  "corporateSlides.openVisualEditor",
  "corporateSlides.exportPptx",
]);

/**
 * Read every known setting from VS Code config into a plain object the
 * webview can fold into `mergeSettings()`. Reading per-key (instead of
 * `config.get` on the whole namespace) keeps the payload limited to keys
 * we actually own — drive-by entries from other extensions or stale
 * configs don't leak through.
 */
function readSettings(): Record<string, unknown> {
  const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
  const out: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    const value = config.get(key);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/**
 * Persist a settings payload from the webview's in-app panel by writing
 * each changed key to User scope. We diff against the current effective
 * value to avoid kicking off 16 `onDidChangeConfiguration` events when
 * only one toggle moved.
 */
async function writeSettings(next: Record<string, unknown>): Promise<void> {
  const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
  for (const key of SETTING_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) continue;
    const incoming = next[key];
    if (config.get(key) === incoming) continue;
    await config.update(key, incoming, vscode.ConfigurationTarget.Global);
  }
}

/** Folder for assets (new .gmc files, pasted/dropped images) of `document` (markdownStudio.assetsFolder). */
function assetsFolder(document: vscode.TextDocument): vscode.Uri {
  const docDir = path.dirname(document.uri.fsPath);
  const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE, document.uri);
  // gmcFolder: former name of the setting.
  const setting = (config.get<string>("assetsFolder", "") || config.get<string>("gmcFolder", "")).trim();
  if (!setting) return vscode.Uri.file(docDir);
  const root = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath ?? docDir;
  const expanded = setting.replace(/\$\{workspaceFolder\}/g, root);
  return vscode.Uri.file(path.resolve(docDir, expanded));
}

export class BetterMarkdownProvider implements vscode.CustomTextEditorProvider {
  async revealReviewComment(uri: vscode.Uri, focus: { noteId: number; line: number }): Promise<boolean> {
    if (uri.scheme !== "pi-mr" || !uri.path.toLowerCase().endsWith(".md")) return false;
    let panels = [...(this.reviewPanels.get(uri.toString()) ?? [])].filter((panel) => panel.visible);
    if (!panels.length) {
      await vscode.commands.executeCommand("vscode.openWith", uri, "betterMarkdown.editor");
      panels = [...(this.reviewPanels.get(uri.toString()) ?? [])].filter((panel) => panel.visible);
    }
    for (const panel of panels) void panel.webview.postMessage({ type: "revealReviewComment", focus });
    return panels.length > 0;
  }
  constructor(readonly context: vscode.ExtensionContext) {
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (!e.affectsConfiguration(CONFIG_NAMESPACE)) return;
        const settings = readSettings();
        for (const wv of this.openWebviews) {
          wv.postMessage({ type: "settingsUpdated", settings });
        }
      }),
      // Deck thumbnails are rewritten in place: deck blocks reload their image.
      (() => {
        const watcher = vscode.workspace.createFileSystemWatcher("**/*.deck.png");
        const notify = () => { for (const wv of this.openWebviews) void wv.postMessage({ type: "deckThumbnailChanged" }); };
        watcher.onDidCreate(notify);
        watcher.onDidChange(notify);
        return watcher;
      })(),
      onCustomCssChange(async () => {
        const css = await readCustomCss();
        for (const wv of this.openWebviews) {
          wv.postMessage({ type: "customCss", css });
        }
      }),
    );
  }

  private activeWebview: vscode.Webview | null = null;
  private recentPanes: DiffPane[] = [];
  private openWebviews = new Set<vscode.Webview>();
  /** Most recently focused rich editor webview per document URI. */
  private webviewByUri = new Map<string, vscode.Webview>();
  private reviewPanels = new Map<string, Set<vscode.WebviewPanel>>();
  private snapshotSequence = 0;
  private readonly pendingSnapshots = new Map<string, (html: string | undefined) => void>();

  /**
   * The rendered document of an open rich editor for `uri` as standalone
   * HTML (see webview/exportSnapshot.ts), or undefined when none is open.
   */
  async exportSnapshot(uri: vscode.Uri): Promise<string | undefined> {
    const webview = this.webviewByUri.get(uri.toString());
    if (!webview) return undefined;
    const requestId = `snapshot-${++this.snapshotSequence}`;
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingSnapshots.delete(requestId);
        resolve(undefined);
      }, 30_000);
      this.pendingSnapshots.set(requestId, (html) => {
        clearTimeout(timeout);
        resolve(html);
      });
      const theme = vscode.workspace.getConfiguration(CONFIG_NAMESPACE).get<string>("exportTheme", "light");
      void webview.postMessage({ type: "exportSnapshot", requestId, theme });
    });
  }

  openSearch() {
    this.activeWebview?.postMessage({ type: "openSearch" });
  }

  toggleZen() {
    this.activeWebview?.postMessage({ type: "toggleZen" });
  }

  private activeDocUri: vscode.Uri | undefined;

  /** Document of the focused rich editor tab, if the active tab is one. */
  activeUri(): vscode.Uri | undefined {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    if (
      input instanceof vscode.TabInputCustom &&
      input.viewType === "betterMarkdown.editor" &&
      input.uri.toString() === this.activeDocUri?.toString()
    ) {
      return input.uri;
    }
    return undefined;
  }

  /** Refresh embeds of the focused rich editor's document (no graph panel). */
  async refreshActiveEmbeds(): Promise<boolean> {
    const uri = this.activeUri();
    const document = uri && vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    if (!document || !this.activeWebview) return false;
    await this.refreshEmbeds(document, this.activeWebview);
    return true;
  }

  /** Insert a raw HTML block (toolkit directive) at the rich editor caret. */
  insertDirective(text: string): boolean {
    if (!this.activeWebview) return false;
    void this.activeWebview.postMessage({ type: "insertDirective", text });
    return true;
  }

  private loadCursor(filePath: string): number | undefined {
    const all =
      this.context.globalState.get<Record<string, number>>(CURSORS_KEY, {}) ??
      {};
    return all[filePath];
  }

  private async saveCursor(filePath: string, position: number): Promise<void> {
    const all =
      this.context.globalState.get<Record<string, number>>(CURSORS_KEY, {}) ??
      {};
    all[filePath] = position;
    await this.context.globalState.update(CURSORS_KEY, all);
  }

  /**
   * Setup prompt fired the first time the rich editor opens any file
   * post-install, and re-runnable via the `Markdown Studio: Open Setup
   * Prompt` command. The actual UI is rendered inside the webview (see
   * `SetupPrompt.tsx`); this method just routes the trigger to the right
   * webview. The webview posts `setupPromptChoice` back, which is
   * handled by `applySetupChoice` below.
   */
  showFirstRunConsent(webview?: vscode.Webview): void {
    const target = webview ?? this.activeWebview;
    if (target) {
      target.postMessage({ type: "showSetupPrompt" });
      return;
    }
    // Manual command path with no markdown file open — the in-webview
    // prompt has nowhere to render. Tell the user to open a file and
    // re-run, since the on-open path will fire automatically next time.
    vscode.window.showInformationMessage(
      "Open a markdown file in the rich editor to access Markdown Studio setup.",
    );
  }

  /**
   * Apply the user's setup-prompt choice. Called from the webview
   * message handler when `setupPromptChoice` arrives. Records consent so
   * the on-open prompt doesn't re-fire. The webview opens its own
   * settings panel for `review` directly, so no host action needed.
   */
  async applySetupChoice(_choice: string): Promise<void> {
    await this.context.globalState.update(CONSENT_SHOWN_KEY, true);
  }

  /**
   * Wipe all Markdown Studio user settings + the first-run consent flag,
   * so settings revert to defaults and the welcome modal fires again on
   * the next file open. Confirms before nuking so a stray click in the
   * command palette doesn't cost the user their configuration. Clears
   * every key from User scope; workspace overrides (if any) are left
   * alone so per-repo settings still apply.
   */
  async factoryReset(): Promise<void> {
    const RESET = "Reset";
    const choice = await vscode.window.showWarningMessage(
      "Factory reset Markdown Studio? All settings revert to defaults.",
      { modal: true },
      RESET,
    );
    if (choice !== RESET) return;

    const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
    for (const key of SETTING_KEYS) {
      await config.update(key, undefined, vscode.ConfigurationTarget.Global);
    }
    await this.context.globalState.update(CONSENT_SHOWN_KEY, undefined);

    // The onDidChangeConfiguration listener above will broadcast the
    // post-reset values to every open webview.

    vscode.window.showInformationMessage(
      "Markdown Studio: factory reset complete. Open any markdown file to see the welcome prompt.",
    );
  }

  /**
   * Fetch the HEAD version of a file via VSCode's built-in git extension.
   * Returns null if git isn't available, the file isn't tracked, or the ref
   * doesn't exist (e.g. new file).
   */
  private async getHeadContent(fileUri: vscode.Uri): Promise<string | null> {
    try {
      const gitExt = vscode.extensions.getExtension("vscode.git");
      if (!gitExt) return null;
      if (!gitExt.isActive) await gitExt.activate();
      // The git extension API is un-typed in @types/vscode — loose typing.
      const gitApi = (gitExt.exports as any).getAPI(1);
      if (!gitApi) return null;
      const repo = gitApi.repositories.find((r: any) =>
        fileUri.fsPath.startsWith(r.rootUri.fsPath),
      );
      if (!repo) return null;
      // Empty ref ('') = staged, 'HEAD' = committed. We want HEAD.
      const head = await repo.show("HEAD", fileUri.fsPath);
      return typeof head === "string" ? head : null;
    } catch {
      return null;
    }
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    const webview = webviewPanel.webview;

    // Non-file schemes (git:, conflictResolution:, vscode-scm:, ...) are read-
    // only. We still render them — e.g. git diff side panes get the rich
    // Tiptap view — but we suppress edit sync so we never try to write back.
    const isReadonly = document.uri.scheme !== "file";

    // Allow loading resources from the document's folder (for images)
    const docFolder = vscode.Uri.joinPath(document.uri, "..");
    // Graph Model Studio renderer used for ```gmc diagrams in the editor.
    const gmcRuntimeDir = vscode.Uri.joinPath(this.context.extensionUri, "dist", "markdown-preview");
    // Interactive graph editor, shown in an in-editor modal (iframe).
    const gmcEditorDir = vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview");
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, "dist"),
        gmcRuntimeDir,
        gmcEditorDir,
        docFolder,
        ...(vscode.workspace.workspaceFolders?.map((f) => f.uri) || []),
      ],
    };

    // Base URI for resolving relative image paths in webview
    const baseUri = webview.asWebviewUri(docFolder).toString();
    // Raw filesystem path of the document's folder (for restoring relative paths on save)
    const docFolderPath = docFolder.fsPath;

    let pendingWebviewEdits = 0;

    // The webview sends no edit on open (no normalization rewrite); edits
    // follow VS Code's save behavior, or `saveOnEdit`.
    let saveTimer: ReturnType<typeof setTimeout> | undefined;

    // First-run setup prompt, shown once post-install.
    const consentShownAtStart =
      this.context.globalState.get<boolean>(CONSENT_SHOWN_KEY) === true;

    this.openWebviews.add(webview);
    const pane: DiffPane = { document, webview, opened: Date.now(), ready: false, key: diffKey(document.uri) };
    this.pairDiffPane(pane);

    const msgDisposable = webview.onDidReceiveMessage(async (msg) => {
      if (msg.type === "diffScroll") {
        pane.peer?.webview.postMessage({ ...msg, type: "diffScrollTo" });
        return;
      }
      if (msg.type === "review") {
        await sendReview(document, webview, msg);
        return;
      }
      if (msg.type === "ready") {
        webview.postMessage({
          type: "init",
          content: document.getText(),
          baseUri,
          docFolderPath,
          filePath: document.uri.fsPath,
          isReadonly,
          reviewEnabled: document.uri.scheme === "pi-mr",
          settings: readSettings(),
          cursorPosition: this.loadCursor(document.uri.fsPath),
          gmcRuntimeUri: webview
            .asWebviewUri(vscode.Uri.joinPath(gmcRuntimeDir, "runtime.js"))
            .toString(),
          gmcEditorUri: webview.asWebviewUri(vscode.Uri.joinPath(gmcEditorDir, "assets", "webview.js")).toString(),
          gmcEditorCssUri: webview.asWebviewUri(vscode.Uri.joinPath(gmcEditorDir, "assets", "webview.css")).toString(),
          gmcVersion: String(this.context.extension.packageJSON.version ?? ""),
        });
        webview.postMessage({ type: "customCss", css: await readCustomCss() });
        pane.ready = true;
        sendDiff(pane);
        if (document.uri.scheme === "pi-mr") void sendReview(document, webview, { action: "load" });
        // Fire the first-run setup prompt only after the webview has
        // signalled `ready` — posting earlier would land before the
        // message listener is attached and the message would be lost.
        if (!consentShownAtStart) {
          this.showFirstRunConsent(webview);
        }
      } else if (msg.type === "saveCursor") {
        if (
          typeof msg.position === "number" &&
          document.uri.scheme === "file"
        ) {
          await this.saveCursor(document.uri.fsPath, msg.position);
        }
      } else if (msg.type === "saveSettings") {
        await writeSettings(msg.settings as Record<string, unknown>);
      } else if (msg.type === "setupPromptChoice") {
        await this.applySetupChoice(msg.choice as string);
      } else if (msg.type === "requestGitDiff") {
        let headContent: string | null = null;
        if (document.uri.scheme === "file") {
          headContent = await this.getHeadContent(document.uri);
        }
        webview.postMessage({
          type: "gitDiffResponse",
          headContent,
          fileName: path.basename(document.uri.fsPath),
        });
      } else if (msg.type === "gmcViews") {
        // View names of an embedded .gmc file (embed card's view dropdown).
        let views: string[] = [];
        try {
          const file = vscode.Uri.file(path.resolve(path.dirname(document.uri.fsPath), String(msg.file)));
          views = gmcViewNames(Buffer.from(await vscode.workspace.fs.readFile(file)).toString("utf8"));
        } catch {
          // Missing file: the card falls back to a text field.
        }
        webview.postMessage({ type: "gmcViewsResult", requestId: msg.requestId, views });
      } else if (msg.type === "gmcReadFile") {
        // Embed card → interactive graph editor on the embedded .gmc file.
        let source: string | undefined;
        try {
          const file = vscode.Uri.file(path.resolve(path.dirname(document.uri.fsPath), String(msg.file)));
          source = (await vscode.workspace.openTextDocument(file)).getText();
        } catch (err) {
          vscode.window.showErrorMessage(`Markdown Studio: could not open ${msg.file}: ${err instanceof Error ? err.message : String(err)}`);
        }
        webview.postMessage({ type: "gmcReadFileResult", requestId: msg.requestId, source });
      } else if (msg.type === "gmcWriteFile") {
        // Saved from that editor: write the .gmc, then regenerate the embeds
        // (re-renders the PNG when the source hash changed).
        try {
          const file = vscode.Uri.file(path.resolve(path.dirname(document.uri.fsPath), String(msg.file)));
          const target = await vscode.workspace.openTextDocument(file);
          const source = String(msg.source);
          if (target.getText() === source && !target.isDirty) return;
          if (target.getText() !== source) {
            const edit = new vscode.WorkspaceEdit();
            edit.replace(file, new vscode.Range(0, 0, target.lineCount, 0), source);
            await vscode.workspace.applyEdit(edit);
          }
          await target.save();
          await this.refreshEmbeds(document, webview);
        } catch (err) {
          vscode.window.showErrorMessage(`Markdown Studio: could not save ${msg.file}: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else if (msg.type === "gmcExtract") {
        // GMC block → new .gmc file next to the document; reply with its
        // relative path for the embed directive.
        let file: string | undefined;
        try {
          const folder = assetsFolder(document);
          await vscode.workspace.fs.createDirectory(folder);
          const target = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.joinPath(folder, path.basename(String(msg.name || "diagram.gmc"))),
            filters: { "Graph Model": ["gmc"] },
            saveLabel: "Create and embed",
          });
          if (target) {
            const source = String(msg.source ?? "");
            await vscode.workspace.fs.writeFile(target, Buffer.from(source.endsWith("\n") ? source : `${source}\n`, "utf8"));
            const rel = path.relative(path.dirname(document.uri.fsPath), target.fsPath).replace(/\\/g, "/");
            file = rel.startsWith(".") ? rel : `./${rel}`;
          }
        } catch (err) {
          vscode.window.showErrorMessage(`Markdown Studio: could not create the .gmc file: ${err instanceof Error ? err.message : String(err)}`);
        }
        webview.postMessage({ type: "gmcExtractResult", requestId: msg.requestId, file });
      } else if (msg.type === "gmcSave") {
        // Save requests from the in-editor graph modal (export PNG/SVG/GMC…).
        const options = (msg.options ?? {}) as { defaultName?: string; filters?: { name: string; extensions: string[] }[] };
        let saved = false;
        let error: string | undefined;
        try {
          const target = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.joinPath(document.uri, "..", options.defaultName || "graph"),
            filters: options.filters
              ? Object.fromEntries(options.filters.map((f) => [f.name, f.extensions]))
              : undefined,
          });
          if (target) {
            const bytes = msg.kind === "saveText"
              ? Buffer.from(String(msg.content), "utf8")
              : Uint8Array.from(msg.content as number[]);
            await vscode.workspace.fs.writeFile(target, bytes);
            saved = true;
          }
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
        }
        webview.postMessage({ type: "gmcSaveResult", requestId: msg.requestId, saved, error });
      } else if (msg.type === "runCommand") {
        // Graph Model Studio / toolkit commands that act on this document.
        // The rich editor has no active text editor, so pass the URI (and
        // GMC fence index where relevant) explicitly.
        const command = String(msg.command);
        if (!TOOLKIT_COMMANDS.has(command)) return;
        if (command === "markdown-embed.update") {
          // Run the bundled embedder directly: another extension may own the
          // command id (e.g. a standalone Graph Model Studio that needs a text
          // editor), and this document is open in a custom editor.
          await this.refreshEmbeds(document, webview);
          return;
        }
        const args: unknown[] = [document.uri];
        if (typeof msg.blockIndex === "number") args.push(msg.blockIndex);
        try {
          await vscode.commands.executeCommand(command, ...args);
        } catch (err) {
          vscode.window.showErrorMessage(
            `Markdown Studio: ${command} failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      } else if (msg.type === "exportSnapshotResult") {
        const pending = this.pendingSnapshots.get(String(msg.requestId));
        if (!pending) return;
        this.pendingSnapshots.delete(String(msg.requestId));
        if (typeof msg.html !== "string" && msg.error) {
          vscode.window.showWarningMessage(`Markdown Studio: rendered export unavailable (${msg.error}); using the Markdown renderer.`);
        }
        pending(typeof msg.html === "string" ? msg.html : undefined);
      } else if (msg.type === "gmcRenderPngResult") {
        const pending = this.pendingPngs.get(String(msg.requestId));
        if (!pending) return;
        this.pendingPngs.delete(String(msg.requestId));
        if (typeof msg.dataUrl === "string") pending.resolve(msg.dataUrl);
        else pending.reject(new Error(String(msg.error ?? "render failed")));
      } else if (msg.type === "toggleEditor") {
        vscode.commands.executeCommand(
          "vscode.openWith",
          document.uri,
          "default",
        );
      } else if (msg.type === "openLink") {
        const href = msg.href as string;
        if (href.startsWith("http://") || href.startsWith("https://")) {
          vscode.env.openExternal(vscode.Uri.parse(href));
        } else {
          // Relative link — resolve against the document's folder
          const docDir = path.dirname(document.uri.fsPath);
          const targetPath = path.resolve(docDir, href);
          const targetUri = vscode.Uri.file(targetPath);
          try {
            await vscode.commands.executeCommand("vscode.open", targetUri);
          } catch {
            // If file doesn't exist, ignore
          }
        }
      } else if (msg.type === "openDeck") {
        // Deck block: always the Slides Studio editor (not the .deck text view).
        const target = vscode.Uri.file(path.resolve(path.dirname(document.uri.fsPath), String(msg.href)));
        try {
          await vscode.commands.executeCommand("vscode.openWith", target, "corporateSlides.editor");
        } catch (err) {
          vscode.window.showErrorMessage(`Markdown Studio: could not open ${msg.href}: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else if (msg.type === "pickDeck") {
        // Slash menu "Slide Deck": pick a .deck; its thumbnail is `<deck>.png`.
        const picked = await vscode.window.showOpenDialog({
          defaultUri: vscode.Uri.file(docFolderPath),
          canSelectMany: false,
          filters: { "Slide decks": ["deck"] },
          openLabel: "Insert deck",
        });
        const deck = picked?.[0];
        let reply: Record<string, unknown> = {};
        if (deck) {
          const rel = path.relative(docFolderPath, deck.fsPath).replace(/\\/g, "/");
          const href = rel.startsWith(".") ? rel : `./${rel}`;
          let title = path.basename(deck.fsPath, ".deck");
          try {
            const head = Buffer.from(await vscode.workspace.fs.readFile(deck)).toString("utf8").slice(0, 4000);
            title = /^---\r?\n[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m.exec(head)?.[1] ?? title;
          } catch {
            // Unreadable deck: keep the file name.
          }
          reply = { href, title, src: `${baseUri}/${rel}.png` };
          // No thumbnail yet: Slides Studio writes it when it opens the deck.
          try {
            await vscode.workspace.fs.stat(vscode.Uri.file(`${deck.fsPath}.png`));
          } catch {
            void vscode.commands.executeCommand("vscode.openWith", deck, "corporateSlides.editor", { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true });
          }
        }
        webview.postMessage({ type: "pickDeckResult", requestId: msg.requestId, ...reply });
      } else if (msg.type === "promptImageUrl") {
        const url = await vscode.window.showInputBox({
          prompt: "Image URL",
          placeHolder: "https://example.com/image.png",
        });
        webview.postMessage({ type: "imageUrlResult", url: url || null });
      } else if (msg.type === "uploadImage") {
        try {
          const data = Buffer.from(msg.data as string, "base64");
          const requested = path.basename(msg.filename as string);
          const folder = assetsFolder(document).fsPath;
          await vscode.workspace.fs.createDirectory(vscode.Uri.file(folder));
          // Find unique filename
          let finalName = requested;
          let counter = 1;
          while (true) {
            const dest = vscode.Uri.file(path.join(folder, finalName));
            try {
              await vscode.workspace.fs.stat(dest);
              const ext = path.extname(requested);
              const base = path.basename(requested, ext);
              finalName = `${base}-${counter}${ext}`;
              counter++;
            } catch {
              break; // doesn't exist, use this name
            }
          }
          const destUri = vscode.Uri.file(path.join(folder, finalName));
          await vscode.workspace.fs.writeFile(destUri, data);
          const rel = path.relative(docFolderPath, destUri.fsPath).replace(/\\/g, "/");
          webview.postMessage({
            type: "imageUploaded",
            src: `${baseUri}/${rel}`,
          });
        } catch (err: any) {
          webview.postMessage({ type: "imageUploaded", src: null });
        }
      } else if (msg.type === "edit") {
        if (isReadonly) return;
        const newContent = msg.content as string;
        if (newContent === document.getText()) return;
        pendingWebviewEdits++;
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
          document.uri,
          new vscode.Range(0, 0, document.lineCount, 0),
          newContent,
        );
        await vscode.workspace.applyEdit(edit);
        if (
          vscode.workspace.getConfiguration(CONFIG_NAMESPACE).get<boolean>("saveOnEdit", false)
        ) {
          // Save shortly after the last change (typing stays smooth).
          clearTimeout(saveTimer);
          saveTimer = setTimeout(() => {
            if (document.isDirty) document.save().then(undefined, () => {});
          }, 800);
        }
      }
    });

    webview.html = this.getHtmlForWebview(webview);

    // Track active webview for search command
    const uriKey = document.uri.toString();
    if (document.uri.scheme === "pi-mr") {
      const panels = this.reviewPanels.get(uriKey) ?? new Set<vscode.WebviewPanel>();
      panels.add(webviewPanel);
      this.reviewPanels.set(uriKey, panels);
    }
    this.webviewByUri.set(uriKey, webview);
    if (webviewPanel.active) {
      this.activeWebview = webview;
      this.activeDocUri = document.uri;
    }
    webviewPanel.onDidChangeViewState(() => {
      if (webviewPanel.active) {
        this.activeWebview = webview;
        this.activeDocUri = document.uri;
        this.webviewByUri.set(uriKey, webview);
      }
    });

    const docChangeDisposable = vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (e.document.uri.toString() !== document.uri.toString()) return;
        if (e.contentChanges.length === 0) return;
        sendDiff(pane);
        if (pane.peer) sendDiff(pane.peer);

        if (pendingWebviewEdits > 0) {
          pendingWebviewEdits--;
          return;
        }

        webview.postMessage({
          type: "update",
          content: document.getText(),
        });
      },
    );

    webviewPanel.onDidDispose(() => {
      const reviewPanels = this.reviewPanels.get(uriKey);
      reviewPanels?.delete(webviewPanel);
      if (reviewPanels?.size === 0) this.reviewPanels.delete(uriKey);
      pane.disposed = true;
      if (pane.peer) pane.peer.peer = undefined;
      msgDisposable.dispose();
      docChangeDisposable.dispose();
      this.openWebviews.delete(webview);
      if (this.webviewByUri.get(uriKey) === webview) this.webviewByUri.delete(uriKey);
    });
  }

  /**
   * VS Code's diff editor on a .md opens this editor on both sides, with no
   * API telling either side about the other. Pair two panes of the same file
   * resolved within a few seconds, at least one of them not `file:` (git:,
   * …): the non-file / earlier one is the original. Each then gets the other
   * side's text (`diffPeer`, for change marks) and scroll positions.
   */
  private pairDiffPane(pane: DiffPane): void {
    const now = Date.now();
    this.recentPanes = this.recentPanes.filter((p) => now - p.opened < 3000 && !p.peer && !p.disposed);
    const partner = this.recentPanes.find(
      (p) =>
        p.key === pane.key &&
        p.document.uri.toString() !== pane.document.uri.toString() &&
        (p.document.uri.scheme !== "file" || pane.document.uri.scheme !== "file"),
    );
    if (!partner) {
      this.recentPanes.push(pane);
      return;
    }
    partner.peer = pane;
    pane.peer = partner;
    const paneIsOriginal = pane.document.uri.scheme !== "file" && partner.document.uri.scheme === "file";
    pane.side = paneIsOriginal ? "original" : "modified";
    partner.side = paneIsOriginal ? "modified" : "original";
    sendDiff(pane);
    sendDiff(partner);
  }

  private pngSequence = 0;
  private readonly pendingPngs = new Map<string, { resolve(dataUrl: string): void; reject(error: Error): void }>();

  /**
   * Render a `.gmc` image embed in this rich editor's own (visible) webview
   * with the Markdown runtime, then write the PNG. Unlike `gmc.renderFilePng`
   * this never opens the graph panel.
   */
  private async renderPngInWebview(
    webview: vscode.Webview,
    sourceUri: vscode.Uri,
    pngUri: vscode.Uri,
    view?: string,
    theme?: string,
  ): Promise<void> {
    const source = (await vscode.workspace.openTextDocument(sourceUri)).getText();
    const config = vscode.workspace.getConfiguration("gmc.export");
    const requested = theme ?? config.get<string>("theme", "auto");
    const kind = vscode.window.activeColorTheme.kind;
    const resolvedTheme = requested === "light" || requested === "dark"
      ? requested
      : kind === vscode.ColorThemeKind.Light || kind === vscode.ColorThemeKind.HighContrastLight ? "light" : "dark";
    const requestId = `png-${++this.pngSequence}`;
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingPngs.delete(requestId);
        reject(new Error("the rich editor did not return the diagram within 60 s"));
      }, 60_000);
      this.pendingPngs.set(requestId, {
        resolve: (value) => { clearTimeout(timeout); resolve(value); },
        reject: (error) => { clearTimeout(timeout); reject(error); },
      });
      void webview.postMessage({
        type: "gmcRenderPng",
        requestId,
        source,
        view,
        theme: resolvedTheme,
        width: config.get<number>("width", 1600),
        height: config.get<number>("height", 1000),
        src: webview.asWebviewUri(pngUri).toString(),
      });
    });
    await vscode.workspace.fs.writeFile(pngUri, Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
  }

  /** Regenerate embeds / TOCs of `document` with the bundled toolkit embedder. */
  private async refreshEmbeds(document: vscode.TextDocument, webview: vscode.Webview): Promise<void> {
    try {
      const { MarkdownEmbedder } = require(
        path.join(this.context.extensionPath, "integrations", "markdown-code-embedder", "embedder.js"),
      );
      const embedder = new MarkdownEmbedder();
      embedder.renderGmcPng = (sourceUri: vscode.Uri, pngUri: vscode.Uri, view?: string, theme?: string) =>
        this.renderPngInWebview(webview, sourceUri, pngUri, view, theme);
      const edits: vscode.TextEdit[] = await embedder.generateEdits(document);
      const errors: { file: string; message: string }[] = embedder.errors;
      if (errors.length) {
        vscode.window.showErrorMessage(
          `Markdown Studio: could not update ${errors.map((e) => `${e.file} (${e.message})`).join(", ")}`,
        );
      }
      if (edits.length === 0) {
        if (errors.length) return;
        vscode.window.setStatusBarMessage("Markdown Studio: embeds are up to date", 3000);
        return;
      }
      const edit = new vscode.WorkspaceEdit();
      edit.set(document.uri, edits.sort((a, b) => b.range.start.compareTo(a.range.start)));
      await vscode.workspace.applyEdit(edit);
      vscode.window.setStatusBarMessage(`Markdown Studio: updated ${edits.length} embed(s)`, 3000);
    } catch (err) {
      vscode.window.showErrorMessage(
        `Markdown Studio: updating embeds failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "rich-editor", "webview.js"),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "rich-editor", "editor.css"),
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${webview.cspSource} 'wasm-unsafe-eval'; frame-src 'self' ${webview.cspSource} blob: data:; connect-src ${webview.cspSource}; font-src ${webview.cspSource} data:; img-src ${webview.cspSource} data: blob: https:;">
  <link href="${styleUri}" rel="stylesheet">
  <title>Markdown Studio</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

interface DiffPane {
  document: vscode.TextDocument;
  webview: vscode.Webview;
  opened: number;
  ready: boolean;
  /** Lower-cased file path (git: URIs carry it in their query). */
  key: string;
  peer?: DiffPane;
  side?: "original" | "modified";
  disposed?: boolean;
}

function diffKey(uri: vscode.Uri): string {
  let file = uri.fsPath;
  if (uri.scheme !== "file") {
    try {
      file = JSON.parse(uri.query).path ?? file;
    } catch {
      // Not a git-style query: use the path.
    }
  }
  return path.normalize(file).toLowerCase();
}

function sendDiff(pane: DiffPane): void {
  if (!pane.ready || !pane.peer) return;
  void pane.webview.postMessage({
    type: "diffPeer",
    side: pane.side,
    own: pane.document.getText(),
    other: pane.peer.document.getText(),
  });
}

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
