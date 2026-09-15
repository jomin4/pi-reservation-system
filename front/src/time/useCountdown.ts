import { useSyncExternalStore } from 'react'
import { serverNow } from './clock-skew'
import type { Instant } from './instant'
import { instantToMs } from './instant'

export interface Countdown {
  remainingMs: number
  remainingSeconds: number
  expired: boolean
  /** `09:58` */
  text: string
}

/** `09:58` · 한 시간을 넘으면 `1:02:03` */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const s = total % 60
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/**
 * 초 단위로 흐르는 시계. **외부 저장소로 다룬다.**
 *
 * > `useEffect` 안에서 `setState` 로 틱을 돌리면 React 19 의 `set-state-in-effect` 에
 * > 걸린다. 규칙을 끄는 대신 **원래 모양대로** 바꾼다 — 시계는 컴포넌트 밖에서 흐르는
 * > 값이고, 그게 `useSyncExternalStore` 가 있는 이유다.
 *
 * ⚠️ **스냅샷을 캐시한다.** 매 호출마다 `Date.now()` 를 새로 읽으면 같은 렌더 안에서
 * 값이 바뀌어 React 가 "getSnapshot should be cached" 로 경고한다.
 */
let cachedSecond = Math.floor(Date.now() / 1000)

function getSnapshot(): number {
  return cachedSecond
}

function subscribe(onChange: () => void): () => void {
  const update = () => {
    cachedSecond = Math.floor(Date.now() / 1000)
    onChange()
  }

  // 마운트 직후 한 번 — 캐시가 낡아 있을 수 있다
  update()
  const id = setInterval(update, 1000)

  // ⚠️ 백그라운드에 있는 동안 밀린 틱을 복구한다. 다음 틱을 기다리면
  //    선점이 이미 끝났는데 "03:20" 이 한 박자 더 떠 있다
  const onVisible = () => {
    if (document.visibilityState === 'visible') update()
  }
  document.addEventListener('visibilitychange', onVisible)

  return () => {
    clearInterval(id)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

/**
 * 선점 남은 시간 (`api.md` §5.2).
 *
 * ⚠️ **인터벌을 세지 않는다.** `setInterval` 이 1초마다 돈다고 가정하고 숫자를 깎으면
 * **모바일 백그라운드에서 멈춘다** — 브라우저가 타이머를 throttle 하기 때문이다.
 * 매 틱 **절대 시각에서 다시 계산**하므로 틱이 밀려도 값은 항상 맞는다.
 *
 * 시계 오차는 `serverNow()` 가 잡는다 (`clock-skew.ts`).
 */
export function useCountdown(expiresAt: Instant | null | undefined): Countdown {
  // ⚠️ 렌더 중에 Date.now() 를 부르지 않는다. 스냅샷만 보고 계산해야
  //    같은 입력에 같은 결과가 나온다 — 구독이 값을 밀어 넣는 구조다
  const second = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const deadlineMs = expiresAt == null ? null : instantToMs(expiresAt)
  const remainingMs = deadlineMs === null ? 0 : Math.max(0, deadlineMs - serverNow(second * 1000))

  return {
    remainingMs,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    expired: remainingMs === 0,
    text: formatRemaining(remainingMs),
  }
}
