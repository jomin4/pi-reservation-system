import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import { handlers } from '../mocks/handlers'
import { setScenario } from '../mocks/scenario'
import { renderAt } from '../test/render'
import { SignupPage } from './SignupPage'

const server = setupServer(...handlers)
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  setScenario('happy')
})
afterAll(() => server.close())

const location = () => screen.getByTestId('location').textContent
const submitButton = () => screen.getByRole('button', { name: /가입/ })

async function fillValid() {
  await userEvent.type(screen.getByLabelText(/이메일/), 'new@example.com')
  await userEvent.type(screen.getByLabelText(/비밀번호 \(/), 'password123')
  await userEvent.type(screen.getByLabelText('비밀번호 확인'), 'password123')
  await userEvent.type(screen.getByLabelText('이름'), '홍길동')
  await userEvent.type(screen.getByLabelText('연락처'), '010-1234-5678')
}

describe('W-08 회원가입', () => {
  it('다 채우면 가입할 수 있다', async () => {
    renderAt(<SignupPage />, '/signup')
    expect(submitButton()).toBeDisabled()

    await fillValid()
    expect(submitButton()).toBeEnabled()
  })

  it('가입하면 로그인 화면으로 간다 — 계약이 토큰을 주지 않는다', async () => {
    renderAt(<SignupPage />, '/signup')
    await fillValid()
    await userEvent.click(submitButton())

    await waitFor(() => {
      expect(location()).toBe('/login')
    })
  })

  it('이메일 인증 단계가 없다 — 가입 즉시 활성', () => {
    renderAt(<SignupPage />, '/signup')
    expect(screen.queryByText(/인증 메일|이메일 인증/)).not.toBeInTheDocument()
  })
})

describe('W-08 — 폼 검증은 계약이 정한 값이다', () => {
  it('⚠️ 비밀번호 8자 미만이면 막는다', async () => {
    renderAt(<SignupPage />, '/signup')
    await userEvent.type(screen.getByLabelText(/비밀번호 \(/), 'short')
    // ⚠️ 라벨에도 "8자 이상" 이 있다. 에러 문구만 정확히 본다
    expect(screen.getByText('8자 이상이어야 합니다.')).toBeInTheDocument()
    expect(submitButton()).toBeDisabled()
  })

  it('⚠️ 최대 72바이트다 — BCrypt 가 넘는 입력을 조용히 자른다', () => {
    renderAt(<SignupPage />, '/signup')
    expect(screen.getByLabelText(/비밀번호 \(/)).toHaveAttribute('maxLength', '72')
  })

  it('비밀번호 확인이 다르면 막는다', async () => {
    renderAt(<SignupPage />, '/signup')
    await userEvent.type(screen.getByLabelText(/비밀번호 \(/), 'password123')
    await userEvent.type(screen.getByLabelText('비밀번호 확인'), 'password124')

    expect(screen.getByText(/일치하지 않습니다/)).toBeInTheDocument()
    expect(submitButton()).toBeDisabled()
  })

  it('연락처 형식을 계약 패턴으로 막는다', async () => {
    renderAt(<SignupPage />, '/signup')
    await userEvent.type(screen.getByLabelText('연락처'), '01012345678')
    expect(screen.getByText(/010-0000-0000 형식/)).toBeInTheDocument()
  })
})

describe('W-08 — 중복확인은 최종 판정이 아니다', () => {
  it('사용 가능하면 알려준다', async () => {
    renderAt(<SignupPage />, '/signup')
    await userEvent.type(screen.getByLabelText(/이메일/), 'new@example.com')
    await userEvent.click(screen.getByRole('button', { name: '중복확인' }))

    expect(await screen.findByText('사용 가능한 이메일입니다.')).toBeInTheDocument()
  })

  it('사용 중이면 알려준다', async () => {
    setScenario('credentials-rejected')
    renderAt(<SignupPage />, '/signup')
    await userEvent.type(screen.getByLabelText(/이메일/), 'hong@example.com')
    await userEvent.click(screen.getByRole('button', { name: '중복확인' }))

    expect(await screen.findByText('이미 사용 중인 이메일입니다.')).toBeInTheDocument()
  })

  it('⚠️ 참고용이라고 적어둔다 — 확인과 가입 사이에 남이 채갈 수 있다', () => {
    renderAt(<SignupPage />, '/signup')
    expect(screen.getByText(/가입 시점에 이미 사용 중일 수 있습니다/)).toBeInTheDocument()
  })

  it('⚠️ 확인이 통과해도 가입에서 409 가 날 수 있다', async () => {
    setScenario('credentials-rejected')
    renderAt(<SignupPage />, '/signup')
    await fillValid()
    await userEvent.click(submitButton())

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 가입된 이메일입니다')
  })
})
