import { Link } from 'expo-router'

import { Placeholder } from '@/ui/Placeholder'

/** `M-02` 운행 목록 — 「검색 조건은 내비게이션 바로 올려 본문 공간을 벌었다」 */
export default function Trips() {
  return (
    <Placeholder id="M-02" title="운행 목록" note="구간 + 날짜 → 운행·시각·잔여석 (#41)">
      <Link href="/trips/101/seats" className="mt-6 text-sm font-semibold text-sky-600">
        좌석 선택으로 (M-03) →
      </Link>
    </Placeholder>
  )
}
