#!/usr/bin/env node
// tools/accuracy-sweep.mjs — "수학을 잘 풀면 더 멀리 가는가"를 재는 자
//
// 이 프로젝트에서 가장 중요한 질문이다. 학습 게임인데 정답률이 결과를 바꾸지 않으면
// 게임 안에 공부할 이유가 없다.
//
// 2026-08-12 기준선(v7): 정답률 60·70·80·90·100%가 **전부 59웨이브**에서 죽었다.
//   4학년 30%→15 · 40%→15 · 50%→24 · 60%→59 · 70%→59 · 80%→59 · 90%→59 · 100%→59
//   즉 이미 60%를 넘긴 아이는 100%가 되어도 단 1웨이브도 더 못 갔다.
//
// balance-probe.mjs와 같은 simCore를 쓰되, 정답률 격자를 훨씬 촘촘히 돌린다.
// 사용: node tools/accuracy-sweep.mjs           (표 출력)
//       node tools/accuracy-sweep.mjs --gate    (배포 게이트 판정)

import * as sim from "../simCore.js";
import { TOWER_STATS, MONSTER_STATS, WIZARD_SPELLS, WIZARD_AUTO_ATTACK_STATS } from "../gameData.js";

const GATE = process.argv.includes("--gate");
const MAX_WAVE = 90;
const SEEDS = [1, 2, 3, 4, 5];
const ACCS = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
const GRADES = [3, 4, 5, 6];

// 환경 상수는 balance-probe.mjs와 동일 (웨일북 1366×768 기준)
const PATH_LEN = 3420;
const SPEED_PX = 300;
const MAX_TOWERS = 16;
const WAVE_SIM_CAP_S = 240;

function makeRng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WIZARD_SPELL_DPS =
  (WIZARD_SPELLS.fireball.damage * 2 * 1000) / WIZARD_SPELLS.fireball.cooldown;

function wizardAutoDps(towerDpsTotal) {
  const dmg = sim.cappedWizardAutoDamage(
    WIZARD_AUTO_ATTACK_STATS.damage, WIZARD_AUTO_ATTACK_STATS.cooldown,
    towerDpsTotal, WIZARD_AUTO_ATTACK_STATS.initialDamage,
  );
  return (dmg * 1000) / WIZARD_AUTO_ATTACK_STATS.cooldown;
}

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

