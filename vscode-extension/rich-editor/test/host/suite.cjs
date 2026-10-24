// Markdown Studio extension host integration test (runs inside VS Code). Plain assertions.
const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, label, timeout = 30000) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error(`Timeout: ${label}`);
    await sleep(200);
  }
}

exports.run = async function run() {
  const ws = process.env.MS_TEST_WORKSPACE;
  const log = (m) => console.log(`[ms-test] ${m}`);
  const ext = vscode.extensions.all.find((e) => e.packageJSON.name === 'graph-model-studio');
  assert.ok(ext, 'extension present');
  await ext.activate();
  const JSZip = require(path.join(ext.extensionPath, 'node_modules/jszip'));
  const report = vscode.Uri.file(path.join(ws, 'report.md'));
  const plain = vscode.Uri.file(path.join(ws, 'plain.md'));

  // 1. Word template → masters (family + landscape variant), original kept, report written.
  const imported = await vscode.commands.executeCommand('markdownStudio.importTemplate', report, vscode.Uri.file(path.join(ws, 'contoso.dotx')), { keepAll: true });
  assert.deepEqual(imported.ids, ['contoso', 'contoso-2']);
  const family = JSON.parse(fs.readFileSync(path.join(ws, '.markdown-studio/masters/contoso/master.json'), 'utf8'));
  assert.equal(family.headers.first.markdown, 'Contoso');
  assert.equal(family.styles.CorpBody.basedOn, 'Normal');
  const variant = JSON.parse(fs.readFileSync(path.join(ws, '.markdown-studio/masters/contoso-2/master.json'), 'utf8'));
  assert.equal(variant.page.orientation, 'landscape');
  assert.equal(variant.basedOn, 'contoso');
  assert.ok(fs.existsSync(path.join(ws, '.markdown-studio/masters/contoso/source/contoso.dotx')), 'original template kept');
  assert.ok(fs.existsSync(path.join(ws, '.markdown-studio/masters/contoso/import-report.json')), 'import report written');
  log('template imported');

  // 2. Export from source with no editor open (no Pandoc).
  const target = vscode.Uri.file(path.join(ws, 'out.docx'));
  const exported = await vscode.commands.executeCommand('markdownStudio.exportDocx', report, { target });
  assert.ok(exported?.ok, 'export report ok');
  const zip = await JSZip.loadAsync(fs.readFileSync(target.fsPath));
  const xml = await zip.file('word/document.xml').async('string');
  assert.match(xml, /<wps:wsp>/);
  assert.match(xml, /<wpg:wgp>/);
  assert.match(xml, /w:orient="landscape"/);
  log('exported without an editor');

  // 3. Opening plain Markdown in the rich editor never rewrites it.
  const plainDoc = await vscode.workspace.openTextDocument(plain);
  const original = plainDoc.getText();
  await vscode.commands.executeCommand('vscode.openWith', plain, 'betterMarkdown.editor');
  await sleep(4000);
  assert.equal(plainDoc.getText(), original, 'opening is a no-op');
  assert.equal(plainDoc.isDirty, false, 'opening leaves the document clean');
  log('open is a no-op');

  // 4. One history: an edit as the editor writes it, then VS Code undo with the custom editor focused.
  const edit = new vscode.WorkspaceEdit();
  edit.insert(plain, plainDoc.positionAt(original.indexOf('Some')), 'Edited. ');
  assert.ok(await vscode.workspace.applyEdit(edit));
  assert.ok(plainDoc.getText().includes('Edited. Some'));
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
  assert.ok(tab?.input instanceof vscode.TabInputCustom && tab.input.viewType === 'betterMarkdown.editor', 'rich editor tab active');
  await vscode.commands.executeCommand('undo');
  await waitFor(() => plainDoc.getText() === original, 'VS Code undo reverts the edit with the rich editor focused');
  await vscode.commands.executeCommand('redo');
  await waitFor(() => plainDoc.getText().includes('Edited. Some'), 'redo');
  await vscode.commands.executeCommand('undo');
  await waitFor(() => plainDoc.getText() === original, 'undo again');
  log('undo / redo through VS Code history');

  // 5. Export with the editor open: the flush handshake answers (no 3 s timeout).
  await vscode.commands.executeCommand('vscode.openWith', report, 'betterMarkdown.editor');
  await sleep(5000);
  const t0 = Date.now();
  const again = await vscode.commands.executeCommand('markdownStudio.exportDocx', report, { target: vscode.Uri.file(path.join(ws, 'out2.docx')) });
  const ms = Date.now() - t0;
  assert.ok(again?.ok, 'export with the editor open');
  assert.ok(ms < 2900, `flush answered by the webview (${ms} ms)`);
  const reportDoc = await vscode.workspace.openTextDocument(report);
  assert.equal(reportDoc.isDirty, false, 'opening the corporate report leaves it clean');
  log(`exported with the editor open in ${ms} ms`);

  // 6. Preflight reports into the open editor.
  assert.equal(await vscode.commands.executeCommand('markdownStudio.preflight', report), true);
  log('preflight');
};
