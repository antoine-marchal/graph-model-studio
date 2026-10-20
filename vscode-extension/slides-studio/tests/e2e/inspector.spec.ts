import { expect, test, type Page } from '@playwright/test';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
let n = 0;

async function open(page: Page, example: string): Promise<void> {
  mkdirSync(resolve(root, 'tests/.tmp'), { recursive: true });
  const rel = `tests/.tmp/insp-${process.pid}-${++n}.slides.yaml`;
  copyFileSync(resolve(root, example), resolve(root, rel));
  await page.goto(`/harness.html?file=${rel}`);
  await expect(page.getByTestId('slide-canvas')).toBeVisible();
}

const source = (page: Page) => page.evaluate(() => window.__harness.text());
const canvasEl = (page: Page, id: string) => page.getByTestId('slide-canvas').locator(`[data-element-id="${id}"]`);
const synced = (page: Page) => expect(page.getByTestId('sync-state')).toHaveText('Synchronisé avec la source');

test('renames an element by double-clicking its id', async ({ page }) => {
  await open(page, 'examples/corporate-demo/architecture.slides.yaml');
  await canvasEl(page, 'erp-box').click({ position: { x: 20, y: 10 } });
  await page.getByTestId('element-id').dblclick();
  const input = page.getByTestId('element-id-input');
  await input.fill('erp-node');
  await input.press('Enter');
  await synced(page);
  expect(await source(page)).toMatch(/- id: erp-node\n/);
  await expect(page.getByTestId('element-id')).toHaveText('erp-node');
});

test('numeric fields: +/- buttons, and typed values commit when clicking elsewhere', async ({ page }) => {
  await open(page, 'examples/corporate-demo/architecture.slides.yaml');
  await canvasEl(page, 'erp-box').click({ position: { x: 20, y: 10 } });
  const x = page.getByTestId('field-x');
  await x.fill('6.5');
  // No Enter: pressing on the canvas (whose handlers preventDefault) must still commit.
  await canvasEl(page, 'erp-box').click({ position: { x: 20, y: 10 } });
  await synced(page);
  expect(await source(page)).toMatch(/- id: erp-box[\s\S]*?x: 6\.5\n/);
  await page.getByTestId('field-x-inc').click();
  await synced(page);
  expect(await source(page)).toMatch(/- id: erp-box[\s\S]*?x: 6\.55\n/);
  await expect(x).toHaveValue('6.55');
});

test('master edit: double-click a layout text to type into it', async ({ page }) => {
  await open(page, 'examples/corporate-demo/architecture.slides.yaml');
  await page.getByTestId('slide-layout').selectOption('citation');
  await synced(page);
  await page.getByTestId('tab-design').click();
  await page.getByTestId('toggle-master-edit').click();
  await page.getByTestId('master-scope-slide').click();
  const objects = page.getByTestId('slide-canvas').locator('[data-master-object]:not([data-master-ghost])');
  const editor = page.getByTestId('master-text-editor');
  for (let i = 0; i < (await objects.count()) && !(await editor.isVisible()); i++) {
    const o = objects.nth(i);
    if (!(await o.innerText()).trim() || !(await o.locator('div').first().isVisible())) continue;
    await o.locator('div').first().dblclick({ force: true });
  }
  await expect(editor).toBeFocused();
  await page.keyboard.type('Texte maître');
  await page.getByTestId('slide-canvas').click({ position: { x: 5, y: 5 } });
  await expect(editor).toHaveCount(0);
  await synced(page);
  expect(await source(page)).toContain('Texte maître');
});

