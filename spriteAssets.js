// spriteAssets.js — AI 생성 스프라이트 로더 (v5 WS-3)
// assets/manifest.json 기반 preload. 이미지가 없거나 로드 실패 시
// 각 렌더러는 기존 절차적 드로잉으로 자동 폴백한다 (안전망 — iwtaping 검증 패턴).

const sprites = new Map();
let loaded = false;

// v8: 학년을 고르기도 전에 207장(2.5MB)을 전부 받고 있었다.
// 3학년만 할 아이도 6학년 전용 보스 스프라이트까지 받았고, 그 요청들이
// 정작 필요한 문제 파일(grade*.js)과 커넥션을 다퉜다. 느린 학교 와이파이에서
// 첫 화면까지 6초가 걸린 이유다(3G 에뮬레이션 실측).
//
// 그래서 두 단계로 나눈다.
//  ① 필수  — 마법사·성·길·타워 + 웨이브 12 이전에 나오는 몬스터. 게임 시작을 막는다.
//  ② 나머지 — 후반 전용 몬스터·다른 학년 배경. 백그라운드로 받는다.
// 렌더러는 스프라이트가 없으면 절차적 드로잉으로 폴백하므로, ②가 늦게 와도 안전하다.
const EARLY_MONSTERS = new Set([
  // simCore.NORMAL_POOL 에서 웨이브 12 이전 등장분 + 그 구간의 보스
  "normal", "speed", "bat", "collector", "tank", "shielder", "leech", "healer",
  "dragon", "teleporter", "mirage", "ghost", "splitter", "chronomancer", "swarmling",
  "mini-splitter", "boss", "archfiend", "general", "ancientDragon",
]);

function isEssential(key, gradeBg) {
  if (key.startsWith("wizard") || key.startsWith("castle") || key.startsWith("road")) return true;
  if (key.startsWith("tower")) return true;
  if (key.startsWith("bg")) return gradeBg ? key === gradeBg : true;
  if (key.startsWith("monster")) return EARLY_MONSTERS.has(key.split("_")[1]);
  return true;
}

function loadOne(basePath, f) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { sprites.set(f.key, img); resolve(); };
    img.onerror = () => resolve(); // 개별 실패는 폴백으로 흡수
    img.src = `${basePath}/${f.file}`;
  });
}

/**
 * 필수 스프라이트만 받고 끝난다. 나머지는 백그라운드로 이어서 받는다.
 * @param {string} gradeBg  그 학년에 쓰는 배경 키(예: "bg_meadow"). 없으면 배경 전부.
 */
export async function preloadSprites(basePath = "assets", gradeBg = null) {
  try {
    const res = await fetch(`${basePath}/manifest.json`);
    if (!res.ok) return false;
    const manifest = await res.json();

    const essential = manifest.files.filter((f) => isEssential(f.key, gradeBg));
    const rest = manifest.files.filter((f) => !isEssential(f.key, gradeBg));

    await Promise.all(essential.map((f) => loadOne(basePath, f)));
    loaded = sprites.size > 0;
    console.info(`[spriteAssets] 필수 ${sprites.size}장 로드 (나머지 ${rest.length}장은 백그라운드)`);

    // 나머지는 기다리지 않는다 — 게임은 이미 시작할 수 있다
    Promise.all(rest.map((f) => loadOne(basePath, f))).then(() => {
      console.info(`[spriteAssets] 전체 ${sprites.size}장 로드 완료`);
    });
    return loaded;
  } catch {
    return false; // 매니페스트 없음 → 전면 절차적 폴백
  }
}

/** 지금까지 받은 스프라이트 수 (QA·디버그용) */
export function spriteCount() {
  return sprites.size;
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
