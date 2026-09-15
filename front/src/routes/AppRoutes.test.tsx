import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import { MemoryRouter, useLocation } from 'react-router'
import { createQueryClient } from '../api/query-client'
import { clearTokens, setTokens } from '../auth'
import { handlers } from '../mocks/handlers'
import { AppRoutes } from './AppRoutes'

// ⚠️ 공개 라우트(W-01 · W-02)가 이제 진짜 화면이라 네트워크를 탄다
const server = setupServer(...handlers)
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }))
afterAll(() => server.close())

const pair = {
  accessToken: 'acc_1',
  refreshToken: 'ref_1',
  accessExpiresAt: '2026-09-04T05:27:33Z',
}

/** 어디로 갔는지 보려면 현재 위치를 화면에 내놔야 한다 */
function LocationProbe() {
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  return (
    <div>
      <span data-testid="path">{location.pathname}</span>
      <span data-testid="from">{from ?? ''}</span>
    </div>
  )
}

function open(path: string) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <LocationProbe />
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const path = () => screen.getByTestId('path').textContent
const from = () => screen.getByTestId('from').textContent

beforeEach(() => {
  sessionStorage.clear()
  clearTokens()
})

describe('공개 라우트 — 로그인 없이 본다 (api.md §5.1)', () => {
  it('/ 는 홈을 띄운다', () => {
    open('/')
    // 역 목록을 부르는 중이다 — 라우트가 붙었다는 증거로 충분하다
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(path()).toBe('/')
  })

  it('/trips 는 운행 목록을 띄운다', () => {
    open('/trips')
    expect(screen.getByText(/조회 조건이 없습니다/)).toBeInTheDocument()
    expect(path()).toBe('/trips')
  })

  it('⚠️ 좌석 선택도 공개다 — 로그인을 요구하는 건 선점 버튼이다', () => {
    open('/trips/101/seats')
    // 좌석을 부르는 중이다 — 가드에 막히지 않았다는 증거
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(path()).toBe('/trips/101/seats')
  })
})

describe('⚠️ 보호 라우트 — 원래 자리를 들고 로그인으로', () => {
  it.each(['/holds/h_8f3a21', '/holds/h_8f3a21/payment', '/reservations', '/me'])(
    '%s 는 비로그인이면 로그인으로 보낸다',
    (route) => {
      open(route)
      expect(path()).toBe('/login')
    },
  )

  it('돌아갈 자리를 state 에 심는다 — 좌석 고르다 튕긴 사용자를 홈으로 보내면 안 된다', () => {
    open('/holds/h_8f3a21/payment')
    expect(from()).toBe('/holds/h_8f3a21/payment')
  })

  it('쿼리스트링까지 들고 간다', () => {
    open('/reservations?page=2')
    expect(from()).toBe('/reservations?page=2')
  })

  it('로그인해 있으면 그대로 들어간다', () => {
    setTokens(pair)
    open('/reservations')
    expect(path()).toBe('/reservations')
    expect(screen.getByText('W-09')).toBeInTheDocument()
  })

  it('⚠️ Access 가 없어도 Refresh 가 있으면 통과한다 — 새로고침 직후가 그 상태다', () => {
    sessionStorage.setItem('auth:refresh', 'ref_survived')
    open('/me')
    expect(path()).toBe('/me')
  })
})

describe('로그인 · 회원가입은 비로그인 전용', () => {
  it('비로그인이면 보여준다', () => {
    open('/login')
    expect(screen.getByRole('heading', { name: '로그인' })).toBeInTheDocument()
  })

  it('⚠️ 이미 로그인했으면 홈으로 — 다시 로그인하면 회전이 한 번 더 돈다', () => {
    setTokens(pair)
    open('/login')
    expect(path()).toBe('/')
  })

  it('회원가입도 마찬가지다', () => {
    setTokens(pair)
    open('/signup')
    expect(path()).toBe('/')
  })
})

describe('⚠️ 경로 순서 — complete 를 예약번호로 먹으면 안 된다', () => {
  it('/reservations/48207315/complete 는 W-06 이다', () => {
    setTokens(pair)
    open('/reservations/48207315/complete')
    // W-06 이 진짜 화면이 된 뒤로는 로딩 표시가 라우트의 증거다.
    // 순서가 뒤집혔다면 상세(W-10)가 먹었을 것이다
    expect(screen.getByRole('status')).toHaveTextContent('예약을 불러오는 중')
    expect(screen.queryByText('W-10')).not.toBeInTheDocument()
  })

  it('/reservations/48207315 는 W-10 이다', () => {
    setTokens(pair)
    open('/reservations/48207315')
    expect(screen.getByText('W-10')).toBeInTheDocument()
  })
})

describe('없는 경로', () => {
  it('홈으로 보낸다', () => {
    open('/없는/경로')
    expect(path()).toBe('/')
  })
})

describe('헤더', () => {
  it('비로그인이면 로그인 · 회원가입을 보여준다', () => {
    open('/')
    expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '로그아웃' })).not.toBeInTheDocument()
  })

  it('로그인했으면 예약 내역 · 마이페이지 · 로그아웃', () => {
    setTokens(pair)
    open('/')
    expect(screen.getByRole('link', { name: '예약 내역' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '로그아웃' })).toBeInTheDocument()
  })

  it('⚠️ 로그아웃하면 로그인으로 간다 — onSessionEnd 가 연결점이다', async () => {
    setTokens(pair)
    open('/reservations')
    expect(path()).toBe('/reservations')

    await userEvent.click(screen.getByRole('button', { name: '로그아웃' }))

    // 로그아웃은 서버를 한 번 부르고 정리한다 — 리다이렉트가 클릭보다 한 박자 늦다
    await waitFor(() => {
      expect(path()).toBe('/login')
    })
    expect(from()).toBe('/reservations')
  })
})
