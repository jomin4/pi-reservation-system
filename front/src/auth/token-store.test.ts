import { clearTokens, getAccessToken, getRefreshToken, hasSession, setTokens } from './token-store'

const pair = {
  accessToken: 'acc_1',
  refreshToken: 'ref_1',
  accessExpiresAt: '2026-09-04T05:27:33Z',
}

beforeEach(() => {
  sessionStorage.clear()
  clearTokens()
})

describe('⚠️ Access 와 Refresh 의 거처가 다르다', () => {
  it('Access 는 메모리에만 있다 — 저장소에 안 남는다', () => {
    setTokens(pair)
    expect(getAccessToken()).toBe('acc_1')
    expect(JSON.stringify(sessionStorage)).not.toContain('acc_1')
    expect(JSON.stringify(localStorage)).not.toContain('acc_1')
  })

  it('Refresh 는 sessionStorage 에 있다 — 새로고침을 넘기려면 필요하다', () => {
    setTokens(pair)
    expect(sessionStorage.getItem('auth:refresh')).toBe('ref_1')
  })

  it('⚠️ localStorage 는 쓰지 않는다 — 탈취된 14일 토큰이 다음 방문에도 살면 안 된다', () => {
    setTokens(pair)
    expect(localStorage.getItem('auth:refresh')).toBeNull()
  })
})

describe('회전', () => {
  it('갱신하면 Refresh 도 새 값으로 덮인다', () => {
    setTokens(pair)
    setTokens({ ...pair, accessToken: 'acc_2', refreshToken: 'ref_2' })

    expect(getAccessToken()).toBe('acc_2')
    expect(getRefreshToken()).toBe('ref_2')
  })

  it('옛 Refresh 가 남아 있으면 다음 갱신이 재사용 탐지에 걸린다', () => {
    setTokens(pair)
    setTokens({ ...pair, refreshToken: 'ref_2' })
    expect(getRefreshToken()).not.toBe('ref_1')
  })
})

describe('hasSession — Access 가 아니라 Refresh 로 판정한다', () => {
  it('토큰이 없으면 false', () => {
    expect(hasSession()).toBe(false)
  })

  it('⚠️ 새로고침 직후처럼 Access 가 없어도 세션은 살아 있다', () => {
    sessionStorage.setItem('auth:refresh', 'ref_survived')
    expect(getAccessToken()).toBeNull()
    expect(hasSession()).toBe(true)
  })
})

describe('clearTokens', () => {
  it('둘 다 지운다', () => {
    setTokens(pair)
    clearTokens()

    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
    expect(hasSession()).toBe(false)
  })
})

describe('저장소를 못 쓰는 환경', () => {
  it('sessionStorage 가 던져도 앱이 죽지 않는다 — 새로고침 복구만 포기된다', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('저장이 차단됐다')
      },
    })

    try {
      expect(() => setTokens(pair)).not.toThrow()
      expect(getAccessToken()).toBe('acc_1')
      expect(getRefreshToken()).toBeNull()
      expect(hasSession()).toBe(false)
    } finally {
      if (original) Object.defineProperty(globalThis, 'sessionStorage', original)
    }
  })
})
