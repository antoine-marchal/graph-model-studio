import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';

/** Webview HTML with a strict CSP: nonce scripts only, local resources only, no network. */
export function webviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri, mode: 'editor' | 'masters'): string {
  const nonce = randomBytes(16).toString('base64');
  const dist = vscode.Uri.joinPath(extensionUri, 'dist', 'slides-studio', 'webview');
  const script = webview.asWebviewUri(vscode.Uri.joinPath(dist, 'main.js'));
  const style = webview.asWebviewUri(vscode.Uri.joinPath(dist, 'main.css'));
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data: blob:`,
    // React sets inline style attributes for geometry; scripts remain nonce-only.
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource} data:`,
    // The inline Graph Model Studio editor: its bundle is fetched, then run in a srcdoc frame.
    `connect-src ${webview.cspSource}`,
    `frame-src 'self' ${webview.cspSource} blob: data:`,
    `worker-src blob:`,
    `script-src 'nonce-${nonce}' 'wasm-unsafe-eval'`,
  ].join('; ');
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${style}">
<title>Corporate Slides Studio</title>
</head>
<body>
<div id="root" data-mode="${mode}"></div>
<script type="module" nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}
