import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ApiError, hasErrorCode, isPaymentPending } from '../api/problem'
import { useConfirmPayment, useCreatePaymentIntent, useHold } from '../api/queries'
import { toReservationComplete, toSeats } from '../routes'
import { seatLabel } from '../seats'
import { toInstant, useCountdown } from '../time'
import { ErrorView, Loading } from '../ui/QueryState'
import { ExpiredDialog } from './holds/ExpiredDialog'
import { PendingDialog } from './payment/PendingDialog'
import { usePaymentPolling } from './payment/usePaymentPolling'
import type { PollOutcome } from './payment/usePaymentPolling'

function won(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`
}

/**
 * ⚠️ **화면 진입 시 1회 생성한다.** 버튼을 누를 때마다 새로 만들면
 * **멱등성이 무의미하다** (`W-05` 주석 · `F-10`).
 */
function useIdempotencyKey(): string {
  // ⚠️ `useRef` 로 만들면 렌더 중 ref 를 읽게 된다.
  //    `useState` 의 지연 초기화는 **딱 한 번만** 실행되고 렌더 중에 읽어도 안전하다
  const [key] = useState(() => globalThis.crypto?.randomUUID?.() ?? `idem-${Date.now()}`)
  return key
}

export function PaymentPage() {
  const params = useParams()
  const navigate = useNavigate()
  const holdId = params['holdId'] ?? ''

  const hold = useHold(holdId)
  const intent = useCreatePaymentIntent()
  const confirm = useConfirmPayment()
  const idempotencyKey = useIdempotencyKey()

  const [pending, setPending] = useState(false)
  const [gaveUp, setGaveUp] = useState(false)
  const [expired, setExpired] = useState(false)

  const countdown = useCountdown(hold.data ? toInstant(hold.data.expiresAt) : null)

  const onOutcome = useCallback(
    (outcome: PollOutcome) => {
      if (outcome.kind === 'confirmed') {
        setPending(false)
        void navigate(toReservationComplete(outcome.reservation.reservationNo), { replace: true })
        return
      }
      if (outcome.kind === 'expired') {
        setPending(false)
        setExpired(true)
        return
      }
      if (outcome.kind === 'gave-up') {
        setGaveUp(true)
        return
      }
      // 거절이면 이 화면에 머문다 — 선점은 유지된다 (PM-3)
      setPending(false)
    },
    [navigate],
  )

  const polling = usePaymentPolling(holdId, onOutcome)

  // 결제창을 띄우기 전에 서버가 금액을 정해둔다 (전이 PM-1)
  useEffect(() => {
    if (holdId !== '' && intent.isIdle) intent.mutate(holdId)
  }, [holdId, intent])

  const pay = () => {
    const order = intent.data
    if (!order) return

    confirm.mutate(
      {
        holdId,
        idempotencyKey,
        body: {
          // 토스 결제창이 돌려주는 값이다. 목 단계에서는 주문번호로 대신한다
          paymentKey: `tviva_${order.orderId}`,
          orderId: order.orderId,
          amount: order.amount,
        },
      },
      {
        onSuccess: (reservation) =>
          void navigate(toReservationComplete(reservation.reservationNo), { replace: true }),
        onError: (e) => {
          // ⚠️ 승인 거절과 승인 타임아웃은 다르게 다룬다.
          //    거절은 이 화면에 머물며 재시도(선점 유지), 타임아웃은 E-03 로 간다
          if (isPaymentPending(e)) {
            setPending(true)
            polling.start()
            return
          }
          if (hasErrorCode(e, 'HOLD_EXPIRED')) setExpired(true)
        },
      },
    )
  }

  if (hold.isPending) return <Loading label="결제 정보를 불러오는 중" />

  const data = hold.data
  if (expired || (hold.isError && hasErrorCode(hold.error, 'HOLD_EXPIRED')))
    return <ExpiredDialog tripId={data?.tripId} seats={data?.seats ?? []} />
  if (hold.isError) return <ErrorView error={hold.error} onRetry={() => void hold.refetch()} />
  if (!data) return <ErrorView error={hold.error} />

  const amount = intent.data?.amount ?? data.totalFare
  const declined = confirm.error instanceof ApiError && hasErrorCode(confirm.error, 'PAYMENT_DECLINED')
  const busy = confirm.isPending || pending

  return (
    <div className="mx-auto max-w-2xl">
      <section className="rounded-xl border border-gray-200 bg-white p-6 text-center">
        <p className="text-sm text-gray-600">결제까지 남은 시간</p>
        <p className="mt-1 text-3xl font-medium tabular-nums">{countdown.text}</p>
      </section>

      <section className="mt-4 rounded-xl border border-gray-200 bg-white p-6">
        <h1 className="font-bold">결제 내역</h1>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex gap-4">
            <dt className="w-20 text-gray-600">좌석</dt>
            <dd>{data.seats.map((s) => seatLabel(s)).join(', ')}</dd>
          </div>
          <div className="flex gap-4">
            <dt className="w-20 text-gray-600">결제 금액</dt>
            <dd className="font-medium">{won(amount)}</dd>
          </div>
          <div className="flex gap-4">
            <dt className="w-20 text-gray-600">결제 수단</dt>
            <dd>토스페이먼츠 — 카드</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-gray-500">결제창은 토스페이먼츠가 제공합니다.</p>
      </section>

      {declined && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-800">
          결제가 거절되었습니다. 다시 시도해 주세요.{' '}
          <b>선점은 유지되고 있어 좌석은 그대로입니다.</b>
        </p>
      )}

      {/*
        ⚠️ 버튼은 클릭 즉시 비활성 + 진행 표시. 이중 제출은 UI 에서도 막고
           서버에서도 막는다(Idempotency-Key) — 둘 다 필요하다
      */}
      <button
        type="button"
        disabled={busy || !intent.data}
        onClick={pay}
        className="mt-4 w-full rounded-lg bg-gray-900 py-3 font-medium text-white disabled:bg-gray-300"
      >
        {busy ? '결제 진행 중…' : `${won(amount)} 결제하기`}
      </button>

      <p className="mt-3 text-center text-xs text-gray-500">
        결제 승인 후 예약이 확정됩니다. 승인이 실패해도 선점은 유지됩니다.
      </p>

      <button
        type="button"
        onClick={() => void navigate(toSeats(data.tripId))}
        className="mt-4 w-full text-center text-sm text-gray-500"
      >
        좌석 선택으로 돌아가기
      </button>

      {pending && <PendingDialog attempts={polling.attempts} gaveUp={gaveUp} />}
    </div>
  )
}
