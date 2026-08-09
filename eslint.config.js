const js = require('@eslint/js');
const eslintConfigPrettier = require('eslint-config-prettier');
const globals = require('globals');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.turbo/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  eslintConfigPrettier,
);
