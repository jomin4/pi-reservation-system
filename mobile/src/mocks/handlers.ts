import * as fx from './fixtures'
import { delay, json, noContent, problemResponse } from './respond'
import { http, type Handler } from './router'
import { isScenarioActive } from './scenario'

/**
 * 핸들러 — **`api.md` §5 · §4 의 예시가 그대로 본문이 된다** (§7.3).
 *
 * ⚠️ **fixture 를 새로 지어내지 않는다.** 계약과 갈린다.
 *
 * > **MSW 에서 옮겨왔지만 로직은 그대로다** (#91). `http.get(...)` 과 응답 헬퍼만
 * > 우리 것으로 바뀌었다 — **어느 경로가 어느 상태를 주는가는 한 줄도 안 바꿨다.**
 */

/**
 * 모든 핸들러의 앞단. 지연을 넣고, `server-error` 시나리오면 `500` 으로 끊는다.
 * 끊을 게 없으면 `null` 을 준다 — 호출부는 `(await pre()) ?? 정상응답` 으로 쓴다.
 */
async function pre(): Promise<Response | null> {
  await delay()
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
  http.get('/stations', async () => (await pre()) ?? json(fx.stations)),

  http.get('/trips', async () => (await pre()) ?? json(fx.trips)),

  http.get('/trips/:tripId/seats', async ({ params }) => {
    const blocked = await pre()
    if (blocked) return blocked
    if (isScenarioActive('not-found')) return notFound('TRIP_NOT_FOUND', '운행을 찾을 수 없습니다')
    return json(fx.buildSeatMap(Number(params['tripId'])))
  }),
]

// ── 선점 (§5.2) ───────────────────────────────────────────────

const holds = [
  http.post('/holds', async () => {
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
    return json(fx.freshHold(), { status: 201 })
  }),

  http.get('/holds/:holdId', async () => {
    const blocked = await pre()
    if (blocked) return blocked
    if (isScenarioActive('not-owned')) return notOwned('HOLD_NOT_OWNED')
    if (isScenarioActive('hold-expired')) return holdExpired()
    return json(fx.freshHold())
  }),

  http.delete('/holds/:holdId', async () => {
    const blocked = await pre()
    if (blocked) return blocked
    if (isScenarioActive('not-owned')) return notOwned('HOLD_NOT_OWNED')
    return noContent()
  }),
]

// ── 결제 · 확정 (§5.3) ────────────────────────────────────────

const payments = [
  http.post('/holds/:holdId/payment-intent', async () => {
    const blocked = await pre()
    if (blocked) return blocked
    if (isScenarioActive('hold-expired')) return holdExpired()
    return json(fx.paymentIntent)
  }),

  http.post('/holds/:holdId/payment', async () => {
    const blocked = await pre()
    if (blocked) return blocked
    if (isScenarioActive('hold-expired')) return holdExpired()
    if (isScenarioActive('payment-pending')) return paymentPending()
    // ⚠️ 거절이어도 선점은 유지된다 (`PM-3`) — 화면이 좌석 선택으로 되돌리면 안 된다
    if (isScenarioActive('payment-declined')) return paymentDeclined()
    return json(fx.reservation, { status: 201 })
  }),

  // ⚠️ GET 이다. POST 로 다시 부르면 이중 결제 (`api.md` §5.3)
  http.get('/holds/:holdId/payment', async () => {
    const blocked = await pre()
    if (blocked) return blocked
    if (isScenarioActive('payment-pending')) return paymentPending()
    if (isScenarioActive('payment-declined')) return paymentDeclined()
    if (isScenarioActive('hold-expired')) return holdExpired()
    return json(fx.reservation)
  }),
]

// ── 예약 관리 (§5.4) ──────────────────────────────────────────

const reservations = [
  http.get('/reservations', async () => (await pre()) ?? json(fx.reservationPage)),

  http.get('/reservations/:reservationNo', async () => {
    const blocked = await pre()
    if (blocked) return blocked
    if (isScenarioActive('not-found'))
      return notFound('RESERVATION_NOT_FOUND', '예약을 찾을 수 없습니다')
    if (isScenarioActive('not-owned')) return notOwned('RESERVATION_NOT_OWNED')
    return json(fx.reservation)
  }),

  http.post('/reservations/:reservationNo/cancel', async () => {
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
    return json({
      ...fx.reservation,
      status: 'CANCELLED' as const,
      cancelledAt: new Date().toISOString(),
    })
  }),
]

// ── 인증 · 회원 (§5.5) ────────────────────────────────────────

const auth = [
  http.post('/auth/signup', async () => {
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
    return json(fx.me, { status: 201 })
  }),

  http.get('/auth/email-available', async () => {
    const blocked = await pre()
    if (blocked) return blocked
    // ⚠️ 폼 편의용이다. 최종 판정은 가입 응답이다 (`api.md` §5.5)
    return json({ available: !isScenarioActive('not-owned') })
  }),

  http.post('/auth/login', async () => {
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
    return json(fx.tokens)
  }),

  http.post('/auth/refresh', async () => (await pre()) ?? json(fx.tokens)),

  http.post('/auth/logout', async () => (await pre()) ?? noContent()),

  http.get('/me', async () => (await pre()) ?? json(fx.me)),

  http.patch('/me', async ({ json: readJson }) => {
    const blocked = await pre()
    if (blocked) return blocked
    const body = (await readJson<Partial<typeof fx.me>>()) ?? {}
    return json({ ...fx.me, ...body })
  }),
]

/**
 * ⚠️ **SSE 핸들러가 없다.** `api.md` §7.4 가 「SSE 는 인터페이스로 감싼다」 로 이미
 * 정해뒀고 가짜 구현은 `FakeSeatEvents` 다 (#82). 목이 스트림을 만들 필요가 없고,
 * **덕분에 `ReadableStream` 에 의존하지 않는다** — Hermes 에 없다.
 */
export const handlers: readonly Handler[] = [
  ...catalog,
  ...holds,
  ...payments,
  ...reservations,
  ...auth,
]
