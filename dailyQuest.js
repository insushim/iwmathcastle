// dailyQuest.js — 오늘의 도전
//
// 왜 만들었나. 이 게임에는 "내일 또 올 이유"가 코드 안에 거의 없었다.
// 오답노트 간격 반복(1·3·7·16일)은 훌륭한 재방문 훅인데, 게임을 열어야만 보이고
// "오늘의 시드"(전국 공통 웨이브 조성)는 아예 화면에 표시되지 않아 아무도 몰랐다.
//
// ⚠️ 설계 원칙 — 압박형 스트릭은 넣지 않는다.
//   "연속 3일 안 하면 초기화" 같은 장치는 초등학생에게 부적절하다. 못 온 날을
//   벌하지 않는다. 여기 있는 건 "오늘 하면 좋은 일 세 가지"와 "지금까지 해낸 날"뿐이고,
//   빠뜨린 날은 아무것도 잃지 않는다.
//
// 보상도 뽑기가 아니라 **집중력 시작 보너스**다. 학습해서 얻은 화력이라는
// 게임 전체의 원칙(simCore 집중력)과 같은 방향이다.

const KEY = "mathcastle:daily";
const VERSION = 1;

function storage() {
  try {
    if (typeof localStorage !== "undefined" && typeof localStorage.getItem === "function")
      return localStorage;
  } catch { /* 프라이빗 모드 */ }
  return null;
}

/** 한국 시각 기준 날짜 키. UTC로 계산하면 오전 9시 이전이 전날로 잡힌다. */
export function dayKey(now = Date.now()) {
  const d = new Date(now + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** 날짜에서 정해지는 결정적 난수 — 같은 날이면 전국 어디서나 같은 도전이 나온다 */
function daySeed(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// 도전 후보. progress(state)는 0~target 사이의 진행값을 돌려준다.
// state = { wave, correct, reviewCleared, maxCombo, focus, towersBuilt, bossKills }
export const QUEST_POOL = [
  { id: "wave10", icon: "🌊", target: 10, label: (t) => `웨이브 ${t} 도달`, of: (s) => s.wave },
  { id: "wave15", icon: "🌊", target: 15, label: (t) => `웨이브 ${t} 도달`, of: (s) => s.wave },
  { id: "correct12", icon: "✏️", target: 12, label: (t) => `문제 ${t}개 맞히기`, of: (s) => s.correct },
  { id: "correct20", icon: "✏️", target: 20, label: (t) => `문제 ${t}개 맞히기`, of: (s) => s.correct },
  { id: "review5", icon: "📒", target: 5, label: (t) => `복습 문제 ${t}개 성공`, of: (s) => s.reviewCleared },
  { id: "combo8", icon: "🔥", target: 8, label: (t) => `${t}연속 정답`, of: (s) => s.maxCombo },
  { id: "focus25", icon: "🎯", target: 25, label: (t) => `집중력 ${t} 달성`, of: (s) => s.focus },
  { id: "tower12", icon: "🏰", target: 12, label: (t) => `타워 ${t}개 건설`, of: (s) => s.towersBuilt },
  { id: "boss2", icon: "👹", target: 2, label: (t) => `보스 ${t}마리 처치`, of: (s) => s.bossKills },
];

/** 오늘의 도전 3개 (날짜로 결정 — 새로고침해도 안 바뀐다) */
export function todayQuests(key = dayKey()) {
  const seed = daySeed(key);
  const picked = [];
  const used = new Set();
  let s = seed;
  while (picked.length < 3 && used.size < QUEST_POOL.length) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const i = s % QUEST_POOL.length;
    if (used.has(i)) continue;
    used.add(i);
    picked.push(QUEST_POOL[i]);
  }
  return picked;
}

function read() {
  const s = storage();
  if (!s) return { version: VERSION, day: "", done: [], playedDays: [] };
  try {
    const raw = JSON.parse(s.getItem(KEY));
    if (raw && raw.version === VERSION) return raw;
  } catch { /* 깨진 값은 새로 시작 */ }
  return { version: VERSION, day: "", done: [], playedDays: [] };
}

function write(data) {
  const s = storage();
  if (!s) return;
  try { s.setItem(KEY, JSON.stringify(data)); }
  catch (e) { console.warn("오늘의 도전 저장 실패:", e); }
}

/** 오늘 완료한 도전 id 목록 */
export function completedToday(key = dayKey()) {
  const d = read();
  return d.day === key ? d.done : [];
}

/**
 * 판이 끝났거나 진행 중일 때 상태를 넘겨 도전 달성을 갱신한다.
 * @returns {Array} 이번 호출에서 **새로** 달성된 도전들
 */
export function updateProgress(state, key = dayKey()) {
  const d = read();
  if (d.day !== key) { d.day = key; d.done = []; }
  const quests = todayQuests(key);
  const newly = [];
  for (const q of quests) {
    if (d.done.includes(q.id)) continue;
    if ((q.of(state) || 0) >= q.target) { d.done.push(q.id); newly.push(q); }
  }
  // 플레이한 날 기록 (압박이 아니라 격려용 — 최근 30일만)
  if (!d.playedDays.includes(key)) {
    d.playedDays.push(key);
    if (d.playedDays.length > 30) d.playedDays.shift();
  }
  if (newly.length || d.playedDays[d.playedDays.length - 1] === key) write(d);
  return newly;
}

/** 진행 상황 요약 (메뉴 표시용) */
export function summary(state = null, key = dayKey()) {
  const quests = todayQuests(key);
  const done = new Set(completedToday(key));
  return quests.map((q) => ({
    id: q.id,
    icon: q.icon,
    text: q.label(q.target),
    target: q.target,
    now: state ? Math.min(q.target, q.of(state) || 0) : 0,
    done: done.has(q.id),
  }));
}

/** 오늘 도전을 몇 개 깼는지에 따른 다음 판 집중력 시작 보너스 (0·2·4·6) */
export const FOCUS_BONUS_PER_QUEST = 2;
export function startingFocusBonus(key = dayKey()) {
  return completedToday(key).length * FOCUS_BONUS_PER_QUEST;
}

/** 최근 며칠 플레이했는지 (격려용 — 끊겨도 아무것도 잃지 않는다) */
export function playedDayCount() {
  return read().playedDays.length;
}
