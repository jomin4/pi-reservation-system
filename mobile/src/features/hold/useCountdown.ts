import { useEffect, useState } from 'react'
import { AppState } from 'react-native'

import { remainingMs } from './countdown'

/**
 * 기한까지 남은 밀리초를 **매초 다시 잰다.**
 *
 * ⚠️ **틱이 값을 만들지 않는다.** 인터벌은 리렌더를 부르는 신호일 뿐이고,
 *    값은 언제나 `deadline - Date.now()` 다. 그래서 **인터벌이 늦게 돌거나
 *    멈췄다 돌아와도 표시는 정확하다.**
 *
 * ⚠️ **`AppState` 복귀에서 한 번 더 잰다.** 안드로이드는 백그라운드에서
 *    타이머를 늦추거나 재운다 — 복귀 직후의 1초를 기다리면 **잠들기 전
 *    숫자가 그대로 남아 있는 찰나**가 보인다. 그 찰나에 사용자가 결제를
 *    누르면 이미 만료된 선점에 대고 누르는 것이다.
 *
 * > 백그라운드 복귀 시의 **SSE 재연결 · 좌석맵 전체 재조회**는 `E-04`(#54)가
 * > 따로 한다. 여기서 하는 건 **이 화면의 숫자를 맞추는 것**까지다.
 */
export function useCountdown(deadlineMs: number | null): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (deadlineMs === null) return

    const tick = () => setNow(Date.now())
    const timer = setInterval(tick, 1000)
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick()
    })

    return () => {
      clearInterval(timer)
      sub.remove()
    }
  }, [deadlineMs])

  return deadlineMs === null ? 0 : remainingMs(deadlineMs, now)
}
