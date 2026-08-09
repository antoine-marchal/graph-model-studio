import * as vscode from 'vscode'

interface EmbedMarker {
  key: string
  line: number
}

export function embedFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
  const ranges: vscode.FoldingRange[] = []
  const stack: EmbedMarker[] = []

  for (let line = 0; line < document.lineCount; line++) {
    const text = document.lineAt(line).text
    for (const match of text.matchAll(/<!--\s*embed:([^\s>]+)(?:\s[^>]*)?-->/gi)) {
      const token = match[1].toLowerCase()
      const namedEnd = /^(.+):end$/.exec(token)
      if (token === 'end' || namedEnd) {
        const wantedKey = namedEnd?.[1]
        let openerIndex = -1
        for (let index = stack.length - 1; index >= 0; index--) {
          if (!wantedKey || stack[index].key === wantedKey) {
            openerIndex = index
            break
          }
        }
        if (openerIndex < 0) continue
        const [opener] = stack.splice(openerIndex, 1)
        if (line > opener.line) {
          ranges.push(new vscode.FoldingRange(opener.line, line, vscode.FoldingRangeKind.Region))
        }
        continue
      }

      // Attribute-style directives such as `embed:file="..."` use the
      // traditional anonymous `embed:end`. Named directives use a matching
      // `embed:<name>:end` marker and can nest safely.
      stack.push({ key: token.includes('=') ? '' : token, line })
    }
  }

  return ranges.sort((left, right) => left.start - right.start || right.end - left.end)
}

export function registerEmbedFolding(context: vscode.ExtensionContext): void {
  const selector: vscode.DocumentSelector = { language: 'markdown' }
  context.subscriptions.push(vscode.languages.registerFoldingRangeProvider(selector, {
    provideFoldingRanges: embedFoldingRanges,
  }))

  let timer: ReturnType<typeof setTimeout> | undefined
  const foldedVersions = new Map<string, number>()
  const scheduleCollapse = (editor = vscode.window.activeTextEditor) => {
    if (timer) clearTimeout(timer)
    if (!editor || editor.document.languageId !== 'markdown') return
    if (!vscode.workspace.getConfiguration('markdownEmbedder', editor.document.uri)
      .get<boolean>('collapseGeneratedContent', true)) return

    timer = setTimeout(() => {
      timer = undefined
      if (vscode.window.activeTextEditor !== editor) return
      const key = editor.document.uri.toString()
      if (foldedVersions.get(key) === editor.document.version) return
      const selectionLines = embedFoldingRanges(editor.document).map(range => range.start)
      foldedVersions.set(key, editor.document.version)
      if (selectionLines.length) {
        // Supplying neither direction nor levels makes VS Code fold the first
        // uncollapsed parent when a requested region is already folded. For a
        // TOC below an H1 that parent is the whole Markdown section. A bounded
        // downward fold keeps the operation on our embed ranges only.
        void vscode.commands.executeCommand('editor.fold', {
          selectionLines,
          direction: 'down',
          levels: 1,
        })
      }
    }, 180)
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(scheduleCollapse),
    vscode.workspace.onDidOpenTextDocument(document => {
      if (document === vscode.window.activeTextEditor?.document) scheduleCollapse()
    }),
    vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document === vscode.window.activeTextEditor?.document) scheduleCollapse()
    }),
    vscode.workspace.onDidCloseTextDocument(document => foldedVersions.delete(document.uri.toString())),
    { dispose: () => { if (timer) clearTimeout(timer) } },
  )
  scheduleCollapse()
}
