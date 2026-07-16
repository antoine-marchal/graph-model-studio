import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import path from 'node:path'
import { copyFileSync } from 'node:fs'

const outDir = path.resolve(__dirname, 'dist/markdown-preview')

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-markdown-preview-loader',
      closeBundle() {
        copyFileSync(
          path.resolve(__dirname, 'markdown-preview/loader.js'),
          path.join(outDir, 'preview.js'),
        )
      },
    },
  ],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
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
    outDir,
    emptyOutDir: true,
    sourcemap: true,
    // Includes the complete renderer plus CSS text for Shadow DOM isolation.
    chunkSizeWarningLimit: 1100,
    lib: {
      entry: path.resolve(__dirname, 'markdown-preview/index.tsx'),
      name: 'GraphModelStudioMarkdownPreview',
      formats: ['iife'],
      fileName: () => 'runtime.js',
    },
  },
})
