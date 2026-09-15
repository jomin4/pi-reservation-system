import { createApiClient } from './client'
import { ApiError } from './problem'

/**
 * `401` 폴백 — 한 번만 되살린다 (`F-26`).
 *
 * ⚠️ **두 번 갱신하면 안 된다.** 갱신 후에도 `401` 이면 세션이 끝난 것이고,
 *    거기서 또 갱신하면 폐기된 토큰을 다시 보내 **재사용 탐지**에 걸린다.
 */

const BASE = 'http://test/api/v1'

function unauthorized(): Response {
  return new Response(
    JSON.stringify({
      type: 'about:blank',
      title: '인증이 필요합니다',
      status: 401,
      code: 'UNAUTHENTICATED',
      requestId: 'r-1',
    }),
    { status: 401, headers: { 'Content-Type': 'application/problem+json' } },
  )
}

describe('401 → 갱신 → 원요청 재시도', () => {
  it('갱신에 성공하면 같은 요청을 다시 보내고 결과를 준다', async () => {
    let attempts = 0
    let refreshes = 0

    const api = createApiClient({
      baseUrl: BASE,
      fetchImpl: async () => {
        attempts += 1
        if (attempts === 1) return unauthorized()
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
      onUnauthorized: async () => {
        refreshes += 1
        return true
      },
    })

    await expect(api.request('/me')).resolves.toEqual({ ok: true })
    expect(attempts).toBe(2)
    expect(refreshes).toBe(1)
  })

  it('⚠️ 갱신 후에도 401 이면 거기서 멈춘다 — 두 번째 갱신은 없다', async () => {
    let attempts = 0
    let refreshes = 0

    const api = createApiClient({
      baseUrl: BASE,
      fetchImpl: async () => {
        attempts += 1
        return unauthorized()
      },
      onUnauthorized: async () => {
        refreshes += 1
        return true
      },
    })

    const err = (await api.request('/me').catch((e: unknown) => e)) as ApiError

    expect(err).toBeInstanceOf(ApiError)
    expect(err.status).toBe(401)
    expect(attempts).toBe(2)
    // 재사용 탐지를 부르지 않는다
    expect(refreshes).toBe(1)
  })

  it('갱신이 실패하면 재시도하지 않는다', async () => {
    let attempts = 0

    const api = createApiClient({
      baseUrl: BASE,
      fetchImpl: async () => {
        attempts += 1
        return unauthorized()
      },
      onUnauthorized: async () => false,
    })

    await expect(api.request('/me')).rejects.toBeInstanceOf(ApiError)
    expect(attempts).toBe(1)
  })

  it('⚠️ skipAuthRefresh 면 갱신 경로를 안 탄다 — 무한 재귀 방지', async () => {
    let refreshes = 0

    const api = createApiClient({
      baseUrl: BASE,
      fetchImpl: async () => unauthorized(),
      ensureFreshToken: async () => {
        refreshes += 1
      },
      onUnauthorized: async () => {
        refreshes += 1
        return true
      },
    })

    await expect(
      api.request('/auth/refresh', { method: 'POST', body: {}, skipAuthRefresh: true }),
    ).rejects.toBeInstanceOf(ApiError)

    expect(refreshes).toBe(0)
  })
})

describe('선제 갱신 — 401 을 받기 전에 돈다', () => {
  it('요청 전에 ensureFreshToken 이 먼저 불린다', async () => {
    const order: string[] = []

    const api = createApiClient({
      baseUrl: BASE,
      fetchImpl: async () => {
        order.push('fetch')
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
      ensureFreshToken: async () => {
        order.push('refresh')
      },
    })

    await api.request('/me')
    expect(order).toEqual(['refresh', 'fetch'])
  })
})
