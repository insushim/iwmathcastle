#!/usr/bin/env node
// tools/balance-probe.mjs — 밸런스 곡선 프로브 (헤드리스)
// 학년(3~6) × 정답률(60/80/95%) 격자를 실제 웨이브 시뮬로 돌려
// 생존 웨이브 · 사망 원인 · 경제 여유배수 · 적HP/플레이어DPS 곡선비를 표로 출력.
// simCore.js(단일 진실원)를 그대로 import — 씬 사본 수치 없음 (L-006)
// 사용: node tools/balance-probe.mjs [maxWave=40]

import * as sim from "../simCore.js";
import { TOWER_STATS, MONSTER_STATS, WIZARD_SPELLS, WIZARD_AUTO_ATTACK_STATS } from "../gameData.js";

const MAX_WAVE = Number(process.argv[2]) || 40;

// ---------- 시드 RNG ----------
function makeRng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 환경 상수 (웨일북 1366×768 레이아웃 기준) ----------
const PATH_LEN = 3420;             // generatePath 세그먼트 합 (px)
const SPEED_PX = 300;              // pathIndex 1.0/frame = 5px × 60fps
const MAX_TOWERS = 16;             // 경로 인접 배치 가능 슬롯 근사
const LEAK_DAMAGE = sim.LEAK_DAMAGE;
const WAVE_SIM_CAP_S = 240;

// 마법사 실효 DPS: 오토어택 + 파이어볼(평균 2타겟) 근사
const WIZARD_DPS =
  (WIZARD_AUTO_ATTACK_STATS.damage * 1000) / WIZARD_AUTO_ATTACK_STATS.cooldown +
  (WIZARD_SPELLS.fireball.damage * 2 * 1000) / WIZARD_SPELLS.fireball.cooldown;

// 구매 후보: 공격 타워만 (특수·랜덤 제외)
const BUYABLE = Object.entries(TOWER_STATS)
  .filter(([k, s]) => s.cost > 0 && (s.dps || (s.damage && s.cooldown)) &&
    !k.startsWith("random_") && !["goldMine", "repairStation", "net"].includes(k))
  .map(([k, s]) => ({
    key: k, ...s, baseDps: sim.towerDps(s),
    splashTargets: s.splashRadius ? 1 + Math.min(3, Math.floor(s.splashRadius / 40)) : 1,
  }))
  .sort((a, b) => b.baseDps / b.cost - a.baseDps / a.cost);

const COMBO_TIERS = [
  { minCombo: 10, multiplier: 5, bonusGold: 500 },
  { minCombo: 8, multiplier: 3, bonusGold: 200 },
  { minCombo: 5, multiplier: 2, bonusGold: 100 },
  { minCombo: 3, multiplier: 1.5, bonusGold: 50 },
  { minCombo: 0, multiplier: 1, bonusGold: 0 },
];
const comboTier = (c) => COMBO_TIERS.find((t) => c >= t.minCombo);

