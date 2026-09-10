# pi-reservation-system

코레일 전산망 구조를 벤치마킹해 현대 기술로 재구성한 **폐쇄망 기반 좌석 예매 시스템**. 포트폴리오 목적.

> **2026-09-10 인프라 전제 변경.** 배포 대상이 **32GB Proxmox 호스트 → 8GB Ubuntu 개인 PC**로 바뀌었다. 하이퍼바이저 · VLAN 물리 분리 · step-ca · 외장 USB 백업이 함께 빠지고, **Docker 네트워크 3분리 + Cloudflare R2 백업**으로 대체했다.

> **2026-09-04 키오스크 채널 철회.** 하드웨어 확보와 오프라인 결제 계약이 현실적으로 불가능. 임베디드 트랙 · 비회원 예매 · mTLS 디바이스 인증 · 티켓 출력이 함께 사라졌다. 서사를 **다채널 → 좌석 동시성 중심**으로 재정의했다.

## 먼저 읽을 것

| 문서 | 내용 |
|---|---|
| [docs/overview.md](docs/overview.md) | 프로젝트 주제 · 기획 · 범위 |
| [docs/features.md](docs/features.md) | **기능정의서 25건 (P0 21)** — 초기 릴리스 범위 확정 |
| [docs/data.md](docs/data.md) | **데이터 설계 §0~§9 완료** — ERD 12개 · 동시성 · 상태 전이 · Redis · 시드 · 쿼리 계획 · Flyway |
| [docs/api.md](docs/api.md) | **API · DTO · Error.** §0~§6 작성, §7 Mock 서버 미작성 |
| [docs/operate.md](docs/operate.md) | **관측 · 로그 · 모니터링 §0~§7 완료** — 레벨 정책 · 대시보드 4계층 · 경보 10건 |
| [docs/infra.md](docs/infra.md) | **인프라 §0~§10** — 호스트 · 네트워크 · 컨테이너 · 백업 · 보안 · 한계 |
| [docs/workflow.md](docs/workflow.md) | **개발 워크플로우 §0~§9** — worktree · 브랜치 · 커밋 · **이슈·칸반** · PR · 금지사항 CI · Gemini |
| [docs/deploy.md](docs/deploy.md) | **배포 설계 §0~§13** — CI/CD 7워크플로 · 네임스페이스 · Discord · **롤백** |
| [docs/tech.md](docs/tech.md) | 확정된 기술 스택 |
| [docs/research.md](docs/research.md) | 코레일 · 타사 조사 결과 (재조사 불필요) |
| **[docs/adr/](docs/adr/)** | **아키텍처 결정 기록 6건.** 되돌리기 비싼 결정만. **불변 — 바뀌면 새 ADR** |
| [docs/search/](docs/search/) | 조사 문서. `korail-auth.md` 인증·인가 · `korail-trip-data.md` 운행정보 |
| [docs/diagrams/](docs/diagrams/) | 아키텍처 다이어그램 (archify · 독립 HTML) |
| [docs/wireframes/](docs/wireframes/) | 웹 · 모바일 화면 |

### 다이어그램

| 파일 | 내용 |
|---|---|
| `system-architecture` | **시스템 전체 아키텍처** — 단일 호스트 · **Docker 네트워크 3분리** · 외부 출구 3곳. 기준 그림 |
| `backend-hexagonal` | 백엔드 헥사고날 — 포트 · 어댑터 경계 |
| `backend-gradle-modules` | Gradle 멀티모듈 8개 · 의존 방향 |
| **`redis-workloads`** | **Redis 워크로드 4개 — 캐시 vs 진실의 출처** |
| **`deployment-topology`** | **배포 3트랙 + 터널이 아웃바운드라는 것** |

> 수정은 `*.architecture.json`을 고친 뒤 `archify deliver`로 재생성. HTML을 직접 편집하지 말 것.

## 협업 방식 — 반드시 지킬 것

| 규칙 | 내용 |
|---|---|
| **단계적 논의** | 설계 문서를 한 번에 쏟아내지 말 것. 주제 하나씩 → 대안·트레이드오프 제시 → 사용자 판단 → 확정 → 다음 |
| **문서 스타일** | **표 중심.** 긴 서술 금지. 결론은 인용구 한 줄 |
| **설계 의도** | `> **의도**` 블록으로 남길 것 — 왜 그렇게 했는지가 스펙보다 오래 간다 |
| 확정 전 | 문서를 먼저 쓰지 말고 구조안을 보여준 뒤 승인받을 것 |
| **ADR** | 되돌리기 비싼 결정은 [docs/adr/](docs/adr/)에 기록. **기준 3개를 다 만족할 때만** (`adr/README.md`) |
| 사용자 배경 | 백엔드 · 프론트 · 보안 · 인프라 · DevOps 전반 지식 보유. 기초 설명 생략 가능 |

