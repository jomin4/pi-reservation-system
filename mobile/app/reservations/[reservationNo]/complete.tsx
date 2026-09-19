import { router, useLocalSearchParams } from 'expo-router'
import { useEffect } from 'react'
import { BackHandler, Text, TouchableOpacity } from 'react-native'

import { RequireAuth } from '@/auth/guard'
import { Placeholder } from '@/ui/Placeholder'

/**
 * `M-06` 예약 완료.
 *
 * ⚠️ **결제 화면으로 돌아갈 길을 셋 다 막는다.**
 *
 * | 경로 | 막는 법 |
 * |---|---|
 * | 헤더 뒤로가기 | `_layout.tsx` 의 `headerBackVisible: false` |
 * | 스와이프 | 〃 `gestureEnabled: false` |
 * | **안드로이드 하드웨어 뒤로가기** | **여기** — 홈으로 보낸다 |
 *
 * > 하나라도 열어두면 그리로 샌다. `M-10` 에서 언제든 다시 볼 수 있으므로
 * > 완료 화면을 떠나는 게 손해가 아니다 (와이어프레임).
 */
function Complete() {
  const { reservationNo } = useLocalSearchParams<{ reservationNo: string }>()

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/')
      return true
    })
    return () => sub.remove()
  }, [])

  return (
    <Placeholder
      id="M-06"
      title="예약 완료"
      note={`예약번호 ${reservationNo} · 결제 화면으로 못 돌아간다 (#45)`}
    >
      <TouchableOpacity
        onPress={() => router.replace(`/reservations/${reservationNo}`)}
        className="mt-6 rounded-lg bg-slate-100 px-4 py-2"
      >
        <Text className="text-sm font-semibold text-slate-700">예약 상세로 (M-10)</Text>
      </TouchableOpacity>
    </Placeholder>
  )
}

export default function Screen() {
  return (
    <RequireAuth>
      <Complete />
    </RequireAuth>
  )
}
