/**
 * 목 데이터로 돌고 있다는 사실을 화면이 말한다 (`#112`).
 *
 * > **가짜 예약이 진짜처럼 보이면 안 된다.** 첫 배포는 백엔드가 없어 `mock` 으로
 * > 뜨는데, 공개 URL 에서 `4820 7315` 같은 예약번호가 아무 설명 없이 보이면
 * > 실제 서비스로 읽힌다.
 *
 * ⚠️ **`real` 로 바뀌면 저절로 사라진다.** 지우는 걸 잊을 수 있는 코드를 남기지
 * 않으려고 조건을 `VITE_API_MODE` 하나에 건다 — 배포 모드를 정하는 그 값이다.
 *
 * ⚠️ **`src/mocks/` 를 import 하지 않는다.** 정적으로 끌어오면 목 그래프가 통째로
 * 프로덕션 엔트리 청크에 실린다 (#108). 여기서 필요한 건 환경변수뿐이다.
 */
export function DemoBadge() {
  if (import.meta.env.VITE_API_MODE !== 'mock') return null

  return (
    <div className="bg-amber-100 text-amber-900">
      <p className="mx-auto max-w-5xl px-4 py-1.5 text-center text-xs">
        <b>데모 · 목 데이터</b> — 실제 예약이 아닙니다. 백엔드 없이 화면만 동작합니다.
      </p>
    </div>
  )
}
