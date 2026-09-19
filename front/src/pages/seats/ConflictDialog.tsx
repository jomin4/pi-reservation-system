import { ApiError, hasErrorCode, isSeatConflict } from '../../api/problem'
import { seatLabel } from '../../seats'

/**
 * `E-01` 선점 충돌.
 *
 * > **이 화면이 `F-04` 의 원자성을 사용자에게 설명하는 자리다** (와이어프레임 주석).
 * > "7B는 실패, 7A는 성공" 이 없다는 걸 **명시적으로 말해야** 한다 — 안 그러면
 * > 사용자는 7A가 잡혔다고 착각하고 다시 시도해 **중복 선점**을 만든다.
 *
 * ⚠️ **`409` 가 두 종류다.** 사용자에게 할 말이 정반대다.
 */
export function ConflictDialog({
  error,
  onPickOther,
  onRetry,
  retryDisabled,
}: {
  error: ApiError
  onPickOther: () => void
  onRetry: () => void
  retryDisabled: boolean
}) {
  // `SEAT_LOCK_TIMEOUT` 은 어느 좌석이 문제인지 서버도 모른다 — 잠그지 못했으니까
  const lockTimeout = hasErrorCode(error, 'SEAT_LOCK_TIMEOUT')
  const failed = isSeatConflict(error) ? (error.problem.failedSeats ?? []) : []
  const takenBy = failed.filter((s) => s.reason === 'HELD_BY_OTHER')
  const together = failed.filter((s) => s.reason === 'ALL_OR_NOTHING')

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div
        role="alertdialog"
        aria-labelledby="conflict-title"
        className="w-full max-w-sm rounded-xl bg-white p-6"
      >
        <h2 id="conflict-title" className="text-lg font-bold">
          좌석을 잡지 못했습니다
        </h2>

        {lockTimeout ? (
          <p className="mt-3 text-sm text-gray-700">
            잠시 몰려서 좌석을 잡지 못했습니다. 다시 시도하면 성공할 수 있습니다.
          </p>
        ) : (
          <div className="mt-3 space-y-2 text-sm text-gray-700">
            {takenBy.map((s) => (
              <p key={seatLabel(s)}>
                <b>{seatLabel(s)}</b> 좌석을 다른 고객이 먼저 선택했습니다.
              </p>
            ))}
            {together.length > 0 && (
              <p>
                함께 선택한 <b>{together.map((s) => `${s.rowNo}${s.colLetter}`).join(', ')}</b> 도
                선점되지 않았습니다.
              </p>
            )}
          </div>
        )}

        {/*
          ⚠️ 이 문구가 이 모달의 존재 이유다. 원자성을 말하지 않으면
             사용자가 일부는 잡혔다고 착각하고 중복 선점을 만든다.
        */}
        <p className="mt-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
          선택한 좌석은 <b>전부 함께 잡히거나 전부 실패</b>합니다. 일부만 잡힌 상태로 남지 않습니다.
        </p>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onPickOther}
            className="flex-1 rounded-lg bg-gray-900 py-2 text-sm text-white"
          >
            다른 좌석 선택
          </button>
          {/*
            ⚠️ 연타 방지. 상대 선점은 10분 뒤 풀릴 수 있어 재시도에 의미가 있지만,
               즉시 재시도는 거의 실패한다 (E-01 주석).
          */}
          <button
            type="button"
            onClick={onRetry}
            disabled={retryDisabled}
            className="flex-1 rounded-lg border border-gray-300 py-2 text-sm disabled:text-gray-400"
          >
            {retryDisabled ? '잠시 후 다시' : '같은 좌석 다시 시도'}
          </button>
        </div>

        <p className="mt-3 text-center text-xs text-gray-400">요청번호 {error.requestId}</p>
      </div>
    </div>
  )
}
