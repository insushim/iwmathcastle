// distractors.js — 4지선다 오답 선택지 생성 (빌드·런타임 공용, DOM 미참조)
//
// 왜 새로 쓰는가 (2026-07-27 감사 실측):
//   구버전은 정답 기준 ±1, ±2로 대칭 배치했다. 그 결과 4지선다에서 정답이
//   "가운데 2개" 안에 들어갈 확률이 91.2%(균등이면 50%)였고, 계산을 전혀 안 하고
//   최댓값·최솟값만 버려도 45.6%를 맞혔다(기준선 25%). 나눗셈 등 11개 골격은 100%.
//   → 학습을 안 하는 쪽이 이득인 유인 구조. 이 파일이 그 구조를 뒤집는다.
//
// 두 축으로 고친다:
//   ① 오답 내용 = 실제 오개념(자릿수 밀림·받아올림 누락·연산 혼동·분모끼리 계산 …)
//   ② 오답 배치 = 정답의 크기 순위를 문항마다 0,1,2,3으로 돌려 강제 균등화
//
// ⚠️ 정확히 3개를 반환한다. main.js는 d를 셔플 후 slice(0,3)하므로
//    3개보다 많이 담으면 런타임 무작위 부분추출이 ①②를 다시 무너뜨린다(감사 실측).
// ⚠️ 오답은 정답에 "가까운 것부터" 고른다 — 멀리 떨어진 값은 계산 없이 걸러지므로
//    실질 선택지가 줄어든다. 순위만 통제하고 거리는 좁게 유지한다.

const gcdI = (a, b) => (b === 0 ? Math.abs(a) : gcdI(b, a % b));

/** 소수 문자열 정리: "2.40" → "2.4", "10.00" → "10" (정수부 0은 깎지 않는다) */
export function trimDec(s) {
  const t = String(s);
  if (!t.includes(".")) return t;
  return t.replace(/0+$/, "").replace(/\.$/, "");
}

/** 정수배율 표기 — 부동소수 오차 없이 소수 문자열 생성 */
function decStr(intVal, places) {
  if (places <= 0) return String(Math.round(intVal));
  const s = String(Math.abs(Math.round(intVal))).padStart(places + 1, "0");
  return trimDec(s.slice(0, -places) + "." + s.slice(-places));
}

export function answerKind(a) {
  const s = String(a);
  if (/^\d+\/\d+$/.test(s)) return "frac";
  if (/^\d+:\d+$/.test(s)) return "ratio";
  if (/^\d+\.\d+$/.test(s)) return "dec";
  if (/^\d+$/.test(s)) return "int";
  return "text";
}

/** 정렬용 실수값. 순서를 매길 수 없으면 null */
export function orderValue(s) {
  const k = answerKind(s);
  if (k === "frac") {
    const [n, d] = String(s).split("/").map(Number);
    return d ? n / d : null;
  }
  if (k === "dec" || k === "int") return Number(s);
  return null;
}

const decPlaces = (s) => (String(s).split(".")[1] || "").length;

const BIN = /(\d+(?:\.\d+)?|\d+\/\d+)\s*([+\-−×÷])\s*(\d+(?:\.\d+)?|\d+\/\d+)/;
function parseBinary(q) {
  const m = String(q).match(BIN);
  if (!m) return null;
  return { x: m[1], op: m[2] === "−" ? "-" : m[2], y: m[3] };
}

/** 문제 문자열의 결정적 해시 — 같은 문제는 늘 같은 오답을 얻는다(재현성) */
function hashQ(q) {
  let h = 2166136261;
  const s = String(q);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}

/** 자릿수 밀림(×10·÷10) 오답을 넣을지 — 항상 넣으면 "자릿수가 다수파인 것 고르기"가
 *  25% → 33%로 올라간다(감사 실측). 절반만 넣어 단서를 흐린다.
 *  ⚠️ 완전히 빼지는 않는다. 소수·자릿값 단원에서 가장 중요한 오개념이다. */
function usePlaceShift(q) {
  return hashQ(q) % 2 === 0;
}

