import { setupServer } from 'msw/node'
import { createApiClient } from '../api/client'
import { ApiError, isPaymentPending, isSeatConflict } from '../api/problem'
import type { components } from '../api/schema'
import { handlers } from './handlers'
import { setScenario } from './scenario'
import type { Scenario } from './scenario'

/**
 * ⚠️ 핸들러만 따로 보지 않는다. **실제 `createApiClient` 를 태워서** 본다 —
 * 목이 맞아도 클라이언트가 `202` 를 성공으로 흘리면 화면은 깨진다.
 */
const server = setupServer(...handlers)

// 오타로 경로가 어긋나면 조용히 통과하지 않게 한다
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  setScenario('happy')
})
afterAll(() => server.close())

const BASE = 'http://localhost/api/v1'

/** ⚠️ `server.listen()` 이 globalThis.fetch 를 바꾼 뒤에 만들어야 한다 */
function client() {
  return createApiClient({ baseUrl: BASE })
}

function on(s: Scenario) {
  setScenario(s)
  return client()
}

async function err(p: Promise<unknown>): Promise<ApiError> {
  const e = await p.catch((x: unknown) => x)
  if (!(e instanceof ApiError)) throw new Error(`ApiError 가 아니다: ${String(e)}`)
  return e
}

type S = components['schemas']

describe('조회 — 인증 불필요 (§5.1)', () => {
  it('역 목록은 계약의 예시 그대로다', async () => {
    const r = await client().request<S['StationList']>('/stations')
    expect(r.stations.map((s) => s.code)).toEqual(['SEO', 'DJN', 'DDG', 'BSN'])
  })

  it('운행 목록을 준다', async () => {
    const r = await client().request<S['TripList']>('/trips?from=SEO&to=BSN')
    expect(r.trips[0]?.tripId).toBe(101)
  })

  it('좌석맵은 800석이다 — W-03 이 그걸 렌더해야 한다', async () => {
    const r = await client().request<S['SeatMap']>('/trips/101/seats')
    const total = r.cars.reduce((n, c) => n + c.seats.length, 0)
    expect(r.cars).toHaveLength(10)
    expect(total).toBe(800)
  })

  it('좌석맵이 SSE 시작점(lastEventId)을 준다 — §6.3', async () => {
    const r = await client().request<S['SeatMap']>('/trips/101/seats')
    expect(r.lastEventId).toMatch(/^\d+-\d+$/)
  })

  it('창측은 A · D 다', async () => {
    const r = await client().request<S['SeatMap']>('/trips/101/seats')
    const seats = r.cars[0]?.seats ?? []
    expect(seats.filter((s) => s.windowSide).every((s) => 'AD'.includes(s.colLetter))).toBe(true)
  })

  it('새로고침해도 좌석 배치가 같다 — 무작위면 화면을 못 본다', async () => {
    const a = await client().request<S['SeatMap']>('/trips/101/seats')
    const b = await client().request<S['SeatMap']>('/trips/101/seats')
    expect(a.cars[0]?.seats[0]?.status).toBe(b.cars[0]?.seats[0]?.status)
  })
})

