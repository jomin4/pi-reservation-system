import { vi } from 'vitest'
import { createFakeTransport } from './fake-transport'
import type { FakeTransport } from './fake-transport'
import { createSeatEventStream, SILENCE_TIMEOUT_MS } from './stream'
import type { SeatEventStream, StreamStatus } from './stream'
import type { ResumeFailedEvent, SeatChangedEvent } from './types'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

interface Harness {
  fake: FakeTransport
  stream: SeatEventStream
  changed: SeatChangedEvent[]
  resumeFailed: ResumeFailedEvent[]
  statuses: StreamStatus[]
}

function open(tripId = 101): Harness {
  const fake = createFakeTransport()
  const changed: SeatChangedEvent[] = []
  const resumeFailed: ResumeFailedEvent[] = []
  const statuses: StreamStatus[] = []

  const stream = createSeatEventStream({
    tripId,
    baseUrl: '/api/v1',
    createTransport: fake.factory,
    onSeatChanged: (e) => changed.push(e),
    onResumeFailed: (e) => resumeFailed.push(e),
    onStatusChange: (s) => statuses.push(s),
  })

  return { fake, stream, changed, resumeFailed, statuses }
}

const seatChangedPayload = {
  tripId: 101,
  cause: 'HOLD_CREATED',
  seats: [
    { carNo: 4, rowNo: 7, colLetter: 'A', status: 'HELD' },
    { carNo: 4, rowNo: 7, colLetter: 'B', status: 'HELD' },
  ],
}

describe('연결 (§6.1)', () => {
  it('운행 1개를 구독한다 — 호차로 안 쪼갠다', () => {
    const h = open(101)
    expect(h.fake.latest().url).toBe('/api/v1/trips/101/seat-events')
    h.stream.close()
  })

  it('바로 연결을 연다', () => {
    const h = open()
    expect(h.fake.connections).toHaveLength(1)
    h.stream.close()
  })
})

describe('seat-changed — 좌석 델타 (§6.2)', () => {
  it('파싱해서 콜백에 넘긴다', () => {
    const h = open()
    h.fake.emit('seat-changed', seatChangedPayload, '1725426753000-9')

    expect(h.changed).toHaveLength(1)
    expect(h.changed[0]?.cause).toBe('HOLD_CREATED')
    expect(h.changed[0]?.seats).toHaveLength(2)
    h.stream.close()
  })

  it('⚠️ eventId 를 담는다 — 재연결 때 이어붙이는 근거다', () => {
    const h = open()
    h.fake.emit('seat-changed', seatChangedPayload, '1725426753000-9')
    expect(h.changed[0]?.eventId).toBe('1725426753000-9')
    h.stream.close()
  })

  it('⚠️ data: 가 여러 줄로 쪼개져 와도 파싱된다 — 계약의 예시가 그렇다', () => {
    const h = open()
    // §6.2 의 seat-changed 예시는 data: 줄이 셋이다. SSE 는 \n 으로 이어 붙인다
    const multiline = [
      '{"tripId":101,"cause":"HOLD_CREATED","seats":[',
      '  {"carNo":4,"rowNo":7,"colLetter":"A","status":"HELD"},',
      '  {"carNo":4,"rowNo":7,"colLetter":"B","status":"HELD"}]}',
    ].join('\n')

    h.fake.emit('seat-changed', multiline)
    expect(h.changed).toHaveLength(1)
    expect(h.changed[0]?.seats[1]?.colLetter).toBe('B')
    h.stream.close()
  })

  it('cause 5종을 전부 받는다 — trip_seat 전이와 1:1', () => {
    const h = open()
    for (const cause of [
      'HOLD_CREATED',
      'HOLD_RELEASED',
      'HOLD_EXPIRED',
      'RESERVATION_CONFIRMED',
      'RESERVATION_CANCELLED',
    ]) {
      h.fake.emit('seat-changed', { ...seatChangedPayload, cause })
    }
    expect(h.changed.map((c) => c.cause)).toEqual([
      'HOLD_CREATED',
      'HOLD_RELEASED',
      'HOLD_EXPIRED',
      'RESERVATION_CONFIRMED',
      'RESERVATION_CANCELLED',
    ])
    h.stream.close()
  })
})

describe('⚠️ 깨진 프레임은 버리고 연결을 유지한다', () => {
  it.each([
    ['JSON 이 아니다', '<html>gateway</html>'],
    ['모르는 cause', JSON.stringify({ ...seatChangedPayload, cause: 'WHAT' })],
    ['seats 가 배열이 아니다', JSON.stringify({ tripId: 101, cause: 'HOLD_CREATED', seats: 1 })],
    [
      'status 가 모르는 값',
      JSON.stringify({
        tripId: 101,
        cause: 'HOLD_CREATED',
        seats: [{ carNo: 1, rowNo: 1, colLetter: 'A', status: 'NOPE' }],
      }),
    ],
  ])('%s → 콜백을 안 부른다', (_label, raw) => {
    const h = open()
    h.fake.emit('seat-changed', raw)

    expect(h.changed).toHaveLength(0)
    // 한 줄 때문에 화면이 죽으면 안 된다 — 연결은 그대로다
    expect(h.fake.latest().closed).toBe(false)
    h.stream.close()
  })
})

