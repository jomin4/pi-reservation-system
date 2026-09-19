import type { SeatRef } from './seat-map'
import { seatKey } from './seat-map'

/** 좌석 선점 상한 (`api.md` §5.2 · `F-04`) */
export const MAX_SEATS = 6

const KEY = 'seats:selection'

/**
 * 선택한 좌석을 탭 수명 동안 보존한다.
 *
 * > **`W-07` 주석이 요구한 것이다** — "선점 직전에 로그인으로 튕겼다가 좌석 선택을
 * > 잃으면 안 된다". 비로그인으로 좌석을 6개 고르고 선점을 눌렀다가 로그인하고
 * > 돌아왔는데 선택이 비어 있으면 처음부터 다시 골라야 한다.
 *
 * ⚠️ 운행마다 따로 담는다. 다른 열차로 옮겼는데 옛 선택이 남아 있으면 안 된다.
 */
function storageKey(tripId: number): string {
  return `${KEY}:${tripId}`
}

export function loadSelection(tripId: number): SeatRef[] {
  try {
    const raw = globalThis.sessionStorage?.getItem(storageKey(tripId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (s): s is SeatRef =>
        typeof s === 'object' &&
        s !== null &&
        typeof (s as SeatRef).carNo === 'number' &&
        typeof (s as SeatRef).rowNo === 'number' &&
        typeof (s as SeatRef).colLetter === 'string',
    )
  } catch {
    return []
  }
}

export function saveSelection(tripId: number, seats: readonly SeatRef[]): void {
  try {
    globalThis.sessionStorage?.setItem(storageKey(tripId), JSON.stringify(seats))
  } catch {
    // 저장을 못 해도 이번 화면은 동작해야 한다. 로그인 복귀 시 보존만 포기된다
  }
}

export function clearSelection(tripId: number): void {
  try {
    globalThis.sessionStorage?.removeItem(storageKey(tripId))
  } catch {
    // 지우지 못해도 다음 선점이 새 목록을 덮어쓴다
  }
}

/**
 * 좌석을 넣고 뺀다.
 *
 * ⚠️ **6석에 도달하면 나머지는 무시한다** — 던지지 않는다. 와이어프레임이 "클릭해도
 * 무시" 라고 적었고, 카운터(`2 / 6`)가 상시 노출돼 이유가 화면에 이미 있다.
 */
export function toggleSeat(selected: readonly SeatRef[], ref: SeatRef): SeatRef[] {
  const key = seatKey(ref)
  const without = selected.filter((s) => seatKey(s) !== key)
  if (without.length !== selected.length) return without
  if (selected.length >= MAX_SEATS) return [...selected]
  return [...selected, ref]
}

export function selectedKeySet(selected: readonly SeatRef[]): Set<string> {
  return new Set(selected.map(seatKey))
}