describe('선점 (§5.2)', () => {
  it('201 과 함께 미래의 expiresAt 을 준다 — 고정값이면 이미 지난 시각이다', async () => {
    const r = await client().request<S['HoldResponse']>('/holds', { method: 'POST', body: {} })
    expect(r.holdId).toBe('h_8f3a21')
    expect(new Date(r.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('해제는 204 — 본문이 없다', async () => {
    await expect(client().request('/holds/h_8f3a21', { method: 'DELETE' })).resolves.toBeUndefined()
  })
})

describe('E-01 선점 충돌 — 409 가 두 종류다', () => {
  it('SEAT_ALREADY_HELD 는 failedSeats 를 준다', async () => {
    const e = await err(on('seat-conflict').request('/holds', { method: 'POST', body: {} }))
    expect(isSeatConflict(e)).toBe(true)
    if (!isSeatConflict(e)) throw new Error('좁혀지지 않았다')

    const reasons = e.problem.failedSeats?.map((s) => s.reason)
    // ALL_OR_NOTHING 이 "함께 선택한 7A도 선점되지 않았습니다" 문구의 근거다
    expect(reasons).toEqual(['HELD_BY_OTHER', 'ALL_OR_NOTHING'])
  })

  it('⚠️ SEAT_LOCK_TIMEOUT 은 failedSeats 가 없다 — 잠그지 못해 서버도 모른다', async () => {
    const e = await err(on('seat-lock-timeout').request('/holds', { method: 'POST', body: {} }))
    expect(e.status).toBe(409)
    expect(e.code).toBe('SEAT_LOCK_TIMEOUT')
    expect(isSeatConflict(e)).toBe(false)
  })
})

describe('E-02 선점 만료 — 410', () => {
  it('선점 조회가 410 HOLD_EXPIRED', async () => {
    const e = await err(on('hold-expired').request('/holds/h_8f3a21'))
    expect(e.status).toBe(410)
    expect(e.code).toBe('HOLD_EXPIRED')
  })

  it('결제 확정도 410 — 좌석을 뺏긴 게 아니라 시간이 지난 것', async () => {
    const e = await err(
      on('hold-expired').request('/holds/h_8f3a21/payment', {
        method: 'POST',
        idempotencyKey: 'k',
        body: {},
      }),
    )
    expect(e.code).toBe('HOLD_EXPIRED')
  })
})

describe('E-03 결제 타임아웃 — 202', () => {
  it('POST 가 202 를 던지고 Retry-After 를 준다', async () => {
    const e = await err(
      on('payment-pending').request('/holds/h_8f3a21/payment', {
        method: 'POST',
        idempotencyKey: 'k',
        body: {},
      }),
    )
    expect(isPaymentPending(e)).toBe(true)
    expect(e.retryAfterSeconds).toBe(2)
  })

  it('⚠️ 폴링은 GET 이다 — POST 로 다시 부르면 이중 결제', async () => {
    const e = await err(on('payment-pending').request('/holds/h_8f3a21/payment'))
    expect(isPaymentPending(e)).toBe(true)
  })

  it('확정되면 GET 이 예약을 준다', async () => {
    const r = await client().request<S['ReservationDetail']>('/holds/h_8f3a21/payment')
    expect(r.reservationNo).toBe('48207315')
  })

  it('거절은 402 — 선점은 유지된다', async () => {
    const e = await err(
      on('payment-declined').request('/holds/h_8f3a21/payment', {
        method: 'POST',
        idempotencyKey: 'k',
        body: {},
      }),
    )
    expect(e.status).toBe(402)
    expect(e.code).toBe('PAYMENT_DECLINED')
  })

  it('정상이면 201 과 예약번호 8자리', async () => {
    const r = await client().request<S['ReservationDetail']>('/holds/h_8f3a21/payment', {
      method: 'POST',
      idempotencyKey: 'k',
      body: {},
    })
    expect(r.reservationNo).toHaveLength(8)
  })
})

describe('예약 관리 (§5.4)', () => {
  it('목록에 COMPLETED 가 섞여 온다 — 파생값이지만 그냥 표시한다', async () => {
    const r = await client().request<S['ReservationPage']>('/reservations')
    expect(r.content.map((c) => c.status)).toContain('COMPLETED')
  })

  it('취소하면 CANCELLED 와 cancelledAt 이 온다', async () => {
    const r = await client().request<S['ReservationDetail']>('/reservations/48207315/cancel', {
      method: 'POST',
      body: {},
    })
    expect(r.status).toBe('CANCELLED')
    expect(r.cancelledAt).toBeTruthy()
  })

  it('출발한 열차는 409 RESERVATION_NOT_CANCELLABLE', async () => {
    const e = await err(
      on('hold-expired').request('/reservations/48207315/cancel', { method: 'POST', body: {} }),
    )
    expect(e.code).toBe('RESERVATION_NOT_CANCELLABLE')
  })
})

describe('인증 (§5.5)', () => {
  it('로그인이 토큰 3종을 준다', async () => {
    const r = await client().request<S['TokenResponse']>('/auth/login', {
      method: 'POST',
      body: {},
    })
    expect(r.accessToken).toBeTruthy()
    expect(r.accessExpiresAt).toBeTruthy()
  })

  it('시도 제한은 429 + Retry-After 300 — "5분 뒤" 문구의 근거', async () => {
    const e = await err(on('login-throttled').request('/auth/login', { method: 'POST', body: {} }))
    expect(e.status).toBe(429)
    expect(e.retryAfterSeconds).toBe(300)
  })

  it('로그아웃은 204', async () => {
    await expect(
      client().request('/auth/logout', { method: 'POST', body: {} }),
    ).resolves.toBeUndefined()
  })

  it('내 정보 수정은 보낸 필드만 덮는다', async () => {
    const r = await client().request<S['MeResponse']>('/me', {
      method: 'PATCH',
      body: { name: '김철수' },
    })
    expect(r.name).toBe('김철수')
    expect(r.email).toBe('hong@example.com')
  })
})

describe('소유권 · 없음 · 서버 오류', () => {
  it('남의 선점은 403 HOLD_NOT_OWNED', async () => {
    const e = await err(on('not-owned').request('/holds/h_8f3a21'))
    expect(e.status).toBe(403)
    expect(e.code).toBe('HOLD_NOT_OWNED')
  })

  it('남의 예약은 403 RESERVATION_NOT_OWNED', async () => {
    const e = await err(on('not-owned').request('/reservations/48207315'))
    expect(e.code).toBe('RESERVATION_NOT_OWNED')
  })

  it('없는 운행은 404 TRIP_NOT_FOUND', async () => {
    const e = await err(on('not-found').request('/trips/999/seats'))
    expect(e.status).toBe(404)
    expect(e.code).toBe('TRIP_NOT_FOUND')
  })

  it('⚠️ 500 에는 detail 이 없다 — 내부를 노출하지 않는다', async () => {
    const e = await err(on('server-error').request('/stations'))
    expect(e.status).toBe(500)
    expect(e.code).toBe('INTERNAL_ERROR')
    expect(e.detail).toBeUndefined()
    expect(e.requestId).toBeTruthy()
  })
})

describe('SSE (§6)', () => {
  async function firstFrame(res: Response): Promise<string> {
    const reader = res.body?.getReader()
    if (!reader) throw new Error('스트림이 없다')
    const { value } = await reader.read()
    await reader.cancel()
    return new TextDecoder().decode(value)
  }

  // ⚠️ **정상 스트림은 여기서 못 연다.** msw/node 는 스트림이 닫힐 때까지 fetch 를
  //    붙잡아서, 하트비트가 계속 나가는 연결은 await 에서 멈춘다(브라우저 워커는 정상).
  //    그래서 직렬화는 sse-frame.test.ts 가, 연결은 아래 닫히는 경로가 본다.

  it('⚠️ 재개 실패는 에러 응답이 아니라 이벤트다 — 연결은 200 으로 열려 있다', async () => {
    setScenario('not-found')
    const res = await fetch(`${BASE}/trips/101/seat-events`)
    expect(res.status).toBe(200)

    const frame = await firstFrame(res)
    expect(frame).toContain('event: resume-failed')
    expect(frame).toContain('REFETCH_SNAPSHOT')
  })
})
