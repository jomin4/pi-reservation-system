import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { clearTokens, setTokens } from '../auth'
import { handlers } from '../mocks/handlers'
import * as fx from '../mocks/fixtures'
import { setScenario } from '../mocks/scenario'
import { renderAt } from '../test/render'
import { resetSkew } from '../time'
import { PaymentPage } from './PaymentPage'
import { MAX_POLLS } from './payment/usePaymentPolling'

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

async function open() {
  renderAt(<PaymentPage />, '/holds/h_8f3a21/payment', '/holds/:holdId/payment')
  await screen.findByRole('heading', { name: '결제 내역' })
}

/** ⚠️ `Retry-After: 0` — 폴링 간격이 서버에서 온다는 사실 덕분에 테스트가 빨라진다 */
const pending = () =>
  HttpResponse.json(
    { ...fx.problem({ status: 202, code: 'PAYMENT_PENDING', title: '확인 중' }) },
    {
      status: 202,
      headers: { 'Content-Type': 'application/problem+json', 'Retry-After': '0' },
    },
  )

describe('W-05 결제', () => {
  it('좌석 · 금액 · 수단을 보여준다', async () => {
    await open()
    expect(screen.getByText('4호차 7A, 4호차 7B')).toBeInTheDocument()
    expect(await screen.findByText('119,600원')).toBeInTheDocument()
    expect(screen.getByText('토스페이먼츠 — 카드')).toBeInTheDocument()
  })

  it('⚠️ 남은 시간은 expiresAt 에서 역산한다 — 결제 화면에서도 선점은 계속 녹는다', async () => {
    await open()
    expect(screen.getByText(/^(09|10):\d{2}$/)).toBeInTheDocument()
  })

  it('결제에 성공하면 예약 완료로 간다', async () => {
    await open()
    await userEvent.click(await screen.findByRole('button', { name: /결제하기$/ }))

    await waitFor(() => {
      expect(location()).toBe('/reservations/48207315/complete')
    })
  })
})

describe('⚠️ F-10 Idempotency-Key — 화면 진입 시 1회 생성, 재시도에도 같은 값', () => {
  it('헤더로 보낸다', async () => {
    const keys: (string | null)[] = []
    server.use(
      http.post(url('/holds/:holdId/payment'), ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'))
        return HttpResponse.json(fx.reservation, { status: 201 })
      }),
    )

    await open()
    await userEvent.click(await screen.findByRole('button', { name: /결제하기$/ }))

    await waitFor(() => expect(keys).toHaveLength(1))
    expect(keys[0]).toMatch(/.+/)
  })

  it('⚠️ 거절 후 다시 눌러도 같은 키다 — 버튼마다 새로 만들면 멱등성이 무의미하다', async () => {
    const keys: (string | null)[] = []
    let n = 0
    server.use(
      http.post(url('/holds/:holdId/payment'), ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key'))
        n += 1
        if (n === 1)
          return HttpResponse.json(
            fx.problem({ status: 402, code: 'PAYMENT_DECLINED', title: '거절' }),
            { status: 402, headers: { 'Content-Type': 'application/problem+json' } },
          )
        return HttpResponse.json(fx.reservation, { status: 201 })
      }),
    )

    await open()
    const pay = await screen.findByRole('button', { name: /결제하기$/ })
    await userEvent.click(pay)
    await screen.findByRole('alert')
    await userEvent.click(screen.getByRole('button', { name: /결제하기$/ }))

    await waitFor(() => expect(keys).toHaveLength(2))
    expect(keys[0]).toBe(keys[1])
  })
})

