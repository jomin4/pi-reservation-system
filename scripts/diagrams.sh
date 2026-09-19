#!/usr/bin/env bash
#
# diagrams.sh — C4 모델을 검사하고 굽는다
#
#   진실   docs/diagrams/workspace.dsl
#   산출   docs/diagrams/c4/*.svg          (커밋한다)
#
#   ./scripts/diagrams.sh validate   DSL 파싱만 — 몇 초. DSL 고칠 때마다
#   ./scripts/diagrams.sh render     SVG 까지 굽는다 — 커밋 직전
#   ./scripts/diagrams.sh check      다시 굽고 커밋본과 대조한다 — CI
#
# Docker 를 쓰지 않는다. 자바와 Graphviz 만 있으면 된다.
# 도구(structurizr-cli · plantuml)는 tools/ 에 캐시하고 커밋하지 않는다
# — 없으면 이 스크립트가 받는다.
#
#   Windows   winget install --id Graphviz.Graphviz -e
#   Ubuntu    sudo apt-get install -y graphviz
#
# PATH 에 없어도 된다 — 표준 설치 경로를 뒤져서 GRAPHVIZ_DOT 을 세운다.

set -euo pipefail

# ── 고정 버전 — 올릴 때 이 두 줄만 고친다 ───────────────────
CLI_VERSION="2025.11.09"
PLANTUML_VERSION="1.2026.8"

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT" || exit 2          # git 에 경로를 넘기지 않는다 — Windows 에서 /c/... 를 못 읽는다

TOOLS="$ROOT/tools"
CLI_DIR="$TOOLS/structurizr-cli"
PLANTUML="$TOOLS/plantuml.jar"
DSL="$ROOT/docs/diagrams/workspace.dsl"
OUT="$ROOT/docs/diagrams/c4"
WORK="$ROOT/docs/diagrams/.render"

CMD="${1:-validate}"

# 자바가 경로를 읽을 수 있는 형태로. Git Bash 의 /c/... 는 자바가 못 읽는다.
jpath() {
  if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi
}

need_java() {
  command -v java >/dev/null 2>&1 || {
    printf '자바가 없다. JDK 17 이상을 설치한다.\n' >&2
    exit 2
  }
}

# PlantUML 은 GRAPHVIZ_DOT 또는 PATH 에서 dot 을 찾는다.
# winget 으로 깔면 PATH 에 안 들어가므로 표준 경로를 직접 뒤진다.
need_dot() {
  [ -n "${GRAPHVIZ_DOT:-}" ] && [ -x "$GRAPHVIZ_DOT" ] && return 0

  if command -v dot >/dev/null 2>&1; then
    GRAPHVIZ_DOT=$(command -v dot)
  else
    local c
    for c in "/c/Program Files/Graphviz/bin/dot.exe" \
             "/c/Program Files (x86)/Graphviz/bin/dot.exe" \
             "/usr/bin/dot" "/usr/local/bin/dot" "/opt/homebrew/bin/dot"; do
      [ -x "$c" ] && { GRAPHVIZ_DOT=$c; break; }
    done
  fi

  [ -n "${GRAPHVIZ_DOT:-}" ] || {
    printf 'Graphviz 가 없다. 레이아웃을 못 잡는다.\n' >&2
    printf '  Windows  winget install --id Graphviz.Graphviz -e\n' >&2
    printf '  Ubuntu   sudo apt-get install -y graphviz\n' >&2
    exit 2
  }
  export GRAPHVIZ_DOT
}

fetch_tools() {
  mkdir -p "$TOOLS"

  if [ ! -d "$CLI_DIR" ]; then
    printf '· structurizr-cli %s 받는 중\n' "$CLI_VERSION"
    curl -sSfL -o "$TOOLS/cli.zip" \
      "https://github.com/structurizr/cli/releases/download/v${CLI_VERSION}/structurizr-cli.zip"
    mkdir -p "$CLI_DIR"
    unzip -q "$TOOLS/cli.zip" -d "$CLI_DIR"
    rm -f "$TOOLS/cli.zip"
  fi

  if [ ! -f "$PLANTUML" ]; then
    printf '· plantuml %s 받는 중\n' "$PLANTUML_VERSION"
    curl -sSfL -o "$PLANTUML" \
      "https://github.com/plantuml/plantuml/releases/download/v${PLANTUML_VERSION}/plantuml-${PLANTUML_VERSION}.jar"
  fi
}

