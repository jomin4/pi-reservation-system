import { QueryClient } from '@tanstack/react-query'
import type { ApiClient, RequestOptions } from '../api/client'
import { ApiError } from '../api/problem'
import { createQueryClient } from '../api/query-client'
import { logout } from './logout'
import { onSessionEnd } from './session'
import { clearTokens, getAccessToken, getRefreshToken, hasSession, setTokens } from './token-store'

const pair = {
  accessToken: 'acc_1',
  refreshToken: 'ref_1',
  accessExpiresAt: '2026-09-04T05:27:33Z',
}

function apiError(status: number, code: string) {
  return new ApiError({ type: 'x', title: 't', status, code: code as never, requestId: 'r' })
}

interface Stub {
  client: ApiClient
  calls: { path: string; opts: RequestOptions | undefined }[]
}

function stub(result: 'ok' | Error): Stub {
  const calls: Stub['calls'] = []
  return {
    calls,
    client: {
      request: <T>(path: string, opts?: RequestOptions) => {
        calls.push({ path, opts })
        return result === 'ok' ? Promise.resolve(undefined as T) : Promise.reject(result as unknown)
      },
    },
  }
}

let queryClient: QueryClient

beforeEach(() => {
  sessionStorage.clear()
  clearTokens()
  queryClient = createQueryClient()
})

describe('로그아웃 — F-25', () => {
  it('POST /auth/logout 을 부른다', async () => {
    setTokens(pair)
    const s = stub('ok')

    await logout(queryClient, { client: s.client })

    expect(s.calls[0]?.path).toBe('/auth/logout')
    expect(s.calls[0]?.opts?.method).toBe('POST')
  })

  it('토큰을 둘 다 버린다 — Access 는 최대 15분 더 살아 있다', async () => {
    setTokens(pair)
    await logout(queryClient, { client: stub('ok').client })

    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
    expect(hasSession()).toBe(false)
  })

  it('세션 종료를 알린다 — 화면이 로그인으로 간다', async () => {
    setTokens(pair)
    const ended: true[] = []
    const off = onSessionEnd(() => ended.push(true))

    await logout(queryClient, { client: stub('ok').client })

    expect(ended).toHaveLength(1)
    off()
  })
})

describe('⚠️ 호출이 실패해도 클라이언트 상태는 비운다', () => {
  it.each([
    ['401 — 이미 죽은 세션', apiError(401, 'UNAUTHENTICATED')],
    ['500 — 서버가 흔들려도', apiError(500, 'INTERNAL_ERROR')],
    ['네트워크 끊김', new TypeError('Failed to fetch')],
  ])('%s', async (_label, error) => {
    setTokens(pair)
    const ended: true[] = []
    const off = onSessionEnd(() => ended.push(true))

    // 던지지 않는다 — 로그아웃 버튼이 에러를 띄우면 안 된다
    await expect(logout(queryClient, { client: stub(error).client })).resolves.toBeUndefined()

    // 서버가 Refresh 를 못 지웠어도 이 브라우저에서는 끝이다
    expect(hasSession()).toBe(false)
    expect(getAccessToken()).toBeNull()
    expect(ended).toHaveLength(1)
    off()
  })
})

describe('⚠️ 캐시를 비운다 — 남의 예약이 다음 로그인에 비치면 안 된다', () => {
  it('쌓인 쿼리 데이터가 사라진다', async () => {
    setTokens(pair)
    queryClient.setQueryData(['reservations'], { content: [{ reservationNo: '48207315' }] })
    queryClient.setQueryData(['me'], { email: 'hong@example.com' })

    expect(queryClient.getQueryData(['reservations'])).toBeDefined()

    await logout(queryClient, { client: stub('ok').client })

    expect(queryClient.getQueryData(['reservations'])).toBeUndefined()
    expect(queryClient.getQueryData(['me'])).toBeUndefined()
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })

  it('호출이 실패해도 캐시는 비운다', async () => {
    queryClient.setQueryData(['me'], { email: 'hong@example.com' })
    await logout(queryClient, { client: stub(apiError(500, 'INTERNAL_ERROR')).client })

    expect(queryClient.getQueryData(['me'])).toBeUndefined()
  })

  it('⚠️ 날아가 있던 조회가 캐시를 다시 채우지 못한다', async () => {
    let resolveLate: ((v: unknown) => void) | null = null
    const late = new Promise((r) => {
      resolveLate = r
    })

    const pending = queryClient.fetchQuery({
      queryKey: ['reservations'],
      queryFn: () => late,
    })
    // 실패는 무시한다 — 취소되는 게 이 테스트의 목적이다
    pending.catch(() => undefined)

    await logout(queryClient, { client: stub('ok').client })
    resolveLate?.({ content: [{ reservationNo: '이전-사용자' }] })
    await Promise.resolve()

    expect(queryClient.getQueryData(['reservations'])).toBeUndefined()
  })
})
