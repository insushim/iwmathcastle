// learnLoop.js — 실제 학습 향상 루프
// ① 오답 시 한 줄 풀이 힌트  ② 세션 내 확장 간격 재출제  ③ 날짜 단위 간격 반복(라이트너)
// ④ 오답노트(localStorage 영속)  ⑤ 세션·누적 학습 통계
//
// ── v7 (2026-07-27): 감사 실측으로 드러난 3가지 구조 결함을 고친다 ────────────
//  (1) 주석은 "맞힐 때까지 3→7→15웨이브"라 했지만 실측은 3→3→3이었다.
//      popDueReview가 큐에서 splice로 빼내 recordWrong의 승급 분기에 영영 도달하지
//      못했기 때문. 7·15는 死코드였다.
//      → 이제 큐에서 빼지 않고 "출제 중" 표시만 한다. 그리고 방향을 바로잡는다:
//        맞히면 간격을 늘리고(확장 인출 연습), 틀리면 처음으로 되돌린다(라이트너).
//        구버전은 "틀릴수록 간격이 길어지는" 정반대 설계였다.
//  (2) 오답노트 50칸 중 seedReviewFromNote가 note.slice(0,3)만 써서, 새 오답이 앞에
//      쌓이면 오래된 오답은 영구히 복습에서 제외됐다(10판 시뮬: 50개 중 23개 미출제).
//      → 예정일(due) 오름차순으로 뽑는다. 오래 밀린 것이 먼저 나온다.
//  (3) 모든 재출제가 같은 세션 안 몇 분 내에 끝나 집중 연습이었다(웨이브 3 ≈ 1~2분).
//      → 날짜 단위 라이트너 상자를 도입한다: 1일 → 3일 → 7일 → 16일 → 졸업.
//        세션 내 반복은 "오늘 익히기", 날짜 반복은 "장기 기억"으로 역할을 나눈다.
// ────────────────────────────────────────────────────────────────────────

import { buildDistractors } from "./distractors.js";

// ---------- ① 유형별 풀이 힌트 ----------

/** 문제 문장에서 숫자를 순서대로 뽑는다(소수·분수 포함).
 *  v8: 도형·측정·문장제 힌트가 "넓이 공식을 떠올려 보세요. 답: 42"처럼
 *  그 문제의 실제 숫자를 하나도 쓰지 않아, 아이가 볼 수 있는 건 정답 숫자뿐이었다.
 *  그건 학습이 아니라 정답 암기다. 실제 값을 대입한 계산식을 보여주기 위한 도구. */
function nums(q) {
  return (String(q).match(/\d+(?:\.\d+)?/g) || []).map(Number);
}

/** 실제 숫자를 대입한 계산식을 만든다. 숫자가 모자라면 null(=일반 힌트로 폴백). */
function withNums(q, need, build) {
  const n = nums(q);
  if (n.length < need) return null;
  try {
    return build(n);
  } catch {
    return null;
  }
}

