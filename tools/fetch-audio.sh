#!/usr/bin/env bash
# tools/fetch-audio.sh — 게임 효과음을 CC0 실물 에셋으로 확보한다 (재현 가능)
#
# 왜: WebAudio 오실레이터 합성음은 아무리 다층으로 쌓아도 "기계음"이 된다.
#     Kenney CC0 팩(상업 사용 가능·크레딧 불필요)에서 용도별로 골라 쓴다.
# 규칙: ~/.claude/skills/_shared/free-audio-sources.md
#
# 산출: assets/audio/sfx/<키>.mp3  (sfx.js의 사운드 키와 1:1)
#       assets/audio/audio-license.json · CREDITS.md
#
# 사용: bash tools/fetch-audio.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${AUDIO_SRC:-/tmp/kenney-src}"
OUT="$ROOT/assets/audio"
SFX="$OUT/sfx"
FA="$HOME/.claude/bin/free-audio.sh"

# 키 → Kenney 팩/파일 매핑.
# ⚠️ 파일명은 Kenney 명명 규칙 그대로다(impactMetal_light = 가벼운 금속 타격).
#    소리 성격이 키의 의미와 맞는지가 선택 기준 — 길이도 함께 검증한다(아래 게이트).
MAP="
hit|impact-sounds|impactMetal_light_000
castle_hit|impact-sounds|impactPunch_heavy_001
explosion|sci-fi-sounds|explosionCrunch_002
laser|sci-fi-sounds|laserSmall_001
skyDestroyer|sci-fi-sounds|laserLarge_000
shredder|rpg-audio|knifeSlice
frost|interface-sounds|glass_002
lightning|digital-audio|zapThreeToneUp
plague|sci-fi-sounds|slime_000
disrupt|digital-audio|lowRandom
stealth|sci-fi-sounds|forceField_001
wizard_cast|digital-audio|phaserUp3
wizard-auto|digital-audio|laser5
wizard_levelup|digital-audio|powerUp4
powerup|digital-audio|powerUp2
blip|interface-sounds|click_002
button_click|ui-audio|click1
menu_hover|ui-audio|rollover2
math_correct|interface-sounds|confirmation_002
math_wrong|interface-sounds|error_004
tower_place|rpg-audio|metalLatch
tower_upgrade|interface-sounds|maximize_004
tower_sell|casino-audio|chips-handle-2
goldMine|casino-audio|chips-stack-3
repair|interface-sounds|pluck_001
combo_hit|digital-audio|pepSound2
wave_start|music-jingles|jingles_NES07
wave_clear|music-jingles|jingles_STEEL04
game_start|music-jingles|jingles_PIZZI09
"

# 키별 길이 상한(초) — 클릭음 자리에 30초 음악이 들어가는 사고를 기계적으로 막는다
declare -a LONG_KEYS=(wave_start wave_clear game_start)

# BGM: 트랙명|OpenGameArt 페이지|받아지는 파일명 (전부 CC0 — 스크립트가 라이선스 재확인)
BGM_MAP="
menu|once-upon-a-time-loop|once_upon_a_time_loop.mp3
gameplay|the-ancient-legend|the_ancient_legend_1.mp3
boss|swordfight|Swordfight.ogg
"

command -v ffmpeg >/dev/null || { echo "❌ ffmpeg 필요"; exit 1; }

# ── 1) 원본 팩 확보 (이미 있으면 건너뜀) ──────────────────────────
for pack in impact-sounds ui-audio interface-sounds rpg-audio casino-audio music-jingles digital-audio sci-fi-sounds; do
  if [ ! -d "$SRC/kenney_$pack" ]; then
    echo "▸ Kenney $pack 내려받는 중…"
    "$FA" kenney "$pack" "$SRC" >/dev/null || { echo "❌ $pack 실패"; exit 1; }
  fi
done

