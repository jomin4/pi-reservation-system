import { isMock } from '../config/env'
import { createFakeSeatEvents } from './fake'
import { createRealSeatEvents } from './real'
import type { SeatEventSource } from './types'

/**
 * `EXPO_PUBLIC_API_MODE` 하나로 갈린다 (`api.md` §7.2 · §7.4).
 *
 * > **앱 코드는 어느 쪽인지 모른다.** 화면은 `SeatEventSource` 만 본다 —
 * > 그게 이 인터페이스의 목적이고, `react-native-sse` 를 갈아끼울 때도 같다.
 */
export function createSeatEventSource(): SeatEventSource {
  return isMock ? createFakeSeatEvents() : createRealSeatEvents()
}

export { createFakeSeatEvents } from './fake'
export { createRealSeatEvents, HEARTBEAT_TIMEOUT_MS, RECONNECT_DELAY_MS } from './real'
export { SEAT_CHANGE_CAUSES } from './types'
export type {
  ConnectionState,
  ResumeFailed,
  SeatChangeCause,
  SeatDelta,
  SeatDeltaEntry,
  SeatEventSource,
  SeatStatus,
} from './types'
