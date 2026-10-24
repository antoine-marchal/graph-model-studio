/**
 * "Export DOCX" from source: flushes pending visual edits of open editors first, then compiles the
 * document text (no webview needed). Assets resolve against the document or master folder and
 * may not escape them; nothing is downloaded. The report says what is native, what fell back and
 * what was refused (strict mode writes nothing when content would be lost).
 */
import * as vscode from "vscode";
import * as path from "path";
import { compileDocx, type CompileOptions, type ExportReport } from "./docx/compile";
import type { MasterLibrary } from "./masterLibrary";

export interface ExportHost {
  library: MasterLibrary;
  context: vscode.ExtensionContext;
  /** Wait until open editors of `uri` have sent and seen acknowledged every pending edit. */
  flush(uri: vscode.Uri): Promise<void>;
  /** Mermaid fence → PNG through an open editor of the document (undefined when none is open). */
  renderMermaid(uri: vscode.Uri, code: string): Promise<Uint8Array | undefined>;
  showReport(uri: vscode.Uri, report: ExportReport, target?: vscode.Uri): Promise<boolean>;
}

const inside = (root: string, file: string) => {
  const rel = path.relative(root, file);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
};

export async function exportDocx(host: ExportHost, uri: vscode.Uri, opts: { target?: vscode.Uri; embedLinks?: boolean; mode?: "strict" | "permissive" } = {}): Promise<ExportReport | undefined> {
  await host.flush(uri);
  const document = await vscode.workspace.openTextDocument(uri);
  const config = vscode.workspace.getConfiguration("markdownStudio", uri);
  let source = document.getText();
  if (opts.embedLinks) {
    const { MarkdownEmbedder } = require(path.join(host.context.extensionPath, "integrations", "markdown-code-embedder", "embedder.js"));
    const embedder = new MarkdownEmbedder();
    embedder.expandLinkEmbeds = true;
    source = await embedder.expandNestedMarkdown(source, document.fileName, new Set([document.fileName]), document.fileName);
  }
  const target =
    opts.target ??
    (await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.joinPath(uri, "..", `${path.parse(uri.fsPath).name}.docx`),
      filters: { "Word document": ["docx"] },
    }));
  if (!target) return undefined;

  const gmc: GmcHolder = {};
  try {
    const { buffer, report } = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Exporting editable DOCX…" }, async () =>
      compileDocx(await compileOptions(host, uri, source, opts.mode ?? (config.get<string>("docx.mode", "permissive") as "strict" | "permissive"), gmc)),
    );
    // Notifications never hold the command: it returns its report at once.
    if (report.blocked) {
      void vscode.window
        .showErrorMessage(
          `DOCX not written: strict export found ${[...report.fallbacks, ...report.unsupported, ...report.missing].filter((i) => i.lossy).length} item(s) that would be lost.`,
          "Show report",
          "Export anyway (permissive)",
        )
        .then((choice) => {
          if (choice === "Show report") void host.showReport(uri, report);
          if (choice === "Export anyway (permissive)") void exportDocx(host, uri, { ...opts, target, mode: "permissive" });
        });
      return report;
    }
    await vscode.workspace.fs.writeFile(target, buffer!);
    const native = Object.entries(report.native).filter(([k]) => /images|shapes|textBoxes|groups|connectors|tables/.test(k)).reduce((a, [, n]) => a + n, 0);
    const issues = report.fallbacks.length + report.unsupported.length + report.missing.length;
    void vscode.window
      .showInformationMessage(
        `Exported ${path.basename(target.fsPath)}: editable Word content${native ? `, ${native} native tables / drawings` : ""}${issues ? `, ${issues} fallback or unsupported item(s)` : ""}.`,
        "Show report",
        "Open",
      )
      .then((choice) => {
        if (choice === "Show report") void host.showReport(uri, report, target);
        if (choice === "Open") void vscode.env.openExternal(target);
      });
    maybeOfferReferenceDoc(uri, source);
    return report;
  } finally {
    gmc.renderer?.dispose();
  }
}

