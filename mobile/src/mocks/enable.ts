import { API_MODE } from '../config/env'
import { handlers } from './handlers'
import { startIntercept } from './intercept'
import { getScenario, initScenario } from './scenario'

/**
 * `EXPO_PUBLIC_API_MODE` 하나로 켜고 끈다 (`api.md` §7.2).
 *
 * > **앱 코드는 그대로다.** 화면은 진짜 `fetch` 를 호출하고 인터셉터가 그걸 가로챈다.
 * > 끌 때는 안 켜면 그만이고, **코드 경로가 바뀌지 않는다.**
 *
 * ⚠️ **웹과 가로채는 방식이 다르다.**
 *
 * | | 가로채는 것 |
 * |---|---|
 * | 브라우저 (`msw/browser`) | 진짜 Service Worker |
 * | **RN** | **전역 `fetch` 를 한 겹 감싼다** — `msw` 는 Hermes 에서 안 돈다 (#91) |
 *
 * ⚠️ **첫 요청보다 먼저 불러야 한다.** 인터셉터가 뜨기 전에 나간 요청은 그것만
 *    진짜 네트워크로 샌다. `app/_layout.tsx` 가 렌더 전에 동기적으로 부른다.
 */

let started = false

export function enableMocking(): void {
  if (API_MODE !== 'mock') return
  if (started) return

  const scenario = initScenario()
  startIntercept(handlers)
  started = true

  console.info(
    `[mock] 목 API 가 켜졌다. 시나리오: ${scenario}\n` +
      `       바꾸려면 .env 의 EXPO_PUBLIC_MOCK_SCENARIO — 목록은 src/mocks/scenario.ts`,
  )
}

export { getScenario }
