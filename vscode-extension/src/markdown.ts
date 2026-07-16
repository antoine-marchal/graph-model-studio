import * as vscode from 'vscode'

export interface GmcMarkdownBlock {
  index: number
  id: string
  source: string
  language: 'gmc' | 'graphmodel'
  info: Record<string, string>
  fenceRange: vscode.Range
  contentRange: vscode.Range
  contentStartLine: number
}

function parseInfo(raw: string): Record<string, string> {
  const info: Record<string, string> = {}
  for (const match of raw.matchAll(/([a-zA-Z_][\w-]*)=("[^"]*"|'[^']*'|\S+)/g)) {
    const value = match[2]
    info[match[1]] = value.replace(/^(?:"|')|(?:"|')$/g, '')
  }
  return info
}

export function scanGmcMarkdownBlocks(document: vscode.TextDocument): GmcMarkdownBlock[] {
  if (document.languageId !== 'markdown') return []
  const blocks: GmcMarkdownBlock[] = []

  for (let line = 0; line < document.lineCount; line++) {
    const opening = /^\s*(`{3,}|~{3,})\s*(gmc|graphmodel)\b(.*)$/i.exec(document.lineAt(line).text)
    if (!opening) continue

    const fenceChar = opening[1][0]
    const fenceLength = opening[1].length
    let closingLine = document.lineCount - 1
    let foundClosingFence = false
    for (let candidate = line + 1; candidate < document.lineCount; candidate++) {
      const closing = new RegExp(`^\\s*${fenceChar}{${fenceLength},}\\s*$`).test(document.lineAt(candidate).text)
      if (closing) {
        closingLine = candidate
        foundClosingFence = true
        break
      }
    }

    const contentStartLine = line + 1
    const contentEndLine = foundClosingFence ? closingLine : document.lineCount
    const source = Array.from(
      { length: Math.max(0, contentEndLine - contentStartLine) },
      (_, offset) => document.lineAt(contentStartLine + offset).text,
    ).join('\n')
    const info = parseInfo(opening[3] ?? '')
    const index = blocks.length
    const id = info.id || `diagram-${index + 1}`
    const contentEnd = contentEndLine < document.lineCount
      ? new vscode.Position(contentEndLine, 0)
      : document.lineAt(document.lineCount - 1).range.end

    blocks.push({
      index,
      id,
      source,
      language: opening[2].toLowerCase() as 'gmc' | 'graphmodel',
      info,
      fenceRange: new vscode.Range(
        new vscode.Position(line, 0),
        foundClosingFence ? document.lineAt(closingLine).range.end : document.lineAt(document.lineCount - 1).range.end,
      ),
      contentRange: new vscode.Range(new vscode.Position(contentStartLine, 0), contentEnd),
      contentStartLine,
    })

    line = foundClosingFence ? closingLine : document.lineCount
  }

  return blocks
}

export function gmcBlockAtPosition(
  document: vscode.TextDocument,
  position: vscode.Position,
): GmcMarkdownBlock | undefined {
  return scanGmcMarkdownBlocks(document).find(block => block.fenceRange.contains(position))
}
