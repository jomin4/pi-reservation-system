# 배포 설계

확정일 2026-09-10

> **설계 문서다.** 실제 워크플로 파일은 세팅 시점에 만든다.
>
> **전제** — 저장소는 **public**, 호스트는 **8GB Ubuntu 단일 호스트**(ADR-0005).

## §0 범위

| | `workflow.md` | **이 문서 (`deploy.md`)** | `infra.md` |
|---|---|---|---|
| 답하는 질문 | 사람·세션이 **어떻게 협업하나** | **코드가 어떻게 거기까지 가나** | **무엇이 어디서 도나** |
| 다루는 것 | 브랜치 · 커밋 · PR · 이슈 | **CI/CD · 릴리스 · 알림 · 롤백** | 호스트 · 네트워크 · 컨테이너 |

---

## §1 워크플로 지도

| 파일 | 트랙 | 트리거 | **러너** |
|---|---|---|---|
| `back-ci.yml` | back | `pull_request` | GitHub-hosted |
| **`back-cd.yml`** | back | `push` develop · 태그 | **혼합** (§6) |
| `front-ci.yml` | front | `pull_request` | GitHub-hosted |
| ~~`front-cd.yml`~~ | — | — | **없다. Cloudflare Pages가 한다** |
| `mobile-ci.yml` | mobile | `pull_request` | GitHub-hosted |
| `mobile-cd.yml` | mobile | `push` develop · 태그 | GitHub-hosted |
| `infra-ci.yml` | infra | `pull_request` | GitHub-hosted |
| **`infra-cd.yml`** | infra | `push` develop | **self-hosted** |
| `release.yml` | 전체 | 태그 `v*` | GitHub-hosted |
| **`_notify.yml`** | — | `workflow_call` | GitHub-hosted |

> **`front-cd.yml`이 없는 게 경계를 가장 명확히 드러낸다.** "front CD는 우리가 안 한다"가 **파일 부재로** 표현된다. 빈 파일을 두는 것보다 낫다.

> **`_` 접두는 재사용 워크플로 표시다.** 정렬에서 앞에 오고, 직접 트리거되지 않는다는 게 이름에 드러난다.

---

## §2 ⚠️ public 저장소 + self-hosted runner

**public 저장소는 누구나 PR을 열 수 있다.** `pull_request`에서 self-hosted runner를 쓰면 **그 PR의 코드가 개인 PC에서 실행된다.** GitHub이 "self-hosted는 private에만 권장"하는 이유다.

**트리거로 막는다.**

| 이벤트 | 러너 | 근거 |
|---|---|---|
| `pull_request` | **GitHub-hosted만** | 남의 코드가 돌 수 있다 |
| **`push`** (develop · 태그) | self-hosted 허용 | **머지에는 쓰기 권한이 필요하다** |

> **`push`는 머지로만 발생하고 머지는 쓰기 권한이 필요하다** → **남의 코드가 self-hosted runner에 닿는 경로가 구조적으로 없다.**

**추가로 끄는 것**

| 항목 | 값 |
|---|---|
| `pull_request_target` | ❌ **쓰지 않는다** — 포크 PR에 시크릿이 노출된다 |
| Actions 설정 | **"Require approval for all external contributors"** |
| public 저장소 이득 | **Actions 분 무제한** — mobile CD의 `--wait` 부담이 사라졌다 |

---

## §3 네임스페이스 총람

**"가독성있게 관리"의 실체.** 식별자마다 형식을 못박는다.

| 대상 | 형식 | 예 |
|---|---|---|
| **Git 태그** | `v<major>.<minor>.<patch>` | `v0.1.0` |
| | ⚠️ **트랙별 태그 안 만든다** | ~~`back-v0.1.0`~~ |
| **이미지** | `ghcr.io/<owner>/pi-api:<tag>` | |
| ┗ **불변 · 배포용** | **`sha-<short>`** | `sha-abc1234` |
| ┗ 이동 · 사람용 | `develop` | |
| ┗ 릴리스 | `v0.1.0` | |
| ┗ ~~`latest`~~ | ❌ **안 쓴다** | |
| **APK** | `pi-mobile-<ver>.apk` | `pi-mobile-v0.1.0.apk` |
| **EAS 채널** | `preview` (develop) · `production` (main) | |
| **Release** | 제목·태그 `v0.1.0` · 첨부 APK | |
| **워크플로** | `<track>-<phase>.yml` · 재사용 `_` | `back-cd.yml` |
| **Job 이름** | `<track> · <무엇>` | `back · 이미지 빌드` |
| **Discord 웹훅** | `DISCORD_WEBHOOK_<채널>` | `DISCORD_WEBHOOK_CD` |

