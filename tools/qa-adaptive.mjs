#!/usr/bin/env node
// tools/qa-adaptive.mjs — 적응형 출제와 풀이 힌트가 실제로 작동하는가
//
// v7 기준선(실측):
//   · 약점 유형 출제 빈도 = 균등 대비 정확히 1.0배 (가중 없음 — 완전 무작위 셔플)
//   · 웨이브 1~10 평균 t 1.892 → 21~30 평균 t 1.874 (난이도 램프 없음, 오히려 하락)
//   · 도형·문장제 힌트에 그 문제의 숫자가 등장하는 비율 0%
//     ("넓이 공식을 떠올려 보세요. 답: 42" — 정답 암기지 학습이 아니다)
//
// 사용: node tools/qa-adaptive.mjs

import * as selector from "../problemSelector.js";
import { classifyProblem, getSolutionHint } from "../learnLoop.js";
import { unitName, unitsOf } from "../problems/units.js";

const SEMS = ["3-1", "3-2", "4-1", "4-2", "5-1", "5-2", "6-1", "6-2"];
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log(`  ✅ ${m}`)) : (fail++, console.log(`  ❌ ${m}`)); };

const pools = {};
for (const s of SEMS) pools[s] = (await import(`../problems/grade${s}.js`)).default;

// 재현 가능한 난수
function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── ① 단원 태그 ──
console.log("\n[① 단원 태그]");
{
  let missing = 0, unknown = 0;
  const unknownCodes = new Set();
  for (const s of SEMS) {
    const known = new Set(unitsOf(s));
    for (const p of pools[s]) {
      if (!p.u) missing++;
      else if (!known.has(p.u)) { unknown++; unknownCodes.add(`${s}:${p.u}`); }
    }
  }
  const total = SEMS.reduce((a, s) => a + pools[s].length, 0);
  ok(missing === 0, `단원 태그 없는 문항 ${missing}개 / ${total}`);
  ok(unknown === 0, `이름표 없는 단원 코드 ${unknown}개${unknown ? " → " + [...unknownCodes].slice(0, 5).join(", ") : ""}`);
  // 학기별로 모든 단원이 실제 문항을 갖는가 (0문항 단원 = 커리큘럼 구멍)
  let emptyUnits = 0;
  const emptyList = [];
  for (const s of SEMS) {
    const have = new Set(pools[s].map((p) => p.u));
    for (const u of unitsOf(s)) if (!have.has(u)) { emptyUnits++; emptyList.push(`${s} ${unitName(s, u)}`); }
  }
  ok(emptyUnits === 0, `문항이 0개인 단원 ${emptyUnits}개${emptyUnits ? " → " + emptyList.join(", ") : ""}`);
}

// ── ② 난이도 램프 ──
console.log("\n[② 웨이브별 난이도 램프]");
{
  const avgT = (sem, waveFrom, waveTo, seed) => {
    const r = rng(seed);
    const pool = [...pools[sem]];
    let sum = 0, n = 0;
    for (let w = waveFrom; w <= waveTo; w++) {
      for (let rep = 0; rep < 30; rep++) {
        const picked = selector.pickProblem(pool, { wave: w, classify: classifyProblem, rand: r });
        if (picked) { sum += picked.problem.t || 2; n++; }
      }
    }
    return sum / n;
  };
  let worst = Infinity;
  for (const s of SEMS) {
    const early = avgT(s, 1, 10, 11);
    const late = avgT(s, 21, 30, 11);
    worst = Math.min(worst, late - early);
    console.log(`     ${s}: 웨이브1~10 t평균 ${early.toFixed(2)} → 21~30 ${late.toFixed(2)} (차이 ${(late - early).toFixed(2)})`);
  }
  ok(worst >= 0.8, `모든 학기에서 난이도 상승폭 ≥0.8 (최소 ${worst.toFixed(2)}, v7 기준선 0.0)`);
}

