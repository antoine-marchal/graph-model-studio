import type { StorageProvider } from './storage-provider'

export class BrowserStorageProvider implements StorageProvider {
  readonly id = 'browser'
  readonly label = 'Browser'

  private fileHandle: FileSystemFileHandle | null = null

  canOpen(): boolean { return true }
  canSave(): boolean { return true }

  async open(): Promise<{ content: string; name: string } | null> {
    // Try File System Access API
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await (window as unknown as {
          showOpenFilePicker(opts: unknown): Promise<FileSystemFileHandle[]>
        }).showOpenFilePicker({
          types: [
            { description: 'Graph Model', accept: { 'text/plain': ['.gmc', '.graphmodel'] } },
            { description: 'JSON', accept: { 'application/json': ['.json'] } },
          ],
          multiple: false,
        })
        this.fileHandle = handle
        const file = await handle.getFile()
        const content = await file.text()
        return { content, name: file.name }
      } catch {
        return null
      }
    }

    // Fallback: input[type=file]
    return new Promise(resolve => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.gmc,.graphmodel,.json'
      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) { resolve(null); return }
        const content = await file.text()
        resolve({ content, name: file.name })
      }
      input.click()
    })
  }

  async save(content: string, suggestedName = 'model.gmc'): Promise<string | null> {
    if (this.fileHandle) {
      try {
        const writable = await this.fileHandle.createWritable()
        await writable.write(content)
        await writable.close()
        return this.fileHandle.name
      } catch {
        // fall through to saveAs
      }
    }
    return this.saveAs(content, suggestedName)
  }

  async saveAs(content: string, suggestedName = 'model.gmc'): Promise<string | null> {
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as unknown as {
          showSaveFilePicker(opts: unknown): Promise<FileSystemFileHandle>
        }).showSaveFilePicker({
          suggestedName,
          types: [
            { description: 'Graph Model', accept: { 'text/plain': ['.gmc'] } },
            { description: 'JSON', accept: { 'application/json': ['.json'] } },
          ],
        })
        this.fileHandle = handle
        const writable = await handle.createWritable()
        await writable.write(content)
        await writable.close()
        return handle.name
      } catch {
        return null
      }
    }

    // Fallback: download
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = suggestedName
    a.click()
    URL.revokeObjectURL(url)
    return suggestedName
  }
}

export const browserStorageProvider = new BrowserStorageProvider()
