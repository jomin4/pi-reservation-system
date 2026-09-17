import type { Hold } from './types'

/**
 * 선점 타이머 (`M-04` · `F-05`).
 *
 * ⚠️ **인터벌로 초를 빼지 않는다.** 계약이 못박은 것이다
 * (`openapi.yaml` `HoldResponse.expiresAt`):
 *
 * > **타이머는 이 값에서 역산한다.** 인터벌 카운트로 만들면 **모바일
 * > 백그라운드에서 멈춘다** (`E-04`).
 *
 * 기한을 **한 번 정해두고 매번 다시 잰다.** 인터벌은 「값」이 아니라
 * **「다시 그려라」 신호**일 뿐이라, 늦게 돌든 멈췄다 돌아오든 **다음 틱에
 * 정확한 값**이 나온다.
 */

/** 3분 미만이면 색·굵기를 바꿔 경고한다 (와이어프레임) */
export const URGENT_MS = 3 * 60_000

/**
 * 만료 기한을 **기기 시계 기준**으로 옮긴다.
 *
 * ⚠️ **`expiresAt` 을 `Date.now()` 와 그냥 빼면 안 된다.** `expiresAt` 은
 * **서버 시계**의 절대 시각인데 화면은 **기기 시계**로 잰다. 둘이 어긋난
 * 만큼이 그대로 남은 시간의 오차가 된다 — **기기 시계가 3분 빠르면 07:00 을
 * 보여주고, 사용자는 3분을 도둑맞는다.** 반대로 느리면 **이미 만료된 선점에
 * 대고 결제를 누른다.**
 *
 * `remainingSeconds` 는 **상대값이라 시계 오차를 타지 않는다** — 계약이
 * 「시계 오차를 잡는 보조값」이라 부르는 이유다. 응답이 도착한 시각에
 * 그 값을 더하면 **`expiresAt` 을 기기 시계로 옮긴 것**과 같다.
 *
 * > **만료 판정 자체는 서버가 한다** (`GET /holds/{id}` 의 lazy 만료 `410`).
 * > 여기서 재는 건 **표시**다 — 왕복 지연 몇백 ms 는 그래서 문제가 안 된다.
 */
export function toDeadline(hold: Hold, receivedAtMs: number): number {
  const secs = hold.remainingSeconds
  if (Number.isFinite(secs) && secs >= 0) return receivedAtMs + secs * 1000

  // 보조값이 망가졌을 때만 절대 시각으로 떨어진다 — 시계 오차를 안고 간다
  const absolute = Date.parse(hold.expiresAt)
  return Number.isNaN(absolute) ? receivedAtMs : absolute
}

/** 남은 밀리초. **음수는 없다** — 만료는 `0` 하나로 표현한다 */
export function remainingMs(deadlineMs: number, nowMs: number): number {
  return Math.max(0, deadlineMs - nowMs)
}

/**
 * `587_000` → `09:47`
 *
 * ⚠️ **올림이다.** 내림으로 하면 받자마자 `10:00` 이 아니라 `09:59` 로 뜨고,
 *    기한 직전 남은 0.4초가 `00:00` 으로 보여 **아직 살아 있는 선점을 죽은
 *    것처럼** 보여준다.
 */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000)
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

/** 3분 미만 — 아직 살아 있지만 서둘러야 한다 */
export function isUrgent(ms: number): boolean {
  return ms > 0 && ms < URGENT_MS
}

/**
 * 좌석 한 장의 운임.
 *
 * ⚠️ **계약은 `totalFare` 만 준다.** 와이어프레임은 좌석마다 금액을 찍는데,
 *    **좌석 등급·할인이 범위 밖**(`CLAUDE.md` 폐기 목록)이라 **균등 분할이
 *    곧 정확한 값**이다. 등급이 생기는 날 이 함수가 거짓말을 시작하므로
 *    계산을 화면에 흩뿌리지 않고 여기 한 곳에 둔다.
 */
export function unitFare(hold: Hold): number {
  const count = hold.seats.length
  return count === 0 ? 0 : Math.round(hold.totalFare / count)
}
