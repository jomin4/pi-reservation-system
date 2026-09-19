# ADR-0008 — 영속화를 JPA 없이 Spring JDBC로 한다

| | |
|---|---|
| 상태 | 채택 |
| 날짜 | 2026-09-15 |
| 대체 | — |
| 관련 문서 | [tech.md](../tech.md) · [data.md](../data.md) §4 · [api.md](../api.md) §3 · ADR-0001 · ADR-0002 |

## 맥락

ADR-0001이 **헥사고날 + 완전 분리**를 택했고, ADR-0002가 **비관적 락 + CAS 가드**를 택했다. 그 둘을 실제 어댑터로 내리는 단계에서 JPA가 네 군데 막혔다. 그 시점의 확정 사항은 이랬다.

| 확정 | 출처 |
|---|---|
| `:domain`은 의존성 0. **도메인 객체에 DB PK가 없다** — 좌석의 정체성은 `(TripId, SeatAddress)` | ADR-0001 · 도메인 코어 설계 |
| `version`은 도메인 밖. **CAS가 필요한 경로는 만료 회수 하나뿐** (좌석 전이 5개 중 1개) | `data.md` §4.4 |
| 좌석 락은 `ORDER BY id FOR UPDATE` + **`lock_timeout` 200ms** · `SKIP LOCKED` 금지 | ADR-0002 · `data.md` §4.2~§4.3 |
| 조회 경로는 **Projection 직행, 매핑 1번** | `api.md` §3 |
| 스키마는 **Flyway**가 소유 | `data.md` §9 |

막힌 네 지점은 이렇다.

| # | 지점 | 내용 |
|---|---|---|
| ① | **`lock_timeout` 200ms** | PostgreSQL의 `FOR UPDATE`에는 Oracle의 `WAIT n`에 해당하는 절이 **없다.** Hibernate의 `jakarta.persistence.lock.timeout` 힌트는 PG에서 `0 → NOWAIT` · `-2 → SKIP LOCKED`로만 번역되고 **200ms를 번역할 곳이 없다.** 남는 길은 `SET LOCAL lock_timeout` 네이티브 한 줄인데, 그걸 같은 커넥션에 직접 쏘는 순간 이미 JDBC다. 힌트로 갈 수 있는 유일한 경로인 `SKIP LOCKED`는 ADR-0002가 금지했다 |
| ② | **`@Version`** | 붙이면 **모든 저장에 낙관적 락**이 걸린다. 실패 모드가 `lock_timeout` 예외와 `OptimisticLockException` 둘로 갈라지고, 그 구분이 `409` 판단에 섞인다. 정작 CAS가 필요한 곳은 만료 회수 한 경로뿐이다 |
| ③ | **1차 캐시** | 도메인 `Seat`에 PK가 없어 저장 시 자연키 `(trip_id, car_no, row_no, col_letter)`로 행을 찾아야 한다. **1차 캐시는 PK 조회만 히트**한다. 좌석마다 SELECT를 한 번 더 하거나 벌크 UPDATE로 영속성 컨텍스트를 우회하게 되고, 어느 쪽이든 JPA를 쓰는 의미가 사라진다 |
| ④ | **더티 체킹** | flush가 커밋 직전이나 다음 쿼리 직전에 걸린다. **락을 쥔 구간의 길이가 코드에서 안 보인다.** 이 프로젝트는 그 구간을 측정해 초과 판매 0건을 증명하는 게 목적이다 |

여기에 하나가 더 겹쳤다. **완전 분리를 택한 이상 JPA 엔티티는 표현을 한 겹 더 늘린다.**

| 방식 | 테이블 하나당 산출물 |
|---|---|
| JPA + 완전 분리 | JPA 엔티티 + 도메인↔엔티티 매퍼 + Flyway DDL — **3겹** |
| Spring JDBC | RowMapper + Flyway DDL — **2겹** |

ADR-0001은 "잃은 것: 매퍼 코드(도메인 ↔ JPA 엔티티)"라고 적었지만, **그 매퍼가 엔티티까지 두 벌이 된다는 점은 보지 못했다.**

## 검토한 대안

