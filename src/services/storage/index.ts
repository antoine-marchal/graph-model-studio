export * from './storage-provider'
export * from './browser-storage-provider'
export * from './tauri-storage-provider'

import { browserStorageProvider } from './browser-storage-provider'
import { TauriStorageProvider } from './tauri-storage-provider'
import type { StorageProvider } from './storage-provider'

const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

let activeProvider: StorageProvider = inTauri
  ? new TauriStorageProvider()
  : browserStorageProvider

export function getStorageProvider(): StorageProvider {
  return activeProvider
}

export function setStorageProvider(provider: StorageProvider): void {
  activeProvider = provider
}
