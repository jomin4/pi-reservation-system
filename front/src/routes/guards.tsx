import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { hasSession } from '../auth'
import { PATHS } from './paths'

/** 로그인 뒤 돌아갈 자리. `RequireAuth` 가 심고 `W-07` 이 읽는다 */
export interface FromState {
  from?: string
}

/**
 * 보호 라우트.
 *
 * ⚠️ **로그인으로 보내면서 원래 자리를 들고 간다** — `#28` 의 완료 조건
 * 「비로그인이면 로그인 후 이 화면으로 복귀」가 여기서 실현된다.
 * 좌석을 고르다 튕긴 사용자를 홈으로 보내면 처음부터 다시 해야 한다.
 *
 * > **`replace` 를 쓴다.** 뒤로가기를 눌렀을 때 다시 보호 라우트로 돌아와
 * > 또 튕기는 반복을 막는다.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation()

  if (!hasSession()) {
    const from = `${location.pathname}${location.search}`
    return <Navigate to={PATHS.login} state={{ from } satisfies FromState} replace />
  }
  return <>{children}</>
}

/**
 * 로그인 · 회원가입 전용.
 *
 * 이미 로그인한 사용자가 `/login` 에 들어오면 홈으로 돌린다 — 로그인 폼을 다시
 * 제출하면 **회전이 한 번 더 돌아** 지금 쓰던 Refresh 가 죽는다.
 */
export function RequireAnonymous({ children }: { children: ReactNode }) {
  if (hasSession()) return <Navigate to={PATHS.home} replace />
  return <>{children}</>
}
