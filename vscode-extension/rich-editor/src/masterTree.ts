/**
 * Explorer view "Document masters" (next to Slides Studio's corporate masters): the workspace
 * library and the built-in starters, each with its page design, placeholders and styles. Items
 * open the master on the page of the focused Markdown Studio document (master edit mode), apply it,
 * or manage the library (new, duplicate, rename, import a Word template, delete).
 */
import * as vscode from "vscode";
import { tr } from "../../slides-studio/packages/core/src/i18n";
import type { MasterDef } from "../document/schema";
import { isAutoField, placeholderKey } from "../document/placeholders";
import type { MasterEntry, MasterLibrary } from "./masterLibrary";

type Node =
  | { kind: "master"; entry: MasterEntry; master?: MasterDef }
  | { kind: "detail"; label: string; description?: string; icon: string; tooltip?: string };

const cm = (pt: number) => `${(pt / 28.3465).toFixed(1).replace(/\.0$/, "")} cm`;

export class MasterTreeProvider implements vscode.TreeDataProvider<Node> {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private library: MasterLibrary) {}

  refresh(): void {
    this.emitter.fire();
  }

  private root(): vscode.Uri | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri;
  }

  getTreeItem(n: Node): vscode.TreeItem {
    if (n.kind === "detail") return Object.assign(new vscode.TreeItem(n.label), { description: n.description, iconPath: new vscode.ThemeIcon(n.icon), tooltip: n.tooltip });
    const e = n.entry;
    const item = new vscode.TreeItem(e.name, n.master ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    item.id = `master:${e.id}`;
    item.description = e.errors ? tr("erreur", "error") : e.source === "starter" ? tr("intégré", "built-in") : e.source === "docx" ? "Word" : e.basedOn ? `← ${e.basedOn}` : undefined;
    item.tooltip = e.errors?.join("\n") ?? [e.description, `id: ${e.id}`].filter(Boolean).join("\n");
    item.iconPath = new vscode.ThemeIcon(e.errors ? "warning" : e.source === "starter" ? "file-text" : "layout");
    item.contextValue = e.readonly ? "msMasterReadonly" : "msMaster";
    item.command = { command: "markdownStudio.editMaster", title: tr("Modifier le masque", "Edit master"), arguments: [n] };
    return item;
  }

  async getChildren(n?: Node): Promise<Node[]> {
    const root = this.root();
    if (!root) return [];
    if (!n) {
      const { entries, masters } = await this.library.list(root);
      return entries.map((entry) => ({ kind: "master" as const, entry, master: masters.find((m) => m.id === entry.id) }));
    }
    if (n.kind !== "master" || !n.master) return [];
    const m = n.master;
    const out: Node[] = [];
    const p = m.page;
    out.push({ kind: "detail", icon: "file", label: tr("Page", "Page"), description: `${p.size ?? "A4"} · ${p.orientation === "landscape" ? tr("paysage", "landscape") : tr("portrait", "portrait")}`, tooltip: p.margins ? `${tr("Marges", "Margins")}: ${["top", "right", "bottom", "left"].map((k) => cm((p.margins as Record<string, number>)[k] ?? 72)).join(" · ")}` : undefined });
    for (const [id, d] of Object.entries(m.background ?? {})) {
      if (!d.placeholder) continue;
      const key = placeholderKey(d.placeholder);
      out.push({ kind: "detail", icon: isAutoField(key) ? "symbol-numeric" : "symbol-field", label: d.name ?? id, description: isAutoField(key) ? tr("champ automatique", "automatic field") : `${tr("espace réservé", "placeholder")} · ${key}` });
    }
    const drawings = Object.values(m.background ?? {}).filter((d) => !d.placeholder).length;
    if (drawings) out.push({ kind: "detail", icon: "symbol-misc", label: tr("Objets du masque", "Master objects"), description: String(drawings) });
    const styles = Object.keys(m.styles ?? {}).length;
    if (styles) out.push({ kind: "detail", icon: "symbol-color", label: tr("Styles", "Styles"), description: String(styles) });
    if (m.headers?.default?.markdown || m.footers?.default?.markdown) out.push({ kind: "detail", icon: "list-flat", label: tr("En-tête et pied de page", "Header and footer"), description: [m.headers?.default?.markdown, m.footers?.default?.markdown].filter(Boolean).join(" · ").slice(0, 60) });
    return out;
  }
}

