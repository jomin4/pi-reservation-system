import { useState } from 'react'
import { Link } from 'react-router'
import { useReservations } from '../api/queries'
import type { components } from '../api/schema'
import { toReservation } from '../routes'
import { seatLabel } from '../seats'
import { formatKstDateTime, toInstant } from '../time'
import { Empty, ErrorView, Loading } from '../ui/QueryState'
import { StatusBadge } from './reservations/StatusBadge'

type Summary = components['schemas']['ReservationSummary']

/** `48207315` → `4820 7315` (`W-06` 과 같은 규칙) */
function groupReservationNo(no: string): string {
  return no.length === 8 ? `${no.slice(0, 4)} ${no.slice(4)}` : no
}

function Row({ r }: { r: Summary }) {
  return (
    <tr className="border-t border-gray-100">
      <td className="py-3 font-medium tabular-nums">{groupReservationNo(r.reservationNo)}</td>
      <td className="py-3">{r.trainNo}</td>
      <td className="py-3 tabular-nums">{formatKstDateTime(toInstant(r.departAt))}</td>
      <td className="py-3">{r.seats.map((s) => seatLabel(s)).join(', ')}</td>
      <td className="py-3">
        <StatusBadge status={r.status} />
      </td>
      <td className="py-3 text-right">
        <Link to={toReservation(r.reservationNo)} className="text-sm text-gray-900 underline">
          상세
        </Link>
      </td>
    </tr>
  )
}

/**
 * `W-09` 예약 목록 (`F-12`).
 *
 * > **취소된 예약도 남는다.** `F-14` 는 삭제가 아니라 `CANCELLED` 전이다 —
 * > 이력 보존이 설계 의도라 화면이 걸러내면 그 의도가 사라진다.
 *
 * ⚠️ **진행 중인 선점은 여기 없다** — 선점은 예약이 아니다. 와이어프레임은 진행 중
 * 선점을 상단 배너로 유도하라고 하지만 **그걸 부를 API 가 계약에 없다** (#104).
 */
export function ReservationsPage() {
  const [page, setPage] = useState(0)
  const list = useReservations(page)

  if (list.isPending) return <Loading label="예약을 불러오는 중" />
  if (list.isError) return <ErrorView error={list.error} onRetry={() => void list.refetch()} />

  /*
   * ⚠️ **표시는 응답의 `page` 로 한다.** 로컬 상태로 그리면 서버가 범위를 조정했을 때
   * 화면의 쪽번호와 실제로 보고 있는 데이터가 어긋난다. 로컬 상태는 **요청 값**이고,
   * 응답의 `page` 가 **지금 보고 있는 것**이다.
   */
  const { content, page: shown, totalPages, totalElements } = list.data

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-bold">예약 내역</h1>
      <p className="mt-1 text-sm text-gray-500">
        {totalElements}건 · 취소한 예약도 이력으로 남습니다.
      </p>

      {content.length === 0 ? (
        <Empty>아직 예약이 없습니다.</Empty>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white px-6">
          <table className="w-full min-w-xl text-left text-sm">
            <thead>
              <tr className="text-xs text-gray-500">
                <th className="py-3 font-normal">예약번호</th>
                <th className="py-3 font-normal">열차</th>
                <th className="py-3 font-normal">일시</th>
                <th className="py-3 font-normal">좌석</th>
                <th className="py-3 font-normal">상태</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {content.map((r) => (
                <Row key={r.reservationNo} r={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-4 text-sm">
          <button
            type="button"
            disabled={shown === 0}
            onClick={() => setPage(shown - 1)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:text-gray-300"
          >
            이전
          </button>
          {/* 서버가 0-based 로 주는 값을 사람이 읽는 1-based 로 바꿔 보여준다 */}
          <span className="tabular-nums">
            {shown + 1} / {totalPages}
          </span>
          <button
            type="button"
            disabled={shown >= totalPages - 1}
            onClick={() => setPage(shown + 1)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 disabled:text-gray-300"
          >
            다음
          </button>
        </nav>
      )}
    </div>
  )
}
