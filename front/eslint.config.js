import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // ⚠️ 생성물은 검사하지 않는다. mockServiceWorker.js 는 `msw init` 이 만든다
  { ignores: ['dist', 'coverage', 'public/mockServiceWorker.js', 'src/api/schema.d.ts'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // ⚠️ 테스트와 테스트 헬퍼는 HMR 그래프에 없다. fast refresh 규칙이 의미가 없고,
    //    끄지 않으면 헬퍼를 쪼개려고 파일만 늘어난다
    files: ['**/*.test.{ts,tsx}', 'src/test/**'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
)
