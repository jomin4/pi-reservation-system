import { useMutation, useQuery } from '@tanstack/react-query'
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

// ── 인증 (§5.5) ───────────────────────────────────────────────

export function useLogin() {
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api.request<S['TokenPair']>('/auth/login', { method: 'POST', body }),
  })
}

export function useSignup() {
  return useMutation({
    mutationFn: (body: { email: string; password: string; name: string; phone: string }) =>
      api.request<S['MemberProfile']>('/auth/signup', { method: 'POST', body }),
  })
}

/**
 * 이메일 중복 확인 (`F-21`).
 *
 * ⚠️ **최종 판정이 아니다.** 확인과 가입 사이에 남이 채갈 수 있다 —
 * **진짜 판정은 가입 요청의 DB unique 제약**이고 이건 폼 편의용이다.
 */
export function useEmailAvailability() {
  return useMutation({
    mutationFn: (email: string) =>
      api.request<{ available: boolean }>(
        `/auth/email-available?email=${encodeURIComponent(email)}`,
      ),
  })
}

// ── 좌석 · 선점 (§5.1 · §5.2) ────────────────────────────────

export function useSeatMap(tripId: number): UseQueryResult<S['SeatMap']> {
  return useQuery({
    queryKey: ['seatMap', tripId],
    queryFn: () => api.request<S['SeatMap']>(`/trips/${tripId}/seats`),
    // ⚠️ 갱신은 SSE 델타가 한다. 폴링하면 800석을 계속 다시 받는다 (api.md §5.1)
    staleTime: Infinity,
  })
}

export interface CreateHoldBody {
  tripId: number
  seats: { carNo: number; rowNo: number; colLetter: string }[]
}

/**
 * 좌석 선점 (`F-04`).
 *
 * ⚠️ **전부 성공 또는 전부 실패다.** 일부만 잡힌 상태로 남지 않는다 —
 * 실패하면 `409` 의 `failedSeats` 가 어느 좌석이 왜 실패했는지 알려준다 (`api.md` §4.7).
 */
export function useCreateHold() {
  return useMutation({
    mutationFn: (body: CreateHoldBody) =>
      api.request<S['HoldResponse']>('/holds', { method: 'POST', body }),
  })
}

export function useHold(holdId: string) {
  return useQuery({
    queryKey: ['hold', holdId],
    queryFn: () => api.request<S['HoldResponse']>(`/holds/${holdId}`),
    // ⚠️ 이 조회에 **lazy 만료 판정**이 걸린다 (`api.md` §5.2).
    //    expires_at 이 지났으면 DB 가 아직 HELD 여도 410 을 준다
    staleTime: Infinity,
    retry: false,
  })
}

/**
 * 선점 해제 (`F-06`).
 *
 * > **만료를 기다리지 않고 즉시 좌석을 반환한다.** 이게 있어야 다른 채널의 대기
 * > 시간이 줄어든다 — 다채널 경합 시연에서 체감 차이가 크다 (`W-04` 주석).
 *
 * ⚠️ 이미 만료·해제된 선점도 `204` 다. **멱등하게 처리된다** — 재시도가 에러가 되면
 * 클라이언트가 불필요한 분기를 갖는다 (`api.md` §5.2).
 */
export function useReleaseHold() {
  return useMutation({
    mutationFn: (holdId: string) => api.request<void>(`/holds/${holdId}`, { method: 'DELETE' }),
  })
}

export function useMe(enabled = true): UseQueryResult<S['MemberProfile']> {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.request<S['MemberProfile']>('/me'),
    enabled,
  })
}

// ── 결제 · 확정 (§5.3) ───────────────────────────────────────

export function useCreatePaymentIntent() {
  return useMutation({
    mutationFn: (holdId: string) =>
      api.request<S['PaymentIntentResponse']>(`/holds/${holdId}/payment-intent`, {
        method: 'POST',
      }),
  })
}

export interface ConfirmPaymentArgs {
  holdId: string
  idempotencyKey: string
  body: { paymentKey: string; orderId: string; amount: number }
}

/**
 * 결제 확정 (`F-08` `F-09` `F-10`).
 *
 * ⚠️ **`Idempotency-Key` 는 화면 진입 시 1회 생성한 값을 재시도에도 그대로 쓴다.**
 * 버튼을 누를 때마다 새로 만들면 **멱등성이 무의미하다** (`W-05` 주석).
 *
 * ⚠️ **`202` 는 던져진다** — 승인됐는지 서버도 모르는 상태다. `isPaymentPending` 으로
 * 잡아 **`GET` 폴링**으로 간다. `POST` 로 다시 부르면 이중 결제다.
 */
export function useConfirmPayment() {
  return useMutation({
    mutationFn: ({ holdId, idempotencyKey, body }: ConfirmPaymentArgs) =>
      api.request<S['ReservationDetail']>(`/holds/${holdId}/payment`, {
        method: 'POST',
        idempotencyKey,
        body,
      }),
  })
}

/**
 * 결제 **결과 조회** (`E-03` 폴링).
 *
 * ⚠️ **`GET` 이다. 새 결제 요청이 아니라 기존 요청의 결과 조회다** —
 * 이 구분이 무너지면 이중 결제가 난다 (`api.md` §5.3).
 */
export function fetchPaymentResult(holdId: string) {
  return api.request<S['ReservationDetail']>(`/holds/${holdId}/payment`)
}

export function useReservation(reservationNo: string) {
  return useQuery({
    queryKey: ['reservation', reservationNo],
    queryFn: () => api.request<S['ReservationDetail']>(`/reservations/${reservationNo}`),
  })
}
