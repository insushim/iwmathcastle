#!/usr/bin/env node
// tools/problem-validator.mjs
// v6: 학년-학기별 문제 독립 검증기 — 생성기와 별개 로직으로 전수 검사
// 검사: ① 산술식 답 재계산 ② 학기 이탈(금지 단원 키워드) ③ 학기별 자릿수·연산 규칙
//       ④ 비정수 나눗셈 ⑤ 조사 오류 ⑥ 중복 ⑦ 답 0·음수 ⑧ 오답 선택지 품질(3개 보장)
//       ⑨ 정답 위치 분포 시뮬레이션(런타임 셔플 등가, 25%±2%)
// 사용: node tools/problem-validator.mjs
// 종료 코드: 오류 있으면 1 (배포 게이트)

import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEMESTERS = ["3-1", "3-2", "4-1", "4-2", "5-1", "5-2", "6-1", "6-2"];

// ---------- 유틸 (생성기와 독립 구현) ----------
const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));
function parseFrac(s) {
  const m = String(s).match(/^(\d+)\/(\d+)$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}
function fracEq(n, d, ans) {
  const f = parseFrac(ans);
  if (f) return n * f[1] === f[0] * d;
  return d !== 0 && n % d === 0 && String(n / d) === String(ans);
}
function hasBatchim(ch) {
  const c = ch.charCodeAt(0);
  if (c < 0xac00 || c > 0xd7a3) return null;
  return (c - 0xac00) % 28 > 0;
}

// ---------- 학기 이탈 검사 (해당 학기 "초과/이전" 개념 키워드) ----------
const FORBIDDEN = {
  "3-1": [/%|할인|백분율/, /최대공약수|최소공배수|약수|배수/, /넓이|둘레/, /부피|겉넓이/, /평균/, /시속|속력/, /기약분수|통분/, /비율|비례/, /나머지|몫/, /가분수|대분수|진분수/, /mL|kg|(\d)g\b/, /°|각도/, /올림|버림|반올림/],
  "3-2": [/%|할인|백분율/, /최대공약수|최소공배수|약수|배수/, /넓이|둘레/, /부피|겉넓이/, /평균/, /시속|속력/, /기약분수|통분/, /비율|비례/, /°|각도/, /올림|버림|반올림/],
  "4-1": [/%|할인|백분율/, /최대공약수|최소공배수/, /넓이|둘레/, /부피|겉넓이/, /평균/, /시속|속력/, /기약분수|통분/, /비율|비례/, /올림|버림|반올림/, /가분수|대분수/],
  "4-2": [/%|할인|백분율/, /최대공약수|최소공배수/, /넓이|둘레/, /부피|겉넓이/, /평균/, /시속|속력/, /기약분수|통분/, /비율|비례/, /°|각도/, /올림|버림|반올림/],
  "5-1": [/%|할인|백분율/, /부피|겉넓이/, /평균/, /시속|속력/, /비율|비례|간단한 비/, /원주|원의 넓이/, /올림|버림|반올림/, /모서리|꼭짓점/],
  "5-2": [/%|할인|백분율/, /부피|겉넓이/, /시속|속력/, /비율|비례|간단한 비/, /원주|원의 넓이/, /(?<!의 )넓이|둘레/, /최대공약수|최소공배수/],
  "6-1": [/할인/, /비례식|비례배분|:.*=.*:|나누면 큰 쪽/, /원주|원의 넓이/, /시속|속력/, /올림|버림|반올림/, /평균/],
  "6-2": [/확률/],
};

// ---------- 학기별 자릿수·연산 규칙 (순수 산술식만) ----------
function digitRuleViolation(sem, q) {
  const m = q.match(/^(\d+(?:\.\d+)?)\s*([+\-×÷])\s*(\d+(?:\.\d+)?)$/);
  const fm = q.match(/^(\d+)\/(\d+)\s*([+\-×÷])\s*(\d+)\/(\d+)$/);
  const grade = Number(sem[0]);
  if (fm) {
    const [, , d1, op, , d2] = fm;
    if (grade === 3) return "3학년 분수 사칙연산 금지";
    if (sem === "4-1") return "4-1 분수 연산 금지 (분수 ±는 4-2)";
    if (sem === "4-2" && d1 !== d2) return "4-2는 동분모 분수만";
    if (grade === 4 && (op === "×" || op === "÷")) return "4학년 분수 곱셈·나눗셈 금지";
    if (grade === 5 && op === "÷") return "5학년 분수 나눗셈 금지 (6-1)";
    if (sem === "5-1" && op === "×") return "5-1 분수 곱셈 금지 (5-2)";
    return null;
  }
  if (!m) return null;
  const [, as, op, bs] = m;
  const isDec = as.includes(".") || bs.includes(".");
  const ai = as.split(".")[0].length, bi = bs.split(".")[0].length;
  if (grade === 3) {
    if (isDec) return "3학년 소수 연산 금지";
    if ((op === "+" || op === "-") && (ai > 3 || bi > 3)) return "3학년 ±는 세 자리까지";
    if (sem === "3-1") {
      if (op === "×" && !(ai <= 2 && bi === 1)) return "3-1 곱셈은 (두 자리)×(한 자리)";
      if (op === "÷" && (ai > 2 || bi > 1)) return "3-1 나눗셈은 (두 자리)÷(한 자리)";
    } else {
      if (op === "×" && !((ai <= 2 && bi <= 2) || (ai <= 3 && bi === 1) || (ai === 1 && bi <= 3))) return "3-2 곱셈 범위 초과";
      if (op === "÷" && (ai > 2 || bi > 1)) return "3학년 나눗셈은 (두 자리)÷(한 자리)";
    }
  }
  if (grade === 4) {
    if (sem === "4-1" && isDec) return "4-1 소수 연산 금지 (소수 ±는 4-2)";
    if (isDec && (op === "×" || op === "÷")) return "4학년 소수 곱셈·나눗셈 금지";
    if (op === "÷" && !isDec && bi > 2) return "4학년 나눗셈 제수는 두 자리까지";
    if (sem === "4-2" && !isDec && op === "×" && ai > 2 && bi > 1) return "4-2 (세 자리)×(두 자리)는 4-1 범위";
  }
  if (grade === 5) {
    if (op === "÷" && isDec) return "5학년 소수 나눗셈 금지 (6학년)";
    if (sem === "5-1" && isDec && (op === "×" || op === "÷")) return "5-1 소수 곱셈 금지 (5-2)";
  }
  if (sem === "6-1") {
    if (op === "÷" && bs.includes(".")) return "6-1은 소수÷자연수까지 (소수÷소수는 6-2)";
  }
  return null;
}

// ---------- 산술 평가 ----------
function evalArith(expr) {
  const clean = expr.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").trim();
  if (!/^[\d+\-*/().\s]+$/.test(clean)) return null;
  try {
    const v = Function(`"use strict"; return (${clean});`)();
    return typeof v === "number" && isFinite(v) ? v : null;
  } catch { return null; }
}
function evalFracExpr(q) {
  const m = q.match(/^(\d+)(?:\/(\d+))?\s*([+\-×÷])\s*(\d+)(?:\/(\d+))?$/);
  if (!m) return null;
  const [, n1, d1r, op, n2, d2r] = m;
  const d1 = d1r ? Number(d1r) : 1, d2 = d2r ? Number(d2r) : 1;
  if (!d1r && !d2r) return null;
  const a = Number(n1), b = Number(n2);
  let n, d;
  if (op === "+") { n = a * d2 + b * d1; d = d1 * d2; }
  else if (op === "-") { n = a * d2 - b * d1; d = d1 * d2; }
  else if (op === "×") { n = a * b; d = d1 * d2; }
  else { n = a * d2; d = d1 * b; }
  return [n, d];
}
function evalDecExpr(q) {
  const m = q.match(/^([\d.]+)\s*([+\-×÷])\s*([\d.]+)$/);
  if (!m) return null;
  const [, as, op, bs] = m;
  if (!as.includes(".") && !bs.includes(".")) return null;
  const decA = (as.split(".")[1] || "").length, decB = (bs.split(".")[1] || "").length;
  const A = Math.round(Number(as) * 10 ** decA), B = Math.round(Number(bs) * 10 ** decB);
  if (op === "+" || op === "-") {
    const sc = Math.max(decA, decB);
    const a2 = A * 10 ** (sc - decA), b2 = B * 10 ** (sc - decB);
    return [op === "+" ? a2 + b2 : a2 - b2, sc];
  }
  if (op === "×") return [A * B, decA + decB];
  const val = Number(as) / Number(bs);
  return ["div", val];
}
function decEq(scaled, sc, ans) {
  if (scaled === "div") return Math.abs(Number(ans) - sc) < 1e-9;
  const ansDec = (String(ans).split(".")[1] || "").length;
  const ansScaled = Math.round(Number(ans) * 10 ** ansDec);
  return ansScaled * 10 ** (sc - Math.min(sc, ansDec)) === scaled * 10 ** Math.max(0, ansDec - sc);
}

// ---------- v7 게이트: 찍기 취약성 ----------
// 정답이 4지선다에서 "가운데 2개"에 몰리면 계산 없이 최대·최소만 버려도 맞는다.
// 구버전 실측 91.2%(→ 찍기 승률 45.6%). 균등하면 50%(→ 25%).
const MID_GATE = 60;          // 학기별 상한 (%)
const rankCount = [0, 0, 0, 0];
const orderVal = (s) => {
  const t = String(s);
  if (/^\d+\/\d+$/.test(t)) { const [n, d] = t.split("/").map(Number); return d ? n / d : null; }
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  return null;
};

// ---------- v7 게이트: 명사 뒤 조사 ----------
// 기존 조사 검사는 "숫자 뒤"만 봐서 `모서리은` 18문항을 놓쳤다(감사 실측).
const NOUN_JOSA = ["면", "모서리", "꼭짓점", "대각선", "개수", "넓이", "둘레", "부피", "겉넓이", "원주", "몫", "나머지", "평균", "이름", "지름", "반지름"];
function nounJosaError(q) {
  for (const n of NOUN_JOSA) {
    const bat = (() => { const c = n[n.length - 1].charCodeAt(0); return c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 > 0 : null; })();
    if (bat === null) continue;
    for (const [wb, nb] of [["은", "는"], ["이", "가"], ["을", "를"]]) {
      const wrong = bat ? nb : wb;
      const idx = q.indexOf(n + wrong);
      if (idx === -1) continue;
      const after = q[idx + n.length + 1] || " ";
      if (!/[가-힣]/.test(after)) return `${n}${wrong} → ${n}${bat ? wb : nb}`;
    }
  }
  return null;
}

// ---------- 검증 ----------
let totalErr = 0;
let grandTotal = 0;
const positionCount = [0, 0, 0, 0];
const wordProblemCount = {};
// 시드 RNG — 정답 위치 분포 시뮬레이션(런타임 shuffleArray 등가)
let seed = 777;
function rnd() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

for (const sem of SEMESTERS) {
  const list = (await import(join(ROOT, "problems", `grade${sem}.js`))).default;
  grandTotal += list.length;
  const errs = { 답오류: [], 학기이탈: [], 자릿수규칙: [], 비정수나눗셈: [], 조사: [], 명사조사: [], 중복: [], 답범위: [], 선택지부족: [], 시간등급: [], 오답과다: [] };
  const seen = new Set();
  const semRank = [0, 0, 0, 0];
  wordProblemCount[sem] = 0;

  for (const p of list) {
    const { q, a, d, t } = p;
    if (seen.has(q)) errs.중복.push(q); else seen.add(q);

    // 시간등급 존재
    if (![1, 2, 3, 4].includes(t)) errs.시간등급.push(q);

    // 답 0·음수 (분수·비율·텍스트 제외)
    if (!a.includes("/") && !a.includes(":") && !/[가-힣]/.test(a)) {
      const n = Number(a);
      if (!isFinite(n) || n <= 0) errs.답범위.push(`${q} = ${a}`);
    }

    // 학기 이탈
    for (const re of FORBIDDEN[sem] || []) {
      if (re.test(q)) { errs.학기이탈.push(`${q} [${re}]`); break; }
    }

    if (t === 4) wordProblemCount[sem]++;

    // 선택지 품질: 정답과 다른 유효 오답 최소 2개(런타임 폴백 1개까지 허용)
    const uniq = new Set((d || []).map(String).filter((x) => x !== String(a)));
    if (uniq.size < 2 && !/[가-힣]/.test(a)) errs.선택지부족.push(`${q} (오답 ${uniq.size}개)`);
    // v7: 오답을 4개 이상 담으면 런타임이 무작위 3개만 뽑아 순위 통제가 무너진다
    if (uniq.size > 3) errs.오답과다.push(`${q} (오답 ${uniq.size}개 — main.js가 3개만 씀)`);

    // v7: 명사 뒤 조사 (숫자 뒤 조사 검사가 못 잡는 구간)
    const nj = nounJosaError(q);
    if (nj) errs.명사조사.push(`${q} — ${nj}`);

    // v7: 정답의 크기 순위 집계 (찍기 취약성 게이트)
    {
      const av = orderVal(a);
      const ds = (d || []).map(orderVal);
      if (av !== null && ds.length === 3 && ds.every((v) => v !== null)) {
        semRank[ds.filter((v) => v < av).length]++;
      }
    }

    // 조사 오류
    const josaM = [...q.matchAll(/(\d)([가-힣])?(와|과|을|를|이(?=\s)|가(?=\s))(?=[\s,])/g)];
    for (const [, digit, unit, j] of josaM) {
      const bat = unit != null
        ? hasBatchim(unit)
        : { 0: true, 1: true, 2: false, 3: true, 4: false, 5: false, 6: true, 7: true, 8: true, 9: false }[digit];
      if (bat === null || bat === undefined) continue;
      const wrong = (j === "와" && bat) || (j === "과" && !bat) || (j === "을" && !bat) || (j === "를" && bat) || (j === "이" && !bat) || (j === "가" && bat);
      if (wrong) { errs.조사.push(q); break; }
    }

    // 자릿수·연산 규칙
    const dv = digitRuleViolation(sem, q);
    if (dv) errs.자릿수규칙.push(`${q} — ${dv}`);

    // 답 재계산: 순수 산술식
    const pureQ = q.replace(/의 (몫|나머지)은\?$/, "").replace(/\s*=\s*\?$/, "").trim();
    if (/^[\d+\-×÷*/().\s]+$/.test(pureQ) && !q.includes("몫") && !q.includes("나머지")) {
      const fr = evalFracExpr(pureQ);
      if (fr) {
        if (!fracEq(fr[0], fr[1], a)) errs.답오류.push(`${q} → 계산값 ${fr[0]}/${fr[1]}, 데이터 ${a}`);
      } else {
        const de = evalDecExpr(pureQ);
        if (de) {
          if (!decEq(de[0], de[1], a)) errs.답오류.push(`${q} → 데이터 ${a}`);
        } else {
          const v = evalArith(pureQ);
          if (v !== null) {
            if (pureQ.includes("÷") || pureQ.includes("/")) {
              if (!Number.isInteger(v)) { errs.비정수나눗셈.push(`${q} = ${v}`); continue; }
            }
            if (Math.abs(v - Number(a)) > 1e-9) errs.답오류.push(`${q} → 계산값 ${v}, 데이터 ${a}`);
          }
        }
      }
    }
    // 몫/나머지 재계산
    const qm = q.match(/^(\d+)\s*÷\s*(\d+)의 (몫|나머지)은\?$/);
    if (qm) {
      const [, A, B, kind] = qm;
      const expect = kind === "몫" ? Math.floor(A / B) : A % B;
      if (Number(a) !== expect) errs.답오류.push(`${q} → 계산값 ${expect}, 데이터 ${a}`);
    }

    // 정답 위치 분포 시뮬레이션 (런타임: [정답, 오답3] Fisher-Yates 셔플)
    {
      const opts = [0, 1, 2, 3];
      for (let i = opts.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [opts[i], opts[j]] = [opts[j], opts[i]];
      }
      positionCount[opts.indexOf(0)]++;
    }
  }

  let total = Object.values(errs).reduce((s, l) => s + l.length, 0);
  const rTot = semRank.reduce((x, y) => x + y, 0) || 1;
  const midPct = ((semRank[1] + semRank[2]) / rTot) * 100;
  semRank.forEach((v, i) => { rankCount[i] += v; });
  const midOk = midPct <= MID_GATE;
  if (!midOk) total++;
  totalErr += total;
  console.log(`\n=== ${sem} (${list.length}문제) — 오류 ${total}건 · 정답이 가운데 2개: ${midPct.toFixed(1)}% ${midOk ? "✅" : `❌ (${MID_GATE}% 초과 — 찍기로 뚫림)`} ===`);
  for (const [k, v] of Object.entries(errs)) {
    if (v.length) {
      console.log(`  ${k}: ${v.length}건`);
      v.slice(0, 8).forEach((e) => console.log(`    · ${e}`));
    }
  }
}

// 정답 위치 분포 게이트 (25% ± 2%p)
console.log(`\n[정답 위치 분포 — 런타임 셔플 시뮬레이션, n=${grandTotal}]`);
let posFail = false;
positionCount.forEach((c, i) => {
  const pct = (c / grandTotal) * 100;
  const ok = pct >= 23 && pct <= 27;
  if (!ok) posFail = true;
  console.log(`  ${i + 1}번 위치: ${pct.toFixed(1)}% ${ok ? "✅" : "❌ (25%±2%p 이탈)"}`);
});
if (posFail) totalErr++;

// v7 게이트: 정답 크기 순위 분포 (균등하면 각 25%)
const rkTot = rankCount.reduce((a, b) => a + b, 0) || 1;
const midAll = ((rankCount[1] + rankCount[2]) / rkTot) * 100;
console.log(`\n[정답 크기 순위 분포 — 찍기 취약성, n=${rkTot}]`);
rankCount.forEach((c, i) => console.log(`  ${i + 1}위(작은쪽부터): ${((c / rkTot) * 100).toFixed(1)}%`));
console.log(`  → 가운데 2개에 정답: ${midAll.toFixed(1)}% (균등 50%) · "가운데 찍기" 기대 승률 ${(midAll / 2).toFixed(1)}%`);
if (midAll > 55) { console.log(`  ❌ 55% 초과 — 계산 없이 찍어도 ${(midAll / 2).toFixed(1)}% 맞음`); totalErr++; }
else console.log("  ✅");

// v7 게이트: 모든 학기에 문장제가 있어야 한다 (구버전은 1학기 4개가 0문항)
console.log(`\n[문장제(t=4) 커버리지]`);
let wpFail = false;
for (const sem of SEMESTERS) {
  const n = wordProblemCount[sem] || 0;
  const ok = n >= 100;
  if (!ok) wpFail = true;
  console.log(`  ${sem}: ${String(n).padStart(4)}문항 ${ok ? "✅" : "❌ (최소 100문항)"}`);
}
if (wpFail) totalErr++;

console.log(`\n${"=".repeat(50)}\n[학기 데이터 게이트] 총 ${grandTotal}문항 · 오류 ${totalErr}건`);
process.exit(totalErr > 0 ? 1 : 0);
