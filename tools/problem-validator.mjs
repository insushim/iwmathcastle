#!/usr/bin/env node
// tools/problem-validator.mjs
// 학년별 문제 독립 검증기 — 생성기와 별개 로직으로 전수 검사 (docs/curriculum-map.md 기준)
// 검사: ① 산술식 답 재계산 ② 학년 금지 키워드 ③ 자릿수 규칙 ④ 비정수 나눗셈 ⑤ 조사 오류 ⑥ 중복 ⑦ 답 0·음수
// 사용: node tools/problem-validator.mjs [--old]  (--old = 구 problems.js 진단 리포트)

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OLD_MODE = process.argv.includes("--old");

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

// 금지 키워드 (학년별 — 해당 학년 "초과" 개념)
const FORBIDDEN = {
  3: [/%|할인|백분율/, /최대공약수|최소공배수|약수|배수/, /넓이|둘레(?!레)/, /부피|겉넓이/, /확률/, /소수/, /평균/, /시속|속력/, /기약분수|통분/, /비율|비례/],
  4: [/%|할인|백분율/, /최대공약수|최소공배수/, /넓이|둘레/, /부피|겉넓이/, /확률/, /평균/, /시속|속력/, /기약분수|통분/, /비율|비례/],
  5: [/%|할인|백분율/, /부피|겉넓이/, /확률/, /시속|속력/, /비율|비례|가장 간단한 비/, /원주/],
  6: [/확률/],
};

// 산술식 안전 평가 (사칙+괄호만)
function evalArith(expr) {
  const clean = expr.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").trim();
  if (!/^[\d+\-*/().\s]+$/.test(clean)) return null;
  try {
    const v = Function(`"use strict"; return (${clean});`)();
    return typeof v === "number" && isFinite(v) ? v : null;
  } catch { return null; }
}

// 분수식 평가: "a/b op c/d" | "w ÷ a/b" | "a/b op c/d" (op: + - × ÷)
function evalFracExpr(q) {
  const m = q.match(/^(\d+)(?:\/(\d+))?\s*([+\-×÷])\s*(\d+)(?:\/(\d+))?$/);
  if (!m) return null;
  const [, n1, d1r, op, n2, d2r] = m;
  const d1 = d1r ? Number(d1r) : 1, d2 = d2r ? Number(d2r) : 1;
  if (!d1r && !d2r) return null; // 정수식은 evalArith가 담당
  const a = Number(n1), b = Number(n2);
  let n, d;
  if (op === "+") { n = a * d2 + b * d1; d = d1 * d2; }
  else if (op === "-") { n = a * d2 - b * d1; d = d1 * d2; }
  else if (op === "×") { n = a * b; d = d1 * d2; }
  else { n = a * d2; d = d1 * b; }
  return [n, d];
}

// 소수식 평가 (부동소수점 회피 — 정수 스케일)
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
  // ÷: 값으로 비교
  const val = Number(as) / Number(bs);
  return ["div", val];
}
function decEq(scaled, sc, ans) {
  if (scaled === "div") return Math.abs(Number(ans) - sc) < 1e-9;
  const ansDec = (String(ans).split(".")[1] || "").length;
  const ansScaled = Math.round(Number(ans) * 10 ** ansDec);
  return ansScaled * 10 ** (sc - Math.min(sc, ansDec)) === scaled * 10 ** Math.max(0, ansDec - sc);
}

