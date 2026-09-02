import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['dist/**']
  },
  {
    rules: {
      quotes: ['error', 'single'],
      indent: ['error', 2, { SwitchCase: 0 }],
      'linebreak-style': ['error', 'unix'],
      semi: ['error', 'never'],
      'comma-dangle': ['error', 'never'],
      'dot-notation': 'error',
      eqeqeq: ['error', 'smart'],
      curly: ['error', 'all'],
      'brace-style': ['error'],
      'prefer-arrow-callback': 'warn',
      'max-len': ['warn', 160],
      'object-curly-spacing': ['error', 'always'],
      'no-use-before-define': 'on',
      '@typescript-eslint/no-use-before-define': ['error', { classes: true, enums: true }],
      '@typescript-eslint/no-unused-vars': ['error', { caughtErrors: 'all' }]
    }
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module'
    }
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended
)
