import type { Handler } from './router'
import { match } from './router'

/**
 * 전역 `fetch` 를 한 겹 감싼다. **MSW 의 `setupServer(...).listen()` 자리다.**
 *
 * > **앱 코드는 이게 있는지도 모른다.** 화면은 진짜 `fetch` 를 부르고,
 * > 매칭되면 핸들러가 답하고, 안 되면 **원본으로 그대로 나간다** (`api.md` §7.2).
 *
 * ⚠️ **`onUnhandled` 를 404 로 만들지 않는다.** 목이 모르는 요청은 진짜로 나가야
 *    "왜 안 붙지" 가 네트워크 에러로 드러난다. 404 를 지어내면 **목이 답한 건지
 *    서버가 없는 건지 구분이 안 된다.**
 */

let original: typeof globalThis.fetch | null = null

export interface InterceptorHandle {
  stop: () => void
}

export function startIntercept(handlers: readonly Handler[]): InterceptorHandle {
  if (original !== null) {
    // 두 번 켜면 원본을 잃는다 — 그러면 stop 이 목을 목으로 되돌린다
    throw new Error('목 인터셉터가 이미 켜져 있다. stop() 을 먼저 부른다.')
  }

  const upstream = globalThis.fetch.bind(globalThis)
  original = upstream

  const mocked: typeof globalThis.fetch = async (input, init) => {
    // Request 로 정규화해야 method·헤더·본문을 한 곳에서 본다
    const request = input instanceof Request && init === undefined ? input : new Request(input, init)

    const found = match(handlers, request)
    if (found === null) return upstream(input as RequestInfo, init)

    return found.handler.resolve(found.ctx)
  }

  globalThis.fetch = mocked

  return {
    stop: () => {
      if (original !== null) {
        globalThis.fetch = original
        original = null
      }
    },
  }
}

/** 테스트에서 상태가 새는 것을 막는다 */
export function isIntercepting(): boolean {
  return original !== null
}
