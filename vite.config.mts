import {type UserConfig, defineConfig} from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

const viteConfig: UserConfig = defineConfig({
  test: {
    coverage: {
      exclude: ['**/node_modules/**', '**/index.ts'],
    },
    globals: true,
    restoreMocks: true,
  },
  plugins: [tsconfigPaths()],
}) satisfies UserConfig;

export default viteConfig;
