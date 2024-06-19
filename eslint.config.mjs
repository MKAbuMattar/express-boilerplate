/** @type {import("eslint").Linter.Config} */
const eslintConfig = {
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  plugins: ['@typescript-eslint', 'simple-import-sort', 'prettier'],
  parser: '@typescript-eslint/parser',
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    'simple-import-sort/imports': 'error',
    'simple-import-sort/exports': 'error',
    'prettier/prettier': 'error',
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
};

export default eslintConfig;
