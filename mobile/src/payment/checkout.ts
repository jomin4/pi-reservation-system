import { isMock } from '../config/env'
import { createFakeCheckout } from './fakeCheckout'

/**
 * 결제창 어댑터 (`F-08`).
 *
 * > **SSE 와 같은 판단이다** (`api.md` §7.4 · #82). 밖으로 나갔다 돌아오는 것을
 * > **인터페이스 한 장 뒤에** 두면, 가짜로 화면을 먼저 만들고 진짜는 나중에 끼운다.
 *
 * ⚠️ **결제창이 우리에게 주는 건 `paymentKey` 하나다.** 승인 확정은 서버가
 *    한다 (`api.md` §5.3 — 2단계인 이유). 그래서 이 인터페이스가 이렇게 좁다.
 *
 * ⚠️ **진짜 토스 결제창을 지금 붙일 수 없다** (2026-09-18).
 *
 * | 없는 것 | 그래서 |
 * |---|---|
 * | 상점 **시크릿 키** | 승인 확정(`POST /holds/{id}/payment`)을 할 서버가 없다 |
 * | **백엔드** | `paymentKey` 를 받아줄 곳이 없다 |
 * | **dev build** | Expo Go 는 커스텀 네이티브 모듈을 못 싣는다 — 토스 RN SDK 가 안 뜬다 |
 *
 * > **붙였다고 적지 않는다.** 검증 못 하는 코드를 "연동됨" 으로 남기면
 * > `msw` 때와 같은 일이 된다 (2026-09-15 · 목이 Hermes 에서 안 도는 걸 모르고
 * > 문서에 「된다」 로 적었다). **실제 연동은 어댑터 교체 한 번**이다.
 */

export interface CheckoutRequest {
  /** 서버가 만든 주문 번호. **금액을 클라이언트가 정하지 않는다** (`api.md` §5.3) */
  orderId: string
  amount: number
  orderName: string
}

export type CheckoutResult =
  | { outcome: 'approved'; paymentKey: string }
  /** 사용자가 결제창을 닫았다. **에러가 아니다** — 화면은 그대로 있어야 한다 */
  | { outcome: 'cancelled' }
  | { outcome: 'failed'; message: string }

export interface PaymentCheckout {
  /**
   * 결제창을 열고 **닫힐 때까지 기다린다.**
   *
   * ⚠️ 이 사이에 **앱이 백그라운드로 간다.** SSE 가 끊기고, 타이머 인터벌이
   *    멈추고, OS 가 앱을 죽일 수도 있다 (와이어프레임 `M-05`). 그래서 호출부는
   *    이 약속이 지켜질 거라 믿으면 안 되고 **복귀 후 서버에 결과를 물어야** 한다.
   */
  open(request: CheckoutRequest): Promise<CheckoutResult>
}

/** 목 모드가 아닌데 결제창 구현이 없다 — 조용히 성공한 척하지 않는다 */
const unimplemented: PaymentCheckout = {
  open: () =>
    Promise.reject(
      new Error(
        '결제창 구현이 없다. 토스 클라이언트 키와 dev build 가 생기면 ' +
          'src/payment/checkout.ts 의 createCheckout 에 끼운다 (#44).',
      ),
    ),
}

let override: PaymentCheckout | null = null

/** 테스트·개발 화면에서 갈아끼운다 */
export function setCheckout(next: PaymentCheckout | null): void {
  override = next
}

export function createCheckout(): PaymentCheckout {
  if (override !== null) return override
  return isMock ? createFakeCheckout() : unimplemented
}
