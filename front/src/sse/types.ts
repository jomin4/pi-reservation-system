import type { components } from '../api/schema'

/**
 * ⚠️ **이 타입들만은 손으로 쓴다.**
 *
 * 다른 곳은 전부 `schema.d.ts` 에서 가져오지만, SSE 이벤트 페이로드는 거기 없다 —
 * `api.md` 부록 A.5 가 **"스트림 프레임 구조는 OpenAPI 에 표준 표현이 없다.
 * 억지로 스키마화하면 생성 타입이 쓸모없어진다"** 고 정해뒀다.
 *
 * **그래서 `api.md` §6 이 이 파일의 진실이다.** §6 이 바뀌면 여기도 바뀐다.
 * `SeatStatus` 만은 계약에 있으므로 생성 타입을 그대로 쓴다.
 */
export type SeatStatus = components['schemas']['SeatStatus']

export const SEAT_EVENT_NAMES = ['seat-changed', 'heartbeat', 'resume-failed'] as const
export type SeatEventName = (typeof SEAT_EVENT_NAMES)[number]

/**
 * `trip_seat` 전이 5개와 **정확히 1:1** 이다 (`api.md` §6.2 · `data.md` §5.1).
 *
 * > 상태만 보내면 "왜 바뀌었는지" 를 클라가 추측해야 한다. `HOLD_EXPIRED` 와
 * > `HOLD_RELEASED` 는 결과가 같지만(`AVAILABLE`) **로그·시연에서 완전히 다른 사건**이다.
 */
export const SEAT_CHANGE_CAUSES = [
  'HOLD_CREATED',
  'HOLD_RELEASED',
  'HOLD_EXPIRED',
  'RESERVATION_CONFIRMED',
  'RESERVATION_CANCELLED',
] as const
export type SeatChangeCause = (typeof SEAT_CHANGE_CAUSES)[number]

export interface ChangedSeat {
  carNo: number
  rowNo: number
  colLetter: string
  status: SeatStatus
}

export interface SeatChangedEvent {
  tripId: number
  cause: SeatChangeCause
  seats: ChangedSeat[]
  /** 프레임의 `id:`. 브라우저가 재연결 때 `Last-Event-ID` 로 되돌려준다 */
  eventId: string
}

export interface HeartbeatEvent {
  at: string
}

/**
 * ⚠️ **에러 응답이 아니라 이벤트다.** 연결이 이미 `200` 으로 열려 있어 상태 코드를
 * 바꿀 수 없다 — §4 에러 규약(RFC 9457)의 **명시적 예외**다 (`api.md` §6.2).
 */
export interface ResumeFailedEvent {
  reason: string
  action: 'REFETCH_SNAPSHOT'
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function isChangedSeat(v: unknown): v is ChangedSeat {
  if (!isObject(v)) return false
  return (
    typeof v['carNo'] === 'number' &&
    typeof v['rowNo'] === 'number' &&
    typeof v['colLetter'] === 'string' &&
    (v['status'] === 'AVAILABLE' || v['status'] === 'HELD' || v['status'] === 'SOLD')
  )
}

/**
 * 깨진 프레임은 `null` 이다 — **던지지 않는다.**
 * 한 줄이 이상하다고 좌석 화면 전체가 죽으면 안 된다.
 */
export function parseSeatChanged(raw: string, eventId: string): SeatChangedEvent | null {
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isObject(v)) return null

  const { tripId, cause, seats } = v
  if (typeof tripId !== 'number') return null
  if (!(SEAT_CHANGE_CAUSES as readonly unknown[]).includes(cause)) return null
  if (!Array.isArray(seats) || !seats.every(isChangedSeat)) return null

  return { tripId, cause: cause as SeatChangeCause, seats, eventId }
}

export function parseResumeFailed(raw: string): ResumeFailedEvent | null {
  let v: unknown
  try {
    v = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isObject(v)) return null
  if (v['action'] !== 'REFETCH_SNAPSHOT') return null
  return {
    reason: typeof v['reason'] === 'string' ? v['reason'] : 'UNKNOWN',
    action: 'REFETCH_SNAPSHOT',
  }
}
