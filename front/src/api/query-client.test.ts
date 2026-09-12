import type { ErrorCode } from './problem'
import { ApiError } from './problem'
import { createQueryClient, shouldRetry } from './query-client'
import { problemOf } from './test-helpers'

const err = (status: number, code: ErrorCode) => new ApiError(problemOf({ status, code }))

describe('⚠️ 4xx 는 재시도하지 않는다', () => {
  it.each([
    ['409 SEAT_ALREADY_HELD — 남이 가진 좌석이다', 409, 'SEAT_ALREADY_HELD'],
    ['409 SEAT_LOCK_TIMEOUT — 재시도는 화면이 시킨다', 409, 'SEAT_LOCK_TIMEOUT'],
    ['410 HOLD_EXPIRED — 되살아나지 않는다', 410, 'HOLD_EXPIRED'],
    ['402 PAYMENT_DECLINED — 승인 거절이다', 402, 'PAYMENT_DECLINED'],
    ['401 UNAUTHENTICATED — 갱신은 #69 가 한다', 401, 'UNAUTHENTICATED'],
    ['400 VALIDATION_FAILED', 400, 'VALIDATION_FAILED'],
  ] as const)('%s', (_label, status, code) => {
    expect(shouldRetry(0, err(status, code))).toBe(false)
  })

  it('202 PAYMENT_PENDING 도 재시도하지 않는다 — 폴링은 화면이 Retry-After 로 한다', () => {
    expect(shouldRetry(0, err(202, 'PAYMENT_PENDING'))).toBe(false)
  })
})

describe('5xx 와 네트워크 오류는 재시도한다', () => {
  it('500 은 2회까지', () => {
    expect(shouldRetry(0, err(500, 'INTERNAL_ERROR'))).toBe(true)
    expect(shouldRetry(1, err(500, 'INTERNAL_ERROR'))).toBe(true)
    expect(shouldRetry(2, err(500, 'INTERNAL_ERROR'))).toBe(false)
  })

  it('응답 자체가 없던 경우도 2회까지', () => {
    const netdown = new TypeError('Failed to fetch')
    expect(shouldRetry(0, netdown)).toBe(true)
    expect(shouldRetry(2, netdown)).toBe(false)
  })
})

describe('createQueryClient 기본값', () => {
  it('⚠️ 뮤테이션은 자동 재시도하지 않는다 — 결제가 여기 들어있다', () => {
    const d = createQueryClient().getDefaultOptions()
    expect(d.mutations?.retry).toBe(false)
  })

  it('좌석맵 800석을 포커스마다 다시 받지 않는다', () => {
    const d = createQueryClient().getDefaultOptions()
    expect(d.queries?.refetchOnWindowFocus).toBe(false)
  })
})
