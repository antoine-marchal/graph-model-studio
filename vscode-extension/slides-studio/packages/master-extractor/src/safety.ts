import JSZip from 'jszip';
import { readFile, stat } from 'node:fs/promises';

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
  if (st.size > LIMITS.maxFileBytes) throw new UnsafePackageError(`Fichier trop volumineux (${st.size} octets)`);
  const zip = await JSZip.loadAsync(await readFile(path));
  const names = Object.keys(zip.files);
  if (names.length > LIMITS.maxEntries) throw new UnsafePackageError(`Trop d'entrées ZIP (${names.length})`);
  let total = 0;
  for (const name of names) {
    if (isUnsafeEntryName(name)) throw new UnsafePackageError(`Entrée ZIP dangereuse : ${JSON.stringify(name)}`);
    const data = (zip.files[name] as unknown as ZipEntryInternals)._data;
    const u = data?.uncompressedSize ?? 0;
    const c = data?.compressedSize ?? 0;
    total += u;
    if (c > 0 && u / c > LIMITS.maxCompressionRatio && u > 10 * 1024 * 1024) {
      throw new UnsafePackageError(`Taux de compression suspect pour ${name}`);
    }
  }
  if (total > LIMITS.maxUncompressedBytes) throw new UnsafePackageError(`Contenu décompressé trop volumineux (${total} octets)`);
  if (!zip.file('[Content_Types].xml') || !zip.file('ppt/presentation.xml')) {
    throw new UnsafePackageError("Ce fichier n'est pas un paquet PowerPoint (presentation.xml absent)");
  }
  return zip;
}
