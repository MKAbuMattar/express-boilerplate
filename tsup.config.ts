import {defineConfig} from 'tsup';
import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

const tsupConfig = defineConfig({
  entry: ['./src/**/*.ts'],
  splitting: true,
  sourcemap: true,
  clean: true,
  dts: false,
  treeshake: true,
  shims: true,
  format: ['esm'],
  minify: isProduction ? 'terser' : false,
});

export default tsupConfig;
