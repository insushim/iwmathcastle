#!/usr/bin/env node
// tools/balance-probe.mjs — 밸런스 곡선 프로브 (헤드리스)
// 학년(3~6) × 정답률(60/80/95%) 격자를 실제 웨이브 시뮬로 돌려
// 생존 웨이브 · 사망 원인 · 경제 여유배수 · 적HP/플레이어DPS 곡선비를 표로 출력.
// simCore.js(단일 진실원)를 그대로 import — 씬 사본 수치 없음 (L-006)
// v6: 각성·마법사 DPS 캡·웨이브 변이 반영 + --gate 배포 게이트 모드
// 사용: node tools/balance-probe.mjs [maxWave=40]
//       node tools/balance-probe.mjs --gate   (배포 게이트: 95%봇 W60 미만 사망 + 60%봇 W15+ 생존)

import * as sim from "../simCore.js";
import { TOWER_STATS, MONSTER_STATS, WIZARD_SPELLS, WIZARD_AUTO_ATTACK_STATS } from "../gameData.js";

const GATE_MODE = process.argv.includes("--gate");
// v8: 집중력(정답률→화력)과 각성 6단계 도입으로 상위권 도달 웨이브가 올라갔다.
// "학습이 결과를 바꾸는가"의 정본 게이트는 tools/accuracy-sweep.mjs 다.
// 여기서는 "하드월 없음 + 무한 압도 없음" 두 가지만 본다.
const MAX_WAVE = GATE_MODE ? 100 : Number(process.argv[2]) || 40;
const GATE_UPPER = 95;

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

// 마법사 스펠 DPS (파이어볼 평균 2타겟 근사 — 캡 비대상)
const WIZARD_SPELL_DPS =
  (WIZARD_SPELLS.fireball.damage * 2 * 1000) / WIZARD_SPELLS.fireball.cooldown;

