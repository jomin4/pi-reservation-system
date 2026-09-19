# 백엔드 설계

> **이 문서가 답하는 질문 하나** — **요청이 코드의 어디를 거쳐 가고, 각 계층이 무엇을 알고 무엇을 모르는가.**

|                           |                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------- |
| 확정일                    | 2026-09-17                                                                                   |
| 선행                      | ADR-0001 (헥사고날) · ADR-0002 (락) · ADR-0008 (Spring JDBC) · ADR-0009 (애그리거트 경계) |
| 이 문서가**이긴다** | ADR-0001 의 모듈 의존 표는**컴파일되지 않는다**(§1.2). 현재 진실은 여기다             |

| 그림 | [03-component-api](diagrams/c4/03-component-api.svg) 모듈 9개 · [d1](diagrams/c4/d1-hold-contention.svg) 경합 · [d2](diagrams/c4/d2-confirm-payment.svg) 확정 · [d3](diagrams/c4/d3-sse-fanout.svg) SSE |

## 이 문서의 경계

| 여기 있다                            | 여기 없다                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------- |
| 모듈 · 포트 · 유스케이스 · 어댑터 | **테이블·락·쿼리** → [data.md](data.md)                            |
| 계층이 무엇을 모르는가               | **엔드포인트·에러 코드** → [api.md](api.md) · `api/openapi.yaml` |
| 왜 그렇게 나눴나                     | **로그·메트릭** → [operate.md](operate.md)                          |

---

## §1 모듈 — 9개

### 1.1 의존 표

```
:domain              (없음)
:application         implementation(:domain)
:adapter-web         :application                ← :domain 영구 차단
:adapter-scheduling  :application
:adapter-security    :application
:adapter-persistence :application + :domain
:adapter-cache       :application + :domain
:adapter-payment     :application + :domain
:bootstrap           어댑터 6개 + :application    유일한 실행 모듈
```

| 모듈                       | `:domain` 을 보나 | 왜                                                                       |
| -------------------------- | ------------------- | ------------------------------------------------------------------------ |
| `:adapter-persistence`   | ✅                  | 포트 6개를 구현한다 — 시그니처가`Seat` · `Hold` · `Reservation` |
| `:adapter-cache`         | ✅                  | `SeatChanged` 이벤트가 `SeatAddress` 를 담는다                       |
| `:adapter-payment`       | ✅                  | `PaymentGateway.approve(OrderId, …)`                                  |
| **`:adapter-web`** | ❌                  | **차단이 목적이다**                                                |
| `:adapter-scheduling`    | ❌                  | `sweep(now)` 한 줄이면 된다                                            |
| `:adapter-security`      | ❌                  | 원시 타입으로 충분하다                                                   |

### 1.2 ADR-0001 의 표가 컴파일되지 않았던 이유

ADR-0001 은 어댑터가 `:application` 만 의존한다고 적었다. 그런데 `:application` 의 `:domain` 선언이 `implementation` 이라 **전이 의존이 컴파일 클래스패스에서 끊긴다.**

```java
// :adapter-persistence — ADR-0001 표대로면 여기서 멈춘다
class JdbcSeatRepository implements SeatRepository {
    public List<Seat> lockForUpdate(TripId tripId, List<SeatAddress> addresses) { … }
    //     ^^^^          ^^^^^^         ^^^^^^^^^^^  cannot find symbol
}
```

> **의도 — `api` 로 바꾸는 게 답이 아니다.** 그러면 `:adapter-web` 까지 `:domain` 을 보게 되어 **벽 자체가 사라진다.** 필요한 모듈만 직접 선언하게 하고, **웹만 안 한다.**
>
> 이 결함이 생긴 이유는 분명하다 — **포트 시그니처를 모르는 상태에서 모듈 그래프를 먼저 확정**했다. 그래서 이번 설계는 모듈을 도메인·포트 뒤에 뒀다.

### 1.3 딸려 나오는 제약 — `:application` DTO 에 도메인 타입 금지

`:adapter-web` 이 `*Command` 를 만들고 `*Result` 를 읽는다. 그 안에 도메인 타입이 있으면 **웹이 컴파일되지 않는다.**

