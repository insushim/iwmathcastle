// stageProgress.js — 스테이지 체크포인트 로컬 저장
// 스테이지 = 5웨이브 묶음. 스테이지 클리어 순간의 전체 상태(타워·골드·마법사 등)를
// 학년(난이도)별로 localStorage(`mathcastle:stages`)에 스냅샷으로 보관한다.
// 게임오버가 나도 체크포인트는 지워지지 않으므로, 도달한 스테이지부터 타워 배치
// 그대로 다시 시작할 수 있다.

export const WAVES_PER_STAGE = 5;

export function stageOfWave(wave) {
  return Math.max(1, Math.ceil(wave / WAVES_PER_STAGE));
}

export function stageStartWave(stage) {
  return (stage - 1) * WAVES_PER_STAGE + 1;
}

export function waveInStage(wave) {
  return ((wave - 1) % WAVES_PER_STAGE) + 1;
}

const KEY = "mathcastle:stages";
const VERSION = 1;

function storage() {
  // Node 22+는 localStorage 전역이 있어도 실사용 불가 스텁일 수 있다 — getItem 호출 가능성까지 확인
  try {
    if (
      typeof localStorage !== "undefined" &&
      typeof localStorage.getItem === "function"
    ) {
      return localStorage;
    }
  } catch {
    /* 접근 자체가 throw하는 환경(SSR 등) */
  }
  return null;
}

function readAll() {
  const s = storage();
  if (!s) return {};
  try {
    const wrapped = JSON.parse(s.getItem(KEY));
    if (wrapped && wrapped.version === VERSION && wrapped.data) {
      return wrapped.data;
    }
  } catch (e) {
    console.warn("스테이지 진행 읽기 실패:", e);
  }
  return {};
}

function writeAll(data) {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify({ version: VERSION, data }));
  } catch (e) {
    // 저장 실패(용량 초과·프라이빗 모드)해도 게임은 계속된다
    console.warn("스테이지 진행 저장 실패:", e);
  }
}

/** 학년별 진행: { highest: 도달 최고 스테이지, checkpoints: { [stage]: 스테이지 시작 시점 스냅샷 } } */
export function getProgress(difficulty) {
  const all = readAll();
  const k = String(difficulty);
  // v6: 학기 키("3-1")에 진행이 없으면 구 학년 키("3") 진행을 이어받는다 (1학기만)
  const legacy = k.endsWith("-1") ? all[k.split("-")[0]] : null;
  return all[k] || legacy || { highest: 1, checkpoints: {} };
}

/** 학기당 보관할 체크포인트 최대 개수.
 *  v8: 이전에는 상한이 없어 스테이지를 클리어할수록 스냅샷(타워 배치 전체)이
 *  무한히 쌓였다. 웨이브 상한이 없는 구조라 오래 하는 아이일수록 이 키만 계속
 *  커졌고, localStorage 5MB 한도에 가장 먼저 닿을 후보였다.
 *  최근 것부터 남긴다 — 아이가 실제로 재도전하는 건 방금 죽은 근처 스테이지다. */
export const MAX_CHECKPOINTS = 12;

function pruneCheckpoints(checkpoints) {
  const keys = Object.keys(checkpoints)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a); // 높은 스테이지 = 최근
  if (keys.length <= MAX_CHECKPOINTS) return checkpoints;
  const keep = new Set(keys.slice(0, MAX_CHECKPOINTS).map(String));
  const out = {};
  for (const k of Object.keys(checkpoints)) if (keep.has(k)) out[k] = checkpoints[k];
  return out;
}

/** 스테이지 클리어 시 다음 스테이지 시작 스냅샷 기록 (재클리어 시 덮어씀 = 더 좋아진 상태 반영) */
export function recordCheckpoint(difficulty, stage, snapshot) {
  const all = readAll();
  const k = String(difficulty);
  // v6 교차검증 수정: getProgress의 구 학년 키("3") 폴백을 승계 — all[k] 직접 참조 시
  // 첫 신규 체크포인트 기록이 legacy 진행을 빈 객체로 덮어 유실하던 버그
  const cur = getProgress(difficulty);
  cur.checkpoints[String(stage)] = snapshot;
  cur.checkpoints = pruneCheckpoints(cur.checkpoints);
  cur.highest = Math.max(cur.highest, stage);
  all[k] = cur;
  writeAll(all);
}

export function getCheckpoint(difficulty, stage) {
  return getProgress(difficulty).checkpoints[String(stage)] || null;
}
