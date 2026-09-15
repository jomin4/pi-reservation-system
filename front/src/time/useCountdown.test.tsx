import { act, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { getSkewMs, recordServerTiming, resetSkew, serverNow } from './clock-skew'
import { toInstant } from './instant'
import { formatRemaining, useCountdown } from './useCountdown'

const EXPIRES = toInstant('2026-09-04T05:22:33Z')
const EXPIRES_MS = Date.parse(EXPIRES)

beforeEach(() => {
  resetSkew()
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

function Probe({ expiresAt }: { expiresAt: Parameters<typeof useCountdown>[0] }) {
  const c = useCountdown(expiresAt)
  return (
    <div>
      <span data-testid="text">{c.text}</span>
      <span data-testid="expired">{String(c.expired)}</span>
    </div>
  )
}

const text = () => screen.getByTestId('text').textContent
const expired = () => screen.getByTestId('expired').textContent

describe('formatRemaining', () => {
  it.each([
    [0, '00:00'],
    [1_000, '00:01'],
    [59_000, '00:59'],
    [598_000, '09:58'],
    [600_000, '10:00'],
    [3_723_000, '1:02:03'],
    [-5_000, '00:00'],
  ])('%i ms → %s', (ms, out) => {
    expect(formatRemaining(ms)).toBe(out)
  })
})

describe('카운트다운', () => {
  it('남은 시간을 보여준다', () => {
    vi.setSystemTime(EXPIRES_MS - 598_000)
    render(<Probe expiresAt={EXPIRES} />)
    expect(text()).toBe('09:58')
    expect(expired()).toBe('false')
  })

  it('1초마다 줄어든다', () => {
    vi.setSystemTime(EXPIRES_MS - 600_000)
    render(<Probe expiresAt={EXPIRES} />)
    expect(text()).toBe('10:00')

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(text()).toBe('09:59')
  })

  it('지나면 00:00 에서 멈추고 expired 가 된다', () => {
    vi.setSystemTime(EXPIRES_MS + 5_000)
    render(<Probe expiresAt={EXPIRES} />)
    expect(text()).toBe('00:00')
    expect(expired()).toBe('true')
  })

  it('expiresAt 이 없으면 만료로 본다', () => {
    render(<Probe expiresAt={null} />)
    expect(expired()).toBe('true')
  })
})

describe('⚠️ 인터벌을 세지 않는다 — 백그라운드에서 멈추면 안 된다', () => {
  it('틱이 통째로 밀려도 값은 절대 시각에서 나온다', () => {
    vi.setSystemTime(EXPIRES_MS - 600_000)
    render(<Probe expiresAt={EXPIRES} />)
    expect(text()).toBe('10:00')

    // 탭이 백그라운드로 가서 5분간 틱이 한 번도 안 돌았다고 치고,
    // 시계만 밀어 본 뒤 틱 하나만 준다.
    // ⚠️ advanceTimersByTime 이 시계도 1초 민다 — 틱이 정확히 -300초에 떨어지게 맞춘다
    act(() => {
      vi.setSystemTime(EXPIRES_MS - 301_000)
      vi.advanceTimersByTime(1000)
    })

    // 인터벌을 셌다면 09:59 여야 한다. 절대 시각에서 계산하므로 05:00 이다
    expect(text()).toBe('05:00')
  })

  it('탭이 돌아오면 다음 틱을 안 기다리고 즉시 고친다', () => {
    vi.setSystemTime(EXPIRES_MS - 600_000)
    render(<Probe expiresAt={EXPIRES} />)

    act(() => {
      vi.setSystemTime(EXPIRES_MS - 60_000)
      document.dispatchEvent(new Event('visibilitychange'))
    })

    // 타이머를 전혀 안 돌렸는데도 맞는 값이다
    expect(text()).toBe('01:00')
  })
})

describe('⚠️ 시계 오차 보정 — 서버가 두 값을 주는 이유 (api.md §5.2)', () => {
  it('클라 시계가 앞서 있으면 그만큼 되돌린다', () => {
    // 서버 기준 600초 남았는데, 클라 시계는 60초 앞서 있다
    const clientNow = EXPIRES_MS - 600_000 + 60_000
    recordServerTiming(EXPIRES, 600, clientNow)

    expect(getSkewMs()).toBe(60_000)
    expect(serverNow(clientNow)).toBe(EXPIRES_MS - 600_000)

    vi.setSystemTime(clientNow)
    render(<Probe expiresAt={EXPIRES} />)
    // 보정이 없으면 09:00 으로 보인다 — 1분을 손해 본다
    expect(text()).toBe('10:00')
  })

  it('클라 시계가 뒤처져 있으면 반대로 잡는다', () => {
    const clientNow = EXPIRES_MS - 600_000 - 30_000
    recordServerTiming(EXPIRES, 600, clientNow)

    expect(getSkewMs()).toBe(-30_000)

    vi.setSystemTime(clientNow)
    render(<Probe expiresAt={EXPIRES} />)
    // 보정이 없으면 10:30 — 있지도 않은 시간을 보여준다
    expect(text()).toBe('10:00')
  })

  it('오차가 없으면 아무것도 안 바꾼다', () => {
    const clientNow = EXPIRES_MS - 600_000
    recordServerTiming(EXPIRES, 600, clientNow)
    expect(getSkewMs()).toBe(0)
  })

  it('이상한 remainingSeconds 는 무시한다', () => {
    recordServerTiming(EXPIRES, Number.NaN, EXPIRES_MS)
    expect(getSkewMs()).toBe(0)
  })
})
