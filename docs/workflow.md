# 개발 워크플로우

확정일 2026-09-10

> **설계 문서다.** 실제 설정 파일은 세팅 시점에 부록의 원본을 복사해 만든다. 그때 조정될 수 있다.

## §0 이 문서의 범위

| | **이 문서 (`workflow.md`)** | `deploy.md` (미작성) |
|---|---|---|
| 답하는 질문 | **"사람과 세션이 어떻게 협업하나"** | **"코드가 어떻게 배포되나"** |
| 다루는 것 | worktree · 브랜치 · 커밋 · PR · 리뷰 | CI 파이프라인 · 릴리스 · 롤백 |

---

## §1 병렬 개발 — `git worktree`

### 1.1 왜 필요한가

**트랙마다 Claude 세션을 따로 붙인다.** 한 폴더를 4세션이 공유하면 협업이 아니라 사고다.

| 문제 | 내용 |
|---|---|
| `git status` | 세션 A가 **B의 변경까지 본다** |
| `git add -A` | **남의 작업이 섞여 커밋된다** |
| 브랜치 | 하나만 체크아웃된다 — 4트랙이 같은 브랜치에 얹힌다 |

### 1.2 구성 — 저장소 1개 · 워킹 디렉터리 5개

```
pi-reservation-system/   develop    ← 본체. 통합 확인 + 문서 작업
../pi-back/              feat/back-*
../pi-front/             feat/front-*
../pi-mobile/            feat/mobile-*
../pi-infra/             feat/infra-*
```

```bash
git worktree add ../pi-back   -b feat/back-seat-hold
git worktree add ../pi-front  -b feat/front-seat-map
git worktree add ../pi-mobile -b feat/mobile-payment
git worktree add ../pi-infra  -b chore/infra-compose

git worktree list          # 현황
git worktree remove ../pi-back   # 작업 끝나면
```

| | **worktree** | 클론 4개 | 한 폴더 |
|---|---|---|---|
| `git status` 격리 | ✅ | ✅ | ❌ **불가능** |
| 브랜치 · 객체 | **공유** | 각자 fetch | — |
| 디스크 | 워킹 카피만 | 저장소 4벌 | — |

> **worktree의 "같은 브랜치를 두 곳에 못 연다"는 제약이 안전장치다.** 두 세션이 같은 브랜치를 만지는 사고가 **구조적으로 막힌다.**

### 1.3 세션 운영 규칙

| 규칙 | 내용 |
|---|---|
| **자기 트랙 밖을 고치지 않는다** | `back` 세션은 `front/`를 건드리지 않는다 |
| **세션 간 직접 소통 없음** | **PR과 `develop`을 통해서만** |
| 문서 변경 | **본체에서** `docs/*` 브랜치로 |
| `develop` 따라잡기 | 작업 중 수시로 `git merge origin/develop` |

> **`docs/`는 트랙에 속하지 않는다.** 설계 문서는 네 트랙 전부가 참조하므로 **한 곳(본체)에서만** 고친다. 두 세션이 같은 문서를 고치면 worktree도 못 막는다.

---

## §2 브랜치

| 브랜치 | 역할 | 보호 |
|---|---|---|
| **`main`** | **배포 가능 상태** · 릴리스 태그 | 직접 push 금지 |
| **`develop`** | 통합 | 직접 push 금지 |
| `<type>/<track>-<slug>` | 작업 | — |

**명명**

| 타입 | 트랙 | 예 |
|---|---|---|
| `feat` `fix` `chore` `docs` `refactor` `test` | `back` `front` `mobile` `infra` `api` `docs` | `feat/back-seat-hold` |
| | | `fix/front-timer-drift` |
| | | `chore/infra-ufw-rules` |
| | | `docs/api-mock-server` |

> **타입을 앞에 두는 이유** — 커밋 타입과 어휘가 같아진다. **브랜치 목록과 로그가 같은 방식으로 읽힌다.**

---

## §3 ⚠️ 계약 PR이 구현 PR보다 먼저

**4트랙 병렬의 가장 큰 위험이다.** `api.md` 계약이 `back` · `front` · `mobile` 셋에 동시에 걸린다.

```
세션 A(back)가 엔드포인트를 바꾸는 동안
세션 B(front)는 옛 계약으로 짜고 있다
          ↓
통합에서 깨진다
```

**규칙**

| 순서 | PR | 내용 |
|---|---|---|
| **1** | **`docs/api-*`** | `api.md` + `openapi.yaml` — **먼저 `develop`에 머지** |
| 2 | `feat/back-*` | 구현 |
| 2 | `feat/front-*` · `feat/mobile-*` | 생성 타입으로 구현 |