| 대안 | 장점 | 단점 | 판정 |
|---|---|---|---|
| **Spring JDBC 단독** (`JdbcClient` + `JdbcTemplate.batchUpdate`) | 락·CAS·타임아웃이 **전부 코드에 보인다** · 표현 2겹 · Hibernate 미기동 | **SQL 오타가 런타임에 발견** · 연관 저장을 손으로 | ✅ **채택** |
| 하이브리드 — 경합 2테이블만 JDBC, 나머지 JPA | CRUD 편의를 남긴다 | 확정 경로에서 JPA INSERT와 JDBC UPDATE가 한 트랜잭션에 섞여 **`flush()`를 사람이 기억해야 한다.** 규칙 하나가 늘고, 잊으면 FK 위반 | ❌ |
| JPA 단독 | 익숙함 · 연관 매핑 | ①~④를 전부 우회 코드로 때워야 한다. 실질적으로 불가 | ❌ |
| Spring Data JDBC | JPA보다 가볍고 애그리거트 지향 | **애그리거트 루트에 `@Id`를 요구**한다 — 도메인에 PK를 두지 않기로 한 결정과 정면 충돌 | ❌ |
| jOOQ | 타입 안전한 SQL · 오타를 컴파일에 잡는다 | 코드 생성 단계와 라이선스 확인이 붙는다. **8GB 단일 호스트 · 1인 개발**에 도구 하나가 더 얹힌다 | ❌ |

## 결정

> **`:adapter-persistence`에 ORM을 두지 않는다.** 도메인과 테이블 사이에 **RowMapper 한 겹**만 둔다.

급소는 락 쿼리다. 이 세 줄이 **JPA로는 그대로 표현되지 않는다**는 것이 결정의 전부다.

```sql
SET LOCAL lock_timeout = '200ms';
SELECT ... FROM trip_seat WHERE id = ANY(:sortedIds) ORDER BY id FOR UPDATE;
```

`JdbcClient`를 기본으로 쓰고, 배치 INSERT만 `JdbcTemplate.batchUpdate`를 쓴다. 둘은 같은 `DataSource`를 공유한다.

## 결과

| 얻은 것 | 잃은 것 |
|---|---|
| **락·CAS·타임아웃이 전부 코드에 보인다** | **SQL 오타가 컴파일에 안 잡힌다** |
| 표현이 3겹 → 2겹 | 연관 저장(`reservation` → `reservation_seat`)을 손으로 |
| 혼용 규칙 0개 — `flush()` 함정이 없다 | 페이징·동적 조건을 직접 |
| Hibernate가 안 뜬다 — 8GB 단일 호스트(ADR-0005)에서 시작 시간·메모리 이득 | |
| `TransactionRunner` 구현이 `DataSourceTransactionManager` 한 줄 | |

**잃은 것의 대가로 규칙 하나가 생긴다** — Repository는 **Testcontainers 통합 테스트 없이 짜지 않는다.** SQL 오타를 잡아줄 컴파일러가 없어졌으므로, 그 자리를 테스트가 메우지 않으면 순손실이다.

## 되돌린다면

| 항목 | 비용 |
|---|---|
| 바꿔야 할 것 | **`:adapter-persistence` 한 모듈만.** JPA 엔티티와 매퍼를 새로 쓴다 |
| `:domain` · `:application` | **손대지 않는다** — 포트 시그니처가 그대로다 |
| **싼 이유** | 포트 뒤에 있는 구현이라서다. **ADR-0001이 헥사고날로 얻으려던 효과가 정확히 이것**이다 |

> ⚠️ **이 ADR은 기준 ①(되돌리기가 비싼가)을 만족하지 않는다.** 되돌리기가 싸다. 그런데도 남기는 이유는 기준 ③ 때문이다 — **"왜 JPA를 안 썼지?"는 6개월 뒤에 반드시 나올 질문**이고, 코드에는 그 답이 없다. 없는 것의 이유는 코드에 안 적힌다.
>
> 기록해 두는 김에 남긴다 — **이 결정을 뒤집는 데는 새 ADR이 필요 없다.** 설계 문서(`tech.md`)를 고치는 PR 하나면 된다.