> **배포는 항상 불변 태그(`sha-`)로 한다.** `develop` 태그로 배포하면 **"지금 호스트에서 뭐가 도는지"를 알 수 없다.** 이동 태그는 사람이 보는 용도이고, compose가 참조하는 값은 `sha-`다.

> **트랙별 태그를 안 만드는 이유** — 세 트랙이 **같은 API 계약 위에** 서 있다(`workflow.md` §3). `back-v0.2.0`과 `front-v0.1.0`이 호환되는지를 사람이 관리하기 시작하면 **계약 선행 규칙이 무의미해진다.** 버전은 제품 하나에 하나다.

---

## §4 시크릿 경계

**Actions 시크릿과 호스트 시크릿은 다른 곳에 산다. 섞지 않는다.**

| 시크릿 | 사는 곳 | 쓰는 곳 |
|---|---|---|
| `GITHUB_TOKEN` | 자동 발급 | ghcr push |
| **`EXPO_TOKEN`** | **GitHub Secrets** | mobile CD |
| `DISCORD_WEBHOOK_CI` `_CD` `_RELEASE` | **GitHub Secrets** | `_notify.yml` |
| DB 비밀번호 · 토스 키 · R2 키 | **호스트** `/srv/pi/secrets/.env` | 컨테이너 |
| 터널 토큰 | **호스트** | `cloudflared` |
| **`age` 개인키** | ⚠️ **어느 쪽에도 두지 않는다** | 복구 시 수동 |
| `DISCORD_WEBHOOK_ALERT` | **호스트** | Alertmanager |

> **호스트 시크릿은 GitHub에 올라가지 않는다.** Actions가 호스트에 값을 주입하는 구조가 아니라, **호스트가 자기 `.env`를 갖고 있고 compose가 그걸 읽는다.**
>
> 그래서 **`infra-cd`는 시크릿을 나르지 않는다** — 설정 파일과 compose 정의만 반영한다. 값은 이미 호스트에 있다.

> **`DISCORD_WEBHOOK_ALERT`만 호스트 쪽인 게 맞다.** 그건 Actions가 아니라 **Alertmanager가 보내는 것**이다(`operate.md` §7).

---

## §5 self-hosted runner

### 5.1 설치 — systemd 서비스

| | **systemd 서비스** (채택) | 컨테이너 |
|---|---|---|
| docker 조작 | 호스트에서 직접 | ⚠️ **`/var/run/docker.sock` 마운트 필요** |
| 위험 | `docker` 그룹 권한만 | **socket = 사실상 root** |
| 부팅 자동 | `systemctl enable` | compose `restart` |

> ⚠️ **컨테이너로 돌리면 docker socket을 마운트해야 `compose up`을 할 수 있다.** 그건 **그 컨테이너에 호스트 root를 주는 것과 같다** — 폐쇄망을 주제로 한 프로젝트에서 자기 발등을 찍는 구성이다.

```
서비스: actions.runner.<owner>-pi-reservation-system.pi-host.service
사용자: 전용 계정 (docker 그룹)
작업 디렉터리: /srv/pi/runner
```

### 5.2 라벨

```yaml
runs-on: [self-hosted, pi-host]
```

> **`self-hosted`만 쓰지 않는다.** 나중에 러너가 늘면 **어느 머신인지 지목할 수 없다.** `pi-host`가 그 이름이다.

### 5.3 메모리 — 예산에 추가된다

| 구성 | 평시 |
|---|---|
| `infra.md` §1.1 기존 합계 | 4.10 GB |
| **+ Actions runner** | **+0.25 GB** |
| **수정 합계** | **≈ 4.35 GB** (여유 3.65) |