## 확정된 것

### 언어

| 역할 | 언어 |
|---|---|
| 백엔드 | Java 21 (Kotlin 전환은 미확정) |
| 프론트 계열 (웹 · 모바일) | TypeScript |

### 스택

| 영역 | 선택 |
|---|---|
| 백엔드 | Spring Boot 4.1 · 모듈러 모놀리스 · Gradle(Kotlin DSL) |
| DB | **PostgreSQL 17** — 좌석의 진실 |
| 캐시 · 이벤트 | **Redis 7** — 좌석맵 캐시 + **Stream**(SSE 팬아웃 · 재개) |
| 프론트 | React 19+Vite(웹) · React Native+Expo(모바일) — **`front`/`mobile` 각자 독립** (workspace로 안 묶는다) |
| 인프라 | **Ubuntu 24.04 헤드리스 단일 호스트** · Docker Compose · **Docker 네트워크 3분리** · nginx · tinyproxy · Ansible(호스트 준비만) |
| 백업 | **Cloudflare R2** — `pg_dump` → **`age` 암호화** → `rclone` · 일 1회 |
| 외부 | **Cloudflare** — Tunnel · DNS · **Pages** · Access · R2 |
| **도메인** | **`jomin4.cloud`** — 가비아 등록 · **네임서버를 Cloudflare로 위임** |
| **모바일 배포** | **EAS Build**(클라우드) → **GitHub Releases**(APK) · EAS Update(OTA) |
| CI/CD | GitHub Actions + **self-hosted runner** (폐쇄망 pull 방식) |

### 구조

| 항목 | 결정 |
|---|---|
| 클라이언트 | **웹 · 모바일 2개.** 기능 동일, 같은 API |
| 인증 | **JWT 단일.** 웹·모바일 동일 |
| **회원** | **실제 회원가입.** 이메일 인증 · 비밀번호 재설정 · 변경은 범위 밖 |
| **예매 자격** | **로그인 회원만.** 비회원 예매 없음 |
| 예약번호 | **8자리 숫자 무작위.** 식별용이며 **조회 열쇠가 아니다** — 조회는 로그인으로만 |
| **토큰** | Access JWT 15분 / Refresh 14일 · **Redis 저장** · 회전 |
| **결제 PG** | **토스페이먼츠** 단일 · 웹·모바일 인앱 결제창 |
| 네트워크 | **`net:dmz` 만 인터넷 노출.** `net:app` · `net:data` 는 폐쇄 · **PG·Redis 호스트 포트 미노출** |
| 앱 서버 | **평시 1대 · 실증 시 2대**(`--scale app=2`). **nginx는 1대일 때도 앞에 둔다** |
| 외부 출구 | **tinyproxy 화이트리스트 3곳** — 토스페이먼츠 · `*.r2.cloudflarestorage.com` · **`discord.com`**(경보) |
| 실시간 전파 | **SSE** (코레일 폴링 → 개선). Cloudflare Tunnel 때문에 **하트비트 필수** |
| 좌석 선점 | 최대 6석 · **전부 성공 또는 전부 실패** · TTL 10분 |

### 저장소 구조 (확정 — 2026-09-10)

**단일 모노레포.** 최상위 4개가 작업 트랙 4개와 1:1이다.

```
pi-reservation-system/
├── back/       Spring Boot · Gradle 멀티모듈 8개 (settings.gradle.kts 여기)
├── front/      React 19 + Vite
├── mobile/     React Native + Expo
├── infra/      compose · ansible · nginx · tinyproxy 설정
├── docs/       설계 문서 · ADR · 다이어그램 · 와이어프레임
└── CLAUDE.md
```

| 항목 | 결정 |
|---|---|
| 저장소 | **1개** — `api.md` 계약이 세 트랙에 동시에 걸리므로 한 커밋에서 함께 움직여야 한다 |
| Gradle | `back/settings.gradle.kts` — **루트에 두지 않는다** (pnpm과 안 부딪히게) |
| CI | Actions **`paths:` 필터**로 트랙별 분리 |
| 빌드 루트 지정 | Cloudflare Pages → `front/` · EAS → `mobile/` |

### 배포 (확정 — `deploy.md`)

