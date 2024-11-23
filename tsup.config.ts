import dotenv from 'dotenv';
import {defineConfig} from 'tsup';

dotenv.config();

const tsupConfig = defineConfig({
  entry: ['src', '!src/**/__tests__/**', '!src/**/*.test.*'],
  sourcemap: false,
  clean: true,
  minify: true,
  format: ['esm'],
  skipNodeModulesBundle: true,
});

export default tsupConfig;
