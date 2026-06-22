import { isTauri } from './tauri'

export interface SaveOptions {
  /** suggested file name incl. extension, e.g. "model.gmc" */
  defaultName: string
  /** dialog filters, e.g. [{ name: 'JSON', extensions: ['json'] }] */
  filters?: { name: string; extensions: string[] }[]
}

/** Save text content. In Tauri shows the native save dialog (file explorer);
 *  in a browser falls back to an anchor download. Returns false if cancelled. */
export async function saveTextFile(content: string, opts: SaveOptions): Promise<boolean> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { invoke } = await import('@tauri-apps/api/core')
    const path = await save({ defaultPath: opts.defaultName, filters: opts.filters })
    if (!path) return false
    await invoke('write_text_file', { path, content })
    return true
  }
  browserDownload(new Blob([content]), opts.defaultName)
  return true
}

/** Save binary content (e.g. a PNG). Same Tauri/browser behaviour as saveTextFile. */
export async function saveBinaryFile(bytes: Uint8Array, opts: SaveOptions): Promise<boolean> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { invoke } = await import('@tauri-apps/api/core')
    const path = await save({ defaultPath: opts.defaultName, filters: opts.filters })
    if (!path) return false
    await invoke('write_binary_file', { path, contents: Array.from(bytes) })
    return true
  }
  browserDownload(new Blob([bytes as unknown as BlobPart]), opts.defaultName)
  return true
}

/** Build dialog filters from a file extension (no dot), e.g. "png" → PNG filter. */
export function filtersForExt(ext: string): { name: string; extensions: string[] }[] {
  return [{ name: ext.toUpperCase(), extensions: [ext] }]
}

function browserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