| 항목 | 결정 |
|---|---|
| **저장소 공개** | **public** — Actions 분 무제한 |
| ⚠️ **public + self-hosted** | **`pull_request`는 GitHub-hosted만.** self-hosted는 **`push`에만** — 남의 PR 코드가 내 PC에서 돌면 안 된다 |
| | `pull_request_target` **금지** |
| 워크플로 | **7 + `_notify` 1.** `front-cd.yml`은 **없다** — Pages가 한다 |
| **이미지 태그** | **`sha-<short>` 불변으로 배포** · `develop`·`v0.1.0`은 사람용 · **`latest` 금지** |
| 트랙별 태그 | ❌ **안 만든다** — 세 트랙이 같은 계약 위에 있다. `v0.1.0` 하나 |
| back CD | **빌드는 GitHub-hosted · 배포만 self-hosted** — 8GB에서 Gradle을 돌리지 않는다 |
| front CI | ⚠️ **`tsc --noEmit` 필수** — `vite build`는 타입 체크를 안 한다 |
| | **생성 타입 최신성 `diff` 검사** = 계약 선행 규칙의 집행 장치 |
| mobile CD | **`develop`=EAS Update(OTA) · 태그=EAS Build→APK→Release** |
| | CI는 정적 검사만 (`expo-doctor`) · EAS 큐 대기 **타임아웃 45분** |
| infra CD | self-hosted `pi-host` · ansible + compose |
| ⚠️ **concurrency** | **`group: deploy-host` 공유** — back CD·infra CD가 같은 호스트를 만진다 · `cancel-in-progress: false` |
| runner | **systemd 서비스** (컨테이너면 docker socket = root) · 라벨 `pi-host` · **+0.25GB** |
| 시크릿 | **Actions vs 호스트 분리.** `infra-cd`는 시크릿을 나르지 않는다 · `age` 개인키는 어디에도 안 둔다 |
| Discord | **채널 4개** · **성공은 안 알림**(CD만 예외) · **`_notify.yml`이 형식 독점** |
| **롤백** | **옛 `sha-` 태그로 `compose up` 다시.** 별도 기능이 아니다 |
| | ⚠️ **`--no-deps` 필수** — 없으면 PG·Redis 재생성 |
| | ⚠️ **마이그레이션 포함 배포는 롤백 불가** — Flyway `validate`가 먼저 막는다 |
| 함정 | **`paths` 필터 + 필수 체크 = pending 교착** · concurrency 누락 · EAS 큐 |

### 개발 워크플로우 (확정 — `workflow.md`)

| 항목 | 결정 |
|---|---|
| **병렬 개발** | **`git worktree` 5개** — 트랙마다 Claude 세션. 한 폴더 공유는 불가능 |
| | 본체 `develop`(문서) · `../pi-back` `../pi-front` `../pi-mobile` `../pi-infra` |
| 세션 규칙 | **자기 트랙 밖을 안 고친다** · 세션 간 소통은 **PR과 `develop`으로만** · **문서는 본체에서** |
| 브랜치 | `main` · `develop` · **`<type>/<track>-<slug>`** (`feat/back-seat-hold`) |
| ⚠️ **계약 선행** | **`docs/api-*` PR이 구현 PR보다 먼저 머지.** PR 템플릿의 "API 계약 변경" 칸이 집행 지점 |
| 커밋 | **Conventional + 트랙 스코프** — `feat(back):` · `git log \| grep "(back)"` |
| **머지** | **양쪽 다 merge commit** — squash하면 트랙 스코프 필터가 무의미해진다 |
| | `git log --first-parent develop` 으로 PR 단위 시야도 확보 |
| 브랜치 보호 | 직접 push 금지 · **필수 체크는 CI만** · 사람 승인·Gemini는 차단 조건 아님 |
| 릴리스 | `v0.1.0` 마일스톤 단위 · `develop → main` 시 태그 |
| **이슈 · 보드** | **일곱 번째 식별자 체계를 만들지 않는다** — `F-xx` · 트랙 · 커밋 어휘에 얹힌다 |
| 라벨 | **3축 네임스페이스** `track:` `type:` `prio:` (+ `status:needs-adr`) |
| 이슈 제목 | `<type>(<track>): <무엇> [F-xx]` — **F는 뒤에 대괄호로** |
| ⚠️ **범위 선행** | **F-번호 없는 새 기능은 `docs/features-*` PR을 먼저** — 계약 선행과 같은 원리 |
| 템플릿 | **3종** `task` · `bug` · `design` (+`config.yml`로 빈 이슈 차단) |
| | 판별 기준 = **필드가 실질적으로 다른가.** 조사는 `type:research` 라벨로 |
| 칸반 | **Todo → In Progress → In Review → Done.** 보드에는 **이슈만** (PR은 `Closes #`) |
| | 양 끝 자동 · 가운데 둘은 세션이 `gh`로 · **트랙별 뷰 4개** |
| WIP | In Progress 트랙당 1장 · **In Review 4장 = 통합 위험 신호** |
| **금지사항 CI** | **7종 grep** — `scripts/check-forbidden.sh` |
| | ⚠️ **`.github/workflows` 밖에 둔다** — Gemini가 그 디렉터리를 리뷰에서 제외하므로 |
| Gemini 리뷰 | **GCP + 결제계정 + Developer Connect(`us-east1`) 필수.** 미리보기 무료 · PR 100+/일 |
| | `.gemini/config.yaml` + `.gemini/styleguide.md` · `include_drafts: false` · `summary: true` |
| | **`styleguide.md`는 `CLAUDE.md`와 청중이 다르다** — 참조로 떼우지 말고 자족적으로 |

