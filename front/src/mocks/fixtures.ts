import type { components } from '../api/schema'
import type { Problem } from '../api/problem'

/**
 * ⚠️ **새로 만들지 않는다** (`api.md` §7.3).
 *
 * 아래 값은 전부 `docs/api/openapi.yaml` 의 `example` 에서 나왔다 —
 * 번들(`redocly bundle`)을 떠서 스키마를 걸어 뽑았다. 같은 JSON 이
 * **문서의 예시 · 프론트의 가짜 응답 · 백엔드 구현의 목표** 셋에 동시에 쓰인다.
 *
 * 계약이 바뀌면 여기도 바뀐다. 어긋나면 `pnpm run gen:api` 후 이 파일을 맞춘다.
 */
type S = components['schemas']

export const stations: S['StationList'] = {
  stations: [
    { code: 'SEO', name: '서울', lineSeq: 1 },
    { code: 'DJN', name: '대전', lineSeq: 2 },
    { code: 'DDG', name: '동대구', lineSeq: 3 },
    { code: 'BSN', name: '부산', lineSeq: 4 },
  ],
}

export const trips: S['TripList'] = {
  trips: [
    {
      tripId: 101,
      trainNo: '101',
      departAt: '2026-09-20T00:00:00Z',
      arriveAt: '2026-09-20T02:40:00Z',
      durationMinutes: 160,
      availableSeats: 412,
      fare: 59800,
    },
    {
      tripId: 103,
      trainNo: '103',
      departAt: '2026-09-20T01:30:00Z',
      arriveAt: '2026-09-20T04:05:00Z',
      durationMinutes: 155,
      availableSeats: 8,
      fare: 59800,
    },
  ],
}

const CARS = 10
const ROWS = 20
const COLS = ['A', 'B', 'C', 'D'] as const

/**
 * **800석을 만든다** (`data.md` §7 — 운행당 800석).
 *
 * 계약의 예시는 좌석 2개짜리다. 모양은 그대로 두고 **규모만 실제로** 맞춘다 —
 * `W-03` 이 800석을 렌더해야 하고, 2개로는 그 화면을 못 만든다.
 * 창측은 `A` · `D` (`api.md` §5.1).
 */
export function buildSeatMap(tripId = 101): S['SeatMap'] {
  const cars = Array.from({ length: CARS }, (_, c) => {
    const carNo = c + 1
    const seats = Array.from({ length: ROWS }, (_, r) =>
      COLS.map((colLetter) => {
        const rowNo = r + 1
        // 결정론적으로 섞는다 — 새로고침마다 좌석이 바뀌면 화면을 못 본다
        const n = carNo * 131 + rowNo * 17 + colLetter.charCodeAt(0)
        const status: S['SeatStatus'] = n % 9 === 0 ? 'SOLD' : n % 7 === 0 ? 'HELD' : 'AVAILABLE'
        return {
          rowNo,
          colLetter,
          status,
          windowSide: colLetter === 'A' || colLetter === 'D',
        }
      }),
    ).flat()
    return { carNo, seats }
  })

  return {
    tripId,
    snapshotAt: '2026-09-04T05:12:33Z',
    // ⚠️ SSE 구독의 시작점이다 (`api.md` §6.3). 좌석맵과 스트림이 이 값으로 이어진다
    lastEventId: '1725426753000-7',
    cars,
  }
}

export const hold: S['HoldResponse'] = {
  holdId: 'h_8f3a21',
  tripId: 101,
  seats: [
    { carNo: 4, rowNo: 7, colLetter: 'A' },
    { carNo: 4, rowNo: 7, colLetter: 'B' },
  ],
  expiresAt: '2026-09-04T05:22:33Z',
  remainingSeconds: 600,
  totalFare: 119600,
}

/** ⚠️ `expiresAt` 은 고정값이면 이미 지난 시각이다. 지금부터 10분으로 준다 (`api.md` §5.2) */
export function freshHold(nowMs = Date.now()): S['HoldResponse'] {
  const expires = new Date(nowMs + 600_000)
  return { ...hold, expiresAt: expires.toISOString(), remainingSeconds: 600 }
}