> **`openapi.yaml`이 단일 진실이면 계약 위반이 컴파일 에러가 된다.** `front`·`mobile`이 각자 타입을 생성하므로(`tech.md`) **옛 계약으로 짠 코드는 타입이 안 맞아 빌드가 깨진다** — 사람이 대조할 일이 없다.

PR 템플릿의 **"API 계약 변경" 칸**이 이 규칙의 집행 지점이다. "있음"에 체크하면 **선행 PR 번호를 적어야** 한다.

---

## §4 커밋 — Conventional Commits + 트랙 스코프

```
feat(back): 좌석 선점 유스케이스 추가
fix(front): 백그라운드 복귀 시 선점 타이머 재계산
docs(api): §7 Mock 서버
chore(infra): tinyproxy 화이트리스트에 R2 추가
test(back): 6석 원자성 동시 요청 시나리오
```

| 항목 | 값 |
|---|---|
| 타입 | `feat` `fix` `docs` `chore` `refactor` `test` `perf` |
| **스코프** | **`back` `front` `mobile` `infra` `api` `docs`** — 트랙과 일치 |
| 본문 | 필요할 때만. **왜 그렇게 했는지** |
| 꼬리말 | Claude가 작성 시 `Co-Authored-By:` |

> **스코프가 트랙인 게 핵심이다.**
> ```bash
> git log --oneline | grep "(back)"     # back 트랙 이력만
> git log --first-parent develop        # PR 단위로만
> ```
> 저장소는 하나여도 **로그는 넷으로 읽힌다.**

> **Claude가 커밋을 쓰므로 규약이 실제로 지켜진다.** 사람이 손으로 쓸 때 가장 먼저 무너지는 게 커밋 컨벤션인데, 그 부분이 자동화된다.

---

## §5 Pull Request

### 5.1 템플릿

`.github/PULL_REQUEST_TEMPLATE.md` — 부록 B.

| 칸 | 왜 있나 |
|---|---|
| **트랙** | 4트랙이 섞이므로 한눈에 |
| 무엇을 | 한 줄 |
| ⚠️ **API 계약 변경** | **§3 규칙의 집행 지점** |
| **근거 문서** | `docs/xxx.md §N` · `ADR-000N` |
| 검증 | 어떻게 확인했나 |
| 체크리스트 | 금지사항 · 문서 동기화 |

> **"근거 문서" 칸이 이 프로젝트에 특히 필요하다.** 설계를 문서로 먼저 정하고 구현하므로, **PR이 어느 절을 구현했는지**가 드러나야 문서가 안 낡는다. 문서에 없는 걸 구현하려 한다면 **문서부터 고치는 PR**이 먼저다.

### 5.2 초안 PR

| 상태 | Gemini 리뷰 |
|---|---|
| Draft | ❌ 자동 리뷰 안 함 (`include_drafts: false`) |
| Ready | ✅ 자동 |
| 수동 | `/gemini review` 언제든 |

> **Claude가 작업 중인 초안까지 리뷰받으면 소음이다.** 준비되면 Ready로 바꾸거나 `/gemini review`로 직접 부른다.

---

## §6 머지 · 릴리스

### 6.1 머지 전략 — 양쪽 다 머지 커밋

| 경로 | 방식 |
|---|---|
| `feat/* → develop` | **Merge commit** |
| `develop → main` | **Merge commit** + 태그 |

> **Squash를 쓰지 않는 이유는 §4와 맞물린다.** Squash하면 개별 커밋이 사라져 **트랙 스코프로 로그를 걸러내는 게 무의미해진다.** 이력을 보존하면 두 가지 시야가 다 생긴다.
>
> | 명령 | 보이는 것 |
> |---|---|
> | `git log develop` | **모든 커밋** — 트랙 스코프로 필터 가능 |
> | `git log --first-parent develop` | **PR 단위만** — 깨끗한 요약 |

**대가** — 로그가 길어진다. `--first-parent`가 그 대가를 상쇄한다.

### 6.2 브랜치 보호

| 항목 | 설정 |
|---|---|
| 직접 push | **금지** (`main` · `develop`) |
| **필수 체크** | **CI 통과** (§7) |
| 사람 승인 | **필수로 걸지 않는다** |
| Gemini 리뷰 | **차단 조건 아님** — 참고 의견 |

> **1인 프로젝트에서 승인을 필수로 걸면 무의미한 클릭이 늘 뿐이다.** 자기 PR을 자기가 승인하는 건 형식이다.
>
> **실제 게이트는 CI다.** 그래서 §7의 금지사항 검사에 힘을 실었다 — **사람의 주의력이 아니라 기계가 막는다.**

