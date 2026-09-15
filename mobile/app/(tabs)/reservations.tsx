import { Link } from 'expo-router'

import { RequireAuth } from '@/auth/guard'
import { Placeholder } from '@/ui/Placeholder'

/** `M-09` 예약 목록 — 「예약 탭은 **로그인한 회원의** 예약 목록이다」 */
export default function Reservations() {
  return (
    <RequireAuth>
      <Placeholder id="M-09" title="예약 목록" note="목록은 #48 이 채운다">
        <Link href="/reservations/12345678" className="mt-6 text-sm font-semibold text-sky-600">
          예약 상세로 (M-10) →
        </Link>
      </Placeholder>
    </RequireAuth>
  )
}
