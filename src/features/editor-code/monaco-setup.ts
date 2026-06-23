// Wire @monaco-editor/react to the *bundled* monaco-editor package instead of
// fetching it from a CDN. The app is meant to run on a standalone, offline PC,
// so every dependency must ship with the build.
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

// Our DSL is a custom Monarch language — only the core editor worker is needed
// (no TypeScript/JSON/CSS/HTML language services).
;(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker() {
    return new editorWorker()
  },
}

loader.config({ monaco })
