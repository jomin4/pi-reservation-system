import { createFakeSeatEvents } from './fake'
import { SEAT_CHANGE_CAUSES, type SeatChangeCause, type SeatDelta } from './types'

jest.useFakeTimers()

/**
 * `api.md` §7.4 — **가짜 SSE 가 시연에도 쓰인다.**
 * 백엔드 없이 좌석맵이 움직이는 화면을 보여주는 게 이 구현의 목적이다.
 */
describe('FakeSeatEvents', () => {
  it('간격마다 델타를 뿜는다', () => {
    const src = createFakeSeatEvents({ intervalMs: 1000 })
    const got: SeatDelta[] = []
    src.onSeatChanged((d) => got.push(d))

    src.subscribe(101)
    jest.advanceTimersByTime(3000)

    expect(got).toHaveLength(3)
    expect(got[0]?.tripId).toBe(101)
    src.close()
  })

  /**
   * ⚠️ **랜덤이 아니라 순회여야 한다.** 랜덤이면 `RESERVATION_CANCELLED` 같은 게
   *    한참 안 나와서 "그 분기는 확인했나" 를 사람이 세고 있게 된다.
   */
  it('cause 5종을 돌아가며 뿜는다 — 다섯 번이면 전부 나온다', () => {
    const src = createFakeSeatEvents({ intervalMs: 1000 })
    const causes: SeatChangeCause[] = []
    src.onSeatChanged((d) => causes.push(d.cause))

    src.subscribe(101)
    jest.advanceTimersByTime(5000)

    expect([...causes].sort()).toEqual([...SEAT_CHANGE_CAUSES].sort())
    src.close()
  })

  it('cause 와 좌석 상태가 전이표대로 짝지어진다', () => {
    const src = createFakeSeatEvents({ intervalMs: 1000 })
    const seen = new Map<SeatChangeCause, string>()
    src.onSeatChanged((d) => seen.set(d.cause, d.seats[0]?.status ?? ''))

    src.subscribe(101)
    jest.advanceTimersByTime(5000)

    // `data.md` §5.1 전이 — 결과가 같아도 cause 는 다르다
    expect(seen.get('HOLD_CREATED')).toBe('HELD')
    expect(seen.get('RESERVATION_CONFIRMED')).toBe('SOLD')
    expect(seen.get('HOLD_RELEASED')).toBe('AVAILABLE')
    expect(seen.get('HOLD_EXPIRED')).toBe('AVAILABLE')
    expect(seen.get('RESERVATION_CANCELLED')).toBe('AVAILABLE')
    src.close()
  })

  it('이벤트 ID 를 들고 있다 — E-04 가 이걸로 이어붙인다', () => {
    const src = createFakeSeatEvents({ intervalMs: 1000, now: () => 1_725_426_753_000 })
    src.subscribe(101)

    expect(src.getLastEventId()).toBeNull()
    jest.advanceTimersByTime(1000)
    expect(src.getLastEventId()).toBe('1725426753000-1')
    src.close()
  })

  it('close 하면 더 안 뿜는다 — 떠난 화면을 갱신하지 않는다', () => {
    const src = createFakeSeatEvents({ intervalMs: 1000 })
    let count = 0
    src.onSeatChanged(() => (count += 1))

    src.subscribe(101)
    jest.advanceTimersByTime(2000)
    src.close()
    jest.advanceTimersByTime(5000)

    expect(count).toBe(2)
  })

  it('구독 해제 함수가 실제로 뗀다', () => {
    const src = createFakeSeatEvents({ intervalMs: 1000 })
    let count = 0
    const off = src.onSeatChanged(() => (count += 1))

    src.subscribe(101)
    jest.advanceTimersByTime(1000)
    off()
    jest.advanceTimersByTime(3000)

    expect(count).toBe(1)
    src.close()
  })
})