function runCell(grade, accuracy, seed) {
  const rng = makeRng(seed);
  let gold = sim.INITIAL_GOLD;
  let castleHp = sim.INITIAL_CASTLE_HP;
  let combo = 0;
  let focus = 0;                 // v8
  const towers = [];
  let answerGold = 0, killGold = 0, cumSpent = 0;
  let deathWave = null;
  const sample = {};

  const towerDpsTotal = () => towers.reduce((s, t) => s + sim.towerDps(t), 0);
  const slowFactor = () => 1 - Math.min(0.35, towers.filter((t) => t.slow).length * 0.12);
  const avgRange = () =>
    towers.length ? towers.reduce((s, t) => s + t.range, 0) / towers.length : 100;

  for (let wave = 1; wave <= MAX_WAVE; wave++) {
    // ① 문제
    if (rng() < accuracy) {
      combo++;
      focus = sim.focusAfter(focus, true);
      const tier = comboTier(combo);
      const reward = sim.answerReward(wave, tier.multiplier, tier.bonusGold);
      gold += reward; answerGold += reward;
    } else {
      combo = 0;
      focus = sim.focusAfter(focus, false);
      gold = Math.max(0, gold - sim.WRONG_PENALTY.gold);
      castleHp -= sim.WRONG_PENALTY.castleHp;
      if (castleHp <= 0) { deathWave = wave; break; }
    }

    // ② 탐욕 건설/업그레이드/각성
    let acted = true;
    while (acted) {
      acted = false;
      let buy = towers.length < MAX_TOWERS ? BUYABLE.find((b) => b.cost <= gold) : null;
      if (wave >= 5 && towers.filter((t) => t.slow).length < 2 && towers.length < MAX_TOWERS) {
        const ice = BUYABLE.find((b) => b.slow && b.cost <= gold);
        if (ice) buy = ice;
      }
      const buyEff = buy ? buy.baseDps / buy.cost : 0;
      let upBest = null, upEff = 0;
      for (const t of towers) {
        if (t.level >= sim.TOWER_MAX_LEVEL) continue;
        const cost = sim.towerUpgradeCost(t);
        if (cost > gold) continue;
        const gain = (sim.towerDps(t) * 0.3) / 0.95;
        if (gain / cost > upEff) { upEff = gain / cost; upBest = t; }
      }
      let awBest = null, awEff = 0;
      for (const t of towers) {
        if (t.level < sim.TOWER_MAX_LEVEL || (t.awaken || 0) >= sim.TOWER_MAX_AWAKEN) continue;
        const cost = sim.towerAwakenCost(t);
        if (cost > gold) continue;
        const gain = sim.towerDps(t) * 0.42;
        if (gain / cost > awEff) { awEff = gain / cost; awBest = t; }
      }
      if (buy && buyEff >= upEff && buyEff >= awEff) {
        gold -= buy.cost; cumSpent += buy.cost;
        towers.push({ type: buy.key, cost: buy.cost, damage: buy.damage, dps: buy.dps,
          range: buy.range, cooldown: buy.cooldown, level: 1, rangeSq: buy.range ** 2,
          splashTargets: buy.splashTargets, slow: buy.slow });
        acted = true;
      } else if (upBest && upEff >= awEff) {
        gold -= sim.towerUpgradeCost(upBest); cumSpent += sim.towerUpgradeCost(upBest);
        sim.applyTowerUpgrade(upBest); acted = true;
      } else if (awBest) {
        gold -= sim.towerAwakenCost(awBest); cumSpent += sim.towerAwakenCost(awBest);
        sim.applyTowerAwaken(awBest); acted = true;
      }
    }

    // ③ 전투
    const comp = sim.buildWaveComposition(wave, rng);
    const mod = sim.waveModifier(wave, rng);
    const hpMult = sim.waveHpMultiplier(wave) * sim.difficultyHpMultiplier(grade);
    const goldMult = sim.waveGoldMultiplier(wave) * (mod?.goldFactor || 1);
    const spawnGap = sim.spawnIntervalMs(wave) / 1000;
    const modSpeed = mod?.speedFactor || 1;
    const queue = comp.map((type, i) => {
      const st = MONSTER_STATS[type] || MONSTER_STATS.normal;
      const elite = st.isBoss ? null : sim.eliteParams(wave, rng);
      const hp = Math.floor(st.hp * hpMult) * (elite ? elite.hp : 1);
      return { hp, maxHp: hp, speed: st.speed * (elite ? elite.speed : 1) * modSpeed,
        gold: Math.ceil(st.gold * goldMult) * (elite ? elite.gold : 1),
        spawnAt: i * spawnGap, pos: 0, alive: false, done: false };
    });

    const focusMult = sim.focusDamageMultiplier(focus);   // v8
    const tDps = towerDpsTotal() * focusMult;
    if ([10, 20, 30, 40, 50, 60, 70, 80].includes(wave))
      sample[wave] = { dps: Math.round(tDps), focus, awakens: towers.reduce((s, t) => s + (t.awaken || 0), 0) };

    const dt = 0.1;
    let t = 0, leaked = 0;
    while (queue.some((m) => !m.done) && t < WAVE_SIM_CAP_S) {
      t += dt;
      for (const m of queue) {
        if (!m.alive && !m.done && t >= m.spawnAt) m.alive = true;
        if (m.alive) {
          if (mod?.regenPctPerSec && m.hp < m.maxHp)
            m.hp = Math.min(m.maxHp, m.hp + m.maxHp * mod.regenPctPerSec * dt);
          m.pos += m.speed * SPEED_PX * dt * slowFactor();
          if (m.pos >= PATH_LEN) { m.alive = false; m.done = true; leaked++; castleHp -= sim.LEAK_DAMAGE; }
        }
      }
      if (castleHp <= 0) break;
      const aliveList = queue.filter((m) => m.alive);
      if (!aliveList.length) continue;
      const cover = Math.min(1, (aliveList.length * 2 * avgRange()) / PATH_LEN);
      const towerEff = towers.reduce(
        (s, tw) => s + sim.towerDps(tw) * Math.min(tw.splashTargets || 1, Math.max(1, aliveList.length)),
        0,
      ) * (mod?.towerDamageFactor || 1) * focusMult;
      const wizardEff =
        (wizardAutoDps(towerDpsTotal()) + WIZARD_SPELL_DPS) *
        Math.min(2, Math.max(1, aliveList.length)) * (mod?.wizardDamageFactor || 1);
      let dmg = (towerEff + wizardEff) * cover * dt;
      aliveList.sort((a, b) => b.pos - a.pos);
      for (const m of aliveList) {
        if (dmg <= 0) break;
        const applied = Math.min(m.hp, dmg);
        m.hp -= applied; dmg -= applied;
        if (m.hp <= 0) { m.alive = false; m.done = true; gold += m.gold; killGold += m.gold; }
      }
    }
    if (castleHp <= 0) { deathWave = wave; break; }
    if (leaked === 0) castleHp = Math.min(100, castleHp + sim.WAVE_CLEAR_HEAL);
  }

  return {
    survived: deathWave ? deathWave - 1 : MAX_WAVE,
    focus, answerGold, killGold, cumSpent, sample,
    awakens: towers.reduce((s, t) => s + (t.awaken || 0), 0),
  };
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function cell(grade, acc) {
  const runs = SEEDS.map((k) => runCell(grade, acc, grade * 1000 + Math.round(acc * 100) * 13 + k * 7919));
  const surv = runs.map((r) => r.survived);
  const rep = runs[Math.floor(runs.length / 2)];
  return {
    grade, acc, med: median(surv), min: Math.min(...surv), max: Math.max(...surv),
    focus: Math.round(runs.reduce((s, r) => s + r.focus, 0) / runs.length),
    answerShare: Math.round(
      (runs.reduce((s, r) => s + r.answerGold / Math.max(1, r.answerGold + r.killGold), 0) / runs.length) * 100,
    ),
    awakens: Math.round(runs.reduce((s, r) => s + r.awakens, 0) / runs.length),
    sample: rep.sample,
  };
}

// ⚠️ 키에 소수를 그대로 쓰면 1.0이 "1"로 굳어 grid["4|1.0"]이 undefined가 된다(실측).
const key = (g, a) => `${g}|${Math.round(a * 100)}`;
const grid = {};
for (const g of GRADES) for (const a of ACCS) grid[key(g, a)] = cell(g, a);

if (!GATE) {
  console.log(`정답률 스윕 — 학년×정답률, 시드 ${SEEDS.length}개 중앙값, MAX_WAVE=${MAX_WAVE}\n`);
  console.log("학년 |" + ACCS.map((a) => String(Math.round(a * 100)).padStart(5) + "%").join("") + "  ← 정답률");
  console.log("-".repeat(60));
  for (const g of GRADES) {
    console.log(
      `  ${g}  |` + ACCS.map((a) => String(grid[key(g, a)].med).padStart(6)).join(""),
    );
  }
  console.log("\n(칸 값 = 중앙값 생존 웨이브)");
  console.log("\n[4학년 상세]  정답률 | 생존(최소~최대) | 집중력 | 정답보상 수입비중 | 각성합");
  for (const a of ACCS) {
    const c = grid[key(4, a)];
    console.log(
      `  ${String(Math.round(a * 100)).padStart(4)}%  |  ${String(c.med).padStart(2)} (${c.min}~${c.max})  |  ${String(c.focus).padStart(2)}  |  ${String(c.answerShare).padStart(3)}%  |  ${c.awakens}`,
    );
  }
  const c80 = grid[key(4, 0.8)];
  console.log("\n[4학년 80% 곡선 표본]  웨이브 | 유효DPS | 집중력 | 각성합");
  for (const [w, s] of Object.entries(c80.sample))
    console.log(`  ${String(w).padStart(2)} | ${String(s.dps).padStart(7)} | ${String(s.focus).padStart(2)} | ${s.awakens}`);
}

// ---------- 게이트 ----------
let pass = true;
const say = (okv, msg) => { if (!okv) pass = false; console.log(`  ${okv ? "✅" : "❌"} ${msg}`); };

console.log("\n=== 학습→결과 연결 게이트 ===");

// ① 상위 구간에서도 정답률이 결과를 바꾸는가 (핵심)
for (const g of GRADES) {
  const lo = grid[key(g, 0.6)].med;
  const hi = grid[key(g, 0.9)].med;
  say(hi - lo >= 8, `${g}학년: 정답률 60%→${lo}웨이브, 90%→${hi}웨이브 (차이 ${hi - lo}, 기준 ≥8)`);
}

// ② 전체 스프레드가 단조에 가깝게 늘어나는가 (60~100% 구간)
for (const g of GRADES) {
  const xs = [0.6, 0.7, 0.8, 0.9, 1.0].map((a) => grid[key(g, a)].med);
  const drops = xs.slice(1).filter((v, i) => v < xs[i] - 3).length;
  say(drops === 0, `${g}학년 60→100% 단조성: ${xs.join(" → ")} (역전 ${drops}회 허용 0)`);
}

// ③ 못하는 아이를 더 때리지 않았는가 — 60%가 여전히 15웨이브 이상
for (const g of GRADES) {
  const v = grid[key(g, 0.6)].med;
  say(v >= 15, `${g}학년 60%봇 생존 ${v}웨이브 (하드월 방지 기준 ≥15)`);
}

// ④ 무한 압도 방지 — 100%도 언젠가는 뚫린다
for (const g of GRADES) {
  const v = grid[key(g, 1.0)].med;
  say(v < MAX_WAVE, `${g}학년 100%봇 생존 ${v}웨이브 (< ${MAX_WAVE}, 서바이벌 구조 유지)`);
}

// ⑤ 후반 경제에서 정답 보상이 여전히 의미 있는가
{
  const share = grid[key(4, 0.8)].answerShare;
  say(share >= 35, `4학년 80% 정답보상 수입비중 ${share}% (기준 ≥35%)`);
}

console.log(`\n${pass ? "✅ 학습→결과 게이트 PASS" : "❌ 학습→결과 게이트 FAIL"}`);
process.exit(pass ? 0 : 1);
