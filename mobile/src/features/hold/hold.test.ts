import { URGENT_MS, formatCountdown, isUrgent, remainingMs, toDeadline, unitFare } from './countdown'
import type { Hold } from './types'

const MIN = 60_000

function hold(over: Partial<Hold> = {}): Hold {
  return {
    holdId: 'h_8f3a21',
    tripId: 101,
    seats: [
      { carNo: 4, rowNo: 7, colLetter: 'A' },
      { carNo: 4, rowNo: 7, colLetter: 'B' },
    ],
    expiresAt: '2026-09-04T05:22:33Z',
    remainingSeconds: 600,
    totalFare: 119600,
    ...over,
  }
}

/**
 * ⚠️ **이 파일의 절반이 시계 오차 이야기다.**
 *
 * `expiresAt` 은 **서버 시계**의 절대 시각이고 화면은 **기기 시계**로 잰다.
 * 기기 시계가 어긋난 만큼이 그대로 남은 시간의 오차가 되는데, **기기 시계는
 * 실제로 어긋난다** — 그래서 계약이 `remainingSeconds` 를 같이 준다.
 */
describe('toDeadline — 기한을 기기 시계로 옮긴다', () => {
  it('시계가 맞으면 두 값이 같은 기한을 가리킨다', () => {
    const received = Date.parse('2026-09-04T05:12:33Z')
    expect(toDeadline(hold(), received)).toBe(Date.parse('2026-09-04T05:22:33Z'))
  })

  /** 기기 시계가 3분 빠르다 — `expiresAt` 을 그냥 빼면 3분을 도둑맞는다 */
  it('기기 시계가 빨라도 10분을 준다', () => {
    const received = Date.parse('2026-09-04T05:15:33Z')
    const deadline = toDeadline(hold(), received)

    expect(remainingMs(deadline, received)).toBe(10 * MIN)
    // 절대 시각으로 쟀다면 7분밖에 안 남았다고 보였을 것이다
    expect(Date.parse('2026-09-04T05:22:33Z') - received).toBe(7 * MIN)
  })

  /** 반대쪽이 더 위험하다 — 살아 있는 선점을 죽은 것으로 본다 */
  it('기기 시계가 느려도 10분이다', () => {
    const received = Date.parse('2026-09-04T05:00:00Z')
    expect(remainingMs(toDeadline(hold(), received), received)).toBe(10 * MIN)
  })

  it('보조값이 없으면 절대 시각으로 떨어진다', () => {
    const received = Date.parse('2026-09-04T05:12:33Z')
    const broken = { ...hold(), remainingSeconds: undefined } as unknown as Hold
    expect(toDeadline(broken, received)).toBe(Date.parse('2026-09-04T05:22:33Z'))
  })

  it('둘 다 망가지면 지금을 기한으로 본다 — 만료로 보일지언정 NaN 은 안 된다', () => {
    const broken = { ...hold(), remainingSeconds: -1, expiresAt: '??' } as unknown as Hold
    expect(toDeadline(broken, 1000)).toBe(1000)
  })
})

describe('remainingMs — 음수가 없다', () => {
  it('기한이 지나면 0 이다', () => {
    expect(remainingMs(1000, 9999)).toBe(0)
  })
})

/**
 * ⚠️ **올림이다.** 내림이면 받자마자 `09:59` 로 뜨고, 기한 직전 0.4초가
 *    `00:00` 이 되어 **아직 살아 있는 선점을 죽은 것처럼** 보여준다.
 */
describe('formatCountdown', () => {
  it.each([
    [600_000, '10:00'],
    [587_000, '09:47'],
    [400, '00:01'],
    [0, '00:00'],
    [-5000, '00:00'],
  ])('%p → %p', (ms, text) => {
    expect(formatCountdown(ms)).toBe(text)
  })
})

describe('isUrgent — 3분 미만에서 경고한다 (와이어프레임)', () => {
  it('3분 정각은 아직 경고가 아니다', () => {
    expect(isUrgent(URGENT_MS)).toBe(false)
    expect(isUrgent(URGENT_MS - 1)).toBe(true)
  })

  /** 만료는 경고가 아니라 다른 화면이다 (`E-02`) */
  it('0 은 경고 상태가 아니다', () => {
    expect(isUrgent(0)).toBe(false)
  })
})

describe('unitFare — 계약은 합계만 준다', () => {
  it('좌석 수로 나눈다', () => {
    expect(unitFare(hold())).toBe(59800)
  })

  it('좌석이 없어도 0 으로 나누지 않는다', () => {
    expect(unitFare(hold({ seats: [] }))).toBe(0)
  })
})
