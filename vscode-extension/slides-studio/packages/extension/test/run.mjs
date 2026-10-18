// Runs the extension inside a real VS Code instance (installed build when available, else downloaded)
// against a temporary workspace containing a copy of the corporate template and the example deck.
import { runTests } from '@vscode/test-electron';
import { cpSync, existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// The Graph Model Studio extension (vscode-extension/), which bundles Slides Studio.
const ext = resolve(import.meta.dirname, '../../../..');
const repo = resolve(import.meta.dirname, '../../..');
const ws = mkdtempSync(join(tmpdir(), 'css-ws-'));
mkdirSync(join(ws, 'assets/corporate'), { recursive: true });
cpSync(join(repo, 'assets/corporate/original-template.pptx'), join(ws, 'assets/corporate/original-template.pptx'));
cpSync(join(repo, 'examples/corporate-demo/deck.slides.md'), join(ws, 'deck.slides.md'));
mkdirSync(join(ws, '.vscode'));
writeFileSync(join(ws, '.vscode/settings.json'), JSON.stringify({ 'corporateSlides.referenceThumbnails': false }));

const installed = 'C:/Program Files/Microsoft VS Code/Code.exe';
const userData = mkdtempSync(join(tmpdir(), 'css-ud-'));
await runTests({
  ...(existsSync(installed) ? { vscodeExecutablePath: installed } : { version: 'stable' }),
  extensionDevelopmentPath: ext,
  extensionTestsPath: join(import.meta.dirname, 'suite.cjs'),
  launchArgs: [ws, '--disable-extensions', '--user-data-dir', userData, '--skip-welcome', '--skip-release-notes'],
  extensionTestsEnv: { CSS_TEST_WORKSPACE: ws },
});
console.log('Extension host tests passed. Workspace:', ws);
