'use strict'

const vscode = require('vscode')
const cp = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const MarkdownIt = require('markdown-it')

const md = new MarkdownIt({ html: true, linkify: true, typographer: false })

function parseOptions(info) {
  const options = {}
  for (const match of info.matchAll(/([a-zA-Z_][\w-]*)=("[^"]*"|'[^']*'|\S+)/g)) {
    options[match[1]] = match[2].replace(/^(?:"|')|(?:"|')$/g, '')
  }
  return options
}

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

class GmcExportRenderer {
  constructor(context) {
    this.context = context
    this.sequence = 0
    this.pendingRenders = new Map()
    this.pendingExports = new Map()
    this.panel = vscode.window.createWebviewPanel(
      'gmcMarkdownExportRenderer',
      'Rendering Markdown export…',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [context.extensionUri] },
    )
    this.ready = new Promise(resolve => { this.resolveReady = resolve })
    this.panel.webview.html = this.html(this.panel.webview)
    this.panel.webview.onDidReceiveMessage(message => {
      if (message.type === 'ready') this.resolveReady?.()
      if (message.type === 'rendered') {
        const pending = this.pendingRenders.get(message.renderId)
        if (pending) { clearTimeout(pending.timer); this.pendingRenders.delete(message.renderId); pending.resolve() }
      }
      if (message.type === 'exportResult') {
        const pending = this.pendingExports.get(message.requestId)
        if (pending) { clearTimeout(pending.timer); this.pendingExports.delete(message.requestId); pending.resolve(message.dataUrl) }
      }
      if (message.type === 'exportError') {
        const pending = this.pendingExports.get(message.requestId)
        if (pending) { clearTimeout(pending.timer); this.pendingExports.delete(message.requestId); pending.reject(new Error(message.message)) }
      }
    })
  }

  dispose() { this.panel.dispose() }

  async render(source, options) {
    await this.ready
    const renderId = `markdown-export-render-${++this.sequence}`
    const rendered = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pendingRenders.delete(renderId); reject(new Error('Timed out rendering a GMC diagram.')) }, 20_000)
      this.pendingRenders.set(renderId, { resolve, reject, timer })
    })
    await this.panel.webview.postMessage({
      type: 'render', renderId, source, name: options.id || 'diagram',
      view: options.view, theme: options.theme, editable: false,
      version: String(this.context.extension.packageJSON.version || '0.0.0'),
    })
    await rendered
    const requestId = `markdown-export-image-${++this.sequence}`
    const exported = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pendingExports.delete(requestId); reject(new Error('Timed out exporting a GMC diagram.')) }, 20_000)
      this.pendingExports.set(requestId, { resolve, reject, timer })
    })
    await this.panel.webview.postMessage({
      type: 'export', requestId,
      width: Math.max(320, Math.min(8192, Number(options.width) || 1600)),
      height: Math.max(240, Math.min(8192, Number(options.height) || 1000)),
      theme: options.theme,
    })
    return exported
  }

  html(webview) {
    const script = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'assets', 'webview.js'))
    const style = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'assets', 'webview.css'))
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    return `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data: blob:; font-src ${webview.cspSource}; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${style}"></head><body><div id="root"></div><script nonce="${nonce}" type="module" src="${script}"></script></body></html>`
  }
}

