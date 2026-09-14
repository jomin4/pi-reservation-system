import type { components } from '../api/schema'

export type TokenPair = components['schemas']['TokenPair']

const REFRESH_KEY = 'auth:refresh'

/**
 * ⚠️ **Access 와 Refresh 의 거처가 다르다** (`tech.md` §프론트 계열).
 *
 * | 토큰 | 어디 | 수명 |
 * |---|---|---|
 * | Access (15분) | **메모리** | 페이지 로드 |
 * | Refresh (14일) | **`sessionStorage`** | **탭** |
 *
 * > **`localStorage` 가 아니다.** 거기 두면 탈취된 14일 토큰이 **다음 방문에도 산다.**
 * > 탭이 닫히면 죽는 게 이 선택의 전부다.
 *
 * > **Refresh 를 메모리에 둘 수는 없다.** `POST /auth/refresh` 가 Refresh 를 본문으로
 * > 받으므로 JS 가 들고 있어야 하는데, 메모리면 새로고침 순간 사라져 복구가 불가능하다 —
 * > 선점 TTL 이 10분이라 **그 사이 새로고침 한 번이면 결제를 못 한다.**
 */
let accessToken: string | null = null

/** 시크릿 창 · 저장 차단 설정에서는 접근 자체가 던진다 */
function readRefresh(): string | null {
  try {
    return globalThis.sessionStorage?.getItem(REFRESH_KEY) ?? null
  } catch {
    return null
  }
}

function writeRefresh(value: string | null): void {
  try {
    if (value === null) globalThis.sessionStorage?.removeItem(REFRESH_KEY)
    else globalThis.sessionStorage?.setItem(REFRESH_KEY, value)
  } catch {
    // 저장을 못 해도 이번 탭은 동작해야 한다. 새로고침 복구만 포기된다
  }
}

export function getAccessToken(): string | null {
  return accessToken
}

export function getRefreshToken(): string | null {
  return readRefresh()
}

/** 로그인 · 갱신 응답을 그대로 받는다. **회전이라 Refresh 도 매번 새 값이다** */
export function setTokens(pair: TokenPair): void {
  accessToken = pair.accessToken
  writeRefresh(pair.refreshToken)
}

/**
 * ⚠️ **호출이 실패해도 여기는 반드시 부른다** — 서버의 Refresh 삭제와 별개로
 * 이 브라우저에서는 끝이다 (`api.md` §5.5 로그아웃).
 */
export function clearTokens(): void {
  accessToken = null
  writeRefresh(null)
}

/**
 * 로그인 상태인가. **Access 가 아니라 Refresh 로 판정한다** —
 * 새로고침 직후엔 Access 가 없지만 세션은 살아 있다. 라우트 가드(#67)가 이걸 본다.
 */
export function hasSession(): boolean {
  return readRefresh() !== null
}
