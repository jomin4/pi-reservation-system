import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'
import { clearTokens, setTokens } from '../auth'
import * as fx from '../mocks/fixtures'
import { handlers } from '../mocks/handlers'
import { setScenario } from '../mocks/scenario'
import { renderAt } from '../test/render'
import { ReservationsPage } from './ReservationsPage'

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
const location = () => screen.getByTestId('location').textContent

async function open() {
  renderAt(<ReservationsPage />, '/reservations')
  await screen.findByRole('heading', { name: '예약 내역' })
}

describe('W-09 예약 목록', () => {
  it('예약번호 · 열차 · 좌석을 한 줄로 보여준다', async () => {
    await open()
    expect(await screen.findByText('4820 7315')).toBeInTheDocument()
    expect(screen.getByText('KTX 101')).toBeInTheDocument()
    expect(screen.getByText('4호차 7A, 4호차 7B')).toBeInTheDocument()
  })

  it('⚠️ 취소·완료된 예약도 남는다 — F-14 는 삭제가 아니라 전이다', async () => {
    server.use(
      http.get(url('/reservations'), () =>
        HttpResponse.json({
          ...fx.reservationPage,
          content: [
            { ...fx.reservationPage.content[0]!, status: 'CANCELLED' as const },
            fx.reservationPage.content[1]!,
          ],
        }),
      ),
    )
    await open()

    expect(await screen.findByText('CANCELLED')).toBeInTheDocument()
    expect(screen.getByText('COMPLETED')).toBeInTheDocument()
  })

  it('⚠️ 상태는 서버가 준 문자열 그대로다 — COMPLETED 를 직접 계산하지 않는다', async () => {
    await open()
    // 출발이 지난 예약인지 화면이 판정하지 않는다. 서버가 파생해 보낸 값을 표시만 한다
    expect(await screen.findByText('COMPLETED')).toBeInTheDocument()
  })

  it('상세로 갈 수 있다', async () => {
    await open()
    const rows = await screen.findAllByRole('link', { name: '상세' })
    await userEvent.click(rows[0]!)

    await waitFor(() => {
      expect(location()).toBe('/reservations/48207315')
    })
  })

  it('예약이 없으면 그렇게 말한다', async () => {
    server.use(
      http.get(url('/reservations'), () =>
        HttpResponse.json({ page: 0, size: 20, totalElements: 0, totalPages: 0, content: [] }),
      ),
    )
    await open()
    expect(screen.getByText('아직 예약이 없습니다.')).toBeInTheDocument()
  })
})

describe('페이지네이션', () => {
  const page = (n: number) =>
    HttpResponse.json({
      page: n,
      size: 20,
      totalElements: 45,
      totalPages: 3,
      content: [
        {
          ...fx.reservationPage.content[0]!,
          reservationNo: `4820731${n}`,
        },
      ],
    })

  it('한 페이지뿐이면 이동 버튼을 안 그린다', async () => {
    await open()
    expect(screen.queryByRole('button', { name: '다음' })).not.toBeInTheDocument()
  })

  it('⚠️ 0-based 페이지를 1-based 로 바꿔 보여준다', async () => {
    server.use(http.get(url('/reservations'), () => page(0)))
    await open()
    expect(await screen.findByText('1 / 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled()
  })

  it('다음 페이지를 부른다', async () => {
    const asked: string[] = []
    server.use(
      http.get(url('/reservations'), ({ request }) => {
        const n = Number(new URL(request.url).searchParams.get('page') ?? 0)
        asked.push(String(n))
        return page(n)
      }),
    )
    await open()
    await screen.findByText('1 / 3')
    await userEvent.click(screen.getByRole('button', { name: '다음' }))

    await waitFor(() => expect(screen.getByText('2 / 3')).toBeInTheDocument())
    expect(asked).toEqual(['0', '1'])
  })

  it('마지막 페이지에서는 다음이 잠긴다', async () => {
    server.use(http.get(url('/reservations'), () => page(2)))
    await open()
    await screen.findByText('3 / 3')
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled()
  })
})

describe('⚠️ 진행 중 선점은 여기 없다 — 선점은 예약이 아니다', () => {
  it('목록에 선점 행이 섞이지 않는다', async () => {
    await open()
    const table = await screen.findByRole('table')
    // 계약이 `ReservationSummary` 만 준다. 화면이 선점을 끼워 넣을 여지가 없다
    expect(within(table).getAllByRole('row')).toHaveLength(3) // 헤더 + 2건
  })
})
