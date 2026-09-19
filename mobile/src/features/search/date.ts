/**
 * ⚠️ **영업일은 시각이 아니다** (`api.md` §0).
 *
 * | | 형식 | 기준 |
 * |---|---|---|
 * | 시각 (`departAt`) | ISO-8601 **UTC** · `Z` | 순간 |
 * | **영업일** (`date` 파라미터) | **`YYYY-MM-DD`** | ⚠️ **KST** |
 *
 * 기기 시계가 UTC 면 **한국 새벽 시간대에 하루 전 날짜**로 조회한다 —
 * 사용자는 "오늘 열차가 왜 없지" 를 보게 된다. 그래서 KST 로 고정해 뽑는다.
 */

/** KST 는 UTC+9. 서머타임이 없어 고정 오프셋으로 충분하다 */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

/** `YYYY-MM-DD` — **KST 기준 영업일** */
export function toBusinessDate(instant: Date = new Date()): string {
  const kst = new Date(instant.getTime() + KST_OFFSET_MS)
  // ⚠️ getUTC* 로 읽는다. 로컬 게터를 쓰면 기기 시간대가 한 번 더 더해진다.
  const y = kst.getUTCFullYear()
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const d = String(kst.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** `2026-09-11 (금)` — 화면 표기 */
export function formatBusinessDate(date: string): string {
  const parsed = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed)) return date
  const weekday = WEEKDAYS[new Date(parsed).getUTCDay()] ?? ''
  return `${date} (${weekday})`
}

/**
 * 오늘부터 `days` 일치 영업일 목록.
 *
 * > **달력 위젯을 안 넣었다.** 새 네이티브 의존을 들이는 값보다
 * > **예매 가능 범위를 목록으로 보여주는 게 이 화면에 맞는다** — 코레일도
 * > 예매 가능일이 한정돼 있다 (`research.md`). 범위는 백엔드가 정해지면 맞춘다.
 */
export function upcomingBusinessDates(days = 30, from: Date = new Date()): string[] {
  const out: string[] = []
  for (let i = 0; i < days; i += 1) {
    out.push(toBusinessDate(new Date(from.getTime() + i * 24 * 60 * 60 * 1000)))
  }
  return out
}
