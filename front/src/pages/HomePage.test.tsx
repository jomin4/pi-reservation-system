import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import { handlers } from '../mocks/handlers'
import { setScenario } from '../mocks/scenario'
import { renderAt } from '../test/render'
import { HomePage } from './HomePage'

const server = setupServer(...handlers)
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  setScenario('happy')
})
afterAll(() => server.close())

const location = () => screen.getByTestId('location').textContent

async function open() {
  renderAt(<HomePage />)
  await screen.findByRole('button', { name: '열차 조회' })
}

describe('W-01 홈 · 열차 조회', () => {
  it('역 목록을 불러오는 동안 로딩을 보여준다', () => {
    renderAt(<HomePage />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('역 4개가 선택지에 온다 — F-01', async () => {
    await open()
    expect(screen.getAllByRole('option', { name: '서울' })).toHaveLength(2)
    expect(screen.getAllByRole('option', { name: '부산' })).toHaveLength(2)
  })

  it('인원은 최대 6명이다 — 좌석 선점 상한에서 역산한 값', async () => {
    await open()
    expect(screen.getByRole('option', { name: '6명' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '7명' })).not.toBeInTheDocument()
  })

  it('역을 안 고르면 조회 버튼이 눌리지 않는다', async () => {
    await open()
    expect(screen.getByRole('button', { name: '열차 조회' })).toBeDisabled()
  })

  it('⚠️ 출발역 = 도착역이면 막는다 — 서버가 400 을 주기 전에', async () => {
    await open()
    const [from, to] = screen.getAllByRole('combobox')
    await userEvent.selectOptions(from!, 'SEO')
    await userEvent.selectOptions(to!, 'SEO')

    expect(screen.getByRole('alert')).toHaveTextContent('출발역과 도착역이 같습니다')
    expect(screen.getByRole('button', { name: '열차 조회' })).toBeDisabled()
  })

  it('조회하면 조건을 쿼리스트링에 담아 운행 목록으로 간다', async () => {
    await open()
    const [from, to] = screen.getAllByRole('combobox')
    await userEvent.selectOptions(from!, 'SEO')
    await userEvent.selectOptions(to!, 'BSN')
    await userEvent.click(screen.getByRole('button', { name: '열차 조회' }))

    await waitFor(() => {
      expect(location()).toContain('/trips?')
    })
    expect(location()).toContain('from=SEO')
    expect(location()).toContain('to=BSN')
    expect(location()).toContain('passengers=1')
  })

  it('비로그인도 조회할 수 있다고 알린다', async () => {
    await open()
    expect(screen.getByText(/로그인 없이/)).toBeInTheDocument()
  })

  it('⚠️ 실패하면 requestId 를 보여준다 — 문의할 때 유일한 단서다', async () => {
    setScenario('server-error')
    renderAt(<HomePage />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('일시적인 오류가 발생했습니다')
    expect(alert).toHaveTextContent('요청번호')
  })
})
