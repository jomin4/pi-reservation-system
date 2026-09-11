# 인프라 설계

Ubuntu 24.04 단일 호스트 · 확정일 2026-09-10

> **근거 ADR** — [ADR-0005 단일 호스트 전환](adr/0005-single-host-onpremise.md) · [ADR-0006 R2 백업](adr/0006-backup-to-cloudflare-r2.md)
>
> **기준 그림** — [system-architecture](diagrams/system-architecture.html) · [deployment-topology](diagrams/deployment-topology.html)

## §0 이 문서의 범위

| | **이 문서 (`infra.md`)** | `deploy.md` (미작성) |
|---|---|---|
| 답하는 질문 | **"무엇이 어디서 도는가"** | **"코드가 어떻게 거기까지 가는가"** |
| 다루는 것 | 호스트 · 네트워크 · 컨테이너 · 볼륨 · 백업 · 보안 | CI · 파이프라인 · 릴리스 절차 |
| 바뀌는 빈도 | 낮다 | 자주 |

---

## §1 호스트

| 항목 | 값 |
|---|---|
| OS | **Ubuntu 24.04 LTS** |
| RAM | **8 GB** |
| 디스크 | 512 GB SSD |
| NIC | 1개 (벽 랜선 직결) |
| **데스크톱 환경** | ⚠️ **끈다.** SSH로만 접속 |
| 컨테이너 런타임 | Docker Engine + Compose v2 |

> ⚠️ **GNOME이 1.5~2GB를 먹는다.** 8GB에서 그건 앱 서버 두 대 값이다. **헤드리스가 예산의 전제**이지 취향이 아니다.

### 1.1 메모리 예산

**추정치. 실측 후 조정한다.**

| 구성 | 평시 | 근거 |
|---|---|---|
| Ubuntu + Docker | 0.8 GB | |
| PostgreSQL 17 | 0.8 GB | `shared_buffers 256MB` |
| Redis 7 | 0.4 GB | `maxmemory 256MB` (`data.md` §6.8) |
| **Spring Boot ×1** | 0.9 GB | heap 512MB |
| nginx · cloudflared · tinyproxy | 0.13 GB | |
| Prometheus · Grafana | 0.6 GB | |
| Loki · Promtail | 0.5 GB | |
| **Actions self-hosted runner** | **0.25 GB** | `deploy.md` §5.3 — pull·compose만 |
| **합계** | **≈ 4.35 GB** | **여유 3.65 GB** |
| 앱 2대 시 | ≈ 5.25 GB | 여유 2.75 GB |

> **여유가 필요한 이유는 PostgreSQL의 OS 페이지 캐시다.** `trip_seat` 48만 행이 인덱스 포함 **100MB 안쪽**이라 통째로 캐시에 올라간다 — **데이터가 작아서 8GB로 되는 것**이지 8GB가 넉넉해서가 아니다.

**예산이 모자라면 버리는 순서**

| 순위 | 버릴 것 | 잃는 것 |
|---|---|---|
| 1 | **Loki · Promtail** | 로그 통합 조회 (`docker compose logs`로 대체) |
| 2 | Grafana | 대시보드 (Prometheus 원본은 남는다) |
| 3 | 앱 2대 → 1대 | **SSE 팬아웃 실증** |

> **앱 2대가 Loki보다 우선이다.** `operate.md` §5에 같은 순위를 적어뒀다 — 관측은 없어도 시스템이 돌지만, 팬아웃은 못 보여주면 설계가 종이로만 남는다.

### 1.2 컨테이너 메모리 상한

| 서비스 | `mem_limit` | JVM |
|---|---|---|
| `app` | **1 GB** | `-XX:MaxRAMPercentage=70` (≈ heap 700MB 상한) |
| `postgres` | 1 GB | — |
| `redis` | 512 MB | `maxmemory 256MB` |
| 나머지 | 각 256~512 MB | — |

> **JVM에 `-Xmx`를 박지 않고 `MaxRAMPercentage`를 쓴다.** 컨테이너 상한을 바꾸면 힙이 따라 움직인다 — **한 곳(`mem_limit`)만 고치면 되게** 만든다.

