import { randomUUID } from 'expo-crypto'

import { API_BASE_URL } from '../config/env'
import { ApiError, toProblem } from './problem'

/**
 * ⚠️ **웹(`front/src/api/client.ts`)과 갈리는 지점이 셋이다.** 나머지는 같다.
 *
 * | | 웹 | **모바일** |
 * |---|---|---|
 * | UUID | `crypto.randomUUID()` | **`expo-crypto`** — Hermes 에 `crypto` 가 없다 |
 * | 환경변수 | `import.meta.env.VITE_*` | **`EXPO_PUBLIC_*`** |
 * | 타임아웃 | 브라우저가 건다 | **직접 건다** — RN `fetch` 는 영원히 기다린다 |
 */

export interface ApiClientOptions {
  /** `/api/v1` (`api.md` §0 — URL 접두사 버저닝) */
  baseUrl: string
  /**
   * Access 토큰 공급자. **여기서 보관하지 않는다.**
   * 저장(SecureStore)과 회전은 #84 가 채운다.
   */
  getAccessToken?: () => string | null
  /**
   * ⚠️ **선제 갱신.** 요청 전에 Access 가 곧 만료면 먼저 회전한다.
   *    계약이 `accessExpiresAt` 을 주는 이유다 — `401` 을 받고 갱신하면
   *    **사용자 동작 하나가 이미 실패한 뒤**다.
   */
  ensureFreshToken?: () => Promise<void>
  /**
   * `401` 을 받았을 때 한 번 되살려 본다. **갱신했으면 `true`** —
   * 그러면 원래 요청을 그대로 다시 보낸다.
   */
  onUnauthorized?: () => Promise<boolean>
  /** 기본 요청 타임아웃(ms). 아래 「타임아웃」 참조 */
  timeoutMs?: number
  /** 테스트에서 갈아끼운다 */
  fetchImpl?: typeof globalThis.fetch
  /** 테스트에서 갈아끼운다 */
  newRequestId?: () => string
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  /**
   * ⚠️ **결제 확정(`POST /holds/{id}/payment`)에만 붙인다** (`api.md` §2).
   *    화면 진입 시 1회 생성한 값을 재시도에도 **그대로** 써야 한다.
   *    ⚠️ 모바일은 이 값을 **영속 저장**해야 한다 — 앱이 죽으면 메모리 키가 사라진다 (#84).
   */
  idempotencyKey?: string
  /**
   * ⚠️ **인증 갱신 경로를 타지 않는다.** `POST /auth/refresh` 자신이 이걸 쓴다 —
   *    안 그러면 갱신 실패가 다시 갱신을 부르는 무한 재귀가 된다.
   */
  skipAuthRefresh?: boolean
  /** 이 요청만 다른 타임아웃 */
  timeoutMs?: number
  signal?: AbortSignal
}

/** 기본 타임아웃 — 조회 기준 */
export const DEFAULT_TIMEOUT_MS = 10_000

/** `api.md` §0 — URL 접두사 버저닝 */
export const DEFAULT_BASE_URL = '/api/v1'

/**
 * 요청이 응답을 못 받고 끊겼다. **서버가 처리했는지 안 했는지 모른다.**
 *
 * ⚠️ **`ApiError` 와 반드시 구분한다.** `ApiError` 는 서버가 답을 준 것이고
 *    이건 답이 없는 것이다. 결제에서 이 차이가 이중 결제를 가른다 —
 *    **`POST` 를 다시 부르면 안 되고 `GET /holds/{id}/payment` 로 결과를 묻는다**
 *    (`api.md` §5.3 · `E-03`).
 */
export class ApiTimeoutError extends Error {
  readonly requestId: string

  constructor(requestId: string, timeoutMs: number) {
    super(`요청이 ${timeoutMs}ms 안에 응답받지 못했다 (X-Request-Id: ${requestId})`)
    this.name = 'ApiTimeoutError'
    this.requestId = requestId
  }
}

