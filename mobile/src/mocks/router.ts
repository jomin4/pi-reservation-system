/**
 * 목 라우터 — **MSW 의 `http.get(...)` 자리를 대신한다.**
 *
 * `msw` 를 버린 이유는 기능이 부족해서가 아니라 **Hermes 에서 안 돌아서**다
 * (트러블슈팅 2026-09-14). 그래서 여기서는 **우리가 실제로 쓰는 것만** 만든다.
 *
 * | 만든다 | 안 만든다 |
 * |---|---|
 * | method + 경로 매칭 · `:param` | WebSocket · GraphQL |
 * | `status` · 헤더 · `delay` | 스트림 응답 (SSE 는 `FakeSeatEvents` 가 한다) |
 * | 쿼리 파라미터 읽기 | 워커 브로드캐스트 |
 */

export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export interface MockRequest {
  /** `:tripId` 같은 경로 변수. 값은 **디코드된 문자열** */
  params: Record<string, string>
  /** `?from=SEO` 같은 쿼리 */
  query: URLSearchParams
  request: Request
  /** 본문을 JSON 으로. 본문이 없거나 JSON 이 아니면 `undefined` */
  json: <T = unknown>() => Promise<T | undefined>
}

export type Resolver = (ctx: MockRequest) => Response | Promise<Response>

export interface Handler {
  method: Method
  /** `/trips/:tripId/seats` — **`/api/v1` 접두는 붙이지 않는다** */
  path: string
  resolve: Resolver
  /** 내부용 — `path` 에서 만든 정규식 */
  readonly matcher: RegExp
  readonly paramNames: readonly string[]
}

/**
 * `/trips/:tripId/seats` → `/^\/trips\/([^/]+)\/seats$/`
 *
 * ⚠️ **정규식 특수문자를 먼저 이스케이프한다.** 경로에 `.` 이 들어오면
 *    아무 글자나 매칭돼서 **엉뚱한 핸들러가 먹는다.**
 */
function compile(path: string): { matcher: RegExp; paramNames: string[] } {
  const paramNames: string[] = []
  const pattern = path
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        paramNames.push(seg.slice(1))
        return '([^/]+)'
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    .join('/')

  return { matcher: new RegExp(`^${pattern}$`), paramNames }
}

function define(method: Method, path: string, resolve: Resolver): Handler {
  const { matcher, paramNames } = compile(path)
  return { method, path, resolve, matcher, paramNames }
}

export const http = {
  get: (path: string, resolve: Resolver) => define('GET', path, resolve),
  post: (path: string, resolve: Resolver) => define('POST', path, resolve),
  patch: (path: string, resolve: Resolver) => define('PATCH', path, resolve),
  delete: (path: string, resolve: Resolver) => define('DELETE', path, resolve),
}

/** `api.md` §0 — URL 접두사 버저닝. 절대 URL 이든 상대 경로든 이 뒤만 본다 */
const API_PREFIX = '/api/v1'

/**
 * 요청 URL 에서 **`/api/v1` 뒤의 경로**를 뽑는다.
 *
 * `EXPO_PUBLIC_API_BASE_URL` 이 `http://10.0.2.2:8080/api/v1` 이든 `/api/v1` 이든
 * 같은 결과가 나와야 한다 — **오리진을 가리지 않는다.**
 */
export function toApiPath(url: string): { path: string; query: URLSearchParams } | null {
  const hashless = url.split('#')[0] ?? ''
  const [beforeQuery, queryString = ''] = hashless.split('?')
  const raw = beforeQuery ?? ''

  const at = raw.indexOf(API_PREFIX)
  if (at < 0) return null

  const path = raw.slice(at + API_PREFIX.length)
  return { path: path === '' ? '/' : path, query: new URLSearchParams(queryString) }
}

export interface Matched {
  handler: Handler
  ctx: MockRequest
}

/**
 * 첫 번째로 맞는 핸들러를 준다. **등록 순서가 우선순위다.**
 *
 * ⚠️ 못 찾으면 `null` — 호출부는 **원본 `fetch` 로 통과**시킨다.
 * 조용히 404 를 만들지 않는다. 목이 모르는 요청은 진짜로 나가야 진단이 된다.
 */
export function match(handlers: readonly Handler[], request: Request): Matched | null {
  const parsed = toApiPath(request.url)
  if (parsed === null) return null

  for (const handler of handlers) {
    if (handler.method !== request.method.toUpperCase()) continue

    const m = handler.matcher.exec(parsed.path)
    if (m === null) continue

    const params: Record<string, string> = {}
    handler.paramNames.forEach((name, i) => {
      const v = m[i + 1]
      if (v !== undefined) params[name] = decodeURIComponent(v)
    })

    return {
      handler,
      ctx: {
        params,
        query: parsed.query,
        request,
        json: async <T,>() => {
          try {
            return (await request.clone().json()) as T
          } catch {
            return undefined
          }
        },
      },
    }
  }

  return null
}
