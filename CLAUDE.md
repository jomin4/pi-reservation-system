# pi-reservation-system

코레일 전산망 구조를 벤치마킹해 현대 기술로 재구성한 **폐쇄망 기반 좌석 예매 시스템**. 포트폴리오 목적.

> **이 프로젝트가 증명하려는 것 하나** — **N개 요청이 같은 좌석을 동시에 노릴 때 정확히 1건만 성공한다.**

## 지금 무엇을 하고 있나

**설계 완료 → 구현 단계.** 설계 문서 9개 · ADR 7건 · 다이어그램 5개가 `docs/`에 있다.

> **진행 상황은 여기 안 적는다.** GitHub Projects 보드가 그 역할을 한다 (`workflow.md` §5).

---

## ⚠️ 이 파일은 색인이지 요약이 아니다

| | |
|---|---|
| ✅ 담는다 | **어느 질문에 어느 문서인가** · 규칙 · 금지 · 기록 의무 |
| ❌ 담지 않는다 | **설계 결정의 내용** — 그건 `docs/`가 갖는다 |

> **결정 내용을 여기 복사하면 두 곳이 어긋난다.** 설계 단계에서 실제로 네 번 어긋났다. **문서가 진실이고 이 파일은 지도다.**

## 문서 지도 — 질문에서 찾는다

| 이 질문이 생기면 | 여기 |
|---|---|
| 이 기능이 범위에 있나 · `F-xx`가 뭔가 | [features.md](docs/features.md) |
| 이 프로젝트가 뭘 하는 건가 | [overview.md](docs/overview.md) |
| 무슨 기술을 쓰기로 했나 | [tech.md](docs/tech.md) |
| 테이블·컬럼이 어떻게 생겼나 | [data.md](docs/data.md) §2~§3 |
| **좌석 락을 어떻게 잡나** | **[data.md](docs/data.md) §4** |
| 상태가 어떻게 바뀌나 | [data.md](docs/data.md) §5 |
| Redis 키를 어떻게 쓰나 | [data.md](docs/data.md) §6 |
| 시드 · 쿼리 계획 · 마이그레이션 | [data.md](docs/data.md) §7~§9 |
| **이 응답 형태가 맞나** | **`docs/api/openapi.yaml`** · [api.md](docs/api.md) §5 |
| 이 에러를 몇 번으로 | [api.md](docs/api.md) §4 |
| DTO를 어느 계층에 두나 | [api.md](docs/api.md) §3 |
| SSE 계약 | [api.md](docs/api.md) §6 |
| 백엔드 없이 화면을 어떻게 | [api.md](docs/api.md) §7 |
| **로그를 어느 레벨로** | **[operate.md](docs/operate.md) §1** |
| 메트릭 · 대시보드 · 경보 | [operate.md](docs/operate.md) §4~§7 |
| 호스트 · 네트워크 · 백업 | [infra.md](docs/infra.md) |
| 브랜치 · 커밋 · PR · 이슈 | [workflow.md](docs/workflow.md) |
| CI/CD · 릴리스 · 롤백 | [deploy.md](docs/deploy.md) |
| **왜 이렇게 정했나** | **[docs/adr/](docs/adr/)** |
| **이 에러 전에 본 적 있나** | **[docs/troubleshooting/](docs/troubleshooting/)** |
| 코레일은 어떻게 하나 | [docs/search/](docs/search/) · [research.md](docs/research.md) |
| 화면이 어떻게 생겼나 | [docs/wireframes/](docs/wireframes/) |
| 구조 그림 | [docs/diagrams/](docs/diagrams/) |

---

## 저장소 구조 — 트랙 경계

```
back/       Spring Boot · Gradle 멀티모듈 8개
front/      React 19 + Vite
mobile/     React Native + Expo
infra/      compose · ansible · nginx · tinyproxy
docs/       설계 문서 · ADR · 트러블슈팅 · 다이어그램
scripts/    check-forbidden.sh 등
```

| 규칙 | 내용 |
|---|---|
| **자기 트랙 밖을 고치지 않는다** | `back` 세션은 `front/`를 건드리지 않는다 |
| **세션 간 직접 소통 없음** | **PR과 `develop`을 통해서만** |
| `docs/` 변경 | **본체 worktree에서** `docs/*` 브랜치로 |

**각 트랙에 `CLAUDE.md`가 따로 있다** — 그 트랙의 스택 · 금지 · 자주 틀리는 것.

---

## 협업 방식 — 반드시 지킬 것

| 규칙 | 내용 |
|---|---|
| **단계적 논의** | 한 번에 쏟아내지 말 것. 주제 하나씩 → 대안·트레이드오프 → 사용자 판단 → 확정 |
| **문서 스타일** | **표 중심.** 긴 서술 금지. 결론은 인용구 한 줄 |
| **설계 의도** | `> **의도**` 블록으로 — 왜 그렇게 했는지가 스펙보다 오래 간다 |
| 확정 전 | 문서를 먼저 쓰지 말고 **구조안을 보여준 뒤 승인**받을 것 |
| 사용자 배경 | 백엔드 · 프론트 · 보안 · 인프라 · DevOps 전반. **기초 설명 생략 가능** |

## 세션 시작 프로토콜