export function isTimeout(e: unknown): e is ApiTimeoutError {
  return e instanceof ApiTimeoutError
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
  /**
   * ⚠️ **`globalThis.fetch` 를 여기서 붙잡지 않는다. 부를 때마다 읽는다.**
   *
   * `const doFetch = globalThis.fetch.bind(globalThis)` 로 캡처하면 **MSW 가 조용히 깨진다.**
   * `msw/native` 는 `listen()` 시점에 전역 `fetch` 를 갈아끼우는데, 그보다 먼저 캡처된
   * 참조는 옛 구현을 가리킨다. 그 옛 구현도 XHR 을 타므로 **요청은 가로채지는데**
   * 돌려주는 Response 가 **`status` 도 `text()` 도 `undefined` 인 반쪽짜리**다.
   *
   * 던지지 않고 `undefined` 를 주기 때문에 증상이 `Cannot read properties of undefined
   * (reading 'length')` 로 **엉뚱한 줄에서** 난다 (트러블슈팅 2026-09-14).
   *
   * `api` 인스턴스가 모듈 최상단에서 만들어지므로 **import 순서에 따라 재현된다** —
   * 즉 고쳐두지 않으면 언젠가 터진다.
   */
  const doFetch: typeof globalThis.fetch =
    options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init))
  const makeId = options.newRequestId ?? randomUUID
  const defaultTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    // ⚠️ **선제 갱신.** 계약이 `accessExpiresAt` 을 주는 이유가 이것이다 —
    //    `401` 을 받고 나서 갱신하면 **사용자 동작 하나가 이미 실패한 뒤**다.
    if (options.ensureFreshToken !== undefined && opts.skipAuthRefresh !== true) {
      await options.ensureFreshToken()
    }

    return send<T>(path, opts, false)
  }

  async function send<T>(path: string, opts: RequestOptions, isRetry: boolean): Promise<T> {
    const requestId = makeId()

    const headers = new Headers({
      // 성공은 json, 에러는 problem+json 으로 온다 (`api.md` §4.1)
      Accept: 'application/json, application/problem+json',
      // 없으면 서버가 만들고 응답에 에코한다 (`api.md` §2)
      'X-Request-Id': requestId,
    })

    const token = options.getAccessToken?.() ?? null
    if (token !== null) headers.set('Authorization', `Bearer ${token}`)
    if (opts.idempotencyKey !== undefined) headers.set('Idempotency-Key', opts.idempotencyKey)

    const hasBody = opts.body !== undefined
    if (hasBody) headers.set('Content-Type', 'application/json')

    // ⚠️ RN 의 fetch 는 기본 타임아웃이 없다. 지하철에서 신호가 끊기면
    //    화면이 영원히 스피너를 돈다. 호출자가 준 signal 과 합친다.
    const timeoutMs = opts.timeoutMs ?? defaultTimeout
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const onOuterAbort = () => controller.abort()
    opts.signal?.addEventListener('abort', onOuterAbort)

    const init: RequestInit = {
      method: opts.method ?? 'GET',
      headers,
      signal: controller.signal,
      ...(hasBody ? { body: JSON.stringify(opts.body) } : {}),
    }

    let res: Response
    try {
      res = await doFetch(`${options.baseUrl}${path}`, init)
    } catch (e) {
      // 호출자가 직접 끊은 것과 타임아웃을 구분한다 — 화면 반응이 다르다.
      if (opts.signal?.aborted === true) throw e
      if (controller.signal.aborted) throw new ApiTimeoutError(requestId, timeoutMs)
      throw e
    } finally {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onOuterAbort)
    }

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

    // ⚠️ **`401` 은 한 번만 되살려 본다.** 선제 갱신이 있어도 시계 오차나
    //    서버측 폐기로 여기 올 수 있다. 성공하면 **원래 요청을 그대로 다시** 보낸다 —
    //    사용자 동작이 실패한 것처럼 보이지 않게.
    //
    //    ⚠️ **두 번은 없다.** 갱신 후에도 `401` 이면 세션이 끝난 것이고,
    //    거기서 또 갱신하면 폐기된 토큰을 다시 보내 **재사용 탐지**에 걸린다.
    if (res.status === 401 && !isRetry && opts.skipAuthRefresh !== true) {
      const refreshed = (await options.onUnauthorized?.()) ?? false
      if (refreshed) return send<T>(path, opts, true)
    }

    // ⚠️ 202 는 2xx 인데도 던진다 — 성공으로 흘려보내면 안 되기 때문이다.
    //
    //    `202 PAYMENT_PENDING` 은 "승인됐는지 서버도 아직 모른다" 는 뜻이다 (`api.md` §4.3).
    //    반환값으로 주면 호출부가 `await` 결과를 받아 **완료 화면으로 넘어가 버린다.**
    //    던지면 그 실수가 불가능해지고, 호출부는 isPaymentPending 으로 잡아
    //    `GET` 폴링으로 간다. 계약이 202 를 Problem 형태로 주는 것도 같은 의도다.
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

/**
 * 앱이 쓰는 기본 인스턴스.
 *
 * ⚠️ **인증 훅은 setter 로 꽂는다.** `client.ts` 가 `auth/` 를 import 하면
 *    `auth/` 도 갱신 요청을 보내려고 `client.ts` 를 import 해 **순환**이 된다.
 *    배선은 `src/auth/wire.ts` 한 곳에서 한다.
 */
let accessTokenProvider: () => string | null = () => null
let ensureFresh: (() => Promise<void>) | null = null
let unauthorized: (() => Promise<boolean>) | null = null

export function setAccessTokenProvider(fn: () => string | null): void {
  accessTokenProvider = fn
}

export function setAuthRefreshHooks(hooks: {
  ensureFreshToken: () => Promise<void>
  onUnauthorized: () => Promise<boolean>
}): void {
  ensureFresh = hooks.ensureFreshToken
  unauthorized = hooks.onUnauthorized
}

export const api: ApiClient = createApiClient({
  baseUrl: API_BASE_URL,
  getAccessToken: () => accessTokenProvider(),
  ensureFreshToken: async () => {
    await ensureFresh?.()
  },
  onUnauthorized: async () => (await unauthorized?.()) ?? false,
})
