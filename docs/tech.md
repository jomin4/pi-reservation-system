# 기술 스택

> **이 문서가 답하는 질문 하나** — **무슨 기술을 쓰기로 했나.** 한 줄씩만. **왜**는 ADR 이, **어떻게**는 각 설계 문서가 답한다.

| 여기 있다 | 여기 없다 → 어디 |
|---|---|
| 기술 이름과 역할 한 줄 | 호스트 · 네트워크 · **메모리 예산** → [infra.md](infra.md) |
| | CI/CD · 배포처 · 시크릿 → [deploy.md](deploy.md) |
| | **폐기된 기술과 이유** → ADR-0003 · ADR-0005 · ADR-0008 · 루트 `CLAUDE.md` 폐기 목록 |

> 그림 — [02-container](diagrams/c4/02-container.svg): 이 표의 기술이 어느 컨테이너로 도는가

## 언어

역할별로 하나씩. 같은 자리에 두 언어를 두지 않는다.

| 역할 | 언어 |
|---|---|
| 백엔드 | **Java 21** — [미확정 U-1](README.md#부록--미확정) |
| 프론트 계열 (웹 · 모바일) | **TypeScript 5.x** |
| 인프라 정의 | YAML (Docker Compose · Ansible) |

## 백엔드

| 구분 | 선택 |
|---|---|
| 프레임워크 | Spring Boot 4.1 |
| 빌드 | Gradle (Kotlin DSL) |
| 구조 | 모듈러 모놀리스 · **헥사고날 · Gradle 9모듈** ([back.md](back.md) §1) |
| DB | **PostgreSQL 17** — 좌석의 진실 |
| **영속화** | **Spring JDBC (`JdbcClient`)** — **ORM 없음** (ADR-0008) |
| 캐시 · 이벤트 | **Redis 7** — 좌석맵 캐시 + **Stream**(팬아웃 · 재개) |
| 마이그레이션 | Flyway |
| **API 계약** | **`docs/api/openapi.yaml`** — **손으로 작성.** 진실의 출처 (ADR-0007) |
| API 문서 UI · 구현 검증 | **SpringDoc OpenAPI** — Swagger UI + **계약 대조용 산출 스펙** |
| 테스트 | JUnit 5 · Testcontainers · AssertJ |
| 관측 | Micrometer → Prometheus |

> **의도 — JPA를 왜 안 쓰나.** 네 가지가 막혔다. ① `lock_timeout` 200ms를 표현할 힌트가 PostgreSQL에 **없다**(있는 건 `NOWAIT`과 ADR-0002가 금지한 `SKIP LOCKED`뿐). ② `@Version`을 붙이면 실패 모드가 둘로 갈라지는데 CAS가 필요한 경로는 만료 회수 하나뿐이다. ③ 도메인에 PK가 없어 **1차 캐시가 히트하지 않는다.** ④ 더티 체킹은 **락을 쥔 구간의 길이를 코드에서 지운다.**
>
> 여기에 완전 분리(ADR-0001)가 겹치면 JPA 엔티티는 **표현을 한 겹 더 늘릴 뿐**이다 — 엔티티 + 매퍼 + DDL로 3겹이 된다. 자세한 저울질은 **ADR-0008**.
>
> ⚠️ **대가는 컴파일러가 SQL 오타를 못 잡는다는 것이다.** 그래서 **Repository는 Testcontainers 통합 테스트 없이 짜지 않는다** — 이건 규율이 아니라 이 선택의 조건이다.

## 프론트 계열 (TypeScript)

| 구분 | 선택 |
|---|---|
| 패키지 관리 | **`front`/`mobile` 각자 독립** — workspace로 안 묶는다 (Expo metro resolver 이슈 회피) |
| 공유 방식 | **각자 `docs/api/openapi.yaml`에서 타입 생성** — 원본이 하나면 생성물 중복은 중복이 아니다 |
| Mock | **웹은 MSW · 모바일은 자체 `fetch` 인터셉터** — ⚠️ **갈렸다** (`api.md` §7.2). 앱이 진짜 `fetch` 를 호출한다는 건 같다 |
| **웹** | React 19 + Vite (SPA) |
| **모바일** | React Native + Expo → Android APK |
| 서버 상태 | TanStack Query |
| 스키마 검증 | Zod |
| API 클라이언트 생성 | **`openapi-typescript`** — 입력은 `docs/api/openapi.yaml` |
| SSE (웹) | 네이티브 `EventSource` |
| SSE (React Native) | `react-native-sse` — ⚠️ **유지보수 정지 상태.** 아래 |
| **라우터 (웹)** | **React Router 7** — 선언형 SPA 모드 |
| **라우터 (모바일)** | **`expo-router`** — 파일 기반. **SDK 57이 번들한다** |
| **토큰 저장 (웹)** | Access **메모리** · Refresh **`sessionStorage`** — 아래 |
| 토큰 저장 (모바일) | Expo SecureStore |
| 스타일 | Tailwind · NativeWind — ⚠️ **메이저가 갈린다.** 웹 4 · 모바일 3 (아래) |

> **웹 토큰을 `localStorage`에 두지 않는다.** XSS 한 번이면 14일짜리 세션이 통째로 나간다. **노출면을 탭 수명으로 자른다.**

| 토큰 | 어디 | 수명 |
|---|---|---|
| **Access** (15분) | **메모리** | 페이지 로드 |
| **Refresh** (14일) | **`sessionStorage`** | **탭** |

> ⚠️ **Refresh 를 메모리에 둘 수는 없다.** `POST /auth/refresh` 가 Refresh 를 **본문으로** 받으므로(`openapi.yaml`) JS 가 들고 있어야 하는데, 메모리면 새로고침 순간 사라져 **복구 자체가 불가능**하다. 선점 TTL 이 10분이라 **그 사이 새로고침 한 번이면 결제를 못 한다** — 기능이 깨진다.
>
> **`sessionStorage` 가 XSS 를 막지는 않는다.** 같은 오리진 JS 는 그것도 읽는다. 줄어드는 건 **탈취 후 재사용 창**이고, 거기에 계약의 **회전 + 재사용 탐지**(`F-26`)가 얹힌다 — 사용자가 한 번만 더 갱신해도 탈취 세션이 전부 폐기된다.
>
> httpOnly 쿠키로 가면 `openapi.yaml` 이 바뀐다 — **계약을 안 건드리는 선택**이기도 하다.

> **라우터는 TanStack Router가 아니다.** 타입 안전 라우팅이 더 낫지만 **이 프로젝트가 증명할 것은 동시성이다.** 학습 비용을 좌석 경합 쪽에 쓴다.

> **모바일 라우터는 고를 게 없었다.** `expo-router`는 Expo SDK가 번들하고 React Navigation 위에 얹힌 것이다. 직접 React Navigation을 쓰면 **딥링크와 타입 라우팅을 손으로 짜게 된다.** 대안을 저울질한 결정이 아니라서 ADR을 쓰지 않는다.

### 버전 고정 — 2026-09-11 레지스트리 실측

**런타임 · 패키지 매니저**

| 항목 | 버전 | 근거 |
|---|---|---|
| **Node** | **24.21.0 LTS** (Krypton) | 2026-09-07 기준 **Active LTS**. 22(Jod)는 maintenance |
| **pnpm** | **10.34.5** | v10 = 2025-01-07. **20개월 검증** |

> ⚠️ **2026-09-11 현재 `contract-ci.yml`만 아직 Node 22 · pnpm 9다.** `front-ci.yml`(#62) · `mobile-ci.yml`(#74)은 따라왔다. **각 트랙 PR에서 따라온다** — 여기 적어두지 않으면 다음 사람이 CI와 문서 중 어느 쪽이 맞는지 모른다.

**웹 (`front/`)**

| 구분 | 패키지 | 버전 |
|---|---|---|
| 언어 | `typescript` | **5.9.3** |
| 프레임워크 | `react` · `react-dom` | 19.3.0 |
| 번들러 | `vite` | 8.3.0 |
| | `@vitejs/plugin-react` | 6.1.1 |
| 라우터 | `react-router` | **7.18.3** |
| 서버 상태 | `@tanstack/react-query` | 5.102.8 |
| 스키마 검증 | `zod` | 4.6.2 |
| Mock | `msw` | 2.15.0 |
| 스타일 | `tailwindcss` · `@tailwindcss/vite` | 4.3.3 |
| **타입 생성** | `openapi-typescript` | **7.13.0** |
| 테스트 | `vitest` · `@vitest/coverage-v8` | **4.1.11** |
| | `@testing-library/react` | 16.3.3 |
| | `@testing-library/jest-dom` | 7.0.1 |
| | `@testing-library/user-event` | 14.6.7 |
| | `jsdom` | 30.0.1 |
| 린트 | `eslint` | 10.10.0 |
| | `typescript-eslint` | 8.70.0 |
| 포맷 | `prettier` | 3.9.6 |

> ⚠️ **`typescript`에 `latest`를 쓰면 트랙이 깨진다.** 2026-09-11 현재 `latest`는 **7.0.2**(네이티브 포트)인데 **생태계가 안 따라왔다.**
>
> | 패키지 | `typescript` peer |
> |---|---|
> | `typescript-eslint` 8.70.0 | **`>=4.8.4 <6.1.0`** |
> | `openapi-typescript` 7.13.0 | **`^5.x`** |
>
> 올리면 **`pnpm run lint`(front CI 필수 단계)와 타입 생성이 동시에 범위를 벗어난다.** 5.x 마지막인 **`5.9.3`**(2025-09-30)에 고정한다.

> **`vite`는 8이어야 한다.** `@vitejs/plugin-react@6`의 peer 가 **`vite: ^8.0.0` 단독**이다. 7로 내리면 플러그인도 5로 함께 내려야 하는데 **얻는 게 없다.**

> **갓 나온 메이저는 피했다.** `vitest` 5.0.0(2026-09-03 · **8일**)과 `react-router` 8(2026-06-17 · 3개월)을 각각 **4.1.11 · 7.18.3**으로 내렸다. 둘 다 유지보수가 도는 현역이다. **트러블슈팅을 본질이 아닌 데서 쓰지 않는다.**

> **`openapi-typescript`는 7.13.0에 고정한다.** [트러블슈팅 2026-09-10](troubleshooting/tooling/2026-09-10-redocly-config-hijacks-openapi-typescript.md)의 재현 조건이 이 버전이다. 올릴 때는 `redocly.yaml`의 `apis:` 금지가 여전히 필요한지 다시 본다.

**모바일 (`mobile/`)** — 2026-09-11 레지스트리 실측

> ⚠️ **여기서는 `latest`에서 시작하지 않는다.** 웹은 레지스트리 `latest`를 받아 peer 충돌만큼 내렸지만, 모바일은 **`expo`의 `bundledNativeModules.json`이 먼저 결정한다.** `expo install`이 그 값을 쓰고 **`expo-doctor`가 mobile CI에서 불일치를 잡는다**(`deploy.md` §8.1).

| 패키지 | npm `latest` | **SDK 57이 고정** | 채택 |
|---|---|---|---|
| `react-native` | 0.87.1 | **0.86.3** | ✅ **0.86.3** |
| `react` | 19.3.0 | **19.2.3** | ✅ **19.2.3** |

> ⚠️ **2026-09-12 스캐폴드(#79)에서 실측으로 세 줄이 바뀌었다.** `eslint` · `jest` · 패치 버전들. **아래 표가 실제로 설치되고 `expo-doctor` 21/21을 통과한 값**이다.
>
> ⚠️ **`expo` 패치는 계속 움직인다.** SDK 57 안에서도 `57.0.21 → .22 → .23` 으로 올라갔고 **그때마다 `expo-doctor` 가 mobile CI 를 빨갛게 만든다.** 막을 방법은 없다 — **`expo-doctor` 가 지적하면 그 PR 에서 올린다.** 여기 숫자도 함께 고친다.

| 구분 | 패키지 | 버전 |
|---|---|---|
| **SDK** | `expo` | **57.0.23** |
| 프레임워크 | `react-native` | **0.86.3** |
| | `react` | **19.2.3** |
| | `@types/react` | 19.2.18 |
| 언어 | `typescript` | ⚠️ **5.9.3** — Expo는 6을 기대한다. 아래 |
| **라우터** | `expo-router` | **57.0.21** |
| | `expo-constants` · `expo-linking` | 57.0.18 · 57.0.10 |
| | `react-native-screens` · `react-native-safe-area-context` | 4.26.0 · 5.7.0 |
| 서버 상태 | `@tanstack/react-query` | 5.102.8 |
| 스키마 검증 | `zod` | 4.6.2 |
| **SSE** | `react-native-sse` | **1.2.1** |
| 토큰 저장 | `expo-secure-store` | **57.0.4** |
| **UUID** | **`expo-crypto`** | **57.0.3** — ⚠️ Hermes에 `crypto.randomUUID`가 없다 |
| **스타일** | `nativewind` | **4.2.6** |
| | `tailwindcss` | ⚠️ **3.4.19** — 웹과 메이저가 다르다 |
| | `react-native-reanimated` | **4.5.1** — NativeWind 엔진이 요구 |
| | `react-native-worklets` | **0.10.1** — reanimated 4가 요구 |
| **Mock** | ⚠️ **없다 — 자체 `fetch` 인터셉터** | `msw` 는 Hermes 에서 안 돈다 (#91) |
| **타입 생성** | `openapi-typescript` | **7.13.0** |
| 빌드 | `@babel/core` | 7.29.7 |
| 테스트 | `jest-expo` | 57.0.5 |
| | `jest` | ⚠️ **29.7.0** — 웹(`vitest`)과 무관하게 **Expo가 29를 기대한다** |
| | `@types/jest` | 29.5.14 — ⚠️ `jest-expo`가 안 끌어온다. `tsc`가 `describe` 를 못 찾는다 |
| | `@testing-library/react-native` | 14.0.1 + **`test-renderer` 1.2.0** |
| 린트 | `eslint` | ⚠️ **9.39.5** — **웹은 10이다.** 아래 |
| | `eslint-config-expo` | 57.0.2 |
| 포맷 | `prettier` | 3.9.6 |

> **`@testing-library/react-native` 14는 `test-renderer`를 따로 깔아야 한다.** peer가 `react-test-renderer`가 아니라 **`test-renderer@^1.0.0`**(별개 패키지)로 바뀌었다. 스캐폴드에는 아직 안 넣었다 — 테스트 이슈에서 함께 들어온다.

**⚠️ `eslint`가 웹과 다르다 — 모바일은 9**

`eslint-config-expo@57.0.2`의 peer는 **`eslint >=8.10`**이라 10을 받을 것처럼 읽힌다. **거짓말이다.**

```
eslint-config-expo@57.0.2
  └─ eslint-plugin-react@7.37.5
       peer: eslint ^3 || … || ^9.7      ← 10 이 없다
```

ESLint 10으로 깔면 `pnpm run lint`가 **규칙 로딩 단계에서 죽는다.**

```
TypeError: Error while loading rule 'react/display-name':
  contextOrFilename.getFilename is not a function
```

> **웹의 `typescript` 덫과 같은 모양이다** — **바깥 패키지의 peer가 안쪽 엔진보다 느슨하다.** 자세한 건 [트러블슈팅 2026-09-12](troubleshooting/mobile/2026-09-12-eslint-config-expo-caps-eslint-at-9.md).

**⚠️ `typescript`는 `expo-doctor`에서 예외 처리한다**

Expo SDK 57은 **`typescript ~6.0.3`**을 기대한다. 그런데 **5.9.3을 벗어나면 타입 생성과 린트가 동시에 깨진다**(`openapi-typescript` peer `^5.x` · `@typescript-eslint/*` 8.x `<6.1.0`).

```json
"expo": { "install": { "exclude": ["typescript"] } }
```

> **Expo의 기대값은 템플릿이 무엇을 깔았나에 가깝고, 우리 제약은 계약에서 타입을 뽑는 것이다.** 후자가 이긴다. `exclude`는 Expo가 공식으로 둔 탈출구다.

> ⚠️ **`openapi-typescript`는 웹과 같은 값이어야 한다.** `mobile-ci.yml`의 마지막 단계가 `openapi-typescript@7`로 생성해 커밋된 파일과 `diff`한다. **로컬에서 다른 마이너로 생성하면 CI가 빨개진다.**

> ⚠️ **`typescript`도 웹과 같은 덫이다.** `latest`는 7.0.2인데 `openapi-typescript` 7.13.0의 peer가 `^5.x`이고, `eslint-config-expo`가 끌어오는 `@typescript-eslint/*` 8.x가 `<6.1.0`이다. **5.9.3** 고정.

**⚠️ Tailwind 메이저를 의도적으로 가른다 — 웹 4 · 모바일 3**

```
nativewind@4.2.6
  └─ react-native-css-interop@0.2.6
       peer: tailwindcss@~3        ← nativewind 자신의 peer(>3.3.0)와 다르다
```

`nativewind`의 peer만 보면 4가 될 것 같지만 **실제 엔진이 `~3`으로 막는다.**

| 대안 | 판정 |
|---|---|
| **모바일만 `tailwindcss@3.4.19`** | ✅ **채택** |
| NativeWind 5 | ❌ `5.0.0-preview.4` — prerelease |
| 웹을 3으로 내린다 | ❌ 이미 머지된 걸 되돌린다 |
| 모바일만 `StyleSheet` | ❌ 디자인 토큰 공유 경로가 사라진다 |

> **맞추려 들지 말 것.** `front`/`mobile`은 workspace로 안 묶여 있어 **버전이 갈려도 충돌하지 않는다.** 대신 **Tailwind 문법이 갈린다** — 웹은 `@theme`, 모바일은 `tailwind.config.js`다.

> **되돌리기 자체는 싸다. 비싼 건 갈린 채로 오래 두는 것이다.** NativeWind 5 정식판이 나오면 모바일을 4로 올리는 건 설정 파일 옮기기다. 그런데 **양쪽 문법이 다른 상태로 디자인 토큰이 굳으면 공유 지점을 만들 자리가 없다.**

> ⚠️ **이 결정은 두 트랙에 걸치므로 ADR은 본체가 쓴다** (`workflow.md` §1.3.1). 여기 있는 대안 표와 근거가 그 입력이다.

**⚠️ `react-native-sse`는 유지보수가 멈춰 있다**

| 항목 | 값 |
|---|---|
| 최신 | **1.2.1 · 2024-03-05** — **2년 6개월 무릴리스** |
| 총 릴리스 | 9개 |

| 그래도 쓰는 이유 | 위험 |
|---|---|
| SSE 프레임 파싱은 **사양이 안 바뀐다** | RN 0.86의 네트워크 스택 변경에 **아무도 대응 안 한다** |
| 의존성이 거의 없다 | `F-19` 재개(`Last-Event-ID`)를 **직접 검증해야 한다** |

> **`api.md` §7.4가 "SSE는 인터페이스로 감싼다"고 이미 정해뒀다.** 그 결정이 여기서 값을 한다 — **교체가 어댑터 한 장이 된다.** 대안 조사는 실물이 돈 뒤에 한다.

## 부하 생성 — 초기 범위 밖

검증 기준(**초과 판매 0건** · `data.md` §4.9)은 유지하고 **경합을 만드는 수단만 미정**이다 — [미확정 U-2](README.md#부록--미확정).

## 인프라

**단일 호스트다.** 하이퍼바이저도 VM도 없다 (ADR-0005).

| 구분 | 선택 |
|---|---|
| 호스트 | **Ubuntu 24.04 LTS · 개인 PC · RAM 8GB · SSD 512GB · 헤드리스** |
| 컨테이너 | **Docker Compose** — 전부 여기서 돈다 |
| **네트워크 격리** | **Docker 네트워크 3분리** — `net:dmz` · `net:app` · `net:data` |
| 호스트 방화벽 | **`ufw`** |
| 리버스 프록시 · LB | **nginx** |
| 아웃바운드 프록시 | **tinyproxy** — 화이트리스트 **3곳** |
| **백업** | **Cloudflare R2** — `pg_dump` → `age` 암호화 → `rclone` (ADR-0006) |
| 구성 관리 | **Ansible** — **호스트 준비까지만** (Docker 설치 · `ufw` · 디렉터리) |
| 관측 | Prometheus · Grafana · Loki |
| 알림 | Alertmanager → Discord |

메모리 예산과 모자랄 때 버리는 순서는 **[infra.md](infra.md) §1.1**, 네트워크 멤버십은 §2, 나가는 길 3곳은 §5.

## Cloudflare

| 서비스 | 용도 |
|---|---|
| **Tunnel** (`cloudflared`) | **아웃바운드 연결**로 집 서버 노출 — 포트포워딩 · 공인 IP · DDNS 전부 불필요 |
| **DNS** | `jomin4.cloud` — **가비아 등록 · 네임서버를 Cloudflare로 위임** |
| **Pages** | 웹 호스팅 · **프리뷰 배포** |
| **R2** | 백업 버킷 |
| **Access** | 관리 페이지(Grafana) 접근 제어 |
| WAF · Rate Limiting | 기본 보호 |

도메인별 경로는 **[infra.md](infra.md) §4.2**.

## DevOps

| 구분 | 선택 |
|---|---|
| 소스 | GitHub |
| CI | **GitHub Actions** |
| 이미지 레지스트리 | `ghcr.io` |
| **CD (폐쇄망)** | **self-hosted runner** — 인바운드 불필요 |
| 배포 실행 | **Docker Compose** (호스트 준비는 Ansible) |
| 시크릿 | GitHub Secrets · 호스트 `.env` — 경계는 [deploy.md](deploy.md) §4 |
| DB 마이그레이션 | Flyway |

| 트랙 | 빌드 | 배포처 |
|---|---|---|
| **웹** | **Cloudflare Pages** | Pages CDN |
| **모바일** | **EAS Build** (Expo 클라우드) | **GitHub Releases** — APK 직접 |
| **서버** | GitHub Actions → `ghcr.io` | **self-hosted runner가 pull** |

로컬 Android 빌드와 Play Store 를 안 쓰는 이유는 **[deploy.md](deploy.md) §8**.

## 외부 연동

| 구분 | 선택 |
|---|---|
| 결제 PG | **토스페이먼츠** 단일 |
| 결제창 | 웹 · 모바일 인앱 · 인브라우저 |
| 외부 경로 | 앱 → **tinyproxy**(`net:dmz`) → 토스 |

## 관련 문서

| 문서 | 내용 |
|---|---|
| [overview.md](overview.md) | 프로젝트 주제 · 기획 |
| [features.md](features.md) | 기능정의서 25건 |
| [back.md](back.md) | **백엔드 설계** — 모듈 · 포트 · 유스케이스 · 어댑터 |
| [data.md](data.md) | 데이터 설계 · ERD |
| [infra.md](infra.md) · [deploy.md](deploy.md) | 어디에 · 어떻게 올리나 |
| [research.md](research.md) | 코레일 · 타사 조사 결과 |

---

**← 앞** [features.md](features.md) — 무엇을 만드나 · **다음 →** [back.md](back.md) — 코드가 어떻게 나뉘나
