import { API_MODE } from '../config/env'
import { handlers } from './handlers'
import { getScenario, initScenario } from './scenario'

/**
 * `EXPO_PUBLIC_API_MODE` 하나로 켜고 끈다 (`api.md` §7.2).
 *
 * > **앱 코드는 그대로다.** 화면은 진짜 `fetch` 를 호출하고 MSW 가 그걸 가로챈다.
 * > 끌 때는 서버를 안 띄우면 그만이고, **코드 경로가 바뀌지 않는다.**
 *
 * ⚠️ **웹과 가로채는 방식이 다르다.**
 *
 * | | 가로채는 것 |
 * |---|---|
 * | 브라우저 (`msw/browser`) | 진짜 Service Worker |
 * | **RN (`msw/native`)** | **`@mswjs/interceptors` 가 런타임에서 `XMLHttpRequest` 를 감싼다** |
 *
 * RN 에는 Service Worker 가 없다. `msw/native` 는 `setupServer` 와 같은 API 를 주되
 * 그 아래에서 XHR 인터셉터를 쓴다 — **RN 의 `fetch` 가 XHR 위에 얹혀 있기 때문에** 물린다.
 *
 * ⚠️ **첫 요청보다 먼저 불러야 한다.** 서버가 뜨기 전에 나간 요청은 그것만 진짜
 *    네트워크로 샌다. `app/_layout.tsx` 가 렌더 전에 동기적으로 부른다.
 */

let started = false

export function enableMocking(): void {
  if (API_MODE !== 'mock') return
  if (started) return

  const scenario = initScenario()

  // ⚠️ 동적 import 가 아니라 require 다. RN 에는 top-level await 가 없고,
  //    렌더보다 먼저 떠야 하므로 비동기로 만들 수 없다.
  //    Metro 는 이 require 를 정적으로 본다 — real 모드로 빌드해도 번들에는 들어간다.
  //    번들 크기보다 "코드 경로가 안 바뀐다" 가 먼저다 (`api.md` §7.2).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { setupServer } = require('msw/native') as typeof import('msw/native')

  setupServer(...handlers).listen({
    // 가로채지 않는 요청(Metro · 심볼리케이션 등)까지 경고하지 않는다
    onUnhandledRequest: 'bypass',
  })

  started = true

  console.info(
    `[msw] 목 API 가 켜졌다. 시나리오: ${scenario}\n` +
      `      바꾸려면 .env 의 EXPO_PUBLIC_MOCK_SCENARIO — 목록은 src/mocks/scenario.ts`,
  )
}

export { getScenario }
