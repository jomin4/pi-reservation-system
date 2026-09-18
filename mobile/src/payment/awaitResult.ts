import { api, isPaymentPending, isTimeout, type ApiClient } from '../api'
import type { components } from '../api/schema'

export type Reservation = components['schemas']['Reservation']

/**
 * 결제 결과를 **묻는다.** 다시 결제하는 게 아니다 (`api.md` §5.3 · `E-03`).
 *
 * > **메서드가 `GET` 인 게 계약의 핵심이다.** 클라이언트가 이걸 `POST` 로
 * > 착각하면 **이중 결제**가 난다.
 *
 * 여기 오는 길이 둘인데 **둘 다 「답을 모른다」** 는 같은 상태다.
 *
 * | 길 | 무슨 일이 있었나 |
 * |---|---|
 * | `202 PAYMENT_PENDING` | 서버가 **아직 모른다고 답했다.** `Retry-After` 가 간격의 근거다 |
 * | `ApiTimeoutError` | **답 자체가 없었다.** 서버가 처리했는지 안 했는지도 모른다 |
 *
 * ⚠️ **두 번째가 모바일에서 훨씬 흔하다.** 지하로 들어가면 소켓은 조용히 죽는다.
 *    이때 `POST` 를 다시 부르는 것이 이 프로젝트에서 가장 비싼 실수다.
 */

/** `Retry-After` 가 없을 때. 계약의 예시값이 `2` 다 */
const FALLBACK_RETRY_MS = 2000

/** 5회 × 2초 ≈ 10초. 넘으면 사용자에게 돌려준다 — 화면을 영원히 잡아두지 않는다 */
export const DEFAULT_ATTEMPTS = 5

export interface AwaitResultOptions {
  attempts?: number
  /** 첫 조회 전 기다릴 시간. `202` 의 `Retry-After` 를 그대로 넣는다 */
  initialDelayMs?: number
  client?: Pick<ApiClient, 'request'>
  sleep?: (ms: number) => Promise<void>
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

export async function awaitPaymentResult(
  holdId: string,
  options: AwaitResultOptions = {},
): Promise<Reservation> {
  const { attempts = DEFAULT_ATTEMPTS, client = api, sleep = wait } = options

  let delayMs = options.initialDelayMs ?? 0
  let lastUnknown: unknown = null

  for (let i = 0; i < attempts; i += 1) {
    if (delayMs > 0) await sleep(delayMs)

    try {
      return await client.request<Reservation>(`/holds/${holdId}/payment`)
    } catch (error) {
      // 서버가 "아직 모른다" 고 답했다 — 그 간격만큼 기다렸다 다시 묻는다
      if (isPaymentPending(error)) {
        lastUnknown = error
        delayMs = (error.retryAfterSeconds ?? FALLBACK_RETRY_MS / 1000) * 1000
        continue
      }

      // ⚠️ **조회가 타임아웃된 건 다시 물어도 된다.** `GET` 이라 부작용이 없다 —
      //    `POST` 였다면 여기서 멈춰야 한다.
      if (isTimeout(error)) {
        lastUnknown = error
        delayMs = FALLBACK_RETRY_MS
        continue
      }

      // 402 거절 · 410 만료 · 200 확정은 전부 **답이다.** 그대로 올려보낸다
      throw error
    }
  }

  // ⚠️ 조용히 실패로 뭉개지 않는다. **모른다는 것이 결과다** — `E-03` (#53)이 이 위에 뜬다
  throw lastUnknown ?? new Error(`결제 결과를 ${attempts}회 물었지만 답을 받지 못했다.`)
}
