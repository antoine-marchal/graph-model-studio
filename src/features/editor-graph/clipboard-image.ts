import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/services/tauri'
import { drawingImageDataUrl } from './drawing-strokes'

function blobAsDataUrl(blob: Blob): Promise<string | undefined> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(
      typeof reader.result === 'string' ? drawingImageDataUrl(reader.result) : undefined,
    ))
    reader.addEventListener('error', () => resolve(undefined))
    reader.readAsDataURL(blob)
  })
}

/** Fall back to the native clipboard for bitmap formats hidden by WebView2. */
export async function readClipboardImageDataUrl(): Promise<string | undefined> {
  if (isTauri()) {
    try {
      return drawingImageDataUrl((await invoke<string | null>('read_clipboard_image')) ?? undefined)
    } catch {
      return undefined
    }
  }

  try {
    if (!navigator.clipboard?.read) return undefined
    for (const item of await navigator.clipboard.read()) {
      const imageType = item.types.find(type => type.startsWith('image/'))
      if (imageType) return blobAsDataUrl(await item.getType(imageType))
    }
  } catch {
    // Clipboard permissions vary by browser; the paste event remains primary.
  }
  return undefined
}
