import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'tests/integration/**/*.test.ts', 'tests/visual/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 300_000,
    // pptxgenjs-plus loads Node built-ins through `Function('return import(s)')`, which only works when
    // Node itself loads the module (not inlined in Vitest's module runner).
    server: { deps: { external: [/pptxgenjs-plus/] } },
  },
});
