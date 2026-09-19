import type { SeatDelta } from '../../sse'
import { applySeatDelta, findTakenSeats } from './applyDelta'
import { MAX_SEATS, isSelected, summarize, toggleSeat } from './selection'
import type { SeatAddress, SeatMap } from './types'

const at = (carNo: number, rowNo: number, colLetter: string): SeatAddress => ({
  carNo,
  rowNo,
  colLetter,
})

function map(): SeatMap {
  return {
    tripId: 101,
    snapshotAt: '2026-09-20T05:12:33Z',
    lastEventId: '1725426753000-7',
    cars: [
      {
        carNo: 4,
        seats: [
          { rowNo: 7, colLetter: 'A', status: 'AVAILABLE', windowSide: true },
          { rowNo: 7, colLetter: 'B', status: 'AVAILABLE', windowSide: false },
          { rowNo: 8, colLetter: 'A', status: 'SOLD', windowSide: true },
        ],
      },
    ],
  }
}

const delta = (over: Partial<SeatDelta> = {}): SeatDelta => ({
  tripId: 101,
  cause: 'HOLD_CREATED',
  eventId: '1725426753000-8',
  seats: [{ carNo: 4, rowNo: 7, colLetter: 'A', status: 'HELD' }],
  ...over,
})

/**
 * ⚠️ **6석은 계약의 `maxItems` 이자 도메인 규칙이다** (ADR-0002).
 *    일곱 번째에서 안 막으면 **`400` 을 받고 나서 뭘 빼야 할지 모른다.**
 */
describe('좌석 선택 — 상한 6', () => {
  it('누르면 고르고 다시 누르면 뺀다', () => {
    const once = toggleSeat([], at(4, 7, 'A'))
    expect(once.seats).toHaveLength(1)

    const twice = toggleSeat(once.seats, at(4, 7, 'A'))
    expect(twice.seats).toHaveLength(0)
  })

  it('일곱 번째는 거부한다 — 고른 것은 그대로 둔다', () => {
    let seats: SeatAddress[] = []
    for (let i = 1; i <= MAX_SEATS; i += 1) {
      seats = toggleSeat(seats, at(4, i, 'A')).seats
    }
    expect(seats).toHaveLength(6)

    const over = toggleSeat(seats, at(4, 7, 'A'))
    expect(over.rejected).toBe(true)
    expect(over.seats).toHaveLength(6)
    expect(isSelected(over.seats, at(4, 7, 'A'))).toBe(false)
  })

  it('가득 찼어도 이미 고른 좌석은 뺄 수 있다', () => {
    let seats: SeatAddress[] = []
    for (let i = 1; i <= MAX_SEATS; i += 1) {
      seats = toggleSeat(seats, at(4, i, 'A')).seats
    }
    const removed = toggleSeat(seats, at(4, 1, 'A'))
    expect(removed.rejected).toBe(false)
    expect(removed.seats).toHaveLength(5)
  })

  /** 탭 순서대로 두면 `7B, 7A` 가 된다 — 같은 선택인데 문구가 달라진다 */
  it('요약은 정렬된 순서다', () => {
    const b = toggleSeat([], at(4, 7, 'B')).seats
    const both = toggleSeat(b, at(4, 7, 'A')).seats
    expect(summarize(both)).toBe('4호차 7A, 7B')
  })

  it('호차가 섞이면 호차를 매번 붙인다', () => {
    const s = [at(4, 7, 'A'), at(5, 1, 'C')]
    expect(summarize(s)).toBe('4호차 7A, 5호차 1C')
  })

  it('빈 선택은 빈 문자열', () => {
    expect(summarize([])).toBe('')
  })
})

describe('SSE 델타를 좌석맵에 얹는다', () => {
  it('해당 좌석만 상태가 바뀐다', () => {
    const next = applySeatDelta(map(), delta())
    const seats = next.cars[0]?.seats ?? []
    expect(seats[0]?.status).toBe('HELD')
    expect(seats[1]?.status).toBe('AVAILABLE')
  })

  it('재개 지점을 갱신한다 — 재연결이 여기서 이어붙는다', () => {
    expect(applySeatDelta(map(), delta()).lastEventId).toBe('1725426753000-8')
  })

  // ⚠️ 새 객체를 만들면 800석이 매번 리렌더된다
  it('바뀐 게 없으면 같은 객체를 돌려준다', () => {
    const m = map()
    const same = applySeatDelta(m, delta({ seats: [] }))
    expect(same).toBe(m)
  })

  it('이미 그 상태면 그대로다', () => {
    const m = map()
    const noop = delta({
      seats: [{ carNo: 4, rowNo: 7, colLetter: 'A', status: 'AVAILABLE' }],
    })
    expect(applySeatDelta(m, noop)).toBe(m)
  })

  it('다른 운행의 이벤트는 버린다', () => {
    const m = map()
    expect(applySeatDelta(m, delta({ tripId: 999 }))).toBe(m)
  })

  it('없는 좌석은 만들어 넣지 않는다', () => {
    const m = map()
    const ghost = delta({
      seats: [{ carNo: 9, rowNo: 1, colLetter: 'A', status: 'SOLD' }],
    })
    expect(applySeatDelta(m, ghost)).toBe(m)
    expect(m.cars).toHaveLength(1)
  })
})

/**
 * ⚠️ **선택은 예약이 아니다.** 고르는 동안 남이 가져갈 수 있다 —
 *    그게 이 프로젝트가 증명하려는 경합이다.
 */
describe('내가 고른 좌석을 남이 가져갔나', () => {
  it('선점되면 잡아낸다', () => {
    const taken = findTakenSeats(applySeatDelta(map(), delta()), [at(4, 7, 'A')])
    expect(taken).toHaveLength(1)
    expect(taken[0]?.rowNo).toBe(7)
  })

  it('판매완료도 잡아낸다', () => {
    expect(findTakenSeats(map(), [at(4, 8, 'A')])).toHaveLength(1)
  })

  it('멀쩡하면 빈 배열', () => {
    expect(findTakenSeats(map(), [at(4, 7, 'B')])).toHaveLength(0)
  })
})