async function replaceGmcFences(source, renderer) {
  const regex = /^(`{3,}|~{3,})\s*(gmc|graphmodel)\b([^\n]*)\r?\n([\s\S]*?)^\1\s*$/gmi
  const matches = [...source.matchAll(regex)]
  if (!matches.length) return source
  let cursor = 0
  let result = ''
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index]
    result += source.slice(cursor, match.index)
    const options = parseOptions(match[3] || '')
    options.id ||= `diagram-${index + 1}`
    const dataUrl = await renderer.render(match[4], options)
    result += `<figure class="gmc-export-diagram"><img src="${dataUrl}" alt="GMC diagram: ${escapeHtml(options.id)}"></figure>`
    cursor = match.index + match[0].length
  }
  return result + source.slice(cursor)
}

async function replaceGmcFencesWithFiles(source, renderer, outputDirectory) {
  const regex = /^(`{3,}|~{3,})\s*(gmc|graphmodel)\b([^\n]*)\r?\n([\s\S]*?)^\1\s*$/gmi
  const matches = [...source.matchAll(regex)]
  let cursor = 0
  let result = ''
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index]
    result += source.slice(cursor, match.index)
    const options = parseOptions(match[3] || '')
    options.id ||= `diagram-${index + 1}`
    const dataUrl = await renderer.render(match[4], options)
    const comma = dataUrl.indexOf(',')
    if (comma < 0) throw new Error(`Could not export GMC diagram ${options.id}.`)
    const filename = `gmc-${String(index + 1).padStart(3, '0')}.png`
    fs.writeFileSync(path.join(outputDirectory, filename), Buffer.from(dataUrl.slice(comma + 1), 'base64'))
    result += `![GMC diagram: ${options.id}](${filename})`
    cursor = match.index + match[0].length
  }
  return result + source.slice(cursor)
}

function documentHtml(title, body, dark) {
  const colors = dark
    ? 'color:#d4d4d4;background:#1e1e1e;--border:#444;--code:#2b2b2b;--link:#4daafc'
    : 'color:#24292f;background:#fff;--border:#d0d7de;--code:#f6f8fa;--link:#0969da'
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title><style>
@page{margin:18mm}*{box-sizing:border-box}body{${colors};font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;max-width:1100px;margin:0 auto;padding:32px}a{color:var(--link)}img{max-width:100%;height:auto}h1,h2{border-bottom:1px solid var(--border);padding-bottom:.3em}pre{background:var(--code);padding:16px;overflow:auto;border-radius:6px}code{background:var(--code);padding:.15em .35em;border-radius:3px}pre code{padding:0}blockquote{border-left:4px solid var(--border);margin-left:0;padding-left:16px}table{border-collapse:collapse;width:max-content;max-width:100%;margin:16px 0}th,td{border:1px solid var(--border);padding:6px 13px}th{background:var(--code)}.gmc-export-diagram{margin:24px 0;text-align:center}.gmc-export-diagram img{display:block;margin:auto}@media print{body{max-width:none;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>${body}</body></html>`
}

async function renderMarkdownDocument(context, document) {
  const dark = vscode.window.activeColorTheme.kind !== vscode.ColorThemeKind.Light
    && vscode.window.activeColorTheme.kind !== vscode.ColorThemeKind.HighContrastLight
  let renderer
  try {
    if (/^(`{3,}|~{3,})\s*(?:gmc|graphmodel)\b/gmi.test(document.getText())) renderer = new GmcExportRenderer(context)
    const source = renderer ? await replaceGmcFences(document.getText(), renderer) : document.getText()
    const body = md.render(source).replace(/(<img\b[^>]*\bsrc=")([^"]+)(")/gi, (match, before, value, after) => {
      if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(value)) return match
      try {
        return before + new URL(value, pathToFileURL(document.fileName).href).href + after
      } catch {
        return match
      }
    })
    return documentHtml(path.basename(document.fileName), body, dark)
  } finally {
    renderer?.dispose()
  }
}

function commandExists(command) {
  try { cp.execFileSync(process.platform === 'win32' ? 'where.exe' : 'which', [command], { stdio: 'ignore' }); return true } catch { return false }
}

function findBrowser() {
  const configured = vscode.workspace.getConfiguration('markdownToolkit.export').get('browserPath', '')
  if (configured && fs.existsSync(configured)) return configured
  const candidates = process.platform === 'win32' ? [
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ] : process.platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ] : ['/usr/bin/google-chrome', '/usr/bin/microsoft-edge', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  const found = candidates.filter(Boolean).find(fs.existsSync)
  if (found) return found
  return ['msedge', 'google-chrome', 'chromium', 'chromium-browser'].find(commandExists)
}