# structurizr.sh 는 클래스패스를 ':' 로 잇는데 Windows 자바는 ';' 를 쓴다.
# 런처를 안 쓰고 자바를 직접 부른다 — 'lib/*' 는 자바가 알아서 펼친다.
cli() {
  java -cp "$(jpath "$CLI_DIR")/lib/*" com.structurizr.cli.StructurizrCliApplication "$@"
}

do_validate() {
  printf '① DSL 파싱\n'
  cli validate -workspace "$(jpath "$DSL")"
  printf '   통과\n'
}

do_render() {
  do_validate

  rm -rf "$WORK"; mkdir -p "$WORK" "$OUT"
  rm -f "$OUT"/*.svg          # DSL 에서 지운 뷰의 SVG 가 남지 않게

  printf '② DSL → C4-PlantUML\n'
  cli export -workspace "$(jpath "$DSL")" \
             -format plantuml/c4plantuml \
             -output "$(jpath "$WORK")" >/dev/null

  printf '③ C4-PlantUML → SVG (Graphviz)\n'
  java -jar "$(jpath "$PLANTUML")" -tsvg -nometadata "$(jpath "$WORK")" >/dev/null

  # structurizr-cli 는 "<워크스페이스명>-<뷰키>.puml" 로 떨군다.
  # 뷰 키만 남겨 파일명을 고정한다 — 워크스페이스 이름이 바뀌어도 문서 링크가 안 깨진다.
  printf '④ 파일명 정리\n'
  shopt -s nullglob
  local n=0
  for f in "$WORK"/*.svg; do
    local key; key=$(basename "$f" .svg); key=${key#*-}
    cp "$f" "$OUT/$key.svg"
    printf '   %s.svg\n' "$key"
    n=$((n + 1))
  done
  shopt -u nullglob

  rm -rf "$WORK"

  [ "$n" -gt 0 ] || { printf '뷰가 하나도 안 나왔다. views 블록을 확인한다.\n' >&2; exit 1; }
  printf '   %d장\n' "$n"
}

need_java

case "$CMD" in
  validate)
    fetch_tools
    do_validate
    ;;
  render)
    need_dot
    fetch_tools
    do_render
    printf '\n갱신 완료 — docs/diagrams/c4/\n'
    ;;
  check)
    need_dot
    fetch_tools
    do_render
    # ⚠️ 바이트 비교를 하지 않는다. structurizr-cli 가 요소를 내보내는 순서가 고정이
    #    아니라, 실행마다 Graphviz 좌표가 달라지고 요소 순서도 뒤바뀐다 — 그림 내용은 같다.
    #    그래서 「텍스트 노드의 내용」과 「도형 태그」를 숫자를 지우고 정렬한 다중집합으로
    #    비교한다. 요소가 늘거나 줄거나 라벨이 바뀌면 잡히고, 자리만 바뀐 건 무시된다.
    canon() {
      sed -E 's/[0-9]+(\.[0-9]+)?//g' \
        | grep -oE '<text[^>]*>[^<]*</text>|<(rect|path|polygon|polyline|line|ellipse)[ />]' \
        | sed -E 's/<text[^>]*>/<text>/; s/[ />]$//' \
        | sort
    }
    bad=""
    for f in "$OUT"/*.svg; do
      rel="docs/diagrams/c4/$(basename "$f")"
      if ! git cat-file -e "HEAD:$rel" 2>/dev/null; then
        bad="$bad
  ?? $rel — 새 뷰인데 커밋이 안 됐다"; continue
      fi
      if ! diff -q <(git show "HEAD:$rel" | canon) <(canon < "$f") >/dev/null; then
        bad="$bad
   M $rel — 요소나 텍스트가 다르다"
      fi
    done
    for rel in $(git ls-files -- docs/diagrams/c4); do
      [ -f "$ROOT/$rel" ] || bad="$bad
   D $rel — DSL 에 더는 없는 뷰"
    done
    git checkout -q -- docs/diagrams/c4 2>/dev/null || true   # 좌표만 바뀐 산출물은 되돌린다
    if [ -n "$bad" ]; then
      printf '\n커밋된 SVG 가 workspace.dsl 과 다르다.%s\n' "$bad" >&2
      printf '\n./scripts/diagrams.sh render 를 돌리고 산출물을 같이 커밋한다.\n' >&2
      exit 1
    fi
    printf '\nDSL 과 커밋된 SVG 가 일치한다 (좌표 제외).\n'
    ;;
  *)
    printf '사용법: %s {validate|render|check}\n' "$(basename "$0")" >&2
    exit 2
    ;;
esac
