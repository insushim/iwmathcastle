// rarity.js — 타워 등급(레어도)의 **단일 진실원**
//
// 왜 이 파일이 생겼나 (v9):
//   구버전 ui.js의 getTowerTier()는 등급을 **비용**으로 판정했다. 그런데 상자에서만
//   나오는 특수 타워는 cost:0 이라 전부 최하급으로 떨어졌고, 그걸 막으려고
//   golden/silver/copper/ultimate/transcendent 5종을 이름으로 하드코딩해 예외 처리하고
//   있었다. 그래서 황금 왕관(실측 공격력 208/초 = 전 타워 3위)의 툴팁이 "비용: 0G"를
//   띄웠다 — 화면이 정확히 반대로 말하고 있었다("좋은지 안 좋은지 구분이 안 감").
//
// 등급의 근거는 **새로 만들지 않는다.** gameData.js에 이미 RANDOM_TOWER_TIERS(1~6)와
// RANDOM_TIER_LABEL(기본·중급·상급·특수·궁극·전설)이 있고, 이 표는 ui.js가 상자 툴팁으로
// 아이에게 이미 보여주고 있다. 전투력으로 별도 6등급을 새로 만들면 같은 낱말 "전설"이
// 두 화면에서 서로 다른 순위를 가리키게 된다 — 고치려던 혼란을 그대로 재생산한다.
// 그래서 이 파일은 **그 표를 역인덱싱하는 얇은 래퍼**다.
//
// 전투력은 등급이 아니라 **정보**로 따로 낸다(powerInfo). 수리소·그물처럼 공격력이
// 낮은 지원 타워를 "낮은 등급"으로 깎아내리지 않기 위해서다 — 등급은 희귀도,
// 공격력은 성능, 둘은 다른 축이다.

import {
  TOWER_STATS,
  RANDOM_TOWER_TIERS,
  RANDOM_TIER_LABEL,
} from "./gameData.js";

// tier 색: 등급을 **색으로만** 구분하지 않는다(색각이상). 항상 라벨·별과 함께 쓴다.
const TIER_COLOR = {
  1: "#9ca3af", // 기본 — 회색
  2: "#4ade80", // 중급 — 초록
  3: "#60a5fa", // 상급 — 파랑
  4: "#c084fc", // 특수 — 보라
  5: "#fb923c", // 궁극 — 주황
  6: "#fde047", // 전설 — 금
};

/** key → tier(1~6) 역인덱스. gameData의 표가 바뀌면 여기도 자동으로 따라온다. */
const TIER_BY_KEY = new Map();
for (const [tier, keys] of Object.entries(RANDOM_TOWER_TIERS)) {
  for (const k of keys) TIER_BY_KEY.set(k, Number(tier));
}

/** 표에 없는 타워(향후 추가분)는 조용히 1등급으로 뭉개지 말고 여기서 드러낸다. */
export function untieredTowerKeys() {
  return Object.keys(TOWER_STATS).filter(
    (k) => !TOWER_STATS[k].isRandom && !TIER_BY_KEY.has(k),
  );
}

/**
 * 타워 등급. 상자 확률표와 **같은 표**를 읽으므로 두 화면이 어긋날 수 없다.
 * @returns {{tier:number, label:string, color:string, stars:string, boxOnly:boolean}}
 */
export function towerRarity(key) {
  const stat = TOWER_STATS[key];
  const tier = TIER_BY_KEY.get(key) ?? 1;
  return {
    tier,
    label: RANDOM_TIER_LABEL[tier] || "기본",
    color: TIER_COLOR[tier] || TIER_COLOR[1],
    stars: "★".repeat(tier),
    // cost 0 = 골드로 살 수 없다 = 상자에서만 나온다. "비용 0G"라고 쓰면 싸구려로 읽힌다.
    boxOnly: !!stat && stat.cost === 0,
  };
}

/** 등급 번호 → 색. ui.js가 dot·배지에 쓴다. */
export function tierColorOf(tier) {
  return TIER_COLOR[tier] || TIER_COLOR[1];
}

/** CSS 훅용 — style.css의 .tower-option[data-tier="t4"] 등과 짝. */
export function tierAttr(key) {
  return `t${towerRarity(key).tier}`;
}