| 계층             | 좌석 주소 표현                                          |
| ---------------- | ------------------------------------------------------- |
| `:adapter-web` | `SeatAddressPayload(int, int, String)` — JSON 바인딩 |
| `:application` | `SeatKey(int, int, String)` — 커맨드용               |
| `:domain`      | `SeatAddress` — 검증과 동등성                        |

> **3겹은 낭비가 아니라 벽이 작동한다는 증거다.** `api.md` §3 이 이미 "명령 경로는 매핑 3번"이라고 약속했고, 그 3번이 무엇인지가 여기서 드러날 뿐이다.

### 1.4 기계가 지키는 것

| 장치                                                                             | 잡히는 시점      |
| -------------------------------------------------------------------------------- | ---------------- |
| `implementation(project(":domain"))`                                           | **컴파일** |
| `check-forbidden.sh` **#8** — `adapter-web` 에 `project(":domain")` | CI               |
| 〃**#9** — `application` 에 `springframework`                         | CI               |
| 〃**#10** — JPA · Hibernate 의존                                         | CI               |
| ArchUnit —`..adapter.web..` → `..domain..`                                 | 테스트           |

---

## §2 도메인 코어

### 2.1 패키지 5개

| 패키지              | 구성                                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------------------ |
| `seat/`           | `Seat`(엔티티) · `SeatAddress`(VO) · `SeatStatus`                                                    |
| **`hold/`** | **`Hold`(루트)** · `HoldId` · `HoldStatus` · `SeatUnavailable`(예외) · `SeatFailure`(VO) |
| `reservation/`    | `Reservation`(루트) · `ReservationNo` · `ReservedSeat` · `Passenger`                              |
| `payment/`        | `Payment`(루트) · `OrderId` · `PaymentStatus`                                                        |
| `member/`         | `Member`(루트) · `Email`                                                                                |

| 타입            | 정체성                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------- |
| `Seat`        | **`(TripId, SeatAddress)`** — 계약이 `seatId` 가 아니라 주소로 좌석을 지목한다 |
| `Hold`        | `HoldId("h_8f3a21")` — 공개 ID                                                         |
| `Reservation` | `ReservationNo("81730294")`                                                             |

> **`:domain` 에 `bigserial` 이 없다.** 내부 PK 는 어댑터의 것이다.

### 2.2 6석 규칙이 사는 곳 — `Hold.open`

```java
public final class Hold {
    public static final Duration TTL = Duration.ofMinutes(10);

    private Hold(…) { }                         // 유일한 생성자 · 밖에서 못 부른다

    public static Hold open(HoldId id, TripId tripId, MemberId memberId,
                            List<Seat> seats, Instant now) {
        requireShape(seats);                         // ① 1~6석 · 중복 없음 · 같은 운행
        List<SeatFailure> failures = judge(seats);   // ② 전수 판정
        if (!failures.isEmpty())
            throw new SeatUnavailable(failures);     //    아직 아무것도 안 바꿨다
        Hold hold = new Hold(id, tripId, memberId,
                             addressesOf(seats), now.plus(TTL));
        seats.forEach(s -> s.markHeld(id));          // ③ 변경은 판정이 끝난 뒤에만
        return hold;
    }
}
```

> **의도 — ②와 ③ 사이의 줄바꿈이 이 설계의 전부다.** 도메인이 보장하는 것은 **"부분 변경이 메모리에서조차 없다"**, 락이 보장하는 것은 **"그 사이 아무도 못 끼어든다"**. 둘을 합쳐야 초과 판매 0건이다.
>
> **`Hold` 객체가 존재한다는 사실 자체가 규칙을 통과했다는 증명**이 된다. 생성자가 `private` 이라 다른 경로가 없다. 근거와 버린 대안은 **ADR-0009**.

**`SeatUnavailable` 이 실패 목록을 동봉하는 이유** — 계약(`holds.yaml`)의 `409` 가 사유를 둘로 나눈다.

| 사유                         | 뜻                                                               |
| ---------------------------- | ---------------------------------------------------------------- |
| `HELD_BY_OTHER`            | 이 좌석이 실제로 막혔다                                          |
| **`ALL_OR_NOTHING`** | **이 좌석은 멀쩡한데 같이 고른 좌석 때문에 함께 실패했다** |

