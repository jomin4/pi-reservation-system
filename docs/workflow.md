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
| **1** | **`docs/api-*`** | `api.md` + **`docs/api/openapi.yaml`** — **먼저 `develop`에 머지** |
| 2 | `feat/back-*` | 구현 |
| 2 | `feat/front-*` · `feat/mobile-*` | 생성 타입으로 구현 |

> **`openapi.yaml`이 단일 진실이면 계약 위반이 컴파일 에러가 된다.** `front`·`mobile`이 각자 타입을 생성하므로 **옛 계약으로 짠 코드는 타입이 안 맞아 빌드가 깨진다** — 사람이 대조할 일이 없다.
>
> **양방향이 잠긴다** (ADR-0007) — 백엔드도 `generateOpenApiDocs` 산출 스펙이 계약과 다르면 CI가 막는다(`deploy.md` §6.1). **Flyway의 `validate-on-migrate`와 같은 역할이다.**

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

## §5 이슈와 칸반 보드

### 5.1 원칙 — 일곱 번째 식별자 체계를 만들지 않는다

이 프로젝트엔 식별자가 이미 여섯이다.

| 체계 | 예 | 소유 |
|---|---|---|
| **`F-xx`** | `F-04` | `features.md` |
| **`ADR-000N`** | `ADR-0002` | `docs/adr/` |
| `§N.M` | `data.md` §4.5 | 각 설계 문서 |
| 트랙 | `back` `front` `mobile` `infra` | 저장소 구조 |
| 브랜치 | `feat/back-seat-hold` | §2 |
| 커밋 스코프 | `feat(back):` | §4 |

> **이슈와 보드는 새 번호를 발급하지 않고 기존 것에 얹힌다.** 일곱 번째를 만들면 "이 이슈가 어느 기능인지"를 사람이 대조하게 된다.

### 5.2 전체 흐름

```
features.md  F-04
      ↓
   이슈 #12       라벨: track:back  type:feat  prio:P0
      ↓           제목: feat(back): 좌석 선점 API [F-04]
  ┌─────────┐
  │  Todo   │  ← 이슈 생성 시 자동
  └────┬────┘
       │  worktree + 브랜치  feat/back-seat-hold
  ┌────▼─────────┐
  │ In Progress  │
  └────┬─────────┘
       │  PR 열기 (본문에 Closes #12) → Gemini 자동 리뷰
  ┌────▼─────────┐
  │  In Review   │  ← Gemini + CI 대기
  └────┬─────────┘
       │  develop 머지 → 이슈 자동 종료
  ┌────▼────┐
  │  Done   │
  └─────────┘
```

> **보드에는 이슈만 올린다.** PR은 `Closes #12`로 매달리고 별도 카드가 되지 않는다 — **둘 다 올리면 같은 일이 두 장으로 보인다.**

### 5.3 라벨 — 3축 네임스페이스

`<축>:<값>`. 목록이 축별로 묶여 보인다. 전체 목록은 **부록 D**.

| 축 | 값 | 출처 |
|---|---|---|
| **`track:`** | `back` `front` `mobile` `infra` `docs` | **커밋 스코프와 동일** |
| **`type:`** | `feat` `fix` `chore` `docs` `refactor` `research` | **커밋 타입과 동일** |
| **`prio:`** | `P0` `P1` | **`features.md` 그대로** |
| `status:` | `blocked` `needs-decision` **`needs-adr`** | 신규 (최소) |

> **`track:`과 `type:`이 커밋 어휘와 같다.** 라벨 → 브랜치 → 커밋이 한 단어로 이어진다.
>
> ```
> 라벨    track:back  type:feat
> 브랜치  feat/back-seat-hold
> 커밋    feat(back): 좌석 선점 유스케이스 추가
> ```

**`status:needs-adr`** — ADR 기준 3개를 만족하는 결정이 이슈에서 나왔다는 표시. **구현 전에 ADR을 쓰라는 뜻**이다.

### 5.4 이슈 제목

```
<type>(<track>): <무엇>  [F-xx]
```

