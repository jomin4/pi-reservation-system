# ADR-0001 — 백엔드를 헥사고날 + Gradle 멀티모듈 8개로 나눈다

| | |
|---|---|
| 상태 | 채택 · **소급 작성** |
| 날짜 | 2026-09-03 |
| 대체 | — |
| 관련 문서 | [tech.md](../tech.md) · [backend-hexagonal](../diagrams/backend-hexagonal.html) · [backend-gradle-modules](../diagrams/backend-gradle-modules.html) |

## 맥락

그 시점의 조건:

| 항목 | 값 |
|---|---|
| 클라이언트 | 웹 · 모바일 · **키오스크** (당시) |
| 저장소 | PostgreSQL · Redis. **지도·AI 확장 가능성 언급됨** |
| 도메인 규칙 | **6석 전부 성공 또는 전부 실패** · TTL 10분 |
| 팀 | 1인 |

핵심 걱정은 하나였다 — **도메인 규칙이 Spring과 JPA에 섞이면 테스트에 DB가 필요해진다.** 이 프로젝트가 증명하려는 게 좌석 동시성인데, 그 규칙을 검증하는 데 컨테이너가 필요하면 반복 검증이 느려진다.

## 검토한 대안

| 대안 | 장점 | 단점 | 판정 |
|---|---|---|---|
| 전통 3-tier 단일 모듈 | 가장 빠르게 시작 | **경계가 관례로만 존재** — 지키는지 아무도 검사 안 함 | ❌ |
| 헥사고날 · 단일 모듈 | 구조는 잡힘 | 〃 — 패키지 규칙은 컴파일러가 안 본다 | ❌ |
| **헥사고날 · Gradle 멀티모듈 8개** | **경계가 컴파일 에러** | 모듈 보일러플레이트 · 매퍼 코드 | ✅ **채택** |
| 컨텍스트별 헥사곤 다중화 | 확장 대비 | **지금 규모에 과잉** | ❌ |
| MSA | — | VM 자원 · 1인 개발 | ❌ |

## 결정

> **헥사곤 하나, Gradle 모듈 여덟 개.** 경계는 규율이 아니라 **빌드 실패**로 지킨다.

```
:domain              의존성 0
:application         :domain
:adapter-web         :application
:adapter-scheduling  :application
:adapter-persistence :application
:adapter-cache       :application
:adapter-payment     :application
:bootstrap           어댑터 5개 — 유일한 실행 모듈
```

**이 구조의 급소는 한 단어다.**

```kotlin
// :application/build.gradle.kts
implementation(project(":domain"))   // ← api 가 아니라 implementation
```

`api`로 두면 `:adapter-web`이 `:domain` 타입을 그대로 본다. `implementation`이면 **HTTP 응답에 도메인 객체를 담는 순간 컴파일 에러**다. 규약이 아니라 기계가 막는다.

## 결과

| 얻은 것 | 잃은 것 |
|---|---|
| **도메인 누수가 컴파일 에러** | 모듈 8개 빌드 설정 |
| 코어 테스트에 DB·컨테이너 불필요 | **매퍼 코드** (도메인 ↔ JPA 엔티티) |
| 순환 의존을 Gradle이 거부 | DTO가 계층마다 하나씩 |
| **키오스크 어댑터 제거가 `:bootstrap` 한 줄** (ADR-0003) | |

## 되돌린다면

| 항목 | 비용 |
|---|---|
| 모듈 병합 | **싸다** — 소스를 합치면 된다 |
| **`:domain`이 JPA에 오염된 뒤 복구** | ⚠️ **거의 불가능** |
| **비싼 이유** | 분리는 나중에 못 한다. `@Entity`가 도메인 클래스에 한 번 붙으면 락 전략·더티체킹이 규칙 코드에 스며들고, 그때부터는 재작성이다 |

> **그래서 초반에 정해야 하는 결정이었다.** "나중에 필요하면 하겠다"는 선택지가 없다.