type GmcHolder = { renderer?: { render(source: string, options: Record<string, string>): Promise<string>; dispose(): void } };

/** Compiler inputs for a document: masters of its library, confined asset reads, diagram renderers. */
async function compileOptions(host: ExportHost, uri: vscode.Uri, source: string, mode: "strict" | "permissive", gmc: GmcHolder | null): Promise<CompileOptions> {
  const docDir = path.dirname(uri.fsPath);
  const config = vscode.workspace.getConfiguration("markdownStudio", uri);
  return {
    source,
    masters: await host.library.lookup(uri),
    mode,
    hidden: config.get<string>("docx.hiddenObjects", "omit") as "omit" | "include",
    readAsset: async (rel, root) => {
      const base = root === "document" ? docDir : host.library.folderOf(uri, root.master).fsPath;
      const file = path.resolve(base, rel);
      if (!inside(base, file) && !inside(vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath ?? docDir, file)) return undefined;
      try {
        return await vscode.workspace.fs.readFile(vscode.Uri.file(file));
      } catch {
        return undefined;
      }
    },
    renderDiagram: async (lang, code, meta) => {
      if (lang === "mermaid") return host.renderMermaid(uri, code);
      // Preflight does not open the GMC render panel.
      if (!gmc) return undefined;
      if (!gmc.renderer) {
        const toolkit = require(path.join(host.context.extensionPath, "integrations", "markdown-toolkit", "extension.js"));
        if (!toolkit.GmcExportRenderer) return undefined;
        gmc.renderer = new toolkit.GmcExportRenderer(host.context);
      }
      const options = Object.fromEntries([...meta.matchAll(/([a-zA-Z_][\w-]*)=("[^"]*"|'[^']*'|\S+)/g)].map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));
      const dataUrl = await gmc.renderer!.render(code, options);
      return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
    },
  };
}

/** Corporate preflight: the export run in memory (nothing written), report only. */
export async function preflight(host: ExportHost, uri: vscode.Uri): Promise<ExportReport> {
  const document = await vscode.workspace.openTextDocument(uri);
  const { report } = await compileDocx(await compileOptions(host, uri, document.getText(), "strict", null));
  if (report.fallbacks.some((f) => f.kind === "diagram")) report.limits.push("GMC diagrams are rendered to pictures at export time (not during preflight).");
  return report;
}

/** Former Pandoc setting: offer to import the reference document as a master instead. */
function maybeOfferReferenceDoc(uri: vscode.Uri, source: string): void {
  const reference = vscode.workspace.getConfiguration("markdownToolkit.pandoc").get<string>("referenceDoc", "");
  if (!reference || /^\s*master:/m.test(source)) return;
  void vscode.window
    .showInformationMessage("Pandoc reference documents are no longer used. Import yours as a Markdown Studio master to keep its styles and page design?", "Import as master")
    .then((choice) => {
      if (choice) void vscode.commands.executeCommand("markdownStudio.importTemplate", uri, vscode.Uri.file(reference));
    });
}

/** Report as Markdown, for a plain text view when no editor is open. */
export function reportMarkdown(report: ExportReport, target?: vscode.Uri): string {
  const list = (title: string, items: { message: string; line?: number }[]) => (items.length ? `\n## ${title}\n\n${items.map((i) => `- ${i.message}${i.line ? ` (line ${i.line})` : ""}`).join("\n")}\n` : "");
  return [
    `# DOCX export report${target ? ` — ${path.basename(target.fsPath)}` : ""}`,
    "",
    `Mode: ${report.mode}${report.blocked ? " — **not written**" : ""}`,
    "",
    "## Native Word content",
    "",
    ...Object.entries(report.native).map(([k, n]) => `- ${k}: ${n}`),
    list("Fallbacks", report.fallbacks),
    list("Unsupported", report.unsupported),
    list("Missing", report.missing),
    list("Diagnostics", report.diagnostics),
    list("Fidelity limits", report.limits.map((message) => ({ message }))),
  ].join("\n");
}
