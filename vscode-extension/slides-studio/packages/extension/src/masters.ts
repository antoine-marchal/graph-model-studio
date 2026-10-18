import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CorporateMaster, HostMessage, LayoutDef } from '@corporate-slides/core';
import { loadMaster, MASTER_DIR } from '@corporate-slides/master-extractor';
import { WebviewMessage } from '@corporate-slides/core';
import { webviewHtml } from './webviewHtml';

export function workspaceMasterDir(): string | null {
  for (const f of vscode.workspace.workspaceFolders ?? []) {
    const dir = join(f.uri.fsPath, MASTER_DIR);
    if (existsSync(join(dir, 'corporate-master.json'))) return dir;
  }
  return null;
}

type Node =
  | { kind: 'master'; id: string; label: string; layouts: LayoutDef[] }
  | { kind: 'layout'; layout: LayoutDef }
  | { kind: 'placeholder'; text: string; detail: string }
  | { kind: 'theme' }
  | { kind: 'color'; token: string; hex: string }
  | { kind: 'font'; role: string; face: string }
  | { kind: 'warnings'; items: string[] }
  | { kind: 'warning'; text: string };

/** Explorer tree: masters → layouts → placeholders, theme colors/fonts, extraction warnings. */
export class MasterTreeProvider implements vscode.TreeDataProvider<Node> {
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private master: CorporateMaster | null = null;

  async refresh(): Promise<void> {
    const dir = workspaceMasterDir();
    this.master = dir ? await loadMaster(join(dir, 'corporate-master.json')).catch(() => null) : null;
    void vscode.commands.executeCommand('setContext', 'corporateSlides.hasMaster', !!this.master);
    this.emitter.fire();
  }

  getTreeItem(n: Node): vscode.TreeItem {
    switch (n.kind) {
      case 'master':
        return Object.assign(new vscode.TreeItem(n.label, vscode.TreeItemCollapsibleState.Expanded), { iconPath: new vscode.ThemeIcon('layers'), description: `${n.layouts.length} dispositions` });
      case 'layout': {
        const t = new vscode.TreeItem(n.layout.name, n.layout.placeholders.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
        t.description = [n.layout.id, ...n.layout.aliases].join(' · ');
        t.iconPath = new vscode.ThemeIcon('layout');
        t.tooltip = `${n.layout.sourcePart}\nEspaces réservés : ${n.layout.placeholders.map((p) => p.key).join(', ') || 'aucun'}`;
        t.command = { command: 'corporateSlides.showMasters', title: 'Afficher', arguments: [n.layout.id] };
        return t;
      }
      case 'placeholder':
        return Object.assign(new vscode.TreeItem(n.text), { description: n.detail, iconPath: new vscode.ThemeIcon('symbol-field') });
      case 'theme':
        return Object.assign(new vscode.TreeItem('Thème', vscode.TreeItemCollapsibleState.Collapsed), { iconPath: new vscode.ThemeIcon('symbol-color') });
      case 'color':
        return Object.assign(new vscode.TreeItem(n.token), { description: `#${n.hex}`, iconPath: new vscode.ThemeIcon('circle-filled') });
      case 'font':
        return Object.assign(new vscode.TreeItem(n.role), { description: n.face, iconPath: new vscode.ThemeIcon('text-size') });
      case 'warnings':
        return Object.assign(new vscode.TreeItem(`Avertissements d'extraction (${n.items.length})`, vscode.TreeItemCollapsibleState.Collapsed), { iconPath: new vscode.ThemeIcon('warning') });
      case 'warning':
        return Object.assign(new vscode.TreeItem(n.text), { tooltip: n.text });
    }
  }

  getChildren(n?: Node): Node[] {
    const m = this.master;
    if (!m) return [];
    if (!n) {
      const warnings = [...m.warnings, ...m.unsupported.map((u) => `${u.feature} (${u.count}) — ${u.impact}`)];
      return [
        { kind: 'theme' },
        ...m.masters.map((ms) => ({ kind: 'master' as const, id: ms.id, label: `${ms.name}${ms.primary ? ' (principal)' : ''}`, layouts: m.layouts.filter((l) => l.masterId === ms.id) })),
        { kind: 'warnings', items: warnings },
      ];
    }
    if (n.kind === 'master') return n.layouts.map((layout) => ({ kind: 'layout', layout }));
    if (n.kind === 'layout') return n.layout.placeholders.map((p) => ({ kind: 'placeholder', text: p.key, detail: `${p.type} · ${p.x.toFixed(2)}, ${p.y.toFixed(2)} · ${p.w.toFixed(2)} × ${p.h.toFixed(2)} in` }));
    if (n.kind === 'theme')
      return [
        { kind: 'font', role: 'theme.heading', face: m.theme.fonts.heading },
        { kind: 'font', role: 'theme.body', face: m.theme.fonts.body },
        ...Object.entries(m.theme.colors).map(([k, hex]) => ({ kind: 'color' as const, token: `theme.${k}`, hex })),
      ];
    if (n.kind === 'warnings') return n.items.map((text) => ({ kind: 'warning', text }));
    return [];
  }
}

/** Webview panel showing layouts with internal and PowerPoint reference previews. */
export class MasterBrowserPanel {
  private static current: MasterBrowserPanel | undefined;
  private constructor(private panel: vscode.WebviewPanel, private ctx: vscode.ExtensionContext, private onNewFromLayout: (layout: string) => void) {
    panel.onDidDispose(() => (MasterBrowserPanel.current = undefined));
    panel.webview.onDidReceiveMessage((raw) => {
      const m = WebviewMessage.safeParse(raw);
      if (!m.success) return;
      if (m.data.type === 'ready') void this.push();
      if (m.data.type === 'newFromLayout') this.onNewFromLayout(m.data.layout);
    });
  }
  private focus?: string;

