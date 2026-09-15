import type { components } from '../api/schema'
import type { SeatChangedEvent } from '../sse'

type S = components['schemas']
export type SeatMap = S['SeatMap']
export type Seat = S['Seat']
export type SeatStatus = S['SeatStatus']

export interface SeatRef {
  carNo: number
  rowNo: number
  colLetter: string
}

export function seatKey(s: SeatRef): string {
  return `${s.carNo}-${s.rowNo}${s.colLetter}`
}

/** `4호차 7A` */
export function seatLabel(s: SeatRef): string {
  return `${s.carNo}호차 ${s.rowNo}${s.colLetter}`
}

/**
 * `seat-changed` 델타를 좌석맵에 얹는다 (`api.md` §6.2).
 *
 * > ⚠️ **전체 재조회가 아니다.** 800석을 매번 다시 받으면 이어붙이기를 만든 의미가 없다
 * > (`#28` 완료 조건). 바뀐 좌석만 갈아끼운다.
 *
 * ⚠️ **모르는 좌석은 무시한다.** 다른 운행의 이벤트가 섞여 들어와도 좌석맵을 늘리지 않는다 —
 * 서버가 보내지 않은 좌석이 화면에 생기면 그게 더 나쁘다.
 */
export function applySeatChange(map: SeatMap, event: SeatChangedEvent): SeatMap {
  if (event.tripId !== map.tripId) return map

  const byCar = new Map<number, Map<string, SeatStatus>>()
  for (const s of event.seats) {
    const key = `${s.rowNo}${s.colLetter}`
    const car = byCar.get(s.carNo) ?? new Map<string, SeatStatus>()
    car.set(key, s.status)
    byCar.set(s.carNo, car)
  }

  let changed = false
  const cars = map.cars.map((car) => {
    const updates = byCar.get(car.carNo)
    if (!updates) return car

    let carChanged = false
    const seats = car.seats.map((seat) => {
      const next = updates.get(`${seat.rowNo}${seat.colLetter}`)
      if (next === undefined || next === seat.status) return seat
      carChanged = true
      return { ...seat, status: next }
    })
    if (!carChanged) return car
    changed = true
    return { ...car, seats }
  })

  // 바뀐 게 없으면 같은 객체를 준다 — 헛된 리렌더를 만들지 않는다
  return changed ? { ...map, cars } : map
}

export function findSeat(map: SeatMap, ref: SeatRef): Seat | undefined {
  return map.cars
    .find((c) => c.carNo === ref.carNo)
    ?.seats.find((s) => s.rowNo === ref.rowNo && s.colLetter === ref.colLetter)
}

/**
 * 좌석을 고를 수 있나.
 *
 * ⚠️ **내가 고른 좌석도 `HELD` 로 돌아온다** — 좌석맵이 비인증이라 서버가 "내" 를 모른다
 * (`schema.d.ts` `SeatStatus` 주석). 그래서 **선택 목록과 대조**해야 판정이 맞는다.
 */
export function isSelectable(
  seat: Seat | undefined,
  selectedKeys: ReadonlySet<string>,
  ref: SeatRef,
): boolean {
  if (!seat) return false
  if (selectedKeys.has(seatKey(ref))) return true
  return seat.status === 'AVAILABLE'
}
