// blessing.js — 스테이지(5웨이브)마다 고르는 "이번 판 한정" 축복
//
// 왜 넣는가: 매 판이 같은 곡선이면 두 번째 판부터 새로울 게 없다. 축복은 판마다
// 다른 조합을 만들어 "한 판 더"를 만든다.
//
// 🔒 무엇을 **넣지 않았는가**가 이 파일의 핵심이다 (v9 교차검증 3계열 합의):
//  · 골드 계열 금지 — 처치 골드/정답 보상 비율을 건드리면 "수학을 포기해도 돈이 도는"
//    구조로 되돌아간다. 그 연결이 v8의 존재 이유다.
//  · 상자 확률 계열 금지 — ui.js가 아이에게 **고정 확률표**를 그대로 보여준다.
//    축복으로 확률이 변하면 그 표가 거짓말이 된다(사행성 방어선을 스스로 뚫는 셈).
//  · 집중력 계수 금지 — 학습→화력 연결의 기울기 자체는 건드리지 않는다.
// 남은 건 순수 전투 유틸뿐이고, 그 영향은 tools/accuracy-sweep.mjs가 **최악 선택**
// 시나리오로 모델링해 정답률 격차가 유지되는지 확인한다.
//
// 문구 규칙(초등 3~6학년): 백분율(%)·음수 기호·외래어("쿨다운")를 쓰지 않는다.
// 백분율은 5학년 2학기에나 나오고, 음수는 중학 과정이다.

export const BLESSINGS = [
  {
    id: "range",
    icon: "🏹",
    title: "멀리 보는 눈",
    desc: "모든 타워가 더 멀리 쏴요",
    max: 4,
  },
  {
    id: "wizardSpeed",
    icon: "⚡",
    title: "빠른 손놀림",
    desc: "마법사가 더 빨리 공격해요",
    max: 4,
  },
  {
    id: "heal",
    icon: "🛡️",
    title: "튼튼한 성벽",
    desc: "깨끗하게 막으면 성이 더 많이 회복돼요",
    max: 4,
  },
  {
    id: "splash",
    icon: "💥",
    title: "넓게 퍼지는 폭발",
    desc: "폭발이 더 넓게 퍼져요",
    max: 4,
  },
  {
    id: "freeze",
    icon: "❄️",
    title: "차가운 손길",
    desc: "얼음이 몬스터를 더 오래 붙잡아요",
    max: 4,
  },
];

const BY_ID = new Map(BLESSINGS.map((b) => [b.id, b]));

/** 한 단계당 효과 크기. 작게 잡았다 — 축복은 양념이지 밥이 아니다. */
export const STEP = {
  range: 0.06,        // 사거리 +6%/단계
  wizardSpeed: 0.10,  // 마법사 공격 속도 +10%/단계
  heal: 1,            // 무피해 회복 +1/단계
  splash: 0.10,       // 광역 반경 +10%/단계
  freeze: 0.15,       // 감속 지속 +15%/단계
};

export function initialState() {
  return { range: 0, wizardSpeed: 0, heal: 0, splash: 0, freeze: 0 };
}

export function normalize(raw) {
  const base = initialState();
  if (!raw || typeof raw !== "object") return base;
  for (const k of Object.keys(base)) {
    const v = Number(raw[k]);
    const cap = BY_ID.get(k)?.max ?? 4;
    base[k] = Number.isFinite(v) ? Math.max(0, Math.min(cap, Math.floor(v))) : 0;
  }
  return base;
}

/** 아직 최대치가 아닌 축복 중 3개를 고른다. rand는 테스트 주입용. */
export function offer(state, rand = Math.random, count = 3) {
  const pool = BLESSINGS.filter((b) => (state[b.id] || 0) < b.max);
  const picked = [];
  const copy = [...pool];
  while (picked.length < count && copy.length) {
    picked.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  }
  return picked;
}

export function apply(state, id) {
  const b = BY_ID.get(id);
  if (!b) return state;
  const next = { ...state };
  next[id] = Math.min(b.max, (next[id] || 0) + 1);
  return next;
}

// ── 효과 조회 (main.js와 accuracy-sweep이 **같은 함수**를 쓴다) ──
export const rangeMult = (s) => 1 + STEP.range * (s?.range || 0);
export const wizardSpeedMult = (s) => 1 + STEP.wizardSpeed * (s?.wizardSpeed || 0);
export const splashMult = (s) => 1 + STEP.splash * (s?.splash || 0);
export const freezeMult = (s) => 1 + STEP.freeze * (s?.freeze || 0);
export const healBonus = (s) => STEP.heal * (s?.heal || 0);

/** 아이에게 보여줄 현재 축복 요약(획득한 것만). */
export function summary(state) {
  return BLESSINGS.filter((b) => (state?.[b.id] || 0) > 0).map((b) => ({
    ...b, level: state[b.id],
  }));
}
