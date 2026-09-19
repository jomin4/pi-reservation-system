import type { components } from '../../api/schema'

type S = components['schemas']

export type SeatStatus = S['SeatStatus']
export type Seat = S['Seat']
export type Car = S['Car']
export type SeatMap = S['SeatMapResponse']
export type SeatAddress = S['SeatAddress']

/** 열 순서 — **A B · 통로 · C D** (와이어프레임). `A`·`D` 가 창측 */
export const COLUMNS = ['A', 'B', 'C', 'D'] as const

/** `4호차 7A` — 화면·접근성 라벨 공용 */
export function seatLabel(seat: SeatAddress): string {
  return `${seat.carNo}호차 ${seat.rowNo}${seat.colLetter}`
}

/** 선택 비교·중복 제거용 키 */
export function seatKey(seat: SeatAddress): string {
  return `${seat.carNo}-${seat.rowNo}-${seat.colLetter}`
}
