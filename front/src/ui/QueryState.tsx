import type { ReactNode } from 'react'
import { ApiError } from '../api/problem'

/**
 * 로딩 · 에러 공통 표현.
 *
 * > **MSW 가 500ms 를 넣는 이유가 이 컴포넌트다** (`api.md` §7.2). 즉시 반환하면
 * > 로딩 화면을 만들 계기가 없다.
 */
export function Loading({ label = '불러오는 중' }: { label?: string }) {
  return (
    <div role="status" className="py-10 text-center text-sm text-gray-500">
      {label}…
    </div>
  )
}

/**
 * ⚠️ **`requestId` 를 반드시 보여준다** (`api.md` §4.1). 사용자가 "안 돼요" 라고 할 때
 * 화면의 이 값 하나로 로그 전체를 추적한다.
 */
export function ErrorView({
  error,
  onRetry,
  children,
}: {
  error: unknown
  onRetry?: () => void
  children?: ReactNode
}) {
  const api = error instanceof ApiError ? error : null

  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6">
      <p className="font-medium text-red-900">{api?.problem.title ?? '문제가 발생했습니다'}</p>
      {api?.detail && <p className="mt-1 text-sm text-red-800">{api.detail}</p>}
      {children}
      <div className="mt-4 flex items-center gap-3">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg bg-red-900 px-3 py-1.5 text-sm text-white"
          >
            다시 시도
          </button>
        )}
        {api && <span className="text-xs text-red-800">요청번호 {api.requestId}</span>}
      </div>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-sm text-gray-500">{children}</div>
}
