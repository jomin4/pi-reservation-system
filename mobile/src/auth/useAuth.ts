import { useSyncExternalStore } from 'react'

import { setOnSessionLost } from './session'
import { clearTokens, getRefreshToken, saveTokens, type TokenPair } from './tokens'

/**
 * 세션 상태 — **SecureStore 의 Refresh 가 있으면 로그인된 것으로 본다.**
 *
 * ⚠️ **`loading` 이 반드시 있어야 한다.** 앱을 막 켠 순간에는 SecureStore 를
 *    아직 못 읽었다. 그 찰나를 `anon` 으로 보면 **가드가 매번 로그인으로 튕긴다** —
 *    앱을 껐다 켤 때마다 로그아웃된 것처럼 보인다.
 */
export type AuthStatus = 'loading' | 'authed' | 'anon'

let status: AuthStatus = 'loading'
const listeners = new Set<() => void>()

function set(next: AuthStatus): void {
  if (status === next) return
  status = next
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAuthStatus(): AuthStatus {
  return useSyncExternalStore(
    subscribe,
    () => status,
    () => status,
  )
}

let restored = false

/**
 * 앱 시작 시 한 번. **Refresh 가 남아 있으면 로그인 상태로 복원한다.**
 *
 * > **Access 는 복원하지 않는다.** 메모리라 이미 없고, 첫 요청의 **선제 갱신**이
 * > 알아서 받아온다 (`wire.ts`). 여기서 미리 회전하면 앱 시작이 네트워크에 묶인다.
 */
export async function restoreSession(): Promise<void> {
  if (restored) return
  restored = true

  // 세션이 죽으면(재사용 탐지·만료) 화면이 로그인으로 가야 한다
  setOnSessionLost(() => set('anon'))

  const refreshToken = await getRefreshToken()
  set(refreshToken === null ? 'anon' : 'authed')
}

/** 로그인 성공 (`F-24`) */
export async function signIn(pair: TokenPair): Promise<void> {
  await saveTokens(pair)
  set('authed')
}

/**
 * 로그아웃 (`F-25`).
 *
 * ⚠️ **서버 호출이 실패해도 로컬은 지운다.** 기기에서 나가는 게 사용자가 원한 것이고,
 *    Refresh 를 들고 있으면 다음 실행에서 다시 로그인된 것처럼 보인다.
 */
export async function signOut(): Promise<void> {
  await clearTokens()
  set('anon')
}

/** 테스트 전용 */
export function __resetAuthForTest(): void {
  restored = false
  status = 'loading'
}
