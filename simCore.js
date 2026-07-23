// simCore.js — 게임플레이 수치의 단일 진실원 (DOM 미참조 · 순수 함수)
// main.js(실게임)와 tools/balance-probe.mjs(헤드리스 밸런스 시뮬)가 함께 import한다.
// ⚠️ 여기 수치를 바꾸면 실게임·프로브가 동시에 바뀐다 — 씬/렌더 쪽에 사본 금지 (L-006)

// ---------- 웨이브 ----------
export function monstersInWave(wave) {
  // v5 재조정: 초반 완만(10+1.5w), 상한 60 (웨일북 성능 예산과 동기)
  return Math.min(60, 10 + Math.floor(wave * 1.5));
}

export function spawnIntervalMs(wave, gameSpeed = 1) {
  return Math.max(150, (1000 - wave * 8) / gameSpeed);
}

export const HIGH_TIER_BOSSES = ["ancientDragon", "voidLord", "titanGolem"];
export const MID_TIER_BOSSES = ["archfiend", "boss"];
export const MEGA_BOSSES = ["shadowDragon", "wormQueen"];

// 일반 웨이브 몬스터 가중치 풀 (등장 웨이브 임계)
const NORMAL_POOL = [
  { type: "normal", weight: 100, from: 0 },
  { type: "speed", weight: 30, from: 2 },
  { type: "bat", weight: 25, from: 3 },
  { type: "collector", weight: 15, from: 3 },
  { type: "tank", weight: 20, from: 4 },
  { type: "shielder", weight: 15, from: 5 },
  { type: "leech", weight: 10, from: 5 },
  { type: "healer", weight: 12, from: 5 },
  { type: "dragon", weight: 8, from: 6 },
  { type: "teleporter", weight: 12, from: 7 },
  { type: "mirage", weight: 10, from: 7 },
  { type: "ghost", weight: 10, from: 8 },
  { type: "splitter", weight: 10, from: 9 },
  { type: "chronomancer", weight: 8, from: 9 },
  { type: "swarmling", weight: 15, from: 9 },
  { type: "disruptor", weight: 6, from: 10 },
  { type: "mimic", weight: 5, from: 11 },
  { type: "golem", weight: 5, from: 11 },
  { type: "necromancer", weight: 7, from: 11 },
  { type: "summoner", weight: 8, from: 12 },
  { type: "assassin", weight: 8, from: 13 },
  { type: "berserker", weight: 10, from: 13 },
  { type: "general", weight: 4, from: 14 },
  { type: "plaguebearer", weight: 8, from: 15 },
  { type: "phoenix", weight: 6, from: 16 },
];

export function getMonsterTypeForNormalWave(wave, rand = Math.random) {
  const pool = NORMAL_POOL.filter((m) => wave > m.from || m.from === 0);
  const totalWeight = pool.reduce((sum, m) => sum + m.weight, 0);
  let r = rand() * totalWeight;
  for (const m of pool) {
    if (r < m.weight) return m.type;
    r -= m.weight;
  }
  return "normal";
}

// 웨이브 전체 조성 (보스 주기: 25 > 20 > 15 > 8 > 4)
export function buildWaveComposition(wave, rand = Math.random) {
  const count = monstersInWave(wave);
  const comp = [];
  const support = ["general", "dragon", "golem"];
  const pickSupport = () => support[Math.floor(rand() * support.length)];

  // v5 재조정: 보스 웨이브 서포트를 전원 정예 → 정예 일부 + 일반 풀 혼합
  // (구 편성 "장군×27"은 웨이브 8에 총 14만 HP — 프로브 실측으로 클리어 불가 확인)
  const mixedSupport = (n, eliteRatio, elitePick) => {
    const eliteN = Math.round(n * eliteRatio);
    for (let i = 0; i < eliteN; i++) comp.push(elitePick());
    for (let i = 0; i < n - eliteN; i++)
      comp.push(getMonsterTypeForNormalWave(wave, rand));
  };
  if (wave > 0 && wave % 25 === 0) {
    comp.push("demonKing");
    mixedSupport(count - 1, 0.35, pickSupport);
  } else if (wave > 0 && wave % 20 === 0) {
    comp.push("finalBoss");
    if (wave > 20) mixedSupport(count - 1, 0.3, pickSupport);
    else mixedSupport(count - 1, 0.3, () => "tank");
  } else if (wave > 0 && wave % 15 === 0) {
    const idx = Math.floor((wave / 15 - 1) / 2) % MEGA_BOSSES.length;
    comp.push(MEGA_BOSSES[idx]);
    mixedSupport(count - 1, 0.3, pickSupport);
  } else if (wave > 0 && wave % 8 === 0) {
    const idx = Math.floor((wave / 8 - 1) / 2) % HIGH_TIER_BOSSES.length;
    comp.push(HIGH_TIER_BOSSES[idx]);
    mixedSupport(count - 1, 0.2, () => "general");
  } else if (wave > 0 && wave % 4 === 0) {
    const idx = Math.floor((wave / 4 - 1) / 2) % MID_TIER_BOSSES.length;
    comp.push(MID_TIER_BOSSES[idx]);
    mixedSupport(count - 1, 0.3, () => "shielder");
  } else {
    for (let i = 0; i < count; i++) {
      const t = getMonsterTypeForNormalWave(wave, rand);
      if (t === "swarmling") {
        for (let j = 0; j < 5 && i < count; j++, i++) comp.push("swarmling");
        i--;
      } else comp.push(t);
    }
  }
  return comp;
}