| 예 | 비고 |
|---|---|
| `feat(back): 좌석 선점 API [F-04]` | 기능 |
| `fix(front): 백그라운드 복귀 시 타이머 어긋남` | 버그 — F 없음 |
| `research: EAS Build 무료 티어 한도` | 조사 — 트랙 없음 |

**F-번호는 뒤에 대괄호로** — 앞에 두면 F가 없는 이슈와 형식이 갈린다. 뒤에 두면 있으면 붙고 없으면 안 붙는다.

### 5.5 ⚠️ `features.md` 선행 규칙

| 상황 | 규칙 |
|---|---|
| F-번호 있음 | 바로 이슈 → 구현 |
| **F-번호 없는 새 기능** | ⚠️ **`docs/features-*` PR을 먼저** |

> **범위가 이슈에서 늘어나면 안 된다.** `features.md`는 "초기 릴리스 범위 확정" 문서인데, 이슈로 기능이 추가되기 시작하면 **그 문서가 곧 거짓말이 된다.** §3 계약 PR 선행과 같은 원리다.

### 5.6 템플릿 3종

`.github/ISSUE_TEMPLATE/` — 원본은 **부록 E**.

| 파일 | 덮는 범위 | 고유 필드 |
|---|---|---|
| **`task.yml`** | 기능 · 조사 · 잡일 · 리팩터링 | F-번호(선택) · 완료 조건 |
| **`bug.yml`** | 버그 | **`requestId`** · 재현 · 기대 vs 실제 |
| **`design.yml`** | 설계 변경 제안 | 대상 문서 §N · **ADR 기준 3개** |
| `config.yml` | (설정) | 빈 이슈 비활성 · 문서 링크 |

**판별 기준은 하나 — 필드가 실질적으로 다른가.** 조사 전용 템플릿을 두지 않는 이유가 이것이다. "답할 질문" 하나가 다를 뿐이고 나머지는 `task`와 같다. **구분은 `type:research` 라벨이 한다.**

> **`bug.yml`의 첫 칸이 `requestId`여야 한다.** `api.md` §2가 모든 에러 응답에 그 값을 넣고 `operate.md` §2.2가 그걸로 로그를 추적한다 — **리포트에 그 칸이 없으면 설계해둔 추적 경로를 안 쓰게 된다.**

> **`design.yml`이 ADR을 살린다.** `adr/README.md`에 기준 3개를 적어놨지만 **묻는 자리가 없으면 아무도 안 본다.** 폼에 체크박스로 박아두면 그 순간 판단이 강제된다.

### 5.7 보드 — 컬럼 4개

| 상태 | 뜻 | 나가는 조건 |
|---|---|---|
| **Todo** | 정의됐고 아직 안 잡음 | worktree + 브랜치 생성 |
| **In Progress** | 세션이 작업 중 | PR 열기 |
| **In Review** | **Gemini + CI 대기** | `develop` 머지 |
| **Done** | 머지됨 | — |

**전이 자동화**

| 전이 | 방법 |
|---|---|
| → **Todo** | ✅ **자동** — `Item added to project` |
| → **In Progress** | ⬜ **세션이** `gh project item-edit` — **유일한 수동** |
| → **In Review** | ✅ **자동** — `Pull request linked to issue` |
| → **Done** | ✅ **자동** — `Item closed` · `Pull request merged` |
| 이슈 종료 | ✅ **자동** — `Auto-close issue` |

**실제 세팅 (2026-09-10 확정)**

| 워크플로 | 설정 | 담당 전이 |
|---|---|---|
| `Auto-add to project` | 저장소 · **`is:issue is:open`** | 보드 등록 |
| `Item added to project` | `issue` → **Todo** | → Todo |
| **`Pull request linked to issue`** | **→ In review** | **→ In Review** |
| `Pull request merged` | → Done | → Done (동작 미확인) |
| `Item closed` | `issue` → **Done** | → Done |
| **`Auto-close issue`** | Done 이면 이슈를 닫는다 | 이슈 종료 |
| `Item reopened` | → In progress | Done 이탈 |

