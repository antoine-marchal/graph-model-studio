import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { basename, extname, join, posix, relative } from 'node:path';
import { imageSize } from 'image-size';
import { extract } from 'pptx-masters';
import { generateThemeJson } from 'pptx-masters/src/generator/code.js';
import { createColorResolver } from 'pptx-masters/src/parser/colors.js';
import { parseClrMap } from 'pptx-masters/src/parser/theme.js';
import { extractTextProps } from 'pptx-masters/src/parser/text.js';
import { CorporateMaster, type AssetDef } from '@corporate-slides/core';
import { loadPackageSafely } from './safety.js';
import { inventoryPackage, picturesIn, type PictureInfo } from './ooxml.js';
import { buildCorporateMaster, type MasterTextStyles } from './normalize.js';
import { compatibilityReport, extractionReport, generatedMastersTs, slideMastersDoc, STYLE_GUIDE_TEMPLATE } from './docs.js';
import { convertMetafileToPng, renderLayoutThumbnails } from './reference.js';

export * from './safety.js';
export * from './ooxml.js';
export * from './normalize.js';
export * from './reference.js';

export const PPTX_MASTERS_VERSION = '0.1.1';
export const MASTER_DIR = join('.corporate-slides', 'master');

export interface ImportOptions {
  /** Render PowerPoint reference thumbnails of every layout when PowerPoint is available. */
  thumbnails?: boolean;
  /** Convert EMF/WMF assets to PNG previews (Windows). Default true. */
  metafilePreviews?: boolean;
  log?: (msg: string) => void;
}

export interface ImportResult {
  master: CorporateMaster;
  outDir: string;
  files: string[];
  notes: string[];
}

/** Find PowerPoint templates in a directory tree (skips node_modules, dot-dirs and outputs). */
export async function discoverTemplates(root: string, depth = 4): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, d: number) => {
    if (d < 0) return;
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist' || e.name === 'out') continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p, d - 1);
      else if (/\.(pptx|potx)$/i.test(e.name) && !e.name.startsWith('~$')) out.push(p);
    }
  };
  await walk(root, depth);
  return out.sort();
}

/**
 * Import a corporate template into `<workspace>/.corporate-slides/master/`.
 * The source file is only read; it is never modified.
 */
