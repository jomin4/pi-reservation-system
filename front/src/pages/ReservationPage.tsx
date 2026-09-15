import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { hasErrorCode } from '../api/problem'
import { useCancelReservation, useReservation } from '../api/queries'
import { PATHS } from '../routes'
import { seatLabel } from '../seats'
import { formatKstDateTime, formatKstTime, instantToMs, serverNow, toInstant } from '../time'
import { ErrorView, Loading } from '../ui/QueryState'
import { CancelDialog } from './reservations/CancelDialog'
import { StatusBadge } from './reservations/StatusBadge'

function groupReservationNo(no: string): string {
  return no.length === 8 ? `${no.slice(0, 4)} ${no.slice(4)}` : no
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <dt className="w-20 shrink-0 text-gray-600">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/**
 * `W-10` 예약 상세 · 취소 (`F-14` · `F-15`).
 *
 * > **이 화면은 목록을 거치지 않고 바로 열릴 수 있다.** 그래서 계약이
 * > `Reservation` 하나에 운행 · 예매자까지 담았다 — 두 번 깜빡이지 않는다.
 */
export function ReservationPage() {
  const params = useParams()
  const reservationNo = params['reservationNo'] ?? ''
  const queryClient = useQueryClient()

  const query = useReservation(reservationNo)
  const cancel = useCancelReservation()
  const [asking, setAsking] = useState(false)

  if (query.isPending) return <Loading label="예약을 불러오는 중" />
  if (query.isError) return <ErrorView error={query.error} onRetry={() => void query.refetch()} />

  const r = query.data
  const departed = instantToMs(toInstant(r.departAt)) <= serverNow()

  /*
   * ⚠️ **버튼 비활성은 안내이지 판정이 아니다.**
   *
   * 출발 여부는 `departAt` 으로 미리 알 수 있으니 눌러봐야 헛수고인 버튼을 막는다.
   * 하지만 **진짜 판정은 서버**다 — 시계가 몇 초 어긋난 순간에 눌리면 `409`
   * (`RESERVATION_NOT_CANCELLABLE`) 가 오고, 그 사유를 그대로 보여준다.
   * 그래서 `serverNow()` 를 쓴다 — 기기 시계를 믿으면 두 판정이 더 자주 갈라진다.
   */
  const cancellable = r.status === 'CONFIRMED' && !departed

  const confirmCancel = () => {
    cancel.mutate(reservationNo, {
      onSuccess: (updated) => {
        setAsking(false)
        queryClient.setQueryData(['reservation', reservationNo], updated)
        // 목록의 상태도 달라졌다
        void queryClient.invalidateQueries({ queryKey: ['reservations'] })
        /*
         * ⚠️ **좌석맵을 버린다.** `staleTime: Infinity` 라 그냥 두면 좌석 선택 화면이
         * 방금 돌려준 좌석을 계속 판매 완료로 그린다. 다른 화면들에는 서버가 SSE 로
         * 알리지만, **이 탭의 캐시는 이 탭이 치워야 한다.**
         */
        void queryClient.invalidateQueries({ queryKey: ['seatMap', r.tripId] })
      },
      // 409 는 모달 뒤에 숨으면 안 된다 — 사유를 본문에서 읽게 한다
      onError: () => setAsking(false),
    })
  }

  const cancelled = r.status === 'CANCELLED'
  const notCancellable = hasErrorCode(cancel.error, 'RESERVATION_NOT_CANCELLABLE')

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold tabular-nums">{groupReservationNo(r.reservationNo)}</h1>
        <StatusBadge status={r.status} />
      </div>

      {cancelled && (
        <p role="status" className="mt-4 rounded-lg bg-gray-100 p-4 text-sm text-gray-800">
          좌석이 반환되었습니다. <b>환불은 별도 처리됩니다.</b>
        </p>
      )}

      {notCancellable && (
        <div className="mt-4">
          <ErrorView error={cancel.error} />
        </div>
      )}

      <section className="mt-4 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="font-bold">예약 정보</h2>
        <dl className="mt-3 space-y-3 text-sm">
          <Field label="열차">
            {r.trainNo} · {r.fromStation.name} → {r.toStation.name}
          </Field>
          <Field label="일시">
            {formatKstDateTime(toInstant(r.departAt))} → {formatKstTime(toInstant(r.arriveAt))}
          </Field>
          <Field label="좌석">{r.seats.map((s) => seatLabel(s)).join(', ')}</Field>
          <Field label="예매자">
            {/* ⚠️ 예약 시점 스냅샷이다 — 마이페이지에서 이름을 바꿔도 안 변한다 */}
            {r.passengerName} · {r.passengerPhone}
          </Field>
        </dl>
      </section>

      <section className="mt-4 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="font-bold">결제 정보</h2>
        <dl className="mt-3 space-y-3 text-sm">
          <Field label="결제 수단">토스페이먼츠 — 카드</Field>
          <Field label="결제 금액">{r.totalFare.toLocaleString('ko-KR')}원</Field>
          {r.paidAt && <Field label="결제 일시">{formatKstDateTime(toInstant(r.paidAt))}</Field>}
          {r.cancelledAt && (
            <Field label="취소 일시">{formatKstDateTime(toInstant(r.cancelledAt))}</Field>
          )}
        </dl>
      </section>

      <div className="mt-4 flex gap-3">
        <Link
          to={PATHS.reservations}
          className="flex-1 rounded-lg border border-gray-300 py-2.5 text-center"
        >
          목록으로
        </Link>
        <button
          type="button"
          disabled={!cancellable}
          onClick={() => setAsking(true)}
          className="flex-1 rounded-lg border border-red-300 py-2.5 text-red-800 disabled:border-gray-200 disabled:text-gray-300"
        >
          예약 취소
        </button>
      </div>

      {!cancellable && !cancelled && (
        <p className="mt-2 text-center text-xs text-gray-500">
          {departed ? '이미 출발한 열차는 취소할 수 없습니다.' : '취소할 수 없는 예약입니다.'}
        </p>
      )}

      {asking && (
        <CancelDialog
          busy={cancel.isPending}
          onConfirm={confirmCancel}
          onClose={() => setAsking(false)}
        />
      )}
    </div>
  )
}