  static async show(ctx: vscode.ExtensionContext, onNewFromLayout: (layout: string) => void, focusLayout?: string): Promise<void> {
    const dir = workspaceMasterDir();
    if (!dir) {
      const pick = await vscode.window.showInformationMessage('Aucun masque corporate importé dans ce workspace.', 'Importer un gabarit');
      if (pick) await vscode.commands.executeCommand('corporateSlides.importTemplate');
      return;
    }
    if (!MasterBrowserPanel.current) {
      const panel = vscode.window.createWebviewPanel('corporateSlides.masters', 'Masques corporate', vscode.ViewColumn.Active, {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(ctx.extensionUri, 'dist'), vscode.Uri.file(dir)],
      });
      panel.webview.html = webviewHtml(panel.webview, ctx.extensionUri, 'masters');
      MasterBrowserPanel.current = new MasterBrowserPanel(panel, ctx, onNewFromLayout);
    }
    const cur = MasterBrowserPanel.current;
    cur.focus = focusLayout;
    cur.panel.reveal();
    await cur.push();
  }

  static async refresh(): Promise<void> {
    await MasterBrowserPanel.current?.push();
  }

  private async push(): Promise<void> {
    const dir = workspaceMasterDir();
    if (!dir) return;
    const master = await loadMaster(join(dir, 'corporate-master.json'));
    const w = this.panel.webview;
    const assetUrls: Record<string, string> = {};
    for (const a of master.assets) {
      const f = a.preview ?? (/\.(png|jpe?g|gif|svg)$/i.test(a.file) ? a.file : null);
      if (f) assetUrls[`master:${a.id}`] = w.asWebviewUri(vscode.Uri.file(join(dir, f))).toString();
    }
    const thumbnails: Record<string, string> = {};
    for (const l of master.layouts) if (l.thumbnail && existsSync(join(dir, l.thumbnail))) thumbnails[l.id] = w.asWebviewUri(vscode.Uri.file(join(dir, l.thumbnail))).toString();
    await w.postMessage({ type: 'masters', master, assetUrls, thumbnails, focusLayout: this.focus } satisfies HostMessage);
  }
}
