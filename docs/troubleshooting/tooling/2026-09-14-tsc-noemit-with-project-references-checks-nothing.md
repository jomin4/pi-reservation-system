# 2026-09-14 — `tsc --noEmit` 이 **파일을 한 개도 검사하지 않고** 통과한다

| | |
|---|---|
| 상태 | **미해결** — ⚠️ **`front` 트랙에서 발생 중.** 발견은 mobile, 고칠 곳은 front (아래 「재발 방지」) |
| 트랙 | tooling |
| 관련 | `front/tsconfig.json` · `.github/workflows/front-ci.yml` · `deploy.md` §7 |

## 증상

**타입 에러가 있는 코드가 CI 를 통과한다.**

`front/src/mocks/fixtures.ts` 가 존재하지 않는 스키마 이름을 참조하고 있었다.

```ts
type S = components['schemas']

export const stations: S['StationList'] = { … }   // ← StationList 는 없다
export const trips:    S['TripList']    = { … }   // ← TripList 도 없다
```

계약이 주는 실제 이름은 `StationListResponse` · `TripListResponse` 다. **`front-ci` 는 이걸 통과시켰다.**

> **mobile 이 그 파일을 복사해 오면서 드러났다.** 같은 코드가 mobile 의 `tsc` 에서는 즉시 6건으로 잡혔다.

```
error TS2339: Property 'StationList' does not exist on type '{ StationCode: string; … }'
```

## 환경

| 항목 | 값 |
|---|---|
| 재현 | **항상** |
| 검사 명령 | `pnpm exec tsc --noEmit` (`front-ci.yml`) |
| `typescript` | 5.9.3 |

## 원인

`front/tsconfig.json` 은 **솔루션 파일**이다. 자기가 검사할 파일이 없다.

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]
}
```

> ⚠️ **`references` 는 `tsc --build` 에서만 따라간다.** `tsc --noEmit` 은 참조를 무시하고 **`files: []` 그대로** — 즉 **검사 대상이 0개**다.

에러가 없으니 **exit 0** 이고, CI 는 초록이 된다.

**확인** — mobile 의 `tsc` 로 front 설정을 겨눠 봤다.

```
$ tsc --noEmit -p ../front/tsconfig.json
EXIT=0

$ tsc -p ../front/tsconfig.json --listFiles --noEmit | wc -l
0
```

> **0개다.** 「검사했는데 에러가 없다」 가 아니라 **「검사하지 않았다」** 였다.

⚠️ **`front-ci.yml` 의 주석이 이 단계를 이렇게 설명하고 있다.**

> Pages 는 vite build 를 돌리는데 vite build 는 타입 체크를 하지 않는다. Pages 빌드가 통과해도 타입 에러가 프로덕션에 나갈 수 있다 — **`tsc --noEmit` 이 이 워크플로의 존재 이유다.**

**그 존재 이유가 무효인 상태다.**

## 해결 (제안 — front 트랙이 판단할 것)

| 안 | 명령 | 비고 |
|---|---|---|
| **A** | `tsc -b --noEmit` (또는 `tsc --build`) | 참조를 따라간다. **한 글자 차이** |
| B | `tsc --noEmit -p tsconfig.app.json` | 명시적. 다만 `tsconfig.node.json` 은 여전히 안 본다 |
| C | 솔루션 구조를 버리고 단일 `tsconfig.json` | 가장 크게 손댄다 |

> **A 가 가장 싸 보인다.** 다만 `tsc -b` 는 `.tsbuildinfo` 를 만들고 `noEmit` 과의 조합에 버전별 차이가 있어 **front 세션이 실제로 돌려 보고 정해야 한다.**

⚠️ **고치면 `fixtures.ts` 의 타입 에러 6건이 한꺼번에 드러난다.** 같은 PR 에서 이름을 맞춰야 한다 — mobile 이 쓴 이름이 참고가 된다.

| 잘못된 이름 | 실제 |
|---|---|
| `StationList` | `StationListResponse` |
| `TripList` | `TripListResponse` |
| `SeatMap` | `SeatMapResponse` |
| `ReservationDetail` | `Reservation` |
| `MeResponse` | `MemberProfile` |
| `TokenResponse` | `TokenPair` |

## 막다른 길

| 시도 | 결과 |
|---|---|
| mobile 의 `schema.d.ts` 가 낡았나 확인 | ❌ **두 트랙의 `schema.d.ts` 는 바이트 단위로 같다.** 계약이 아니라 참조 이름이 틀린 것 |
| front 가 다른 openapi 로 생성했나 | ❌ 같은 파일에서 생성한다. CI 가 `diff` 로 잠근다 |
| mobile 의 `tsconfig` 가 더 엄격한가 | ⚠️ 더 엄격하긴 하다. **하지만 `TS2339` 는 엄격도와 무관하다** — 없는 속성이다 |

## 재발 방지

| 조치 | 위치 | 상태 |
|---|---|---|
| **`tsc` 가 파일을 실제로 검사하게 한다** | `.github/workflows/front-ci.yml` · `front/tsconfig.json` | 🔄 **front 세션이** |
| `fixtures.ts` 의 스키마 이름 정정 | `front/src/mocks/fixtures.ts` | 🔄 **front 세션이** |
| mobile 은 단일 `tsconfig.json` + `include` | `mobile/tsconfig.json` | ✅ 해당 없음 |

> ⚠️ **mobile 세션이 front 를 대신 고치지 않는다** (`workflow.md` §1.3). `back` 도 `back/tsconfig` 는 없지만 **Gradle 쪽에 같은 모양의 함정이 있는지는 그 트랙이 볼 일**이다.

### 다른 트랙 세션이 할 일

| # | |
|---|---|
| 1 | **검사 대상이 0개가 아닌지 확인한다** — `tsc -p <config> --listFiles \| wc -l` |
| 2 | 위 표의 **자기 줄을 ✅ 로** 바꾼다 |

> **"CI 가 초록이다" 와 "검사했다" 는 다른 말이다.** 검사 단계를 새로 넣을 때 **일부러 깨뜨려 빨개지는지** 한 번 보는 게 이 문서의 교훈이다.