---

## §2 네트워크 — Docker 3분리

물리 VLAN을 대신하는 논리 격리다 (ADR-0005).

```
net:dmz    cloudflared · nginx · tinyproxy      ← 외부와 닿는 유일한 구간
net:app    app                                   ← dmz · data 양쪽에 걸친다
net:data   postgres · redis                      ← 호스트 포트를 열지 않는다
```

| 서비스 | `net:dmz` | `net:app` | `net:data` |
|---|:---:|:---:|:---:|
| `cloudflared` | ✅ | | |
| `nginx` | ✅ | ✅ | |
| `tinyproxy` | ✅ | ✅ | |
| **`app`** | | ✅ | ✅ |
| `postgres` · `redis` | | | ✅ |
| Prometheus · Grafana · Loki | | ✅ | |

> **`app`만 두 네트워크에 걸친다.** 그래서 **DB에 닿을 수 있는 건 앱뿐**이고, 인터넷에 닿는 컨테이너(`cloudflared`)는 `net:data`를 아예 볼 수 없다. 이게 VLAN이 하던 일의 대체물이다.

### 2.1 포트 공개 — 하나도 안 한다

```yaml
# ❌ 절대 쓰지 않는다
ports:
  - "5432:5432"
  - "6379:6379"
```

| 서비스 | 호스트 포트 |
|---|---|
| 전부 | **없음** |

> **`cloudflared`도 포트를 안 연다.** 아웃바운드로 나가기 때문이다(`deployment-topology` 참조). **컴포즈 전체에 `ports:` 항목이 하나도 없는 게 정상 상태**이고, 하나라도 생기면 그건 설계가 새는 것이다.

**DB에 붙어야 할 때**

```bash
docker compose exec postgres psql -U pi -d pi
```

> 포트를 잠깐 여는 습관이 사고를 만든다. **`exec`로만 붙는다.**

---

## §3 컨테이너 구성

| 서비스 | 이미지 | 역할 | 재시작 |
|---|---|---|---|
| `cloudflared` | `cloudflare/cloudflared` | **터널 — 아웃바운드 연결** | `unless-stopped` |
| `nginx` | `nginx:alpine` | 리버스 프록시 · **LB** | `unless-stopped` |
| **`app`** | `ghcr.io/.../pi-api` | 예매 API | `unless-stopped` |
| `postgres` | `postgres:17-alpine` | **좌석의 진실** | `unless-stopped` |
| `redis` | `redis:7-alpine` | 캐시 · Stream | `unless-stopped` |
| `tinyproxy` | `tinyproxy` | 아웃바운드 화이트리스트 | `unless-stopped` |
| `prometheus` `grafana` `loki` `promtail` | 공식 | 관측 | `unless-stopped` |

**부팅 시 자동 기동** — `systemctl enable docker` + `restart: unless-stopped`. 별도 systemd 유닛을 만들지 않는다.

### 3.1 nginx — 1대일 때도 앞에 둔다

| 항목 | 값 |
|---|---|
| 업스트림 | `app:8080` — **Docker DNS가 `--scale` 시 자동으로 여러 개를 반환** |
| SSE | **버퍼링 끄기 필수** |
| 타임아웃 | SSE 경로만 길게 |

```nginx
location /api/v1/trips/ {
    proxy_pass http://app:8080;
    proxy_buffering off;              # ★ 없으면 SSE가 안 흐른다
    proxy_read_timeout 3600s;
    proxy_set_header Connection '';
    proxy_http_version 1.1;
}
```

> **`proxy_buffering off`를 빠뜨리면 SSE가 조용히 안 된다.** nginx가 응답을 모았다가 보내므로 **연결은 살아 있는데 이벤트가 안 온다** — 원인을 찾기 어려운 종류의 고장이다. `api.md` §6.1의 `X-Accel-Buffering: no` 헤더와 짝이다.

> **앱이 1대여도 nginx를 둔다.** 나중에 붙이면 SSE 경로 · 헤더 전달 · 타임아웃을 **그때 다시 검증**해야 한다(ADR-0005).

