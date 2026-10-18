import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';

const repoRoot = resolve(__dirname, '../..');

/**
 * Dev/test-only file bridge used by webview/harness.html (Playwright). Restricted to the repository and to
 * presentation sources, master JSON and master assets. Never part of the extension bundle.
 */
function harnessBridge(): Plugin {
  const safe = (p: string) => {
    const abs = resolve(repoRoot, p);
    const rel = relative(repoRoot, abs);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('outside repo');
    return abs;
  };
  return {
    name: 'css-harness-bridge',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://x');
        try {
          if (url.pathname === '/__file') {
            const p = safe(url.searchParams.get('path') ?? '');
            if (!/\.(slides\.(md|ya?ml|json)|deck)$/.test(p)) throw new Error('not a presentation');
            if (req.method === 'PUT') {
              const chunks: Buffer[] = [];
              for await (const c of req) chunks.push(c as Buffer);
              await writeFile(p, Buffer.concat(chunks).toString('utf8'));
              res.end('ok');
            } else res.end(await readFile(p, 'utf8'));
            return;
          }
          if (url.pathname === '/__master') {
            res.setHeader('content-type', 'application/json');
            res.end(await readFile(resolve(repoRoot, '.corporate-slides/master/corporate-master.json')));
            return;
          }
          if (url.pathname === '/__asset') {
            const p = safe(url.searchParams.get('path') ?? '');
            if (!/[\\/](\.corporate-slides|examples|tests)[\\/]/.test(p)) throw new Error('forbidden');
            const ext = p.split('.').pop()!.toLowerCase();
            res.setHeader('content-type', ext === 'png' ? 'image/png' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg');
            res.end(await readFile(p));
            return;
          }
        } catch (e) {
          res.statusCode = 400;
          res.end(String((e as Error).message));
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  root: resolve(__dirname, 'webview'),
  base: './',
  plugins: [react(), tailwindcss(), harnessBridge()],
  // Inline (empty) PostCSS config: do not inherit Graph Model Studio's Tailwind 3 postcss.config.cjs.
  css: { postcss: {} },
  server: { port: Number(process.env.PORT) || 5173, strictPort: true },
  build: {
    // Bundled into the Graph Model Studio extension (vscode-extension/dist/slides-studio/webview).
    outDir: resolve(__dirname, '../../../dist/slides-studio/webview'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'webview/index.html'),
      output: { entryFileNames: 'main.js', chunkFileNames: '[name].js', assetFileNames: (a) => (a.names?.[0]?.endsWith('.css') ? 'main.css' : '[name][extname]') },
    },
  },
});