// ---------- 단일 런 ----------
function runCell(grade, accuracy, seed) {
  const rng = makeRng(seed);
  let gold = sim.INITIAL_GOLD;
  let castleHp = sim.INITIAL_CASTLE_HP;
  let combo = 0;
  const towers = [];
  let cumIncome = 0, cumSpent = 0;
  const curve = {}; // wave → {waveHp, playerDps, ratio}
  let deathWave = null, deathCause = null;

  const totalDps = () =>
    towers.reduce((s, t) => s + sim.towerDps(t), 0) + WIZARD_DPS;
  const effectiveDps = (aliveCount) =>
    towers.reduce(
      (s, t) => s + sim.towerDps(t) * Math.min(t.splashTargets || 1, Math.max(1, aliveCount)),
      0,
    ) + WIZARD_DPS * Math.min(2, Math.max(1, aliveCount));
  const slowFactor = () => {
    const ice = towers.filter((t) => t.slow).length;
    return 1 - Math.min(0.35, ice * 0.12);
  };
  const avgRange = () =>
    towers.length ? towers.reduce((s, t) => s + t.range, 0) / towers.length : 100;

  for (let wave = 1; wave <= MAX_WAVE; wave++) {
    // --- ① 문제 풀이 (웨이브 시작 전) ---
    if (rng() < accuracy) {
      combo++;
      const tier = comboTier(combo);
      const reward = sim.answerReward(wave, tier.multiplier, tier.bonusGold);
      gold += reward; cumIncome += reward;
    } else {
      combo = 0;
      gold = Math.max(0, gold - sim.WRONG_PENALTY.gold);
      castleHp -= sim.WRONG_PENALTY.castleHp;
      // deleteWeakestTower
      if (towers.length) {
        let wi = 0;
        towers.forEach((t, i) => { if (sim.towerDps(t) < sim.towerDps(towers[wi])) wi = i; });
        towers.splice(wi, 1);
      }
      if (castleHp <= 0) { deathWave = wave; deathCause = "오답 페널티"; break; }
    }

    // --- ② 건설/업그레이드 (탐욕: DPS/골드 효율 최대) ---
    let acted = true;
    while (acted) {
      acted = false;
      let buy = towers.length < MAX_TOWERS ? BUYABLE.find((b) => b.cost <= gold) : null;
      // 유틸 전략: 웨이브 5+ 에서 ice 타워 2기 우선 확보 (실플레이 근사)
      const iceCount = towers.filter((t) => t.slow).length;
      if (wave >= 5 && iceCount < 2 && towers.length < MAX_TOWERS) {
        const ice = BUYABLE.find((b) => b.slow && b.cost <= gold);
        if (ice) buy = ice;
      }
      const buyEff = buy ? buy.baseDps / buy.cost : 0;
      let upBest = null, upEff = 0;
      for (const t of towers) {
        if (t.level >= sim.TOWER_MAX_LEVEL) continue;
        const cost = sim.towerUpgradeCost(t);
        if (cost > gold) continue;
        const gain = sim.towerDps(t) * 0.3 / 0.95; // dmg×1.3·cd×0.95 근사 증가분
        if (gain / cost > upEff) { upEff = gain / cost; upBest = t; }
      }
      if (buy && buyEff >= upEff) {
        gold -= buy.cost; cumSpent += buy.cost;
        towers.push({ type: buy.key, cost: buy.cost, damage: buy.damage, dps: buy.dps, range: buy.range, cooldown: buy.cooldown, level: 1, rangeSq: buy.range * buy.range, splashTargets: buy.splashTargets, slow: buy.slow });
        acted = true;
      } else if (upBest) {
        const cost = sim.towerUpgradeCost(upBest);
        gold -= cost; cumSpent += cost;
        sim.applyTowerUpgrade(upBest);
        acted = true;
      }
    }

    // --- ③ 웨이브 전투 시뮬 (dt=0.1s 큐) ---
    const comp = sim.buildWaveComposition(wave, rng);
    const hpMult = sim.waveHpMultiplier(wave) * sim.difficultyHpMultiplier(grade);
    const goldMult = sim.waveGoldMultiplier(wave);
    const spawnGap = sim.spawnIntervalMs(wave) / 1000;
    const queue = comp.map((type, i) => {
      const st = MONSTER_STATS[type] || MONSTER_STATS.normal;
      const elite = st.isBoss ? null : sim.eliteParams(wave, rng);
      return {
        hp: Math.floor(st.hp * hpMult) * (elite ? elite.hp : 1),
        speed: st.speed * (elite ? elite.speed : 1),
        gold: Math.ceil(st.gold * goldMult) * (elite ? elite.gold : 1),
        spawnAt: i * spawnGap, pos: 0, alive: false, done: false,
      };
    });
    const waveHpTotal = queue.reduce((s, m) => s + m.hp, 0);
    const dpsNow = totalDps();
    if ([5, 10, 15, 20, 25, 30, 40].includes(wave)) {
      curve[wave] = { waveHp: Math.round(waveHpTotal), playerDps: Math.round(dpsNow), towers: towers.length };
    }

    const dt = 0.1;
    let t = 0, leaked = 0;
    while (queue.some((m) => !m.done) && t < WAVE_SIM_CAP_S) {
      t += dt;
      for (const m of queue) {
        if (!m.alive && !m.done && t >= m.spawnAt) m.alive = true;
        if (m.alive) {
          m.pos += m.speed * SPEED_PX * dt * slowFactor();
          if (m.pos >= PATH_LEN) {
            m.alive = false; m.done = true; leaked++;
            castleHp -= LEAK_DAMAGE;
          }
        }
      }
      if (castleHp <= 0) break;
      // 타워 가동률: 경로 위 몬스터 수 × 사거리 커버리지
      const aliveList = queue.filter((m) => m.alive);
      if (!aliveList.length) continue;
      const cover = Math.min(1, (aliveList.length * 2 * avgRange()) / PATH_LEN);
      let dmg = effectiveDps(aliveList.length) * cover * dt;
      // 선두부터 집중 사격
      aliveList.sort((a, b) => b.pos - a.pos);
      for (const m of aliveList) {
        if (dmg <= 0) break;
        const applied = Math.min(m.hp, dmg);
        m.hp -= applied; dmg -= applied;
        if (m.hp <= 0) {
          m.alive = false; m.done = true;
          gold += m.gold; cumIncome += m.gold;
        }
      }
    }
    if (castleHp <= 0) { deathWave = wave; deathCause = `누수 ${leaked}마리`; break; }
    if (leaked === 0) castleHp = Math.min(100, castleHp + sim.WAVE_CLEAR_HEAL);
  }

  return {
    grade, accuracy,
    survived: deathWave ? deathWave - 1 : MAX_WAVE,
    deathCause: deathCause || "-",
    castleHp: Math.max(0, castleHp),
    towers: towers.length,
    finalDps: Math.round(totalDps()),
    economy: cumSpent ? (cumIncome / cumSpent).toFixed(2) : "-",
    curve,
  };
}

