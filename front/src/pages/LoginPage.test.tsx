import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import { clearTokens, getAccessToken, getRefreshToken } from '../auth'
import { handlers } from '../mocks/handlers'
import { setScenario } from '../mocks/scenario'
import { renderAt } from '../test/render'
import { LoginPage } from './LoginPage'

const server = setupServer(...handlers)
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  setScenario('happy')
})
afterAll(() => server.close())

beforeEach(() => {
  sessionStorage.clear()
  clearTokens()
})

const location = () => screen.getByTestId('location').textContent

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText('이메일'), 'hong@example.com')
  await userEvent.type(screen.getByLabelText('비밀번호'), 'password123')
  await userEvent.click(screen.getByRole('button', { name: '로그인' }))
}

describe('W-07 로그인', () => {
  it('성공하면 토큰을 저장한다', async () => {
    renderAt(<LoginPage />, '/login')
    await fillAndSubmit()

    await waitFor(() => {
      expect(getAccessToken()).toBeTruthy()
    })
    expect(getRefreshToken()).toBeTruthy()
  })

  it('성공하면 홈으로 간다', async () => {
    renderAt(<LoginPage />, '/login')
    await fillAndSubmit()
    await waitFor(() => {
      expect(location()).toBe('/')
    })
  })

  it('⚠️ ?redirect= 로 원래 화면에 복귀한다 — 좌석 선택을 잃으면 안 된다', async () => {
    renderAt(<LoginPage />, '/login?redirect=/trips/101/seats')
    await fillAndSubmit()
    await waitFor(() => {
      expect(location()).toBe('/trips/101/seats')
    })
  })

  it('⚠️ 외부 주소로는 안 보낸다 — 오픈 리다이렉트', async () => {
    renderAt(<LoginPage />, '/login?redirect=https://evil.example.com')
    await fillAndSubmit()
    await waitFor(() => {
      expect(location()).toBe('/')
    })
  })

  it('⚠️ 프로토콜 상대 주소도 막는다', async () => {
    renderAt(<LoginPage />, '/login?redirect=//evil.example.com')
    await fillAndSubmit()
    await waitFor(() => {
      expect(location()).toBe('/')
    })
  })
})

describe('W-07 — 실패', () => {
  it('⚠️ 자격 불일치는 문구가 하나다 — 계정 존재 여부가 새면 안 된다', async () => {
    setScenario('credentials-rejected')
    renderAt(<LoginPage />, '/login')
    await fillAndSubmit()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('이메일 또는 비밀번호가 올바르지 않습니다')
    // "없는 계정" 같은 단어가 새면 안 된다
    expect(alert.textContent).not.toMatch(/없는|가입되지/)
  })

  it('⚠️ 429 는 "잠겼습니다" 가 아니라 "5분 뒤" 다 — Retry-After 가 근거', async () => {
    setScenario('login-throttled')
    renderAt(<LoginPage />, '/login')
    await fillAndSubmit()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('5분 뒤 다시 시도해 주세요')
    expect(alert.textContent).not.toMatch(/잠겼/)
  })

  it('실패해도 토큰을 저장하지 않는다', async () => {
    setScenario('credentials-rejected')
    renderAt(<LoginPage />, '/login')
    await fillAndSubmit()

    await screen.findByRole('alert')
    expect(getAccessToken()).toBeNull()
  })
})

describe('W-07 — 범위 밖 링크를 넣지 않는다', () => {
  it('⚠️ "비밀번호를 잊으셨나요?" 가 없다 — 재설정은 초기 범위 밖이다', () => {
    renderAt(<LoginPage />, '/login')
    expect(screen.queryByText(/비밀번호를 잊/)).not.toBeInTheDocument()
    expect(screen.queryByText(/재설정/)).not.toBeInTheDocument()
  })

  it('시도 제한을 미리 알린다', () => {
    renderAt(<LoginPage />, '/login')
    expect(screen.getByText(/5회 실패하면 5분/)).toBeInTheDocument()
  })

  it('회원가입으로 갈 수 있다', () => {
    renderAt(<LoginPage />, '/login')
    expect(screen.getByRole('link', { name: '회원가입' })).toHaveAttribute('href', '/signup')
  })
})
