export { createSeatEventStream, SILENCE_TIMEOUT_MS } from './stream'
export type { SeatEventStream, SeatEventStreamOptions, StreamStatus } from './stream'
export { createEventSourceTransport } from './transport'
export type { Transport, TransportFactory, TransportHandlers } from './transport'
export { createFakeTransport } from './fake-transport'
export type { FakeConnection, FakeTransport } from './fake-transport'
export { parseResumeFailed, parseSeatChanged, SEAT_CHANGE_CAUSES, SEAT_EVENT_NAMES } from './types'
export type {
  ChangedSeat,
  HeartbeatEvent,
  ResumeFailedEvent,
  SeatChangeCause,
  SeatChangedEvent,
  SeatEventName,
} from './types'