// ---------- 격자 실행 ----------
console.log(`밸런스 프로브 — MAX_WAVE=${MAX_WAVE}, 시뮬레이션 3회 평균 대표(시드 고정)\n`);
console.log("학년 | 정답률 | 생존웨이브 | 사망원인 | 잔여HP | 타워 | 최종DPS | 경제(수입/지출)");
console.log("-".repeat(85));
const results = [];
for (const grade of [3, 4, 5, 6]) {
  for (const acc of [0.6, 0.8, 0.95]) {
    const runs = [1, 2, 3].map((k) => runCell(grade, acc, grade * 1000 + acc * 100 + k * 7919));
    runs.sort((a, b) => a.survived - b.survived);
    const r = runs[1]; // 중앙값 런
    r.range = `${runs[0].survived}~${runs[2].survived}`;
    results.push(r);
    console.log(
      `  ${grade}  |  ${Math.round(acc * 100)}%  |  ${String(r.survived).padStart(2)} (${r.range})  | ${r.deathCause.padEnd(8)} | ${String(r.castleHp).padStart(4)} | ${String(r.towers).padStart(2)}  | ${String(r.finalDps).padStart(6)} | ${r.economy}`,
    );
  }
}

// 곡선비 상세 (대표: 4학년 80%)
const rep = results.find((r) => r.grade === 4 && r.accuracy === 0.8);
console.log("\n[곡선 상세 — 4학년 · 정답률 80%]  웨이브HP vs 플레이어DPS (비율 = HP/DPS = 처치 필요 초)");
for (const [w, c] of Object.entries(rep.curve)) {
  console.log(`  웨이브 ${String(w).padStart(2)}: 적HP합 ${String(c.waveHp).padStart(8)} | DPS ${String(c.playerDps).padStart(6)} | 처치필요 ${(c.waveHp / c.playerDps).toFixed(1)}s | 타워 ${c.towers}`);
}
console.log("\n판정 기준: ① 정답률 60%가 웨이브 15+ 생존 ② 95%도 웨이브 30 전 무한 압도 불가 ③ 처치필요초가 웨이브에 따라 발산하지 않을 것");
