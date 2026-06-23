import type { StorageProvider } from './storage-provider'

const FILTERS = [
  { name: 'Graph Model', extensions: ['gmc', 'json'] },
  { name: 'All Files', extensions: ['*'] },
]

// Desktop storage backed by Tauri's dialog + fs plugins.
export class TauriStorageProvider implements StorageProvider {
  readonly id = 'tauri'
  readonly label = 'Tauri (Desktop)'

  private lastPath: string | null = null

  canOpen(): boolean { return true }
  canSave(): boolean { return true }

  setCurrentPath(path: string): void { this.lastPath = path }

  async open(): Promise<{ content: string; name: string } | null> {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const { invoke } = await import('@tauri-apps/api/core')
    const selected = await open({ multiple: false, directory: false, filters: FILTERS })
    if (!selected || typeof selected !== 'string') return null
    const content = await invoke<string>('read_text_file', { path: selected })
    this.lastPath = selected
    return { content, name: baseName(selected) }
  }

  async save(content: string, suggestedName?: string): Promise<string | null> {
    if (!this.lastPath) return this.saveAs(content, suggestedName)
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('write_text_file', { path: this.lastPath, content })
    return baseName(this.lastPath)
  }

  async saveAs(content: string, suggestedName?: string): Promise<string | null> {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { invoke } = await import('@tauri-apps/api/core')
    const path = await save({ defaultPath: suggestedName, filters: FILTERS })
    if (!path) return null
    await invoke('write_text_file', { path, content })
    this.lastPath = path
    return baseName(path)
  }
}

function baseName(p: string): string {
  const parts = p.split(/[/\\]/)
  return parts[parts.length - 1] || p
}
