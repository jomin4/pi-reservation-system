# 2026-09-11 — 트랙 문서 한 줄만 고쳐도 그 트랙 CI 가 돈다 (스캐폴드 전이면 죽는다)

| | |
|---|---|
| 상태 | **해결**(예방) — ⚠️ **`front-ci` 만.** `back` · `mobile` · `infra` 는 그대로다 (아래 「재발 방지」) |
| 트랙 | tooling |
| 관련 | `deploy.md` §1 · §7.1 · `.github/workflows/_changes.yml` · PR #61 |

## 증상

`front/CLAUDE.md` **한 줄**만 고친 PR 인데 `front-ci` 의 `check` job 이 돈다. `front/` 에는 코드가 없고 문서 한 장뿐인데도.

⚠️ **이 문서는 예측을 막은 기록이다.** 실제 실패는 관측하지 않았다 — 같은 PR(#61)에 가드를 함께 넣어 먼저 막았기 때문이다. **관측한 것과 예측한 것을 아래에서 구분한다.**

**관측한 것** — `_changes` job 로그

```
  echo "front=$(has '^front/')"
front=true
```

`check` job 의 조건이 `needs.changes.outputs.front == 'true'` 이므로 **job 은 실제로 돌았다.** 이어지는 실행이 5초 만에 끝난 것은 가드가 이후 단계를 건너뛴 결과다.

**예측한 것** — 가드가 없었다면 `actions/setup-node` 가 `cache-dependency-path: front/pnpm-lock.yaml` 을 해석하지 못해 그 단계에서 실패한다. **재현하지 않았으므로 에러 메시지 원문은 여기 적지 않는다.** 실제로 만나면 이 문서에 원문을 채워 넣을 것.

> ⚠️ **2026-09-11 `develop` 브랜치 보호가 켜진 뒤부터 이건 "PR 이 영영 못 머지된다" 와 같은 말이다.** 필수 체크가 `CI 통과` 다 (`workflow.md` §7.2).

## 환경

| 항목 | 값 |
|---|---|
| 재현 | **항상** — 해당 트랙 디렉터리에 스캐폴드가 없는 동안 |
| 조건 | 트랙 디렉터리 **아래 아무 파일**이나 건드리면 된다. `CLAUDE.md` 도 포함 |

## 원인

`_changes.yml` 은 **경로 접두사로만** 트랙을 판별한다.

```bash
front=$(has '^front/')
```

`front/CLAUDE.md` 도 `^front/` 다. **문서인지 코드인지 구분하지 않는다.**

그리고 각 트랙 CI 는 **그 트랙이 이미 완성돼 있다고 가정**한다. 가정이 깨지는 지점이 트랙마다 다르다.

| 트랙 | 스캐폴드 전에 깨지는 지점 |
|---|---|
| `front` | `setup-node` 의 `cache-dependency-path: front/pnpm-lock.yaml` |
| `mobile` | 〃 `mobile/pnpm-lock.yaml` — **front 와 완전히 같다** |
| `back` | `./gradlew build` — `back/gradlew` 가 없다 |
| `infra` | compose 파일 탐색 루프가 `found=0` 이면 `exit 1` |

> **이 표는 워크플로 YAML 을 읽어서 짚은 것이지 네 트랙을 다 돌려본 게 아니다.** 관측한 것은 front 의 `front=true` 판정뿐이다.

> **에러 메시지가 원인을 안 가리켰다.** `unable to cache dependencies` 는 캐시 문제처럼 읽히지만, 실제 원인은 **"이 PR 이 왜 front 트랙으로 판정됐는가"** 다. 판별 로직은 다른 파일(`_changes.yml`)에 있고 에러에 등장하지 않는다.

## 해결

`front-ci.yml` 에 **스캐폴드 가드**를 넣었다. `checkout` 직후 `package.json` 존재를 보고 이후 7단계를 `if:` 로 건너뛴다.

```yaml
      - name: 스캐폴드 여부
        id: scaffold
        run: |
          if [ -f package.json ]; then
            echo 'ready=true' >> "$GITHUB_OUTPUT"
          else
            echo 'front/package.json 이 없다. 아직 스캐폴드 전이므로 이후 단계를 건너뛴다.'
            echo 'ready=false' >> "$GITHUB_OUTPUT"
          fi

      - uses: pnpm/action-setup@v4
        if: steps.scaffold.outputs.ready == 'true'
```

> **`deploy.md` §1 이 job 단위에 쓴 논리를 step 단위에 그대로 내린 것이다.** "건너뛴 것은 성공으로 보고된다" — 그래서 필수 체크로 둬도 안전하다.
>
> **가드는 스스로 사라진다.** 스캐폴드가 들어오면 `ready=true` 가 되어 아무것도 건너뛰지 않는다. 지울 필요가 없다.

**확인 방법** — `front · 타입 · 린트 · 테스트` 의 **소요 시간**을 본다.

| 시간 | 뜻 |
|---|---|
| **5초** | 가드가 건너뛰었다 |
| **20초 이상** | 5단계가 실제로 돌았다 |

## 막다른 길

| 시도 | 결과 |
|---|---|
| PR 에서 `front/CLAUDE.md` 를 빼고 `docs/` 만 고친다 | ⚠️ 동작은 한다. 하지만 **스캐폴드 전까지 트랙 문서를 영영 못 고친다.** 트랙 `CLAUDE.md` 는 스캐폴드보다 먼저 쓰이는 문서다 |
| `_changes.yml` 에서 `front/**/*.md` 를 제외한다 | ❌ **판별 규칙에 예외가 생긴다.** `^front/` 한 줄이 읽히는 게 이 파일의 장점인데 그게 사라진다. 게다가 `.md` 만 빼면 `front/.gitignore` 같은 걸 고칠 때 **똑같이 깨진다** |
| job 의 `if:` 에 파일 존재 조건을 넣는다 | ❌ **`if:` 에서는 파일을 볼 수 없다.** job 레벨 `if:` 는 `checkout` 보다 먼저 평가된다 |
| `pnpm install` 에 `continue-on-error: true` | ❌ 뒤 단계가 **전부 깨진 채로 "성공"** 이 된다. 필수 체크의 의미가 사라진다 |
| 트랙별로 빈 `package.json` 을 미리 커밋해둔다 | ❌ `--frozen-lockfile` 이 lockfile 을 요구한다. 빈 lockfile 은 또 다른 거짓말이다 |

## 재발 방지

| 조치 | 위치 | 상태 |
|---|---|---|
| `front-ci.yml` 스캐폴드 가드 | `.github/workflows/front-ci.yml` | ✅ PR #61 |
| 가드의 존재 이유를 설계 문서에 | `deploy.md` §7.1 | ✅ PR #61 |
| 확인 방법(소요 시간)을 트랙 문서에 | `front/CLAUDE.md` | ✅ PR #61 |
| **`mobile-ci.yml` 가드** | `.github/workflows/mobile-ci.yml` | ⬜ **안 함** |
| **`back-ci.yml` 가드** | 〃 | ⬜ **안 함** |
| **`infra-ci.yml` 가드** | 〃 | ⬜ **안 함** |

> ⚠️ **front 세션이 다른 트랙의 CI 를 고치지 않았다.** 「자기 트랙 밖을 고치지 않는다」(루트 `CLAUDE.md`) 때문이기도 하지만, 더 큰 이유는 **가드의 판정 기준이 트랙마다 다르기 때문**이다 — front·mobile 은 `package.json`, back 은 `gradlew`, infra 는 compose 파일. **"그 트랙에서 스캐폴드란 무엇인가" 를 아는 세션이 써야 한다.**
>
> **세 트랙 모두 아직 `CLAUDE.md` 한 장뿐이다.** 그 세션이 트랙 문서를 처음 고치는 순간 이 문서에 도달하게 된다.
