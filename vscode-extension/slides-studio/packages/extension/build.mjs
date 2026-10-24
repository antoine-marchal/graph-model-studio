import { build } from 'esbuild';
import { resolve } from 'node:path';

// Bundled into the Graph Model Studio extension: vscode-extension/dist/slides-studio/.
// Two bundles: the activation entry (vscode only) loads main.cjs on first use.
for (const [entry, out] of [['src/extension.ts', 'extension.cjs'], ['src/main.ts', 'main.cjs']]) {
  await build({
    entryPoints: [resolve(import.meta.dirname, entry)],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: resolve(import.meta.dirname, '../../../dist/slides-studio', out),
    external: ['vscode'],
    sourcemap: true,
    // Less source to compile at load (identifiers kept: readable stacks without the source map).
    minifyWhitespace: true,
    minifySyntax: true,
    logLevel: 'warning',
  });
  console.log(`built dist/slides-studio/${out}`);
}
