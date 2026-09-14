import { delay, http, HttpResponse } from 'msw'
import type { Problem } from '../api/problem'
import * as fx from './fixtures'
import { isScenarioActive } from './scenario'
import { sseFrame } from './sse-frame'

/**
 * `api.md` §7.2 — 즉시 반환하면 **로딩 화면을 만들 계기가 없다.**
 * 다만 테스트는 그 계기가 필요 없다 — 20개가 500ms 씩 기다리면 10초다.
 */
export const MOCK_DELAY_MS = import.meta.env.MODE === 'test' ? 0 : 500

/** 오리진을 가리지 않는다 — `VITE_API_BASE_URL` 이 절대 URL 이어도 물린다 */
const url = (path: string) => `*/api/v1${path}`

function problemResponse(p: Problem, headers: Record<string, string> = {}): HttpResponse {
  return HttpResponse.json(p, {
    status: p.status,
    // ⚠️ 성공과 다른 미디어 타입이다 (`api.md` §4.1)
    headers: { 'Content-Type': 'application/problem+json', ...headers },
  })
}

/**
 * 모든 핸들러의 앞단. 지연을 넣고, `server-error` 시나리오면 `500` 으로 끊는다.
 * 끊을 게 없으면 `null` 을 준다 — 호출부는 `(await pre()) ?? 정상응답` 으로 쓴다.
 */
async function pre(): Promise<HttpResponse | null> {
  await delay(MOCK_DELAY_MS)
  if (!isScenarioActive('server-error')) return null
  // ⚠️ `5xx` 에는 detail 이 없다 — 내부를 노출하지 않는다 (`api.md` §4.5)
  return problemResponse(
    fx.problem({
      status: 500,
      code: 'INTERNAL_ERROR',
      type: 'about:blank',
      title: '일시적인 오류가 발생했습니다',
    }),
  )
}

const notFound = (code: 'TRIP_NOT_FOUND' | 'RESERVATION_NOT_FOUND', title: string) =>
  problemResponse(fx.problem({ status: 404, code, title }))

const notOwned = (code: 'HOLD_NOT_OWNED' | 'RESERVATION_NOT_OWNED') =>
  problemResponse(fx.problem({ status: 403, code, title: '접근 권한이 없습니다' }))

const holdExpired = () =>
  problemResponse(
    fx.problem({
      status: 410,
      code: 'HOLD_EXPIRED',
      title: '선점 시간이 만료되었습니다',
      detail: '10분이 지나 좌석이 반환되었습니다.',
    }),
  )

/** ⚠️ `202` 는 에러가 아니다. `Retry-After` 가 폴링 간격의 근거다 (`api.md` §5.3) */
const paymentPending = () =>
  problemResponse(
    fx.problem({
      status: 202,
      code: 'PAYMENT_PENDING',
      type: 'https://api.jomin4.cloud/problems/payment-pending',
      title: '결제 결과를 확인하고 있습니다',
    }),
    { 'Retry-After': '2' },
  )

const paymentDeclined = () =>
  problemResponse(
    fx.problem({ status: 402, code: 'PAYMENT_DECLINED', title: '결제가 거절되었습니다' }),
  )

// ── 조회 — 인증 불필요 (§5.1) ──────────────────────────────────

const catalog = [
  http.get(url('/stations'), async () => (await pre()) ?? HttpResponse.json(fx.stations)),

  http.get(url('/trips'), async () => (await pre()) ?? HttpResponse.json(fx.trips)),

  http.get(url('/trips/:tripId/seats'), async ({ params }) => {
    const blocked = await pre()
    if (blocked) return blocked
    if (isScenarioActive('not-found')) return notFound('TRIP_NOT_FOUND', '운행을 찾을 수 없습니다')
    return HttpResponse.json(fx.buildSeatMap(Number(params['tripId'])))
  }),
]

// ── SSE (§6) ──────────────────────────────────────────────────