```
1. worktree 확인          git worktree list
2. develop 따라잡기       git merge origin/develop
3. 보드에서 내 트랙 뷰 → 이슈 하나
4. 브랜치                 feat/<track>-<slug>
5. 카드를 In Progress 로
```

---

## ⚠️ 기록 의무 — 무엇을 어디에 남기나

| 상황 | 남기는 곳 |
|---|---|
| 작업 시작 | **이슈** + 보드 `In Progress` |
| 왜 그렇게 짰나 | **커밋 본문** (Conventional + 트랙 스코프) |
| **되돌리기 비싼 결정** | **[ADR](docs/adr/)** — 기준 3개를 다 만족할 때만 |
| **원인이 자명하지 않은 문제** | **[트러블슈팅](docs/troubleshooting/)** — 에러 메시지 원문 · **「막다른 길」을 비우지 말 것** |
| **설계와 다르게 구현해야 한다** | ⚠️ **설계 문서를 고치는 PR을 먼저** |

> **마지막 줄이 가장 중요하다.** **설계 문서에 없는 걸 구현하려 하면 문서부터 고친다.** 코드가 문서를 앞서가기 시작하면 **9개 문서가 한 달 만에 전부 거짓말이 된다.**

**계약이 걸린 변경은 순서가 있다** (`workflow.md` §3)

| 순서 | PR |
|---|---|
| **1** | `docs/api-*` — `api.md` + **`docs/api/openapi.yaml`** |
| 2 | `feat/back-*` · `feat/front-*` · `feat/mobile-*` |

---

## ⚠️ 절대 금지 — CI가 검사한다

`scripts/check-forbidden.sh` (`workflow.md` §8)

| # | 금지 | 근거 |
|---|---|---|
| 1 | `back/domain`에 **의존성 추가** | ADR-0001 |
| 2 | **`api(project(":domain"))`** — `implementation`이어야 한다 | ADR-0001 |
| 3 | **`SKIP LOCKED`** | ADR-0002 — 부분 성공이 생긴다 |
| 4 | compose에 **`ports:`** | `infra.md` §2.1 — **Docker는 `ufw`를 우회한다** |
| 5 | **전역 `lock_timeout`** | `infra.md` §3.2 — 선점 200ms vs 마이그레이션 3s |
| 6 | **`409`를 `ERROR`로 로깅** | `operate.md` §1 — 경합은 정상 결과 |
| 7 | `trip_seat` 인덱스에 **`CONCURRENTLY` 누락** | `data.md` §9.4 |

**CI가 안 잡지만 하면 안 되는 것**

| 금지 | 근거 |
|---|---|
| 도메인 객체를 **HTTP 응답에** 담기 | `api.md` §3 |
| `trip.available_count` **카운터 컬럼** | `data.md` §8.5 — 운행 단위 직렬화로 되돌아간다 |
| **`latest` 이미지 태그** | `deploy.md` §3 |
| `pull_request`에 **self-hosted runner** | `deploy.md` §2 — public 저장소 |
| Redis를 **헬스체크 `UP` 조건**에 | `operate.md` §4.4 — fail-open이 무의미해진다 |
| 에러율 메트릭에 **`4xx` 포함** | `operate.md` §6.4 — `409` 때문에 상시 빨개진다 |

---

## 폐기된 접근 — 다시 제안하지 말 것

| 폐기 | 이유 |
|---|---|
| **키오스크 채널 · 임베디드 트랙** | 2026-09-04 철회 (ADR-0003). 하드웨어·계약 불가 |
| **비회원 예매 · 비로그인 조회 · 조회 PIN** | 〃 함께 철회 |
| **mTLS 디바이스 인증 · QR 위임 결제** | 〃 — 인증은 JWT 하나 |
| MySQL · Flutter · Kotlin Multiplatform | PostgreSQL · TypeScript 통일 |
| **Vercel** · DNSZi | **Cloudflare 통일** — Vite 정적 SPA라 Next.js 이점이 안 온다 |
| Kubernetes · MSA | 자원 한계 · 과잉 |
| **Redis Pub/Sub 팬아웃** | ADR-0004 — 보관을 못 해 SSE 재개 불가 |
| **Proxmox · VLAN 물리분리 · step-ca · USB RAID 백업** | ADR-0005 · 0006 — 8GB 단일 호스트 |
| 내부 레지스트리 · 의존성 미러 | 단일 호스트에 과잉 |
| **Play Store 등록 · 로컬 Android 빌드** | `deploy.md` §8 — APK 직접 배포 · EAS 클라우드 |
| **공공데이터 실연동** | `search/korail-trip-data.md` §6 — 승인 대기가 일정 리스크 |
| 좌석 구간 판매 · 좌석 등급 · 할인 | 복잡도 대비 가치. 확장 후보 |
| Gen 0~5 세대 서사 · AI · 게임 요소 | 핵심 문제(동시성·정합성) 희석 |

## 미확정

| 항목 | 선택지 |
|---|---|
| 백엔드 언어 | Java 유지 vs Kotlin 전환 |
| 공유기 구매 | **외부 연결엔 불필요**(터널). 모바일 실기기 테스트용 Wi-Fi가 유일한 이유 |
| **부하 생성 도구** | **연기** — 폐기 아님. 검증 기준(초과 판매 0건)은 유지 |
