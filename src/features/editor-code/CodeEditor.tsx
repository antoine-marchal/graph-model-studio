import { useCallback, useRef, useEffect } from 'react'
import MonacoEditor, { type Monaco, type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { useModelStore } from '@/store'
import { notationRegistry } from '@/core/notation'

const DSL_LANGUAGE_ID = 'graphmodel'
const PARSE_DEBOUNCE_MS = 500

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function registerLanguage(monaco: Monaco) {
  if ((monaco.languages.getLanguages() as { id: string }[]).some(l => l.id === DSL_LANGUAGE_ID)) return
  monaco.languages.register({ id: DSL_LANGUAGE_ID })

  monaco.languages.setMonarchTokensProvider(DSL_LANGUAGE_ID, {
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/"([^"\\]|\\.)*"/, 'string'],
        [/->/, 'operator'],
        [/[{}=*:]/, 'delimiter'],
        [/\b(model|views|view|include|autolayout|of|description|technology|tags|properties|archimate|bpmn|flowchart)\b/, 'keyword'],
        [/\b(person|softwareSystem|container|component|codeElement|businessActor|businessRole|businessProcess|applicationComponent|applicationService|dataObject|technologyNode|device|systemSoftware|artifact|startEvent|endEvent|task|userTask|serviceTask|gateway|exclusiveGateway|parallelGateway|pool|lane|start|end|process|decision|inputOutput|connector|node|group|external)\b/, 'type'],
        [/[a-zA-Z_][\w.]*/, 'identifier'],
        [/\s+/, 'white'],
      ],
    },
  })

  monaco.languages.setLanguageConfiguration(DSL_LANGUAGE_ID, {
    brackets: [['{', '}']],
    autoClosingPairs: [{ open: '{', close: '}' }, { open: '"', close: '"' }],
    comments: { lineComment: '//' },
  })

  registerCompletion(monaco)
}

/** Node-type IntelliSense: every element type, with its notation, group, an
 *  inline logo, and a one-line description in the suggestion details. */
function registerCompletion(monaco: Monaco) {
  const notationLabel = (k: string) => notationRegistry.getNotations().find(n => n.kind === k)?.label ?? k
  monaco.languages.registerCompletionItemProvider(DSL_LANGUAGE_ID, {
    triggerCharacters: ['=', ' '],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
        startColumn: word.startColumn, endColumn: word.endColumn,
      }
      const suggestions = notationRegistry.getAllElementTypes().map(t => {
        const notation = notationLabel(t.notation)
        const grp = t.group ? ` · ${t.group}` : ''
        const logo = t.iconSrc ? `![logo](${new URL(t.iconSrc, location.href).href})\n\n` : ''
        const desc = t.description ?? `${t.label} element from the ${notation} notation${t.group ? `, ${t.group} layer` : ''}.`
        return {
          label: { label: t.type, description: `${t.label} — ${notation}` },
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: t.type,
          detail: `${t.label} (${notation}${grp})`,
          documentation: { value: `${logo}**${t.label}**\n\n\`${t.type}\` — ${notation}${grp}\n\n${desc}`, supportHtml: true },
          range,
        }
      })
      return { suggestions }
    },
  })

  monaco.editor.defineTheme('graphmodel-dark', {
    base: 'vs-dark', inherit: true,
    rules: [
      { token: 'keyword', foreground: 'C792EA', fontStyle: 'bold' },
      { token: 'type', foreground: '82AAFF' },
      { token: 'string', foreground: 'C3E88D' },
      { token: 'comment', foreground: '546E7A', fontStyle: 'italic' },
      { token: 'operator', foreground: '89DDFF' },
      { token: 'delimiter', foreground: '89DDFF' },
      { token: 'identifier', foreground: 'EEFFFF' },
    ],
    colors: {
      'editor.background': '#0f1623',
      'editor.foreground': '#EEFFFF',
      'editorLineNumber.foreground': '#3B4758',
      'editorCursor.foreground': '#80CBC4',
      'editor.selectionBackground': '#1D3954',
      'editor.lineHighlightBackground': '#16202E',
    },
  })

  monaco.editor.defineTheme('graphmodel-light', {
    base: 'vs', inherit: true,
    rules: [
      { token: 'keyword', foreground: '7C3AED', fontStyle: 'bold' },
      { token: 'type', foreground: '1D4ED8' },
      { token: 'string', foreground: '15803D' },
      { token: 'comment', foreground: '94A3B8', fontStyle: 'italic' },
      { token: 'operator', foreground: '0891B2' },
      { token: 'delimiter', foreground: '0891B2' },
      { token: 'identifier', foreground: '0F172A' },
    ],
    colors: {
      'editor.background': '#FFFFFF',
      'editor.foreground': '#0F172A',
      'editorLineNumber.foreground': '#CBD5E1',
      'editor.lineHighlightBackground': '#F1F5F9',
    },
  })
}

