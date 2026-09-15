import { useCallback, useEffect, useRef, useState } from 'react'
import { hasErrorCode, isPaymentPending } from '../../api/problem'
import { fetchPaymentResult } from '../../api/queries'
import type { components } from '../../api/schema'

type Reservation = components['schemas']['ReservationDetail']

/** 폴링 상한. 도달하면 "예약 목록에서 확인" 으로 뺀다 (`E-03` 주석) */
export const MAX_POLLS = 10
const DEFAULT_INTERVAL_MS = 2000

export type PollOutcome =
  | { kind: 'confirmed'; reservation: Reservation }
  | { kind: 'declined' }
  | { kind: 'expired' }
  | { kind: 'gave-up' }

export interface PaymentPolling {
  attempts: number
  start: () => void
}

/**
 * `E-03` 결제 결과 폴링.
 *
 * > **이 시스템에서 가장 어려운 화면이다.** 승인 성공인지 실패인지 모르는 구간 —
 * > 외부 결제와 내부 DB 사이에 분산 트랜잭션이 없어서 생기는 **필연적 상태**다.
 *
 * ⚠️ **`GET` 으로만 묻는다.** 새 결제 요청이 아니라 **기존 요청의 결과 조회**다.
 * 이 구분이 무너지면 **이중 결제**가 난다.
 *
 * ⚠️ 상한(10회)에 닿으면 멈춘다. 그 뒤 서버가 보상 취소(`F-08` 6단계)를 하면
 * 선점이 반환된다 — 화면은 "예약 목록에서 확인" 으로 뺀다.
 */
export function usePaymentPolling(
  holdId: string,
  onOutcome: (outcome: PollOutcome) => void,
): PaymentPolling {
  const [attempts, setAttempts] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const stopped = useRef(false)

  // 화면을 떠나면 멈춘다 — 사라진 화면이 계속 서버를 두드리면 안 된다
  useEffect(() => {
    return () => {
      stopped.current = true
      if (timer.current !== undefined) clearTimeout(timer.current)
    }
  }, [])

  const start = useCallback(() => {
    stopped.current = false

    // ⚠️ `useCallback` 으로 자기 자신을 부르면 선언 전 접근이 된다.
    //    루프를 여기 안에 두면 그 문제가 통째로 사라진다
    const run = async (n: number): Promise<void> => {
      if (stopped.current) return
      setAttempts(n)

      try {
        const reservation = await fetchPaymentResult(holdId)
        stopped.current = true
        onOutcome({ kind: 'confirmed', reservation })
        return
      } catch (e) {
        if (hasErrorCode(e, 'PAYMENT_DECLINED')) {
          stopped.current = true
          onOutcome({ kind: 'declined' })
          return
        }
        if (hasErrorCode(e, 'HOLD_EXPIRED')) {
          stopped.current = true
          onOutcome({ kind: 'expired' })
          return
        }
        if (n >= MAX_POLLS) {
          stopped.current = true
          onOutcome({ kind: 'gave-up' })
          return
        }

        // 네트워크·5xx 도 "아직 모른다" 와 같다. 상한까지 계속 물어본다
        const wait = isPaymentPending(e) ? (e.retryAfterSeconds ?? 2) * 1000 : DEFAULT_INTERVAL_MS
        timer.current = setTimeout(() => void run(n + 1), wait)
      }
    }

    void run(1)
  }, [holdId, onOutcome])

  return { attempts, start }
}
