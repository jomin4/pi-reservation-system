import {
  ApiError,
  hasErrorCode,
  isApiError,
  isPaymentPending,
  isProblem,
  isSeatConflict,
  isValidationFailed,
  toProblem,
} from './problem'
import { problemOf } from './test-helpers'

describe('ApiError', () => {
  it('Problem 의 필드를 그대로 들고 있는다', () => {
    const e = new ApiError(
      problemOf({ status: 409, code: 'SEAT_ALREADY_HELD', detail: '2석을 뺏겼다' }),
      null,
    )
    expect(e.status).toBe(409)
    expect(e.code).toBe('SEAT_ALREADY_HELD')
    expect(e.requestId).toBe('7f3a9c21')
    expect(e.detail).toBe('2석을 뺏겼다')
    expect(isApiError(e)).toBe(true)
  })

  it('5xx 에는 detail 이 없다 — 내부를 노출하지 않는다', () => {
    const e = new ApiError(problemOf({ status: 500, code: 'INTERNAL_ERROR' }), null)
    expect(e.detail).toBeUndefined()
    expect(e.requestId).not.toBe('')
  })
})

describe('code 로 분기한다 — status 가 아니라', () => {
  const held = new ApiError(problemOf({ status: 409, code: 'SEAT_ALREADY_HELD' }), null)
  const timeout = new ApiError(problemOf({ status: 409, code: 'SEAT_LOCK_TIMEOUT' }), null)

  it('같은 409 를 두 종류로 가른다', () => {
    expect(held.status).toBe(timeout.status)
    expect(hasErrorCode(held, 'SEAT_ALREADY_HELD')).toBe(true)
    expect(hasErrorCode(timeout, 'SEAT_ALREADY_HELD')).toBe(false)
    expect(hasErrorCode(timeout, 'SEAT_LOCK_TIMEOUT')).toBe(true)
  })

  it('failedSeats 는 SEAT_ALREADY_HELD 에만 있다', () => {
    expect(isSeatConflict(held)).toBe(true)
    expect(isSeatConflict(timeout)).toBe(false)
  })

  it('여러 code 를 한 번에 본다', () => {
    expect(hasErrorCode(timeout, 'SEAT_ALREADY_HELD', 'SEAT_LOCK_TIMEOUT')).toBe(true)
  })

  it('ApiError 가 아닌 값에는 false', () => {
    expect(hasErrorCode(new Error('그냥 에러'), 'HOLD_EXPIRED')).toBe(false)
    expect(hasErrorCode(null, 'HOLD_EXPIRED')).toBe(false)
  })

  it('PAYMENT_PENDING · VALIDATION_FAILED 도 같은 방식', () => {
    expect(
      isPaymentPending(new ApiError(problemOf({ status: 202, code: 'PAYMENT_PENDING' }))),
    ).toBe(true)
    expect(
      isValidationFailed(new ApiError(problemOf({ status: 400, code: 'VALIDATION_FAILED' }))),
    ).toBe(true)
  })
})

describe('isProblem', () => {
  it('필수 5필드가 다 있어야 Problem 이다', () => {
    expect(isProblem(problemOf({ status: 404, code: 'TRIP_NOT_FOUND' }))).toBe(true)
  })

  it.each([
    ['null', null],
    ['문자열', '<html>502 Bad Gateway</html>'],
    ['빈 객체', {}],
    ['requestId 누락', { type: 'x', title: 'y', status: 500, code: 'INTERNAL_ERROR' }],
    ['status 가 문자열', { type: 'x', title: 'y', status: '500', code: 'X', requestId: 'r' }],
  ])('%s 은 Problem 이 아니다', (_label, v) => {
    expect(isProblem(v)).toBe(false)
  })
})

describe('toProblem — 단서를 잃지 않는다', () => {
  it('Problem 이면 그대로 쓴다', () => {
    const p = problemOf({ status: 410, code: 'HOLD_EXPIRED' })
    expect(toProblem(410, p, null)).toBe(p)
  })

  it('Problem 이 아니면 헤더의 requestId 를 줍는다', () => {
    const p = toProblem(502, '<html>Bad Gateway</html>', 'abc123')
    expect(p.code).toBe('INTERNAL_ERROR')
    expect(p.status).toBe(502)
    expect(p.requestId).toBe('abc123')
  })

  it('헤더도 없으면 빈 문자열이지 undefined 가 아니다', () => {
    expect(toProblem(502, undefined, null).requestId).toBe('')
  })
})
