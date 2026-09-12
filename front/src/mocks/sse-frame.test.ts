import { sseFrame } from './sse-frame'

describe('sseFrame — api.md §6.2', () => {
  it('event 와 data 를 빈 줄로 끝낸다', () => {
    expect(sseFrame('heartbeat', {})).toBe('event: heartbeat\ndata: {}\n\n')
  })

  it('id 를 주면 맨 앞에 붙는다 — 브라우저가 이 값을 Last-Event-ID 로 되돌려준다', () => {
    expect(sseFrame('seat-changed', { carNo: 4 }, '1725426753000-7')).toBe(
      'id: 1725426753000-7\nevent: seat-changed\ndata: {"carNo":4}\n\n',
    )
  })

  it('id 가 없으면 id 줄 자체가 없다', () => {
    expect(sseFrame('heartbeat', {})).not.toContain('id:')
  })

  it('resume-failed 도 같은 형식이다 — 에러 응답이 아니라 이벤트다', () => {
    const f = sseFrame('resume-failed', { reason: 'EVENT_ID_TOO_OLD', action: 'REFETCH_SNAPSHOT' })
    expect(f).toContain('event: resume-failed')
    expect(f).toContain('REFETCH_SNAPSHOT')
  })
})