// ============================================================
// ① 오개념 기반 오답 후보
// ============================================================

/** 받아내림을 안 하고 자리마다 |큰수-작은수|를 쓰는 대표적 실수 */
function digitAbsSub(x, y) {
  const xs = String(x).split("").reverse();
  const ys = String(y).split("").reverse();
  let s = "";
  for (let i = 0; i < xs.length; i++) {
    s = String(Math.abs(Number(xs[i] || 0) - Number(ys[i] || 0))) + s;
  }
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

function intMistakes(q, ans, ctx) {
  const out = [];
  const a = Number(ans);
  const ps = usePlaceShift(q);
  const push = (v) => { if (Number.isInteger(v) && v > 0) out.push(String(v)); };
  // 문장제는 문제 문자열에 연산자가 없어 파싱이 안 된다. 템플릿이 넘긴 ctx를 쓴다.
  // (없으면 오답이 전부 "정답 ±1"이 되어 오개념을 전혀 못 담는다 — v7 실측)
  const p = ctx && ctx.op ? { x: String(ctx.x), op: ctx.op, y: String(ctx.y) } : parseBinary(q);

  if (p) {
    const xNum = Number(p.x), yNum = Number(p.y);
    const bothPlain = !p.x.includes("/") && !p.y.includes("/");
    const bothInt = bothPlain && !p.x.includes(".") && !p.y.includes(".");

    if (bothInt) {
      const x = xNum, y = yNum;
      if (p.op === "+") {
        push(Math.abs(x - y));            // 연산 혼동: 빼버림
        push(a - 10);                     // 십의 자리 받아올림 누락
        push(a - 100);                    // 백의 자리 받아올림 누락
        push(a + 10);                     // 받아올림 과다
        push(a + 100);
      } else if (p.op === "-") {
        push(x + y);                      // 연산 혼동: 더해버림
        push(digitAbsSub(x, y));          // 받아내림 없이 자리마다 절댓값
        push(a + 10);
        push(a - 10);
        push(a + 100);
      } else if (p.op === "×") {
        push(x * (y - 1));                // 곱셈구구 한 칸 밀림
        push(x * (y + 1));
        if (ps) { push(a * 10); push(Math.floor(a / 10)); }  // 자리 올려/내려 씀
        if (y >= 10) { push(x * (y % 10)); push(x * (y - (y % 10))); } // 부분곱 누락
        push(x + y);                      // 연산 혼동(작은 수일 때만 밴드 통과)
      } else if (p.op === "÷") {
        if (ps) { push(a * 10); push(Math.floor(a / 10)); }
        push(a + 1); push(a - 1);         // 나눗셈은 한 칸 오차가 실제로 흔하다
        push(y);
        if (y !== 0 && x % y !== 0) { push(Math.floor(x / y) + (x % y)); push(x % y); }
      }
    } else if (bothPlain) {
      // 소수 피연산자 · 정수 답 (예: 8.4 ÷ 2.1 = 4)
      if (ps) { push(a * 10); push(Math.round(a / 10)); }
      push(a + 1); push(a - 1);
      if (p.op === "÷" && xNum && yNum) push(Math.round(yNum / xNum));
      if (p.op === "÷" && xNum && yNum) push(Math.round(xNum * yNum));
    }
  }

  // 몫/나머지 문제: 서로를 바꿔 쓰는 실수
  const dm = String(q).match(/(\d+)\s*÷\s*(\d+)의\s*(몫|나머지)/);
  if (dm) {
    const X = Number(dm[1]), Y = Number(dm[2]);
    push(dm[3] === "몫" ? X % Y : Math.floor(X / Y));
    push(Math.floor(X / Y) + 1);
    push(Y - (X % Y));
    push(a + 1); push(a - 1);
  }

  // 단위 환산·자릿값: 0을 하나 더/덜 붙이는 실수
  if (ps && /= 몇|몇 [a-zA-Z가-힣]+\?/.test(String(q))) {
    push(a * 10);
    push(Math.round(a / 10));
  }
  return out;
}

/** 순수 산술식이 아닌 유형(도형·측정·약수배수·평균·비율·단위환산)의 오개념.
 *  이 유형들은 피연산자 파싱이 안 되므로 별도로 다루지 않으면 오답이 전부
 *  "정답 ±1" 같은 무의미한 값으로 채워진다(초판 실측). */
function keywordMistakes(q, ans) {
  const out = [];
  const a = Number(ans);
  const ps = usePlaceShift(q);
  const push = (v) => { if (Number.isFinite(v) && v > 0) out.push(String(Math.round(v))); };
  const nums = (String(q).match(/\d+(?:\.\d+)?/g) || []).map(Number);
  const s = String(q);

  if (/최대공약수/.test(s) && nums.length >= 2) {
    push(gcdI(nums[0], nums[1]) * 2);                       // 배수를 답으로
    push((nums[0] / gcdI(nums[0], nums[1])) * nums[1]);      // 최소공배수와 혼동
    push(Math.abs(nums[0] - nums[1]));                       // 차를 답으로
    push(Math.min(nums[0], nums[1]));                        // 작은 수를 답으로
  }
  if (/최소공배수|함께 오는/.test(s) && nums.length >= 2) {
    push(gcdI(nums[0], nums[1]));                            // 최대공약수와 혼동
    push(nums[0] * nums[1]);                                 // 약분 없이 곱함
    push(Math.max(nums[0], nums[1]));
  }
  if (/삼각형.*넓이|사다리꼴/.test(s)) { push(a * 2); push(a / 2); }   // ÷2 빠뜨림/중복
  if (/평행사변형|직사각형.*넓이/.test(s)) { push(a / 2); push(a * 2); }
  if (/둘레/.test(s) && nums.length >= 2) { push(nums[0] * nums[1]); push(nums[0] + nums[1]); } // 넓이와 혼동
  if (/직사각형.*넓이/.test(s) && nums.length >= 2) push(2 * (nums[0] + nums[1]));              // 둘레와 혼동
  if (/부피|쌓기나무/.test(s) && nums.length >= 3) {
    push(2 * (nums[0] * nums[1] + nums[1] * nums[2] + nums[2] * nums[0])); // 겉넓이와 혼동
    push(nums[0] * nums[1]);                     // 높이를 빼먹고 밑면만
    push(nums[1] * nums[2]);
    push(nums[0] + nums[1] + nums[2]);           // 곱셈 대신 덧셈
  }
  if (/겉넓이/.test(s) && nums.length >= 3) push(nums[0] * nums[1] * nums[2]);                  // 부피와 혼동
  if (/원주(?!율)/.test(s) && nums.length >= 1) { push(a / 2); push(a * 2); push(nums[0] * nums[0] * 3.14); }
  if (/원의 넓이/.test(s) && nums.length >= 1) { push(nums[0] * 2 * 3.14); push(a * 2); push(a / 2); }
  if (/평균/.test(s) && nums.length >= 2) {
    const vals = nums.slice(0, -0 || nums.length);
    push(vals.reduce((x, y) => x + y, 0));                   // 나누기를 빠뜨림
    push(Math.max(...vals)); push(Math.min(...vals));
  }
  if (/%/.test(s) && nums.length >= 2) {
    push(nums[0] - a);                                       // 할인 전/후 혼동
    push(nums[0]);
    if (ps) { push(a / 10); push(a * 10); }                  // 백분율 자릿값
  }
  if (/= 몇|모두 몇 분|몇 초\?/.test(s)) {                     // 단위 환산
    if (ps) { push(a * 10); push(a / 10); }
    // 60진법을 10진법으로 착각하는 대표 실수 (2시간 20분 → 220분)
    if (/시간|분|초/.test(s) && nums.length >= 2) { push(nums[0] * 100 + nums[1]); push(nums[0] + nums[1]); }
  }
  if (/각/.test(s) && /°/.test(s) && nums.length >= 2) {
    push(180 - a); push(360 - a);                            // 삼각형/사각형 내각 혼동
    push(nums.slice(0, -1).reduce((x, y) => x + y, 0));
  }
  if (/다음 수/.test(s) && nums.length >= 3) {
    const d1 = nums[1] - nums[0];
    push(nums[nums.length - 1] + d1 + 1);
    push(nums[nums.length - 1] + d1 * 2);
  }
  if (/대각선/.test(s) && nums.length >= 1) { push(a + 1); push(a - 1); push(a * 2); }
  // "10000원짜리 N장, 1000원짜리 M장, 100원짜리 K개" — 자릿값을 한 칸 밀어 쓰는 실수
  if (/원짜리/.test(s) && /장/.test(s) && nums.length >= 4) {
    const [u1, c1, u2, c2, u3, c3] = nums;
    push(c1 * u2 + c2 * u1);                     // 지폐 종류를 맞바꿈
    if (u3 && c3 != null) push(c1 * u1 + c2 * u2 + c3 * u3 * 10);   // 마지막 단위 한 칸 위
    push(c1 * u1 + c2 * u2);                     // 마지막 항을 빠뜨림
    push((c1 + c2 + (c3 || 0)) * u2);            // 장수만 더해 한 단위로
  }
  if (/몇 개/.test(s) && /꼭짓점|모서리|면/.test(s)) { push(a + 2); push(a - 2); push(a * 2); }
  return out;
}

function decMistakes(q, ans, ctx) {
  const out = [];
  const places = decPlaces(ans);
  const scaled = Math.round(Number(ans) * 10 ** places);
  const add = (s) => { if (s && s !== "0" && Number(s) > 0) out.push(s); };
  const ps = usePlaceShift(q);

  // 소수점 위치 오류 — 소수 단원 최대 오개념
  if (ps) {
    add(decStr(scaled, Math.max(0, places - 1)));   // 소수점 한 칸 오른쪽 (10배)
    add(decStr(scaled, places + 1));                // 소수점 한 칸 왼쪽 (1/10)
  }
  add(decStr(scaled + 10 ** places, places));     // 정수부 ±1
  add(decStr(scaled - 10 ** places, places));
  add(decStr(scaled + 1, places));                // 끝자리 ±1
  add(decStr(scaled - 1, places));
  const rounded = Math.round(Number(ans));
  if (rounded > 0 && String(rounded) !== String(ans)) add(String(rounded)); // 반올림해 정수로

  const p = ctx && ctx.op ? { x: String(ctx.x), op: ctx.op, y: String(ctx.y) } : parseBinary(q);
  if (p) {
    const X = Number(p.x), Y = Number(p.y);
    if (Number.isFinite(X) && Number.isFinite(Y)) {
      const mx = Math.max(decPlaces(p.x), decPlaces(p.y));
      if (p.op === "×") {
        // 소수점 자리 수를 더하지 않고 큰 쪽 하나만 쓰는 실수
        if (mx !== places) add(decStr(Math.round(X * Y * 10 ** mx), mx));
      } else if (p.op === "÷") {
        if (X) add(decStr(Math.round((Y / X) * 10 ** places), places));  // 거꾸로 나눔
      } else {
        add(decStr(Math.round(Math.abs(X - Y) * 10 ** places), places)); // 연산 혼동
        add(decStr(Math.round((X + Y) * 10 ** places), places));
      }
    }
  }
  return out;
}

/** 분수 후보 정규화: 기약분수만 통과.
 *  ⚠️ "약분 안 한 정답 꼴"(1/2에 대한 4/8)은 절대 허용하지 않는다 —
 *     값이 정답과 같으므로 오답이 될 수 없다(초판 실측 버그). */
function fracOk(n, d, ansN, ansD) {
  if (!Number.isInteger(n) || !Number.isInteger(d)) return false;
  if (n <= 0 || d <= 1) return false;
  if (n * ansD === ansN * d) return false; // 값이 정답과 동일
  return gcdI(n, d) === 1;
}

function fracMistakes(q, ans, ctx) {
  const out = [];
  const [aN, aD] = String(ans).split("/").map(Number);
  const push = (n, d) => {
    if (!fracOk(n, d, aN, aD)) return;
    const s = `${n}/${d}`;
    if (s !== String(ans)) out.push(s);
  };
  const p = ctx && ctx.op ? { x: String(ctx.x), op: ctx.op, y: String(ctx.y) } : parseBinary(q);
  if (p) {
    const f1 = String(p.x).match(/^(\d+)\/(\d+)$/);
    const f2 = String(p.y).match(/^(\d+)\/(\d+)$/);
    const n1 = f1 ? +f1[1] : Number(p.x), d1 = f1 ? +f1[2] : 1;
    const n2 = f2 ? +f2[1] : Number(p.y), d2 = f2 ? +f2[2] : 1;
    if (Number.isFinite(n1) && Number.isFinite(n2)) {
      if (p.op === "+" || p.op === "-") {
        push(p.op === "+" ? n1 + n2 : Math.abs(n1 - n2), d1 + d2);          // 분모끼리도 계산
        push(p.op === "+" ? n1 + n2 : Math.abs(n1 - n2), Math.max(d1, d2)); // 통분 안 함
      } else if (p.op === "×") {
        push(n1 + n2, d1 + d2);        // 곱셈인데 더함
        push(n1 * n2, d1 + d2);        // 분모만 더함
      } else if (p.op === "÷") {
        push(n1 * n2, d1 * d2);        // 뒤집지 않고 그냥 곱함
        push(d1 * n2, n1 * d2);        // 거꾸로 뒤집음
      }
    }
  }
  push(aD, aN);            // 분자·분모 뒤집기
  push(aN + 1, aD);        // 분자 한 칸 밀림
  if (aN > 1) push(aN - 1, aD);
  push(aN, aD + 1);        // 분모 한 칸 밀림
  if (aD > 2) push(aN, aD - 1);
  push(aN * 2, aD * 2);    // 약분 안 한 꼴
  push(aN + 2, aD);
  return out;
}

function ratioMistakes(ans) {
  const [a, b] = String(ans).split(":").map(Number);
  const out = [`${b}:${a}`, `${a + 1}:${b}`, `${a}:${b + 1}`, `${a * 2}:${b * 2}`];
  if (a > 1) out.push(`${a - 1}:${b}`);
  return [...new Set(out)].filter((s) => s !== String(ans));
}

// ============================================================
// ② 순위 균등화 — 한쪽이 모자라면 같은 계열로 채운다
// ============================================================

/** 정답 아래(below=true) 또는 위쪽으로 그럴싸한 값 need개를 만든다 */
function fillSide(ans, need, below, taken) {
  const out = [];
  const kind = answerKind(ans);
  const av = orderValue(ans);

  if (kind === "frac") {
    const [n, d] = String(ans).split("/").map(Number);
    // 분수는 "분자 조정 / 분모 조정 / 2배 분모에서 ±1" 계열이 자연스럽다
    const cands = below
      ? [[n - 1, d], [n, d + 1], [n, d + 2], [n * 2 - 1, d * 2], [n - 2, d], [n * 3 - 1, d * 3]]
      : [[n + 1, d], [n, d - 1], [n * 2 + 1, d * 2], [n + 2, d], [n, d - 2], [n * 3 + 1, d * 3]];
    for (const [nn, dd] of cands) {
      if (out.length >= need) break;
      if (!fracOk(nn, dd, n, d)) continue;
      const s = `${nn}/${dd}`;
      const v = orderValue(s);
      if (taken.has(s) || out.includes(s) || v === null) continue;
      if (below ? v >= av : v <= av) continue;
      out.push(s);
    }
    return out;
  }

  const places = kind === "dec" ? decPlaces(ans) : 0;
  const unit = 10 ** places;
  const scaled = Math.round(av * unit);
  // 가까운 것부터: 끝자리 → 한 자리 위 → 두 자리 위
  const mag = Math.max(1, 10 ** Math.max(0, String(Math.abs(Math.round(av))).length - 2));
  const steps = [...new Set([1, 2, 3, unit, unit * 2, mag * unit, mag * 2 * unit, mag * 10 * unit])]
    .sort((x, y) => x - y);
  for (const st of steps) {
    if (out.length >= need) break;
    const v = below ? scaled - st : scaled + st;
    if (v <= 0) continue;
    const s = kind === "dec" ? decStr(v, places) : String(v);
    const ov = orderValue(s);
    if (s === String(ans) || taken.has(s) || out.includes(s) || ov === null) continue;
    if (below ? ov >= av : ov <= av) continue;
    out.push(s);
  }
  return out;
}

/**
 * 오답 3개를 만든다.
 * @param {string} q 문제
 * @param {string} a 정답
 * @param {number} targetRank 정답이 4개 보기 중 몇 번째로 작아야 하는가 (0=최소 … 3=최대)
 * @param {{x:number,y:number,op:string}} [ctx] 문장제처럼 문제에 연산자가 없을 때의 연산 맥락
 * @returns {{d: string[], rank: number}} rank = 실제 달성 순위 (자원 부족 시 요청과 다를 수 있음, 순서 없는 답은 -1)
 */
export function buildDistractors(q, a, targetRank = 0, ctx = null) {
  const ans = String(a);
  const kind = answerKind(ans);

  if (kind === "ratio") return { d: ratioMistakes(ans).slice(0, 3), rank: -1 };
  if (kind === "text") return { d: [], rank: -1 };

  const av = orderValue(ans);
  const raw = (
    kind === "frac" ? fracMistakes(q, ans, ctx)
    : kind === "dec" ? decMistakes(q, ans, ctx)
    : intMistakes(q, ans, ctx)
  ).concat(kind === "frac" ? [] : keywordMistakes(q, ans));

  // 크기 밴드: 계산 없이 걸러지는 극단값 제거 (자릿수 밀림 ×10·÷10은 남긴다)
  const lo = av / 10.5, hi = av * 10.5;
  const taken = new Set([ans]);
  const below = [], above = [];
  const EPS = 1e-9;
  for (const s of raw) {
    if (taken.has(s)) continue;
    const v = orderValue(s);
    if (v === null || v <= 0 || v < lo || v > hi) continue;
    if (Math.abs(v - av) < EPS) continue; // 값이 정답과 같은 표기(4/8 vs 1/2)는 오답 불가
    taken.add(s);
    (v < av ? below : above).push(s);
  }
  // 정답에 가까운 것부터 — 멀면 계산 없이 버려지므로 실질 선택지가 준다
  below.sort((x, y) => orderValue(y) - orderValue(x));
  above.sort((x, y) => orderValue(x) - orderValue(y));

  // 정답이 작아 아래쪽을 못 만드는 경우(예: 답이 2)는 달성 가능한 만큼만
  const maxBelow = kind === "int" ? Math.min(3, Math.max(0, av - 1)) : 3;
  const want = Math.min(Math.max(0, Math.min(3, targetRank)), maxBelow);

  let pickBelow = below.slice(0, want);
  if (pickBelow.length < want)
    pickBelow = pickBelow.concat(fillSide(ans, want - pickBelow.length, true, taken));
  pickBelow.forEach((s) => taken.add(s));

  const needAbove = 3 - pickBelow.length;
  let pickAbove = above.slice(0, needAbove);
  if (pickAbove.length < needAbove)
    pickAbove = pickAbove.concat(fillSide(ans, needAbove - pickAbove.length, false, taken));
  pickAbove.forEach((s) => taken.add(s));

  let d = [...new Set([...pickBelow, ...pickAbove])];
  if (d.length < 3) d = [...new Set(d.concat(fillSide(ans, 3 - d.length, true, taken)))];
  if (d.length < 3) d = [...new Set(d.concat(fillSide(ans, 3 - d.length, false, taken)))];
  d = d.slice(0, 3);

  return { d, rank: d.filter((s) => orderValue(s) < av).length };
}
