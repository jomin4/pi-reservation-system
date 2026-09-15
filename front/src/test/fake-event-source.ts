/**
 * jsdom 에는 `EventSource` 가 없다. 전역에 가짜를 꽂아 **실제
 * `createEventSourceTransport` 경로까지** 테스트가 지나가게 한다.
 *
 * > 프로덕션 코드에 테스트용 구멍을 내지 않으려는 것이다 — 어댑터의 인터페이스
 * > 주입(`#66`)은 단위 테스트용이고, 화면은 기본 구현을 그대로 쓰는 게 맞다.
 */
type Handler = (event: MessageEvent<string>) => void

export class FakeEventSource {
  static instances: FakeEventSource[] = []

  readonly url: string
  closed = false
  private readonly handlers = new Map<string, Set<Handler>>()

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  addEventListener(type: string, fn: Handler): void {
    const set = this.handlers.get(type) ?? new Set<Handler>()
    set.add(fn)
    this.handlers.set(type, set)
  }

  removeEventListener(type: string, fn: Handler): void {
    this.handlers.get(type)?.delete(fn)
  }

  close(): void {
    this.closed = true
  }

  emit(type: string, data: unknown, lastEventId = '1725426753000-8'): void {
    const raw = typeof data === 'string' ? data : JSON.stringify(data)
    const event = { data: raw, lastEventId } as MessageEvent<string>
    for (const fn of this.handlers.get(type) ?? []) fn(event)
  }

  static latest(): FakeEventSource {
    const last = FakeEventSource.instances.at(-1)
    if (!last) throw new Error('EventSource 가 아직 안 열렸다')
    return last
  }

  static reset(): void {
    FakeEventSource.instances = []
  }
}

export function installFakeEventSource(): void {
  FakeEventSource.reset()
  ;(globalThis as { EventSource?: unknown }).EventSource = FakeEventSource
}
