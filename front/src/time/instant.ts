/**
 * 시각 두 종류를 **다른 타입으로** 가른다 (`api.md` §0).
 *
 * | 종류 | 형식 | 쓰이는 곳 |
 * |---|---|---|
 * | `Instant` | ISO-8601 **UTC** `Z` | `expiresAt` `departAt` `createdAt` |
 * | `ServiceDate` | `YYYY-MM-DD` **KST** | `serviceDate` · 조회 파라미터 |
 *
 * > **운행일은 타임존이 없는 개념이다.** "9월 11일 첫차" 는 KST 영업일이지 순간이 아니다.
 * > 같은 타입으로 다루면 **자정 근처에서 하루가 밀린다.**
 *
 * 브랜드를 붙여 **영업일 자리에 instant 를 넣으면 컴파일이 막히게** 한다.
 * 생성 타입(`schema.d.ts`)은 둘 다 `string` 이라, 경계에서 파서를 통과시켜야 브랜드가 붙는다.
 */
declare const instantBrand: unique symbol
declare const serviceDateBrand: unique symbol

export type Instant = string & { readonly [instantBrand]: true }
export type ServiceDate = string & { readonly [serviceDateBrand]: true }

const KST = 'Asia/Seoul'

/** ⚠️ `Z` 를 요구한다. 오프셋 표기(`+09:00`)나 접미사 없는 값은 서버 계약이 아니다 */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
const SERVICE_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isInstant(raw: string): raw is Instant {
  return INSTANT.test(raw) && !Number.isNaN(Date.parse(raw))
}

export function isServiceDate(raw: string): raw is ServiceDate {
  if (!SERVICE_DATE.test(raw)) return false
  // 2026-02-31 같은 값을 거른다 — 정규식은 자릿수만 본다
  const d = new Date(`${raw}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw
}

export function toInstant(raw: string): Instant {
  if (!isInstant(raw)) throw new TypeError(`instant 가 아니다: ${raw}`)
  return raw
}

export function toServiceDate(raw: string): ServiceDate {
  if (!isServiceDate(raw)) throw new TypeError(`영업일이 아니다: ${raw}`)
  return raw
}

export function instantToMs(i: Instant): number {
  return Date.parse(i)
}

function kstParts(i: Instant): Record<string, string> {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(new Date(i))

  return Object.fromEntries(parts.map((p) => [p.type, p.value]))
}

/** `09:00` */
export function formatKstTime(i: Instant): string {
  const p = kstParts(i)
  // Intl 이 자정을 24 로 줄 때가 있다 (ko-KR · hour12:false)
  const hour = p['hour'] === '24' ? '00' : (p['hour'] ?? '00')
  return `${hour}:${p['minute'] ?? '00'}`
}

/** `9월 20일 (일)` */
export function formatKstDate(i: Instant): string {
  const p = kstParts(i)
  return `${Number(p['month'])}월 ${Number(p['day'])}일 (${p['weekday'] ?? ''})`
}

/** `9월 20일 (일) 09:00` */
export function formatKstDateTime(i: Instant): string {
  return `${formatKstDate(i)} ${formatKstTime(i)}`
}

/**
 * instant 가 **KST 로 며칠인가**.
 *
 * ⚠️ `i.slice(0, 10)` 은 틀린다 — 그건 UTC 날짜다. `2026-09-10T21:00:00Z` 는
 * KST 로 **9월 11일**이고, 이 차이가 「자정 근처에서 하루가 밀린다」의 실체다.
 */
export function toKstServiceDate(i: Instant): ServiceDate {
  const p = kstParts(i)
  return toServiceDate(`${p['year']}-${p['month']}-${p['day']}`)
}

/** 오늘 (KST 영업일) */
export function todayInKst(now = new Date()): ServiceDate {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  return toServiceDate(p)
}

/** 영업일에 며칠 더한다. 조회 폼의 날짜 이동용 */
export function addDays(date: ServiceDate, days: number): ServiceDate {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000
  return toServiceDate(new Date(ms).toISOString().slice(0, 10))
}
