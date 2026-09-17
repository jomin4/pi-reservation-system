/**
 * ⚠️ **계약의 시각은 UTC 다. 표시 변환은 클라이언트가 한다** (`openapi.yaml` `Trip`).
 *
 * > `departAt` · `arriveAt` — **UTC ISO-8601.** 표시 변환은 클라이언트가 한다
 *
 * 그대로 찍으면 **KTX 101 이 06:00 이 아니라 21:00 (전날)** 로 보인다.
 * `date.ts` 의 영업일 함정과 **같은 뿌리**다 (`api.md` §0) — 다만 이쪽은
 * 날짜가 아니라 **시각**이라 증상이 더 눈에 띈다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/** `2026-09-20T00:00:00Z` → `09:00` (KST) */
export function toKstTime(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return '--:--'
  const kst = new Date(ms + KST_OFFSET_MS)
  // ⚠️ getUTC* 로 읽는다. 로컬 게터면 기기 시간대가 한 번 더 더해진다.
  const hh = String(kst.getUTCHours()).padStart(2, '0')
  const mm = String(kst.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/** `160` → `2시간 40분` · `45` → `45분` */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '-'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}분`
  if (m === 0) return `${h}시간`
  return `${h}시간 ${m}분`
}

/** `59800` → `59,800원` */
export function formatFare(won: number): string {
  return `${won.toLocaleString('ko-KR')}원`
}

/** `2026-09-20` → `09-20` — 헤더 부제용 */
export function toShortDate(businessDate: string): string {
  return businessDate.slice(5)
}

/** 영업일에 하루를 더하거나 뺀다. **KST 기준이라 문자열로 다룬다** */
export function shiftBusinessDate(businessDate: string, days: number): string {
  const ms = Date.parse(`${businessDate}T00:00:00Z`)
  if (Number.isNaN(ms)) return businessDate
  return new Date(ms + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
