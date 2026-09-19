/**
 * 경로를 한 곳에 모은다.
 *
 * > **화면마다 문자열을 손으로 쓰면 오타가 런타임까지 간다.** 라우트 정의와 `<Link>`
 * > 양쪽이 같은 상수를 쓰면 경로를 바꿀 때 한 군데만 고친다.
 *
 * ⚠️ **라우트는 11개다.** `E-01`~`E-03` 은 화면이 아니라 **상태**라 경로가 없다 —
 * 와이어프레임이 「화면 목록」과 「예외 상태」로 나눠 놨고, `E-01` 은 `W-03` 안에서 산다.
 */
export const PATHS = {
  /** `W-01` 홈 · 열차 조회 */
  home: '/',
  /** `W-02` 운행 목록 */
  trips: '/trips',
  /** `W-03` 좌석 선택 — ⚠️ 공개다. 선점 버튼에서 로그인을 요구한다 */
  seats: '/trips/:tripId/seats',
  /** `W-04` 선점 완료 · 승객 정보 */
  hold: '/holds/:holdId',
  /** `W-05` 결제 */
  payment: '/holds/:holdId/payment',
  /** `W-06` 예약 완료 */
  reservationComplete: '/reservations/:reservationNo/complete',
  /** `W-07` 로그인 */
  login: '/login',
  /** `W-08` 회원가입 */
  signup: '/signup',
  /** `W-09` 예약 목록 */
  reservations: '/reservations',
  /** `W-10` 예약 상세 · 취소 */
  reservation: '/reservations/:reservationNo',
  /** `W-12` 마이페이지 */
  me: '/me',
} as const

export const toSeats = (tripId: number | string): string => `/trips/${tripId}/seats`

/**
 * ⚠️ **`holdId` 를 URL 에 담는다.** 전역 상태로 들고 있으면 새로고침에 사라지는데,
 * 선점 TTL 이 10분이라 그 사이 한 번만 새로고침해도 결제를 못 한다.
 */
export const toHold = (holdId: string): string => `/holds/${holdId}`
export const toPayment = (holdId: string): string => `/holds/${holdId}/payment`
export const toReservation = (reservationNo: string): string => `/reservations/${reservationNo}`
export const toReservationComplete = (reservationNo: string): string =>
  `/reservations/${reservationNo}/complete`