test('layout designer: the whole ribbon draws on the layout, placeholders included, undo and back to the slide', async ({ page }) => {
  await open(page, 'examples/corporate-demo/architecture.slides.yaml');
  const before = await source(page);
  await page.getByTestId('tab-design').click();
  await page.getByTestId('toggle-master-edit').click();
  await expect(page.getByTestId('master-banner')).toContainText(/Conception|Designing/);
  const layoutId = (await page.getByTestId('layout-id').innerText()).trim();
  const layout = () => page.evaluate((id) => window.__harness.master().layouts.find((l) => l.id === id)!, layoutId);
  const objects0 = (await layout()).objects.length;
  const placeholders0 = (await layout()).placeholders.length;

  // The layout's display name, besides its id.
  await page.getByTestId('layout-name').fill('Ma disposition');
  await page.getByTestId('layout-name').press('Enter');
  await expect.poll(async () => (await layout()).name).toBe('Ma disposition');
  await expect(page.getByTestId('master-banner')).toContainText('Ma disposition');

  // A star from the shape gallery, like on a slide.
  await page.getByTestId('tab-insert').click();
  await page.getByTestId('add-shape').click();
  await page.locator('.shape-gallery [data-shape="star5"]').click();
  await expect.poll(async () => (await layout()).objects.length).toBe(objects0 + 1);
  expect(JSON.stringify((await layout()).objects.at(-1))).toContain('"shape":"star5"');

  // A new placeholder zone from the layout inspector.
  await page.keyboard.press('Escape');
  await page.getByTestId('slide-canvas').click({ position: { x: 3, y: 3 } });
  await page.getByTestId('add-placeholder-body').click();
  await expect.poll(async () => (await layout()).placeholders.length).toBe(placeholders0 + 1);

  // Undo is the designer's own.
  await page.getByTestId('undo').click();
  await expect.poll(async () => (await layout()).placeholders.length).toBe(placeholders0);

  // Back to the presentation: the star is part of the slide's layout, the deck source is untouched.
  await page.getByTestId('close-master-edit').click();
  await expect(page.getByTestId('master-banner')).toHaveCount(0);
  await expect(page.getByTestId('slide-canvas').locator('[data-master-object] polygon, [data-master-object] path').first()).toBeVisible();
  expect(await source(page)).toBe(before);
});

test('design ribbon: every layout of every master, to design or delete', async ({ page }) => {
  await open(page, 'examples/corporate-demo/architecture.slides.yaml');
  await page.getByTestId('tab-design').click();
  await page.getByTestId('all-layouts').click();
  const gallery = page.getByTestId('layouts-gallery');
  const target = await page.evaluate(() => window.__harness.master().layouts.at(-1)!);
  await expect(gallery.getByTestId(`gallery-delete-${target.id}`)).toBeVisible();
  await expect(gallery.getByTestId(`gallery-delete-master-${target.masterId}`)).toBeVisible();
  await gallery.getByTestId(`gallery-edit-${target.id}`).click();
  await expect(page.getByTestId('master-banner')).toContainText(target.name);
  await expect(page.getByTestId('layout-id')).toHaveText(target.id);
});

test('groups: Ctrl+G associates the selection, one click picks the whole group, Ctrl+Shift+G dissociates', async ({ page }) => {
  await open(page, 'examples/corporate-demo/architecture.slides.yaml');
  await canvasEl(page, 'plm-box').click({ position: { x: 20, y: 10 } });
  await canvasEl(page, 'erp-box').click({ position: { x: 20, y: 10 }, modifiers: ['Shift'] });
  await page.keyboard.press('Control+g');
  await synced(page);
  expect((await source(page)).match(/group: group-1/g)).toHaveLength(2);
  await page.getByTestId('slide-canvas').click({ position: { x: 5, y: 5 } });
  await canvasEl(page, 'plm-box').click({ position: { x: 20, y: 10 } });
  await expect(page.locator('[data-selection]')).toHaveCount(2);
  // Duplicating the group makes a new group, not new members of this one.
  await page.keyboard.press('Control+d');
  await synced(page);
  expect((await source(page)).match(/group: group-2/g)).toHaveLength(2);
  await page.keyboard.press('Control+Shift+g');
  await synced(page);
  expect(await source(page)).not.toContain('group: group-2');
  expect((await source(page)).match(/group: group-1/g)).toHaveLength(2);
});

test('layout designer: a text box becomes a placeholder and back, keeping its style', async ({ page }) => {
  await open(page, 'examples/corporate-demo/architecture.slides.yaml');
  await page.getByTestId('tab-design').click();
  await page.getByTestId('toggle-master-edit').click();
  const layoutId = (await page.getByTestId('layout-id').innerText()).trim();
  const layout = () => page.evaluate((id) => window.__harness.master().layouts.find((l) => l.id === id)!, layoutId);
  const { objects: o0, placeholders: p0 } = await layout();
  await page.getByTestId('tab-insert').click();
  await page.getByTestId('add-text').click();
  await expect.poll(async () => (await layout()).objects.length).toBe(o0.length + 1);
  const box = (await page.locator('[data-selection]').first().boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await page.getByTestId('ctx-to-placeholder').click();
  await expect.poll(async () => (await layout()).placeholders.length).toBe(p0.length + 1);
  expect((await layout()).objects.length).toBe(o0.length);
  const ph = (await layout()).placeholders.at(-1)!;
  expect(ph.style.fontSize).toBeGreaterThan(0);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' });
  await page.getByTestId('ctx-to-element').click();
  await expect.poll(async () => (await layout()).placeholders.length).toBe(p0.length);
  expect((await layout()).objects.length).toBe(o0.length + 1);
  expect(JSON.stringify((await layout()).objects.at(-1))).toContain(`"fontSize":${ph.style.fontSize}`);
});