describe('⚠️ 결제 거절 — 이 화면에 머문다 (전이 PM-3)', () => {
  it('거절을 알리고 선점이 유지된다고 말한다', async () => {
    setScenario('payment-declined')
    await open()
    await userEvent.click(await screen.findByRole('button', { name: /결제하기$/ }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('결제가 거절되었습니다')
    expect(alert).toHaveTextContent('선점은 유지되고 있어 좌석은 그대로입니다')
  })

  it('⚠️ 좌석 선택으로 되돌리지 않는다 — 좌석을 잃었다고 오해하게 만든다', async () => {
    setScenario('payment-declined')
    await open()
    await userEvent.click(await screen.findByRole('button', { name: /결제하기$/ }))
    await screen.findByRole('alert')

    expect(location()).toBe('/holds/h_8f3a21/payment')
  })
})

describe('E-03 결제 타임아웃 — 승인인지 실패인지 모르는 구간', () => {
  it('202 를 받으면 확인 중 모달이 뜬다', async () => {
    server.use(
      http.post(url('/holds/:holdId/payment'), () => pending()),
      http.get(url('/holds/:holdId/payment'), () => pending()),
    )

    await open()
    await userEvent.click(await screen.findByRole('button', { name: /결제하기$/ }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('결제 결과를 확인하고 있습니다')).toBeInTheDocument()
    expect(within(dialog).getByText('이 창을 닫거나 다시 결제하지 마세요.')).toBeInTheDocument()
  })

  it('⚠️ "다시 결제" 는 잠겨 있다 — 이중 결제의 가장 흔한 원인이다', async () => {
    server.use(
      http.post(url('/holds/:holdId/payment'), () => pending()),
      http.get(url('/holds/:holdId/payment'), () => pending()),
    )

    await open()
    await userEvent.click(await screen.findByRole('button', { name: /결제하기$/ }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByRole('button', { name: '다시 결제' })).toBeDisabled()
  })

  it('⚠️ 폴링은 GET 이다 — POST 는 끝까지 1회뿐이다', async () => {
    let posts = 0
    let gets = 0
    server.use(
      http.post(url('/holds/:holdId/payment'), () => {
        posts += 1
        return pending()
      }),
      http.get(url('/holds/:holdId/payment'), () => {
        gets += 1
        return gets < 3 ? pending() : HttpResponse.json(fx.reservation)
      }),
    )

    await open()
    await userEvent.click(await screen.findByRole('button', { name: /결제하기$/ }))

    await waitFor(() => {
      expect(location()).toBe('/reservations/48207315/complete')
    })
    expect(posts).toBe(1)
    expect(gets).toBeGreaterThan(1)
  })

  it('폴링이 승인을 확인하면 예약 완료로 간다', async () => {
    let gets = 0
    server.use(
      http.post(url('/holds/:holdId/payment'), () => pending()),
      http.get(url('/holds/:holdId/payment'), () => {
        gets += 1
        return gets < 2 ? pending() : HttpResponse.json(fx.reservation)
      }),
    )

    await open()
    await userEvent.click(await screen.findByRole('button', { name: /결제하기$/ }))

    await waitFor(() => {
      expect(location()).toBe('/reservations/48207315/complete')
    })
  })

  it('⚠️ 폴링 중 410 이면 만료로 넘긴다 — 결제는 진행되지 않았다', async () => {
    server.use(
      http.post(url('/holds/:holdId/payment'), () => pending()),
      http.get(url('/holds/:holdId/payment'), () =>
        HttpResponse.json(
          fx.problem({ status: 410, code: 'HOLD_EXPIRED', title: '선점 시간이 만료되었습니다' }),
          { status: 410, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )

    await open()
    await userEvent.click(await screen.findByRole('button', { name: /결제하기$/ }))

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('결제는 진행되지 않았습니다.')).toBeInTheDocument()
  })

  it('⚠️ 상한에 닿으면 멈추고 예약 목록으로 뺀다 — 무한 폴링은 서버를 때린다', async () => {
    let gets = 0
    server.use(
      http.post(url('/holds/:holdId/payment'), () => pending()),
      http.get(url('/holds/:holdId/payment'), () => {
        gets += 1
        return pending()
      }),
    )

    await open()
    await userEvent.click(await screen.findByRole('button', { name: /결제하기$/ }))

    const dialog = await screen.findByRole('alertdialog')
    // ⚠️ 버튼 라벨에도 「예약 목록에서 확인」 이 있다. 포기 문구로 확인한다
    await within(dialog).findByText(/결과 확인이 오래 걸리고 있습니다/, undefined, {
      timeout: 5000,
    })
    // 상한을 넘겨 계속 두드리지 않는다
    expect(gets).toBe(MAX_POLLS)
  })

  it('예약 목록으로 빠져나갈 수 있다', async () => {
    server.use(
      http.post(url('/holds/:holdId/payment'), () => pending()),
      http.get(url('/holds/:holdId/payment'), () => pending()),
    )

    await open()
    await userEvent.click(await screen.findByRole('button', { name: /결제하기$/ }))

    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(
      within(dialog).getByRole('button', { name: '예약 목록에서 확인' }),
    )
    await waitFor(() => {
      expect(location()).toBe('/reservations')
    })
  })
})

describe('W-05 — 선점이 이미 만료된 채로 들어온 경우', () => {
  it('410 이면 결제 화면 대신 만료 모달이다', async () => {
    setScenario('hold-expired')
    renderAt(<PaymentPage />, '/holds/h_8f3a21/payment', '/holds/:holdId/payment')

    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText('선점 시간이 만료되었습니다')).toBeInTheDocument()
  })
})
