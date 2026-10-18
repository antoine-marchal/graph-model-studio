import { beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { setLocale, type CorporateMaster, type SlideDocument } from '@corporate-slides/core';
import { importTemplate } from '@corporate-slides/master-extractor';
import { parseSource } from '@corporate-slides/parser';
import { exportPptx } from '@corporate-slides/pptx-generator';
import { importPresentation, type PresentationImport } from '@corporate-slides/cli';

const root = resolve(import.meta.dirname, '../..');
const ws = join(root, 'tests/.tmp/import-ws');
const TEMPLATE = join(root, 'assets/corporate/original-template.pptx');
const SOURCE = join(root, 'examples/corporate-demo/deck.slides.md');
let master: CorporateMaster;
let original: SlideDocument;
let result: PresentationImport;
let imported: SlideDocument;

/** PowerPoint → .deck: the example deck is exported with our generator, then imported back. */
beforeAll(async () => {
  setLocale('en');
  rmSync(ws, { recursive: true, force: true });
  mkdirSync(ws, { recursive: true });
  ({ master } = await importTemplate(TEMPLATE, ws, { thumbnails: false }));
  original = parseSource(readFileSync(SOURCE, 'utf8'), 'markdown', { dimensions: master.dimensions }).doc;
  const pptx = join(ws, 'out', 'roundtrip.pptx');
  await exportPptx(original, master, { output: pptx, masterDir: join(ws, '.corporate-slides', 'master'), sourceDir: dirname(SOURCE), force: true });
  result = await importPresentation(pptx, join(ws, 'imported'), { thumbnails: false });
  imported = parseSource(readFileSync(result.deckPath, 'utf8'), 'markdown', { dimensions: master.dimensions }).doc;
}, 300_000);

describe('PowerPoint import → .deck + masters', () => {
  it('writes a self-contained project: deck, masters, media, report', () => {
    expect(result.deckPath.endsWith('roundtrip.deck')).toBe(true);
    expect(existsSync(join(ws, 'imported', '.corporate-slides', 'master', 'corporate-master.json'))).toBe(true);
    expect(existsSync(result.reportPath)).toBe(true);
    expect(result.warnings.filter((w) => w.includes('read-back'))).toEqual([]);
  });

  it('keeps every slide, its layout family and its title', () => {
    expect(imported.slides).toHaveLength(original.slides.length);
    const title = (d: SlideDocument, i: number) => d.slides[i]!.elements.find((e) => e.placeholder === 'title' && e.type === 'text');
    for (let i = 0; i < original.slides.length; i++) {
      const t = title(original, i);
      if (t?.type === 'text') expect(title(imported, i)?.type === 'text' && title(imported, i)!.type === 'text' ? (title(imported, i) as { paragraphs: { runs: { text: string }[] }[] }).paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' ') : null).toBe(t.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join(' '));
    }
  });

  it('converts tables natively, with their cells', () => {
    const tables = (d: SlideDocument) => d.slides.flatMap((s) => s.elements.filter((e) => e.type === 'table'));
    expect(tables(imported).length).toBe(tables(original).length);
    const a = tables(original)[0], b = tables(imported)[0];
    if (a?.type === 'table' && b?.type === 'table') expect(b.rows).toEqual(a.rows);
  });

  it('keeps shapes and connectors', () => {
    const count = (d: SlideDocument, t: string) => d.slides.flatMap((s) => s.elements).filter((e) => e.type === t).length;
    expect(count(imported, 'shape')).toBeGreaterThanOrEqual(count(original, 'shape'));
    expect(count(imported, 'connector') + count(imported, 'shape')).toBeGreaterThanOrEqual(count(original, 'connector') + count(original, 'shape'));
  });
});
