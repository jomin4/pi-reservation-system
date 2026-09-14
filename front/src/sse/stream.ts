import { DEFAULT_BASE_URL } from '../api/client'
import type { Transport, TransportFactory } from './transport'
import { createEventSourceTransport } from './transport'
import type { HeartbeatEvent, ResumeFailedEvent, SeatChangedEvent } from './types'
import { parseResumeFailed, parseSeatChanged } from './types'

/**
 * 서버는 15초마다 하트비트를 보낸다. **45초 무수신이면 클라가 스스로 끊고 다시 연다**
 * (`api.md` §6.4).
 *
 * > 세 번을 놓칠 때까지 기다린다. 한 번 놓쳤다고 끊으면 지연 한 번에 재연결이 돈다.
 */
export const SILENCE_TIMEOUT_MS = 45_000

export type StreamStatus = 'connecting' | 'open' | 'reconnecting'

export interface SeatEventStreamOptions {
  tripId: number
  onSeatChanged: (event: SeatChangedEvent) => void
  /**
   * ⚠️ **좌석맵을 전체 재조회하라는 뜻이다** (`api.md` §6.3).
   * 보관 범위(운행당 1000건)를 벗어나 이어붙이기가 불가능해졌다.
   */
  onResumeFailed: (event: ResumeFailedEvent) => void
  onHeartbeat?: (event: HeartbeatEvent) => void
  onStatusChange?: (status: StreamStatus) => void
  baseUrl?: string
  /** 테스트가 가짜 구현을 꽂는 자리 */
  createTransport?: TransportFactory
}

export interface SeatEventStream {
  status(): StreamStatus
  close(): void
}

/**
 * 좌석 변경 스트림 (`api.md` §6).
 *
 * **하는 일은 넷뿐이다** — 연결 · 45초 워치독 · 프레임 파싱 · 콜백 디스패치.
 * 좌석 상태에 델타를 반영하는 건 화면(`W-03`)의 몫이고, 재연결 간격은 서버가 정한다.
 */
export function createSeatEventStream(options: SeatEventStreamOptions): SeatEventStream {
  const factory = options.createTransport ?? createEventSourceTransport
  const url = `${options.baseUrl ?? DEFAULT_BASE_URL}/trips/${options.tripId}/seat-events`

  let transport: Transport | null = null
  let watchdog: ReturnType<typeof setTimeout> | undefined
  let status: StreamStatus = 'connecting'
  let closed = false

  function setStatus(next: StreamStatus): void {
    if (status === next) return
    status = next
    options.onStatusChange?.(next)
  }

  function armWatchdog(): void {
    if (watchdog !== undefined) clearTimeout(watchdog)
    watchdog = setTimeout(() => {
      // ⚠️ 서버 프로세스가 죽었는데 TCP 가 안 끊긴 경우다. EventSource 는 이걸 모른다 —
      //    끊긴 적이 없으니 재연결도 안 한다. 그래서 우리가 끊고 다시 연다 (§6.4).
      setStatus('reconnecting')
      open()
    }, SILENCE_TIMEOUT_MS)
  }

  function open(): void {
    if (closed) return
    transport?.close()
    transport = factory(url, {
      message(event, data, lastEventId) {
        // 어떤 이벤트든 수신은 "살아 있다" 는 신호다. 하트비트만 세면
        // 변경이 쏟아지는 동안 하트비트가 밀렸을 때 멀쩡한 연결을 끊는다.
        armWatchdog()
        setStatus('open')

        if (event === 'heartbeat') {
          if (options.onHeartbeat) {
            try {
              const at = (JSON.parse(data) as { at?: unknown }).at
              options.onHeartbeat({ at: typeof at === 'string' ? at : '' })
            } catch {
              options.onHeartbeat({ at: '' })
            }
          }
          return
        }

        if (event === 'seat-changed') {
          const parsed = parseSeatChanged(data, lastEventId)
          // 깨진 프레임은 버리고 연결은 유지한다. 한 줄 때문에 화면이 죽으면 안 된다
          if (parsed) options.onSeatChanged(parsed)
          return
        }

        const failed = parseResumeFailed(data)
        // ⚠️ 연결은 닫지 않는다. 이어붙이기만 실패했을 뿐 스트림은 계속 살아 있다
        if (failed) options.onResumeFailed(failed)
      },
      error() {
        // EventSource 가 알아서 다시 붙는다. 여기서 재연결을 시도하면 두 연결이 된다
        setStatus('reconnecting')
      },
    })
    armWatchdog()
  }

  open()

  return {
    status: () => status,
    close: () => {
      closed = true
      if (watchdog !== undefined) clearTimeout(watchdog)
      transport?.close()
      transport = null
    },
  }
}
