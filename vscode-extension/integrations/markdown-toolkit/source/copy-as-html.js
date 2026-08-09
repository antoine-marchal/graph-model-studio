'use strict'

const vscode = require('vscode')
const cp = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const MarkdownIt = require('markdown-it')

const markdown = new MarkdownIt({ html: true, linkify: true })
const stylesheet = `body,div{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;line-height:1.6;color:#24292e}code{font-family:Consolas,monospace;background:#f1f3f5;padding:.2em .4em}pre{background:#f6f8fa;padding:16px;border-radius:6px}pre code{background:transparent;padding:0}table{border-collapse:collapse;margin:16px 0}th,td{border:1px solid #dfe2e5;padding:6px 13px}th{background:#f6f8fa}blockquote{border-left:4px solid #dfe2e5;padding:0 16px;color:#57606a}img{max-width:100%}`

function markdownToHtml(source) {
  let html = markdown.render(source)
  html = html.replace(/<li>\s*\[ \]\s*/g, '<li style="list-style:none"><input type="checkbox" disabled> ')
    .replace(/<li>\s*\[x\]\s*/gi, '<li style="list-style:none"><input type="checkbox" disabled checked> ')
  return `<div><style>${stylesheet}</style>${html}</div>`
}

function execFile(command, args) {
  return new Promise((resolve, reject) => cp.execFile(command, args, { timeout: 10_000 }, (error, stdout, stderr) => {
    if (error) reject(new Error(stderr || error.message))
    else resolve(stdout)
  }))
}

function cfHtml(html) {
  const header = 'Version:0.9\r\nStartHTML:0000000000\r\nEndHTML:0000000000\r\nStartFragment:0000000000\r\nEndFragment:0000000000\r\n'
  const before = '<html><body>\r\n<!--StartFragment-->'
  const after = '<!--EndFragment-->\r\n</body></html>'
  const startHtml = Buffer.byteLength(header)
  const startFragment = startHtml + Buffer.byteLength(before)
  const endFragment = startFragment + Buffer.byteLength(html)
  const endHtml = endFragment + Buffer.byteLength(after)
  return `Version:0.9\r\nStartHTML:${String(startHtml).padStart(10, '0')}\r\nEndHTML:${String(endHtml).padStart(10, '0')}\r\nStartFragment:${String(startFragment).padStart(10, '0')}\r\nEndFragment:${String(endFragment).padStart(10, '0')}\r\n${before}${html}${after}`
}

async function writeRichClipboard(html, text) {
  const id = `gmc-markdown-${process.pid}-${Date.now()}`
  const htmlFile = path.join(os.tmpdir(), `${id}.html`)
  const textFile = path.join(os.tmpdir(), `${id}.txt`)
  const scriptFile = path.join(os.tmpdir(), `${id}.${process.platform === 'win32' ? 'ps1' : 'js'}`)
  fs.writeFileSync(htmlFile, process.platform === 'win32' ? cfHtml(html) : html, 'utf8')
  fs.writeFileSync(textFile, text, 'utf8')
  try {
    if (process.platform === 'win32') {
      fs.writeFileSync(scriptFile, [
        'Add-Type -AssemblyName System.Windows.Forms',
        `$html=[IO.File]::ReadAllText('${htmlFile.replace(/'/g, "''")}')`,
        `$text=[IO.File]::ReadAllText('${textFile.replace(/'/g, "''")}')`,
        '$data=New-Object Windows.Forms.DataObject',
        '$data.SetData([Windows.Forms.DataFormats]::Html,$html)',
        '$data.SetData([Windows.Forms.DataFormats]::UnicodeText,$text)',
        '[Windows.Forms.Clipboard]::SetDataObject($data,$true)',
      ].join('\r\n'))
      await execFile('powershell', ['-NoProfile', '-NonInteractive', '-Sta', '-ExecutionPolicy', 'Bypass', '-File', scriptFile])
    } else if (process.platform === 'darwin') {
      fs.writeFileSync(scriptFile, `ObjC.import('AppKit');ObjC.import('Foundation');var p=$.NSPasteboard.generalPasteboard;p.clearContents;p.setStringForType($.NSString.stringWithContentsOfFileEncodingError('${textFile}',4,null),$.NSPasteboardTypeString);p.setStringForType($.NSString.stringWithContentsOfFileEncodingError('${htmlFile}',4,null),$.NSPasteboardTypeHTML);`)
      await execFile('osascript', ['-l', 'JavaScript', scriptFile])
    } else {
      await execFile('sh', ['-c', `command -v wl-copy >/dev/null && wl-copy --type text/html < '${htmlFile}' || xclip -selection clipboard -t text/html < '${htmlFile}'`])
    }
  } finally {
    for (const file of [htmlFile, textFile, scriptFile]) try { fs.unlinkSync(file) } catch {}
  }
}

async function copyTextAsHtml(text) {
  if (!text.trim()) return
  const html = markdownToHtml(text)
  try {
    await writeRichClipboard(html, text)
    vscode.window.setStatusBarMessage('$(clippy) Copied as HTML', 2000)
  } catch {
    await vscode.env.clipboard.writeText(html)
    vscode.window.showWarningMessage('Copied HTML as text because a rich clipboard provider was unavailable.')
  }
}

async function copyAsHtml(uri) {
  if (uri) {
    return copyTextAsHtml(new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)))
  }
  const editor = vscode.window.activeTextEditor
  if (!editor) return
  const text = editor.selection.isEmpty
    ? editor.document.lineAt(editor.selection.active.line).text
    : editor.document.getText(editor.selection)
  return copyTextAsHtml(text)
}

module.exports = { copyAsHtml, markdownToHtml }