// v6: 오토어택 DPS는 총 타워 DPS의 25% 캡 (simCore 단일 진실원)
function wizardAutoDps(towerDpsTotal) {
  const dmg = sim.cappedWizardAutoDamage(
    WIZARD_AUTO_ATTACK_STATS.damage,
    WIZARD_AUTO_ATTACK_STATS.cooldown,
    towerDpsTotal,
    WIZARD_AUTO_ATTACK_STATS.initialDamage,
  );
  return (dmg * 1000) / WIZARD_AUTO_ATTACK_STATS.cooldown;
}

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
  let focus = 0;              // v8: 집중력 (simCore 단일 진실원)
  const towers = [];
  let cumIncome = 0, cumSpent = 0;
  const curve = {};
  let deathWave = null, deathCause = null;

  const towerDpsTotal = () => towers.reduce((s, t) => s + sim.towerDps(t), 0);
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
      focus = sim.focusAfter(focus, true);
      const tier = comboTier(combo);
      const reward = sim.answerReward(wave, tier.multiplier, tier.bonusGold);
      gold += reward; cumIncome += reward;
    } else {
      combo = 0;
      focus = sim.focusAfter(focus, false);
      gold = Math.max(0, gold - sim.WRONG_PENALTY.gold);
      castleHp -= sim.WRONG_PENALTY.castleHp;
      // v6: 오답 타워 삭제는 simCore 설정을 따른다 (v5에서 폐지 — 프로브 불일치 수정)
      if (sim.WRONG_PENALTY.deleteTower && towers.length) {
        let wi = 0;
        towers.forEach((t, i) => { if (sim.towerDps(t) < sim.towerDps(towers[wi])) wi = i; });
        towers.splice(wi, 1);
      }
      if (castleHp <= 0) { deathWave = wave; deathCause = "오답 페널티"; break; }
    }

    // --- ② 건설/업그레이드/각성 (탐욕: DPS/골드 효율 최대) ---
    let acted = true;
    while (acted) {
      acted = false;
      let buy = towers.length < MAX_TOWERS ? BUYABLE.find((b) => b.cost <= gold) : null;
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
        const gain = sim.towerDps(t) * 0.3 / 0.95;
        if (gain / cost > upEff) { upEff = gain / cost; upBest = t; }
      }
      // v6: 각성 (레벨 10 타워 → 골드 대량 소모 티어업)
      let awBest = null, awEff = 0;
      for (const t of towers) {
        if (t.level < sim.TOWER_MAX_LEVEL || (t.awaken || 0) >= sim.TOWER_MAX_AWAKEN) continue;
        const cost = sim.towerAwakenCost(t);
        if (cost > gold) continue;
        const gain = sim.towerDps(t) * 0.42; // dmg×1.35·cd×0.95 근사 증가분
        if (gain / cost > awEff) { awEff = gain / cost; awBest = t; }
      }
      if (buy && buyEff >= upEff && buyEff >= awEff) {
        gold -= buy.cost; cumSpent += buy.cost;
        towers.push({ type: buy.key, cost: buy.cost, damage: buy.damage, dps: buy.dps, range: buy.range, cooldown: buy.cooldown, level: 1, rangeSq: buy.range * buy.range, splashTargets: buy.splashTargets, slow: buy.slow });
        acted = true;
      } else if (upBest && upEff >= awEff) {
        const cost = sim.towerUpgradeCost(upBest);
        gold -= cost; cumSpent += cost;
        sim.applyTowerUpgrade(upBest);
        acted = true;
      } else if (awBest) {
        const cost = sim.towerAwakenCost(awBest);
        gold -= cost; cumSpent += cost;
        sim.applyTowerAwaken(awBest);
        acted = true;
      }
    }

    // --- ③ 웨이브 전투 시뮬 (dt=0.1s 큐) ---
    const comp = sim.buildWaveComposition(wave, rng);
    const mod = sim.waveModifier(wave, rng); // v6: 웨이브 변이
    const hpMult = sim.waveHpMultiplier(wave) * sim.difficultyHpMultiplier(grade);
    const goldMult = sim.waveGoldMultiplier(wave) * (mod?.goldFactor || 1);
    const spawnGap = sim.spawnIntervalMs(wave) / 1000;
    const modSpeed = mod?.speedFactor || 1;
    const queue = comp.map((type, i) => {
      const st = MONSTER_STATS[type] || MONSTER_STATS.normal;
      const elite = st.isBoss ? null : sim.eliteParams(wave, rng);
      const hp = Math.floor(st.hp * hpMult) * (elite ? elite.hp : 1);
      return {
        hp, maxHp: hp,
        speed: st.speed * (elite ? elite.speed : 1) * modSpeed,
        gold: Math.ceil(st.gold * goldMult) * (elite ? elite.gold : 1),
        spawnAt: i * spawnGap, pos: 0, alive: false, done: false,
      };
    });
    const waveHpTotal = queue.reduce((s, m) => s + m.hp, 0);
    const focusMult = sim.focusDamageMultiplier(focus);   // v8
    const tDps = towerDpsTotal() * focusMult;
    const dpsNow = tDps + wizardAutoDps(towerDpsTotal()) + WIZARD_SPELL_DPS;
    if ([5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80].includes(wave)) {
      curve[wave] = { waveHp: Math.round(waveHpTotal), playerDps: Math.round(dpsNow), towers: towers.length };
    }

    const dt = 0.1;
    let t = 0, leaked = 0;
    while (queue.some((m) => !m.done) && t < WAVE_SIM_CAP_S) {
      t += dt;
      for (const m of queue) {
        if (!m.alive && !m.done && t >= m.spawnAt) m.alive = true;
        if (m.alive) {
          // v6: 재생 변이
          if (mod?.regenPctPerSec && m.hp < m.maxHp)
            m.hp = Math.min(m.maxHp, m.hp + m.maxHp * mod.regenPctPerSec * dt);
          m.pos += m.speed * SPEED_PX * dt * slowFactor();
          if (m.pos >= PATH_LEN) {
            m.alive = false; m.done = true; leaked++;
            castleHp -= LEAK_DAMAGE;
          }
        }
      }
      if (castleHp <= 0) break;
      const aliveList = queue.filter((m) => m.alive);
      if (!aliveList.length) continue;
      const cover = Math.min(1, (aliveList.length * 2 * avgRange()) / PATH_LEN);
      // v6: 변이별 데미지 계수 분리 적용 (타워/마법사)
      const towerFactor = mod?.towerDamageFactor || 1;
      const wizardFactor = mod?.wizardDamageFactor || 1;
      const towerEff = towers.reduce(
        (s, tw) => s + sim.towerDps(tw) * Math.min(tw.splashTargets || 1, Math.max(1, aliveList.length)),
        0,
      ) * towerFactor * focusMult;
      const wizardEff =
        (wizardAutoDps(towerDpsTotal()) + WIZARD_SPELL_DPS) * Math.min(2, Math.max(1, aliveList.length)) * wizardFactor;
      let dmg = (towerEff + wizardEff) * cover * dt;
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
    awakens: towers.reduce((s, t) => s + (t.awaken || 0), 0),
    finalDps: Math.round(towerDpsTotal() * sim.focusDamageMultiplier(focus) + wizardAutoDps(towerDpsTotal()) + WIZARD_SPELL_DPS),
    focus,
    economy: cumSpent ? (cumIncome / cumSpent).toFixed(2) : "-",
    curve,
  };
}