export async function importTemplate(templatePath: string, workspaceRoot: string, opts: ImportOptions = {}): Promise<ImportResult> {
  const log = opts.log ?? (() => {});
  const outDir = join(workspaceRoot, MASTER_DIR);
  const assetsDir = join(outDir, 'assets');
  const notes: string[] = [];

  log(`Vérification du paquet ${basename(templatePath)}…`);
  const zip = await loadPackageSafely(templatePath);
  const bytes = await readFile(templatePath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  log('Inventaire OOXML…');
  const inv = await inventoryPackage(zip);

  log('Extraction des masques (pptx-masters)…');
  const r = await extract(templatePath);
  r.palette = generateThemeJson(r.themeColors, r.themeFonts, r.dimensions, r.masterData).palette;

  // Master text styles (p:txStyles) are not exposed by extract(): resolve them with pptx-masters internals.
  const textStyles = new Map<string, MasterTextStyles>();
  for (const m of inv.masters) {
    const root = m.xml['p:sldMaster'] as Record<string, Record<string, unknown>> | undefined;
    const resolver = createColorResolver(r.themeColors, parseClrMap(root?.['p:clrMap']), r.themeFonts);
    const tx = root?.['p:txStyles'] ?? {};
    const lst = (el: unknown) => (el ? extractTextProps({ 'a:lstStyle': el }, resolver, r.themeFonts).lstStyleProps : null);
    // Slide-number style lives on the master's sldNum placeholder (inherited by layouts).
    const shapes = [((root?.['p:cSld'] as Record<string, Record<string, unknown>> | undefined)?.['p:spTree']?.['p:sp']) ?? []].flat() as Record<string, any>[];
    const sldNum = shapes.find((sp) => sp?.['p:nvSpPr']?.['p:nvPr']?.['p:ph']?.['@_type'] === 'sldNum');
    const sldNumLevels = sldNum?.['p:txBody'] ? extractTextProps(sldNum['p:txBody'], resolver, r.themeFonts).lstStyleProps : null;
    textStyles.set(m.part, { title: lst(tx['p:titleStyle']), body: lst(tx['p:bodyStyle']), sldNum: sldNumLevels?.[1] ?? null });
  }

  log('Copie des ressources…');
  await rm(assetsDir, { recursive: true, force: true });
  await mkdir(assetsDir, { recursive: true });
  const assets: AssetDef[] = [];
  const assetByPart = new Map<string, string>();
  for (const media of r.mediaFiles) {
    const file = zip.file(media.archivePath);
    if (!file) continue;
    const name = posix.basename(media.archivePath);
    if (!/^[\w.-]+$/.test(name)) continue; // defensive: archive names were already checked for traversal
    const target = join(assetsDir, name);
    const data = await file.async('nodebuffer');
    await writeFile(target, data);
    const id = name.replace(/\.\w+$/, '');
    const format = extname(name).slice(1).toLowerCase();
    const asset: AssetDef = { id, file: `assets/${name}`, originalPart: media.archivePath, format };
    if (format === 'emf' || format === 'wmf') {
      if (opts.metafilePreviews !== false) {
        const png = join(assetsDir, `${id}.preview.png`);
        if (await convertMetafileToPng(target, png)) asset.preview = `assets/${id}.preview.png`;
        else notes.push(`Aperçu PNG de ${name} indisponible (conversion EMF/WMF possible uniquement sous Windows) : cadre de substitution dans l'éditeur.`);
      }
    } else {
      try {
        const dim = imageSize(data);
        asset.width = dim.width;
        asset.height = dim.height;
      } catch {
        /* unknown image format: no intrinsic size */
      }
    }
    assets.push(asset);
    assetByPart.set(media.archivePath, id);
  }

  const pictures = new Map<string, PictureInfo[]>();
  for (const part of [...inv.masters.map((m) => m.part), ...inv.layouts.map((l) => l.part)]) pictures.set(part, await picturesIn(zip, part));

  const master = CorporateMaster.parse(
    buildCorporateMaster({
      r,
      inv,
      textStyles,
      assets,
      assetByPart,
      pictures,
      source: {
        file: basename(templatePath),
        sha256,
        importedAt: new Date().toISOString(),
        extractor: { name: 'pptx-masters', version: PPTX_MASTERS_VERSION },
      },
    }),
  );

  if (opts.thumbnails) {
    log('Vignettes de référence (PowerPoint)…');
    const thumbsDir = join(outDir, 'thumbnails');
    await rm(thumbsDir, { recursive: true, force: true });
    try {
      const files = await renderLayoutThumbnails(templatePath, thumbsDir);
      if (!files.length) notes.push('Vignettes de référence non générées : PowerPoint indisponible (le navigateur de masques utilise le rendu interne).');
      for (const l of master.layouts) {
        const li = inv.layouts.find((x) => x.part === l.sourcePart);
        const mi = inv.masters.find((x) => x.part === li?.masterPart);
        const f = li && mi ? `m${mi.index + 1}-l${li.orderInMaster + 1}.png` : '';
        if (f && files.includes(f)) l.thumbnail = `thumbnails/${f}`;
      }
    } catch (e) {
      notes.push(`Vignettes de référence en échec : ${(e as Error).message.split('\n')[0]}`);
    }
  }

  await mkdir(outDir, { recursive: true });
  const write = async (name: string, content: string) => {
    await writeFile(join(outDir, name), content, 'utf8');
    return join(outDir, name);
  };
  const files = [
    await write('corporate-master.json', JSON.stringify(master, null, 2) + '\n'),
    await write('theme.json', JSON.stringify({ ...master.theme, dimensions: master.dimensions }, null, 2) + '\n'),
    await write('layouts.json', JSON.stringify(master.layouts, null, 2) + '\n'),
    await write('generated-masters.ts', generatedMastersTs(master)),
    await write('extraction-report.md', extractionReport(master, inv, notes)),
    await write('compatibility-report.md', compatibilityReport(master, inv)),
    await write('slide-masters.md', slideMastersDoc(master)),
  ];
  if (!existsSync(join(outDir, 'style-guide.md'))) files.push(await write('style-guide.md', STYLE_GUIDE_TEMPLATE(master)));
  log(`Import terminé : ${master.layouts.length} dispositions → ${relative(workspaceRoot, outDir)}`);
  return { master, outDir, files, notes };
}

/** Load a previously imported corporate master (validated). */
export async function loadMaster(masterJsonPath: string): Promise<CorporateMaster> {
  return CorporateMaster.parse(JSON.parse(await readFile(masterJsonPath, 'utf8')));
}

