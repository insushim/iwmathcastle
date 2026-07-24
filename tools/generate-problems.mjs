#!/usr/bin/env node
// tools/generate-problems.mjs
// 2022 개정 교육과정 규칙 기반 학년-학기별 문제 생성기 (docs/curriculum-map.md와 동기)
// v6: 학기 분리 (3-1 ~ 6-2, 8파일) + 문제별 시간등급 t 부여
//   t: 1=한 줄 연산(20초) 2=복합 연산(35초) 3=도형·측정 공식(45초) 4=문장제(50초)
// 출력: problems/grade{3-1,3-2,...,6-2}.js  (export default [{q,a,d,t}, ...])
// 사용: node tools/generate-problems.mjs

import { writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------- 시드 RNG (재현 가능) ----------
let seed = 20260724;
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
function makeDistractors(q, a) {
  const out = [];
  const add = (v) => {
    if (v == null) return;
    const s = String(v);
    if (s === String(a) || out.includes(s)) return;
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
      add(`${n + 1}/${d}`);
      add(`${n - 1}/${d}`);
      add(`${n}/${d + 1}`);
      add(`${n}/${d - 1}`);
      if (n !== d) add(`${d}/${n}`);
      const m = String(q).match(/(\d+)\/(\d+)\s*([+\-×÷])\s*(\d+)\/(\d+)/);
      if (m) {
        const n1 = +m[1], d1 = +m[2], op = m[3], n2 = +m[4], d2 = +m[5];
        if (op === "+" || op === "-") add(`${n1 + n2}/${d1 + d2}`);
        if (op === "×") { add(`${n1 + n2}/${d1 + d2}`); add(`${n1 * n2}/${d1 + d2}`); }
      }
      add(`${n + 2}/${d}`);
      add(`${n}/${d + 2}`);
    }
  } else if (String(a).includes(".")) {
    const num = Number(a);
    const dec = (String(a).split(".")[1] || "").length;
    const fx = (v) => v.toFixed(dec);
    if (isFinite(num)) {
      const step = 1 / Math.pow(10, dec);
      add(fx(num + step));
      add(fx(num - step));
      add(fx(num + step * 10));
      add(fx(num - step * 10));
      add(fx(num * 10));
      add(fx(num / 10));
      add(String(Math.round(num)));
    }
  } else {
    const num = Number(a);
    if (isFinite(num) && Number.isInteger(num)) {
      const mMul = String(q).match(/(\d+)\s*×\s*(\d+)/);
      const mAdd = String(q).match(/(\d+)\s*\+\s*(\d+)/);
      const mSub = String(q).match(/(\d+)\s*[-−]\s*(\d+)/);
      if (mMul) {
        const x = +mMul[1], y = +mMul[2];
        add(x + y);
        add(x * (y - 1));
        add(x * (y + 1));
      } else if (mAdd) {
        const x = +mAdd[1], y = +mAdd[2];
        add(Math.abs(x - y));
        add(num + 10); add(num - 10);
      } else if (mSub) {
        const x = +mSub[1], y = +mSub[2];
        add(x + y);
        add(num + 10); add(num - 10);
      }
      const mag = num >= 100 ? 10 : num >= 30 ? 5 : 1;
      add(num + 1); add(num - 1);
      add(num + mag); add(num - mag);
      add(num + 2); add(num - 2);
    }
  }
  return out.slice(0, 6);
}

