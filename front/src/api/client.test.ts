import { createApiClient } from './client'
import { ApiError, isPaymentPending, isSeatConflict } from './problem'
import { jsonResponse, problemOf, stubFetch } from './test-helpers'

const BASE = '/api/v1'

function clientWith(res: Response, token: string | null = null) {
  const stub = stubFetch(res)
  const api = createApiClient({
    baseUrl: BASE,
    getAccessToken: () => token,
    fetchImpl: stub.fetchImpl,
  })
  return { api, stub }
}

describe('요청 헤더 — api.md §2', () => {
  it('X-Request-Id 를 항상 붙인다', async () => {
    const { api, stub } = clientWith(jsonResponse(200, { trips: [] }))
    await api.request('/trips')
    expect(stub.last().headers.get('X-Request-Id')).toBeTruthy()
  })

  it('요청마다 X-Request-Id 가 다르다', async () => {
    const { api, stub } = clientWith(jsonResponse(200, {}))
    await api.request('/trips')
    const first = stub.last().headers.get('X-Request-Id')
    await api.request('/trips')
    expect(stub.last().headers.get('X-Request-Id')).not.toBe(first)
  })

  it('토큰이 없으면 Authorization 을 안 붙인다 — 조회는 비인증이다', async () => {
    const { api, stub } = clientWith(jsonResponse(200, {}))
    await api.request('/stations')
    expect(stub.last().headers.has('Authorization')).toBe(false)
  })

  it('토큰이 있으면 Bearer 로 붙인다', async () => {
    const { api, stub } = clientWith(jsonResponse(200, {}), 'tok_abc')
    await api.request('/reservations')
    expect(stub.last().headers.get('Authorization')).toBe('Bearer tok_abc')
  })

  it('Idempotency-Key 는 준 요청에만 붙는다 — 결제 확정 전용', async () => {
    const { api, stub } = clientWith(jsonResponse(200, {}))
    await api.request('/trips')
    expect(stub.last().headers.has('Idempotency-Key')).toBe(false)

    await api.request('/holds/1/payment', { method: 'POST', idempotencyKey: 'idem-1', body: {} })
    expect(stub.last().headers.get('Idempotency-Key')).toBe('idem-1')
  })

  it('본문이 있을 때만 Content-Type 을 붙이고 JSON 으로 보낸다', async () => {
    const { api, stub } = clientWith(jsonResponse(200, {}))
    await api.request('/holds', { method: 'POST', body: { tripId: 101 } })
    expect(stub.last().headers.get('Content-Type')).toBe('application/json')
    expect(stub.last().init.body).toBe('{"tripId":101}')
  })

  it('baseUrl 을 앞에 붙인다', async () => {
    const { api, stub } = clientWith(jsonResponse(200, {}))
    await api.request('/trips?from=SEO')
    expect(stub.last().url).toBe('/api/v1/trips?from=SEO')
  })
})

describe('응답 — 성공', () => {
  it('2xx 본문을 그대로 준다', async () => {
    const { api } = clientWith(jsonResponse(200, { trips: [{ tripId: 101 }] }))
    await expect(api.request('/trips')).resolves.toEqual({ trips: [{ tripId: 101 }] })
  })

  it('204 는 본문을 읽지 않고 undefined', async () => {
    const { api } = clientWith(jsonResponse(204, undefined))
    await expect(api.request('/holds/1')).resolves.toBeUndefined()
  })
})

describe('응답 — 에러는 ApiError 로', () => {
  it('409 SEAT_ALREADY_HELD 의 failedSeats 를 보존한다', async () => {
    const problem = {
      ...problemOf({ status: 409, code: 'SEAT_ALREADY_HELD' }),
      failedSeats: [
        { carNo: 4, rowNo: 7, colLetter: 'B', reason: 'HELD_BY_OTHER' },
        { carNo: 4, rowNo: 7, colLetter: 'A', reason: 'ALL_OR_NOTHING' },
      ],
    }
    const { api } = clientWith(jsonResponse(409, problem))

    const err = await api.request('/holds', { method: 'POST', body: {} }).catch((e: unknown) => e)
    expect(isSeatConflict(err)).toBe(true)
    if (!isSeatConflict(err)) throw new Error('좁혀지지 않았다')
    expect(err.problem.failedSeats?.[1]?.reason).toBe('ALL_OR_NOTHING')
    expect(err.requestId).toBe('7f3a9c21')
  })

  it('429 의 Retry-After 를 초로 읽는다 — 5분 뒤 문구의 근거', async () => {
    const { api } = clientWith(
      jsonResponse(429, problemOf({ status: 429, code: 'TOO_MANY_ATTEMPTS' }), {
        'Retry-After': '300',
      }),
    )
    const err = await api
      .request('/auth/login', { method: 'POST', body: {} })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).retryAfterSeconds).toBe(300)
  })

  it('Problem 이 아닌 본문도 ApiError 가 된다 — requestId 는 헤더에서', async () => {
    const { api } = clientWith(
      new Response('<html>502 Bad Gateway</html>', {
        status: 502,
        headers: { 'X-Request-Id': 'gw-77' },
      }),
    )
    const err = (await api.request('/trips').catch((e: unknown) => e)) as ApiError
    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('INTERNAL_ERROR')
    expect(err.requestId).toBe('gw-77')
  })
})

describe('⚠️ 202 는 2xx 인데도 던진다', () => {
  it('성공으로 흘려보내지 않는다 — 완료 화면으로 넘어가는 실수를 막는다', async () => {
    const { api } = clientWith(
      jsonResponse(202, problemOf({ status: 202, code: 'PAYMENT_PENDING' }), {
        'Retry-After': '2',
      }),
    )
    const err = await api
      .request('/holds/1/payment', { method: 'POST', idempotencyKey: 'k', body: {} })
      .catch((e: unknown) => e)

    expect(isPaymentPending(err)).toBe(true)
    expect((err as ApiError).retryAfterSeconds).toBe(2)
  })

  it('Retry-After 가 없으면 null 이다 — 0 으로 착각하면 즉시 폴링한다', async () => {
    const { api } = clientWith(
      jsonResponse(202, problemOf({ status: 202, code: 'PAYMENT_PENDING' })),
    )
    const err = (await api.request('/holds/1/payment').catch((e: unknown) => e)) as ApiError
    expect(err.retryAfterSeconds).toBeNull()
  })
})
