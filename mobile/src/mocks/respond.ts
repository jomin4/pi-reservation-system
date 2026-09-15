import type { Problem } from '../api/problem'

/**
 * 응답을 만드는 두 줄. **MSW 의 `HttpResponse` 자리를 대신한다.**
 *
 * > **`Response` 는 RN 이 준다.** `whatwg-fetch` 폴리필이 전역에 넣어두므로
 * > 우리가 만들 게 없다 — `msw` 처럼 자체 Response 구현을 들고 올 이유가 없었다.
 */

export function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
}

/**
 * RFC 9457 — 성공과 **다른 미디어 타입**이다 (`api.md` §4.1).
 * `status` 는 본문의 것을 그대로 쓴다. 둘이 어긋나면 클라이언트가 헷갈린다.
 */
export function problemResponse(p: Problem, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(p), {
    status: p.status,
    headers: { 'Content-Type': 'application/problem+json', ...headers },
  })
}

export function noContent(): Response {
  return new Response(null, { status: 204 })
}

/**
 * ⚠️ **즉시 반환하면 로딩 화면을 만들 계기가 없다** (`api.md` §7.2).
 * 다만 테스트는 그 계기가 필요 없다 — 20개가 500ms 씩 기다리면 10초다.
 */
export const MOCK_DELAY_MS = process.env.JEST_WORKER_ID === undefined ? 500 : 0

export function delay(ms: number = MOCK_DELAY_MS): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}
