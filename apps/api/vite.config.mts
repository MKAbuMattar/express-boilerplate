import {defineConfig} from 'vitest/config';

// One project per test type: pnpm test:<name>, or pnpm test for all of them.
// The `source` condition loads workspace packages from src, so a change in a
// package is tested without rebuilding its dist.
export default defineConfig({
  resolve: {conditions: ['source']},
  ssr: {resolve: {conditions: ['source']}},
  test: {
    environment: 'node',
    restoreMocks: true,
    coverage: {include: ['src/**'], exclude: ['src/main.ts']},
    projects: [
      {
        extends: true,
        test: {name: 'unit', include: ['test/unit/**/*.test.ts']},
      },
      {
        extends: true,
        test: {name: 'integration', include: ['test/integration/**/*.test.ts']},
      },
      {
        extends: true,
        test: {
          name: 'containers',
          include: ['test/containers/**/*.test.ts'],
          testTimeout: 120_000,
          hookTimeout: 240_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['test/e2e/**/*.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'monkey',
          include: ['test/monkey/**/*.test.ts'],
          testTimeout: 120_000,
        },
      },
      {
        extends: true,
        test: {name: 'security', include: ['test/security/**/*.test.ts']},
      },
      {
        extends: true,
        test: {
          name: 'chaos',
          include: ['test/chaos/**/*.test.ts'],
          testTimeout: 30_000,
        },
      },
    ],
  },
});
