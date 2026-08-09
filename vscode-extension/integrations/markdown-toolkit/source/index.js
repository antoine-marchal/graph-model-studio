'use strict'

const vscode = require('vscode')
const { copyAsHtml } = require('./copy-as-html')
const { registerExports } = require('./export')
const { registerPaste } = require('./paste')
const { formatMarkdownTables } = require('./tables')

async function formatTables() {
  const editor = vscode.window.activeTextEditor
  if (!editor || editor.document.languageId !== 'markdown') {
    return vscode.window.showInformationMessage('Open a Markdown document to format a table.')
  }
  let range = editor.selection
  if (range.isEmpty) {
    let start = range.active.line
    let end = range.active.line
    while (start > 0 && editor.document.lineAt(start - 1).text.includes('|')) start--
    while (end + 1 < editor.document.lineCount && editor.document.lineAt(end + 1).text.includes('|')) end++
    range = new vscode.Range(new vscode.Position(start, 0), editor.document.lineAt(end).range.end)
  }
  const source = editor.document.getText(range)
  const formatted = formatMarkdownTables(source)
  if (source === formatted) {
    return vscode.window.setStatusBarMessage('$(table) Markdown table is already formatted', 2000)
  }
  await editor.edit(builder => builder.replace(range, formatted))
}

function activate(context) {
  registerPaste(context)
  registerExports(context)
  context.subscriptions.push(
    vscode.commands.registerCommand('pasteAsMarkdown.copyAsHtml', copyAsHtml),
    vscode.commands.registerCommand('markdownToolkit.formatTable', formatTables),
  )
}

function deactivate() {}

module.exports = { activate, deactivate, formatTables }
