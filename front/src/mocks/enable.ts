import { handlers } from './handlers'
import { getScenario, initScenario } from './scenario'

/**
 * `VITE_API_MODE` 하나로 켜고 끈다 (`api.md` §7.2).
 *
 * > **앱 코드는 그대로다.** 컴포넌트는 진짜 `fetch` 를 호출하고 MSW 가 그걸 가로챈다.
 * > 끌 때는 워커를 안 띄우면 그만이고, **코드 경로가 바뀌지 않는다.**
 *
 * ⚠️ `main.tsx` 에서 **`render` 앞에 `await`** 해야 한다. 워커 등록 전에 첫 요청이
 * 나가면 그 요청만 진짜 네트워크로 샌다.
 */
export async function enableMocking(): Promise<void> {
  if (import.meta.env.VITE_API_MODE !== 'mock') return

  const scenario = initScenario()
  const { setupWorker } = await import('msw/browser')

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

export { getScenario }
