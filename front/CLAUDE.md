# front — 웹 트랙

> 루트 [CLAUDE.md](../CLAUDE.md)의 규칙이 먼저다. 여기는 이 트랙만의 것.

## 스택

| 구분 | 값 |
|---|---|
| 언어 | TypeScript 5.x |
| 프레임워크 | **React 19 + Vite** (SPA) |
| 서버 상태 | TanStack Query |
| 스키마 검증 | Zod |
| 타입 생성 | **`openapi-typescript`** ← `docs/api/openapi.yaml` |
| Mock | **MSW** |
| SSE | 네이티브 `EventSource` |
| 스타일 | Tailwind |
| 배포 | **Cloudflare Pages** (루트 디렉터리 `front/`) |

**`mobile`과 workspace로 묶지 않는다.** 각자 독립 (`tech.md`).

## 백엔드보다 먼저 개발한다

`api.md` §7이 이 트랙의 지침서다.

| # | 단계 |
|---|---|
| 0 | **`openapi.yaml`에서 타입 생성** |
| 1 | **MSW 핸들러 = `api.md` §5 · §4 JSON 예시 복사** |
| 2 | 화면 개발 — **정상 + 예외 전부** |
| 5 | **MSW 끄기** (`VITE_API_MODE=real`) |

> **타입이 백엔드보다 먼저 존재한다** (ADR-0007). 계약을 손으로 썼기 때문이다.

## 이 트랙의 금지

| 금지 | 근거 |
|---|---|
| ⚠️ **함수 안에서 가짜 데이터 `return`** | `api.md` §7.2 — **로딩·에러 화면을 만들 계기가 없어진다.** MSW로 |
| 타입을 손으로 고치기 | **생성물이다.** `openapi.yaml`을 고치고 재생성 |
| 잔여석을 판정 근거로 | `api.md` §5.1 — **근사값이다** |
| `expiresAt` 없이 인터벌 카운트 | `api.md` §5.2 — 백그라운드에서 멈춘다 |
| 결제 결과 조회를 `POST`로 | `api.md` §5.3 — **`GET`이다. 이중 결제** |

## 읽어야 할 문서

| 언제 | 어디 |
|---|---|
| 화면을 만들 때 | **`docs/wireframes/web.html`** — 11화면 + 예외 3 |
| API를 부를 때 | **`docs/api/openapi.yaml`** · `api.md` §5 |
| 에러 화면 | `api.md` §4 — 에러 코드 21개 |
| SSE를 붙일 때 | **`api.md` §6** |
| Mock 전략 | **`api.md` §7** |

## 자주 틀리는 것

| 실수 | 바른 것 |
|---|---|
| `409`를 일반 에러로 처리 | **두 종류다** — `SEAT_ALREADY_HELD`(다른 좌석) vs `SEAT_LOCK_TIMEOUT`(다시 시도) |
| `202`를 성공으로 | **결제 미확정.** `GET`으로 폴링 (`api.md` §5.3) |
| SSE 붙이고 좌석맵 재조회 | **`lastEventId`로 이어붙인다** (`api.md` §6.3) |
| 시각을 KST로 받는다고 가정 | **서버는 UTC만 보낸다** (`api.md` §0) |
| 예약 목록에서 `COMPLETED`를 저장값으로 | **파생값이다.** 그냥 표시하면 된다 |

## Pages가 타입 체크를 안 한다

⚠️ **`vite build`는 타입 에러를 그냥 통과시킨다.** front CI의 **`tsc --noEmit`**이 유일한 방어다 (`deploy.md` §7.1).