> **runner 자체는 가볍다** — 이미지는 **GitHub-hosted에서 빌드**하고 runner는 **pull과 compose만** 한다. Gradle 빌드를 여기서 돌리면 4GB를 먹지만, 그러지 않는 게 §6 설계다.

---

## §6 back — CI · CD

### 6.1 CI (`pull_request` · GitHub-hosted)

| 단계 | 명령 |
|---|---|
| 빌드 · 테스트 | `./gradlew build` |
| **금지사항 검사** | **`scripts/check-forbidden.sh`** (`workflow.md` §8) |
| 마이그레이션 검증 | Testcontainers PostgreSQL에 Flyway 적용 |

### 6.2 CD — ⚠️ 러너가 둘로 갈린다

| Job | 러너 | 하는 일 |
|---|---|---|
| `build-push` | **GitHub-hosted** | 이미지 빌드 → `ghcr.io` push |
| `deploy` | **self-hosted `pi-host`** | pull → `compose up` |

```yaml
jobs:
  build-push:
    runs-on: ubuntu-latest        # 8GB 호스트에서 Gradle 을 돌리지 않는다
    outputs:
      image_tag: sha-${{ github.sha }}
  deploy:
    needs: build-push
    runs-on: [self-hosted, pi-host]
    concurrency:
      group: deploy-host          # infra-cd 와 공유 (§9)
      cancel-in-progress: false
```

> **빌드를 8GB 호스트에서 돌리지 않는 게 이 분리의 이유다.** Gradle 빌드는 수 GB를 먹고, 그 호스트는 이미 PostgreSQL과 Redis를 안고 있다. **빌드는 클라우드에서, 배포만 호스트에서.**

**태그 부여**

| 트리거 | 붙는 태그 |
|---|---|
| `push` develop | `sha-<short>` + `develop` |
| 태그 `v*` | `sha-<short>` + `v0.1.0` |

**배포 명령**
```bash
IMAGE_TAG=sha-abc1234 docker compose up -d --no-deps app
```

---

## §7 front — CI만

**CD는 Cloudflare Pages가 한다.** git 연동 · 빌드 · 프리뷰 URL · 즉시 롤백까지.

### 7.1 Pages가 안 하는 것 = front CI가 하는 것

| 항목 | Pages | **front CI** |
|---|---|---|
| 빌드 · 배포 · 프리뷰 | ✅ | — |
| **타입 체크** | ❌ | ✅ **`tsc --noEmit`** |
| 린트 · 유닛 테스트 | ❌ | ✅ |
| **생성 타입 최신성** | ❌ | ✅ |

> ⚠️ **`vite build`는 타입 체크를 하지 않는다.** Pages 빌드가 통과해도 **타입 에러가 프로덕션에 나갈 수 있다** — `tsc --noEmit`이 front CI의 존재 이유다.

### 7.2 생성 타입 최신성 검사

`workflow.md` §3 **계약 선행 규칙의 집행 장치**다.

```bash
npx openapi-typescript ../docs/api/openapi.yaml -o /tmp/api.d.ts
diff /tmp/api.d.ts src/api/types.d.ts    # 다르면 실패
```

> **계약이 바뀌었는데 타입을 재생성 안 했으면 CI가 잡는다.** 문서에 규칙을 적는 것보다 확실하다. mobile CI도 같은 검사를 돈다.

### 7.3 Pages 설정

| 항목 | 값 |
|---|---|
| 루트 디렉터리 | **`front/`** |
| 빌드 명령 | `npm run build` |
| 출력 | `dist` |
| 프리뷰 | 브랜치·PR별 URL — ⚠️ **Cloudflare Access로 보호** |

---

## §8 mobile — CI · CD

### 8.1 CI — 정적 검사만

| 단계 | 명령 |
|---|---|
| 타입 | `tsc --noEmit` |
| 린트 · 테스트 | `eslint` · `jest` |
| **Expo 설정 정합성** | **`npx expo-doctor`** |
| 생성 타입 최신성 | §7.2와 동일 |