### 인프라 (확정 — `infra.md`)

| 항목 | 결정 |
|---|---|
| ⚠️ **Docker가 `ufw`를 우회한다** | 포트를 publish하면 **`ufw deny`를 무시하고 열린다.** 방어는 **"애초에 `ports:`를 안 쓰는 것"** |
| 포트 공개 | **compose 전체에 `ports:` 0개가 정상.** DB 접근은 `docker compose exec` |
| PostgreSQL | `shared_buffers 256MB` · `work_mem 4MB` · **`max_connections 50`** · Hikari 풀 10 |
| ⚠️ `lock_timeout` | **전역 설정 금지** — 선점 200ms vs 마이그레이션 3s. `SET LOCAL`로만 |
| nginx | ⚠️ **`proxy_buffering off`** 없으면 SSE가 조용히 안 된다 |
| JVM | `-Xmx` 대신 **`MaxRAMPercentage=70`** — `mem_limit` 한 곳만 고치면 된다 |
| 볼륨 | **bind mount** `/srv/pi/*` — named volume보다 백업·점검이 쉽다 |
| **시각** | **호스트 타임존 UTC** · `timesyncd`. **선점 TTL이 시각 기반**이라 시계가 튀면 만료가 어긋난다 |
| SSH | 공개키만 · **LAN에서만** (22를 인터넷에 안 연다) |
| **한계** | **호스트 = 단일 장애점.** `--scale app=2`는 **가용성이 아니라 팬아웃 실증**이다 |
| 먼저 터지는 것 | **① 메모리(스왑) → ② 커넥션 풀 → ③ 락 대기.** 디스크는 해당 없음 |

### 백엔드 구조 (확정)

| 항목 | 결정 | 이유 |
|---|---|---|
| 아키텍처 | **헥사고날 · 헥사곤 1개** | 컨텍스트 분할은 지금 규모에 보일러플레이트 과잉 |
| 경계 강제 | **Gradle 멀티모듈 8개** | `:domain`에 의존성을 안 넣어 컴파일 타임에 강제 |
| 도메인 · JPA | **완전 분리 + 매퍼** | 락 전략 · 더티체킹을 어댑터에 가둔다 |

```
:domain              의존성 0
:application         :domain            — 포트 선언 + 유스케이스
:adapter-web         :application       — REST · SSE
:adapter-scheduling  :application       — 선점 만료 회수
:adapter-persistence :application       — JPA 엔티티 · 매퍼 · 락
:adapter-cache       :application       — Redis 캐시 · Stream
:adapter-payment     :application       — 토스페이먼츠
:bootstrap           어댑터 5개          — 유일한 실행 모듈
```

> **의존 방향은 항상 안쪽.** 아웃바운드 어댑터도 `:application`을 의존하지 그 반대가 아니다.

### 데이터 설계 (확정 — `data.md` §1)

| 항목 | 결정 |
|---|---|
| 좌석 행 생성 | **eager** — 운행 생성 시 800행 선생성 |
| 좌석 주소 | **호차-행-열** · 10호차 × 20행 × 4열 = **800석** (`4호차 7A`) |
| 시드 규모 | 4역 · 20편/일 · 30일 = 600 운행 · **48만 좌석 행** |
| 중간역 | **4역 유지.** 좌석은 운행 전 구간 통짜 점유 |
| 테이블 | **12개** — `trip_seat`이 락이 걸리는 유일한 테이블 |
| **운임** | **`fare` 역 쌍 12행.** 좌석은 통짜 점유하되 **요금은 탄 구간만** |

### 마이그레이션 (확정 — `data.md` §9)

| 항목 | 결정 |
|---|---|
| 분담 | **Flyway = 스키마 · SeedRunner = 데이터** |
| 실행 | **앱 기동 시 자동.** 2대면 `pg_advisory_lock`이 직렬화 · 실패하면 앱이 안 뜬다 |
| 초기 스키마 | **`V1__init.sql` 한 파일** — 12테이블 전부 |
| ⚠️ **락 큐** | **`ALTER TABLE trip_seat`이 대기하면 뒤의 `SELECT`도 못 넘어간다** → **`lock_timeout 3s`** 걸고 실패 시 재시도 |
| 인덱스 추가 | **`CREATE INDEX CONCURRENTLY`** + `-- executeInTransaction=false` (Flyway 트랜잭션을 풀어야 한다) |
| 롤링 배포 | **하위 호환 강제.** 컬럼 삭제·이름변경·타입변경은 **2단계 이상** |
| `NOT NULL` 추가 | **`CHECK ... NOT VALID` → `VALIDATE CONSTRAINT`** (48만 행에 안전한 유일한 방법) |
| 롤백 | ❌ **forward-only** — 되돌리는 마이그레이션을 새로 쓴다 |
| 설정 | `clean-disabled=true` · `validate-on-migrate=true` · **`baseline-on-migrate=false`** |
| 함정 | **`baseline-on-migrate=true`면 빈 DB에서 `V1`을 건너뛴다** |

