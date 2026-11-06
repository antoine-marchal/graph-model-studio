import * as vscode from "vscode";
import * as path from "path";
import { SETTING_KEYS } from "../webview/settings";
import { onCustomCssChange, readCustomCss } from "./customCss";
import { execFile } from "child_process";
import { linkMrRevision, sendReview } from "./review";

const CONFIG_NAMESPACE = "markdownStudio";

function readSettings(): Record<string, unknown> {
  const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
  const out: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    const value = config.get(key);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

async function writeSettings(next: Record<string, unknown>): Promise<void> {
  const config = vscode.workspace.getConfiguration(CONFIG_NAMESPACE);
  for (const key of SETTING_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) continue;
    const incoming = next[key];
    if (config.get(key) === incoming) continue;
    await config.update(key, incoming, vscode.ConfigurationTarget.Global);
  }
}

/**
 * Standalone webview panel showing a rich markdown diff between any two
 * URIs (file:, git:, vscode-scm:, anything VSCode's text-document layer can
 * read). Re-uses the same webview bundle as the custom editor but mounts
 * the DiffApp entry instead of the full Tiptap editor.
 */
export class BetterMarkdownDiffPanel {
  private static active: BetterMarkdownDiffPanel | null = null;
  private readonly panel: vscode.WebviewPanel;
  private readonly context: vscode.ExtensionContext;
  private disposables: vscode.Disposable[] = [];
  private leftUri: vscode.Uri;
  private rightUri: vscode.Uri;
  private title: string;

  static async createOrShow(
    context: vscode.ExtensionContext,
    leftUri: vscode.Uri,
    rightUri: vscode.Uri,
    title: string,
  ) {
    if (this.active && !this.active.panel.webview) {
      this.active = null;
    }
    if (this.active) {
      // Reuse existing panel — just swap content
      this.active.leftUri = leftUri;
      this.active.rightUri = rightUri;
      this.active.title = title;
      this.active.panel.title = `Diff: ${title}`;
      this.active.panel.reveal(vscode.ViewColumn.Active);
      await this.active.refresh();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "betterMarkdown.diff",
      `Diff: ${title}`,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, "dist"),
          // Rendered diff: GMC diagrams and the document's images.
          vscode.Uri.joinPath(context.extensionUri, "dist", "markdown-preview"),
          ...(rightUri.scheme === "file" ? [vscode.Uri.joinPath(rightUri, "..")] : []),
          ...(vscode.workspace.workspaceFolders?.map((f) => f.uri) || []),
        ],
      },
    );
    this.active = new BetterMarkdownDiffPanel(
      context,
      panel,
      leftUri,
      rightUri,
      title,
    );
    await this.active.refresh();
  }

  private constructor(
    context: vscode.ExtensionContext,
    panel: vscode.WebviewPanel,
    leftUri: vscode.Uri,
    rightUri: vscode.Uri,
    title: string,
  ) {
    this.context = context;
    this.panel = panel;
    this.leftUri = leftUri;
    this.rightUri = rightUri;
    this.title = title;
    this.panel.webview.html = this.getHtml();

    this.disposables.push(
      this.panel.webview.onDidReceiveMessage(async (msg) => {
        if (msg.type === "diffReady") {
          await this.postInit();
          await this.postCustomCss();
        } else if (msg.type === "review") {
          // Discussions belong to the new version (right side), never to a URI from the webview.
          const doc = await vscode.workspace.openTextDocument(this.rightUri);
          if (msg.action === "load" && doc.uri.scheme === "file" && !(await linkMrRevision(doc).catch(() => false))) {
            this.panel.webview.postMessage({ type: "reviewResult", requestId: msg.requestId, action: "load", error: "No open merge request of the current branch changes this file." });
            return;
          }
          await sendReview(doc, this.panel.webview, msg);
        } else if (msg.type === "closeDiff") {
          this.panel.dispose();
        } else if (msg.type === "saveSettings") {
          await writeSettings(msg.settings as Record<string, unknown>);
        }
      }),
    );

    // Push settings updates from VS Code config (Settings UI, .vscode/
    // settings.json, the editor's in-app panel) into the diff webview so
    // its in-app settings panel and diff-mode/layout stay in sync.
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (!e.affectsConfiguration(CONFIG_NAMESPACE)) return;
        this.panel.webview.postMessage({
          type: "settingsUpdated",
          settings: readSettings(),
        });
      }),
    );

    this.disposables.push(onCustomCssChange(() => this.postCustomCss()));

    this.disposables.push(
      this.panel.onDidDispose(() => {
        BetterMarkdownDiffPanel.active = null;
        this.dispose();
      }),
    );

    // Refresh when either side changes on disk
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        const uri = doc.uri.toString();
        if (uri === this.leftUri.toString() || uri === this.rightUri.toString()) {
          this.refresh();
        }
      }),
    );
  }

  private async refresh() {
    try {
      const [left, newContent] = await Promise.all([this.readBase(), this.readUri(this.rightUri)]);
      this.panel.webview.postMessage({
        type: "diffUpdate",
        oldContent: left.text,
        baseError: left.error,
        newContent,
      });
    } catch (err: any) {
      console.error("[better-markdown] diff refresh failed:", err);
    }
  }

  /** Earlier version; a file absent at that revision is empty, any other failure is reported. */
  private async readBase(): Promise<{ text: string; error?: string }> {
    try {
      return { text: await this.readUri(this.leftUri) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return /exist|not found|ENOENT|unknown revision|bad revision/i.test(message) ? { text: "" } : { text: "", error: message };
    }
  }

  /** The right side has GitLab discussions: a merge request revision, or a local file its branch's MR changes. */
  private async hasReview(): Promise<boolean> {
    if (this.rightUri.scheme === "pi-mr") return true;
    if (this.rightUri.scheme !== "file") return false;
    try {
      return await linkMrRevision(await vscode.workspace.openTextDocument(this.rightUri));
    } catch {
      return false;
    }
  }

  private async postInit() {
    const settings = readSettings();
    const left = await this.readBase();
    let newContent = "";
    try {
      newContent = await this.readUri(this.rightUri);
    } catch {
      // File deleted at that revision → empty
    }
    this.panel.webview.postMessage({
      type: "diffInit",
      oldContent: left.text,
      baseError: left.error,
      review: await this.hasReview(),
      newContent,
      fileName: path.basename(this.rightUri.fsPath || this.leftUri.fsPath),
      title: this.title,
      settings,
      baseUri: this.rightUri.scheme === "file"
        ? this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.rightUri, "..")).toString()
        : undefined,
      gmcRuntimeUri: this.panel.webview
        .asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, "dist", "markdown-preview", "runtime.js"))
        .toString(),
    });
  }

  private async postCustomCss() {
    this.panel.webview.postMessage({
      type: "customCss",
      css: await readCustomCss(),
    });
  }

  private async readUri(uri: vscode.Uri): Promise<string> {
    // git: revisions straight from git, so the diff never depends on the Git
    // extension having discovered the repository (nested repos, late activation).
    if (uri.scheme === "git") {
      const fromGit = await gitShow(uri).catch(() => undefined);
      if (fromGit !== undefined) return fromGit;
    }
    const doc = await vscode.workspace.openTextDocument(uri);
    return doc.getText();
  }

  private getHtml(): string {
    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "rich-editor", "webview.js"),
    );
    const styleUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "rich-editor", "editor.css"),
    );
    const nonce = getNonce();
    const csp = `default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${this.panel.webview.cspSource} 'wasm-unsafe-eval'; font-src ${this.panel.webview.cspSource} data:; img-src ${this.panel.webview.cspSource} data: blob: https:;`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <link href="${styleUri}" rel="stylesheet">
  <title>Markdown Studio — Diff</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">window.__BTRMK_MODE__ = "diff";</script>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}

