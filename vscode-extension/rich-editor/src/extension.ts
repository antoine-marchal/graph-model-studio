import { registerMasterView } from "./masterTree";
import * as vscode from "vscode";
import * as path from "path";
import { BetterMarkdownProvider } from "./provider";
import { BetterMarkdownDiffPanel } from "./diffPanel";
import { SETTING_KEYS } from "../webview/settings";
import { registerDirectiveCommands } from "./directives";
import { exportDocx, preflight } from "./exportDocx";

const CUSTOM_EDITOR_VIEW_TYPE = "betterMarkdown.editor";
const LEGACY_SETTINGS_KEY = "betterMarkdown.settings";
const MIGRATION_DONE_KEY = "betterMarkdown.configMigrated";

/**
 * One-shot migration: pre-2.3.5 builds stored settings in globalState
 * under `betterMarkdown.settings`. We now own a `contributes.configuration`
 * block, so settings live in `vscode.workspace.getConfiguration()`. Copy
 * any stored values into User scope (only when the user hasn't already
 * set a value via Settings UI), then clear the legacy key. Idempotent —
 * gated on a separate flag so re-runs are no-ops even if a user
 * deliberately wipes a key back to its default.
 */
async function migrateLegacySettings(
  context: vscode.ExtensionContext,
): Promise<void> {
  if (context.globalState.get<boolean>(MIGRATION_DONE_KEY) === true) return;
  const legacy = context.globalState.get<Record<string, unknown>>(
    LEGACY_SETTINGS_KEY,
  );
  if (legacy && typeof legacy === "object") {
    const config = vscode.workspace.getConfiguration("markdownStudio");
    for (const key of SETTING_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(legacy, key)) continue;
      const inspect = config.inspect(key);
      if (inspect?.globalValue !== undefined) continue;
      try {
        await config.update(
          key,
          legacy[key],
          vscode.ConfigurationTarget.Global,
        );
      } catch {
        // Skip individual keys that fail validation (e.g. enum mismatch
        // from an older build); the rest still migrate.
      }
    }
  }
  await context.globalState.update(LEGACY_SETTINGS_KEY, undefined);
  await context.globalState.update(MIGRATION_DONE_KEY, true);
}