function runBrowser(browser, args) {
  return new Promise((resolve, reject) => cp.execFile(browser, args, { timeout: 120_000, windowsHide: true }, (error, _stdout, stderr) => {
    if (error) reject(new Error(stderr || error.message)); else resolve()
  }))
}

function findPandoc() {
  const configured = vscode.workspace.getConfiguration('markdownToolkit.pandoc').get('path', '')
  if (configured && fs.existsSync(configured)) return configured
  const candidates = process.platform === 'win32' ? [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Pandoc', 'pandoc.exe'),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'Pandoc', 'pandoc.exe'),
  ] : ['/usr/local/bin/pandoc', '/usr/bin/pandoc', '/opt/homebrew/bin/pandoc']
  return candidates.filter(Boolean).find(fs.existsSync) || (commandExists('pandoc') ? 'pandoc' : undefined)
}

function runProcess(executable, args) {
  return new Promise((resolve, reject) => cp.execFile(executable, args, { timeout: 180_000, windowsHide: true }, (error, _stdout, stderr) => {
    if (error) reject(new Error(stderr || error.message)); else resolve()
  }))
}

async function chooseReferenceDoc() {
  const configured = vscode.workspace.getConfiguration('markdownToolkit.pandoc').get('referenceDoc', '')
  const choices = []
  if (configured && fs.existsSync(configured)) choices.push({ label: 'Use configured DOCX template', description: configured, value: configured })
  choices.push(
    { label: 'No DOCX template', description: 'Use Pandoc default styles', value: '' },
    { label: 'Choose DOCX template...', description: 'Select a reference .docx file', choose: true },
  )
  const choice = await vscode.window.showQuickPick(choices, { placeHolder: 'Choose a Pandoc DOCX template' })
  if (!choice) return undefined
  if (!choice.choose) return choice.value
  const selected = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { 'Word document template': ['docx'] },
    title: 'Choose Pandoc reference DOCX',
  })
  return selected?.[0]?.fsPath
}

async function chooseTarget(document, extension, label) {
  const basename = path.basename(document.fileName, path.extname(document.fileName))
  return vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.joinPath(document.uri, '..', `${basename}.${extension}`),
    filters: { [label]: [extension] },
  })
}

let lastMarkdownUri

async function resolveMarkdownDocument() {
  const active = vscode.window.activeTextEditor?.document
  if (active?.languageId === 'markdown') return active
  if (lastMarkdownUri) {
    try {
      const remembered = await vscode.workspace.openTextDocument(lastMarkdownUri)
      if (remembered.languageId === 'markdown') return remembered
    } catch {}
  }
  const visible = vscode.window.visibleTextEditors.find(editor => editor.document.languageId === 'markdown')?.document
  if (visible) return visible
  return vscode.workspace.textDocuments.find(document => document.languageId === 'markdown')
}

