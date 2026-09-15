import {
  addDays,
  formatKstDate,
  formatKstDateTime,
  formatKstTime,
  isInstant,
  isServiceDate,
  toInstant,
  toKstServiceDate,
  todayInKst,
  toServiceDate,
} from './instant'

describe('instant — ISO-8601 UTC 만 받는다', () => {
  it.each(['2026-09-10T21:00:00Z', '2026-09-04T05:22:33Z', '2026-09-04T05:22:33.123Z'])(
    '%s 는 instant 다',
    (raw) => {
      expect(isInstant(raw)).toBe(true)
    },
  )

  it.each([
    ['Z 가 없다', '2026-09-10T21:00:00'],
    ['⚠️ 오프셋 표기 — 서버 계약이 아니다', '2026-09-10T21:00:00+09:00'],
    ['날짜만', '2026-09-10'],
    ['빈 값', ''],
    ['말이 안 되는 값', '내일'],
  ])('%s → 아니다', (_label, raw) => {
    expect(isInstant(raw)).toBe(false)
    expect(() => toInstant(raw)).toThrow()
  })
})

describe('영업일 — KST 기준 YYYY-MM-DD', () => {
  it('2026-09-11 은 영업일이다', () => {
    expect(isServiceDate('2026-09-11')).toBe(true)
  })

  it.each([
    ['⚠️ instant 를 넣으면 안 된다', '2026-09-10T21:00:00Z'],
    ['없는 날', '2026-02-31'],
    ['자릿수가 다르다', '2026-9-1'],
  ])('%s → 아니다', (_label, raw) => {
    expect(isServiceDate(raw)).toBe(false)
    expect(() => toServiceDate(raw)).toThrow()
  })
})

describe('⚠️ KST 변환 — 자정 근처에서 하루가 밀린다', () => {
  it('2026-09-10T21:00:00Z 는 KST 로 9월 11일이다', () => {
    const i = toInstant('2026-09-10T21:00:00Z')
    // UTC 날짜를 그대로 쓰면 9월 10일이 된다 — 그게 이 함수가 존재하는 이유다
    expect(i.slice(0, 10)).toBe('2026-09-10')
    expect(toKstServiceDate(i)).toBe('2026-09-11')
  })

  it('06:00Z 는 KST 로 같은 날 15:00 이다', () => {
    const i = toInstant('2026-09-20T06:00:00Z')
    expect(toKstServiceDate(i)).toBe('2026-09-20')
    expect(formatKstTime(i)).toBe('15:00')
  })

  it('자정 직전 UTC 는 다음 날 KST 오전이다', () => {
    const i = toInstant('2026-09-19T15:00:00Z')
    expect(toKstServiceDate(i)).toBe('2026-09-20')
    expect(formatKstTime(i)).toBe('00:00')
  })
})

describe('포맷', () => {
  const i = toInstant('2026-09-19T15:00:00Z')

  it('시각은 24시간제', () => {
    expect(formatKstTime(toInstant('2026-09-20T00:00:00Z'))).toBe('09:00')
  })

  it('날짜에 요일이 붙는다', () => {
    expect(formatKstDate(i)).toMatch(/^9월 20일 \(.\)$/)
  })

  it('날짜 + 시각', () => {
    expect(formatKstDateTime(i)).toMatch(/^9월 20일 \(.\) 00:00$/)
  })
})

describe('영업일 계산', () => {
  it('오늘을 KST 로 준다', () => {
    // 2026-09-19T20:00:00Z = KST 2026-09-20 05:00
    expect(todayInKst(new Date('2026-09-19T20:00:00Z'))).toBe('2026-09-20')
  })

  it('하루를 더한다', () => {
    expect(addDays(toServiceDate('2026-09-20'), 1)).toBe('2026-09-21')
  })

  it('월을 넘어간다', () => {
    expect(addDays(toServiceDate('2026-09-30'), 1)).toBe('2026-10-01')
  })

  it('뒤로도 간다', () => {
    expect(addDays(toServiceDate('2026-10-01'), -1)).toBe('2026-09-30')
  })
})
