import type { ApiClient, RequestOptions } from '../api/client'
import { ApiError } from '../api/problem'
import { createRefresher, onSessionEnd, resetInflight } from './session'
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from './token-store'

const pair = {
  accessToken: 'acc_1',
  refreshToken: 'ref_1',
  accessExpiresAt: '2026-09-04T05:27:33Z',
}

function problem(status: number, code: string) {
  return new ApiError({
    type: 'x',
    title: 't',
    status,
    code: code as never,
    requestId: 'r',
  })
}

interface Recorder {
  client: ApiClient
  calls: { path: string; opts: RequestOptions | undefined }[]
  resolveWith: (value: unknown) => void
  rejectWith: (e: unknown) => void
}

/** 응답 시점을 테스트가 쥔다 — 단일 비행을 보려면 갱신이 떠 있는 동안 또 불러야 한다 */
function recorder(): Recorder {
  const calls: Recorder['calls'] = []
  let settle: { resolve: (v: unknown) => void; reject: (e: unknown) => void } | null = null

  const client: ApiClient = {
    request: <T>(path: string, opts?: RequestOptions) => {
      calls.push({ path, opts })
      return new Promise<T>((resolve, reject) => {
        settle = { resolve: resolve as (v: unknown) => void, reject }
      })
    },
  }

  return {
    client,
    calls,
    resolveWith: (v) => settle?.resolve(v),
    rejectWith: (e) => settle?.reject(e),
  }
}

beforeEach(() => {
  sessionStorage.clear()
  clearTokens()
  resetInflight()
})

describe('갱신 성공', () => {
  it('새 토큰 쌍을 저장한다 — 회전이라 Refresh 도 바뀐다', async () => {
    setTokens(pair)
    const r = recorder()
    const refresh = createRefresher({ client: r.client })

    const p = refresh()
    r.resolveWith({ ...pair, accessToken: 'acc_2', refreshToken: 'ref_2' })

    await expect(p).resolves.toBe(true)
    expect(getAccessToken()).toBe('acc_2')
    expect(getRefreshToken()).toBe('ref_2')
  })

  it('Refresh 를 본문으로 보낸다 — Authorization 헤더가 아니다', async () => {
    setTokens(pair)
    const r = recorder()
    const refresh = createRefresher({ client: r.client })

    const p = refresh()
    r.resolveWith(pair)
    await p

    expect(r.calls[0]?.path).toBe('/auth/refresh')
    expect(r.calls[0]?.opts?.method).toBe('POST')
    expect(r.calls[0]?.opts?.body).toEqual({ refreshToken: 'ref_1' })
  })
})

describe('⚠️ 동시에 온 401 을 한 번의 갱신으로 합친다', () => {
  it('세 번 불러도 서버는 한 번만 호출된다', async () => {
    setTokens(pair)
    const r = recorder()
    const refresh = createRefresher({ client: r.client })

    const all = Promise.all([refresh(), refresh(), refresh()])
    r.resolveWith({ ...pair, refreshToken: 'ref_2' })

    // 세 번 회전하면 두 번째부터 죽은 Refresh 를 보내는 것이라
    // 서버가 탈취로 보고 그 회원의 Refresh 를 전부 폐기한다 (api.md §5.5)
    expect(r.calls).toHaveLength(1)
    await expect(all).resolves.toEqual([true, true, true])
  })

  it('끝난 뒤에는 다시 갱신할 수 있다 — 한 번으로 영영 잠기면 안 된다', async () => {
    setTokens(pair)
    const r = recorder()
    const refresh = createRefresher({ client: r.client })

    const first = refresh()
    r.resolveWith(pair)
    await first

    const second = refresh()
    r.resolveWith(pair)
    await second

    expect(r.calls).toHaveLength(2)
  })
})

describe('갱신 실패', () => {
  it('Refresh 가 아예 없으면 서버를 안 부른다', async () => {
    const r = recorder()
    const refresh = createRefresher({ client: r.client })

    await expect(refresh()).resolves.toBe(false)
    expect(r.calls).toHaveLength(0)
  })

  it('⚠️ 401 이면 세션을 끝낸다 — 만료든 재사용 탐지든 밖에서는 같다', async () => {
    setTokens(pair)
    const ended: true[] = []
    const off = onSessionEnd(() => ended.push(true))

    const r = recorder()
    const refresh = createRefresher({ client: r.client })
    const p = refresh()
    r.rejectWith(problem(401, 'UNAUTHENTICATED'))

    await expect(p).resolves.toBe(false)
    expect(getRefreshToken()).toBeNull()
    expect(ended).toHaveLength(1)
    off()
  })

  it('⚠️ 5xx 는 세션을 버릴 이유가 아니다 — 토큰을 남긴다', async () => {
    setTokens(pair)
    const ended: true[] = []
    const off = onSessionEnd(() => ended.push(true))

    const r = recorder()
    const refresh = createRefresher({ client: r.client })
    const p = refresh()
    r.rejectWith(problem(500, 'INTERNAL_ERROR'))

    await expect(p).resolves.toBe(false)
    expect(getRefreshToken()).toBe('ref_1')
    expect(ended).toHaveLength(0)
    off()
  })

  it('네트워크 오류도 세션을 안 버린다', async () => {
    setTokens(pair)
    const r = recorder()
    const refresh = createRefresher({ client: r.client })
    const p = refresh()
    r.rejectWith(new TypeError('Failed to fetch'))

    await expect(p).resolves.toBe(false)
    expect(getRefreshToken()).toBe('ref_1')
  })

  it('실패해도 다음 시도가 막히지 않는다', async () => {
    setTokens(pair)
    const r = recorder()
    const refresh = createRefresher({ client: r.client })

    const first = refresh()
    r.rejectWith(problem(500, 'INTERNAL_ERROR'))
    await first

    const second = refresh()
    r.resolveWith(pair)
    await expect(second).resolves.toBe(true)
  })
})

describe('onSessionEnd', () => {
  it('구독을 해제할 수 있다', async () => {
    setTokens(pair)
    const ended: true[] = []
    const off = onSessionEnd(() => ended.push(true))
    off()

    const r = recorder()
    const p = createRefresher({ client: r.client })()
    r.rejectWith(problem(401, 'UNAUTHENTICATED'))
    await p

    expect(ended).toHaveLength(0)
  })
})