# ── 2) 선별 + 변환 (mp3 = 학교 크롬·아이패드 사파리 모두 안전) ─────
mkdir -p "$SFX"
rm -f "$SFX"/*.mp3
n=0; fails=0
while IFS='|' read -r key pack name; do
  [ -n "${key:-}" ] || continue
  src="$(find "$SRC/kenney_$pack" -name "$name.ogg" -print -quit)"
  if [ -z "$src" ]; then echo "  ❌ 원본 없음: $key ($pack/$name)"; fails=$((fails+1)); continue; fi

  # -16 LUFS 정규화 — 팩마다 녹음 레벨이 달라서 안 맞추면 어떤 소리만 튄다
  ffmpeg -nostdin -v error -y -i "$src" -af loudnorm=I=-16:TP=-1.5:LRA=11 \
    -c:a libmp3lame -b:a 96k -ar 44100 -ac 1 "$SFX/$key.mp3"
  n=$((n+1))
done <<< "$MAP"

# ── 2b) BGM (루프 트랙 3종) ──────────────────────────────────────
BGM_SRC="${BGM_SRC:-/tmp/bgm-src}"
BGM_OUT="$OUT/bgm"
mkdir -p "$BGM_OUT" "$BGM_SRC"
rm -f "$BGM_OUT"/*.mp3   # 이전 실행 잔재 제거(출처 미기록 파일이 남으면 verify가 막는다)
# ⚠️ ffmpeg은 stdin을 삼켜서 이 read 루프의 남은 줄을 먹어버린다 → -nostdin 필수(실측: 3번째 트랙 유실)
while IFS='|' read -r track page file; do
  [ -n "${track:-}" ] || continue
  if [ ! -f "$BGM_SRC/$file" ]; then
    echo "▸ BGM $track 내려받는 중…"
    "$FA" oga "https://opengameart.org/content/$page" "$BGM_SRC" >/dev/null || {
      echo "  ❌ $track 다운로드 실패"; fails=$((fails+1)); continue; }
  fi
  [ -f "$BGM_SRC/$file" ] || { echo "  ❌ 원본 없음: $track ($file)"; fails=$((fails+1)); continue; }

  # BGM은 -20 LUFS — 효과음(-16)보다 낮춰야 타격음이 음악에 묻히지 않는다.
  # 96k 스테레오면 3분 곡이 ≈2MB (lazy load 전제 예산).
  ffmpeg -nostdin -v error -y -i "$BGM_SRC/$file" -af loudnorm=I=-20:TP=-2:LRA=11 \
    -c:a libmp3lame -b:a 96k -ar 44100 -ac 2 "$BGM_OUT/$track.mp3"
done <<< "$BGM_MAP"
echo "  BGM: $(ls "$BGM_OUT" | wc -l | tr -d ' ')곡 · $(du -sh "$BGM_OUT" | cut -f1)"

# ── 3) 길이 게이트 — 짧은 효과음 자리에 긴 트랙이 들어갔는지 검사 ──
echo
echo "[길이 게이트]"
bad=0
for f in "$SFX"/*.mp3; do
  key="$(basename "$f" .mp3)"
  dur="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")"
  limit=2.0
  for lk in "${LONG_KEYS[@]}"; do [ "$key" = "$lk" ] && limit=6.0; done
  over="$(python3 -c "print(1 if float('$dur') > $limit else 0)")"
  if [ "$over" = "1" ]; then echo "  ❌ $key ${dur}s (상한 ${limit}s)"; bad=$((bad+1)); fi
done
[ "$bad" -eq 0 ] && echo "  ✅ 전부 상한 이내"

# ── 4) 라이선스 기록 + 크레딧 ────────────────────────────────────
python3 - "$OUT" <<"PY"
import json, sys, pathlib, datetime
out = pathlib.Path(sys.argv[1])
today = datetime.date.today().isoformat()
packs = ["impact-sounds","ui-audio","interface-sounds","rpg-audio",
         "casino-audio","music-jingles","digital-audio","sci-fi-sounds"]
bgm = [("bgm/menu.mp3", "once-upon-a-time-loop"),
       ("bgm/gameplay.mp3", "the-ancient-legend"),
       ("bgm/boss.mp3", "swordfight")]
out.mkdir(parents=True, exist_ok=True)
entries = [{"file": "sfx/", "source": "Kenney", "license": "CC0", "author": "Kenney",
            "url": "https://kenney.nl/assets/" + p, "fetched": today} for p in packs]
entries += [{"file": f, "source": "OpenGameArt", "license": "CC0",
             "author": "OpenGameArt 기여자", "fetched": today,
             "url": "https://opengameart.org/content/" + slug} for f, slug in bgm]
(out / "audio-license.json").write_text(json.dumps({"entries": entries},
                                                   ensure_ascii=False, indent=2))
print(f"  라이선스 기록: Kenney {len(packs)}팩 + BGM {len(bgm)}곡 [전부 CC0]")
PY

"$FA" credits "$OUT" >/dev/null && echo "  CREDITS.md 생성"
"$FA" verify "$OUT" | tail -2

size="$(du -sh "$SFX" | cut -f1)"
echo
echo "결과: 효과음 ${n}개 · 누락 ${fails}건 · 길이초과 ${bad}건 · 총 $size"
[ "$fails" -eq 0 ] && [ "$bad" -eq 0 ] || exit 1