이 구분은 **전수 판정을 한 쪽만 알 수 있다.**

### 2.3 애그리거트는 트랜잭션 경계가 아니다

`Hold.open` 이 `Seat` 를 직접 바꾼다. 교과서는 "한 트랜잭션 = 한 애그리거트"지만 **이 프로젝트는 그 규칙을 쓰지 않는다.**

| 근거              | 내용                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| `data.md` §5.6 | `trip_seat` + `seat_hold` 가 이미 **한 트랜잭션 묶음**으로 정의돼 있다                  |
| `data.md` §4.1 | 락 범위가**좌석 행**이다. 애그리거트를 트랜잭션 경계로 삼으면 운행 단위 직렬화로 되돌아간다 |

> **우리에게 애그리거트는 규칙 경계지 트랜잭션 경계가 아니다.**

### 2.4 도메인이 일부러 모르는 것

| 모르는 것                        | 누가 대신 아나               | 왜                                                                                     |
| -------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------- |
| `trip_seat.id` (`bigserial`) | `:adapter-persistence`     | 락 순서를 위한 인프라 식별자다                                                         |
| `version`                      | 〃                           | 조회와 갱신 사이를 지키는 장치다 (`data.md` §4.4)                                   |
| 현재 시각                        | 호출자가`now` 로 넘긴다    | `Clock` 을 주입하면 조립 개념이 들어온다. 파라미터면 테스트가 만료 창을 민다         |
| 운임                             | 조회·확정 경로              | `seat_hold` 에 운임 컬럼이 없다. **`Hold` 는 자기가 얼마짜리인지 모른다**    |
| `HoldId` 생성 시점             | 호출자 (`HoldId.random()`) | UNIQUE 충돌 재시도가 밖에 있어야 하고,`open` 이 결정적이라야 테스트가 ID 를 고정한다 |
| 로깅                             | —                           | `operate.md` §2.3 — 도메인은 사실을 **반환**한다                             |

---

## §3 인바운드 — 유스케이스 21개 · 포트 17개

### 3.1 분기 기준 — 판정이 있느냐

| 경로                     | 매핑                  | 예                                  |
| ------------------------ | --------------------- | ----------------------------------- |
| **명령**           | 3번                   | 선점 · 확정 · 취소                |
| **판정 있는 조회** | 3번                   | 선점 조회 · 예약 조회 · 결제 결과 |
| **순수 조회**      | 1번 (Projection 직행) | 역 · 운행 · 좌석맵                |

> ⚠️ **`GET` 이냐 `POST` 냐로 가르면 틀린다.** `GET /holds/{holdId}` 는 GET 이지만 도메인을 거쳐야 한다.
>
> **결정적 근거는 `403` 이다.** 계약이 남의 선점에 `403 HOLD_NOT_OWNED` 를 요구하는데, `WHERE member_id = ?` 로 걸러버리면 결과가 0건이 되어 **`404` 가 나간다.** 필터로는 낼 수 없는 응답이 계약에 있다.
>
> 두 번째 근거는 **lazy 만료 판정**이다. `Hold.isExpiredAt(now)` 에 이미 있는 규칙을 SQL 에 또 쓰면 같은 규칙이 두 곳이 된다.

### 3.2 명령 유스케이스 11개 — 1 포트 = 1 메서드

| 인바운드 포트                           | 오퍼레이션              | 기능                                             |
| --------------------------------------- | ----------------------- | ------------------------------------------------ |
| **`HoldSeatsUseCase`**          | `createHold`          | `F-04` — 이 프로젝트의 심장                   |
| `ReleaseHoldUseCase`                  | `releaseHold`         | `F-06`                                         |
| `PreparePaymentUseCase`               | `createPaymentIntent` | `F-08` — `order_id`·`amount` 를 못박는다 |
| **`ConfirmReservationUseCase`** | `confirmPayment`      | `F-08`·`F-09` — 트랜잭션 2개 + 토스        |
| `CancelReservationUseCase`            | `cancelReservation`   | `F-14`·`F-15`                               |
| **`SweepExpiredHoldsUseCase`**  | — (SYS)                | `F-07` — `:adapter-scheduling` 만 부른다    |
| `SignUpUseCase`                       | `signup`              | `F-20`                                         |
| `LoginUseCase`                        | `login`               | `F-24`·`F-36`                               |
| `RefreshTokenUseCase`                 | `refreshToken`        | `F-26`                                         |
| `LogoutUseCase`                       | `logout`              | `F-25`                                         |
| `UpdateMyProfileUseCase`              | `updateMe`            | `F-22` (P1)                                    |

