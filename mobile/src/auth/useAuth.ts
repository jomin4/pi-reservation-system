import { useSyncExternalStore } from 'react'

/**
 * ⚠️ **자리만 잡아둔 것이다.** 실제 토큰 저장·회전은 #84(SecureStore)가 채운다.
 *
 * 지금 필요한 건 하나다 — **가드 동선이 실제로 도는가.** 로그인 화면으로 튕기고
 * 원래 가려던 곳으로 돌아오는지는 `isAuthed` 가 가짜여도 전부 확인된다.
 *
 * > **가짜 데이터를 화면에 `return` 하는 것과 다르다** (`mobile/CLAUDE.md` 금지 1번).
 * > 저건 **네트워크 응답**을 지어내 로딩·에러 화면을 못 만들게 하는 것이고,
 * > 이건 **아직 안 만든 저장소**의 인터페이스를 먼저 고정하는 것이다.
 * > #84 가 이 파일의 속을 갈아도 **화면은 한 줄도 안 바뀐다.**
 */

let authed = false
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useIsAuthenticated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => authed,
    () => authed,
  )
}

/** #84 가 오면 **SecureStore 읽기**로 바뀐다 */
export function signIn(): void {
  authed = true
  emit()
}

/** `F-25` 로그아웃 — #84 가 Refresh 삭제를 여기 붙인다 */
export function signOut(): void {
  authed = false
  emit()
}