/** 사칙연산 식을 계산한다. 숫자·연산자·괄호만 허용. 못 읽으면 null. */
function calcExpr(expr) {
  const e = String(expr).replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-");
  if (!/^[\d\s+\-*/().]+$/.test(e)) return null;
  try {
    const v = Function(`"use strict";return (${e});`)();
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * 후보 계산식 중 **정답과 실제로 맞아떨어지는 것**만 힌트로 쓴다.
 *
 * 왜 이렇게까지 하나. 문장제는 문장마다 숫자 순서가 다르다.
 * "191원짜리 6개를 사고 1313원을 내면"은 [가격, 개수, 낸 돈]이고
 * "3100원을 내고 700원짜리를 4개"는 [낸 돈, 가격, 개수]다.
 * 순서를 하나로 가정했다가 895개 문항에 틀린 계산을 보여줬다(게이트가 잡았다).
 * 어차피 정답은 알고 있으니, 식이 정답을 내놓는지 검산하고 통과한 것만 보여준다.
 * 틀린 풀이를 보여줄 바에는 일반 힌트로 물러나는 게 낫다.
 *
 * @param {string|number} a  정답
 * @param {Array<[string, (expr:string)=>string]>} candidates  [식, 문장 만들기]
 */
function verified(a, candidates) {
  const target = Number(String(a).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(target)) return null;
  for (const [expr, render] of candidates) {
    const v = calcExpr(expr);
    if (v === null) continue;
    if (Math.abs(v - target) <= 0.011) return render(expr);
  }
  return null;
}

export function getSolutionHint(q, a) {
  // ── v8: 실제 숫자를 대입한 2단계 풀이를 먼저 시도한다 ──
  const stepped = steppedHint(String(q), a);
  if (stepped) return stepped;
  return genericHint(String(q), a);
}

/**
 * 그 문제의 숫자로 계산 과정을 보여주는 힌트.
 *
 * 모든 후보 식은 verified()를 통과해야만 화면에 나간다 — 즉 힌트에 적힌 계산은
 * 반드시 정답과 맞는다. 통과하는 식이 없으면 null을 돌려 일반 힌트로 물러난다.
 * (틀린 풀이를 보여주면 아이가 틀린 방법을 배운다. 없느니만 못하다.)
 */
function steppedHint(q, a) {
  const n = nums(q);
  const V = (cands) => verified(a, cands);
  const label = (name) => (expr) => `${name} = ${expr} = ${a}`;

  // ── 도형·측정 ──
  if (q.includes("삼각형") && q.includes("넓이") && n.length >= 2)
    return V([[`${n[0]} × ${n[1]} ÷ 2`, label("삼각형 넓이 = 밑변 × 높이 ÷ 2")]]);

  if (q.includes("평행사변형") && n.length >= 2)
    return V([[`${n[0]} × ${n[1]}`, label("평행사변형 넓이 = 밑변 × 높이")]]);

  if (q.includes("사다리꼴") && n.length >= 3)
    return V([[`(${n[0]} + ${n[1]}) × ${n[2]} ÷ 2`, label("사다리꼴 넓이 = (윗변 + 아랫변) × 높이 ÷ 2")]]);

  if (q.includes("둘레") && !q.includes("원") && n.length >= 2)
    return V([[`(${n[0]} + ${n[1]}) × 2`, label("둘레 = (가로 + 세로) × 2")]]);

  if (q.includes("직사각형") && q.includes("넓이") && n.length >= 2)
    return V([[`${n[0]} × ${n[1]}`, label("직사각형 넓이 = 가로 × 세로")]]);

  // ⚠️ 넓이를 원주보다 먼저 본다 — 문제에 "원주율 3.14"라는 말이 들어 있어서
  //    원주 분기가 원의 넓이 문제를 가로챘다(실측).
  if (q.includes("원") && q.includes("넓이") && n.length >= 1)
    return V([
      [`${n[0]} × ${n[0]} × 3.14`, label("원의 넓이 = 반지름 × 반지름 × 3.14")],
      [`(${n[0]} ÷ 2) × (${n[0]} ÷ 2) × 3.14`, label("원의 넓이 = 반지름 × 반지름 × 3.14 (지름 ÷ 2 = 반지름)")],
    ]);

  if (q.includes("원주") && n.length >= 1)
    return V([
      [`${n[0]} × 3.14`, label("원주 = 지름 × 3.14")],
      [`${n[0]} × 2 × 3.14`, label("원주 = 반지름 × 2 × 3.14")],
    ]);

  if (q.includes("겉넓이") && n.length >= 3)
    return V([[`(${n[0]} × ${n[1]} + ${n[1]} × ${n[2]} + ${n[0]} × ${n[2]}) × 2`,
      label("겉넓이 = (가로×세로 + 세로×높이 + 가로×높이) × 2")]]);

  if ((q.includes("부피") || q.includes("쌓기나무")) && n.length >= 3)
    return V([[`${n[0]} × ${n[1]} × ${n[2]}`, label("부피 = 가로 × 세로 × 높이")]]);

  // 다각형 대각선 — 숫자가 한글로 적혀 있다("십일각형").
  // 두 문제는 공식이 다르다: 한 꼭짓점에서 = n−3, 전체 = n×(n−3)÷2.
  if (q.includes("대각선")) {
    const k = koreanCount(q);
    if (k)
      return V([
        [`${k} - 3`, () => `한 꼭짓점에서 그을 수 있는 대각선 = ${k} − 3 = ${a}`],
        [`${k} × (${k} - 3) ÷ 2`, () => `${k}각형의 대각선 = ${k} × (${k} − 3) ÷ 2 = ${a}`],
      ]);
  }

  // 내각의 합
  if (q.includes("삼각형") && q.includes("각") && n.length >= 2)
    return V([[`180 - ${n[0]} - ${n[1]}`, label("삼각형 세 각의 합은 180° → 180 − 나머지 두 각")]]);
  if (q.includes("사각형") && q.includes("각") && n.length >= 3)
    return V([[`360 - ${n[0]} - ${n[1]} - ${n[2]}`, label("사각형 네 각의 합은 360° → 360 − 나머지 세 각")]]);

  // ── 자료·비율 ──
  if (q.includes("평균") && n.length >= 2)
    return V([[`(${n.join(" + ")}) ÷ ${n.length}`, label("평균 = 전체 합 ÷ 개수")]]);

  if (q.includes("할인") && n.length >= 2)
    return V([
      [`${n[0]} - ${n[0]} × ${n[1]} ÷ 100`, () => `낼 돈 = 원래 가격 − 할인 금액 = ${n[0]} − (${n[0]} × ${n[1]} ÷ 100) = ${a}`],
      [`${n[0]} × ${n[1]} ÷ 100`, label("할인 금액 = 원래 가격 × 할인율 ÷ 100")],
    ]);

  if (q.includes("%") && n.length >= 2)
    return V([
      [`${n[0]} × ${n[1]} ÷ 100`, () => `${n[0]}의 ${n[1]}% = ${n[0]} × ${n[1]} ÷ 100 = ${a}`],
      [`${n[1]} × ${n[0]} ÷ 100`, () => `${n[1]}의 ${n[0]}% = ${n[1]} × ${n[0]} ÷ 100 = ${a}`],
    ]);

  if ((q.includes("시속") || q.includes("속력")) && n.length >= 2)
    return V([
      [`${n[0]} × ${n[1]}`, label("거리 = 속력 × 시간")],
      [`${n[0]} ÷ ${n[1]}`, label(q.includes("몇 시간") ? "시간 = 거리 ÷ 속력" : "속력 = 거리 ÷ 시간")],
      [`${n[1]} ÷ ${n[0]}`, label("거리 ÷ 속력")],
    ]);

  if (q.includes("최대공약수") && n.length >= 2)
    return `두 수(${n[0]}, ${n[1]})를 모두 나눌 수 있는 수 중 가장 큰 수 → ${a}`;
  if (q.includes("최소공배수") && n.length >= 2)
    return `${n[0]}의 배수와 ${n[1]}의 배수 중 처음으로 겹치는 수 → ${a}`;

  // ── 단위 변환 ──
  if (n.length >= 2) {
    if (/시간.*분\s*=\s*몇\s*분|몇\s*분/.test(q) && q.includes("시간"))
      return V([[`${n[0]} × 60 + ${n[1]}`, () => `1시간 = 60분 → ${n[0]} × 60 + ${n[1]} = ${a}`]]);
    if (q.includes("초") && q.includes("분"))
      return V([[`${n[0]} × 60 + ${n[1]}`, () => `1분 = 60초 → ${n[0]} × 60 + ${n[1]} = ${a}`]]);
    if (q.includes("cm") && q.includes("m"))
      return V([[`${n[0]} × 100 + ${n[1]}`, () => `1m = 100cm → ${n[0]} × 100 + ${n[1]} = ${a}`]]);
    if (q.includes("mL"))
      return V([[`${n[0]} × 1000 + ${n[1]}`, () => `1L = 1000mL → ${n[0]} × 1000 + ${n[1]} = ${a}`]]);
    if (q.includes("kg") || (q.includes("g") && q.includes("무게")))
      return V([[`${n[0]} × 1000 + ${n[1]}`, () => `1kg = 1000g → ${n[0]} × 1000 + ${n[1]} = ${a}`]]);
  }
  if (n.length === 1) {
    const one = [
      [`${n[0]} × 60`, () => `1시간 = 60분 → ${n[0]} × 60 = ${a}`, () => q.includes("시간") && q.includes("분")],
      [`${n[0]} × 100`, () => `1m = 100cm → ${n[0]} × 100 = ${a}`, () => q.includes("cm")],
      [`${n[0]} × 1000`, () => `1L = 1000mL → ${n[0]} × 1000 = ${a}`, () => q.includes("mL")],
      [`${n[0]} × 1000`, () => `1kg = 1000g → ${n[0]} × 1000 = ${a}`, () => q.includes("kg")],
    ].filter(([, , when]) => when());
    if (one.length) {
      const r = V(one.map(([e, f]) => [e, f]));
      if (r) return r;
    }
  }

  // ── 문장제 ──
  // 여기가 제일 중요하다. "정답은 6! 다음에 비슷한 문제가 다시 나와요"만 보여주면
  // 아이는 식을 세우는 법을 영영 배우지 못한다(미대입 힌트의 최다수였다).
  // 숫자 순서는 문장마다 다르므로 후보를 늘어놓고 검산으로 고른다.
  if (q.includes("거스름돈") && n.length >= 3)
    return V([
      [`${n[0]} - ${n[1]} × ${n[2]}`, () => `거스름돈 = 낸 돈 − (가격 × 개수) = ${n[0]} − (${n[1]} × ${n[2]}) = ${a}`],
      [`${n[2]} - ${n[0]} × ${n[1]}`, () => `거스름돈 = 낸 돈 − (가격 × 개수) = ${n[2]} − (${n[0]} × ${n[1]}) = ${a}`],
      [`${n[1]} - ${n[0]} × ${n[2]}`, () => `거스름돈 = 낸 돈 − (가격 × 개수) = ${n[1]} − (${n[0]} × ${n[2]}) = ${a}`],
    ]);

  if (n.length >= 2) {
    const [x, y] = n;
    const cands = [];
    if (/나누|나눠|똑같이/.test(q)) {
      cands.push([`${x} ÷ ${y}`, label("전체 ÷ 나누는 수")]);
      cands.push([`${y} ÷ ${x}`, label("전체 ÷ 나누는 수")]);
    }
    if (/씩|묶음|봉지|상자|배|곱/.test(q)) cands.push([`${x} × ${y}`, label("한 묶음의 수 × 묶음 수")]);
    if (/더|모두|합/.test(q)) cands.push([`${x} + ${y}`, label("두 수를 더한다")]);
    if (/남|차이|더 많|빼/.test(q)) {
      cands.push([`${x} - ${y}`, label("큰 수 − 작은 수")]);
      cands.push([`${y} - ${x}`, label("큰 수 − 작은 수")]);
    }
    // 위 낱말이 하나도 안 걸렸다면 사칙연산 네 가지를 검산으로 훑는다.
    if (!cands.length) {
      cands.push([`${x} + ${y}`, label("두 수를 더한다")]);
      cands.push([`${x} - ${y}`, label("큰 수 − 작은 수")]);
      cands.push([`${x} × ${y}`, label("두 수를 곱한다")]);
      cands.push([`${x} ÷ ${y}`, label("전체 ÷ 나누는 수")]);
    }
    if (n.length >= 3) {
      cands.push([`${n[0]} × ${n[1]} + ${n[2]}`, label("곱한 뒤 더한다")]);
      cands.push([`${n[0]} - ${n[1]} × ${n[2]}`, label("곱한 뒤 뺀다")]);
      cands.push([`(${n[0]} + ${n[1]}) × ${n[2]}`, label("더한 뒤 곱한다")]);
    }
    const r = V(cands);
    if (r) return r;
  }

  return null;
}

/** "십일각형" 같은 한글 수 세기(3~20)를 숫자로. 못 읽으면 null. */
const KO_ONES = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };
function koreanCount(q) {
  const m = q.match(/([일이삼사오육칠팔구십]+)\s*각형/);
  if (!m) return null;
  const s = m[1];
  if (s === "십") return 10;
  if (s.includes("십")) {
    const [t, o] = s.split("십");
    const tens = t ? (KO_ONES[t] || 1) : 1;
    return tens * 10 + (o ? KO_ONES[o] || 0 : 0);
  }
  return KO_ONES[s] || null;
}

function genericHint(q, a) {
  // 순수 산술식 → 실제 풀이 단계 제시
  // ⚠️ v8: 끝을 $로 묶는다. 구버전은 앞부분만 맞으면 통과해서 "33 + 15 ÷ 3"에
  //    "33 + 15: 더하면 38!"이라는 **틀린 계산**을 가르치고 있었다(33+15=48).
  //    혼합 계산은 아래 연산 순서 힌트로 보낸다.
  const m = q.match(/^(\d+(?:\.\d+)?|\d+\/\d+)\s*([+\-×÷])\s*(\d+(?:\.\d+)?|\d+\/\d+)\s*$/);
  if (m) {
    const [, x, op, y] = m;
    const isFrac = x.includes("/") || y.includes("/");
    const isDec = x.includes(".") || y.includes(".");
    if (isFrac) {
      if (op === "+" || op === "-")
        return `분모가 다르면 통분부터! 분모를 같게 만든 뒤 분자끼리 계산해요. 답: ${a}`;
      if (op === "×") return `분자끼리, 분모끼리 곱한 뒤 약분해요. 답: ${a}`;
      if (op === "÷") return `나누는 분수를 뒤집어 곱하면 돼요. 답: ${a}`;
    }
    if (isDec) {
      if (op === "+" || op === "-") return `소수점 자리를 맞춰 세로로 계산해요. 답: ${a}`;
      if (op === "×") return `자연수처럼 곱한 뒤 소수점 자리 수를 세어 찍어요. 답: ${a}`;
      if (op === "÷") return `나누는 수가 자연수가 되도록 소수점을 옮겨요. 답: ${a}`;
    }
    if (op === "+") return `${x} + ${y}: 일의 자리부터 받아올림에 주의해 더하면 ${a}!`;
    if (op === "-") return `${x} - ${y}: 받아내림에 주의해 빼면 ${a}!`;
    if (op === "×") return `${x} × ${y}: 자리별로 나눠 곱한 뒤 더하면 ${a}!`;
    if (op === "÷") return `${x} ÷ ${y}: ${y}의 단 곱셈구구를 떠올려요. 답: ${a}`;
  }
  // 혼합 계산 — 연산 순서를 짚어 준다 (v8: 구버전은 앞 두 항만 보고 틀린 답을 말했다)
  if (/^[\d\s+\-×÷().\/]+$/.test(q) && /[+\-]/.test(q) && /[×÷]/.test(q))
    return `곱셈·나눗셈을 먼저, 덧셈·뺄셈을 나중에! 괄호가 있으면 괄호부터. 답: ${a}`;
  if (/^[\d\s+\-×÷().\/]+$/.test(q) && q.includes("("))
    return `괄호 안을 먼저 계산해요. 답: ${a}`;

  // 키워드 유형
  if (q.includes("최대공약수")) return `두 수를 모두 나누는 가장 큰 수를 찾아요. 답: ${a}`;
  if (q.includes("최소공배수") || q.includes("함께 오는")) return `두 수의 공통 배수 중 가장 작은 수예요. 답: ${a}`;
  if (q.includes("기약분수")) return `분자와 분모를 최대공약수로 나눠요. 답: ${a}`;
  if (q.includes("%") || q.includes("할인")) return `1%는 전체÷100! 그 다음 곱해요. 답: ${a}`;
  if (q.includes("쌓기나무")) return `가로 × 세로 × 높이만큼 필요해요. 답: ${a}`;
  if (q.includes("부피")) return `부피 = 가로 × 세로 × 높이. 답: ${a}`;
  if (q.includes("겉넓이")) return `여섯 면의 넓이를 모두 더해요(마주보는 면은 같아요). 답: ${a}`;
  if (q.includes("둘레") && !q.includes("원")) return `둘레 = (가로 + 세로) × 2. 답: ${a}`;
  if (q.includes("삼각형") && q.includes("넓이")) return `삼각형 넓이 = 밑변 × 높이 ÷ 2. 답: ${a}`;
  if (q.includes("사다리꼴")) return `(윗변 + 아랫변) × 높이 ÷ 2. 답: ${a}`;
  if (q.includes("평행사변형")) return `평행사변형 넓이 = 밑변 × 높이. 답: ${a}`;
  if (q.includes("원주")) return `원주 = 지름 × 원주율(3.14). 답: ${a}`;
  if (q.includes("원의 넓이")) return `원의 넓이 = 반지름 × 반지름 × 3.14. 답: ${a}`;
  if (q.includes("넓이")) return `넓이 공식을 떠올려 보세요. 답: ${a}`;
  if (q.includes("평균")) return `평균 = 전체 합 ÷ 개수. 답: ${a}`;
  if (q.includes("거스름돈")) return `낸 돈 - (가격 × 개수)를 계산해요. 답: ${a}`;
  if (q.includes("시속") || q.includes("km")) return `거리 = 속력 × 시간. 답: ${a}`;
  if (q.includes("비례") || (q.includes(":") && q.includes("□"))) return `비례식은 바깥끼리·안쪽끼리 곱이 같아요. 답: ${a}`;
  if (q.includes("간단한 비")) return `두 수를 최대공약수로 나눠요. 답: ${a}`;
  if (q.includes("나누면") && q.includes(":")) return `전체를 비의 합으로 나눈 뒤 각 몫을 곱해요. 답: ${a}`;
  if (q.includes("나머지")) return `나눗셈에서 나누고 남는 수가 나머지예요. 답: ${a}`;
  if (q.includes("몫")) return `나눗셈의 결과(몇 번 들어가는지)가 몫이에요. 답: ${a}`;
  if (q.includes("올림") || q.includes("버림") || q.includes("반올림")) return `어림할 자리 바로 아래 자리를 보세요. 답: ${a}`;
  if (q.includes("□")) return `□를 구하려면 반대 연산을 해보세요. 답: ${a}`;
  if (q.includes("각")) return `삼각형 세 각의 합은 180°, 사각형은 360°예요. 답: ${a}`;
  if (q.includes("분")) return `1시간 = 60분, 1분 = 60초! 답: ${a}`;
  if (q.includes("cm")) return `1m = 100cm! 답: ${a}`;
  if (q.includes("mL")) return `1L = 1000mL! 답: ${a}`;
  if (q.includes("g")) return `1kg = 1000g! 답: ${a}`;
  return `정답은 ${a}! 다음에 비슷한 문제가 다시 나와요.`;
}

// ---------- 유형 분류 (취약점 통계·오답노트 라벨) ----------
export function classifyProblem(q) {
  if (/\d+\/\d+.*÷|÷.*\d+\/\d+/.test(q)) return "분수 나눗셈";
  if (/\d+\/\d+.*×|×.*\d+\/\d+/.test(q)) return "분수 곱셈";
  if (/\d+\/\d+/.test(q) && /[+\-]/.test(q)) return "분수 덧셈·뺄셈";
  if (/진분수|가분수|대분수/.test(q)) return "분수 개념";
  if (/\d\.\d.*÷|÷.*\d\.\d/.test(q)) return "소수 나눗셈";
  if (/\d\.\d.*×|×.*\d\.\d/.test(q)) return "소수 곱셈";
  if (/\d\.\d/.test(q)) return "소수 계산";
  if (/%|할인|백분율/.test(q)) return "백분율";
  if (/비례|간단한 비|:/.test(q)) return "비와 비례";
  if (/최대공약수|최소공배수|함께 오는/.test(q)) return "약수와 배수";
  if (/기약분수|통분/.test(q)) return "약분과 통분";
  if (/넓이|둘레|부피|겉넓이|원주|쌓기나무/.test(q)) return "도형 공식";
  if (/각기둥|각뿔|모서리|꼭짓점|다각형|대각선/.test(q)) return "도형 개념";
  if (/°|각/.test(q)) return "각도";
  if (/시속|속력|km/.test(q)) return "속력";
  if (/평균/.test(q)) return "평균";
  if (/올림|버림|반올림/.test(q)) return "어림하기";
  if (/시간|분|초/.test(q) && /몇/.test(q)) return "시간 단위";
  if (/m|cm|L|mL|kg|g/.test(q) && /몇/.test(q)) return "단위 변환";
  if (/나머지|몫/.test(q)) return "나눗셈";
  if (/□/.test(q)) return "□ 구하기";
  if (/×/.test(q)) return "곱셈";
  if (/÷/.test(q)) return "나눗셈";
  if (/\+/.test(q)) return "덧셈";
  if (/-/.test(q)) return "뺄셈";
  return "기타";
}

// ---------- 저장소 ----------
function storage() {
  try {
    if (typeof localStorage !== "undefined" && typeof localStorage.getItem === "function")
      return localStorage;
  } catch { /* SSR·프라이빗 모드에서는 접근 자체가 throw */ }
  return null;
}

/** 로컬 기준 '오늘'을 정수 일련번호로. UTC로 계산하면 한국 시각 오전 9시 이전이
 *  전날로 잡혀 하루 간격이 어긋난다. */
export function todayIndex(now = Date.now()) {
  const d = new Date(now);
  return Math.floor((now - d.getTimezoneOffset() * 60000) / 86400000);
}

// ---------- ③ 날짜 단위 간격 반복 (라이트너 상자) ----------
// box 0 → 1일 뒤, 1 → 3일, 2 → 7일, 3 → 16일. 마지막 상자를 맞히면 졸업(노트에서 제거).
export const BOX_DAYS = [1, 3, 7, 16];
export const MAX_BOX = BOX_DAYS.length;

const NOTE_KEY = "mathcastle:wrongnote";
const STATS_KEY = "mathcastle:learnstats";
// v8: 단원별 성취도. 유형(classifyProblem)과 별개다 — 유형은 문장 모양에서 뽑은
//     휴리스틱이고, 단원(u)은 교육과정 그대로다. 학부모·교사에게 보여줄 수 있는 건 후자다.
const UNIT_STATS_KEY = "mathcastle:unitstats";
const NOTE_VERSION = 2;
const NOTE_CAP = 60;
const SEED_MAX = 8;     // 한 판에 넣을 복습 퀴즈 최대치 (구버전은 3 고정)
const SEED_MIN = 3;     // 예정일이 안 됐어도 최소 이만큼은 복습시킨다

/** 결정적 해시 — 마이그레이션 시 오답 재생성의 목표 순위를 문제마다 고정 */
function hashQ(q) {
  let h = 2166136261;
  const s = String(q);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** v1 → v2 마이그레이션.
 *  v1 항목은 {q,a,d,t}로 문제 자체를 통째로 담고 있다. 그래서 문제 파일이 바뀌어도
 *  복습은 계속 가능하다(고아가 되지 않는다). 다만 두 가지를 손본다:
 *   · 스케줄 필드(box/due/seen/ok/added)를 붙인다 — 없으면 날짜 반복이 돌지 않는다
 *   · 오답 d를 새 생성기로 갈아끼운다 — 구버전 d는 정답을 좌우로 감싸는 대칭 오답이라
 *     그대로 두면 복습 문제만 계속 "가운데 찍기"로 뚫린다 */
function migrateEntryV1(e, today) {
  const q = String(e.q ?? "");
  const a = String(e.a ?? "");
  let d = Array.isArray(e.d) ? e.d.map(String).filter((x) => x !== a) : [];
  try {
    const fresh = buildDistractors(q, a, hashQ(q) % 4);
    if (fresh.d.length === 3) d = fresh.d;
  } catch { /* 실패하면 구 오답을 그대로 쓴다 — 복습이 막히는 것보다 낫다 */ }
  return { q, a, d: d.slice(0, 3), t: e.t || 2, box: 0, due: today, seen: 0, ok: 0, added: today };
}

function migrateV1(dataV1, today) {
  const out = {};
  for (const [key, list] of Object.entries(dataV1 || {})) {
    if (!Array.isArray(list)) continue;
    // 구 학년 키("5")는 1학기 키("5-1")로 승계 — stageProgress와 같은 규칙
    const k = /^\d$/.test(key) ? `${key}-1` : key;
    const merged = out[k] || [];
    for (const e of list) {
      if (!e || !e.q) continue;
      if (merged.some((m) => m.q === e.q)) continue;
      merged.push(migrateEntryV1(e, today));
    }
    out[k] = merged.slice(0, NOTE_CAP);
  }
  return out;
}

/** 라운드로빈 티켓 — 예정일이 같은 문항이 여럿일 때 "가장 오래 안 나온 것"을 고르기 위한 값.
 *  이게 없으면 예정일이 전부 같은 날(하루에 여러 판 플레이·같은 날 몰아서 틀림)일 때
 *  배열 앞쪽 3개만 무한 반복되고 나머지는 영영 안 나온다(v7 시뮬로 실측: 50개 중 47개 미출제). */
function readWrapped() {
  const s = storage();
  if (!s) return { data: {}, rr: 0 };
  let raw;
  try { raw = JSON.parse(s.getItem(NOTE_KEY)); } catch { return { data: {}, rr: 0 }; }
  if (!raw || !raw.data) return { data: {}, rr: 0 };
  if (raw.version === NOTE_VERSION) return { data: raw.data, rr: raw.rr || 0 };
  if (raw.version === 1) {
    const migrated = migrateV1(raw.data, todayIndex());
    writeNotes(migrated, 0);         // 한 번만 변환하고 즉시 굳힌다
    return { data: migrated, rr: 0 };
  }
  return { data: {}, rr: 0 };
}

function readNotes() {
  return readWrapped().data;
}

function writeNotes(data, rr) {
  const s = storage();
  if (!s) return;
  const ticket = rr == null ? readWrapped().rr : rr;
  try { s.setItem(NOTE_KEY, JSON.stringify({ version: NOTE_VERSION, rr: ticket, data })); }
  catch (e) { console.warn("오답노트 저장 실패:", e); }
}

// ---------- 세션 상태 ----------
const REVIEW_INTERVALS = [3, 7, 15];   // 세션 내 확장 간격 (웨이브)
const wrongQueue = [];                 // { problem, dueWave, stage, fromNote, pending }
const sessionWrongs = [];              // 이번 판에서 틀린 문제 (게임오버 화면용)
let currentDifficulty = null;

export const stats = { correct: 0, wrong: 0, reviewCleared: 0, wrongByType: {} };

/** 판 시작 — 초기화 + 오답노트에서 복습 퀴즈 시드. 시드된 문항 수를 돌려준다. */
export function startSession(difficulty) {
  resetQueue();
  currentDifficulty = difficulty == null ? null : String(difficulty);
  return seedReviewFromNote(currentDifficulty);
}

export function resetQueue() {
  wrongQueue.length = 0;
  sessionWrongs.length = 0;
  stats.correct = 0;
  stats.wrong = 0;
  stats.reviewCleared = 0;
  stats.wrongByType = {};
}

// ---------- ② 세션 내 확장 간격 재출제 ----------
export function recordWrong(problem, currentWave, fromNote = false) {
  if (!problem || !problem.q) return;
  if (!sessionWrongs.some((w) => w.q === problem.q))
    sessionWrongs.push({ q: problem.q, a: problem.a, d: problem.d, t: problem.t });

  const type = classifyProblem(problem.q);
  stats.wrongByType[type] = (stats.wrongByType[type] || 0) + 1;
  stats.wrong++;
  bumpCumulative(type, false);
  bumpUnit(problem.u, false);

  // 라이트너: 틀리면 처음으로 되돌린다 (구버전은 반대로 간격을 늘렸다)
  const existing = wrongQueue.find((w) => w.problem.q === problem.q);
  if (existing) {
    existing.stage = 0;
    existing.dueWave = currentWave + REVIEW_INTERVALS[0];
    existing.pending = false;
    existing.fromNote = existing.fromNote || fromNote;
  } else {
    wrongQueue.push({
      problem, dueWave: currentWave + REVIEW_INTERVALS[0],
      stage: 0, fromNote, pending: false,
    });
  }
  noteOnWrong(problem);
}

export function recordCorrect(problem, currentWave = 0, isReview = false) {
  stats.correct++;
  if (isReview) stats.reviewCleared++;
  if (!problem || !problem.q) return;
  bumpCumulative(classifyProblem(problem.q), true);
  bumpUnit(problem.u, true);

  const idx = wrongQueue.findIndex((w) => w.problem.q === problem.q);
  if (idx !== -1) {
    const e = wrongQueue[idx];
    e.stage++;
    if (e.stage >= REVIEW_INTERVALS.length) {
      wrongQueue.splice(idx, 1);                             // 세션 내 졸업 — 오늘은 그만
    } else {
      e.dueWave = currentWave + REVIEW_INTERVALS[e.stage];   // 3 → 7 → 15로 확장
      e.pending = false;
    }
  }
  noteOnCorrect(problem);
}

/** 재출제 시점이 된 복습 문제. ⚠️ 큐에서 빼지 않는다 —
 *  빼버리면 채점할 때 항목을 못 찾아 간격이 영영 3에 고정된다(구버전 실측 버그). */
export function popDueReview(currentWave) {
  const idx = wrongQueue.findIndex((w) => !w.pending && currentWave >= w.dueWave);
  if (idx === -1) return null;
  const e = wrongQueue[idx];
  e.pending = true;                    // 채점될 때까지 다시 뽑히지 않게
  return { problem: e.problem, fromNote: !!e.fromNote };
}

export function pendingReviewCount() {
  return wrongQueue.length;
}

/** 세션 내 복습 스케줄 (QA·디버그용) */
export function reviewSchedule() {
  return wrongQueue.map((w) => ({ q: w.problem.q, stage: w.stage, dueWave: w.dueWave }));
}

// ---------- ④ 오답노트 ----------
function noteList(difficulty) {
  const all = readNotes();
  return all[String(difficulty)] || [];
}

function saveList(difficulty, list) {
  const all = readNotes();
  all[String(difficulty)] = list;
  writeNotes(all);
}

/** 캡 초과 시 "가장 잘 외운 것"부터 버린다.
 *  구버전은 오래된 것부터 밀어내 정작 계속 틀리는 문제를 잃었다. */
function trim(list) {
  if (list.length <= NOTE_CAP) return list;
  const scored = [...list].sort((a, b) => {
    if ((a.box || 0) !== (b.box || 0)) return (b.box || 0) - (a.box || 0); // 익숙한 것 먼저 버림
    return (b.due || 0) - (a.due || 0);                                    // 예정일 먼 것 먼저
  });
  const drop = new Set(scored.slice(0, list.length - NOTE_CAP));
  return list.filter((e) => !drop.has(e));
}

function noteOnWrong(problem) {
  if (currentDifficulty == null) return;
  const today = todayIndex();
  const list = noteList(currentDifficulty);
  const e = list.find((x) => x.q === problem.q);
  if (e) {
    e.box = 0;                       // 라이트너: 틀리면 1번 상자로
    e.due = today + BOX_DAYS[0];
    e.seen = (e.seen || 0) + 1;
  } else {
    list.push({
      q: problem.q, a: problem.a,
      d: Array.isArray(problem.d) ? problem.d.slice(0, 3) : [],
      t: problem.t || 2,
      box: 0, due: today + BOX_DAYS[0], seen: 1, ok: 0, added: today,
    });
  }
  saveList(currentDifficulty, trim(list));
}

function noteOnCorrect(problem) {
  if (currentDifficulty == null) return;
  const today = todayIndex();
  const list = noteList(currentDifficulty);
  const i = list.findIndex((x) => x.q === problem.q);
  if (i === -1) return;              // 노트에 없는 문제를 맞힌 건 기록할 게 없다
  const e = list[i];
  e.seen = (e.seen || 0) + 1;
  e.ok = (e.ok || 0) + 1;
  e.box = (e.box || 0) + 1;
  if (e.box >= MAX_BOX) list.splice(i, 1);          // 졸업 — 노트에서 제거
  else e.due = today + BOX_DAYS[e.box];
  saveList(currentDifficulty, list);
}

/** 오늘 복습 예정인 문항 수 (UI 안내용) */
export function dueTodayCount(difficulty) {
  const today = todayIndex();
  return noteList(difficulty).filter((e) => (e.due ?? 0) <= today).length;
}

/** 판 시작 시 복습 퀴즈 시드.
 *  예정일이 지난 것부터(오래 밀린 순) 최대 SEED_MAX개.
 *  예정일 도래분이 SEED_MIN보다 적으면 가장 가까운 것으로 채운다
 *  (게임이라 매 판 복습이 아예 없으면 학습 루프가 끊긴다). */
export function seedReviewFromNote(difficulty) {
  if (difficulty == null) return 0;
  const today = todayIndex();
  const wrapped = readWrapped();
  const stored = wrapped.data[String(difficulty)] || [];
  // 1순위 = 예정일이 이른 것, 2순위 = 가장 오래 안 나온 것(라운드로빈)
  const list = [...stored].sort(
    (a, b) => ((a.due ?? 0) - (b.due ?? 0)) || ((a.rr ?? 0) - (b.rr ?? 0)),
  );
  const due = list.filter((e) => (e.due ?? 0) <= today);
  const picks = due.length >= SEED_MIN
    ? due.slice(0, SEED_MAX)
    : list.slice(0, Math.min(SEED_MIN, list.length));

  let rr = wrapped.rr || 0;
  picks.forEach((p, i) => {
    p.rr = ++rr;                      // 방금 나왔으니 대기열 맨 뒤로
    wrongQueue.push({
      problem: { q: p.q, a: p.a, d: p.d, t: p.t },
      dueWave: i + 1, stage: 0, fromNote: true, pending: false,
    });
  });
  if (picks.length) writeNotes(wrapped.data, rr);
  return picks.length;
}

export function getWrongNote(difficulty) {
  return noteList(difficulty);
}

export function getSessionWrongs() {
  return [...sessionWrongs];
}

// v8: saveWrongNote()/clearFromNote()는 no-op 스텁이면서 호출부에는
// "종료 전 오답노트 저장"이라는 주석이 붙어 있었다. 실제 저장은 매 문항 즉시
// writeNotes()가 한다. 있지도 않은 저장 시점을 코드가 거짓으로 알리고 있어서
// 스텁과 호출부를 모두 지웠다.

// ---------- ⑤ 통계 ----------
export function accuracyText() {
  const total = stats.correct + stats.wrong;
  if (!total) return "";
  return `정답률 ${Math.round((stats.correct / total) * 100)}% (${stats.correct}/${total})${stats.reviewCleared ? ` · 복습 성공 ${stats.reviewCleared}` : ""}`;
}

/** 누적 통계 — 판이 끝나도 남는다. 구버전은 매 판 초기화돼 약점 추적이 불가능했다. */
function readCumulative() {
  const s = storage();
  if (!s) return {};
  try {
    const raw = JSON.parse(s.getItem(STATS_KEY));
    return raw && raw.version === 1 && raw.data ? raw.data : {};
  } catch { return {}; }
}

function bumpCumulative(type, ok) {
  const s = storage();
  if (!s || currentDifficulty == null) return;
  try {
    const all = readCumulative();
    const k = String(currentDifficulty);
    const byType = (all[k] = all[k] || {});
    const rec = (byType[type] = byType[type] || { ok: 0, no: 0 });
    if (ok) rec.ok++; else rec.no++;
    s.setItem(STATS_KEY, JSON.stringify({ version: 1, data: all }));
  } catch { /* 저장 실패해도 게임은 계속 */ }
}

export function getCumulative(difficulty) {
  return readCumulative()[String(difficulty)] || {};
}

// ---------- v8: 단원별 성취도 ----------
function readUnitStats() {
  const s = storage();
  if (!s) return {};
  try {
    const raw = JSON.parse(s.getItem(UNIT_STATS_KEY));
    return raw && raw.version === 1 && raw.data ? raw.data : {};
  } catch { return {}; }
}

function bumpUnit(unit, ok) {
  const s = storage();
  if (!s || currentDifficulty == null || !unit) return;
  try {
    const all = readUnitStats();
    const k = String(currentDifficulty);
    const byUnit = (all[k] = all[k] || {});
    const rec = (byUnit[unit] = byUnit[unit] || { ok: 0, no: 0 });
    if (ok) rec.ok++; else rec.no++;
    s.setItem(UNIT_STATS_KEY, JSON.stringify({ version: 1, data: all }));
  } catch { /* 저장 실패해도 게임은 계속 */ }
}

/** 단원별 누적 성취도 { 단원코드: {ok, no} } */
export function getUnitStats(difficulty) {
  return readUnitStats()[String(difficulty)] || {};
}

/** 전 학기 통틀어 푼 문제 수 (학습 기록 화면용) */
export function totalSolved() {
  const all = readUnitStats();
  let ok = 0, no = 0;
  for (const byUnit of Object.values(all))
    for (const r of Object.values(byUnit)) { ok += r.ok || 0; no += r.no || 0; }
  return { ok, no, total: ok + no };
}

/** 취약 유형 한 줄 — 이번 판이 아니라 누적 기록에서 뽑는다(표본이 커야 의미가 있다) */
export function weaknessText(difficulty = currentDifficulty) {
  const cum = getCumulative(difficulty);
  const rows = Object.entries(cum)
    .map(([type, r]) => ({ type, n: r.ok + r.no, rate: r.no / Math.max(1, r.ok + r.no) }))
    .filter((r) => r.n >= 4 && r.rate > 0.3)
    .sort((a, b) => b.rate - a.rate);
  if (!rows.length) {
    // 누적이 아직 얇으면 이번 판 기록으로 대신한다
    const e = Object.entries(stats.wrongByType).sort((a, b) => b[1] - a[1]);
    if (!e.length || e[0][1] < 2) return "";
    return `📌 "${e[0][0]}" 유형에서 많이 틀렸어요. 다음 판에서 복습해 보세요!`;
  }
  const top = rows[0];
  return `📌 누적 취약 유형: "${top.type}" (정답률 ${Math.round((1 - top.rate) * 100)}%, ${top.n}문제)`;
}