export function activate(context: vscode.ExtensionContext): void {
  void migrateLegacySettings(context);
  warnAboutLegacyMarkdownStudio(context);

  const provider = new BetterMarkdownProvider(context);
  context.subscriptions.push(
    vscode.commands.registerCommand("betterMarkdown.revealReviewComment", (uri: vscode.Uri, focus: { noteId: number; line: number }) =>
      provider.revealReviewComment(uri, focus),
    ),
  );

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      CUSTOM_EDITOR_VIEW_TYPE,
      provider,
      {
        supportsMultipleEditorsPerDocument: true,
        webviewOptions: { retainContextWhenHidden: true },
      }
    )
  );

  // Toggle command
  context.subscriptions.push(
    vscode.commands.registerCommand("betterMarkdown.toggleEditor", async () => {
      const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
      if (!activeTab) return;

      const input = activeTab.input;
      if (!input || typeof input !== "object") return;

      const isCustomEditor =
        "viewType" in input &&
        (input as any).viewType === CUSTOM_EDITOR_VIEW_TYPE;

      const uri = (input as any).uri as vscode.Uri | undefined;
      if (!uri) return;

      if (isCustomEditor) {
        await vscode.commands.executeCommand("vscode.openWith", uri, "default");
      } else {
        await vscode.commands.executeCommand("vscode.openWith", uri, CUSTOM_EDITOR_VIEW_TYPE);
      }
    })
  );

  // Find command — sends message to active webview
  context.subscriptions.push(
    vscode.commands.registerCommand("betterMarkdown.find", () => {
      provider.openSearch();
    })
  );

  // Embed / link / TOC directives (rich editor context menu, slash menu,
  // Markdown text editor context menu).
  registerDirectiveCommands(context, {
    activeUri: () => provider.activeUri(),
    insert: (text) => provider.insertDirective(text),
    refresh: () => provider.refreshActiveEmbeds(),
  });

  // Rendered HTML of an open rich editor, used by the toolkit's HTML / PDF /
  // PNG export so the output matches what the editor shows. Not in the
  // palette (no `contributes.commands` entry).
  context.subscriptions.push(
    vscode.commands.registerCommand("betterMarkdown.exportSnapshot", (uri?: vscode.Uri) =>
      uri ? provider.exportSnapshot(uri) : undefined,
    )
  );

  // Markdown document for a command: explicit URI, focused rich editor, or active Markdown editor.
  const targetDocument = (arg?: unknown): vscode.Uri | undefined => {
    if (arg instanceof vscode.Uri) return arg;
    const active = provider.activeUri();
    if (active) return active;
    const editor = vscode.window.activeTextEditor;
    return editor?.document.languageId === "markdown" ? editor.document.uri : undefined;
  };
  const guarded = (run: (...args: any[]) => Promise<unknown>) => async (...args: any[]) => {
    try {
      return await run(...args);
    } catch (err) {
      vscode.window.showErrorMessage(`Markdown Studio: ${err instanceof Error ? err.message : String(err)}`);
      return undefined;
    }
  };

  // Editable DOCX from source (also behind markdownToolkit.exportDocx).
  context.subscriptions.push(
    vscode.commands.registerCommand("markdownStudio.exportDocx", guarded(async (arg?: unknown, opts?: { embedLinks?: boolean; target?: vscode.Uri; mode?: "strict" | "permissive" }) => {
      const uri = targetDocument(arg);
      if (!uri) return vscode.window.showInformationMessage("Open a Markdown document before exporting it.");
      return exportDocx(provider, uri, opts ?? {});
    })),
    vscode.commands.registerCommand("markdownStudio.importTemplate", guarded(async (arg?: unknown, file?: vscode.Uri, opts?: { keepAll?: boolean }) => {
      const uri = targetDocument(arg) ?? vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!uri) return vscode.window.showInformationMessage("Open a folder or a Markdown document first.");
      const result = await provider.library.importDocx(uri, file, undefined, !!opts?.keepAll);
      if (result) vscode.window.showInformationMessage(`Imported master(s): ${result.ids.join(", ")}. The import report is next to master.json.`);
      return result;
    })),
    vscode.commands.registerCommand("markdownStudio.preflight", guarded(async (arg?: unknown) => {
      const uri = targetDocument(arg);
      if (!uri) return vscode.window.showInformationMessage("Open a Markdown document first.");
      await provider.flush(uri);
      const report = await preflight(provider, uri);
      return provider.showReport(uri, report);
    })),
    vscode.commands.registerCommand("markdownStudio.manageMasters", guarded(async (arg?: unknown) => {
      const uri = targetDocument(arg) ?? vscode.workspace.workspaceFolders?.[0]?.uri;
      if (!uri) return vscode.window.showInformationMessage("Open a folder or a Markdown document first.");
      const { entries } = await provider.library.list(uri);
      const pick = await vscode.window.showQuickPick(
        [
          { label: "$(add) Import Word template…", action: "import" },
          { label: "$(new-file) New master…", action: "create" },
          ...entries.map((e) => ({ label: e.name, description: `${e.id}${e.readonly ? " · built-in" : ""}`, detail: e.errors?.join("; ") ?? e.description, action: "entry", id: e.id, readonly: e.readonly })),
        ],
        { title: "Document masters", placeHolder: "Pick a master to manage" },
      );
      if (!pick) return;
      if (pick.action === "import") return provider.library.importDocx(uri);
      if (pick.action === "create") {
        const name = await vscode.window.showInputBox({ prompt: "Master name" });
        return name && provider.library.create(uri, name);
      }
      const id = (pick as { id: string }).id;
      const ops = (pick as { readonly: boolean }).readonly ? ["Duplicate"] : ["Rename", "Duplicate", "Reimport", "Open master.json", "Delete"];
      const op = await vscode.window.showQuickPick(ops, { title: pick.label });
      if (op === "Duplicate") {
        const name = await vscode.window.showInputBox({ prompt: "Name of the copy", value: `${pick.label} copy` });
        return name && provider.library.create(uri, name, id);
      }
      if (op === "Rename") {
        const name = await vscode.window.showInputBox({ prompt: "New display name (the id stays)", value: pick.label });
        return name && provider.library.rename(uri, id, name);
      }
      if (op === "Reimport") return provider.library.reimport(uri, id);
      if (op === "Delete") return provider.library.delete(uri, id);
      if (op === "Open master.json") return vscode.window.showTextDocument(vscode.Uri.joinPath(provider.library.folderOf(uri, id), "master.json"));
    })),
  );

  // Explorer view of the document masters (beside Slides Studio's corporate masters).
  registerMasterView(context, provider.library, (msg) => provider.postToStudio(msg), (fire) => provider.onMastersChanged(fire));

  // Zen mode — hides the editor chrome and dims all but the current block.
  context.subscriptions.push(
    vscode.commands.registerCommand("betterMarkdown.toggleZen", () => {
      provider.toggleZen();
    })
  );

  // Factory reset — wipes all settings + the first-run consent flag so
  // settings revert to defaults and the welcome modal fires again on
  // the next file open. Confirms before applying.
  context.subscriptions.push(
    vscode.commands.registerCommand("betterMarkdown.factoryReset", () => {
      void provider.factoryReset();
    })
  );

  // Rich diff — opens a dedicated webview panel comparing any two URIs.
  // Invoked from command palette, SCM context menu, or diff-editor toolbar.
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "betterMarkdown.openDiff",
      async (arg?: unknown, second?: unknown) => {
        const { leftUri, rightUri, title } = await resolveDiffArgs(arg, second);
        if (!leftUri || !rightUri) {
          vscode.window.showInformationMessage(
            "Markdown Studio: no markdown file to diff."
          );
          return;
        }
        await BetterMarkdownDiffPanel.createOrShow(
          context,
          leftUri,
          rightUri,
          title
        );
      }
    )
  );

  // Close non-file custom editor tabs (git:, scm: schemes).  When VS Code
  // opens a diff for a .md file, the custom editor intercepts both sides and
  // spawns read-only panes with git:/scm: URIs.  These render in the rich
  // editor but can't be edited, so we auto-close them.
  //
  // NOTE: we investigated replacing these with the rich diff panel
  // (BetterMarkdownDiffPanel) for Claude Code integration, but Claude Code
  // writes to disk only AFTER the user accepts in the CLI — before that the
  // proposed content is internal to Claude Code with no extension API to
  // read it.  onDidChangeTextDocument fires post-acceptance (too late for
  // review) and onDidChangeTabs sees only a TabInputCustom, not a
  // TabInputTextDiff.  Pre-acceptance rich diff requires Claude Code to
  // expose proposed content to extensions.
  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs((e) => {
      for (const tab of e.opened) {
        const input = tab.input;
        if (
          input instanceof vscode.TabInputCustom &&
          input.viewType === CUSTOM_EDITOR_VIEW_TYPE &&
          input.uri.scheme !== "file" && input.uri.scheme !== "pi-mr"
        ) {
          setTimeout(async () => {
            try { await vscode.window.tabGroups.close(tab); } catch {}
          }, 50);
        }
      }
    })
  );

  // CodeLens: "Open in Rich Editor" above line 1 in source mode
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: "markdown" },
      new RichEditorCodeLensProvider()
    )
  );
}

class RichEditorCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const range = new vscode.Range(0, 0, 0, 0);
    return [
      new vscode.CodeLens(range, {
        title: "Open in Rich Editor",
        command: "betterMarkdown.toggleEditor",
      }),
    ];
  }
}

export function deactivate() {}

/**
 * The rich editor used to ship as the separate "Markdown Studio" extension,
 * which bundled its own copy of Graph Model Studio. Both register the same
 * `betterMarkdown.*` commands and custom editor, so offer to remove it.
 */
const LEGACY_MARKDOWN_STUDIO_ID = "tanishq-chaudhary.its-markdown-studio";

function warnAboutLegacyMarkdownStudio(context: vscode.ExtensionContext): void {
  const other = vscode.extensions.getExtension(LEGACY_MARKDOWN_STUDIO_ID);
  if (!other || context.globalState.get<string>("legacyMarkdownStudioDismissed") === other.packageJSON.version) return;
  void vscode.window
    .showWarningMessage(
      `Graph Model Studio now includes the Markdown Studio rich editor. The separately installed "${other.packageJSON.displayName ?? LEGACY_MARKDOWN_STUDIO_ID}" ${other.packageJSON.version} registers the same commands and editor. Uninstall it?`,
      "Uninstall",
      "Keep both",
    )
    .then(async (choice) => {
      if (choice === "Uninstall") {
        await vscode.commands.executeCommand("workbench.extensions.uninstallExtension", LEGACY_MARKDOWN_STUDIO_ID);
        const reload = await vscode.window.showInformationMessage("Reload the window to finish.", "Reload");
        if (reload) await vscode.commands.executeCommand("workbench.action.reloadWindow");
      } else if (choice === "Keep both") {
        await context.globalState.update("legacyMarkdownStudioDismissed", other.packageJSON.version);
      }
    });
}

