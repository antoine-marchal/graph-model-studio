import { expect, test } from '@playwright/test';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/** Captures reference screenshots of the UI states (docs/screenshots). Not a pixel assertion. */
const root = resolve(import.meta.dirname, '../..');
const shots = resolve(root, 'docs/screenshots');

test.beforeAll(() => {
  mkdirSync(shots, { recursive: true });
  mkdirSync(resolve(root, 'tests/.tmp'), { recursive: true });
  copyFileSync(resolve(root, 'examples/corporate-demo/deck.slides.md'), resolve(root, 'tests/.tmp/shots.slides.md'));
});

for (const theme of ['dark', 'light'] as const) {
  test(`editor ${theme}`, async ({ page }) => {
    await page.goto(`/harness.html?file=tests/.tmp/shots.slides.md&theme=${theme}`);
    await page.getByTestId('slide-thumb-landscape').locator('.slide-button').click();
    await page.getByTestId('slide-canvas').locator('[data-element-id="mes-box"]').click({ position: { x: 10, y: 10 } });
    await expect(page.getByTestId('field-x')).toBeVisible();
    await page.screenshot({ path: `${shots}/editor-${theme}.png` });
    await page.getByTestId('color-fill').click();
    await page.screenshot({ path: `${shots}/palette-${theme}.png` });
    await page.keyboard.press('Escape');
    await page.getByTestId('add-slide').click();
    await page.screenshot({ path: `${shots}/layouts-${theme}.png` });
  });
}

test('master browser', async ({ page }) => {
  await page.goto('/harness.html?mode=masters');
  await expect(page.locator('[data-testid="master-layout-titre-et-contenu"]')).toBeVisible();
  await page.screenshot({ path: `${shots}/masters-dark.png` });
  await page.locator('[data-testid="master-layout-titre-et-contenu"]').click();
  await page.screenshot({ path: `${shots}/masters-layout.png` });
});

test('narrow window', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 640 });
  await page.goto('/harness.html?file=tests/.tmp/shots.slides.md');
  await expect(page.getByTestId('slide-canvas')).toBeVisible();
  await page.screenshot({ path: `${shots}/editor-narrow.png` });
});

test('review: GitLab merge request with visual diff and comments', async ({ page }) => {
  await page.goto('/harness.html?file=examples/corporate-demo/architecture.deck&base=examples/corporate-demo/deck.slides.md&review=1');
  await page.getByTestId('slide-thumb-landscape').locator('.slide-button').click();
  await page.getByTestId('pin-d2').click();
  await expect(page.getByTestId('thread-d2')).toBeVisible();
  await page.screenshot({ path: `${shots}/review-dark.png` });
});

test('insert GMC diagram dialog', async ({ page }) => {
  await page.goto('/harness.html?file=examples/corporate-demo/architecture.deck&theme=light');
  await page.getByTestId('slide-thumb-diagram').locator('.slide-button').click();
  await page.getByTestId('tab-insert').click();
  await page.getByTestId('insert-gmc').click();
  await expect(page.getByTestId('gmc-dialog')).toBeVisible();
  await page.waitForTimeout(300); // let the dialog entrance settle
  await page.screenshot({ path: `${shots}/gmc-dialog-light.png` });
});
