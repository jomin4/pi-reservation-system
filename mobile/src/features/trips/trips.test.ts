import { formatDuration, formatFare, shiftBusinessDate, toKstTime, toShortDate } from './time'

/**
 * ⚠️ **계약의 시각은 UTC 다** (`openapi.yaml` `Trip`).
 * 그대로 찍으면 **06:00 열차가 전날 21:00 으로** 보인다.
 */
describe('시각은 KST 로 바꿔 보여준다', () => {
  it('자정 UTC 는 KST 로 아침 9시다', () => {
    expect(toKstTime('2026-09-20T00:00:00Z')).toBe('09:00')
  })

  it('계약 예시대로 — 21:00Z 는 다음 날 06:00 KST', () => {
    expect(toKstTime('2026-09-19T21:00:00Z')).toBe('06:00')
  })

  it('깨진 값은 화면을 죽이지 않는다', () => {
    expect(toKstTime('not-a-date')).toBe('--:--')
  })
})

describe('소요 시간', () => {
  it.each([
    [160, '2시간 40분'],
    [137, '2시간 17분'],
    [120, '2시간'],
    [45, '45분'],
  ])('%i 분 → %s', (min, expected) => {
    expect(formatDuration(min)).toBe(expected)
  })

  it('음수·NaN 은 버린다', () => {
    expect(formatDuration(-1)).toBe('-')
    expect(formatDuration(Number.NaN)).toBe('-')
  })
})

describe('운임 · 날짜 표기', () => {
  it('천 단위 구분', () => {
    expect(formatFare(59800)).toBe('59,800원')
  })

  it('헤더 부제는 월-일만', () => {
    expect(toShortDate('2026-09-20')).toBe('09-20')
  })
})

describe('날짜 이동 — 영업일 문자열로 다룬다', () => {
  it('다음날 · 이전날', () => {
    expect(shiftBusinessDate('2026-09-20', 1)).toBe('2026-09-21')
    expect(shiftBusinessDate('2026-09-20', -1)).toBe('2026-09-19')
  })

  it('월을 넘어간다', () => {
    expect(shiftBusinessDate('2026-09-30', 1)).toBe('2026-10-01')
  })

  it('깨진 값은 그대로 돌려준다', () => {
    expect(shiftBusinessDate('nope', 1)).toBe('nope')
  })
})
