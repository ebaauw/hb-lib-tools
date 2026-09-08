import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import love from 'eslint-config-love'

export default [
  {
    ...love,
    files: ['**/*.ts', '**/*.js'],
  },
  {
    ignores: ['dist/**', 'doc/**', 'test/**', 'node_modules/**']
  },
  {
    rules: {
      quotes: ['error', 'single'],
      indent: ['error', 2, { SwitchCase: 1 }],
      'linebreak-style': ['error', 'unix'],
      semi: ['error', 'never'],
      'comma-dangle': ['error', 'never'],
      complexity: ['error', { max: 20 }],
      'dot-notation': 'error',
      eqeqeq: ['error', 'smart'],
      curly: ['error', 'all'],
      'brace-style': ['error', '1tbs', { allowSingleLine: true }],
      'prefer-arrow-callback': 'warn',
      'max-len': ['warn', 160],
      'object-curly-spacing': ['error', 'always'],
      'no-use-before-define': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/method-signature-style': ['error', 'method'],
      '@typescript-eslint/no-magic-numbers': ['error', { ignore: [-1, 0, 1], ignoreArrayIndexes: true, ignoreDefaultValues: true }],
      '@typescript-eslint/no-unused-vars': ['error', { caughtErrors: 'none' }],
      '@typescript-eslint/no-use-before-define': ['error', { classes: true, enums: true }]
    }
  },
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module'
    }
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended
]
