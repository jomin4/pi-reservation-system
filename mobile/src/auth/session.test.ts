import * as SecureStore from 'expo-secure-store'

import { __resetInFlightForTest, rotateRefresh, setOnSessionLost } from './session'
import { __resetMemoryForTest, getRefreshToken, saveTokens, type TokenPair } from './tokens'

const clear = (SecureStore as unknown as { __clear: () => void }).__clear

function pair(suffix: string): TokenPair {
  return {
    accessToken: `access-${suffix}`,
    refreshToken: `refresh-${suffix}`,
    accessExpiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  }
}

beforeEach(async () => {
  clear()
  __resetMemoryForTest()
  __resetInFlightForTest()
  setOnSessionLost(null)
  await saveTokens(pair('v1'))
})

/**
 * ⚠️ **이 파일의 핵심은 첫 describe 다.**
 *
 * 계약이 **회전 + 재사용 탐지**를 한다. 동시에 두 번 회전하면 두 번째가
 * 이미 죽은 토큰을 들고 가 **탈취로 판정**되고, 그 회원 토큰이 **전부 폐기**된다.
 */
describe('단일 비행 — 동시에 여러 번 불러도 회전은 한 번', () => {
  it('401 이 다섯 개 동시에 나도 refresher 는 한 번만 불린다', async () => {
    let calls = 0
    const refresher = async (token: string): Promise<TokenPair> => {
      calls += 1
      expect(token).toBe('refresh-v1')
      await new Promise((r) => setTimeout(r, 10))
      return pair('v2')
    }

    const results = await Promise.all([
      rotateRefresh(refresher),
      rotateRefresh(refresher),
      rotateRefresh(refresher),
      rotateRefresh(refresher),
      rotateRefresh(refresher),
    ])

    expect(calls).toBe(1)
    expect(results).toEqual([true, true, true, true, true])
    // 새 Refresh 로 갈렸다
    await expect(getRefreshToken()).resolves.toBe('refresh-v2')
  })

  it('회전이 끝난 뒤 다시 부르면 그때는 새로 돈다', async () => {
    let calls = 0
    const refresher = async (): Promise<TokenPair> => {
      calls += 1
      return pair(`v${calls + 1}`)
    }

    await rotateRefresh(refresher)
    await rotateRefresh(refresher)

    expect(calls).toBe(2)
  })
})

describe('실패는 되살릴 수 없는 상태다', () => {
  it('refresher 가 던지면 토큰을 지우고 세션 종료를 알린다', async () => {
    let lost = 0
    setOnSessionLost(() => {
      lost += 1
    })

    const ok = await rotateRefresh(() => Promise.reject(new Error('401')))

    expect(ok).toBe(false)
    expect(lost).toBe(1)
    // ⚠️ 남겨두면 다음 실행에서 또 보내 재사용 탐지에 걸린다
    await expect(getRefreshToken()).resolves.toBeNull()
  })

  it('Refresh 가 애초에 없으면 false — 호출도 안 한다', async () => {
    clear()
    let calls = 0

    const ok = await rotateRefresh(() => {
      calls += 1
      return Promise.resolve(pair('x'))
    })

    expect(ok).toBe(false)
    expect(calls).toBe(0)
  })

  it('실패한 뒤에도 다음 회전을 막지 않는다 — in-flight 가 샌다면 여기서 걸린다', async () => {
    await rotateRefresh(() => Promise.reject(new Error('401')))
    await saveTokens(pair('v9'))

    const ok = await rotateRefresh(() => Promise.resolve(pair('v10')))
    expect(ok).toBe(true)
  })
})
