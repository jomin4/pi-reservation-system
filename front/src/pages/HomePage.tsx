import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useStations } from '../api/queries'
import { formatKstDate, todayInKst, toInstant } from '../time'
import type { ServiceDate } from '../time'
import { ErrorView, Loading } from '../ui/QueryState'

/** 좌석 선점 상한 6석에서 역산한 값이다 (`W-01` 주석 · `api.md` §5.2) */
export const MAX_PASSENGERS = 6

/** 영업일을 사람이 읽는 형태로 — `2026-09-11 (금)` */
function labelServiceDate(date: ServiceDate): string {
  const weekday = formatKstDate(toInstant(`${date}T00:00:00Z`)).replace(/^.*\(/, '(')
  return `${date} ${weekday}`
}

export function HomePage() {
  const navigate = useNavigate()
  const stations = useStations()

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [date, setDate] = useState<ServiceDate>(() => todayInKst())
  const [passengers, setPassengers] = useState(1)

  // ⚠️ 출발역 = 도착역이면 서버가 400 을 준다 (api.md §5.1). 버튼에서 미리 막는다
  const sameStation = from !== '' && from === to
  const canSearch = from !== '' && to !== '' && !sameStation

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSearch) return
    const q = new URLSearchParams({ from, to, date, passengers: String(passengers) })
    void navigate(`/trips?${q.toString()}`)
  }

  if (stations.isPending) return <Loading label="역 목록을 불러오는 중" />
  if (stations.isError)
    return <ErrorView error={stations.error} onRetry={() => void stations.refetch()} />

  const list = stations.data.stations

  return (
    <form onSubmit={submit} className="rounded-xl border border-gray-200 bg-white p-6">
      <h1 className="text-lg font-bold">열차 조회</h1>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm text-gray-600">출발역</span>
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          >
            <option value="">선택</option>
            {list.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm text-gray-600">도착역</span>
          <select
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          >
            <option value="">선택</option>
            {list.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm text-gray-600">출발일</span>
          <input
            type="date"
            value={date}
            min={todayInKst()}
            onChange={(e) => setDate(e.target.value as ServiceDate)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          />
          <span className="mt-1 block text-xs text-gray-500">{labelServiceDate(date)}</span>
        </label>

        <label className="block">
          <span className="text-sm text-gray-600">인원 (최대 {MAX_PASSENGERS}명)</span>
          <select
            value={passengers}
            onChange={(e) => setPassengers(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
          >
            {Array.from({ length: MAX_PASSENGERS }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}명
              </option>
            ))}
          </select>
        </label>
      </div>

      {sameStation && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          출발역과 도착역이 같습니다
        </p>
      )}

      <button
        type="submit"
        disabled={!canSearch}
        className="mt-5 w-full rounded-lg bg-gray-900 py-2.5 font-medium text-white disabled:bg-gray-300"
      >
        열차 조회
      </button>

      <p className="mt-3 text-xs text-gray-500">
        조회는 로그인 없이 됩니다. 로그인은 좌석을 선점할 때 필요합니다.
      </p>
    </form>
  )
}
