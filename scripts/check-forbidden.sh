#!/usr/bin/env bash
#
# check-forbidden.sh — 금지 사항 7종을 기계로 판정한다
#
#   근거   docs/workflow.md §8 · CLAUDE.md "절대 금지"
#   실행   ./scripts/check-forbidden.sh          (어느 디렉터리에서든)
#   종료   0 = 위반 없음 · 1 = 위반 있음
#
# 예외를 둬야 하면 그 줄 끝에 마커를 붙이고 왜인지 함께 적는다.
#
#   SET lock_timeout = '3s';  -- check-forbidden:allow 트랜잭션 밖 마이그레이션
#
# ⚠️ 마커는 근거를 적으라고 있는 것이지 검사를 끄라고 있는 게 아니다.
#    마커가 늘어나면 규칙이 틀린 것이니 문서를 고치는 PR 을 먼저 낸다.

set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT" || exit 2

ALLOW='check-forbidden:allow'

fail=0
pass=0
skip=0

# ── 출력 ────────────────────────────────────────────────────
ok()   { pass=$((pass + 1)); printf '  OK    %s\n' "$1"; }
miss() { skip=$((skip + 1)); printf '  SKIP  %s  (%s 없음)\n' "$1" "$2"; }

bad() {                       # bad <규칙> <근거> <히트>
  fail=$((fail + 1))
  printf '\n  FAIL  %s\n        근거: %s\n' "$1" "$2"
  printf '%s\n' "$3" | sed 's/^/        /'
  printf '\n'
}

# ── 공용 스캐너 ─────────────────────────────────────────────
#
#  - 문서(*.md)는 제외한다. 금지 사항을 설명하는 문서가 금지 사항에 걸린다.
#  - 주석 줄은 제외한다. "SKIP LOCKED 를 쓰지 말 것" 같은 주석이 걸린다.
#  - ALLOW 마커가 붙은 줄은 제외한다.
#  - 생성물 디렉터리는 아예 안 본다.
#
scan() {                      # scan <디렉터리> <grep 옵션...>
  local dir=$1
  shift
  grep -rnI \
    --exclude='*.md' \
    --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=build \
    --exclude-dir=.gradle --exclude-dir=dist --exclude-dir=.expo \
    "$@" -- "$dir" 2>/dev/null \
    | grep -vF -- "$ALLOW" \
    | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|#|--|\*|/\*)' \
    || true
}

printf '금지 사항 검사 (docs/workflow.md §8)\n\n'

# ── 1 ───────────────────────────────────────────────────────
# :domain 은 의존성 0 (ADR-0001)
#
# test* 는 막지 않는다. ADR-0001 이 얻으려던 것 중 하나가
# "코어 테스트에 DB·컨테이너 불필요" 라 단위 테스트 의존성은 있어야 한다.
# 막는 건 프로덕션 설정뿐이다.
R=':domain 의존성 0'
F='back/domain/build.gradle.kts'
if [ -f "$F" ]; then
  hits=$(grep -nE '^[[:space:]]*(implementation|api|compileOnly|runtimeOnly|annotationProcessor)[[:space:]]*[("]' "$F" \
    | grep -vF -- "$ALLOW" || true)
  if [ -n "$hits" ]; then
    bad "$R" 'ADR-0001 — :domain 이 오염되면 되돌리기가 거의 불가능하다' "$(printf '%s\n' "$hits" | sed "s|^|$F:|")"
  else
    ok "$R"
  fi
else
  miss "$R" "$F"
fi

# ── 2 ───────────────────────────────────────────────────────
# api(project(":domain")) 금지 — implementation 이어야 한다 (ADR-0001)
R='api(project(":domain")) 금지'
if [ -d back ]; then
  hits=$(scan back -E '(^|[^[:alnum:]_])api\([[:space:]]*project\([[:space:]]*":domain"')
  if [ -n "$hits" ]; then
    bad "$R" 'ADR-0001 — api 면 도메인 객체가 HTTP 응답에 담겨도 컴파일된다' "$hits"
  else
    ok "$R"
  fi
else
  miss "$R" 'back/'
fi

# ── 3 ───────────────────────────────────────────────────────
# SKIP LOCKED 금지 (ADR-0002)
R='SKIP LOCKED 금지'
if [ -d back ]; then
  hits=$(scan back -iE 'skip[[:space:]_]+locked')
  if [ -n "$hits" ]; then
    bad "$R" 'ADR-0002 — 잠긴 행을 건너뛰면 6석 중 일부만 성공한다' "$hits"
  else
    ok "$R"
  fi
