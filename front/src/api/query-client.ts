import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './problem'

const MAX_RETRY = 2

/**
 * ⚠️ **4xx 를 재시도하지 않는다.**
 *
 * | 상황 | 왜 재시도가 틀렸나 |
 * |---|---|
 * | `409 SEAT_ALREADY_HELD` | 남이 가진 좌석이다. 백 번 더 물어도 같다 |
 * | `410 HOLD_EXPIRED` | 시간이 지났다. 되살아나지 않는다 |
 * | `402 PAYMENT_DECLINED` | 승인 거절이다 |
 * | `202 PAYMENT_PENDING` | **`Retry-After` 를 보고 화면이 폴링한다.** 자동 재시도가 끼어들면 안 된다 |
 *
 * `operate.md` §6.4 가 에러율 메트릭에서 `4xx` 를 빼는 것과 같은 판단이다 —
 * **경합은 정상 결과지 장애가 아니다.**
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status >= 500 && failureCount < MAX_RETRY
  }
  // 네트워크가 끊긴 경우 등 — 응답 자체가 없었다
  return failureCount < MAX_RETRY
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        // ⚠️ 좌석맵은 800석이다. 포커스마다 전체를 다시 받으면 안 된다 —
        //    갱신은 SSE 델타가 한다 (`api.md` §6).
        refetchOnWindowFocus: false,
      },
      // ⚠️ 뮤테이션은 절대 자동 재시도하지 않는다. 결제가 여기 들어있다.
      mutations: { retry: false },
    },
  })
}
