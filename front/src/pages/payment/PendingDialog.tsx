import { useNavigate } from 'react-router'
import { PATHS } from '../../routes'
import { MAX_POLLS } from './usePaymentPolling'

/**
 * `E-03` 결제 타임아웃.
 *
 * > **승인 성공인지 실패인지 모르는 구간이다.** 외부 결제와 내부 DB 사이에 분산
 * > 트랜잭션이 없어서 생기는 **필연적 상태**다.
 *
 * ⚠️ **"다시 결제" 를 비활성으로 잠근다.** 불안한 사용자가 누르는 것이
 * **이중 결제의 가장 흔한 원인**이다 (와이어프레임 주석).
 */
export function PendingDialog({ attempts, gaveUp }: { attempts: number; gaveUp: boolean }) {
  const navigate = useNavigate()

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div
        role="alertdialog"
        aria-labelledby="pending-title"
        className="w-full max-w-sm rounded-xl bg-white p-6"
      >
        <h2 id="pending-title" className="text-lg font-bold">
          결제 결과를 확인하고 있습니다
        </h2>

        {gaveUp ? (
          <p className="mt-3 text-sm text-gray-700">
            결과 확인이 오래 걸리고 있습니다. <b>예약 목록에서 확인</b>해 주세요. 승인되지 않았다면
            좌석은 자동으로 반환됩니다.
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm text-gray-700">
              결제사 응답이 지연되고 있습니다. 결과를 확인하는 중입니다.
            </p>
            <p className="mt-2 text-sm font-medium text-gray-900">
              이 창을 닫거나 다시 결제하지 마세요.
            </p>
            <p className="mt-4 text-sm text-gray-500">
              확인 중… ({attempts} / {MAX_POLLS}회)
            </p>
          </>
        )}

        <div className="mt-5 flex gap-2">
          {/*
            ⚠️ 잠겨 있다. 불안한 사용자가 누르는 것이 이중 결제의 가장 흔한 원인이다.
               잠금을 푸는 경로를 두지 않는다 — 결과는 폴링이 가져온다.
          */}
          <button
            type="button"
            disabled
            className="flex-1 cursor-not-allowed rounded-lg border border-gray-200 py-2 text-sm text-gray-400"
          >
            다시 결제
          </button>
          <button
            type="button"
            onClick={() => void navigate(PATHS.reservations)}
            className="flex-1 rounded-lg bg-gray-900 py-2 text-sm text-white"
          >
            예약 목록에서 확인
          </button>
        </div>
      </div>
    </div>
  )
}