> **명령만 1:1 로 쪼갠 이유** — 명령 하나하나가 **독립된 트랜잭션 경계와 불변식**을 갖는다. 조회는 불변식이 없어 묶어도 잃는 게 없다.

### 3.3 조회 포트 5개 + SSE 1개

| 인바운드 포트                    | 오퍼레이션                                            | 도메인 경유                            |
| -------------------------------- | ----------------------------------------------------- | -------------------------------------- |
| `HoldQueryUseCase`             | `getHold`                                           | ✅ 만료 판정 · 소유권                 |
| `ReservationQueryUseCase`      | `listReservations` · `getReservation`            | ✅ 소유권 ·`COMPLETED` 파생         |
| `PaymentQueryUseCase`          | `getPaymentResult`                                  | ✅`200`/`202`/`402`/`410` 판정 |
| `CatalogQueryUseCase`          | `listStations` · `searchTrips` · `getSeatMap` | ❌ Projection 직행                     |
| `AccountQueryUseCase`          | `checkEmailAvailable` · `getMe`                  | ❌ 〃                                  |
| `SeatEventSubscriptionUseCase` | `subscribeSeatEvents`                               | ❌ 이벤트 중계                         |

> **예약 목록이 도메인을 거치는 게 이 표에서 가장 약한 고리다.** `COMPLETED` 파생은 SQL `CASE` 로도 되고 페이지당 20건뿐이다. **규칙이 두 곳에 생기는 쪽을 더 무겁게 봤다**는 판단이며, 뒤집는다면 여기다.

### 3.4 캐시 정책은 `:application` 에 둔다

`CatalogQueryUseCase` 가 `SeatMapCache` 를 먼저 보고, 미스면 `SeatMapReader` 로 읽어 캐시에 채운다.

> **어댑터끼리 부르면(캐시 어댑터가 DB 어댑터를 부르면) 헥사곤이 깨지고, 정책이 코드에서 안 보인다.**

### 3.5 `:application` 은 스프링을 모른다

| 항목       | 내용                                                                                    |
| ---------- | --------------------------------------------------------------------------------------- |
| 유스케이스 | 평범한 클래스.`@Service` 없음 · 생성자 주입                                          |
| 트랜잭션   | **`TransactionRunner` 포트** (`data.md` §4.6)                                |
| 조립       | `:bootstrap` 의 `@Configuration` — 수동 `@Bean` **35개 안팎**              |
| 얻는 것    | 유스케이스 테스트가`new HoldSeatsService(fake…)` **한 줄**. 컨텍스트가 안 뜬다 |

---

## §4 아웃바운드 포트 19개

### 4.1 목록

| 포트                                                                              | 시그니처 요지                                                           | 구현                     |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------ |
| `SeatRepository`                                                                | `lockForUpdate(TripId, List<SeatAddress>)` · `saveAll(List<Seat>)` | `:adapter-persistence` |
| `HoldRepository`                                                                | `save` · `findById(HoldId)`                                        | 〃                       |
| **`ExpiredHoldSweeper`**                                                  | `findExpired(now, limit)` · `release(ExpiredHold)`                 | 〃                       |
| `ReservationRepository`                                                         | `save` · `findByNo` · `findByMember(page)`                      | 〃                       |
| `PaymentRepository`                                                             | `save` · `findByOrderId` · `findByIdempotencyKey`               | 〃                       |
| `MemberRepository`                                                              | `save` · `findByEmail` · `existsByEmail`                        | 〃                       |
| `TransactionRunner`                                                             | `<T> T inTransaction(Supplier<T>)`                                    | 〃                       |
| `SeatMapReader` · `TripReader` · `StationReader` · `ReservationReader` | Projection 반환                                                         | 〃                       |
| `SeatChangePublisher`                                                           | `publish(SeatChanged)`                                                | `:adapter-cache`       |
| `SeatMapCache` · `SeatEventStream`                                           | `HGETALL`/`HSET` · `XREAD`/`XRANGE`                            | 〃                       |
| `RefreshTokenStore` · `LoginAttemptLimiter`                                  | 토큰 · 시도 제한                                                       | 〃                       |
| **`PaymentGateway`**                                                      | `approve(OrderId, paymentKey, amount, idempotencyKey)`                | `:adapter-payment`     |
| `PasswordHasher` · `TokenIssuer`                                             | BCrypt · JWT                                                           | `:adapter-security`    |