> **CI에서 앱을 빌드하지 않는다.** `eas build --local`이나 `expo prebuild`는 Android SDK + Gradle이 필요해 **10분 이상**이고 PR마다 돌릴 값이 없다. **`expo-doctor`가 설정 불일치를 대신 잡는다.**

### 8.2 CD — 두 갈래가 핵심이다

| 트리거 | 동작 | 결과 |
|---|---|---|
| **`push` develop** | **EAS Update** (OTA) | 채널 `preview` — **기존 APK가 스스로 갱신** |
| **태그 `v*`** | **EAS Build** → APK | **GitHub Release 첨부** |

> **이 갈림이 EAS를 쓰는 이유 전부다.** 개발 중에는 JS만 바뀌므로 **APK를 다시 안 깔아도 된다** — 앱을 재시작하면 새 번들이 내려온다. **릴리스 때만 실제 빌드를 돈다.**
>
> **네이티브가 바뀌면 OTA로는 안 된다** (Expo SDK 상향, 네이티브 모듈 추가). 그때는 태그를 찍어 새 APK를 낸다.

**`eas.json`**

```json
{
  "build": {
    "preview":    { "channel": "preview", "distribution": "internal",
                    "android": { "buildType": "apk" } },
    "production": { "channel": "production",
                    "android": { "buildType": "apk" } }
  }
}
```

| 선택 | 이유 |
|---|---|
| **APK** (AAB 아님) | Play Store에 안 올린다 — AAB는 스토어 전용 포맷 |
| `distribution: internal` | 설치 가능한 링크를 준다 |

**인증** — `EXPO_TOKEN` + `expo/expo-github-action`

### 8.3 ⚠️ 실질 리스크

| 리스크 | 내용 | 대응 |
|---|---|---|
| **빌드 큐 대기** | EAS 무료 티어는 **우선순위가 낮아 30분+** 가능 | `--wait` + **타임아웃 45분** · 초과 시 수동 다운로드 |
| Actions 분 | **public이라 무제한** | 문제없음 |
| OTA 한계 | 네이티브 변경엔 무효 | 태그 릴리스로 |

> **`--wait`를 쓰는 이유는 APK 파일이 필요하기 때문이다.** `--no-wait`면 즉시 끝나지만 **EAS 대시보드 링크만 남는다** — "GitHub Releases에 APK"라는 목표와 안 맞는다.

---

## §9 infra — CI · CD

### 9.1 CI (GitHub-hosted)

| 검사 | 명령 |
|---|---|
| compose 문법 | `docker compose config -q` |
| ansible | `ansible-playbook --check --diff` |
| YAML | `yamllint` |
| **금지사항** | **`scripts/check-forbidden.sh`** — `ports:` 검사가 여기서 걸린다 |

### 9.2 CD (self-hosted `pi-host`)

| 순서 | 동작 |
|---|---|
| 1 | runner가 저장소를 호스트에 체크아웃 |
| 2 | `ansible-playbook site.yml` — 호스트 설정 반영 |
| 3 | `docker compose up -d` — 컨테이너 정의 반영 |

**runner가 어떻게 일을 받나** — 인바운드 포트가 없는데도 배포가 되는 이유.

```
runner ──① 폴링 (아웃바운드)──▶ GitHub Actions
       ◀─② 작업이 그 응답으로 ──
       ──③ 결과 보고 (아웃바운드)─▶
```

> **Cloudflare Tunnel과 완전히 같은 원리다.** `cloudflared`가 터널을 걸고 요청이 그 통로로 내려오는 것처럼, **runner가 폴링을 걸고 작업이 그 응답으로 내려온다.** 폐쇄망에 **들어오는 연결이 하나도 없다.**

### 9.3 ⚠️ `concurrency` 공유

`back-cd`의 `deploy` job과 `infra-cd`가 **같은 러너, 같은 호스트, 같은 compose**를 만진다.

```yaml
concurrency:
  group: deploy-host          # 두 워크플로가 같은 값
  cancel-in-progress: false   # 배포 중간 취소가 더 위험하다
```

> **둘이 겹치면 compose가 중간 상태로 남는다.** `cancel-in-progress: false`인 이유도 같다 — **배포를 절반에서 끊는 게 끝까지 가는 것보다 위험하다.**

