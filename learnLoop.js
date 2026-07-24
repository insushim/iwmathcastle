// learnLoop.js — 실제 학습 향상 루프 (v5 신규 · v6 확장)
// ① 오답 시 한 줄 풀이 힌트  ② 간격 반복 재출제 큐 (v6: 맞힐 때까지 3→7→15웨이브)
// ③ 세션 학습 통계 + 유형별 취약점  ④ 오답노트 (localStorage 영속 + 다음 판 복습 퀴즈)

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
  if (q.includes("둘레") && !q.includes("원")) return `둘레 = (가로 + 세로) × 2. 답: ${a}`;
  if (q.includes("삼각형") && q.includes("넓이")) return `삼각형 넓이 = 밑변 × 높이 ÷ 2. 답: ${a}`;
  if (q.includes("사다리꼴")) return `(윗변 + 아랫변) × 높이 ÷ 2. 답: ${a}`;
  if (q.includes("평행사변형")) return `평행사변형 넓이 = 밑변 × 높이. 답: ${a}`;
  if (q.includes("원주")) return `원주 = 지름 × 원주율(3.14). 답: ${a}`;
  if (q.includes("원의 넓이")) return `원의 넓이 = 반지름 × 반지름 × 3.14. 답: ${a}`;
  if (q.includes("넓이")) return `넓이 공식을 떠올려 보세요. 답: ${a}`;
  if (q.includes("평균")) return `평균 = 전체 합 ÷ 개수. 답: ${a}`;
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
  if (/최대공약수|최소공배수/.test(q)) return "약수와 배수";
  if (/기약분수|통분/.test(q)) return "약분과 통분";
  if (/넓이|둘레|부피|겉넓이|원주/.test(q)) return "도형 공식";
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

// ---------- ② 간격 반복 재출제 큐 (v6: 맞힐 때까지 3→7→15) ----------
const REVIEW_INTERVALS = [3, 7, 15];
const wrongQueue = []; // { problem, dueWave, stage }

export function recordWrong(problem, currentWave, fromNote = false) {
  // 세션 오답노트 기록 (중복 제외)
  if (!sessionWrongs.some((w) => w.q === problem.q)) {
    sessionWrongs.push({ q: problem.q, a: problem.a, d: problem.d, t: problem.t });
  }
  stats.wrongByType[classifyProblem(problem.q)] =
    (stats.wrongByType[classifyProblem(problem.q)] || 0) + 1;
  stats.wrong++;

  // 재출제 큐: 이미 있으면 다음 간격으로 승급 (맞힐 때까지 3→7→15)
  const existing = wrongQueue.find((w) => w.problem.q === problem.q);
  if (existing) {
    existing.stage = Math.min(existing.stage + 1, REVIEW_INTERVALS.length - 1);
    existing.dueWave = currentWave + REVIEW_INTERVALS[existing.stage];
    existing.fromNote = existing.fromNote || fromNote;
    return;
  }
  // v6 교차검증 수정: 노트 복습 문제를 또 틀려도 fromNote 유지 (재도전 시 보너스 골드 계속)
  wrongQueue.push({ problem, dueWave: currentWave + REVIEW_INTERVALS[0], stage: 0, fromNote });
}

export function recordCorrect(isReview) {
  stats.correct++;
  if (isReview) stats.reviewCleared++;
}

// 재출제 시점 도래한 복습 문제 반환 (없으면 null)
// v6: { problem, fromNote } — fromNote는 지난 판 오답노트에서 온 복습 퀴즈(보너스 골드 대상)
export function popDueReview(currentWave) {
  const idx = wrongQueue.findIndex((w) => currentWave >= w.dueWave);
  if (idx === -1) return null;
  const [entry] = wrongQueue.splice(idx, 1);
  return { problem: entry.problem, fromNote: !!entry.fromNote };
}

export function pendingReviewCount() {
  return wrongQueue.length;
}

export function resetQueue() {
  wrongQueue.length = 0;
  sessionWrongs.length = 0;
  stats.correct = 0;
  stats.wrong = 0;
  stats.reviewCleared = 0;
  stats.wrongByType = {};
}

// ---------- ③ 세션 학습 통계 ----------
export const stats = { correct: 0, wrong: 0, reviewCleared: 0, wrongByType: {} };

export function accuracyText() {
  const total = stats.correct + stats.wrong;
  if (!total) return "";
  return `정답률 ${Math.round((stats.correct / total) * 100)}% (${stats.correct}/${total})${stats.reviewCleared ? ` · 복습 성공 ${stats.reviewCleared}` : ""}`;
}

// 취약 유형 한 줄 (오답 2회 이상인 최다 유형)
export function weaknessText() {
  const entries = Object.entries(stats.wrongByType).sort((a, b) => b[1] - a[1]);
  if (!entries.length || entries[0][1] < 2) return "";
  return `📌 "${entries[0][0]}" 유형에서 많이 틀렸어요. 다음 판에서 복습해 보세요!`;
}

// ---------- ④ 오답노트 (localStorage 영속) ----------
const sessionWrongs = []; // 이번 판 틀린 문제 전부 {q,a,d,t}
const NOTE_KEY = "mathcastle:wrongnote";
const NOTE_CAP = 50;

export function getSessionWrongs() {
  return [...sessionWrongs];
}

function readNotes() {
  try {
    const wrapped = JSON.parse(localStorage.getItem(NOTE_KEY));
    if (wrapped && wrapped.version === 1 && wrapped.data) return wrapped.data;
  } catch {}
  return {};
}

// 세션 종료 시 이번 판 오답을 학기별 노트에 병합 (최근 것 우선, 50문항 캡)
export function saveWrongNote(difficulty) {
  if (!sessionWrongs.length) return;
  try {
    const all = readNotes();
    const k = String(difficulty);
    const prev = all[k] || [];
    const merged = [...sessionWrongs];
    for (const p of prev) {
      if (merged.length >= NOTE_CAP) break;
      if (!merged.some((w) => w.q === p.q)) merged.push(p);
    }
    all[k] = merged.slice(0, NOTE_CAP);
    localStorage.setItem(NOTE_KEY, JSON.stringify({ version: 1, data: all }));
  } catch {}
}

export function getWrongNote(difficulty) {
  return readNotes()[String(difficulty)] || [];
}

// 노트에서 문제 제거 (복습 성공 시)
export function clearFromNote(difficulty, q) {
  try {
    const all = readNotes();
    const k = String(difficulty);
    if (!all[k]) return;
    all[k] = all[k].filter((p) => p.q !== q);
    localStorage.setItem(NOTE_KEY, JSON.stringify({ version: 1, data: all }));
  } catch {}
}

// 게임 시작 시: 지난 판 오답 최대 3문항을 웨이브 1·2·3 복습 퀴즈로 시드 (보너스 골드)
export function seedReviewFromNote(difficulty) {
  const note = getWrongNote(difficulty);
  const picks = note.slice(0, 3);
  picks.forEach((p, i) => {
    wrongQueue.push({ problem: p, dueWave: i + 1, stage: 0, fromNote: true });
  });
  return picks.length;
}
