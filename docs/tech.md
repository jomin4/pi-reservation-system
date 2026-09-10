# 기술 스택

> **2026-09-04 키오스크 채널 철회.** 임베디드 스택(C · libcurl · SQLite3 · ESC/POS · CMake)과 관련 하드웨어를 제거했다.
>
> **2026-09-10 인프라 전제 변경.** 배포 대상이 **32GB Proxmox 호스트 → 8GB Ubuntu 개인 PC**로 바뀌었다. 하이퍼바이저 · VLAN 물리 분리 · 사설 CA · 외장 백업이 함께 빠졌다. 자세한 건 [infra.md](infra.md).

## 언어

역할별로 하나씩. 같은 자리에 두 언어를 두지 않는다.

| 역할 | 언어 |
|---|---|
| 백엔드 | **Java 21** |
| 프론트 계열 (웹 · 모바일) | **TypeScript 5.x** |
| 인프라 정의 | YAML (Docker Compose · Ansible) |

## 백엔드

| 구분 | 선택 |
|---|---|
| 프레임워크 | Spring Boot 4.1 |
| 빌드 | Gradle (Kotlin DSL) |
| 구조 | 모듈러 모놀리스 · **헥사고날 · Gradle 8모듈** |
| DB | **PostgreSQL 17** — 좌석의 진실 |
| 캐시 · 이벤트 | **Redis 7** — 좌석맵 캐시 + **Stream**(팬아웃 · 재개) |
| 마이그레이션 | Flyway |
| **API 계약** | **`docs/api/openapi.yaml`** — **손으로 작성.** 진실의 출처 (ADR-0007) |
| API 문서 UI · 구현 검증 | **SpringDoc OpenAPI** — Swagger UI + **계약 대조용 산출 스펙** |
| 테스트 | JUnit 5 · Testcontainers · AssertJ |
| 관측 | Micrometer → Prometheus |

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

> **2026-09-10 연기.** 초기 릴리스에서는 부하 생성 도구를 정하지 않는다. 동시성 설계(`data.md` §4)와 검증 기준은 그대로 두고, **경합을 만드는 수단만 미정**이다.

| 항목 | 상태 |
|---|---|
| 검증 기준 | ✅ **초과 판매 0건** — DB 대사 (`data.md` §4.9) |
| 측정 도구 | ⬜ **미정** — 동작하는 시스템이 나온 뒤 선정 |
| 실행 위치 | ⬜ 미정 |

## 인프라

**단일 호스트다.** 하이퍼바이저도 VM도 없다.

| 구분 | 선택 |
|---|---|
| 호스트 OS | **Ubuntu 24.04 LTS · 헤드리스** |
| 하드웨어 | **RAM 8GB · SSD 512GB** |
| 컨테이너 | **Docker Compose** — 전부 여기서 돈다 |
| **네트워크 격리** | **Docker 네트워크 3분리** — `net:dmz` · `net:app` · `net:data` |
| 호스트 방화벽 | **`ufw`** |
| 리버스 프록시 · LB | **nginx** |
| 아웃바운드 프록시 | **tinyproxy** — 화이트리스트 **3곳** |
| **백업** | **Cloudflare R2** — `pg_dump` → `age` 암호화 → `rclone` |
| 구성 관리 | **Ansible** — **호스트 준비까지만** (Docker 설치 · `ufw` · 디렉터리) |
| 관측 | Prometheus · Grafana · Loki |
| 알림 | Alertmanager → Discord |

### 메모리 예산 — 이게 설계 제약이다

**추정치. 실측 후 조정한다.**

| 구성 | 평시 |
|---|---|
| Ubuntu (헤드리스) + Docker | 0.8 GB |
| PostgreSQL 17 (`shared_buffers 256MB`) | 0.8 GB |
| Redis 7 (`maxmemory 256MB`) | 0.4 GB |
| **Spring Boot ×1** (heap 512MB) | 0.9 GB |
| nginx · cloudflared · tinyproxy | 0.13 GB |
| Prometheus · Grafana | 0.6 GB |
| Loki · Promtail | 0.5 GB |
| **Actions self-hosted runner** | **0.25 GB** |
| **합계** | **≈ 4.35 GB** (여유 3.65) |
| 앱 2대로 올리면 | ≈ 5.25 GB (여유 2.75) |

> ⚠️ **데스크톱 환경이 최대 변수다.** GNOME이 1.5~2GB를 먹는다. **SSH로만 접속하는 헤드리스 운영**이 전제다.

> **여유가 필요한 이유는 PostgreSQL의 OS 페이지 캐시다.** 다행히 `trip_seat` 48만 행이 인덱스 포함 100MB 안쪽이라 통째로 캐시에 올라간다 — **8GB가 빠듯해 보여도 이 워크로드에는 충분하다.**

### 폐기된 것 — 2026-09-10

