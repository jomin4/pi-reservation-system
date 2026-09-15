import { useQuery } from '@tanstack/react-query'
import type { UseQueryResult } from '@tanstack/react-query'
import { api } from './client'
import type { components } from './schema'

type S = components['schemas']

export const queryKeys = {
  stations: ['stations'] as const,
  trips: (p: TripSearch) => ['trips', p.from, p.to, p.date, p.passengers] as const,
}

export interface TripSearch {
  from: string
  to: string
  /** ⚠️ **KST 영업일** `YYYY-MM-DD`. 시각이 아니다 (`api.md` §0) */
  date: string
  passengers: number
}

/**
 * 역 목록 (`F-01`).
 *
 * > **고정 목록이라 최초 1회만 조회한다** (`W-01` 주석). 운행 중에 역이 늘지 않는다.
 */
export function useStations(): UseQueryResult<S['StationList']> {
  return useQuery({
    queryKey: queryKeys.stations,
    queryFn: () => api.request<S['StationList']>('/stations'),
    staleTime: Infinity,
  })
}

/**
 * 운행 조회 (`F-02`).
 *
 * ⚠️ **응답의 `availableSeats` 는 판정 근거가 아니다** — Redis 캐시 근사값이라
 * 잔여 1석을 보고 들어가도 `W-03` 에서 밀릴 수 있다 (`api.md` §5.1).
 *
 * ⚠️ **이 화면에는 SSE 를 붙이지 않는다.** 목록 전체를 실시간 갱신하는 건 연결 비용
 * 대비 이득이 적다. 실시간은 `W-03` 부터다.
 */
export function useTrips(search: TripSearch | null): UseQueryResult<S['TripList']> {
  return useQuery({
    queryKey: search ? queryKeys.trips(search) : ['trips', 'none'],
    queryFn: () => {
      if (!search) throw new Error('검색 조건이 없다')
      const q = new URLSearchParams({
        from: search.from,
        to: search.to,
        date: search.date,
        passengers: String(search.passengers),
      })
      return api.request<S['TripList']>(`/trips?${q.toString()}`)
    },
    enabled: search !== null,
  })
}