// ── 성능 정보(등급과 다른 축) ──────────────────────────────
/** 직접 타격 초당 피해. 레이저처럼 dps 필드를 쓰는 타워도 함께 다룬다. */
export function directDps(stat) {
  if (!stat) return 0;
  if (stat.dps) return stat.dps;
  if (stat.damage && stat.cooldown) return (stat.damage * 1000) / stat.cooldown;
  return 0;
}

/** 지속 피해(독). 직접 타격과 합산하지 않고 따로 보여준다 — 성질이 다르다. */
export function dotDps(stat) {
  return stat?.poison?.dps || 0;
}

/**
 * 이 타워가 무엇을 하는 물건인지 한눈에. 등급과 무관하다.
 * role: "공격" | "지원"  —  지원은 화력이 아니라 유틸로 값을 하는 타워다.
 */
export function powerInfo(key) {
  const stat = TOWER_STATS[key];
  if (!stat || stat.isRandom) return null;
  const dd = directDps(stat);
  const dot = dotDps(stat);
  const tags = [];
  if (stat.splashRadius) tags.push("광역");
  if (stat.slow) tags.push("감속");
  if (stat.poison) tags.push("독");
  if (stat.stun) tags.push("기절");
  if (stat.shred) tags.push("방어 깨기");
  if (stat.goldPerHit) tags.push("골드");
  if (stat.repair) tags.push("성 수리");
  if (stat.numTargets > 1) tags.push(`${stat.numTargets}명 동시`);
  if (stat.targetType === "air") tags.push("공중 전용");
  else if (stat.targetType === "all") tags.push("지상+공중");
  // 지원 판정: 스스로 때려서 이기는 물건이 아닌 것. 수치는 실측 분포에서 잡았다
  // (그물 4.1 · 기절 10 · 얼음 13.3 vs 더하기 36.8) — 15/초가 그 사이의 골이다.
  const role = stat.repair || dd + dot < 15 ? "지원" : "공격";
  return { role, directDps: Math.round(dd), dotDps: Math.round(dot), tags, range: stat.range };
}

/**
 * 광역 보정 계수 — tools/accuracy-sweep.mjs가 쓰는 것과 **같은 관례**를 따른다
 * (`1 + min(3, floor(splashRadius/40))`). 여기서 다른 식을 쓰면 게임 화면이 말하는
 * 순위와 밸런스 시뮬이 말하는 순위가 갈린다.
 */
export function splashTargets(stat) {
  return stat?.splashRadius ? 1 + Math.min(3, Math.floor(stat.splashRadius / 40)) : 1;
}

/** 순위 계산용 실효 화력. 표시용 숫자(directDps)와 구분한다. */
export function effectivePower(key) {
  const s = TOWER_STATS[key];
  if (!s) return 0;
  // 멀티샷은 동시에 여러 대상을 때린다 — 광역과 같은 이유로 곱해 준다.
  return (directDps(s) + dotDps(s)) * splashTargets(s) * (s.numTargets || 1);
}

/**
 * 공격력 순위 — "이게 센 건가?"에 답하는 유일한 숫자.
 * 공격형끼리만 줄 세운다(지원 타워를 꼴찌로 만들지 않기 위해). 기본 수치 기준이라
 * 업그레이드·각성과 무관하게 항상 같은 답을 준다.
 * ⚠️ 광역을 빼고 초당 피해만으로 세우면 하늘 파괴자(1발 220·광역 65)처럼
 *    한 방으로 여러 마리를 지우는 타워가 부당하게 하위로 밀린다(실측 13위 → 8위).
 */
const ATTACK_RANKED = Object.keys(TOWER_STATS)
  .filter((k) => {
    const s = TOWER_STATS[k];
    if (!s || s.isRandom) return false;
    return powerInfo(k)?.role === "공격";
  })
  .sort((a, b) => effectivePower(b) - effectivePower(a));

export function attackRank(key) {
  const i = ATTACK_RANKED.indexOf(key);
  if (i === -1) return null; // 지원 타워는 순위를 매기지 않는다
  return { rank: i + 1, total: ATTACK_RANKED.length };
}

/** 획득 연출 강도. 5·6등급만 특별 취급한다(사행성 감각을 키우지 않도록 상한을 둔다). */
export function revealTier(key) {
  const t = towerRarity(key).tier;
  if (t >= 5) return "legendary"; // 궁극·전설 — 개봉 연출 + 플래시(예산 안에서)
  if (t === 4) return "epic";     // 특수 — 파티클 + 색 프레임
  return "plain";                 // 1~3 — 조용히
}
