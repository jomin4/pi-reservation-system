/**
 * 예외 화면을 백엔드보다 먼저 만들기 위한 스위치 (`api.md` §7.2).
 *
 * > **함수에서 즉시 `return` 하면 예외 화면을 만들 계기가 없다.** MSW 로 `status` 와
 * > `delay` 를 조작할 수 있어야 `E-01`~`E-03` 을 먼저 완성할 수 있다.
 *
 * | 켜는 법 | |
 * |---|---|
 * | 주소창 | `?mock=seat-conflict` — 한 번 주면 유지된다 |
 * | 되돌리기 | `?mock=happy` |
 * | 테스트 | `setScenario('seat-conflict')` |
 */
export const SCENARIOS = [
  'happy',
  'seat-conflict',
  'seat-lock-timeout',
  'hold-expired',
  'payment-pending',
  'payment-declined',
  'login-throttled',
  'not-owned',
  'not-found',
  'server-error',
] as const

export type Scenario = (typeof SCENARIOS)[number]

const STORAGE_KEY = 'mock:scenario'

function isScenario(v: unknown): v is Scenario {
  return typeof v === 'string' && (SCENARIOS as readonly string[]).includes(v)
}

let current: Scenario = 'happy'

/** 시크릿 창 등에서는 접근 자체가 던진다 */
function readStored(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null
  } catch {
    return null
  }
}

/** 주소창 `?mock=` → localStorage → 기본값 `happy` */
export function initScenario(search = globalThis.location?.search ?? ''): Scenario {
  const fromUrl = new URLSearchParams(search).get('mock')
  if (isScenario(fromUrl)) {
    current = fromUrl
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, fromUrl)
    } catch {
      // 시크릿 창 등 — 저장을 못 해도 이번 세션은 동작해야 한다
    }
    return current
  }

  const stored = readStored()
  current = isScenario(stored) ? stored : 'happy'
  return current
}

export function getScenario(): Scenario {
  return current
}

export function setScenario(s: Scenario): void {
  current = s
}

export function isScenarioActive(...names: readonly Scenario[]): boolean {
  return names.includes(current)
}
