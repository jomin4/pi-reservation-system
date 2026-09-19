import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { ApiError } from '../api/problem'
import { useCreateHold, useSeatMap } from '../api/queries'
import { hasSession } from '../auth'
import { PATHS, toHold } from '../routes'
import {
  applySeatChange,
  clearSelection,
  loadSelection,
  MAX_SEATS,
  saveSelection,
  selectedKeySet,
  seatLabel,
  toggleSeat,
} from '../seats'
import type { SeatMap, SeatRef } from '../seats'
import { createSeatEventStream } from '../sse'
import type { StreamStatus } from '../sse'
import { recordServerTiming, toInstant } from '../time'
import { ErrorView, Loading } from '../ui/QueryState'
import { ConflictDialog } from './seats/ConflictDialog'
import { SeatGrid, SeatLegend } from './seats/SeatGrid'

/** 즉시 재시도는 거의 실패한다 — 연타를 막는다 (`E-01` 주석) */
const RETRY_COOLDOWN_MS = 3000

function ConnectionBadge({ status }: { status: StreamStatus }) {
  const open = status === 'open'
  return (
    <span
      role="status"
      className={
        open
          ? 'rounded-full bg-green-100 px-2.5 py-1 text-xs text-green-900'
          : 'rounded-full bg-red-100 px-2.5 py-1 text-xs text-red-900'
      }
    >
      {open ? '실시간 연결됨' : '재연결 중'}
    </span>
  )
}

export function SeatsPage() {
  const params = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const tripId = Number(params['tripId'])

  const seatMap = useSeatMap(tripId)
  const createHold = useCreateHold()

  const [carNo, setCarNo] = useState<number | null>(null)
  const [selected, setSelected] = useState<SeatRef[]>(() => loadSelection(tripId))
  const [streamStatus, setStreamStatus] = useState<StreamStatus>('connecting')
  const [cooling, setCooling] = useState(false)
  const cooldownRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  // ⚠️ 선택을 세션에 남긴다. 선점 직전에 로그인으로 튕겼다가 돌아왔을 때
  //    좌석을 처음부터 다시 고르게 하면 안 된다 (W-07 주석)
  useEffect(() => {
    saveSelection(tripId, selected)
  }, [tripId, selected])

  /**
   * ⚠️ **재연결마다 전체 재조회하지 않는다.** `Last-Event-ID` 이어붙이기는 브라우저가
   * 자동으로 하고, 우리는 **`resume-failed` 가 왔을 때만** 800석을 다시 받는다 (`F-19`).
   */
  useEffect(() => {
    if (!Number.isFinite(tripId)) return

    const stream = createSeatEventStream({
      tripId,
      onSeatChanged: (event) => {
        queryClient.setQueryData<SeatMap>(['seatMap', tripId], (prev) =>
          prev ? applySeatChange(prev, event) : prev,
        )
      },
      onResumeFailed: () => {
        void queryClient.invalidateQueries({ queryKey: ['seatMap', tripId] })
      },
      onStatusChange: setStreamStatus,
    })
    return () => {
      stream.close()
    }
  }, [tripId, queryClient])

  useEffect(() => {
    return () => {
      if (cooldownRef.current !== undefined) clearTimeout(cooldownRef.current)
    }
  }, [])

  const onToggle = useCallback((ref: SeatRef) => {
    setSelected((prev) => toggleSeat(prev, ref))
  }, [])

  if (!Number.isFinite(tripId)) return <ErrorView error={new Error('운행을 찾을 수 없습니다')} />
  if (seatMap.isPending) return <Loading label="좌석을 불러오는 중" />
  if (seatMap.isError)
    return <ErrorView error={seatMap.error} onRetry={() => void seatMap.refetch()} />

  const map = seatMap.data
  const cars = map.cars.map((c) => c.carNo)
  const activeCar = carNo ?? cars[0] ?? 1
  const keys = selectedKeySet(selected)

  const submit = () => {
    // ⚠️ 비로그인이면 로그인으로 보내고 이 화면으로 복귀한다.
    //    예매는 로그인 회원만 가능하다 — 비회원 예매는 2026-09-04 철회됐다
    if (!hasSession()) {
      void navigate(PATHS.login, {
        state: { from: `/trips/${tripId}/seats` },
      })
      return
    }

    createHold.mutate(
      { tripId, seats: selected },
      {
        onSuccess: (hold) => {
          // `remainingSeconds` 로 시계 오차를 잡는다 (api.md §5.2)
          recordServerTiming(toInstant(hold.expiresAt), hold.remainingSeconds)
          clearSelection(tripId)
          void navigate(toHold(hold.holdId))
        },
      },
    )
  }

  const retry = () => {
    setCooling(true)
    cooldownRef.current = setTimeout(() => setCooling(false), RETRY_COOLDOWN_MS)
    submit()
  }

  const conflict = createHold.error instanceof ApiError ? createHold.error : null

  return (
    <div>
      <header className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <h1 className="text-lg font-bold">운행 {map.tripId} 좌석 선택</h1>
        {/* ⚠️ 연결 상태를 항상 노출한다. 끊긴 채 옛 좌석맵을 보고 있으면
            선점이 계속 실패하는데 사용자는 이유를 모른다 (W-03 주석) */}
        <ConnectionBadge status={streamStatus} />
      </header>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_20rem]">
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap gap-1">
            {cars.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCarNo(n)}
                className={
                  n === activeCar
                    ? 'rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white'
                    : 'rounded-lg border border-gray-300 px-3 py-1.5 text-sm'
                }
              >
                {n}호차
              </button>
            ))}
          </div>

          <div className="mt-4">
            <SeatGrid map={map} carNo={activeCar} selectedKeys={keys} onToggle={onToggle} />
          </div>
          <SeatLegend />
        </section>

        <aside className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-medium">선택한 좌석</h2>
            {/* 6석 도달 시 나머지는 클릭해도 무시된다. 카운터가 그 이유를 늘 보여준다 */}
            <span className="text-sm text-gray-600">
              {selected.length} / {MAX_SEATS}
            </span>
          </div>

          {selected.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">좌석을 선택해 주세요.</p>
          ) : (
            <ul className="mt-3 space-y-1">
              {selected.map((s) => (
                <li key={seatLabel(s)} className="flex items-center justify-between text-sm">
                  {seatLabel(s)}
                  <button
                    type="button"
                    aria-label={`${seatLabel(s)} 선택 해제`}
                    onClick={() => onToggle(s)}
                    className="px-2 text-gray-400"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            disabled={selected.length === 0 || createHold.isPending}
            onClick={submit}
            className="mt-5 w-full rounded-lg bg-gray-900 py-2.5 font-medium text-white disabled:bg-gray-300"
          >
            {createHold.isPending ? '선점하는 중…' : '좌석 선점하기'}
          </button>

          <p className="mt-3 text-xs text-gray-500">
            선점 후 <b>10분</b> 안에 결제해야 합니다.
            <br />
            선택한 좌석은 전부 함께 잡히거나 전부 실패합니다.
          </p>
        </aside>
      </div>

      {conflict && (
        <ConflictDialog
          error={conflict}
          onPickOther={() => createHold.reset()}
          onRetry={retry}
          retryDisabled={cooling || createHold.isPending}
        />
      )}
    </div>
  )
}
