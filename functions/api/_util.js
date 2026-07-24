// functions/api/_util.js — 랭킹 API 공용 유틸 (v6)
// "_" 프리픽스 파일은 Pages Functions 라우팅에서 제외된다.

// ---------- KST 8:50 컷 날짜 키 ----------
// 등교 직후 "어제의 왕" 발표 문화: 오전 8:50 이전은 전날 랭킹으로 집계
export function kstDayKey(now = new Date()) {
  const shifted = new Date(
    now.getTime() + 9 * 3600e3 - (8 * 3600e3 + 50 * 60e3),
  );
  return shifted.toISOString().split("T")[0];
}

// ISO 주차 (월요일 시작) — 예: "2026-W30"
export function weekKeyOf(dayKey) {
  const d = new Date(dayKey + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  const thursday = new Date(d);
  thursday.setUTCDate(d.getUTCDate() - day + 3);
  const year = thursday.getUTCFullYear();
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((thursday - jan1) / 86400e3 + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

// 달력 월 — 예: "2026-07"
export function monthKeyOf(dayKey) {
  return dayKey.slice(0, 7);
}

// 다음 갱신 시각 (KST 8:50 = UTC 23:50)
export function nextUpdateTime(now = new Date()) {
  let next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 50, 0, 0),
  );
  if (now.getTime() > next.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

// ---------- 점수 상한 (치트 방어 ①) ----------
// 게임 수식 유도: 웨이브당 정답 최대 500점(100×콤보5) + 처치 최대 ≈ 5 × Σ골드(엘리트×2 포함)
// 실측 최고기록(W79 · 1,230,470)의 약 2.5배 여유를 둔 이론 상한 — 이걸 넘으면 조작
export function maxScoreForWave(wave) {
  return Math.floor(9500 * wave + 375 * wave * wave + 10000);
}

// ---------- 이름 필터 (치트 방어 ④ — 초등 배포 필수) ----------
const BANNED_SUBSTRINGS = [
  // 욕설·비속어
  "시발", "씨발", "씨빨", "쉬발", "병신", "새끼", "개새", "좆", "지랄", "븅신",
  "ㅅㅂ", "ㅄ", "ㅂㅅ", "꺼져", "닥쳐", "섹스", "야동", "자지", "보지", "따먹",
  "fuck", "shit", "bitch", "sex",
  // 교사·운영자 사칭
  "선생님", "선생", "쌤", "교장", "교감", "담임", "관리자", "운영자", "admin", "어드민",
];

// 교차검증 수정(2026-07-24, codex): 전각문자(ａｄｍｉｎ)·제로폭(선<ZWSP>생님)으로 필터가
// 즉시 우회됐다. NFKC 정규화 + 제로폭/제어문자 제거를 "저장값"에도 적용해야
// 주간·월간 GROUP BY name 도배까지 함께 막힌다.
const ZERO_WIDTH = /[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\u00ad]/g;

export function normalizeName(name) {
  return String(name ?? "")
    .normalize("NFKC")
    .replace(ZERO_WIDTH, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isNameAllowed(name) {
  const norm = normalizeName(name)
    .toLowerCase()
    .replace(/[\s\-_.·~!@#$%^&*()+=]/g, "");
  if (!norm) return false;
  return !BANNED_SUBSTRINGS.some((b) => norm.includes(b));
}

// ---------- 유효 학기 값 ----------
const VALID_DIFFICULTIES = new Set([
  "3", "4", "5", "6", // 구버전 호환
  "3-1", "3-2", "4-1", "4-2", "5-1", "5-2", "6-1", "6-2",
]);
export function normalizeDifficulty(d) {
  const s = String(d || "").trim();
  return VALID_DIFFICULTIES.has(s) ? s : null;
}