else
  miss "$R" 'back/'
fi

# ── 4 ───────────────────────────────────────────────────────
# compose 에 ports: 금지 (infra.md §2.1)
R='compose ports: 금지'
if [ -d infra ]; then
  hits=$(scan infra --include='*compose*.yml' --include='*compose*.yaml' -E '^[[:space:]]*ports:')
  if [ -n "$hits" ]; then
    bad "$R" 'infra.md §2.1 — Docker 가 ufw 를 우회한다. 방화벽으로 못 막는다' "$hits"
  else
    ok "$R"
  fi
else
  miss "$R" 'infra/'
fi

# ── 5 ───────────────────────────────────────────────────────
# 전역 lock_timeout 금지 — SET LOCAL 로만 (infra.md §3.2)
R='전역 lock_timeout 금지'
if [ -d infra ] || [ -d back ]; then
  hits=$( { [ -d infra ] && scan infra -n 'lock_timeout'
            [ -d back ]  && scan back  -n 'lock_timeout'; } \
          | grep -viE 'set[[:space:]]+local[[:space:]]+lock_timeout' || true)
  if [ -n "$hits" ]; then
    bad "$R" 'infra.md §3.2 — 선점 200ms 와 마이그레이션 3s 가 같은 값을 못 쓴다' "$hits"
  else
    ok "$R"
  fi
else
  miss "$R" 'infra/ · back/'
fi

# ── 6 ───────────────────────────────────────────────────────
# 409 를 ERROR 로 로깅 금지 (operate.md §1)
R='409 를 ERROR 로 로깅 금지'
if [ -d back ]; then
  hits=$(scan back -iE 'log(ger)?\.error\(.*(409|conflict|seat_already_held|seat_lock_timeout)')
  if [ -n "$hits" ]; then
    bad "$R" 'operate.md §1 — 경합은 정상 결과다. ERROR 로 찍으면 로그 I/O 가 병목이 된다' "$hits"
  else
    ok "$R"
  fi
else
  miss "$R" 'back/'
fi

# ── 7 ───────────────────────────────────────────────────────
# trip_seat 인덱스는 CONCURRENTLY (data.md §9.4)
#
# 줄 단위로 못 본다. CREATE INDEX 와 ON trip_seat 이 다른 줄에 있으면
# grep 은 둘 중 하나만 보고 놓친다. 그래서 세미콜론까지 이어 붙여 판정한다.
R='trip_seat 인덱스 CONCURRENTLY'
sqls=$(find back -name 'V*.sql' -not -path '*/build/*' 2>/dev/null | sort || true)
if [ -n "$sqls" ]; then
  hits=$(printf '%s\n' "$sqls" | while read -r f; do
    awk -v FILE="$f" '
      { line = $0
        sub(/--.*/, "", line)                       # 줄 주석 제거
        if (stmt == "") start = FNR
        stmt = stmt " " line
        if (line ~ /;/) {
          s = tolower(stmt)
          if (s ~ /create[ \t]+index/ && s ~ /trip_seat/ && s !~ /concurrently/)
            printf "%s:%d: %s\n", FILE, start, substr(stmt, 2, 120)
          stmt = ""
        }
      }
    ' "$f"
  done | grep -vF -- "$ALLOW" || true)
  if [ -n "$hits" ]; then
    bad "$R" 'data.md §9.4 — CONCURRENTLY 없이 48만 행에 인덱스를 걸면 그동안 선점이 멈춘다' "$hits"
  else
    ok "$R"
  fi
else
  miss "$R" 'back/**/V*.sql'
fi

# ── 요약 ────────────────────────────────────────────────────
printf '\n'
printf '통과 %d · 위반 %d · 건너뜀 %d\n' "$pass" "$fail" "$skip"

if [ "$fail" -ne 0 ]; then
  printf '\n금지 사항 위반이 있다. 규칙이 틀렸다고 생각하면 설계 문서를 고치는 PR 을 먼저 낸다.\n'
  exit 1
fi

if [ "$skip" -ne 0 ]; then
  printf '건너뛴 검사는 대상 코드가 아직 없다는 뜻이다. 트랙이 시작되면 자동으로 켜진다.\n'
fi

printf '위반 없음.\n'
exit 0
