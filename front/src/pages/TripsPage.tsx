import { Link, useNavigate, useSearchParams } from 'react-router'
import { useStations, useTrips } from '../api/queries'
import type { TripSearch } from '../api/queries'
import { toSeats } from '../routes'
import { addDays, formatKstTime, isServiceDate, toInstant, toServiceDate } from '../time'
import { Empty, ErrorView, Loading } from '../ui/QueryState'

function parseSearch(params: URLSearchParams): TripSearch | null {
  const from = params.get('from')
  const to = params.get('to')
  const date = params.get('date')
  if (!from || !to || !date || !isServiceDate(date)) return null

  const raw = Number(params.get('passengers') ?? '1')
  const passengers = Number.isFinite(raw) ? Math.min(6, Math.max(1, raw)) : 1
  return { from, to, date, passengers }
}

function duration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`
}

export function TripsPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const search = parseSearch(params)
  const trips = useTrips(search)
  const stations = useStations()

  if (search === null) {
    return (
      <Empty>
        조회 조건이 없습니다. <Link to="/">처음으로</Link>
      </Empty>
    )
  }

  const nameOf = (code: string) =>
    stations.data?.stations.find((s) => s.code === code)?.name ?? code

  const shiftDay = (days: number) => {
    const next = addDays(toServiceDate(search.date), days)
    setParams({ ...Object.fromEntries(params), date: next })
  }

  return (
    <div>
      <header className="rounded-xl border border-gray-200 bg-white p-4">
        <h1 className="text-lg font-bold">
          {nameOf(search.from)} → {nameOf(search.to)}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          {search.date} · {search.passengers}명
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftDay(-1)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            ◀ 이전날
          </button>
          <button
            type="button"
            onClick={() => shiftDay(1)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            다음날 ▶
          </button>
          <div className="flex-1" />
          <Link to="/" className="text-sm text-gray-600">
            조건 변경
          </Link>
        </div>
      </header>

      {trips.isPending && <Loading label="운행을 찾는 중" />}
      {trips.isError && <ErrorView error={trips.error} onRetry={() => void trips.refetch()} />}

      {trips.isSuccess &&
        (trips.data.trips.length === 0 ? (
          // ⚠️ 결과 없음은 200 + 빈 배열이다. 404 가 아니다 (api.md §5.1)
          <Empty>이 조건에 운행이 없습니다. 날짜를 바꿔 보세요.</Empty>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 text-left text-gray-600">
                <tr>
                  <th className="px-4 py-3">열차</th>
                  <th className="px-4 py-3">출발</th>
                  <th className="px-4 py-3">도착</th>
                  <th className="px-4 py-3">소요</th>
                  <th className="px-4 py-3">잔여석</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {trips.data.trips.map((t) => {
                  // ⚠️ 매진 행을 목록에서 지우지 않는다 — 취소분이 돌아올 수 있다 (W-02 주석)
                  const soldOut = t.availableSeats === 0
                  return (
                    <tr key={t.tripId} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-3 font-medium">KTX {t.trainNo}</td>
                      <td className="px-4 py-3">{formatKstTime(toInstant(t.departAt))}</td>
                      <td className="px-4 py-3">{formatKstTime(toInstant(t.arriveAt))}</td>
                      <td className="px-4 py-3 text-gray-600">{duration(t.durationMinutes)}</td>
                      <td className="px-4 py-3">
                        {soldOut ? (
                          <span className="text-gray-400">매진</span>
                        ) : (
                          `${t.availableSeats}`
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={soldOut}
                          onClick={() => void navigate(toSeats(t.tripId))}
                          className="rounded-lg bg-gray-900 px-3 py-1.5 text-white disabled:bg-gray-200 disabled:text-gray-400"
                        >
                          선택
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}

      <p className="mt-3 text-xs text-gray-500">
        ⚠️ 잔여석은 근사값입니다. 좌석 선택에서 밀릴 수 있습니다.
      </p>
    </div>
  )
}