function medianRun(grade, acc) {
  const runs = [1, 2, 3].map((k) => runCell(grade, acc, grade * 1000 + acc * 100 + k * 7919));
  runs.sort((a, b) => a.survived - b.survived);
  const r = runs[1];
  r.range = `${runs[0].survived}~${runs[2].survived}`;
  return r;
}

// ---------- 게이트 모드 (배포 판정) ----------
if (GATE_MODE) {
  console.log(`밸런스 배포 게이트 — MAX_WAVE=${MAX_WAVE}\n`);
  let pass = true;
  // ① 95% 정답률 봇도 언젠가는 뚫린다 (무한 압도 방지)
  for (const grade of [3, 4, 5, 6]) {
    const r = medianRun(grade, 0.95);
    const ok = r.survived < GATE_UPPER;
    if (!ok) pass = false;
    console.log(`  [게이트①] ${grade}학년 95%봇 생존 ${r.survived}웨이브 (${r.range}) 집중력 ${r.focus} → ${ok ? `✅ W${GATE_UPPER} 미만 사망` : "❌ 무한 압도"}`);
  }
  // ② 60% 정답률이 웨이브 15+ 생존 (전 학년)
  for (const grade of [3, 4, 5, 6]) {
    const r = medianRun(grade, 0.6);
    const ok = r.survived >= 15;
    if (!ok) pass = false;
    console.log(`  [게이트②] ${grade}학년 60%봇 생존 ${r.survived}웨이브 (${r.range}) → ${ok ? "✅ W15+ 생존" : "❌ 조기 사망 (하드월)"}`);
  }
  console.log(`\n${pass ? "✅ 밸런스 게이트 PASS" : "❌ 밸런스 게이트 FAIL"}`);
  process.exit(pass ? 0 : 1);
}

// ---------- 격자 실행 ----------
console.log(`밸런스 프로브 — MAX_WAVE=${MAX_WAVE}, 시뮬레이션 3회 평균 대표(시드 고정)\n`);
console.log("학년 | 정답률 | 생존웨이브 | 사망원인 | 잔여HP | 타워 | 각성 | 최종DPS | 경제(수입/지출)");
console.log("-".repeat(95));
const results = [];
for (const grade of [3, 4, 5, 6]) {
  for (const acc of [0.6, 0.8, 0.95]) {
    const r = medianRun(grade, acc);
    results.push(r);
    console.log(
      `  ${grade}  |  ${Math.round(acc * 100)}%  |  ${String(r.survived).padStart(2)} (${r.range})  | ${r.deathCause.padEnd(8)} | ${String(r.castleHp).padStart(4)} | ${String(r.towers).padStart(2)}  | ${String(r.awakens).padStart(2)}  | ${String(r.finalDps).padStart(6)} | ${r.economy}`,
    );
  }
}

const rep = results.find((r) => r.grade === 4 && r.accuracy === 0.8);
console.log("\n[곡선 상세 — 4학년 · 정답률 80%]  웨이브HP vs 플레이어DPS (비율 = HP/DPS = 처치 필요 초)");
for (const [w, c] of Object.entries(rep.curve)) {
  console.log(`  웨이브 ${String(w).padStart(2)}: 적HP합 ${String(c.waveHp).padStart(8)} | DPS ${String(c.playerDps).padStart(6)} | 처치필요 ${(c.waveHp / c.playerDps).toFixed(1)}s | 타워 ${c.towers}`);
}
console.log("\n판정 기준: ① 정답률 60%가 웨이브 15+ 생존 ② 95%도 웨이브 60 전 사망(무한 스케일링) ③ 처치필요초 발산 시 각성으로 대응 가능할 것");
