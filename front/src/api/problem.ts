import type { components } from './schema'

/**
 * ⚠️ 이 파일은 타입을 만들지 않는다. `schema.d.ts` 에서 가져다 이름만 붙인다.
 *    계약(`docs/api/openapi.yaml`)이 진실이고 여기서 손으로 고치면 어긋난다 (ADR-0007).
 */
export type ErrorCode = components['schemas']['ErrorCode']
export type Problem = components['schemas']['Problem']
export type ValidationProblem = components['schemas']['ValidationProblem']
export type SeatConflictProblem = components['schemas']['SeatConflictProblem']
export type FailedSeat = components['schemas']['FailedSeat']

/**
 * 서버가 내려준 RFC 9457 Problem 하나 (`api.md` §4.1).
 *
 * ⚠️ **화면은 `status` 가 아니라 `code` 로 분기한다.** 같은 `409` 에 여러 code 가 있고,
 *    `SEAT_ALREADY_HELD`(다른 좌석을 고르게) 와 `SEAT_LOCK_TIMEOUT`(다시 시도) 은
 *    사용자에게 할 말이 정반대다.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: ErrorCode
  /** 사용자가 문의할 때 유일한 단서. 화면에 띄워 로그를 추적한다 (`api.md` §4.1) */
  readonly requestId: string
  readonly detail: string | undefined
  readonly problem: Problem
  /** `202` · `429` 의 `Retry-After` 초. 없으면 `null` */
  readonly retryAfterSeconds: number | null

  constructor(problem: Problem, retryAfterSeconds: number | null = null) {
    super(`${problem.code} (${problem.status}) ${problem.title}`)
    this.name = 'ApiError'
    this.status = problem.status
    this.code = problem.code
    this.requestId = problem.requestId
    this.detail = problem.detail
    this.problem = problem
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError
}

/** `code` 로 좁힌다. `if (hasErrorCode(e, 'SEAT_ALREADY_HELD')) …` */
export function hasErrorCode<C extends ErrorCode>(
  e: unknown,
  ...codes: readonly C[]
): e is ApiError & { readonly code: C } {
  return isApiError(e) && (codes as readonly ErrorCode[]).includes(e.code)
}

/**
 * ⚠️ `failedSeats` 는 `SEAT_ALREADY_HELD` 에만 있다.
 *    `SEAT_LOCK_TIMEOUT` 은 **어느 좌석이 문제인지 서버도 모른다** — 잠그지 못했으니까.
 */
export function isSeatConflict(
  e: unknown,
): e is ApiError & { readonly problem: SeatConflictProblem } {
  return hasErrorCode(e, 'SEAT_ALREADY_HELD')
}

export function isValidationFailed(
  e: unknown,
): e is ApiError & { readonly problem: ValidationProblem } {
  return hasErrorCode(e, 'VALIDATION_FAILED')
}

/**
 * ⚠️ **`202` 는 에러가 아니라 "아직 모른다" 다.** 그래도 던진다 — 아래 `client.ts` 참조.
 *    이걸 잡으면 `GET /holds/{id}/payment` 로 폴링한다. **`POST` 로 다시 부르면 이중 결제다.**
 */
export function isPaymentPending(e: unknown): e is ApiError {
  return hasErrorCode(e, 'PAYMENT_PENDING')
}

/**
 * 응답 본문이 Problem 인지 구조로 본다.
 *
 * > **Zod 를 쓰지 않았다.** 스키마를 손으로 한 벌 더 쓰는 순간 `schema.d.ts` 와
 * > 어긋날 수 있는 곳이 하나 늘어난다. 여기서 필요한 건 "이 unknown 을 Problem 으로
 * > 봐도 되나" 뿐이고, 그건 필수 5필드로 충분하다.
 */
export function isProblem(v: unknown): v is Problem {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Record<string, unknown>
  return (
    typeof p['type'] === 'string' &&
    typeof p['title'] === 'string' &&
    typeof p['status'] === 'number' &&
    typeof p['code'] === 'string' &&
    typeof p['requestId'] === 'string'
  )
}

/**
 * Problem 이 아닌 본문(게이트웨이 HTML · 빈 응답 등)도 ApiError 로 만든다.
 * `requestId` 는 헤더에서 줍는다 — **단서를 잃지 않는 게 이 함수의 목적**이다.
 */
export function toProblem(status: number, body: unknown, requestIdHeader: string | null): Problem {
  if (isProblem(body)) return body
  return {
    type: 'about:blank',
    title: '일시적인 오류가 발생했습니다',
    status,
    code: 'INTERNAL_ERROR',
    requestId: requestIdHeader ?? '',
  }
}