export const paymentIntent: S['PaymentIntentResponse'] = {
  orderId: 'ord_9c2f4a17',
  amount: 119600,
  orderName: 'KTX 101 · 4호차 7A 외 1석',
}

export const reservation: S['ReservationDetail'] = {
  reservationNo: '48207315',
  status: 'CONFIRMED',
  tripId: 101,
  trainNo: 'KTX 101',
  fromStation: { code: 'SEO', name: '서울' },
  toStation: { code: 'BSN', name: '부산' },
  departAt: '2026-09-10T21:00:00Z',
  arriveAt: '2026-09-10T23:17:00Z',
  passengerName: '홍길동',
  passengerPhone: '010-0000-0000',
  seats: [
    { carNo: 4, rowNo: 7, colLetter: 'A', fare: 59800 },
    { carNo: 4, rowNo: 7, colLetter: 'B', fare: 59800 },
  ],
  totalFare: 119600,
  paidAt: '2026-09-04T05:18:02Z',
}

export const reservationPage: S['ReservationPage'] = {
  page: 0,
  size: 20,
  totalElements: 2,
  totalPages: 1,
  content: [
    {
      reservationNo: '48207315',
      status: 'CONFIRMED',
      trainNo: 'KTX 101',
      departAt: '2026-09-20T00:00:00Z',
      seats: [
        { carNo: 4, rowNo: 7, colLetter: 'A', fare: 59800 },
        { carNo: 4, rowNo: 7, colLetter: 'B', fare: 59800 },
      ],
      totalFare: 119600,
    },
    {
      reservationNo: '48207316',
      // ⚠️ 파생값이다 (`data.md` §5.5). 클라이언트는 그냥 표시한다
      status: 'COMPLETED',
      trainNo: 'KTX 103',
      departAt: '2026-08-01T00:00:00Z',
      seats: [{ carNo: 2, rowNo: 3, colLetter: 'D', fare: 59800 }],
      totalFare: 59800,
    },
  ],
}

export const me: S['MeResponse'] = {
  email: 'hong@example.com',
  name: '홍길동',
  phone: '010-0000-0000',
  createdAt: '2026-08-01T09:00:00Z',
}

export const tokens: S['TokenResponse'] = {
  accessToken: 'eyJhbGc…',
  refreshToken: 'eyJhbGc…',
  accessExpiresAt: '2026-09-04T05:27:33Z',
}

// ── 에러 fixture — `api.md` §4 의 예시가 그대로 온다 ──────────────

export function problem(over: Pick<Problem, 'status' | 'code'> & Partial<Problem>): Problem {
  return {
    type: 'https://api.jomin4.cloud/problems/x',
    title: '문제가 발생했습니다',
    requestId: '7f3a9c21',
    ...over,
  }
}

/**
 * ⚠️ `failedSeats` 의 `reason` 이 두 종류인 게 핵심이다 (`api.md` §4.7).
 * `ALL_OR_NOTHING` 은 **이 좌석 자체는 멀쩡한데 같이 고른 좌석 때문에 함께 실패**했다는 뜻이고,
 * `E-01` 의 "함께 선택한 7A도 선점되지 않았습니다" 문구가 여기서 나온다.
 */
export const seatConflict: S['SeatConflictProblem'] = {
  ...problem({
    status: 409,
    code: 'SEAT_ALREADY_HELD',
    type: 'https://api.jomin4.cloud/problems/seat-conflict',
    title: '좌석을 선점하지 못했습니다',
    detail: '선택한 2석 중 1석을 다른 고객이 먼저 선점했습니다.',
    instance: '/api/v1/holds',
  }),
  failedSeats: [
    { carNo: 4, rowNo: 7, colLetter: 'B', reason: 'HELD_BY_OTHER' },
    { carNo: 4, rowNo: 7, colLetter: 'A', reason: 'ALL_OR_NOTHING' },
  ],
}