> **`Pull request linked to issue`가 `In review` 전이를 자동화한다.** PR 본문의 `Closes #`가 연결을 만들고(우리 PR 템플릿에 이미 있다), 그 순간 카드가 In Review로 간다.
>
> **`Auto-close issue`가 `Closes #`의 한계를 우회한다.** 카드가 Done이 되면 이슈를 닫으므로, **`develop` 머지에서 이슈가 안 닫히는 문제**가 사라진다.

⚠️ **`Pull request merged`가 "연결된 이슈"를 건드리는지 "PR 아이템"만 건드리는지 미확인.** 첫 PR을 돌려보면 확정된다. (a)면 무해한 no-op, (b)면 A안의 수동 단계가 사라진다.

### ⚠️ `Closes #`는 `develop` 머지에서 이슈를 안 닫는다

**GitHub은 기본 브랜치(`main`)에 머지될 때만** 연결된 이슈를 자동으로 닫는다. 우리 흐름은 `feat/* → develop → main`이라 **`develop` 머지로는 안 닫힌다.**

| 방치하면 | 카드가 In Review에 쌓여 **릴리스 때 한꺼번에** Done으로 간다 |
|---|---|
| 결과 | §5.9의 **"In Review 4장 = 통합 위험 신호"가 상시 켜진다** |

**해결 — `Auto-close issue` 워크플로가 우회한다.**

카드가 **Done이 되면 이슈를 닫는다**. `Closes #`가 아니라 **보드 상태가 트리거**라 브랜치를 안 가린다.

| 경로 | |
|---|---|
| PR 머지 → 카드 Done → **이슈 자동 종료** | `Pull request merged`가 (b)로 동작할 때 |
| 세션이 `gh issue close` → 카드 Done | 폴백 |

> **어느 쪽으로 시작해도 "닫힘 + Done"으로 수렴한다.** 두 워크플로가 반대 방향을 보지만 진동하지 않는다.

### ⚠️ `In Progress`만 자동화가 안 된다

**GitHub 내장 트리거에 "브랜치 생성"·"작업 시작"이 없다.** 검토한 대안:

| 대안 | 비용 | 판정 |
|---|---|---|
| 3컬럼으로 축소 (Draft PR = 시작) | ⚠️ **§5.9 In Review 신호를 잃는다** | ❌ |
| Actions + 브랜치명에 이슈번호 | ⚠️ **PAT 시크릿 추가** (`GITHUB_TOKEN`은 Projects 권한 없음) | ❌ |
| **세션이 `gh project item-edit`** | 0 | ✅ **채택** |

> **셋 다 사람 손은 0인데 마지막만 잃는 게 없다.** "수동"은 **GitHub이 안 한다**는 뜻이지 **사람이 한다**는 뜻이 아니다 — 세션 시작 프로토콜 5번이 그걸 실행한다.

> **다섯 전이 중 넷이 자동이다.** 남은 하나(`In Progress`)도 **세션이 실행하므로 사람 손은 0**이다.

### 5.8 뷰 구성 — 5개 (2026-09-10 확정)

| 뷰 | 레이아웃 | 필터 | 누가 보나 |
|---|---|---|---|
| **`Backlog`** | Board | — | **사람** — 전체 흐름 · 어디가 막혔나 |
| `back` | Board | `label:"track:back"` | back 세션 |
| `front` | Board | `label:"track:front"` | front 세션 |
| `mobile` | Board | `label:"track:mobile"` | mobile 세션 |
| `infra` | Board | `label:"track:infra"` | infra 세션 |

> ⚠️ **따옴표가 필요하다.** 라벨 이름 안에 `:`가 있어서 파서가 헷갈릴 수 있다 — **`축:값` 명명(§5.3)의 대가**다. 라벨 목록이 축별로 묶여 보이는 이득과 맞바꾼 것이다.

> ⚠️ **필터를 친 뒤 `Save changes`를 눌러야 남는다.** 안 누르면 탭을 옮기는 순간 날아간다.

