import * as path from 'node:path'
import * as vscode from 'vscode'
import { registerEmbedFolding } from './embed-folding'
import { registerLanguageFeatures } from './language'
import { gmcBlockAtPosition, scanGmcMarkdownBlocks, type GmcMarkdownBlock } from './markdown'
import { PreviewManager, type PreviewInput } from './preview'

interface MarkdownItToken {
  info: string
  content: string
  map?: [number, number]
}

interface MarkdownItLike {
  renderer: {
    rules: {
      fence?: (tokens: MarkdownItToken[], index: number, options: unknown, env: unknown, self: unknown) => string
    }
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function markdownFenceOptions(raw: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const match of raw.matchAll(/([a-zA-Z_][\w-]*)=("[^"]*"|'[^']*'|\S+)/g)) {
    values[match[1]] = match[2].replace(/^(?:"|')|(?:"|')$/g, '')
  }
  return values
}

function extendMarkdownIt(md: MarkdownItLike, getViewerTheme: () => 'light' | 'dark'): MarkdownItLike {
  const defaultFence = md.renderer.rules.fence
  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index]
    const [language = '', ...infoParts] = token.info.trim().split(/\s+/)
    if (!/^(?:gmc|graphmodel)$/i.test(language)) {
      return defaultFence ? defaultFence(tokens, index, options, env, self) : ''
    }

    const info = markdownFenceOptions(infoParts.join(' '))
    const id = info.id || `diagram-${index + 1}`
    const source = Buffer.from(token.content, 'utf8').toString('base64')
    const line = token.map?.[0] ?? 0
    const theme = info.theme === 'light' || info.theme === 'dark' ? info.theme : getViewerTheme()
    return `<figure class="gmc-markdown-diagram" data-line="${line}" data-gmc-source="${source}" data-gmc-id="${escapeHtml(id)}" data-gmc-view="${escapeHtml(info.view ?? '')}" data-gmc-theme="${theme}" data-gmc-width="${escapeHtml(info.width ?? '')}" data-gmc-height="${escapeHtml(info.height ?? '')}"><div class="gmc-markdown-loading">Generating ${escapeHtml(id)}…</div></figure>`
  }
  return md
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'diagram'
}

function configuredTheme(block?: GmcMarkdownBlock): 'light' | 'dark' {
  const requested = block?.info.theme ?? vscode.workspace.getConfiguration('gmc.export').get<string>('theme', 'auto')
  if (requested === 'light' || requested === 'dark') return requested
  return vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light
    || vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrastLight
    ? 'light'
    : 'dark'
}

function inputFromEditor(editor = vscode.window.activeTextEditor): PreviewInput | undefined {
  if (!editor) return undefined
  if (editor.document.languageId === 'gmc') {
    return {
      source: editor.document.getText(),
      name: path.basename(editor.document.fileName),
      theme: configuredTheme(),
      target: { uri: editor.document.uri.toString(), kind: 'document' },
    }
  }
  if (editor.document.languageId === 'markdown') {
    const block = gmcBlockAtPosition(editor.document, editor.selection.active)
    if (!block) return undefined
    return {
      source: block.source,
      name: `${path.basename(editor.document.fileName)} · ${block.id}`,
      view: block.info.view,
      theme: configuredTheme(block),
      target: {
        uri: editor.document.uri.toString(),
        kind: 'markdown',
        blockIndex: block.index,
        blockId: block.id,
      },
    }
  }
  return undefined
}

function dimensions(block?: GmcMarkdownBlock): { width: number; height: number } {
  const config = vscode.workspace.getConfiguration('gmc.export')
  const width = Number(block?.info.width) || config.get<number>('width', 1600)
  const height = Number(block?.info.height) || config.get<number>('height', 1000)
  return {
    width: Math.max(320, Math.min(8192, width)),
    height: Math.max(240, Math.min(8192, height)),
  }
}

function pngBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',')
  if (comma < 0) throw new Error('Renderer returned an invalid PNG data URL')
  return Buffer.from(dataUrl.slice(comma + 1), 'base64')
}

async function writePng(dataUrl: string, target: vscode.Uri): Promise<void> {
  await vscode.workspace.fs.writeFile(target, pngBytes(dataUrl))
}

