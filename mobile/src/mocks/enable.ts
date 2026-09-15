import { API_MODE } from '../config/env'
import { getScenario, initScenario } from './scenario'

/**
 * `EXPO_PUBLIC_API_MODE` 하나로 켜고 끈다 (`api.md` §7.2).
 *
 * ⚠️ **2026-09-14 — 목이 지금 꺼져 있다.** MSW 를 걷어내는 중이다.
 *
 * `msw` 는 모듈 평가 시점에 Hermes 에 없는 Web API 를 참조해서 **앱이 첫 화면도
 * 못 그리고 죽었다** (`MessageEvent` → `BroadcastChannel` → …).
 * [트러블슈팅 2026-09-14](../../../docs/troubleshooting/mobile/2026-09-14-msw-does-not-run-on-hermes.md)
 *
 * **자체 `fetch` 인터셉터가 이 자리를 가져간다.** 지키는 것은 그대로다 —
 * 앱은 진짜 `fetch` 를 부르고, `status`·`delay` 를 조작할 수 있고, 끌 때는
 * 핸들러만 뺀다. 바뀌는 건 **누가 가로채나** 뿐이다.
 *
 * > ⚠️ **가짜 데이터를 함수에서 `return` 하는 방식으로 후퇴하지 않는다** —
 * > `mobile/CLAUDE.md` 금지 1번. 그러면 로딩·에러 화면을 만들 계기가 사라진다.
 *
 * ⚠️ **그때도 첫 요청보다 먼저 불러야 한다.** 인터셉터가 뜨기 전에 나간 요청은
 *    그것만 진짜 네트워크로 샌다. `app/_layout.tsx` 가 렌더 전에 부른다.
 */

let warned = false

export function enableMocking(): void {
  if (API_MODE !== 'mock') return
  if (warned) return
  warned = true

  const scenario = initScenario()

  console.warn(
    `[mock] ⚠️ 목이 꺼져 있다. 요청이 진짜 네트워크로 나간다.\n` +
      `       MSW 가 Hermes 에서 안 돌아 자체 인터셉터로 교체 중이다.\n` +
      `       시나리오 '${scenario}' 는 교체 후 그대로 동작한다.`,
  )
}

export { getScenario }
