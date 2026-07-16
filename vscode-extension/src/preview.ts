import * as vscode from 'vscode'
import { scanGmcMarkdownBlocks } from './markdown'

export interface PreviewInput {
  source: string
  name: string
  view?: string
  theme?: 'light' | 'dark'
  target?: {
    uri: string
    kind: 'document' | 'markdown'
    blockIndex?: number
    blockId?: string
  }
}

interface PendingExport {
  resolve(dataUrl: string): void
  reject(error: Error): void
}

interface PendingRender {
  resolve(): void
  timeout: ReturnType<typeof setTimeout>
}

export class PreviewManager implements vscode.Disposable {
  private panel: vscode.WebviewPanel | undefined
  private ready: Promise<void> = Promise.resolve()
  private resolveReady: (() => void) | undefined
  private readonly rendered = new Map<string, PendingRender>()
  private readonly exports = new Map<string, PendingExport>()
  private sequence = 0
  private current: PreviewInput | undefined
  private activeRenderId: string | undefined
  private readonly applyingUpdates = new Set<string>()

  private themeOverride: 'light' | 'dark' | undefined

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly globalState: vscode.Memento,
    private readonly extensionVersion: string,
  ) {
    this.themeOverride = globalState.get<'light' | 'dark'>('gmc.preview.theme')
  }

  dispose(): void {
    this.panel?.dispose()
  }

  get visible(): boolean {
    return this.panel?.visible ?? false
  }

  private finishRender(renderId: string): void {
    const pending = this.rendered.get(renderId)
    if (!pending) return
    clearTimeout(pending.timeout)
    this.rendered.delete(renderId)
    pending.resolve()
  }

  private effectiveInput(input: PreviewInput): PreviewInput {
    return this.themeOverride ? { ...input, theme: this.themeOverride } : input
  }

  private sameInput(left: PreviewInput | undefined, right: PreviewInput): boolean {
    if (!left) return false
    return left.source === right.source
      && left.name === right.name
      && left.view === right.view
      && left.theme === right.theme
      && left.target?.uri === right.target?.uri
      && left.target?.kind === right.target?.kind
      && left.target?.blockIndex === right.target?.blockIndex
      && left.target?.blockId === right.target?.blockId
  }

  private ensurePanel(preserveFocus = true): vscode.WebviewPanel {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside, preserveFocus)
      return this.panel
    }

    const panel = vscode.window.createWebviewPanel(
      'gmc.preview',
      'Graph Model Studio',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview')],
      },
    )
    this.panel = panel
    this.ready = new Promise(resolve => { this.resolveReady = resolve })
    panel.webview.html = this.html(panel.webview)
    panel.onDidDispose(() => {
      this.panel = undefined
      for (const pending of this.exports.values()) pending.reject(new Error('Preview was closed'))
      this.exports.clear()
      for (const renderId of [...this.rendered.keys()]) this.finishRender(renderId)
    })
    panel.webview.onDidReceiveMessage(message => {
      if (message.type === 'ready') this.resolveReady?.()
      if (message.type === 'rendered') {
        this.finishRender(message.renderId)
      }
      if (message.type === 'exportResult') {
        const pending = this.exports.get(message.requestId)
        if (!pending) return
        this.exports.delete(message.requestId)
        if (message.error) pending.reject(new Error(message.error))
        else pending.resolve(message.dataUrl)
      }
      if (message.type === 'saveBinary' || message.type === 'saveText') {
        void (async () => {
          try {
            const options = message.options as {
              defaultName: string
              filters?: { name: string; extensions: string[] }[]
            }
            const activeUri = vscode.window.activeTextEditor?.document.uri
            const defaultUri = activeUri
              ? vscode.Uri.joinPath(activeUri, '..', options.defaultName)
              : undefined
            const filters = options.filters
              ? Object.fromEntries(options.filters.map(filter => [filter.name, filter.extensions]))
              : undefined
            const target = await vscode.window.showSaveDialog({ defaultUri, filters })
            if (!target) {
              panel.webview.postMessage({ type: 'saveResult', requestId: message.requestId, saved: false })
              return
            }
            const bytes = message.type === 'saveText'
              ? Buffer.from(String(message.content), 'utf8')
              : Uint8Array.from(message.content as number[])
            await vscode.workspace.fs.writeFile(target, bytes)
            panel.webview.postMessage({ type: 'saveResult', requestId: message.requestId, saved: true })
          } catch (error) {
            panel.webview.postMessage({
              type: 'saveResult',
              requestId: message.requestId,
              saved: false,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        })()
      }
      if (message.type === 'savePng') void vscode.commands.executeCommand('gmc.exportPng')
      if (message.type === 'sourceChanged') void this.applySourceChange(message.renderId, message.source)
      if (message.type === 'themeChanged' && (message.theme === 'light' || message.theme === 'dark')) {
        this.themeOverride = message.theme
        if (this.current) this.current = { ...this.current, theme: message.theme }
        void this.globalState.update('gmc.preview.theme', message.theme)
      }
    })
    return panel
  }

  async show(input: PreviewInput, preserveFocus = true): Promise<void> {
    const panel = this.ensurePanel(preserveFocus)
    const effectiveInput = this.effectiveInput(input)
    this.current = effectiveInput
    panel.title = `Graph: ${input.name}`
    await this.ready
    for (const renderId of [...this.rendered.keys()]) this.finishRender(renderId)
    const renderId = `render-${++this.sequence}`
    this.activeRenderId = renderId
    const done = new Promise<void>(resolve => {
      const timeout = setTimeout(() => this.finishRender(renderId), 10_000)
      this.rendered.set(renderId, { resolve, timeout })
    })
    const delivered = await panel.webview.postMessage({
      type: 'render',
      renderId,
      editable: !!effectiveInput.target,
      version: this.extensionVersion,
      ...effectiveInput,
    })
    if (!delivered) this.finishRender(renderId)
    await done
  }

  isApplyingUpdate(uri: vscode.Uri): boolean {
    return this.applyingUpdates.has(uri.toString())
  }

  private async applySourceChange(renderId: string, source: string): Promise<void> {
    const input = this.current
    const target = input?.target
    if (!target || renderId !== this.activeRenderId || source === input.source) return

    const uri = vscode.Uri.parse(target.uri)
    const key = uri.toString()
    this.applyingUpdates.add(key)
    try {
      const document = await vscode.workspace.openTextDocument(uri)
      let range: vscode.Range
      let replacement = source
      if (target.kind === 'markdown') {
        const blocks = scanGmcMarkdownBlocks(document)
        const block = blocks.find(candidate => candidate.index === target.blockIndex && candidate.id === target.blockId)
          ?? blocks.find(candidate => candidate.id === target.blockId)
        if (!block) throw new Error(`The GMC block "${target.blockId ?? ''}" no longer exists.`)
        range = block.contentRange
        replacement = `${source}\n`
      } else {
        const end = document.lineAt(Math.max(0, document.lineCount - 1)).range.end
        range = new vscode.Range(new vscode.Position(0, 0), end)
      }

      const edit = new vscode.WorkspaceEdit()
      edit.replace(uri, range, replacement)
      if (!await vscode.workspace.applyEdit(edit)) throw new Error('VS Code rejected the GMC document update.')
      if (this.current === input) this.current = { ...input, source }
    } catch (error) {
      void vscode.window.showErrorMessage(`Could not synchronize graph changes: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      this.applyingUpdates.delete(key)
    }
  }

  async refresh(input: PreviewInput): Promise<void> {
    if (!this.panel) return
    if (this.sameInput(this.current, this.effectiveInput(input))) return
    await this.show(input, true)
  }

  async exportPng(input: PreviewInput, width: number, height: number): Promise<string> {
    await this.show(input, false)
    const requestId = `export-${++this.sequence}`
    const result = new Promise<string>((resolve, reject) => this.exports.set(requestId, { resolve, reject }))
    this.panel!.webview.postMessage({
      type: 'export',
      requestId,
      width,
      height,
      theme: input.theme,
    })
    return result
  }

  private html(webview: vscode.Webview): string {
    const script = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'assets', 'webview.js'))
    const style = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'assets', 'webview.css'))
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
    <link rel="stylesheet" href="${style}" />
    <title>Graph Model Studio</title>
  </head>
  <body><div id="root"></div><script nonce="${nonce}" type="module" src="${script}"></script></body>
</html>`
  }
}