> **worktree가 파일을 격리했다면 보드 뷰가 작업 목록을 격리한다.** 각 세션이 자기 트랙 뷰만 본다.

**지운 뷰 — 기본 템플릿이 만들어준 것들**

| 뷰 | 지운 이유 |
|---|---|
| `Team items` · `My items` | **1인 프로젝트.** 54건이 전부 내 것이다 |
| `Roadmap` | 마일스톤이 `v0.1.0` 하나뿐 — 빈 화면 |
| **`Priority board`** | ⚠️ **아래 참조** |

### ⚠️ `Priority board`를 지운 이유 — 두 곳에 같은 사실

Projects 내장 `Priority` **필드**로 그룹핑하는 뷰인데, 우리는 우선순위를 **`prio:P0` 라벨**(§5.3)로 넣었다. 필드가 비어 있어 **54건 전부 `No Priority`**로 뭉쳤다.

| 안 | 판정 |
|---|---|
| `Priority` 필드를 54건에 채운다 | ❌ **라벨과 필드가 같은 사실을 두 곳에 둔다** — 어긋난다 |
| 그룹핑을 끄고 `label:"prio:P0"` 필터 뷰로 | ⬜ 가능하지만 **43/54가 P0라 걸러지는 게 없다** |
| **뷰 삭제** | ✅ **채택** |

> **거의 전부가 P0인 목록에 P0 필터는 정보가 아니다.** 순서는 트랙 뷰의 이슈 번호가 정하고, P1만 보고 싶으면 `Backlog`에서 `label:"prio:P1"`을 그때 친다. **상주시킬 이유가 없다.**

### 5.9 WIP 제한

**`Backlog` 뷰에만 건다.** 컬럼 헤더 `⋯` → `Set limit`.

| 컬럼 | 제한 | 근거 |
|---|---|---|
| Todo | **없음** | 54건이 정상. ⚠️ **템플릿 기본값 5가 걸려 있으면 지운다** |
| **In Progress** | **4** | 트랙당 1장 × 세션 4개 |
| **In Review** | **4** | ⚠️ **4장 쌓이면 통합 위험 신호** |
| Done | 없음 | |

> **초과해도 막지 않는다. 헤더 숫자가 빨개질 뿐이다.** 그게 목적이다 — **차단이 아니라 신호.**

> ⚠️ **늘 빨간 신호는 신호가 아니다.** Todo에 제한을 남겨두면 헤더가 상시 빨개서 In Progress 초과를 못 알아본다.

> **In Review가 병목 지표다.** 네 트랙 PR이 동시에 대기 중이면 **서로 다른 계약 버전 위에 서 있을 가능성**이 커진다(§3). 그때는 새로 시작하지 말고 **머지부터 한다.**

> **트랙 뷰에는 안 건다.** WIP 제한은 뷰마다 따로 걸리는데, 초과를 알아챌 사람은 하나고 그 사람이 보는 창은 `Backlog`다.

### 5.10 초기 채우기

**`features.md`의 생존 25건(P0 21 · P1 4)을 이슈로 일괄 생성**하면 Todo가 채워진다. 마일스톤은 §7.3의 릴리스 태그와 같은 이름(`v0.1.0`)을 쓴다.

---

## §6 Pull Request

### 6.1 템플릿

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

### 6.2 초안 PR

| 상태 | Gemini 리뷰 |
|---|---|
| Draft | ❌ 자동 리뷰 안 함 (`include_drafts: false`) |
| Ready | ✅ 자동 |
| 수동 | `/gemini review` 언제든 |

> **Claude가 작업 중인 초안까지 리뷰받으면 소음이다.** 준비되면 Ready로 바꾸거나 `/gemini review`로 직접 부른다.

---

## §7 머지 · 릴리스

### 7.1 머지 전략 — 양쪽 다 머지 커밋

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

### 7.2 브랜치 보호

