import { setupServer } from 'msw/native'

import { createApiClient } from '../api/client'
import { ApiError, isSeatConflict } from '../api/problem'
import { handlers } from './handlers'
import { setScenario } from './scenario'

/**
 * ⚠️ **이 파일이 #81 의 핵심이다.**
 *
 * `mobile/CLAUDE.md` 와 `api.md` §7.2 가 **「RN 에서 MSW 가 도는지 세팅 때 확인할 것」**
 * 으로 남겨둔 항목을 잠근다. 확인하는 건 하나다 —
 *
 * > **앱 코드를 안 바꾸고 진짜 `fetch` 를 가로채는가.**
 *
 * 그래서 여기서는 `fetchImpl` 을 주입하지 **않는다.** 주입하면 MSW 를 안 거치고
 * 테스트만 통과한다 — 확인하려는 것을 피해 가는 셈이다.
 *
 * ⚠️ **이 테스트가 증명하는 범위** — `msw/native` 의 인터셉터가 **이 런타임에서**
 *    `fetch` 를 감싼다는 것까지다. **Hermes 실기기 확인은 별도다** (트러블슈팅 문서 참조).
 */

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  setScenario('happy')
})
afterAll(() => server.close())

// ⚠️ fetchImpl 을 안 준다. 전역 fetch 를 그대로 쓴다 — 그게 이 테스트의 전부다.
const api = createApiClient({ baseUrl: 'http://pi.test/api/v1' })

describe('msw/native 가 앱의 진짜 fetch 를 가로챈다', () => {
  it('역 목록이 핸들러에서 온다 — 네트워크로 안 나간다', async () => {
    const body = await api.request<{ stations: unknown[] }>('/stations')

    // `api.md` §5.1 — 목록은 배열이 아니라 `{ stations: [...] }` 다
    expect(Array.isArray(body.stations)).toBe(true)
    expect(body.stations.length).toBeGreaterThan(0)
  })

  it('헤더가 그대로 전달된다 — client.ts 를 통과했다는 증거', async () => {
    let seenRequestId: string | null = null
    server.events.on('request:start', ({ request }) => {
      seenRequestId = request.headers.get('X-Request-Id')
    })

    await api.request<unknown>('/stations')

    expect(seenRequestId).not.toBeNull()
  })
})

describe('시나리오가 예외 화면을 만든다 — 가짜 return 으로는 못 하는 것', () => {
  it('seat-conflict → 409 SEAT_ALREADY_HELD + 실패 좌석 목록', async () => {
    setScenario('seat-conflict')

    const err = await api
      .request('/holds', { method: 'POST', body: { tripId: 1, seatNos: ['7A', '7B'] } })
      .catch((e: unknown) => e)

    expect(isSeatConflict(err)).toBe(true)
    const problem = (err as ApiError).problem as { failedSeats?: unknown[] }
    expect(problem.failedSeats?.length).toBeGreaterThan(0)
  })

  it('seat-lock-timeout → 같은 409 인데 code 가 다르다', async () => {
    setScenario('seat-lock-timeout')

    const err = (await api
      .request('/holds', { method: 'POST', body: { tripId: 1, seatNos: ['7A'] } })
      .catch((e: unknown) => e)) as ApiError

    expect(err.status).toBe(409)
    expect(err.code).toBe('SEAT_LOCK_TIMEOUT')
    // ⚠️ 이 둘을 구분 못 하면 재시도하면 될 사용자를 좌석 선택으로 되돌린다 (`api.md` §4.3)
    expect(isSeatConflict(err)).toBe(false)
  })

  it('server-error → 5xx 에는 detail 이 없다', async () => {
    setScenario('server-error')

    const err = (await api.request('/stations').catch((e: unknown) => e)) as ApiError

    expect(err.status).toBe(500)
    expect(err.detail).toBeUndefined()
  })
})
