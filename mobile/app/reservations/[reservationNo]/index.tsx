import { useLocalSearchParams } from 'expo-router'

import { RequireAuth } from '@/auth/guard'
import { Placeholder } from '@/ui/Placeholder'

/** `M-10` 예약 상세 · 취소 — 「취소 버튼을 하단 고정으로」 (#49) */
function ReservationDetail() {
  const { reservationNo } = useLocalSearchParams<{ reservationNo: string }>()

  return (
    <Placeholder
      id="M-10"
      title="예약 상세 · 취소"
      note={`예약번호 ${reservationNo} · 취소는 출발 전까지 (#49)`}
    />
  )
}

export default function Screen() {
  return (
    <RequireAuth>
      <ReservationDetail />
    </RequireAuth>
  )
}