/** 하트비트 주기. 계약은 15초지만 목에서는 화면을 보며 확인할 수 있게 짧게 둔다 */
export const MOCK_HEARTBEAT_MS = 3000

const sse = [
  http.get(url('/trips/:tripId/seat-events'), () => {
    const encoder = new TextEncoder()
    let timer: ReturnType<typeof setInterval> | undefined

    const stream = new ReadableStream({
      start(controller) {
        const send = (event: string, data: unknown, id?: string) => {
          controller.enqueue(encoder.encode(sseFrame(event, data, id)))
        }

        // 재개 실패는 에러 응답이 아니라 이벤트다 — 연결이 이미 200 으로 열려 있다 (§6.2)
        if (isScenarioActive('not-found')) {
          send('resume-failed', { reason: 'EVENT_ID_TOO_OLD', action: 'REFETCH_SNAPSHOT' })
          controller.close()
          return
        }

        send('heartbeat', {})
        timer = setInterval(() => send('heartbeat', {}), MOCK_HEARTBEAT_MS)
      },
      cancel() {
        if (timer !== undefined) clearInterval(timer)
      },
    })

    return new HttpResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  }),
]

// ── 선점 (§5.2) ───────────────────────────────────────────────

const holds = [
  http.post(url('/holds'), async () => {
    const blocked = await pre()
    if (blocked) return blocked
    if (isScenarioActive('not-found')) return notFound('TRIP_NOT_FOUND', '운행을 찾을 수 없습니다')
    if (isScenarioActive('seat-conflict')) return problemResponse(fx.seatConflict)
    if (isScenarioActive('seat-lock-timeout')) {
      // ⚠️ failedSeats 가 없다 — 잠그지 못했으니 어느 좌석이 문제인지 서버도 모른다
      return problemResponse(
        fx.problem({
          status: 409,
          code: 'SEAT_LOCK_TIMEOUT',
          title: '좌석을 잡지 못했습니다',
          detail: '다시 시도하면 성공할 수 있습니다.',
        }),
      )
    }
    return HttpResponse.json(fx.freshHold(), { status: 201 })
  }),

  http.get(url('/holds/:holdId'), async () => {
    const blocked = await pre()
    if (blocked) return blocked
    if (isScenarioActive('not-owned')) return notOwned('HOLD_NOT_OWNED')
    if (isScenarioActive('hold-expired')) return holdExpired()
    return HttpResponse.json(fx.freshHold())
  }),

  http.delete(url('/holds/:holdId'), async () => {
    const blocked = await pre()
    if (blocked) return blocked
    if (isScenarioActive('not-owned')) return notOwned('HOLD_NOT_OWNED')
    return new HttpResponse(null, { status: 204 })
  }),
]

// ── 결제 · 확정 (§5.3) ────────────────────────────────────────

const payments = [
  http.post(url('/holds/:holdId/payment-intent'), async () => {
    const blocked = await pre()
    if (blocked) return blocked
    if (isScenarioActive('hold-expired')) return holdExpired()
    return HttpResponse.json(fx.paymentIntent)
  }),

  http.post(url('/holds/:holdId/payment'), async () => {
    const blocked = await pre()
    if (blocked) return blocked
    if (isScenarioActive('hold-expired')) return holdExpired()
    if (isScenarioActive('payment-pending')) return paymentPending()
    // ⚠️ 거절이어도 선점은 유지된다 (`PM-3`) — 화면이 좌석 선택으로 되돌리면 안 된다
    if (isScenarioActive('payment-declined')) return paymentDeclined()
    return HttpResponse.json(fx.reservation, { status: 201 })
  }),

  // ⚠️ GET 이다. POST 로 다시 부르면 이중 결제 (`api.md` §5.3)
  http.get(url('/holds/:holdId/payment'), async () => {
    const blocked = await pre()
    if (blocked) return blocked
    if (isScenarioActive('payment-pending')) return paymentPending()
    if (isScenarioActive('payment-declined')) return paymentDeclined()
    if (isScenarioActive('hold-expired')) return holdExpired()
    return HttpResponse.json(fx.reservation)
  }),
]

