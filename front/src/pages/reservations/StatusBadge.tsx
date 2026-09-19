import type { components } from '../../api/schema'

type Status = components['schemas']['ReservationStatus']

/**
 * ⚠️ **서버가 준 값을 그대로 쓴다.**
 *
 * > `COMPLETED` 는 **DB 에 없다** — `departAt < now()` 로 응답 시점에 파생된다
 * > (`data.md` §5.5). **클라이언트는 파생인지 저장인지 알 필요가 없다.**
 * > 출발 시각으로 직접 계산하기 시작하면 서버와 판정이 갈라진다.
 *
 * 색만 붙인다. 문자열은 와이어프레임 그대로 영문 그대로다.
 */
const TONE: Record<Status, string> = {
  CONFIRMED: 'bg-green-50 text-green-800',
  CANCELLED: 'bg-gray-100 text-gray-600',
  COMPLETED: 'bg-blue-50 text-blue-800',
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONE[status]}`}>
      {status}
    </span>
  )
}
