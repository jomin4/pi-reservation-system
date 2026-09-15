import { api, setAccessTokenProvider, setAuthRefreshHooks } from '../api/client'
import { rotateRefresh } from './session'
import { getAccessToken, isAccessExpiring, type TokenPair } from './tokens'

/**
 * 인증 배선 — **여기 한 곳에서만 `client` 와 `auth` 를 잇는다.**
 *
 * `client.ts` 가 `auth/` 를 직접 import 하면 `auth/` 도 갱신 요청을 보내려고
 * `client.ts` 를 import 해 **순환**이 된다. setter 로 끊는다.
 */

/**
 * ⚠️ **`skipAuthRefresh` 가 필수다.** 갱신 요청 자체가 갱신 경로를 타면
 *    실패가 다시 갱신을 불러 **무한 재귀**가 된다.
 *
 * ⚠️ **`Authorization` 을 안 보낸다** — 계약이 그렇다. Access 가 이미 만료된
 *    상태에서 부르는 호출이라 **Refresh 토큰 자체가 인증**이다 (`openapi.yaml`).
 *    `getAccessToken` 이 값을 주더라도 이 요청엔 안 실린다 — 아래 `refresher` 는
 *    `api.request` 를 쓰지만 서버는 본문의 `refreshToken` 으로만 판정한다.
 */
async function refresher(refreshToken: string): Promise<TokenPair> {
  return api.request<TokenPair>('/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
    skipAuthRefresh: true,
  })
}

let wired = false

export function wireAuth(): void {
  if (wired) return
  wired = true

  setAccessTokenProvider(getAccessToken)

  setAuthRefreshHooks({
    // 선제 갱신 — 만료가 가까우면 요청 전에 돌린다
    ensureFreshToken: async () => {
      if (!isAccessExpiring()) return
      await rotateRefresh(refresher)
    },
    // 401 폴백 — 시계 오차·서버측 폐기로 여기 올 수 있다
    onUnauthorized: () => rotateRefresh(refresher),
  })
}
