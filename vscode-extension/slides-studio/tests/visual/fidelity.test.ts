import { beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { findLayout, type CorporateMaster, type SlideDocument } from '@corporate-slides/core';
import { detectRenderer, importTemplate, renderPptxToPng } from '@corporate-slides/master-extractor';
import { exportPptx } from '@corporate-slides/pptx-generator';

/**
 * Reference fidelity: the same local renderer (PowerPoint COM, or LibreOffice) renders
 *   (a) each original layout of the corporate template (reference thumbnails taken at import), and
 *   (b) an empty slide of the reconstructed layout from our generated PPTX,
 * then we compare pixels. Differences measure the reconstruction, not the renderer.
 */
const root = resolve(import.meta.dirname, '../..');
const ws = join(root, 'tests/.tmp/visual-ws');
const renderer = detectRenderer();
const LAYOUTS = ['title', 'content', 'two-columns', 'section', 'title-only', 'quote', 'end'];
/** Max share of pixels differing by more than 48/255 on any channel. Calibrated on the real template (see docs/testing.md). */
const TOLERANCE = 0.02;

function diff(a: PNG, b: PNG) {
  const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
  let differing = 0;
  let sum = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * a.width + x) * 4, j = (y * b.width + x) * 4;
    const d = Math.max(Math.abs(a.data[i]! - b.data[j]!), Math.abs(a.data[i + 1]! - b.data[j + 1]!), Math.abs(a.data[i + 2]! - b.data[j + 2]!));
    sum += d;
    if (d > 48) differing++;
  }
  return { ratio: differing / (w * h), mean: sum / (w * h) };
}

describe.skipIf(renderer.kind !== 'powerpoint')('visual comparison against PowerPoint reference renders', () => {
  let master: CorporateMaster;
  const results: { layout: string; ratio: number; mean: number }[] = [];

  beforeAll(async () => {
    rmSync(ws, { recursive: true, force: true });
    mkdirSync(ws, { recursive: true });
    ({ master } = await importTemplate(join(root, 'assets/corporate/original-template.pptx'), ws, { thumbnails: true }));
    const doc: SlideDocument = {
      version: '1',
      metadata: { title: 'Visual' },
      masterRef: 'corporate',
      themeRef: 'default',
      dimensions: master.dimensions,
      slides: LAYOUTS.map((l, i) => ({ id: `s${i}`, layout: l, elements: [] })),
    };
    const out = join(ws, 'visual.pptx');
    await exportPptx(doc, master, { output: out, masterDir: join(ws, '.corporate-slides/master'), sourceDir: ws, force: true });
    await renderPptxToPng(out, join(ws, 'generated'), 640);
  }, 600_000);

  it.each(LAYOUTS)('layout %s matches the PowerPoint reference within tolerance', (alias) => {
    const layout = findLayout(master, alias)!;
    expect(layout.thumbnail, 'reference thumbnail').toBeTruthy();
    const ref = PNG.sync.read(readFileSync(join(ws, '.corporate-slides/master', layout.thumbnail!)));
    const gen = PNG.sync.read(readFileSync(join(ws, 'generated', `slide${LAYOUTS.indexOf(alias) + 1}.png`)));
    const d = diff(ref, gen);
    results.push({ layout: `${alias} (${layout.id})`, ...d });
    writeFileSync(
      join(ws, 'visual-report.md'),
      ['| Disposition | Pixels différents | Écart moyen |', '|---|---|---|', ...results.map((r) => `| ${r.layout} | ${(r.ratio * 100).toFixed(2)} % | ${r.mean.toFixed(2)} |`)].join('\n') + '\n',
    );
    expect(d.ratio).toBeLessThan(TOLERANCE);
  });
});