| 폐기 | 이유 |
|---|---|
| **Proxmox VE 8** | 8GB에 하이퍼바이저 + VM 다수는 불가능 |
| **VLAN 4분리 (물리)** | 개인 PC · NIC 1개 |
| **step-ca** | 내부 mTLS 대상이 없다 (컨테이너 간 통신) |
| **외장 USB RAID** | **R2 하나로 간다** — 원본과 운명을 공유하지 않는 사본이 목적 |
| 내부 레지스트리 · 의존성 미러 | 단일 호스트에 과잉. `ghcr.io` pull로 충분 |

> **"폐쇄망"의 근거가 물리 분리에서 논리 분리로 내려간다.** 축소이므로 그대로 기록한다 — VLAN을 쓴다고 써놓고 Docker 네트워크를 쓰면 그게 거짓말이다.

## Cloudflare

| 서비스 | 용도 |
|---|---|
| **Tunnel** (`cloudflared`) | **아웃바운드 연결**로 집 서버 노출 — 포트포워딩 · 공인 IP · DDNS 전부 불필요 |
| **DNS** | `jomin4.cloud` — **가비아 등록 · 네임서버를 Cloudflare로 위임** |
| **Pages** | 웹 호스팅 · **프리뷰 배포** |
| **R2** | 백업 버킷 |
| **Access** | 관리 페이지(Grafana) 접근 제어 |
| WAF · Rate Limiting | 기본 보호 |

### 도메인 배치

| 이름 | 대상 | 경로 |
|---|---|---|
| `jomin4.cloud` · `www` | 웹 (React) | **Pages** — 터널을 안 탄다 |
| **`api.jomin4.cloud`** | 예매 API | **Tunnel → nginx → app** |
| `grafana.jomin4.cloud` | Grafana | Tunnel → ⚠️ **Access 필수** |

> **내 PC로 들어오는 건 API와 관리 페이지뿐이다.** 웹은 Cloudflare 안에서 호스팅되므로 노출면이 그만큼 줄어든다.

## DevOps

| 구분 | 선택 |
|---|---|
| 소스 | GitHub |
| CI | **GitHub Actions** |
| 이미지 레지스트리 | `ghcr.io` + 내부 미러 |
| **CD (폐쇄망)** | **self-hosted runner** — 인바운드 불필요 |
| 배포 실행 | **Docker Compose** (호스트 준비는 Ansible) |
| 시크릿 | SOPS + age |
| DB 마이그레이션 | Flyway |

### 트랙별 배포처

| 트랙 | 빌드 | 배포처 |
|---|---|---|
| **웹** | **Cloudflare Pages** | Pages CDN |
| **모바일** | **EAS Build** (Expo 클라우드) | **GitHub Releases** — APK 직접 |
| **서버** | GitHub Actions → `ghcr.io` | **self-hosted runner가 pull** |

> **로컬 Android 빌드를 안 하는 이유** — Gradle 빌드가 **4GB+**를 쓰는데 그 8GB PC는 이미 서버로 4.1GB를 쓰고 있다. 돌리면 PostgreSQL이 스왑으로 밀린다.
>
> **Play Store에 안 올린다** — 개발자 계정 비용과 심사 대기만 얹는다. `features.md`가 이미 **iOS 배포를 범위 밖**으로 뒀다.

## 외부 연동

| 구분 | 선택 |
|---|---|
| 결제 PG | **토스페이먼츠** 단일 |
| 결제창 | 웹 · 모바일 인앱 · 인브라우저 |
| 외부 경로 | 앱 → **tinyproxy**(`net:dmz`) → 토스 |

**아웃바운드 화이트리스트 — 3곳**

| 목적지 | 용도 |
|---|---|
| 토스페이먼츠 | 결제 승인 |
| **`*.r2.cloudflarestorage.com`** | **암호화 백업 업로드** |
| **`discord.com`** | **운영 경보** (Alertmanager) |

## 하드웨어

| 항목 | 상태 | 사양 |
|---|---|---|
| **Ubuntu 개인 PC** | ✅ 보유 | **RAM 8GB · SSD 512GB** |

> **추가 구매가 없다.** 관리형 스위치는 VLAN 철회와 함께 목록에서 빠졌고, 백업은 R2(클라우드)로 옮겨 물리 매체가 필요 없다.

## 미확정

| 항목 | 선택지 |
|---|---|
| 백엔드 언어 | Java 유지 vs Kotlin 전환 |
| 도메인 · 공유기 설정 | 논의 예정 |

## 관련 문서

| 문서 | 내용 |
|---|---|
| [overview.md](overview.md) | 프로젝트 주제 · 기획 |
| [features.md](features.md) | 기능정의서 25건 |
| [data.md](data.md) | 데이터 설계 · ERD |
| [research.md](research.md) | 코레일 · 타사 조사 결과 |
