// impactFx.js — 타격감(피격 연출) 전담
//
// 사용자 보고: "미사일 맞았을 때 이펙트가 약해."
// 실측한 원인: 피격 피드백이 ①작은 반짝임 ②데미지 숫자 ③효과음 셋뿐이었다.
// 히트 플래시·히트스톱·넉백·화면 흔들림이 하나도 없었고, 하늘 파괴자(1발 220,
// 광역 65)의 폭발조차 25px짜리 원 하나였다.
//
// 설계 원칙 셋:
//  1. **접근성이 먼저다.** 흔들림·전면 플래시는 a11y.js의 관문을 통과해야만 터진다.
//     광과민성(PSE) 기준은 전면 플래시 초당 3회 미만인데, 여기서는 2회로 잠근다.
//  2. **연출이 난이도를 바꾸면 안 된다.** 히트스톱은 게임 시계를 느리게 흘릴 뿐
//     피해·쿨다운 수치를 건드리지 않는다. 스폰도 같은 시계를 보므로 밀도가 유지된다.
//  3. **저사양에서 먼저 꺼진다.** 웨일북 급에서는 플래시와 넉백만 남기고
//     파티클·흔들림을 끈다(프레임 예산).

import { prefersReducedMotion, claimScreenFlash } from "./a11y.js";
import { quality } from "./perfQuality.js";

// ── 화면 흔들림 ────────────────────────────────────────────
// 대상은 #gameCanvas 컨테이너 전체다. 캔버스(dynamicLayerCanvas)에만 걸면
// 그림은 흔들리는데 클릭 판정용 .tower DOM은 제자리라, 흔들리는 동안 최대 6px
// 어긋난 자리를 눌러야 한다.
let shakeEl = null;
let shakeAmp = 0;
let shakeLeft = 0;
let shakeTotal = 0;
const SHAKE_MAX_AMP = 6; // px — 이 위로는 아이 눈에 "고장"으로 읽힌다

export function initImpactFx(canvasEl) {
  shakeEl = canvasEl || null;
  shakeAmp = 0;
  shakeLeft = 0;
}

/**
 * @param {number} amp 진폭(px, 상한 6)
 * @param {number} ms  지속(실시간)
 */
export function requestShake(amp, ms = 180) {
  if (!shakeEl || prefersReducedMotion() || quality.low) return false;
  const a = Math.min(SHAKE_MAX_AMP, Math.max(1, amp));
  // 이미 흔들리는 중이면 더 센 쪽으로 덮어쓴다(합산하면 화면이 튄다)
  if (a >= shakeAmp) {
    shakeAmp = a;
    shakeLeft = ms;
    shakeTotal = ms;
  }
  return true;
}

/** 게임 루프가 **실시간** 델타로 부른다 — 연출이라 배속과 무관하게 같은 길이여야 한다. */
export function updateCameraShake(realDeltaMs) {
  if (!shakeEl) return;
  if (shakeLeft <= 0) {
    if (shakeAmp !== 0) {
      shakeAmp = 0;
      shakeEl.style.transform = "";
    }
    return;
  }
  shakeLeft -= realDeltaMs;
  const p = Math.max(0, shakeLeft / shakeTotal); // 1 → 0
  const a = shakeAmp * p * p;                    // 뒤로 갈수록 급히 잦아든다
  const dx = (Math.random() * 2 - 1) * a;
  const dy = (Math.random() * 2 - 1) * a;
  shakeEl.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`;
  if (shakeLeft <= 0) {
    shakeAmp = 0;
    shakeEl.style.transform = "";
  }
}

/** QA용 — 지금 흔들리는 중인가 */
export function shakeState() {
  return { amp: shakeAmp, left: shakeLeft, active: shakeLeft > 0 };
}

/** 판을 새로 시작할 때 잔여 변형을 확실히 지운다(안 지우면 화면이 비뚤어진 채 남는다). */
export function resetShake() {
  shakeLeft = 0;
  shakeAmp = 0;
  if (shakeEl) shakeEl.style.transform = "";
}

// ── 전면 플래시 (a11y 예산 경유) ───────────────────────────
export function requestScreenFlash(particleSystem, color, ms, alpha) {
  if (!particleSystem) return false;
  if (!claimScreenFlash()) return false; // reduced-motion이거나 초당 2회 초과
  particleSystem.screenFlash(color, ms, alpha);
  return true;
}

// ── 넉백 ──────────────────────────────────────────────────
// ⚠️ pathIndex는 픽셀이 아니라 **5px 간격 경로점의 인덱스**다.
//    (기존 회오리 코드도 `pushbackPx / 5`로 환산한다 — 같은 관례를 따른다.)
//    px를 그대로 빼면 5배로 밀려서 몬스터가 순간이동한 것처럼 보인다.
export const PATH_POINT_SPACING_PX = 5;

/**
 * 피해량에 비례해 경로를 되돌린다. 보스는 밀지 않는다(보스가 밀리면 긴장이 사라진다).
 * @returns 실제로 되돌린 픽셀 수
 */
export function applyKnockback(monster, damage, opts = {}) {
  if (!monster || monster.isDead || monster.isBoss) return 0;
  const maxPx = opts.maxPx ?? 6;
  const ratio = monster.maxHp > 0 ? damage / monster.maxHp : 0;
  const px = Math.min(maxPx, Math.max(1, ratio * maxPx * 3));
  const points = px / PATH_POINT_SPACING_PX;
  const before = monster.pathIndex;
  monster.pathIndex = Math.max(0, monster.pathIndex - points);
  return (before - monster.pathIndex) * PATH_POINT_SPACING_PX;
}

// ── 히트 플래시 ────────────────────────────────────────────
// 개체 국소 발광이라 전면 플래시 예산과 별개로 센다. 다만 여러 타워가 한 몬스터를
// 연사하면 점멸이 겹치므로 **개체당 최소 간격**을 둔다.
export const HIT_FLASH_MS = 90;
const HIT_FLASH_MIN_GAP = 120;

/** @returns 플래시를 실제로 켰는가 */
export function markHitFlash(monster, gameClock) {
  if (!monster || prefersReducedMotion()) return false;
  if (gameClock < (monster._hitFlashNextAt || 0)) return false;
  monster._hitFlashUntil = gameClock + HIT_FLASH_MS;
  monster._hitFlashNextAt = gameClock + HIT_FLASH_MIN_GAP;
  return true;
}

/** 렌더러에 넘길 0~1 세기. 게임 시계 기준이라 배속에서도 길이가 맞는다. */
export function hitFlashAmount(monster, gameClock) {
  const until = monster?._hitFlashUntil || 0;
  if (gameClock >= until) return 0;
  return Math.max(0, Math.min(1, (until - gameClock) / HIT_FLASH_MS));
}

// ── 큰 타격 판정 ───────────────────────────────────────────
/** 히트스톱·흔들림을 걸 만한 "묵직한" 타격인가. 광역이거나 최대체력 10% 이상. */
export function isHeavyHit(damage, monster, hasSplash) {
  if (hasSplash) return true;
  if (!monster || !monster.maxHp) return false;
  return damage >= monster.maxHp * 0.1;
}
