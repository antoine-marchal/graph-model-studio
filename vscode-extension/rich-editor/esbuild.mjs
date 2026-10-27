// Builds the Markdown Studio rich editor (custom editor host + Tiptap webview)
// into ../dist/rich-editor. GMC rendering inside the editor reuses the
// extension's own dist/markdown-preview and dist/webview, so rebuilding the
// Graph Model Studio core updates the rich editor too.
import { build, context } from 'esbuild'
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const outdir = path.resolve(here, '..', 'dist', 'rich-editor')
const require = createRequire(import.meta.url)
const isWatch = process.argv.includes('--watch')
const isProduction = !isWatch && !process.argv.includes('--dev')

const common = { bundle: true, minify: isProduction, sourcemap: !isProduction, logLevel: 'warning' }
const hostOptions = {
  ...common,
  entryPoints: [path.join(here, 'src', 'extension.ts')],
  outfile: path.join(outdir, 'extension.js'),
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
}
// ESM with code-splitting so heavy deps (mermaid…) load as separate chunks.
const webviewOptions = {
  ...common,
  entryPoints: [path.join(here, 'webview', 'index.tsx')],
  outdir,
  entryNames: 'webview',
  chunkNames: 'chunks/webview-[hash]',
  splitting: true,
  platform: 'browser',
  format: 'esm',
  // One React: pnpm gives @tiptap/react / lucide-react their own peer copy,
  // while the editor sources resolve the workspace root's.
  alias: Object.fromEntries(['react', 'react-dom'].map((name) => [name, path.dirname(require.resolve(`${name}/package.json`))])),
  define: { 'process.env.NODE_ENV': isProduction ? '"production"' : '"development"' },
  loader: { '.ttf': 'dataurl', '.woff': 'dataurl', '.woff2': 'dataurl', '.svg': 'dataurl', '.png': 'dataurl' },
}

// Themes: the list is the `markdownStudio.theme` enum. `github-*` themes are
// generated from @primer/primitives (only the tokens themes/base.css reads,
// var() chains resolved); every other theme is a hand-written
// webview/styles/themes/<name>.css defining the same tokens.
const THEMES_DIR = path.join(here, 'webview', 'styles', 'themes')
const PRIMER_THEMES_DIR = path.join(path.dirname(require.resolve('@primer/primitives/package.json')), 'dist', 'css', 'functional', 'themes')
const manifest = JSON.parse(readFileSync(path.join(here, '..', 'package.json'), 'utf8'))
const THEME_NAMES = manifest.contributes.configuration[0].properties['markdownStudio.theme'].enum.filter((name) => name !== 'default')

function parseTokens(css) {
  const tokens = {}
  for (const [, name, value] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    if (!(name in tokens)) tokens[name] = value.trim()
  }
  return tokens
}

function githubThemeCss(theme, required) {
  const primerName = theme.slice('github-'.length)
  const tokens = parseTokens(readFileSync(path.join(PRIMER_THEMES_DIR, `${primerName}.css`), 'utf8'))
  const resolve = (name) => {
    if (!(name in tokens)) throw new Error(`@primer/primitives ${primerName}: missing --${name}`)
    return tokens[name].replace(/var\(--([\w-]+)\)/g, (_, ref) => resolve(ref))
  }
  const scheme = primerName.startsWith('dark') ? 'dark' : 'light'
  const lines = required.map((name) => `  --${name}: ${resolve(name)};`)
  return `body[data-theme="${theme}"] {\n  color-scheme: ${scheme};\n${lines.join('\n')}\n}\n`
}

function customThemeCss(theme, required) {
  const css = readFileSync(path.join(THEMES_DIR, `${theme}.css`), 'utf8')
  const tokens = parseTokens(css)
  const missing = required.filter((name) => !(name in tokens))
  if (missing.length) throw new Error(`${theme}.css: missing ${missing.map((name) => `--${name}`).join(', ')}`)
  return css
}

function themesCss() {
  const base = readFileSync(path.join(THEMES_DIR, 'base.css'), 'utf8')
  const required = [...new Set([...base.matchAll(/var\(--([\w-]+)\)/g)].map((match) => match[1]))]
    .filter((name) => !name.startsWith('vscode-'))
  const themes = THEME_NAMES.map((theme) => (theme.startsWith('github-') ? githubThemeCss(theme, required) : customThemeCss(theme, required)))
  return [...themes, base].join('\n')
}

// editor.css = editor styles + diff2html + KaTeX + themes (last, so their
// body[data-theme] overrides win ties); KaTeX fonts next to it.
function writeCss() {
  mkdirSync(outdir, { recursive: true })
  const editor = readFileSync(path.join(here, 'webview', 'styles', 'editor.css'), 'utf8')
  const d2h = readFileSync(require.resolve('diff2html/bundles/css/diff2html.min.css'), 'utf8')
  const katexDist = path.join(path.dirname(require.resolve('katex/package.json')), 'dist')
  const katex = readFileSync(path.join(katexDist, 'katex.min.css'), 'utf8')
  // Slides Studio's chrome stylesheet, verbatim (one studio identity), minus what belongs to its own
  // page: Tailwind, the body / root rules and the global <code> font (document code keeps its look).
  const slides = readFileSync(path.join(here, '..', 'slides-studio', 'packages', 'extension', 'webview', 'src', 'styles.css'), 'utf8')
    .replace(/@import ['"]tailwindcss['"];?/, '')
    .replace(/^html, body, #root \{[^}]*\}/m, '')
    .replace(/^body \{[^}]*\}/m, '')
    .replace(/^code \{[^}]*\}/m, '')
  // Studio chrome and paper (Markdown Studio document shell) last: it lays out the editor.
  const studio = `${slides}

/* markdown studio */
${readFileSync(path.join(here, 'webview', 'styles', 'studio.css'), 'utf8')}`
  writeFileSync(
    path.join(outdir, 'editor.css'),
    `${editor}\n\n/* diff2html */\n${d2h}\n\n/* katex */\n${katex}\n\n/* themes */\n${themesCss()}\n\n/* studio */\n${studio}`,
  )
  const fontsDir = path.join(outdir, 'fonts')
  mkdirSync(fontsDir, { recursive: true })
  for (const file of readdirSync(path.join(katexDist, 'fonts'))) {
    copyFileSync(path.join(katexDist, 'fonts', file), path.join(fontsDir, file))
  }
}

if (isWatch) {
  writeCss()
  await Promise.all([hostOptions, webviewOptions].map(async (options) => (await context(options)).watch()))
  console.log('Rich editor: watching for changes...')
} else {
  await Promise.all([build(hostOptions), build(webviewOptions)])
  writeCss()
  console.log(`Rich editor built into ${path.relative(process.cwd(), outdir) || outdir}`)
}
