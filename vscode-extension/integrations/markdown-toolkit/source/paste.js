'use strict'

const vscode = require('vscode')
const { htmlToMarkdown, isTrivialHtml } = require('./html-to-markdown')

const pasteKind = vscode.DocumentDropOrPasteEditKind.Empty.append('markdown', 'paste', 'html')

function isInsideFence(text, offset) {
  const fences = text.slice(0, offset).match(/^(?:`{3,}|~{3,})/gm)
  return fences !== null && fences.length % 2 !== 0
}

function isInsideMath(text, offset) {
  const markers = text.slice(0, offset).match(/\$\$/g)
  return markers !== null && markers.length % 2 !== 0
}

function isInsideInlineCode(line, character) {
  let cursor = 0
  while (cursor < character) {
    const opening = line.indexOf('`', cursor)
    if (opening < 0 || opening >= character) return false
    let length = 1
    while (line[opening + length] === '`') length++
    const closing = line.indexOf('`'.repeat(length), opening + length)
    if (closing < 0 || closing >= character) return true
    cursor = closing + length
  }
  return false
}

class PasteAsMarkdownProvider {
  async provideDocumentPasteEdits(document, ranges, dataTransfer, _context, token) {
    if (!vscode.workspace.getConfiguration('pasteAsMarkdown').get('enabled', true)) return
    const text = document.getText()
    for (const range of ranges) {
      const offset = document.offsetAt(range.start)
      if (isInsideFence(text, offset) || isInsideMath(text, offset)) return
      if (isInsideInlineCode(document.lineAt(range.start.line).text, range.start.character)) return
    }
    if (dataTransfer.get('vscode-editor-data')) return
    const item = dataTransfer.get('text/html')
    if (!item) return
    const html = await item.asString()
    if (!html || html.length > 25_000_000 || token.isCancellationRequested || isTrivialHtml(html)) return
    const markdown = htmlToMarkdown(html)
    if (!markdown || token.isCancellationRequested) return
    const plain = dataTransfer.get('text/plain')
    if (plain && (await plain.asString()).trim() === markdown.trim()) return
    const edit = new vscode.DocumentPasteEdit(markdown, 'Paste as Markdown', pasteKind)
    edit.yieldTo = [vscode.DocumentDropOrPasteEditKind.Empty.append('markdown', 'link', 'image')]
    return [edit]
  }
}

function registerPaste(context) {
  context.subscriptions.push(vscode.languages.registerDocumentPasteEditProvider(
    { language: 'markdown' },
    new PasteAsMarkdownProvider(),
    { providedPasteEditKinds: [pasteKind], pasteMimeTypes: ['text/html'] },
  ))
}

module.exports = { PasteAsMarkdownProvider, registerPaste }
