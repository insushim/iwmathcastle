// spriteAssets.js — AI 생성 스프라이트 로더 (v5 WS-3)
// assets/manifest.json 기반 preload. 이미지가 없거나 로드 실패 시
// 각 렌더러는 기존 절차적 드로잉으로 자동 폴백한다 (안전망 — iwtaping 검증 패턴).

const sprites = new Map();
let loaded = false;

export async function preloadSprites(basePath = "assets") {
  try {
    const res = await fetch(`${basePath}/manifest.json`);
    if (!res.ok) return false;
    const manifest = await res.json();
    await Promise.all(
      manifest.files.map(
        (f) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              sprites.set(f.key, img);
              resolve();
            };
            img.onerror = () => resolve(); // 개별 실패는 폴백으로 흡수
            img.src = `${basePath}/${f.file}`;
          }),
      ),
    );
    loaded = sprites.size > 0;
    console.info(`[spriteAssets] ${sprites.size}개 스프라이트 로드`);
    return loaded;
  } catch {
    return false; // 매니페스트 없음 → 전면 절차적 폴백
  }
}

export function getSprite(key) {
  return sprites.get(key) || null;
}

export function hasSprites() {
  return loaded;
}

// 스프라이트를 (cx, cy) 중심 · box 크기에 비율 유지로 그린다. 성공 시 true.
export function drawSpriteCentered(ctx, key, cx, cy, box) {
  const img = sprites.get(key);
  if (!img) return false;
  const scale = box / Math.max(img.width, img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  return true;
}
