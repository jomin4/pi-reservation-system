const expoPreset = require('jest-expo/jest-preset')

/**
 * ⚠️ `transformIgnorePatterns` 를 손본 이유 — pnpm 의 이중 중첩 때문이다.
 *
 * jest-expo 의 기본 패턴은 `.pnpm` 을 통과시킨다. 그런데 pnpm 의 실제 경로는
 * `node_modules/.pnpm/rettime@0.11.11/node_modules/rettime/...` 로 **`node_modules` 가
 * 두 번** 나온다. 두 번째 것이 허용 목록에 없는 이름과 만나 다시 걸린다.
 *
 * 그래서 `msw` 가 끌어오는 ESM 전용 패키지가 변환되지 않고 그대로 들어와 죽었다.
 *
 * ```
 * SyntaxError: Cannot use import statement outside a module
 *   at .../rettime/build/index.mjs:1
 * ```
 *
 * ⚠️ **jest-expo 의 목록을 손으로 베끼지 않는다.** 프리셋에서 읽어 뒤에 덧붙인다 —
 *    베껴두면 jest-expo 가 항목을 늘릴 때 조용히 어긋난다.
 */
const MSW_ESM_DEPS = [
  'msw',
  '@mswjs',
  '@open-draft',
  '@bundled-es-modules',
  '@inquirer',
  'rettime',
  'until-async',
  'outvariant',
  'strict-event-emitter',
  'headers-polyfill',
  'is-node-process',
  'graphql',
  'tough-cookie',
  'statuses',
  'path-to-regexp',
  'cookie',
  'type-fest',
  'picocolors',
  'yargs',
]

const [allowList, ...otherPatterns] = expoPreset.transformIgnorePatterns
const withMsw = allowList.replace(/\)\)$/, `|${MSW_ESM_DEPS.join('|')}))`)

if (withMsw === allowList) {
  throw new Error(
    'jest-expo 의 transformIgnorePatterns 모양이 바뀌었다. jest.config.js 를 다시 본다.',
  )
}

/**
 * ⚠️ 두 번째 함정 — 변환 대상에 `.mjs` 가 없다.
 *
 * jest-expo 의 `transform` 키는 `\.[jt]sx?$` 라 `.js` `.jsx` `.ts` `.tsx` 만 잡는다.
 * `rettime` 은 `build/index.mjs` 로 배포돼서 **변환기가 아예 안 붙고** 원문 그대로
 * 들어온다. `transformIgnorePatterns` 를 아무리 고쳐도 안 되는 이유가 이것이었다.
 *
 * 같은 babel 변환기를 `.mjs` 에도 붙인다.
 */
const jsTransformer = expoPreset.transform['\\.[jt]sx?$']

if (jsTransformer === undefined) {
  throw new Error('jest-expo 의 transform 키가 바뀌었다. jest.config.js 를 다시 본다.')
}

module.exports = {
  // ⚠️ preset 을 펼치지 않고 그대로 쓴다. 펼친 뒤 setupFiles 를 지정하면
  //    프리셋의 setupFiles 를 덮어써서 `__DEV__ is not defined` 로 죽는다.
  //    `preset` 으로 두면 Jest 가 앞에 이어붙인다.
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  transformIgnorePatterns: [withMsw, ...otherPatterns],
  transform: {
    ...expoPreset.transform,
    '\\.mjs$': jsTransformer,
  },
}
