# 2026-09-10 — `redocly.yaml` 에 `apis:` 를 적으면 `openapi-typescript` 가 CLI 인자를 무시한다

| | |
|---|---|
| 상태 | **해결** |
| 트랙 | tooling |
| 관련 | `api.md` 부록 A.4 · 루트 `redocly.yaml` |

## 증상

`redocly lint` 를 인자 없이 돌리려고 루트 `redocly.yaml` 에 `apis:` 를 적었다.

```yaml
apis:
  main:
    root: docs/api/openapi.yaml
```

`redocly lint` 는 잘 됐다. 그런데 **같은 명령을 계속 쓰던 타입 생성이 깨졌다.**

```
$ npx openapi-typescript docs/api/openapi.yaml -o front/src/api/schema.d.ts

 ⚠  APIs are specified both in Redocly Config and CLI argument. Only using Redocly config.
 ✘  API main is missing an `x-openapi-ts.output` key. See https://openapi-ts.dev/cli/#multiple-schemas.

Error: API main is missing an `x-openapi-ts.output` key.
```

**`-o` 로 준 출력 경로가 조용히 무시됐다.**

## 환경

| 항목 | 값 |
|---|---|
| `@redocly/cli` | 2.x |
| `openapi-typescript` | 7.13.0 |
| 재현 | **항상** — 루트에 `apis:` 가 있으면 |

## 원인

**`openapi-typescript` 가 `@redocly/openapi-core` 를 내부적으로 쓴다.**

린터와 생성기의 `$ref` 해석기를 일치시키려고 고른 것이 바로 이 점인데(A.4),
**같은 해석기를 쓴다는 건 같은 설정 파일도 읽는다는 뜻**이었다.

`apis:` 가 있으면 `openapi-typescript` 는 그것을 **"생성 대상 목록"** 으로 읽고
CLI 인자를 버린다. 그리고 각 항목에 `x-openapi-ts.output` 을 요구한다.

> **에러 메시지가 원인을 안 가리켰다.** `x-openapi-ts.output` 이 없다는 말만 하고,
> **그 요구가 `redocly.yaml` 때문에 생겼다**는 건 위의 회색 `⚠` 한 줄에만 있다.

## 해결

**`apis:` 를 안 쓴다.** 루트 `redocly.yaml` 에는 `rules:` 만 둔다.

```yaml
# apis: 를 쓰지 않는다 — openapi-typescript 가 같은 파일을 읽는다
rules:
  info-license: off
  no-server-example.com: off
  operation-4xx-response: off
```

두 명령 다 경로를 명시한다.

```bash
npx @redocly/cli lint docs/api/openapi.yaml
npx openapi-typescript docs/api/openapi.yaml -o src/api/schema.d.ts
```

> **출력 경로를 설정 파일에 못 박지 않는 게 오히려 맞다.** front 와 mobile 이
> 같은 스펙에서 **각자 다른 위치로** 타입을 뽑아야 한다.

## 막다른 길

| 시도 | 결과 |
|---|---|
| `docs/api/redocly.yaml` 에 설정을 둔다 | ❌ **끈 규칙이 조용히 되살아난다.** redocly 는 **실행 디렉터리에서 위로** 찾는다. CI 는 루트에서 도니 `docs/api/` 를 안 본다 — **에러 없이 경고 3건이 다시 뜬다** |
| `apis:` 에 `x-openapi-ts.output` 을 추가한다 | ⚠️ 동작은 한다. 하지만 출력 경로가 **한 곳으로 고정**돼 front · mobile 이 나눠 쓸 수 없다 |
| `apis:` 를 front · mobile 두 항목으로 나눈다 | ⚠️ 동작은 한다. 대신 **`redocly lint` 가 같은 파일을 두 번 검사**해 출력이 중복된다 |

## 재발 방지

| 조치 | 위치 |
|---|---|
| `apis:` 금지와 그 이유를 주석으로 | **루트 `redocly.yaml`** |
| 루트에 둬야 하는 이유 + `apis:` 금지 | `api.md` 부록 A.4 |