// ── ③ 약점 유형 우선 출제 ──
console.log("\n[③ 약점 유형 가중]");
{
  const sem = "5-1";
  const pool = pools[sem];
  // 이 학기에서 가장 흔한 유형 하나를 골라 "많이 틀린 유형"으로 지정한다
  const counts = {};
  for (const p of pool) { const t = classifyProblem(p.q); counts[t] = (counts[t] || 0) + 1; }
  const target = Object.entries(counts).sort((a, b) => b[1] - a[1])[2][0]; // 3번째로 흔한 유형
  const baseRate = counts[target] / pool.length;

  const share = (weights) => {
    const r = rng(777);
    const p2 = [...pool];
    let hit = 0, n = 0;
    for (let i = 0; i < 3000; i++) {
      const picked = selector.pickProblem(p2, { wave: 12, classify: classifyProblem, weakByType: weights, rand: r });
      if (!picked) break;
      if (classifyProblem(picked.problem.q) === target) hit++;
      n++;
    }
    return hit / n;
  };

  const plain = share({});
  // 그 유형만 100% 틀린 아이 (표본 20)
  const weak = selector.weaknessWeights({ [target]: { ok: 0, no: 20 } });
  const weighted = share(weak);
  const ratio = weighted / Math.max(1e-9, plain);
  console.log(`     대상 유형 "${target}" — 풀 구성비 ${(baseRate * 100).toFixed(1)}%`);
  console.log(`     가중 없음 ${(plain * 100).toFixed(1)}% → 약점 지정 ${(weighted * 100).toFixed(1)}% (${ratio.toFixed(2)}배)`);
  ok(ratio >= 1.5, `약점 유형 출제 빈도 ${ratio.toFixed(2)}배 (기준 ≥1.5, v7 기준선 1.00배)`);
  ok(weak[target] === selector.WEAK_WEIGHT_MAX, `오답률 100% 유형 가중치 ${weak[target]} (상한 ${selector.WEAK_WEIGHT_MAX})`);

  // 표본이 얇으면 판단하지 않는다 (두 번 틀렸다고 그 유형만 쏟아지면 안 된다)
  const thin = selector.weaknessWeights({ [target]: { ok: 0, no: 2 } });
  ok(Object.keys(thin).length === 0, `표본 2문제로는 약점 판정 안 함 (성급한 편중 방지)`);
}

// ── ④ 단원 편중 방지 ──
console.log("\n[④ 단원 편중 방지]");
{
  const r = rng(2024);
  const pool = [...pools["6-1"]];
  const recent = [];
  const seq = [];
  for (let i = 0; i < 600; i++) {
    const picked = selector.pickProblem(pool, {
      wave: 15, classify: classifyProblem, recentUnits: recent, rand: r,
    });
    if (!picked) break;
    const u = picked.problem.u;
    seq.push(u);
    recent.push(u);
    if (recent.length > 6) recent.shift();
  }
  let maxRun = 1, run = 1;
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] === seq[i - 1]) { run++; maxRun = Math.max(maxRun, run); } else run = 1;
  }
  ok(maxRun <= 4, `같은 단원 최대 연속 ${maxRun}회 (기준 ≤4)`);
  const distinct = new Set(seq).size;
  ok(distinct >= 5, `600문제에서 등장한 단원 ${distinct}종 (한 단원만 나오지 않는다)`);
}

// ── ⑤ 풀이 힌트: 숫자 대입 ──
console.log("\n[⑤ 풀이 힌트에 그 문제의 숫자가 나오는가]");
{
  let hard = 0, withNum = 0;
  const misses = [];
  for (const s of SEMS) {
    for (const p of pools[s]) {
      if ((p.t || 2) < 3) continue;         // 도형·측정(3)·문장제(4)만
      hard++;
      const hint = getSolutionHint(p.q, p.a);
      const qNums = (p.q.match(/\d+(?:\.\d+)?/g) || []);
      // 정답 숫자는 빼고, 문제의 숫자가 힌트 계산식에 등장하는가
      const used = qNums.filter((x) => x !== String(p.a) && hint.includes(x));
      if (used.length >= 1) withNum++;
      else if (misses.length < 3) misses.push(`${p.q} → ${hint}`);
    }
  }
  const rate = (withNum / hard) * 100;
  console.log(`     t3·t4 문항 ${hard}개 중 ${withNum}개에 문제의 숫자가 들어간 계산식`);
  if (misses.length) console.log(`     예시(미포함): ${misses[0]}`);
  ok(rate >= 80, `숫자 대입 힌트 비율 ${rate.toFixed(1)}% (기준 ≥80%, v7 기준선 0%)`);
}

