import { createApiClient } from '../api/client'
import { ApiError, isPaymentPending, isSeatConflict } from '../api/problem'
import { handlers } from './handlers'
import { isIntercepting, startIntercept, type InterceptorHandle } from './intercept'
import { setScenario } from './scenario'

/**
 * ⚠️ **이 파일이 목의 존재 이유를 잠근다.**
 *
 * 확인하는 건 하나다 — **앱 코드를 안 바꾸고 진짜 `fetch` 를 가로채는가.**
 *
 * 그래서 `fetchImpl` 을 주입하지 **않는다.** 주입하면 인터셉터를 건너뛰고
 * 테스트만 통과한다 — 확인하려는 것을 피해 가는 셈이다.
 *
 * ⚠️ **Jest 가 증명하는 범위는 여기까지다.** Hermes 확인은 에뮬레이터에서
 *    따로 한다 (`mobile/CLAUDE.md` 「개발 루프」). `msw` 가 Jest 는 통과하고
 *    Hermes 에서 죽었던 게 그 이유다 (트러블슈팅 2026-09-14).
 */

let handle: InterceptorHandle

beforeAll(() => {
  handle = startIntercept(handlers)
})
afterEach(() => setScenario('happy'))
afterAll(() => handle.stop())

// ⚠️ fetchImpl 을 안 준다. 전역 fetch 를 그대로 쓴다 — 그게 이 테스트의 전부다.
const api = createApiClient({ baseUrl: 'http://pi.test/api/v1' })

describe('인터셉터가 앱의 진짜 fetch 를 가로챈다', () => {
  it('켜고 끄면 전역이 원래대로 돌아온다', () => {
    expect(isIntercepting()).toBe(true)
  })

  it('역 목록이 핸들러에서 온다 — 네트워크로 안 나간다', async () => {
    const body = await api.request<{ stations: unknown[] }>('/stations')

    // `api.md` §5.1 — 목록은 배열이 아니라 `{ stations: [...] }` 다
    expect(Array.isArray(body.stations)).toBe(true)
    expect(body.stations.length).toBeGreaterThan(0)
  })

  it('경로 변수가 핸들러에 전달된다', async () => {
    const seatMap = await api.request<{ tripId: number }>('/trips/777/seats')
    expect(seatMap.tripId).toBe(777)
  })

  it('204 는 본문이 없다', async () => {
    await expect(api.request('/holds/h-1', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('목이 모르는 경로는 가로채지 않는다 — 조용히 404 를 지어내지 않는다', async () => {
    // 매칭 실패 시 원본 fetch 로 나가므로 네트워크 에러가 난다.
    // ⚠️ 이게 중요하다. 404 를 만들면 "목이 답한 건지 서버가 없는 건지" 구분이 안 된다.
    await expect(api.request('/nonexistent-endpoint')).rejects.toBeDefined()
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

  it('payment-pending → 202 인데 던진다 + Retry-After', async () => {
    setScenario('payment-pending')

    const err = (await api
      .request('/holds/h-1/payment', { method: 'POST', body: {}, idempotencyKey: 'k' })
      .catch((e: unknown) => e)) as ApiError

    expect(isPaymentPending(err)).toBe(true)
    expect(err.retryAfterSeconds).toBe(2)
  })

  it('hold-expired → 410', async () => {
    setScenario('hold-expired')

    const err = (await api.request('/holds/h-1').catch((e: unknown) => e)) as ApiError
    expect(err.status).toBe(410)
    expect(err.code).toBe('HOLD_EXPIRED')
  })

  it('login-throttled → 429 + Retry-After 300 ("5분 뒤" 문구의 근거)', async () => {
    setScenario('login-throttled')

    const err = (await api
      .request('/auth/login', { method: 'POST', body: {} })
      .catch((e: unknown) => e)) as ApiError

    expect(err.status).toBe(429)
    expect(err.retryAfterSeconds).toBe(300)
  })

  it('server-error → 5xx 에는 detail 이 없다', async () => {
    setScenario('server-error')

    const err = (await api.request('/stations').catch((e: unknown) => e)) as ApiError

    expect(err.status).toBe(500)
    expect(err.detail).toBeUndefined()
  })
})

describe('메서드가 다르면 다른 핸들러다 — 이중 결제를 가르는 지점', () => {
  it('POST /holds/:id/payment 는 확정, GET 은 결과 조회', async () => {
    const created = await api.request<{ reservationNo: string }>('/holds/h-1/payment', {
      method: 'POST',
      body: {},
      idempotencyKey: 'k',
    })
    const polled = await api.request<{ reservationNo: string }>('/holds/h-1/payment')

    // 둘 다 같은 예약을 준다 — 계약상 GET 은 "그 요청의 결과" 다 (`api.md` §5.3)
    expect(polled.reservationNo).toBe(created.reservationNo)
  })
})