### 쿼리 계획 (확정 — `data.md` §8)

| 항목 | 결정 |
|---|---|
| **대원칙** | **`trip_seat`에 인덱스를 새로 만들지 않는다** — 인덱스 갱신이 곧 **락을 쥔 시간** |
| 잔여석 집계 | **매번 `COUNT` 800행.** ⚠️ **`trip.available_count` 카운터 컬럼 금지** — 운행 단위 직렬화로 되돌아간다 |
| ~~`(trip_id, status)`~~ | **안 만든다** — `status`가 가장 자주 바뀌는 컬럼. UNIQUE의 `trip_id` 접두로 충분 |
| `trip_seat` 부분 인덱스 | `(hold_id) WHERE NOT NULL` · `(reservation_id) WHERE NOT NULL` — 48만 중 대부분이 NULL |
| `seat_hold` | **`(expires_at) WHERE status='HELD'`** — 종착 3개가 누적돼도 인덱스는 안 자란다 |
| 만료 스캔 | **`LIMIT 200`** — 몰려도 한 사이클이 안 길어진다. 나머지는 lazy 판정이 메움 |
| **HOT 업데이트** | `status`에 인덱스가 없어 선점 대부분이 **HOT 경로**를 탄다 |
| 검증 | `EXPLAIN (ANALYZE, BUFFERS)` — **Q2에 `Sort`** 또는 **Q5에 `Filter`**가 보이면 실패 |

### 시드 설계 (확정 — `data.md` §7)

| 항목 | 결정 |
|---|---|
| 분담 | **Flyway = 스키마 · 러너 = 데이터.** 48만 행을 `.sql`에 박지 않는다 |
| **경계** | **행 많고 규칙 단순 → DB · 행 적고 규칙 복잡 → 애플리케이션** |
| `trip_seat` 48만 | **`CROSS JOIN` 한 방** — 러너가 행을 나르지 않는다 |
| 나머지 ①~⑤ | 애플리케이션 · **1,000행 배치** · `reWriteBatchedInserts=true` |
| 트랜잭션 | **단계별 커밋** — 6단계를 한 트랜잭션에 안 묶는다 |
| 멱등 가드 | **`trip` 행 수 > 0이면 skip** — 러너 첫 줄 |
| 열차번호 | **하행 홀수 · 상행 짝수** (실제 코레일 체계) |
| 검증 | 개수 대조 + **규칙 대조 2쿼리** (홀짝↔방향 · 좌석주소↔`seat_layout`) |
| 이음매 | **`TripSource`** — "운행을 어떻게 정하나"와 "행을 어떻게 넣나"를 분리 |

### Redis 설계 (확정 — `data.md` §6)

| 항목 | 결정 |
|---|---|
| **성격 구분** | **워크로드 4개 중 2개는 캐시가 아니라 진실** — 토큰 · 시도 제한은 PG에 사본이 없다 |
| 좌석맵 | **Hash** `seatmap:{tripId}` · 필드 `4-7-A` · **TTL 5분** · lazy 적재 |
| 갱신 | **무효화 아니라 `HSET` 델타** — SSE 델타와 같은 단위. 순서 역전은 수용 |
| Stream | `trip:{id}:events` · `XADD MAXLEN ~ 1000` · **Consumer Group 아님** (전 서버가 전부 받아야) |
| Refresh | `refresh:{jti}` + `member:{id}:refresh` Set · **재사용 탐지 시 전체 폐기** |
| 시도 제한 | `login:fail:{email}` · **`EXPIRE NX`** (매번 갱신하면 영구 잠금이 된다) · 키가 `email`인 이유는 존재 여부 은닉 |
| **장애 정책** | 캐시·SSE·시도제한 **fail-open** · Refresh만 **fail-closed** |
| ⚠️ **메모리 정책** | **`noeviction`.** `allkeys-lru`는 **토큰을 evict**해 로그인이 무작위로 풀린다 |
| 영속성 | **AOF `everysec`** — 진실이 있어서 필요 · DB 번호 논리 분리 안 함 |

### 동시성 설계 (확정 — `data.md` §4)