### 3.2 PostgreSQL 설정

| 파라미터 | 값 | 근거 |
|---|---|---|
| `shared_buffers` | **256 MB** | 8GB의 3% — 데이터가 100MB라 충분 |
| `work_mem` | **4 MB** | 커넥션당이라 낮게 |
| **`max_connections`** | **50** | 아래 계산 |
| `effective_cache_size` | 2 GB | OS 캐시 추정치 |
| `lock_timeout` | — | ⚠️ **전역 설정 안 함.** `SET LOCAL`로만 (`data.md` §4.5) |

**`max_connections` 50의 근거**

| 소비자 | 개수 |
|---|---|
| `app` Hikari 풀 (10) × 최대 2대 | 20 |
| Flyway 마이그레이션 | 1 |
| 백업 `pg_dump` | 1 |
| `psql` 수동 접속 | 2 |
| 여유 | 26 |

> **`lock_timeout`을 전역에 걸면 안 된다.** 200ms는 **좌석 선점 트랜잭션에만** 맞는 값이고, 마이그레이션은 3초를 쓴다(`data.md` §9.4). 전역으로 걸면 둘 중 하나가 틀린 값을 쓴다.

> **커넥션 수를 늘리는 게 답이 아니다.** `data.md` §8.10에서 봤듯 **락 경합이 심해지면 커넥션 고갈이 먼저 터지는데**, 이때 풀을 키우면 PostgreSQL에 더 많은 대기자가 몰릴 뿐이다. 대기는 앱 쪽 풀에서 하는 게 낫다.

---

## §4 외부 연결 — Cloudflare

### 4.1 터널

```
cloudflared ──아웃바운드 HTTPS/QUIC──▶ Cloudflare 엣지
                                          │
사용자 ── api.jomin4.cloud ──────────────┘
```

| 항목 | 값 |
|---|---|
| 방식 | **아웃바운드 연결.** 인바운드 포트 0 |
| 필요 없는 것 | **공인 IP · 포트포워딩 · DDNS · 공유기 설정** |
| 자격증명 | 터널 토큰 — `.env` (git 제외) |

> **집 네트워크가 인바운드 연결을 한 번도 받지 않는다.** 방화벽 입장에서는 웹서핑과 같은 아웃바운드 연결 하나다. **`overview.md`의 "폐쇄망"이 실제로 성립하는 지점**이 여기다.
>
> 벽 랜선이 세대단자함 공유기나 통신사 CGNAT 뒤에 있어도 **아무 영향이 없다.**

### 4.2 도메인 — `jomin4.cloud`

| 단계 | 내용 |
|---|---|
| 등록 | **가비아** (registrar로 유지) |
| **DNS 운영** | **Cloudflare로 위임** — 네임서버 교체 |
| 이후 | ⚠️ **가비아 DNS 설정은 무시된다.** 두 곳에서 관리하지 말 것 |

| 이름 | 대상 | 경로 |
|---|---|---|
| `jomin4.cloud` · `www` | 웹 | **Cloudflare Pages** — 터널을 안 탄다 |
| **`api.jomin4.cloud`** | 예매 API | Tunnel → nginx → app |
| `grafana.jomin4.cloud` | Grafana | Tunnel → ⚠️ **Access 필수** |

> **내 PC로 들어오는 건 API와 관리 페이지뿐이다.** 웹은 Cloudflare 안에서 호스팅되므로 노출면이 그만큼 줄어든다.

> ⚠️ **Grafana를 Access 없이 열면 로그인 화면이 인터넷에 노출된다.** 서브도메인은 인증서 투명성 로그로 알려진다 — 숨긴다고 안 숨겨진다. **Access가 앞에 서야 한다.**

---

## §5 아웃바운드 — 나가는 길은 셋뿐

| 목적지 | 용도 | 주체 |
|---|---|---|
| 토스페이먼츠 | 결제 승인 | 앱 |
| `*.r2.cloudflarestorage.com` | **암호화 백업 업로드** | 백업 크론 |
| **`discord.com`** | **운영 경보** | **Alertmanager** (`operate.md` §7) |