export function CodeEditor() {
  const dslSource = useModelStore(s => s.dslSource)
  const parseDslAndUpdate = useModelStore(s => s.parseDslAndUpdate)
  const setDslSource = useModelStore(s => s.setDslSource)
  const diagnostics = useModelStore(s => s.diagnostics)
  const theme = useModelStore(s => s.theme)
  const highlightRequest = useModelStore(s => s.highlightRequest)
  const model = useModelStore(s => s.model)

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSourceRef = useRef(dslSource)

  // markers from diagnostics
  useEffect(() => {
    const monaco = monacoRef.current
    const ed = editorRef.current
    if (!monaco || !ed) return
    const m = ed.getModel()
    if (!m) return
    const markers = diagnostics
      .filter(d => d.severity !== 'info')
      .map(d => ({
        severity: d.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
        message: d.message,
        startLineNumber: d.line ?? 1, startColumn: d.column ?? 1,
        endLineNumber: d.line ?? 1, endColumn: (d.column ?? 1) + 20,
      }))
    monaco.editor.setModelMarkers(m, 'graphmodel', markers)
  }, [diagnostics])

  // external source changes (WYSIWYG edits)
  useEffect(() => {
    const ed = editorRef.current
    if (!ed) return
    if (ed.getValue() !== dslSource && lastSourceRef.current !== dslSource) {
      lastSourceRef.current = dslSource
      const pos = ed.getPosition()
      ed.setValue(dslSource)
      if (pos) ed.setPosition(pos)
    }
  }, [dslSource])

  // theme switch
  useEffect(() => {
    const monaco = monacoRef.current
    if (!monaco) return
    monaco.editor.setTheme(theme === 'dark' ? 'graphmodel-dark' : 'graphmodel-light')
  }, [theme])

  // highlight requested target line
  const decoRef = useRef<string[]>([])
  useEffect(() => {
    if (!highlightRequest) return
    const ed = editorRef.current
    const monaco = monacoRef.current
    if (!ed || !monaco) return
    const m = ed.getModel()
    if (!m) return
    const text = m.getValue()
    let regex: RegExp | null = null
    if (highlightRequest.kind === 'element') {
      regex = new RegExp(`(^|\\n)\\s*${escapeRegExp(highlightRequest.id)}\\s*=`, 'm')
    } else {
      const rel = model.relations[highlightRequest.id]
      if (rel) regex = new RegExp(`${escapeRegExp(rel.sourceId)}\\s*->\\s*${escapeRegExp(rel.targetId)}`, 'm')
    }
    if (!regex) return
    const match = regex.exec(text)
    if (!match) return
    const offset = match.index + (match[1] ? match[1].length : 0)
    const start = m.getPositionAt(offset)
    const lineNumber = start.lineNumber
    ed.revealLineInCenter(lineNumber)
    decoRef.current = ed.deltaDecorations(decoRef.current, [
      { range: new monaco.Range(lineNumber, 1, lineNumber, 1), options: { isWholeLine: true, className: 'gms-line-highlight' } },
    ])
    if (highlightRequest.focus) {
      const lineContent = m.getLineContent(lineNumber)
      ed.setSelection({ startLineNumber: lineNumber, startColumn: 1, endLineNumber: lineNumber, endColumn: lineContent.length + 1 })
      ed.focus()
    }
    const t = setTimeout(() => { decoRef.current = ed.deltaDecorations(decoRef.current, []) }, 1500)
    return () => clearTimeout(t)
  }, [highlightRequest, model])

  const handleMount: OnMount = useCallback((ed, monaco) => {
    editorRef.current = ed
    monacoRef.current = monaco
    registerLanguage(monaco)
    const themeName = useModelStore.getState().theme === 'dark' ? 'graphmodel-dark' : 'graphmodel-light'
    monaco.editor.setModelLanguage(ed.getModel()!, DSL_LANGUAGE_ID)
    monaco.editor.setTheme(themeName)
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      window.dispatchEvent(new CustomEvent('gms:save'))
    })
  }, [])

  const handleChange = useCallback((value: string | undefined) => {
    const src = value ?? ''
    lastSourceRef.current = src
    setDslSource(src)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => parseDslAndUpdate(src), PARSE_DEBOUNCE_MS)
  }, [setDslSource, parseDslAndUpdate])

  return (
    <MonacoEditor
      height="100%"
      defaultLanguage={DSL_LANGUAGE_ID}
      defaultValue={dslSource}
      onChange={handleChange}
      onMount={handleMount}
      theme={theme === 'dark' ? 'graphmodel-dark' : 'graphmodel-light'}
      options={{
        fontSize: 13,
        fontFamily: "'JetBrains Mono','Fira Code',monospace",
        lineNumbers: 'on',
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        tabSize: 2,
        renderWhitespace: 'none',
        folding: true,
        glyphMargin: false,
        overviewRulerBorder: false,
        hideCursorInOverviewRuler: true,
        automaticLayout: true,
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        padding: { top: 10 },
      }}
    />
  )
}
