#!/usr/bin/env bash
#
# 프로덕션 번들에 목이 실려 있지 않은지 본다 (#108).
#
# ⚠️ `VITE_API_MODE` 검사는 **런타임 가드라 트리셰이킹을 못 한다.**
#    `src/mocks/enable.ts` 가 목을 정적으로 `import` 하면 번들러는 그게 안 쓰일 것을
#    증명할 수 없어서 `handlers` → `fixtures` → `msw` 를 통째로 엔트리 청크에 넣는다.
#    실제로 가짜 예약번호 `48207315` 가 배포물에 있었다.
#
# 엔트리 청크만 본다. 목은 동적 `import` 뒤 별도 청크로 존재해도 되고, 그건
# `VITE_API_MODE=mock` 일 때만 받아진다 — 문제는 **동기적으로 실려 나가는 것**이다.
set -euo pipefail

cd "$(dirname "$0")/.."

[ -f dist/index.html ] || {
  echo "dist/index.html 이 없다. 먼저 빌드한다: pnpm run build" >&2
  exit 1
}

# ── SPA 폴백 (#112) ───────────────────────────────────────────
#
# ⚠️ `public/_redirects` 는 자동 복사되지만 **누가 지워도 아무도 모른다.**
#    증상은 「딥링크만 404」 — 홈은 멀쩡하고 클릭 이동도 되니 배포는 성공처럼
#    보인다. 새로고침하거나 링크를 받은 사람만 깨진다.
[ -f dist/_redirects ] || {
  echo "⚠️  dist/_redirects 가 없다. front/public/_redirects 를 확인한다 (#112)." >&2
  exit 1
}

# ⚠️ 301/302 면 주소창이 /index.html 로 바뀌어 **라우터가 읽을 URL 이 사라진다** —
#    404 는 안 나지만 항상 홈이 뜬다. 200 이어야 한다.
grep -qE '^/\*[[:space:]]+/index\.html[[:space:]]+200[[:space:]]*$' dist/_redirects || {
  echo "⚠️  _redirects 에 '/*  /index.html  200' 규칙이 없다 (#112)." >&2
  echo "    리다이렉트(301/302)가 아니라 200 이어야 한다." >&2
  exit 1
}

entry=$(sed -n 's#.*<script[^>]*src="/\(assets/index-[^"]*\.js\)".*#\1#p' dist/index.html | head -1)
[ -n "$entry" ] || {
  echo "dist/index.html 에서 엔트리 청크를 못 찾았다." >&2
  exit 1
}

# 앱 코드에는 절대 없고 목에만 있는 문자열들이다.
# 좌석 라벨은 `${carNo}호차` 로 조립하므로 `4호차` 같은 리터럴은 목에서만 나온다.
markers=(
  '48207315'      # fixtures.ts 가짜 예약번호
  'seat-conflict' # scenario.ts 시나리오 이름
  'KTX 101'       # fixtures.ts 가짜 열차
  '4호차'         # fixtures.ts 가짜 좌석
)

found=0
for m in "${markers[@]}"; do
  if grep -qF -- "$m" "dist/$entry"; then
    echo "⚠️  엔트리 청크에 목 문자열이 있다: $m"
    found=1
  fi
done

if [ "$found" -ne 0 ]; then
  cat >&2 <<'MSG'

목이 프로덕션 번들에 실려 나간다.
`src/mocks/` 를 정적으로 import 한 곳이 있다 — 그 import 를
`enableMocking()` 안의 `await import(...)` 로 옮긴다 (#108).
MSG
  exit 1
fi

echo "✅ 엔트리 청크($entry)에 목이 없다. SPA 폴백도 있다."
