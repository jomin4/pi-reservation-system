/**
 * 예외 화면을 백엔드보다 먼저 만들기 위한 스위치 (`api.md` §7.2).
 *
 * > **함수에서 즉시 `return` 하면 예외 화면을 만들 계기가 없다.** MSW 로 `status` 와
 * > `delay` 를 조작할 수 있어야 `E-01`~`E-03` 을 먼저 완성할 수 있다.
 *
 * ⚠️ **웹과 켜는 법이 다르다.** 모바일에는 주소창이 없다.
 *
 * | | 웹 | **모바일** |
 * |---|---|---|
 * | 초기값 | 주소창 `?mock=` → `localStorage` | **`EXPO_PUBLIC_MOCK_SCENARIO`** |
 * | 바꾸기 | 주소창에 다시 | **`setScenario()`** — 개발용 화면에서 |
 * | 테스트 | `setScenario(...)` | 〃 |
 *
 * > **`localStorage` 대응물(AsyncStorage)을 끌어오지 않았다.** 시나리오는 개발자가
 * > 지금 무엇을 보고 싶은가일 뿐이라 **앱을 껐다 켜면 기본값으로 돌아가는 게 낫다** —
 * > 남아 있으면 "왜 계속 409 가 나지" 로 시간을 쓴다. 영속이 필요한 건 멱등키다 (#84).
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

function isScenario(v: unknown): v is Scenario {
  return typeof v === 'string' && (SCENARIOS as readonly string[]).includes(v)
}

let current: Scenario = 'happy'

/**
 * `EXPO_PUBLIC_MOCK_SCENARIO` → 기본값 `happy`.
 *
 * ⚠️ 오타를 조용히 먹지 않는다. `EXPO_PUBLIC_API_MODE` 와 달리 여기서는 **던지지 않고
 *    경고만** 한다 — 목 시나리오를 잘못 적은 것이 앱을 못 뜨게 할 이유는 없다.
 */
export function initScenario(raw = process.env.EXPO_PUBLIC_MOCK_SCENARIO): Scenario {
  if (raw === undefined || raw === '') {
    current = 'happy'
    return current
  }
  if (isScenario(raw)) {
    current = raw
    return current
  }
  console.warn(
    `[msw] EXPO_PUBLIC_MOCK_SCENARIO 값 ${JSON.stringify(raw)} 를 모른다. happy 로 간다.\n` +
      `      가능한 값: ${SCENARIOS.join(' · ')}`,
  )
  current = 'happy'
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
