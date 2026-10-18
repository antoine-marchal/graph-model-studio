import JSZip from 'jszip';
import { readFile, stat } from 'node:fs/promises';
import { tr } from '@corporate-slides/core';

/** Limits applied to untrusted PowerPoint packages before any parsing. */
export const LIMITS = {
  maxFileBytes: 300 * 1024 * 1024,
  maxEntries: 10_000,
  maxUncompressedBytes: 1024 * 1024 * 1024,
  maxCompressionRatio: 200,
};

export class UnsafePackageError extends Error {}

/** True when a ZIP entry name could escape an extraction directory or is otherwise suspicious. */
export function isUnsafeEntryName(name: string): boolean {
  return (
    name.includes('\0') ||
    name.includes('\\') ||
    name.startsWith('/') ||
    /^[a-zA-Z]:/.test(name) ||
    name.split('/').some((seg) => seg === '..' || seg === '.')
  );
}

interface ZipEntryInternals {
  _data?: { uncompressedSize?: number; compressedSize?: number };
}

/**
 * Load an OOXML package as untrusted input: size limit, entry-count limit, path-traversal
 * rejection, and zip-bomb heuristics based on the central directory sizes.
 */
export async function loadPackageSafely(path: string): Promise<JSZip> {
  const st = await stat(path);
  if (st.size > LIMITS.maxFileBytes) throw new UnsafePackageError(tr(`Fichier trop volumineux (${st.size} octets)`, `File too large (${st.size} bytes)`));
  const zip = await loadZipSafely(await readFile(path));
  if (!zip.file('[Content_Types].xml') || !zip.file('ppt/presentation.xml')) {
    throw new UnsafePackageError(tr("Ce fichier n'est pas un paquet PowerPoint (presentation.xml absent)", "This file is not a PowerPoint package (presentation.xml missing)"));
  }
  return zip;
}

/** Any OOXML zip (clipboard drawings…) with the same entry, traversal and zip-bomb checks. */
export async function loadZipSafely(bytes: Uint8Array): Promise<JSZip> {
  if (bytes.byteLength > LIMITS.maxFileBytes) throw new UnsafePackageError(tr(`Fichier trop volumineux (${bytes.byteLength} octets)`, `File too large (${bytes.byteLength} bytes)`));
  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files);
  if (names.length > LIMITS.maxEntries) throw new UnsafePackageError(tr(`Trop d'entrées ZIP (${names.length})`, `Too many ZIP entries (${names.length})`));
  let total = 0;
  for (const name of names) {
    if (isUnsafeEntryName(name)) throw new UnsafePackageError(tr(`Entrée ZIP dangereuse : ${JSON.stringify(name)}`, `Dangerous ZIP entry: ${JSON.stringify(name)}`));
    const data = (zip.files[name] as unknown as ZipEntryInternals)._data;
    const u = data?.uncompressedSize ?? 0;
    const c = data?.compressedSize ?? 0;
    total += u;
    if (c > 0 && u / c > LIMITS.maxCompressionRatio && u > 10 * 1024 * 1024) {
      throw new UnsafePackageError(tr(`Taux de compression suspect pour ${name}`, `Suspicious compression ratio for ${name}`));
    }
  }
  if (total > LIMITS.maxUncompressedBytes) throw new UnsafePackageError(tr(`Contenu décompressé trop volumineux (${total} octets)`, `Uncompressed content too large (${total} bytes)`));
  return zip;
}