function getNonce(): string {
  let text = "";
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

/**
 * Content of a `git:` URI (`{ path, ref }` query, as the Git extension builds
 * them): `~` is the index, `""` / `HEAD` / a sha a commit. Rejects when the
 * file is absent at that revision.
 */
function gitShow(uri: vscode.Uri): Promise<string> {
  let file = uri.fsPath;
  let ref = "HEAD";
  try {
    const q = JSON.parse(uri.query) as { path?: string; ref?: string };
    file = q.path ?? file;
    ref = q.ref ?? ref;
  } catch {
    // Not a Git extension URI: HEAD of the path.
  }
  const spec = ref === "~" || ref === "" ? `:./${path.basename(file)}` : `${ref}:./${path.basename(file)}`;
  return new Promise((resolve, reject) =>
    execFile("git", ["show", spec], { cwd: path.dirname(file), maxBuffer: 64 * 1024 * 1024, encoding: "utf8" }, (err, stdout) =>
      err ? reject(err) : resolve(stdout),
    ),
  );
}

/** Short name of one side of a diff: working tree, index, HEAD, a commit, a merge request side. */
function sideLabel(uri: vscode.Uri): string {
  if (uri.scheme === "file") return "working tree";
  if (uri.scheme === "pi-mr") return /side=old|"side":"old"/.test(uri.query) ? "MR base" : "MR";
  try {
    const ref = String((JSON.parse(uri.query) as { ref?: string }).ref ?? "HEAD");
    if (ref === "~" || ref === "") return "index";
    return /^[0-9a-f]{12,}$/i.test(ref) ? ref.slice(0, 7) : ref;
  } catch {
    return uri.scheme;
  }
}

export function diffTitle(left: vscode.Uri, right: vscode.Uri): string {
  return `${path.basename(right.fsPath || right.path)} · ${sideLabel(left)} ↔ ${sideLabel(right)}`;
}

/**
 * Close the VS Code diff tab comparing `left` and `right` (replaced by the
 * rich diff). A diff of two custom editors is not a TabInputTextDiff in the
 * tab API, so it is recognised by its label: the file name plus the sides.
 */
export async function closeNativeDiffTab(left: vscode.Uri, right: vscode.Uri): Promise<boolean> {
  const name = path.basename(right.fsPath || right.path);
  const same = (a: vscode.Uri, b: vscode.Uri) => a.toString() === b.toString();
  const tabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs).filter((tab) => {
    const input = tab.input;
    if (input instanceof vscode.TabInputTextDiff) return same(input.original, left) && same(input.modified, right);
    if (input instanceof vscode.TabInputCustom && !same(input.uri, right)) return false;
    if (input && !(input instanceof vscode.TabInputCustom)) return false;
    // "a.md (Working Tree)", "a.md (abc123) ↔ a.md (def456)"…, never the plain "a.md" of a single editor.
    return tab.label.includes(name) && tab.label !== name;
  });
  if (!tabs.length) return false;
  await vscode.window.tabGroups.close(tabs).then(undefined, () => undefined);
  return true;
}
