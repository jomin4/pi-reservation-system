import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import { clearTokens, setTokens } from '../auth'
import { handlers } from '../mocks/handlers'
import { setScenario } from '../mocks/scenario'
import { FakeEventSource, installFakeEventSource } from '../test/fake-event-source'
import { renderAt } from '../test/render'
import { SeatsPage } from './SeatsPage'

const server = setupServer(...handlers)
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  setScenario('happy')
})
afterAll(() => server.close())

const pair = {
  accessToken: 'acc_1',
  refreshToken: 'ref_1',
  accessExpiresAt: '2026-09-04T05:27:33Z',
}

beforeEach(() => {
  sessionStorage.clear()
  clearTokens()
  installFakeEventSource()
})

const location = () => screen.getByTestId('location').textContent
const counter = () => screen.getByText(/\d+ \/ 6/).textContent

async function open(loggedIn = false) {
  if (loggedIn) setTokens(pair)
  renderAt(<SeatsPage />, '/trips/101/seats', '/trips/:tripId/seats')
  await screen.findByRole('heading', { name: /좌석 선택/ })
}

/** 지금 호차의 첫 선택 가능 좌석 */
function firstAvailable(): HTMLElement {
  const all = screen.getAllByRole('button', { name: /선택 가능$/ })
  const seat = all[0]
  if (!seat) throw new Error('선택 가능한 좌석이 없다')
  return seat
}

describe('W-03 좌석 선택', () => {
  it('호차 탭과 격자를 보여준다', async () => {
    await open()
    expect(screen.getByRole('button', { name: '1호차' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '10호차' })).toBeInTheDocument()
  })

  it('좌석을 고르면 목록과 카운터에 반영된다', async () => {
    await open()
    expect(counter()).toBe('0 / 6')

    await userEvent.click(firstAvailable())
    expect(counter()).toBe('1 / 6')
  })

  it('다시 누르면 뺀다', async () => {
    await open()
    const seat = firstAvailable()
    await userEvent.click(seat)
    await userEvent.click(seat)
    expect(counter()).toBe('0 / 6')
  })

  it('⚠️ 다른 사람 선점과 판매 완료는 누를 수 없다', async () => {
    await open()
    const held = screen.getAllByRole('button', { name: /다른 사람이 선점 중$/ })
    const sold = screen.getAllByRole('button', { name: /판매 완료$/ })

    expect(held.length).toBeGreaterThan(0)
    expect(sold.length).toBeGreaterThan(0)
    expect(held[0]).toBeDisabled()
    expect(sold[0]).toBeDisabled()
  })

  it('⚠️ 6석을 넘으면 클릭이 무시된다', async () => {
    await open()
    const seats = screen.getAllByRole('button', { name: /선택 가능$/ }).slice(0, 8)
    for (const s of seats) await userEvent.click(s)

    expect(counter()).toBe('6 / 6')
  })

  it('선점 후 10분 안에 결제해야 한다고 알린다', async () => {
    await open()
    expect(screen.getByText(/10분/)).toBeInTheDocument()
    expect(screen.getByText(/전부 함께 잡히거나 전부 실패/)).toBeInTheDocument()
  })
})

describe('⚠️ SSE — 연결 상태를 항상 노출한다', () => {
  it('처음에는 재연결 중이다가 이벤트가 오면 연결됨이 된다', async () => {
    await open()
    expect(screen.getByRole('status')).toHaveTextContent('재연결 중')

    act(() => {
      FakeEventSource.latest().emit('heartbeat', { at: '2026-09-04T05:12:48Z' })
    })
    expect(screen.getByRole('status')).toHaveTextContent('실시간 연결됨')
  })

  it('좌석 변경이 격자에 반영된다 — 전체 재조회 없이', async () => {
    await open()
    const seat = firstAvailable()
    const label = seat.getAttribute('aria-label')!
    const [, carNo, rowCol] = /^(\d+)호차 (\d+[A-D])/.exec(label)!
    const rowNo = Number(rowCol!.slice(0, -1))
    const colLetter = rowCol!.slice(-1)

    act(() => {
      FakeEventSource.latest().emit('seat-changed', {
        tripId: 101,
        cause: 'HOLD_CREATED',
        seats: [{ carNo: Number(carNo), rowNo, colLetter, status: 'HELD' }],
      })
    })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: `${carNo}호차 ${rowCol} 다른 사람이 선점 중` }),
      ).toBeDisabled()
    })
  })
})

