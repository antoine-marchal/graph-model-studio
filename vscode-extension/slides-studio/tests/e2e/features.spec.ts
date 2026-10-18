import { expect, test, type Page } from '@playwright/test';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
let n = 0;

async function open(page: Page, example = 'examples/corporate-demo/deck.slides.md'): Promise<void> {
  mkdirSync(resolve(root, 'tests/.tmp'), { recursive: true });
  const rel = `tests/.tmp/feat-${process.pid}-${++n}.slides.md`;
  copyFileSync(resolve(root, example), resolve(root, rel));
  await page.goto(`/harness.html?file=${rel}`);
  await expect(page.getByTestId('slide-canvas')).toBeVisible();
}
const source = (page: Page) => page.evaluate(() => window.__harness.text());
const synced = (page: Page) => expect(page.getByTestId('sync-state')).toHaveText('Synchronisé avec la source');
const canvasEl = (page: Page, id: string) => page.getByTestId('slide-canvas').locator(`[data-element-id="${id}"]`);

async function addShape(page: Page, name: string) {
  await page.getByTestId('tab-insert').click();
  await page.getByTestId('add-shape').click();
  await page.getByTestId('shape-menu').getByRole('menuitem', { name }).click();
  await synced(page);
  await page.getByTestId('tab-home').click();
}

test('rubber band: dragging on the slide selects the elements inside', async ({ page }) => {
  await open(page);
  await page.getByTestId('slide-thumb-landscape').locator('.slide-button').click();
  const frame = (await page.getByTestId('slide-canvas').boundingBox())!;
  await page.mouse.move(frame.x + 4, frame.y + frame.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(frame.x + frame.width - 4, frame.y + frame.height * 0.6, { steps: 8 });
  await expect(page.getByTestId('marquee')).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('[data-selection]')).toHaveCount(5); // three boxes and two arrows
});

test('right-click menu: commands of the element, duplicate from the quick bar', async ({ page }) => {
  await open(page);
  await page.getByTestId('slide-thumb-agenda').locator('.slide-button').click();
  await addShape(page, 'Ellipse');
  await canvasEl(page, 'shape-1').click({ button: 'right' });
  const menu = page.getByTestId('context-menu');
  await expect(menu).toBeVisible();
  for (const id of ['ctx-cut', 'ctx-copy', 'ctx-paste', 'ctx-duplicate', 'ctx-order', 'ctx-align', 'ctx-lock', 'ctx-delete']) await expect(menu.getByTestId(id)).toBeVisible();
  await menu.getByTestId('ctx-duplicate').click();
  await synced(page);
  expect(await source(page)).toContain('id: shape-2');
  // The slide background has its own menu.
  const frame = (await page.getByTestId('slide-canvas').boundingBox())!;
  await page.mouse.click(frame.x + frame.width - 20, frame.y + frame.height - 20, { button: 'right' });
  await expect(page.getByTestId('context-menu').getByTestId('ctx-new-slide')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('context-menu')).toHaveCount(0);
});

