# 2026-09-14 — MSW 를 켰는데 `Cannot read properties of undefined (reading 'length')` 로 죽는다

| | |
|---|---|
| 상태 | **해결** — `globalThis.fetch` 를 **부를 때마다 읽는다** |
| 트랙 | mobile |
| 관련 | `api.md` §7.2 · `mobile/src/api/client.ts` · PR #90 |

## 증상

`msw/native` 로 목을 켜고 API 클라이언트로 요청하면 **응답 본문을 읽는 줄에서** 죽는다.

```
TypeError: Cannot read properties of undefined (reading 'length')

  137 |     const text = await res.text()
  138 |     let payload: unknown = undefined
> 139 |     if (text.length > 0) {
      |              ^
```

⚠️ **에러가 가리키는 곳과 원인이 멀다.** `client.ts` 의 본문 파싱이 틀린 것처럼 읽히지만 그 코드는 멀쩡하다. **`res.text()` 가 `undefined` 로 resolve 된다.**

`res` 자체는 멀쩡해 **보인다.**

```js
res.constructor.name   // 'FetchResponse'   ← MSW 의 Response 다. 가로채긴 했다
res.status             // undefined         ← 그런데 비어 있다
await res.text()       // undefined
```

> ⚠️ **던지지 않는다.** 요청이 실패한 것도 아니고 가로채지 못한 것도 아니다. **반쪽짜리 Response 가 정상처럼 돌아온다** — 그래서 MSW 설정을 의심하며 시간을 쓴다.

## 환경

| 항목 | 값 |
|---|---|
| 재현 | **항상** — 아래 조건이면 |
| 조건 | **`server.listen()` 보다 먼저 `fetch` 참조를 캡처**했다 |
| `msw` | 2.15.0 (`msw/native`) |
| 확인 위치 | jest-expo 환경 · `src/mocks/intercept.test.ts` |

## 원인

`client.ts` 가 클라이언트를 만들 때 전역 `fetch` 를 **붙잡아 뒀다.**

```ts
// ❌ 원인
const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
```

`api` 인스턴스는 **모듈 최상단**에서 만들어진다. 그래서 이 `bind` 는 **모듈이 로드되는 순간** 실행된다.

`msw/native` 는 **`listen()` 시점에 전역 `fetch` 를 갈아끼운다.** 순서가 이렇게 된다.

```
1. client.ts 로드   →  옛 fetch 를 bind 해서 보관
2. server.listen()  →  globalThis.fetch 가 새 구현으로 교체
3. 요청             →  보관해둔 옛 fetch 가 호출된다
```

**그런데 옛 구현도 XHR 을 탄다.** MSW 는 `fetch` 교체와 별개로 `XMLHttpRequest` 도 감싸므로 **요청 자체는 가로채진다.** 다만 그 경로로 만들어진 Response 는 MSW 가 기대하는 방식으로 채워지지 않아 **필드가 비어 있다.**

> **"가로채기 실패" 가 아니라 "가로채기 절반 성공" 이라 증상이 이상했다.** 완전히 못 가로챘으면 네트워크 에러가 났을 테고 그건 원인을 바로 가리킨다.

**재현 코드** — 캡처 시점만 다르고 나머지는 같다.

```ts
const capturedBeforeListen = globalThis.fetch.bind(globalThis)
beforeAll(() => server.listen())

it('listen 전에 bind 한 fetch', async () => {
  const res = await capturedBeforeListen('http://x.test/ping')
  // ctor: FetchResponse   status: undefined   text: undefined
})

it('listen 후에 읽은 fetch', async () => {
  const res = await globalThis.fetch('http://x.test/ping')
  // ctor: FetchResponse   text: '{"ok":1}'
})
```

## 해결

**붙잡지 않고 부를 때마다 읽는다.**

```diff
-const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis)
+const doFetch: typeof globalThis.fetch =
+  options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init))
```

`fetchImpl` 주입 경로는 그대로 둔다 — 단위 테스트는 계속 갈아끼운다.

> ⚠️ **웹(`front`)에는 이 문제가 없다.** `msw/browser` 는 Service Worker 로 **네트워크 계층 바깥**에서 가로채므로 전역 `fetch` 를 건드리지 않는다. **같은 코드가 웹에서는 돌고 모바일에서만 깨진다.**

## 막다른 길

| 시도 | 결과 |
|---|---|
| `transformIgnorePatterns` 를 더 늘린다 | ❌ **다른 문제였다.** 그건 `SyntaxError` 를 냈고 이건 `undefined` 다 (별도 문서) |
| `onUnhandledRequest: 'error'` 로 바꿔 본다 | ❌ **경고가 안 뜬다.** 요청은 핸들러에 도달하고 있다 — 그래서 더 헷갈렸다 |
| `HttpResponse.json` 대신 `new Response` | ❌ 핸들러 쪽 문제가 아니다. 같은 핸들러가 `globalThis.fetch` 로 부르면 정상 |
| `res.json()` 으로 바꿔 본다 | ❌ 그것도 `undefined`. **Response 전체가 비어 있다** |
| `server.listen()` 을 `beforeAll` 밖 모듈 최상단으로 올린다 | ⚠️ **테스트에서는 통한다.** 하지만 앱에서는 import 순서에 기대는 것이라 **언젠가 다시 터진다** |

## 재발 방지

| 조치 | 위치 | 상태 |
|---|---|---|
| 호출 시점에 `fetch` 를 읽는다 | `mobile/src/api/client.ts` | ✅ PR #90 |
| **가로채는지를 실제로 검증하는 테스트** | `mobile/src/mocks/intercept.test.ts` | ✅ PR #90 |
| "전역을 모듈 로드 시점에 캡처하지 않는다" 를 금지로 | `mobile/CLAUDE.md` | ✅ PR #90 |

> ⚠️ **`intercept.test.ts` 는 `fetchImpl` 을 주입하지 않는다.** 주입하면 MSW 를 건너뛰고 테스트만 통과한다 — **확인하려던 것을 피해 가는 셈**이다. 이 테스트가 다시 깨지면 그게 이 문제가 돌아온 신호다.
