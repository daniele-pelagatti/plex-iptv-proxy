import simpleImportSort from 'eslint-plugin-simple-import-sort'
import unusedImports from 'eslint-plugin-unused-imports'
import neoStandard, { plugins } from 'neostandard'

/** @type {import('eslint').Linter.Config[]} */
const config = [
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,cts,tsx,js,mjs,cjs}'],
  },
  {
    name: 'app/files-to-ignore',
    ignores: [
      'node_modules/**/*',
      '.vscode/**/*',
      'bin/**/*',
      'data/**/*'
    ]
  },
  ...neoStandard({ ts: true }),
  ...plugins['typescript-eslint'].configs['strictTypeChecked'], // this can be relaxed with recommendedTypeChecked below
  // ...plugins['typescript-eslint'].configs['recommendedTypeChecked'],

  {
    name: 'app/settings',
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.mjs', '*.cjs']
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports
    },
    rules: {
      // https://github.com/lydell/eslint-plugin-simple-import-sort/#usage
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'sort-imports': 'off',
      'import/order': 'off',

      // Ideally we should keep these commented, uncomment if too much trouble
      // '@typescript-eslint/no-unsafe-member-access': 'off',
      // '@typescript-eslint/no-unsafe-assignment': 'off',
      // '@typescript-eslint/no-unsafe-call': 'off',
      // '@typescript-eslint/no-unsafe-argument': 'off',
      // '@typescript-eslint/no-unsafe-return': 'off',
      // '@typescript-eslint/no-unsafe-enum-comparison': 'off',
      // '@typescript-eslint/no-explicit-any': 'off',
      // '@typescript-eslint/restrict-template-expressions': 'off',

      // https://github.com/sweepline/eslint-plugin-unused-imports
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': ['error', { vars: 'all', args: 'none', caughtErrors: 'none' }]
    },
  }
]

export default config
