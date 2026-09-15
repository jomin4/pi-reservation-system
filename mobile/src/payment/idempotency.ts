import { randomUUID } from 'expo-crypto'

import { deleteSecure, readSecure, writeSecure } from '../auth/storage'

/**
 * 멱등키 — `F-10` · `api.md` §2.
 *
 * > 멱등키는 **화면 진입 시 1회 생성**하고 재시도에도 같은 값을 쓴다.
 * > **모바일은 영속 저장**해야 한다 — 앱이 죽으면 메모리 키가 사라진다.
 *
 * ⚠️ **모바일에서만 실제로 일어나는 일이다.** 결제창이 인앱 브라우저로 떠 있는 동안
 *    **OS 가 앱을 죽일 수 있다.** 복귀해서 재시도할 때 키가 새로 생기면
 *    **토스 승인이 두 번 난다.**
 *
 * 그래서 키를 **선점(`holdId`)에 묶는다.** 같은 선점의 결제는 앱을 껐다 켜도 같은 키다.
 */

const PREFIX = 'payment.idemKey.'

function keyFor(holdId: string): string {
  return `${PREFIX}${holdId}`
}

/**
 * **있으면 그대로, 없으면 만들어 저장하고 준다.**
 *
 * ⚠️ **버튼을 누를 때마다 부르지 않는다.** 결제 화면 **진입 시 1회**다.
 *    이 함수 자체는 멱등하지만, 호출 시점을 흘리면 "왜 키가 같은지" 가 코드에서 안 보인다.
 */
export async function getOrCreateIdempotencyKey(holdId: string): Promise<string> {
  const stored = await readSecure(keyFor(holdId))
  if (stored !== null && stored !== '') return stored

  const fresh = randomUUID()
  const saved = await writeSecure(keyFor(holdId), fresh)

  // ⚠️ 저장이 실패해도 키는 준다. 이번 시도는 되고, 앱이 죽으면 새 키가 된다 —
  //    저장 실패로 결제 자체를 막는 건 과하다. 대신 조용히 넘기지 않는다.
  if (!saved) {
    console.warn(
      `[payment] 멱등키를 저장하지 못했다 (hold ${holdId}). ` +
        `앱이 종료되면 재시도 시 새 키가 생성된다 — 이중 결제 위험.`,
    )
  }

  return fresh
}

/**
 * 예약이 확정됐거나 선점이 만료됐을 때 버린다.
 *
 * **안 버리면 쌓인다.** 키체인 항목이 선점마다 하나씩 남는다.
 */
export async function discardIdempotencyKey(holdId: string): Promise<void> {
  await deleteSecure(keyFor(holdId))
}
