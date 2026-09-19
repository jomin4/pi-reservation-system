import type { Problem } from './problem'

export function problemOf(over: Partial<Problem> & Pick<Problem, 'status' | 'code'>): Problem {
  return {
    type: 'https://api.jomin4.cloud/problems/x',
    title: '문제가 발생했습니다',
    requestId: '7f3a9c21',
    ...over,
  }
}

export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  const hasBody = body !== undefined && status !== 204
  return new Response(hasBody ? JSON.stringify(body) : null, {
    status,
    headers: { 'Content-Type': 'application/problem+json', ...headers },
  })
}

/** 마지막 요청을 들여다볼 수 있는 가짜 fetch */
export function stubFetch(res: Response | (() => Response)) {
  const calls: { url: string; init: RequestInit }[] = []
  const fetchImpl = ((url: string, init: RequestInit) => {
    calls.push({ url, init })
    // ⚠️ Response 본문은 한 번만 읽힌다. 같은 객체를 두 요청에 주면
    //    두 번째가 "Body has already been read" 로 죽는다 — 클라이언트 문제가 아니다.
    return Promise.resolve(typeof res === 'function' ? res() : res.clone())
  }) as unknown as typeof globalThis.fetch
  const last = () => {
    const c = calls.at(-1)
    if (!c) throw new Error('요청이 없었다')
    return { url: c.url, headers: new Headers(c.init.headers), init: c.init }
  }
  return { fetchImpl, calls, last }
}
