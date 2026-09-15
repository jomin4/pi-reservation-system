import EventSource from 'react-native-sse'

import { API_BASE_URL } from '../config/env'
import { createEmitter } from './emitter'
import type {
  ConnectionState,
  ResumeFailed,
  SeatDelta,
  SeatEventSource,
} from './types'

/**
 * `react-native-sse` 래핑 (`api.md` §6).
 *
 * ⚠️ **웹의 `EventSource` 와 갈리는 지점이 둘이고, 둘 다 우리가 메워야 한다.**
 *
 * | | 브라우저 | **RN** |
 * |---|---|---|
 * | `Last-Event-ID` | **자동으로 붙는다** (SSE 표준) | ⚠️ **우리가 붙인다** |
 * | 재연결 | 자동 (`retry:` 지시를 따름) | ⚠️ **우리가 한다** |
 *
 * > **계약이 「브라우저가 자동으로 붙인다」 를 전제로 쓰여 있다** (`api.md` §6.3).
 * > 모바일에는 그 전제가 없다 — **재개가 조용히 안 되면 좌석맵에 구멍이 남는다.**
 *
 * 그래서 라이브러리의 자동 재연결을 **끄고**(`pollingInterval: 0`) 직접 돈다.
 * 안 그러면 **옛 `Last-Event-ID` 로 다시 붙어** 그 사이 이벤트를 통째로 잃는다.
 */

/** `api.md` §6.7 — 15초 하트비트, **45초 무수신이면 재연결** */
export const HEARTBEAT_TIMEOUT_MS = 45_000

/** 서버가 `retry: 3000` 으로 지시한다 (`api.md` §6.6) */
export const RECONNECT_DELAY_MS = 3000

type SeatEventName = 'seat-changed' | 'heartbeat' | 'resume-failed'

export interface RealOptions {
  baseUrl?: string
  heartbeatTimeoutMs?: number
  reconnectDelayMs?: number
  /** 테스트에서 갈아끼운다 */
  createSource?: (url: string, headers: Record<string, string>) => EventSource<SeatEventName>
}

export function createRealSeatEvents(options: RealOptions = {}): SeatEventSource {
  const baseUrl = options.baseUrl ?? API_BASE_URL
  const heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? HEARTBEAT_TIMEOUT_MS
  const reconnectDelayMs = options.reconnectDelayMs ?? RECONNECT_DELAY_MS

  const seatChanged = createEmitter<SeatDelta>()
  const resumeFailed = createEmitter<ResumeFailed>()
  const connection = createEmitter<ConnectionState>()

  let source: EventSource<SeatEventName> | null = null
  let watchdog: ReturnType<typeof setTimeout> | undefined
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let currentTripId: number | null = null
  let lastEventId: string | null = null
  let closed = false
  /** ⚠️ 재개 불가를 받은 뒤에는 자동 재연결하지 않는다 — 아래 */
  let resumeBroken = false

  function clearTimers(): void {
    if (watchdog !== undefined) clearTimeout(watchdog)
    if (reconnectTimer !== undefined) clearTimeout(reconnectTimer)
    watchdog = undefined
    reconnectTimer = undefined
  }

  /**
   * ⚠️ **하트비트 감시가 이 어댑터의 절반이다.**
   *
   * 모바일에서 TCP 는 **죽어도 조용하다** — 지하로 들어가면 소켓은 열린 채로
   * 아무것도 안 온다. 15초 하트비트가 **45초 동안 없으면 끊긴 것으로 본다**.
   */
  function armWatchdog(): void {
    if (watchdog !== undefined) clearTimeout(watchdog)
    watchdog = setTimeout(() => {
      if (closed) return
      reconnect()
    }, heartbeatTimeoutMs)
  }

  function teardownSource(): void {
    if (source !== null) {
      source.removeAllEventListeners()
      source.close()
      source = null
    }
  }

  function reconnect(): void {
    if (closed || resumeBroken || currentTripId === null) return

    teardownSource()
    connection.emit('connecting')

    reconnectTimer = setTimeout(() => {
      if (!closed && currentTripId !== null) connect(currentTripId)
    }, reconnectDelayMs)
  }

  function connect(tripId: number): void {
    // ⚠️ **여기서 lastEventId 를 헤더에 싣는다.** 브라우저가 해주는 일을 대신한다.
    //    이 줄이 빠지면 재연결마다 처음부터 받거나(중복) 그 사이를 잃는다(구멍).
    const headers: Record<string, string> = { Accept: 'text/event-stream' }
    if (lastEventId !== null) headers['Last-Event-ID'] = lastEventId

    const url = `${baseUrl}/trips/${tripId}/seat-events`
    const es =
      options.createSource?.(url, headers) ??
      new EventSource<SeatEventName>(url, {
        headers,
        // ⚠️ 라이브러리 자동 재연결을 끈다. 켜두면 **옛 Last-Event-ID 로 다시 붙는다**
        pollingInterval: 0,
      })

    source = es

    es.addEventListener('open', () => {
      connection.emit('open')
      armWatchdog()
    })

    es.addEventListener('error', () => {
      if (!closed) reconnect()
    })

    es.addEventListener('seat-changed', (event) => {
      armWatchdog()
      if (event.type !== 'seat-changed') return
      if (event.lastEventId != null) lastEventId = event.lastEventId

      const parsed = parseJson<Omit<SeatDelta, 'eventId'>>(event.data)
      if (parsed === null) return

      seatChanged.emit({ ...parsed, eventId: event.lastEventId ?? null })
    })

    es.addEventListener('heartbeat', () => {
      // 본문은 안 본다. **온 것 자체가 신호**다
      armWatchdog()
    })

    es.addEventListener('resume-failed', (event) => {
      if (event.type !== 'resume-failed') return

      // ⚠️ **재개를 포기한다.** 여기서 다시 붙으면 같은 실패를 무한 반복한다.
      //    호출자가 §5.1 전체 조회로 복구한 뒤 lastEventId 를 새로 주고 다시 subscribe 한다.
      resumeBroken = true
      clearTimers()
      teardownSource()
      connection.emit('closed')

      const parsed = parseJson<ResumeFailed>(event.data)
      resumeFailed.emit(parsed ?? { reason: 'UNKNOWN', action: 'REFETCH_SNAPSHOT' })
    })
  }

  return {
    subscribe(tripId, resumeFrom) {
      closed = false
      resumeBroken = false
      currentTripId = tripId
      if (resumeFrom !== undefined) lastEventId = resumeFrom

      clearTimers()
      teardownSource()
      connection.emit('connecting')
      connect(tripId)
    },
    onSeatChanged: seatChanged.on,
    onResumeFailed: resumeFailed.on,
    onConnectionChange: connection.on,
    getLastEventId: () => lastEventId,
    close() {
      closed = true
      currentTripId = null
      clearTimers()
      teardownSource()
      connection.emit('closed')
      seatChanged.clear()
      resumeFailed.clear()
      connection.clear()
    },
  }
}

function parseJson<T>(raw: string | null | undefined): T | null {
  if (raw == null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}
