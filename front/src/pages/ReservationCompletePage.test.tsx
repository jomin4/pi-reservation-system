import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import { clearTokens, setTokens } from '../auth'
import { handlers } from '../mocks/handlers'
import { setScenario } from '../mocks/scenario'
import { FakeEventSource, installFakeEventSource } from '../test/fake-event-source'
import { renderAt } from '../test/render'
import { ReservationCompletePage } from './ReservationCompletePage'

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

const location = () => screen.getByTestId('location').textContent

async function open() {
  renderAt(
    <ReservationCompletePage />,
    '/reservations/48207315/complete',
    '/reservations/:reservationNo/complete',
  )
  await screen.findByRole('heading', { name: '예약이 확정되었습니다' })
}

describe('W-06 예약 완료', () => {
  it('⚠️ 예약번호를 4-4 로 끊어 크게 보여준다 — 작게 쓰면 옮겨 적다 틀린다', async () => {
    await open()
    expect(screen.getByText('4820 7315')).toBeInTheDocument()
  })

  it('열차 · 일시 · 좌석 · 결제를 요약한다', async () => {
    await open()
    expect(screen.getByText(/KTX 101/)).toBeInTheDocument()
    expect(screen.getByText('4호차 7A, 4호차 7B')).toBeInTheDocument()
    expect(screen.getByText(/119,600원/)).toBeInTheDocument()
  })

  it('예약 목록과 홈으로 나갈 수 있다', async () => {
    await open()
    await userEvent.click(screen.getByRole('link', { name: '예약 목록으로' }))
    await waitFor(() => {
      expect(location()).toBe('/reservations')
    })
  })

  it('⚠️ 이 화면은 SSE 를 열지 않는다 — 예매를 마친 연결이 남으면 연결 수가 샌다', async () => {
    installFakeEventSource()
    await open()
    expect(FakeEventSource.instances).toHaveLength(0)
  })

  it('없는 예약번호면 에러로 알린다', async () => {
    setScenario('not-found')
    renderAt(
      <ReservationCompletePage />,
      '/reservations/99999999/complete',
      '/reservations/:reservationNo/complete',
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('예약을 찾을 수 없습니다')
  })
})