`tinyproxy` 화이트리스트로 강제하고, `net:app`은 **프록시 외 경로로 인터넷에 못 나간다.**

### 5.1 호스트 자신의 아웃바운드는 별개다

| 주체 | 나가는 곳 | 통제 |
|---|---|---|
| **컨테이너** | 위 3곳 | **tinyproxy 화이트리스트** |
| **호스트** | NTP · `apt` · **`github.com`(runner 폴링)** · `ghcr.io` | `ufw` outgoing 허용 |

> **"외부 출구 3곳"은 컨테이너 기준이다.** 호스트 자체는 시각 동기화와 패키지 업데이트, 그리고 **self-hosted runner의 폴링·이미지 수령**을 위해 나간다. **이 구분을 흐리면 문서가 거짓말이 된다.**

---

## §6 저장소 배치

**bind mount를 쓴다.** named volume보다 백업과 점검이 쉽다.

**전용 계정의 홈이 프로젝트 루트다** (2026-09-11 확정).

```
/home/resv/                       소유 resv:resv · 권한 750
├─ pi-reservation-system/         저장소 클론 — infra 세션의 작업 공간
├─ runner/                        GitHub Actions runner (_work 포함)
├─ data/                          ⭐ 컨테이너 데이터 — bind mount
│   ├─ postgres/ redis/
│   └─ prometheus/ loki/ grafana/
├─ config/                        nginx · tinyproxy · prometheus 설정
└─ secrets/                       ⚠️ 권한 700 · 파일 600
    ├─ .env                       DB 비밀번호 · 토스 키 · R2 키
    └─ age.pub                    백업 암호화 공개키
```

> **`/srv` 가 아니라 홈인 이유** — 이 PC 를 **프로젝트마다 계정 하나씩** 나눠 쓴다. 경계를 계정으로 그었으면 **디렉터리 경계도 홈과 일치**해야 권한이 자연스럽다. `/srv` 는 계정 개념이 없어 소유·권한을 따로 관리해야 한다.

> **백업 대상은 `data/` 와 `secrets/` 둘뿐이다.** 나머지는 저장소와 설치 과정에서 복원된다.

| 디렉터리 | 성격 | 백업 | git |
|---|---|---|---|
| `pi-reservation-system/` | 작업 공간 | ❌ | ✅ |
| `runner/` | 도구 | ❌ | ❌ |
| **`data/`** | ⭐ **잃으면 안 되는 것** | ✅ `pg_dump` → R2 | ❌ |
| `config/` | 저장소에서 파생 | ❌ | ✅ 원본이 `infra/` |
| **`secrets/`** | ⚠️ **잃어도, 새어도 안 된다** | ⚠️ 수동 | ❌ **절대 금지** |

### ⚠️ 6.1 `config/` 가 왜 저장소 밖에 또 있나 — 미결

설정 원본은 저장소 `infra/` 에 있다. 그런데 러너의 체크아웃(`runner/_work/…`)에서 바로 bind mount 하면 **컨테이너가 체크아웃 경로에 의존하게 된다** — 러너를 재설치하거나 `_work` 를 지우면 **재기동 시 마운트가 깨진다.**

| 안 | |
|---|---|
| **A** | CD 가 `infra/` → `/home/resv/config/` 로 **복사**한 뒤 compose 실행. 컨테이너는 **고정 경로만** 본다 |
| B | 고정 클론에서 `git pull` 후 compose. 러너 체크아웃을 안 쓴다 |

**`infra-cd.yml` 을 쓸 때 정한다.**

**용량 추정** — 512GB에 여유가 압도적이다.

| 항목 | 크기 |
|---|---|
| PG 데이터 (48만 행 + 인덱스) | **~150 MB** |
| Redis AOF | ~50 MB |
| Prometheus (90일) | ~2 GB |
| Loki (14일) | ~1 GB |
| Docker 이미지 | ~3 GB |
| **합계** | **< 10 GB** |

> **디스크는 이 프로젝트의 제약이 아니다.** 제약은 오직 메모리다.