| 항목 | 결정 |
|---|---|
| 락 범위 | 선택한 **좌석 행만** (운행 전체 락 안 씀) |
| **잠금 순서** | `trip_seat.id` 오름차순 · 테이블 간 `trip_seat → seat_hold → reservation` |
| 대기 정책 | `FOR UPDATE` + **`lock_timeout` 200ms** (`SKIP LOCKED` 금지 — 부분 성공 발생) |
| CAS 가드 | `trip_seat.version` — 스케줄러 등 **락 밖 판단 경로** 방어 |
| **트랜잭션 경계** | **`TransactionRunner` 포트** — `:application` 선언, `:adapter-persistence` 구현 |
| 이벤트 발행 | **커밋 후 직접 발행**(`afterCommit`). 캐시 무효화와 SSE를 같은 블록에서 |
| 격리 수준 | `READ COMMITTED` |

### 하드웨어

| 항목 | 상태 |
|---|---|
| **Ubuntu 개인 PC (RAM 8GB · SSD 512GB)** | ✅ 보유 — **헤드리스 운영 전제** |

> **추가 구매가 없다.** 관리형 스위치는 VLAN 철회와 함께, 외장 스토리지는 R2 전환과 함께 목록에서 빠졌다.

### 메모리 예산 (추정 — 실측 후 조정)

| 구성 | 평시 |
|---|---|
| Ubuntu + Docker | 0.8 GB |
| PostgreSQL (`shared_buffers 256MB`) | 0.8 GB |
| Redis (`maxmemory 256MB`) | 0.4 GB |
| Spring Boot ×1 (heap 512MB) | 0.9 GB |
| nginx · cloudflared · tinyproxy | 0.13 GB |
| Prometheus · Grafana · Loki · Promtail | 1.1 GB |
| **Actions self-hosted runner** | **0.25 GB** |
| **합계** | **≈ 4.35 GB** (여유 3.65) |
| 앱 2대 시 | ≈ 5.25 GB |

> ⚠️ **GNOME이 1.5~2GB를 먹는다.** 데스크톱을 끄지 않으면 예산이 무너진다.
> **우선순위: 앱 2대 > Loki.** 둘 다 못 넣으면 Loki를 먼저 뺀다.

## 폐기된 접근 — 다시 제안하지 말 것

| 폐기 | 이유 |
|---|---|
| **키오스크 채널 · 임베디드 트랙** | **2026-09-04 철회.** 하드웨어·계약 불가 |
| **비회원 예매 · 비로그인 조회 · 조회 PIN** | 키오스크와 함께 철회 |
| **mTLS 디바이스 인증 · `DEVICE`/`GUEST` 역할** | 〃 — 인증은 JWT 하나 |
| **QR 위임 결제** | 키오스크 전용이었음 |
| Gen 0~5 세대별 서사 진행 | 사용자 철회 |
| AI · 게임 · 시스템 프로그래밍 요소 | 핵심 문제(동시성·정합성) 희석 |
| MySQL | PostgreSQL 확정 |
| Flutter · Kotlin Multiplatform 프론트 | TypeScript 통일 |
| **Vercel** | **Cloudflare Pages로 통일.** Vite 정적 SPA라 Next.js 특화 이점이 안 온다 (2026-09-10 재확인) |
| DNSZi | Cloudflare DNS로 통일 |
| **Play Store 등록** | 개발자 계정 비용 · 심사 대기. **APK 직접 배포**로 충분 |
| **로컬 Android 빌드** | 8GB PC가 서버로 돌고 있다. Gradle 빌드 4GB+ → **EAS 클라우드 빌드** |
| Kubernetes · MSA | VM 자원 한계 · 과잉 |
| **Redis Pub/Sub 팬아웃** | **2026-09-09 폐기.** 보관을 못 해 SSE 재개 불가 → **Stream 단독** |
| 좌석 구간 판매 | 복잡도 대비 가치. 확장 후보로 보류 |
| **Proxmox VE 8 · VM 다중화** | **2026-09-10 철회.** 8GB에 하이퍼바이저 불가 |
| **VLAN 물리 4분리 · 관리형 스위치** | 〃 — 개인 PC · NIC 1개 → **Docker 네트워크 3분리** |
| **step-ca 사설 CA** | 〃 — 내부 mTLS 대상이 없다 |
| **외장 USB RAID 백업** | 〃 — **R2 오프사이트 하나로** |
| 내부 레지스트리 · 의존성 미러 | 〃 — 단일 호스트에 과잉 |
| **공공데이터 실연동** | **2026-09-10 미채택.** 승인 대기가 일정 리스크 · 좌석·운임은 어차피 자체 생성 |

## 미확정

| 항목 | 선택지 |
|---|---|
| 백엔드 언어 | Java 유지 vs Kotlin 전환 |
| 공유기 구매 | **외부 연결에는 불필요**(터널). 모바일 실기기 테스트용 Wi-Fi가 유일한 이유 |
| **부하 생성 도구** | **2026-09-10 연기** — 초기 범위 밖. 폐기 아님. 검증 기준(초과 판매 0건)은 유지 |

