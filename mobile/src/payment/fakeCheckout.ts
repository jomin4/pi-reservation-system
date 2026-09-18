import { Alert } from 'react-native'

import { formatFare } from '../features/trips'
import type { CheckoutResult, PaymentCheckout } from './checkout'

/**
 * 가짜 결제창 — **백엔드도 상점 키도 없이 `M-05` 를 끝까지 걷게 한다** (`api.md` §7).
 *
 * ⚠️ **즉시 승인하지 않는다.** 그러면 **취소 경로를 만들 계기가 없다** — 목이
 *    존재하는 이유가 바로 그것이다 (`api.md` §7.2 「함수 안에서 가짜 데이터를
 *    `return` 하지 않는다」). 그래서 **물어본다**: 승인 · 취소.
 *
 * ⚠️ **흉내 못 내는 것이 하나 있다.** 진짜 결제창은 **앱을 백그라운드로 보낸다** —
 *    SSE 가 끊기고 인터벌이 멈추고 OS 가 앱을 죽일 수도 있다. `Alert` 는 앱 안에
 *    머무르므로 **그 구간을 재현하지 못한다.** 복귀 처리(`E-04` · #54)를 이것으로
 *    검증했다고 적으면 안 된다.
 */
export function createFakeCheckout(): PaymentCheckout {
  return {
    open: (request) =>
      new Promise<CheckoutResult>((resolve) => {
        Alert.alert(
          '토스페이먼츠 (가짜 결제창)',
          `${request.orderName}\n${formatFare(request.amount)}\n주문 ${request.orderId}`,
          [
            { text: '결제 취소', style: 'cancel', onPress: () => resolve({ outcome: 'cancelled' }) },
            {
              text: '승인',
              onPress: () => resolve({ outcome: 'approved', paymentKey: fakePaymentKey() }),
            },
          ],
          // ⚠️ 바깥을 눌러 닫으면 **약속이 영영 안 풀린다.** 화면이 그대로 멈춘다
          { cancelable: false },
        )
      }),
  }
}

/**
 * `tviva20260904…` 모양 (`api.md` §5.3 의 예시).
 *
 * **서버가 이 값으로 토스에 승인을 건다** — 우리 목은 그냥 받고 무시하지만,
 * 계약의 자리를 비워두면 진짜로 바뀔 때 무엇이 들어가는지가 안 보인다.
 */
function fakePaymentKey(): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const tail = Math.random().toString(36).slice(2, 10)
  return `tviva${stamp}${tail}`
}