### 6.3 릴리스

| 항목 | 값 |
|---|---|
| 형식 | **`v0.1.0`** — 마일스톤 단위 |
| 시점 | `develop → main` 머지 시 |
| SemVer 엄격 | ❌ 포트폴리오라 불필요 |

---

## §7 금지사항 검사 — CI가 막는다

### 7.1 ⚠️ 검사 로직을 `.github/workflows` 밖에 둔다

> **Gemini Code Assist는 `.github/workflows` 파일을 리뷰 대상에서 제외한다** (안전하지 않은 구성 유입 방지).

```
scripts/check-forbidden.sh      ← 봇이 리뷰한다 · 로컬에서도 돌린다
.github/workflows/ci.yml        ← 호출만. 봇 제외 대상
```

> **검사 로직이 워크플로 안에 있으면 그 로직이 잘못돼도 봇이 못 잡는다.** 셸 스크립트로 빼두면 **리뷰도 받고 로컬에서도 돌아간다.**

### 7.2 검사 목록

| # | 금지 | 근거 |
|---|---|---|
| 1 | `back/domain`에 의존성 추가 | ADR-0001 |
| 2 | `api(project(":domain"))` | ADR-0001 |
| 3 | `SKIP LOCKED` | ADR-0002 |
| 4 | compose에 `ports:` | `infra.md` §2.1 |
| 5 | 전역 `lock_timeout` | `infra.md` §3.2 |
| 6 | `409`를 `ERROR`로 로깅 | `operate.md` §1 |
| 7 | `trip_seat`에 `CONCURRENTLY` 없는 `CREATE INDEX` | `data.md` §9.4 |

스크립트 원본은 **부록 C**.

> **이 7개가 우리가 문서에 박아둔 금지 사항 중 기계로 판정 가능한 전부다.** 나머지(설계 의도 위반·가독성)는 봇의 몫이다.
>
> **기계로 막을 수 있는 걸 봇에게 맡기지 않는다.** 봇은 놓칠 수 있지만 **CI는 못 지나간다.**

---

## §8 코드 리뷰 — Gemini Code Assist

### 8.1 설치

| 항목 | 내용 |
|---|---|
| 형태 | **Enterprise 버전 (미리보기)** · `gemini-code-assist[bot]` |
| 경로 | **Google Cloud 콘솔** → Gemini Code Assist 에이전트 및 도구 → Code Assist 소스 코드 관리 |
| 연결 | **Developer Connect** — 항상 `us-east1` |
| ⚠️ 전제 | **유효한 결제 계정 연결 필수.** 없으면 봇이 응답하지 않는다 |
| 비용 | 미리보기 중 과금 없음 |
| 할당량 | PR 100개 이상/일 |

> ⚠️ **"GitHub App만 설치하면 끝"이 아니다.** 공식 문제 해결 항목이 **"응답이 없으면 결제 계정부터 확인하라"**로 시작한다.

### 8.2 설정 파일 2개

| 파일 | 성격 |
|---|---|
| `.gemini/config.yaml` | **정해진 스키마** — 부록 A |
| `.gemini/styleguide.md` | **스키마 없음.** 자연어. 표준 프롬프트를 확장 |

**커스텀 스타일가이드 위반은 심각도 임계값에 안 걸러진다** — 공식 문서가 "일반적으로 기준을 충족하거나 초과한다"고 명시한다.

### 8.3 `styleguide.md`는 `CLAUDE.md`와 다른 문서다

| | `CLAUDE.md` | **`.gemini/styleguide.md`** |
|---|---|---|
| 독자 | **Claude — 코드를 *쓸* 때** | **Gemini — *잡을* 때** |
| 내용 | 결정 사항 전체 | **위반을 잡아낼 규칙만** |
| 길이 | 길다 | **짧게** |

> **참조로 떼우지 않는다.** "자세한 건 `docs/adr/`를 보라"고 쓰면 **봇이 안 읽을 수 있다.** 규칙을 자족적으로 적는다.

### 8.4 호출

| 명령 | 동작 |
|---|---|
| `/gemini review` | 코드 리뷰 |
| `/gemini summary` | 변경 요약 |
| `/gemini <질문>` | PR 맥락 질의 |
| `/gemini help` | 명령 목록 |

---

## 부록 A — `.gemini/config.yaml`

