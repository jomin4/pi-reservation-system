import { createEmitter } from './emitter'
import {
  SEAT_CHANGE_CAUSES,
  type ConnectionState,
  type ResumeFailed,
  type SeatChangeCause,
  type SeatDelta,
  type SeatEventSource,
  type SeatStatus,
} from './types'

/**
 * `api.md` §7.4 — **가짜 SSE 가 시연에도 쓰인다.**
 *
 * > 좌석맵이 저절로 움직이는 화면을 **백엔드 없이** 보여줄 수 있다.
 * > `cause` 5종을 돌려가며 뿜으면 **전이별 화면 반응을 다 확인**할 수 있다.
 *
 * ⚠️ **`cause` 를 랜덤으로 고르지 않는다. 순회한다.** 랜덤이면 `RESERVATION_CANCELLED`
 *    같은 게 한참 안 나와서 "그 분기는 확인했나" 를 사람이 세고 있게 된다.
 */

export const FAKE_INTERVAL_MS = 3000

/** `cause` → 좌석이 어떤 상태가 되는가 (`data.md` §5.1 전이) */
const STATUS_BY_CAUSE: Record<SeatChangeCause, SeatStatus> = {
  HOLD_CREATED: 'HELD',
  HOLD_RELEASED: 'AVAILABLE',
  HOLD_EXPIRED: 'AVAILABLE',
  RESERVATION_CONFIRMED: 'SOLD',
  RESERVATION_CANCELLED: 'AVAILABLE',
}

const COLS = ['A', 'B', 'C', 'D'] as const

export interface FakeOptions {
  intervalMs?: number
  /** 테스트에서 고정한다 */
  now?: () => number
}

export function createFakeSeatEvents(options: FakeOptions = {}): SeatEventSource {
  const intervalMs = options.intervalMs ?? FAKE_INTERVAL_MS
  const now = options.now ?? Date.now

  const seatChanged = createEmitter<SeatDelta>()
  const resumeFailed = createEmitter<ResumeFailed>()
  const connection = createEmitter<ConnectionState>()

  let timer: ReturnType<typeof setInterval> | undefined
  let lastEventId: string | null = null
  let causeIndex = 0
  let seq = 0

  function tick(tripId: number): void {
    const cause = SEAT_CHANGE_CAUSES[causeIndex % SEAT_CHANGE_CAUSES.length] as SeatChangeCause
    causeIndex += 1
    seq += 1

    lastEventId = `${now()}-${seq}`

    seatChanged.emit({
      tripId,
      cause,
      eventId: lastEventId,
      seats: [
        {
          // ⚠️ 계약의 `Car.carNo` 는 **1~10** 이다 (`catalog.yaml`).
          //    18 까지 뿜으면 `applySeatDelta` 가 "없는 호차" 로 버려서
          //    **목을 켜도 좌석이 안 움직인다** — 가짜가 조용히 헛돈다.
          carNo: 1 + (seq % 10),
          rowNo: 1 + (seq % 20),
          colLetter: COLS[seq % COLS.length] as string,
          status: STATUS_BY_CAUSE[cause],
        },
      ],
    })
  }

  return {
    subscribe(tripId, resumeFrom) {
      if (timer !== undefined) clearInterval(timer)
      if (resumeFrom != null) lastEventId = resumeFrom

      connection.emit('connecting')
      connection.emit('open')
      timer = setInterval(() => tick(tripId), intervalMs)
    },
    onSeatChanged: seatChanged.on,
    onResumeFailed: resumeFailed.on,
    onConnectionChange: connection.on,
    getLastEventId: () => lastEventId,
    close() {
      if (timer !== undefined) clearInterval(timer)
      timer = undefined
      connection.emit('closed')
      seatChanged.clear()
      resumeFailed.clear()
      connection.clear()
    },
  }
}
