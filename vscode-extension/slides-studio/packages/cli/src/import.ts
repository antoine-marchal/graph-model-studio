import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tr } from '@corporate-slides/core';
import { convertSlides, importTemplate, loadPackageSafely, type ConvertResult, type ImportOptions } from '@corporate-slides/master-extractor';
import { documentToDeck, parseSource } from '@corporate-slides/parser';

export interface PresentationImport {
  /** The written `.deck`. */
  deckPath: string;
  /** `.corporate-slides/master` created next to it from the presentation's own masters. */
  masterDir: string;
  reportPath: string;
  warnings: string[];
  stats: ConvertResult['stats'];
}

/**
 * Import a PowerPoint presentation as a self-contained project folder:
 * `<outDir>/.corporate-slides/master/` (its masters and layouts), `<outDir>/media/` (its pictures)
 * and `<outDir>/<name>.deck`. The `.pptx` itself is only read.
 */
export async function importPresentation(pptxPath: string, outDir: string, opts: ImportOptions = {}): Promise<PresentationImport> {
  const log = opts.log ?? (() => {});
  await mkdir(outDir, { recursive: true });
  const tpl = await importTemplate(pptxPath, outDir, opts);
  log(tr('Conversion des diapositives…', 'Converting slides…'));
  const conv = await convertSlides(await loadPackageSafely(pptxPath), tpl.master);
  if (conv.media.length) {
    await mkdir(join(outDir, 'media'), { recursive: true });
    for (const m of conv.media) await writeFile(join(outDir, 'media', m.name), m.data);
  }
  const name = basename(pptxPath).replace(/\.(pptx|potx)$/i, '');
  const deck = documentToDeck(conv.doc);
  const warnings = [...conv.warnings];
  // Round-trip check: the written deck must read back as the converted document.
  const back = parseSource(deck, 'markdown', { dimensions: tpl.master.dimensions });
  for (const e of back.errors) warnings.push(`${tr('Relecture du .deck', '.deck read-back')} : ${e}`);
  const deckPath = join(outDir, `${name}.deck`);
  await writeFile(deckPath, deck, 'utf8');
  const reportPath = join(outDir, `${name}.import-report.md`);
  const s = conv.stats;
  await writeFile(
    reportPath,
    [
      `# ${tr('Import PowerPoint', 'PowerPoint import')} — ${basename(pptxPath)}`,
      '',
      `- ${tr('Diapositives', 'Slides')} : ${s.slides}`,
      `- ${tr('Éléments convertis', 'Converted elements')} : ${s.elements} (${s.images} ${tr('images', 'pictures')}, ${s.tables} ${tr('tableaux', 'tables')})`,
      `- ${tr('Éléments ignorés', 'Skipped elements')} : ${s.skipped}`,
      `- ${tr('Dispositions importées', 'Imported layouts')} : ${tpl.master.layouts.length}`,
      '',
      `## ${tr('Points d’attention', 'Things to check')}`,
      '',
      ...(warnings.length ? warnings.map((w) => `- ${w}`) : [`- ${tr('Aucun', 'None')}`]),
      ...tpl.notes.map((n) => `- ${n}`),
      '',
    ].join('\n'),
    'utf8',
  );
  log(tr(`Import terminé : ${s.slides} diapositives, ${warnings.length} point(s) d’attention`, `Import done: ${s.slides} slides, ${warnings.length} thing(s) to check`));
  return { deckPath, masterDir: tpl.outDir, reportPath, warnings: [...warnings, ...tpl.notes], stats: s };
}
