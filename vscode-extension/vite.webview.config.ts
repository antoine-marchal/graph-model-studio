import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  // Asset URLs must resolve next to webview.js (a vscode-webview resource),
  // not at the webview origin root.
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src'),
    },
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss({ config: path.resolve(__dirname, '../tailwind.config.ts') }),
        autoprefixer(),
      ],
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/webview'),
    emptyOutDir: true,
    sourcemap: true,
    // The webview deliberately bundles the shared Graph Model Studio renderer,
    // inspector, notation registry, and layout engines into one offline asset.
    chunkSizeWarningLimit: 750,
    // Inline tree-node glyphs (~1 MB). PNG export rasterizes with html-to-image,
    // which must fetch() every <img>: the webview CSP has no connect-src, and
    // the rich editor's srcdoc graph frame cannot load extension files at all.
    assetsInlineLimit: file => (/[\\/]assets[\\/]glyphs[\\/]/.test(file) ? true : undefined),
    rollupOptions: {
      input: path.resolve(__dirname, 'webview/index.html'),
      output: {
        entryFileNames: 'assets/webview.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: asset => asset.name?.endsWith('.css') ? 'assets/webview.css' : 'assets/[name][extname]',
      },
    },
  },
})
