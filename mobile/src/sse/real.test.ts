import type EventSource from 'react-native-sse'

import { createRealSeatEvents } from './real'
import type { ResumeFailed, SeatDelta } from './types'

jest.useFakeTimers()

/**
 * ⚠️ **이 파일이 잠그는 건 「브라우저가 해주던 두 가지」다** (`api.md` §6.3 · §6.6).
 *
 * | | 브라우저 | RN |
 * |---|---|---|
 * | `Last-Event-ID` | 자동 | **우리가 붙인다** |
 * | 재연결 | 자동 | **우리가 한다** |
 *
 * 조용히 안 되면 **좌석맵에 구멍이 남는다** — 그래서 헤더를 실제로 들여다본다.
 */

type Listener = (event: unknown) => void

/** 라이브러리 대신 세우는 최소 스텁. 만들어진 헤더를 그대로 보관한다 */
function makeStub() {
  const created: { url: string; headers: Record<string, string> }[] = []
  const listeners: Map<string, Listener[]> = new Map()
  let closes = 0

  const createSource = (url: string, headers: Record<string, string>) => {
    created.push({ url, headers })
    listeners.clear()
    return {
      addEventListener: (type: string, cb: Listener) => {
        listeners.set(type, [...(listeners.get(type) ?? []), cb])
      },
      removeAllEventListeners: () => listeners.clear(),
      close: () => {
        closes += 1
      },
    } as unknown as EventSource<'seat-changed' | 'heartbeat' | 'resume-failed'>
  }

  const fire = (type: string, event: unknown) => {
    ;(listeners.get(type) ?? []).forEach((cb) => cb(event))
  }

  return {
    createSource,
    fire,
    get created() {
      return created
    },
    get closes() {
      return closes
    },
  }
}

const delta = (id: string) => ({
  type: 'seat-changed',
  lastEventId: id,
  data: JSON.stringify({
    tripId: 101,
    cause: 'HOLD_CREATED',
    seats: [{ carNo: 4, rowNo: 7, colLetter: 'A', status: 'HELD' }],
  }),
})

describe('Last-Event-ID — 브라우저가 해주던 일', () => {
  it('처음 붙을 때는 §5.1 이 준 값을 싣는다', () => {
    const stub = makeStub()
    const src = createRealSeatEvents({ baseUrl: '/api/v1', createSource: stub.createSource })

    src.subscribe(101, '1725426753000-7')

    expect(stub.created[0]?.url).toBe('/api/v1/trips/101/seat-events')
    expect(stub.created[0]?.headers['Last-Event-ID']).toBe('1725426753000-7')
    src.close()
  })

  it('⚠️ 재연결할 때는 **마지막으로 받은** 값을 싣는다 — 안 그러면 그 사이가 빈다', () => {
    const stub = makeStub()
    const src = createRealSeatEvents({
      baseUrl: '/api/v1',
      createSource: stub.createSource,
      reconnectDelayMs: 100,
    })

    src.subscribe(101, '1000-1')
    stub.fire('open', { type: 'open' })
    stub.fire('seat-changed', delta('2000-5'))

    // 연결이 끊긴다
    stub.fire('error', { type: 'error' })
    jest.advanceTimersByTime(200)

    expect(stub.created).toHaveLength(2)
    expect(stub.created[1]?.headers['Last-Event-ID']).toBe('2000-5')
    src.close()
  })

  it('받은 적이 없으면 헤더를 안 붙인다', () => {
    const stub = makeStub()
    const src = createRealSeatEvents({ baseUrl: '/api/v1', createSource: stub.createSource })

    src.subscribe(101)

    expect(stub.created[0]?.headers['Last-Event-ID']).toBeUndefined()
    src.close()
  })
})

describe('하트비트 감시 — 모바일에서 TCP 는 죽어도 조용하다', () => {
  it('45초 무수신이면 다시 붙는다', () => {
    const stub = makeStub()
    const src = createRealSeatEvents({
      baseUrl: '/api/v1',
      createSource: stub.createSource,
      heartbeatTimeoutMs: 45_000,
      reconnectDelayMs: 100,
    })

    src.subscribe(101)
    stub.fire('open', { type: 'open' })
    jest.advanceTimersByTime(45_100)

    expect(stub.created).toHaveLength(2)
    src.close()
  })

  it('하트비트가 오면 타이머가 리셋된다', () => {
    const stub = makeStub()
    const src = createRealSeatEvents({
      baseUrl: '/api/v1',
      createSource: stub.createSource,
      heartbeatTimeoutMs: 45_000,
      reconnectDelayMs: 100,
    })

    src.subscribe(101)
    stub.fire('open', { type: 'open' })

    jest.advanceTimersByTime(40_000)
    stub.fire('heartbeat', { type: 'heartbeat', data: '{}' })
    jest.advanceTimersByTime(40_000)

    // 80초가 지났지만 중간에 하트비트가 왔으므로 아직 한 번만 붙었다
    expect(stub.created).toHaveLength(1)
    src.close()
  })
})

describe('resume-failed — 에러가 아니라 이벤트다', () => {
  it('호출자에게 알리고 ⚠️ 자동 재연결을 멈춘다', () => {
    const stub = makeStub()
    const src = createRealSeatEvents({
      baseUrl: '/api/v1',
      createSource: stub.createSource,
      reconnectDelayMs: 100,
    })

    const got: ResumeFailed[] = []
    src.onResumeFailed((info) => got.push(info))

    src.subscribe(101, '1000-1')
    stub.fire('open', { type: 'open' })
    stub.fire('resume-failed', {
      type: 'resume-failed',
      data: JSON.stringify({ reason: 'EVENT_ID_TOO_OLD', action: 'REFETCH_SNAPSHOT' }),
    })

    expect(got[0]?.action).toBe('REFETCH_SNAPSHOT')

    // ⚠️ 다시 붙으면 같은 실패를 무한 반복한다. 호출자가 전체 재조회 후 다시 subscribe 한다.
    jest.advanceTimersByTime(60_000)
    expect(stub.created).toHaveLength(1)
    src.close()
  })
})

describe('델타 파싱', () => {
  it('본문을 파싱해 넘기고 eventId 를 붙인다', () => {
    const stub = makeStub()
    const src = createRealSeatEvents({ baseUrl: '/api/v1', createSource: stub.createSource })

    const got: SeatDelta[] = []
    src.onSeatChanged((d) => got.push(d))

    src.subscribe(101)
    stub.fire('open', { type: 'open' })
    stub.fire('seat-changed', delta('2000-5'))

    expect(got[0]?.cause).toBe('HOLD_CREATED')
    expect(got[0]?.seats[0]?.status).toBe('HELD')
    expect(got[0]?.eventId).toBe('2000-5')
    src.close()
  })

  it('깨진 본문은 버린다 — 화면을 죽이지 않는다', () => {
    const stub = makeStub()
    const src = createRealSeatEvents({ baseUrl: '/api/v1', createSource: stub.createSource })

    let count = 0
    src.onSeatChanged(() => (count += 1))

    src.subscribe(101)
    stub.fire('open', { type: 'open' })
    stub.fire('seat-changed', { type: 'seat-changed', lastEventId: '1-1', data: '{not json' })

    expect(count).toBe(0)
    src.close()
  })
})
