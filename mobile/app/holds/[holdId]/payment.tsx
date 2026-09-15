import { router, useLocalSearchParams } from 'expo-router'
import { Text, TouchableOpacity } from 'react-native'

import { RequireAuth } from '@/auth/guard'
import { Placeholder } from '@/ui/Placeholder'

/**
 * `M-05` 결제 — `E-03` 결제 타임아웃이 이 화면 위에 뜬다 (#44 · #53).
 *
 * ⚠️ **확정 성공은 `replace` 다.** `push` 로 가면 예약 완료(M-06)에서 뒤로가기로
 *    결제 화면에 돌아온다 — 멱등키가 막아주긴 하지만 **화면이 그 길을 열어두면 안 된다.**
 */
function Payment() {
  const { holdId } = useLocalSearchParams<{ holdId: string }>()

  return (
    <Placeholder
      id="M-05"
      title="결제"
      note={`선점 ${holdId} · 멱등키는 진입 시 1회 생성 (#44 · #84)`}
    >
      <TouchableOpacity
        onPress={() => router.replace('/reservations/12345678/complete')}
        className="mt-6 rounded-lg bg-sky-600 px-6 py-3"
      >
        <Text className="text-sm font-semibold text-white">결제 확정 → replace (M-06)</Text>
      </TouchableOpacity>
    </Placeholder>
  )
}

export default function Screen() {
  return (
    <RequireAuth>
      <Payment />
    </RequireAuth>
  )
}
