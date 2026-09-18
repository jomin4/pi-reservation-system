import { ApiError, ApiTimeoutError } from '../api'
import type { Problem } from '../api/problem'
import { DEFAULT_ATTEMPTS, awaitPaymentResult } from './awaitResult'

function problem(over: Pick<Problem, 'status' | 'code'> & Partial<Problem>): Problem {
  return {
    type: 'about:blank',
    title: '문제가 발생했습니다',
    requestId: '7f3a9c21',
    ...over,
  }
}

const pending = (retryAfter: number | null = 2) =>
  new ApiError(problem({ status: 202, code: 'PAYMENT_PENDING' }), retryAfter)

const declined = () => new ApiError(problem({ status: 402, code: 'PAYMENT_DECLINED' }))
const expired = () => new ApiError(problem({ status: 410, code: 'HOLD_EXPIRED' }))

const reservation = { reservationNo: '48207315', status: 'CONFIRMED' }

/** 실제로 기다리지 않는다. **무엇을 몇 ms 기다렸는지만** 기록한다 */
function recorder() {
  const slept: number[] = []
  return {
    slept,
    sleep: (ms: number) => {
      slept.push(ms)
      return Promise.resolve()
    },
  }
}

function clientOf(...outcomes: unknown[]) {
  const paths: string[] = []
  let i = 0
  return {
    paths,
    client: {
      request: <T,>(path: string): Promise<T> => {
        paths.push(path)
        const outcome = outcomes[Math.min(i, outcomes.length - 1)]
        i += 1
        if (outcome instanceof Error) return Promise.reject(outcome)
        return Promise.resolve(outcome as T)
      },
    },
  }
}

/**
 * ⚠️ **이 파일이 지키는 건 한 줄이다** — `POST` 가 아니라 `GET` 으로 묻는다.
 *    클라이언트가 이걸 `POST` 로 착각하면 **이중 결제**다 (`api.md` §5.3).
 */
describe('awaitPaymentResult', () => {
  it('묻기만 한다 — 경로는 조회용 하나뿐이다', async () => {
    const { client, paths } = clientOf(reservation)
    await awaitPaymentResult('h_8f3a21', { client, sleep: recorder().sleep })

    expect(paths).toEqual(['/holds/h_8f3a21/payment'])
  })

  it('202 면 Retry-After 만큼 기다렸다 다시 묻는다', async () => {
    const { client, paths } = clientOf(pending(3), pending(3), reservation)
    const rec = recorder()

    await expect(
      awaitPaymentResult('h_8f3a21', { client, sleep: rec.sleep, initialDelayMs: 2000 }),
    ).resolves.toMatchObject({ reservationNo: '48207315' })

    expect(paths).toHaveLength(3)
    // 첫 간격은 호출부가 준 값(POST 가 받은 Retry-After), 이후는 응답이 준 값
    expect(rec.slept).toEqual([2000, 3000, 3000])
  })

  it('Retry-After 가 없으면 2초로 본다', async () => {
    const { client } = clientOf(pending(null), reservation)
    const rec = recorder()

    await awaitPaymentResult('h_8f3a21', { client, sleep: rec.sleep })

    expect(rec.slept).toEqual([2000])
  })

  /** ⚠️ **조회가 타임아웃된 건 다시 물어도 된다.** `GET` 이라 부작용이 없다 */
  it('조회 타임아웃도 다시 묻는다', async () => {
    const { client, paths } = clientOf(new ApiTimeoutError('req-1', 10_000), reservation)

    await awaitPaymentResult('h_8f3a21', { client, sleep: recorder().sleep })

    expect(paths).toHaveLength(2)
  })

  it.each([
    ['거절', declined()],
    ['만료', expired()],
  ])('%s 는 답이다 — 그대로 올려보낸다', async (_label, error) => {
    const { client, paths } = clientOf(error, reservation)

    await expect(
      awaitPaymentResult('h_8f3a21', { client, sleep: recorder().sleep }),
    ).rejects.toBe(error)

    // 한 번 묻고 멈춘다 — 답이 왔는데 또 물으면 안 된다
    expect(paths).toHaveLength(1)
  })

  it('끝내 모르면 마지막 202 를 던진다 — 성공한 척하지 않는다', async () => {
    const { client, paths } = clientOf(pending())

    await expect(
      awaitPaymentResult('h_8f3a21', { client, sleep: recorder().sleep }),
    ).rejects.toMatchObject({ code: 'PAYMENT_PENDING' })

    expect(paths).toHaveLength(DEFAULT_ATTEMPTS)
  })

  it('시도 횟수를 줄일 수 있다 — 화면을 영원히 잡아두지 않는다', async () => {
    const { client, paths } = clientOf(pending())

    await expect(
      awaitPaymentResult('h_8f3a21', { client, sleep: recorder().sleep, attempts: 2 }),
    ).rejects.toMatchObject({ code: 'PAYMENT_PENDING' })

    expect(paths).toHaveLength(2)
  })
})
