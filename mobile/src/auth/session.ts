import { clearTokens, getRefreshToken, saveTokens, type TokenPair } from './tokens'

/**
 * Refresh 회전 — `F-26`.
 *
 * ⚠️ **이 파일의 존재 이유는 「단일 비행」이다.**
 *
 * 계약이 **회전 + 재사용 탐지**를 한다 (`openapi.yaml` `/auth/refresh`).
 *
 * > 폐기된 토큰이 다시 오면 **탈취로 본다.** 그 회원의 Refresh 를 **전부 폐기**한다.
 *
 * 그래서 **동시에 두 번 회전하면 안 된다.** 좌석맵·예약목록·프로필이 한 화면에서
 * 동시에 `401` 을 받는 건 흔한 일인데, 각자 회전하면 **두 번째가 이미 죽은 토큰을
 * 들고 가서 재사용으로 판정**된다 — 사용자는 아무 잘못 없이 **통째로 로그아웃**된다.
 *
 * **진행 중인 회전이 있으면 그 약속을 같이 기다린다.**
 */

type Refresher = (refreshToken: string) => Promise<TokenPair>

let inFlight: Promise<boolean> | null = null
let onSessionLost: (() => void) | null = null

/** 재사용 탐지·만료로 세션이 죽었을 때 화면이 로그인으로 보내게 한다 */
export function setOnSessionLost(fn: (() => void) | null): void {
  onSessionLost = fn
}

/**
 * 성공하면 `true`. **여러 번 불러도 회전은 한 번만 일어난다.**
 *
 * ⚠️ 실패는 **되살릴 수 없는 상태**다 — 토큰을 지우고 로그인으로 보낸다.
 *    여기서 재시도하지 않는다. 재시도가 곧 재사용이다.
 */
export function rotateRefresh(refresher: Refresher): Promise<boolean> {
  if (inFlight !== null) return inFlight

  inFlight = (async () => {
    try {
      const refreshToken = await getRefreshToken()
      if (refreshToken === null) return false

      const pair = await refresher(refreshToken)
      await saveTokens(pair)
      return true
    } catch {
      // 만료든 재사용 탐지든 밖에서는 구분되지 않는다 (`openapi.yaml`).
      // 어느 쪽이든 이 기기의 세션은 끝났다.
      await clearTokens()
      onSessionLost?.()
      return false
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/** 테스트 전용 */
export function __resetInFlightForTest(): void {
  inFlight = null
}
