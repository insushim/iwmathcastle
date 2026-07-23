// perfQuality.js — 저사양(웨일북) 자동 감지 + 런타임 품질 강등
// 정적 감지: deviceMemory ≤ 4GB 또는 코어 ≤ 4 (웨일북 = Celeron 4GB급)
// 동적 감지: 프레임 시간 EMA > 28ms 지속 시 강등 (아트온 프로젝트 실측 패턴)

export const quality = {
  low: false,          // 저사양 모드
  particleCap: 400,    // 동시 파티클 상한
  domEffects: true,    // DOM 이펙트 허용 (캔버스 이펙트는 항상)
  degraded: false,     // 런타임 강등 발생 여부 (1회만)
};

export function detectLowEnd() {
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  if (mem <= 4 || cores <= 4) applyLowQuality("정적 감지");
  return quality.low;
}

export function applyLowQuality(reason) {
  if (quality.low) return;
  quality.low = true;
  quality.particleCap = 120;
  quality.domEffects = false;
  console.info(`[perfQuality] 저사양 모드 활성 (${reason}) — 파티클 상한 120, DOM 이펙트 차단`);
}

// 프레임 시간 EMA 모니터 — gameLoop에서 매 프레임 feed(rawDeltaTime) 호출
let ema = 16.6;
let overCount = 0;
export function feedFrameTime(rawDeltaTime) {
  if (quality.degraded || quality.low) return;
  // 60fps 기준 16.6ms, 30fps 기준 33.3ms — EMA 28ms 초과가 60프레임 지속되면 강등
  ema = ema * 0.95 + rawDeltaTime * 0.05;
  if (ema > 28) {
    overCount++;
    if (overCount >= 60) {
      quality.degraded = true;
      applyLowQuality(`런타임 EMA ${ema.toFixed(1)}ms`);
    }
  } else if (overCount > 0) {
    overCount--;
  }
}
