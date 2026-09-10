# infra — 인프라 트랙

> 루트 [CLAUDE.md](../CLAUDE.md)의 규칙이 먼저다. 여기는 이 트랙만의 것.

## 대상

| 구분 | 값 |
|---|---|
| 호스트 | **Ubuntu 24.04 · RAM 8GB · SSD 512GB · 헤드리스** |
| 오케스트레이션 | **Docker Compose** — 하이퍼바이저 없음 |
| 네트워크 | **`net:dmz` · `net:app` · `net:data`** |
| 리버스 프록시 | nginx |
| 아웃바운드 | tinyproxy — **화이트리스트 3곳** |
| 구성 관리 | **Ansible — 호스트 준비까지만** |
| 백업 | Cloudflare R2 · `age` 암호화 |

## ⚠️ 메모리가 유일한 제약이다

| | |
|---|---|
| 사용 | **≈ 4.43 GB** |
| 여유 | 3.57 GB |

**무엇을 추가하기 전에 예산부터 본다** (`infra.md` §1.1). 모자라면 버리는 순서 — **Loki → Grafana → 앱 2대**.

## 이 트랙의 금지

| 금지 | 근거 |
|---|---|
| ⚠️ **compose에 `ports:`** | `infra.md` §2.1 — **Docker는 `ufw`를 우회한다.** 방화벽으로 못 막는다 |
| **전역 `lock_timeout`** | 선점 200ms vs 마이그레이션 3s — `SET LOCAL`로만 |
| runner를 **컨테이너로** | `deploy.md` §5.1 — docker socket = 사실상 root |
| **`latest` 이미지 태그** | `deploy.md` §3 — 뭐가 도는지 모르게 된다 |
| `--no-deps` 없이 롤백 | `deploy.md` §12.1 — **PG·Redis까지 재생성** |
| `pull_request`에 self-hosted | `deploy.md` §2 — **public 저장소** |
| GNOME 켜두기 | 1.5~2GB. **예산이 무너진다** |

## 자주 틀리는 것

| 실수 | 바른 것 |
|---|---|
| `ufw`로 DB 포트를 막았다고 안심 | **publish 안 하는 게 유일한 방어** |
| nginx SSE 설정 누락 | ⚠️ **`proxy_buffering off`** — 없으면 **연결은 살아 있는데 이벤트가 안 온다** |
| `back-cd`와 `infra-cd`가 동시 실행 | **`concurrency: deploy-host` 공유** |
| 호스트 타임존을 KST로 | **UTC** — 선점 TTL이 시각 기반 (`infra.md` §8.4) |
| DB에 붙으려고 포트를 잠깐 열기 | **`docker compose exec postgres psql`** |

## 읽어야 할 문서

| 언제 | 어디 |
|---|---|
| compose를 짤 때 | **`infra.md` §2 · §3** |
| PostgreSQL 설정 | `infra.md` §3.2 — `max_connections 50` |
| 도메인·터널 | `infra.md` §4 |
| 백업 | `infra.md` §7 · ADR-0006 |
| 방화벽·SSH·시각 | **`infra.md` §8** |
| CI/CD 워크플로 | **`deploy.md`** |
| 관측 스택 | `operate.md` §5 · §6 |

## 나가는 길은 셋뿐

| 목적지 | 용도 |
|---|---|
| 토스페이먼츠 | 결제 승인 |
| `*.r2.cloudflarestorage.com` | 암호화 백업 |
| `discord.com` | 운영 경보 |

**호스트 자신의 아웃바운드는 별개다** — NTP · `apt` · `github.com`(runner 폴링) · `ghcr.io`.
