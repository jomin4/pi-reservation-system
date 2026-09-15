import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import { handlers } from '../mocks/handlers'
import { setScenario } from '../mocks/scenario'
import { renderAt } from '../test/render'
import { TripsPage } from './TripsPage'

const server = setupServer(...handlers)
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  setScenario('happy')
})
afterAll(() => server.close())

const QUERY = '/trips?from=SEO&to=BSN&date=2026-09-20&passengers=2'
const location = () => screen.getByTestId('location').textContent

async function open(path = QUERY) {
  renderAt(<TripsPage />, path)
  await screen.findByRole('table')
}

describe('W-02 운행 목록', () => {
  it('조회 조건을 머리에 보여준다', async () => {
    await open()
    expect(screen.getByRole('heading')).toHaveTextContent('서울 → 부산')
    expect(screen.getByText(/2026-09-20 · 2명/)).toBeInTheDocument()
  })

  it('운행을 KST 시각으로 보여준다 — 서버는 UTC 만 보낸다', async () => {
    await open()
    const row = screen.getByText('KTX 101').closest('tr')!
    // 2026-09-20T00:00:00Z = KST 09:00
    expect(within(row).getByText('09:00')).toBeInTheDocument()
    expect(within(row).getByText('2시간 40분')).toBeInTheDocument()
  })

  it('선택하면 좌석 선택으로 간다', async () => {
    await open()
    const row = screen.getByText('KTX 101').closest('tr')!
    await userEvent.click(within(row).getByRole('button', { name: '선택' }))

    await waitFor(() => {
      expect(location()).toBe('/trips/101/seats')
    })
  })

  it('⚠️ 매진 행을 지우지 않는다 — 취소분이 돌아올 수 있다', async () => {
    await open()
    const row = screen.getByText('KTX 105').closest('tr')!
    expect(within(row).getByText('매진')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: '선택' })).toBeDisabled()
  })

  it('⚠️ 잔여석이 근사값이라고 알린다', async () => {
    await open()
    expect(screen.getByText(/잔여석은 근사값/)).toBeInTheDocument()
  })

  it('다음날로 옮기면 date 만 바뀐다', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: '다음날 ▶' }))

    await waitFor(() => {
      expect(location()).toContain('date=2026-09-21')
    })
    expect(location()).toContain('from=SEO')
  })

  it('이전날로도 간다', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: '◀ 이전날' }))
    await waitFor(() => {
      expect(location()).toContain('date=2026-09-19')
    })
  })
})

describe('W-02 — 정상이 아닌 경우', () => {
  it('조회 조건이 없으면 안내한다', () => {
    renderAt(<TripsPage />, '/trips')
    expect(screen.getByText(/조회 조건이 없습니다/)).toBeInTheDocument()
  })

  it('영업일 형식이 아니면 조건으로 안 본다', () => {
    renderAt(<TripsPage />, '/trips?from=SEO&to=BSN&date=2026-09-20T00:00:00Z')
    expect(screen.getByText(/조회 조건이 없습니다/)).toBeInTheDocument()
  })

  it('불러오는 동안 로딩을 보여준다', () => {
    renderAt(<TripsPage />, QUERY)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('실패하면 다시 시도할 수 있다', async () => {
    setScenario('server-error')
    renderAt(<TripsPage />, QUERY)

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })
})
