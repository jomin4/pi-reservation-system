import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { createQueryClient } from '../api/query-client'

/**
 * 화면 테스트 공용 껍데기.
 *
 * > **실제 `QueryClient` 와 실제 라우터를 쓴다.** 목을 겹겹이 쌓으면 "테스트는 통과하는데
 * > 화면은 안 나온다" 가 된다. 네트워크만 MSW 가 가로챈다.
 */
function LocationProbe() {
  const location = useLocation()
  return <span data-testid="location">{`${location.pathname}${location.search}`}</span>
}

/**
 * ⚠️ **테스트에서는 재시도를 끈다.** 5xx 를 2회 재시도하면 백오프 때문에 에러 화면이
 * 몇 초 뒤에야 뜬다 — 테스트가 그걸 기다릴 이유가 없다. **재시도 정책 자체는
 * `query-client.test.ts` 가 따로 검증한다.**
 */
function testQueryClient() {
  const client = createQueryClient()
  client.setDefaultOptions({
    ...client.getDefaultOptions(),
    queries: { ...client.getDefaultOptions().queries, retry: false },
  })
  return client
}

/**
 * ⚠️ **경로 파라미터를 쓰는 화면은 `routePath` 를 줘야 한다.**
 * `<Route>` 없이 컴포넌트만 렌더하면 `useParams()` 가 빈 객체를 주고,
 * 화면은 "운행을 찾을 수 없습니다" 만 그린다 — 원인을 찾느라 한참 걸리는 종류다.
 */
export function renderAt(ui: ReactNode, path = '/', routePath?: string) {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <LocationProbe />
        {routePath ? (
          <Routes>
            <Route path={routePath} element={ui} />
          </Routes>
        ) : (
          ui
        )}
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
