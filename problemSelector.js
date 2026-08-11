// problemSelector.js — 다음에 낼 문제를 고른다
//
// v7까지는 학기 전체 풀(2,400~2,800문항)을 한 번 셔플해 pop 하는 게 전부였다.
// 그래서:
//   · 아이가 '분수의 나눗셈'을 열 번 연속 틀려도 그 단원이 더 자주 나오지 않았다.
//     (learnLoop.weaknessText()는 게임오버 화면에 한 줄 쓰는 데만 쓰였다)
//   · 난이도가 웨이브와 무관했다. 실측: 3-1학기 웨이브 1~10 평균 t=1.892,
//     웨이브 21~30 평균 t=1.874 — 오히려 내려갔다. 첫 문제에 50초짜리 문장제가
//     나오고 막판에 20초짜리 한 줄 연산이 나오는 배치가 무작위로 벌어졌다.
//
// 세 가지를 동시에 만족시킨다.
//   ① 약점 우선   — 누적 오답률이 높은 유형·단원을 더 자주
//   ② 난이도 램프 — 웨이브가 오를수록 어려운 문항(t)
//   ③ 편중 방지   — 같은 단원이 연달아 세 번 넘게 나오지 않게
//
// ⚠️ 설계 원칙: 약점을 "더 자주" 낼 뿐, "더 어렵게" 내지 않는다.
//    약점 가중과 오답 페널티 강화를 같이 걸면 도움이 가장 필요한 아이가 가장 많이
//    맞는 역설이 된다. 그래서 페널티는 건드리지 않았고, 가중치도 상한을 둔다.

/** 웨이브 → 원하는 난이도(t) 분포.
 *  t: 1=한줄연산 2=복합 3=도형·측정 4=문장제 (숫자가 클수록 오래 걸리고 어렵다)
 *  초반은 쉬운 것으로 자신감을 쌓고, 뒤로 갈수록 문장제 비중을 올린다. */
// ⚠️ 가중치 폭이 커야 하는 이유: 고학년 학기에는 t=1(한 줄 연산) 문항이 아예 없다.
//    5-1은 t 분포가 {2:1608, 3:570, 4:430}뿐이라, 완만한 가중으로는 초반과 후반의
//    평균 난이도 차이가 0.4밖에 안 났다(실측). 풀에 없는 난이도는 못 뽑으므로
//    "있는 것 중에서" 확실히 갈라 줘야 램프가 체감된다.
export function targetTierWeights(wave) {
  if (wave <= 5) return { 1: 10, 2: 5, 3: 0.8, 4: 0.3 };
  if (wave <= 10) return { 1: 6, 2: 4, 3: 1.5, 4: 0.7 };
  if (wave <= 16) return { 1: 2, 2: 3, 3: 3, 4: 2 };
  if (wave <= 24) return { 1: 0.7, 2: 1.5, 3: 3, 4: 4.5 };
  return { 1: 0.4, 2: 1, 3: 3, 4: 7 };
}

/** 누적 통계(learnLoop.getCumulative)에서 유형별 가중치를 만든다.
 *  표본이 얇으면(4문제 미만) 판단하지 않는다 — 두 번 틀렸다고 그 단원만 쏟아지면
 *  아이 입장에서는 "왜 자꾸 어려운 것만 나오지"가 된다. */
export const WEAK_WEIGHT_MAX = 3.0;

export function weaknessWeights(cumulative, minSamples = 4) {
  const out = {};
  for (const [type, rec] of Object.entries(cumulative || {})) {
    const n = (rec.ok || 0) + (rec.no || 0);
    if (n < minSamples) continue;
    const wrongRate = (rec.no || 0) / n;
    // 오답률 0 → 1.0배, 오답률 1 → 3.0배 (선형, 상한 있음)
    out[type] = Math.min(WEAK_WEIGHT_MAX, 1 + wrongRate * (WEAK_WEIGHT_MAX - 1));
  }
  return out;
}

/**
 * 다음 문제를 고른다.
 *
 * @param {Array}  pool        후보 문항 (아직 안 낸 것들)
 * @param {Object} opts
 *   - wave        현재 웨이브
 *   - classify    (q) => 유형 문자열 (learnLoop.classifyProblem)
 *   - weakByType  유형 → 가중치 (weaknessWeights 결과)
 *   - recentUnits 최근에 낸 단원 코드 배열 (편중 방지용, 최신이 뒤)
 *   - rand        난수 (테스트 주입용)
 * @returns {{problem: Object, index: number}|null}
 */
export function pickProblem(pool, opts = {}) {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  const {
    wave = 1,
    classify = () => "기타",
    weakByType = {},
    recentUnits = [],
    rand = Math.random,
  } = opts;

  const tierW = targetTierWeights(wave);

  // 최근 3문제가 같은 단원이면 그 단원은 이번엔 강하게 낮춘다
  const lastThree = recentUnits.slice(-3);
  const overused = new Set(
    lastThree.length === 3 && lastThree.every((u) => u === lastThree[0]) ? [lastThree[0]] : [],
  );
  // 직전 문제와 같은 단원도 살짝 낮춘다 (연속 반복 체감 완화)
  const justUsed = recentUnits[recentUnits.length - 1];

  // 후보가 너무 많으면 전수 가중은 낭비다 — 무작위 표본에서 고른다.
  // 2,600문항 전부에 대해 매 문제 classify()를 돌리면 정규식 20여 개 × 2600 = 낭비.
  const SAMPLE = 120;
  const idxs = [];
  if (pool.length <= SAMPLE) {
    for (let i = 0; i < pool.length; i++) idxs.push(i);
  } else {
    const seen = new Set();
    while (idxs.length < SAMPLE) {
      const i = Math.floor(rand() * pool.length);
      if (!seen.has(i)) { seen.add(i); idxs.push(i); }
    }
  }

  let best = null, bestScore = -1, total = 0;
  const scored = [];
  for (const i of idxs) {
    const p = pool[i];
    if (!p || !p.q) continue;
    let w = tierW[p.t || 2] ?? 1;
    const type = classify(p.q);
    w *= weakByType[type] || 1;
    if (overused.has(p.u)) w *= 0.15;
    else if (p.u && p.u === justUsed) w *= 0.6;
    if (w <= 0) w = 0.01;
    scored.push({ i, w });
    total += w;
  }
  if (!scored.length) return { problem: pool[idxs[0]], index: idxs[0] };

  // 가중 무작위 추출 (항상 최고점을 뽑으면 같은 문제만 나온다)
  let r = rand() * total;
  for (const s of scored) {
    r -= s.w;
    if (r <= 0) { best = s; break; }
  }
  if (!best) best = scored[scored.length - 1];
  bestScore = best.w;
  void bestScore;
  return { problem: pool[best.i], index: best.i };
}
