import { build } from 'esbuild';
await build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: 'dist/cli.cjs',
  banner: { js: '#!/usr/bin/env node' },
  // pptx-masters uses import.meta.url-free ESM; pptxgenjs-plus ships CJS.
  logLevel: 'warning',
});
console.log('built dist/cli.cjs');