/**
 * Figure out which two URIs to diff from whatever the caller passed us.
 * Supports:
 *   - SCM resource state (right-click in Source Control panel)
 *   - Two URIs (explicit)
 *   - One URI (compared vs HEAD)
 *   - No args: try active diff editor, else active text editor vs HEAD
 */
async function resolveDiffArgs(
  arg: unknown,
  second: unknown
): Promise<{
  leftUri: vscode.Uri | undefined;
  rightUri: vscode.Uri | undefined;
  title: string;
}> {
  // Case: two URI args
  if (arg instanceof vscode.Uri && second instanceof vscode.Uri) {
    return {
      leftUri: arg,
      rightUri: second,
      title: path.basename(second.fsPath || second.path),
    };
  }

  // Case: single URI arg → diff vs HEAD
  if (arg instanceof vscode.Uri) {
    return withHead(arg);
  }

  // Case: SCM resource state (shape: { resourceUri: Uri, ... })
  if (arg && typeof arg === "object" && "resourceUri" in arg) {
    const resourceUri = (arg as { resourceUri: vscode.Uri }).resourceUri;
    if (resourceUri instanceof vscode.Uri) return withHead(resourceUri);
  }

  // No args: look at active tab for a diff editor, else active text editor
  const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (activeTab && activeTab instanceof vscode.TabInputTextDiff) {
    return {
      leftUri: activeTab.original,
      rightUri: activeTab.modified,
      title: path.basename(
        activeTab.modified.fsPath || activeTab.modified.path
      ),
    };
  }

  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor) return withHead(activeEditor.document.uri);

  return { leftUri: undefined, rightUri: undefined, title: "" };
}

function withHead(fileUri: vscode.Uri) {
  // git: URI pointing to HEAD version of the file.
  const gitUri = vscode.Uri.from({
    scheme: "git",
    path: fileUri.path,
    query: JSON.stringify({
      path: fileUri.fsPath,
      ref: "HEAD",
    }),
  });
  return {
    leftUri: gitUri,
    rightUri: fileUri,
    title: `${path.basename(fileUri.fsPath)} · HEAD ↔ working`,
  };
}
