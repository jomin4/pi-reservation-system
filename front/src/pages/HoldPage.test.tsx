import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { setupServer } from 'msw/node'
import { clearTokens, setTokens } from '../auth'
import { handlers } from '../mocks/handlers'
import { setScenario } from '../mocks/scenario'
import { installFakeEventSource } from '../test/fake-event-source'
import { renderAt } from '../test/render'
import { resetSkew } from '../time'
import { HoldPage } from './HoldPage'
import { ExpiredDialog } from './holds/ExpiredDialog'

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
  resetSkew()
  installFakeEventSource()
  setTokens({ accessToken: 'a', refreshToken: 'r', accessExpiresAt: '2026-09-04T05:27:33Z' })
})

const location = () => screen.getByTestId('location').textContent

async function open() {
  renderAt(<HoldPage />, '/holds/h_8f3a21', '/holds/:holdId')
  await screen.findByRole('heading', { name: '선점한 좌석' })
}

describe('W-04 선점 완료 · 승객 정보', () => {
  it('남은 시간을 보여준다 — expiresAt 에서 역산한다', async () => {
    await open()
    // 목이 지금부터 10분을 준다. 정확도는 useCountdown.test 가 가짜 타이머로 본다
    expect(screen.getByText(/^(09|10):\d{2}$/)).toBeInTheDocument()
  })

  it('선점한 좌석과 합계를 보여준다', async () => {
    await open()
    expect(screen.getByText('4호차 7A')).toBeInTheDocument()
    expect(screen.getByText('4호차 7B')).toBeInTheDocument()
    expect(screen.getByText('119,600원')).toBeInTheDocument()
  })

  it('예매자 정보를 회원 정보에서 채운다', async () => {
    await open()
    expect(await screen.findByText('홍길동')).toBeInTheDocument()
    expect(screen.getByText('010-0000-0000')).toBeInTheDocument()
    expect(screen.getByText(/자동으로 채워집니다/)).toBeInTheDocument()
  })

  it('결제로 갈 수 있다', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: '결제하기' }))
    await waitFor(() => {
      expect(location()).toBe('/holds/h_8f3a21/payment')
    })
  })
})

describe('⚠️ 선점 취소 — 만료를 기다리지 않고 즉시 반환한다', () => {
  it('취소하면 좌석 선택으로 돌아간다', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: '선점 취소' }))

    await waitFor(() => {
      expect(location()).toBe('/trips/101/seats')
    })
  })

  it('⚠️ 취소가 실패해도 좌석 선택으로 보낸다 — 이미 끝난 선점도 204 다', async () => {
    await open()
    setScenario('not-owned')
    await userEvent.click(screen.getByRole('button', { name: '선점 취소' }))

    await waitFor(() => {
      expect(location()).toBe('/trips/101/seats')
    })
  })
})

describe('E-02 선점 만료 — 클라이언트가 단정하지 않는다', () => {
  it('⚠️ 410 을 받은 뒤에야 모달이 뜬다', async () => {
    setScenario('hold-expired')
    renderAt(<HoldPage />, '/holds/h_8f3a21', '/holds/:holdId')

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('선점 시간이 만료되었습니다')).toBeInTheDocument()
  })

  it('⚠️ "결제는 진행되지 않았습니다" 를 명시한다 — 돈이 걸린 화면에서 침묵은 불안이다', async () => {
    setScenario('hold-expired')
    renderAt(<HoldPage />, '/holds/h_8f3a21', '/holds/:holdId')

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('결제는 진행되지 않았습니다.')).toBeInTheDocument()
  })

  it('반환된 좌석을 짚어준다 — 선점 정보를 들고 있을 때', () => {
    renderAt(
      <ExpiredDialog
        tripId={101}
        seats={[
          { carNo: 4, rowNo: 7, colLetter: 'A' },
          { carNo: 4, rowNo: 7, colLetter: 'B' },
        ]}
      />,
      '/holds/h_8f3a21',
    )
    expect(screen.getByText(/4호차 7A, 4호차 7B/)).toBeInTheDocument()
  })

  it('⚠️ 좌석 정보가 없어도 "결제는 진행되지 않았습니다" 는 말한다', () => {
    // 이 화면에 바로 들어온 경우(새로고침·북마크) 좌석 목록이 없다
    renderAt(<ExpiredDialog seats={[]} />, '/holds/h_8f3a21')
    expect(screen.getByText('결제는 진행되지 않았습니다.')).toBeInTheDocument()
  })

  it('⚠️ 좌석 다시 선택으로 가면 좌석맵을 새로 받는다 — 같은 좌석이 이미 남에게 갔을 수 있다', async () => {
    renderAt(<ExpiredDialog tripId={101} seats={[]} />, '/holds/h_8f3a21')
    await userEvent.click(screen.getByRole('button', { name: '좌석 다시 선택' }))

    await waitFor(() => {
      expect(location()).toBe('/trips/101/seats')
    })
  })

  it('홈으로도 갈 수 있다', async () => {
    setScenario('hold-expired')
    renderAt(<HoldPage />, '/holds/h_8f3a21', '/holds/:holdId')

    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: '홈으로' }))

    await waitFor(() => {
      expect(location()).toBe('/')
    })
  })

  it('⚠️ 아직 살아 있으면 모달을 안 띄운다', async () => {
    await open()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

describe('W-04 — 남의 선점', () => {
  it('403 이면 에러로 알린다', async () => {
    setScenario('not-owned')
    renderAt(<HoldPage />, '/holds/h_8f3a21', '/holds/:holdId')

    expect(await screen.findByRole('alert')).toHaveTextContent('접근 권한이 없습니다')
  })
})