describe('⚠️ 선점 — 로그인 회원만', () => {
  it('비로그인이면 로그인으로 보내고 이 화면을 기억한다', async () => {
    await open(false)
    await userEvent.click(firstAvailable())
    await userEvent.click(screen.getByRole('button', { name: '좌석 선점하기' }))

    await waitFor(() => {
      expect(location()).toBe('/login')
    })
  })

  it('⚠️ 선택은 세션에 남는다 — 로그인하고 돌아왔을 때 다시 고르게 하면 안 된다', async () => {
    await open(false)
    await userEvent.click(firstAvailable())
    await userEvent.click(screen.getByRole('button', { name: '좌석 선점하기' }))

    await waitFor(() => {
      expect(sessionStorage.getItem('seats:selection:101')).toBeTruthy()
    })
  })

  it('로그인해 있으면 선점하고 선점 화면으로 간다', async () => {
    await open(true)
    await userEvent.click(firstAvailable())
    await userEvent.click(screen.getByRole('button', { name: '좌석 선점하기' }))

    await waitFor(() => {
      expect(location()).toBe('/holds/h_8f3a21')
    })
  })

  it('좌석을 안 고르면 선점할 수 없다', async () => {
    await open(true)
    expect(screen.getByRole('button', { name: '좌석 선점하기' })).toBeDisabled()
  })
})

describe('E-01 선점 충돌 — 409 가 두 종류다', () => {
  async function conflict(scenario: 'seat-conflict' | 'seat-lock-timeout') {
    await open(true)
    setScenario(scenario)
    await userEvent.click(firstAvailable())
    await userEvent.click(screen.getByRole('button', { name: '좌석 선점하기' }))
    return screen.findByRole('alertdialog')
  }

  it('SEAT_ALREADY_HELD 는 실패한 좌석을 짚어준다', async () => {
    const dialog = await conflict('seat-conflict')
    expect(within(dialog).getByText(/4호차 7B/)).toBeInTheDocument()
    expect(within(dialog).getByText(/다른 고객이 먼저 선택했습니다/)).toBeInTheDocument()
  })

  it('⚠️ ALL_OR_NOTHING 을 따로 말한다 — 7A 가 잡혔다고 착각하면 중복 선점이 된다', async () => {
    const dialog = await conflict('seat-conflict')
    expect(within(dialog).getByText(/함께 선택한/)).toBeInTheDocument()
    expect(within(dialog).getByText(/7A/)).toBeInTheDocument()
  })

  it('⚠️ 원자성을 명시한다 — 이 문구가 이 모달의 존재 이유다', async () => {
    const dialog = await conflict('seat-conflict')
    expect(within(dialog).getByText(/전부 함께 잡히거나 전부 실패/)).toBeInTheDocument()
    expect(within(dialog).getByText(/일부만 잡힌 상태로 남지 않습니다/)).toBeInTheDocument()
  })

  it('⚠️ SEAT_LOCK_TIMEOUT 은 문구가 다르다 — 다시 시도하면 될 수 있다', async () => {
    const dialog = await conflict('seat-lock-timeout')
    expect(within(dialog).getByText(/다시 시도하면 성공할 수 있습니다/)).toBeInTheDocument()
    expect(within(dialog).queryByText(/다른 고객이 먼저/)).not.toBeInTheDocument()
  })

  it('요청번호를 보여준다', async () => {
    const dialog = await conflict('seat-conflict')
    expect(within(dialog).getByText(/요청번호/)).toBeInTheDocument()
  })

  it('"다른 좌석 선택" 을 누르면 모달이 닫힌다', async () => {
    const dialog = await conflict('seat-conflict')
    await userEvent.click(within(dialog).getByRole('button', { name: '다른 좌석 선택' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('⚠️ 재시도는 연타가 막힌다 — 즉시 재시도는 거의 실패한다', async () => {
    const dialog = await conflict('seat-conflict')
    await userEvent.click(within(dialog).getByRole('button', { name: '같은 좌석 다시 시도' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '잠시 후 다시' })).toBeDisabled()
    })
  })
})
