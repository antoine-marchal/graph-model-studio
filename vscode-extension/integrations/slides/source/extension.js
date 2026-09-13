'use strict'

const vscode = require('vscode')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const os = require('node:os')
const { copyFile, mkdtemp, readFile, rm } = require('node:fs/promises')

let panel
let previewDirectory
let previewHtml
let extensionRoot

async function presentationBuilder() {
  const bundled = path.join(extensionRoot, 'integrations', 'slides', 'vendor', 'node_modules', '@pptxascode', 'presentation-md', 'dist', 'src', 'index.js')
  try {
    return await import(pathToFileURL(bundled).href)
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error
    return import('@pptxascode/presentation-md')
  }
}

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

function withPreviewToolbar(html, theme) {
  const toolbar = `<style>
#gms-slide-toolbar{position:fixed;z-index:2147483647;top:12px;right:12px;display:flex;gap:8px}
#gms-slide-toolbar select,#gms-slide-toolbar button{padding:8px 12px;border:1px solid #888;border-radius:6px;background:#fff;color:#222;font:600 13px system-ui;box-shadow:0 2px 10px #0003;cursor:pointer}
#gms-slide-toolbar button:hover{background:#f2f2f2}
</style><div id="gms-slide-toolbar"><select id="gms-slide-theme" aria-label="Slide theme"><option value="cea"${theme === 'cea' ? ' selected' : ''}>CEA</option><option value="blueprint"${theme === 'blueprint' ? ' selected' : ''}>Blueprint</option></select><button id="gms-slide-export" type="button">Export HTML</button></div>
<script>{const vscode=acquireVsCodeApi();document.getElementById('gms-slide-export').addEventListener('click',()=>vscode.postMessage({type:'exportHtml'}));document.getElementById('gms-slide-theme').addEventListener('change',event=>vscode.postMessage({type:'theme',theme:event.target.value}))}</script>`
  return html.replace(/<\/body>/i, `${toolbar}</body>`)
}

async function chooseHtmlTarget(document) {
  return vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.file(path.join(path.dirname(document.fileName), `${path.parse(document.fileName).name}.html`)),
    filters: { 'Standalone HTML': ['html'] },
  })
}

async function exportPreviewHtml(document = activeMarkdown()) {
  if (!previewHtml) {
    await buildPreview(document)
    if (!previewHtml) return
  }
  const target = await chooseHtmlTarget(document)
  if (!target) return
  await copyFile(previewHtml, target.fsPath)
  void vscode.window.showInformationMessage(`Exported ${path.basename(target.fsPath)}`)
}

function selectedTheme() {
  return vscode.workspace.getConfiguration('slides').get('theme', 'cea')
}

async function buildPreview(document = activeMarkdown(), theme = selectedTheme()) {
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
      const { buildPresentation } = await presentationBuilder()
      const browserPath = vscode.workspace.getConfiguration('markdownToolkit.export').get('browserPath', '') || undefined
      const gmcRendererPath = path.join(extensionRoot, 'dist', 'markdown-preview', 'runtime.js')
      await buildPresentation({ input: document.fileName, output, browserPath, theme, gmcRendererPath })
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
  nextPanel.webview.html = withPreviewToolbar(await readFile(previewHtml, 'utf8'), theme)
  nextPanel.webview.onDidReceiveMessage(message => {
    if (message.type === 'exportHtml') void guarded(() => exportPreviewHtml(document))()
    if (message.type === 'theme' && ['cea', 'blueprint'].includes(message.theme)) {
      void guarded(async () => {
        await vscode.workspace.getConfiguration('slides').update('theme', message.theme, vscode.ConfigurationTarget.Workspace)
        await buildPreview(document, message.theme)
      })()
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
    { dispose: () => { panel?.dispose(); void disposePreviewFiles() } },
  )
}

function deactivate() {
  panel?.dispose()
  void disposePreviewFiles()
}

module.exports = { activate, deactivate }
