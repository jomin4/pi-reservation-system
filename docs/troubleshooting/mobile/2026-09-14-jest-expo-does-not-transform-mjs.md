# 2026-09-14 — `msw` 를 import 하면 `Cannot use import statement outside a module` 로 죽는다

| | |
|---|---|
| 상태 | **해결** — `transformIgnorePatterns` + **`transform` 에 `.mjs` 추가** |
| 트랙 | mobile |
| 관련 | `mobile/jest.config.js` · PR #90 |

## 증상

`msw/native` 를 쓰는 테스트가 **첫 줄에서** 죽는다.

```
    .../rettime@0.11.11/node_modules/rettime/build/index.mjs:1
    ({"Object.<anonymous>":function(module,exports,require,__dirname,__filename,jest){import { LensList } from "./lens-list.mjs";
                                                                                      ^^^^^^

    SyntaxError: Cannot use import statement outside a module

    > 1 | import { setupServer } from 'msw/native'
```

## 환경

| 항목 | 값 |
|---|---|
| 재현 | **항상** |
| `jest-expo` | 57.0.5 (`jest` 29.7.0) |
| 패키지 매니저 | **`pnpm`** — 이게 절반이다 |

## 원인 — 함정이 **둘** 겹쳐 있다

### 1. pnpm 의 이중 중첩

jest-expo 의 기본 패턴은 `.pnpm` 을 통과시킨다.

```
/node_modules/(?!(.pnpm|react-native|@react-native|…|standard-navigation))
```

그런데 pnpm 의 실제 경로에는 **`node_modules` 가 두 번** 나온다.

```
node_modules/.pnpm/rettime@0.11.11/node_modules/rettime/build/index.mjs
              ↑ 통과                  ↑ 여기서 다시 걸린다
```

두 번째 `/node_modules/` 뒤가 `rettime` 인데 허용 목록에 없다 → **변환 제외**.

### 2. ⚠️ 그리고 `transformIgnorePatterns` 를 고쳐도 안 된다

**변환기 자체가 `.mjs` 를 안 맡는다.**

```js
require('jest-expo/jest-preset').transform
// { '\\.[jt]sx?$': [babel-jest, …], … }   ← .mjs 가 없다
```

`rettime` 은 `build/index.mjs` 로 배포된다. **제외 목록에서 빼줘도 붙을 변환기가 없어서** 원문 그대로 들어온다.

> **여기서 시간을 썼다.** 1번만 고치고 같은 에러가 그대로 나서 **패턴을 계속 의심했다.** 두 관문이 직렬로 있고 **에러 메시지는 둘 다 똑같다.**

## 해결

둘 다 고친다. 그리고 **jest-expo 의 목록을 손으로 베끼지 않는다** — 프리셋에서 읽어 덧붙인다.

```js
const expoPreset = require('jest-expo/jest-preset')

const [allowList, ...otherPatterns] = expoPreset.transformIgnorePatterns
const withMsw = allowList.replace(/\)\)$/, `|${MSW_ESM_DEPS.join('|')}))`)

const jsTransformer = expoPreset.transform['\\.[jt]sx?$']

module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [withMsw, ...otherPatterns],
  transform: { ...expoPreset.transform, '\\.mjs$': jsTransformer },
}
```

⚠️ **모양이 바뀌면 조용히 넘어가지 않게 던진다.**

```js
if (withMsw === allowList) throw new Error('jest-expo 의 패턴 모양이 바뀌었다…')
if (jsTransformer === undefined) throw new Error('jest-expo 의 transform 키가 바뀌었다…')
```

## 막다른 길

| 시도 | 결과 |
|---|---|
| `preset` 을 펼치고 `{...expoPreset, setupFiles: [...]}` | ❌ **`__DEV__ is not defined`.** 프리셋의 `setupFiles` 를 덮어쓴다. `preset:` 으로 두면 Jest 가 **앞에 이어붙인다** |
| 허용 목록을 손으로 베껴 쓴다 | ⚠️ 동작은 한다. 하지만 **jest-expo 가 항목을 늘리면 조용히 어긋난다** |
| `msw` 만 허용 목록에 넣는다 | ❌ **끌려오는 ESM 의존이 20개쯤 된다** — `rettime` · `until-async` · `outvariant` · `@open-draft/*` … |
| `transformIgnorePatterns` 만 고친다 | ❌ **2번 함정에 그대로 걸린다.** 같은 에러가 나서 1번을 다시 의심하게 된다 |

## 재발 방지

| 조치 | 위치 | 상태 |
|---|---|---|
| 프리셋에서 읽어 덧붙이고, 모양이 바뀌면 던진다 | `mobile/jest.config.js` | ✅ PR #90 |

> **ESM 전용 의존을 새로 들일 때 같은 자리에서 또 막힌다.** `MSW_ESM_DEPS` 배열에 이름을 추가하면 된다 — **패턴을 다시 설계할 필요는 없다.**
