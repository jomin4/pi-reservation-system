import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router'
import { hasErrorCode } from '../api/problem'
import { useHold, useMe, useReleaseHold } from '../api/queries'
import { toPayment, toSeats } from '../routes'
import { seatLabel } from '../seats'
import { createSeatEventStream } from '../sse'
import { recordServerTiming, toInstant, useCountdown } from '../time'
import { ErrorView, Loading } from '../ui/QueryState'
import { ExpiredDialog } from './holds/ExpiredDialog'

/** 3분 미만이면 경고로 바꾼다 (`W-04` 주석) */
const WARN_MS = 3 * 60 * 1000

function won(n: number): string {
  return `${n.toLocaleString('ko-KR')}원`
}

export function HoldPage() {
  const params = useParams()
  const navigate = useNavigate()
  const holdId = params['holdId'] ?? ''

  const hold = useHold(holdId)
  const release = useReleaseHold()
  const me = useMe()

  const countdown = useCountdown(hold.data ? toInstant(hold.data.expiresAt) : null)
  const verifying = useRef(false)

  // 상태로 들고 있을 이유가 없다 — 쿼리 결과에서 그대로 나온다
  const expired = hold.isError && hasErrorCode(hold.error, 'HOLD_EXPIRED')

  // 시계 오차를 잡는다 — 서버가 expiresAt 과 remainingSeconds 를 둘 다 주는 이유다
  useEffect(() => {
    if (hold.data) recordServerTiming(toInstant(hold.data.expiresAt), hold.data.remainingSeconds)
  }, [hold.data])

  /**
   * ⚠️ **타이머가 0이 되어도 클라이언트가 단정하지 않는다** (`E-02` 주석).
   *
   * 만료 판정은 **스케줄러(30초 주기)와 요청 시점 lazy 판정 둘 다**가 한다. 화면의 0과
   * 서버의 실제 회수 사이에 **최대 30초 차이**가 날 수 있다. 서버에 확인해 `410` 을
   * 받은 뒤에 모달을 띄우고, **아직 살아 있으면 그대로 진행시킨다.**
   */
  useEffect(() => {
    if (!countdown.expired || !hold.data || expired || verifying.current) return
    verifying.current = true
    void hold.refetch().finally(() => {
      verifying.current = false
    })
  }, [countdown.expired, hold, expired])

  /**
   * 이 화면에서도 SSE 를 유지한다 (`W-04` 주석).
   *
   * ⚠️ **개인 알림은 SSE 에 못 싣는다** — 스트림이 비인증이라 서버가 "내" 를 모른다
   * (`api.md` §6.1). 대신 **내 좌석이 `AVAILABLE` 로 돌아가는 것**을 보고 확인을 건다.
   */
  const tripId = hold.data?.tripId
  useEffect(() => {
    if (tripId === undefined || !hold.data) return
    const mine = new Set(hold.data.seats.map((s) => `${s.carNo}-${s.rowNo}${s.colLetter}`))

    const stream = createSeatEventStream({
      tripId,
      onSeatChanged: (event) => {
        if (event.cause !== 'HOLD_EXPIRED') return
        const touchesMine = event.seats.some((s) => mine.has(`${s.carNo}-${s.rowNo}${s.colLetter}`))
        if (touchesMine) void hold.refetch()
      },
      onResumeFailed: () => undefined,
    })
    return () => {
      stream.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hold 객체 전체를 넣으면 재조회마다 스트림이 다시 열린다
  }, [tripId])

  if (hold.isPending) return <Loading label="선점 정보를 불러오는 중" />

  const data = hold.data

  // ⚠️ 만료면 데이터 유무와 관계없이 E-02 가 먼저다. 이 화면에 바로 들어온 경우
  //    (새로고침·북마크) 좌석 목록이 없지만, "결제는 진행되지 않았습니다" 는
  //    그때도 반드시 말해야 한다
  if (expired) return <ExpiredDialog tripId={data?.tripId} seats={data?.seats ?? []} />

  if (hold.isError) return <ErrorView error={hold.error} onRetry={() => void hold.refetch()} />
  if (!data) return <ErrorView error={hold.error} />

  const perSeat = data.seats.length > 0 ? Math.round(data.totalFare / data.seats.length) : 0
  const warn = countdown.remainingMs < WARN_MS

  return (
    <div className="mx-auto max-w-2xl">
      <section className="rounded-xl border border-gray-200 bg-white p-6 text-center">
        <p className="text-sm text-gray-600">결제까지 남은 시간</p>
        <p
          className={
            warn
              ? 'mt-1 text-4xl font-bold tabular-nums text-red-600'
              : 'mt-1 text-4xl font-medium tabular-nums text-gray-900'
          }
        >
          {countdown.text}
        </p>
      </section>

      <section className="mt-4 rounded-xl border border-gray-200 bg-white p-6">
        <h1 className="font-bold">선점한 좌석</h1>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-gray-600">
            <tr>
              <th className="py-2">좌석</th>
              <th className="py-2">구분</th>
              <th className="py-2 text-right">운임</th>
            </tr>
          </thead>
          <tbody>
            {data.seats.map((s) => (
              <tr key={seatLabel(s)} className="border-t border-gray-100">
                <td className="py-2">{seatLabel(s)}</td>
                {/* 좌석 등급·할인은 초기 범위 밖이다 — 구분은 하나뿐이다 */}
                <td className="py-2">어른</td>
                <td className="py-2 text-right">{won(perSeat)}</td>
              </tr>
            ))}
            <tr className="border-t border-gray-300 font-medium">
              <td className="py-2">합계</td>
              <td />
              <td className="py-2 text-right">{won(data.totalFare)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="mt-4 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="font-bold">예매자 정보</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex gap-3">
            <dt className="w-16 text-gray-600">이름</dt>
            <dd>{me.data?.name ?? '—'}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-16 text-gray-600">연락처</dt>
            <dd>{me.data?.phone ?? '—'}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-gray-500">회원 정보에서 자동으로 채워집니다.</p>
      </section>

      <div className="mt-4 flex gap-3">
        <button
          type="button"
          disabled={release.isPending}
          onClick={() =>
            release.mutate(holdId, {
              // ⚠️ 실패해도 좌석 선택으로 보낸다. 이미 만료·해제됐어도 204 라
              //    여기서 막힐 이유가 없다 (api.md §5.2 멱등)
              onSettled: () => void navigate(toSeats(data.tripId), { replace: true }),
            })
          }
          className="flex-1 rounded-lg border border-gray-300 py-2.5"
        >
          선점 취소
        </button>
        <button
          type="button"
          onClick={() => void navigate(toPayment(holdId))}
          className="flex-1 rounded-lg bg-gray-900 py-2.5 font-medium text-white"
        >
          결제하기
        </button>
      </div>
    </div>
  )
}
