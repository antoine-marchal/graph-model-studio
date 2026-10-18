import { expect, test, type Page } from '@playwright/test';
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
let n = 0;

/** Copy an example into tests/.tmp and open it in the harness (the example itself is never modified). */
async function open(page: Page, example: string): Promise<string> {
  mkdirSync(resolve(root, 'tests/.tmp'), { recursive: true });
  const ext = example.endsWith('.md') ? '.slides.md' : '.slides.yaml';
  const rel = `tests/.tmp/e2e-${process.pid}-${++n}${ext}`;
  copyFileSync(resolve(root, example), resolve(root, rel));
  await page.goto(`/harness.html?file=${rel}`);
  await expect(page.getByTestId('slide-canvas')).toBeVisible();
  return rel;
}

const source = (page: Page) => page.evaluate(() => window.__harness.text());
const disk = (rel: string) => readFileSync(resolve(root, rel), 'utf8');
const canvasEl = (page: Page, id: string) => page.getByTestId('slide-canvas').locator(`[data-element-id="${id}"]`);
const synced = (page: Page) => expect(page.getByTestId('sync-state')).toHaveText('Synchronisé avec la source');

test('opens a Markdown presentation with the corporate layouts', async ({ page }) => {
  await open(page, 'examples/corporate-demo/deck.slides.md');
  await expect(page.locator('.slide-item')).toHaveCount(6);
  await expect(canvasEl(page, 'title')).toContainText('Architecture PLM / MES / ERP');
  await expect(page.getByTestId('slide-layout')).toHaveValue('diapositive-de-titre');
});

test('edits text inline and writes Markdown back', async ({ page }) => {
  await open(page, 'examples/corporate-demo/deck.slides.md');
  await canvasEl(page, 'title').dblclick();
  const editor = page.getByTestId('inline-editor');
  await expect(editor).toBeFocused();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Architecture cible 2027');
  await page.keyboard.press('Escape');
  await synced(page);
  expect(await source(page)).toContain('\n# Architecture cible 2027\n');
  await expect(canvasEl(page, 'title')).toContainText('Architecture cible 2027');
});

