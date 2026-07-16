import type { Config } from 'tailwindcss'

const config: Config = {
  // Resolve scans relative to this shared config even when Vite is invoked
  // from the sibling VS Code extension project.
  content: {
    relative: true,
    files: ['./index.html', './src/**/*.{ts,tsx}', './vscode-extension/webview/**/*.{html,ts,tsx}'],
  },
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: {
          0: 'var(--surface-0)',
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
        },
        border: 'var(--border)',
        accent: 'var(--accent)',
        'accent-fg': 'var(--accent-fg)',
        fg: {
          DEFAULT: 'var(--fg)',
          muted: 'var(--fg-muted)',
          subtle: 'var(--fg-subtle)',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
