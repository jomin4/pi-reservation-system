# 2026-09-14 — 앱이 `Property 'MessageEvent' doesn't exist` 로 뜨다 죽는다 (MSW)

| | |
|---|---|
| 상태 | ⚠️ **미해결 — 방향 전환.** MSW 를 버리고 자체 `fetch` 인터셉터로 간다 (#91) |
| 트랙 | mobile |
| 관련 | `api.md` §7.2 · PR #90(잘못된 결론) · #81 |

## 증상

에뮬레이터에서 앱이 **첫 화면도 못 그리고** 죽는다.

```
Uncaught Error
Property 'MessageEvent' doesn't exist

Call Stack
  <global>  src/mocks/handlers.ts:1
  <global>  src/mocks/enable.ts
  <global>  app/_layout.tsx
```

`MessageEvent` 를 shim 으로 채우면 **다음이 나온다.**

```
ERROR  [ReferenceError: Property 'BroadcastChannel' doesn't exist]
```

## 환경

| 항목 | 값 |
|---|---|
| 재현 | **항상** — `EXPO_PUBLIC_API_MODE=mock` 이면 |
| 엔진 | **Hermes** (Expo Go · Android 17 · `Pixel_7`) |
| `msw` | 2.15.0 (`msw/native`) |
| ⚠️ Jest 에서는 | **통과한다** — 아래 |

## 원인

`msw` 와 `@mswjs/interceptors` 는 **모듈 평가 시점에 Web API 를 참조**한다. Hermes 에는 그게 없다.

라이브러리가 참조하는 것들 (`lib/` 기준 파일 수)

| API | 참조 파일 |
|---|---|
| `WebSocket` | 120 |
| `Blob` | 34 |
| `ReadableStream` · `queueMicrotask` | 30 |
| `MessageEvent` | 22 |
| `TransformStream` | 16 |
| `DecompressionStream` | 14 |
| **`BroadcastChannel`** | **12** |
| `EventSource` | 8 |

**RN 이 주는 것(`Blob` · `FormData` · `WebSocket` · `AbortSignal`)도 있지만 스트림 계열과 워커 계열은 없다.** 하나 채우면 다음이 나오는 구조다.

### ⚠️ Jest 가 왜 못 잡았나 — 이 문서의 핵심

| | 엔진 | `MessageEvent` |
|---|---|---|
| `jest-expo` | **Node** | ✅ 있다 |
| 실기기·에뮬레이터 | **Hermes** | ❌ 없다 |

> **`jest-expo` 는 RN 의 모듈 해석 규칙과 mock 을 흉내 내지만 JS 엔진은 Node 다.** 그래서 "RN 환경에서 검증했다" 가 **"Hermes 에서 된다" 를 뜻하지 않는다.**

**PR #90 은 이 차이를 알고도 결론을 앞질렀다.** `api.md` §7.2 에 확인 범위를 이렇게 적어뒀었다.

| | |
|---|---|
| ✅ 확인함 | `msw/native` 가 앱의 `fetch` 를 가로챈다 |
| ⬜ **아직** | **Hermes 실기기·에뮬레이터** |

**그 `⬜` 가 정확히 문제였는데 결론 문장은 「`msw/native` 로 간다」 였다.** 나눠 적은 것까지는 맞았고, **그 위에서 단정한 게 틀렸다.**

## 해결 — 안 한다. 방향을 바꾼다

| 안 | 판정 |
|---|---|
| 폴리필을 쌓는다 | ❌ **끝을 모른다.** `MessageEvent` → `BroadcastChannel` → 스트림 계열. `TransformStream` 은 stub 으로 안 된다 |
| RN 용 msw 포크 | ❌ 유지보수 대상이 하나 는다 |
| **자체 `fetch` 인터셉터** | ✅ **채택** (#91) |

**버리는 것과 지키는 것을 가른다.**

| | |
|---|---|
| 버린다 | WebSocket 목 · 워커 브로드캐스트 · 스트림 응답 — **우리가 안 쓴다** |
| **지킨다** | **앱이 진짜 `fetch` 를 부른다** · `status`·`delay` 조작 · 핸들러만 빼면 꺼진다 (`api.md` §7.2) |
| 그대로 쓴다 | `fixtures.ts` · `scenario.ts` · 핸들러 **로직** |

> **SSE 목은 애초에 필요 없었다.** `api.md` §7.4 가 「SSE 는 인터페이스로 감싼다」 로 이미 정해뒀고, 가짜 구현은 `FakeSeatEvents` 다 — **`ReadableStream` 이 없어도 된다.**

## 막다른 길

| 시도 | 결과 |
|---|---|
| `MessageEvent` shim 추가 | ⚠️ **통과하고 `BroadcastChannel` 에서 다시 막힌다** |
| `msw` 를 함수 안 `require` 로 늦춘다 | ❌ **시점 문제가 아니다.** 평가되는 순간 똑같이 없다 |
| `transformIgnorePatterns` 계열 의심 | ❌ 그건 **Jest** 문제였다. 여기는 런타임 엔진 문제 |
| Jest 로 재현 시도 | ❌ **Node 라 재현 자체가 안 된다.** 이 증상은 에뮬레이터에서만 보인다 |

## 재발 방지

| 조치 | 위치 | 상태 |
|---|---|---|
| **`api.md` §7.2 결론 정정** | `docs/api.md` | ✅ PR #91 |
| **에뮬레이터를 띄운 채 작업한다** | `mobile/CLAUDE.md` 「개발 루프」 | ✅ PR #91 |
| 자체 인터셉터로 교체 | `mobile/src/mocks/` | 🔄 #91 후속 |

> ⚠️ **「Jest 초록」 을 「동작한다」 로 읽지 않는다.** 모바일에서 엔진이 다르면 **없는 전역도 다르다.** 런타임 의존이 있는 결론은 **에뮬레이터에서 한 번 보고** 적는다.
