import { Link, useLocalSearchParams } from 'expo-router'

import { Placeholder } from '@/ui/Placeholder'

/**
 * `M-03` 좌석 선택 — **공개 화면이다.** 로그인은 **선점 시점**에 요구한다
 * (와이어프레임 「선점 시점에 요구한다 — 웹과 동일」).
 *
 * ⚠️ 그래서 `RequireAuth` 로 감싸지 않는다. 화면 단위로 막으면 **좌석을 보지도 못하고**
 *    로그인으로 튕긴다 — 비로그인 조회가 되는 설계와 어긋난다.
 *    선점 버튼이 `/login?next=` 로 보낸다. `E-01` 도 이 화면 위에 뜬다.
 */
export default function Seats() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>()

  return (
    <Placeholder id="M-03" title="좌석 선택" note={`운행 ${tripId} · 800석 · 최대 6석 (#42)`}>
      <Link
        href={{ pathname: '/login', params: { next: '/holds/h-1' } }}
        className="mt-6 text-sm font-semibold text-sky-600"
      >
        좌석 선점 → 로그인 필요 (M-07) →
      </Link>
    </Placeholder>
  )
}