| 항목 | 설정 |
|---|---|
| 직접 push | **금지** (`main` · `develop`) |
| **필수 체크** | **CI 통과** (§8) |
| 사람 승인 | **필수로 걸지 않는다** |
| Gemini 리뷰 | **차단 조건 아님** — 참고 의견 |

> **1인 프로젝트에서 승인을 필수로 걸면 무의미한 클릭이 늘 뿐이다.** 자기 PR을 자기가 승인하는 건 형식이다.
>
> **실제 게이트는 CI다.** 그래서 §8의 금지사항 검사에 힘을 실었다 — **사람의 주의력이 아니라 기계가 막는다.**

### 7.3 릴리스

| 항목 | 값 |
|---|---|
| 형식 | **`v0.1.0`** — 마일스톤 단위 |
| 시점 | `develop → main` 머지 시 |
| SemVer 엄격 | ❌ 포트폴리오라 불필요 |

---

## §8 금지사항 검사 — CI가 막는다

### 8.1 ⚠️ 검사 로직을 `.github/workflows` 밖에 둔다

> **Gemini Code Assist는 `.github/workflows` 파일을 리뷰 대상에서 제외한다** (안전하지 않은 구성 유입 방지).

```
scripts/check-forbidden.sh      ← 봇이 리뷰한다 · 로컬에서도 돌린다
.github/workflows/ci.yml        ← 호출만. 봇 제외 대상
```

> **검사 로직이 워크플로 안에 있으면 그 로직이 잘못돼도 봇이 못 잡는다.** 셸 스크립트로 빼두면 **리뷰도 받고 로컬에서도 돌아간다.**

### 8.2 검사 목록

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

## §9 코드 리뷰 — Gemini Code Assist

### 9.1 설치

| 항목 | 내용 |
|---|---|
| 형태 | **Enterprise 버전 (미리보기)** · `gemini-code-assist[bot]` |
| 경로 | **Google Cloud 콘솔** → Gemini Code Assist 에이전트 및 도구 → Code Assist 소스 코드 관리 |
| 연결 | **Developer Connect** — 항상 `us-east1` |
| ⚠️ 전제 | **유효한 결제 계정 연결 필수.** 없으면 봇이 응답하지 않는다 |
| 비용 | 미리보기 중 과금 없음 |
| 할당량 | PR 100개 이상/일 |

> ⚠️ **"GitHub App만 설치하면 끝"이 아니다.** 공식 문제 해결 항목이 **"응답이 없으면 결제 계정부터 확인하라"**로 시작한다.

### 9.2 설정 파일 2개

| 파일 | 성격 |
|---|---|
| `.gemini/config.yaml` | **정해진 스키마** — 부록 A |
| `.gemini/styleguide.md` | **스키마 없음.** 자연어. 표준 프롬프트를 확장 |

**커스텀 스타일가이드 위반은 심각도 임계값에 안 걸러진다** — 공식 문서가 "일반적으로 기준을 충족하거나 초과한다"고 명시한다.

### 9.3 `styleguide.md`는 `CLAUDE.md`와 다른 문서다

| | `CLAUDE.md` | **`.gemini/styleguide.md`** |
|---|---|---|
| 독자 | **Claude — 코드를 *쓸* 때** | **Gemini — *잡을* 때** |
| 내용 | 결정 사항 전체 | **위반을 잡아낼 규칙만** |
| 길이 | 길다 | **짧게** |

> **참조로 떼우지 않는다.** "자세한 건 `docs/adr/`를 보라"고 쓰면 **봇이 안 읽을 수 있다.** 규칙을 자족적으로 적는다.

### 9.4 호출

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

## 부록 D — 라벨 목록

`gh label create` 로 일괄 생성한다. 색은 축별로 묶는다.

