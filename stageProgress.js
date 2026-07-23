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
  return readAll()[String(difficulty)] || { highest: 1, checkpoints: {} };
}

/** 스테이지 클리어 시 다음 스테이지 시작 스냅샷 기록 (재클리어 시 덮어씀 = 더 좋아진 상태 반영) */
export function recordCheckpoint(difficulty, stage, snapshot) {
  const all = readAll();
  const k = String(difficulty);
  const cur = all[k] || { highest: 1, checkpoints: {} };
  cur.checkpoints[String(stage)] = snapshot;
  cur.highest = Math.max(cur.highest, stage);
  all[k] = cur;
  writeAll(all);
}

export function getCheckpoint(difficulty, stage) {
  return getProgress(difficulty).checkpoints[String(stage)] || null;
}
