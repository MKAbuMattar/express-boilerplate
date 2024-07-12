import {type UserConfig, defineConfig} from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

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
