import * as SecureStore from 'expo-secure-store'

import { discardIdempotencyKey, getOrCreateIdempotencyKey } from './idempotency'

const clear = (SecureStore as unknown as { __clear: () => void }).__clear

beforeEach(() => clear())

/**
 * ⚠️ **`api.md` §2 가 요구하는 것을 그대로 잠근다.**
 *
 * > 멱등키는 화면 진입 시 1회 생성하고 재시도에도 같은 값을 쓴다.
 * > **모바일은 영속 저장**해야 한다 — 앱이 죽으면 메모리 키가 사라진다.
 */
describe('멱등키는 선점에 묶인다', () => {
  it('같은 선점이면 몇 번을 불러도 같은 키', async () => {
    const a = await getOrCreateIdempotencyKey('hold-1')
    const b = await getOrCreateIdempotencyKey('hold-1')
    const c = await getOrCreateIdempotencyKey('hold-1')

    expect(a).toBe(b)
    expect(b).toBe(c)
  })

  it('다른 선점이면 다른 키 — 키를 돌려쓰면 IDEMPOTENCY_KEY_REUSED 다', async () => {
    const a = await getOrCreateIdempotencyKey('hold-1')
    const b = await getOrCreateIdempotencyKey('hold-2')

    expect(a).not.toBe(b)
  })

  /**
   * ⚠️ **이게 이 파일의 이유다.**
   *
   * 결제창이 인앱 브라우저로 떠 있는 동안 **OS 가 앱을 죽일 수 있다.**
   * 복귀해서 재시도할 때 키가 새로 생기면 **토스 승인이 두 번 난다.**
   *
   * 모듈 상태를 통째로 날려 "앱 재실행" 을 흉내 낸다 — SecureStore 만 살아남는다.
   */
  it('앱이 죽었다 켜져도 같은 선점이면 같은 키', async () => {
    const before = await getOrCreateIdempotencyKey('hold-42')

    jest.resetModules()
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- 모듈을 새로 평가해야 "앱 재실행" 이 된다
    const reloaded = require('./idempotency') as typeof import('./idempotency')

    const after = await reloaded.getOrCreateIdempotencyKey('hold-42')
    expect(after).toBe(before)
  })

  it('확정·만료 후 버리면 다음엔 새 키', async () => {
    const before = await getOrCreateIdempotencyKey('hold-7')
    await discardIdempotencyKey('hold-7')
    const after = await getOrCreateIdempotencyKey('hold-7')

    expect(after).not.toBe(before)
  })
})
