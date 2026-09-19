import type { SeatEventName } from './types'
import { SEAT_EVENT_NAMES } from './types'

/**
 * ⚠️ **이 인터페이스가 두 가지 일을 한다** (`api.md` §7.4).
 *
 * | | |
 * |---|---|
 * | 원래 이유 | mobile 은 `react-native-sse` 라 구현체가 갈린다 |
 * | 두 번째 이유 | **테스트.** `msw/node` 는 스트림이 닫힐 때까지 `fetch` 를 붙잡아 |
 * | | 정상 스트림을 Node 에서 열 수 없다. 가짜 구현이 그 자리를 대신한다 |
 */
export interface TransportHandlers {
  /** `data` 는 여러 `data:` 줄을 `\n` 으로 이어 붙인 뒤의 값이다 */
  message(event: SeatEventName, data: string, lastEventId: string): void
  /** 연결이 끊겼다. `EventSource` 는 스스로 다시 붙는다 — 여기서 재연결하지 않는다 */
  error(): void
}

export interface Transport {
  close(): void
}

export type TransportFactory = (url: string, handlers: TransportHandlers) => Transport

/**
 * 브라우저 구현.
 *
 * > **재연결을 우리가 짜지 않는다.** `EventSource` 가 자동으로 다시 붙고, 간격은
 * > 서버가 `retry: 3000` 으로 지시한다. 지수 백오프는 §6.6 이 명시적으로 거부했다 —
 * > 지터를 넣으려면 `fetch` 스트리밍이 필요한데 그건 §6.1 에서 이미 버린 선택지다.
 *
 * > **`Last-Event-ID` 도 우리가 안 붙인다.** SSE 표준이라 브라우저가 스스로 보낸다.
 * > 이게 스트림을 비인증으로 둘 수 있는 이유이기도 하다 (§6.3).
 */
export const createEventSourceTransport: TransportFactory = (url, handlers) => {
  // ⚠️ `EventSource` 가 없는 환경(jsdom · SSR)에서 **화면까지 죽이지 않는다.**
  //    실시간 갱신만 못 할 뿐 좌석맵은 그대로 쓸 수 있고, 연결 배지가
  //    "재연결 중" 으로 남아 사용자도 상태를 안다 (`W-03` 주석).
  if (typeof EventSource === 'undefined') {
    handlers.error()
    return { close: () => undefined }
  }

  const source = new EventSource(url)

  for (const name of SEAT_EVENT_NAMES) {
    source.addEventListener(name, (e) => {
      const ev = e as MessageEvent<string>
      handlers.message(name, ev.data, ev.lastEventId)
    })
  }
  source.addEventListener('error', () => {
    handlers.error()
  })

  return {
    close: () => {
      source.close()
    },
  }
}
