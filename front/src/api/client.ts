import { ApiError, toProblem } from './problem'

export interface ApiClientOptions {
  /** `/api/v1` (`api.md` §0 — URL 접두사 버저닝) */
  baseUrl: string
  /**
   * Access 토큰 공급자. **여기서 보관하지 않는다** — 거처는 `src/auth/token-store.ts` 다.
   */
  getAccessToken?: () => string | null
  /**
   * `401 UNAUTHENTICATED` 을 만났을 때 갱신을 시도한다. `true` 면 **원요청을 한 번만** 다시 쏜다.
   *
   * ⚠️ **갱신 호출 자체를 하는 클라이언트에는 이걸 달면 안 된다** — 무한 재귀다.
   *    `src/auth/session.ts` 가 갱신 전용 클라이언트를 따로 만드는 이유다.
   */
  refreshAccessToken?: () => Promise<boolean>
  /** 테스트에서 갈아끼운다 */
  fetchImpl?: typeof globalThis.fetch
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  /**
   * ⚠️ **결제 확정(`POST /holds/{id}/payment`)에만 붙인다** (`api.md` §2).
   *    화면 진입 시 1회 생성한 값을 재시도에도 **그대로** 써야 한다.
   */
  idempotencyKey?: string
  signal?: AbortSignal
}

function newRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(16).slice(2)
}

function parseRetryAfter(headers: Headers): number | null {
  const raw = headers.get('Retry-After')
  if (raw === null) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

export interface ApiClient {
  request<T>(path: string, options?: RequestOptions): Promise<T>
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis)

  async function request<T>(path: string, opts: RequestOptions = {}, retried = false): Promise<T> {
    const headers = new Headers({
      // 성공은 json, 에러는 problem+json 으로 온다 (`api.md` §4.1)
      Accept: 'application/json, application/problem+json',
      // 없으면 서버가 만들고 응답에 에코한다 (`api.md` §2)
      'X-Request-Id': newRequestId(),
    })

    const token = options.getAccessToken?.() ?? null
    if (token !== null) headers.set('Authorization', `Bearer ${token}`)
    if (opts.idempotencyKey !== undefined) headers.set('Idempotency-Key', opts.idempotencyKey)

    const hasBody = opts.body !== undefined
    if (hasBody) headers.set('Content-Type', 'application/json')

    const init: RequestInit = {
      method: opts.method ?? 'GET',
      headers,
      ...(hasBody ? { body: JSON.stringify(opts.body) } : {}),
      ...(opts.signal ? { signal: opts.signal } : {}),
    }

    const res = await doFetch(`${options.baseUrl}${path}`, init)

    if (res.status === 204) return undefined as T

    const text = await res.text()
    let payload: unknown = undefined
    if (text.length > 0) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = undefined
      }
    }

    // ⚠️ 202 는 2xx 인데도 던진다 — 성공으로 흘려보내면 안 되기 때문이다.
    //
    //    `202 PAYMENT_PENDING` 은 "승인됐는지 서버도 아직 모른다" 는 뜻이다 (`api.md` §4.3).
    //    반환값으로 주면 호출부가 `await` 결과를 받아 **완료 화면으로 넘어가 버린다** —
    //    front/CLAUDE.md 가 "자주 틀리는 것" 으로 꼽은 바로 그 실수다.
    //    던지면 그 실수가 타입 단계에서 불가능해지고, 호출부는 isPaymentPending 으로
    //    잡아 `GET` 폴링으로 간다. 계약이 202 를 Problem 형태로 주는 것도 같은 의도다.
    if (res.status >= 400 || res.status === 202) {
      const error = new ApiError(
        toProblem(res.status, payload, res.headers.get('X-Request-Id')),
        parseRetryAfter(res.headers),
      )

      // Access 가 만료됐을 뿐이면 한 번만 갱신하고 같은 요청을 다시 쏜다.
      // ⚠️ retried 플래그가 무한 루프를 막는다 — 갱신 직후에도 401 이면 세션이 끝난 것이다.
      // ⚠️ INVALID_CREDENTIALS 는 갱신 대상이 아니다. 로그인 실패는 다시 쏴도 같다.
      if (error.code === 'UNAUTHENTICATED' && !retried && options.refreshAccessToken) {
        const refreshed = await options.refreshAccessToken()
        if (refreshed) return request<T>(path, opts, true)
      }

      throw error
    }

    return payload as T
  }

  return { request: (path, opts) => request(path, opts) }
}

/**
 * 앱이 쓰는 기본 인스턴스.
 *
 * ⚠️ **여기서 `src/auth` 를 import 하지 않는다.** `session.ts` 가 이 파일을 쓰므로
 * 서로 가리키면 순환이 된다. 대신 `installAuth()`(`src/auth/install.ts`)가 아래 두
 * 공급자를 **밖에서 꽂는다.**
 */
let accessTokenProvider: () => string | null = () => null
let refreshHandler: (() => Promise<boolean>) | null = null

export function setAccessTokenProvider(fn: () => string | null): void {
  accessTokenProvider = fn
}

export function setRefreshHandler(fn: (() => Promise<boolean>) | null): void {
  refreshHandler = fn
}

/** `api.md` §0 — URL 접두사 버저닝. .env 가 없어도 개발이 돌아가게 기본값을 둔다 */
export const DEFAULT_BASE_URL = '/api/v1'

export const api: ApiClient = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? DEFAULT_BASE_URL,
  getAccessToken: () => accessTokenProvider(),
  refreshAccessToken: () => refreshHandler?.() ?? Promise.resolve(false),
})