---

## §10 `release.yml` — 태그 오케스트레이션

태그 `v*` push 시 순서대로.

| 순서 | Job | 하는 일 |
|---|---|---|
| 1 | `release` | GitHub Release 생성 (`--generate-notes`) |
| 2 | `back` | 이미지에 `v0.1.0` 태그 추가 → 배포 |
| 3 | `mobile` | **EAS Build** → APK → **Release 첨부** |
| 4 | `notify` | Discord `#release` |

**태그 찍는 법**
```bash
git checkout main && git pull
git tag v0.1.0 && git push origin v0.1.0
```

> **front는 여기 없다.** `main` 머지 시점에 Pages가 이미 배포했다 — **릴리스가 front에게는 이벤트가 아니다.**

---

## §11 Discord 알림

### 11.1 채널 4개

| 채널 | 무엇이 오나 | 웹훅 |
|---|---|---|
| `#ci` | **CI 실패만** | `DISCORD_WEBHOOK_CI` |
| `#cd` | 배포 시작 · 성공 · 실패 | `DISCORD_WEBHOOK_CD` |
| `#release` | 릴리스 발행 | `DISCORD_WEBHOOK_RELEASE` |
| **`#alert`** | **운영 경보** (`operate.md` §7) | **호스트**의 `DISCORD_WEBHOOK_ALERT` |

### 11.2 대원칙 — 성공은 알리지 않는다

| 사건 | 알림 |
|---|---|
| CI 성공 | ❌ |
| **CI 실패** | ✅ |
| **CD 시작 · 성공 · 실패** | ✅ — **배포는 상태 변화라 알 값이 있다** |
| 릴리스 | ✅ |

> **`operate.md` §7과 같은 원리다** — "경보 목록이 짧아야 경보가 작동한다". **CI 성공을 매번 알리면 소음이 되고, 소음이 되면 실패를 놓친다.**

### 11.3 형식 — `_notify.yml`이 소유한다

| 요소 | 규약 |
|---|---|
| 제목 | **`<track> <phase> <결과>`** — `back CD 성공` |
| 필드 1 | 트랙 |
| 필드 2 | **커밋** `abc1234` + 링크 |
| 필드 3 | 결과 — 실패면 **실패한 단계 이름** |
| 필드 4 | **배포된 이미지 태그** (CD만) |
| 링크 | Actions 실행 · PR |

| 색 | 뜻 |
|---|---|
| `#EF4444` | CI · CD 실패 |
| `#22C55E` | 배포 성공 |
| `#F59E0B` | 경고 (금지사항 위반) |
| `#8B5CF6` | 릴리스 |

```yaml
# 호출부 — 각 워크플로는 값만 넘긴다
uses: ./.github/workflows/_notify.yml
with:
  track: back
  phase: CD
  result: failure
  failed_step: 이미지 push
  image_tag: sha-abc1234
```

> **7개 워크플로가 각자 Discord 페이로드를 만들면 형식이 7가지로 갈린다.** 재사용 워크플로 하나가 형식을 독점해야 **"정리된 형태"**가 유지된다.

### 11.4 ⚠️ 아웃바운드 화이트리스트가 3곳이 된다

| 목적지 | 용도 | 주체 |
|---|---|---|
| 토스페이먼츠 | 결제 승인 | 컨테이너 |
| `*.r2.cloudflarestorage.com` | 백업 | 컨테이너 |
| **`discord.com`** | **운영 경보** | **Alertmanager** |

> **Actions에서 보내는 알림은 클라우드라 제약이 없다.** 하지만 `operate.md` §7의 **Alertmanager는 호스트에서 나간다** — `tinyproxy` 화이트리스트에 세 번째가 추가된다. `infra.md` §5와 `system-architecture` 다이어그램을 함께 고쳤다.

---

## §12 롤백

**사용자가 없으니 운영 관점의 롤백은 필요 없다.** 그래도 되돌릴 수 있게 두는 이유는 둘이다.

| # | 이유 |
|---|---|
| 1 | **시연 중 사고** — 고칠 시간이 없을 때 명령 한 줄 |
| 2 | **제약 유지** — 이게 없으면 **`sha-` 불변 태그**와 **하위 호환 2단계 규칙**(`data.md` §9.5)이 근거를 잃는다 |

