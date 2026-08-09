import * as vscode from 'vscode'
import { parseDsl } from '../../src/core/dsl/parser'
import { notationRegistry } from '../../src/core/notation'
import type { GraphModel } from '../../src/core/model'
import { scanGmcMarkdownBlocks, type GmcMarkdownBlock } from './markdown'

type ParsedDsl = ReturnType<typeof parseDsl>

interface DocumentAnalysis {
  version: number
  blocks: GmcMarkdownBlock[]
  documentParse?: ParsedDsl
  blockParses: Map<number, ParsedDsl>
}

const analysisCache = new Map<string, DocumentAnalysis>()

function analysisFor(document: vscode.TextDocument): DocumentAnalysis {
  const key = document.uri.toString()
  const cached = analysisCache.get(key)
  if (cached?.version === document.version) return cached
  const analysis: DocumentAnalysis = {
    version: document.version,
    blocks: document.languageId === 'markdown' ? scanGmcMarkdownBlocks(document) : [],
    blockParses: new Map(),
  }
  analysisCache.set(key, analysis)
  return analysis
}

function parsedDocument(document: vscode.TextDocument): ParsedDsl {
  const analysis = analysisFor(document)
  return analysis.documentParse ??= parseDsl(document.getText())
}

function parsedBlock(document: vscode.TextDocument, block: GmcMarkdownBlock): ParsedDsl {
  const analysis = analysisFor(document)
  const cached = analysis.blockParses.get(block.index)
  if (cached) return cached
  const parsed = parseDsl(block.source)
  analysis.blockParses.set(block.index, parsed)
  return parsed
}

interface SourceContext {
  source: string
  parsed: ParsedDsl
  block?: GmcMarkdownBlock
  toDocumentPosition(line: number, column: number): vscode.Position
}

function contextAt(document: vscode.TextDocument, position: vscode.Position): SourceContext | undefined {
  if (document.languageId === 'gmc') {
    return {
      source: document.getText(),
      parsed: parsedDocument(document),
      toDocumentPosition: (line, column) => new vscode.Position(Math.max(0, line - 1), Math.max(0, column - 1)),
    }
  }
  if (document.languageId === 'markdown') {
    const block = analysisFor(document).blocks.find(candidate => candidate.fenceRange.contains(position))
    if (!block) return undefined
    return {
      source: block.source,
      parsed: parsedBlock(document, block),
      block,
      toDocumentPosition: (line, column) => new vscode.Position(
        block.contentStartLine + Math.max(0, line - 1),
        Math.max(0, column - 1),
      ),
    }
  }
  return undefined
}

function findDeclaration(document: vscode.TextDocument, id: string, block?: GmcMarkdownBlock): vscode.Range | undefined {
  const range = block?.contentRange
  const text = range ? document.getText(range) : document.getText()
  const match = new RegExp(`(^|\\n)(\\s*)${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`, 'm').exec(text)
  if (!match) return undefined
  const base = range ? document.offsetAt(range.start) : 0
  const offset = base + match.index + match[1].length + match[2].length
  const start = document.positionAt(offset)
  return new vscode.Range(start, start.translate(0, id.length))
}

function collectIdentifiers(model: GraphModel | null): string[] {
  if (!model) return []
  return [...Object.keys(model.elements), ...Object.keys(model.views)]
}

