import type { Transport, TransportFactory, TransportHandlers } from './transport'
import type { SeatEventName } from './types'

export interface FakeConnection extends Transport {
  url: string
  handlers: TransportHandlers
  closed: boolean
}

export interface FakeTransport {
  factory: TransportFactory
  connections: FakeConnection[]
  /** 가장 최근 연결. 없으면 던진다 — 테스트가 조용히 통과하지 않게 */
  latest(): FakeConnection
  /** 서버가 프레임 하나를 보낸 것처럼 한다 */
  emit(event: SeatEventName, data: unknown, lastEventId?: string): void
  /** 연결이 끊긴 것처럼 한다 */
  fail(): void
}

/**
 * 테스트용 가짜 전송.
 *
 * > **`msw/node` 로는 정상 스트림을 못 연다** — 스트림이 닫힐 때까지 `fetch` 를 붙잡는다.
 * > 그래서 워치독 · 파싱 · 디스패치는 전부 이 가짜 위에서 본다. 실제 `EventSource`
 * > 연결만 브라우저에서 한 번 확인한다 (`api.md` §7.4).
 */
export function createFakeTransport(): FakeTransport {
  const connections: FakeConnection[] = []

  const factory: TransportFactory = (url, handlers) => {
    const conn: FakeConnection = {
      url,
      handlers,
      closed: false,
      close() {
        conn.closed = true
      },
    }
    connections.push(conn)
    return conn
  }

  function latest(): FakeConnection {
    const c = connections.at(-1)
    if (!c) throw new Error('연결이 아직 없다')
    return c
  }

  return {
    factory,
    connections,
    latest,
    emit(event, data, lastEventId = '1725426753000-7') {
      const raw = typeof data === 'string' ? data : JSON.stringify(data)
      latest().handlers.message(event, raw, lastEventId)
    },
    fail() {
      latest().handlers.error()
    },
  }
}
