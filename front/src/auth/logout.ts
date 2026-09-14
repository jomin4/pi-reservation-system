import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { ApiClient } from '../api/client'
import { endSession } from './session'

export interface LogoutOptions {
  /** 테스트가 갈아끼운다 */
  client?: ApiClient
}

/**
 * 로그아웃 (`F-25` · `api.md` §5.5).
 *
 * 서버는 Redis 에서 Refresh 를 지운다. 하지만 **Access 토큰은 최대 15분 더 산다** —
 * 무상태 JWT 의 대가다. 그래서 계약이 **"클라이언트는 저장된 토큰을 즉시 버려야 한다"** 고
 * 못 박았고, 이 함수가 그걸 한다.
 *
 * ⚠️ **호출이 실패해도 클라이언트 상태는 비운다.** 서버가 Refresh 를 못 지웠어도
 * **이 브라우저에서는 끝이다.** 네트워크가 끊겼다고 로그아웃 버튼이 안 먹으면 안 된다.
 */
export async function logout(queryClient: QueryClient, options: LogoutOptions = {}): Promise<void> {
  const client = options.client ?? api

  try {
    await client.request('/auth/logout', { method: 'POST' })
  } catch {
    // 삼킨다 — 아래 정리는 무조건 돈다
  } finally {
    // ⚠️ 취소를 먼저 한다. 날아가 있던 조회가 나중에 응답하면
    //    비운 캐시를 **이전 사용자 데이터로 다시 채운다.**
    try {
      await queryClient.cancelQueries()
    } catch {
      // 취소에 실패해도 아래 clear 는 해야 한다
    }
    // 남의 예약이 다음 로그인 화면에 비치면 안 된다
    queryClient.clear()
    endSession()
  }
}

/** 헤더 버튼이 쓰는 형태 (#67) */
export function useLogout(): () => Promise<void> {
  const queryClient = useQueryClient()
  return useCallback(() => logout(queryClient), [queryClient])
}
