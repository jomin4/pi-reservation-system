/**
 * 조회 폼의 규칙 — **계약에서 그대로 온다** (`openapi.yaml` `/trips`).
 *
 * | 규칙 | 근거 |
 * |---|---|
 * | `from` · `to` 필수 | `required: true` |
 * | ⚠️ **`from === to` 면 `400`** | `To` 파라미터 설명 |
 * | `passengers` **1~6** | `minimum: 1` · `maximum: 6` |
 *
 * > ⚠️ **인원 상한 6은 좌석 선점 상한에서 역산한 값이다** (와이어프레임 · `F-04`).
 * > 여기 숫자를 늘리면 **선점 단계에서 `SEAT_COUNT_EXCEEDED` 로 막힌다** —
 * > 사용자는 열차를 고른 뒤에야 안 된다는 걸 알게 된다.
 *
 * **클라이언트가 먼저 막는 이유**는 요청을 아끼려는 게 아니라
 * **사용자가 버튼을 누르기 전에 알게 하려는 것**이다. 판정은 서버가 또 한다.
 */

/** `F-04` 좌석 선점 상한과 같은 값 */
export const MAX_PASSENGERS = 6

export interface SearchForm {
  from: string | null
  to: string | null
  date: string
  passengers: number
}

export type SearchFormError =
  | 'FROM_REQUIRED'
  | 'TO_REQUIRED'
  | 'SAME_STATION'
  | 'PASSENGERS_RANGE'

export const ERROR_MESSAGE: Record<SearchFormError, string> = {
  FROM_REQUIRED: '출발역을 선택하세요',
  TO_REQUIRED: '도착역을 선택하세요',
  SAME_STATION: '출발역과 도착역이 같습니다',
  PASSENGERS_RANGE: `인원은 1~${MAX_PASSENGERS}명입니다`,
}

/** 첫 번째 문제만 준다 — 폼 아래 한 줄로 보여주므로 */
export function validateSearchForm(form: SearchForm): SearchFormError | null {
  if (form.from === null || form.from === '') return 'FROM_REQUIRED'
  if (form.to === null || form.to === '') return 'TO_REQUIRED'
  if (form.from === form.to) return 'SAME_STATION'
  if (!Number.isInteger(form.passengers)) return 'PASSENGERS_RANGE'
  if (form.passengers < 1 || form.passengers > MAX_PASSENGERS) return 'PASSENGERS_RANGE'
  return null
}

/** `GET /trips` 쿼리 — 계약의 파라미터 이름 그대로 */
export function toTripsQuery(form: SearchForm): Record<string, string> {
  return {
    from: form.from ?? '',
    to: form.to ?? '',
    date: form.date,
    passengers: String(form.passengers),
  }
}
