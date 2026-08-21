#!/usr/bin/env bash
# tools/qa-all.sh — 전체 게이트 일괄 실행
#
# ⚠️ qa-*.mjs 는 저마다 정적 서버를 스스로 띄운다. 그래서 여기서 서버를 따로 띄우면
#    안 되고(포트 충돌로 전부 죽는다 — 실측), 스크립트마다 다른 포트를 줘야 한다.
#
# 사용: bash tools/qa-all.sh
#   API가 필요한 게이트(qa-anticheat·qa-privacy)는 wrangler가 떠 있을 때만 의미가 있어
#   기본 목록에서 뺐다. 배포 전 별도로 돌린다:
#     npx wrangler pages dev . --port 8791 --local
#     node tools/qa-privacy.mjs 8791
#     QA_API_BASE=http://localhost:8791/api node tools/qa-anticheat.mjs
#     node tools/qa-bgm-csp.mjs http://localhost:8791/   ← BGM은 media-src라 CSP 환경에서만 검증된다
set -uo pipefail
cd "$(dirname "$0")/.."

SCRIPTS=(
  qa-smoke qa-stages qa-spells qa-learning qa-adaptive
  qa-projectiles qa-resilience qa-progression qa-retention
  qa-tower-onroad qa-save-onroad qa-tower-render qa-build-panel qa-build-nav
  qa-ux-controls qa-mobile qa-ime qa-wizard-flicker qa-audio qa-a11y-load
  qa-meteor-pause qa-restart-cooldown qa-perf
)

# 앞선 실행이 비정상 종료하면 chrome-headless-shell 프로세스가 남는다.
# 6개쯤 쌓이면 뒤이어 도는 게이트가 "detached Frame"/"Target closed"로 무더기 실패한다
# (실측 — 제품 회귀로 오인하기 딱 좋다). 시작 전과 스크립트 사이에서 정리한다.
pkill -f chrome-headless-shell 2>/dev/null; sleep 1

PORT=8901
FAILED=0
RESULTS=()
for s in "${SCRIPTS[@]}"; do
  f="tools/$s.mjs"
  if [ ! -f "$f" ]; then RESULTS+=("$s|건너뜀(파일 없음)"); continue; fi
  # ⚠️ qa-perf 는 argv[2]가 포트가 아니라 CPU 스로틀 배율이다. 포트를 넘기면
  #    8918배 스로틀이 걸려 프로토콜 타임아웃으로 죽는다(실측).
  if [ "$s" = "qa-perf" ]; then OUT=$(node "$f" 2>&1); else OUT=$(node "$f" "$PORT" 2>&1); fi
  CODE=$?
  PORT=$((PORT + 1))
  pkill -f chrome-headless-shell 2>/dev/null; sleep 1
  LINE=$(echo "$OUT" | grep -E "통과 [0-9]+|PASS|FAIL \(|결과:" | tail -1 | cut -c1-64)
  [ -z "$LINE" ] && LINE=$(echo "$OUT" | tail -1 | cut -c1-64)
  if [ "$CODE" -eq 0 ]; then
    RESULTS+=("$s|✅ $LINE")
  else
    RESULTS+=("$s|❌ (exit $CODE) $LINE")
    FAILED=$((FAILED + 1))
    echo "$OUT" | grep -E "❌" | head -6 | sed "s|^|     [$s] |"
  fi
done

echo
echo "=================== 게이트 요약 ==================="
for r in "${RESULTS[@]}"; do
  printf "  %-20s %s\n" "${r%%|*}" "${r#*|}"
done
echo "==================================================="
if [ "$FAILED" -gt 0 ]; then
  echo "❌ 실패한 게이트 ${FAILED}개"
  exit 1
fi
echo "✅ 전체 게이트 통과"