describe('45초 워치독 (§6.4)', () => {
  it('44초까지는 아무것도 안 한다', () => {
    const h = open()
    vi.advanceTimersByTime(SILENCE_TIMEOUT_MS - 1000)
    expect(h.fake.connections).toHaveLength(1)
    h.stream.close()
  })

  it('45초 무수신이면 스스로 끊고 다시 연다', () => {
    const h = open()
    const first = h.fake.latest()

    vi.advanceTimersByTime(SILENCE_TIMEOUT_MS)

    expect(h.fake.connections).toHaveLength(2)
    expect(first.closed).toBe(true)
    expect(h.statuses).toContain('reconnecting')
    h.stream.close()
  })

  it('하트비트를 받으면 타이머가 다시 선다', () => {
    const h = open()
    vi.advanceTimersByTime(30_000)
    h.fake.emit('heartbeat', { at: '2026-09-04T05:12:48Z' })
    vi.advanceTimersByTime(30_000)

    // 리셋이 안 됐으면 60초째에 재연결돼 있어야 한다
    expect(h.fake.connections).toHaveLength(1)
    h.stream.close()
  })

  it('⚠️ 하트비트만 세지 않는다 — seat-changed 도 살아있다는 신호다', () => {
    const h = open()
    vi.advanceTimersByTime(30_000)
    h.fake.emit('seat-changed', seatChangedPayload)
    vi.advanceTimersByTime(30_000)

    // 변경이 쏟아지는 동안 하트비트가 밀렸다고 멀쩡한 연결을 끊으면 안 된다
    expect(h.fake.connections).toHaveLength(1)
    h.stream.close()
  })

  it('계속 조용하면 계속 다시 연다', () => {
    const h = open()
    vi.advanceTimersByTime(SILENCE_TIMEOUT_MS * 3)
    expect(h.fake.connections).toHaveLength(4)
    h.stream.close()
  })
})

describe('resume-failed (§6.3)', () => {
  it('전체 재조회 콜백을 부른다', () => {
    const h = open()
    h.fake.emit('resume-failed', { reason: 'EVENT_ID_TOO_OLD', action: 'REFETCH_SNAPSHOT' })

    expect(h.resumeFailed).toEqual([{ reason: 'EVENT_ID_TOO_OLD', action: 'REFETCH_SNAPSHOT' }])
    h.stream.close()
  })

  it('⚠️ 연결을 닫지 않는다 — 이어붙이기만 실패했지 스트림은 살아 있다', () => {
    const h = open()
    h.fake.emit('resume-failed', { reason: 'EVENT_ID_TOO_OLD', action: 'REFETCH_SNAPSHOT' })

    expect(h.fake.latest().closed).toBe(false)
    expect(h.fake.connections).toHaveLength(1)
    h.stream.close()
  })

  it('action 이 다르면 무시한다', () => {
    const h = open()
    h.fake.emit('resume-failed', { reason: 'X', action: 'SOMETHING_ELSE' })
    expect(h.resumeFailed).toHaveLength(0)
    h.stream.close()
  })
})

describe('⚠️ 끊김은 EventSource 가 처리한다 — 우리가 재연결하지 않는다', () => {
  it('error 가 와도 새 연결을 만들지 않는다', () => {
    const h = open()
    h.fake.fail()

    // 여기서 다시 열면 연결이 둘이 된다. 간격은 서버가 retry: 3000 으로 지시한다 (§6.6)
    expect(h.fake.connections).toHaveLength(1)
    h.stream.close()
  })

  it('상태만 reconnecting 으로 알린다', () => {
    const h = open()
    h.fake.emit('heartbeat', { at: '' })
    expect(h.stream.status()).toBe('open')

    h.fake.fail()
    expect(h.stream.status()).toBe('reconnecting')
    h.stream.close()
  })
})

describe('close', () => {
  it('전송을 닫는다', () => {
    const h = open()
    const conn = h.fake.latest()
    h.stream.close()
    expect(conn.closed).toBe(true)
  })

  it('⚠️ 워치독도 함께 끈다 — 닫은 뒤에 되살아나면 안 된다', () => {
    const h = open()
    h.stream.close()
    vi.advanceTimersByTime(SILENCE_TIMEOUT_MS * 2)
    expect(h.fake.connections).toHaveLength(1)
  })
})

describe('상태 전이', () => {
  it('connecting → open → reconnecting', () => {
    const h = open()
    expect(h.stream.status()).toBe('connecting')

    h.fake.emit('heartbeat', { at: '' })
    expect(h.stream.status()).toBe('open')

    vi.advanceTimersByTime(SILENCE_TIMEOUT_MS)
    expect(h.stream.status()).toBe('reconnecting')
    h.stream.close()
  })

  it('같은 상태를 두 번 알리지 않는다', () => {
    const h = open()
    h.fake.emit('heartbeat', { at: '' })
    h.fake.emit('heartbeat', { at: '' })
    h.fake.emit('heartbeat', { at: '' })

    expect(h.statuses.filter((s) => s === 'open')).toHaveLength(1)
    h.stream.close()
  })
})
