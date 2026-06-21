import type { StorageProvider } from './storage-provider'

// Stub — to be implemented when Tauri is integrated
// Replace the body with actual Tauri fs/dialog API calls
export class TauriStorageProvider implements StorageProvider {
  readonly id = 'tauri'
  readonly label = 'Tauri (Desktop)'

  canOpen(): boolean { return false }
  canSave(): boolean { return false }

  async open(): Promise<{ content: string; name: string } | null> {
    throw new Error('Tauri storage not yet implemented')
  }

  async save(_content: string, _suggestedName?: string): Promise<boolean> {
    throw new Error('Tauri storage not yet implemented')
  }

  async saveAs(_content: string, _suggestedName?: string): Promise<boolean> {
    throw new Error('Tauri storage not yet implemented')
  }
}