// ---------- 생성 프레임워크 ----------
// templates: [fn, quota, timeClass] — fn이 p.d를 직접 주면 그 오답을 존중(개념 판별형)
function buildSemester(templates, target) {
  const seen = new Set();
  const out = [];
  for (const [fn, quota, tClass] of templates) {
    let made = 0, attempts = 0;
    while (made < quota && attempts < quota * 60) {
      attempts++;
      const p = fn();
      if (!p) continue;
      const key = p.q;
      if (seen.has(key)) continue;
      const aNum = Number(p.a);
      // 답 0·음수 금지 (분수·비율·커스텀 오답형 제외) — v6: ":" 답(비율)이 NaN으로 전량 탈락하던 버그 수정
      if (!p.a.includes("/") && !p.a.includes(":") && !p.d && (!isFinite(aNum) || aNum <= 0)) continue;
      seen.add(key);
      if (!p.d) p.d = makeDistractors(p.q, p.a);
      p.t = tClass;
      out.push(p);
      made++;
    }
    if (made < quota * 0.5 && quota > 60)
      console.warn(`  ⚠️ 템플릿 목표 미달: ${made}/${quota} (변형 공간 부족)`);
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (out.length < target) console.warn(`⚠️ 학기 목표 미달: ${out.length}/${target}`);
  return out;
}

// ============================================================
// 공용 템플릿 함수 (학기 간 재사용)
// ============================================================
const T = {
  add3: () => { const a = ri(100, 999), b = ri(100, 999); return { q: `${a} + ${b}`, a: String(a + b) }; },
  sub3: () => { const a = ri(200, 999), b = ri(100, a - 1); return { q: `${a} - ${b}`, a: String(a - b) }; },
  mul2x1: () => { const a = ri(11, 99), b = ri(2, 9); return { q: `${a} × ${b}`, a: String(a * b) }; },
  mul3x1: () => { const a = ri(101, 999), b = ri(2, 9); return { q: `${a} × ${b}`, a: String(a * b) }; },
  mul2x2: () => { const a = ri(11, 99), b = ri(11, 99); return { q: `${a} × ${b}`, a: String(a * b) }; },
  mul3x2: () => { const a = ri(101, 999), b = ri(11, 99); return { q: `${a} × ${b}`, a: String(a * b) }; },
  div2x1exact: () => { const b = ri(2, 9), q0 = ri(2, 12); const a = b * q0; if (a < 10 || a > 99) return null; return { q: `${a} ÷ ${b}`, a: String(q0) }; },
  div2x1rem: () => { const b = ri(2, 9), q0 = ri(2, 11), r = ri(1, b - 1); const a = b * q0 + r; if (a < 10 || a > 99) return null; return { q: `${a} ÷ ${b}의 나머지는?`, a: String(r) }; },
  div2x1quot: () => { const b = ri(2, 9), q0 = ri(2, 11), r = ri(1, b - 1); const a = b * q0 + r; if (a < 10 || a > 99) return null; return { q: `${a} ÷ ${b}의 몫은?`, a: String(q0) }; },
  divBy2exact: () => { const b = ri(11, 40), q0 = ri(2, 24); const a = b * q0; if (a > 999) return null; return { q: `${a} ÷ ${b}`, a: String(q0) }; },
  divBy2quotRem: () => {
    const b = ri(11, 30), q0 = ri(2, 20), r = ri(1, b - 1); const a = b * q0 + r; if (a > 999) return null;
    return rnd() < 0.5
      ? { q: `${a} ÷ ${b}의 몫은?`, a: String(q0) }
      : { q: `${a} ÷ ${b}의 나머지는?`, a: String(r) };
  },
  blankAdd: () => { const a = ri(100, 800), b = ri(50, 199); return { q: `${a} + □ = ${a + b}, □는?`, a: String(b) }; },
  blankSub: () => { const a = ri(300, 999), b = ri(100, a - 100); return { q: `${a} - □ = ${a - b}, □는?`, a: String(b) }; },
  blankMul: () => { const a = ri(12, 99), b = ri(2, 9); return { q: `${a} × □ = ${a * b}, □는?`, a: String(b) }; },
  cards3: () => {
    const ds = new Set(); while (ds.size < 3) ds.add(ri(0, 9));
    const arr = [...ds]; if (arr.every((d) => d === 0)) return null;
    const big = rnd() < 0.5;
    const sorted = [...arr].sort((x, y) => (big ? y - x : x - y));
    if (!big && sorted[0] === 0) { [sorted[0], sorted[1]] = [sorted[1], sorted[0]]; }
    return { q: `${arr.join(", ")}으로 만든 가장 ${big ? "큰" : "작은"} 세 자리 수는?`, a: sorted.join("") };
  },
  timeConv: () => {
    if (rnd() < 0.35) { const mm = ri(1, 9), s = pick([0, 5, 10, 15, 20, 30, 40, 45, 50]); return { q: `${mm}분 ${s ? s + "초" : ""} = 몇 초?`.replace("  ", " "), a: String(mm * 60 + s) }; }
    const h = ri(1, 9), m = ri(0, 11) * 5; return { q: `${h}시간 ${m ? m + "분" : ""} = 몇 분?`.replace("  ", " "), a: String(h * 60 + m) };
  },
  lenConv: () => { const m = ri(1, 9), c = ri(0, 19) * 5; return { q: `${m}m ${c ? c + "cm" : ""} = 몇 cm?`.replace("  ", " "), a: String(m * 100 + c) }; },
  unitFracCmp: () => { const a = ri(2, 9); let b = ri(2, 9); if (a === b) return null; return { q: `1/${a}${numWa(a)} 1/${b} 중 더 큰 분수는?`, a: `1/${Math.min(a, b)}` }; },
  // 3-1 소수 첫걸음: 소수 한 자리 크기 비교
  decCmp1: () => {
    const a = ri(1, 99); let b = ri(1, 99); if (a === b || Math.abs(a - b) > 40) return null;
    const A = decStr(a, 1), B = decStr(b, 1);
    if (!A.includes(".") || !B.includes(".")) return null;
    const ans = a > b ? A : B, other = a > b ? B : A;
    const hi = Math.max(a, b);
    return { q: `${A}${numWa(A)} ${B} 중 더 큰 수는?`, a: ans, d: [other, decStr(hi + 1, 1), decStr(Math.max(1, Math.min(a, b) - 1), 1)].filter((v, i, arr) => v !== ans && arr.indexOf(v) === i) };
  },
  // 3-2 들이·무게
  literConv: () => { const L = ri(1, 9), m = ri(0, 19) * 50; return { q: `${L}L ${m ? m + "mL" : ""} = 몇 mL?`.replace("  ", " "), a: String(L * 1000 + m) }; },
  kgConv: () => { const k = ri(1, 9), g = ri(0, 19) * 50; return { q: `${k}kg ${g ? g + "g" : ""} = 몇 g?`.replace("  ", " "), a: String(k * 1000 + g) }; },
  // 3-2 진분수·가분수 판별 / 대분수→가분수
  properImproper: () => {
    const d = ri(2, 9); const isProper = rnd() < 0.5;
    const n = isProper ? ri(1, d - 1) : ri(d, d * 2);
    if (n === d && rnd() < 0.5) return null;
    const ans = n < d ? "진분수" : "가분수";
    const wrong = ans === "진분수" ? "가분수" : "진분수";
    const ig = lastDigitBatchim(d) ? "이" : "가";
    return { q: `${n}/${d}${ig} 진분수, 가분수 중 무엇인가요?`, a: ans, d: [wrong, "대분수", "단위분수"] };
  },
  mixedToImproper: () => {
    const w = ri(1, 4), d = ri(2, 9), n = ri(1, d - 1);
    if (gcd(n, d) !== 1) return null;
    return { q: `대분수 ${w} ${n}/${d}${numEul(d)} 가분수로 나타내면?`, a: `${w * d + n}/${d}` };
  },
  bigPlace: () => {
    const a = ri(2, 9), b = ri(1, 9);
    if (rnd() < 0.5) return { q: `10000이 ${a}개, 1000이 ${b}개인 수는?`, a: String(a * 10000 + b * 1000) };
    const c = ri(1, 9);
    return { q: `10000이 ${a}개, 1000이 ${b}개, 100이 ${c}개인 수는?`, a: String(a * 10000 + b * 1000 + c * 100) };
  },
  bigJump: () => { const start = ri(2, 9) * 10000, unit = pick([1000, 10000, 100000]), k = ri(2, 5); return { q: `${start}에서 ${unit}씩 ${k}번 뛰어 센 수는?`, a: String(start + unit * k) }; },
  // 4-1 각도
  angleAddSub: () => {
    const a = ri(15, 120), b = ri(15, 120);
    if (rnd() < 0.5) { if (a + b >= 180) return null; return { q: `각도 ${a}° + ${b}°는 몇 도?`, a: String(a + b) }; }
    if (a <= b + 10) return null;
    return { q: `각도 ${a}° - ${b}°는 몇 도?`, a: String(a - b) };
  },
  triAngle: () => { const a = ri(25, 95), b = ri(25, 150 - a); const c = 180 - a - b; if (c < 15) return null; return { q: `삼각형의 두 각이 ${a}°, ${b}°일 때 나머지 각은? (°)`, a: String(c) }; },
  quadAngle: () => { const a = ri(50, 120), b = ri(50, 120), c = ri(40, 340 - a - b - 30); const d = 360 - a - b - c; if (d < 30 || d > 160) return null; return { q: `사각형의 세 각이 ${a}°, ${b}°, ${c}°일 때 나머지 각은? (°)`, a: String(d) }; },
  arithSeq: () => { const s = ri(2, 30), d = ri(2, 12); const t = [s, s + d, s + 2 * d, s + 3 * d]; return { q: `${t.join(", ")}, 다음 수는?`, a: String(s + 4 * d) }; },
  // 4-2 동분모 분수·소수 ±
  sameDenAdd: () => {
    const d = ri(4, 15), n1 = ri(1, d - 2), n2 = ri(1, d - 1 - n1);
    const s = n1 + n2; if (gcd(s, d) !== 1) return null;
    return { q: `${n1}/${d} + ${n2}/${d}`, a: `${s}/${d}` };
  },
  sameDenSub: () => {
    const d = ri(4, 15), n1 = ri(2, d - 1), n2 = ri(1, n1 - 1);
    const s = n1 - n2; if (s === 0 || gcd(s, d) !== 1) return null;
    return { q: `${n1}/${d} - ${n2}/${d}`, a: `${s}/${d}` };
  },
  dec1Add: () => { const a = ri(11, 899), b = ri(11, 899); return { q: `${decStr(a, 1)} + ${decStr(b, 1)}`, a: decStr(a + b, 1) }; },
  dec1Sub: () => { const a = ri(100, 999), b = ri(11, a - 10); return { q: `${decStr(a, 1)} - ${decStr(b, 1)}`, a: decStr(a - b, 1) }; },
  dec2Add: () => { const a = ri(101, 4999), b = ri(101, 4999); return { q: `${decStr(a, 2)} + ${decStr(b, 2)}`, a: decStr(a + b, 2) }; },
  dec2Sub: () => { const a = ri(500, 4999), b = ri(101, a - 100); return { q: `${decStr(a, 2)} - ${decStr(b, 2)}`, a: decStr(a - b, 2) }; },
  // 4-2 다각형 (이름·변·대각선 — 변형 공간 작으므로 소량)
  polygon: () => {
    const n = ri(4, 12);
    const names = { 3: "삼각형", 4: "사각형", 5: "오각형", 6: "육각형", 7: "칠각형", 8: "팔각형", 9: "구각형", 10: "십각형", 11: "십일각형", 12: "십이각형" };
    const kind = ri(1, 3);
    if (kind === 1) {
      const wrongs = [n - 1, n + 1, n + 2].filter((k) => names[k]).map((k) => names[k]);
      return { q: `변이 ${n}개인 다각형의 이름은?`, a: names[n], d: wrongs };
    }
    if (kind === 2) return { q: `${names[n]}의 한 꼭짓점에서 그을 수 있는 대각선은 몇 개?`, a: String(n - 3) };
    return { q: `${names[n]}의 대각선은 모두 몇 개?`, a: String((n * (n - 3)) / 2) };
  },
  // 5-1
  mixedExpr: () => {
    const t = ri(1, 5);
    let q, a;
    if (t === 1) { const x = ri(2, 40), y = ri(2, 12), z = ri(2, 12); q = `${x} + ${y} × ${z}`; a = x + y * z; }
    else if (t === 2) { const y = ri(2, 12), z = ri(2, 12), x = ri(y * z + 1, y * z + 60); q = `${x} - ${y} × ${z}`; a = x - y * z; }
    else if (t === 3) { const x = ri(2, 20), y = ri(2, 15), z = ri(2, 9); q = `(${x} + ${y}) × ${z}`; a = (x + y) * z; }
    else if (t === 4) { const z = ri(2, 9), y0 = ri(2, 12); const y = z * y0; const x = ri(1, 60); q = `${x} + ${y} ÷ ${z}`; a = x + y0; }
    else { const z = ri(2, 9), y0 = ri(2, 10); const y = z * y0; const x = ri(y0 + 1, y0 + 50); q = `${x} - ${y} ÷ ${z} + ${ri(2, 20)}`; const w = Number(q.split("+ ")[1]); a = x - y0 + w; }
    return { q: `${q}`, a: String(a) };
  },
  gcdQ: () => { const g = ri(2, 12), m = ri(2, 8); let n = ri(2, 8); if (gcd(m, n) !== 1) return null; const a = g * m, b = g * n; if (a > 60 || b > 60 || a === b) return null; return { q: `${a}${numWa(a)} ${b}의 최대공약수는?`, a: String(g) }; },
  lcmQ: () => { const a = ri(4, 20), b = ri(4, 20); if (a === b) return null; const l = lcm(a, b); if (l > 120) return null; return { q: `${a}${numWa(a)} ${b}의 최소공배수는?`, a: String(l) }; },
  reduceQ: () => { const g = ri(2, 9), n0 = ri(1, 9); let d0 = ri(n0 + 1, 12); if (gcd(n0, d0) !== 1) return null; return { q: `${n0 * g}/${d0 * g}${numEul(d0 * g)} 기약분수로 나타내면?`, a: `${n0}/${d0}` }; },
  diffDenAdd: () => {
    const d1 = ri(2, 10); let d2 = ri(2, 10); if (d1 === d2) return null;
    const n1 = ri(1, d1 - 1), n2 = ri(1, d2 - 1);
    if (gcd(n1, d1) !== 1 || gcd(n2, d2) !== 1) return null;
    const L = lcm(d1, d2); const s = n1 * (L / d1) + n2 * (L / d2);
    const [rn, rd] = reduceFrac(s, L);
    return { q: `${n1}/${d1} + ${n2}/${d2}`, a: fracStr(rn, rd) };
  },
  diffDenSub: () => {
    const d1 = ri(2, 10); let d2 = ri(2, 10); if (d1 === d2) return null;
    const n1 = ri(1, d1 - 1), n2 = ri(1, d2 - 1);
    if (gcd(n1, d1) !== 1 || gcd(n2, d2) !== 1) return null;
    const L = lcm(d1, d2); const s = n1 * (L / d1) - n2 * (L / d2);
    if (s <= 0) return null;
    const [rn, rd] = reduceFrac(s, L);
    return { q: `${n1}/${d1} - ${n2}/${d2}`, a: fracStr(rn, rd) };
  },
  rectArea: () => {
    const w = ri(3, 25), h = ri(3, 25);
    return rnd() < 0.5
      ? { q: `가로 ${w}cm, 세로 ${h}cm 직사각형의 넓이는? (cm²)`, a: String(w * h) }
      : { q: `가로 ${w}cm, 세로 ${h}cm 직사각형의 둘레는? (cm)`, a: String(2 * (w + h)) };
  },
  triArea: () => { const b = ri(2, 30), h = ri(2, 30); if ((b * h) % 2 !== 0) return null; return { q: `밑변 ${b}cm, 높이 ${h}cm인 삼각형의 넓이는? (cm²)`, a: String((b * h) / 2) }; },
  paraArea: () => { const b = ri(3, 30), h = ri(2, 20); return { q: `밑변 ${b}cm, 높이 ${h}cm인 평행사변형의 넓이는? (cm²)`, a: String(b * h) }; },
  trapArea: () => { const a = ri(2, 15), b = ri(2, 15), h = ri(2, 12); if (((a + b) * h) % 2 !== 0) return null; return { q: `윗변 ${a}cm, 아랫변 ${b}cm, 높이 ${h}cm인 사다리꼴의 넓이는? (cm²)`, a: String(((a + b) * h) / 2) }; },
  // 5-1 규칙과 대응
  correspond: () => {
    const n = ri(2, 9), x = ri(2, 12);
    return rnd() < 0.5
      ? { q: `□ = △ × ${n}일 때, △가 ${x}이면 □는?`, a: String(n * x) }
      : { q: `□ = △ × ${n}일 때, □가 ${n * x}이면 △는?`, a: String(x) };
  },
  // 5-2
  fracMul: () => {
    const n1 = ri(1, 9), d1 = ri(2, 10), n2 = ri(1, 9), d2 = ri(2, 10);
    if (gcd(n1, d1) !== 1 || gcd(n2, d2) !== 1) return null;
    const [rn, rd] = reduceFrac(n1 * n2, d1 * d2);
    return { q: `${n1}/${d1} × ${n2}/${d2}`, a: fracStr(rn, rd) };
  },
  fracMulWhole: () => {
    const n = ri(1, 9), d = ri(2, 10), w = ri(2, 9);
    if (gcd(n, d) !== 1) return null;
    const [rn, rd] = reduceFrac(n * w, d);
    return { q: `${n}/${d} × ${w}`, a: fracStr(rn, rd) };
  },
  decMulWhole: () => { const a = ri(11, 99), b = ri(2, 9); return { q: `${decStr(a, 1)} × ${b}`, a: decStr(a * b, 1) }; },
  decMulDec: () => { const a = ri(11, 99), b = ri(11, 99); return { q: `${decStr(a, 1)} × ${decStr(b, 1)}`, a: decStr(a * b, 2) }; },
  meanQ: () => {
    const n = ri(3, 4); const mean = ri(5, 50); const nums = [];
    let sum = 0;
    for (let i = 0; i < n - 1; i++) { const v = ri(Math.max(1, mean - 15), mean + 15); nums.push(v); sum += v; }
    const last = mean * n - sum; if (last <= 0 || last > mean + 30) return null; nums.push(last);
    return { q: `${nums.join(", ")}의 평균은?`, a: String(mean) };
  },
  // 5-2 수의 범위와 어림
  rounding: () => {
    const kind = ri(1, 3), placeKind = rnd() < 0.5 ? 10 : 100;
    const placeName = placeKind === 10 ? "십" : "백";
    const n = ri(101, 9899);
    if (n % placeKind === 0) return null;
    let a;
    if (kind === 1) a = Math.ceil(n / placeKind) * placeKind;
    else if (kind === 2) a = Math.floor(n / placeKind) * placeKind;
    else a = Math.round(n / placeKind) * placeKind;
    const word = kind === 1 ? "올림" : kind === 2 ? "버림" : "반올림";
    return { q: `${n}${numEul(n)} ${placeName}의 자리까지 ${word}하면?`, a: String(a) };
  },
  // 5-2 직육면체 구성요소 (변형 공간 작음 — 소량)
  cuboidParts: () => {
    const solid = rnd() < 0.5 ? "직육면체" : "정육면체";
    const part = pick([["면", 6], ["모서리", 12], ["꼭짓점", 8]]);
    const others = [6, 12, 8].filter((v) => v !== part[1]);
    return { q: `${solid}의 ${part[0]}은 모두 몇 개?`, a: String(part[1]), d: others.map(String) };
  },
  changeWord: () => { const it = pick(ITEMS), a = ri(3, 9), b = ri(100, 900), c = ri(50, 500); if (b * a <= c) return null; return { q: `${it} ${b}원짜리 ${a}개를 사고 ${b * a + c}원을 내면 거스름돈은?`, a: String(c) }; },
  // 6-1
  fracDiv: () => {
    const n1 = ri(1, 9), d1 = ri(2, 10), n2 = ri(1, 9), d2 = ri(2, 10);
    if (gcd(n1, d1) !== 1 || gcd(n2, d2) !== 1) return null;
    const [rn, rd] = reduceFrac(n1 * d2, d1 * n2);
    return { q: `${n1}/${d1} ÷ ${n2}/${d2}`, a: fracStr(rn, rd) };
  },
  wholeDivFrac: () => {
    const w = ri(2, 12), n = ri(1, 9), d = ri(2, 10);
    if (gcd(n, d) !== 1) return null;
    const [rn, rd] = reduceFrac(w * d, n);
    return { q: `${w} ÷ ${n}/${d}`, a: fracStr(rn, rd) };
  },
  fracDivWhole: () => {
    const n = ri(1, 9), d = ri(2, 9), w = ri(2, 9);
    if (gcd(n, d) !== 1) return null;
    const [rn, rd] = reduceFrac(n, d * w);
    return { q: `${n}/${d} ÷ ${w}`, a: fracStr(rn, rd) };
  },
  decDivWhole: () => { const b = ri(2, 9), q0 = ri(11, 99); const a = b * q0; if (a % 10 === 0) return null; return { q: `${decStr(a, 1)} ÷ ${b}`, a: decStr(q0, 1) }; },
  decDivDec: () => { const d = ri(2, 49), q0 = ri(2, 20); if (d % 10 === 0) return null; const a = d * q0; if (a % 10 === 0) return null; return { q: `${decStr(a, 1)} ÷ ${decStr(d, 1)}`, a: String(q0) }; },
  percentOf: () => { const p = pick([10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90]); const base = ri(2, 60) * (100 / gcd(p, 100)); if (base > 2000) return null; return { q: `${base}의 ${p}%는?`, a: String((base * p) / 100) }; },
  discount: () => { const p = pick([10, 20, 25, 30, 40, 50]); const price = ri(10, 400) * 100; const off = (price * p) / 100; if (off !== Math.floor(off)) return null; return rnd() < 0.5 ? { q: `${price}원의 ${p}% 할인 후 가격은?`, a: String(price - off) } : { q: `${price}원짜리 물건을 ${p}% 할인하면 할인 금액은?`, a: String(off) }; },
  ratio: () => {
    const g = ri(2, 8), a0 = ri(1, 9); let b0 = ri(1, 9);
    if (a0 === b0 || gcd(a0, b0) !== 1) return null;
    // 오답: 뒤집기 / 한쪽 ±1 / 덜 약분 (비율 답은 makeDistractors가 못 만들므로 직접 제공)
    const ds = [`${b0}:${a0}`, `${a0 + 1}:${b0}`, `${a0}:${b0 + 1}`];
    if (g % 2 === 0) ds.push(`${a0 * 2}:${b0 * 2}`);
    return { q: `${a0 * g}:${b0 * g}${numEul(b0 * g)} 가장 간단한 비로 나타내면? (A:B)`, a: `${a0}:${b0}`, d: ds.filter((v, i, arr) => v !== `${a0}:${b0}` && arr.indexOf(v) === i) };
  },
  proportion: () => { const a = ri(2, 12), b = ri(2, 12), k = ri(2, 9); if (a === b) return null; return { q: `${a}:${b} = ${a * k}:□, □는?`, a: String(b * k) }; },
  propShare: () => { const a = ri(1, 7); let b = ri(1, 7); if (a === b || gcd(a, b) !== 1) return null; const u = ri(2, 30); const total = (a + b) * u; return { q: `${total}개${eul("개")} ${a}:${b}로 나누면 큰 쪽은 몇 개?`, a: String(Math.max(a, b) * u) }; },
  cuboidVol: () => { const a = ri(2, 12), b = ri(2, 12), c = ri(2, 12); return { q: `가로 ${a}cm, 세로 ${b}cm, 높이 ${c}cm 직육면체의 부피는? (cm³)`, a: String(a * b * c) }; },
  cuboidSurf: () => { const a = ri(2, 10), b = ri(2, 10), c = ri(2, 10); return { q: `가로 ${a}cm, 세로 ${b}cm, 높이 ${c}cm 직육면체의 겉넓이는? (cm²)`, a: String(2 * (a * b + b * c + c * a)) }; },
  // 6-1 각기둥·각뿔 구성요소
  prismPyramid: () => {
    const n = ri(3, 10);
    const names = { 3: "삼", 4: "사", 5: "오", 6: "육", 7: "칠", 8: "팔", 9: "구", 10: "십" };
    const isPrism = rnd() < 0.5;
    const solid = `${names[n]}각${isPrism ? "기둥" : "뿔"}`;
    const part = pick(["꼭짓점", "모서리", "면"]);
    const val = isPrism
      ? { 꼭짓점: 2 * n, 모서리: 3 * n, 면: n + 2 }[part]
      : { 꼭짓점: n + 1, 모서리: 2 * n, 면: n + 1 }[part];
    return { q: `${solid}의 ${part}은 모두 몇 개?`, a: String(val) };
  },
  circumference: () => {
    if (rnd() < 0.5) { const r = ri(2, 15); return { q: `반지름 ${r}cm인 원의 원주는? (원주율 3.14)`, a: decStr(628 * r, 2) }; }
    const d = ri(4, 30); return { q: `지름 ${d}cm인 원의 원주는? (원주율 3.14)`, a: decStr(314 * d, 2) };
  },
  circleArea: () => {
    if (rnd() < 0.5) { const r = ri(2, 12); return { q: `반지름 ${r}cm인 원의 넓이는? (원주율 3.14)`, a: decStr(314 * r * r, 2) }; }
    const r = ri(2, 12); return { q: `지름 ${r * 2}cm인 원의 넓이는? (원주율 3.14)`, a: decStr(314 * r * r, 2) };
  },
  speedDist: () => { const v = ri(2, 24) * 5, t = ri(2, 6); return { q: `시속 ${v}km로 ${t}시간 가면 몇 km?`, a: String(v * t) }; },
  speedSpeed: () => { const v = ri(2, 30) * 4, t = ri(2, 5); return { q: `${v * t}km를 ${t}시간에 가면 시속 몇 km?`, a: String(v) }; },
  speedTime: () => { const v = ri(4, 20) * 5, t = ri(2, 6); return { q: `시속 ${v}km로 ${v * t}km를 가려면 몇 시간?`, a: String(t) }; },
  mixedHard: () => { const x = ri(10, 90), y = ri(2, 12), z = ri(2, 9), w0 = ri(2, 9); const w = z * w0; if (x <= w0) return null; return { q: `${x} × ${y} - ${w} ÷ ${z}`, a: String(x * y - w0) }; },
  // 6-2 원기둥·원뿔 (반지름↔지름 수치형)
  cylinderCone: () => {
    const r = ri(2, 20);
    const solid = rnd() < 0.5 ? "원기둥" : "원뿔";
    return rnd() < 0.5
      ? { q: `밑면의 반지름이 ${r}cm인 ${solid}의 밑면 지름은? (cm)`, a: String(r * 2) }
      : { q: `밑면의 지름이 ${r * 2}cm인 ${solid}의 밑면 반지름은? (cm)`, a: String(r) };
  },
  // 문장제 모음
  wordSum: () => { const it = pick(ITEMS), a = ri(115, 480), b = ri(115, 480); return { q: `${it} ${a}개와 ${b}개를 합치면 모두 몇 개?`, a: String(a + b) }; },
  wordDiff: () => { const it = pick(ITEMS), a = ri(300, 900), b = ri(100, a - 50); return { q: `${it} ${a}개에서 ${b}개를 팔면 남은 개수는?`, a: String(a - b) }; },
  wordGroup: () => { const it = pick(ITEMS), a = ri(12, 60), b = ri(2, 9); return { q: `한 상자에 ${it} ${a}개씩 ${b}상자면 모두 몇 개?`, a: String(a * b) }; },
  wordTimes: () => { const nm = pick(NAMES), it = pick(ITEMS), a = ri(15, 99), b = ri(11, 30); return { q: `${nm}${iga(nm)} ${it}${eul(it)} 하루에 ${a}개씩 ${b}일 모으면 모두 몇 개?`, a: String(a * b) }; },
  wordShare: () => { const it = pick(ITEMS), b = ri(11, 25), q0 = ri(3, 20); const a = b * q0; return { q: `${it} ${a}개${eul("개")} ${b}명에게 똑같이 나누면 한 명당 몇 개?`, a: String(q0) }; },
  wordPercent: () => { const nm = pick(NAMES); const total = ri(4, 40) * 25; const p = pick([20, 25, 40, 50, 60, 75, 80]); const v = (total * p) / 100; if (v !== Math.floor(v)) return null; return { q: `${nm}${iga(nm)} ${total}쪽인 책의 ${p}%를 읽으면 몇 쪽?`, a: String(v) }; },
};

// ============================================================
// 학기별 템플릿 배정 (2022 개정 교육과정 단원 매핑 — docs/UPGRADE-PLAN-v6.md §1-2)
// [함수, 목표 문항수, 시간등급 t]
// ============================================================
const SEMESTERS = {
  "3-1": [
    [T.add3, 600, 1],
    [T.sub3, 600, 1],
    [T.blankAdd, 230, 2],
    [T.blankSub, 230, 2],
    [T.mul2x1, 400, 1],
    [T.div2x1exact, 85, 1],
    [T.lenConv, 170, 3],
    [T.timeConv, 150, 3],
    [T.unitFracCmp, 65, 2],
    [T.decCmp1, 90, 2],
  ],
  "3-2": [
    [T.mul3x1, 460, 1],
    [T.mul2x2, 420, 1],
    [T.div2x1rem, 230, 2],
    [T.div2x1quot, 230, 2],
    [T.cards3, 210, 2],
    [T.literConv, 170, 3],
    [T.kgConv, 170, 3],
    [T.properImproper, 100, 2],
    [T.mixedToImproper, 180, 2],
    [T.wordSum, 150, 4],
    [T.wordDiff, 150, 4],
    [T.wordGroup, 140, 4],
  ],
  "4-1": [
    [T.mul3x2, 550, 1],
    [T.mul2x2, 280, 1],
    [T.divBy2exact, 330, 1],
    [T.divBy2quotRem, 310, 2],
    [T.bigPlace, 280, 2],
    [T.bigJump, 150, 2],
    [T.angleAddSub, 230, 2],
    [T.triAngle, 200, 3],
    [T.quadAngle, 130, 3],
    [T.arithSeq, 200, 2],
  ],
  "4-2": [
    [T.sameDenAdd, 400, 2],
    [T.sameDenSub, 360, 2],
    [T.dec1Add, 320, 2],
    [T.dec1Sub, 300, 2],
    [T.dec2Add, 270, 2],
    [T.dec2Sub, 280, 2],
    [T.blankMul, 220, 2],
    [T.polygon, 30, 3],
    [T.wordTimes, 200, 4],
    [T.wordShare, 200, 4],
  ],
  "5-1": [
    [T.mixedExpr, 500, 2],
    [T.gcdQ, 250, 2],
    [T.lcmQ, 250, 2],
    [T.reduceQ, 250, 2],
    [T.diffDenAdd, 280, 2],
    [T.diffDenSub, 250, 2],
    [T.rectArea, 180, 3],
    [T.triArea, 150, 3],
    [T.paraArea, 120, 3],
    [T.trapArea, 120, 3],
    [T.correspond, 150, 2],
  ],
  "5-2": [
    [T.fracMul, 500, 2],
    [T.fracMulWhole, 200, 2],
    [T.decMulWhole, 300, 2],
    [T.decMulDec, 400, 2],
    [T.meanQ, 250, 3],
    [T.rounding, 500, 2],
    [T.cuboidParts, 6, 3],
    [T.changeWord, 200, 4],
    [T.wordTimes, 150, 4],
  ],
  "6-1": [
    [T.fracDiv, 400, 2],
    [T.wholeDivFrac, 250, 2],
    [T.fracDivWhole, 200, 2],
    [T.decDivWhole, 300, 2],
    [T.ratio, 300, 2],
    [T.percentOf, 350, 2],
    [T.cuboidVol, 250, 3],
    [T.cuboidSurf, 200, 3],
    [T.prismPyramid, 48, 3],
    [T.mixedHard, 200, 2],
  ],
  "6-2": [
    [T.decDivDec, 560, 2],
    [T.discount, 400, 2],
    [T.proportion, 400, 2],
    [T.propShare, 320, 2],
    [T.circumference, 42, 3],
    [T.circleArea, 24, 3],
    [T.speedDist, 160, 3],
    [T.speedSpeed, 160, 3],
    [T.speedTime, 130, 3],
    [T.cylinderCone, 76, 3],
    [T.wordPercent, 280, 4],
  ],
};

// ---------- 출력 ----------
mkdirSync(join(ROOT, "problems"), { recursive: true });
const stats = {};
for (const [sem, templates] of Object.entries(SEMESTERS)) {
  const target = 2400;
  const list = buildSemester(templates, target);
  stats[sem] = list.length;
  const body = list
    .map((p) => `{q:${JSON.stringify(p.q)},a:${JSON.stringify(p.a)},d:${JSON.stringify(p.d || [])},t:${p.t}}`)
    .join(",\n");
  writeFileSync(
    join(ROOT, "problems", `grade${sem}.js`),
    `// 자동 생성 — tools/generate-problems.mjs (수정 금지, 규칙: docs/curriculum-map.md)\n// ${sem} 학기 · t: 1=한줄연산(20s) 2=복합(35s) 3=도형측정(45s) 4=문장제(50s)\nexport default [\n${body}\n];\n`,
  );
  console.log(`✅ ${sem}: ${list.length}문제 → problems/grade${sem}.js`);
}
console.log("합계:", Object.values(stats).reduce((a, b) => a + b, 0));
