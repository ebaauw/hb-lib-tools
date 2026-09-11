import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'
import love from 'eslint-config-love'

const ecmaVersion = 2024

export default defineConfig(
  {
    files: ['**/*.{js,ts}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.strict,
      tseslint.configs.stylistic
    ],
    ...love,
    languageOptions: {
      ecmaVersion,
      sourceType: 'module',
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js', 'cli/*.js', 'test/*.js']
        }
      }
    }
  },
  {
    ignores: ['dist/**', 'doc/**', 'test/**', 'node_modules/**']
  },
  {
    rules: {
      'brace-style': ['error', '1tbs', { allowSingleLine: true }],
      'comma-dangle': ['error', 'never'],
      complexity: ['error', { max: 20 }],
      curly: ['error', 'all'],
      'dot-notation': 'error',
      eqeqeq: ['error', 'smart'],
      indent: ['error', 2, { SwitchCase: 1 }],
      'linebreak-style': ['error', 'unix'],
      'max-len': ['warn', { code: 160 }],
      'max-lines': ['warn', { max: 1000 }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-use-before-define': 'warn',
      'object-curly-spacing': ['error', 'always'],
      'prefer-arrow-callback': 'error',
      quotes: ['error', 'single'],
      'require-unicode-regexp': 'off',
      semi: ['error', 'never'],
      '@typescript-eslint/init-declarations': 'off',
      '@typescript-eslint/no-magic-numbers': ['warn', {
        ignore: [-1, 0, 1, 2, 8, 10, 16, 0xFF, 1000, 0xFFFF], ignoreArrayIndexes: true, ignoreDefaultValues: true
      }],
      '@typescript-eslint/no-unused-vars': ['error', { caughtErrors: 'none' }],
      '@typescript-eslint/no-use-before-define': ['error', { classes: true, enums: true }],
      '@typescript-eslint/prefer-destructuring': ['error']
    }
  }
)
