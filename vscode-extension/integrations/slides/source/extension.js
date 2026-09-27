'use strict'

const vscode = require('vscode')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const os = require('node:os')
const { copyFile, mkdtemp, readFile, readdir, rm, writeFile } = require('node:fs/promises')

const run = promisify(execFile)

let panel
let previewDirectory
let previewHtml
let extensionRoot

function activeMarkdown() {
  const document = vscode.window.activeTextEditor?.document
  if (!document || document.languageId !== 'markdown') {
    throw new Error('Open a Markdown presentation first.')
  }
  if (document.isUntitled) throw new Error('Save Markdown presentation before previewing it.')
  return document
}

async function disposePreviewFiles() {
  const directory = previewDirectory
  previewDirectory = undefined
  previewHtml = undefined
  if (directory) await rm(directory, { recursive: true, force: true })
}

function withPreviewToolbar(html) {
  const toolbar = `<style>
#gms-slide-toolbar{position:fixed;z-index:2147483647;top:12px;right:12px;display:flex;gap:8px}
#gms-slide-toolbar button{padding:8px 12px;border:1px solid #888;border-radius:6px;background:#fff;color:#222;font:600 13px system-ui;box-shadow:0 2px 10px #0003;cursor:pointer}
#gms-slide-toolbar button:hover{background:#f2f2f2}
</style><div id="gms-slide-toolbar"><button data-format="html" type="button">HTML</button><button data-format="pdf" type="button">PDF</button><button data-format="pptx" type="button">PPTX</button><button data-format="pptx-editable" type="button">Editable PPTX</button></div>
<script>{const vscode=acquireVsCodeApi();document.querySelectorAll('#gms-slide-toolbar button').forEach(button=>button.addEventListener('click',()=>vscode.postMessage({type:'export',format:button.dataset.format})))}</script>`
  return html.replace(/<\/body>/i, `${toolbar}</body>`)
}

function withLightTheme(html) {
  const style = `<style>
html,body,#app{background:#fff!important;color:#222;color-scheme:light}
.slidev-slide-container{background:#fff!important;--slidev-controls-foreground:#222}
.slidev-icon-btn{color:#222!important}
</style>`
  return html.replace(/<\/body>/i, `${style}</body>`)
}

async function inlineGmcImages(html, document) {
  const deck = path.parse(document.fileName).name
  const images = path.join(path.dirname(document.fileName), '.gmc', deck)
  let names
  try {
    names = await readdir(images)
  } catch (error) {
    if (error.code === 'ENOENT') return html
    throw error
  }
  for (const name of names.filter(name => name.endsWith('.png'))) {
    const stem = path.parse(name).name
    if (!html.includes(stem)) continue
    const data = `data:image/png;base64,${(await readFile(path.join(images, name))).toString('base64')}`
    html = html.replaceAll(`./.gmc/${deck}/${name}`, data)
    const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    html = html.replace(new RegExp(`(?:\\./)?${escaped}-[\\w-]+\\.png`, 'g'), data)
  }
  return html
}

async function chooseTarget(document, format) {
  const extension = format === 'pdf' ? 'pdf' : format === 'html' ? 'html' : 'pptx'
  const suffix = format === 'pptx-editable' ? '-editable' : ''
  return vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(path.join(path.dirname(document.fileName), `${path.parse(document.fileName).name}${suffix}.${extension}`)),
    filters: { [extension.toUpperCase()]: [extension] },
  })
}

async function exportPreviewHtml(document = activeMarkdown()) {
  if (!previewHtml) {
    await buildPreview(document)
    if (!previewHtml) return
  }
  const target = await chooseTarget(document, 'html')
  if (!target) return
  await copyFile(previewHtml, target.fsPath)
  void vscode.window.showInformationMessage(`Exported ${path.basename(target.fsPath)}`)
}

function presentationSettings() {
  const settings = vscode.workspace.getConfiguration('slides')
  const executablePath = settings.get('executablePath', '').trim()
  const themePath = settings.get('themePath', '').trim()
  if (!executablePath) throw new Error('Set slides.executablePath to presentation-md.exe.')
  if (!themePath) throw new Error('Set slides.themePath to a theme folder or ZIP.')
  return { executablePath, themePath }
}

async function runPresentation(document, output, format) {
  const { executablePath, themePath } = presentationSettings()
  const browserPath = vscode.workspace.getConfiguration('markdownToolkit.export').get('browserPath', '') || undefined
  const gmcRendererPath = path.join(extensionRoot, 'dist', 'markdown-preview', 'runtime.js')
  const args = ['build', document.fileName, '--out', output, '--theme', themePath, '--gmc-renderer', gmcRendererPath]
  if (format) args.push('--format', format)
  if (browserPath) args.push('--browser', browserPath)
  await run(executablePath, args, { windowsHide: true })
}

async function exportPresentation(format, document = activeMarkdown()) {
  const target = await chooseTarget(document, format)
  if (!target) return
  await document.save()
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: `Exporting ${format.toUpperCase()} presentation…`,
  }, () => runPresentation(document, target.fsPath, format))
  void vscode.window.showInformationMessage(`Exported ${path.basename(target.fsPath)}`)
}

async function buildPreview(document = activeMarkdown()) {
  presentationSettings()
  await document.save()
  panel?.dispose()
  await disposePreviewFiles()

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: 'Generating Slidev preview…',
  }, async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'gms-slide-preview-'))
    const output = path.join(directory, 'preview.html')
    try {
      await runPresentation(document, output)
      await writeFile(output, withLightTheme(await inlineGmcImages(await readFile(output, 'utf8'), document)))
      previewDirectory = directory
      previewHtml = output
    } catch (error) {
      await rm(directory, { recursive: true, force: true })
      throw error
    }
  })

  const nextPanel = vscode.window.createWebviewPanel(
    'slides.preview',
    `Slides: ${path.basename(document.fileName)}`,
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true },
  )
  panel = nextPanel
  nextPanel.webview.html = withPreviewToolbar(await readFile(previewHtml, 'utf8'))
  nextPanel.webview.onDidReceiveMessage(message => {
    if (message.type !== 'export') return
    if (message.format === 'html') void guarded(() => exportPreviewHtml(document))()
    else if (['pdf', 'pptx', 'pptx-editable'].includes(message.format)) {
      void guarded(() => exportPresentation(message.format, document))()
    }
  })
  nextPanel.onDidDispose(() => {
    if (panel === nextPanel) panel = undefined
  })
}

function guarded(action) {
  return async () => {
    try {
      await action()
    } catch (error) {
      void vscode.window.showErrorMessage(`Slides: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

function activate(context) {
  extensionRoot = context.extensionPath
  context.subscriptions.push(
    vscode.commands.registerCommand('slides.preview', guarded(() => buildPreview())),
    vscode.commands.registerCommand('slides.exportHtml', guarded(() => exportPreviewHtml())),
    vscode.commands.registerCommand('slides.exportPdf', guarded(() => exportPresentation('pdf'))),
    vscode.commands.registerCommand('slides.exportPptx', guarded(() => exportPresentation('pptx'))),
    vscode.commands.registerCommand('slides.exportPptxEditable', guarded(() => exportPresentation('pptx-editable'))),
    { dispose: () => { panel?.dispose(); void disposePreviewFiles() } },
  )
}

function deactivate() {
  panel?.dispose()
  void disposePreviewFiles()
}

module.exports = { activate, deactivate }