```yaml
have_fun: false

code_review:
  disable: false
  comment_severity_threshold: MEDIUM
  max_review_comments: -1
  pull_request_opened:
    help: false
    summary: true          # 4트랙 병렬 — 어느 트랙 무엇인지 요약이 통합에 도움
    code_review: true
    include_drafts: false  # 작업 중 초안은 소음

ignore_patterns:
  - "docs/diagrams/**"     # archify 생성 HTML — 각 700KB
  - "docs/wireframes/**"   # 생성 HTML
  - "**/*.lock"
  - "**/build/**"
  - "**/node_modules/**"
```

| 선택 | 근거 |
|---|---|
| `summary: true` | 4트랙이 섞이니 요약이 통합 판단에 쓰인다 |
| `include_drafts: false` | 초안 리뷰는 소음 · 필요하면 `/gemini review` |
| `MEDIUM` | 커스텀 규칙 위반은 어차피 임계 이상. 소음이 많으면 `HIGH`로 |
| `ignore_patterns` | **700KB 생성 HTML에 리뷰를 낭비하지 않는다** |

## 부록 B — `.github/PULL_REQUEST_TEMPLATE.md`

```markdown
## 트랙
- [ ] back  - [ ] front  - [ ] mobile  - [ ] infra  - [ ] docs

## 무엇을
<한 줄>

## ⚠️ API 계약 변경
- [ ] 없음
- [ ] 있음 → 선행 계약 PR: #___

## 근거 문서
<docs/xxx.md §N · ADR-000N>

## 검증
<어떻게 확인했나 — 테스트 · 쿼리 · 화면>

## 체크
- [ ] 금지 사항 위반 없음 (CI가 검사)
- [ ] 설계 문서와 어긋나면 문서도 함께 고쳤다
```

## 부록 C — `scripts/check-forbidden.sh` (초안)

> **세팅 시 실제 경로에 맞춰 검증할 것.** 아래는 규칙을 코드로 옮긴 초안이다.

```bash
#!/usr/bin/env bash
set -uo pipefail
fail=0
violate() { echo "❌ $1"; fail=1; }

# 1) :domain 은 의존성 0 (ADR-0001)
if [ -f back/domain/build.gradle.kts ]; then
  grep -nE '^\s*(implementation|api|compileOnly|runtimeOnly)\s*[("]' \
    back/domain/build.gradle.kts \
    && violate ":domain 에 의존성이 추가됐다 — ADR-0001"
fi

# 2) api(project(":domain")) 금지 — implementation 이어야 한다 (ADR-0001)
grep -rn 'api(project(":domain"))' back/ \
  && violate 'api(project(":domain")) — implementation 이어야 한다'

# 3) SKIP LOCKED 금지 — 부분 성공이 생긴다 (ADR-0002)
grep -rniE 'skip[[:space:]_]+locked' back/ \
  && violate "SKIP LOCKED — 6석 원자성이 깨진다 (ADR-0002)"

# 4) compose 포트 공개 금지 (infra.md §2.1)
grep -rnE '^[[:space:]]*ports:' infra/ \
  && violate "compose 에 ports: — Docker 는 ufw 를 우회한다 (infra.md §2.1)"

# 5) 전역 lock_timeout 금지 — SET LOCAL 로만 (infra.md §3.2)
grep -rn 'lock_timeout' infra/ | grep -vi 'set local' \
  && violate "전역 lock_timeout — 선점 200ms vs 마이그레이션 3s"

# 6) 409 를 ERROR 로 로깅 금지 (operate.md §1)
grep -rniE 'log\.error.*(conflict|409|seat_already_held)' back/ \
  && violate "409 를 ERROR 로 — 경합은 정상 결과다 (operate.md §1)"

# 7) trip_seat 인덱스는 CONCURRENTLY (data.md §9.4)
grep -rn --include='V*.sql' -iE 'create[[:space:]]+index' back/ \
  | grep -i 'trip_seat' | grep -vi 'concurrently' \
  && violate "trip_seat 인덱스에 CONCURRENTLY 누락 (data.md §9.4)"

[ $fail -eq 0 ] && echo "✅ 금지 사항 위반 없음"
exit $fail
```

---

## 관련 문서

| 문서 | 내용 |
|---|---|
| [adr/README.md](adr/README.md) | 금지 사항의 근거 |
| [api.md](api.md) | §3 계약 — 선행 PR 규칙의 대상 |
| [infra.md](infra.md) | §2.1 `ports:` · §3.2 `lock_timeout` |
| [operate.md](operate.md) | §1 로그 레벨 정책 |
| [data.md](data.md) | §9.4 마이그레이션 규칙 |
| `deploy.md` (미작성) | CI 파이프라인 · 릴리스 절차 |
