import { useNavigate } from 'react-router'
import { PATHS, toSeats } from '../../routes'
import { seatLabel } from '../../seats'
import type { SeatRef } from '../../seats'

/**
 * `E-02` 선점 만료.
 *
 * > ⚠️ **"결제는 진행되지 않았습니다" 를 반드시 명시한다.** 돈이 걸린 화면에서
 * > 침묵은 불안을 만든다 (와이어프레임 주석).
 *
 * ⚠️ **좌석 다시 선택으로 가면 좌석맵을 새로 받는다.** 같은 좌석이 이미 남에게
 * 갔을 수 있다.
 */
export function ExpiredDialog({
  tripId,
  seats,
}: {
  tripId?: number | undefined
  seats: readonly SeatRef[]
}) {
  const navigate = useNavigate()
  const list = seats.map((s) => seatLabel(s)).join(', ')

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div
        role="alertdialog"
        aria-labelledby="expired-title"
        className="w-full max-w-sm rounded-xl bg-white p-6"
      >
        <h2 id="expired-title" className="text-lg font-bold">
          선점 시간이 만료되었습니다
        </h2>

        <p className="mt-3 text-sm text-gray-700">
          {list === '' ? (
            <>10분 안에 결제가 완료되지 않아 좌석이 반환되었습니다.</>
          ) : (
            <>
              10분 안에 결제가 완료되지 않아 <b>{list}</b> 좌석이 반환되었습니다.
            </>
          )}
        </p>
        <p className="mt-2 text-sm font-medium text-gray-900">결제는 진행되지 않았습니다.</p>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => void navigate(PATHS.home)}
            className="flex-1 rounded-lg border border-gray-300 py-2 text-sm"
          >
            홈으로
          </button>
          {tripId !== undefined && (
            <button
              type="button"
              onClick={() => void navigate(toSeats(tripId), { replace: true })}
              className="flex-1 rounded-lg bg-gray-900 py-2 text-sm text-white"
            >
              좌석 다시 선택
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
