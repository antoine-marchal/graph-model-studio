import { build } from 'esbuild';
import { resolve } from 'node:path';

// Bundled into the Graph Model Studio extension: vscode-extension/dist/slides-studio/.
await build({
  entryPoints: [resolve(import.meta.dirname, 'src/extension.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: resolve(import.meta.dirname, '../../../dist/slides-studio/extension.cjs'),
  external: ['vscode'],
  sourcemap: true,
  logLevel: 'warning',
});
console.log('built dist/slides-studio/extension.cjs');
