import { formatBusinessDate, toBusinessDate, upcomingBusinessDates } from './date'
import { MAX_PASSENGERS, toTripsQuery, validateSearchForm, type SearchForm } from './form'

const base: SearchForm = { from: 'SEO', to: 'BSN', date: '2026-09-20', passengers: 1 }

/**
 * ⚠️ **영업일은 시각이 아니다** (`api.md` §0).
 *
 * 기기 시계가 UTC 면 한국 새벽 시간대에 **하루 전 날짜**로 조회한다 —
 * 사용자는 "오늘 열차가 왜 없지" 를 보게 된다.
 */
describe('영업일은 KST 기준이다', () => {
  it('UTC 로 15:00 이면 KST 로는 다음 날이다', () => {
    // 2026-09-19T15:00Z = 2026-09-20 00:00 KST
    expect(toBusinessDate(new Date('2026-09-19T15:00:00Z'))).toBe('2026-09-20')
  })

  it('UTC 로 14:59 면 아직 같은 날이다', () => {
    expect(toBusinessDate(new Date('2026-09-19T14:59:59Z'))).toBe('2026-09-19')
  })

  it('요일을 붙여 보여준다', () => {
    // 2026-09-20 은 일요일
    expect(formatBusinessDate('2026-09-20')).toBe('2026-09-20 (일)')
  })

  it('예매 가능 범위를 목록으로 준다', () => {
    const days = upcomingBusinessDates(3, new Date('2026-09-19T15:00:00Z'))
    expect(days).toEqual(['2026-09-20', '2026-09-21', '2026-09-22'])
  })
})

/**
 * 규칙은 **계약에서 그대로 온다** (`openapi.yaml` `/trips`).
 * 클라이언트가 먼저 막는 건 요청을 아끼려는 게 아니라
 * **사용자가 버튼을 누르기 전에 알게 하려는 것**이다.
 */
describe('조회 폼 검증', () => {
  it('정상 폼은 통과한다', () => {
    expect(validateSearchForm(base)).toBeNull()
  })

  it('역을 안 고르면 막는다', () => {
    expect(validateSearchForm({ ...base, from: null })).toBe('FROM_REQUIRED')
    expect(validateSearchForm({ ...base, to: null })).toBe('TO_REQUIRED')
  })

  // ⚠️ 계약이 `from === to` 를 400 으로 준다
  it('출발역과 도착역이 같으면 막는다', () => {
    expect(validateSearchForm({ ...base, to: 'SEO' })).toBe('SAME_STATION')
  })

  /**
   * ⚠️ **인원 상한 6은 좌석 선점 상한에서 역산한 값이다** (`F-04`).
   * 여기서 안 막으면 **열차를 고른 뒤 선점 단계에서** `SEAT_COUNT_EXCEEDED` 로 막힌다.
   */
  it.each([0, -1, 7, 99])('인원 %i 은 막는다', (n) => {
    expect(validateSearchForm({ ...base, passengers: n })).toBe('PASSENGERS_RANGE')
  })

  it.each([1, 2, 3, 4, 5, 6])('인원 %i 은 통과한다', (n) => {
    expect(validateSearchForm({ ...base, passengers: n })).toBeNull()
  })

  it('상한이 좌석 선점 상한과 같은 값이다', () => {
    expect(MAX_PASSENGERS).toBe(6)
  })

  it('소수는 막는다', () => {
    expect(validateSearchForm({ ...base, passengers: 1.5 })).toBe('PASSENGERS_RANGE')
  })
})

describe('쿼리 변환 — 계약의 파라미터 이름 그대로', () => {
  it('from · to · date · passengers', () => {
    expect(toTripsQuery(base)).toEqual({
      from: 'SEO',
      to: 'BSN',
      date: '2026-09-20',
      passengers: '1',
    })
  })
})
