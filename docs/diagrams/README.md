# 다이어그램 — C4 모델

> **진실은 [`workspace.dsl`](workspace.dsl) 하나다.** `c4/*.svg` 는 렌더 산출물이고, 손으로 고치지 않는다.

```bash
./scripts/diagrams.sh validate   # 문법만 — 몇 초. DSL 고칠 때마다
./scripts/diagrams.sh render     # SVG 까지 — 커밋 직전
./scripts/diagrams.sh check      # 다시 굽고 커밋본과 대조 — CI
```

필요한 것은 **자바와 Graphviz** 둘뿐이다. Docker 는 안 쓴다. `structurizr-cli` 와 `plantuml` 은 스크립트가 `tools/` 에 받아두고 커밋하지 않는다.

## 뷰 목록 — 한 장에 목적 하나

| 뷰 | 레벨 | **이 그림에 묻는 질문** | 상태 |
|---|---|---|---|
| [01-context](c4/01-context.svg) | L1 | 누가 이 시스템을 쓰고, 바깥의 무엇에 기대나 | ✅ |
| [02-container](c4/02-container.svg) | L2 | **요청이 어디를 거쳐 가고 상태가 어디에 남나** | ✅ |
| [02b-container-observability](c4/02b-container-observability.svg) | L2 | **무엇이 무엇을 긁어 가나** | ✅ |
| [03-component-api](c4/03-component-api.svg) | L3 | API 애플리케이션 안의 **모듈 9개가 어느 쪽으로 기대나** | ✅ |
| [d1-hold-contention](c4/d1-hold-contention.svg) | 동적 | **N개 요청이 같은 좌석을 노릴 때 왜 1건만 성공하나** | ✅ |
| [d2-confirm-payment](c4/d2-confirm-payment.svg) | 동적 | 롤백 안 되는 결제를 트랜잭션 2개로 어떻게 감싸나 | ✅ |
| [d3-sse-fanout](c4/d3-sse-fanout.svg) | 동적 | 좌석 변경이 Redis 를 어떻게 왕복하고, 끊기면 어떻게 따라잡나 | ✅ |
| [deploy-host](c4/deploy-host.svg) | 배포 | **8GB 호스트 한 대에 이게 다 어떻게 들어가나** | ✅ |

### L4(코드)는 그리지 않는다

| # | 이유 |
|---|---|
| 1 | **C4 원칙이 그렇다.** L4 는 코드가 바뀔 때마다 썩는다 — 그려도 유지되지 않는다 |
| 2 | **Structurizr 에 L4 뷰 타입이 없다.** 컴포넌트가 가장 아래다 |
| 3 | **그림이 핵심을 못 담는다.** `Hold.open` 의 핵심은 **"② 전수 판정과 ③ 변경 사이의 줄바꿈"** 인데, 클래스 다이어그램에는 그 순서가 안 나타난다 |

> **대신 [back.md](../back.md) §2.2 의 코드 블록과 [ADR-0009](../adr/0009-hold-open-factory.md) 가 그 자리다.** 코드 블록이 이 경우 제일 좋은 표현이다.
>
> ⚠️ **다시 그리려 하지 말 것.** 2026-09-18 에 판단했고, 근거는 위 3개다.

> **L2 를 두 장으로 쪼갠 이유** — 컨테이너 17개 중 8개가 관측이라 한 장에 담으면 예매 경로가 묻힌다. 무엇보다 **읽는 목적이 다르다.** 모델은 하나이므로 쪼개도 어긋나지 않는다 — 뷰만 다르게 자른다.

### 동적 뷰가 정적 모델을 검산한다

동적 뷰의 각 단계는 **모델에 이미 있는 관계만** 쓸 수 있다. 없는 선을 쓰려 하면 `validate` 가 막는다 — **"요청이 이렇게 흐른다"를 적다 보면 정적 모델에 빠진 선이 드러난다.**

**대신 두 가지를 못 그린다.**

