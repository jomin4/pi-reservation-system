# 2026-09-15 — 가짜 예약 데이터가 프로덕션 번들에 들어 있다

| | |
|---|---|
| 상태 | 해결 |
| 트랙 | front |
| 관련 | `docs/deploy.md` §7.4 · `api.md` §7.2 · 이슈 #108 |

## 증상

**에러 메시지가 없다. 이게 이 문제의 전부다.**

`pnpm run build` 는 성공하고, 타입 · 린트 · 테스트 341건도 전부 통과한다. 그런데
배포 산출물 안에 목 데이터가 있다.

```
$ pnpm run build
dist/assets/index-DajGSoo9.js   374.68 kB │ gzip: 115.39 kB
✓ built in 644ms

$ grep -c 48207315 dist/assets/index-DajGSoo9.js
1
```

엔트리 청크에서 발견된 것:

| 문자열 | 출처 |
|---|---|
| `48207315` · `KTX 101` · `4호차` | `src/mocks/fixtures.ts` 가짜 예약 |
| `seat-conflict` · `payment-pending` | `src/mocks/scenario.ts` 시나리오 이름 |

## 환경

| 항목 | 값 |
|---|---|
| 버전 | Vite 8.3.0 · MSW 2.15.0 |
| 재현 | **항상.** `VITE_API_MODE` 를 주든 안 주든 같다 |

## 원인

`src/mocks/enable.ts` 의 **정적 `import`** 였다.

```ts
import { handlers } from './handlers'   // ⚠️ 여기

export async function enableMocking(): Promise<void> {
  if (import.meta.env.VITE_API_MODE !== 'mock') return   // 런타임 가드
  const { setupWorker } = await import('msw/browser')     // 동적 — 이건 제대로 분리됐다
  await setupWorker(...handlers).start({ … })
}
```

**`VITE_API_MODE` 검사는 런타임 가드라 트리셰이킹을 못 한다.** 번들러가 보는 것은
「`handlers` 를 쓰는 코드가 있다」는 사실뿐이다 — 그게 `return` 뒤에서만 실행된다는 걸
증명할 수 없으니 `handlers` → `fixtures` → `msw` 핵심까지 엔트리 청크에 넣는다.

> **`msw/browser` 를 동적 `import` 로 분리해 둔 것이 오히려 문제를 가렸다.**
> 87 kB · 320 kB 짜리 큰 덩어리가 별도 청크로 빠져 있으니 「MSW 는 분리돼 있다」고
> 읽혔다. 정작 새는 건 그 옆의 `handlers` 였다.

### 왜 두 달 가까이 아무도 못 봤나

⚠️ **front CI 에 `vite build` 가 없었다.** `tsc --noEmit` · 린트 · 테스트 · 생성 타입
`diff` 뿐이었다. `deploy.md` §7.1 이 「빌드 · 배포는 Pages 몫」이라고 나눠 놓은 결과,
**빌드 산출물을 보는 눈이 아무 데도 없었다.**

## 해결

목 관련 `import` 를 **전부 함수 안으로** 옮겼다.

```ts
export async function enableMocking(): Promise<void> {
  if (import.meta.env.VITE_API_MODE !== 'mock') return

  const [{ handlers }, { initScenario }, { setupWorker }] = await Promise.all([
    import('./handlers'),
    import('./scenario'),
    import('msw/browser'),
  ])
  …
}
```

| | 전 | 후 |
|---|---|---|
| 엔트리 청크 | 374.68 kB | **352.43 kB** |
| 목 문자열 | **있음** | 없음 |

목은 `handlers-*.js`(21.7 kB) · `scenario-*.js` 로 빠졌고, 이건 `VITE_API_MODE=mock`
일 때만 받아진다.

## 막다른 길

| 시도 | 결과 |
|---|---|
| 청크 목록만 보고 판단 | ❌ **`browser-*.js` · `cookieStore-*.js` 가 분리돼 있어 「MSW 는 안 실린다」고 읽었다.** 새는 건 이름이 안 드러나는 `handlers` 쪽이었다 |
| `import.meta.env.VITE_API_MODE` 가드를 믿음 | ❌ 런타임 가드다. **번들 구성에 아무 영향이 없다** |
| 검사기 회귀 테스트로 `void handlers` 를 추가 | ❌ **Rollup 이 그걸 트리셰이킹해서 검사기가 초록이 났다.** 실제로 쓰이는 원래 형태로 되돌려야 재현된다 — **검사기를 못 믿을 뻔했다** |

> 마지막 줄이 가장 위험했다. **「검사기를 만들었다」와 「검사기가 잡는다」는 다르다.**
> 일부러 되돌려 빨간 불을 본 뒤에야 믿을 수 있다.

## 재발 방지

| 조치 | 위치 |
|---|---|
| 엔트리 청크에서 목 문자열 `grep` | `front/scripts/check-bundle.sh` |
| CI 6단계로 편입 (**`vite build` 가 CI 에 처음 들어왔다**) | `.github/workflows/front-ci.yml` |
| 로컬에서도 같은 명령 | `pnpm run check:bundle` · `pnpm run ci` |
| 금지를 트랙 문서에 | `front/CLAUDE.md` 「`src/mocks/` 를 정적으로 import 하지 않는다」 |
| 계약을 배포 문서에 | `docs/deploy.md` §7.1 표 · §7.4 |
