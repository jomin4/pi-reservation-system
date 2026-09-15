import { buildSeatMap } from '../mocks/fixtures'
import type { SeatChangedEvent } from '../sse'
import { applySeatChange, findSeat, isSelectable, seatKey, seatLabel } from './seat-map'
import {
  clearSelection,
  loadSelection,
  MAX_SEATS,
  saveSelection,
  selectedKeySet,
  toggleSeat,
} from './selection'

const ref = (carNo: number, rowNo: number, colLetter: string) => ({ carNo, rowNo, colLetter })

function changed(over: Partial<SeatChangedEvent> = {}): SeatChangedEvent {
  return {
    tripId: 101,
    cause: 'HOLD_CREATED',
    seats: [{ carNo: 1, rowNo: 1, colLetter: 'A', status: 'HELD' }],
    eventId: '1725426753000-8',
    ...over,
  }
}

describe('좌석 주소', () => {
  it('4호차 7A 로 읽는다', () => {
    expect(seatLabel(ref(4, 7, 'A'))).toBe('4호차 7A')
    expect(seatKey(ref(4, 7, 'A'))).toBe('4-7A')
  })
})

describe('⚠️ SSE 델타를 얹는다 — 800석을 다시 받지 않는다', () => {
  it('해당 좌석만 바뀐다', () => {
    const map = buildSeatMap(101)
    const before = findSeat(map, ref(1, 1, 'A'))!.status

    const next = applySeatChange(map, changed())
    expect(findSeat(next, ref(1, 1, 'A'))!.status).toBe('HELD')
    expect(before).not.toBe('HELD')
  })

  it('다른 좌석은 건드리지 않는다', () => {
    const map = buildSeatMap(101)
    const next = applySeatChange(map, changed())
    expect(findSeat(next, ref(1, 2, 'A'))).toEqual(findSeat(map, ref(1, 2, 'A')))
  })

  it('여러 좌석을 한 번에 얹는다', () => {
    const map = buildSeatMap(101)
    const next = applySeatChange(
      map,
      changed({
        seats: [
          { carNo: 1, rowNo: 1, colLetter: 'A', status: 'SOLD' },
          { carNo: 2, rowNo: 3, colLetter: 'D', status: 'SOLD' },
        ],
      }),
    )
    expect(findSeat(next, ref(1, 1, 'A'))!.status).toBe('SOLD')
    expect(findSeat(next, ref(2, 3, 'D'))!.status).toBe('SOLD')
  })

  it('⚠️ 다른 운행의 이벤트는 무시한다', () => {
    const map = buildSeatMap(101)
    expect(applySeatChange(map, changed({ tripId: 999 }))).toBe(map)
  })

  it('⚠️ 모르는 좌석은 만들어내지 않는다', () => {
    const map = buildSeatMap(101)
    const next = applySeatChange(
      map,
      changed({ seats: [{ carNo: 99, rowNo: 1, colLetter: 'A', status: 'HELD' }] }),
    )
    expect(next.cars).toHaveLength(map.cars.length)
    expect(findSeat(next, ref(99, 1, 'A'))).toBeUndefined()
  })

  it('바뀐 게 없으면 같은 객체를 준다 — 헛된 리렌더를 막는다', () => {
    const map = buildSeatMap(101)
    const held = findSeat(map, ref(1, 1, 'A'))!.status
    expect(applySeatChange(map, changed({ seats: [{ ...ref(1, 1, 'A'), status: held }] }))).toBe(
      map,
    )
  })
})

describe('⚠️ 내가 고른 좌석도 HELD 로 돌아온다 — 좌석맵이 비인증이다', () => {
  const map = buildSeatMap(101)
  const mine = ref(1, 1, 'A')

  it('선택 목록과 대조해야 판정이 맞는다', () => {
    const held = applySeatChange(map, changed({ seats: [{ ...mine, status: 'HELD' }] }))
    const seat = findSeat(held, mine)

    expect(isSelectable(seat, new Set(), mine)).toBe(false)
    expect(isSelectable(seat, new Set([seatKey(mine)]), mine)).toBe(true)
  })

  it('판매 완료는 선택할 수 없다', () => {
    const sold = applySeatChange(map, changed({ seats: [{ ...mine, status: 'SOLD' }] }))
    expect(isSelectable(findSeat(sold, mine), new Set(), mine)).toBe(false)
  })
})

describe('선택 — 최대 6석', () => {
  it('누르면 넣고 다시 누르면 뺀다', () => {
    const a = toggleSeat([], ref(1, 1, 'A'))
    expect(a).toHaveLength(1)
    expect(toggleSeat(a, ref(1, 1, 'A'))).toHaveLength(0)
  })

  it('⚠️ 6석을 넘으면 무시한다 — 던지지 않는다', () => {
    let sel = [] as ReturnType<typeof toggleSeat>
    for (let i = 1; i <= 8; i += 1) sel = toggleSeat(sel, ref(1, i, 'A'))

    expect(sel).toHaveLength(MAX_SEATS)
  })

  it('가득 찬 뒤에도 이미 고른 좌석은 뺄 수 있다', () => {
    let sel = [] as ReturnType<typeof toggleSeat>
    for (let i = 1; i <= MAX_SEATS; i += 1) sel = toggleSeat(sel, ref(1, i, 'A'))

    expect(toggleSeat(sel, ref(1, 1, 'A'))).toHaveLength(MAX_SEATS - 1)
  })

  it('키 집합을 만든다', () => {
    expect(selectedKeySet([ref(4, 7, 'A')]).has('4-7A')).toBe(true)
  })
})

describe('⚠️ 선택을 세션에 보존한다 — 로그인으로 튕겨도 잃지 않는다', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('저장하고 되읽는다', () => {
    saveSelection(101, [ref(4, 7, 'A'), ref(4, 7, 'B')])
    expect(loadSelection(101)).toEqual([ref(4, 7, 'A'), ref(4, 7, 'B')])
  })

  it('⚠️ 운행마다 따로 담는다 — 다른 열차에 옛 선택이 남으면 안 된다', () => {
    saveSelection(101, [ref(4, 7, 'A')])
    expect(loadSelection(103)).toEqual([])
  })

  it('지울 수 있다', () => {
    saveSelection(101, [ref(4, 7, 'A')])
    clearSelection(101)
    expect(loadSelection(101)).toEqual([])
  })

  it('망가진 값은 빈 목록으로 본다', () => {
    sessionStorage.setItem('seats:selection:101', '{{{')
    expect(loadSelection(101)).toEqual([])
  })

  it('모양이 다른 항목은 걸러낸다', () => {
    sessionStorage.setItem('seats:selection:101', JSON.stringify([{ carNo: 'x' }, ref(1, 1, 'A')]))
    expect(loadSelection(101)).toEqual([ref(1, 1, 'A')])
  })
})