test('moves and resizes a shape, then undo/redo and persistence after reload', async ({ page }) => {
  const rel = await open(page, 'examples/corporate-demo/deck.slides.md');
  await page.getByTestId('slide-thumb-landscape').locator('.slide-button').click();
  const box = canvasEl(page, 'plm-box');
  const b = (await box.boundingBox())!;
  // move: 120 px right, 40 px down (snapping disabled with Alt to get an exact delta)
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.keyboard.down('Alt');
  await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2 + 20, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2 + 120, b.y + b.height / 2 + 40, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await synced(page);
  const moved = await source(page);
  const x1 = Number(/- id: plm-box[\s\S]*?\n {4}x: ([\d.]+)/.exec(moved)![1]);
  expect(x1).toBeGreaterThan(1.3);

  // resize with the south-east handle
  const handle = page.getByTestId('slide-canvas').locator('[data-selection="plm-box"] [data-handle="se"]');
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.keyboard.down('Alt');
  await page.mouse.move(hb.x + 80, hb.y + 30, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await synced(page);
  const w = Number(/- id: plm-box[\s\S]*?\n {4}w: ([\d.]+)/.exec(await source(page))![1]);
  expect(w).toBeGreaterThan(3.2);

  // undo restores the previous width, redo re-applies it
  await page.getByTestId('undo').click();
  await expect.poll(async () => /- id: plm-box[\s\S]*?\n {4}w: ([\d.]+)/.exec(await source(page))![1]).toBe('3.2');
  await page.getByTestId('redo').click();
  await expect.poll(async () => Number(/- id: plm-box[\s\S]*?\n {4}w: ([\d.]+)/.exec(await source(page))![1])).toBe(w);

  // save, reload, verify persistence
  expect(await page.evaluate(() => window.__harness.dirty())).toBe(true);
  await page.keyboard.press('Control+S');
  await expect.poll(() => disk(rel).includes(`w: ${w}`)).toBe(true);
  await page.reload();
  await page.getByTestId('slide-thumb-landscape').locator('.slide-button').click();
  await canvasEl(page, 'plm-box').click({ position: { x: 10, y: 10 } });
  await expect(page.getByTestId('field-w')).toHaveValue(String(w));
});

test('changes a color with a corporate theme token', async ({ page }) => {
  await open(page, 'examples/corporate-demo/deck.slides.md');
  await page.getByTestId('slide-thumb-landscape').locator('.slide-button').click();
  await canvasEl(page, 'mes-box').click({ position: { x: 10, y: 10 } });
  await page.getByTestId('color-fill').click();
  await page.getByTestId('color-fill-menu').locator('[data-token="theme.accent2.darker25"]').click();
  await synced(page);
  expect(await source(page)).toMatch(/- id: mes-box[\s\S]*?fill: theme\.accent2\.darker25/);
});

test('DSL: numeric geometry edit keeps comments and formatting', async ({ page }) => {
  await open(page, 'examples/corporate-demo/architecture.slides.yaml');
  await canvasEl(page, 'erp-box').click({ position: { x: 20, y: 10 } });
  const x = page.getByTestId('field-x');
  await x.fill('6.5');
  await x.press('Enter');
  await synced(page);
  const text = await source(page);
  expect(text).toContain('# Déclaration précise au pouce près (DSL)');
  expect(text).toMatch(/- id: erp-box\n {8}type: shape\n {8}shape: ellipse\n {8}x: 6\.5/);
});

test('adds a slide from a corporate layout picker', async ({ page }) => {
  await open(page, 'examples/corporate-demo/deck.slides.md');
  await page.getByTestId('add-slide').click();
  await page.getByTestId('layout-menu').getByRole('textbox').fill('deux contenus');
  await page.getByTestId('layout-menu').locator('.layout-card').first().click();
  await synced(page);
  await expect(page.locator('.slide-item')).toHaveCount(7);
  expect(await source(page)).toMatch(/id: slide-1\nlayout: two-columns\n---\n\n# Titre/);
});

test('adds a shape, nudges it with the keyboard and deletes it', async ({ page }) => {
  await open(page, 'examples/corporate-demo/deck.slides.md');
  await page.getByTestId('slide-thumb-agenda').locator('.slide-button').click();
  await page.getByTestId('tab-insert').click();
  await page.getByTestId('add-shape').click();
  await page.getByTestId('shape-menu').getByRole('menuitem', { name: 'Ellipse' }).click();
  await synced(page);
  await page.getByTestId('tab-home').click();
  expect(await source(page)).toMatch(/- id: shape-1\n {4}type: shape\n {4}shape: ellipse/);
  await page.keyboard.press('ArrowRight');
  await synced(page);
  await page.keyboard.press('Delete');
  await synced(page);
  expect(await source(page)).not.toContain('shape-1');
});

test('reflects external source edits without echoing them back', async ({ page }) => {
  await open(page, 'examples/corporate-demo/deck.slides.md');
  const before = await page.evaluate(() => window.__harness.version());
  await page.evaluate(() => window.__harness.setExternal(window.__harness.text().replace('# Architecture PLM / MES / ERP', '# Titre modifié dans VS Code')));
  await expect(canvasEl(page, 'title')).toContainText('Titre modifié dans VS Code');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__harness.version())).toBe(before + 1);
});

const openDeck = async (page: Page, query = '') => {
  mkdirSync(resolve(root, 'tests/.tmp'), { recursive: true });
  const rel = `tests/.tmp/e2e-${process.pid}-${++n}.deck`;
  copyFileSync(resolve(root, 'examples/corporate-demo/architecture.deck'), resolve(root, rel));
  await page.goto(`/harness.html?file=${rel}${query}`);
  await expect(page.getByTestId('slide-canvas')).toBeVisible();
  return rel;
};

