import tsconfigPaths from 'vite-tsconfig-paths';
import {defineConfig, type UserConfig} from 'vitest/config';

const viteConfig: UserConfig = defineConfig({
  test: {
    coverage: {
      include: ['src/**'],
      exclude: [
        '**/node_modules/**',
        '**/bin/*.ts',
        '**/schemas/*',
        '**/types/*',
        '**/server.ts',
      ],
    },
    globals: true,
    restoreMocks: true,
  },
  plugins: [tsconfigPaths()],
}) satisfies UserConfig;

export default viteConfig;
