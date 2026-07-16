import { build } from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

await build({
  entryPoints: [path.join(here, 'src/extension.ts')],
  outfile: path.join(here, 'dist/extension.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  sourcemap: true,
  external: ['vscode'],
  alias: {
    '@': path.resolve(here, '../src'),
  },
  logLevel: 'info',
})