async function exportDocument(context, format) {
  const document = await resolveMarkdownDocument()
  if (!document || document.languageId !== 'markdown') {
    return vscode.window.showInformationMessage('Open a Markdown document before exporting its preview.')
  }
  const target = await chooseTarget(document, format, format.toUpperCase())
  if (!target) return
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Exporting Markdown preview to ${format.toUpperCase()}…` }, async () => {
    const html = await renderMarkdownDocument(context, document)
    if (format === 'html') {
      await vscode.workspace.fs.writeFile(target, Buffer.from(html, 'utf8'))
      return
    }
    const browser = findBrowser()
    if (!browser) throw new Error('No Chromium-based browser was found. Configure markdownToolkit.export.browserPath.')
    const temporaryHtml = path.join(os.tmpdir(), `gmc-markdown-export-${process.pid}-${Date.now()}.html`)
    fs.writeFileSync(temporaryHtml, html, 'utf8')
    try {
      const common = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files']
      if (format === 'pdf') {
        await runBrowser(browser, [...common, `--print-to-pdf=${target.fsPath}`, '--no-pdf-header-footer', pathToFileURL(temporaryHtml).href])
      } else {
        const config = vscode.workspace.getConfiguration('markdownToolkit.export')
        const width = Math.max(640, Math.min(4096, config.get('pngWidth', 1440)))
        const height = Math.max(480, Math.min(30000, config.get('pngHeight', 10000)))
        await runBrowser(browser, [...common, `--screenshot=${target.fsPath}`, `--window-size=${width},${height}`, pathToFileURL(temporaryHtml).href])
      }
    } finally {
      try { fs.unlinkSync(temporaryHtml) } catch {}
    }
  })
  vscode.window.showInformationMessage(`Exported ${path.basename(target.fsPath)}`)
}

async function exportDocx(context) {
  const document = await resolveMarkdownDocument()
  if (!document) return vscode.window.showInformationMessage('Open a Markdown document before exporting it.')
  const pandoc = findPandoc()
  if (!pandoc) throw new Error('Pandoc was not found. Install Pandoc or configure markdownToolkit.pandoc.path.')
  const referenceDoc = await chooseReferenceDoc()
  if (referenceDoc === undefined) return
  const target = await chooseTarget(document, 'docx', 'Word document')
  if (!target) return
  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Exporting Markdown to DOCX with Pandoc...' }, async () => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'gmc-pandoc-export-'))
    const input = path.join(temporaryDirectory, 'document.md')
    let renderer
    try {
      let source = document.getText()
      if (/^(`{3,}|~{3,})\s*(?:gmc|graphmodel)\b/gmi.test(source)) {
        renderer = new GmcExportRenderer(context)
        source = await replaceGmcFencesWithFiles(source, renderer, temporaryDirectory)
      }
      fs.writeFileSync(input, source, 'utf8')
      const resourcePath = [path.dirname(document.fileName), temporaryDirectory].join(path.delimiter)
      const args = [input, `--output=${target.fsPath}`, '--from=gfm+raw_html', '--standalone', `--resource-path=${resourcePath}`]
      if (referenceDoc) args.push(`--reference-doc=${referenceDoc}`)
      await runProcess(pandoc, args)
    } finally {
      renderer?.dispose()
      try { fs.rmSync(temporaryDirectory, { recursive: true, force: true }) } catch {}
    }
  })
  vscode.window.showInformationMessage(`Exported ${path.basename(target.fsPath)}`)
}

async function showExportPicker(context) {
  const choice = await vscode.window.showQuickPick([
    { label: '$(code) HTML', description: 'Self-contained styled preview', format: 'html' },
    { label: '$(file-pdf) PDF', description: 'Rendered with Edge, Chrome, or Chromium', format: 'pdf' },
    { label: '$(file-media) PNG', description: 'Long preview image', format: 'png' },
    { label: '$(file) DOCX (Pandoc)', description: 'Choose an optional reference DOCX template', format: 'docx' },
  ], { placeHolder: 'Export Markdown preview' })
  if (!choice) return
  return choice.format === 'docx' ? exportDocx(context) : exportDocument(context, choice.format)
}

function registerExports(context) {
  const remember = editor => {
    if (editor?.document.languageId === 'markdown') lastMarkdownUri = editor.document.uri
  }
  remember(vscode.window.activeTextEditor)
  const guarded = callback => () => Promise.resolve(callback()).catch(error => {
    vscode.window.showErrorMessage(`Markdown export failed: ${error instanceof Error ? error.message : String(error)}`)
  })
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(remember),
    vscode.commands.registerCommand('markdownToolkit.export', guarded(() => showExportPicker(context))),
    vscode.commands.registerCommand('markdownToolkit.exportHtml', guarded(() => exportDocument(context, 'html'))),
    vscode.commands.registerCommand('markdownToolkit.exportPdf', guarded(() => exportDocument(context, 'pdf'))),
    vscode.commands.registerCommand('markdownToolkit.exportPng', guarded(() => exportDocument(context, 'png'))),
    vscode.commands.registerCommand('markdownToolkit.exportDocx', guarded(() => exportDocx(context))),
  )
}

module.exports = {
  GmcExportRenderer, documentHtml, exportDocx, findPandoc, registerExports,
  renderMarkdownDocument, replaceGmcFences, replaceGmcFencesWithFiles, showExportPicker,
}
