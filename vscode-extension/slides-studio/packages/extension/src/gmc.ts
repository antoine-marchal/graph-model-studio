import * as vscode from 'vscode';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { renderedImageSrc, tr } from '@corporate-slides/core';
import { log } from './log';

/** Graph Model Studio commands (same extension). */
const RENDER = 'gmc.renderFilePng';
const PREVIEW = 'gmc.openPreview';

const TEMPLATES: Record<'blank' | 'context' | 'flow', (title: string) => string> = {
  blank: (title) => `model {
}

views {
  view main ${JSON.stringify(title)} {
    include *
    autolayout lr
  }
}
`,
  context: (title) => `model {
  user = person tr("Utilisateur", "User")
  system = softwareSystem ${JSON.stringify(title)} {
    description tr("Système étudié", "System under study")
  }
  partner = softwareSystem tr("Système externe", "External system")

  user -> system tr("Utilise", "Uses")
  system -> partner tr("Échange des données", "Exchanges data")
}

views {
  view main tr("Contexte", "Context") {
    include *
    autolayout lr
  }
}
`,
  flow: (title) => `model {
  start = businessEvent tr("Demande reçue", "Request received")
  qualify = businessProcess tr("Qualifier", "Qualify")
  deliver = businessProcess tr("Traiter", "Process")
  done = businessEvent tr("Demande close", "Request closed")

  start -> qualify
  qualify -> deliver
  deliver -> done
}

views {
  view main ${JSON.stringify(title)} {
    include *
    autolayout lr
  }
}
`,
};

/** Graph Model Studio's interactive editor bundle, shipped by this same extension. */
export function gmsEditorBundle(extension: vscode.Extension<unknown>): { dir: vscode.Uri; js: vscode.Uri; css: vscode.Uri; version: string } {
  const dir = vscode.Uri.joinPath(extension.extensionUri, 'dist', 'webview');
  return { dir, js: vscode.Uri.joinPath(dir, 'assets', 'webview.js'), css: vscode.Uri.joinPath(dir, 'assets', 'webview.css'), version: String(extension.packageJSON.version ?? '') };
}

export async function createGmc(file: string, template: keyof typeof TEMPLATES, title: string): Promise<void> {
  if (existsSync(file)) return;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, TEMPLATES[template](title), 'utf8');
}

/** Render `x.gmc` to `x.png` with the Graph Model Studio renderer (light theme: slides are printed on white). */
export async function renderGmc(file: string): Promise<void> {
  try {
    await vscode.commands.executeCommand(RENDER, vscode.Uri.file(file), vscode.Uri.file(renderedImageSrc(file)), undefined, 'light');
  } catch (e) {
    log.error(`GMC render failed: ${file}`, e);
    throw new Error(tr(`Rendu du diagramme impossible : ${(e as Error).message}`, `Diagram rendering failed: ${(e as Error).message}`));
  }
}

/** Open the diagram source beside the deck with the Graph Model Studio canvas. */
export async function openGmc(file: string): Promise<void> {
  await vscode.window.showTextDocument(vscode.Uri.file(file), { viewColumn: vscode.ViewColumn.Beside, preview: false });
  await vscode.commands.executeCommand(PREVIEW);
}
