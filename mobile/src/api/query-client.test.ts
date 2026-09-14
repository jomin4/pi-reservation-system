import { ApiTimeoutError } from './client'
import { ApiError, type Problem } from './problem'
import { isPollable, shouldRetry } from './query-client'

function problem(status: number, code: Problem['code']): ApiError {
  return new ApiError({ type: 'about:blank', title: 't', status, code, requestId: 'r' })
}

describe('shouldRetry — 4xx 는 다시 물어도 같은 답이다', () => {
  it.each([
    [409, 'SEAT_ALREADY_HELD'],
    [409, 'SEAT_LOCK_TIMEOUT'],
    [410, 'HOLD_EXPIRED'],
    [402, 'PAYMENT_DECLINED'],
    [202, 'PAYMENT_PENDING'],
  ] as const)('%i %s 는 재시도하지 않는다', (status, code) => {
    expect(shouldRetry(0, problem(status, code))).toBe(false)
  })

  it('5xx 는 재시도한다 — 2회까지', () => {
    const e = problem(503, 'INTERNAL_ERROR')
    expect(shouldRetry(0, e)).toBe(true)
    expect(shouldRetry(1, e)).toBe(true)
    expect(shouldRetry(2, e)).toBe(false)
  })

  it('응답 자체가 없었으면 재시도한다', () => {
    expect(shouldRetry(0, new TypeError('Network request failed'))).toBe(true)
  })
})

describe('isPollable — 타임아웃은 재시도가 아니라 폴링이다', () => {
  it('타임아웃이면 참', () => {
    expect(isPollable(new ApiTimeoutError('r', 10_000))).toBe(true)
  })

  it('서버가 답을 준 것이면 거짓', () => {
    expect(isPollable(problem(402, 'PAYMENT_DECLINED'))).toBe(false)
  })
})
