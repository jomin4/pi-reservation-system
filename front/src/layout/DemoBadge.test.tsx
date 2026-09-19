import { render, screen } from '@testing-library/react'
import { DemoBadge } from './DemoBadge'

/**
 * ⚠️ `import.meta.env` 는 빌드 시점에 치환되는 값이라 `vi.stubEnv` 로 갈아끼운다.
 * 이 테스트가 지키는 것은 **`real` 로 바뀌면 배지가 저절로 사라진다**는 약속이다 —
 * 지우는 걸 잊을 수 있는 코드를 남기지 않으려고 조건을 환경변수 하나에 걸었다.
 */
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('데모 배지', () => {
  it('목 모드면 가짜 데이터라고 말한다', () => {
    vi.stubEnv('VITE_API_MODE', 'mock')
    render(<DemoBadge />)

    expect(screen.getByText(/데모 · 목 데이터/)).toBeInTheDocument()
    expect(screen.getByText(/실제 예약이 아닙니다/)).toBeInTheDocument()
  })

  it('⚠️ real 이면 사라진다 — 지우는 걸 잊을 코드를 남기지 않는다', () => {
    vi.stubEnv('VITE_API_MODE', 'real')
    const { container } = render(<DemoBadge />)

    expect(container).toBeEmptyDOMElement()
  })

  it('값이 없어도 뜨지 않는다 — 켜는 쪽이 명시적이어야 한다', () => {
    vi.stubEnv('VITE_API_MODE', '')
    const { container } = render(<DemoBadge />)

    expect(container).toBeEmptyDOMElement()
  })
})