### 12.1 롤백은 별도 기능이 아니다

> **옛 이미지 태그로 `compose up`을 다시 하는 것.** `docker rollback` 같은 명령은 없다.

```bash
# 직전 태그는 Discord #cd 메시지에 있다
IMAGE_TAG=sha-def5678 docker compose up -d --no-deps app
curl -s localhost/actuator/health
```

**이미지가 로컬에 있으면 5~10초.**

| 요소 | 왜 |
|---|---|
| **`sha-`** | 불변 태그라 과거를 지목할 수 있다. `develop`로 되돌리면 **뭘로 돌아갔는지 모른다** |
| ⚠️ **`--no-deps`** | 없으면 **`postgres`·`redis`까지 재생성** — 롤백이 장애를 키운다 |

### 12.2 ⚠️ 마이그레이션이 포함된 배포는 롤백 불가

**두 겹으로 막힌다.**

| 겹 | 내용 |
|---|---|
| ① **Flyway 검증** | `validate-on-migrate: true`(`data.md` §9.7). DB에 `V2`가 적용됐는데 옛 이미지엔 `V1`만 있으면 → **"적용됐는데 로컬에 없는 마이그레이션" → 기동 거부** |
| ② 코드 | 뜬다 해도 삭제된 컬럼을 `SELECT`하다 죽는다 |

> **컬럼을 지웠는지와 무관하게, 마이그레이션이 하나라도 추가되면 Flyway가 먼저 막는다.**
>
> **그래서 `data.md` §9.5의 "컬럼 삭제는 2단계"가 롤백 조건이 된다.** 1단계(코드에서 사용 중단)만 배포해두면 **양쪽 이미지가 다 산다.**

### 12.3 트랙별

| 트랙 | 롤백 | 대안 |
|---|---|---|
| **back** | ✅ 즉시 | — |
| **front** | ✅ Pages 이전 배포 | — |
| **mobile OTA** | ✅ 분 단위 | 이전 업데이트 재발행 |
| **mobile APK** | ❌ | **새 릴리스뿐** |
| **DB 스키마** | ❌ | **앞으로 고친다** |

### 12.4 규칙

| 규칙 | |
|---|---|
| 배포 전 | 직전 `sha-` 태그가 **Discord `#cd`에 남는다** — 별도 기록 불필요 |
| 마이그레이션 포함 배포 | ⚠️ **롤백 불가로 취급.** 앞으로만 간다 |
| 롤백 판단 | **마이그레이션 없는 배포만** |

---

## §13 함정

| # | 함정 | 대응 |
|---|---|---|
| **1** | ⚠️ **`paths` 필터 + 필수 체크** | paths로 스킵된 체크가 **pending으로 남아 머지가 막힌다.** `dorny/paths-filter`로 조건 분기하거나 **스킵 시 성공 처리하는 더미 job** |
| 2 | `concurrency` 공유 누락 | back CD · infra CD가 같은 그룹 (§9.3) |
| 3 | EAS 큐 대기 | `--wait` 타임아웃 45분 (§8.3) |

> **1번이 가장 흔하게 물린다.** 트랙별 `paths` 필터를 쓰면서 브랜치 보호에 "CI 통과 필수"를 걸면, **`front`만 고친 PR이 `back-ci` pending으로 영원히 못 머지된다.**

---

## 관련 문서

| 문서 | 내용 |
|---|---|
| [workflow.md](workflow.md) | 브랜치 · 커밋 · PR · 금지사항 검사 |
| [infra.md](infra.md) | 호스트 · 메모리 예산 · 아웃바운드 화이트리스트 |
| [operate.md](operate.md) | §7 경보 — `#alert` 채널의 출처 |
| [data.md](data.md) | §9 Flyway — 롤백 제약의 근거 |
| [adr/0005](adr/0005-single-host-onpremise.md) | 단일 호스트 — 빌드를 클라우드에서 하는 이유 |
| [diagrams/deployment-topology](diagrams/deployment-topology.html) | 배포 3트랙 · 터널이 아웃바운드 |
