// Extension host integration test (runs inside VS Code). Plain assertions, no test framework needed.
const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, label, timeout = 60000) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error(`Timeout: ${label}`);
    await sleep(200);
  }
}

exports.run = async function run() {
  const ws = process.env.CSS_TEST_WORKSPACE;
  const log = (m) => console.log(`[css-test] ${m}`);
  const ext = vscode.extensions.all.find((e) => e.packageJSON.name === 'graph-model-studio');
  assert.ok(ext, 'extension present');
  const api = (await ext.activate()).slides;

  // 1. Import the corporate template through the command
  await vscode.commands.executeCommand('corporateSlides.importTemplate', vscode.Uri.file(path.join(ws, 'assets/corporate/original-template.pptx')));
  const masterJson = path.join(ws, '.corporate-slides/master/corporate-master.json');
  assert.ok(fs.existsSync(masterJson), 'corporate-master.json written');
  const master = JSON.parse(fs.readFileSync(masterJson, 'utf8'));
  assert.equal(master.layouts.length, 75);
  log('import ok');

  // 2. Open the presentation in the custom (visual) editor
  const deck = vscode.Uri.file(path.join(ws, 'deck.slides.md'));
  await vscode.commands.executeCommand('vscode.openWith', deck, 'corporateSlides.editor');
  await waitFor(() => {
    const tab = vscode.window.tabGroups.activeTabGroup.activeTab;
    return tab && tab.input instanceof vscode.TabInputCustom && tab.input.viewType === 'corporateSlides.editor';
  }, 'custom editor tab');
  log('custom editor opened');

  // 3. Apply a visual transaction (same path as the webview) and check the source + dirty state
  const doc = await vscode.workspace.openTextDocument(deck);
  const original = doc.getText();
  const err = await api.applyTransaction(deck, [
    { kind: 'updateElement', slideId: 'landscape', elementId: 'plm-box', patch: { x: 1.5, y: 2.2, w: 3.2, h: 1.4, style: { fill: 'theme.accent2' } } },
    { kind: 'updateElement', slideId: 'cover', elementId: 'title', patch: { paragraphs: [{ runs: [{ text: 'Titre édité visuellement' }] }] } },
  ]);
  assert.equal(err, null);
  assert.ok(doc.isDirty, 'document dirty after visual edit');
  assert.match(doc.getText(), /# Titre édité visuellement\n/);
  assert.match(doc.getText(), /- id: plm-box[\s\S]*?x: 1\.5[\s\S]*?fill: theme\.accent2/);
  log('transaction applied');

  // 4. Invalid mutations are rejected, never silently dropped
  const bad = await api.applyTransaction(deck, [{ kind: 'deleteElement', slideId: 'nope', elementId: 'x' }]);
  assert.match(bad, /introuvable/);

  // 5. Native undo / redo on the source document
  await vscode.window.showTextDocument(doc);
  await vscode.commands.executeCommand('undo');
  await waitFor(() => doc.getText() === original, 'undo restores original');
  await vscode.commands.executeCommand('redo');
  await waitFor(() => doc.getText().includes('Titre édité visuellement'), 'redo re-applies');
  log('undo/redo ok');

  // 6. Save, then check persistence on disk
  await doc.save();
  assert.match(fs.readFileSync(deck.fsPath, 'utf8'), /Titre édité visuellement/);

  // 7. Validate + export through the commands
  await vscode.commands.executeCommand('corporateSlides.validate', deck);
  await vscode.commands.executeCommand('corporateSlides.exportPptx', deck);
  const out = path.join(ws, 'out/deck.pptx');
  await waitFor(() => fs.existsSync(out), 'pptx exported');
  assert.ok(fs.statSync(out).size > 10000);
  assert.ok(fs.existsSync(path.join(ws, 'out/deck.report.md')));
  log('export ok');

  // 8. DSL source in the visual editor accepts structural edits
  const dsl = vscode.Uri.file(path.join(ws, 'new.slides.yaml'));
  await vscode.workspace.fs.writeFile(dsl, Buffer.from('presentation:\n  title: T\nslides:\n  - id: a\n    layout: content\n    elements:\n      - id: title\n        placeholder: title\n        content: Bonjour\n'));
  await vscode.commands.executeCommand('vscode.openWith', dsl, 'corporateSlides.editor');
  const err2 = await api.applyTransaction(dsl, [{ kind: 'addSlide', slideId: 'b', layout: 'two-columns', title: 'Deux' }]);
  assert.equal(err2, null);
  assert.match((await vscode.workspace.openTextDocument(dsl)).getText(), /- id: b\n {4}layout: two-columns/);
  log('all extension host tests passed');
};
