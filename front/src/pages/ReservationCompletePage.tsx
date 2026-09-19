import { Link, useParams } from 'react-router'
import { useReservation } from '../api/queries'
import { PATHS } from '../routes'
import { seatLabel } from '../seats'
import { formatKstDateTime, formatKstTime, toInstant } from '../time'
import { ErrorView, Loading } from '../ui/QueryState'

/**
 * `4820 7315` — 8자리를 4-4로 끊는다.
 *
 * > ⚠️ **예약번호는 조회 열쇠가 아니다.** 조회는 로그인(`F-12`)으로만 한다 —
 * > 사용자가 자기 예약을 식별하거나 문의할 때 쓰는 번호다.
 * > **8자리 무작위**인 이유는 순번이면 누적 예약 건수가 그대로 노출되기 때문이다.
 */
function groupReservationNo(no: string): string {
  return no.length === 8 ? `${no.slice(0, 4)} ${no.slice(4)}` : no
}

export function ReservationCompletePage() {
  const params = useParams()
  const reservationNo = params['reservationNo'] ?? ''
  const reservation = useReservation(reservationNo)

  /*
   * ⚠️ 이 화면에서는 SSE 를 열지 않는다.
   *
   * 예매를 마친 사용자가 연결을 계속 붙잡으면 **서버 연결 수가 새어나간다**
   * (`W-06` 주석). 좌석 화면을 떠나면서 이미 닫혔고, 여기서 다시 열 이유가 없다.
   */

  if (reservation.isPending) return <Loading label="예약을 불러오는 중" />
  if (reservation.isError)
    return <ErrorView error={reservation.error} onRetry={() => void reservation.refetch()} />

  const r = reservation.data

  return (
    <div className="mx-auto max-w-2xl">
      <section className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <h1 className="text-xl font-bold">예약이 확정되었습니다</h1>

        <p className="mt-6 text-sm text-gray-600">예약번호</p>
        {/* 크게, 복사 가능하게. 외우라고 하지 않는다 — W-10 에서 언제든 다시 본다 */}
        <p className="mt-1 select-all text-4xl font-bold tracking-widest tabular-nums">
          {groupReservationNo(r.reservationNo)}
        </p>
        <p className="mt-3 text-xs text-gray-500">예약 상세에서 언제든 다시 확인할 수 있습니다.</p>
      </section>

      <section className="mt-4 rounded-xl border border-gray-200 bg-white p-6">
        <dl className="space-y-3 text-sm">
          <div className="flex gap-4">
            <dt className="w-16 text-gray-600">열차</dt>
            <dd>
              {r.trainNo} · {r.fromStation.name} → {r.toStation.name}
            </dd>
          </div>
          <div className="flex gap-4">
            <dt className="w-16 text-gray-600">일시</dt>
            <dd>
              {formatKstDateTime(toInstant(r.departAt))} → {formatKstTime(toInstant(r.arriveAt))}
            </dd>
          </div>
          <div className="flex gap-4">
            <dt className="w-16 text-gray-600">좌석</dt>
            <dd>{r.seats.map((s) => seatLabel(s)).join(', ')}</dd>
          </div>
          <div className="flex gap-4">
            <dt className="w-16 text-gray-600">결제</dt>
            <dd>{r.totalFare.toLocaleString('ko-KR')}원 · 토스페이먼츠</dd>
          </div>
          <div className="flex gap-4">
            <dt className="w-16 text-gray-600">상태</dt>
            <dd>{r.status}</dd>
          </div>
        </dl>
      </section>

      <div className="mt-4 flex gap-3">
        <Link
          to={PATHS.reservations}
          className="flex-1 rounded-lg bg-gray-900 py-2.5 text-center text-white"
        >
          예약 목록으로
        </Link>
        <Link
          to={PATHS.home}
          className="flex-1 rounded-lg border border-gray-300 py-2.5 text-center"
        >
          홈으로
        </Link>
      </div>
    </div>
  )
}
