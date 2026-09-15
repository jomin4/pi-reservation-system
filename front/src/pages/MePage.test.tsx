import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { clearTokens, setTokens } from '../auth'
import * as fx from '../mocks/fixtures'
import { handlers } from '../mocks/handlers'
import { setScenario } from '../mocks/scenario'
import { renderAt } from '../test/render'
import { MePage } from './MePage'

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
  setTokens({ accessToken: 'a', refreshToken: 'r', accessExpiresAt: '2026-09-04T05:27:33Z' })
})

const url = (path: string) => `*/api/v1${path}`

async function open() {
  renderAt(<MePage />, '/me')
  await screen.findByRole('heading', { name: '내 정보' })
}

const nameBox = () => screen.getByLabelText('이름')
const save = () => screen.getByRole('button', { name: '정보 수정' })

describe('W-12 마이페이지', () => {
  it('회원 정보를 채워 보여준다', async () => {
    await open()
    expect(await screen.findByDisplayValue('홍길동')).toBeInTheDocument()
    expect(screen.getByDisplayValue('010-0000-0000')).toBeInTheDocument()
  })

  it('⚠️ 이메일은 보여주되 못 바꾼다 — 소유 증명 수단이 없다', async () => {
    await open()
    const email = await screen.findByDisplayValue('hong@example.com')
    expect(email).toBeDisabled()
  })

  it('⚠️ 없는 기능을 없다고 적는다 — 의도된 축소이지 누락이 아니다', async () => {
    await open()
    expect(screen.getByText(/비밀번호 변경 · 이메일 변경 · 회원 탈퇴는 아직/)).toBeInTheDocument()
  })

  it('고친 게 없으면 저장 버튼이 잠겨 있다', async () => {
    await open()
    await screen.findByDisplayValue('홍길동')
    expect(save()).toBeDisabled()
  })
})

describe('이름 · 연락처 수정', () => {
  it('바꾼 값만 PATCH 로 보낸다', async () => {
    let body: unknown
    server.use(
      http.patch(url('/me'), async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ ...fx.me, name: '홍길순' })
      }),
    )
    await open()
    await screen.findByDisplayValue('홍길동')

    await userEvent.clear(nameBox())
    await userEvent.type(nameBox(), '홍길순')
    await userEvent.click(save())

    await waitFor(() => {
      expect(body).toEqual({ name: '홍길순', phone: '010-0000-0000' })
    })
  })

  it('저장하면 그렇게 말하고 버튼이 다시 잠긴다', async () => {
    server.use(http.patch(url('/me'), () => HttpResponse.json({ ...fx.me, name: '홍길순' })))
    await open()
    await screen.findByDisplayValue('홍길동')

    await userEvent.clear(nameBox())
    await userEvent.type(nameBox(), '홍길순')
    await userEvent.click(save())

    expect(await screen.findByRole('status')).toHaveTextContent('저장되었습니다')
    expect(save()).toBeDisabled()
  })

  it('⚠️ 400 이면 어느 항목이 틀렸는지 짚어준다', async () => {
    server.use(
      http.patch(url('/me'), () =>
        HttpResponse.json(
          {
            ...fx.problem({
              status: 400,
              code: 'VALIDATION_FAILED',
              title: '입력값이 올바르지 않습니다',
            }),
            errors: [{ field: 'phone', message: '형식이 올바르지 않습니다' }],
          },
          { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    await open()
    await screen.findByDisplayValue('홍길동')

    await userEvent.clear(nameBox())
    await userEvent.type(nameBox(), '홍길순')
    await userEvent.click(save())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('phone — 형식이 올바르지 않습니다')
  })

  it('⚠️ 저장 뒤에는 서버가 준 값이 화면 값이 된다', async () => {
    // 서버가 값을 다듬어 돌려주는 경우다. 입력 상태를 계속 붙잡고 있으면
    // 화면은 내가 친 값을, 서버는 다듬은 값을 들고 갈라진다
    server.use(
      http.patch(url('/me'), () => HttpResponse.json({ ...fx.me, phone: '010-1111-2222' })),
    )
    await open()
    await screen.findByDisplayValue('홍길동')

    await userEvent.clear(screen.getByLabelText('연락처'))
    await userEvent.type(screen.getByLabelText('연락처'), '01011112222')
    await userEvent.click(save())

    expect(await screen.findByDisplayValue('010-1111-2222')).toBeInTheDocument()
  })
})
