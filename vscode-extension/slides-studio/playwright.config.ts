import { defineConfig } from '@playwright/test';

const port = Number(process.env.PORT) || 5173;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${port}`, viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure', permissions: ['clipboard-read', 'clipboard-write'] },
  webServer: {
    command: 'pnpm --filter corporate-slides-studio run dev:webview',
    url: `http://localhost:${port}/harness.html`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
