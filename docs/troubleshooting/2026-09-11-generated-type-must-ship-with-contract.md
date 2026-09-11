# 2026-09-11 — 스캐폴드 PR 이 `schema.d.ts: No such file or directory` 로 죽는다

| | |
|---|---|
| 상태 | **해결** — ⚠️ **같은 뿌리의 두 번째 증상은 아직 안 터졌다** (아래 「다음에 터질 곳」) |
| 트랙 | tooling |
| 관련 | `workflow.md` §3 · `deploy.md` §7.2 · `api.md` §7.5 · ADR-0007 · 이슈 #62 #63 |

## 증상

`front/` 스캐폴드만 담은 PR 에서 CI 가 죽는다. 앞의 네 단계는 전부 통과한 뒤 **마지막 단계에서만** 죽는다.

```
✨ openapi-typescript 7.13.0
🚀 ../docs/api/openapi.yaml → /tmp/api.d.ts [90.2ms]
diff: src/api/schema.d.ts: No such file or directory

계약이 바뀌었는데 생성 타입이 낡았다. 아래를 돌리고 커밋한다.
  npx openapi-typescript ../docs/api/openapi.yaml -o src/api/schema.d.ts
##[error]Process completed with exit code 1.
```

> ⚠️ **에러 메시지가 거짓말을 한다.** "계약이 바뀌었는데" 라고 말하지만 **계약은 안 바뀌었다.** 생성 타입이 아예 없을 뿐이다. `diff` 는 두 경우를 구분하지 않는다.

## 환경

| 항목 | 값 |
|---|---|
| 재현 | **항상** — `front/package.json` 은 있고 `front/src/api/schema.d.ts` 는 없는 상태 |
| 계기 | 스캐폴드(#62)와 타입 생성(#63)을 **다른 이슈로 쪼갰다** |

## 원인

`front-ci.yml` 의 **`생성 타입 최신성`** 단계는 **무조건** 돈다. 조건이 없다.

즉 CI 가 이렇게 선언하고 있다.

> **`front/` 가 존재하면 `src/api/schema.d.ts` 도 존재하고 최신이어야 한다.**

**이슈를 "작업의 크기" 로 쪼갠 것이 잘못이었다.** 실제 경계는 **「혼자 초록이 될 수 있는가」** 다.

그리고 둘은 **순환**이다.

| | 왜 혼자 못 도나 |
|---|---|
| #62 스캐폴드 단독 | 마지막 단계가 `schema.d.ts` 를 요구한다 |
| #63 타입 생성 단독 | `package.json` 이 없어 **스캐폴드 가드가 전부 건너뛴다.** 검사 자체가 안 돈다 |

> **어느 쪽을 먼저 머지해도 초록이 안 된다.** 순서 문제가 아니라 **원자성** 문제다.

## 해결

**두 이슈를 한 PR 로 합쳤다** ([PR #72](https://github.com/jomin4/pi-reservation-system/pull/72) — `Closes #62` `Closes #63`).

머지 전에 **CI 의 검사를 로컬에서 그대로 재현**해 확인한다.

```bash
cd front
npx --yes openapi-typescript@7 ../docs/api/openapi.yaml -o /tmp/api.d.ts
diff -u /tmp/api.d.ts src/api/schema.d.ts && echo '통과'
```

> **`diff` 는 byte 단위다.** 줄바꿈이 CRLF 면 전 줄이 다르게 나온다. Windows 개발 · Linux 러너 조합이라 `.gitattributes` 에 `front/**/*.ts text eol=lf` 를 못 박아야 한다.

## 막다른 길

| 시도 | 결과 |
|---|---|
| `생성 타입 최신성` 단계도 파일 존재로 가드한다 | ❌ **집행 장치가 무력해진다.** 누가 `schema.d.ts` 를 지우면 검사가 **조용히 건너뛴다.** ADR-0007 이 CI 로 내려온 이유가 사라진다 |
| 스캐폴드 PR 에 빈 `schema.d.ts` 를 넣는다 | ❌ `diff` 가 어차피 실패한다. 파일 유무가 아니라 **내용이 같아야** 한다 |
| #63 을 먼저 머지하고 #62 를 나중에 | ❌ **순환이라 안 된다** (위 표). `package.json` 이 없으면 pnpm 단계 자체가 안 돈다 |
| `pnpm run --if-present gen:api` 를 CI 에 넣어 자동 생성 | ❌ **CI 가 생성물을 만들면 검사가 자기 자신을 검사한다.** 항상 통과하고 아무것도 못 막는다 |

## ⚠️ 다음에 터질 곳 — 계약 PR 이 단독으로 초록이 안 된다

**같은 뿌리에서 나오는 두 번째 증상이고, 아직 안 터졌을 뿐이다.**

`front-ci` 의 실행 조건을 보면

```yaml
if: needs.changes.outputs.front == 'true' || needs.changes.outputs.contract == 'true'
```

**계약만 바뀌어도 돈다.** 의도된 설계다 (`deploy.md` §7.2 — 계약 선행 규칙의 집행 장치). 그런데 그러면:

```
docs/api-* PR  (openapi.yaml 만 수정)
      ↓
contract=true → front-ci 실행 → 생성 타입 최신성
      ↓
낡은 schema.d.ts 와 diff → ❌ 실패
```

**`workflow.md` §3 이 적은 2단계 순서와 모순된다.**

| §3 의 규칙 | CI 의 요구 |
|---|---|
| **1** `docs/api-*` — 계약만. **먼저 머지** | 계약 PR 이 **생성 타입까지** 담아야 초록 |
| **2** `feat/front-*` — 생성 타입으로 구현 | — |

> **PR #72 가 머지되는 순간부터 활성화된다.** `front/` 가 스캐폴드된 뒤에는 **다음 `docs/api-*` PR 이 반드시 빨개진다.** mobile 이 스캐폴드되면 **두 트랙의 `schema.d.ts` 를 같이** 재생성해야 한다.

**방향** — 계약 PR 이 생성 타입 재생성까지 담는다.

| | |
|---|---|
| 근거 | **생성 타입은 계약의 일부다.** 손으로 고치는 게 아니라 재생성물이라 「자기 트랙 밖을 고치지 않는다」의 예외로 볼 수 있다 |
| 대안이 나쁜 이유 | `contract` 트리거를 빼면 **타입이 낡은 채로 `develop` 에 들어간다.** 집행이 한 박자 늦고, `deploy.md` §7.2 가 명시한 의도를 버리는 것이다 |
| 고쳐야 할 문서 | **`workflow.md` §3** (1단계 내용) · **§1.3** (트랙 경계의 예외) |

## 재발 방지

| 조치 | 위치 | 상태 |
|---|---|---|
| #62 · #63 을 한 PR 로 합침 | PR #72 | ✅ |
| `.gitattributes` 에 front 줄바꿈 LF 고정 | 루트 `.gitattributes` | ✅ PR #72 |
| **이슈를 쪼개는 기준을 「혼자 초록이 될 수 있는가」로** | `workflow.md` §5 | ⬜ **안 함** |
| **계약 PR 이 생성 타입을 담는다는 규칙** | `workflow.md` §3 · §1.3 | ⬜ **안 함 — 본체 worktree 소관** |
