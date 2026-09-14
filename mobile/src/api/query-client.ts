import { QueryClient } from '@tanstack/react-query'

import { ApiTimeoutError } from './client'
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
 *
 * ⚠️ **`409 SEAT_LOCK_TIMEOUT` 도 여기서 재시도하지 않는다.** 다시 시도하면
 *    성공할 수 있는 유일한 `4xx` 지만(`api.md` §4.3), **사용자가 누르게 한다.**
 *    좌석 경합에서 화면 뒤 자동 재시도는 "내가 뭘 눌렀는지" 를 흐린다.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status >= 500 && failureCount < MAX_RETRY
  }
  // 응답 자체가 없었다 — 타임아웃 · 네트워크 끊김
  return failureCount < MAX_RETRY
}

/**
 * ⚠️ **타임아웃된 뮤테이션은 재시도가 아니라 폴링이다.**
 *
 * 결제 `POST` 가 타임아웃됐을 때 다시 `POST` 하면 **이중 결제**다 — 멱등키가
 * 막아주긴 하지만 그건 마지막 방어선이지 설계가 아니다. 화면이
 * `GET /holds/{id}/payment` 로 결과를 묻는다 (`E-03` · `api.md` §5.3).
 */
export function isPollable(error: unknown): boolean {
  return error instanceof ApiTimeoutError
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        // ⚠️ 좌석맵은 800석이다. 포커스마다 전체를 다시 받으면 안 된다 —
        //    갱신은 SSE 델타가 한다 (`api.md` §6).
        //
        //    ⚠️ RN 에는 window focus 가 없다. 이 옵션은 그대로 두되,
        //    앱이 백그라운드에서 돌아올 때의 전체 재조회는 `E-04` 가 따로 한다 —
        //    AppState 로 판정하며 TanStack Query 의 focusManager 와 무관하다.
        refetchOnWindowFocus: false,
      },
      // ⚠️ 뮤테이션은 절대 자동 재시도하지 않는다. 결제가 여기 들어있다.
      mutations: { retry: false },
    },
  })
}
