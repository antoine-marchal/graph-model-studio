import { existsSync, readFileSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { imageSize } from 'image-size';
import { renderedImageSrc, validateDocument, type CorporateMaster, type Diagnostic, type SlideDocument } from '@corporate-slides/core';
import { loadMaster, MASTER_DIR } from '@corporate-slides/master-extractor';
import { parseSource, sourceKindOf, type SourceKind } from '@corporate-slides/parser';

/** Locate `.corporate-slides/master/corporate-master.json` from a source file upwards. */
export function findMasterDir(from: string): string | null {
  let dir = existsSync(from) && statSync(from).isDirectory() ? from : dirname(from);
  for (;;) {
    const candidate = join(dir, MASTER_DIR);
    if (existsSync(join(candidate, 'corporate-master.json'))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Resolve a presentation image path, refusing paths that leave the project root. */
export function resolveImage(sourceDir: string, src: string, projectRoot: string): string | null {
  const file = renderedImageSrc(src);
  const p = isAbsolute(file) ? file : resolve(sourceDir, file);
  const root = resolve(projectRoot);
  return p === root || p.startsWith(root + sep) ? p : null;
}

export interface LoadedProject {
  sourcePath: string;
  kind: SourceKind;
  masterDir: string;
  master: CorporateMaster;
  doc: SlideDocument;
  parseErrors: string[];
}

export async function loadMasterFor(sourcePath: string): Promise<{ masterDir: string; master: CorporateMaster }> {
  const masterDir = findMasterDir(sourcePath);
  if (!masterDir) throw new Error(`Aucun masque corporate trouvé (${MASTER_DIR}). Lancez d'abord « slides master import <gabarit> ».`);
  return { masterDir, master: await loadMaster(join(masterDir, 'corporate-master.json')) };
}

export function parseWithMaster(text: string, kind: SourceKind, master: CorporateMaster) {
  return parseSource(text, kind, { dimensions: master.dimensions });
}

export async function loadProject(sourcePath: string): Promise<LoadedProject> {
  const kind = sourceKindOf(sourcePath);
  if (!kind) throw new Error(`Extension non reconnue : ${sourcePath} (attendu .deck, .slides.md, .slides.yaml ou .slides.json)`);
  const { masterDir, master } = await loadMasterFor(sourcePath);
  const { doc, errors } = parseWithMaster(await readFile(sourcePath, 'utf8'), kind, master);
  return { sourcePath, kind, masterDir, master, doc, parseErrors: errors };
}

/** Filesystem-aware validation options for a source file. */
export function fsValidateOptions(sourcePath: string, projectRoot: string) {
  const dir = dirname(sourcePath);
  const sizeCache = new Map<string, { width: number; height: number } | undefined>();
  return {
    assetExists: (src: string) => {
      const p = resolveImage(dir, src, projectRoot);
      return !!p && existsSync(p);
    },
    imageSize: (src: string) => {
      if (!sizeCache.has(src)) {
        const p = resolveImage(dir, src, projectRoot);
        try {
          const d = p ? imageSize(readFileSync(p)) : undefined;
          sizeCache.set(src, d?.width && d.height ? { width: d.width, height: d.height } : undefined);
        } catch {
          sizeCache.set(src, undefined);
        }
      }
      return sizeCache.get(src);
    },
  };
}

/** Project root = parent of `.corporate-slides`. */
export const projectRootOf = (masterDir: string) => resolve(masterDir, '..', '..');

export function validateProject(p: LoadedProject): Diagnostic[] {
  return validateDocument(p.doc, p.master, fsValidateOptions(p.sourcePath, projectRootOf(p.masterDir)));
}