// ---------- 몬스터 스케일링 ----------
export function waveHpMultiplier(wave) {
  // v5 재조정: 초반 기울기 0.3→0.18 (웨이브 8 벽 제거 — 프로브 실측), 후반 가속 유지
  let m = 1 + wave * 0.18;
  if (wave > 20) m += (wave - 20) * 0.15;
  if (wave > 40) m += (wave - 40) * 0.25;
  if (wave > 60) m += (wave - 60) * 0.4;
  return m;
}

export function difficultyHpMultiplier(difficulty) {
  // v5 재조정: 학년은 콘텐츠 선택이지 난이도 선택이 아님 — 1+0.15g(3학년 1.45, 6학년 1.9)
  // 는 상위 학년 부당 페널티 (프로브: 동일 정답률에서 6학년만 조기 사망). 완만한 차등만 유지.
  return 1 + Math.max(0, Number(difficulty) - 3) * 0.08;
}

export function waveGoldMultiplier(wave) {
  return 1 + wave / 12;
}

export function eliteParams(wave, rand = Math.random) {
  if (wave <= 15) return null;
  const chance = wave > 30 ? 0.3 : 0.2;
  if (rand() >= chance) return null;
  return wave > 30
    ? { hp: 2.0, speed: 1.2, gold: 2.0 }
    : { hp: 1.5, speed: 1.2, gold: 1.5 };
}

// ---------- 경제 ----------
export const INITIAL_GOLD = 400;   // v5: 300→400 (초반 타워 램프 보강)
export const INITIAL_CASTLE_HP = 100;
export const LEAK_DAMAGE = 12;        // v5: 15→12 (성 회복 루프와 세트)
export const WAVE_CLEAR_HEAL = 3;     // v5 신규: 무피해 웨이브 클리어 시 성 체력 회복

export function answerReward(wave, comboMultiplier = 1, bonusGold = 0) {
  // v5: 기본 150→180 (초반 경제 보강 — 프로브 실측)
  return Math.floor((180 + wave * 10) * comboMultiplier) + bonusGold;
}

// v5 재조정: 오답 시 타워 삭제 폐지 (정답률 60% 학생 하드월 원인 — 프로브 실측)
export const WRONG_PENALTY = { gold: 50, castleHp: 5, score: 50, deleteTower: false };

// ---------- 타워 ----------
export const TOWER_MAX_LEVEL = 10;

export function towerUpgradeCost(tower) {
  const baseCost =
    tower.cost === 0 || tower.type === "ultimate" || tower.type === "transcendent"
      ? 350
      : tower.cost;
  return baseCost * (tower.level + 1);
}

export function applyTowerUpgrade(tower) {
  tower.level++;
  tower.damage = Math.floor(tower.damage * 1.3);
  if (tower.dps) tower.dps = Math.floor(tower.dps * 1.25);
  tower.range = Math.floor(tower.range * 1.1);
  tower.rangeSq = tower.range * tower.range;
  if (tower.cooldown) tower.cooldown = Math.floor(tower.cooldown * 0.95);
  return tower;
}

// 타워 이론 DPS (밸런스 분석용)
export function towerDps(stats) {
  if (stats.dps) return stats.dps;
  if (!stats.damage || !stats.cooldown) return 0;
  return (stats.damage * 1000) / stats.cooldown;
}
