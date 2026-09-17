import { seatKey, type SeatAddress } from './types'

/**
 * 좌석 선택 — **`F-04` 의 상한이 여기서 처음 걸린다.**
 *
 * ⚠️ **6석은 계약의 `maxItems` 이자 도메인 규칙이다** (`HoldRequest` · ADR-0002).
 *    넘겨서 보내면 `400 SEAT_COUNT_EXCEEDED` 인데, **좌석을 6개 고른 뒤에야
 *    안 된다고 하면 사용자는 뭘 빼야 할지 모른다.** 일곱 번째 탭에서 막는다.
 */

export const MAX_SEATS = 6

export interface ToggleResult {
  seats: SeatAddress[]
  /** 상한에 걸려 무시됐다 — 화면이 안내를 띄운다 */
  rejected: boolean
}

/**
 * 이미 고른 좌석이면 뺀다. 아니면 더한다.
 *
 * > **정렬해서 돌려준다.** `7A, 7B` 처럼 보여야 하는데 탭 순서대로 두면
 * > `7B, 7A` 가 된다 — 같은 선택인데 화면 문구가 달라진다.
 */
export function toggleSeat(current: readonly SeatAddress[], seat: SeatAddress): ToggleResult {
  const key = seatKey(seat)
  const found = current.some((s) => seatKey(s) === key)

  if (found) {
    return { seats: current.filter((s) => seatKey(s) !== key), rejected: false }
  }

  if (current.length >= MAX_SEATS) {
    return { seats: [...current], rejected: true }
  }

  return { seats: sortSeats([...current, seat]), rejected: false }
}

/** 호차 → 행 → 열 순 */
export function sortSeats(seats: readonly SeatAddress[]): SeatAddress[] {
  return [...seats].sort(
    (a, b) =>
      a.carNo - b.carNo ||
      a.rowNo - b.rowNo ||
      a.colLetter.localeCompare(b.colLetter),
  )
}

export function isSelected(seats: readonly SeatAddress[], seat: SeatAddress): boolean {
  const key = seatKey(seat)
  return seats.some((s) => seatKey(s) === key)
}

/**
 * `4호차 7A, 7B` — 하단 요약.
 *
 * 호차가 섞이면 `4호차 7A, 5호차 1C` 로 호차를 매번 붙인다.
 */
export function summarize(seats: readonly SeatAddress[]): string {
  if (seats.length === 0) return ''

  const sorted = sortSeats(seats)
  const cars = new Set(sorted.map((s) => s.carNo))

  if (cars.size === 1) {
    const carNo = sorted[0]?.carNo
    return `${carNo}호차 ${sorted.map((s) => `${s.rowNo}${s.colLetter}`).join(', ')}`
  }

  return sorted.map((s) => `${s.carNo}호차 ${s.rowNo}${s.colLetter}`).join(', ')
}
