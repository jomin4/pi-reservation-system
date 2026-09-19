import { Text, View } from 'react-native'

import { formatCountdown, isUrgent } from './countdown'

/**
 * 선점 타이머 바 — **`M-04` 와 `M-05` 가 같이 쓴다.**
 *
 * ⚠️ **스크롤 바깥에 둔다** (와이어프레임). 웹은 한 화면에 다 들어가지만
 *    모바일은 스크롤이 생긴다 — **남은 시간이 화면 밖으로 밀려나면 안 된다.**
 *    두 화면이 같은 규칙을 지켜야 해서 컴포넌트로 뺐다.
 */
export function HoldTimer({ remainingMs }: { remainingMs: number }) {
  const urgent = isUrgent(remainingMs)
  const text = formatCountdown(remainingMs)

  return (
    <View
      testID="hold-timer"
      accessibilityRole="timer"
      accessibilityLabel={`결제까지 남은 시간 ${text}`}
      className={`items-center border-b py-3 ${
        urgent ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'
      }`}
    >
      <Text className={`text-[11px] ${urgent ? 'text-red-500' : 'text-slate-500'}`}>
        결제까지 남은 시간
      </Text>
      {/* 3분 미만에서 색·굵기를 바꿔 경고한다 (와이어프레임) */}
      <Text
        className={`text-3xl tabular-nums ${
          urgent ? 'font-extrabold text-red-600' : 'font-bold text-slate-900'
        }`}
      >
        {text}
      </Text>
    </View>
  )
}
