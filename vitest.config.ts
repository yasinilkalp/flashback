import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'packages/*/test/**/*.test.tsx', 'tests/*.test.ts'],
    exclude: ['**/node_modules/**', '**/*.e2e.test.ts'],
    environment: 'node',
  },
});
