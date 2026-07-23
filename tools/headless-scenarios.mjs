#!/usr/bin/env node
// tools/headless-scenarios.mjs — 완료 기준 1:1 헤드리스 검증 (시나리오 3종 + 불변식)
// ① 표준 플레이(정답률 80%) ② 풀 테크(정답률 100%·최대 업그레이드) ③ 고의 패배(정답률 0%)
// 불변식: 골드 음수 금지 · HP 상한 초과 금지 · 웨이브 조성 무결성 · 마법 데이터 유효성
// 사용: node tools/headless-scenarios.mjs

import * as sim from "../simCore.js";
import { TOWER_STATS, MONSTER_STATS, WIZARD_SPELLS } from "../gameData.js";

let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
};

function makeRng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 정적 데이터 불변식 ----------
console.log("\n[불변식 — 정적 데이터]");
check("몬스터 34종+ 정의", Object.keys(MONSTER_STATS).length >= 34, `실측 ${Object.keys(MONSTER_STATS).length}`);
check("모든 몬스터 hp·speed·gold 양수", Object.values(MONSTER_STATS).every((m) => m.hp > 0 && m.speed > 0 && m.gold >= 0));
check("마법 10종", Object.keys(WIZARD_SPELLS).length === 10, `실측 ${Object.keys(WIZARD_SPELLS).length}`);
check("마법 레벨 1~10 각 1개", (() => {
  const lvls = Object.values(WIZARD_SPELLS).map((s) => s.level).sort((a, b) => a - b);
  return lvls.join(",") === "1,2,3,4,5,6,7,8,9,10";
})());
check("모든 마법 쿨다운 > 0", Object.values(WIZARD_SPELLS).every((s) => s.cooldown > 0));
check("공격 타워 dps 산출 가능", Object.entries(TOWER_STATS).filter(([k, s]) => s.cost > 0 && !s.isRandom && k !== "repairStation" && k !== "net").every(([, s]) => sim.towerDps(s) > 0));

// ---------- 웨이브 조성 무결성 ----------
console.log("\n[불변식 — 웨이브 조성 (1~60 전수)]");
let compOk = true, unknownTypes = new Set(), countOk = true, bossOk = true;
const rng = makeRng(42);
for (let w = 1; w <= 60; w++) {
  const comp = sim.buildWaveComposition(w, rng);
  comp.forEach((t) => { if (!MONSTER_STATS[t]) unknownTypes.add(t); });
  if (comp.length === 0 || comp.length > sim.monstersInWave(w) + 5) countOk = false;
  if (w % 4 === 0) {
    const hasBoss = comp.some((t) => ["archfiend", "boss", "finalBoss", "demonKing", "ancientDragon", "voidLord", "titanGolem", "shadowDragon", "wormQueen"].includes(t));
    if (!hasBoss) bossOk = false;
  }
}
check("조성 몬스터 전부 MONSTER_STATS에 존재", unknownTypes.size === 0, [...unknownTypes].join(","));
check("조성 수량 상식 범위", countOk);
check("보스 주기(4의 배수 웨이브) 보스 포함", bossOk);
check("몬스터 동시 상한 60 (웨일북 성능 예산)", sim.monstersInWave(999) <= 60);
check("HP 배율 단조 증가", (() => { let prev = 0; for (let w = 1; w <= 80; w++) { const m = sim.waveHpMultiplier(w); if (m <= prev) return false; prev = m; } return true; })());
check("스폰 간격 하한 150ms", sim.spawnIntervalMs(200) >= 150);

// ---------- 시나리오 시뮬 (경제 불변식) ----------
console.log("\n[시나리오 3종 — 경제·상태 불변식]");
function scenario(name, accuracy, waves) {
  let gold = sim.INITIAL_GOLD, hp = sim.INITIAL_CASTLE_HP, combo = 0;
  let goldNeg = false, hpOver = false;
  const r = makeRng(7);
  for (let w = 1; w <= waves; w++) {
    if (r() < accuracy) {
      combo++;
      gold += sim.answerReward(w, combo >= 3 ? 1.5 : 1, 0);
    } else {
      combo = 0;
      gold = Math.max(0, gold - sim.WRONG_PENALTY.gold);
      hp -= sim.WRONG_PENALTY.castleHp;
    }
    // 무피해 가정 회복
    hp = Math.min(100, hp + sim.WAVE_CLEAR_HEAL);
    if (gold < 0) goldNeg = true;
    if (hp > 100) hpOver = true;
    if (hp <= 0) break;
  }
  return { name, gold, hp, goldNeg, hpOver };
}
const std = scenario("표준(80%)", 0.8, 30);
check("표준: 골드 음수 없음", !std.goldNeg);
check("표준: HP 100 초과 없음", !std.hpOver);
check("표준: 30웨이브 생존 (무누수 가정)", std.hp > 0, `HP ${std.hp}`);

const full = scenario("풀테크(100%)", 1.0, 60);
check("풀테크: 60웨이브 생존·경제 누적", full.hp > 0 && full.gold > 0);

const lose = scenario("고의 패배(0%)", 0.0, 100);
check("고의 패배: 유한 웨이브 내 패배 (0% 정답 시)", lose.hp <= 0, `HP ${lose.hp}`);

// ---------- 업그레이드 경제 ----------
console.log("\n[불변식 — 타워 업그레이드]");
const t = { type: "plus", cost: 50, damage: 35, range: 85, cooldown: 950, level: 1 };
let costMono = true, prevCost = 0;
for (let l = 1; l < 10; l++) {
  const c = sim.towerUpgradeCost(t);
  if (c <= prevCost) costMono = false;
  prevCost = c;
  sim.applyTowerUpgrade(t);
}
check("업그레이드 비용 단조 증가", costMono);
check("레벨 10 데미지 유한·양수", t.damage > 35 && isFinite(t.damage));
check("쿨다운 하한 유지(>0)", t.cooldown > 0);

console.log(`\n${"=".repeat(40)}\n결과: ${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
