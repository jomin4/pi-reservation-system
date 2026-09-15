import type { components } from '../api/schema'

/**
 * SSE 계약 (`api.md` §6) — **타입은 계약에서 가져온다.**
 */
type S = components['schemas']

export type SeatStatus = S['SeatStatus']

/**
 * `cause` 가 `trip_seat` 전이 5개와 **정확히 1:1** 이다 (`data.md` §5.1).
 *
 * > 상태만 보내면 "왜 바뀌었는지" 를 클라가 추측해야 한다.
 * > `HOLD_EXPIRED` 와 `HOLD_RELEASED` 는 **결과가 같지만**(`AVAILABLE`)
 * > **로그·시연에서 완전히 다른 사건**이다.
 */
export type SeatChangeCause =
  | 'HOLD_CREATED'
  | 'HOLD_RELEASED'
  | 'HOLD_EXPIRED'
  | 'RESERVATION_CONFIRMED'
  | 'RESERVATION_CANCELLED'

export const SEAT_CHANGE_CAUSES: readonly SeatChangeCause[] = [
  'HOLD_CREATED',
  'HOLD_RELEASED',
  'HOLD_EXPIRED',
  'RESERVATION_CONFIRMED',
  'RESERVATION_CANCELLED',
]

export interface SeatDeltaEntry {
  carNo: number
  rowNo: number
  colLetter: string
  status: SeatStatus
}

export interface SeatDelta {
  tripId: number
  cause: SeatChangeCause
  seats: SeatDeltaEntry[]
  /** Redis Stream ID `<ms>-<seq>` — 재개 지점 */
  eventId: string | null
}

/**
 * ⚠️ **에러 응답이 아니라 이벤트다** (`api.md` §6.2). 연결은 이미 `200` 으로
 *    열려 있어 상태 코드를 바꿀 수 없다 — **RFC 9457 을 쓸 수 없는 유일한 실패 경로.**
 */
export interface ResumeFailed {
  reason: string
  /** `REFETCH_SNAPSHOT` — §5.1 전체 조회로 복구하라는 지시 */
  action: string
}

export type ConnectionState = 'connecting' | 'open' | 'closed'

/**
 * `api.md` §7.4 — **SSE 는 인터페이스로 감싼다.**
 *
 * > MSW 로 SSE 를 가로채는 건 불확실하다. **인터페이스를 하나 두는 게 확실하다.**
 *
 * 그 결정이 두 번 값을 했다.
 *
 * | | |
 * |---|---|
 * | 목 | `FakeSeatEvents` 가 **백엔드 없이** 좌석맵을 움직인다 |
 * | ⚠️ 교체 | **`react-native-sse` 는 2024-03-05 이후 무릴리스**(`tech.md`). 갈아끼울 때 **어댑터 한 장**이면 된다 |
 */
export interface SeatEventSource {
  /** `lastEventId` 는 §5.1 좌석맵 응답에서 온다 — **거기서부터 이어붙인다** */
  subscribe(tripId: number, lastEventId?: string | null): void
  onSeatChanged(cb: (delta: SeatDelta) => void): () => void
  /** ⚠️ **성공인 척하면 좌석맵에 구멍이 남는다.** 호출자는 전체 재조회로 간다 */
  onResumeFailed(cb: (info: ResumeFailed) => void): () => void
  onConnectionChange(cb: (state: ConnectionState) => void): () => void
  /** 마지막으로 받은 이벤트 ID — `E-04` 백그라운드 복귀가 이걸 쓴다 */
  getLastEventId(): string | null
  close(): void
}