| 못 그리는 것 | 왜 |
|---|---|
| 응답 화살표 (`409` 가 돌아가는 선) | 역방향 관계가 모델에 없다. 만들면 정적 뷰 3장이 양방향 화살표로 더러워진다 |
| 프로세스 안의 흐름 | d3 의 연결별 큐 → 전송 워커가 그렇다. `:adapter-cache` 와 `:adapter-web` 이 **서로를 모르게 설계**했으므로 그릴 선이 없는 게 맞다 ([back.md](../back.md) §5.5) |

> **없는 선을 지어내지 않는다.** 그림이 못 담는 것은 표에 남긴다.

## 표기 규칙

| 규칙 | 내용 |
|---|---|
| 요소 | 이름 + 설명 + `[기술]`. **L1 요소에는 기술을 쓰지 않는다** |
| 관계 | 동사구 + `[프로토콜]` |
| **화살표 방향** | **누가 먼저 말을 거는가**(의존). 데이터가 흐르는 방향이 아니다 |
| 추상화 | 한 뷰에 한 수준. 컨테이너와 컴포넌트를 섞지 않는다 |
| 설명 | 짧게. 길면 박스가 세로로 늘어져 그림이 무너진다 |

> ⚠️ **화살표 방향이 `operate.md` §5 와 반대로 보이는 곳이 있다.** 거기 그림은 **데이터 흐름**(앱 → Promtail)이고 C4 는 **의존 방향**(Promtail → 앱)이다. 둘 다 맞다.

## 관계는 가장 낮은 수준에서 한 번만 적는다

`workspace.dsl` 이 `!impliedRelationships` 를 켜둔다. 컨테이너 사이 관계를 적으면 **시스템 사이 관계(L1)가 자동으로 파생**되고 설명 문구까지 물려받는다.

> **L1 에 같은 관계를 손으로 또 적으면 두 곳이 어긋난다.** C4 를 쓰는 실익의 절반이 여기 있다.

## 어느 문서가 어느 그림을 보나

각 문서 머리말의 「그림」 행과 같다. **여기와 머리말이 어긋나면 머리말이 진실이다.**

| 문서 | 그림 |
|---|---|
| [overview.md](../overview.md) · [features.md](../features.md) | 01 |
| [tech.md](../tech.md) | 02 |
| [back.md](../back.md) | 03 · d1 · d2 · d3 |
| [data.md](../data.md) | d1 · d2 · d3 |
| [api.md](../api.md) | d2 · d3 |
| [operate.md](../operate.md) | 02b |
| [infra.md](../infra.md) | 02 · deploy-host |
| [deploy.md](../deploy.md) | deploy-host |
| [adr/0004](../adr/0004-redis-stream-only-fanout.md) | d3 |
| [adr/0005](../adr/0005-single-host-onpremise.md) · [0006](../adr/0006-backup-to-cloudflare-r2.md) | deploy-host |

### 2026-09-18 에 지운 것

| 지운 그림 | 대체물 |
|---|---|
| `system-architecture` | **02-container** |
| `deployment-topology` | **deploy-host** |
| `redis-workloads` | **되살리지 않는다** — 자료구조 4개 설명은 C4 요소가 아니다. [data.md](../data.md) §6.1 표가 그 자리 |
| `backend-hexagonal` · `backend-gradle-modules` · `backend-domain-model` · `backend-outbound-ports` | **03-component-api** (2026-09-14 에 먼저 지움) |

> **대체물이 다 나온 뒤에 지웠다.** 먼저 지우면 그 사이 인프라 사실이 붕 뜬다.

## 갱신 의무

| 상황 | 할 일 |
|---|---|
| 구조가 바뀐다 | **`workspace.dsl` 을 같은 PR 에서** 고친다 |
| DSL 을 고쳤다 | `./scripts/diagrams.sh render` 를 돌리고 **SVG 도 같이 커밋** |
| 안 했다 | CI 의 `check` 가 막는다 |

> ⚠️ **`check` 는 바이트를 비교하지 않는다.** `structurizr-cli` 가 요소를 내보내는 순서가 고정이 아니라 Graphviz 좌표가 실행마다 조금씩 달라진다 — 그림 내용은 같다. 그래서 **숫자를 지운 뒤 요소와 텍스트만 비교**한다. 좌표만 바뀐 SVG 는 커밋할 필요가 없다.