// 자릿수 규칙 (순수 산술식만)
function digitRuleViolation(grade, q) {
  const m = q.match(/^(\d+(?:\.\d+)?)\s*([+\-×÷])\s*(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const [, as, op, bs] = m;
  const isDec = as.includes(".") || bs.includes(".");
  const ai = as.split(".")[0].length, bi = bs.split(".")[0].length;
  if (grade === 3) {
    if (isDec) return "3학년 소수 연산 금지";
    if ((op === "+" || op === "-") && (ai > 3 || bi > 3)) return "3학년 ±는 세 자리까지";
    if (op === "×" && !((ai <= 2 && bi <= 2) || (ai <= 3 && bi === 1) || (ai === 1 && bi <= 3))) return "3학년 곱셈 범위 초과";
    if (op === "÷" && (ai > 2 || bi > 1)) return "3학년 나눗셈은 (두 자리)÷(한 자리)";
  }
  if (grade === 4) {
    if (op === "÷" && !isDec && bi > 2) return "4학년 나눗셈 제수는 두 자리까지";
    if (op === "×" && isDec) return "4학년 소수 곱셈 금지";
    if (op === "÷" && isDec) return "4학년 소수 나눗셈 금지";
  }
  if (grade === 5) {
    if (op === "÷" && isDec) return "5학년 소수 나눗셈 금지";
  }
  return null;
}

// ---------- 데이터 로드 ----------
async function loadProblems() {
  if (OLD_MODE) {
    const src = readFileSync(join(ROOT, "problems.js"), "utf8");
    const grades = src.split(/'(\d)':\s*\[/).slice(1);
    const out = {};
    for (let i = 0; i < grades.length; i += 2) {
      const g = grades[i];
      out[g] = [...grades[i + 1].matchAll(/q:\s*"((?:[^"\\]|\\.)*)"\s*,\s*a:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => ({ q: m[1], a: m[2] }));
    }
    return out;
  }
  const out = {};
  for (const g of [3, 4, 5, 6]) {
    out[g] = (await import(join(ROOT, "problems", `grade${g}.js`))).default;
  }
  return out;
}

// ---------- 검증 ----------
const problems = await loadProblems();
let totalErr = 0;
const report = {};

for (const [g, list] of Object.entries(problems)) {
  const grade = Number(g);
  const errs = { 답오류: [], 금지단원: [], 자릿수: [], 비정수나눗셈: [], 조사: [], 중복: [], 답범위: [] };
  const seen = new Set();

  for (const { q, a } of list) {
    // 중복
    if (seen.has(q)) errs.중복.push(q); else seen.add(q);

    // 답 0·음수 (분수 제외)
    if (!a.includes("/") && !a.includes(":")) {
      const n = Number(a);
      if (isFinite(n) && n <= 0) errs.답범위.push(`${q} = ${a}`);
    }

    // 금지 단원
    for (const re of FORBIDDEN[grade] || []) {
      if (re.test(q)) { errs.금지단원.push(`${q} [${re}]`); break; }
    }

    // 조사 오류: 숫자/단어 + 잘못된 조사 패턴
    if (/[가-힣]([098145679]|[13678]0*)(와|를|가|는)\s/.test(q)) { /* 근사 — 아래 정밀검사로 대체 */ }
    // 숫자 직후 조사, 또는 숫자+단위어(개/명/원/팩/장 등 1글자) 직후 조사만 검사 — 일반 단어("사과") 오탐 방지
    const josaM = [...q.matchAll(/(\d)([가-힣])?(와|과|을|를|이(?=\s)|가(?=\s))(?=[\s,])/g)];
    for (const [, digit, unit, j] of josaM) {
      const bat = unit != null
        ? hasBatchim(unit)
        : { 0: true, 1: true, 2: false, 3: true, 4: false, 5: false, 6: true, 7: true, 8: true, 9: false }[digit];
      if (bat === null || bat === undefined) continue;
      const wrong = (j === "와" && bat) || (j === "과" && !bat) || (j === "을" && !bat) || (j === "를" && bat) || (j === "이" && !bat) || (j === "가" && bat);
      if (wrong) { errs.조사.push(q); break; }
    }

    // 자릿수 규칙
    const dv = digitRuleViolation(grade, q);
    if (dv) errs.자릿수.push(`${q} — ${dv}`);

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
  }

  const total = Object.values(errs).reduce((s, l) => s + l.length, 0);
  totalErr += total;
  report[g] = { 문제수: list.length, 오류합: total, ...Object.fromEntries(Object.entries(errs).map(([k, v]) => [k, v.length])) };
  console.log(`\n=== 학년 ${g} (${list.length}문제) — 오류 ${total}건 ===`);
  for (const [k, v] of Object.entries(errs)) {
    if (v.length) {
      console.log(`  ${k}: ${v.length}건`);
      v.slice(0, OLD_MODE ? 3 : 8).forEach((e) => console.log(`    · ${e}`));
    }
  }
}

console.log(`\n${"=".repeat(50)}\n${OLD_MODE ? "[구 데이터 진단]" : "[신규 데이터 게이트]"} 총 오류: ${totalErr}건`);
if (!OLD_MODE) process.exit(totalErr > 0 ? 1 : 0);