// ── ⑥ 풀이 힌트가 거짓말을 하지 않는가 ──
console.log("\n[⑥ 힌트 계산식의 정확성]");
{
  // 힌트에 계산식이 들어 있으면 실제로 계산해 정답과 맞는지 확인한다.
  // v7에는 "33 + 15 ÷ 3"에 "33 + 15: 더하면 38!"이라 답하는 버그가 있었다(33+15=48).
  // 아이가 그걸 믿으면 틀린 계산법을 배운다. 힌트는 틀릴 바에 없는 게 낫다.
  const evalExpr = (expr) => {
    const e = expr.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").trim();
    if (!/^[\d\s+\-*/().]+$/.test(e)) return null;   // 숫자·사칙연산·괄호만
    try { return Function(`"use strict";return (${e});`)(); } catch { return null; }
  };

  let checked = 0, wrong = 0;
  const wrongs = [];
  for (const sem of SEMS) {
    for (const p of pools[sem]) {
      const hint = getSolutionHint(p.q, p.a);

      // (a) "x + y: … 더하면 z!" 꼴 (기존 이항 연산 힌트)
      const m1 = hint.match(/^(\d+(?:\.\d+)?) ([+\-×÷]) (\d+(?:\.\d+)?): .*?(\d+(?:\.\d+)?)!$/);
      if (m1) {
        checked++;
        const v = evalExpr(`${m1[1]} ${m1[2]} ${m1[3]}`);
        if (v === null || Math.abs(v - Number(m1[4])) > 1e-6) {
          wrong++;
          if (wrongs.length < 3) wrongs.push(`${p.q} → ${hint}`);
        }
        continue;
      }

      // (b) "… = <식> = <답>" 꼴 (v8 숫자 대입 힌트)
      const m2 = hint.match(/=\s*([\d\s+\-×÷*/().−]+?)\s*=\s*([\d.]+)\s*[가-힣]*$/);
      if (m2) {
        const v = evalExpr(m2[1]);
        const stated = Number(m2[2]);
        if (v === null || !isFinite(stated)) continue;
        checked++;
        // 원주율 3.14 계산은 반올림 때문에 끝자리가 다를 수 있어 0.011까지 허용
        if (Math.abs(v - stated) > 0.011) {
          wrong++;
          if (wrongs.length < 3) wrongs.push(`${p.q} → ${hint} (식 값 ${v}, 말한 값 ${stated})`);
        }
      }
    }
  }
  console.log(`     계산식이 들어간 힌트 ${checked}개 검산`);
  ok(wrong === 0, `계산이 틀린 힌트 ${wrong}개${wrong ? " → " + wrongs.join(" / ") : ""}`);
  ok(checked > 1000, `검산 표본 ${checked}개 (적으면 헛검사)`);
}

// ── ⑦ 힌트가 문제와 무관한 소리를 하지 않는가 ──
console.log("\n[⑦ 엉뚱한 힌트]");
{
  // 2026-08-12 Gemini 교차검증 → 코드로 확인: `q.includes("분")`이 **"분수"**에 걸려서
  // "1/2와 1/6 중 더 큰 분수는?"에 "1시간 = 60분, 1분 = 60초!"라고 답하고 있었다(186문항).
  // 아이 입장에서는 도와주는 척하며 상관없는 소리를 하는 것이라 없느니만 못하다.
  let nonsense = 0;
  const cases = [];
  for (const sem of SEMS) {
    for (const p of pools[sem]) {
      const hint = getSolutionHint(p.q, p.a);
      const timeHint = /1시간 = 60분|1분 = 60초/.test(hint);
      const lenHint = /1m = 100cm/.test(hint);
      const volHint = /1L = 1000mL/.test(hint);
      const wtHint = /1kg = 1000g/.test(hint);
      // 문제에 그 단위가 없는데 그 단위 힌트가 나오면 엉뚱한 것이다
      const bad =
        (timeHint && !/시간|분|초/.test(p.q.replace(/분수|분모|분자/g, ""))) ||
        (lenHint && !/cm|m\b|미터/.test(p.q)) ||
        (volHint && !/mL|L\b|들이/.test(p.q)) ||
        (wtHint && !/kg|g\b|무게/.test(p.q));
      if (bad) { nonsense++; if (cases.length < 3) cases.push(`${p.q} → ${hint}`); }
    }
  }
  ok(nonsense === 0, `문제와 무관한 단위 힌트 ${nonsense}건${nonsense ? " → " + cases[0] : ""}`);

  // 분수·비율 정답에는 계산식 힌트를 만들지 않는다("1/2"를 12로 읽어 엉뚱한 식이 통과한다)
  let fracCalc = 0;
  const fracCases = [];
  for (const sem of SEMS) {
    for (const p of pools[sem]) {
      if (!/[/:]/.test(String(p.a))) continue;
      const hint = getSolutionHint(p.q, p.a);
      if (/=\s*[\d\s+\-×÷().]+\s*=\s*\d/.test(hint)) {
        fracCalc++;
        if (fracCases.length < 3) fracCases.push(`${p.q} [답 ${p.a}] → ${hint}`);
      }
    }
  }
  ok(fracCalc === 0, `분수·비율 정답에 붙은 계산식 힌트 ${fracCalc}건${fracCalc ? " → " + fracCases[0] : ""}`);
}

console.log(`\n${"=".repeat(60)}\n통과 ${pass} · 실패 ${fail}`);
process.exit(fail > 0 ? 1 : 0);
