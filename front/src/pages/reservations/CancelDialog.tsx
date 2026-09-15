/**
 * `W-10` 취소 확인.
 *
 * ⚠️ **되돌릴 수 없는 동작이라 모달을 한 겹 둔다** (와이어프레임 주석).
 *
 * > **환불을 얼버무리지 않는다.** `F-15` 는 P1 이라 `P0` 단계에서는 **좌석만
 * > 돌아가고 결제는 그대로 남는다.** 화면이 "취소되었습니다" 만 말하면 사용자는
 * > 돈이 돌아온다고 읽는다 — 그 오해가 문의로 돌아온다.
 */
export function CancelDialog({
  onConfirm,
  onClose,
  busy,
}: {
  onConfirm: () => void
  onClose: () => void
  busy: boolean
}) {
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div
        role="alertdialog"
        aria-labelledby="cancel-title"
        className="w-full max-w-sm rounded-xl bg-white p-6"
      >
        <h2 id="cancel-title" className="text-lg font-bold">
          예약을 취소할까요?
        </h2>
        <p className="mt-3 text-sm text-gray-700">
          취소하면 <b>좌석이 즉시 다른 사람에게 열립니다.</b> 되돌릴 수 없습니다.
        </p>
        <p className="mt-2 text-sm text-gray-700">
          환불은 <b>별도로 처리</b>됩니다 — 이 화면에서 결제가 취소되지는 않습니다.
        </p>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-300 py-2 text-sm"
          >
            돌아가기
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-red-700 py-2 text-sm text-white disabled:bg-gray-300"
          >
            {busy ? '취소하는 중…' : '예약 취소'}
          </button>
        </div>
      </div>
    </div>
  )
}
