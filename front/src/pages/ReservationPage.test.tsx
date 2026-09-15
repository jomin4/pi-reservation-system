import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { clearTokens, setTokens } from '../auth'
import * as fx from '../mocks/fixtures'
import { handlers } from '../mocks/handlers'
import { setScenario } from '../mocks/scenario'
import { renderAt } from '../test/render'
import { resetSkew } from '../time'
import { ReservationPage } from './ReservationPage'

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
  setTokens({ accessToken: 'a', refreshToken: 'r', accessExpiresAt: '2026-09-04T05:27:33Z' })
})

const url = (path: string) => `*/api/v1${path}`
const location = () => screen.getByTestId('location').textContent

async function open(no = '48207315') {
  renderAt(<ReservationPage />, `/reservations/${no}`, '/reservations/:reservationNo')
  await screen.findByRole('heading', { name: /\d{4} \d{4}/ })
}

async function cancelIt() {
  await userEvent.click(screen.getByRole('button', { name: '예약 취소' }))
  const dialog = await screen.findByRole('alertdialog')
  await userEvent.click(within(dialog).getByRole('button', { name: '예약 취소' }))
}

describe('W-10 예약 상세', () => {
  it('예약 · 결제 정보를 한 번에 보여준다 — 목록을 거치지 않고 열릴 수 있다', async () => {
    await open()
    expect(screen.getByText(/KTX 101 · 서울 → 부산/)).toBeInTheDocument()
    expect(screen.getByText('4호차 7A, 4호차 7B')).toBeInTheDocument()
    expect(screen.getByText(/홍길동 · 010-0000-0000/)).toBeInTheDocument()
    expect(screen.getByText('119,600원')).toBeInTheDocument()
  })

  it('목록으로 돌아갈 수 있다', async () => {
    await open()
    await userEvent.click(screen.getByRole('link', { name: '목록으로' }))
    await waitFor(() => {
      expect(location()).toBe('/reservations')
    })
  })

  it('남의 예약이면 403 을 알린다 — 예약번호는 열쇠가 아니다', async () => {
    setScenario('not-owned')
    renderAt(<ReservationPage />, '/reservations/48207315', '/reservations/:reservationNo')
    expect(await screen.findByRole('alert')).toHaveTextContent('접근 권한이 없습니다')
  })
})

describe('⚠️ 취소 — 되돌릴 수 없어서 한 겹 더 묻는다', () => {
  it('바로 취소하지 않고 확인을 받는다', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: '예약 취소' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/되돌릴 수 없습니다/)).toBeInTheDocument()
  })

  it('⚠️ 모달이 환불을 얼버무리지 않는다 — P0 은 좌석만 돌아간다', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: '예약 취소' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(/별도/)).toBeInTheDocument()
  })

  it('돌아가기를 누르면 아무 일도 없다', async () => {
    let called = 0
    server.use(
      http.post(url('/reservations/:reservationNo/cancel'), () => {
        called += 1
        return HttpResponse.json(fx.reservation)
      }),
    )
    await open()
    await userEvent.click(screen.getByRole('button', { name: '예약 취소' }))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: '돌아가기' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(called).toBe(0)
  })

  it('취소하면 상태가 CANCELLED 로 바뀌고 좌석 반환을 알린다', async () => {
    await open()
    await cancelIt()

    expect(await screen.findByText('CANCELLED')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('좌석이 반환되었습니다')
    expect(screen.getByRole('status')).toHaveTextContent('환불은 별도 처리됩니다')
  })

  it('⚠️ DELETE 가 아니라 POST /cancel 이다 — 예약은 지워지지 않는다', async () => {
    const methods: string[] = []
    server.use(
      http.post(url('/reservations/:reservationNo/cancel'), ({ request }) => {
        methods.push(request.method)
        return HttpResponse.json({ ...fx.reservation, status: 'CANCELLED' as const })
      }),
    )
    await open()
    await cancelIt()

    await waitFor(() => expect(methods).toEqual(['POST']))
  })

  it('취소한 뒤에는 취소 버튼이 잠긴다', async () => {
    await open()
    await cancelIt()

    await screen.findByText('CANCELLED')
    expect(screen.getByRole('button', { name: '예약 취소' })).toBeDisabled()
  })
})

describe('⚠️ 출발한 예약 — 버튼 비활성은 안내이지 판정이 아니다', () => {
  it('이미 출발했으면 버튼이 잠기고 사유를 적는다', async () => {
    await open('48207316')
    expect(screen.getByRole('button', { name: '예약 취소' })).toBeDisabled()
    expect(screen.getByText('이미 출발한 열차는 취소할 수 없습니다.')).toBeInTheDocument()
  })

  it('⚠️ 서버가 409 로 막으면 그 사유를 그대로 보여준다 — 판정은 서버 몫이다', async () => {
    server.use(
      http.post(url('/reservations/:reservationNo/cancel'), () =>
        HttpResponse.json(
          fx.problem({
            status: 409,
            code: 'RESERVATION_NOT_CANCELLABLE',
            title: '취소할 수 없는 예약입니다',
            detail: '이미 출발한 열차입니다.',
          }),
          { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    await open()
    await cancelIt()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('취소할 수 없는 예약입니다')
    expect(alert).toHaveTextContent('이미 출발한 열차입니다.')
    // 모달 뒤에 숨지 않는다
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