| 라벨 | 색 | 설명 |
|---|---|---|
| `track:back` | `#0E7490` | Spring · Gradle 멀티모듈 |
| `track:front` | `#0E7490` | React 19 + Vite |
| `track:mobile` | `#0E7490` | React Native + Expo |
| `track:infra` | `#0E7490` | Compose · Ansible · nginx |
| `track:docs` | `#0E7490` | 설계 문서 · ADR |
| `type:feat` | `#8B5CF6` | 새 기능 |
| `type:fix` | `#8B5CF6` | 버그 수정 |
| `type:chore` | `#8B5CF6` | 잡일 |
| `type:docs` | `#8B5CF6` | 문서 |
| `type:refactor` | `#8B5CF6` | 리팩터링 |
| `type:research` | `#8B5CF6` | 조사 → `docs/search/` |
| `prio:P0` | `#EF4444` | 초기 릴리스 필수 |
| `prio:P1` | `#F59E0B` | 있으면 좋음 |
| `status:blocked` | `#6B7280` | 다른 것에 막힘 |
| `status:needs-decision` | `#6B7280` | 사용자 판단 대기 |
| **`status:needs-adr`** | `#6B7280` | **구현 전 ADR을 써야 한다** |

## 부록 E — 이슈 템플릿

`.github/ISSUE_TEMPLATE/`

### `task.yml` — 기능 · 조사 · 잡일

```yaml
name: 작업
description: 기능 구현 · 조사 · 잡일 · 리팩터링
title: "<type>(<track>): "
body:
  - type: input
    id: feature-id
    attributes:
      label: F-번호
      description: features.md 에 있으면 적는다. 없는 새 기능이면 features.md PR 이 먼저다.
      placeholder: F-04
  - type: textarea
    id: what
    attributes:
      label: 무엇을
    validations: { required: true }
  - type: input
    id: source
    attributes:
      label: 근거 문서
      placeholder: data.md §4.5 · ADR-0002
  - type: textarea
    id: done
    attributes:
      label: 완료 조건
      description: 무엇이 되면 끝인가
    validations: { required: true }
```

### `bug.yml` — 버그

```yaml
name: 버그
description: 동작이 설계와 다르다
title: "fix(<track>): "
labels: ["type:fix"]
body:
  - type: input
    id: request-id
    attributes:
      label: requestId
      description: 에러 응답 본문이나 응답 헤더의 X-Request-Id
      placeholder: 7f3a9c21
  - type: textarea
    id: steps
    attributes:
      label: 재현 절차
    validations: { required: true }
  - type: textarea
    id: expected
    attributes:
      label: 기대 vs 실제
      description: 설계 문서의 어느 절과 어긋나는가
    validations: { required: true }
```

### `design.yml` — 설계 변경 제안

```yaml
name: 설계 변경
description: 코드보다 문서를 먼저 고쳐야 하는 건
title: "docs(<track>): "
labels: ["type:docs", "status:needs-decision"]
body:
  - type: input
    id: target
    attributes:
      label: 대상 문서 · 절
      placeholder: data.md §6.8
    validations: { required: true }
  - type: textarea
    id: why
    attributes:
      label: 지금 결정이 왜 안 맞나
      description: 전제가 바뀌었나, 처음부터 틀렸나
    validations: { required: true }
  - type: textarea
    id: alternatives
    attributes:
      label: 검토한 대안
    validations: { required: true }
  - type: checkboxes
    id: adr-criteria
    attributes:
      label: ADR 기준 — 셋 다 예면 ADR 을 쓴다
      options:
        - label: 되돌리기가 비싼가?
        - label: 대안을 실제로 저울질했나?
        - label: 6개월 뒤 "왜 이랬지?"를 물을 것 같나?
```

### `config.yml` — 설정

```yaml
blank_issues_enabled: false
contact_links:
  - name: 설계 문서
    url: https://github.com/<owner>/pi-reservation-system/tree/main/docs
    about: 결정된 내용은 여기 있다. 이슈를 열기 전에 확인할 것.
  - name: ADR
    url: https://github.com/<owner>/pi-reservation-system/tree/main/docs/adr
    about: 되돌리기 비싼 결정과 그 근거.
```

> **`blank_issues_enabled: false`** — 빈 이슈를 막아야 템플릿이 실제로 쓰인다. 열어두면 대부분 빈 이슈로 간다.

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