**`Clock` 은 포트가 아니다** — `java.time.Clock` 은 JDK 라 `:application` 이 직접 받아도 의존성이 안 생긴다. 감싸면 얻는 것 없이 인터페이스만 는다.

### 4.2 이름이 경로를 드러낸다

| 접미사                    | 다루는 것   | 뜻                           |
| ------------------------- | ----------- | ---------------------------- |
| **`*Repository`** | 도메인 객체 | 이 경로는 도메인을 거친다    |
| **`*Reader`**     | Projection  | 이 경로는 도메인을 안 거친다 |

> 리뷰에서 **`*Reader` 가 도메인 객체를 반환하면 그게 잘못된 것이다.**

### 4.3 `version` CAS 는 포트 하나만 나른다

좌석 전이 5개 중 **락 밖에서 판단하는 경로는 만료 회수 하나뿐**이다 (`data.md` §4.4).

```java
public interface ExpiredHoldSweeper {
    List<ExpiredHold> findExpired(Instant now, int limit);   // LIMIT 200
    void release(ExpiredHold candidate);                     // 전부 CAS 성공해야 커밋
}

public interface ExpiredHold {        // 불투명 — :application 은 열어볼 수 없다
    HoldId holdId();
    TripId tripId();
    List<SeatAddress> seats();        // SSE 발행에 필요한 것만
}
```

구현(`:adapter-persistence`)만 `(좌석 행 id, version)` 쌍을 들고 있다.

> **의도 — 별도 포트로 뺀 이유.** `HoldRepository` 에 섞으면 **다른 호출자가 CAS 없는 경로로 좌석을 되돌릴 수 있다.** 위험한 연산을 위험한 타입(`ExpiredHold`) 없이는 못 부르게 막는다.
>
> **회수도 전부 아니면 전무다.** 좌석 N행 + `seat_hold` 1행의 영향 행 합계가 `N+1` 이 아니면 `SeatVersionConflict` 로 통째 롤백한다.

### 4.4 `PaymentGateway` 는 3상태를 돌려준다

| 일어난 일                             | 반환                  | HTTP                                   |
| ------------------------------------- | --------------------- | -------------------------------------- |
| 승인                                  | `APPROVED`          | `201`                                |
| 거절                                  | `DECLINED`          | `402`                                |
| **read timeout · 커넥션 끊김** | **`UNKNOWN`** | **`202` + `Retry-After: 2`** |

> **`boolean` 이면 `202` 계약을 만들 수 없다.** 타임아웃을 실패로 처리하는 순간 **"돈은 나갔는데 실패로 기록된 결제"** 가 생긴다. 3상태는 편의가 아니라 계약의 최소치다.

---

## §5 어댑터

### 5.1 `:adapter-persistence` — ORM 없음

기술 선택의 근거는 **ADR-0008**. 여기서는 구현 규칙만 정한다.

