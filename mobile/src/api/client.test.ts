import { ApiTimeoutError, createApiClient, isTimeout } from './client'
import { ApiError, isPaymentPending, isSeatConflict } from './problem'

const BASE = 'http://test/api/v1'

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? '' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function client(fetchImpl: typeof globalThis.fetch, timeoutMs?: number) {
  return createApiClient({
    baseUrl: BASE,
    fetchImpl,
    newRequestId: () => 'req-fixed',
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  })
}

describe('헤더', () => {
  it('X-Request-Id 와 Accept 를 항상 붙인다', async () => {
    let seen: Headers | undefined
    const api = client(async (_url, init) => {
      seen = init?.headers as Headers
      return jsonResponse(200, { ok: true })
    })

    await api.request('/trips')

    expect(seen?.get('X-Request-Id')).toBe('req-fixed')
    expect(seen?.get('Accept')).toContain('application/problem+json')
  })

  it('토큰이 있으면 Authorization 을, 없으면 안 붙인다', async () => {
    let seen: Headers | undefined
    const fetchImpl: typeof globalThis.fetch = async (_url, init) => {
      seen = init?.headers as Headers
      return jsonResponse(200, {})
    }

    await createApiClient({ baseUrl: BASE, fetchImpl, getAccessToken: () => 'tok' }).request('/me')
    expect(seen?.get('Authorization')).toBe('Bearer tok')

    await createApiClient({ baseUrl: BASE, fetchImpl, getAccessToken: () => null }).request('/me')
    expect(seen?.get('Authorization')).toBeNull()
  })

  it('멱등키는 준 요청에만 붙는다', async () => {
    let seen: Headers | undefined
    const api = client(async (_url, init) => {
      seen = init?.headers as Headers
      return jsonResponse(200, {})
    })

    await api.request('/holds', { method: 'POST', body: {} })
    expect(seen?.get('Idempotency-Key')).toBeNull()

    await api.request('/holds/1/payment', { method: 'POST', body: {}, idempotencyKey: 'key-1' })
    expect(seen?.get('Idempotency-Key')).toBe('key-1')
  })
})

describe('응답 해석', () => {
  it('204 는 undefined 다', async () => {
    const api = client(async () => new Response(null, { status: 204 }))
    await expect(api.request('/holds/1')).resolves.toBeUndefined()
  })

  it('409 SEAT_ALREADY_HELD 는 실패 좌석을 들고 온다', async () => {
    const api = client(async () =>
      jsonResponse(409, {
        type: 'about:blank',
        title: '이미 선점된 좌석입니다',
        status: 409,
        code: 'SEAT_ALREADY_HELD',
        requestId: 'r-1',
        failedSeats: [{ seatNo: '7B', reason: 'HELD' }],
      }),
    )

    const err = await api.request('/holds', { method: 'POST', body: {} }).catch((e: unknown) => e)

    expect(isSeatConflict(err)).toBe(true)
    expect((err as ApiError).code).toBe('SEAT_ALREADY_HELD')
    expect((err as ApiError).requestId).toBe('r-1')
  })

  // ⚠️ 이 프로젝트에서 가장 중요한 한 줄 — 202 를 성공으로 흘리면 이중 결제가 난다.
  it('202 PAYMENT_PENDING 은 2xx 인데도 던진다', async () => {
    const api = client(async () =>
      jsonResponse(
        202,
        {
          type: 'about:blank',
          title: '결제 결과를 확인하는 중입니다',
          status: 202,
          code: 'PAYMENT_PENDING',
          requestId: 'r-2',
        },
        { 'Retry-After': '2' },
      ),
    )

    const err = await api
      .request('/holds/1/payment', { method: 'POST', body: {}, idempotencyKey: 'k' })
      .catch((e: unknown) => e)

    expect(isPaymentPending(err)).toBe(true)
    expect((err as ApiError).retryAfterSeconds).toBe(2)
  })

  it('Problem 이 아닌 본문도 ApiError 로 만들고 requestId 를 헤더에서 줍는다', async () => {
    const api = client(
      async () =>
        new Response('<html>502 Bad Gateway</html>', {
          status: 502,
          headers: { 'X-Request-Id': 'gw-9' },
        }),
    )

    const err = (await api.request('/trips').catch((e: unknown) => e)) as ApiError

    expect(err).toBeInstanceOf(ApiError)
    expect(err.code).toBe('INTERNAL_ERROR')
    expect(err.requestId).toBe('gw-9')
  })
})

describe('타임아웃 — RN 의 fetch 는 스스로 끊지 않는다', () => {
  it('제한을 넘기면 ApiTimeoutError 다. ApiError 가 아니다', async () => {
    const api = client(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('Aborted')))
        }),
      20,
    )

    const err = await api.request('/trips').catch((e: unknown) => e)

    expect(isTimeout(err)).toBe(true)
    expect(err).not.toBeInstanceOf(ApiError)
    expect((err as ApiTimeoutError).requestId).toBe('req-fixed')
  })

  it('호출자가 끊은 것은 타임아웃으로 바꾸지 않는다', async () => {
    const outer = new AbortController()
    const api = client(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('Aborted by caller')))
        }),
      10_000,
    )

    const p = api.request('/trips', { signal: outer.signal }).catch((e: unknown) => e)
    outer.abort()

    expect(isTimeout(await p)).toBe(false)
  })

  it('응답이 제때 오면 타이머가 정리된다', async () => {
    const api = client(async () => jsonResponse(200, { ok: true }), 50)
    await expect(api.request('/trips')).resolves.toEqual({ ok: true })
  })
})