// ── 예약 관리 (§5.4) ──────────────────────────────────────────

const reservations = [
  http.get(
    url('/reservations'),
    async () => (await pre()) ?? HttpResponse.json(fx.reservationPage),
  ),

  http.get(url('/reservations/:reservationNo'), async () => {
    const blocked = await pre()
    if (blocked) return blocked
    if (isScenarioActive('not-found'))
      return notFound('RESERVATION_NOT_FOUND', '예약을 찾을 수 없습니다')
    if (isScenarioActive('not-owned')) return notOwned('RESERVATION_NOT_OWNED')
    return HttpResponse.json(fx.reservation)
  }),

  http.post(url('/reservations/:reservationNo/cancel'), async () => {
    const blocked = await pre()
    if (blocked) return blocked
    if (isScenarioActive('not-owned')) return notOwned('RESERVATION_NOT_OWNED')
    if (isScenarioActive('hold-expired')) {
      return problemResponse(
        fx.problem({
          status: 409,
          code: 'RESERVATION_NOT_CANCELLABLE',
          title: '취소할 수 없는 예약입니다',
          detail: '이미 출발한 열차입니다.',
        }),
      )
    }
    return HttpResponse.json({
      ...fx.reservation,
      status: 'CANCELLED' as const,
      cancelledAt: new Date().toISOString(),
    })
  }),
]

// ── 인증 · 회원 (§5.5) ────────────────────────────────────────

const auth = [
  http.post(url('/auth/signup'), async () => {
    const blocked = await pre()
    if (blocked) return blocked
    if (isScenarioActive('not-owned')) {
      return problemResponse(
        fx.problem({
          status: 409,
          code: 'EMAIL_ALREADY_EXISTS',
          title: '이미 가입된 이메일입니다',
        }),
      )
    }
    return HttpResponse.json(fx.me, { status: 201 })
  }),

  http.get(url('/auth/email-available'), async () => {
    const blocked = await pre()
    if (blocked) return blocked
    // ⚠️ 폼 편의용이다. 최종 판정은 가입 응답이다 (`api.md` §5.5)
    return HttpResponse.json({ available: !isScenarioActive('not-owned') })
  }),

  http.post(url('/auth/login'), async () => {
    const blocked = await pre()
    if (blocked) return blocked
    if (isScenarioActive('login-throttled')) {
      // ⚠️ Retry-After 가 "5분 뒤 다시" 문구의 근거다. "계정이 잠겼습니다" 가 아니다
      return problemResponse(
        fx.problem({ status: 429, code: 'TOO_MANY_ATTEMPTS', title: '잠시 후 다시 시도해주세요' }),
        { 'Retry-After': '300' },
      )
    }
    if (isScenarioActive('not-owned')) {
      // 계정 존재 여부를 구분하지 않는 문구여야 한다
      return problemResponse(
        fx.problem({
          status: 401,
          code: 'INVALID_CREDENTIALS',
          title: '이메일 또는 비밀번호가 올바르지 않습니다',
        }),
      )
    }
    return HttpResponse.json(fx.tokens)
  }),

  http.post(url('/auth/refresh'), async () => (await pre()) ?? HttpResponse.json(fx.tokens)),

  http.post(
    url('/auth/logout'),
    async () => (await pre()) ?? new HttpResponse(null, { status: 204 }),
  ),

  http.get(url('/me'), async () => (await pre()) ?? HttpResponse.json(fx.me)),

  http.patch(url('/me'), async ({ request }) => {
    const blocked = await pre()
    if (blocked) return blocked
    const body = (await request.json()) as Partial<typeof fx.me>
    return HttpResponse.json({ ...fx.me, ...body })
  }),
]

export const handlers = [...catalog, ...sse, ...holds, ...payments, ...reservations, ...auth]
