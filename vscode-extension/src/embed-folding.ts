import * as vscode from 'vscode'

interface EmbedMarker {
  key: string
  line: number
}

interface MarkdownHeading {
  line: number
  level: number
}

function markdownHeadings(document: vscode.TextDocument): MarkdownHeading[] {
  const headings: MarkdownHeading[] = []
  let fence: { character: string; length: number } | undefined
  let previousCanBeSetextHeading = false

  for (let line = 0; line < document.lineCount; line++) {
    const text = document.lineAt(line).text
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(text)
    if (fence) {
      if (fenceMatch
        && fenceMatch[1][0] === fence.character
        && fenceMatch[1].length >= fence.length
        && text.slice(fenceMatch[0].length).trim() === '') {
        fence = undefined
      }
      previousCanBeSetextHeading = false
      continue
    }
    if (fenceMatch) {
      fence = { character: fenceMatch[1][0], length: fenceMatch[1].length }
      previousCanBeSetextHeading = false
      continue
    }

    const atx = /^ {0,3}(#{1,6})(?:[ \t]+|$)/.exec(text)
    if (atx) {
      headings.push({ line, level: atx[1].length })
      previousCanBeSetextHeading = false
      continue
    }

    const setext = /^ {0,3}(=+|-+)[ \t]*$/.exec(text)
    if (setext && previousCanBeSetextHeading) {
      headings.push({ line: line - 1, level: setext[1][0] === '=' ? 1 : 2 })
      previousCanBeSetextHeading = false
      continue
    }
    previousCanBeSetextHeading = text.trim().length > 0
  }

  return headings
}

function markdownHeadingGuards(
  document: vscode.TextDocument,
  embedRanges: readonly vscode.FoldingRange[],
): vscode.FoldingRange[] {
  const headings = markdownHeadings(document)
  const guards: vscode.FoldingRange[] = []
  const prioritizedEmbeds = [...embedRanges]
    .sort((left, right) => left.start - right.start || right.end - left.end)

  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index]
    let end = document.lineCount - 1
    for (let next = index + 1; next < headings.length; next++) {
      if (headings[next].level <= heading.level) {
        end = headings[next].line - 1
        break
      }
    }

    let guardsEmbed = false
    for (const embed of prioritizedEmbeds) {
      if (heading.line < embed.start && end >= embed.start && end < embed.end) {
        // A chapter ending on or inside an embed would cross it. Extend the
        // chapter so that it contains the complete, higher-priority embed.
        end = embed.end
        guardsEmbed = true
      } else if (heading.line > embed.start && heading.line < embed.end) {
        // A generated chapter belongs to the embed. Prevent it from extending
        // past embed:end and crossing its parent range.
        end = Math.min(end, embed.end)
        guardsEmbed = true
      }
    }
    if (guardsEmbed && end > heading.line) {
      guards.push(new vscode.FoldingRange(heading.line, end))
    }
  }

  return guards
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

  // VS Code merges all Markdown folding providers and rejects crossing ranges.
  // A heading can end on an embed opener or extend beyond embed:end. Publish
  // same-start normalized heading ranges from this higher-ranked provider so
  // every overlap becomes proper containment and the embed fold survives.
  ranges.push(...markdownHeadingGuards(document, ranges))
  return ranges.sort((left, right) => left.start - right.start || right.end - left.end)
}

export function registerEmbedFolding(context: vscode.ExtensionContext): void {
  const selector: vscode.DocumentSelector = { language: 'markdown' }
  context.subscriptions.push(vscode.languages.registerFoldingRangeProvider(selector, {
    provideFoldingRanges: embedFoldingRanges,
  }))

  let timer: ReturnType<typeof setTimeout> | undefined
  const foldedDocuments = new Set<string>()
  const scheduleCollapse = (editor = vscode.window.activeTextEditor) => {
    if (timer) clearTimeout(timer)
    if (!editor || editor.document.languageId !== 'markdown') return
    if (!vscode.workspace.getConfiguration('markdownEmbedder', editor.document.uri)
      .get<boolean>('collapseGeneratedContent', true)) return

    timer = setTimeout(() => {
      timer = undefined
      if (vscode.window.activeTextEditor !== editor) return
      const key = editor.document.uri.toString()
      if (foldedDocuments.has(key)) return
      const selectionLines = embedFoldingRanges(editor.document)
        .filter(range => range.kind === vscode.FoldingRangeKind.Region)
        .map(range => range.start)
      if (selectionLines.length) {
        foldedDocuments.add(key)
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
    vscode.workspace.onDidCloseTextDocument(document => foldedDocuments.delete(document.uri.toString())),
    { dispose: () => { if (timer) clearTimeout(timer) } },
  )
  scheduleCollapse()
}