| 규칙                       | 내용                                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| 도구                       | `JdbcClient` · 배치 INSERT 만 `JdbcTemplate.batchUpdate`                                         |
| 표현                       | 도메인 ↔ ResultSet**한 겹**(RowMapper). 중간 엔티티 없음                                       |
| **락 순서**          | **어댑터 안 2단계** — ① 주소→id 해석(락 없음) ② `id = ANY(정렬됨) ORDER BY id FOR UPDATE` |
| **`lock_timeout`** | **`lockForUpdate` 구현 안에서** `SET LOCAL`                                                 |
| **저장 순서**        | **`hold` → `seats`** — `trip_seat.hold_id` 가 `seat_hold.id` 를 가리키는 FK           |
| `hold_id` 해석           | `(SELECT id FROM seat_hold WHERE public_id = ?)` **서브쿼리**                                 |
| **쓰기 후**          | **영향 행 수가 기대치와 다르면 예외**                                                           |
| 테스트                     | ⚠️**Testcontainers 없이 Repository 를 짜지 않는다**                                           |

> **커맨드는 `bigserial` 을 들 수 없다**(§1.3). 그래서 포트가 주소만 받고, 정렬은 어댑터가 만든다. `data.md` §4.2 의 "애플리케이션이 이미 정렬해서 넘긴다" 에서 그 애플리케이션은 **어댑터 코드**다.
>
> **서브쿼리를 쓰는 이유는 어댑터가 무상태여야 하기 때문이다.** `HoldRepository.save` 와 `SeatRepository.saveAll` 은 다른 포트라, 방금 만든 id 를 들고 있으면 동시 요청끼리 섞인다.
>
> **영향 행 수를 보는 이유** — 락을 쥐고 있는데 0행이면 **락이 깨진 것**이다. 조용히 넘어가면 증명이 무너진다.

### 5.2 `:adapter-cache` — 한 모듈에서 실패 정책이 갈린다

| 포트                                                               | 정책                  |
| ------------------------------------------------------------------ | --------------------- |
| `SeatMapCache` · `SeatChangePublisher` · `SeatEventStream` | **fail-open**   |
| `LoginAttemptLimiter`                                            | **fail-open**   |
| **`RefreshTokenStore`**                                    | **fail-closed** |

```java
FailOpen.run("seatmap", () -> redis.hSet(key, delta));   // 삼키고 WARN
refreshStore.verify(jti);                                 // 래퍼 없음 = fail-closed
```

> **래퍼가 없는 호출이 fail-closed다.** 정책을 주석이 아니라 **호출 형태**로 표시한다. 근거는 `data.md` §6.7.

**발행** — `afterCommit` 한 블록에서 `HSET`(캐시 갱신)과 `XADD`(팬아웃)를 **둘 다** 한다 (`data.md` §6.3).

**소비**

| 결정                                   | 이유                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| **서버당 소비 스레드 1개**       | 운행마다 스레드면 600개다.`XREAD` 는 여러 키를 한 번에 읽는다                    |
| **`BLOCK 1000`** (0 이 아니라) | 무한 블록이면 새 구독이 끼어들 수 없다. 1초마다 깨어나 구독 집합을 다시 스냅샷한다 |
| 구독 0개                               | 짧게 sleep — 키 없이`XREAD` 를 부를 수 없다                                     |
| **캐치업은 `XRANGE` 로 분리**  | 연결마다`Last-Event-ID` 가 다르다. 공용 스레드는 "지금 이후"만 읽는다            |

> **캐치업 분리가 1초 지연도 같이 해결한다.** 새 구독이 최대 1초 늦게 반영돼도 그 사이 이벤트는 `XRANGE` 가 가져온다. **구멍이 안 생긴다.**

### 5.3 `:adapter-payment`

| 항목                  | 값                                                              |
| --------------------- | --------------------------------------------------------------- |
| 클라이언트            | `RestClient`                                                  |
| 타임아웃              | connect**3s** · read **10s** → 넘으면 `UNKNOWN` |
| **자동 재시도** | **금지.** 토스에 우리 멱등키를 그대로 전달한다            |
| 경로                  | DMZ 아웃바운드 프록시(tinyproxy) 경유                           |
| 시크릿                | 환경변수 ·**로그·예외 메시지에 싣지 않는다**            |
| 호출 위치             | ⚠️**`TransactionRunner` 람다 밖**                     |

**확정 경로의 트랜잭션 경계**

