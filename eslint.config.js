const js = require('@eslint/js');
const eslintConfigPrettier = require('eslint-config-prettier');
const globals = require('globals');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.turbo/**', '**/.next/**', '**/.next-dev/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Node-flavored plain-JS files (repo scripts, .mjs tooling).
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Browser service workers use the serviceworker global scope.
    files: ['**/public/sw.js'],
    languageOptions: {
      globals: globals.serviceworker,
    },
  },
  eslintConfigPrettier,
);