export function activate(context: vscode.ExtensionContext): { extendMarkdownIt(md: MarkdownItLike): MarkdownItLike } {
  registerLanguageFeatures(context)
  registerEmbedFolding(context)
  const extensionVersion = String(context.extension.packageJSON.version ?? '0.0.0')
  const preview = new PreviewManager(context.extensionUri, context.globalState, extensionVersion)
  context.subscriptions.push(preview)

  context.subscriptions.push(vscode.commands.registerCommand(
    'gmc.renderFilePng',
    async (sourceUri: vscode.Uri, targetUri: vscode.Uri) => {
      const document = await vscode.workspace.openTextDocument(sourceUri)
      const size = dimensions()
      const dataUrl = await preview.exportPng({
        source: document.getText(),
        name: path.basename(document.fileName),
        theme: configuredTheme(),
      }, size.width, size.height, true)
      await writePng(dataUrl, targetUri)
      return targetUri
    },
  ))

  context.subscriptions.push(vscode.commands.registerCommand('gmc.openPreview', async () => {
    const input = inputFromEditor()
    if (!input) {
      void vscode.window.showInformationMessage('Open a .gmc file or place the cursor inside a fenced GMC Markdown block.')
      return
    }
    await preview.show(input, true)
  }))

  context.subscriptions.push(vscode.commands.registerCommand('gmc.exportPng', async () => {
    const editor = vscode.window.activeTextEditor
    const input = inputFromEditor(editor)
    if (!editor || !input) {
      void vscode.window.showInformationMessage('Open a .gmc file or place the cursor inside a fenced GMC Markdown block.')
      return
    }
    const block = editor.document.languageId === 'markdown'
      ? gmcBlockAtPosition(editor.document, editor.selection.active)
      : undefined
    const base = block?.id ?? path.basename(editor.document.fileName, path.extname(editor.document.fileName))
    const target = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.joinPath(editor.document.uri, '..', `${safeName(base)}.png`),
      filters: { 'PNG image': ['png'] },
    })
    if (!target) return
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Rendering GMC diagram…' }, async () => {
      const size = dimensions(block)
      const dataUrl = await preview.exportPng(input, size.width, size.height)
      await writePng(dataUrl, target)
    })
    void vscode.window.showInformationMessage(`Exported ${path.basename(target.fsPath)}`)
  }))

  context.subscriptions.push(vscode.commands.registerCommand(
    'gmc.exportMarkdownDiagram',
    async (uri?: vscode.Uri, blockIndex?: number) => {
      const document = uri ? await vscode.workspace.openTextDocument(uri) : vscode.window.activeTextEditor?.document
      if (!document || document.languageId !== 'markdown') return
      const blocks = scanGmcMarkdownBlocks(document)
      const block = typeof blockIndex === 'number'
        ? blocks[blockIndex]
        : vscode.window.activeTextEditor ? gmcBlockAtPosition(document, vscode.window.activeTextEditor.selection.active) : undefined
      if (!block) {
        void vscode.window.showInformationMessage('No fenced GMC block found.')
        return
      }
      const target = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.joinPath(document.uri, '..', `${safeName(block.id)}.png`),
        filters: { 'PNG image': ['png'] },
      })
      if (!target) return
      const size = dimensions(block)
      const dataUrl = await preview.exportPng({
        source: block.source,
        name: `${path.basename(document.fileName)} · ${block.id}`,
        view: block.info.view,
        theme: configuredTheme(block),
      }, size.width, size.height)
      await writePng(dataUrl, target)
      void vscode.window.showInformationMessage(`Exported ${path.basename(target.fsPath)}`)
    },
  ))

  context.subscriptions.push(vscode.commands.registerCommand('gmc.exportAllMarkdownDiagrams', async () => {
    const document = vscode.window.activeTextEditor?.document
    if (!document || document.languageId !== 'markdown') {
      void vscode.window.showInformationMessage('Open a Markdown file containing fenced GMC blocks.')
      return
    }
    const blocks = scanGmcMarkdownBlocks(document)
    if (!blocks.length) {
      void vscode.window.showInformationMessage('No fenced GMC blocks found.')
      return
    }
    const markdownBase = safeName(path.basename(document.fileName, path.extname(document.fileName)))
    const output = vscode.Uri.joinPath(document.uri, '..', '.gmc', markdownBase)
    await vscode.workspace.fs.createDirectory(output)
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Exporting GMC Markdown diagrams',
      cancellable: true,
    }, async (progress, token) => {
      for (let index = 0; index < blocks.length; index++) {
        if (token.isCancellationRequested) break
        const block = blocks[index]
        progress.report({ message: block.id, increment: 100 / blocks.length })
        const size = dimensions(block)
        const dataUrl = await preview.exportPng({
          source: block.source,
          name: `${path.basename(document.fileName)} · ${block.id}`,
          view: block.info.view,
          theme: configuredTheme(block),
        }, size.width, size.height)
        await writePng(dataUrl, vscode.Uri.joinPath(output, `${safeName(block.id)}.png`))
      }
    })
    void vscode.window.showInformationMessage(`Exported ${blocks.length} diagram(s) to ${output.fsPath}`)
  }))

  let refreshTimer: NodeJS.Timeout | undefined
  const refresh = (document?: vscode.TextDocument) => {
    if (!preview.visible || !document || vscode.window.activeTextEditor?.document !== document) return
    if (preview.isApplyingUpdate(document.uri)) return
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(() => {
      const input = inputFromEditor()
      if (input) void preview.refresh(input)
    }, 250)
  }
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => refresh(event.document)),
    vscode.window.onDidChangeTextEditorSelection(event => {
      if (event.textEditor.document.languageId === 'markdown') refresh(event.textEditor.document)
    }),
    vscode.window.onDidChangeActiveTextEditor(editor => {
      const input = inputFromEditor(editor)
      if (input && preview.visible) void preview.refresh(input)
      if (input && vscode.workspace.getConfiguration('gmc.preview').get<boolean>('autoOpen', false)) {
        void preview.show(input, true)
      }
    }),
    vscode.window.onDidChangeActiveColorTheme(() => {
      const input = inputFromEditor()
      if (input && preview.visible) void preview.refresh(input)
    }),
  )

  return {
    extendMarkdownIt: md => extendMarkdownIt(md, () => (
      context.globalState.get<'light' | 'dark'>('gmc.preview.theme') ?? configuredTheme()
    )),
  }
}

export function deactivate(): void {}
