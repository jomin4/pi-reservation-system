/*
 * pi-reservation-system — C4 모델
 *
 *   진실은 이 파일이다. docs/diagrams/c4/*.svg 는 렌더 산출물이다.
 *
 *   ./scripts/diagrams.sh validate   문법만 — 몇 초
 *   ./scripts/diagrams.sh render     SVG 까지
 *
 * ⚠️ 구조가 바뀌면 이 파일을 같은 PR 에서 고친다 (CLAUDE.md 기록 의무).
 *
 * 표기 규칙
 *   - 모든 요소   이름 + 설명 + [기술]. L1 요소에는 기술을 쓰지 않는다
 *   - 모든 관계   동사구 + [프로토콜]
 *   - 한 뷰에 한 추상화 수준. 컨테이너와 컴포넌트를 섞지 않는다
 *   - 설명은 짧게. 길면 박스가 세로로 늘어져 그림이 무너진다
 *
 * ⚠️ 관계는 가장 낮은 수준에서 한 번만 적는다.
 *    시스템 사이 관계(L1)는 컨테이너 관계에서 자동으로 파생된다 — 아래 !impliedRelationships.
 *    L1 에도 같은 관계를 손으로 적으면 두 곳이 어긋난다.
 */

workspace "pi-reservation-system" "코레일 전산망 구조를 벤치마킹해 재구성한 폐쇄망 좌석 예매 시스템" {

    model {
        # 컨테이너 관계에서 시스템 관계를 만들되, 설명을 그대로 물려준다.
        !impliedRelationships "com.structurizr.model.CreateImpliedRelationshipsUnlessSameRelationshipExistsStrategy"

        passenger = person "승객" "운행을 조회하고 좌석을 예매한다. 이 시스템의 유일한 역할이다."
        operator  = person "운영자" "관측하고 경보에 대응한다. 1인이다."

        reservationSystem = softwareSystem "예매 시스템" "좌석을 10분간 선점하고 결제를 거쳐 예약으로 확정한다. 같은 좌석에 요청이 몰려도 정확히 1건만 성공한다." {

            group "클라이언트" {
                webapp = container "웹 SPA" "예매 화면. 좌석맵을 SSE 로 갱신한다." "React 19 · Vite · Cloudflare Pages"
                mobile = container "모바일 앱" "예매 화면. APK 직접 배포." "React Native · Expo"
            }

            group "경계" {
                tunnel = container "cloudflared" "아웃바운드 연결로 집 서버를 노출한다. 열린 포트가 없다." "Cloudflare Tunnel"
                proxy  = container "nginx" "리버스 프록시. 앱을 최대 2대까지 분배한다." "nginx"
                egress = container "tinyproxy" "유일한 바깥길. 화이트리스트 3곳." "tinyproxy"
            }

            api = container "API 애플리케이션" "선점 · 결제 · 확정 · 만료 회수. 헥사고날 9모듈." "Java 21 · Spring Boot 4.1" {

                # 컴포넌트 = Gradle 모듈. 경계를 규율이 아니라 빌드가 지킨다 (ADR-0001 · back.md §1).
                domainMod      = component ":domain" "애그리거트 4개와 값 객체. 6석 규칙이 여기 산다." "Gradle 모듈 · 의존성 0" {
                    tags "Core"
                }
                applicationMod = component ":application" "유스케이스 21개. 포트 36개를 선언한다. 스프링을 모른다." "Gradle 모듈"

                webAdapter        = component ":adapter-web" "REST 20개 · SSE · 예외를 HTTP 로. :domain 을 못 본다." "Gradle 모듈"
                schedulingAdapter = component ":adapter-scheduling" "30초마다 만료 선점을 회수시킨다." "Gradle 모듈"
                securityAdapter   = component ":adapter-security" "BCrypt · JWT." "Gradle 모듈"
                persistenceAdapter = component ":adapter-persistence" "JdbcClient · 락 · CAS · Projection." "Gradle 모듈"
                cacheAdapter      = component ":adapter-cache" "캐시 · Stream · 토큰 · 시도 제한." "Gradle 모듈"
                paymentAdapter    = component ":adapter-payment" "토스 승인. 3상태를 돌려준다." "Gradle 모듈"

                bootstrapMod   = component ":bootstrap" "빈 35개를 손으로 조립한다. 유일한 실행 모듈." "Gradle 모듈"
            }

            group "데이터" {
                db    = container "PostgreSQL" "좌석의 진실. trip_seat 48만 행." "PostgreSQL 17" {
                    tags "Database"
                }
                redis = container "Redis" "좌석맵 캐시 · 이벤트 Stream · Refresh 토큰." "Redis 7" {
                    tags "Database"
                }
            }

            backup = container "백업 작업" "덤프를 암호화해 오프사이트로 보낸다." "cron · pg_dump · age · rclone"

            group "관측" {
                prometheus   = container "Prometheus" "긁어서 모은다. 익스포터 3종 + 앱 Actuator." "Prometheus"
                promtail     = container "Promtail" "앱의 JSON stdout 을 긁는다." "Promtail"
                loki         = container "Loki" "로그 저장소." "Loki"
                grafana      = container "Grafana" "메트릭과 로그를 한 화면에서 본다." "Grafana"
                alertmanager = container "Alertmanager" "경보를 묶어 내보낸다." "Alertmanager"

                nodeExporter = container "node_exporter" "호스트 CPU · RAM · 스왑 · 디스크." "node_exporter"
                pgExporter   = container "postgres_exporter" "PostgreSQL 통계." "postgres_exporter"
                redisExporter = container "redis_exporter" "Redis INFO." "redis_exporter"
            }
        }

        /*
         * 배포 — Docker 네트워크 3개가 겹친다.
         *
         * 배포 노드는 트리라 "nginx 는 dmz 와 app 양쪽" 을 직접 못 쓴다.
         * 그래서 노드 이름을 멤버십 조합으로 둔다 — 겹치는 컨테이너가 어디에 걸려 있는지
         * 이름만 봐도 읽히고, 트리 제약을 거짓말로 메우지 않는다 (infra.md §2).
         */
        production = deploymentEnvironment "운영" {

            cloudflare = deploymentNode "Cloudflare" "엣지. 우리 호스트에 열린 포트가 없다." "Cloudflare" {
                pages = deploymentNode "Pages" "정적 SPA 호스팅" "Cloudflare Pages" {
                    containerInstance webapp
                }
            }

            androidDevice = deploymentNode "승객 안드로이드 기기" "APK 직접 배포 (Play Store 를 안 쓴다)" "Android" {
                containerInstance mobile
            }

            host = deploymentNode "Ubuntu 24.04 LTS · 개인 PC" "RAM 8GB · SSD 512GB · 헤드리스. 평시 ≈ 4.35GB, 앱 2대면 ≈ 5.25GB" "Ubuntu 24.04 LTS" {

                compose = deploymentNode "Docker Compose" "포트를 하나도 공개하지 않는다 (infra.md §2.1)" "Docker Engine" {

                    netDmz = deploymentNode "net:dmz" "외부와 닿는 유일한 구간" "Docker 네트워크" {
                        containerInstance tunnel
                    }

                    netDmzApp = deploymentNode "net:dmz + net:app" "두 네트워크에 걸친다" "Docker 네트워크" {
                        containerInstance proxy
                        containerInstance egress
                    }

                    netApp = deploymentNode "net:app" "관측 1.18GB. 인터넷에 직접 못 나간다" "Docker 네트워크" {
                        containerInstance prometheus
                        containerInstance promtail
                        containerInstance loki
                        containerInstance grafana
                        containerInstance alertmanager
                        containerInstance nodeExporter
                    }

                    netAppData = deploymentNode "net:app + net:data" "앱 0.9GB × 최대 2대. DB 에 닿는 건 앱뿐이다" "Docker 네트워크" {
                        containerInstance api
                        containerInstance backup
                    }

                    netData = deploymentNode "net:data" "PostgreSQL 0.8GB · Redis 0.4GB. 호스트 포트를 열지 않는다" "Docker 네트워크" {
                        containerInstance db
                        containerInstance redis
                        containerInstance pgExporter
                        containerInstance redisExporter
                    }
                }
            }
        }

        toss = softwareSystem "토스페이먼츠" "결제 승인과 취소." {
            tags "External"
        }
        r2 = softwareSystem "Cloudflare R2" "오프사이트 백업 버킷." {
            tags "External"
        }
        discord = softwareSystem "Discord" "운영 경보를 받는 곳." {
            tags "External"
        }

        # ── 사람 ────────────────────────────────────────────────
        passenger -> webapp "좌석을 예매한다" "HTTPS"
        passenger -> mobile "좌석을 예매한다" "HTTPS"
        passenger -> toss "결제 수단을 직접 입력한다" "HTTPS"
        operator  -> tunnel "대시보드에 접속한다" "HTTPS · Cloudflare Access"
        discord   -> operator "경보를 알린다"

        # ── 요청 경로 ───────────────────────────────────────────
        webapp -> tunnel "API 를 호출한다" "HTTPS/JSON · SSE"
        mobile -> tunnel "API 를 호출한다" "HTTPS/JSON · SSE"
        tunnel -> proxy "요청을 넘긴다" "HTTP"
        tunnel -> grafana "대시보드를 넘긴다" "HTTP"

        # ── 모듈 사이 — 안쪽을 향한다 ───────────────────────────
        #
        # ⚠️ 화살표는 컴파일 의존 방향이다. 호출 방향과 반대인 선이 셋 있다.
        #    어댑터가 포트를 "구현한다" 고 적힌 선이 그것이다 —
        #    의존은 안쪽으로 가고 호출은 바깥으로 나간다. 그게 의존성 역전이다.
        proxy -> webAdapter "요청을 분배한다" "HTTP"

        webAdapter        -> applicationMod "인바운드 포트를 호출한다"
        schedulingAdapter -> applicationMod "SweepExpiredHoldsUseCase 를 부른다"
        applicationMod    -> domainMod "규칙을 판정시킨다"

        persistenceAdapter -> applicationMod "아웃바운드 포트 11개를 구현한다"
        cacheAdapter       -> applicationMod "캐시 · Stream · 토큰 포트를 구현한다"
        paymentAdapter     -> applicationMod "PaymentGateway 를 구현한다"
        securityAdapter    -> applicationMod "PasswordHasher · TokenIssuer 를 구현한다"

        persistenceAdapter -> domainMod "도메인 객체를 행으로 매핑한다"
        cacheAdapter       -> domainMod "SeatChanged 가 SeatAddress 를 담는다"
        paymentAdapter     -> domainMod "OrderId · 금액을 다룬다"

        bootstrapMod -> applicationMod "유스케이스를 빈으로 등록한다"
        bootstrapMod -> webAdapter "조립한다"
        bootstrapMod -> schedulingAdapter "조립한다"
        bootstrapMod -> securityAdapter "조립한다"
        bootstrapMod -> persistenceAdapter "조립한다"
        bootstrapMod -> cacheAdapter "조립한다"
        bootstrapMod -> paymentAdapter "조립한다"

        # ── 데이터 ──────────────────────────────────────────────
        persistenceAdapter -> db "좌석을 잠그고 읽고 쓴다" "JDBC · FOR UPDATE"
        cacheAdapter       -> redis "캐시 · XADD · XREAD · 토큰" "RESP"

        # ── 바깥길 ──────────────────────────────────────────────
        paymentAdapter -> egress "결제 승인을 내보낸다" "HTTP CONNECT"
        backup -> db "덤프를 뜬다" "libpq"
        backup -> egress "암호화한 덤프를 내보낸다" "HTTP CONNECT"
        egress -> toss "승인과 취소를 요청한다" "HTTPS"
        egress -> r2 "백업을 올린다" "HTTPS"

        # ── 관측 ────────────────────────────────────────────────
        # 긁어 오는 쪽이 화살표의 출발점이다 (operate.md §5 의 그림은 데이터 흐름이라 방향이 반대다).
        promtail   -> api "JSON stdout 을 긁는다" "Docker 로그 파일"
        promtail   -> loki "로그를 밀어 넣는다" "HTTP"

        pgExporter    -> db "통계를 읽는다" "SQL"
        redisExporter -> redis "INFO 를 읽는다" "RESP"

        prometheus -> api "메트릭을 수집한다" "HTTP · /actuator/prometheus"
        prometheus -> nodeExporter "메트릭을 수집한다" "HTTP"
        prometheus -> pgExporter "메트릭을 수집한다" "HTTP"
        prometheus -> redisExporter "메트릭을 수집한다" "HTTP"

        grafana    -> prometheus "메트릭을 질의한다" "PromQL"
        grafana    -> loki "로그를 질의한다" "LogQL"
        prometheus -> alertmanager "경보를 넘긴다" "HTTP"
        alertmanager -> discord "경보를 보낸다" "Webhook"
    }

    views {
        systemContext reservationSystem "01-context" "L1 시스템 컨텍스트 — 예매 시스템 · 2026-09-17" {
            include *
            autolayout lr 300 300
        }

        /*
         * L2 를 두 장으로 쪼갠다.
         *
         * 관측이 컨테이너 17개 중 8개라 한 장에 담으면 예매 경로가 묻힌다.
         * 무엇보다 두 장은 읽는 목적이 다르다 —
         *   02   요청이 어디를 거쳐 가고 상태가 어디에 남나
         *   02b  무엇이 무엇을 긁어 가나
         * 모델은 하나이므로 쪼개도 어긋나지 않는다. 뷰만 다르게 자른다.
         */

        container reservationSystem "02-container" "L2 컨테이너 — 예매 경로 · 2026-09-17 · 요청이 어디를 거쳐 가고 상태가 어디에 남나" {
            include *
            exclude prometheus promtail loki grafana alertmanager
            exclude nodeExporter pgExporter redisExporter
            exclude operator discord
            autolayout lr 300 200
        }

        container reservationSystem "02b-container-observability" "L2 컨테이너 — 관측 · 2026-09-17 · 무엇이 무엇을 긁어 가나" {
            include prometheus promtail loki grafana alertmanager
            include nodeExporter pgExporter redisExporter
            include api db redis operator discord tunnel

            # 관측 뷰에서 예매 경로의 선은 잡음이다. 대상만 보이면 된다.
            exclude "api -> db"
            exclude "api -> redis"
            exclude "api -> egress"
            exclude "proxy -> api"

            autolayout lr 300 200
        }

        component api "03-component-api" "L3 컴포넌트 — API 애플리케이션 · 2026-09-17 · 모듈 9개가 어느 쪽으로 기대나" {
            include *
            exclude prometheus promtail loki grafana alertmanager
            exclude nodeExporter pgExporter redisExporter
            exclude operator discord backup
            autolayout lr 300 150
        }

        /*
         * 동적 뷰 — 이 프로젝트가 증명하려는 것이 여기 있다.
         *
         * 정적 뷰(01~03)는 "무엇이 무엇에 기대나" 를 보여주고,
         * 동적 뷰는 "같은 좌석에 요청이 몰릴 때 무슨 순서로 벌어지나" 를 보여준다.
         * 단계의 화살표는 모델에 이미 있는 관계를 순서대로 다시 밟는 것이다 —
         * 없는 관계는 못 쓴다. 그래서 동적 뷰가 정적 모델을 검산해 준다.
         */
        dynamic reservationSystem "d1-hold-contention" "동적 — 같은 좌석 경합 · 2026-09-18 · 왜 정확히 1건만 성공하나" {
            webapp -> tunnel "A: POST /holds — 4호차 7A · 7B"
            tunnel -> proxy "전달"
            proxy -> api "요청 A"
            api -> db "SET LOCAL lock_timeout '200ms' · id 오름차순 FOR UPDATE — 두 행 잠금 획득"

            mobile -> tunnel "B: 같은 좌석으로 POST /holds"
            tunnel -> proxy "전달"
            proxy -> api "요청 B"
            api -> db "같은 두 행에 FOR UPDATE — 여기서 200ms 대기가 시작된다"

            api -> db "A: Hold.open 전수 판정 통과 → HELD · version+1 · seat_hold INSERT · COMMIT"
            api -> redis "A: afterCommit — HSET 갱신 + XADD 팬아웃"

            api -> db "B: 잠금 획득. 그러나 status 가 이미 HELD — 판정 실패로 롤백, 409 ALL_OR_NOTHING"

            properties {
                "plantuml.sequenceDiagram" "true"
            }
        }

        dynamic reservationSystem "d2-confirm-payment" "동적 — 확정 경로 · 2026-09-18 · 롤백 안 되는 결제를 트랜잭션 둘로 감싼다" {
            webapp -> tunnel "① POST /holds/{id}/payment-intent"
            tunnel -> proxy "전달"
            proxy -> api "요청"
            api -> db "tx1 — 선점 유효 검사 · payment REQUESTED · order_id 와 amount 를 못박는다 · COMMIT"

            passenger -> toss "② 결제창에 카드 정보를 넣는다 — 서버를 거치지 않는다"

            webapp -> tunnel "③ POST /holds/{id}/payment — Idempotency-Key 필수"
            tunnel -> proxy "전달"
            proxy -> api "요청"
            api -> db "order_id 로 금액 대조 — 클라이언트가 보낸 amount 를 믿지 않는다"

            api -> egress "④ 트랜잭션 밖에서 승인 요청 — 좌석 락을 쥐고 있지 않다"
            egress -> toss "승인 (connect 3s · read 10s · 자동 재시도 없음)"

            api -> db "tx2 — 좌석 SOLD · 예약 생성 · hold CONFIRMED · payment APPROVED · COMMIT"
            api -> redis "afterCommit — HSET 갱신 + XADD 팬아웃"

            api -> db "⑤ tx2 가 깨지면: payment 는 APPROVED 인데 reservation_id IS NULL — 보상 취소 대상"

            properties {
                "plantuml.sequenceDiagram" "true"
            }
        }

        /*
         * d3 는 범위를 줄인 그림이다.
         *
         * 프로세스 안의 팬아웃(연결별 큐 64 → 전송 워커 → SseEmitter)은 여기 없다.
         * :adapter-cache 와 :adapter-web 이 서로를 모르게 설계했기 때문이다 —
         * 콜백은 :application 의 SeatEventStream 포트로만 건넨다(back.md §5.5).
         * 그릴 선이 없는 게 설계가 맞다는 뜻이라, 없는 선을 지어내지 않고 표에 맡긴다.
         */
        dynamic reservationSystem "d3-sse-fanout" "동적 — SSE 발행과 재개 · 2026-09-18 · Redis 왕복 세 번" {
            webapp -> tunnel "GET /trips/101/seat-events — Last-Event-ID 를 들고"
            tunnel -> proxy "전달"
            proxy -> api "구독 시작"
            api -> redis "① 재개 — XRANGE 로 Last-Event-ID 다음 구간을 한 번에 따라잡는다"

            api -> db "다른 요청의 선점이 커밋된다"
            api -> redis "② 발행 — afterCommit 한 블록에서 HSET 갱신 + XADD (MAXLEN ~ 1000)"

            api -> redis "③ 소비 — XREAD BLOCK 1000. 구독 중인 키만, 매 루프 스냅샷"
            api -> redis "받은 이벤트는 연결별 큐(64) → 전송 워커로 나간다. 프로세스 안이라 이 그림에 선이 없다 — back.md §5.5"

            properties {
                "plantuml.sequenceDiagram" "true"
            }
        }

        deployment reservationSystem "운영" "deploy-host" "배포 — 단일 호스트 · 2026-09-18 · 8GB 한 대에 이게 다 어떻게 들어가나" {
            include *
            autolayout tb 300 200
        }

        styles {
            element "Person" {
                shape person
                background #0B6BCB
                color #ffffff
            }
            element "Software System" {
                background #1A4D8F
                color #ffffff
            }
            element "Container" {
                background #3E7CC4
                color #ffffff
            }
            element "Component" {
                background #6FA3DC
                color #17324D
            }
            element "Core" {
                background #1E7A4A
                color #ffffff
            }
            element "Database" {
                shape cylinder
            }
            element "External" {
                background #6B7280
                color #ffffff
            }
        }
    }
}
