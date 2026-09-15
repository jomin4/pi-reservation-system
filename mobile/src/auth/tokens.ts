import { deleteSecure, readSecure, writeSecure } from './storage'

/**
 * 토큰 보관 — **Access 는 메모리, Refresh 는 SecureStore** (`tech.md`).
 *
 * | 토큰 | 어디 | 왜 |
 * |---|---|---|
 * | Access (15분) | **메모리** | 짧고, 앱이 죽으면 Refresh 로 되살린다 |
 * | **Refresh** (14일) | **SecureStore** | 앱을 껐다 켜는 게 일상이다 |
 * | `accessExpiresAt` | 메모리 | ⚠️ **선제 갱신의 근거** — 아래 |
 *
 * > ⚠️ **`accessExpiresAt` 이 계약에 있는 이유가 선제 갱신이다** (`openapi.yaml`).
 * > `401` 을 받고 나서 갱신하면 **사용자 동작 하나가 이미 실패한 뒤**다.
 */

const REFRESH_KEY = 'auth.refreshToken'

export interface TokenPair {
  accessToken: string
  refreshToken: string
  accessExpiresAt: string
}

let accessToken: string | null = null
let accessExpiresAtMs: number | null = null

/** 갱신을 얼마나 일찍 시작하나. 네트워크 왕복과 시계 오차를 덮는다 */
export const REFRESH_SKEW_MS = 30_000

export function getAccessToken(): string | null {
  return accessToken
}

/**
 * ⚠️ **만료 시각을 모르면 "곧 만료" 로 본다.** 앱을 막 켠 직후가 그 상태다 —
 *    Access 가 메모리라 없고, Refresh 로 새로 받아야 한다.
 */
export function isAccessExpiring(nowMs: number = Date.now()): boolean {
  if (accessToken === null) return true
  if (accessExpiresAtMs === null) return true
  return nowMs >= accessExpiresAtMs - REFRESH_SKEW_MS
}

export async function saveTokens(pair: TokenPair): Promise<void> {
  accessToken = pair.accessToken

  const parsed = Date.parse(pair.accessExpiresAt)
  accessExpiresAtMs = Number.isNaN(parsed) ? null : parsed

  await writeSecure(REFRESH_KEY, pair.refreshToken)
}

export function getRefreshToken(): Promise<string | null> {
  return readSecure(REFRESH_KEY)
}

/** `F-25` 로그아웃 · 재사용 탐지로 세션이 죽었을 때 */
export async function clearTokens(): Promise<void> {
  accessToken = null
  accessExpiresAtMs = null
  await deleteSecure(REFRESH_KEY)
}

/** 테스트 전용 — 메모리만 비운다 (SecureStore 는 건드리지 않는다) */
export function __resetMemoryForTest(): void {
  accessToken = null
  accessExpiresAtMs = null
}
