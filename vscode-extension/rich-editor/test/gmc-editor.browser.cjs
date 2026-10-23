// Browser check of the built rich editor (dist/rich-editor): double-clicking a GMC fence preview or a
// linked .gmc embed opens the shared maximized graph editor, edits reach the right target, and merely
// opening the document never rewrites it. A stand-in graph editor replaces the real bundle.
// Run after `pnpm run build:rich-editor`: node rich-editor/test/gmc-editor.browser.cjs
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..', '..');
const { chromium } = require(path.join(root, 'slides-studio/node_modules/@playwright/test'));

const FAKE_EDITOR = `const api = acquireVsCodeApi();
window.addEventListener('message', (e) => {
  if (e.data?.type !== 'render') return;
  document.body.dataset.render = JSON.stringify(e.data);
  api.postMessage({ type: 'sourceChanged', source: e.data.source + ' // edited' });
});
api.postMessage({ type: 'ready' });`;

// Stub host: the init message, plus the linked-file requests of the embed card.
const page = (content, settings = {}) => `<!doctype html><html><head><meta charset="utf-8"><link href="/dist/rich-editor/editor.css" rel="stylesheet"></head><body><div id="root"></div>
<script nonce="n">
window.__msgs = [];
// Long-period timers would mean polling: count them.
window.__intervals = [];
const setI = window.setInterval;
window.setInterval = (fn, ms, ...a) => (window.__intervals.push(ms), setI(fn, ms, ...a));
const reply = (m) => setTimeout(() => window.postMessage(m, '*'));
window.acquireVsCodeApi = () => ({
  postMessage(m) {
    window.__msgs.push(m);
    if (m.type === 'ready') reply({ type: 'init', content: ${JSON.stringify(content)}, baseUri: 'https://file+.vscode-resource.vscode-cdn.net/c%3A/docs', docFolderPath: 'c:/docs', filePath: 'c:/docs/doc.md', isReadonly: false, settings: ${JSON.stringify(settings)}, gmcRuntimeUri: '/dist/markdown-preview/runtime.js', gmcEditorUri: '/fake/webview.js', gmcEditorCssUri: '/fake/webview.css', gmcVersion: 't' });
    if (m.type === 'gmcReadFile') reply({ type: 'gmcReadFileResult', requestId: m.requestId, source: 'model {}' });
    if (m.type === 'gmcViews') reply({ type: 'gmcViewsResult', requestId: m.requestId, views: ['context'] });
  },
  getState() {},
  setState() {},
});
</script><script nonce="n" type="module" src="/dist/rich-editor/webview.js"></script></body></html>`;

const FENCE = '# Doc\n\n```gmc id=demo view=context\nmodel {}\n```\n\nAfter.\n';
const LINKED = '# Doc\n\n<!-- embed:file="./flow.gmc" view="context" -->\n\n![flow](./flow.png)\n\n<!-- embed:end -->\n\nAfter.\n';

let content = '';
let settings = {};
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/') return res.end(page(content, settings));
  if (url === '/fake/webview.js') return res.end(FAKE_EDITOR);
  if (url === '/fake/webview.css') return res.end('');
  const file = path.join(root, url);
  if (!file.startsWith(path.join(root, 'dist')) || !fs.existsSync(file)) return (res.statusCode = 404), res.end();
  res.setHeader('content-type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'application/octet-stream');
  res.end(fs.readFileSync(file));
});

async function openAndEdit(browser, doc, target) {
  content = doc;
  const p = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await p.goto(`http://localhost:${server.address().port}/`);
  const preview = p.locator(target).first();
  await preview.waitFor({ state: 'attached', timeout: 15_000 });
  await p.waitForTimeout(500);
  assert.equal(await p.evaluate(() => window.__msgs.filter((m) => m.type === 'edit').length), 0, 'opening rewrote the document');
  await preview.dblclick({ force: true });
  const shell = p.getByTestId('gmc-editor');
  await shell.waitFor({ timeout: 5000 });
  assert.deepEqual(await shell.boundingBox(), { x: 0, y: 0, width: 1200, height: 800 }, 'editor is not maximized');
  const body = p.frameLocator('.gmc-shell-frame').locator('body[data-render]');
  await body.waitFor({ timeout: 5000 });
  const render = JSON.parse(await body.getAttribute('data-render'));
  await p.keyboard.press('Escape');
  await shell.waitFor({ state: 'detached', timeout: 3000 });
  await p.waitForTimeout(800);
  const msgs = await p.evaluate(() => window.__msgs);
  await p.close();
  return { render, msgs };
}

server.listen(0, async () => {
  const browser = await chromium.launch();
  try {
    const fence = await openAndEdit(browser, FENCE, '[data-testid="gmc-fence-preview"]');
    assert.equal(fence.render.view, 'context');
    assert.equal(fence.render.name, 'demo');
    const edit = fence.msgs.filter((m) => m.type === 'edit').at(-1);
    assert.ok(edit?.content.includes('```gmc id=demo view=context\nmodel {} // edited\n```'), 'fence edit not synced with its options');

    const linked = await openAndEdit(browser, LINKED, '.directive-content .image-block');
    assert.equal(linked.render.view, 'context');
    assert.deepEqual(linked.msgs.filter((m) => m.type === 'gmcWriteFile').map((m) => [m.file, m.source]), [['./flow.gmc', 'model {} // edited']]);
    assert.equal(linked.msgs.filter((m) => m.type === 'edit').length, 0, 'linked edit rewrote the Markdown document');
    // Outline panel follows edits and scrolling without polling timers.
    content = `# One\n\n${'text\n\n'.repeat(80)}## Two\n\n${'text\n\n'.repeat(80)}`;
    settings = { outlineStyle: 'panel' };
    const p = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await p.goto(`http://localhost:${server.address().port}/`);
    await p.locator('.toc-entry').nth(1).waitFor({ timeout: 15_000 });
    await p.locator('.tiptap-editor h1').click();
    await p.keyboard.press('End');
    await p.keyboard.type(' renamed');
    await p.waitForFunction(() => document.querySelector('.toc-entry')?.textContent === 'One renamed', null, { timeout: 2000 });
    // Ctrl+S sends the debounced edit at once (the save must include it).
    await p.keyboard.type('!');
    await p.keyboard.press('Control+s');
    assert.ok((await p.evaluate(() => window.__msgs.filter((m) => m.type === 'edit').at(-1)?.content ?? '')).startsWith('# One renamed!\n'), 'Ctrl+S did not flush the pending edit');
    await p.locator('.editor-container').evaluate((c) => c.scrollTo(0, c.scrollHeight));
    await p.waitForFunction(() => document.querySelector('.toc-active')?.textContent === 'Two', null, { timeout: 2000 });
    await p.locator('.sticky-heading').first().waitFor({ timeout: 2000 });
    assert.deepEqual((await p.evaluate(() => window.__intervals)).filter((ms) => ms >= 500), [], 'heading panels poll');
    await p.close();
    console.log('gmc editor browser check: ok');
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
});