## 다음 작업 후보

| 우선순위 | 문서 | 내용 |
|---|---|---|
| **1** | `docs/api.md` §7 · 부록 | **Mock 서버 · `openapi.yaml`** |
| 2 | — | **설계 완료. 세팅·구현 착수** |

### API 에러 규약 (확정 — `api.md` §4)

| 항목 | 결정 |
|---|---|
| 포맷 | **RFC 9457 Problem Details** + `code` · `requestId` 확장 |
| 코드 체계 | `리소스_상황` · `SCREAMING_SNAKE_CASE` |
| **결제 미확정** | **`202 Accepted` + `PAYMENT_PENDING`** — 200도 5xx도 아니다 |
| 좌석 409 구분 | `SEAT_ALREADY_HELD`(다른 좌석 고르세요) vs `SEAT_LOCK_TIMEOUT`(다시 시도) |
| 매핑 위치 | **`:adapter-web` 에만** — 도메인 예외는 HTTP를 모른다 |
| `5xx` | `detail` 없음. `requestId`만 준다 |

### 관측 설계 (확정 — `operate.md`로 분리)

| 항목 | 결정 |
|---|---|
| 문서 분리 | **`operate.md`.** 로그·메트릭은 클라 계약이 아니라 운영 방식 |
| **레벨 정의 축** | **심각도가 아니라 "누가 언제 봐야 하는가"** (`operate.md` §1.2) |
| | `ERROR` 사람이 개입해야 복구 · `WARN` 늘면 곤란 · `INFO` 사후 추적용 · `DEBUG` 재현용 |
| `TRACE` | **쓰지 않는다** — `DEBUG`와 경계가 갈린다 |
| **레벨 정책** | **`409`는 `INFO`** — 경합은 정상 결과. `ERROR`로 찍으면 로그 I/O가 병목이 된다 |
| | 락 타임아웃·`429`·`403`·`202` = `WARN` · **미아 결제·`500` = `ERROR`** |
| 원칙 | **`ERROR`는 사람이 개입해야 하는 것만** |
| 금지 | **HTTP 상태 코드로 레벨을 정하지 말 것** — `4xx`=`WARN`은 `409`를 전부 경고로 만든다 |
| 트레이싱 | **안 넣는다** — `requestId` + 타이밍 필드로 대체. VM 자원 없음 |
| 로깅 책임 | **`:domain` 금지 · `:application`부터 SLF4J API만** (구현체는 `:bootstrap`) |
| 마스킹 | **화이트리스트** — 찍을 필드를 명시. 블랙리스트는 빼먹으면 샌다 |
| 수집 | **Loki + Promtail · Prometheus · Grafana** + **익스포터 3종** (node · postgres · redis) = **1.18GB** |
| ~~cAdvisor~~ | **안 넣는다** — 컨테이너별 분해에 100MB는 아깝다. `docker stats`로 |
| **`imageTag` 필드** | **모든 로그에 고정.** 없으면 "이 에러가 언제부터"를 배포와 대조할 수 없다 |
| 헬스체크 | `/actuator/health` — ⚠️ **Redis를 `UP` 조건에 안 넣는다** (fail-open 설계가 무의미해진다) |
| **대시보드** | **계층 4개** — ①인프라(USE) ②앱(Golden Signals) ③데이터 ④**좌석 경합(나중·직접)** |
| | **1~3은 커뮤니티 것을 가져다 쓴다.** 4번만 우리 것 |
| | ⚠️ **에러율에 `4xx`를 넣지 말 것** — `409` 때문에 대시보드가 상시 빨개진다 |
| **경보** | **`#alert` 하나 + mention 유무.** 채널을 더 안 나눈다 · **critical 10개만** |
| | **초반 warning 없음** — 대시보드로 본다 · `resolved`는 critical만 |
| **백업 경보** | **dead man's switch** — 성공을 기록하고 **36시간 부재**를 경보 |
| ⚠️ 대사 쿼리 | **경보에서 뺀다** — 자동 측정이 아니다. **검증 절차**로 |
| Redis 다운 | **경보 아님** — fail-open이라 예매는 된다 |
| 소음 억제 | `for:` · `group_by` · `repeat_interval 4h` · **`inhibit_rules`**(원인 하나에 알림 하나) |
| 전송 | **Discord 웹훅** — `DISCORD_WEBHOOK_ALERT` (호스트 `.env`) |
| 메시지 | `[계층] 경보명` + **조치 한 줄** — 없으면 받고도 뭘 할지 모른다 |

### SSE 계약 (확정 — `api.md` §6)

