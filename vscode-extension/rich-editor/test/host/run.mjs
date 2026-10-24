// Runs Markdown Studio inside a real VS Code instance (installed build when available, else
// downloaded) on a temporary workspace: the corporate report fixture and a generated Word template.
// Run after `pnpm run build:rich-editor`: node rich-editor/test/host/run.mjs
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ext = resolve(import.meta.dirname, '../../..');
const require = createRequire(import.meta.url);
const { runTests } = require(join(ext, 'slides-studio/packages/extension/node_modules/@vscode/test-electron'));
const d = require(join(ext, 'node_modules/docx'));

const ws = mkdtempSync(join(tmpdir(), 'ms-ws-'));
cpSync(join(ext, 'rich-editor/test/fixtures/report'), ws, { recursive: true });
writeFileSync(join(ws, 'plain.md'), '# Plain\n\n* star list\n\nSome __bold__ text.\n');

// A small corporate template: styles with inheritance, a first-page header, a landscape section.
const template = new d.Document({
  styles: { paragraphStyles: [{ id: 'CorpBody', name: 'Corp Body', basedOn: 'Normal', run: { color: '333333', size: 22 } }] },
  sections: [
    { properties: { titlePage: true }, headers: { first: new d.Header({ children: [new d.Paragraph('Contoso')] }), default: new d.Header({ children: [new d.Paragraph('Contoso — confidential')] }) }, children: [new d.Paragraph('Sample')] },
    { properties: { page: { size: { width: 11906, height: 16838, orientation: d.PageOrientation.LANDSCAPE } } }, children: [new d.Paragraph('Wide sample')] },
  ],
});
writeFileSync(join(ws, 'contoso.dotx'), await d.Packer.toBuffer(template));

const installed = 'C:/Program Files/Microsoft VS Code/Code.exe';
const userData = mkdtempSync(join(tmpdir(), 'ms-ud-'));
await runTests({
  ...(existsSync(installed) ? { vscodeExecutablePath: installed } : { version: 'stable' }),
  extensionDevelopmentPath: ext,
  extensionTestsPath: join(import.meta.dirname, 'suite.cjs'),
  launchArgs: [ws, '--disable-extensions', '--user-data-dir', userData, '--skip-welcome', '--skip-release-notes'],
  extensionTestsEnv: { MS_TEST_WORKSPACE: ws },
});
console.log('Markdown Studio extension host tests passed. Workspace:', ws);
