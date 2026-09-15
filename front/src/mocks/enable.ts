/**
 * `VITE_API_MODE` 하나로 켜고 끈다 (`api.md` §7.2).
 *
 * > **앱 코드는 그대로다.** 컴포넌트는 진짜 `fetch` 를 호출하고 MSW 가 그걸 가로챈다.
 * > 끌 때는 워커를 안 띄우면 그만이고, **코드 경로가 바뀌지 않는다.**
 *
 * ⚠️ `main.tsx` 에서 **`render` 앞에 `await`** 해야 한다. 워커 등록 전에 첫 요청이
 * 나가면 그 요청만 진짜 네트워크로 샌다.
 *
 * ---
 *
 * ⚠️ **이 파일에 정적 `import` 를 두면 목이 프로덕션 번들에 실려 나간다** (#108).
 *
 * > `VITE_API_MODE` 검사는 **런타임 가드라 트리셰이킹을 못 한다.** 번들러는 `handlers`
 * > 가 안 쓰일 것을 증명할 수 없어서 `handlers` → `fixtures` → `msw` 를 통째로 메인
 * > 청크에 끌고 들어온다. 실제로 가짜 예약번호 `48207315` 가 배포물에 있었다.
 *
 * **목 관련 import 는 전부 이 함수 안에서 `await import(...)` 로 한다.**
 */
export async function enableMocking(): Promise<void> {
  if (import.meta.env.VITE_API_MODE !== 'mock') return

  const [{ handlers }, { initScenario }, { setupWorker }] = await Promise.all([
    import('./handlers'),
    import('./scenario'),
    import('msw/browser'),
  ])

  const scenario = initScenario()

  await setupWorker(...handlers).start({
    // 가로채지 않는 요청(정적 자산 등)까지 경고하지 않는다
    onUnhandledRequest: 'bypass',
    quiet: true,
  })

  // 목이 켜졌다는 사실과 지금 시나리오는 콘솔에 보여야 한다
  console.info(
    `[msw] 목 API 가 켜졌다. 시나리오: ${scenario}\n` +
      `      바꾸려면 주소에 ?mock=<이름> — 목록은 src/mocks/scenario.ts`,
  )
}
