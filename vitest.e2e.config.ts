import { defineConfig } from 'vitest/config';

// Yavaş uçtan uca testler: Vite demo + Playwright Chromium. `npm run test:e2e` ile çalışır.
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.e2e.test.ts', 'tests/e2e/**/*.e2e.test.ts'],
    environment: 'node',
    env: { REWIND_E2E: '1' },
    testTimeout: 180_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
