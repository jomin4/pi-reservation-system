import { ApiError, toProblem } from './problem'

export interface ApiClientOptions {
  /** `/api/v1` (`api.md` §0 — URL 접두사 버저닝) */
  baseUrl: string
  /**
   * Access 토큰 공급자. **메모리 전용이다** (`tech.md`) — 여기서 보관하지 않는다.
   * 실제 저장과 갱신은 #69 가 채운다.
   */
  getAccessToken?: () => string | null
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

  async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
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
      throw new ApiError(
        toProblem(res.status, payload, res.headers.get('X-Request-Id')),
        parseRetryAfter(res.headers),
      )
    }

    return payload as T
  }

  return { request }
}

/** 앱이 쓰는 기본 인스턴스. 토큰 공급자는 #69 가 `setAccessTokenProvider` 로 꽂는다. */
let accessTokenProvider: () => string | null = () => null

export function setAccessTokenProvider(fn: () => string | null): void {
  accessTokenProvider = fn
}

/** `api.md` §0 — URL 접두사 버저닝. .env 가 없어도 개발이 돌아가게 기본값을 둔다 */
export const DEFAULT_BASE_URL = '/api/v1'

export const api: ApiClient = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? DEFAULT_BASE_URL,
  getAccessToken: () => accessTokenProvider(),
})
