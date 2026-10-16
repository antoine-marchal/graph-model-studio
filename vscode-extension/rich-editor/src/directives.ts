import * as vscode from "vscode";
import * as path from "path";

/**
 * Insert Graph Model Studio toolkit directives — `<!-- embed:file="…" -->`,
 * `<!-- link:file="…" -->`, `<!-- embed:toc -->` — into the rich editor
 * (via `insert`) or the Markdown text editor. The toolkit fills in the
 * content (and the `embed:end` / `link:end` marker) on save or on
 * "Update Code Embeds".
 */
export type DirectiveKind = "embed" | "link" | "toc";

async function pickRelative(docUri: vscode.Uri, kind: DirectiveKind): Promise<string | undefined> {
  const picked = await vscode.window.showOpenDialog({
    defaultUri: vscode.Uri.joinPath(docUri, ".."),
    canSelectMany: false,
    openLabel: kind === "link" ? "Link" : "Embed",
    filters: kind === "link" ? { Markdown: ["md", "markdown"], "All files": ["*"] } : undefined,
  });
  if (!picked?.[0]) return undefined;
  const rel = path.relative(path.dirname(docUri.fsPath), picked[0].fsPath).replace(/\\/g, "/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

export async function buildDirective(docUri: vscode.Uri, kind: DirectiveKind): Promise<string | undefined> {
  if (kind === "toc") return "<!-- embed:toc -->";
  const file = await pickRelative(docUri, kind);
  if (!file) return undefined;
  const quoted = file.replace(/"/g, "%22");
  return kind === "link" ? `<!-- link:file="${quoted}" -->` : `<!-- embed:file="${quoted}" -->`;
}

/**
 * Command handler. `insertInRichEditor` returns true when a rich editor
 * is active and took the text; otherwise the active Markdown text editor
 * gets it as its own line at the cursor.
 */
export function registerDirectiveCommands(
  context: vscode.ExtensionContext,
  rich: { activeUri(): vscode.Uri | undefined; insert(text: string): boolean; refresh(): Promise<boolean> },
): void {
  const run = (kind: DirectiveKind) => async () => {
    const richUri = rich.activeUri();
    const textEditor = vscode.window.activeTextEditor;
    const docUri = richUri ?? (textEditor?.document.languageId === "markdown" ? textEditor.document.uri : undefined);
    if (!docUri) {
      void vscode.window.showInformationMessage("Open a Markdown document first.");
      return;
    }
    const text = await buildDirective(docUri, kind);
    if (!text) return;
    if (richUri && rich.insert(text)) return;
    if (!textEditor) return;
    const pos = textEditor.selection.active;
    const line = textEditor.document.lineAt(pos.line);
    const prefix = line.isEmptyOrWhitespace ? "" : "\n";
    await textEditor.edit((b) => b.insert(line.isEmptyOrWhitespace ? line.range.start : line.range.end, `${prefix}${text}\n`));
  };
  context.subscriptions.push(
    vscode.commands.registerCommand("betterMarkdown.insertEmbed", run("embed")),
    vscode.commands.registerCommand("betterMarkdown.insertLink", run("link")),
    vscode.commands.registerCommand("betterMarkdown.insertToc", run("toc")),
    // The rich editor refreshes itself (renders GMC embeds in its webview).
    vscode.commands.registerCommand("betterMarkdown.updateEmbeds", async () => {
      if (!(await rich.refresh())) await vscode.commands.executeCommand("markdown-embed.update");
    }),
  );
}