| 항목 | 결정 |
|---|---|
| 구독 단위 | **운행 1개** — 호차 필터는 클라이언트가 한다 |
| **인증** | **없음.** `EventSource`가 커스텀 헤더를 못 보내고, 좌석맵 조회가 이미 비인증 |
| 대가 | **개인 알림(선점 만료 등)을 SSE에 못 싣는다.** 클라 타이머 + 서버 lazy 판정으로 대체 |
| 페이로드 | **델타 + `cause`** — `cause` 5종이 `TS-1`~`TS-5`와 1:1 |
| 재개 | §5.1 `lastEventId` → `Last-Event-ID`(SSE 표준 헤더) → Stream 재생 |
| 보관 | **운행당 1000건** (`XADD MAXLEN ~ 1000`) — 시간 기준보다 메모리 상한이 확정된다 |
| 재개 실패 | **`resume-failed` 이벤트** — RFC 9457을 못 쓰는 유일한 실패 경로 |
| 하트비트 | **15초 named event** · 클라 45초 무수신 시 재연결 |
| **팬아웃** | ⚠️ **Redis Stream 단독 — Pub/Sub 폐기.** Pub/Sub은 보관을 못 해 재개를 구현할 수 없다 |
| 미해결 | **재연결 폭주** — `EventSource`는 지수 백오프/지터 불가. 실측 후 대응 |

### 엔드포인트 규약 (확정 — `api.md` §5)

| 항목 | 결정 |
|---|---|
| 상태 머신 | **`data.md` §5가 진실.** `api.md` §5는 `TS-n`/`SH-n`/`PM-n`/`RV-n`으로 **참조만** |
| 결제 2단계 | `payment-intent`가 **`payment` 행을 `REQUESTED`로 생성** (금액 위변조 대조용) → `payment`가 승인 |
| 결과 조회 | **`GET /holds/{id}/payment`** — `POST`로 착각하면 이중 결제 |
| `DELETE /holds/{id}` | 이미 만료·해제여도 **`204` 멱등** |
| 좌석맵 응답 | **`lastEventId` 포함** — SSE 구독 시작점 |
| 취소 | `DELETE`가 아니라 **`POST .../cancel`** |
| 로그인 실패 | **`INVALID_CREDENTIALS` 하나로 통일** (계정 존재 여부 은닉) |
| `F-36` 차단 | **`429` + `Retry-After: 300`** — 영구 잠금 아님 |

### 완료

| 문서 | 상태 |
|---|---|
| `docs/overview.md` | ✅ 2026-09-04 재작성 — 동시성 중심 서사 |
| `docs/features.md` | ✅ 25건 (P0 21 · P1 4). 철회 ID 11개 |
| `docs/data.md` | ✅ **§0~§9 전체 완료** — ERD 12개 · 동시성 · 상태 전이 · Redis · 시드 · 쿼리 계획 · Flyway |
| **`docs/infra.md`** | ✅ **§0~§10** — 호스트 · Docker 네트워크 3분리 · 백업 · 보안 · 한계 |
| **`docs/workflow.md`** | ✅ **§0~§9 + 부록 5** — 설정 파일 원본 포함 (실제 생성은 세팅 때) |
| **`docs/deploy.md`** | ✅ **§0~§13** — 워크플로 7+1 · 네임스페이스 · 시크릿 경계 · Discord · 롤백 |
| `docs/tech.md` | ✅ 임베디드 스택 제거 |
| `docs/search/korail-auth.md` | ✅ 코레일 인증 · 인가 조사 |
| `docs/search/korail-trip-data.md` | ✅ 코레일 운행정보 조사 — **공공데이터 미채택 근거 포함** |
| `docs/wireframes/web.html` | ✅ 화면 11 + 예외 3 |
| `docs/wireframes/mobile.html` | ✅ 화면 11 + 예외 4 (`E-04` 백그라운드 복귀는 모바일 전용) |
| `docs/api.md` | ✅ §0~§6 — 계약 원칙 · 리소스 · **DTO 경계** · **에러 설계** · **엔드포인트** · **SSE 계약** |
| `docs/operate.md` | ✅ §0~§7 — **레벨 정책** · 상관관계 · 마스킹 · 메트릭 · 수집 · **대시보드 4계층** · **경보 10건** |
| **`docs/adr/`** | ✅ **ADR 6건 + 템플릿 + 색인** (0001~0006) |
| `docs/diagrams/` × 5 | ✅ 전체 아키텍처 · 헥사고날 · Gradle 모듈 · Redis 워크로드 · **배포 토폴로지** |

## 작업 트랙 (병렬)

| # | 트랙 | 산출물 |
|---|---|---|
| 1 | 백엔드 | Spring API · Docker 이미지 |
| 2 | 웹 | React SPA → Cloudflare Pages |
| 3 | 모바일 | React Native APK |
| 4 | 인프라 · DevOps | Ubuntu 단일 호스트 · Docker Compose · CI/CD |
