#!/usr/bin/env node
// tools/generate-problems.mjs
// 2022 개정 교육과정 규칙 기반 학년별 문제 생성기 (docs/curriculum-map.md와 동기)
// 출력: problems/grade{3,4,5,6}.js  (export default [{q,a}, ...])
// 사용: node tools/generate-problems.mjs

import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------- 시드 RNG (재현 가능) ----------
let seed = 20260723;
function rnd() {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const ri = (min, max) => min + Math.floor(rnd() * (max - min + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

// ---------- 수학 유틸 ----------
const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
const lcm = (a, b) => (a / gcd(a, b)) * b;
function reduceFrac(n, d) { const g = gcd(n, d); return [n / g, d / g]; }
function fracStr(n, d) { return d === 1 ? String(n) : `${n}/${d}`; }
// 소수: 정수 연산으로 정확히 (value = intVal / 10^dec)
function decStr(intVal, dec) {
  if (dec === 0) return String(intVal);
  let s = String(intVal).padStart(dec + 1, "0");
  let out = s.slice(0, -dec) + "." + s.slice(-dec);
  out = out.replace(/\.?0+$/, ""); // 끝 0 제거
  return out;
}

// ---------- 한국어 조사 (받침 판정) ----------
function hasBatchim(word) {
  const ch = word[word.length - 1];
  const code = ch.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 > 0;
}
const wa = (w) => (hasBatchim(w) ? "과" : "와");
const eul = (w) => (hasBatchim(w) ? "을" : "를");
const iga = (w) => (hasBatchim(w) ? "이" : "가");
// 숫자(또는 숫자로 끝나는 표기: "8/18", "3:5") 뒤 조사 — 마지막 숫자의 한국어 읽기 받침
const DIGIT_BATCHIM = { 0: true, 1: true, 2: false, 3: true, 4: false, 5: false, 6: true, 7: true, 8: true, 9: false };
function lastDigitBatchim(x) {
  const s = String(x); const m = s.match(/(\d)\D*$/);
  return m ? DIGIT_BATCHIM[m[1]] : hasBatchim(s);
}
const numWa = (x) => (lastDigitBatchim(x) ? "과" : "와");
const numEul = (x) => (lastDigitBatchim(x) ? "을" : "를");

const ITEMS = ["사과", "연필", "구슬", "딸기", "지우개", "공책", "색종이", "붕어빵", "블록", "동전", "스티커", "장난감", "쿠키", "도토리", "밤"];
const NAMES = ["민준", "서연", "지호", "하은", "도윤", "수아", "예준", "지우"];

// ---------- 오답(distractor) 생성 — 답 형식별 "그럴싸한 실수" 기반 ----------
// 정답과 같은 형식(분수→분수, 정수→정수)의 근접·실수 오답을 만든다.
// 아라하루식: 랜덤 정수가 아니라 "학생이 실제로 헷갈릴 만한" 답.
function makeDistractors(q, a) {
  const out = [];
  const add = (v) => {
    if (v == null) return;
    const s = String(v);
    if (s === String(a) || out.includes(s)) return;
    // 유효성: 양수 · 분수면 분자/분모 양수
    if (s.includes("/")) {
      const [n, d] = s.split("/").map(Number);
      if (!(n > 0 && d > 0)) return;
    } else {
      const n = Number(s);
      if (!isFinite(n) || n <= 0) return;
    }
    out.push(s);
  };

  if (String(a).includes("/")) {
    const [n, d] = String(a).split("/").map(Number);
    if (isFinite(n) && isFinite(d) && d > 0) {
      add(`${n + 1}/${d}`); // 분자 오차
      add(`${n - 1}/${d}`);
      add(`${n}/${d + 1}`); // 분모 오차
      add(`${n}/${d - 1}`);
      if (n !== d) add(`${d}/${n}`); // 뒤집기
      // 분수 연산의 대표 실수: 분자끼리·분모끼리 더하기/곱하기
      const m = String(q).match(/(\d+)\/(\d+)\s*([+\-×÷])\s*(\d+)\/(\d+)/);
      if (m) {
        const n1 = +m[1], d1 = +m[2], op = m[3], n2 = +m[4], d2 = +m[5];
        if (op === "+" || op === "-") {
          add(`${n1 + n2}/${d1 + d2}`); // 분모까지 더한 흔한 오답
        }
        if (op === "×") {
          add(`${n1 + n2}/${d1 + d2}`);
          add(`${n1 * n2}/${d1 + d2}`);
        }
      }
      add(`${n + 2}/${d}`);
      add(`${n}/${d + 2}`);
    }
  } else if (String(a).includes(".")) {
    // 소수 답 → 소수점 실수 기반 오답 (자릿수 유지)
    const num = Number(a);
    const dec = (String(a).split(".")[1] || "").length;
    const fx = (v) => v.toFixed(dec);
    if (isFinite(num)) {
      const step = 1 / Math.pow(10, dec);
      add(fx(num + step)); // 끝자리 ±1
      add(fx(num - step));
      add(fx(num + step * 10)); // 한 자리 위 ±1
      add(fx(num - step * 10));
      add(fx(num * 10)); // 소수점 위치 실수 (한 칸 오른쪽)
      add(fx(num / 10)); // 소수점 위치 실수 (한 칸 왼쪽)
      add(String(Math.round(num))); // 반올림한 정수로 착각
    }
  } else {
    const num = Number(a);
    if (isFinite(num) && Number.isInteger(num)) {
      const mMul = String(q).match(/(\d+)\s*×\s*(\d+)/);
      const mAdd = String(q).match(/(\d+)\s*\+\s*(\d+)/);
      const mSub = String(q).match(/(\d+)\s*[-−]\s*(\d+)/);
      if (mMul) {
        const x = +mMul[1], y = +mMul[2];
        add(x + y); // 곱 대신 합
        add(x * (y - 1)); // 한 번 덜 곱
        add(x * (y + 1)); // 한 번 더 곱
      } else if (mAdd) {
        const x = +mAdd[1], y = +mAdd[2];
        add(Math.abs(x - y)); // 합 대신 차
        add(num + 10); add(num - 10); // 받아올림 실수
      } else if (mSub) {
        const x = +mSub[1], y = +mSub[2];
        add(x + y); // 차 대신 합
        add(num + 10); add(num - 10); // 받아내림 실수
      }
      // 공통 근접 오답 (자릿수 규모에 맞춰)
      const mag = num >= 100 ? 10 : num >= 30 ? 5 : 1;
      add(num + 1); add(num - 1);
      add(num + mag); add(num - mag);
      add(num + 2); add(num - 2);
    }
  }
  return out.slice(0, 6); // 여유분 저장 → 런타임에서 3개 랜덤 선택
}

// ---------- 생성 프레임워크 ----------
function buildGrade(templates, target) {
  const seen = new Set();
  const out = [];
  for (const [fn, quota] of templates) {
    let made = 0, attempts = 0;
    while (made < quota && attempts < quota * 60) {
      attempts++;
      const p = fn();
      if (!p) continue;
      const key = p.q;
      if (seen.has(key)) continue;
      const aNum = Number(p.a);
      if (!p.a.includes("/") && (!isFinite(aNum) || aNum <= 0)) continue; // 답 0·음수 금지
      seen.add(key);
      p.d = makeDistractors(p.q, p.a); // 실수 기반 오답 (런타임 폴백 있음)
      out.push(p);
      made++;
    }
  }
  // 셔플
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (out.length < target) console.warn(`⚠️ 목표 미달: ${out.length}/${target}`);
  return out;
}

// ============================================================
// 3학년
// ============================================================
const G3 = [
  // 세 자리 덧셈
  [() => { const a = ri(100, 999), b = ri(100, 999); return { q: `${a} + ${b}`, a: String(a + b) }; }, 1100],
  // 세 자리 뺄셈
  [() => { const a = ri(200, 999), b = ri(100, a - 1); return { q: `${a} - ${b}`, a: String(a - b) }; }, 1100],
  // (두 자리)×(한 자리)
  [() => { const a = ri(11, 99), b = ri(2, 9); return { q: `${a} × ${b}`, a: String(a * b) }; }, 450],
  // (세 자리)×(한 자리)
  [() => { const a = ri(101, 999), b = ri(2, 9); return { q: `${a} × ${b}`, a: String(a * b) }; }, 350],
  // (두 자리)×(두 자리)
  [() => { const a = ri(11, 99), b = ri(11, 99); return { q: `${a} × ${b}`, a: String(a * b) }; }, 300],
  // (두 자리)÷(한 자리) 나누어떨어짐
  [() => { const b = ri(2, 9), q0 = ri(2, 12); const a = b * q0; if (a < 10 || a > 99) return null; return { q: `${a} ÷ ${b}`, a: String(q0) }; }, 350],
  // 나머지 구하기
  [() => { const b = ri(2, 9), q0 = ri(2, 11), r = ri(1, b - 1); const a = b * q0 + r; if (a < 10 || a > 99) return null; return { q: `${a} ÷ ${b}의 나머지는?`, a: String(r) }; }, 250],
  // 몫 구하기 (나머지 있는)
  [() => { const b = ri(2, 9), q0 = ri(2, 11), r = ri(1, b - 1); const a = b * q0 + r; if (a < 10 || a > 99) return null; return { q: `${a} ÷ ${b}의 몫은?`, a: String(q0) }; }, 250],
  // □ 역산 (덧셈)
  [() => { const a = ri(100, 800), b = ri(50, 199); return { q: `${a} + □ = ${a + b}, □는?`, a: String(b) }; }, 250],
  // □ 역산 (뺄셈)
  [() => { const a = ri(300, 999), b = ri(100, a - 100); return { q: `${a} - □ = ${a - b}, □는?`, a: String(b) }; }, 250],
  // 카드로 최대/최소 세 자리 수
  [() => {
    const ds = new Set(); while (ds.size < 3) ds.add(ri(0, 9));
    const arr = [...ds]; if (arr.every((d) => d === 0)) return null;
    const big = rnd() < 0.5;
    const sorted = [...arr].sort((x, y) => (big ? y - x : x - y));
    if (!big && sorted[0] === 0) { [sorted[0], sorted[1]] = [sorted[1], sorted[0]]; }
    return { q: `${arr.join(", ")}으로 만든 가장 ${big ? "큰" : "작은"} 세 자리 수는?`, a: sorted.join("") };
  }, 250],
  // 시간 변환
  [() => { const h = ri(1, 5), m = pick([0, 10, 15, 20, 30, 40, 45, 50]); return { q: `${h}시간 ${m ? m + "분" : ""} = 몇 분?`.replace("  ", " "), a: String(h * 60 + m) }; }, 150],
  // 길이 변환
  [() => { const m = ri(1, 9), c = pick([0, 10, 20, 25, 30, 50, 60, 75, 80]); return { q: `${m}m ${c ? c + "cm" : ""} = 몇 cm?`.replace("  ", " "), a: String(m * 100 + c) }; }, 150],
  // 단위분수 비교
  [() => { const a = ri(2, 9); let b = ri(2, 9); if (a === b) return null; return { q: `1/${a}${numWa(a)} 1/${b} 중 더 큰 분수는?`, a: `1/${Math.min(a, b)}` }; }, 100],
  // 문장제: 합
  [() => { const it = pick(ITEMS), a = ri(115, 480), b = ri(115, 480); return { q: `${it} ${a}개와 ${b}개를 합치면 모두 몇 개?`, a: String(a + b) }; }, 250],
  // 문장제: 차 (팔고 남은)
  [() => { const it = pick(ITEMS), a = ri(300, 900), b = ri(100, a - 50); return { q: `${it} ${a}개에서 ${b}개를 팔면 남은 개수는?`, a: String(a - b) }; }, 250],
  // 문장제: 곱 (묶음)
  [() => { const it = pick(ITEMS), a = ri(12, 60), b = ri(2, 9); return { q: `한 상자에 ${it} ${a}개씩 ${b}상자면 모두 몇 개?`, a: String(a * b) }; }, 200],
];

// ============================================================
// 4학년
// ============================================================
const G4 = [
  // (세 자리)×(두 자리)
  [() => { const a = ri(101, 999), b = ri(11, 99); return { q: `${a} × ${b}`, a: String(a * b) }; }, 900],
  // (두 자리)×(두 자리)
  [() => { const a = ri(11, 99), b = ri(11, 99); return { q: `${a} × ${b}`, a: String(a * b) }; }, 500],
  // (두·세 자리)÷(두 자리) 나누어떨어짐
  [() => { const b = ri(11, 40), q0 = ri(2, 24); const a = b * q0; if (a > 999) return null; return { q: `${a} ÷ ${b}`, a: String(q0) }; }, 500],
  // ÷ 몫/나머지
  [() => {
    const b = ri(11, 30), q0 = ri(2, 20), r = ri(1, b - 1); const a = b * q0 + r; if (a > 999) return null;
    return rnd() < 0.5
      ? { q: `${a} ÷ ${b}의 몫은?`, a: String(q0) }
      : { q: `${a} ÷ ${b}의 나머지는?`, a: String(r) };
  }, 400],
  // 동분모 분수 덧셈 (진분수 결과, 기약)
  [() => {
    const d = ri(4, 15), n1 = ri(1, d - 2), n2 = ri(1, d - 1 - n1);
    const s = n1 + n2; if (gcd(s, d) !== 1) return null;
    return { q: `${n1}/${d} + ${n2}/${d}`, a: `${s}/${d}` };
  }, 350],
  // 동분모 분수 뺄셈
  [() => {
    const d = ri(4, 15), n1 = ri(2, d - 1), n2 = ri(1, n1 - 1);
    const s = n1 - n2; if (s === 0 || gcd(s, d) !== 1) return null;
    return { q: `${n1}/${d} - ${n2}/${d}`, a: `${s}/${d}` };
  }, 300],
  // 소수 한 자리 덧셈
  [() => { const a = ri(11, 899), b = ri(11, 899); return { q: `${decStr(a, 1)} + ${decStr(b, 1)}`, a: decStr(a + b, 1) }; }, 350],
  // 소수 한 자리 뺄셈
  [() => { const a = ri(100, 999), b = ri(11, a - 10); return { q: `${decStr(a, 1)} - ${decStr(b, 1)}`, a: decStr(a - b, 1) }; }, 300],
  // 소수 두 자리 덧셈
  [() => { const a = ri(101, 4999), b = ri(101, 4999); return { q: `${decStr(a, 2)} + ${decStr(b, 2)}`, a: decStr(a + b, 2) }; }, 250],
  // 큰 수 (자릿값)
  [() => { const a = ri(2, 9), b = ri(1, 9); return { q: `10000이 ${a}개, 1000이 ${b}개인 수는?`, a: String(a * 10000 + b * 1000) }; }, 200],
  // 삼각형 나머지 각
  [() => { const a = ri(25, 95), b = ri(25, 150 - a); const c = 180 - a - b; if (c < 15) return null; return { q: `삼각형의 두 각이 ${a}°, ${b}°일 때 나머지 각은? (°)`, a: String(c) }; }, 300],
  // 등차수열 다음 항
  [() => { const s = ri(2, 30), d = ri(2, 12); const t = [s, s + d, s + 2 * d, s + 3 * d]; return { q: `${t.join(", ")}, 다음 수는?`, a: String(s + 4 * d) }; }, 250],
  // □ 역산 (곱셈)
  [() => { const a = ri(12, 99), b = ri(2, 9); return { q: `${a} × □ = ${a * b}, □는?`, a: String(b) }; }, 200],
  // 문장제: 배수 상황
  [() => { const nm = pick(NAMES), it = pick(ITEMS), a = ri(15, 99), b = ri(11, 30); return { q: `${nm}${iga(nm)} ${it}${eul(it)} 하루에 ${a}개씩 ${b}일 모으면 모두 몇 개?`, a: String(a * b) }; }, 250],
  // 문장제: 나눔
  [() => { const it = pick(ITEMS), b = ri(11, 25), q0 = ri(3, 20); const a = b * q0; return { q: `${it} ${a}개${eul("개")} ${b}명에게 똑같이 나누면 한 명당 몇 개?`, a: String(q0) }; }, 250],
];

// ============================================================
// 5학년
// ============================================================
function mixedExpr() {
  const t = ri(1, 5);
  let q, a;
  if (t === 1) { const x = ri(2, 40), y = ri(2, 12), z = ri(2, 12); q = `${x} + ${y} × ${z}`; a = x + y * z; }
  else if (t === 2) { const y = ri(2, 12), z = ri(2, 12), x = ri(y * z + 1, y * z + 60); q = `${x} - ${y} × ${z}`; a = x - y * z; }
  else if (t === 3) { const x = ri(2, 20), y = ri(2, 15), z = ri(2, 9); q = `(${x} + ${y}) × ${z}`; a = (x + y) * z; }
  else if (t === 4) { const z = ri(2, 9), y0 = ri(2, 12); const y = z * y0; const x = ri(1, 60); q = `${x} + ${y} ÷ ${z}`; a = x + y0; }
  else { const z = ri(2, 9), y0 = ri(2, 10); const y = z * y0; const x = ri(y0 + 1, y0 + 50); q = `${x} - ${y} ÷ ${z} + ${ri(2, 20)}`; const w = Number(q.split("+ ")[1]); a = x - y0 + w; }
  return { q: `${q}`, a: String(a) };
}
const G5 = [
  // 혼합계산
  [mixedExpr, 800],
  // 최대공약수 (공약수 존재 보장)
  [() => { const g = ri(2, 12), m = ri(2, 8); let n = ri(2, 8); if (gcd(m, n) !== 1) return null; const a = g * m, b = g * n; if (a > 60 || b > 60 || a === b) return null; return { q: `${a}${numWa(a)} ${b}의 최대공약수는?`, a: String(g) }; }, 400],
  // 최소공배수 (작은 수)
  [() => { const a = ri(4, 20), b = ri(4, 20); if (a === b) return null; const l = lcm(a, b); if (l > 120) return null; return { q: `${a}${numWa(a)} ${b}의 최소공배수는?`, a: String(l) }; }, 400],
  // 기약분수 만들기
  [() => { const g = ri(2, 9), n0 = ri(1, 9); let d0 = ri(n0 + 1, 12); if (gcd(n0, d0) !== 1) return null; return { q: `${n0 * g}/${d0 * g}${numEul(d0 * g)} 기약분수로 나타내면?`, a: `${n0}/${d0}` }; }, 400],
  // 이분모 분수 덧셈
  [() => {
    const d1 = ri(2, 10); let d2 = ri(2, 10); if (d1 === d2) return null;
    const n1 = ri(1, d1 - 1), n2 = ri(1, d2 - 1);
    if (gcd(n1, d1) !== 1 || gcd(n2, d2) !== 1) return null;
    const L = lcm(d1, d2); const s = n1 * (L / d1) + n2 * (L / d2);
    const [rn, rd] = reduceFrac(s, L);
    return { q: `${n1}/${d1} + ${n2}/${d2}`, a: fracStr(rn, rd) };
  }, 450],
  // 이분모 분수 뺄셈
  [() => {
    const d1 = ri(2, 10); let d2 = ri(2, 10); if (d1 === d2) return null;
    const n1 = ri(1, d1 - 1), n2 = ri(1, d2 - 1);
    if (gcd(n1, d1) !== 1 || gcd(n2, d2) !== 1) return null;
    const L = lcm(d1, d2); const s = n1 * (L / d1) - n2 * (L / d2);
    if (s <= 0) return null;
    const [rn, rd] = reduceFrac(s, L);
    return { q: `${n1}/${d1} - ${n2}/${d2}`, a: fracStr(rn, rd) };
  }, 350],
  // 분수 곱셈
  [() => {
    const n1 = ri(1, 9), d1 = ri(2, 10), n2 = ri(1, 9), d2 = ri(2, 10);
    if (gcd(n1, d1) !== 1 || gcd(n2, d2) !== 1) return null;
    const [rn, rd] = reduceFrac(n1 * n2, d1 * d2);
    return { q: `${n1}/${d1} × ${n2}/${d2}`, a: fracStr(rn, rd) };
  }, 400],
  // 소수 × 자연수
  [() => { const a = ri(11, 99), b = ri(2, 9); return { q: `${decStr(a, 1)} × ${b}`, a: decStr(a * b, 1) }; }, 300],
  // 소수 × 소수
  [() => { const a = ri(11, 99), b = ri(11, 99); return { q: `${decStr(a, 1)} × ${decStr(b, 1)}`, a: decStr(a * b, 2) }; }, 300],
  // 직사각형 넓이/둘레
  [() => {
    const w = ri(3, 25), h = ri(3, 25);
    return rnd() < 0.5
      ? { q: `가로 ${w}cm, 세로 ${h}cm 직사각형의 넓이는? (cm²)`, a: String(w * h) }
      : { q: `가로 ${w}cm, 세로 ${h}cm 직사각형의 둘레는? (cm)`, a: String(2 * (w + h)) };
  }, 300],
  // 삼각형 넓이 (밑변×높이 짝수 보장)
  [() => { const b = ri(2, 30), h = ri(2, 30); if ((b * h) % 2 !== 0) return null; return { q: `밑변 ${b}cm, 높이 ${h}cm인 삼각형의 넓이는? (cm²)`, a: String((b * h) / 2) }; }, 250],
  // 평행사변형 넓이
  [() => { const b = ri(3, 30), h = ri(2, 20); return { q: `밑변 ${b}cm, 높이 ${h}cm인 평행사변형의 넓이는? (cm²)`, a: String(b * h) }; }, 200],
  // 사다리꼴 넓이
  [() => { const a = ri(2, 15), b = ri(2, 15), h = ri(2, 12); if (((a + b) * h) % 2 !== 0) return null; return { q: `윗변 ${a}cm, 아랫변 ${b}cm, 높이 ${h}cm인 사다리꼴의 넓이는? (cm²)`, a: String(((a + b) * h) / 2) }; }, 200],
  // 평균
  [() => {
    const n = ri(3, 4); const mean = ri(5, 50); const nums = [];
    let sum = 0;
    for (let i = 0; i < n - 1; i++) { const v = ri(Math.max(1, mean - 15), mean + 15); nums.push(v); sum += v; }
    const last = mean * n - sum; if (last <= 0 || last > mean + 30) return null; nums.push(last);
    return { q: `${nums.join(", ")}의 평균은?`, a: String(mean) };
  }, 250],
  // 문장제 (혼합)
  [() => { const it = pick(ITEMS), a = ri(3, 9), b = ri(100, 900), c = ri(50, 500); if (b * a <= c) return null; return { q: `${it} ${b}원짜리 ${a}개를 사고 ${b * a + c}원을 내면 거스름돈은?`, a: String(c) }; }, 200],
];

// ============================================================
// 6학년
// ============================================================
const G6 = [
  // 분수 나눗셈
  [() => {
    const n1 = ri(1, 9), d1 = ri(2, 10), n2 = ri(1, 9), d2 = ri(2, 10);
    if (gcd(n1, d1) !== 1 || gcd(n2, d2) !== 1) return null;
    const [rn, rd] = reduceFrac(n1 * d2, d1 * n2);
    return { q: `${n1}/${d1} ÷ ${n2}/${d2}`, a: fracStr(rn, rd) };
  }, 400],
  // 자연수 ÷ 분수
  [() => {
    const w = ri(2, 12), n = ri(1, 9), d = ri(2, 10);
    if (gcd(n, d) !== 1) return null;
    const [rn, rd] = reduceFrac(w * d, n);
    return { q: `${w} ÷ ${n}/${d}`, a: fracStr(rn, rd) };
  }, 300],
  // 소수 나눗셈 (나누어떨어짐)
  [() => { const b = ri(2, 9), q0 = ri(11, 99); const a = b * q0; if (a % 10 === 0) return null; return { q: `${decStr(a, 1)} ÷ ${b}`, a: decStr(q0, 1) }; }, 300],
  // 소수 ÷ 소수
  [() => { const d = ri(2, 49), q0 = ri(2, 20); if (d % 10 === 0) return null; const a = d * q0; if (a % 10 === 0) return null; return { q: `${decStr(a, 1)} ÷ ${decStr(d, 1)}`, a: String(q0) }; }, 300],
  // 백분율: n의 p%
  [() => { const p = pick([10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90]); const base = ri(2, 60) * (100 / gcd(p, 100)); if (base > 2000) return null; return { q: `${base}의 ${p}%는?`, a: String((base * p) / 100) }; }, 400],
  // 할인가
  [() => { const p = pick([10, 20, 25, 30, 40, 50]); const price = ri(10, 400) * 100; const off = (price * p) / 100; if (off !== Math.floor(off)) return null; return rnd() < 0.5 ? { q: `${price}원의 ${p}% 할인 후 가격은?`, a: String(price - off) } : { q: `${price}원짜리 물건을 ${p}% 할인하면 할인 금액은?`, a: String(off) }; }, 400],
  // 비율 (기약)
  [() => { const g = ri(2, 8), a0 = ri(1, 9); let b0 = ri(1, 9); if (a0 === b0 || gcd(a0, b0) !== 1) return null; return { q: `${a0 * g}:${b0 * g}${numEul(b0 * g)} 가장 간단한 비로 나타내면? (A:B)`, a: `${a0}:${b0}` }; }, 350],
  // 비례식 □
  [() => { const a = ri(2, 12), b = ri(2, 12), k = ri(2, 9); if (a === b) return null; return { q: `${a}:${b} = ${a * k}:□, □는?`, a: String(b * k) }; }, 400],
  // 비례배분
  [() => { const a = ri(1, 7); let b = ri(1, 7); if (a === b || gcd(a, b) !== 1) return null; const u = ri(2, 30); const total = (a + b) * u; return { q: `${total}개${eul("개")} ${a}:${b}로 나누면 큰 쪽은 몇 개?`, a: String(Math.max(a, b) * u) }; }, 300],
  // 직육면체 부피
  [() => { const a = ri(2, 12), b = ri(2, 12), c = ri(2, 12); return { q: `가로 ${a}cm, 세로 ${b}cm, 높이 ${c}cm 직육면체의 부피는? (cm³)`, a: String(a * b * c) }; }, 300],
  // 직육면체 겉넓이
  [() => { const a = ri(2, 10), b = ri(2, 10), c = ri(2, 10); return { q: `가로 ${a}cm, 세로 ${b}cm, 높이 ${c}cm 직육면체의 겉넓이는? (cm²)`, a: String(2 * (a * b + b * c + c * a)) }; }, 250],
  // 원주 (π=3.14)
  [() => { const r = ri(2, 15); return { q: `반지름 ${r}cm인 원의 원주는? (원주율 3.14)`, a: decStr(628 * r, 2) }; }, 200],
  // 원의 넓이
  [() => { const r = ri(2, 12); return { q: `반지름 ${r}cm인 원의 넓이는? (원주율 3.14)`, a: decStr(314 * r * r, 2) }; }, 250],
  // 속력: 거리
  [() => { const v = ri(2, 24) * 5, t = ri(2, 6); return { q: `시속 ${v}km로 ${t}시간 가면 몇 km?`, a: String(v * t) }; }, 250],
  // 속력: 속력 구하기
  [() => { const v = ri(2, 30) * 4, t = ri(2, 5); return { q: `${v * t}km를 ${t}시간에 가면 시속 몇 km?`, a: String(v) }; }, 250],
  // 속력: 시간 구하기
  [() => { const v = ri(4, 20) * 5, t = ri(2, 6); return { q: `시속 ${v}km로 ${v * t}km를 가려면 몇 시간?`, a: String(t) }; }, 200],
  // 자연수 혼합 심화
  [() => { const x = ri(10, 90), y = ri(2, 12), z = ri(2, 9), w0 = ri(2, 9); const w = z * w0; if (x <= w0) return null; return { q: `${x} × ${y} - ${w} ÷ ${z}`, a: String(x * y - w0) }; }, 250],
  // 문장제: 비율 응용
  [() => { const nm = pick(NAMES); const total = ri(4, 40) * 25; const p = pick([20, 25, 40, 50, 60, 75, 80]); const v = (total * p) / 100; if (v !== Math.floor(v)) return null; return { q: `${nm}${iga(nm)} ${total}쪽인 책의 ${p}%를 읽으면 몇 쪽?`, a: String(v) }; }, 300],
];

// ---------- 출력 ----------
mkdirSync(join(ROOT, "problems"), { recursive: true });
const GRADES = { 3: [G3, 5200], 4: [G4, 5200], 5: [G5, 5200], 6: [G6, 5200] };
const stats = {};
for (const [g, [templates, target]] of Object.entries(GRADES)) {
  const list = buildGrade(templates, target);
  stats[g] = list.length;
  const body = list.map((p) => `{q:${JSON.stringify(p.q)},a:${JSON.stringify(p.a)},d:${JSON.stringify(p.d || [])}}`).join(",\n");
  writeFileSync(join(ROOT, "problems", `grade${g}.js`), `// 자동 생성 — tools/generate-problems.mjs (수정 금지, 규칙: docs/curriculum-map.md)\nexport default [\n${body}\n];\n`);
  console.log(`✅ 학년 ${g}: ${list.length}문제 → problems/grade${g}.js`);
}
console.log("합계:", Object.values(stats).reduce((a, b) => a + b, 0));
