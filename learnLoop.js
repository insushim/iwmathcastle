// learnLoop.js — 실제 학습 향상 루프 (v5 신규)
// ① 오답 시 한 줄 풀이 힌트  ② 틀린 문제 간격 반복 재출제 큐  ③ 세션 학습 통계

// ---------- ① 유형별 풀이 힌트 ----------
export function getSolutionHint(q, a) {
  // 순수 산술식 → 실제 풀이 단계 제시
  const m = q.match(/^(\d+(?:\.\d+)?|\d+\/\d+)\s*([+\-×÷])\s*(\d+(?:\.\d+)?|\d+\/\d+)/);
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
  // 키워드 유형
  if (q.includes("최대공약수")) return `두 수를 모두 나누는 가장 큰 수를 찾아요. 답: ${a}`;
  if (q.includes("최소공배수")) return `두 수의 공통 배수 중 가장 작은 수예요. 답: ${a}`;
  if (q.includes("기약분수")) return `분자와 분모를 최대공약수로 나눠요. 답: ${a}`;
  if (q.includes("%") || q.includes("할인")) return `1%는 전체÷100! 그 다음 곱해요. 답: ${a}`;
  if (q.includes("부피")) return `부피 = 가로 × 세로 × 높이. 답: ${a}`;
  if (q.includes("겉넓이")) return `여섯 면의 넓이를 모두 더해요(마주보는 면은 같아요). 답: ${a}`;
  if (q.includes("둘레")) return `둘레 = (가로 + 세로) × 2. 답: ${a}`;
  if (q.includes("삼각형") && q.includes("넓이")) return `삼각형 넓이 = 밑변 × 높이 ÷ 2. 답: ${a}`;
  if (q.includes("사다리꼴")) return `(윗변 + 아랫변) × 높이 ÷ 2. 답: ${a}`;
  if (q.includes("평행사변형")) return `평행사변형 넓이 = 밑변 × 높이. 답: ${a}`;
  if (q.includes("넓이")) return `넓이 공식을 떠올려 보세요. 답: ${a}`;
  if (q.includes("원주")) return `원주 = 지름 × 원주율(3.14). 답: ${a}`;
  if (q.includes("원의 넓이")) return `원의 넓이 = 반지름 × 반지름 × 3.14. 답: ${a}`;
  if (q.includes("평균")) return `평균 = 전체 합 ÷ 개수. 답: ${a}`;
  if (q.includes("시속") || q.includes("km")) return `거리 = 속력 × 시간. 답: ${a}`;
  if (q.includes("비례") || (q.includes(":") && q.includes("□"))) return `비례식은 바깥끼리·안쪽끼리 곱이 같아요. 답: ${a}`;
  if (q.includes("간단한 비")) return `두 수를 최대공약수로 나눠요. 답: ${a}`;
  if (q.includes("나누면") && q.includes(":")) return `전체를 비의 합으로 나눈 뒤 각 몫을 곱해요. 답: ${a}`;
  if (q.includes("나머지")) return `나눗셈에서 나누고 남는 수가 나머지예요. 답: ${a}`;
  if (q.includes("몫")) return `나눗셈의 결과(몇 번 들어가는지)가 몫이에요. 답: ${a}`;
  if (q.includes("□")) return `□를 구하려면 반대 연산을 해보세요. 답: ${a}`;
  if (q.includes("각")) return `삼각형 세 각의 합은 180°예요. 답: ${a}`;
  if (q.includes("분")) return `1시간 = 60분! 답: ${a}`;
  if (q.includes("cm")) return `1m = 100cm! 답: ${a}`;
  return `정답은 ${a}! 다음에 비슷한 문제가 다시 나와요.`;
}

// ---------- ② 간격 반복 재출제 큐 ----------
const wrongQueue = []; // { problem, dueWave }
const REVIEW_DELAY_WAVES = 3; // 오답 후 3웨이브 뒤 재출제

export function recordWrong(problem, currentWave) {
  // 같은 문제 중복 등록 방지
  if (wrongQueue.some((w) => w.problem.q === problem.q)) return;
  wrongQueue.push({ problem, dueWave: currentWave + REVIEW_DELAY_WAVES });
  stats.wrong++;
}

export function recordCorrect(isReview) {
  stats.correct++;
  if (isReview) stats.reviewCleared++;
}

// 재출제 시점 도래한 복습 문제 반환 (없으면 null)
export function popDueReview(currentWave) {
  const idx = wrongQueue.findIndex((w) => currentWave >= w.dueWave);
  if (idx === -1) return null;
  return wrongQueue.splice(idx, 1)[0].problem;
}

export function pendingReviewCount() {
  return wrongQueue.length;
}

export function resetQueue() {
  wrongQueue.length = 0;
  stats.correct = 0;
  stats.wrong = 0;
  stats.reviewCleared = 0;
}

// ---------- ③ 세션 학습 통계 ----------
export const stats = { correct: 0, wrong: 0, reviewCleared: 0 };

export function accuracyText() {
  const total = stats.correct + stats.wrong;
  if (!total) return "";
  return `정답률 ${Math.round((stats.correct / total) * 100)}% (${stats.correct}/${total})${stats.reviewCleared ? ` · 복습 성공 ${stats.reviewCleared}` : ""}`;
}