---

## §7 백업 · 복구

ADR-0006 기준.

| 항목 | 값 |
|---|---|
| 대상 | **PostgreSQL 하나** (Redis는 백업 안 함) |
| 주기 | **일 1회** · cron |
| 절차 | `pg_dump -Fc` → **`age` 암호화** → `rclone` → R2 |
| 크기 | ~20 MB · 30일 보관 시 ~600 MB |
| 보관 | R2 30일 |

```bash
docker compose exec -T postgres pg_dump -Fc -U pi pi \
  | age -r "$AGE_RECIPIENT" \
  | rclone rcat "r2:pi-backup/db/$(date +%F).age"
```

> **복호화 키를 호스트에 두지 않는다.** `age`는 공개키로 암호화하므로 **호스트가 통째로 털려도 백업은 못 읽는다.** `member` 테이블에 이메일·전화번호·비밀번호 해시가 있다.

### 7.1 복구 리허설 — 월 1회

| 단계 | 내용 |
|---|---|
| 1 | R2에서 받아 복호화 |
| 2 | **별도 DB로** `pg_restore` |
| 3 | **`data.md` §7.8 검증 쿼리 그대로 실행** |

> **시드 검증 쿼리가 복구 검증 쿼리가 된다.** `trip_seat` 480,000행 · 열차번호 홀짝↔방향 일치 — **새로 만들 게 없다.**
>
> **복구해본 적 없는 백업은 백업이 아니다.** 이그레스가 무료라(ADR-0006) 리허설을 아낄 이유가 없다.

---

## §8 호스트 보안

### 8.1 ⚠️ Docker는 `ufw`를 우회한다

**이게 이 절에서 가장 중요하다.**

```
포트를 publish 하면 → Docker가 iptables DOCKER 체인에 직접 규칙을 넣는다
                    → ufw 규칙보다 먼저 평가된다
                    → ufw deny 를 걸어도 열린다
```

> **`ufw`로 막았다고 믿으면 안 된다.** Docker는 `ufw`를 모르고, `-p 5432:5432`는 **`ufw deny 5432`를 무시하고 열린다.**
>
> **그래서 §2.1의 "포트를 하나도 공개하지 않는다"가 유일하게 믿을 수 있는 방어다.** 방화벽 규칙이 아니라 **애초에 노출하지 않는 것**이 방어다.

### 8.2 `ufw`

| 방향 | 정책 |
|---|---|
| incoming | **`deny`** (기본) |
| outgoing | `allow` |
| SSH (22) | **LAN에서만** — `ufw allow from 192.168.0.0/16 to any port 22` |

> 외부에서 SSH가 필요하면 **Cloudflare Tunnel로 넣는다.** 22를 인터넷에 여는 선택지는 없다.

### 8.3 SSH

| 항목 | 값 |
|---|---|
| 인증 | **공개키만** — `PasswordAuthentication no` |
| root 로그인 | `PermitRootLogin no` |
| 접근 범위 | LAN |

### 8.4 시각 동기화 — 생각보다 중요하다

| 항목 | 값 |
|---|---|
| 도구 | `systemd-timesyncd` (Ubuntu 기본) |
| 확인 | `timedatectl` — `System clock synchronized: yes` |
| 타임존 | **`UTC`로 둔다** |

> **선점 TTL 10분이 시각 기반이다.** `expires_at` 판정(`data.md` §5.2 lazy 판정)과 스케줄러 회수가 전부 시스템 시각을 본다. **시계가 튀면 선점이 조기 만료되거나 안 풀린다.**
>
> 단일 호스트라 **서버 간 스큐 문제는 없다** — 그게 이 구성의 몇 안 되는 이점이다. 대신 **그 하나의 시계가 맞아야 한다.**
>
> **호스트 타임존을 UTC로 두는 이유** — `api.md` §0이 시각을 UTC로 내보내기로 했다. 호스트가 KST면 로그와 API 응답의 시각 기준이 갈려 대조가 번거로워진다.

### 8.5 시크릿

