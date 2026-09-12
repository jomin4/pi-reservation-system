/**
 * SSE 한 프레임을 만든다 (`api.md` §6.2).
 *
 * ```
 * id: 1725426753000-7
 * event: seat-changed
 * data: {"...":"..."}
 *
 * ```
 *
 * > **왜 핸들러에서 빼냈나** — `msw/node` 는 **스트림이 닫힐 때까지 `fetch` 를 붙잡는다.**
 * > 하트비트가 계속 나가는 정상 스트림은 Node 테스트에서 열어볼 수가 없다(브라우저
 * > 워커에서는 정상이다). 직렬화가 이 파일에 있으면 **그 부분만은 확실히 검증**할 수 있다.
 */
export function sseFrame(event: string, data: unknown, id?: string): string {
  const idLine = id === undefined ? '' : `id: ${id}\n`
  return `${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}
