import { createApiClient, DEFAULT_BASE_URL } from '../api/client'
import type { ApiClient } from '../api/client'
import { hasErrorCode } from '../api/problem'
import type { TokenPair } from './token-store'
import { clearTokens, getRefreshToken, setTokens } from './token-store'

export interface SessionOptions {
  baseUrl?: string
  /** 테스트가 갈아끼운다 */
  client?: ApiClient
}

/**
 * ⚠️ **갱신 전용 클라이언트는 재시도 훅을 안 단다.**
 * 갱신이 `401` 을 받았을 때 또 갱신하러 들어가면 무한 재귀다.
 */
function bareClient(options: SessionOptions): ApiClient {
  return options.client ?? createApiClient({ baseUrl: options.baseUrl ?? DEFAULT_BASE_URL })
}

type Listener = () => void
const sessionEndListeners = new Set<Listener>()

/** 세션이 끝났다 — 화면은 로그인으로 보낸다 (#67 라우트 가드가 구독한다) */
export function onSessionEnd(fn: Listener): () => void {
  sessionEndListeners.add(fn)
  return () => sessionEndListeners.delete(fn)
}

/**
 * 토큰을 버리고 구독자에게 알린다.
 *
 * 갱신 실패(`401`)와 **명시적 로그아웃**(`logout.ts`)이 같은 문을 쓴다 —
 * 화면 입장에서는 둘 다 "세션이 끝났다" 하나다.
 */
export function endSession(): void {
  clearTokens()
  for (const fn of sessionEndListeners) fn()
}

/**
 * ⚠️ **동시에 온 `401` 을 한 번의 갱신으로 합친다.**
 *
 * 좌석맵 · 선점 · 내 정보가 같이 나가는 화면에서 Access 가 만료되면 `401` 이 셋 온다.
 * 각자 갱신하면 **회전이 세 번** 돈다 — 두 번째부터는 이미 죽은 Refresh 를 보내는 것이라
 * 서버가 **탈취로 보고 그 회원의 Refresh 를 전부 폐기**한다 (`api.md` §5.5 재사용 탐지).
 *
 * **단일 비행(single-flight)이 최적화가 아니라 정확성이다.**
 */
let inflight: Promise<boolean> | null = null

export function createRefresher(options: SessionOptions = {}) {
  return async function refreshAccessToken(): Promise<boolean> {
    if (inflight) return inflight

    inflight = (async () => {
      const refreshToken = getRefreshToken()
      if (refreshToken === null) {
        endSession()
        return false
      }

      try {
        const pair = await bareClient(options).request<TokenPair>('/auth/refresh', {
          method: 'POST',
          body: { refreshToken },
        })
        // 회전이라 Refresh 도 새 값이다. 옛 값을 남겨두면 다음 갱신이 재사용 탐지에 걸린다
        setTokens(pair)
        return true
      } catch (e) {
        // 만료든 재사용 탐지든 밖에서는 구분되지 않는다 (`api.md` §5.5). 둘 다 재로그인이다
        if (hasErrorCode(e, 'UNAUTHENTICATED', 'INVALID_CREDENTIALS')) {
          endSession()
          return false
        }
        // 네트워크 · 5xx 는 세션을 버릴 이유가 아니다. 다음 요청이 다시 시도한다
        return false
      } finally {
        inflight = null
      }
    })()

    return inflight
  }
}

/** 테스트 격리용 — 진행 중인 갱신을 버린다 */
export function resetInflight(): void {
  inflight = null
}
