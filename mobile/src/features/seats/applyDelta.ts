import type { SeatDelta } from '../../sse'
import { seatKey, type SeatAddress, type SeatMap } from './types'

/**
 * SSE 델타를 좌석맵에 얹는다 (`F-16`).
 *
 * > **캐시 무효화와 실시간 전파를 분리하지 않는다** (`features.md` `F-16~F-19`).
 * > 좌석 변경 이벤트 하나가 두 일을 다 한다 — 여기서는 **화면의 좌석맵**이 그 대상이다.
 *
 * ⚠️ **전체를 다시 받지 않는다.** 800석을 매 이벤트마다 재조회하면
 *    좌석 하나 팔릴 때마다 800석이 오간다. 델타만 갈아끼운다.
 *
 * ⚠️ **모르는 좌석은 무시한다.** 다른 운행의 이벤트가 섞이거나, 우리가 안 가진
 *    호차가 오면 **조용히 버린다** — 없는 좌석을 만들어 넣으면 격자가 뒤틀린다.
 */
export function applySeatDelta(map: SeatMap, delta: SeatDelta): SeatMap {
  // 다른 운행의 이벤트 — 구독을 잘못 걸었거나 화면이 바뀌는 중이다
  if (delta.tripId !== map.tripId) return map

  const changed = new Map(
    delta.seats.map((s) => [
      seatKey({ carNo: s.carNo, rowNo: s.rowNo, colLetter: s.colLetter }),
      s.status,
    ]),
  )
  if (changed.size === 0) return map

  let touched = false

  const cars = map.cars.map((car) => {
    let carTouched = false

    const seats = car.seats.map((seat) => {
      const next = changed.get(
        seatKey({ carNo: car.carNo, rowNo: seat.rowNo, colLetter: seat.colLetter }),
      )
      if (next === undefined || next === seat.status) return seat
      carTouched = true
      return { ...seat, status: next }
    })

    if (!carTouched) return car
    touched = true
    return { ...car, seats }
  })

  // ⚠️ 바뀐 게 없으면 **같은 객체를 돌려준다.** 새 객체를 만들면 리렌더가 돈다
  if (!touched) return map

  return {
    ...map,
    cars,
    // 이 좌석맵이 어디까지 반영됐는지 — 재연결 시 이 지점부터 이어붙인다
    lastEventId: delta.eventId ?? map.lastEventId,
  }
}

/**
 * 내가 고른 좌석이 남에게 넘어갔는지 본다.
 *
 * ⚠️ **선택은 예약이 아니다.** 고르고 있는 동안 남이 `POST /holds` 로 가져갈 수 있다
 *    — 그게 이 프로젝트가 증명하려는 경합이다. 화면이 그걸 **선점 버튼을 누르기 전에**
 *    알려주지 않으면 사용자는 `409` 를 받고 나서야 안다.
 */
export function findTakenSeats(
  map: SeatMap,
  selected: readonly SeatAddress[],
): SeatAddress[] {
  const taken: SeatAddress[] = []

  for (const car of map.cars) {
    for (const seat of car.seats) {
      if (seat.status === 'AVAILABLE') continue
      const addr = { carNo: car.carNo, rowNo: seat.rowNo, colLetter: seat.colLetter }
      const key = seatKey(addr)
      if (selected.some((s) => seatKey(s) === key)) taken.push(addr)
    }
  }

  return taken
}