/** Commands of the view; `post` reaches the focused (or last focused) Markdown Studio editor. */
export function registerMasterView(context: vscode.ExtensionContext, library: MasterLibrary, post: (msg: Record<string, unknown>) => boolean, onMastersChanged: (fire: () => void) => void): void {
  const tree = new MasterTreeProvider(library);
  onMastersChanged(() => tree.refresh());
  const root = () => vscode.workspace.workspaceFolders?.[0]?.uri;
  const idOf = (arg: unknown): string | undefined => (arg && typeof arg === "object" && "entry" in arg ? (arg as { entry: MasterEntry }).entry.id : typeof arg === "string" ? arg : undefined);
  const needEditor = () => void vscode.window.showInformationMessage(tr("Ouvrez un document Markdown dans Markdown Studio pour modifier ou appliquer un masque sur la page.", "Open a Markdown document in Markdown Studio to edit or apply a master on the page."));
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("markdownStudio.masters", tree),
    vscode.commands.registerCommand("markdownStudio.mastersRefresh", () => (library.invalidate(), tree.refresh())),
    vscode.commands.registerCommand("markdownStudio.editMaster", (arg?: unknown) => {
      const id = idOf(arg);
      if (id && !post({ type: "enterMasterEdit", id })) needEditor();
    }),
    vscode.commands.registerCommand("markdownStudio.applyMaster", (arg?: unknown) => {
      const id = idOf(arg);
      if (id && !post({ type: "applyMaster", id })) needEditor();
    }),
    vscode.commands.registerCommand("markdownStudio.newMaster", async (arg?: unknown) => {
      const uri = root();
      if (!uri) return;
      const name = await vscode.window.showInputBox({ prompt: tr("Nom du nouveau masque", "New master name"), value: tr("Nouveau masque", "New master") });
      if (!name) return;
      await library.create(uri, name, idOf(arg));
      tree.refresh();
    }),
    vscode.commands.registerCommand("markdownStudio.duplicateMaster", async (arg?: unknown) => {
      const uri = root();
      const id = idOf(arg);
      if (!uri || !id) return;
      const name = await vscode.window.showInputBox({ prompt: tr("Nom de la copie", "Name of the copy"), value: `${(arg as { entry?: MasterEntry })?.entry?.name ?? id} ${tr("(copie)", "(copy)")}` });
      if (!name) return;
      await library.create(uri, name, id);
      tree.refresh();
    }),
    vscode.commands.registerCommand("markdownStudio.renameMaster", async (arg?: unknown) => {
      const uri = root();
      const id = idOf(arg);
      if (!uri || !id) return;
      const name = await vscode.window.showInputBox({ prompt: tr("Nom affiché (l’identifiant ne change pas)", "Display name (the id stays the same)"), value: (arg as { entry?: MasterEntry })?.entry?.name });
      if (!name) return;
      await library.rename(uri, id, name);
      tree.refresh();
    }),
    vscode.commands.registerCommand("markdownStudio.deleteMaster", async (arg?: unknown) => {
      const uri = root();
      const id = idOf(arg);
      if (!uri || !id) return;
      if ((await library.delete(uri, id)) !== false) tree.refresh();
    }),
    vscode.commands.registerCommand("markdownStudio.openMasterJson", (arg?: unknown) => {
      const uri = root();
      const id = idOf(arg);
      if (uri && id) void vscode.window.showTextDocument(vscode.Uri.joinPath(library.folderOf(uri, id), "master.json"));
    }),
  );
}