export function registerLanguageFeatures(context: vscode.ExtensionContext): vscode.DiagnosticCollection {
  const diagnostics = vscode.languages.createDiagnosticCollection('gmc')
  const diagnosticTimers = new Map<string, ReturnType<typeof setTimeout>>()
  context.subscriptions.push(diagnostics)
  context.subscriptions.push({
    dispose() {
      for (const timer of diagnosticTimers.values()) clearTimeout(timer)
      diagnosticTimers.clear()
    },
  })

  const updateDiagnostics = (document: vscode.TextDocument) => {
    if (document.languageId !== 'gmc' && document.languageId !== 'markdown') return
    const results: vscode.Diagnostic[] = []
    const sources = document.languageId === 'gmc'
      ? [{ source: document.getText(), contentStartLine: 0, parsed: parsedDocument(document) }]
      : analysisFor(document).blocks.map(block => ({ ...block, parsed: parsedBlock(document, block) }))

    for (const source of sources) {
      for (const item of source.parsed.diagnostics) {
        const line = source.contentStartLine + Math.max(0, (item.line ?? 1) - 1)
        const column = Math.max(0, (item.column ?? 1) - 1)
        const start = new vscode.Position(Math.min(line, document.lineCount - 1), column)
        const lineEnd = document.lineAt(start.line).range.end.character
        const end = new vscode.Position(start.line, Math.min(lineEnd, column + 20))
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(start, end),
          item.message,
          item.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error,
        )
        diagnostic.source = 'gmc'
        results.push(diagnostic)
      }
    }
    diagnostics.set(document.uri, results)
  }

  for (const document of vscode.workspace.textDocuments) updateDiagnostics(document)
  const scheduleDiagnostics = (document: vscode.TextDocument) => {
    const key = document.uri.toString()
    const current = diagnosticTimers.get(key)
    if (current) clearTimeout(current)
    diagnosticTimers.set(key, setTimeout(() => {
      diagnosticTimers.delete(key)
      updateDiagnostics(document)
    }, 180))
  }
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(updateDiagnostics),
    vscode.workspace.onDidChangeTextDocument(event => scheduleDiagnostics(event.document)),
    vscode.workspace.onDidCloseTextDocument(document => {
      const key = document.uri.toString()
      const timer = diagnosticTimers.get(key)
      if (timer) clearTimeout(timer)
      diagnosticTimers.delete(key)
      diagnostics.delete(document.uri)
      analysisCache.delete(key)
    }),
  )

  const selector: vscode.DocumentSelector = [{ language: 'gmc' }, { language: 'markdown' }]
  context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, {
    provideCompletionItems(document, position) {
      const sourceContext = contextAt(document, position)
      if (!sourceContext) return undefined
      const parsed = sourceContext.parsed
      const items: vscode.CompletionItem[] = []

      for (const type of notationRegistry.getAllElementTypes()) {
        const item = new vscode.CompletionItem(type.type, vscode.CompletionItemKind.Class)
        item.detail = `${type.label} (${type.notation}${type.group ? ` · ${type.group}` : ''})`
        item.documentation = new vscode.MarkdownString(type.description ?? `${type.label} graph element.`)
        item.insertText = type.type
        items.push(item)
      }
      for (const type of notationRegistry.getAllRelationTypes()) {
        const item = new vscode.CompletionItem(type.type, vscode.CompletionItemKind.EnumMember)
        item.detail = `${type.label} relation (${type.notation})`
        item.insertText = type.type
        items.push(item)
      }
      for (const id of collectIdentifiers(parsed.model)) {
        const item = new vscode.CompletionItem(id, vscode.CompletionItemKind.Reference)
        item.detail = 'GMC symbol'
        items.push(item)
      }
      return items
    },
  }, '=', ':'))

  context.subscriptions.push(vscode.languages.registerHoverProvider(selector, {
    provideHover(document, position) {
      const sourceContext = contextAt(document, position)
      if (!sourceContext) return undefined
      const range = document.getWordRangeAtPosition(position, /[a-zA-Z_][\w.]*/)
      if (!range) return undefined
      const word = document.getText(range)
      const elementType = notationRegistry.getElementDef(word)
      if (elementType) {
        return new vscode.Hover(new vscode.MarkdownString(
          `**${elementType.label}**  \n\`${elementType.type}\` · ${elementType.notation}${elementType.group ? ` · ${elementType.group}` : ''}\n\n${elementType.description ?? ''}`,
        ), range)
      }
      const relationType = notationRegistry.getRelationDef(word)
      if (relationType) {
        return new vscode.Hover(new vscode.MarkdownString(
          `**${relationType.label} relation**  \n\`${relationType.type}\` · ${relationType.notation}`,
        ), range)
      }
      const model = sourceContext.parsed.model
      const element = model?.elements[word]
      if (element) {
        return new vscode.Hover(new vscode.MarkdownString(
          `**${element.name}**  \n\`${element.id}\` · ${element.type}${element.description ? `\n\n${element.description}` : ''}`,
        ), range)
      }
      return undefined
    },
  }))

  context.subscriptions.push(vscode.languages.registerDefinitionProvider(selector, {
    provideDefinition(document, position) {
      const sourceContext = contextAt(document, position)
      if (!sourceContext) return undefined
      const range = document.getWordRangeAtPosition(position, /[a-zA-Z_][\w.]*/)
      if (!range) return undefined
      const declaration = findDeclaration(document, document.getText(range), sourceContext.block)
      return declaration ? new vscode.Location(document.uri, declaration) : undefined
    },
  }))

  context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(selector, {
    provideDocumentSymbols(document) {
      const symbols: vscode.DocumentSymbol[] = []
      const sources = document.languageId === 'gmc'
        ? [{ source: document.getText(), block: undefined, parsed: parsedDocument(document) }]
        : analysisFor(document).blocks.map(block => ({ source: block.source, block, parsed: parsedBlock(document, block) }))
      for (const source of sources) {
        const model = source.parsed.model
        if (!model) continue
        for (const element of Object.values(model.elements)) {
          const range = findDeclaration(document, element.id, source.block)
          if (!range) continue
          symbols.push(new vscode.DocumentSymbol(element.name, element.type, vscode.SymbolKind.Object, range, range))
        }
        for (const view of Object.values(model.views)) {
          const range = findDeclaration(document, view.id, source.block)
          if (!range) continue
          symbols.push(new vscode.DocumentSymbol(view.name, 'view', vscode.SymbolKind.Namespace, range, range))
        }
      }
      return symbols
    },
  }))

  context.subscriptions.push(vscode.languages.registerCodeLensProvider({ language: 'markdown' }, {
    provideCodeLenses(document) {
      return analysisFor(document).blocks.map(block => new vscode.CodeLens(
        new vscode.Range(block.fenceRange.start, block.fenceRange.start),
        {
          title: '$(export) Export GMC diagram as PNG',
          command: 'gmc.exportMarkdownDiagram',
          arguments: [document.uri, block.index],
        },
      ))
    },
  }))

  return diagnostics
}
