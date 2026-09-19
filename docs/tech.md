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
| Mock | **MSW** — 앱이 진짜 `fetch`를 호출하고 네트워크에서 가로챈다 (`api.md` §7.2) |
| **웹** | React 19 + Vite (SPA) |
| **모바일** | React Native + Expo → Android APK |
| 서버 상태 | TanStack Query |
| 스키마 검증 | Zod |
| API 클라이언트 생성 | **`openapi-typescript`** — 입력은 `docs/api/openapi.yaml` |
| SSE (웹) | 네이티브 `EventSource` |
| SSE (React Native) | `react-native-sse` |
| 토큰 저장 (모바일) | Expo SecureStore |
| 스타일 | Tailwind · NativeWind |

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