test('yellow handle: dragging the donut handle changes the ring thickness', async ({ page }) => {
  await open(page);
  await page.getByTestId('slide-thumb-agenda').locator('.slide-button').click();
  await addShape(page, 'Anneau');
  const h = page.getByTestId('adjust-adj');
  await expect(h).toBeVisible();
  const b = (await h.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 40, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
  await synced(page);
  expect(await source(page)).toMatch(/adjust:\s*\n\s+adj: \d+/);
});

test('text selection: right-click sets the size of the selected characters only', async ({ page }) => {
  await open(page);
  await page.getByTestId('slide-thumb-agenda').locator('.slide-button').click();
  await canvasEl(page, 'body').dblclick();
  const editor = page.getByTestId('inline-editor');
  await expect(editor).toBeVisible();
  // Select the first word of the first line.
  await editor.evaluate((el) => {
    const t = el.querySelector('[data-line]')!.firstChild!;
    const node = t.nodeType === Node.TEXT_NODE ? t : t.firstChild!;
    const r = document.createRange();
    r.setStart(node, 0);
    r.setEnd(node, 8);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  });
  const box = (await editor.locator('[data-line]').first().boundingBox())!;
  await page.mouse.click(box.x + 10, box.y + box.height / 2, { button: 'right' });
  const menu = page.getByTestId('context-menu');
  await expect(menu.getByTestId('ctx-size')).toBeVisible();
  await menu.getByTestId('ctx-size').click();
  await page.getByTestId('context-submenu').getByTestId('ctx-size-36').click();
  await page.keyboard.press('Escape');
  await synced(page);
  expect(await source(page)).toMatch(/size: 36/);
});

test('table: fill and border of a cell range', async ({ page }) => {
  await open(page);
  await page.getByTestId('slide-thumb-roadmap').locator('.slide-button').click();
  await page.getByTestId('slide-canvas').locator('[data-element-id^="table"]').first().dblclick();
  await expect(page.getByTestId('table-editor')).toBeVisible();
  await page.getByTestId('cell-fill').click();
  await page.getByTestId('cell-fill-menu').locator('[data-token="theme.accent2"]').click();
  await page.getByTestId('cell-border').click();
  await page.getByTestId('cell-border-dash').click();
  await page.getByTestId('cell-border-w-2.25').click();
  await page.keyboard.press('Escape');
  await synced(page);
  expect(await source(page)).toMatch(/cellStyles:[\s\S]*fill: theme\.accent2[\s\S]*lineWidth: 2\.25[\s\S]*dash: dash|cellStyles:[\s\S]*dash: dash/);
});

test('table cell: selected characters take size and bold, kept as cell runs', async ({ page }) => {
  await open(page);
  await page.getByTestId('slide-thumb-roadmap').locator('.slide-button').click();
  await page.getByTestId('slide-canvas').locator('[data-element-id^="table"]').first().dblclick();
  const cell = page.getByTestId('table-editor').locator('[data-cell="1:1"]');
  await cell.click();
  await cell.evaluate((td) => {
    const node = td.firstChild!;
    const r = document.createRange();
    r.setStart(node, 0);
    r.setEnd(node, 5);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  });
  await page.keyboard.press('Control+b');
  const box = (await cell.boundingBox())!;
  await page.mouse.click(box.x + 8, box.y + box.height / 2, { button: 'right' });
  await page.getByTestId('context-menu').getByTestId('ctx-size').click();
  await page.getByTestId('context-submenu').getByTestId('ctx-size-20').click();
  // No Enter: a click outside the table must keep the formatting.
  const frame = (await page.getByTestId('slide-canvas').boundingBox())!;
  await page.mouse.click(frame.x + 10, frame.y + frame.height - 10);
  await synced(page);
  const src = await source(page);
  expect(src).toMatch(/cellRuns:/);
  expect(src).toMatch(/bold: true/);
  expect(src).toMatch(/size: 20/);
});

test('picture: fit inside / fill modes and restore the original ratio', async ({ page }) => {
  const { cpSync } = await import('node:fs');
  mkdirSync(resolve(root, 'tests/.tmp/fit/diagrams'), { recursive: true });
  cpSync(resolve(root, 'examples/corporate-demo/diagrams'), resolve(root, 'tests/.tmp/fit/diagrams'), { recursive: true });
  copyFileSync(resolve(root, 'examples/corporate-demo/architecture.deck'), resolve(root, 'tests/.tmp/fit/fit.deck'));
  await page.goto('/harness.html?file=tests/.tmp/fit/fit.deck');
  await page.getByTestId('slide-thumb-diagram-1').locator('.slide-button').click();
  const img = canvasEl(page, 'diagram-1').locator('img');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await canvasEl(page, 'diagram-1').click();
  await page.getByTestId('image-fit-cover').click();
  await synced(page);
  expect(await source(page)).toMatch(/fit: cover/);
  await expect(img).toHaveCSS('object-fit', 'cover');
  await page.getByTestId('image-restore-ratio').click();
  await synced(page);
  const ratio = await img.evaluate((i: HTMLImageElement) => i.naturalWidth / i.naturalHeight);
  const m = /id: diagram-1[\s\S]*?w: ([\d.]+)\n\s+h: ([\d.]+)/.exec(await source(page))!;
  expect(Math.abs(Number(m[1]) / Number(m[2]) - ratio)).toBeLessThan(0.01);
  expect(await source(page)).toMatch(/fit: stretch/);
});

test('View › Hidden objects shows hidden elements ghosted, selectable to unhide', async ({ page }) => {
  await open(page);
  await page.getByTestId('slide-thumb-agenda').locator('.slide-button').click();
  await addShape(page, 'Ellipse');
  await canvasEl(page, 'shape-1').click({ button: 'right' });
  await page.getByTestId('context-menu').getByTestId('ctx-hide').click();
  await synced(page);
  await expect(canvasEl(page, 'shape-1')).toHaveCount(0);
  await page.getByTestId('tab-view').click();
  await page.getByTestId('toggle-hidden').click();
  await expect(canvasEl(page, 'shape-1')).toHaveAttribute('data-hidden', 'true');
  await canvasEl(page, 'shape-1').click();
  await page.getByRole('button', { name: 'Afficher', exact: true }).click();
  await synced(page);
  await expect(canvasEl(page, 'shape-1')).not.toHaveAttribute('data-hidden', 'true');
});

test('table: ribbon font tools on a cell range style only those cells', async ({ page }) => {
  await open(page);
  await page.getByTestId('slide-thumb-roadmap').locator('.slide-button').click();
  await page.getByTestId('slide-canvas').locator('[data-element-id^="table"]').first().dblclick();
  const ed = page.getByTestId('table-editor');
  await ed.locator('[data-cell="1:0"]').click();
  await ed.locator('[data-cell="2:1"]').click({ modifiers: ['Shift'] });
  await page.getByTestId('tab-home').click();
  await page.getByTestId('bold').click();
  await page.getByTestId('color-text').click();
  await page.getByTestId('color-text-menu').locator('[data-token="theme.accent2"]').click();
  await page.getByTestId('font-size').click();
  await page.getByTestId('font-size-menu').getByRole('menuitem', { name: '20 pt', exact: true }).click();
  const frame = (await page.getByTestId('slide-canvas').boundingBox())!;
  await page.mouse.click(frame.x + 10, frame.y + frame.height - 10);
  await synced(page);
  const src = await source(page);
  // The roadmap table is Markdown: its cell styles sit in the slide frontmatter override.
  const table = /cellStyles:[\s\S]*?(?=\n---)/.exec(src)![0];
  expect((table.match(/bold: true/g) ?? []).length).toBe(4);
  expect((table.match(/color: theme\.accent2/g) ?? []).length).toBe(4);
  expect((table.match(/size: 20/g) ?? []).length).toBe(4);
  // The table's own style is untouched.
  expect(src).not.toMatch(/style:\s*\n\s+color: theme\.accent2/);
});
