# 2026-09-12 — `eslint-config-expo` 의 peer 가 `>=8.10` 인데 실제로는 9 까지다

| | |
|---|---|
| 상태 | **해결** — `eslint` 를 **9.39.5** 로 내렸다 |
| 트랙 | mobile |
| 관련 | `tech.md` §프론트 계열 「버전 고정」 모바일 표 · PR #79 |

## 증상

모바일 스캐폴드에서 `pnpm run lint` 가 **규칙 하나도 검사하지 못하고** 죽는다.

```
Oops! Something went wrong! :(

ESLint: 10.10.0

TypeError: Error while loading rule 'react/display-name': contextOrFilename.getFilename is not a function
Occurred while linting .../mobile/app/index.tsx
    at resolveBasedir (.../eslint-plugin-react/lib/util/version.js:31:100)
    at detectReactVersion (.../eslint-plugin-react/lib/util/version.js:85:19)
    at getReactVersionFromContext (.../eslint-plugin-react/lib/util/version.js:116:25)
 ELIFECYCLE  Command failed with exit code 2.
```

⚠️ **린트 실패가 아니라 린트 자체가 안 돈다.** 코드 문제로 착각하기 쉬운데 **어떤 코드를 넣어도 같은 자리에서 죽는다.**

## 환경

| 항목 | 값 |
|---|---|
| 재현 | **항상** |
| `eslint` | **10.10.0** — `tech.md` 가 웹에서 고정한 값을 모바일에도 그대로 썼다 |
| `eslint-config-expo` | 57.0.2 |
| 끌려온 `eslint-plugin-react` | 7.37.5 (2025-04-03) |

## 원인

**바깥 패키지의 peer 가 안쪽 엔진보다 느슨하다.**

```
eslint-config-expo@57.0.2
  peer: eslint >=8.10                    ← 10 을 받는 것처럼 읽힌다
  └─ eslint-plugin-react@^7.37.3 → 7.37.5
       peer: eslint ^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9.7    ← 10 이 없다
```

`eslint-plugin-react` 7.37.5 는 **2025-04-03 이 마지막 릴리스**다. ESLint 10 은 2026-09-04 에 나왔다 — **플러그인이 그 이후를 모른다.**

ESLint 10 에서 룰 컨텍스트 API 가 바뀌었는데, 플러그인은 옛 시그니처(`context.getFilename()`)를 부른다. 그래서 **React 버전을 탐지하는 첫 단계에서 터진다.**

> **`pnpm` 이 경고로 안 잡은 이유** — `eslint-config-expo` 의 peer 는 실제로 만족된다(`10 >= 8.10`). **거짓인 건 그 선언이지 설치 결과가 아니다.**

> ⚠️ **웹의 `typescript` 덫과 같은 모양이다** (`tech.md`). `typescript@latest` 가 7 인데 `typescript-eslint` peer 가 `<6.1.0` 이라 린트가 깨졌던 그것. **"최신을 깔고 peer 충돌만큼 내린다" 가 통하지 않는 경우가 있다 — peer 가 거짓일 때다.**

## 해결

`mobile/package.json` 에서 `eslint` 를 **9.39.5**(9.x 마지막 · 2026-07-10)로 내렸다.

```diff
-    "eslint": "10.10.0",
+    "eslint": "9.39.5",
     "eslint-config-expo": "57.0.2",
```

재설치 후 `pnpm run lint` 가 조용히 통과한다.

**트랙 간 버전이 갈린다 — 의도다.**

| | `eslint` |
|---|---|
| 웹 (`front/`) | **10.10.0** — `typescript-eslint` 로 직접 구성 |
| **모바일 (`mobile/`)** | **9.39.5** — `eslint-config-expo` 에 묶인다 |

> **맞추려 들지 말 것.** 올리려면 `eslint-config-expo` 가 아니라 **`eslint-plugin-react` 가 먼저 움직여야 한다.** 우리가 통제할 수 있는 지점이 아니다.

## 막다른 길

| 시도 | 결과 |
|---|---|
| `eslint-plugin-react` 를 최신으로 올린다 | ❌ **7.37.5 가 최신이다.** 더 올릴 게 없다 |
| `pnpm.overrides` 로 플러그인만 교체 | ❌ 교체할 대상이 없다. 위와 같은 이유 |
| `eslint-config-expo` 를 버리고 웹처럼 직접 구성 | ⚠️ 동작은 한다. 하지만 **`eslint-plugin-expo` 의 RN 전용 규칙을 잃는다** — 얻는 게 "웹과 같은 숫자" 뿐이다 |
| `react/display-name` 만 끈다 | ❌ **그 규칙 하나의 문제가 아니다.** `eslint-plugin-react` 의 공통 유틸(`version.js`)이 깨진 거라 다른 규칙도 같은 자리에서 죽는다 |

## 재발 방지

| 조치 | 위치 | 상태 |
|---|---|---|
| `eslint` 9.39.5 고정 | `mobile/package.json` | ✅ PR #79 |
| **트랙 간 `eslint` 가 갈린다는 사실** | `tech.md` 모바일 표 + 경고 블록 | ✅ PR #79 |
| **"ESLint 10 으로 올려 웹과 맞추기" 를 금지로** | `mobile/CLAUDE.md` | ✅ PR #79 |

> **버전 표에 `latest` 를 적을 때 peer 선언만 믿지 않는다.** `tech.md` 의 모바일 표는 이제 **실제로 설치하고 `expo-doctor` 21/21 을 통과한 값**이다. 레지스트리만 보고 적은 값과 구분해 둔다.
