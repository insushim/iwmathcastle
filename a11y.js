// a11y.js — 움직임 민감도(prefers-reduced-motion) 단일 진실원
//
// 왜 별 파일인가: v9 이전에는 이 배선이 **아예 없었다**. 저장소 전체에서
// prefers-reduced-motion은 style.css의 `.rotate-phone` 한 곳뿐이고 JS matchMedia는
// 0건이었다. 그런데 화면 흔들림·전면 플래시는 전부 JS/캔버스라 CSS 미디어쿼리로는
// 막을 수 없다 — 성 피격 흔들림(구 main.js의 CSS animation)과 screenFlash 10여 곳이
// 전부 무가드로 돌고 있었다. 신규 연출만 막고 "위반 0"이라 말하면 거짓이 되므로,
// 공용 판정기를 만들고 기존 연출까지 여기에 물린다.
//
// 광과민성 발작(PSE) 기준: 화면 **전체** 플래시는 초당 3회 미만이어야 한다.
// 여기서는 실시간 1초당 2회로 더 보수적으로 잠근다(flashBudget).

import { quality } from "./perfQuality.js";
let mql = null;
let reduced = false;

/** OS 설정을 읽는다. 설정을 바꾸면 change 이벤트로 즉시 반영된다(재시작 불필요). */
export function initA11y() {
  try {
    mql = window.matchMedia?.("(prefers-reduced-motion: reduce)") || null;
    reduced = !!mql?.matches;
    // addEventListener가 없는 구형 사파리는 addListener 폴백
    if (mql?.addEventListener) mql.addEventListener("change", (e) => (reduced = !!e.matches));
    else mql?.addListener?.((e) => (reduced = !!e.matches));
  } catch {
    reduced = false; // matchMedia 자체가 없는 환경 — 기본값(연출 허용)
  }
  return reduced;
}

/** 움직임을 줄여야 하는가. 화면 흔들림·전면 플래시·개봉 연출의 공통 관문. */
export function prefersReducedMotion() {
  return reduced;
}

/** QA·설정 화면에서 강제로 켜고 끄기 위한 주입구(테스트가 OS 설정을 못 바꾸므로 필요). */
export function setReducedMotionForTest(v) {
  reduced = !!v;
}

// ── 전면 플래시 예산 (PSE) ────────────────────────────────
// 벽시계가 아니라 "프레임에서 흘려보낸 실시간"을 누산한다. 일시정지 중에는
// 게임 루프가 이 함수를 부르지 않으므로 창이 자동으로 멈춘다.
const FLASH_WINDOW_MS = 1000;
const FLASH_MAX_PER_WINDOW = 2;
// 누적 실시간(ms). 벽시계가 아니라 프레임이 흘려보낸 시간이라, 일시정지 중에는
// 게임 루프가 tick을 안 부르므로 창이 자동으로 멈춘다.
let flashNow = 0;
// 최근 플래시가 터진 시각들. **고정 구간(fixed window)이 아니라 슬라이딩 윈도**다 —
// ⚠️ 고정 구간은 경계에서 상한의 2배를 통과시킨다: 990ms에 2회를 쓰고 20ms 뒤
//    카운터가 리셋되면 20ms 안에 4회가 터진다(실측 재현). 광과민성 상한에서
//    "평균 초당 2회"는 의미가 없고 **어느 1초 창에서도 2회**여야 한다.
let flashStamps = [];

/** 게임 루프가 매 프레임 실시간 델타를 먹인다. */
export function tickFlashBudget(rawDeltaMs) {
  flashNow += rawDeltaMs;
  if (flashStamps.length) {
    const cut = flashNow - FLASH_WINDOW_MS;
    while (flashStamps.length && flashStamps[0] <= cut) flashStamps.shift();
  }
}

/** 전면 플래시를 지금 터뜨려도 되는가. 허용되면 예산을 1 소모한다. */
export function claimScreenFlash() {
  if (reduced) return false;
  // 저사양 강등에서도 전면 플래시는 끈다. 전면을 덮는 연출은 가장 비싼 축에 들고,
  // 이미 프레임이 흔들리는 기기에서 터지면 그 자체가 큰 히치가 된다.
  if (quality.low) return false;
  const cut = flashNow - FLASH_WINDOW_MS;
  while (flashStamps.length && flashStamps[0] <= cut) flashStamps.shift();
  if (flashStamps.length >= FLASH_MAX_PER_WINDOW) return false;
  flashStamps.push(flashNow);
  return true;
}

/** QA용 — 현재 예산 상태 */
export function flashBudgetState() {
  return { count: flashStamps.length, max: FLASH_MAX_PER_WINDOW, now: flashNow };
}

export function resetFlashBudget() {
  flashNow = 0;
  flashStamps = [];
}
