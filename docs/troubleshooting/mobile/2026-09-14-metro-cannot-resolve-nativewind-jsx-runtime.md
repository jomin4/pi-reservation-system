# 2026-09-14 — `Unable to resolve "react-native-css-interop/jsx-runtime"` 로 번들이 실패한다

| | |
|---|---|
| 상태 | **해결** — `react-native-css-interop` 을 **직접 의존으로** 선언 |
| 트랙 | mobile |
| 관련 | `tech.md` 모바일 표 · PR #91 |

## 증상

에뮬레이터를 처음 띄우자 **번들 단계에서** 죽는다.

```
Android Bundling failed 34986ms  expo-router/entry.js (1696 modules)
Unable to resolve "react-native-css-interop/jsx-runtime" from "app\index.tsx"

> 1 | import { Text, View } from 'react-native'

Import stack:
 app\index.tsx
 | import "react-native-css-interop/jsx-runtime"
```

⚠️ **`app/index.tsx` 에는 그런 import 가 없다.** 에러가 가리키는 줄은 `react-native` import 다.

## 환경

| 항목 | 값 |
|---|---|
| 재현 | **항상** — 첫 번들부터 |
| 패키지 매니저 | **`pnpm`** — 이게 원인의 절반 |
| `nativewind` | 4.2.6 |

⚠️ **이 시점에 정적 검사 4종은 전부 초록이었다.**

| 검사 | 결과 |
|---|---|
| `tsc --noEmit` | ✅ |
| `eslint .` | ✅ |
| `jest` | ✅ 24건 |
| `expo-doctor` | ✅ 21/21 |

> **앱은 뜨지도 않는데 넷 다 통과한다.** 넷 중 **번들러를 돌리는 건 하나도 없다.**

## 원인

`babel.config.js` 가 JSX 를 NativeWind 런타임으로 돌린다.

```js
presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel']
```

그러면 **모든 `.tsx` 가 컴파일 결과에 이 import 를 갖는다.**

```
import "react-native-css-interop/jsx-runtime"
```

`react-native-css-interop` 은 `nativewind` 의 의존이지 **우리 의존이 아니다.** npm 이면 호이스팅돼서 앱 최상단에서도 보이는데, **pnpm 은 선언하지 않은 패키지를 앱에 노출하지 않는다.**

```bash
$ ls node_modules | grep -c react-native-css-interop
0
$ node -e "require.resolve('react-native-css-interop/package.json')"
MODULE_NOT_FOUND
```

> **pnpm 의 엄격함이 의도대로 동작한 결과다.** 버그가 아니라 **선언하지 않은 걸 쓰고 있었다** — babel 이 우리 대신 쓰고 있었을 뿐.

## 해결

**우리 코드가 실제로 import 하므로 우리 의존이다.** 선언한다.

```diff
   "dependencies": {
+    "react-native-css-interop": "0.2.6",
     "nativewind": "4.2.6",
```

버전은 `nativewind@4.2.6` 이 물고 있는 값과 같게 둔다 — 두 벌이 깔리면 스타일 레지스트리가 갈린다.

## 막다른 길

| 시도 | 결과 |
|---|---|
| `app/index.tsx` 의 import 를 본다 | ❌ **거기엔 없다.** babel 이 넣은 것 |
| `tailwind.config.js` · `metro.config.js` 의심 | ❌ 설정 문제가 아니다. **해석 문제** |
| `.npmrc` 에 `node-linker=hoisted` | ⚠️ 동작은 한다. 하지만 **pnpm 의 격리를 통째로 버린다** — 같은 증상이 다른 패키지에서 또 나면 그때 다시 본다 |
| `pnpm approve-builds` | ❌ 무관. 빌드 스크립트가 아니라 해석이다 |

## 재발 방지

| 조치 | 위치 | 상태 |
|---|---|---|
| 직접 의존으로 선언 | `mobile/package.json` | ✅ PR #91 |
| **번들을 실제로 돌려 보는 절차** | `mobile/CLAUDE.md` 「개발 루프」 | ✅ PR #91 |

> ⚠️ **`expo-doctor` 는 번들러를 돌리지 않는다.** 버전 정합성만 본다 (`deploy.md` §8.1 이 "CI 에서 앱을 빌드하지 않는다" 고 정한 대가다). **해석 오류는 에뮬레이터에서만 드러난다.**
>
> **babel 이 넣는 import 는 전부 이 위험을 갖는다.** `jsxImportSource` 처럼 런타임 패키지를 주입하는 설정을 켤 때는 **그 패키지를 직접 의존으로 선언했는지** 먼저 본다.
