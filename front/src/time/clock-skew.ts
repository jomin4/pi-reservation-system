import type { Instant } from './instant'
import { instantToMs } from './instant'

/**
 * 클라이언트 시계가 서버보다 **얼마나 앞서 있나** (ms).
 *
 * > **서버가 `expiresAt` 과 `remainingSeconds` 를 둘 다 주는 이유가 이것이다** (`api.md` §5.2).
 * > `expiresAt` 은 **서버 시계**의 절대 시각이라, 클라 시계가 5분 밀려 있으면 카운트다운이
 * > 5분 틀린다. `remainingSeconds` 는 **상대값**이라 시계와 무관하다 — 둘을 맞춰 보면
 * > 오차가 나온다.
 *
 * ```
 * skew = (받은 순간의 클라 시각 + remainingSeconds) - expiresAt
 * ```
 *
 * ⚠️ **응답을 받은 순간에 기록해야 한다.** 나중에 캐시에서 꺼내 계산하면 그 사이 흐른
 * 시간이 통째로 오차로 잡힌다. 그래서 훅이 아니라 **응답 처리 지점**에서 부른다.
 */
let skewMs = 0

export function recordServerTiming(
  expiresAt: Instant,
  remainingSeconds: number,
  now = Date.now(),
): void {
  if (!Number.isFinite(remainingSeconds)) return
  skewMs = now + remainingSeconds * 1000 - instantToMs(expiresAt)
}

export function getSkewMs(): number {
  return skewMs
}

/** 서버 시계로 환산한 지금 */
export function serverNow(now = Date.now()): number {
  return now - skewMs
}

/** 테스트 격리용 */
export function resetSkew(): void {
  skewMs = 0
}
