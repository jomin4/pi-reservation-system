# back — 백엔드 트랙

> 루트 [CLAUDE.md](../CLAUDE.md)의 규칙이 먼저다. 여기는 이 트랙만의 것.

## 스택

| 구분 | 값 |
|---|---|
| 언어 | **Java 21** (Kotlin 전환은 미확정) |
| 프레임워크 | Spring Boot 4.1 · 모듈러 모놀리스 |
| 빌드 | Gradle (Kotlin DSL) — `back/settings.gradle.kts` |
| DB | PostgreSQL 17 · Flyway |
| 캐시·이벤트 | Redis 7 (Stream) |
| 테스트 | JUnit 5 · Testcontainers · AssertJ |
| 관측 | Micrometer · SpringDoc |

## ⚠️ 모듈 경계 — 이 트랙의 급소

```
:domain              의존성 0
:application         :domain
:adapter-web         :application       REST · SSE
:adapter-scheduling  :application       선점 만료 회수
:adapter-persistence :application       JPA · 매퍼 · 락
:adapter-cache       :application       Redis · Stream
:adapter-payment     :application       토스페이먼츠
:bootstrap           어댑터 5개          유일한 실행 모듈
```

```kotlin
implementation(project(":domain"))   // ← api 가 아니라 implementation
```

> **`api`로 두면 `:adapter-web`이 `:domain` 타입을 그대로 본다.** `implementation`이면 **HTTP 응답에 도메인 객체를 담는 순간 컴파일 에러**다. 규약이 아니라 기계가 막는다 (ADR-0001).

## 이 트랙의 금지

| 금지 | 근거 |
|---|---|
| `domain/build.gradle.kts`에 **의존성 추가** | ADR-0001 — **되돌리기 거의 불가능** |
| **`api(project(":domain"))`** | 〃 |
| **`SKIP LOCKED`** | ADR-0002 — 부분 성공이 생긴다 |
| **`ORDER BY id` 없는 `FOR UPDATE`** | ADR-0002 — 데드락 |
| 전역 `lock_timeout` 설정 | `SET LOCAL`로만 (`data.md` §4.5) |
| **`409`를 `ERROR`로 로깅** | `operate.md` §1 — 경합은 정상 결과 |
| `:domain`에서 로깅 | `operate.md` §2.3 — 사실은 **반환**해야 한다 |
| 도메인 객체를 `*Response`에 | `api.md` §3 |
| `trip.available_count` 카운터 컬럼 | `data.md` §8.5 — 운행 단위 직렬화 |
| `trip_seat`에 인덱스 추가 | `data.md` §8.10 — 락 쥔 시간이 늘어난다 |

## 읽어야 할 문서

| 언제 | 어디 |
|---|---|
| 좌석 락을 짤 때 | **`data.md` §4** · ADR-0002 |
| 상태를 바꿀 때 | `data.md` §5 — 전이 · 가드 |
| Redis를 쓸 때 | `data.md` §6 |
| 쿼리를 짤 때 | `data.md` §8 |
| 마이그레이션 | `data.md` §9 |
| 엔드포인트를 만들 때 | **`docs/api/openapi.yaml`** · `api.md` §5 |
| 에러를 던질 때 | `api.md` §4 |
| 로그를 찍을 때 | **`operate.md` §1 · §2** |

## 자주 틀리는 것

| 실수 | 바른 것 |
|---|---|
| `@RestControllerAdvice`에서 **상태 코드에 로그 레벨을 맞춤** | **`4xx`=`WARN` 금지** — `409`가 전부 경고가 된다 |
| 도메인 예외에 HTTP 정보를 넣음 | **`:domain`은 HTTP를 모른다.** 매핑은 `:adapter-web`에만 |
| `@Transactional`을 `:application`에 | **`TransactionRunner` 포트**로 (`data.md` §4) |
| `SELECT ... FOR UPDATE`에 정렬 누락 | **`ORDER BY id`** — 없으면 데드락 |
| 만료 회수에 `version` CAS 누락 | 스케줄러는 **락 밖 판단 경로**다 |
| `COMPLETED`를 컬럼에 저장 | **파생한다** — `depart_at < now()` (`data.md` §5.5) |

## 계약을 바꿔야 하면

⚠️ **`docs/api/openapi.yaml`을 고치는 PR이 먼저다** (ADR-0007). back CI가 **SpringDoc 산출 스펙과 대조**하므로, 계약을 안 고치면 **CI가 막는다.**

```bash
./gradlew generateOpenApiDocs
diff docs/api/openapi.yaml build/generated-openapi.yaml
```