| 대상 | 보관 |
|---|---|
| 터널 토큰 · DB 비밀번호 · 토스 키 · R2 키 | **`.env`** (`/home/resv/secrets`, 디렉터리 700 · 파일 600) |
| **`age` 개인키** | ⚠️ **호스트에 두지 않는다** — 별도 보관 |
| git | **`.gitignore`에 `.env` · `*.age` · `*.key` 등록 완료** |

---

## §9 Ansible — 호스트 준비까지만

| 담당 | 도구 |
|---|---|
| **호스트 준비** | **Ansible** — Docker 설치 · `ufw` · 디렉터리 · SSH 설정 · `timesyncd` |
| **컨테이너** | **Docker Compose** (Ansible 아님) |

> **역할을 좁혀야 겹치지 않는다.** 단일 호스트에 Ansible로 컨테이너까지 관리하면 Compose와 관할이 겹쳐 **어느 쪽이 진실인지 모호해진다.**

> ⚠️ **손으로 먼저, 그 다음에 플레이북이다** (2026-09-11). 처음 해보는 호스트 준비를 Ansible로 바로 쓰면 **명령이 틀린 건지 플레이북이 틀린 건지 구분이 안 된다.** 손으로 한 번 세우면서 명령을 남기고, **그걸 옮겨 적는 것이 `infra` 트랙의 첫 이슈**다. 두 번 하는 게 아니라 받아 적는 것이고, 그래야 아래의 "PC를 밀고 다시 깔아도 복구된다"가 성립한다.
>
> 호스트 준비까지만 맡기면 **"PC를 밀고 다시 깔아도 복구된다"**가 성립하고, 그게 IaC로 얻으려던 전부다.

---

## §10 한계 — 정직하게

| 한계 | 내용 |
|---|---|
| **단일 장애점** | **호스트가 죽으면 전부 죽는다.** 이중화가 없다 |
| **앱 2대는 가용성이 아니다** | 같은 호스트다 — **SSE 팬아웃 실증용**이지 HA가 아니다 |
| 메모리 8GB | 관측 스택과 앱 2대를 동시에 넣으면 여유가 3GB로 준다 |
| 물리 격리 없음 | Docker 네트워크는 **논리** 분리다 (ADR-0005) |
| 백업 사본 1벌 | R2 하나. **로컬 사본이 없어 복구가 네트워크를 탄다** |

> **"이중화"라고 쓰지 않는다.** `--scale app=2`는 **Redis Stream 팬아웃이 실제로 동작함을 보이기 위한 장치**이고, 호스트가 하나인 이상 가용성은 전혀 늘지 않는다. 이 구분을 흐리면 포트폴리오가 과장이 된다.

### 무엇이 먼저 터지나

| 순위 | 병목 | 신호 |
|---|---|---|
| 1 | **메모리** | 스왑 발생 → PostgreSQL 지연 급증 |
| 2 | **커넥션 풀** | `hikaricp_connections_pending` 상승 (`operate.md` §4.4) |
| 3 | 락 대기 | `pi_seat_lock_wait_seconds` p99가 200ms에 접근 |
| 4 | 디스크 | **해당 없음** — 10GB 미만 |

> **1번이 2·3번보다 먼저 온다.** 메모리가 모자라 스왑이 시작되면 **락 대기와 커넥션 고갈이 동시에 따라온다** — 원인을 락으로 오진하기 쉬우니, `operate.md` §6의 대시보드에서 **메모리를 가장 위에 둔다.**

---

## 관련 문서

| 문서 | 내용 |
|---|---|
| [adr/0005](adr/0005-single-host-onpremise.md) · [adr/0006](adr/0006-backup-to-cloudflare-r2.md) | 이 문서의 근거 |
| [tech.md](tech.md) | 기술 스택 · 메모리 예산 |
| [operate.md](operate.md) | 관측 · 로그 · 경보 |
| [data.md](data.md) | §6 Redis · §7.8 검증 쿼리 · §9 마이그레이션 |
| [api.md](api.md) | §6 SSE — nginx 버퍼링 설정의 이유 |
| `deploy.md` (미작성) | CI/CD · 배포 절차 |