| 단계              | 내용                                                |
| ----------------- | --------------------------------------------------- |
| ① tx1            | 선점 유효 검사 ·`payment` `REQUESTED` 기록     |
| ②**tx 밖** | 토스 승인 —**롤백되지 않는다**               |
| ③ tx2            | 좌석`SOLD` · 예약 생성 · `hold` `CONFIRMED` |

> **의도 — ②를 트랜잭션 안에 넣으면 좌석 락을 쥔 채 외부 HTTP 를 기다린다.** 넣어도 롤백은 안 되므로 얻는 것이 없다.
>
> **대가로 "승인됐는데 예약이 없는" 창이 열린다.** 그래서 `payment.reservation_id` 가 nullable 이고, `status='APPROVED' AND reservation_id IS NULL` **한 조건이 보상 취소 대상을 전부 찾아낸다.**

### 5.4 `:adapter-security`

| 항목                        | 값                                          | 근거                                                                      |
| --------------------------- | ------------------------------------------- | ------------------------------------------------------------------------- |
| 의존                        | **`spring-security-crypto`** + jjwt | 필터 체인은`:adapter-web` 의 일                                         |
| BCrypt cost                 | **10**                                | 12 는 ~250ms.**부하 시험에서 로그인이 좌석 경합 수치를 오염시킨다** |
| JWT                         | **HS256** 대칭키                      | 발급자와 검증자가 같은 프로세스다                                         |
| `TokenIssuer.verify` 반환 | **`long memberId`**                 | 원시 타입이라야`:adapter-web` 이 쓴다 (§1.3)                           |
| clock skew                  | 30초                                        |                                                                           |

### 5.5 `:adapter-web`

| 항목                  | 결정                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| 인증                  | **Spring Security** — `SecurityFilterChain` 빈 하나. **SSE 만 비인증**(`api.md` §6.1) |
| 에러                  | `@RestControllerAdvice` 하나 · RFC 9457                                                              |
| 멱등키                | **유스케이스에서** — `payment.idempotency_key` UNIQUE 를 쓴다                                  |
| 상관관계 ID           | `X-Request-Id` → MDC 필터 (가장 바깥)                                                                |
| **가상 스레드** | **끄고 시작한다**                                                                                 |

**로그 레벨은 의미로 가른다**

| 예외                      | status · code                                | 로그                                        |
| ------------------------- | --------------------------------------------- | ------------------------------------------- |
| `SeatUnavailable`       | `409 SEAT_ALREADY_HELD` + `failedSeats[]` | **`INFO`**                          |
| `SeatLockTimeout`       | `409 SEAT_LOCK_TIMEOUT`                     | **`INFO`**                          |
| `HoldExpired`           | `410 HOLD_EXPIRED`                          | **`INFO`**                          |
| `HoldNotOwned`          | `403 HOLD_NOT_OWNED`                        | `WARN`                                    |
| `PaymentDeclined`       | `402 PAYMENT_DECLINED`                      | `INFO`                                    |
| `PaymentAmountMismatch` | `400 PAYMENT_AMOUNT_MISMATCH`               | **`WARN`** — 위변조 시도일 수 있다 |
| `IdempotencyKeyReused`  | `409 IDEMPOTENCY_KEY_REUSED`                | `WARN`                                    |
| 그 외                     | `500` · 내부 비노출                        | `ERROR`                                   |

> ⚠️ **`4xx = WARN` 이 아니다.** `409` 는 이 시스템의 **정상 결과**다. `WARN` 으로 찍으면 부하 시험 중 로그가 전부 경고가 되고 로그 I/O 가 병목이 된다 (`operate.md` §1). 반대로 `403` 과 금액 불일치는 **사람의 비정상 시도**라 `WARN` 이 맞다.

> **가상 스레드를 끄는 이유는 측정이다.** 산출물이 "초과 판매 0건과 지연 분포"인데, 첫 측정부터 켜면 락 대기 때문인지 스케줄링 때문인지 구분할 변수가 는다. **플랫폼 스레드로 기준선을 먼저 잡고** 비교한다.

**SSE 팬아웃 — 느린 연결 격리**

콜백은 소비 스레드(`:adapter-cache`)에서 실행되는데 `SseEmitter.send` 는 블로킹이다. 그대로 두면 **느린 클라이언트 하나가 서버 전체의 SSE 를 멈춘다.**

