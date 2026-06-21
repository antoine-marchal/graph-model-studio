export * from './storage-provider'
export * from './browser-storage-provider'
export * from './tauri-storage-provider'

import { browserStorageProvider } from './browser-storage-provider'
import type { StorageProvider } from './storage-provider'

let activeProvider: StorageProvider = browserStorageProvider

export function getStorageProvider(): StorageProvider {
  return activeProvider
}

export function setStorageProvider(provider: StorageProvider): void {
  activeProvider = provider
}
