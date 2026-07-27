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

// ---------- 이름 검증 (v7: 블랙리스트 → 화이트리스트) ----------
// 2026-07-27, 불특정 다수 초등학생 공개 대비로 자유 입력을 폐지했다.
// 구버전은 금지어 22개를 부분문자열로 걸렀는데, 초성 변형(ㅆㅂ)·자모 분리·영어 우회,
// 그리고 무엇보다 "타인 실명 + 비하"(○○○바보) 조합을 원리적으로 못 막는다.
// 이제 클라이언트는 nickname.js 목록으로 만든 조합만 보내고, 서버는 그 목록으로
// 만들 수 있는 문자열만 받는다 — API를 직접 호출해도 같은 관문을 지난다.
export { isGeneratedNick } from "../../nickname.js";

// 화이트리스트가 제로폭·전각 우회를 이미 막지만(목록에 없는 문자는 곧 불일치),
// 정규화는 유지한다 — 주·월간 GROUP BY name 집계가 표기 차이로 갈라지지 않게.
const ZERO_WIDTH = /[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff\u00ad]/g;

export function normalizeName(name) {
  return String(name ?? "")
    .normalize("NFKC")
    .replace(ZERO_WIDTH, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- IP 해시 (개인정보 최소화) ----------
// 레이트리밋에 필요한 건 "같은 출처인가"뿐이고 IP 원문은 필요 없다. 원문 대신
// 일자별 솔트를 섞은 SHA-256 앞 8바이트를 저장한다 — 행은 1시간 뒤 삭제되고,
// 날짜가 바뀌면 같은 IP도 다른 값이 되어 장기 추적이 불가능하다.
// (submit_log는 어떤 응답에도 실리지 않는다. 저장 자체를 줄이는 조치다.)
export async function hashIp(ip, dayKey = kstDayKey()) {
  const data = new TextEncoder().encode(`mathcastle:rl:${dayKey}:${ip}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf).slice(0, 8))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