| 단계                | 내용                                            |
| ------------------- | ----------------------------------------------- |
| 소비 스레드         | **연결별 큐(64)에 넣고 바로 돌아온다**    |
| 전송 워커           | 여기서만 블로킹한다                             |
| **큐가 가득** | **그 연결만 끊는다**                      |
| 클라                | 재연결 →`Last-Event-ID` → `XRANGE` 캐치업 |

> **끊는 게 손실이 아닌 이유** — 재개 창(`MAXLEN ~ 1000`) 안이면 `XRANGE` 가 전부 되돌려준다. **이미 있는 장치를 쓴다.**
>
> 큐 길이 **64는 근거가 약한 초기값**이다 — 부하 시험에서 조정한다.
>
> `:adapter-cache` 는 `:adapter-web` 이 있는 줄도 모른다. 콜백은 `:application` 의 `SeatEventStream` 포트로만 건넨다.

### 5.6 `:adapter-scheduling`

| 항목          | 값                                                                |
| ------------- | ----------------------------------------------------------------- |
| 트리거        | `@Scheduled(fixedDelay = 30s)` — `fixedRate` 아님(겹침 방지) |
| 스케줄러 풀   | 1                                                                 |
| 배치          | `LIMIT 200` — 못 처리한 건 다음 주기 + lazy 판정               |
| CAS 충돌 로그 | **`DEBUG`** — 경합에서 진 것은 정상이다                  |
| 메트릭        | 회수 건수 · 스캔 소요 · CAS 충돌 수                             |

**앱 2대에서 두 번 돈다 — 그대로 둔다**

| 후보                      | 판정                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Redis 분산 락으로 한 대만 | ❌**Redis 가 죽으면 만료 회수가 멈춘다.** `data.md` §6.7 의 "Redis 가 죽어도 예매는 동작한다"와 부딪힌다 |
| **둘 다 실행**      | ✅                                                                                                                |

> **중복 실행이 안전한 이유는 이미 만들어뒀기 때문이다.** §4.3 의 `version` CAS 가 정확히 이 상황을 막는다 — 두 대가 같은 200건을 집어도 **행마다 한쪽만 성공**한다.
>
> 낭비는 30초마다 스캔 쿼리가 두 번 되는 것뿐이다. **정확성을 위해 만든 장치가 가용성까지 사주는 자리**라, 분산 락을 얹으면 오히려 손해다.

---

## §6 이름 규칙 총람

| 종류                     | 접미사                                        | 사는 모듈        |
| ------------------------ | --------------------------------------------- | ---------------- |
| 인바운드 포트            | **`*UseCase`** — 예외 없음           | `:application` |
| 인바운드 구현            | `*Service`                                  | 〃               |
| 입출력 DTO               | `*Command` · `*Query` · `*Result`     | 〃               |
| 아웃바운드 — 도메인     | `*Repository`                               | 〃 (선언)        |
| 아웃바운드 — Projection | `*Reader`                                   | 〃 (선언)        |
| HTTP 계약                | `*Request` · `*Response` · `*Payload` | `:adapter-web` |
| 도메인                   | **접미사 없음**                         | `:domain`      |

> ⚠️ **`*Query` 는 DTO 전용이다.** 조회 포트를 `SeatMapQuery` 라고 부르면 입력 DTO 와 접미사가 겹친다.

---

## §7 열린 항목

미확정은 **[README 부록](README.md#부록--미확정)** 에만 둔다 — 이 문서 것은 `U-1` 언어 · `U-3` `lock_timeout` · `U-4` 가상 스레드 · `U-5` SSE 큐 길이.

**뒤집을 수 있게 표시해 둔 결정** — 미확정이 아니라 결정이다. §3.3 예약 목록의 도메인 경유.

---

## 관련 문서

[data.md](data.md) · [api.md](api.md) · [operate.md](operate.md) · [tech.md](tech.md) · [adr/](adr/)

---

**← 앞** [tech.md](tech.md) — 무슨 기술로 · **다음 →** [data.md](data.md) — 좌석을 어떻게 지키나
