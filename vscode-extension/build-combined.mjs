import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSync } from 'esbuild'

const root = path.dirname(fileURLToPath(import.meta.url))
buildSync({
  entryPoints: [path.join(root, 'integrations', 'markdown-toolkit', 'source', 'index.js')],
  outfile: path.join(root, 'integrations', 'markdown-toolkit', 'extension.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  logLevel: 'warning',
})
buildSync({
  entryPoints: [path.join(root, 'integrations', 'slides', 'source', 'extension.js')],
  outfile: path.join(root, 'integrations', 'slides', 'extension.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  logLevel: 'warning',
})

const required = [
  'dist/extension.js',
  'dist/webview/assets/webview.js',
  'dist/markdown-preview/runtime.js',
  'integrations/host.js',
  'integrations/markdown-code-embedder/extension.js',
  'integrations/markdown-code-embedder/markdown-paths.js',
  'integrations/markdown-toolkit/extension.js',
  'integrations/slides/extension.js',
]

for (const relativePath of required) {
  if (!existsSync(path.join(root, relativePath))) {
    throw new Error(`Missing required combined-extension artifact: ${relativePath}`)
  }
}

JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
copyFileSync(
  path.join(root, 'markdown-preview', 'loader.js'),
  path.join(root, 'dist', 'markdown-preview', 'preview.js'),
)

for (const relativePath of [
  'integrations/host.js',
  'integrations/markdown-code-embedder/embedder.js',
  'integrations/markdown-code-embedder/markdown-paths.js',
  'integrations/markdown-code-embedder/utils.js',
  'integrations/markdown-toolkit/extension.js',
  'integrations/slides/extension.js',
  'dist/markdown-preview/preview.js',
]) {
  execFileSync(process.execPath, ['--check', path.join(root, relativePath)], { stdio: 'inherit' })
}

console.log('Combined extension artifacts are valid and synchronized.')
