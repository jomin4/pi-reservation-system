import { render, screen } from '@testing-library/react'
import { App } from './App.tsx'

// 스캐폴드가 실제로 렌더되는지만 본다. 화면 테스트는 각 W-xx 이슈에서.
describe('App', () => {
  it('제목을 렌더한다', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: '좌석 예매' })).toBeInTheDocument()
  })
})