test('.deck: visual diff against a base revision marks changed, added and deleted slides', async ({ page }) => {
  await openDeck(page, '&base=examples/corporate-demo/deck.slides.md');
  await page.getByTestId('tab-review').click();
  await page.getByTestId('toggle-diff').click();
  await expect(page.getByTestId('diff-chip-cover')).toHaveText('Modifiée');
  await expect(page.getByTestId('diff-chip-diagram')).toHaveText('Ajoutée');
  await expect(page.getByTestId('slide-ghost-agenda')).toBeVisible();
  await page.getByTestId('slide-thumb-landscape').locator('.slide-button').click();
  await expect(page.getByTestId('diff-mark-mes-box')).toHaveAttribute('data-diff', 'modified');
  await page.getByTestId('toggle-base').click();
  await expect(page.getByTestId('base-canvas')).toBeVisible();
});

test('.deck: merge request review is read-only and posts comments through the companion', async ({ page }) => {
  await openDeck(page, '&base=examples/corporate-demo/deck.slides.md&review=1');
  await expect(page.getByTestId('pin-d1')).toBeVisible();
  await page.getByTestId('pin-d1').click();
  await expect(page.getByTestId('thread-d1')).toContainText('cible 2027');
  await page.getByRole('button', { name: 'Commenter cette diapositive' }).click();
  await page.getByTestId('new-comment').fill('Ajouter la date du comité.');
  await page.getByRole('button', { name: 'Publier' }).click();
  await expect(page.locator('.thread').filter({ hasText: 'Ajouter la date du comité.' })).toBeVisible();
  // visual edits are refused on a revision
  await canvasEl(page, 'title').dblclick();
  await expect(page.getByTestId('inline-editor')).toHaveCount(0);
});

test('.deck: inserting a GMC diagram writes a .gmc image element', async ({ page }) => {
  await openDeck(page);
  await page.getByTestId('slide-thumb-roadmap').locator('.slide-button').click();
  await page.getByTestId('tab-insert').click();
  await page.getByTestId('insert-gmc').click();
  await page.getByTestId('gmc-name').fill('Flux PLM ERP');
  await page.getByTestId('gmc-submit').click();
  await synced(page);
  expect(await source(page)).toMatch(/- id: diagram\n {4}type: image\n[\s\S]*?src: diagrams\/flux-plm-erp\.gmc/);
  await expect(page.getByTestId('tab-format')).toHaveText('Diagramme');
});

test('table: typing then clicking outside keeps the text; column borders resize', async ({ page }) => {
  await open(page, 'examples/corporate-demo/deck.slides.md');
  await page.getByTestId('slide-thumb-agenda').locator('.slide-button').click();
  await page.getByTestId('tab-insert').click();
  await page.getByRole('button', { name: 'Tableau' }).click();
  await synced(page);
  await canvasEl(page, 'table-1').dblclick();
  const cell = page.getByTestId('table-editor').locator('[data-cell="1:1"]');
  await cell.click();
  await page.keyboard.type('42');
  await expect(cell).toHaveText('42');
  // Resize the first column border by +60px, then leave by clicking the empty slide area.
  const grip = page.getByTestId('col-resize').first();
  const b = (await grip.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + 20);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 60, b.y + 20, { steps: 4 });
  await page.mouse.up();
  await page.getByTestId('slide-canvas').click({ position: { x: 5, y: 5 } });
  await synced(page);
  const src = await source(page);
  expect(src).toMatch(/- "?42"?\n/);
  expect(src).toMatch(/colWidths:/);
});

test('clipboard: copy / paste duplicates the selection; font size steps up', async ({ page }) => {
  await open(page, 'examples/corporate-demo/deck.slides.md');
  await page.getByTestId('slide-thumb-agenda').locator('.slide-button').click();
  await page.getByTestId('tab-insert').click();
  await page.getByTestId('add-shape').click();
  await page.getByTestId('shape-menu').getByRole('menuitem', { name: 'Ellipse' }).click();
  await synced(page);
  await page.getByTestId('tab-home').click();
  await page.getByTestId('copy').click();
  await page.getByTestId('paste').click();
  // The ribbon reads the clipboard asynchronously: wait for the pasted copy before the sync check.
  await expect(canvasEl(page, 'shape-2')).toBeVisible();
  await synced(page);
  expect(await source(page)).toMatch(/- id: shape-2\n {4}type: shape\n {4}shape: ellipse/);
  await page.getByTestId('font-grow').click();
  await synced(page);
  expect(await source(page)).toMatch(/shape-2[\s\S]*fontSize: \d+/);
});
