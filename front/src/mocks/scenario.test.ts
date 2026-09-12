import { getScenario, initScenario, isScenarioActive, setScenario, SCENARIOS } from './scenario'

beforeEach(() => {
  localStorage.clear()
  setScenario('happy')
})

describe('시나리오 결정 순서 — 주소창 > localStorage > happy', () => {
  it('주소창이 가장 세다', () => {
    localStorage.setItem('mock:scenario', 'hold-expired')
    expect(initScenario('?mock=seat-conflict')).toBe('seat-conflict')
  })

  it('주소창에 주면 다음 새로고침을 위해 저장한다', () => {
    initScenario('?mock=payment-pending')
    expect(localStorage.getItem('mock:scenario')).toBe('payment-pending')
  })

  it('주소창이 없으면 저장된 값을 쓴다', () => {
    localStorage.setItem('mock:scenario', 'login-throttled')
    expect(initScenario('')).toBe('login-throttled')
  })

  it('아무것도 없으면 happy', () => {
    expect(initScenario('')).toBe('happy')
  })

  it('모르는 값은 무시하고 happy — 오타로 조용히 이상해지지 않는다', () => {
    expect(initScenario('?mock=없는시나리오')).toBe('happy')
    localStorage.setItem('mock:scenario', 'nope')
    expect(initScenario('')).toBe('happy')
  })

  it('?mock=happy 로 되돌릴 수 있다', () => {
    initScenario('?mock=seat-conflict')
    expect(initScenario('?mock=happy')).toBe('happy')
  })
})

describe('조회', () => {
  it('setScenario 가 getScenario 에 반영된다', () => {
    setScenario('not-owned')
    expect(getScenario()).toBe('not-owned')
  })

  it('isScenarioActive 는 여러 개를 한 번에 본다', () => {
    setScenario('payment-declined')
    expect(isScenarioActive('payment-pending', 'payment-declined')).toBe(true)
    expect(isScenarioActive('happy')).toBe(false)
  })

  it('목록에 10개가 있고 happy 가 기본이다', () => {
    expect(SCENARIOS).toHaveLength(10)
    expect(SCENARIOS[0]).toBe('happy')
  })
})
