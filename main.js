// main.js - V2 Upgraded

import { gameElements, isTouchLike } from "./constants.js";
import {
  TOWER_STATS,
  MONSTER_STATS,
  WIZARD_SPELLS,
  WIZARD_AUTO_ATTACK_STATS,
  RANDOM_TOWER_TIERS,
  RANDOM_TOWER_PROBABILITY,
} from "./gameData.js";
import { mathProblems, loadGradeProblems } from "./problems.js";
import * as simCore from "./simCore.js";
import { quality, detectLowEnd, feedFrameTime } from "./perfQuality.js";
import {
  initA11y, prefersReducedMotion, tickFlashBudget, claimScreenFlash,
  setReducedMotionForTest, flashBudgetState as a11yFlashBudgetState, resetFlashBudget,
} from "./a11y.js";
import * as impactFx from "./impactFx.js";
import * as rarity from "./rarity.js";
import * as blessing from "./blessing.js";
import * as learnLoop from "./learnLoop.js";
import * as problemSelector from "./problemSelector.js";
import * as dailyQuest from "./dailyQuest.js";
import { unitName, unitsOf } from "./problems/units.js";
import * as stageProgress from "./stageProgress.js";
import { preloadSprites, getSprite } from "./spriteAssets.js";
import {
  debounce,
  showMessage,
  showUpgradeNotification,
  showModal,
  hideModal,
  getDistanceSq,
  shuffleArray,
  getAnswerType,
} from "./utils.js";
import { sfx } from "./sfx.js";
import {
  initializeFirebase,
  submitScore,
  fetchAndShowRankings,
  startGameSession,
} from "./firebase.js";
import * as ui from "./ui.js";
import { generateNickname, isGeneratedNick } from "./nickname.js";

// ---------- v7: 랭킹 닉네임 (개인정보 미수집) ----------
// 실명 입력을 없앤 이유는 nickname.js 상단 주석 참고. 뽑은 닉네임은 이 기기에만
// 저장되어 다음 판에도 같은 이름으로 랭킹에 오른다(서버에 계정은 없다).
const NICK_KEY = "mathcastle:nick";

function currentNickname() {
  let n = null;
  try {
    n = localStorage.getItem(NICK_KEY);
  } catch {
    /* 사생활 보호 모드 등 — 저장 못 해도 게임은 돈다 */
  }
  // 목록에 없는 값(구버전 실명·목록 개편 잔재)은 조용히 새로 뽑는다
  return isGeneratedNick(n) ? n : rerollNickname();
}

function rerollNickname() {
  const n = generateNickname();
  try {
    localStorage.setItem(NICK_KEY, n);
  } catch {}
  return n;
}

function paintNickname(n) {
  const el = document.getElementById("playerNickname");
  if (el) el.textContent = n;
}

// --- [V2] 새 모듈 임포트 ---
import { ParticleSystem } from "./particles.js";
import { MusicSystem } from "./music.js";
import { AchievementSystem, ComboSystem } from "./achievements.js";
// v8: 렌더러 5종(약 370KB)은 **게임에 들어간 뒤에** 받는다.
// 정적 import면 브라우저가 main.js를 실행하기 전에 이걸 전부 내려받고, 그동안
// DOMContentLoaded가 안 끝나 메뉴 버튼이 눌리지 않는다. 느린 학교 와이파이에서
// 첫 화면까지 6.1초가 걸린 주범이었다(3G 에뮬레이션 실측).
// 메뉴 화면은 이 모듈들을 하나도 쓰지 않는다.

// --- [NEW] 공간 분할(Spatial Partitioning) 클래스 ---
/**
 * 게임 월드를 그리드로 나누어 객체 충돌 및 탐색을 최적화하는 클래스.
 * 타워가 모든 몬스터를 순회하는 대신, 주변 그리드의 몬스터만 확인하도록 하여 성능을 향상시킵니다.
 */
class SpatialGrid {
  constructor(width, height, cellSize) {
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.grid = Array.from({ length: this.cols * this.rows }, () => []);
  }

  // 그리드를 초기화하여 새 프레임을 준비합니다.
  clear() {
    for (let i = 0; i < this.grid.length; i++) {
      this.grid[i].length = 0;
    }
  }

  // 주어진 좌표(x, y)에 해당하는 그리드 인덱스를 계산합니다.
  getIndex(x, y) {
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) {
      return -1; // 맵 밖은 처리하지 않음
    }
    return row * this.cols + col;
  }

  // 몬스터를 그리드에 추가합니다.
  insert(monster) {
    const index = this.getIndex(monster.x, monster.y);
    if (index !== -1) {
      this.grid[index].push(monster);
    }
  }

  // 특정 위치(x, y)와 범위(range) 내에 있는 모든 몬스터를 반환합니다.
  getNearby(x, y, range) {
    const nearbyMonsters = []; // 그리드 셀은 겹치지 않으므로 배열로 충분
    const rangeSq = range * range;

    // 탐색할 그리드 셀의 범위를 계산합니다.
    const startCol = Math.max(0, Math.floor((x - range) / this.cellSize));
    const endCol = Math.min(
      this.cols - 1,
      Math.floor((x + range) / this.cellSize),
    );
    const startRow = Math.max(0, Math.floor((y - range) / this.cellSize));
    const endRow = Math.min(
      this.rows - 1,
      Math.floor((y + range) / this.cellSize),
    );

    // 해당 범위의 셀만 순회합니다.
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const index = row * this.cols + col;
        const cell = this.grid[index];
        for (let i = 0; i < cell.length; i++) {
          nearbyMonsters.push(cell[i]);
        }
      }
    }

    return nearbyMonsters;
  }
}

// --- 게임 상태 변수 ---
let towers = [],
  monsters = [],
  projectiles = [],
  effects = [],
  damageTexts = [];
let gold = 300,
  score = 0,
  castleHealth = 100,
  currentWave = 1,
  monstersInWave = 10,
  monstersSpawned = 0;
let gameInitializing = false; // v8: 초기화 중복 진입 가드
let waveInProgress = false,
  gameRunning = false,
  gamePaused = false,
  gameInitialized = false,
  problemAnswered = false;
const keysPressed = {};
let wizardLevel = 1,
  wizardPosition = { x: 100, y: 200 },
  wizardSpeed = 4,
  wizardCooldowns = {};
let isDraggingWizard = false,
  wizardTouchStartX = 0,
  wizardTouchStartY = 0,
  wizardStartPosX = 0,
  wizardStartPosY = 0;
let touchStartTime = 0,
  touchMoveDistance = 0,
  lastClickPos = { x: 0, y: 0 };
let activeSpell = "fireball";
let currentProblem = null; // v5: 학습 루프용 현재 문제
let isReviewProblem = false; // v5: 복습(재출제) 문제 여부
let isNoteReviewProblem = false; // v6: 오답노트 복습 퀴즈 여부 (보너스 골드)
let gameSpeed = 1; // 1x or 2x speed multiplier

/**
 * 게임 시계(ms). 배속이 반영된 "게임 안의 시간"이며 일시정지 중엔 멈춘다.
 * 움직임과 함께 가야 하는 연출(몬스터 걷기 사이클)은 벽시계가 아니라 이걸 봐야 한다 —
 * 안 그러면 2배속에서 몸만 2배로 가고 다리는 1배로 움직여 미끄러지듯 보인다(실측 증상).
 */
let gameClock = 0;

/**
 * 한 프레임이 시뮬레이션에 반영할 수 있는 최대 실시간(ms).
 * 탭 복귀·긴 히치 뒤에는 timestamp 차가 수백ms~수초까지 벌어지는데, 그걸 그대로
 * 곱하면 몬스터가 한 프레임에 순간이동한다(2배속이면 그 폭이 2배). 상한을 넘으면
 * 시뮬이 잠깐 느려질 뿐 화면이 튀지는 않는다 — 튀는 쪽이 훨씬 나쁘다.
 */
const MAX_SIM_FRAME_MS = 50;
let currentWaveModifier = null; // v6: 웨이브 변이 (웨이브 30+)
// v8: 집중력 — 이번 판의 학습 성과가 그대로 타워 화력이 된다.
// 정답 +1, 오답 -2, 0~40. 규칙은 simCore가 단일 진실원.
let focusPoints = 0;
// v8: 적응형 출제 — 판 시작 때 누적 통계로 계산하고, 문제를 풀 때마다 갱신한다.
let currentWeakWeights = {};
const recentUnits = [];
let shownProblemIds = new Set(); // Track shown problems to avoid duplicates
let problemTimerId = null;
let problemTimerStart = 0;
// v6: 학기 표기 마이그레이션 ("3" → "3-1") — 구 세이브·체크포인트 호환
function migrateDifficulty(d) {
  const s = String(d || "");
  return /^\d$/.test(s) ? `${s}-1` : s;
}
function difficultyLabel(d) {
  const m = String(d || "").match(/^(\d)-(\d)$/);
  return m ? `${m[1]}학년 ${m[2]}학기` : `${d}학년`;
}
// v6: 30초 고정 폐지 — 유형별 제한시간(t: 1=한줄연산 2=복합 3=도형·측정 4=문장제) + 저학년(3~4학년) +5초
const PROBLEM_TIME_BY_TYPE = { 1: 20000, 2: 35000, 3: 45000, 4: 50000 };
// v7: 유형 상수만 쓰면 같은 t 안에서도 문장 길이가 2배 넘게 차이 나는 걸 못 잡는다.
//   실측(2026-07-27): 6-1 문장제는 평균 43자인데 최장 66자, 둘 다 50초로 동일했다.
//   66자를 정독 2회 하면 5~6학년 기준 약 33초 → 푸는 데 17초밖에 안 남는다.
//   읽는 속도 가정에 게임을 걸지 않도록, 기준 길이를 넘는 만큼 읽기 시간을 더 준다.
//   시간 초과는 "몰라서"가 아니라 "못 읽어서" 틀리게 만들 수 있고, 그건 학습 신호가 아니다.
const READ_BASE_CHARS = 30;      // 이 길이까지는 유형 기본 시간에 이미 포함된 것으로 본다
const READ_MS_PER_CHAR_LOW = 400;  // 3~4학년
const READ_MS_PER_CHAR_HIGH = 250; // 5~6학년
const READ_BONUS_CAP = 15000;    // 아무리 길어도 +15초까지
let currentProblemTimeLimit = 30000;
function problemTimeLimit(problem) {
  const base = PROBLEM_TIME_BY_TYPE[problem && problem.t] || 30000;
  const grade = parseInt(selectedDifficulty, 10);
  const low = grade <= 4;
  const len = problem && problem.q ? String(problem.q).length : 0;
  const extra = Math.min(
    READ_BONUS_CAP,
    Math.max(0, len - READ_BASE_CHARS) * (low ? READ_MS_PER_CHAR_LOW : READ_MS_PER_CHAR_HIGH),
  );
  return base + (low ? 5000 : 0) + Math.round(extra / 500) * 500;
}
let correctAnswer = 0,
  selectedTowerForUpgrade = null,
  selectedDifficulty = null,
  castleCoords = {};
let buildStep = "idle",
  pendingTile = null,
  pendingTowerType = null;
const isMobile = /Mobi/i.test(window.navigator.userAgent);
let spawnIntervalId = null;
// 스폰 루프 상태 — 웨이브 도중 배속을 바꾸면 간격을 다시 잡아야 해서 모듈 스코프에 둔다.
let spawnCount = 0;
let waveComposition = [];
let lastFrameTime = 0;
let isForcedProgress = false;
let currentProblemSet = [];
let pathPoints = [];
// 길과 길 사이의 "타워를 놓을 수 있는 가로 띠". generatePath가 계산하고
// createPlacementTiles가 그 안에만 타일을 깐다 — 둘이 같은 계산을 공유해야
// 길에 먹히는 줄이 안 생긴다.
let tileBands = [];
let roadRowYs = [];
let pathCanvas = null,
  pathCtx = null; // v5.6: 길 전용 캔버스 (한 번만 그림, z-index 1)
let placementTiles = [];
let pauseStartTimePerf = 0;

// ── v9: 게임 시계 지연 큐 ──────────────────────────────────
// 게임 루프 밖 setTimeout은 일시정지를 모른다(기록된 함정: 멈춘 화면에서 메테오가
// 착탄해 골드까지 올렸다). 상자 개봉·연출 지연은 전부 이 큐를 쓴다 —
// 일시정지 중에는 gameClock이 멈추므로 자동으로 함께 멈춘다.
const delayedTasks = []; // { at, fn, tag }
let delayedSeq = 0;
function scheduleGameDelay(ms, fn, tag = "") {
  delayedTasks.push({ at: gameClock + ms, fn, tag, id: ++delayedSeq });
  return delayedSeq;
}
function runDueDelays() {
  for (let i = delayedTasks.length - 1; i >= 0; i--) {
    if (gameClock >= delayedTasks[i].at) {
      const t = delayedTasks.splice(i, 1)[0];
      try { t.fn(); } catch (e) { console.warn(`[delay:${t.tag}] 실패:`, e); }
    }
  }
}

// ── v9: 히트스톱 ──────────────────────────────────────────
// ⚠️ 게임 시계를 "멈추는" 방식은 성립하지 않는다. 종료조건을 gameClock으로 쓰면
//    시계가 멈춘 순간 그 시각에 영영 도달하지 못한다(교착). 그래서 남은 시간은
//    **실시간 누산기**로 재고, 그동안 시뮬 전체를 아주 느리게 흘린다.
//    일시정지 중에는 감산 자체가 안 돈다(게임 루프의 !gamePaused 블록 안에 있다).
let hitstopRemainingMs = 0;
let hitstopWindowElapsed = 0; // 실시간 1초 창
let hitstopUsedInWindow = 0;
const HITSTOP_SCALE = 0.08;   // 히트스톱 중 시뮬 진행 비율
const HITSTOP_MS = 45;        // 1회 지속(실시간)
const HITSTOP_MAX_PER_SEC = 2;

let masteredThisRun = 0; // v9: 이번 판에 "완전히 내 것"이 된 문제 수(노트 졸업)
let bestWaveAtRunStart = 0;  // v9: 판 시작 시점의 이전 최고 웨이브(게임오버 비교용)
let blessings = blessing.initialState(); // v9: 이번 판 한정 축복
let blessingOpen = false;
let noDamageStreak = 0;      // v9: 연속 무피해 웨이브
let bestNoDamageStreak = 0;
let meteorDropCount = 0; // QA 계측용 — 메테오 실제 착탄 수(연출 유무와 무관)
let qaKnockbackPx = 0; // QA 계측용 — 넉백이 실제로 경로를 되돌렸는지 누적한다

function flashBudgetSnapshot() {
  return a11yFlashBudgetState();
}

/** 예산 안에서만 히트스톱을 건다. 초과분은 조용히 버린다(연출이 게임을 늦추면 안 된다). */
function requestHitstop() {
  if (prefersReducedMotion()) return false;
  if (hitstopUsedInWindow >= HITSTOP_MAX_PER_SEC) return false;
  hitstopUsedInWindow++;
  hitstopRemainingMs = Math.max(hitstopRemainingMs, HITSTOP_MS);
  return true;
}

// --- [UX] 마법사 근접 건설 ---
// 마법사가 올라선 배치 타일. 매 프레임 전체 타일을 훑으면 낭비라 좌표를 캐시해두고
// 마법사가 실제로 움직였을 때만 재계산한다.
let focusedTile = null;
let tileIndex = []; // { el, x, y, cx, cy } — 타일 생성 시 1회 구축
let lastFocusScanPos = { x: -9999, y: -9999 };
const BUILD_REACH = 46; // 타일 중심에서 이 거리(px) 안이면 건설 가능
let lastActionHint = "";

// --- [PERFORMANCE] Canvas 렌더링을 위한 변수 ---
let dynamicCtx;
// --- [NEW] 공간 분할 그리드 인스턴스 ---
let spatialGrid;

// --- [V2] 새 시스템 인스턴스 ---
let particleSystem = null;
const musicSystem = new MusicSystem();
const achievementSystem = new AchievementSystem();
const comboSystem = new ComboSystem();
let totalKillCount = 0;
let totalBossKills = 0;
let totalTowersBuilt = 0;
let waveDamageTaken = 0;
let waveStartTime = 0;
let menuParticleCtx = null;
let menuParticleAnimId = null;
let menuParticles = [];
let wizardSprite = null;
let castleRenderer = null;
let monsterRenderer = null;
let towerRenderer = null;
let projectileRenderer = null;
let ProjectileRendererClass = null;   // QA 훅이 경고 캐시를 비울 때 쓴다

/** 렌더러를 한 번만 받아 인스턴스를 만든다 (initializeGame이 await 한다).
 *  ⚠️ 진행 중인 Promise를 공유해야 한다. 완료된 인스턴스만 검사하면 느린 회선에서
 *  학년 버튼을 연달아 누를 때 초기화가 여러 번 겹쳐 전역 상태를 서로 덮어쓴다. */
let renderersPromise = null;
function loadRenderers() {
  if (monsterRenderer) return Promise.resolve();
  if (!renderersPromise) {
    renderersPromise = doLoadRenderers().catch((e) => {
      renderersPromise = null; // 실패하면 다음 시도에서 다시 받을 수 있게
      throw e;
    });
  }
  return renderersPromise;
}

async function doLoadRenderers() {
  const [w, c, m, t, p] = await Promise.all([
    import("./wizardSprite.js"),
    import("./castleRenderer.js"),
    import("./monsterRenderer.js"),
    import("./towerRenderer.js"),
    import("./projectileRenderer.js"),
  ]);
  wizardSprite = new w.WizardSprite();
  castleRenderer = new c.CastleRenderer();
  monsterRenderer = new m.MonsterRenderer();
  towerRenderer = new t.TowerRenderer();
  ProjectileRendererClass = p.ProjectileRenderer;
  projectileRenderer = new p.ProjectileRenderer();
}
const activeCanvasEffects = []; // Canvas-based spell effects tracking

// --- [OPTIMIZATION] Object Pooling ---
const pools = {
  // Projectiles와 DamageTexts는 Canvas로 그리므로 DOM 풀이 더 이상 필요 없음
  effects: {},
};
const POOL_SIZES = {
  effects: 50, // per type
};

// --- 정답 데이터 풀 ---
const answerPools = {
  numeric: [],
  text: [],
  mixed: [],
  symbol: [">", "<", "="],
  other: [],
};
function categorizeAnswers() {
  Object.values(mathProblems)
    .flat()
    .forEach((p) => {
      const type = getAnswerType(p.a);
      if (!answerPools[type]) answerPools[type] = [];
      answerPools[type].push(p.a);
    });
  for (const key in answerPools) {
    answerPools[key] = [...new Set(answerPools[key])];
  }
}

// --- [V2] 메뉴 파티클 배경 ---
function initMenuParticles() {
  const canvas = document.getElementById("menuParticleCanvas");
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  menuParticleCtx = canvas.getContext("2d");
  menuParticles = [];
  for (let i = 0; i < 60; i++) {
    menuParticles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      size: Math.random() * 2 + 1,
      alpha: Math.random() * 0.5 + 0.1,
      color: Math.random() > 0.5 ? "#00e5ff" : "#ff00e5",
    });
  }
  animateMenuParticles();
}

function animateMenuParticles() {
  if (!menuParticleCtx) return;
  const canvas = menuParticleCtx.canvas;
  menuParticleCtx.clearRect(0, 0, canvas.width, canvas.height);
  for (const p of menuParticles) {
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < 0) p.x = canvas.width;
    if (p.x > canvas.width) p.x = 0;
    if (p.y < 0) p.y = canvas.height;
    if (p.y > canvas.height) p.y = 0;
    menuParticleCtx.globalAlpha = p.alpha * 0.3;
    menuParticleCtx.fillStyle = p.color;
    menuParticleCtx.beginPath();
    menuParticleCtx.arc(p.x, p.y, p.size + 4, 0, Math.PI * 2);
    menuParticleCtx.fill();
    menuParticleCtx.globalAlpha = p.alpha;
    menuParticleCtx.beginPath();
    menuParticleCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    menuParticleCtx.fill();
  }
  // 연결선 (distSq로 sqrt 제거, 매 3번째 파티클만 비교)
  for (let i = 0; i < menuParticles.length; i += 2) {
    for (let j = i + 1; j < menuParticles.length; j += 2) {
      const dx = menuParticles[i].x - menuParticles[j].x;
      const dy = menuParticles[i].y - menuParticles[j].y;
      const distSq = dx * dx + dy * dy;
      if (distSq < 14400) {
        // 120^2
        menuParticleCtx.globalAlpha = (1 - Math.sqrt(distSq) / 120) * 0.15;
        menuParticleCtx.strokeStyle = "#00e5ff";
        menuParticleCtx.lineWidth = 0.5;
        menuParticleCtx.beginPath();
        menuParticleCtx.moveTo(menuParticles[i].x, menuParticles[i].y);
        menuParticleCtx.lineTo(menuParticles[j].x, menuParticles[j].y);
        menuParticleCtx.stroke();
      }
    }
  }
  menuParticleCtx.globalAlpha = 1;
  menuParticleAnimId = requestAnimationFrame(animateMenuParticles);
}

function stopMenuParticles() {
  if (menuParticleAnimId) {
    cancelAnimationFrame(menuParticleAnimId);
    menuParticleAnimId = null;
  }
  menuParticleCtx = null;
}

// --- [V2] 업적 토스트 표시 ---
function showAchievementToast(achievement) {
  const container = document.getElementById("achievement-toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "achievement-toast";
  toast.textContent = `🎖️ 업적 달성: ${achievement.name}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3200);
}

// --- [V2] 업적 체크 래퍼 ---
function checkAchievements(eventType, data) {
  const newAchievements = achievementSystem.check(eventType, data);
  if (newAchievements && newAchievements.length > 0) {
    newAchievements.forEach((a) => {
      showAchievementToast(a);
      sfx.play("powerup");
    });
  }
}

// --- [V2] 콤보 UI 업데이트 ---
function updateComboDisplay() {
  const display = document.getElementById("combo-display");
  const countEl = document.getElementById("comboCount");
  const multEl = document.getElementById("comboMultiplier");
  if (!display || !countEl || !multEl) return;
  const combo = comboSystem.getCombo();
  if (combo >= 2) {
    display.classList.remove("hidden");
    countEl.textContent = combo;
    multEl.textContent = comboSystem.getMultiplier();
    display.style.animation = "none";
    void display.offsetWidth;
    display.style.animation = "comboPulse 0.5s ease";
  } else {
    display.classList.add("hidden");
  }
}

// --- [V2] 웨이브 알림 ---
function showWaveAnnounce(waveNum) {
  const el = document.getElementById("wave-announce");
  const numEl = document.getElementById("announceWaveNum");
  if (!el || !numEl) return;
  // v5.1: 스테이지-웨이브 표기 (예: 2-3 = 스테이지 2의 3번째 웨이브)
  numEl.textContent = `${stageProgress.stageOfWave(waveNum)}-${stageProgress.waveInStage(waveNum)}`;
  el.classList.remove("hidden");
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "waveAnnounce 2s ease-out forwards";
  setTimeout(() => el.classList.add("hidden"), 2200);
}

// --- [V2] 설정 모달 ---
// --- [UX] 게임 방법 안내 ------------------------------------------------------
const HOWTO_KEY = "mathcastle:howto";

function readHowToPrefs() {
  try {
    const v = JSON.parse(localStorage.getItem(HOWTO_KEY));
    // 구버전이 이 키에 boolean 등 원시값을 넣었다면 이후 p.hideUntil 대입이
    // strict mode에서 TypeError를 던져 모달이 안 닫힌다 → 객체일 때만 채택
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    // 사파리 프라이빗 모드 등 — 읽기 실패해도 게임은 계속돼야 한다
    return {};
  }
}

function writeHowToPrefs(prefs) {
  try {
    localStorage.setItem(HOWTO_KEY, JSON.stringify(prefs));
  } catch {
    /* 사파리 프라이빗 모드 등 — 저장 실패해도 게임은 계속돼야 한다 */
  }
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function shouldShowHowTo() {
  const p = readHowToPrefs();
  if (p.never) return false;
  return p.hideUntil !== todayKey();
}

function openHowToPlay() {
  const modal = gameElements.howToPlayModal;
  if (!modal) return;
  const cb = document.getElementById("howToPlayHideToday");
  if (cb) cb.checked = false;
  showModal(modal);
}

function setupHowToPlay() {
  const modal = gameElements.howToPlayModal;
  if (!modal) return;
  if (isTouchLike) document.body.classList.add("is-touch");

  const close = () => {
    const cb = document.getElementById("howToPlayHideToday");
    if (cb?.checked) {
      const p = readHowToPrefs();
      p.hideUntil = todayKey();
      writeHowToPrefs(p);
    }
    hideModal(modal);
  };

  document.getElementById("closeHowToPlayBtn")?.addEventListener("click", close);
  document.getElementById("howToPlayNeverBtn")?.addEventListener("click", () => {
    const p = readHowToPrefs();
    p.never = true;
    writeHowToPrefs(p);
    hideModal(modal);
  });
  document
    .getElementById("howToPlayBtn")
    ?.addEventListener("click", openHowToPlay);

  if (shouldShowHowTo()) openHowToPlay();
}

function setupSettingsModal() {
  const musicSlider = document.getElementById("musicVolume");
  const sfxSlider = document.getElementById("sfxVolume");
  const musicVal = document.getElementById("musicVolumeValue");
  const sfxVal = document.getElementById("sfxVolumeValue");

  if (musicSlider) {
    musicSlider.addEventListener("input", () => {
      const vol = musicSlider.value / 100;
      musicSystem.setVolume(vol * 0.5);
      if (musicVal) musicVal.textContent = musicSlider.value + "%";
    });
  }
  if (sfxSlider && sfxVal) {
    sfxSlider.addEventListener("input", () => {
      const vol = sfxSlider.value / 100;
      sfx.setVolume(vol);
      sfxVal.textContent = sfxSlider.value + "%";
    });
  }

  const closeBtn = document.getElementById("closeSettingsBtn");
  if (closeBtn)
    closeBtn.addEventListener("click", () =>
      hideModal(document.getElementById("settingsModal")),
    );

  const settingsBtn = document.getElementById("settingsBtn");
  if (settingsBtn)
    settingsBtn.addEventListener("click", () =>
      showModal(document.getElementById("settingsModal")),
    );

  const settingsBtnInGame = document.getElementById("settingsBtnInGame");
  if (settingsBtnInGame)
    settingsBtnInGame.addEventListener("click", () =>
      showModal(document.getElementById("settingsModal")),
    );
}

// --- [V2] 업적 모달 ---
// ---------- v8: 오늘의 도전 ----------
/** 판 상태를 도전 진행 형태로 (판이 없으면 0) */
function questState() {
  return {
    wave: currentWave,
    correct: learnLoop.stats.correct,
    reviewCleared: learnLoop.stats.reviewCleared,
    maxCombo: comboSystem.maxCombo || 0,
    focus: focusPoints,
    towersBuilt: totalTowersBuilt,
    bossKills: totalBossKills,
  };
}

function renderDailyPanel() {
  const panel = document.getElementById("dailyPanel");
  const list = document.getElementById("dailyList");
  const count = document.getElementById("dailyCount");
  const note = document.getElementById("dailyNote");
  if (!panel || !list) return;

  const rows = dailyQuest.summary();
  const doneN = rows.filter((r) => r.done).length;
  panel.hidden = false;
  count.textContent = `${doneN}/${rows.length}`;
  list.textContent = "";
  for (const r of rows) {
    const li = document.createElement("li");
    li.className = "daily-item" + (r.done ? " done" : "");
    const ic = document.createElement("span");
    ic.className = "daily-icon";
    ic.textContent = r.done ? "✅" : r.icon;
    const tx = document.createElement("span");
    tx.className = "daily-text";
    tx.textContent = r.text;
    li.append(ic, tx);
    list.appendChild(li);
  }
  const bonus = dailyQuest.startingFocusBonus();
  const days = dailyQuest.playedDayCount();
  note.textContent = bonus > 0
    ? `다음 판 집중력 +${bonus}로 시작해요! (지금까지 ${days}일 플레이)`
    : "도전 하나를 깰 때마다 다음 판 집중력이 올라가요.";
}

// ---------- v8: 학습 기록 ----------
function setupReportModal() {
  const showBtn = document.getElementById("showReportBtn");
  const closeBtn = document.getElementById("closeReportBtn");
  if (showBtn) showBtn.addEventListener("click", () => { renderReport(); showModal(gameElements.reportModal); });
  if (closeBtn) closeBtn.addEventListener("click", () => hideModal(gameElements.reportModal));
}

/** 마지막으로 고른 학기를 기억해 둔다 — 학습 기록은 학기 단위다 */
const LAST_SEM_KEY = "mathcastle:lastsem";
function lastSemester() {
  if (selectedDifficulty) return selectedDifficulty;
  try { return localStorage.getItem(LAST_SEM_KEY) || "5-1"; } catch { return "5-1"; }
}

function renderReport() {
  const sem = lastSemester();
  const gradeEl = document.getElementById("reportGrade");
  const sumEl = document.getElementById("reportSummary");
  const unitsEl = document.getElementById("reportUnits");
  const reviewEl = document.getElementById("reportReview");
  if (!unitsEl) return;

  gradeEl.textContent = `${difficultyLabel(sem)} 기준`;

  const t = learnLoop.totalSolved();
  const rate = t.total ? Math.round((t.ok / t.total) * 100) : 0;
  sumEl.textContent = t.total
    ? `지금까지 ${t.total}문제를 풀었고 ${t.ok}문제를 맞혔어요 (정답률 ${rate}%)`
    : "아직 푼 문제가 없어요. 한 판 해볼까요?";

  // 단원별 성취도 — 교육과정 단원 그대로. 학부모·교사가 볼 수 있는 유일한 축이다.
  const stats = learnLoop.getUnitStats(sem);
  unitsEl.textContent = "";
  const codes = unitsOf(sem);
  if (!codes.length) return;
  for (const code of codes) {
    const rec = stats[code] || { ok: 0, no: 0 };
    const n = rec.ok + rec.no;
    const pct = n ? Math.round((rec.ok / n) * 100) : 0;
    const row = document.createElement("div");
    row.className = "unit-row";
    const name = document.createElement("span");
    name.className = "unit-name";
    name.textContent = unitName(sem, code);
    const bar = document.createElement("span");
    bar.className = "unit-bar";
    const fill = document.createElement("span");
    fill.className = "unit-fill";
    fill.style.width = `${n ? pct : 0}%`;
    // 색은 성취도에 따라 (80%+ 초록 / 50%+ 노랑 / 그 아래 빨강)
    fill.dataset.level = n === 0 ? "none" : pct >= 80 ? "high" : pct >= 50 ? "mid" : "low";
    bar.appendChild(fill);
    const val = document.createElement("span");
    val.className = "unit-val";
    val.textContent = n ? `${pct}% (${n}문제)` : "아직 안 풀었어요";
    row.append(name, bar, val);
    unitsEl.appendChild(row);
  }

  // 오늘 복습 예정
  const due = learnLoop.dueTodayCount(sem);
  const note = learnLoop.getWrongNote(sem);
  reviewEl.textContent = "";
  const head = document.createElement("p");
  head.className = "review-head";
  head.textContent = due > 0
    ? `오늘 복습할 문제가 ${due}개 있어요. 다음 판에서 나와요!`
    : note.length
      ? "오늘 복습할 문제는 없어요. 잘하고 있어요!"
      : "오답노트가 비어 있어요.";
  reviewEl.appendChild(head);
  for (const e of note.slice(0, 6)) {
    const d = document.createElement("div");
    d.className = "review-item";
    const q = document.createElement("b");
    q.innerHTML = ui.formatMath(e.q);
    const h = document.createElement("span");
    h.className = "review-hint";
    h.textContent = `💡 ${learnLoop.getSolutionHint(e.q, e.a)}`;
    d.append(q, document.createElement("br"), h);
    reviewEl.appendChild(d);
  }
}

function setupAchievementModal() {
  const showBtn = document.getElementById("showAchievementsBtn");
  const closeBtn = document.getElementById("closeAchievementBtn");

  if (showBtn)
    showBtn.addEventListener("click", () => {
      renderAchievementList();
      showModal(document.getElementById("achievementModal"));
    });
  if (closeBtn)
    closeBtn.addEventListener("click", () =>
      hideModal(document.getElementById("achievementModal")),
    );
}

function renderAchievementList() {
  const list = document.getElementById("achievementList");
  if (!list) return;
  list.innerHTML = "";
  const all = achievementSystem.getAll();
  all.forEach((a) => {
    const item = document.createElement("div");
    item.className = `achievement-item ${a.unlocked ? "unlocked" : "locked"}`;
    // v8: 미해금 업적에 진행 수치를 보여 준다. 자물쇠만 보면 얼마나 가까운지 모른다.
    const prog = a.unlocked ? null : achievementSystem.progressOf(a.id);
    item.innerHTML = `
            <div class="achievement-icon">${a.unlocked ? "🏆" : "🔒"}</div>
            <div class="achievement-name">${a.name}</div>
            <div class="achievement-desc">${a.description}</div>
            ${prog ? `<div class="achievement-progress"><span class="ach-bar"><span class="ach-fill"></span></span><span class="ach-num">${prog.now} / ${prog.target}</span></div>` : ""}
        `;
    // ⚠️ 폭은 innerHTML 안에 style="width:..."로 넣으면 안 된다. CSP(style-src 'self')가
    //    인라인 style **속성**을 막아 값이 통째로 무시되고, 막대가 늘 가득 찬 것처럼 보인다
    //    (실측으로 잡았다). CSSOM으로 설정하면 CSP에 걸리지 않는다.
    if (prog) {
      const fill = item.querySelector(".ach-fill");
      if (fill) fill.style.width = `${Math.round(prog.ratio * 100)}%`;
    }
    list.appendChild(item);
  });
}

// --- 게임 초기화 및 설정 ---
window.addEventListener("DOMContentLoaded", () => {
  detectLowEnd(); // v5: 웨일북(저사양) 자동 감지 → 품질 강등
  initA11y();     // v9: 움직임 민감도(prefers-reduced-motion) — 흔들림·플래시의 공통 관문

  // v5 QA 훅 (고유 전역 키 — window.game 금지 교훈). 프로덕션에서도 무해(읽기+시전 테스트용).
  window.__mathcastle = {
    getState: () => ({
      gold, castleHealth, currentWave, wizardLevel, activeSpell,
      monsters: monsters.length, towers: towers.length,
      projectiles: projectiles.length,
      gameRunning, gamePaused,
      gameSpeed, gameClock, // 배속 회귀 검증용 — gameClock은 배속만큼 빨리 흘러야 한다
      // 재시작 시 쿨다운이 이전 판에서 넘어오지 않는지 검증하려면 값이 보여야 한다
      // (안 보이면 게이트가 그 회귀를 못 잡는다 — 실제로 교차검증이 그 사각지대를 지적했다)
      spellCooldowns: { ...wizardCooldowns },
      autoCooldownUntil: WIZARD_AUTO_ATTACK_STATS.cooldownUntil || 0,
    }),
    // ── v9 QA 훅 ──────────────────────────────────────────
    // 연출은 수백 ms 만에 사라져 폴링으로는 못 본다 → 상태를 직접 노출한다.
    qaImpactState: () => ({
      hitstopRemainingMs,
      hitstopUsedInWindow,
      shake: { ...impactFx.shakeState() },
      flash: flashBudgetSnapshot(),
      reducedMotion: prefersReducedMotion(),
      lowQuality: quality.low, // 저사양 강등 시 흔들림·파티클은 정상적으로 꺼진다
      // 지금 플래시가 켜져 있는 몬스터 수 — "히트 플래시가 실제로 켜지는가"의 증거
      flashingMonsters: monsters.filter((m) => impactFx.hitFlashAmount(m, gameClock) > 0).length,
      // 넉백이 실제로 경로를 되돌렸는지 (누적 픽셀)
      knockbackPx: qaKnockbackPx,
    }),
    /** 플래시 예산의 **경계 구간**을 직접 몰아친다.
     *  루프를 관측하는 것만으로는 고정 구간 결함을 못 본다 — 카운터가 리셋되므로
     *  "어느 순간에도 2회 이하"로 보이지만 실제로는 20ms 안에 4회가 터진다. */
    qaNextSpellAtLevel: (lv) => ui.nextSpellAtLevel(lv),
    qaParticleFor: (w, a, b) => ui.particleFor(w, a, b),
    qaFlashBudgetProbe: () => {
      resetFlashBudget();
      tickFlashBudget(990);
      let early = 0;
      for (let i = 0; i < 3; i++) if (claimScreenFlash()) early++;
      tickFlashBudget(20);          // 여기서 구버전은 창이 리셋됐다
      let late = 0;
      for (let i = 0; i < 3; i++) if (claimScreenFlash()) late++;
      resetFlashBudget();
      // 990ms 시점과 1010ms 시점은 같은 1초 창 안이다 → 합쳐서 2회를 넘으면 안 된다.
      return { early, late, within1s: early + late };
    },
    qaSetReducedMotion: (v) => setReducedMotionForTest(v),
    qaSaveNow: () => saveGame(true),
    qaMeteorDrops: () => meteorDropCount,
    qaBlessings: () => ({ state: { ...blessings }, open: blessingOpen,
      towerRanges: towers.map((t) => Math.round(t.range)),
      wizardCooldown: WIZARD_AUTO_ATTACK_STATS.cooldown }),
    /** 축복을 제시 카드와 무관하게 **결정적으로** 건다.
     *  offer()는 Math.random()이라 게이트가 실행마다 다른 축복을 검사하게 된다
     *  — 5종 중 3종이 "효과 확인 생략"으로 조용히 통과하던 원인. */
    qaForceBlessing: (id, level = 1) => {
      blessings = { ...blessings, [id]: level };
      applyBlessingsToWorld();
      return { ...blessings };
    },
    /** 타워 한 대를 레벨업·각성시켜 "투자한 수치"를 만든다.
     *  축복 재적용이 이 투자분을 지워 버리는 회귀(실측 590 → 252)를 재려면 필요하다. */
    qaGrowTower: (type, levels = 0, awakens = 0) => {
      const t = towers.find((x) => x.type === type);
      if (!t) return null;
      for (let i = 0; i < levels; i++) simCore.applyTowerUpgrade(t);
      for (let i = 0; i < awakens; i++) simCore.applyTowerAwaken(t);
      return { range: Math.round(t.range), level: t.level, awaken: t.awaken || 0 };
    },
    qaBlessingProbe: () => ({
      byType: Object.fromEntries(
        towers.map((t) => [t.type, {
          range: Math.round(t.range),
          splash: Math.round(t.splashRadius || 0),
        }]),
      ),
      wizardCooldown: WIZARD_AUTO_ATTACK_STATS.cooldown,
      waveClearHeal: simCore.WAVE_CLEAR_HEAL + blessing.healBonus(blessings),
    }),
    /** 슬로우 지속시간을 **실제 소비 경로(handleHit)**로 잰다.
     *  블레싱 배수를 게이트가 다시 계산하면 그건 재구현이라 회귀를 못 잡는다. */
    qaSlowProbe: () => {
      const src = { ...TOWER_STATS.ice, damage: 0, type: "ice" };
      const dummy = {
        x: -9999, y: -9999, hp: 1e9, maxHp: 1e9, isBoss: false, isDead: true,
        statusEffects: {}, pathIndex: 0, monsterKey: "slime", evasionChance: 0,
      };
      // isDead=true면 handleHit이 즉시 반환하므로, 상태이상 부여 구간만 태우도록
      // 잠깐 살려 두고 곧바로 되돌린다(월드에 넣지 않았으므로 렌더·집계에 안 잡힌다).
      dummy.isDead = false;
      handleHit({ source: src, target: dummy }, gameClock);
      dummy.isDead = true;
      const sl = dummy.statusEffects.slowed;
      return sl ? Math.round(sl.endTime - gameClock) : null;
    },
    qaOpenBlessing: () => new Promise((res) => openBlessingChooser(() => res(true))),
    qaPickBlessing: (id) => {
      const el = document.querySelector(`.blessing-card[data-blessing-id="${id}"]`);
      if (el) { el.click(); return true; }
      const first = document.querySelector(".blessing-card");
      if (first) { first.click(); return true; }
      return false;
    },
    /** 필드에 놓인 타워의 툴팁을 실제로 띄우고 그 DOM을 돌려준다.
     *  hover 이벤트 흉내는 좌표·포인터 종류에 따라 조용히 실패해 헛검사가 되기 쉽다. */
    qaTowerTooltipHtml: (type) => {
      const t = towers.find((x) => x.type === type);
      if (!t) return null;
      ui.showTowerInfoTooltip(t, 400, 400);
      return document.getElementById("tower-info-tooltip")?.innerHTML || "";
    },
    qaBuildMenuTooltipHtml: (type) => {
      const stat = TOWER_STATS[type];
      if (!stat) return null;
      ui.showTowerInfoTooltip(stat, 400, 400);
      return document.getElementById("tower-info-tooltip")?.innerHTML || "";
    },
    qaRarity: (key) => ({ ...rarity.towerRarity(key), rank: rarity.attackRank(key), power: rarity.powerInfo(key) }),
    qaUntieredTowers: () => rarity.untieredTowerKeys(),
    qaSpawnerState: () => ({ spawnActive, nextSpawnAt, spawnCount, monstersInWave, legacyInterval: spawnIntervalId }),
    /** 스포너를 **성긴 프레임**으로 몰아 돌려 간격 드리프트를 잰다.
     *  프레임이 간격보다 늦게 오는 상황(저사양·고배속)에서 매번 현재 시각으로
     *  재기준화하면 늦은 몫이 영구 누적돼 스폰이 성겨진다 = 난이도가 조용히 내려간다. */
    qaSpawnDriftProbe: (frameMs = 100, frames = 40) => {
      const iv = simCore.spawnIntervalMs(currentWave, 1);
      // 프로브는 **월드를 건드리지 않는다** — 전부 스냅샷 뜨고 되돌린다.
      const snap = { gameClock, spawnActive, spawnCount, nextSpawnAt, monstersInWave };
      const realSpawn = spawnMonster;
      let spawned = 0;
      spawnMonster = () => { spawned++; };   // 실제 몬스터는 만들지 않는다
      try {
        spawnActive = true;
        spawnCount = 0;
        monstersInWave = 9999;
        nextSpawnAt = gameClock;
        for (let f = 0; f < frames; f++) { gameClock += frameMs; pumpSpawner(); }
      } finally {
        spawnMonster = realSpawn;
        gameClock = snap.gameClock;
        spawnActive = snap.spawnActive;
        spawnCount = snap.spawnCount;
        nextSpawnAt = snap.nextSpawnAt;
        monstersInWave = snap.monstersInWave;
      }
      const elapsed = frameMs * frames;
      // 평균 간격이 아니라 **누적 스폰 수**를 설계치와 견준다. 평균 간격은 마지막
      // 부분 구간에 희석돼 드리프트를 흐린다 — 실제로 그 지표로는 회귀 주입이 안 잡혔다.
      const designCount = Math.floor(elapsed / iv);
      return { intervalMs: iv, frameMs, elapsed, spawned, designCount,
               ratio: designCount > 0 ? spawned / designCount : null };
    },
    qaSetWizardLevel: (lv) => { wizardLevel = lv; populateSpellbook(); },
    qaCastSpell: async (key, x, y) => {
      activeSpell = key;
      wizardCooldowns[key] = 0;
      await handleWizardAttack({ x: x ?? window.innerWidth / 2, y: y ?? window.innerHeight / 2 });
    },
    qaAddGold: (n) => { gold += n; updateFullUI(); },
    qaSetWave: (n) => { currentWave = n; updateFullUI(); },
    // 레이아웃 실측용 — 길 y좌표·타워 밴드·플레이 영역을 그대로 노출한다.
    // 스크린샷만으로는 "길 두 줄이 붙었다"를 수치로 못 잡는다(실측 교훈).
    qaLayout: () => ({
      play: playfieldBounds(),
      scale: worldScale(),
      bands: tileBands.map((b) => ({ top: Math.round(b.top), h: Math.round(b.h) })),
      roads: roadRowYs.map((y) => Math.round(y)),
      roadWidth: Math.round(50 * worldScale()),
    }),
    qaPathPoints: () => pathPoints.map((p) => ({ x: p.x, y: p.y })),
    qaTowers: () => towers.map((t) => ({ x: t.x, y: t.y, type: t.type })),
    qaTimeLimit: (p) => problemTimeLimit(p), // v6: 유형별 제한시간 검증용
    qaWaveModifier: (w) => simCore.waveModifier(w, seededRand(dailySeedForWave(w))),
    qaForceGameOver: () => { castleHealth = 0; checkGameOver(); },
    qaMoveWizard: (x, y) => {
      wizardPosition.x = x; wizardPosition.y = y;
      gameElements.wizardEl.style.transform = `translate(${x}px, ${y}px)`;
    },
    qaShowProblem: (prob) => {
      const p = prob || { q: "4/9 - 1/7", a: "19/63", d: ["20/63", "18/63", "63/19"] };
      // 실제 showMathProblem()과 같이 채점 플래그를 푼다.
      // 이게 없으면 두 번째 문제부터 checkAnswer가 맨 앞에서 return해버려,
      // "문제를 20개 풀었다"는 시나리오가 사실은 1개만 채점된 헛검사가 된다(실측).
      problemAnswered = false;
      correctAnswer = p.a;
      currentProblem = p;
      const opts = [p.a, ...(p.d || [])];
      shuffleArray(opts);
      ui.showMathProblemUI(p, opts, checkAnswer);
      return { correct: p.a, options: opts };
    },
    qaClickAnswer: (val) => {
      const btn = [...document.querySelectorAll(".math-option")].find(
        (b) => String(b.dataset.value) === String(val),
      );
      if (!btn) return "no-btn";
      const before = { gold, castleHealth, score };
      btn.click();
      return { clicked: val, correct: correctAnswer, wasCorrect: String(val) === String(correctAnswer), before };
    },
    qaGetMonsters: () =>
      monsters.slice(0, 40).map((m) => ({
        key: m.monsterKey, x: Math.round(m.x), y: Math.round(m.y),
        direction: +m.direction.toFixed(2), pathIndex: Math.round(m.pathIndex),
        // v9: 이어하기 검증용 — "다친 몬스터가 돌아왔는가"로 같은 전투의 연속임을 증명한다
        hp: Math.round(m.hp), maxHp: Math.round(m.maxHp),
      })),
    qaGetProjectiles: () =>
      projectiles.map((p) => ({
        type: p.type, x: Math.round(p.x), y: Math.round(p.y),
        tx: p.target ? Math.round(p.target.x) : null,
        ty: p.target ? Math.round(p.target.y) : null,
        dead: p.target ? !!p.target.isDead : "no-target",
      })),
    qaGetWizardInfo: () => ({
      pos: { ...wizardPosition },
      elW: gameElements.wizardEl?.offsetWidth,
      elH: gameElements.wizardEl?.offsetHeight,
      autoCd: WIZARD_AUTO_ATTACK_STATS.cooldownUntil,
      autoDmg: WIZARD_AUTO_ATTACK_STATS.damage,
      range: WIZARD_AUTO_ATTACK_STATS.range,
    }),
    qaPlaceTowerAt: (type, x, y) => {
      // 지정 좌표에서 가장 가까운 배치 타일에 타워 설치 (경로 인접 검증용)
      const tiles = [...document.querySelectorAll(".placement-tile")];
      if (!tiles.length) return;
      const best = tiles.reduce((a, t) => {
        const tx = parseInt(t.style.left) + 20, ty = parseInt(t.style.top) + 20;
        const d = (tx - x) ** 2 + (ty - y) ** 2;
        return !a || d < a.d ? { t, d, tx, ty } : a;
      }, null);
      gold += 10000;
      pendingTile = { x: best.tx, y: best.ty };
      placeTower(type);
      pendingTile = null;
    },
    // v8: 발사체 그리기 분기를 전수 실행한다. 실제 플레이로는 어떤 타워가 언제
    //     쏠지가 운에 달려 있어 "관측된 종류 N개"가 판마다 달라진다(실측: 4~5종).
    //     렌더러를 직접 호출해 24개 분기를 결정적으로 전부 태운다.
    qaRenderAllProjectiles: (types) => {
      // 렌더러는 게임에 들어갈 때 동적으로 받는다 — 메뉴에서 부르면 아직 없다
      if (!projectileRenderer) return { tested: 0, failures: ["렌더러 미로드 (게임 시작 전)"] };
      const ctx = dynamicCtx || gameElements.dynamicLayerCanvas.getContext("2d");
      const failures = [];
      const origWarn = console.warn;
      console.warn = (...a) => {
        if (String(a[0]).includes("[projectile]")) failures.push(String(a[0]));
        origWarn.apply(console, a);
      };
      // 타입당 1회만 경고하는 캐시를 비워야 두 번째 실행에서도 잡힌다
      ProjectileRendererClass?._warned.clear();
      const ts = performance.now();
      for (const t of types) {
        for (const [dx, dy] of [[40, 0], [0, 40], [-30, -30]]) {
          projectileRenderer.renderProjectile(ctx, t, 200, 200, 16, 200 + dx, 200 + dy, ts + dx * 7);
        }
      }
      console.warn = origWarn;
      return { tested: types.length, failures };
    },
    qaPlaceTowers: (type, count) => {
      // 타일에 타워 강제 배치 (성능 테스트용)
      const tiles = [...document.querySelectorAll(".placement-tile")].slice(0, count);
      tiles.forEach((tile) => {
        gold += 10000;
        // pendingTile은 타일의 '좌상단'이다 — placeTower가 +20으로 중심을 잡는다.
        // 여기서 미리 +20을 하면 20px 어긋난 자리에 지어져(실측) 타워가
        // 길 쪽으로 밀려 앉는다. 실제 탭 경로(handleTileTap)와 같은 값을 넘긴다.
        pendingTile = {
          x: parseInt(tile.style.left),
          y: parseInt(tile.style.top),
        };
        placeTower(type);
      });
      pendingTile = null;
    },
    /**
     * 길에 가까운 타일부터 채워 타워를 짓는다.
     * ⚠️ qaPlaceTowers는 DOM 순서로 앞 N개를 잡는데, 배치 타일 대부분은 길에서 멀어
     *    사거리에 몬스터가 안 들어온다 → "발사체 0개"인 헛검사가 된다(기록된 QA 함정).
     *    발사 빈도·명중처럼 **타워가 실제로 쏴야** 성립하는 측정은 이걸 쓸 것.
     */
    qaPlaceTowersNearPath: (type, count) => {
      const pts = pathPoints;
      const dist2 = (x, y) => {
        let best = Infinity;
        for (const pt of pts) {
          const dx = pt.x - x, dy = pt.y - y;
          const d = dx * dx + dy * dy;
          if (d < best) best = d;
        }
        return best;
      };
      const tiles = [...document.querySelectorAll(".placement-tile")]
        .map((t) => {
          const x = parseInt(t.style.left), y = parseInt(t.style.top);
          return { t, x, y, d: dist2(x + 20, y + 20) };
        })
        .sort((a, b) => a.d - b.d)
        .slice(0, count);
      tiles.forEach(({ x, y }) => {
        gold += 10000;
        pendingTile = { x, y };
        placeTower(type);
      });
      pendingTile = null;
      return towers.length;
    },
  };
  // v8: 여기서 207장(2.5MB)을 전부 받고 있었다. 학년을 고르기도 전에.
  //     3학년만 할 아이도 6학년 보스 스프라이트까지 받았고, 그 요청들이 정작 필요한
  //     문제 파일과 커넥션을 다퉜다. 이제 학년을 고른 뒤 필요한 것부터 받는다.
  // categorizeAnswers()는 학년 선택 후 initializeGame에서 실행 (문제 동적 로드 이후)
  ui.initializeUI(handleBuildStep);

  initializeFirebase((isReady) => {
    document.getElementById("showRankingBtn").disabled = !isReady;
  });

  // [V2] 메뉴 파티클 & 음악
  initMenuParticles();
  setupSettingsModal();
  setupHowToPlay();
  setupAchievementModal();
  achievementSystem.installFlushOnExit(); // v8: 탭 닫힘 시 업적 진행 유실 방지
  setupReportModal();
  renderDailyPanel();

  // [V2] 첫 사용자 인터랙션에서 음악 시작
  const startMusicOnce = () => {
    musicSystem.init().then(() => {
      musicSystem.play("menu");
      musicSystem.setIntensity(0.4);
    });
    document.removeEventListener("click", startMusicOnce);
    document.removeEventListener("touchstart", startMusicOnce);
  };
  document.addEventListener("click", startMusicOnce);
  document.addEventListener("touchstart", startMusicOnce);

  setupEventListeners();

  ui.showDifficultySelector();
});

async function initializeGame(difficulty, savedState = null) {
  difficulty = migrateDifficulty(difficulty); // v6: 구 학년 표기("3") → 학기 표기("3-1")
  if (gameInitializing) return;   // 느린 회선에서 학년 버튼 연타 → 초기화 중복 방지
  gameInitializing = true;
  try {
    // v8: 렌더러는 게임에 들어올 때 받는다 (메뉴는 안 쓴다)
    await loadRenderers();
  } catch (err) {
    gameInitializing = false;
    console.error("렌더러 로드 실패:", err);
    showMessage("게임 파일을 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.");
    return;
  }
  const {
    difficultyModal,
    gameCanvas,
    gameUI,
    startWaveBtn,
    dynamicLayerCanvas,
  } = gameElements;
  gameInitialized = true;

  // 학년별 문제 동적 로드 (실패 시 게임 시작 중단)
  try {
    await loadGradeProblems(difficulty);
    categorizeAnswers();
    // v7: 오답노트에서 "예정일이 지난 것부터" 복습 퀴즈 시드 (최대 8문항).
    //     구버전은 note.slice(0,3) 고정이라 오래된 오답이 영구 미출제였다(감사 실측).
    const dueToday = learnLoop.dueTodayCount(difficulty);
    const seeded = learnLoop.startSession(difficulty);
    // v8: 누적 오답률 → 유형별 출제 가중치 (약점 우선 출제)
    currentWeakWeights = problemSelector.weaknessWeights(learnLoop.getCumulative(difficulty));
    recentUnits.length = 0;
    if (!savedState && seeded > 0)
      setTimeout(() => {
        showMessage(
          dueToday > 0
            ? `📒 오늘 복습할 문제 ${dueToday}개 중 ${seeded}개가 나와요! (맞히면 보너스 골드)`
            : `📒 지난 오답 ${seeded}문제를 다시 확인해 볼까요? (맞히면 보너스 골드)`,
        );
      }, 1200);

  // v5: 학년별 AI 배경 (없으면 기존 CSS 배경 유지)
  {
    const bgKey = { 3: "bg_meadow", 4: "bg_meadow", 5: "bg_canyon", 6: "bg_volcano" }[parseInt(difficulty, 10)];
    // v8: 이 학년에 필요한 것부터 받고, 후반 전용 몬스터는 백그라운드로 이어 받는다.
    //     스프라이트가 아직 없으면 렌더러가 절차적 드로잉으로 폴백하므로 안전하다.
    if (!window.__spritesReady) window.__spritesReady = preloadSprites("assets", bgKey);
    try { await window.__spritesReady; } catch {}
    const bgImg = getSprite(bgKey);
    // #gameCanvas 자체의 불투명 CSS 배경을 인라인으로 교체해야 보인다
    // (#game-content에 걸면 자식 gameCanvas 배경에 완전히 가려짐 — 시각 QA 실측)
    if (bgImg && gameElements.gameCanvas) {
      gameElements.gameCanvas.style.background = `linear-gradient(rgba(8,10,30,0.5), rgba(8,10,30,0.5)), url(${bgImg.src}) center / cover no-repeat`;
    }
  }
  } catch (err) {
    console.error("문제 데이터 로드 실패:", err);
    gameInitialized = false;
    gameInitializing = false;
    showMessage("문제 데이터를 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.");
    return;
  }
  selectedDifficulty = difficulty;
  // v6: 랭킹 치트 방어용 세션 토큰 발급 (비동기·실패해도 게임 계속)
  // 이어하기면 세이브의 웨이브를 기준선으로 넘겨, 서버 최소 플레이 시간이
  // "이번 세션에 진행한 웨이브"로 계산되게 한다(정상 기록 오거절 방지).
  startGameSession(savedState && savedState.currentWave ? savedState.currentWave : 1);
  difficultyModal.style.display = "none";
  gameCanvas.style.display = "block";
  gameUI.style.display = "block";

  safeCleanupAllElements();

  ((towers = []),
    (monsters = []),
    (projectiles = []),
    (effects = []),
    (damageTexts = []));
  ((gold = simCore.INITIAL_GOLD), (score = 0), (castleHealth = simCore.INITIAL_CASTLE_HP), (currentWave = 1));
  ((monstersInWave = 10), (monstersSpawned = 0), (wizardLevel = 1));
  wizardPosition = defaultWizardPosition();
  ((gameRunning = true), (gamePaused = false), (waveInProgress = false));

  // Canvas 초기화
  dynamicLayerCanvas.width = window.innerWidth;
  dynamicLayerCanvas.height = window.innerHeight;
  dynamicCtx = dynamicLayerCanvas.getContext("2d");

  // [NEW] 공간 분할 그리드 초기화
  const cellSize = 100;
  spatialGrid = new SpatialGrid(
    window.innerWidth,
    window.innerHeight,
    cellSize,
  );

  // [V2] 파티클 시스템 초기화
  particleSystem = new ParticleSystem(dynamicCtx);
  // v9: 화면 흔들림 대상은 #gameCanvas 컨테이너다(캔버스만 흔들면 .tower 클릭 판정이 어긋난다)
  impactFx.initImpactFx(gameElements.gameCanvas);
  impactFx.resetShake();

  // [V3] 메뉴 파티클 중지 & 게임플레이 음악 시작
  stopMenuParticles();
  musicSystem.init();
  sfx.play("game_start");
  musicSystem.play("gameplay");
  musicSystem.setIntensity(0.3);

  // [V2] 게임 통계 초기화
  totalKillCount = 0;
  totalBossKills = 0;
  totalTowersBuilt = 0;
  // v9: 판 단위 카운터. bestWaveAtRunStart는 **플레이가 갱신하기 전**에 찍어야 한다.
  masteredThisRun = 0;
  noDamageStreak = 0;
  bestNoDamageStreak = 0;
  bestWaveAtRunStart = achievementSystem.bestOf("wave");
  blessings = blessing.initialState();
  blessingOpen = false;
  WIZARD_AUTO_ATTACK_STATS.cooldown = WIZARD_AUTO_ATTACK_STATS.initialCooldown; // 축복으로 줄인 쿨다운을 새 판에서 되돌린다
  // 새 판 진입이 restartGame을 반드시 거치는 것은 아니다(학년 재선택 등) — 여기서도 비운다.
  delayedTasks.length = 0;
  pendingBoxes.length = 0;
  wizardHintShownAtLevel = -1;
  hitstopRemainingMs = 0;
  hitstopUsedInWindow = 0;
  hitstopWindowElapsed = 0;
  meteorDropCount = 0;
  qaKnockbackPx = 0;
  resetFlashBudget();
  impactFx.resetShake();
  renderPauseOverlay(false);
  // v8: 집중력은 판 단위. 다만 오늘의 도전을 깼다면 그만큼 얹어서 시작한다
  //     (보상이 뽑기가 아니라 "학습해서 얻은 화력"이라는 원칙과 같은 방향)
  focusPoints = dailyQuest.startingFocusBonus();
  try { localStorage.setItem(LAST_SEM_KEY, difficulty); } catch { /* 저장 실패해도 계속 */ }
  gameSpeed = 1;
  shownProblemIds = new Set();
  comboSystem.break();

  if (savedState) {
    gold = savedState.gold;
    score = savedState.score;
    castleHealth = savedState.castleHealth;
    currentWave = savedState.currentWave;
    wizardLevel = savedState.wizardLevel;
    wizardPosition = savedState.wizardPosition;
    WIZARD_AUTO_ATTACK_STATS.damage = savedState.wizardDamage;
    WIZARD_AUTO_ATTACK_STATS.range = savedState.wizardRange;
    WIZARD_AUTO_ATTACK_STATS.rangeSq =
      savedState.wizardRange * savedState.wizardRange;

    // --- Restore extended save data ---
    if (savedState.activeSpell) activeSpell = savedState.activeSpell;
    if (savedState.maxCombo) comboSystem.maxCombo = savedState.maxCombo;
    // ⚠️ `if (savedState.focusPoints)`로 쓰면 저장값이 0일 때 복원을 건너뛰고
    //    오늘의 도전 보너스가 남는다. 이어하기는 저장 당시 상태 그대로여야 한다.
    if (savedState.focusPoints != null) focusPoints = savedState.focusPoints; // v8
    if (savedState.totalKillCount) totalKillCount = savedState.totalKillCount;
    if (savedState.totalBossKills) totalBossKills = savedState.totalBossKills;
    if (savedState.totalTowersBuilt)
      totalTowersBuilt = savedState.totalTowersBuilt;
    if (savedState.gameSpeed) gameSpeed = savedState.gameSpeed;
    if (
      savedState.achievementProgress &&
      Array.isArray(savedState.achievementProgress)
    ) {
      savedState.achievementProgress.forEach((id) => {
        if (!achievementSystem.isUnlocked(id)) achievementSystem.unlock(id);
      });
    }
    if (
      savedState.shownProblemIds &&
      Array.isArray(savedState.shownProblemIds)
    ) {
      shownProblemIds = new Set(savedState.shownProblemIds);
    }

    regenerateLayout();

    savedState.towers.forEach(recreateTower);
    // 세이브의 좌표는 저장 당시 레이아웃 기준이다. 창 크기가 달라졌거나 그 사이
    // 길 배치가 바뀐 빌드면 그대로 심을 경우 길 한복판에 앉는다 — 여기서 구제한다.
    relocateTowersToValidTiles();

    // ── v9(세이브 v7): 웨이브 도중 상태 복원 ────────────────
    // ⚠️ 전부 옵셔널 가드로 감싼다. v6 이하 세이브에는 이 필드가 없고,
    //    여기서 예외가 나면 initializeGame 중간에서 멈춰 로딩 화면이 굳는다
    //    (이 복원 블록에는 원래 try/catch가 없었다 — 교차검증 지적).
    try {
      // 쿨다운은 남은 시간으로 저장돼 있다 → 지금 시계 기준으로 되살린다
      if (Array.isArray(savedState.towerCooldownLeft)) {
        savedState.towerCooldownLeft.forEach((left, i) => {
          if (towers[i] && typeof left === "number") towers[i].cooldownUntil = gameClock + left;
        });
      }
      if (savedState.wizardCooldownLeft && typeof savedState.wizardCooldownLeft === "object") {
        for (const [k, left] of Object.entries(savedState.wizardCooldownLeft)) {
          if (typeof left === "number") wizardCooldowns[k] = gameClock + left;
        }
      }
      if (typeof savedState.wizardAutoCooldownLeft === "number") {
        WIZARD_AUTO_ATTACK_STATS.cooldownUntil = gameClock + savedState.wizardAutoCooldownLeft;
      }
      if (typeof savedState.masteredThisRun === "number") masteredThisRun = savedState.masteredThisRun;
      if (savedState.blessings) {
        blessings = blessing.normalize(savedState.blessings);
        applyBlessingsToWorld(); // 복원된 타워에도 다시 발라 준다
      }

      const w = savedState.wave;
      if (w && w.inProgress) {
        waveComposition = Array.isArray(w.composition) ? w.composition : [];
        monstersInWave = w.monstersInWave || waveComposition.length;
        monstersSpawned = w.monstersSpawned || 0;
        spawnCount = w.spawnCount || 0;
        waveDamageTaken = w.damageTaken || 0;
        currentWaveModifier = w.modifier || null;
        const restored = restoreMonsters(w.monsters);
        waveInProgress = true;
        waveStartTime = gameClock - (w.elapsed || 0);
        // 아직 안 나온 몬스터가 남아 있으면 스폰을 이어서 돌린다
        if (w.spawnActive && spawnCount < monstersInWave) {
          spawnActive = true;
          nextSpawnAt = gameClock + (w.spawnInLeft || 0);
        }
        gameElements.startWaveBtn.disabled = true;
        setStartWaveLabel("⚔️ 방어 중", false);
        showMessage(`⚔️ 웨이브 ${currentWave} 중간부터 이어서! (몬스터 ${restored}마리 복귀)`);
      }
    } catch (err) {
      // 중간 상태 복원 실패가 게임 진입 자체를 막으면 안 된다 — 웨이브 시작 상태로 이어간다.
      console.warn("웨이브 중간 상태 복원 실패(웨이브 시작 상태로 진행):", err);
      waveInProgress = false;
    }

    if (!(savedState.wave && savedState.wave.inProgress)) {
      showMessage("게임을 성공적으로 불러왔습니다!");
    }
  } else {
    WIZARD_AUTO_ATTACK_STATS.damage = WIZARD_AUTO_ATTACK_STATS.initialDamage;
    WIZARD_AUTO_ATTACK_STATS.range = 120;
    WIZARD_AUTO_ATTACK_STATS.rangeSq = 120 * 120;
    // 새 판은 쿨다운도 새로 — restartGame을 안 거치는 진입(학년 재선택 등)도 있다
    WIZARD_AUTO_ATTACK_STATS.cooldownUntil = 0;
    wizardCooldowns = {};
    regenerateLayout();
  }

  gameElements.wizardEl.style.transform = `translate(${Math.round(wizardPosition.x)}px, ${Math.round(wizardPosition.y)}px)`;

  currentProblemSet = [...mathProblems[selectedDifficulty]];
  shuffleArray(currentProblemSet);

  populateSpellbook();
  updateFullUI();
  startWaveBtn.disabled = false;
  setStartWaveLabel("🚀 시작");

  if (!gameLoop.isRunning) {
    lastFrameTime = performance.now();
    gameLoop.isRunning = true;
    requestAnimationFrame(gameLoop);
  }
  gameInitializing = false;
}

// --- [OPTIMIZATION] Object Pooling Functions ---
function getFromPool(pool, type = null) {
  let specificPool = pool;
  if (type && pool[type]) {
    specificPool = pool[type];
  } else if (type && !pool[type]) {
    pool[type] = [];
    specificPool = pool[type];
  }

  for (let i = 0; i < specificPool.length; i++) {
    if (!specificPool[i].inUse) {
      specificPool[i].inUse = true;
      specificPool[i].el.style.display = "block";
      return specificPool[i];
    }
  }

  // Pool exhausted, create a new one as fallback
  if (specificPool.length < 500) {
    // Safety cap
    const { gameCanvas } = gameElements;
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.display = "block";
    el.style.pointerEvents = "none";
    el.style.zIndex = "20";
    gameCanvas.appendChild(el);
    const newObj = { el, inUse: true, timeoutId: null };
    specificPool.push(newObj);
    return newObj;
  }

  console.warn(`Pool for "${type || "generic"}" exhausted.`);
  return null;
}

function returnToPool(poolObject) {
  if (poolObject) {
    poolObject.inUse = false;
    poolObject.el.style.display = "none";
    poolObject.el.className = "";
    poolObject.el.style.animation = "";
    void poolObject.el.offsetWidth;

    if (poolObject.timeoutId) {
      clearTimeout(poolObject.timeoutId);
      poolObject.timeoutId = null;
    }
  }
}

// --- [OPTIMIZATION] Centralized Effect/Text Creation ---
function createDamageText(target, text, type = "normal") {
  if (!target || typeof target.x !== "number" || typeof target.y !== "number")
    return;

  const damageText = {
    x: target.x,
    y: target.y,
    text,
    type,
    creationTime: gameClock, // updateDamageTexts가 게임 시계로 비교한다
    duration: 1500, // ms
    opacity: 1,
  };
  damageTexts.push(damageText);
}

// --- 레이아웃 및 요소 생성 ---
function regenerateLayout() {
  if (!gameInitialized) return;
  resetBuildProcess();
  hideModal(gameElements.towerUpgradeSelector);
  gameElements.rangeIndicator.style.display = "none";

  document
    .querySelectorAll(".path, .placement-tile")
    .forEach((el) => el.remove());
  generatePath();
  // 성 위치를 먼저 확정해야 createPlacementTiles가 성 주변을 제대로 비운다.
  // (반대 순서면 직전 레이아웃의 성 좌표로 비워서 성에 타일이 겹쳤다.)
  positionCastle();
  createPlacementTiles();

  // [NEW] 창 크기가 변경되면 공간 분할 그리드도 다시 생성합니다.
  if (spatialGrid) {
    spatialGrid = new SpatialGrid(
      window.innerWidth,
      window.innerHeight,
      spatialGrid.cellSize,
    );
  }

  if (gameElements.dynamicLayerCanvas) {
    gameElements.dynamicLayerCanvas.width = window.innerWidth;
    gameElements.dynamicLayerCanvas.height = window.innerHeight;
  }

  relocateTowersToValidTiles();
}

// 길이 움직이면(창 크기 변경·레이아웃 개편·예전 세이브 불러오기) 예전 자리에
// 있던 타워가 길 한복판에 남는다(사용자 신고: "타워가 길로 내려왔잖아").
// 놓을 수 있는 칸이 없어진 타워는 가장 가까운 빈 칸으로 옮긴다 —
// 지어 둔 타워를 잃지 않으면서 길 위에 걸터앉은 모양도 없앤다.
//
// ⚠️ regenerateLayout() 안에만 두면 안 된다. 이어하기는
//      regenerateLayout()                        ← 이 시점에 towers는 아직 비어 있다
//      savedState.towers.forEach(recreateTower)  ← 옛 절대좌표를 그대로 심는다
//    순서라 이 구제가 복원된 타워에 닿지 않았다. 실측(2026-07-27): 길 좌표를 담은
//    세이브를 불러오면 4기 전부 길과 거리 0px로 남았다. 그래서 복원 직후에도 부른다.
function relocateTowersToValidTiles() {
  const takenTiles = new Set();
  // ── 1차: 제자리가 아직 유효한 타워부터 자리를 확정한다 ──
  // 한 번에 처리하면 먼저 옮겨지는 타워가 "뒤에 올 멀쩡한 타워의 칸"을 차지해
  // 두 타워가 한 칸에 겹친다. 확정 → 재배치 두 단계로 나눠 그걸 막는다.
  const homeless = [];
  towers.forEach((tower) => {
    const tileX = parseInt(tower.el.style.left);
    const tileY = parseInt(tower.el.style.top);
    const matchingTile = placementTiles.find((t) => {
      const tX = parseInt(t.style.left);
      const tY = parseInt(t.style.top);
      return Math.abs(tX - tileX) < 10 && Math.abs(tY - tileY) < 10;
    });
    if (matchingTile && !takenTiles.has(matchingTile)) {
      takenTiles.add(matchingTile);
      matchingTile.style.display = "none";
    } else {
      homeless.push(tower);
    }
  });

  // ── 2차: 갈 곳 없는 타워(길 위·화면 밖)를 가장 가까운 빈 칸으로 ──
  homeless.forEach((tower) => {
    let matchingTile = null;
    {
      let best = null,
        bestD = Infinity;
      for (const t of tileIndex) {
        if (takenTiles.has(t.el)) continue;
        const d = getDistanceSq({ x: tower.x, y: tower.y }, { x: t.cx, y: t.cy });
        if (d < bestD) {
          bestD = d;
          best = t;
        }
      }
      if (best) {
        matchingTile = best.el;
        tower.el.style.left = `${best.x}px`;
        tower.el.style.top = `${best.y}px`;
        tower.x = best.cx;
        tower.y = best.cy;
        tower.target = null; // 사거리 밖으로 옮겨졌을 수 있으니 조준 초기화
      }
    }
    if (matchingTile) {
      takenTiles.add(matchingTile);
      matchingTile.style.display = "none";
    }
  });
}
const debouncedRegenerateLayout = debounce(regenerateLayout, 250);

function generatePath() {
  const { gameCanvas } = gameElements;
  pathPoints = [];
  const ws = worldScale();
  // 좁은 화면에선 길도 같이 좁힌다. 폭 50 그대로면 길 세 줄(150px)이
  // 플레이 높이(≈220px)를 거의 다 먹어 타워 놓을 자리가 안 남는다(실측: 타일 25→6개).
  const pathWidth = Math.round(50 * ws);
  const vw = window.innerWidth;

  const { top: playTop, height: playH } = playfieldBounds();

  // ── 길 줄 수와 타워 밴드를 "하나의 세로 예산"으로 함께 배치 ──────────────
  // v6.2까지는 길 y를 0.32/0.5/0.88 같은 고정 비율로 두고, 타일은 그것과
  // 무관한 고정 격자로 깔았다. 데스크톱(플레이 높이 785px)에선 우연히 맞았지만
  // 폰 가로(273px)에선 위 두 줄 간격이 44px밖에 안 돼 길이 서로 붙어
  // 한 덩어리가 되고, 격자 줄들이 통째로 길에 먹혔다(실측: 타일 34개 중
  // 19개가 맨 윗줄, 나머지는 오른쪽 끝 — 가운데가 전부 길).
  // 이제는 [밴드][길][밴드][길]… 로 번갈아 쌓아서 길 사이마다 타워 한 줄이
  // 들어갈 자리를 "설계상" 보장한다. 화면이 아무리 낮아도 깨지지 않는다.
  const roadVisual = roadVisualWidth(); // 글로우 테두리까지 실제 차지폭
  const step = tileStep();
  let rows = 3; // 길(가로줄) 개수
  let bands = 4; // 타워를 놓는 가로 밴드 개수
  for (let r = 3; r >= 2; r--) {
    if (r * roadVisual + (r + 1) * step <= playH) {
      rows = r;
      bands = r + 1; // 맨 아래에도 밴드 하나 더 (데스크톱)
      break;
    }
    if (r * roadVisual + r * step <= playH) {
      rows = r;
      bands = r; // 낮은 화면 — 맨 아래 밴드는 포기하고 길 개수를 지킨다
      break;
    }
    if (r === 2) {
      rows = 2;
      bands = 2;
    }
  }

  // 극단적으로 낮은 창(바 두 개가 거의 맞닿는 경우)에서도 음수가 되지 않게.
  // 밴드가 0이면 타일이 안 깔릴 뿐, 길·성은 정상 배치된다.
  const bandH = Math.max(0, (playH - rows * roadVisual) / bands);
  const roadYs = (roadRowYs = []);
  tileBands = [];
  let cursor = playTop;
  for (let i = 0; i < bands; i++) {
    tileBands.push({ top: cursor, h: bandH });
    cursor += bandH;
    if (i < rows) {
      roadYs.push(cursor + roadVisual / 2);
      cursor += roadVisual;
    }
  }

  // ── 뱀길(serpentine) — 오른쪽 아래로 들어와 지그재그로 올라가 왼쪽 위 성으로 ──
  // roadYs[0]이 최상단(성이 있는 줄), 마지막이 최하단(몬스터 입구).
  // 꺾는 x는 줄 번호로 정한다(i % 2). 줄이 2개로 줄어도 마지막 꺾임이
  // 오른쪽(0.8vw)에 남아 성이 있는 윗줄이 화면을 가로지른다 — 줄 수로 인덱싱하면
  // 2줄일 때 왼쪽(0.2vw)에서 꺾여 윗줄이 78px짜리 토막이 된다(740×300 실측).
  const turnX = [vw * 0.2, vw * 0.8];
  const points = [{ x: vw - 10, y: roadYs[rows - 1] }];
  for (let i = rows - 1; i >= 1; i--) {
    const x = turnX[i % 2];
    points.push({ x, y: roadYs[i] });
    points.push({ x, y: roadYs[i - 1] });
  }
  points.push({ x: 70, y: roadYs[0] });

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    for (let j = 0; j < length; j += 5) {
      const ratio = j / length;
      pathPoints.push({
        x: p1.x + (p2.x - p1.x) * ratio,
        y: p1.y + (p2.y - p1.y) * ratio,
      });
    }
  }
  pathPoints.push(points[points.length - 1]);

  // v5.6: 길을 진짜 길처럼 — DOM 직사각형 대신 캔버스에 연속 스트로크(둥근 코너)+돌길 질감
  drawRoad(points, pathWidth);
}

// v6: 오늘의 시드 — KST 8:50 컷 날짜 + 학기 + 웨이브로 결정 (전국 공통 웨이브 조성)
function dailySeedForWave(wave) {
  const day = new Date(Date.now() + 9 * 3600e3 - (8 * 3600e3 + 50 * 60e3))
    .toISOString()
    .split("T")[0];
  const s = `${day}|${selectedDifficulty}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h ^ Math.imul(wave, 2654435761)) + 1;
}

// 결정론 난수 (seed) — 조약돌 위치 고정용
function seededRand(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

// 흙 텍스처 패턴 캐시. createPattern은 원본 크기 그대로 반복하므로(512px)
// 폭 50px짜리 길에 쓰면 무늬가 너무 커서 얼룩처럼 보인다. 먼저 오프스크린
// 캔버스에 줄여 그린 뒤 그걸로 패턴을 만든다 — 반복 주기를 직접 정할 수 있고,
// pattern.setTransform(구형 사파리 미지원)에 기대지 않아도 된다.
let roadPatternCache = { key: "", pattern: null };
function getRoadPattern(ctx, w) {
  const img = getSprite("road_dirt");
  if (!img) return null;
  // 반복 주기. 너무 줄이면(길 폭의 2~3배) 512px 원본이 4배 넘게 압축돼
  // 자갈이 서브픽셀로 뭉개지고 밋밋해진다(실측). 원본에 가깝게 큼직하게 잡을수록
  // 결이 살고 반복 주기도 길어져 되풀이가 덜 보인다.
  const tile = Math.max(150, Math.round(280 * worldScale()));
  const key = `${tile}`;
  if (roadPatternCache.key === key && roadPatternCache.pattern) {
    return roadPatternCache.pattern;
  }
  try {
    const cv = document.createElement("canvas");
    cv.width = cv.height = tile;
    const c = cv.getContext("2d");
    c.drawImage(img, 0, 0, tile, tile);
    // 생성 텍스처가 게임 팔레트보다 밝고 노랗다 — 어두운 밤 배경에서 길만
    // 떠 보인다. 패턴을 만들 때 한 번만 눌러 둔다(그릴 때마다 덧칠하지 않게).
    c.globalCompositeOperation = "multiply";
    c.fillStyle = "rgba(150,124,96,1)";
    c.fillRect(0, 0, tile, tile);
    const pattern = ctx.createPattern(cv, "repeat");
    roadPatternCache = { key, pattern };
    return pattern;
  } catch {
    return null; // 어떤 이유로든 실패하면 단색 폴백
  }
}

function drawRoad(corners, w) {
  if (!pathCanvas || !pathCanvas.isConnected) {
    pathCanvas = document.createElement("canvas");
    pathCanvas.id = "pathCanvas";
    pathCanvas.style.cssText =
      "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;";
    gameElements.gameCanvas.appendChild(pathCanvas);
    pathCtx = pathCanvas.getContext("2d");
  }
  pathCanvas.width = window.innerWidth;
  pathCanvas.height = window.innerHeight;
  const ctx = pathCtx;
  ctx.clearRect(0, 0, pathCanvas.width, pathCanvas.height);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const traceStroke = (width, color) => {
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++)
      ctx.lineTo(corners[i].x, corners[i].y);
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.stroke();
  };

  const TWO_PI = Math.PI * 2;
  // 테두리도 길 폭과 같이 줄인다. 18px 고정이면 낮은 화면에서 길 폭(31px)보다
  // 테두리가 더 두꺼워져 길 세 줄이 글로우로 이어 붙어 한 덩어리로 보인다.
  const ws = worldScale();
  const rim = Math.round(18 * ws);
  // 1) 바깥 마법 글로우 테두리 (정적이라 shadowBlur 1회 허용)
  ctx.save();
  ctx.shadowColor = "rgba(130,100,220,0.5)";
  ctx.shadowBlur = Math.round(20 * ws);
  traceStroke(w + rim, "#20172c");
  ctx.restore();
  // 2) 어두운 흙 가장자리(파인 느낌) → 3) 본 노면 → 4) 밝은 중앙 트랙
  traceStroke(w + Math.round(8 * ws), "#33291e");
  traceStroke(w + Math.round(2 * ws), "#4a3b2a");
  // 노면은 실제 흙 텍스처 에셋으로 칠한다. 길 '모양'은 화면 크기마다 달라져서
  // 런타임 계산이라(폰 가로 3줄/2줄) 길 전체를 한 장 그림으로 못 만든다 →
  // 표면 질감만 타일 텍스처로 뽑아 패턴으로 채우고 모양·테두리는 절차적으로.
  // 에셋이 없거나 못 받으면 단색으로 폴백한다(오프라인·로드 실패 안전망).
  const roadPattern = getRoadPattern(ctx, w);
  traceStroke(w, roadPattern || "#6b5640");
  // 5) 안쪽 그림자(가장자리 어둡게 — 길이 파인 입체감)
  //    예전엔 안쪽을 불투명 색으로 다시 칠해 되살렸는데, 그러면 흙 텍스처가
  //    덮여 버린다. 안쪽은 텍스처로 되칠해서 파인 느낌만 남긴다.
  ctx.save();
  ctx.globalAlpha = 0.35;
  traceStroke(w, "#2c2318");
  ctx.globalAlpha = 1;
  traceStroke(w - Math.round(10 * ws), roadPattern || "#6f5a41");
  ctx.restore();
  // 6) 밟아 다져진 밝은 중앙 트랙 — 텍스처가 비치도록 반투명으로
  ctx.save();
  ctx.globalAlpha = roadPattern ? 0.09 : 1;
  traceStroke(w * 0.5, "#a8865e");
  ctx.restore();

  // ── 노면 질감 ────────────────────────────────────────────────────────
  // 예전엔 10px마다 비슷한 크기의 자갈을 하나씩 깔았다(길 전체 350개+).
  // 균일한 밀도의 작은 원이 끝없이 반복돼 "환공포증 걸리겠다"는 소리를 들었다.
  // 대신 진짜 흙길처럼: ① 수레바퀴 자국(세로 결) ② 큰 얼룩으로 색 변주
  // ③ 드문드문 박힌 큼직한 돌. 점의 개수를 1/10로 줄이고 크기 편차를 키운다.
  const rnd = seededRand(1337);
  ctx.save();

  // i번째 점의 법선(px,py)과 진행방향(tx,ty). 결·자국·얼룩·돌이 공통으로 쓴다.
  const frameAt = (i) => {
    const p = pathPoints[i];
    const nx = i + 1 < pathPoints.length ? pathPoints[i + 1].x - p.x : 0;
    const ny = i + 1 < pathPoints.length ? pathPoints[i + 1].y - p.y : 0;
    const len = Math.hypot(nx, ny) || 1;
    return { p, px: -ny / len, py: nx / len, tx: nx / len, ty: ny / len };
  };
  const k = Math.max(0.6, w / 50); // 길이 좁아지면 질감도 같이 작아진다

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // 7-a) 큰 얼룩 — 마른 흙/젖은 흙의 색 변주. 크고 옅게 겹쳐 깔아
  //      "같은 점의 반복"이 아니라 자연스러운 얼룩덜룩함을 만든다.
  for (let i = 0; i < pathPoints.length; i += 11) {
    const { p, px, py, tx, ty } = frameAt(i);
    const spread = (rnd() - 0.5) * (w - 8);
    const cx = p.x + px * spread;
    const cy = p.y + py * spread;
    // 길 방향으로 길쭉하게 눕힌다. 동그란 얼룩은 물자국처럼 도드라져 보이지만,
    // 진행 방향으로 늘이면 결과 섞여 흙색 변주로만 읽힌다.
    const r = w * (0.3 + rnd() * 0.4);
    ctx.fillStyle =
      rnd() > 0.45 ? "rgba(170,139,99,0.10)" : "rgba(58,44,28,0.11)";
    ctx.beginPath();
    ctx.ellipse(
      cx,
      cy,
      r * (1.6 + rnd() * 1.2),
      r * (0.16 + rnd() * 0.16),
      Math.atan2(ty, tx),
      0,
      TWO_PI,
    );
    ctx.fill();
  }

  // 7-b) 흙 결 — 진행 방향으로 난 짧은 선. 점이 아니라 '선'이라
  //      아무리 많아도 물방울 패턴으로 안 읽히고, 다져진 흙처럼 보인다.
  //      텍스처 에셋이 붙으면 잔결은 텍스처가 대신하므로 확 줄인다
  //      (겹쳐 그리면 지저분해진다). 방향감을 주는 최소한만 남긴다.
  const grainKeep = roadPattern ? 0.16 : 0.62; // 그릴 확률(작을수록 성김)
  for (let i = 0; i < pathPoints.length - 2; i += 3) {
    if (rnd() > grainKeep) continue;
    const { p, px, py, tx, ty } = frameAt(i);
    const off = (rnd() - 0.5) * (w - 5);
    const x0 = p.x + px * off;
    const y0 = p.y + py * off;
    const len = (5 + rnd() * 24) * k;
    ctx.strokeStyle =
      rnd() > 0.5
        ? `rgba(130,106,75,${(0.09 + rnd() * 0.11).toFixed(3)})`
        : `rgba(56,43,28,${(0.07 + rnd() * 0.1).toFixed(3)})`;
    ctx.lineWidth = (0.8 + rnd() * 1.8) * k;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + tx * len, y0 + ty * len);
    ctx.stroke();
  }

  // 7-c) 수레바퀴 자국 — 길을 따라 이어지는 두 줄 + 가운데 밟힌 마루.
  //      길에 방향감을 주고 결과 어우러져 '다니는 길'로 읽힌다.
  for (const [off, color, width] of [
    [-0.2, "rgba(52,39,25,0.26)", 4.2],
    [0.18, "rgba(52,39,25,0.22)", 3.6],
    [-0.01, "rgba(176,146,105,0.16)", 5.0],
  ]) {
    ctx.beginPath();
    for (let i = 0; i < pathPoints.length; i += 3) {
      const { p, px, py } = frameAt(i);
      // 오프셋을 흔들어 자로 잰 듯한 평행선을 피한다
      const wobble = off * w + Math.sin(i * 0.07 + off * 9) * (w * 0.045);
      const x = p.x + px * wobble;
      const y = p.y + py * wobble;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width * k;
    ctx.stroke();
  }

  // 7-d) 박힌 돌 — 22점(≈110px)에 하나꼴로 드물게. 예전엔 10px마다 하나씩
  //      비슷한 크기로 깔려 있었다(길 전체 350개+). 개수를 1/10로 줄이고
  //      크기 편차를 키워 '우연히 박힌 돌'로 보이게 한다.
  for (let i = 0; i < pathPoints.length; i += 22) {
    if (rnd() > 0.72) continue; // 규칙적인 간격도 깨준다
    const { p, px, py } = frameAt(i);
    const spread = (rnd() - 0.5) * (w - 14);
    const cx = p.x + px * spread;
    const cy = p.y + py * spread;
    const big = rnd() > 0.7;
    const r = (big ? 5.5 + rnd() * 4 : 2.5 + rnd() * 2.5) * k;
    const rot = rnd() * Math.PI;
    const squash = 0.55 + rnd() * 0.3;
    // 그림자 → 본체 → 하이라이트 (박힌 입체감)
    ctx.fillStyle = "rgba(28,20,12,0.42)";
    ctx.beginPath();
    ctx.ellipse(cx + 1, cy + 1.3, r, r * squash, rot, 0, TWO_PI);
    ctx.fill();
    const base = 92 + rnd() * 62;
    ctx.fillStyle = `rgba(${(base + 26) | 0},${(base + 6) | 0},${(base - 24) | 0},0.62)`;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * squash, rot, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = "rgba(214,192,154,0.26)";
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.3, cy - r * squash * 0.35, r * 0.4, r * squash * 0.34, rot, 0, TWO_PI);
    ctx.fill();
  }
  // 8) 가장자리 이끼/풀 틴트 (드문드문)
  for (let i = 0; i < pathPoints.length; i += 9) {
    if (rnd() > 0.5) continue;
    const p = pathPoints[i];
    const nx = i + 1 < pathPoints.length ? pathPoints[i + 1].x - p.x : 0;
    const ny = i + 1 < pathPoints.length ? pathPoints[i + 1].y - p.y : 0;
    const len = Math.hypot(nx, ny) || 1;
    const perpX = -ny / len,
      perpY = nx / len;
    const side = rnd() > 0.5 ? 1 : -1;
    const cx = p.x + perpX * (w / 2 - 3) * side;
    const cy = p.y + perpY * (w / 2 - 3) * side;
    ctx.fillStyle = "rgba(70,90,45,0.35)";
    ctx.beginPath();
    ctx.ellipse(cx, cy, 3 + rnd() * 3, 2, rnd() * Math.PI, 0, TWO_PI);
    ctx.fill();
  }
  ctx.restore();
}

function positionCastle() {
  if (pathPoints.length > 0) {
    const { castleEl } = gameElements;
    const lastPoint = pathPoints[pathPoints.length - 1];
    // .castle 박스(140px) 아래로 체력바가 32px 더 튀어나온다(실측: y+244~y+283).
    // 낮은 화면에선 이 꼬리가 하단 컨트롤 바 밑으로 숨어 체력이 안 보였다
    // (740×300 실측: 27px 가림). 발자국 전체가 플레이 영역에 들어오도록 올려 붙인다.
    const CASTLE_FOOTPRINT = 176;
    const pf = playfieldBounds();
    // v5.8: 캐슬 앵커를 아래로(-50 → -20) — 첨탑이 상단 info-bar에 잘리던 문제
    castleCoords = {
      x: Math.max(10, lastPoint.x),
      y: Math.max(
        10,
        Math.min(lastPoint.y - 20, pf.bottom - CASTLE_FOOTPRINT),
      ),
    };
    castleEl.style.left = `${castleCoords.x}px`;
    castleEl.style.top = `${castleCoords.y}px`;
  }
}

function createPlacementTiles() {
  const { gameCanvas } = gameElements;
  placementTiles.forEach((tile) => tile.remove());
  placementTiles = [];
  clearTileFocus();
  tileIndex = [];
  // 타일 자체는 줄이지 않는다 — 손가락 터치 타깃이라 40px 아래로는 누르기 어렵다.
  // 대신 길·성 주변 여유(버퍼)만 화면에 맞춰 좁혀 놓을 자리를 확보한다.
  const ws = worldScale();
  const tileSize = TILE_SIZE,
    gap = Math.round(10 * ws),
    castleBuffer = 120 * ws,
    // 길 중심에서 이만큼은 떨어져야 놓을 수 있다.
    // = 길이 보이는 폭의 절반 + 타일 절반 + 여유 2px.
    // 이보다 작으면 타일이 길 테두리를 파고들고, 그 위에 선 타워 스프라이트(78px)가
    // 길에 걸터앉은 것처럼 보인다(사용자 신고: "타워가 길로 내려왔잖아").
    pathBuffer = roadVisualWidth() / 2 + tileSize / 2 + 2,
    pathBufferSq = pathBuffer * pathBuffer;
  const castleBufferSq = castleBuffer * castleBuffer;

  // 타일 줄은 generatePath가 길 사이에 확보해 둔 밴드 안에만 깐다.
  // (예전엔 화면 위에서부터 고정 간격으로 깔아서, 줄이 통째로 길과 겹치면
  //  그 줄이 전부 사라졌다 — 폰 가로에서 5줄 중 2줄만 살아남던 원인.)
  const rowYs = [];
  const bands = tileBands.length
    ? tileBands
    : [{ top: playfieldBounds().top, h: playfieldBounds().height }];
  for (const band of bands) {
    const n = Math.max(0, Math.floor((band.h + gap) / (tileSize + gap)));
    if (n === 0) continue;
    const used = n * tileSize + (n - 1) * gap;
    const start = band.top + (band.h - used) / 2;
    for (let k = 0; k < n; k++)
      rowYs.push(Math.round(start + k * (tileSize + gap)));
  }

  for (const y of rowYs) {
    for (let x = gap; x < window.innerWidth - tileSize; x += tileSize + gap) {
      const tilePos = { x: x + tileSize / 2, y: y + tileSize / 2 };
      let onPath = false;
      for (const point of pathPoints) {
        if (getDistanceSq(tilePos, point) < pathBufferSq) {
          onPath = true;
          break;
        }
      }
      if (onPath) continue;
      if (
        castleCoords.x &&
        getDistanceSq(tilePos, {
          x: castleCoords.x + 50,
          y: castleCoords.y + 50,
        }) < castleBufferSq
      ) {
        continue;
      }
      const tile = document.createElement("div");
      tile.className = "placement-tile";
      tile.style.left = `${x}px`;
      tile.style.top = `${y}px`;

      tile.addEventListener("click", handleTileTap);
      if (!isMobile) {
        tile.addEventListener("mouseover", (e) =>
          ui.showTowerInfoTooltip(null, e.clientX, e.clientY),
        );
        tile.addEventListener("mouseout", ui.hideTowerInfoTooltip);
      }

      gameCanvas.appendChild(tile);
      placementTiles.push(tile);
      tileIndex.push({
        el: tile,
        x,
        y,
        cx: x + tileSize / 2,
        cy: y + tileSize / 2,
      });
    }
  }
  lastFocusScanPos = { x: -9999, y: -9999 }; // 다음 프레임에 강제 재탐색
}

function recreateTower(towerData) {
  const { gameCanvas } = gameElements;
  const stat = { ...TOWER_STATS[towerData.type] };
  if (isMobile) stat.range *= 1.05;

  const x = towerData.tile.x;
  const y = towerData.tile.y;

  const tower = {
    id: Date.now() + Math.random(),
    type: towerData.type,
    x: x + 20,
    y: y + 20,
    level: towerData.level,
    ...stat,
    cooldownUntil: 0,
    el: document.createElement("div"),
    rangeSq: stat.range * stat.range,
    splashRadiusSq: (stat.splashRadius || 0) ** 2,
  };

  // v8: 레벨업 계산을 여기서 재구현하지 않는다. simCore가 단일 진실원이고,
  //     사본을 두면 밸런스 패치가 한쪽에만 적용돼 "복원된 타워"와 "방금 올린 타워"의
  //     능력치가 조용히 어긋난다(크래시가 아니라 수치 차이라 QA에서 안 걸린다).
  //     applyTowerUpgrade는 level을 스스로 올리므로 1에서 시작해 목표 레벨까지 돌린다.
  const targetLevel = tower.level;
  tower.level = 1;
  while (tower.level < targetLevel) simCore.applyTowerUpgrade(tower);
  tower.rangeSq = tower.range * tower.range;

  // v6: 각성 단계 복원
  const savedAwaken = towerData.awaken || 0;
  for (let i = 0; i < savedAwaken; i++) simCore.applyTowerAwaken(tower);

  // 디버프 잔여 복원(저장에 없으면 그대로 0 — 구 세이브 호환)
  if (towerData.dis > 0) tower.disabledUntil = gameClock + towerData.dis;
  if (towerData.tw > 0) tower.timeWarpedUntil = gameClock + towerData.tw;

  tower.el.className = `tower tower-${tower.type}`;
  if (savedAwaken > 0) tower.el.classList.add("tower-awakened");
  tower.el.style.left = `${x}px`;
  tower.el.style.top = `${y}px`;
  tower.el.onclick = () => {
    selectedTowerForUpgrade = tower;
    ui.showTowerUpgradeSelector(tower, gold, upgradeTower, sellTower);
  };
  if (!isMobile) {
    tower.el.addEventListener("mouseover", (e) =>
      ui.showTowerInfoTooltip(tower, e.clientX, e.clientY),
    );
    tower.el.addEventListener("mouseout", ui.hideTowerInfoTooltip);
  }
  const levelIndicator = document.createElement("div");
  levelIndicator.className = "tower-level";
  levelIndicator.textContent = savedAwaken > 0 ? `★${savedAwaken}` : tower.level;
  tower.el.appendChild(levelIndicator);
  tower.levelIndicator = levelIndicator;
  gameCanvas.appendChild(tower.el);

  // [수정] 브라우저 리페인트(repaint)를 강제하여 그래픽 깨짐 방지
  void tower.el.offsetWidth;

  // v9: 상자 개봉·세이브 복원으로 생긴 타워에도 이번 판 축복을 바른다.
  //     배수 추적식이라 복원 직후 applyBlessingsToWorld()가 또 불려도 중복 누적되지 않는다.
  applyBlessingsToNewTower(tower);

  towers.push(tower);

  const tileToRemove = placementTiles.find(
    (t) => parseInt(t.style.left) === x && parseInt(t.style.top) === y,
  );
  if (tileToRemove) tileToRemove.style.display = "none";

  updateFullUI();
}

// --- 게임 루프 및 업데이트 ---
function gameLoop(timestamp) {
  if (!gameRunning) {
    gameLoop.isRunning = false;
    return;
  }
  if (!lastFrameTime) lastFrameTime = timestamp;
  const rawDeltaTime = timestamp - lastFrameTime;
  lastFrameTime = timestamp;
  // Apply game speed multiplier to deltaTime for all gameplay updates
  // ⚠️ 시뮬에 넣는 값에만 상한을 둔다(MAX_SIM_FRAME_MS 주석 참조).
  //    저사양 감지에는 상한 없는 원본을 준다 — 상한 걸린 값을 먹이면 진짜 렉을 못 본다.
  const deltaTime = Math.min(rawDeltaTime, MAX_SIM_FRAME_MS) * gameSpeed;

  // v5: 예외 1회로 루프가 영구 정지하지 않도록 — 재예약은 무조건 (finally)
  try {
    feedFrameTime(rawDeltaTime); // 저사양 런타임 감지
    if (!gamePaused) {
      // v9: 히트스톱 — 남은 시간은 실시간으로 재고(교착 방지), 그동안 시뮬 전체를
      //     느리게 흘린다. gameClock도 같이 느려지므로 연출·쿨다운·스폰이 한 몸으로 움직인다.
      const realDelta = Math.min(rawDeltaTime, MAX_SIM_FRAME_MS);
      let simDelta = deltaTime;
      hitstopWindowElapsed += realDelta;
      if (hitstopWindowElapsed >= 1000) { hitstopWindowElapsed = 0; hitstopUsedInWindow = 0; }
      if (hitstopRemainingMs > 0) {
        hitstopRemainingMs -= realDelta;
        simDelta *= HITSTOP_SCALE;
      }
      tickFlashBudget(realDelta); // 광과민성 예산(전면 플래시 실시간 1초 2회)

      // [NEW] 게임 루프의 핵심 업데이트 순서 변경
      gameClock += simDelta; // 배속·일시정지·히트스톱이 반영된 게임 시간
      runDueDelays();        // 게임 시계 지연 큐(상자 개봉 등)
      pumpSpawner();         // v9: 스폰도 게임 시계로 — setInterval 시절의 시간축 분리 해소
      // ⚠️ 아래 갱신들은 전부 **게임 시계**를 받는다(예전엔 벽시계 timestamp였다).
      //    쿨다운·상태이상 지속시간이 벽시계면, 2배속에서 몬스터만 2배로 오고
      //    타워는 그대로 쏘게 된다 — 배속이 난이도를 바꿔 버린다.
      //    게임 시계는 일시정지 중 멈추므로 예전의 일시정지 보정(adjustPerfTimers)도
      //    필요 없어졌다(있으면 오히려 이중 보정이 된다).
      updateSpatialGrid(); // 1. 몬스터 위치를 그리드에 업데이트
      updateWizard(simDelta); // 2. 마법사 이동
      updateWizardCooldownVisual(gameClock);
      wizardAutoAttack(gameClock); // 3. 마법사 공격 (그리드 사용)
      updateTowers(gameClock, simDelta); // 4. 타워 업데이트 (그리드 사용)
      updateProjectiles(simDelta, gameClock); // 5. 발사체 이동
      updateMonsters(gameClock, simDelta); // 6. 몬스터 이동 및 상태 업데이트
      updateEffects(gameClock, simDelta); // 7. 각종 효과 업데이트
      updateDamageTexts(gameClock, simDelta); // 8. 데미지 텍스트 업데이트
      // ⚠️ 파티클은 히트스톱에 걸리지 않는다 — 타격 순간 튀는 불티까지 멈추면
      //    "멈췄다"가 아니라 "렉이다"로 읽힌다(연출의 목적이 뒤집힌다).
      if (particleSystem) particleSystem.update(deltaTime); // 8.5. [V2] 파티클 업데이트
      impactFx.updateCameraShake(realDelta); // 8.6. v9: 화면 흔들림(실시간 — 연출)
      checkWaveCompletion(); // 9. 웨이브 종료 확인
      renderDynamicLayer(); // 10. 동적 요소 렌더링
    }
  } catch (err) {
    console.error("[gameLoop] 프레임 예외 (루프는 계속):", err);
  } finally {
    requestAnimationFrame(gameLoop);
  }
}
gameLoop.isRunning = false;

// [NEW] 매 프레임마다 몬스터의 위치를 공간 그리드에 업데이트하는 함수
function updateSpatialGrid() {
  if (!spatialGrid) return;
  spatialGrid.clear();
  for (const monster of monsters) {
    if (!monster.isDead) {
      spatialGrid.insert(monster);
    }
  }
}

function updateWizard(deltaTime) {
  // 터치 드래그 중에도 타일 포커스·힌트는 갱신해야 한다(모바일의 이동 수단이므로)
  if (isDraggingWizard) {
    updateTileFocus();
    updateActionHint();
    return;
  }
  let dx = 0,
    dy = 0;
  // ⚠️ 한/영이 "한글"이면 keydown의 e.key가 ㅈㅁㄴㅇ로 온다 — 물리 키(e.code=KeyW…)도 함께 본다.
  //    이걸 빼면 한글 상태에서 마법사가 아예 안 움직인다(실측 재현).
  if (keysPressed["w"] || keysPressed["W"] || keysPressed["KeyW"] || keysPressed["ArrowUp"])
    dy -= 1;
  if (keysPressed["s"] || keysPressed["S"] || keysPressed["KeyS"] || keysPressed["ArrowDown"])
    dy += 1;
  if (keysPressed["a"] || keysPressed["A"] || keysPressed["KeyA"] || keysPressed["ArrowLeft"])
    dx -= 1;
  if (keysPressed["d"] || keysPressed["D"] || keysPressed["KeyD"] || keysPressed["ArrowRight"])
    dx += 1;

  // [V3] 마법사 스프라이트 방향, 갤럽, 애니메이션 업데이트
  wizardSprite.setDirection(dx, dy);
  const isMoving = dx !== 0 || dy !== 0;
  const isRunning =
    isMoving && (keysPressed["Shift"] || keysPressed["ShiftLeft"]);
  wizardSprite.setGalloping(isRunning);
  wizardSprite.update(deltaTime);

  if (dx !== 0 || dy !== 0) {
    const moveAmount = wizardSpeed * (deltaTime / 16.66);
    wizardPosition.x = Math.max(
      0,
      Math.min(
        window.innerWidth - wizardSprite.width,
        wizardPosition.x + dx * moveAmount,
      ),
    );
    wizardPosition.y = Math.max(
      0,
      Math.min(
        window.innerHeight - wizardSprite.height,
        wizardPosition.y + dy * moveAmount,
      ),
    );
    gameElements.wizardEl.style.transform = `translate(${Math.round(wizardPosition.x)}px, ${Math.round(wizardPosition.y)}px)`;
  }

  updateTileFocus();
  updateActionHint();
}

// --- [UX] 마법사 근접 건설 ---------------------------------------------------

function clearTileFocus() {
  if (focusedTile) {
    focusedTile.classList.remove("tile-focus");
    focusedTile.removeAttribute("data-build-hint");
  }
  focusedTile = null;
}

/** 마법사가 올라선 배치 타일을 찾아 하이라이트한다. 마법사가 움직였을 때만 재탐색. */
function updateTileFocus() {
  if (!gameRunning || gamePaused) {
    clearTileFocus();
    return;
  }
  const c = wizardCenterPoint();
  const moved =
    Math.abs(c.x - lastFocusScanPos.x) > 4 ||
    Math.abs(c.y - lastFocusScanPos.y) > 4;
  // 건설창이 열려 있는 동안에는 대상 타일이 바뀌면 혼란스러우니 고정
  if (!moved || buildStep !== "idle") return;
  lastFocusScanPos = c;

  const reachSq = BUILD_REACH * BUILD_REACH;
  let best = null,
    bestD = Infinity;
  for (const t of tileIndex) {
    if (t.el.style.display === "none") continue; // 이미 타워가 선 자리
    const d = (t.cx - c.x) ** 2 + (t.cy - c.y) ** 2;
    if (d < bestD && d <= reachSq) {
      best = t;
      bestD = d;
    }
  }
  const nextEl = best ? best.el : null;
  if (nextEl === focusedTile) return;
  clearTileFocus();
  if (nextEl) {
    nextEl.classList.add("tile-focus");
    nextEl.setAttribute("data-build-hint", isTouchLike ? "탭하여 건설" : "E 건설");
    focusedTile = nextEl;
  }
}

/** 지금 무엇을 누르면 되는지 한 줄로 알려준다 (상황이 바뀔 때만 DOM 갱신). */
function updateActionHint() {
  const el = gameElements.actionHint;
  if (!el) return;
  let text = "";
  let build = false;
  if (!gameRunning || gamePaused) {
    text = "";
  } else if (buildStep !== "idle") {
    text = isTouchLike
      ? "🏗️ 지을 타워를 고르세요 · 빈 곳을 탭하면 취소"
      : "🏗️ 타워를 고르세요 — <kbd>←→↑↓</kbd> 이동 · <kbd>Enter</kbd> 건설 · <kbd>1</kbd>~<kbd>9</kbd> 바로 · <kbd>Esc</kbd> 취소";
    build = true;
  } else if (focusedTile) {
    text = isTouchLike
      ? "🏗️ 빛나는 타일을 탭하면 타워를 지어요"
      : "🏗️ <kbd>E</kbd> 여기에 타워 건설 · <kbd>Space</kbd> 마법 공격";
    build = true;
  } else if (!waveInProgress) {
    text = isTouchLike
      ? "🚀 시작 버튼을 누르면 웨이브가 시작돼요"
      : "<kbd>Enter</kbd> 웨이브 시작 · <kbd>WASD</kbd> 이동 · 빛나는 타일에서 <kbd>E</kbd> 건설";
  } else {
    text = isTouchLike
      ? "마법사를 끌어서 이동 · 화면을 탭하면 마법 공격"
      : "<kbd>WASD</kbd> 이동 · <kbd>Space</kbd> 마법 공격 · 빛나는 타일에서 <kbd>E</kbd> 건설";
  }
  if (text !== lastActionHint) {
    lastActionHint = text;
    el.innerHTML = text;
  }
  el.classList.toggle("show", !!text);
  el.classList.toggle("hint-build", build);
}

/**
 * E: 마법사가 서 있는 타일에 타워를 짓는다(열려 있으면 닫는 토글).
 * ⚠️ Space에 이 역할을 겸하게 두면 안 된다 — 배치 타일이 50px 격자로 화면을 거의 다 덮어서
 *    마법사는 대부분의 위치에서 타일 위에 있고, 그러면 전투 중 Space가 항상 건설창으로
 *    가로채여 마법을 못 쏘게 된다(교차검증 지적). Space는 언제나 공격이다.
 */
function handleBuildKey() {
  if (buildStep !== "idle") {
    resetBuildProcess(); // 열려 있으면 닫기 (토글)
    updateActionHint();
    return;
  }
  if (focusedTile) openTowerSelectorForTile(focusedTile);
}

function openTowerSelectorForTile(tile) {
  const x = parseInt(tile.style.left);
  const y = parseInt(tile.style.top);
  if (pendingTile && (pendingTile.x !== x || pendingTile.y !== y))
    resetBuildProcess();
  pendingTile = { x, y };
  buildStep = "selecting_tower";
  ui.showTowerSelector(x, y, sfx);
  if (isMobile) ui.showTowerInfoTooltip(null, x, y);
  updateActionHint();
}

/**
 * 타워를 놓는 칸의 한 변. 손가락 터치 타깃이라 화면이 작아져도 줄이지 않는다.
 * (줄이면 놓을 자리는 늘지만 아이들이 못 누른다 — 대신 길 폭·여백을 줄인다.)
 */
const TILE_SIZE = 40;

/**
 * 실제로 플레이할 수 있는 세로 구간 (상단 info-bar 아래 ~ 하단 control-bar 위).
 * 바 높이를 상수로 박아두면 CSS가 바뀔 때 어긋난다 — 실측이 유일 진실원.
 * 폰 가로에선 바가 CSS로 얇아져서 상수 55/60보다 30px 가까이 여유가 더 있다.
 * 바가 아직 안 그려진 초기 호출은 상수로 폴백한다.
 */
let _pfCache = null;
let _pfCacheAt = 0;
/**
 * 바 실측값 캐시를 버린다. 창 크기·전체화면·회전처럼 바 위치가 바뀔 수 있는
 * 사건에서만 부른다(setupEventListeners에서 배선).
 */
function invalidatePlayfieldBounds() {
  _pfCache = null;
}
function playfieldBounds() {
  // ⚠️ getBoundingClientRect는 강제 동기 레이아웃(reflow)이다. 이 함수는 worldScale()을
  //    거쳐 renderDynamicLayer에서 매 프레임 호출돼 왔고, 그래서 저사양 기기(웨일북)에서는
  //    프레임마다 레이아웃 재계산 4회가 얹혔다(실측: CPU 12배 스로틀 프로파일에서
  //    getBoundingClientRect가 self-time 5.3%로 JS 최상위).
  //    바 위치는 창 크기가 바뀔 때만 변하므로 캐시한다. 놓친 변화도 1초 안에 자가치유되게
  //    TTL(1초)을 함께 둔다 — 강제 레이아웃이 초당 240회(60fps × 4)에서 초당 2회로 줄어든다.
  const nowMs = performance.now();
  if (_pfCache && nowMs - _pfCacheAt < 1000) return _pfCache;

  const infoB = document
    .getElementById("info-bar")
    ?.getBoundingClientRect().bottom;
  const ctrlT = document
    .getElementById("control-bar")
    ?.getBoundingClientRect().top;
  const top = infoB > 0 ? Math.round(infoB) : 55;
  const bottom =
    ctrlT > 0 ? Math.round(ctrlT) : window.innerHeight - 60;
  const res = { top, bottom, height: Math.max(120, bottom - top) };

  // 바가 아직 안 그려진 초기 호출(상수 폴백)은 캐시하지 않는다 — 진짜 값이 나오면
  // 즉시 그걸 쓰게. 캐시했다가는 1초 동안 폴백값으로 길·타일을 깔아버린다.
  if (infoB > 0 && ctrlT > 0) {
    _pfCache = res;
    _pfCacheAt = nowMs;
  }
  return res;
}

/**
 * 화면이 낮을 때 월드 요소를 줄이는 배율.
 * 데스크톱 기준 플레이 높이(≈560px)를 1.0으로 두고, 폰 가로처럼 낮은 화면에서 비례 축소한다.
 * 0.55 아래로는 안 내린다 — 더 줄이면 성이 뭉개져 알아보기 어렵다.
 * ⚠️ 히트박스·밸런스에 영향을 주지 않도록 "그리는 크기"에만 쓴다.
 */
function worldScale() {
  return Math.max(0.55, Math.min(1, playfieldBounds().height / 560));
}

/** 타일 한 칸이 차지하는 세로(타일 + 줄 간격). 길 배치 예산 계산의 단위. */
function tileStep() {
  return TILE_SIZE + Math.round(10 * worldScale());
}

/**
 * 길이 화면에서 실제로 차지하는 폭 — 노면(50) + 바깥 테두리(18)까지.
 * 길 배치(generatePath)와 타일 여백(createPlacementTiles)이 반드시 같은 값을 써야
 * 타일이 길 위로 올라타지 않는다.
 */
function roadVisualWidth() {
  const ws = worldScale();
  return Math.round(50 * ws) + Math.round(18 * ws);
}

/**
 * 마법사 시작 위치. 고정 (100,200)이면 플레이 높이가 213px인 화면에서
 * 성 체력바(y 213~252) 위에 겹쳐 서서 체력이 안 보였다(740×300 실측).
 * 데스크톱(플레이 높이 788)에서의 y=200을 그대로 재현하면서 낮은 화면만 따라 올라온다.
 */
function defaultWizardPosition() {
  const pf = playfieldBounds();
  return { x: 100, y: Math.round(pf.top + Math.min(157, pf.height * 0.2)) };
}

/**
 * 터치 기기에서만 전체화면을 시도한다(주소창 제거 = 플레이 영역 확보).
 * 데스크톱은 창 모드가 자연스러우니 건드리지 않는다.
 * 실패(iOS·권한 거부)해도 조용히 넘어간다 — 게임 진행에는 지장이 없다.
 */
function requestGameFullscreen() {
  if (!isTouchLike || document.fullscreenElement) return;
  const el = document.documentElement;
  const req =
    el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
  if (!req) return;
  try {
    const p = req.call(el, { navigationUI: "hide" });
    if (p && p.catch) p.catch(() => {});
  } catch {
    /* 사용자 제스처 밖 호출·미지원 — 무시 */
  }
  // 가로 고정까지 되면 회전 안내를 볼 일이 없다(안드로이드 크롬만 지원)
  try {
    screen.orientation?.lock?.("landscape").catch(() => {});
  } catch {
    /* 미지원 */
  }
}

// 건설창 커서 이동 방향
const BUILD_CURSOR_KEYS = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

// 컨트롤 바 단축키 — 버튼에 배지로 표시되는 것들과 1:1
const CONTROL_HOTKEYS = {
  Enter: "startWaveBtn",
  p: "pauseBtn",
  n: "forceNextWaveBtn",
  q: "saveGameBtn",
  f: "fullscreenBtn",
};

/** 게임 단축키 처리. 가드 → 건설 → 컨트롤 순서로 내려간다. */
function handleGameKeydown(e) {
  // 이름 입력 등 텍스트 필드에서는 게임 단축키가 가로채면 안 된다
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))
    return;

  keysPressed[e.key] = true;
  // 한글 입력 상태에서는 e.key가 "ㄷ"(E)·"ㅈ"(W)처럼 오거나 "Process"로 온다.
  // e.code는 물리 키 위치라 IME와 무관하게 KeyE·KeyW로 유지된다 → 둘 다 기록해 둔다.
  if (e.code) keysPressed[e.code] = true;

  // 브라우저 조합키(Ctrl+P 인쇄, Cmd+F 찾기 등)를 뺏지 않는다
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  // 길게 누르면 OS 자동반복으로 keydown이 연타된다 — 토글류가 무작위 상태로 끝난다.
  // 예외: 건설창의 방향키 커서는 꾹 눌러 훑는 게 자연스러워서 자동반복을 허용한다.
  if (e.repeat && !(buildStep !== "idle" && e.key.startsWith("Arrow"))) return;

  // 모달(수학 문제·게임오버·설정 등)이 떠 있으면 게임 단축키는 전부 막는다.
  // 수학 문제 중에도 gamePaused=true이므로 P로 풀어버리면 문제 흐름이 깨진다.
  const modalOpen = !!document.querySelector(".modal.show");
  if (!gameRunning || gamePaused) {
    // v9: 일시정지 중에는 P·ESC 둘 다 해제로 받는다.
    //     오버레이는 일부러 .modal 클래스를 쓰지 않는다 — 쓰면 위 modalOpen이 참이 되어
    //     자기 자신 때문에 해제가 막힌다(자기 게이트 충돌).
    const k = e.key.toLowerCase();
    if (gameRunning && gamePaused && !modalOpen && (k === "p" || k === "escape")) {
      e.preventDefault();
      document.getElementById("pauseBtn")?.click();
    }
    return;
  }
  if (modalOpen) return;

  const key = e.key.toLowerCase();

  if (e.code === "Space") {
    e.preventDefault();
    handleWizardAttack();
    return;
  }
  // 한글 상태에서도 건설이 되도록 물리 키를 함께 본다(key="ㄷ" 또는 "Process"로 오는 경우)
  if (key === "e" || e.code === "KeyE") {
    e.preventDefault();
    handleBuildKey();
    return;
  }
  if (e.key === "Escape" && buildStep !== "idle") {
    e.preventDefault();
    resetBuildProcess();
    updateActionHint();
    return;
  }
  // 건설창이 열려 있을 때 1~9로 타워 즉시 선택 (Digit/Numpad 물리 키도 인정)
  const digit = /^[1-9]$/.test(e.key)
    ? e.key
    : /^(?:Digit|Numpad)([1-9])$/.exec(e.code || "")?.[1];
  if (buildStep !== "idle" && digit) {
    e.preventDefault();
    const opts = document.querySelectorAll("#towerSelector .tower-option");
    opts[parseInt(digit, 10) - 1]?.click();
    return;
  }
  // 건설창에서 방향키 = 커서 이동. 타워가 숫자키보다 많아서 10번째 이후는 이 길로만 닿는다.
  // ⚠️ 화살표는 마법사 이동키도 겸한다 — 여기서 소비할 땐 keysPressed에서 지워야
  //    건설창을 보는 동안 마법사가 슬금슬금 움직이지 않는다.
  if (buildStep !== "idle" && BUILD_CURSOR_KEYS[e.key]) {
    e.preventDefault();
    delete keysPressed[e.key];
    const [dx, dy] = BUILD_CURSOR_KEYS[e.key];
    ui.moveTowerCursor(dx, dy);
    return;
  }
  // 건설창에서 Enter = 커서에 놓인 타워로 확정. 커서를 안 쓴 상태면 기존 Enter(웨이브 시작)로 흘린다.
  if (buildStep !== "idle" && e.key === "Enter" && ui.activateTowerCursor()) {
    e.preventDefault();
    updateActionHint();
    return;
  }

  // 컨트롤 단축키(P·N·Q·F)도 한글 상태에서 e.key가 ㅔㅜㅂㄹ로 오므로 물리 키로 되돌려 찾는다
  const physical = /^Key([A-Z])$/.exec(e.code || "")?.[1].toLowerCase();
  const id =
    CONTROL_HOTKEYS[e.key] || CONTROL_HOTKEYS[key] || CONTROL_HOTKEYS[physical];
  if (!id) return;
  const btn = document.getElementById(id);
  if (!btn || btn.disabled) return;
  e.preventDefault();
  // 건설창을 열어둔 채 웨이브가 시작되면 UI가 겹친 채로 남는다 — 먼저 정리
  if (buildStep !== "idle") {
    resetBuildProcess();
    updateActionHint();
  }
  btn.click();
}

/** 시작 버튼 라벨 — textContent로 바꾸면 안의 단축키 배지(Enter)가 지워지므로 항상 이 함수로. */
function setStartWaveLabel(text, withHint = true) {
  const btn = gameElements.startWaveBtn;
  if (!btn) return;
  btn.textContent = text;
  if (withHint && !isTouchLike) {
    const hint = document.createElement("span");
    hint.className = "key-hint";
    hint.textContent = "Enter";
    btn.appendChild(hint);
  }
}

function updateWizardCooldownVisual(timestamp) {
  const spell = WIZARD_SPELLS[activeSpell];
  if (
    spell &&
    wizardCooldowns[activeSpell] &&
    timestamp < wizardCooldowns[activeSpell]
  ) {
    gameElements.wizardEl.classList.add("on-cooldown");
  } else {
    gameElements.wizardEl.classList.remove("on-cooldown");
  }
}

function updateTowers(timestamp, deltaTime) {
  for (const tower of towers) {
    if (tower.type === "repairStation") {
      if (timestamp >= (tower.cooldownUntil || 0)) {
        tower.cooldownUntil = timestamp + tower.cooldown;
        if (getDistanceSq(tower, castleCoords) < tower.rangeSq) {
          castleHealth = Math.min(100, castleHealth + tower.repair.amount);
          sfx.play("powerup");
          createDamageText(
            { x: castleCoords.x + 50, y: castleCoords.y + 20 },
            `+${tower.repair.amount}`,
            "heal",
          );
          updateFullUI();
        }
      }
      continue;
    }

    if (tower.disabledUntil) {
      if (timestamp > tower.disabledUntil) {
        delete tower.disabledUntil;
        tower.el.classList.remove("disabled");
      } else {
        continue;
      }
    }

    if (tower.timeWarpedUntil) {
      if (timestamp > tower.timeWarpedUntil) {
        delete tower.timeWarpedUntil;
        if (tower.originalCooldown) {
          tower.cooldown = tower.originalCooldown;
          delete tower.originalCooldown;
        }
        tower.el.classList.remove("time-warped");
      }
    }

    if (tower.type === "laser") {
      if (
        !tower.target ||
        tower.target.isDead ||
        getDistanceSq(tower, tower.target) > tower.rangeSq ||
        tower.target.isStealthed
      ) {
        tower.target = null;
        if (tower.laserBeam) {
          tower.laserBeam.remove();
          tower.laserBeam = null;
        }

        // [MODIFIED] 레이저 타워의 타겟 탐색도 그리드 사용
        const nearbyMonsters = spatialGrid.getNearby(
          tower.x,
          tower.y,
          tower.range,
        );
        let bestTarget = null;
        for (const monster of nearbyMonsters) {
          if (
            monster.isDead ||
            monster.isStealthed ||
            (tower.targetType !== "all" && monster.type !== tower.targetType)
          )
            continue;
          if (getDistanceSq(tower, monster) < tower.rangeSq) {
            if (!bestTarget || monster.pathIndex > bestTarget.pathIndex)
              bestTarget = monster;
          }
        }
        if (bestTarget) tower.target = bestTarget;
      }
      if (tower.target) {
        if (!tower.laserBeam) {
          tower.laserBeam = document.createElement("div");
          tower.laserBeam.className = "laser-beam";
          gameElements.gameCanvas.appendChild(tower.laserBeam);
        }
        const dx = tower.target.x - tower.x,
          dy = tower.target.y - tower.y,
          length = Math.hypot(dx, dy),
          angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        tower.laserBeam.style.width = `${length}px`;
        tower.laserBeam.style.left = `${tower.x}px`;
        tower.laserBeam.style.top = `${tower.y - 1.5}px`;
        tower.laserBeam.style.transform = `rotate(${angle}deg)`;
        const damageThisFrame = tower.dps * (deltaTime / 1000);
        handleHit(
          {
            source: { damage: damageThisFrame, type: "laser-damage" },
            target: tower.target,
          },
          timestamp,
        );
      }
      continue;
    }

    if (timestamp < tower.cooldownUntil) continue;

    // [MODIFIED] 모든 타워가 공간 분할 그리드를 사용하여 타겟을 찾도록 수정
    let potentialTargets = spatialGrid
      .getNearby(tower.x, tower.y, tower.range)
      .filter(
        (monster) =>
          !monster.isDead &&
          !monster.isStealthed &&
          (tower.targetType === "all" || monster.type === tower.targetType),
      );

    if (potentialTargets.length === 0) continue;

    potentialTargets.sort((a, b) => b.pathIndex - a.pathIndex);

    if (tower.type === "multi-shot") {
      const targets = potentialTargets.slice(0, tower.numTargets);
      if (targets.length > 0) {
        tower.cooldownUntil = timestamp + tower.cooldown;
        targets.forEach((target) => createProjectile(tower, target));
        sfx.play("laser");
      }
    } else {
      const bestTarget = potentialTargets[0];
      tower.cooldownUntil = timestamp + tower.cooldown;
      createProjectile(tower, bestTarget);
      if (tower.type === "skyDestroyer") sfx.play("skyDestroyer");
      else if (tower.type === "goldMine") sfx.play("goldMine");
      else if (tower.type === "shredder") sfx.play("shredder");
      else sfx.play("laser");
    }
  }
}

function updateProjectiles(deltaTime, timestamp) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    if (!p.target || p.target.isDead) {
      projectiles.splice(i, 1);
      continue;
    }
    const dx = p.target.x - p.x,
      dy = p.target.y - p.y;
    const moveAmount = p.speed * (deltaTime / 16.66);
    if (dx * dx + dy * dy < moveAmount * moveAmount) {
      handleHit(p, timestamp);
      projectiles.splice(i, 1);
    } else {
      const dist = Math.sqrt(dx * dx + dy * dy);
      p.x += (dx / dist) * moveAmount;
      p.y += (dy / dist) * moveAmount;
      // [V2] 발사체 트레일 (3프레임마다 1번만 생성)
      // 예전엔 `(timestamp|0) % 3` 이라 판정이 **발사체마다가 아니라 프레임마다** 났다 —
      // 같은 프레임의 발사체 전부가 한꺼번에 트레일을 찍거나 아무도 안 찍었다.
      // 개체별 카운터로 바꿔 생성 시점이 서로 어긋나게 흩뿌린다.
      p.trailTick = (p.trailTick | 0) + 1;
      if (particleSystem && p.size >= 10 && p.trailTick % 3 === 0)
        particleSystem.trail(p.x, p.y, p.color);
    }
  }
}

function updateMonsters(timestamp, deltaTime) {
  for (let i = monsters.length - 1; i >= 0; i--) {
    const monster = monsters[i];
    if (monster.isDead) {
      monsters.splice(i, 1);
      continue;
    }

    for (const effect in monster.statusEffects) {
      if (timestamp >= monster.statusEffects[effect].endTime) {
        delete monster.statusEffects[effect];
      }
    }

    let isStunned = false;
    monster.currentSpeed = monster.baseSpeed;

    // v6: 웨이브 변이 "재생" — 매초 최대 체력의 1% 회복
    if (currentWaveModifier?.regenPctPerSec && monster.hp < monster.maxHp) {
      monster.hp = Math.min(
        monster.maxHp,
        monster.hp + monster.maxHp * currentWaveModifier.regenPctPerSec * (deltaTime / 1000),
      );
    }

    // v5: 상태 표시는 캔버스 렌더러가 담당 (DOM classList 제거 — 웨일북 최적화)
    if (monster.statusEffects.slowed) {
      monster.currentSpeed *= monster.statusEffects.slowed.factor;
    }
    if (monster.statusEffects.stunned) {
      isStunned = true;
    }
    if (monster.statusEffects.poisoned) {
      const damageThisFrame =
        (monster.statusEffects.poisoned.dps / 1000) * deltaTime;
      monster.hp -= damageThisFrame;
      if (!monster.lastPoisonTick || timestamp > monster.lastPoisonTick + 500) {
        createDamageText(
          monster,
          (monster.statusEffects.poisoned.dps / 2).toFixed(0),
          "poison",
        );
        monster.lastPoisonTick = timestamp;
      }
      if (monster.hp <= 0) {
        handleMonsterDeath(monster, timestamp);
        continue;
      }
    }

    if (
      monster.monsterKey === "healer" &&
      timestamp > (monster.lastHealTime || 0)
    ) {
      monster.lastHealTime = timestamp + monster.healCooldown;
      monsters.forEach((m) => {
        if (
          m !== monster &&
          !m.isDead &&
          getDistanceSq(monster, m) < monster.healRadiusSq
        ) {
          m.hp = Math.min(m.maxHp, m.hp + monster.healAmount);
          createDamageText(m, `+${monster.healAmount}`, "heal");
        }
      });
    }
    if (
      monster.monsterKey === "shielder" &&
      timestamp > (monster.lastShieldTime || 0)
    ) {
      monster.lastShieldTime = timestamp + monster.shieldCooldown;
      monsters.forEach((m) => {
        if (
          m.type === "ground" &&
          !m.isBoss &&
          !m.isDead &&
          getDistanceSq(monster, m) < monster.shieldRadiusSq
        ) {
          m.statusEffects.shielded = {
            endTime: timestamp + monster.shieldCooldown - 100,
          };
        }
      });
    }
    if (
      monster.monsterKey === "summoner" &&
      timestamp > (monster.lastSummonTime || 0)
    ) {
      monster.lastSummonTime = timestamp + monster.summonCooldown;
      spawnMonster(monster.summonType, { x: monster.x, y: monster.y }, true);
    }
    if (
      monster.monsterKey === "teleporter" &&
      timestamp > (monster.lastTeleportTime || 0)
    ) {
      monster.lastTeleportTime = timestamp + monster.teleportCooldown;
      if (Math.random() < monster.teleportChance) {
        createMagicEffect(monster.x, monster.y, 40, "teleport-effect", 200);
        sfx.play("blip");
        const newPathIndex = Math.min(
          pathPoints.length - 2,
          monster.pathIndex + monster.teleportDistance / 5,
        );
        monster.pathIndex = newPathIndex;
        const newPoint = pathPoints[Math.floor(newPathIndex)];
        if (newPoint) {
          monster.x = newPoint.x;
          monster.y = newPoint.y;
        }
        setTimeout(() => {
          createMagicEffect(monster.x, monster.y, 40, "teleport-effect", 200);
          sfx.play("blip");
        }, 100);
      }
    }
    if (monster.monsterKey === "assassin") {
      if (monster.isStealthed && timestamp > monster.stealthEndTime) {
        monster.isStealthed = false;
        monster.lastStealthTime = timestamp;
      }
      if (
        !monster.isStealthed &&
        timestamp > (monster.lastStealthTime || 0) + monster.stealth.cooldown
      ) {
        monster.isStealthed = true;
        monster.stealthEndTime = timestamp + monster.stealth.duration;
        sfx.play("stealth");
      }
    }
    if (
      monster.monsterKey === "disruptor" &&
      timestamp > (monster.lastDisruptTime || 0)
    ) {
      monster.lastDisruptTime = timestamp + monster.disruption.cooldown;
      let closestTower = null;
      let minDisSq = monster.disruption.range * monster.disruption.range;
      towers.forEach((t) => {
        const disSq = getDistanceSq(monster, t);
        if (disSq < minDisSq) {
          minDisSq = disSq;
          closestTower = t;
        }
      });
      if (closestTower) {
        closestTower.disabledUntil = timestamp + monster.disruption.duration;
        closestTower.el.classList.add("disabled");
        sfx.play("disrupt");
      }
    }
    if (
      monster.monsterKey === "archfiend" &&
      timestamp > (monster.lastTimeWarpTime || 0)
    ) {
      monster.lastTimeWarpTime = timestamp + monster.timeWarp.cooldown;
      const timeWarpSq = monster.timeWarp.range * monster.timeWarp.range;
      towers.forEach((t) => {
        if (getDistanceSq(monster, t) < timeWarpSq) {
          t.timeWarpedUntil = timestamp + monster.timeWarp.duration;
          t.originalCooldown = t.originalCooldown || t.cooldown;
          if (t.cooldown)
            t.cooldown = Math.floor(t.cooldown / monster.timeWarp.slowFactor);
          t.el.classList.add("time-warped");
        }
      });
      createMagicEffect(
        monster.x,
        monster.y,
        monster.timeWarp.range,
        "time-warp-effect",
        1000,
      );
      sfx.play("disrupt");
    }

    if (!isStunned) {
      monster.pathIndex += monster.currentSpeed * (deltaTime / 16.66);
      if (monster.pathIndex >= pathPoints.length - 1) {
        castleHealth -= simCore.LEAK_DAMAGE;
        waveDamageTaken += simCore.LEAK_DAMAGE;
        score = Math.max(0, score - 75);
        sfx.play("castle_hit");
        wizardSprite.setDamaged();
        // v9: 구버전은 CSS animation + 벽시계 setTimeout이었다. ㉠ 일시정지를 모르고
        //     ㉡ 2배속에서도 500ms 그대로였고 ㉢ prefers-reduced-motion을 무시했으며
        //     ㉣ 신규 흔들림과 같은 엘리먼트의 transform을 다퉜다. impactFx로 통일한다.
        impactFx.requestShake(6, 260);
        if (particleSystem && claimScreenFlash()) particleSystem.screenFlash("#ff3366", 200, 0.15);
        handleMonsterDeath(monster, timestamp);
        checkGameOver();
        continue;
      }
      const point = pathPoints[Math.floor(monster.pathIndex)];
      if (point) {
        monster.x = point.x;
        monster.y = point.y;
        // [V2] 방향 및 애니메이션 프레임 업데이트
        const dx = monster.x - monster.prevX;
        const dy = monster.y - monster.prevY;
        if (dx !== 0 || dy !== 0) {
          monster.direction = Math.atan2(dy, dx);
        }
        monster.prevX = monster.x;
        monster.prevY = monster.y;
        monster.animTimer += deltaTime;
        if (monster.animTimer >= 180) {
          monster.animTimer -= 180;
          monster.animFrame = (monster.animFrame + 1) % 4;
        }
      }
    }

  }
}

function updateEffects(timestamp) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i];
    if (timestamp > effect.endTime) {
      if (effect.poolObj) returnToPool(effect.poolObj);
      effects.splice(i, 1);
      continue;
    }
    const aoeSq = effect.aoe ? effect.aoe * effect.aoe : effect.radiusSq;

    if (
      effect.type === "blackHole" &&
      timestamp > (effect.lastTick || 0) + 500
    ) {
      effect.lastTick = timestamp;
      monsters.forEach((m) => {
        if (!m.isDead && getDistanceSq(effect.pos, m) < aoeSq) {
          const damage = effect.dps / 2;
          handleHit({ source: { damage: damage }, target: m }, timestamp);

          const dx = effect.pos.x - m.x;
          const dy = effect.pos.y - m.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 10) {
            m.x += (dx / dist) * 10;
            m.y += (dy / dist) * 10;
          }
        }
      });
    } else if (
      effect.type === "plaguePool" &&
      timestamp > (effect.lastTick || 0) + 500
    ) {
      effect.lastTick = timestamp;
      monsters.forEach((m) => {
        if (!m.isDead && getDistanceSq(effect.pos, m) < aoeSq) {
          const damage = effect.dps / 2;
          handleHit(
            { source: { damage: damage, type: "poison" }, target: m },
            timestamp,
          );
        }
      });
    }
  }
}

function updateDamageTexts(timestamp, deltaTime) {
  for (let i = damageTexts.length - 1; i >= 0; i--) {
    const dt = damageTexts[i];
    const elapsedTime = timestamp - dt.creationTime;

    if (elapsedTime > dt.duration) {
      damageTexts.splice(i, 1);
      continue;
    }
    dt.y -= 0.8 * (deltaTime / 16.66); // 위로 떠오르는 속도
    dt.opacity = 1 - elapsedTime / dt.duration; // 서서히 투명해짐
  }
}

// 렌더 실패 로그는 대상별 1회만 (매 프레임 콘솔 폭주 방지)
const _renderFailures = new Set();
function logRenderFailure(what, err) {
  if (_renderFailures.has(what)) return;
  _renderFailures.add(what);
  console.error(`[render] ${what} 그리기 실패 — 해당 개체만 생략합니다.`, err);
}

/**
 * v9: 필드에 놓인 타워의 등급 링.
 *
 * 구버전에는 필드 등급 표시가 **하나도 없었다** — 상자에서 뽑은 특급 타워와 기본
 * 타워가 화면에서 똑같이 보였다("황금왕관 이런 친구들이 구분이 잘 안 감").
 * 색만으로 구분시키지 않기 위해 4등급 이상은 링을 **이중**으로 그려 두께로도
 * 구분되게 하고, 툴팁·업그레이드 패널에는 별과 한글 라벨이 함께 나간다.
 */
function drawRarityRing(ctx, tower, scale) {
  const r = rarity.towerRarity(tower.type);
  if (r.tier <= 1) return; // 기본 등급은 아무것도 그리지 않는다(화면 소음 방지)
  const rr = 20 * scale;
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = r.color;
  ctx.lineWidth = r.tier >= 4 ? 3 : 2;
  ctx.beginPath();
  ctx.ellipse(tower.x, tower.y + rr * 0.55, rr, rr * 0.42, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (r.tier >= 4) {
    // 이중 링 = 두께로도 등급이 읽힌다(색각이상 대비). 회전 광채는 저사양·움직임
    // 민감 설정에서 끈다 — 링 자체는 남으므로 정보는 사라지지 않는다.
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(tower.x, tower.y + rr * 0.55, rr + 4, rr * 0.42 + 3, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (r.tier >= 5 && !quality.low && !prefersReducedMotion()) {
      const ph = (gameClock / 900) % (Math.PI * 2);
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.ellipse(tower.x, tower.y + rr * 0.55, rr + 4, rr * 0.42 + 3, 0, ph, ph + 1.1);
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function renderDynamicLayer() {
  if (!dynamicCtx) return;
  const canvas = dynamicCtx.canvas;
  const now = performance.now();
  // v6 버그수정: 렌더 중 예외가 나면 ctx.save()가 restore() 없이 쌓여 변환행렬이 누적된다.
  // 그러면 clearRect가 엉뚱한 영역을 지워 성이 다른 자리에 그려지고 몬스터가 화면에서
  // 사라진다(실측 재현). 프레임 시작마다 변환을 원점으로 되돌려 사고를 1프레임으로 가둔다.
  dynamicCtx.setTransform(1, 0, 0, 1, 0, 0);
  dynamicCtx.clearRect(0, 0, canvas.width, canvas.height);

  // [V2] 캐슬 캔버스 렌더링
  if (castleCoords.x != null) {
    const cx = castleCoords.x - castleRenderer.width / 2 + 50;
    const cy = castleCoords.y - castleRenderer.height + 100;
    castleRenderer.render(
      dynamicCtx,
      cx,
      cy,
      castleHealth,
      100,
      now,
      64,
      worldScale(),
    );
  }

  // [V3] 타워 캔버스 렌더링
  // 한 타워의 렌더 실패가 뒤따르는 몬스터·이펙트 그리기를 통째로 삼키지 않도록 격리한다.
  const towerScale = worldScale();
  for (const t of towers) {
    try {
      // v9: 등급 링을 **타워보다 먼저** 그린다(발밑 고리). 위에 그리면 타워 그림을 가린다.
      drawRarityRing(dynamicCtx, t, towerScale);
      towerRenderer.render(dynamicCtx, t.type, t.x, t.y, t.level, now, towerScale);
    } catch (e) {
      dynamicCtx.setTransform(1, 0, 0, 1, 0, 0);
      logRenderFailure(`tower:${t.type}`, e);
    }
  }

  // [V3] 레이저 빔 캔버스 렌더링
  for (const t of towers) {
    if (t.type === "laser" && t.target && !t.target.isDead) {
      projectileRenderer.renderBeam(
        dynamicCtx,
        t.x,
        t.y,
        t.target.x,
        t.target.y,
        now,
      );
    }
  }

  // [V2] 몬스터 캔버스 렌더링
  for (const m of monsters) {
    if (m.isDead) continue;
    if (m.isStealthed) dynamicCtx.globalAlpha = 0.15; // v5: 스텔스는 캔버스 알파로
    try {
    monsterRenderer.render(
      dynamicCtx,
      m.monsterKey,
      m.x,
      m.y,
      m.size || 32,
      m.hp,
      m.maxHp,
      m.direction,
      m.animFrame,
      {
        isFlying: m.type === "air",
        isBoss: m.isBoss,
        // v9: 걷기 사이클은 **게임 시계**로 돈다. 벽시계(now)를 쓰면 2배속에서
        //     몸은 2배로 가는데 다리는 1배라 미끄러진다. 배속을 껐다 켜도
        //     gameClock은 끊기지 않고 이어져서 위상이 튀지 않는다.
        now: gameClock,
        phase: m.animPhase, // v5.1: 몬스터별 걷기 위상 (발맞춰 행진 방지)
        isElite: m.isElite, // v5: 엘리트 캔버스 링 (구 CSS 클래스는 미적용 상태였음)
        isShielded: !!m.statusEffects.shielded,
        isPoisoned: !!m.statusEffects.poisoned,
        isSlowed: !!m.statusEffects.slowed,
        isStunned: !!m.statusEffects.stunned,
        // v9: 히트 플래시 세기(0~1). 게임 시계 기준이라 배속에서도 길이가 맞는다.
        hitFlash: impactFx.hitFlashAmount(m, gameClock),
      },
    );
    } catch (e) {
      dynamicCtx.setTransform(1, 0, 0, 1, 0, 0);
      logRenderFailure(`monster:${m.monsterKey}`, e);
    }
    if (m.isStealthed) dynamicCtx.globalAlpha = 1;
  }

  // [V3] 발사체 캔버스 렌더링 (타입별 고유 비주얼)
  for (const p of projectiles) {
    const tx = p.target ? p.target.x : p.x;
    const ty = p.target ? p.target.y : p.y;
    projectileRenderer.renderProjectile(
      dynamicCtx,
      p.type,
      p.x,
      p.y,
      p.size,
      tx,
      ty,
      now,
    );
  }

  // [V3] 캔버스 기반 스펠 이펙트 렌더링
  for (let i = activeCanvasEffects.length - 1; i >= 0; i--) {
    const e = activeCanvasEffects[i];
    const elapsed = gameClock - e.startTime; // startTime이 게임 시계 기준
    const progress = Math.min(1, elapsed / e.duration);
    if (progress >= 1) {
      activeCanvasEffects.splice(i, 1);
      continue;
    }
    projectileRenderer.renderSpellEffect(
      dynamicCtx,
      e.type,
      e.x,
      e.y,
      e.radius,
      now,
      progress,
    );
  }

  // 데미지 텍스트 그리기
  if (damageTexts.length > 0) {
    dynamicCtx.font = 'bold 16px "Do Hyeon"';
    dynamicCtx.strokeStyle = "black";
    dynamicCtx.lineWidth = 3;
    for (const dt of damageTexts) {
      let color = "#FFFFFF";
      switch (dt.type) {
        case "heal":
          color = "#2ecc71";
          break;
        case "poison":
          color = "#8bc34a";
          break;
        case "laser":
        case "reflect":
          color = "#ff4757";
          break;
        case "magic":
          color = "#9c88ff";
          break;
      }
      dynamicCtx.globalAlpha = dt.opacity;
      dynamicCtx.fillStyle = color;
      dynamicCtx.strokeText(dt.text, dt.x, dt.y);
      dynamicCtx.fillText(dt.text, dt.x, dt.y);
    }
  }
  dynamicCtx.globalAlpha = 1.0;

  // [V2] 마법사 스프라이트 렌더링 (Canvas 기반)
  if (gameRunning) {
    const wx = wizardPosition.x + wizardSprite.width / 2;
    const wy = wizardPosition.y + wizardSprite.height;
    wizardSprite.render(dynamicCtx, wx, wy);
  }

  // [V2] 파티클 시스템 렌더링
  if (particleSystem) {
    particleSystem.render(dynamicCtx);
  }
}

// --- 웨이브 및 몬스터 관리 ---
function startWave() {
  if (waveInProgress) return;
  // v8: waveInProgress 가드만으로는 부족하다. 이어하기 직후 연타·강제 진행처럼
  //     타이밍이 겹치는 경로에서 이전 웨이브의 스폰 인터벌이 살아남아 겹쳐 돌면
  //     몬스터가 두 배 속도로 쏟아진다. 진입 시 무조건 정리한다.
  stopSpawnLoop();
  sfx.play("wave_start");
  const { startWaveBtn } = gameElements;
  waveInProgress = true;
  monstersSpawned = 0;
  // 업적("N초 안에 클리어")에 쓰이는 값이라 게임 시계로 잰다 —
  // 벽시계로 재면 2배속에서 그냥 절반이 찍혀 업적이 공짜가 된다.
  waveStartTime = gameClock;
  waveDamageTaken = 0;

  // [V2] 웨이브 알림 & 음악 인텐시티
  showWaveAnnounce(currentWave);
  const intensity = Math.min(1, 0.3 + currentWave * 0.03);
  musicSystem.setIntensity(intensity);
  if (
    currentWave % 4 === 0 ||
    currentWave % 8 === 0 ||
    currentWave % 20 === 0
  ) {
    musicSystem.play("boss");
  } else if (musicSystem.currentTrack !== "gameplay") {
    musicSystem.play("gameplay");
  }

  // 웨이브 수·조성은 simCore가 단일 진실원 (밸런스 프로브와 공유)
  monstersInWave = simCore.monstersInWave(currentWave);
  // v6: "오늘의 시드" — 같은 날·같은 학기는 전국 어디서나 같은 웨이브 조성·변이
  // (일간 랭킹 = 같은 조건에서의 순위 경쟁이 되도록)
  const dailyRng = seededRand(dailySeedForWave(currentWave));
  waveComposition = simCore.buildWaveComposition(currentWave, dailyRng);

  // v6: 웨이브 변이 (30+) — 후반 조합 변주 (역시 일일 시드)
  currentWaveModifier = simCore.waveModifier(currentWave, dailyRng);
  if (currentWaveModifier) {
    showMessage(
      `${currentWaveModifier.icon} 웨이브 변이: ${currentWaveModifier.name} — ${currentWaveModifier.desc}`,
    );
  }

  shuffleArray(waveComposition);

  startWaveBtn.disabled = true;
  setStartWaveLabel(`🌊...`, false);
  spawnCount = 0;
  startSpawnLoop();
}

/**
 * 스폰 타이머를 (다시) 건다.
 * ⚠️ 간격은 벽시계 setInterval인데 `spawnIntervalMs`가 gameSpeed로 나눠 주는 구조라,
 *    **웨이브 도중 배속을 바꾸면 간격만 옛 배속에 묶인다.** 실제로 1→2배속이면 게임시간
 *    기준 스폰이 절반으로 성겨져 쉬워지고, 2→1배속이면 두 배로 몰려 어려워진다 —
 *    이 변경이 없애려던 "배속이 난이도를 바꾼다"가 스폰 경로에서 그대로 재현된다.
 *    그래서 배속 토글이 이 함수를 다시 부른다(spawnCount는 이어받는다).
 */
// v9: 스폰을 setInterval에서 **게임 시계 구동**으로 옮겼다.
//
// 왜 바꿨나 — 셋이 한꺼번에 풀린다:
//  ① 히트스톱이 게임 시간을 잠깐 느리게 흘리는데, 스폰만 벽시계로 앞서 나가면
//     그 초의 웨이브 밀도가 실제로 올라간다(난이도가 연출 때문에 바뀐다).
//  ② 배속을 토글하면 이미 걸린 인터벌은 옛 간격으로 남는다(기록된 결함 —
//     스폰이 게임시간 기준 절반으로 성겨져 오히려 쉬워졌다).
//  ③ 탭을 백그라운드로 보내면 rAF는 멈추는데 setInterval은 계속 돌아,
//     화면이 얼어붙은 채로 몬스터만 쌓였다.
// 게임 시계는 배속·일시정지·히트스톱을 전부 이미 반영하고 있으므로
// `/gameSpeed` 같은 보정이 필요 없다 — 보정 코드가 사라지는 게 옳은 방향의 신호다.
let nextSpawnAt = 0;
let spawnActive = false;

function startSpawnLoop() {
  // 구 인터벌이 남아 있으면 정리(구 세이브·구 경로 호환)
  if (spawnIntervalId) { clearInterval(spawnIntervalId); spawnIntervalId = null; }
  spawnActive = true;
  nextSpawnAt = gameClock; // 첫 마리는 즉시
}

function stopSpawnLoop() {
  spawnActive = false;
  if (spawnIntervalId) { clearInterval(spawnIntervalId); spawnIntervalId = null; }
}

/** 게임 루프가 매 프레임 부른다. 한 프레임이 길어도 밀린 만큼 따라잡는다. */
function pumpSpawner() {
  if (!spawnActive || !gameRunning) return;
  let guard = 0; // 폭주 방지(한 프레임에 최대 8마리)
  while (spawnActive && gameClock >= nextSpawnAt && guard < 8) {
    if (spawnCount < monstersInWave) {
      spawnMonster(waveComposition[spawnCount]);
      spawnCount++;
      // 간격은 게임 시간 기준이다 — gameSpeed로 나누지 않는다(게임 시계가 이미 빠르다).
      // ⚠️ `gameClock + 간격`이 아니라 **예정 시각에 더한다**. 프레임은 간격보다 성기게
      //    오므로(20fps면 프레임당 50~100ms) 매번 현재 시각으로 재기준화하면 늦은 만큼이
      //    영구히 누적된다 — 웨이브 70(간격 440ms)이 20fps에서 500ms로 늘어져 스폰이
      //    성겨지고 **난이도가 조용히 내려간다**(같은 계열의 과거 결함: setInterval 간격을
      //    시작 시 1회만 계산해 배속이 그 경로만 옛 비율로 남겼던 건). 예정 시각에 더하면
      //    위 while이 밀린 몫을 실제로 따라잡는다.
      nextSpawnAt += simCore.spawnIntervalMs(currentWave, 1);
      guard++;
    } else {
      spawnActive = false;
    }
  }
}

function spawnMonster(type, position = null, isSpecialSpawn = false) {
  if (pathPoints.length === 0) return;
  const { gameCanvas } = gameElements;
  const monsterKey = type;
  let stats = MONSTER_STATS[monsterKey];
  if (!stats) {
    console.warn(
      `'${type}' 타입의 몬스터를 찾을 수 없습니다. 'normal'로 대체합니다.`,
    );
    type = "normal";
    stats = MONSTER_STATS["normal"];
  }

  // 몬스터 스케일링은 simCore가 단일 진실원 (밸런스 프로브와 공유)
  const finalHpMultiplier =
    simCore.waveHpMultiplier(currentWave) *
    simCore.difficultyHpMultiplier(selectedDifficulty);
  const maxHp = Math.floor(stats.hp * (isSpecialSpawn ? 1 : finalHpMultiplier));
  let goldReward = Math.ceil(
    stats.gold * (isSpecialSpawn ? 1 : simCore.waveGoldMultiplier(currentWave)),
  );

  // Elite monster system
  let isElite = false;
  let eliteHpMultiplier = 1;
  let eliteSpeedMultiplier = 1;
  let eliteGoldMultiplier = 1;

  if (!isSpecialSpawn && !stats.isBoss) {
    const elite = simCore.eliteParams(currentWave);
    if (elite) {
      isElite = true;
      eliteHpMultiplier = elite.hp;
      eliteSpeedMultiplier = elite.speed;
      eliteGoldMultiplier = elite.gold;
      goldReward = Math.ceil(goldReward * eliteGoldMultiplier);
    }
  }

  // v6: 웨이브 변이 적용 (이속·골드)
  const modSpeed = currentWaveModifier?.speedFactor || 1;
  if (currentWaveModifier?.goldFactor)
    goldReward = Math.ceil(goldReward * currentWaveModifier.goldFactor);

  const finalMaxHp = Math.floor(maxHp * eliteHpMultiplier);
  const finalSpeed = stats.speed * eliteSpeedMultiplier * modSpeed;

  const monster = {
    ...stats,
    id: Date.now() + Math.random(),
    monsterKey,
    maxHp: finalMaxHp,
    hp: finalMaxHp,
    gold: goldReward, // [변경] 강화된 골드 보상 적용
    isDead: false,
    isStealthed: false,
    baseSpeed: finalSpeed,
    currentSpeed: finalSpeed,
    isElite,
    x: position ? position.x : pathPoints[0].x,
    y: position ? position.y : pathPoints[0].y,
    pathIndex: position
      ? pathPoints.findIndex((p) => getDistanceSq(p, position) < 25) || 0
      : 0,
    statusEffects: {},
    direction: 0,
    animFrame: 0,
    animTimer: 0,
    animPhase: Math.random() * Math.PI * 2, // v5.1: 걷기 위상 (개체별)
    prevX: 0,
    prevY: 0,
    defenseAuraSq: (stats.defenseAuraRadius || 0) ** 2,
    healRadiusSq: (stats.healRadius || 0) ** 2,
    shieldRadiusSq: (stats.shieldRadius || 0) ** 2,
  };

  // v5: 몬스터 DOM 제거 — 렌더링·HP바·상태는 전부 캔버스(monsterRenderer) 담당
  monsters.push(monster);
  if (!isSpecialSpawn) monstersSpawned++;
  updateFullUI();
}

function handleMonsterDeath(monster, timestamp) {
  if (monster.isDead) return;
  monster.isDead = true; // Mark for removal in the next update loop

  gold += monster.gold;
  score += monster.gold * 5;

  if (monster.monsterKey === "splitter") {
    for (let j = 0; j < monster.splitCount; j++) {
      spawnMonster(
        monster.splitsInto,
        {
          x: monster.x + (Math.random() - 0.5) * 20,
          y: monster.y + (Math.random() - 0.5) * 20,
        },
        true,
      );
    }
  }

  if (monster.monsterKey === "plaguebearer") {
    const plague = monster.plague;
    const effect = {
      type: "plaguePool",
      pos: { x: monster.x, y: monster.y },
      radius: plague.radius,
      radiusSq: plague.radius * plague.radius,
      dps: plague.dps,
      endTime: timestamp + plague.duration,
      lastTick: 0,
      poolObj: createMagicEffect(
        monster.x,
        monster.y,
        plague.radius,
        "plague-pool",
        plague.duration,
      ),
    };
    effects.push(effect);
    sfx.play("plague");
  }

  if (monster.monsterKey === "archfiend" && monster.soulDrain) {
    const healRadiusSq =
      monster.soulDrain.healRadius * monster.soulDrain.healRadius;
    monsters.forEach((m) => {
      if (
        m !== monster &&
        !m.isDead &&
        getDistanceSq(monster, m) < healRadiusSq
      ) {
        m.hp = Math.min(m.maxHp, m.hp + monster.soulDrain.healAmount);
        createDamageText(m, `+${monster.soulDrain.healAmount}`, "heal");
      }
    });
    createMagicEffect(
      monster.x,
      monster.y,
      monster.soulDrain.healRadius,
      "soul-drain-effect",
      1500,
    );
    sfx.play("powerup");
  }

  sfx.play("explosion");

  // [V2] 파티클 효과 + 업적 체크
  if (particleSystem) {
    const colors = ["#ff4444", "#ff8800", "#ffcc00"];
    const c = colors[Math.floor(Math.random() * colors.length)];
    particleSystem.explosion(monster.x, monster.y, c, monster.isBoss ? 40 : 15);
    if (monster.isBoss && heavyFxAllowed()) particleSystem.shockwave(monster.x, monster.y, 100);
  }
  totalKillCount++;
  if (monster.isBoss) totalBossKills++;
  checkAchievements("monster_kill", { totalKills: totalKillCount });
  if (monster.isBoss) checkAchievements("boss_kill", { totalBossKills });
  checkAchievements("gold_change", { gold });

  updateFullUI();
}

// getMonsterTypeForNormalWave — simCore.js로 이동 (단일 진실원)


// --- 타워 관리 ---
function handleRandomTowerPlacement(type, tile) {
  const stat = TOWER_STATS[type];
  if (gold < stat.cost || !tile) {
    showMessage("골드가 부족합니다!");
    resetBuildProcess();
    return;
  }
  gold -= stat.cost;
  score += 10;
  sfx.play("blip");

  const { gameCanvas } = gameElements;
  const boxEl = document.createElement("div");
  boxEl.className = `tower tower-${type}`;
  boxEl.style.left = `${tile.x}px`;
  boxEl.style.top = `${tile.y}px`;
  gameCanvas.appendChild(boxEl);

  const tileToRemove = placementTiles.find(
    (t) =>
      parseInt(t.style.left) === tile.x && parseInt(t.style.top) === tile.y,
  );
  if (tileToRemove) tileToRemove.style.display = "none";

  resetBuildProcess();

  const newTowerType = getRandomTowerType(type);
  const reveal = rarity.revealTier(newTowerType);

  // 개봉 대기 상태를 기록한다. 이게 없으면 골드는 이미 깎였는데(위 gold -= stat.cost)
  // 타워는 아직 없는 1초 사이에 자동저장이 끼어 **골드만 증발**한다.
  // buildGameState()가 저장 직전 flushPendingBoxes()로 강제 개봉해 그 창을 없앤다.
  const pending = { boxEl, type: newTowerType, tile: { x: tile.x, y: tile.y }, opened: false };
  pendingBoxes.push(pending);

  // ⚠️ 벽시계 setTimeout이 아니라 **게임 시계 지연 큐**다. 구버전은 일시정지 중에도
  //    개봉이 진행됐다(기록된 함정: 멈춘 화면에서 메테오가 착탄하던 것과 같은 계열).
  //    전설은 조금 더 뜸을 들인다 — 다만 1.2초를 넘기지 않는다(뽑기 연출 상한).
  scheduleGameDelay(reveal === "legendary" ? 1200 : 900, () => openBox(pending), "box");
}

/** 개봉 대기 목록. 저장 직전 flushPendingBoxes()가 비운다. */
const pendingBoxes = [];

function openBox(pending) {
  if (!pending || pending.opened) return;
  pending.opened = true;
  const i = pendingBoxes.indexOf(pending);
  if (i !== -1) pendingBoxes.splice(i, 1);

  try { pending.boxEl?.remove(); } catch { /* 이미 제거됨 */ }
  recreateTower({ type: pending.type, level: 1, tile: { x: pending.tile.x, y: pending.tile.y } });

  const stat = TOWER_STATS[pending.type];
  const r = rarity.towerRarity(pending.type);
  const reveal = rarity.revealTier(pending.type);
  const rank = rarity.attackRank(pending.type);

  // v9: 등급이 **글자로도** 보인다. 구버전은 전설이든 기본이든 똑같이
  //     "✨ ○○ 타워 획득! ✨" 한 줄이라, 뭘 뽑았는지 좋은지 알 수가 없었다.
  //     색만으로 구분시키지 않으려고 별(★)과 한글 등급을 항상 함께 낸다.
  const rankText = rank ? ` · 공격력 ${rank.rank}위` : " · 지원 타워";
  showUpgradeNotification(
    `${r.stars} ${r.label} · ${stat.name}${rankText}`,
    reveal === "legendary" ? "legendary" : reveal === "epic" ? "epic" : "",
  );

  // 연출 강도는 등급에 비례하되 상한이 있다(아동 대상 — 뽑기 감각을 키우지 않는다).
  if (reveal === "legendary") {
    sfx.play("powerup");
    if (particleSystem && !quality.low) {
      particleSystem.explosion(tileCenterX(pending.tile), tileCenterY(pending.tile), r.color, 22);
      if (heavyFxAllowed())
        particleSystem.shockwave(tileCenterX(pending.tile), tileCenterY(pending.tile), 110, r.color);
    }
    if (particleSystem && claimScreenFlash()) particleSystem.screenFlash(r.color, 320, 0.14);
    impactFx.requestShake(3, 200);
  } else if (reveal === "epic") {
    sfx.play("powerup");
    if (particleSystem && !quality.low) {
      particleSystem.explosion(tileCenterX(pending.tile), tileCenterY(pending.tile), r.color, 12);
    }
  } else {
    sfx.play("blip");
  }
  updateFullUI();
}

function tileCenterX(tile) { return tile.x + 20; }
function tileCenterY(tile) { return tile.y + 20; }

/** 저장·게임오버 직전 호출 — 대기 중인 상자를 즉시 개봉해 "골드만 사라진 상태"를 없앤다. */
function flushPendingBoxes() {
  while (pendingBoxes.length) openBox(pendingBoxes[0]);
}

function getRandomTowerType(randomBoxType) {
  // 확률표는 gameData.js가 단일 진실원 (ui.js 툴팁이 같은 표를 읽어 아이에게 보여준다)
  const weights = RANDOM_TOWER_PROBABILITY[randomBoxType];
  const rand = Math.random();
  let cumulativeProbability = 0;
  let selectedTier = 1;

  for (let i = 0; i < weights.length; i++) {
    cumulativeProbability += weights[i];
    if (rand < cumulativeProbability) {
      selectedTier = i + 1;
      break;
    }
  }

  const tierPool = RANDOM_TOWER_TIERS[selectedTier];
  return tierPool[Math.floor(Math.random() * tierPool.length)];
}

function placeTower(type) {
  const stat = { ...TOWER_STATS[type] };

  if (stat.isRandom) {
    handleRandomTowerPlacement(type, pendingTile);
    return;
  }

  const { gameCanvas } = gameElements;
  if (isMobile) stat.range *= 1.05;
  if (gold < stat.cost || !pendingTile)
    return showMessage("골드가 부족합니다!");
  gold -= stat.cost;
  score += 10;
  sfx.play("tower_place");
  const { x, y } = pendingTile;
  const tower = {
    id: Date.now(),
    type,
    x: x + 20,
    y: y + 20,
    level: 1,
    ...stat,
    cooldownUntil: 0,
    el: document.createElement("div"),
    rangeSq: stat.range * stat.range,
    splashRadiusSq: (stat.splashRadius || 0) ** 2,
  };
  tower.el.className = `tower tower-${type}`;
  tower.el.style.left = `${x}px`;
  tower.el.style.top = `${y}px`;
  tower.el.onclick = () => {
    selectedTowerForUpgrade = tower;
    ui.showTowerUpgradeSelector(tower, gold, upgradeTower, sellTower);
  };
  if (!isMobile) {
    tower.el.addEventListener("mouseover", (e) =>
      ui.showTowerInfoTooltip(tower, e.clientX, e.clientY),
    );
    tower.el.addEventListener("mouseout", ui.hideTowerInfoTooltip);
  }
  const levelIndicator = document.createElement("div");
  levelIndicator.className = "tower-level";
  levelIndicator.textContent = tower.level;
  tower.el.appendChild(levelIndicator);
  tower.levelIndicator = levelIndicator;
  gameCanvas.appendChild(tower.el);

  // [수정] 브라우저 리페인트(repaint)를 강제하여 그래픽 깨짐 방지
  void tower.el.offsetWidth;

  // v9: 판 도중에 지은 타워에도 이번 판 축복을 즉시 바른다. 이게 없으면
  //     '멀리 보는 눈'을 이미 배운 상태에서 새로 지은 타워만 조용히 미적용이라
  //     다음 스테이지 클리어(축복 재선택) 전까지 카드가 약속한 효과가 빠진다.
  applyBlessingsToNewTower(tower);

  towers.push(tower);
  const tileToRemove = placementTiles.find(
    (t) => parseInt(t.style.left) === x && parseInt(t.style.top) === y,
  );
  if (tileToRemove) tileToRemove.style.display = "none";
  resetBuildProcess();

  // [V2] 타워 빌드 업적
  totalTowersBuilt++;
  checkAchievements("tower_build", {
    totalTowers: totalTowersBuilt,
    towerType: type,
  });
  if (particleSystem) particleSystem.sparkle(tower.x, tower.y, "#00e5ff");

  updateFullUI();
}

function upgradeTower() {
  const tower = selectedTowerForUpgrade;
  if (!tower) return;
  // v6: 레벨 10 도달 후에는 각성 (골드 대량 소모 티어업 — 후반 골드 싱크)
  if (tower.level >= simCore.TOWER_MAX_LEVEL) {
    if ((tower.awaken || 0) >= simCore.TOWER_MAX_AWAKEN) return;
    const awakenCost = simCore.towerAwakenCost(tower);
    if (gold < awakenCost) return showMessage("골드가 부족합니다!");
    gold -= awakenCost;
    simCore.applyTowerAwaken(tower);
    tower.el.classList.add("tower-awakened");
    if (tower.levelIndicator)
      tower.levelIndicator.textContent = `★${tower.awaken}`;
    showUpgradeNotification(
      `✨ ${tower.name} 각성 ${tower.awaken}단계! 공격력이 크게 올랐습니다!`,
    );
    sfx.play("powerup");
    if (particleSystem && claimScreenFlash()) particleSystem.screenFlash("#ffd166", 400, 0.15);
    hideModal(gameElements.towerUpgradeSelector);
    gameElements.rangeIndicator.style.display = "none";
    updateFullUI();
    return;
  }
  const cost = simCore.towerUpgradeCost(tower);
  if (gold < cost) return showMessage("골드가 부족합니다!");
  gold -= cost;
  const beforeTargets = tower.numTargets;
  simCore.applyTowerUpgrade(tower); // 멀티샷 numTargets 증가도 여기 포함(단일 진실원)
  if (tower.type === "multi-shot" && tower.numTargets !== beforeTargets) {
    showUpgradeNotification(
      `멀티샷 타워가 이제 ${tower.numTargets}명의 적을 동시 공격합니다!`,
    );
  }
  if (tower.levelIndicator) tower.levelIndicator.textContent = tower.level;
  sfx.play("tower_upgrade");
  hideModal(gameElements.towerUpgradeSelector);
  gameElements.rangeIndicator.style.display = "none";
  updateFullUI();
}

function sellTower() {
  const tower = selectedTowerForUpgrade;
  if (!tower) return;
  const baseCost =
    tower.cost === 0 ||
    tower.type === "ultimate" ||
    tower.type === "transcendent"
      ? 350
      : tower.cost;
  gold += Math.floor(baseCost * tower.level * 0.4);
  const tileX = parseInt(tower.el.style.left),
    tileY = parseInt(tower.el.style.top);
  const matchingTile = placementTiles.find(
    (t) => parseInt(t.style.left) === tileX && parseInt(t.style.top) === tileY,
  );
  if (matchingTile) {
    matchingTile.style.display = "block";
    // 마법사가 그 자리에 선 채 판매하면 '이동 없음'이라 재탐색이 스킵된다 → 강제 무효화
    lastFocusScanPos = { x: -9999, y: -9999 };
  }
  if (tower.laserBeam) tower.laserBeam.remove();
  tower.el.remove();
  towers = towers.filter((t) => t.id !== tower.id);
  sfx.play("tower_sell");
  hideModal(gameElements.towerUpgradeSelector);
  gameElements.rangeIndicator.style.display = "none";
  updateFullUI();
}

function transformRandomTower(newType) {
  const eligibleTowers = towers.filter(
    (t) =>
      t.type !== "golden" &&
      t.type !== "silver" &&
      t.type !== "copper" &&
      t.type !== "ultimate" &&
      t.type !== "transcendent",
  );
  if (eligibleTowers.length === 0)
    return showMessage(
      `변신할 적합한 타워가 없습니다. (${TOWER_STATS[newType].name})`,
    );
  const towerToTransform =
    eligibleTowers[Math.floor(Math.random() * eligibleTowers.length)];
  const newStats = { ...TOWER_STATS[newType] };
  if (isMobile) newStats.range *= 1.05;
  Object.assign(towerToTransform, newStats, {
    type: newType,
    rangeSq: newStats.range * newStats.range,
    splashRadiusSq: (newStats.splashRadius || 0) ** 2,
  });
  // ⚠️ 위 assign이 사거리·광역을 **축복 적용 전 기본값**으로 덮어썼는데 배수 기록
  //    (_blessRange/_blessSplash)은 그대로 남는다 → 다음 재적용 때 "이미 발라져 있다"고
  //    판단해 건너뛰고, 변신한 타워만 영영 축복을 잃는다. 기록을 지우고 다시 바른다.
  delete towerToTransform._blessRange;
  delete towerToTransform._blessSplash;
  applyBlessingsToNewTower(towerToTransform);
  towerToTransform.el.className = `tower tower-${newType}`;
  showUpgradeNotification(`✨ 타워가 ${newStats.name} 타워로 변신했습니다!`);
  sfx.play("powerup");
  updateFullUI();
}

function deleteWeakestTower() {
  const eligibleTowers = towers.filter(
    (t) => t.type !== "ultimate" && t.type !== "transcendent",
  );
  if (eligibleTowers.length === 0)
    return showMessage("삭제할 타워가 없습니다!");

  let cheapestTowers = [],
    minCost = Infinity;
  eligibleTowers.forEach((tower) => {
    const baseCost =
      tower.cost === 0 || tower.type === "ultimate" ? 350 : tower.cost;
    if (baseCost < minCost) {
      minCost = baseCost;
      cheapestTowers = [tower];
    } else if (baseCost === minCost) {
      cheapestTowers.push(tower);
    }
  });

  if (cheapestTowers.length === 0)
    return showMessage("삭제할 타워가 없습니다!");

  const towerToDelete =
    cheapestTowers[Math.floor(Math.random() * cheapestTowers.length)];
  const tileX = parseInt(towerToDelete.el.style.left),
    tileY = parseInt(towerToDelete.el.style.top);
  const matchingTile = placementTiles.find(
    (t) => parseInt(t.style.left) === tileX && parseInt(t.style.top) === tileY,
  );
  if (matchingTile) {
    matchingTile.style.display = "block";
    // 마법사가 그 자리에 선 채 판매하면 '이동 없음'이라 재탐색이 스킵된다 → 강제 무효화
    lastFocusScanPos = { x: -9999, y: -9999 };
  }
  if (towerToDelete.laserBeam) towerToDelete.laserBeam.remove();
  towerToDelete.el.remove();
  towers = towers.filter((t) => t.id !== towerToDelete.id);
  showMessage(`가장 저렴한 타워 "${towerToDelete.name}"가 삭제되었습니다!`);
  sfx.play("explosion");
  updateFullUI();
}

// --- 전투 및 상호작용 ---
function createProjectile(source, target) {
  const type = source.type ? source.type : "wizard-auto";

  const projectile = {
    x: source.x,
    y: source.y,
    source,
    target,
    speed: 15,
    type: type,
    size: type === "wizard-auto" ? 15 : 11, // v5.2: 발사체 전반 크게 (어두운 배경 체감 강화)
    color: type === "wizard-auto" ? "#82AAFF" : "#FFFFFF",
  };

  // 타입에 따라 색상과 크기 지정
  switch (type) {
    case "plus":
      projectile.color = "#4CAF50";
      break;
    case "minus":
      projectile.color = "#ff9800";
      break;
    case "multiply":
      projectile.color = "#9c27b0";
      break;
    case "divide":
      projectile.color = "#f44336";
      break;
    case "ice":
      projectile.color = "cyan";
      projectile.size = 12;
      break;
    case "cannon":
      projectile.color = "#333";
      projectile.size = 15;
      break;
    case "meteor":
      projectile.color = "#ff6b35";
      projectile.size = 25;
      break;
    case "poison":
      projectile.color = "#8bc34a";
      projectile.size = 10;
      break;
    case "stun":
      projectile.color = "#ffeb3b";
      projectile.size = 10;
      break;
    case "skyDestroyer":
      projectile.color = "#ff6b35";
      projectile.size = 10;
      break; // 시각적 효과는 render에서 처리
    case "multi-shot":
      projectile.color = "#3498db";
      break;
    case "wizard-auto":
      projectile.color = "#82aaff";
      projectile.size = 6;
      break;
    case "golden":
      projectile.color = "#ffd700";
      projectile.size = 14;
      break;
    case "silver":
      projectile.color = "#c0c0c0";
      projectile.size = 12;
      break;
    case "copper":
      projectile.color = "#b87333";
      projectile.size = 10;
      break;
    case "ultimate":
      projectile.color = "#ff00ff";
      projectile.size = 16;
      break;
    case "transcendent":
      projectile.color = "#00ffff";
      projectile.size = 20;
      break;
    case "goldMine":
      projectile.color = "#ffd700";
      projectile.size = 10;
      break;
    case "shredder":
      projectile.color = "#bdc3c7";
      projectile.size = 12;
      break;
  }

  projectiles.push(projectile);
}

function createUltimateSplashEffect(x, y, radius) {
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    !isFinite(x) ||
    !isFinite(y)
  ) {
    console.warn("Invalid ultimate splash effect coordinates:", x, y);
    return null;
  }

  const effectObj = createMagicEffect(
    x,
    y,
    radius,
    "ultimate-splash-effect",
    1200,
  );
  if (effectObj) {
    effectObj.el.style.setProperty("--effect-size", `${radius * 2}px`);
    sfx.play("explosion");
    return effectObj;
  }
  return null;
}

function handleHit(projectile, timestamp) {
  const monster = projectile.target;
  const source = projectile.source;
  if (!monster || monster.isDead) return;

  if (monster.monsterKey === "ghost" && Math.random() < monster.evasionChance) {
    createDamageText(monster, "Miss", "magic");
    return;
  }
  if (monster.statusEffects.shielded) {
    delete monster.statusEffects.shielded;
    createDamageText(monster, "Block", "magic");
    return;
  }

  // v5.1: 명중 임팩트 스파클 — 큰 발사체만 + 저사양 모드 스킵 (8배 스로틀 실측 시 전량 생성은 프레임 예산 초과)
  if (particleSystem && !quality.low && projectile.size >= 10) {
    particleSystem.sparkle(monster.x, monster.y, projectile.color);
  }

  // v9: 히트 플래시 — 맞은 개체가 하얗게 번쩍인다. 셋 중 비용이 가장 싸고
  //     "맞았다"는 체감은 가장 크다(렌더러가 gameClock으로 세기를 계산한다).
  impactFx.markHitFlash(monster, timestamp);

  let damage = source.damage;

  // v8: 집중력 — 이번 판에서 문제를 맞힌 만큼 타워 피해가 오른다.
  // 여기가 타워 피해가 한 곳으로 모이는 유일한 지점이다(레이저도 이 함수를 탄다).
  // 마법사는 제외한다 — 타워가 주력이라는 기존 설계(WIZARD_DPS_CAP_RATIO)와 맞춘다.
  if (source.type) damage *= simCore.focusDamageMultiplier(focusPoints);

  // v6: 웨이브 변이 — 강철 피부(타워 피해↓) / 마법 억제(마법사 피해↓)
  if (currentWaveModifier) {
    if (source.type && currentWaveModifier.towerDamageFactor)
      damage *= currentWaveModifier.towerDamageFactor;
    if (!source.type && currentWaveModifier.wizardDamageFactor)
      damage *= currentWaveModifier.wizardDamageFactor;
  }

  if (monster.statusEffects.shredded) {
    damage *= 1 + monster.statusEffects.shredded.factor;
  }

  if (
    monster.monsterKey === "archfiend" &&
    monster.damageReflect &&
    Math.random() < monster.damageReflect.chance
  ) {
    const reflectedDamage = damage * monster.damageReflect.reflectRatio;
    createDamageText(monster, "Reflect!", "magic");
    createMagicEffect(monster.x, monster.y, 50, "damage-reflect-effect", 300);
    sfx.play("hit");
    if (source.type) {
      createDamageText(
        { x: wizardPosition.x + 20, y: wizardPosition.y + 20 },
        reflectedDamage.toFixed(0),
        "reflect",
      );
    }
  }

  if (source.type === "laser-damage" || source.type === "poison") {
    // No defense aura for these types
  } else {
    let damageReduction = 0;
    monsters.forEach((m) => {
      if (
        !m.isDead &&
        m.monsterKey === "general" &&
        getDistanceSq(monster, m) < m.defenseAuraSq
      ) {
        damageReduction = Math.max(damageReduction, m.defenseAuraBoost);
      }
    });
    if (damageReduction > 0) {
      createDamageText(monster, "Guard!", "magic");
      damage *= 1 - damageReduction;
    }
  }

  if (source.type) {
    const tower = source;

    if (tower.type === "goldMine" && tower.goldPerHit > 0) {
      gold += tower.goldPerHit;
      createDamageText(monster, `+${tower.goldPerHit}G`, "heal");
    }

    if (tower.shred && !monster.isBoss) {
      monster.statusEffects.shredded = {
        factor: tower.shred.factor,
        endTime: timestamp + tower.shred.duration,
      };
    }

    if (!monster.isBoss) {
      if (tower.poison)
        monster.statusEffects.poisoned = {
          dps: tower.poison.dps,
          endTime: timestamp + tower.poison.duration,
        };
      if (tower.slow)
        monster.statusEffects.slowed = {
          factor: tower.slow.factor,
          // v9: '차가운 손길' 축복이 붙잡는 시간을 늘린다(세기는 그대로 — 지속만).
          endTime: timestamp + tower.slow.duration * blessing.freezeMult(blessings),
        };
      if (tower.stun && Math.random() < tower.stun.chance)
        monster.statusEffects.stunned = {
          endTime: timestamp + tower.stun.duration,
        };
    } else if (tower.poison || tower.slow || tower.stun) {
      createDamageText(monster, "Immune", "magic");
    }

    if (tower.splashRadiusSq > 0) {
      if (tower.type === "ultimate" || tower.type === "transcendent") {
        createUltimateSplashEffect(
          monster.x,
          monster.y,
          Math.sqrt(tower.splashRadiusSq),
        );
      } else {
        createMagicEffect(
          monster.x,
          monster.y,
          Math.min(25, Math.sqrt(tower.splashRadiusSq) * 0.4),
          "splash-damage-effect",
          800,
        );
        // v9: 폭발 승격 — 구버전은 반경 65짜리 미사일도 25px 원 하나로 끝났다.
        //     충격파는 반경에 비례시키고, 파편은 저사양에서만 끈다.
        const R = Math.sqrt(tower.splashRadiusSq);
        if (particleSystem && !quality.low) {
          if (heavyFxAllowed())
            particleSystem.shockwave(monster.x, monster.y, R * 1.6, projectile.color || "#ffd166");
          particleSystem.explosion(
            monster.x, monster.y, projectile.color || "#ff9f43",
            Math.round(Math.min(16, 8 + R / 12)),
          );
        }
      }

      monsters.forEach((m) => {
        if (
          m !== monster &&
          !m.isDead &&
          (tower.targetType === "all" || m.type === tower.targetType) &&
          getDistanceSq(monster, m) < tower.splashRadiusSq
        ) {
          let splashDamage = damage * 0.5;
          let splashReduction = 0;
          monsters.forEach((gen) => {
            if (
              !gen.isDead &&
              gen.monsterKey === "general" &&
              getDistanceSq(m, gen) < gen.defenseAuraSq
            ) {
              splashReduction = Math.max(splashReduction, gen.defenseAuraBoost);
            }
          });
          m.hp -= splashDamage * (1 - splashReduction);
          createDamageText(
            m,
            (splashDamage * (1 - splashReduction)).toFixed(0),
          );
          if (m.hp <= 0) handleMonsterDeath(m, timestamp);
        }
      });
    }
  }

  // ── v9 타격감 ────────────────────────────────────────────
  // 여기가 피해량이 확정되는 유일한 지점이다(레이저·독도 이 함수를 탄다).
  // ⚠️ 레이저는 매 프레임 이 함수를 부르므로 큰 타격 판정에서 제외한다 —
  //    안 그러면 히트스톱이 초당 수십 번 걸려 게임이 슬로모션이 된다.
  if (source.type !== "laser-damage" && source.type !== "poison") {
    const heavy = impactFx.isHeavyHit(damage, monster, !!(source.splashRadiusSq > 0));
    if (heavy) {
      requestHitstop();
      // 광역 타격만 화면을 흔든다(단발 타격까지 흔들면 화면이 쉴 새 없이 떤다)
      if (source.splashRadiusSq > 0) impactFx.requestShake(4, 160);
    }
    qaKnockbackPx += impactFx.applyKnockback(monster, damage, { maxPx: heavy ? 6 : 3 });
  }

  monster.hp -= damage;
  if (source.type === "laser-damage") {
    // v5.2: 레이저는 매 프레임 히트 → 텍스트를 0.5초 집계 표시 (프레임마다 "1" 도배가 검은 사다리처럼 보이던 문제 실측)
    monster._laserAcc = (monster._laserAcc || 0) + damage;
    if (!monster._laserTextAt || timestamp > monster._laserTextAt + 500) {
      createDamageText(monster, monster._laserAcc.toFixed(0), "laser");
      monster._laserAcc = 0;
      monster._laserTextAt = timestamp;
    }
  } else {
    sfx.play("hit");
    createDamageText(
      monster,
      damage.toFixed(0),
      source.type === "poison" ? "poison" : "normal",
    );
  }

  if (monster.hp <= 0) handleMonsterDeath(monster, timestamp);
  updateFullUI();
}

// --- 마법사 관리 ---
// v5.4: 마법사 몸 중심 = 캔버스 렌더와 동일한 스프라이트 상수 기준 (DOM 박스 비의존)
function wizardCenterPoint() {
  return {
    x: wizardPosition.x + wizardSprite.width / 2,
    y: wizardPosition.y + wizardSprite.height / 2,
  };
}

function wizardAutoAttack(timestamp) {
  if (timestamp < (WIZARD_AUTO_ATTACK_STATS.cooldownUntil || 0)) return;

  // v5.4: 마법사는 캔버스 스프라이트 → 공격 원점은 렌더와 동일한 스프라이트 상수 기준
  // (구버전은 DOM #wizard의 offsetWidth를 썼는데, CSS 파싱 버그로 offsetWidth=1366이 되어
  //  발사 원점이 683px 어긋나 마법이 화면을 가로지르는 선으로 보였음)
  const wizardCenter = wizardCenterPoint();

  // [MODIFIED] 마법사 자동 공격도 그리드 사용
  const nearbyMonsters = spatialGrid.getNearby(
    wizardCenter.x,
    wizardCenter.y,
    WIZARD_AUTO_ATTACK_STATS.range,
  );

  let bestTarget = null;
  let minDistanceSq = WIZARD_AUTO_ATTACK_STATS.rangeSq;

  for (const monster of nearbyMonsters) {
    if (monster.isDead || monster.isStealthed) continue;
    const distSq = getDistanceSq(wizardCenter, monster);
    if (distSq < minDistanceSq) {
      minDistanceSq = distSq;
      bestTarget = monster;
    }
  }

  if (bestTarget) {
    WIZARD_AUTO_ATTACK_STATS.cooldownUntil =
      timestamp + WIZARD_AUTO_ATTACK_STATS.cooldown;
    // v6: 마법사 오토어택 DPS를 총 타워 DPS의 25%로 캡 — 타워가 주력이 되도록
    const totalTowerDps = towers.reduce((s, t) => s + simCore.towerDps(t), 0);
    const cappedDamage = simCore.cappedWizardAutoDamage(
      WIZARD_AUTO_ATTACK_STATS.damage,
      WIZARD_AUTO_ATTACK_STATS.cooldown,
      totalTowerDps,
      WIZARD_AUTO_ATTACK_STATS.initialDamage,
    );
    createProjectile({ ...wizardCenter, damage: cappedDamage }, bestTarget);
    // v5.2: 발사 머즐 플래시 (지팡이 끝 반짝임)
    if (particleSystem && !quality.low) {
      particleSystem.sparkle(wizardCenter.x + 8, wizardCenter.y - 24, "#9fc6ff");
    }
    sfx.play("wizard-auto");
  }
}

async function handleWizardAttack(clickPos = null) {
  if (gamePaused) {
    showMessage("게임이 일시정지 상태입니다!");
    return;
  }

  await sfx.init();
  // ⚠️ 위 await 동안 아이가 일시정지를 눌렀을 수 있다. 재확인 없이 진행하면
  //    "정지했는데 마법이 나가는" 상태가 된다(오디오 초기화가 늦는 첫 시전에서 특히).
  if (gamePaused) return;

  // 스펠 쿨다운·상태이상도 게임 시계 기준(배속을 따라가야 한다)
  // 값은 게임 시계다. 예전 이름(nowPerf)은 performance.now()를 뜻해
  // 벽시계처럼 읽혔다 — 이 프로젝트가 한 번 비싸게 치른 실패 유형이라 이름을 맞춘다.
  const spellClock = gameClock;
  const spell = WIZARD_SPELLS[activeSpell];

  if (
    !spell ||
    (wizardCooldowns[activeSpell] && spellClock < wizardCooldowns[activeSpell])
  ) {
    showMessage("아직 스킬 쿨타임입니다!");
    return;
  }

  if (spell.level > wizardLevel) {
    showMessage(
      `마법사 레벨이 부족하여 ${spell.name} 스킬을 사용할 수 없습니다!`,
    );
    return;
  }

  wizardCooldowns[activeSpell] = spellClock + spell.cooldown;

  const levelBonus = Math.max(0, wizardLevel - spell.level);
  // v6 교차검증 수정: 변이 "마법 억제"는 handleHit에서 단일 적용 — 여기서 곱하면 이중 적용(0.4²) 버그
  const damageMultiplier = 1 + levelBonus * 0.2;

  // v5.4: 마법 발사 원점도 스프라이트 상수 기준 (offsetWidth 버그 회피 — wizardAutoAttack 참조)
  const wizardCenter = wizardCenterPoint();

  // v5.7: 마법은 무조건 마법사 주위에서 발동. 이동 마법(teleport)만 클릭 위치로 순간이동.
  let spellOrigin =
    activeSpell === "teleport" && clickPos ? clickPos : wizardCenter;
  const aoeSq = spell.aoe * spell.aoe;

  // [MODIFIED] 스킬 효과 적용 시 공간 그리드를 사용하여 효율적으로 대상 탐색
  const affectedMonsters = spatialGrid
    .getNearby(spellOrigin.x, spellOrigin.y, spell.aoe)
    .filter((m) => !m.isDead && getDistanceSq(spellOrigin, m) < aoeSq);

  // [V3] Trigger wizard casting animation + sound
  wizardSprite.setCasting(true);
  sfx.play("wizard_cast");
  setTimeout(() => wizardSprite.setCasting(false), 600);

  // v5.1: 시전 연출 강화 — 마법사 시전 버스트 + 목표 지점 스펠 색 폭발 + 대마법 화면 플래시
  if (particleSystem) {
    const SPELL_FX = {
      fireball: "#ff6b35", frostNova: "#7fdbff", chainLightning: "#ffe066",
      teleport: "#b388ff", blackHole: "#7c4dff", meteorShower: "#ff8a3d",
      timeStop: "#80d8ff", guardianLight: "#ffe9a8", tornado: "#9ff0c0",
      judgment: "#fff3b0",
    };
    const fxColor = SPELL_FX[activeSpell] || "#82AAFF";
    particleSystem.explosion(wizardCenter.x, wizardCenter.y - 30, fxColor, 14);
    if (spellOrigin !== wizardCenter) {
      particleSystem.explosion(spellOrigin.x, spellOrigin.y, fxColor, 24);
    }
    if (["meteorShower", "timeStop", "judgment", "blackHole"].includes(activeSpell)) {
      if (claimScreenFlash()) particleSystem.screenFlash(fxColor, 350, 0.18);
    }
  }

  switch (activeSpell) {
    case "fireball":
      const fireballDamage = Math.floor(spell.damage * damageMultiplier);
      sfx.play("explosion");
      createMagicEffect(
        spellOrigin.x,
        spellOrigin.y,
        spell.aoe,
        "magic-attack",
        500,
      );
      affectedMonsters.forEach((m) => {
        handleHit({ source: { damage: fireballDamage }, target: m }, spellClock);
      });
      break;

    case "frostNova":
      const frostNovaDamage = Math.floor(spell.damage * damageMultiplier);
      sfx.play("frost");
      createMagicEffect(
        spellOrigin.x,
        spellOrigin.y,
        spell.aoe,
        "frost-nova",
        500,
      );
      affectedMonsters.forEach((m) => {
        handleHit({ source: { damage: frostNovaDamage }, target: m }, spellClock);
        if (!m.isBoss)
          m.statusEffects.slowed = {
            factor: 0.1,
            endTime: spellClock + spell.freezeDuration,
          };
      });
      break;

    case "chainLightning":
      const lightningDamage = Math.floor(spell.damage * damageMultiplier);
      sfx.play("lightning");
      let currentTarget = null;
      let minInitDistSq = Infinity;
      // 첫 타겟은 그리드와 무관하게 클릭 위치에서 가장 가까운 적으로 설정
      monsters.forEach((m) => {
        if (!m.isDead && !m.isStealthed) {
          const distSq = getDistanceSq(spellOrigin, m);
          if (distSq < minInitDistSq) {
            minInitDistSq = distSq;
            currentTarget = m;
          }
        }
      });

      if (!currentTarget) break;
      let lastTargetPos = spellOrigin,
        chainedMonsters = new Set();
      for (let i = 0; i < spell.chains; i++) {
        if (!currentTarget || chainedMonsters.has(currentTarget.id)) break;
        createLightningEffect(lastTargetPos, currentTarget);
        handleHit(
          { source: { damage: lightningDamage }, target: currentTarget },
          spellClock,
        );
        chainedMonsters.add(currentTarget.id);
        lastTargetPos = { x: currentTarget.x, y: currentTarget.y };
        let nextTarget = null,
          minChainDistSq = WIZARD_SPELLS.chainLightning.chainRangeSq;

        // 연쇄 번개는 특성상 주변의 다른 적을 찾아야 하므로 그리드를 사용
        const chainableMonsters = spatialGrid.getNearby(
          lastTargetPos.x,
          lastTargetPos.y,
          Math.sqrt(minChainDistSq),
        );

        chainableMonsters.forEach((m) => {
          if (!m.isDead && !m.isStealthed && !chainedMonsters.has(m.id)) {
            const distSq = getDistanceSq(lastTargetPos, m);
            if (distSq < minChainDistSq) {
              minChainDistSq = distSq;
              nextTarget = m;
            }
          }
        });
        currentTarget = nextTarget;
      }
      break;

    case "teleport":
      const teleportDamage = Math.floor(spell.damage * damageMultiplier);
      createMagicEffect(
        wizardCenter.x,
        wizardCenter.y,
        spell.aoe,
        "teleport-effect",
        300,
      );
      // 텔레포트 전 위치의 몬스터들에게 데미지
      spatialGrid
        .getNearby(wizardCenter.x, wizardCenter.y, spell.aoe)
        .filter((m) => !m.isDead && getDistanceSq(wizardCenter, m) < aoeSq)
        .forEach((m) =>
          handleHit({ source: { damage: teleportDamage }, target: m }, spellClock),
        );

      wizardPosition.x = spellOrigin.x;
      wizardPosition.y = spellOrigin.y;
      wizardPosition.x = Math.max(
        0,
        Math.min(window.innerWidth - wizardSprite.width, wizardPosition.x),
      );
      wizardPosition.y = Math.max(
        0,
        Math.min(window.innerHeight - wizardSprite.height, wizardPosition.y),
      );
      gameElements.wizardEl.style.transform = `translate(${Math.round(wizardPosition.x)}px, ${Math.round(wizardPosition.y)}px)`;

      sfx.play("blip");
      const newWizardCenter = wizardCenterPoint();
      createMagicEffect(
        newWizardCenter.x,
        newWizardCenter.y,
        spell.aoe,
        "teleport-effect",
        300,
      );
      break;

    case "blackHole":
      const blackHoleDps = Math.floor(spell.dps * damageMultiplier);
      sfx.play("explosion");
      const bhPoolObj = createMagicEffect(
        spellOrigin.x,
        spellOrigin.y,
        spell.aoe,
        "black-hole",
        spell.duration,
      );
      effects.push({
        type: "blackHole",
        pos: spellOrigin,
        aoe: spell.aoe,
        dps: blackHoleDps,
        endTime: spellClock + spell.duration,
        lastTick: 0,
        poolObj: bhPoolObj,
      });
      break;

    // ---- v5 신규 마법 ----
    case "meteorShower": {
      // 랜덤 몬스터 5지점 낙하 광역
      const meteorDamage = Math.floor(spell.damage * damageMultiplier);
      const aliveMonsters = monsters.filter((m) => !m.isDead);
      sfx.play("explosion");
      for (let i = 0; i < spell.strikes; i++) {
        const target = aliveMonsters.length
          ? aliveMonsters[Math.floor(Math.random() * aliveMonsters.length)]
          : null;
        const strikePos = target
          ? { x: target.x, y: target.y }
          : {
              x: Math.random() * window.innerWidth,
              y: 100 + Math.random() * (window.innerHeight - 200),
            };
        // v9-rev3: 벽시계 setTimeout + 폴링 재시도였던 것을 **게임 시계 지연 큐**로 옮겼다.
        //    폴링은 일시정지만 막았을 뿐 시간축은 여전히 갈라져 있었다 — 시전 순간의
        //    gameSpeed를 한 번 읽어 나눴기 때문에, 시전 직후 배속을 바꾸면 남은 메테오가
        //    옛 배속으로 떨어졌다(1배속에서 쏘고 2배속으로 바꾸면 880ms 걸릴 것이 그대로 880ms).
        //    게임 시계 큐는 일시정지·배속·히트스톱을 전부 자동으로 따라간다.
        const dropMeteor = () => {
          if (!gameRunning) return; // 판이 끝났으면 조용히 버린다
          // v9: 착탄을 직접 센다. 예전에는 QA가 `.magic-attack` DOM 노드 생성을 세서
          //     낙하를 판정했는데, 저사양 강등 시 createMagicEffect가 DOM을 **정상적으로**
          //     건너뛴다(캔버스만 그린다) → 메테오는 멀쩡히 떨어지는데 게이트는
          //     "안 떨어졌다"고 보고했다. 연출이 아니라 사건 자체를 세야 한다.
          meteorDropCount++;
          createMagicEffect(strikePos.x, strikePos.y, spell.aoe, "magic-attack", 450);
          const hitSq = spell.aoe * spell.aoe;
          spatialGrid
            .getNearby(strikePos.x, strikePos.y, spell.aoe)
            .filter((m) => !m.isDead && getDistanceSq(strikePos, m) < hitSq)
            .forEach((m) =>
              handleHit({ source: { damage: meteorDamage }, target: m }, gameClock),
            );
          if (particleSystem) particleSystem.explosion(strikePos.x, strikePos.y, "#ff8c42", 12);
        };
        // 게임 시간 기준 간격이다 — gameSpeed로 나누지 않는다(게임 시계가 이미 빠르다).
        scheduleGameDelay(i * 220, dropMeteor, "meteor");
      }
      break;
    }

    case "timeStop": {
      // 전체 몬스터 정지
      sfx.play("frost");
      monsters.forEach((m) => {
        if (!m.isDead) {
          m.statusEffects.stunned = { endTime: spellClock + spell.freezeDuration };
          createMagicEffect(m.x, m.y, 25, "time-warp-effect", 400);
        }
      });
      if (particleSystem && claimScreenFlash()) particleSystem.screenFlash("#66ccff", 350, 0.18);
      showMessage("⏱️ 시간 정지! 모든 몬스터가 3초간 멈춥니다.");
      break;
    }

    case "guardianLight": {
      // 성 체력 회복 + 전체 감속
      sfx.play("repair");
      castleHealth = Math.min(100, castleHealth + spell.heal);
      if (castleCoords.x != null) {
        createMagicEffect(castleCoords.x + 50, castleCoords.y + 50, 90, "heal-effect", 800);
      }
      monsters.forEach((m) => {
        if (!m.isDead && !m.isBoss) {
          m.statusEffects.slowed = {
            factor: spell.slowFactor,
            endTime: spellClock + spell.slowDuration,
          };
        }
      });
      if (particleSystem && claimScreenFlash()) particleSystem.screenFlash("#ffe066", 400, 0.15);
      showMessage(`💛 수호의 빛! 성 체력 +${spell.heal}`);
      updateFullUI();
      break;
    }

    case "tornado": {
      // 범위 내 몬스터를 경로 역방향으로 밀어내기
      const tornadoDamage = Math.floor(spell.damage * damageMultiplier);
      sfx.play("wizard_cast");
      createMagicEffect(spellOrigin.x, spellOrigin.y, spell.aoe, "teleport-effect", 600);
      const pushPoints = Math.floor(spell.pushbackPx / 5); // pathPoints는 5px 간격
      affectedMonsters.forEach((m) => {
        handleHit({ source: { damage: tornadoDamage }, target: m }, spellClock);
        if (!m.isDead && !m.isBoss) {
          m.pathIndex = Math.max(0, m.pathIndex - pushPoints);
        }
      });
      break;
    }

    case "judgment": {
      // 화면 전체 대미지 (보스는 절반 수준)
      sfx.play("explosion");
      if (particleSystem) {
        if (claimScreenFlash()) particleSystem.screenFlash("#ffffff", 500, 0.35);
      }
      const judgeNormal = Math.floor(spell.damage * damageMultiplier);
      const judgeBoss = Math.floor(spell.bossDamage * damageMultiplier);
      monsters.forEach((m) => {
        if (!m.isDead) {
          createMagicEffect(m.x, m.y, 30, "explosion-effect", 400);
          handleHit(
            { source: { damage: m.isBoss ? judgeBoss : judgeNormal }, target: m },
            spellClock,
          );
        }
      });
      showMessage("🌟 대마법: 심판!");
      break;
    }
  }
}

// CSS 클래스명 → Canvas 스펠 타입 매핑
const SPELL_CLASS_MAP = {
  "fireball-effect": "fireball",
  "magic-attack": "fireball",
  "frost-nova": "frostNova",
  "chain-lightning": "chainLightning",
  "teleport-effect": "teleport",
  "black-hole": "blackHole",
  "explosion-effect": "explosion",
  "heal-effect": "heal",
  "damage-reflect-effect": "damage-reflect",
  "ultimate-splash-effect": "explosion",
  "splash-damage-effect": "explosion",
  "plague-pool": "fireball",
  "soul-drain-effect": "heal",
  "time-warp-effect": "frostNova",
};

function addCanvasSpellEffect(x, y, radius, type, duration) {
  activeCanvasEffects.push({
    x,
    y,
    radius,
    type,
    duration,
    startTime: gameClock, // 게임 이벤트 연출이라 배속을 따라간다
  });
}

function createMagicEffect(x, y, size, className, duration) {
  // Canvas 기반 스펠 이펙트 추가
  const canvasType = SPELL_CLASS_MAP[className];
  if (canvasType) {
    addCanvasSpellEffect(x, y, size, canvasType, duration);
    // v5: 저사양 모드에서는 캔버스 이펙트만 사용 (DOM 이펙트 스킵 — 웨일북 최적화)
    if (!quality.domEffects) return null;
  }

  const effectObj = getFromPool(pools.effects, className);
  if (!effectObj) return null;

  const el = effectObj.el;
  el.className = className;
  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(y)}px`;
  el.style.width = `${size * 2}px`;
  el.style.height = `${size * 2}px`;
  el.style.transform = "translate(-50%, -50%)";

  effectObj.timeoutId = setTimeout(() => {
    returnToPool(effectObj);
  }, duration);

  return effectObj;
}

function createLightningEffect(from, to) {
  // Canvas 기반 체인 라이트닝 이펙트
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const radius = Math.hypot(to.x - from.x, to.y - from.y) / 2;
  addCanvasSpellEffect(midX, midY, radius, "chainLightning", 200);

  const effectObj = getFromPool(pools.effects, "chain-lightning");
  if (!effectObj) return;

  const el = effectObj.el;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  el.className = "chain-lightning";
  el.style.left = `${Math.round(from.x)}px`;
  el.style.top = `${Math.round(from.y)}px`;
  el.style.width = `${Math.round(length)}px`;
  el.style.transform = `rotate(${angle}deg)`;

  effectObj.timeoutId = setTimeout(() => {
    returnToPool(effectObj);
  }, 200);
}

function populateSpellbook() {
  const spellSelector = document.getElementById("spellSelector");
  spellSelector.innerHTML = "";
  const container = document.createElement("div");
  container.className = "spell-options-container";

  const availableSpellKeys = Object.keys(WIZARD_SPELLS).filter(
    (key) => WIZARD_SPELLS[key].level <= wizardLevel,
  );

  if (!availableSpellKeys.includes(activeSpell)) {
    activeSpell = "fireball";
  }

  for (const key in WIZARD_SPELLS) {
    const spell = WIZARD_SPELLS[key];
    if (wizardLevel < spell.level) continue;
    const option = document.createElement("div");
    option.className = `spell-option ${key === activeSpell ? "active" : ""}`;
    option.innerHTML = `<div class="spell-option-symbol">${spell.symbol}</div><div class="spell-option-cost">${spell.name}</div>`;
    option.onclick = () => {
      activeSpell = key;
      sfx.play("blip");
      populateSpellbook();
      spellSelector.classList.remove("show");
    };
    container.appendChild(option);
  }
  spellSelector.appendChild(container);
}

// --- 수학 문제 로직 ---
function generateRandomArithmetic() {
  const ops = ["+", "-", "*"];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a, b, answer;
  switch (op) {
    case "+":
      a = Math.floor(Math.random() * 50) + 1;
      b = Math.floor(Math.random() * 50) + 1;
      answer = a + b;
      break;
    case "-":
      a = Math.floor(Math.random() * 50) + 10;
      b = Math.floor(Math.random() * a) + 1;
      answer = a - b;
      break;
    case "*":
      a = Math.floor(Math.random() * 12) + 1;
      b = Math.floor(Math.random() * 12) + 1;
      answer = a * b;
      break;
  }
  return { q: `${a} ${op} ${b} = ?`, a: answer };
}

function showMathProblem() {
  gamePaused = true;
  problemAnswered = false;

  // v5: 간격 반복 — 재출제 시점이 된 오답 문제 우선 (v6: 오답노트 복습 퀴즈 포함)
  let problem = null;
  isReviewProblem = false;
  isNoteReviewProblem = false;
  const review = learnLoop.popDueReview(currentWave);
  if (review) {
    problem = review.problem;
    isReviewProblem = true;
    isNoteReviewProblem = review.fromNote;
  }

  // v8: 적응형 출제 — 약점 유형 우선 + 웨이브별 난이도 램프 + 단원 편중 방지.
  //     구버전은 학기 전체 풀을 셔플해 pop 하는 게 전부였다(약점 무시·난이도 무작위).
  while (!problem && currentProblemSet.length > 0) {
    const picked = problemSelector.pickProblem(currentProblemSet, {
      wave: currentWave,
      classify: learnLoop.classifyProblem,
      weakByType: currentWeakWeights,
      recentUnits,
    });
    if (!picked) break;
    // 뽑힌 자리를 O(1)로 제거 (splice는 2,600칸 배열에서 매번 이동 비용이 든다)
    const last = currentProblemSet.pop();
    if (picked.index < currentProblemSet.length) currentProblemSet[picked.index] = last;

    const candidate = picked.problem;
    const problemId = candidate.q + "||" + candidate.a;
    if (!shownProblemIds.has(problemId)) {
      shownProblemIds.add(problemId);
      problem = candidate;
      break;
    }
  }

  // If all problems exhausted, try reloading unshown ones
  if (!problem) {
    const allProblems = mathProblems[selectedDifficulty] || [];
    const unshown = allProblems.filter(
      (p) => !shownProblemIds.has(p.q + "||" + p.a),
    );
    if (unshown.length > 0) {
      currentProblemSet = [...unshown];
      const picked = problemSelector.pickProblem(currentProblemSet, {
        wave: currentWave,
        classify: learnLoop.classifyProblem,
        weakByType: currentWeakWeights,
        recentUnits,
      });
      problem = picked ? picked.problem : currentProblemSet.pop();
      if (problem) shownProblemIds.add(problem.q + "||" + problem.a);
    }
  }

  // 단원 편중 방지용 최근 이력 (최근 6개만 본다)
  if (problem && problem.u) {
    recentUnits.push(problem.u);
    if (recentUnits.length > 6) recentUnits.shift();
  }

  // All problems truly exhausted - generate random arithmetic
  if (!problem) {
    showMessage("모든 문제를 풀었습니다! 랜덤 산수 문제를 생성합니다.");
    problem = generateRandomArithmetic();
  }

  if (!problem) {
    console.error("Failed to load problem. Forcing next wave.");
    forceNextWave(true);
    return;
  }

  correctAnswer = problem.a;
  // v5.6: 생성기의 실수 기반 오답(problem.d) 우선 — 그럴싸한 오답. 부족분만 런타임 폴백.
  let wrongOptions = Array.isArray(problem.d) ? [...problem.d] : [];
  shuffleArray(wrongOptions);
  wrongOptions = wrongOptions
    .filter((w) => String(w) !== String(correctAnswer))
    .slice(0, 3);
  if (wrongOptions.length < 3) {
    const extra = generateWrongAnswers(correctAnswer).filter(
      (w) => String(w) !== String(correctAnswer) && !wrongOptions.includes(String(w)),
    );
    wrongOptions = [...wrongOptions, ...extra].slice(0, 3);
  }
  const options = [correctAnswer, ...wrongOptions];
  shuffleArray(options);

  // [V2] 콤보 배지 표시
  const comboBadge = document.getElementById("mathCombo");
  if (comboBadge) {
    const combo = comboSystem.getCombo();
    if (combo >= 2) {
      comboBadge.textContent = `🔥 ${combo} COMBO (x${comboSystem.getMultiplier()})`;
      comboBadge.style.display = "block";
    } else {
      comboBadge.style.display = "none";
    }
  }

  // v5: 복습 문제 뱃지 (v6: 오답노트 복습은 보너스 골드 표시)
  // v9: "맞췄는데 왜 또 나와?"에 화면이 답하게 만든다.
  //   진행도의 진실원은 **오답노트 상자**(1·3·7·16일, 4칸)다. 세션 큐의 stage(상한 3)를
  //   쓰면 세션에서 3번 맞힌 순간 "완전히 내 거"라고 축하해 놓고 16일 뒤 그 문제가
  //   복습으로 다시 나온다 — 아이 입장에서는 앱이 거짓말을 한 것이 된다.
  const reviewBadge = document.getElementById("mathCombo");
  if (isReviewProblem && reviewBadge) {
    const prog = learnLoop.noteProgress(problem, selectedDifficulty);
    if (prog) {
      // 게이지 = 채운 칸 ● + 남은 칸 ○. 숫자(1/4)보다 저학년이 읽기 쉽다.
      const gauge = "●".repeat(prog.box) + "○".repeat(Math.max(0, prog.max - prog.box));
      const last = prog.box === prog.max - 1;
      reviewBadge.textContent = last
        ? `🌟 마스터 도전 ${gauge} — 이번에 맞히면 완전히 내 거!`
        : `🌟 마스터 도전 ${gauge} — 다시 만난 문제예요`;
    } else {
      reviewBadge.textContent = "🔁 다시 만난 문제! 이번엔 맞혀보자";
    }
    reviewBadge.style.display = "block";
  }

  currentProblem = problem;
  ui.showMathProblemUI(problem, options, checkAnswer);

  // v6: 유형별 제한시간 시작
  currentProblemTimeLimit = problemTimeLimit(problem);
  startProblemTimer();
}

function generateWrongAnswers(correct) {
  const wrongAnswers = new Set();
  const type = getAnswerType(correct);
  let attempts = 0;

  while (wrongAnswers.size < 3 && attempts < 50) {
    attempts++;
    let wrong;
    if (type === "numeric") {
      const numCorrect = Number(correct);
      const offset = Math.floor(Math.random() * 20) + 1;
      wrong =
        Math.random() > 0.5
          ? numCorrect + offset
          : Math.max(0, numCorrect - offset);
    } else if (type === "text" && answerPools.text.length > 0) {
      wrong =
        answerPools.text[Math.floor(Math.random() * answerPools.text.length)];
    } else if (type === "mixed" && answerPools.mixed.length > 0) {
      wrong =
        answerPools.mixed[Math.floor(Math.random() * answerPools.mixed.length)];
    } else if (type === "symbol" && answerPools.symbol.length > 0) {
      wrong =
        answerPools.symbol[
          Math.floor(Math.random() * answerPools.symbol.length)
        ];
    } else {
      wrong = Math.floor(Math.random() * 100);
    }

    if (String(wrong) !== String(correct)) {
      wrongAnswers.add(String(wrong));
    }
  }

  while (wrongAnswers.size < 3) {
    const randomNum = Math.floor(Math.random() * 100) + 1;
    if (String(randomNum) !== String(correct)) {
      wrongAnswers.add(String(randomNum));
    }
  }

  return Array.from(wrongAnswers);
}

function checkAnswer(answer, clickedBtn) {
  if (problemAnswered) return;
  problemAnswered = true;
  clearProblemTimer();

  const optionsContainer = document.getElementById("mathOptions");
  const resultDiv = document.getElementById("mathResult");
  const isCorrect = String(answer) === String(correctAnswer);

  optionsContainer.querySelectorAll(".math-option").forEach((btn) => {
    btn.disabled = true;
    if (String(btn.dataset.value) === String(correctAnswer)) {
      btn.classList.add("correct");
    } else {
      btn.classList.add("faded");
    }
  });

  if (isCorrect) {
    if (isForcedProgress) {
      resultDiv.textContent = `정답! 하지만 강제 진행으로 보상은 없습니다.`;
      resultDiv.style.color = "#2ecc71";
      sfx.play("math_correct");
    } else {
      // [V2] 콤보 시스템 적용
      const comboResult = comboSystem.addCorrect();
      let totalGold = simCore.answerReward(
        currentWave, comboResult.multiplier, comboResult.bonusGold,
      );
      // v6: 오답노트 복습 퀴즈 정답 — 보너스 골드 (노트 승급은 recordCorrect가 처리)
      if (isNoteReviewProblem && currentProblem) {
        totalGold += 100;
        showMessage("📒 오답노트 복습 성공! 보너스 +100골드");
      }
      // v5: 학습=화력 — 정답 시 마법 쿨다운 30% 감소
      // v7: 문제를 넘겨야 라이트너 상자 승급(세션 3→7→15 확장, 날짜 1→3→7→16일)이 된다
      const mastery = learnLoop.recordCorrect(currentProblem, currentWave, isReviewProblem);
      // v9: 아이가 "왜 맞췄는데 또 나와?"라고 묻지 않게, 진행 상황을 그때그때 말해 준다.
      //     ⚠️ 두 졸업을 구분한다 — 세션 졸업은 "오늘은 그만", 노트 졸업이 "완전히 내 것".
      if (mastery && isReviewProblem) {
        if (mastery.graduated) {
          masteredThisRun++;
          totalGold += 60;
          showUpgradeNotification("🎓 이제 완전히 내 거! (+60골드)", "legendary");
          sfx.play("powerup");
          checkAchievements("review_correct", { reviewCleared: learnLoop.stats.reviewCleared });
        } else if (mastery.sessionCleared) {
          showMessage("👍 오늘은 이 문제 통과! 다음에 또 만나요");
        }
      }
      currentWeakWeights = problemSelector.weaknessWeights(
        learnLoop.getCumulative(selectedDifficulty),
      );
      // v8: 집중력 상승 → 모든 타워 피해 증가
      {
        const beforeTier = simCore.focusTier(focusPoints);
        focusPoints = simCore.focusAfter(focusPoints, true);
        const tier = simCore.focusTier(focusPoints);
        if (tier > beforeTier)
          showUpgradeNotification(
            `🎯 집중력 ${tier}단계! 모든 타워 공격력 +${Math.round((simCore.focusDamageMultiplier(focusPoints) - 1) * 100)}%`,
          );
      }
      if (isReviewProblem)
        checkAchievements("review_correct", {
          reviewCleared: learnLoop.stats.reviewCleared,
        });
      const nowCd = gameClock; // 쿨다운이 게임 시계 기준이라 감소도 같은 축에서 계산
      for (const key in wizardCooldowns) {
        if (wizardCooldowns[key] > nowCd) {
          wizardCooldowns[key] = nowCd + (wizardCooldowns[key] - nowCd) * 0.7;
        }
      }
      resultDiv.textContent = `정답! 💰 +${totalGold} 골드${comboResult.combo >= 3 ? ` (${comboResult.combo}x 콤보!)` : ""}`;
      resultDiv.style.color = "#00ff88";
      gold += totalGold;
      score += 100 * comboResult.multiplier;
      sfx.play("math_correct");
      if (comboResult.combo >= 3) sfx.play("combo_hit");
      updateComboDisplay();

      // [V2] 파티클 축하 효과
      if (particleSystem) {
        particleSystem.celebration(
          window.innerWidth / 2,
          window.innerHeight / 2,
        );
        if (claimScreenFlash()) particleSystem.screenFlash("#00ff88", 300, 0.15);
      }

      // [V2] 업적 체크
      checkAchievements("math_correct", { streak: comboSystem.getCombo() });
      checkAchievements("combo_update", { multiplier: comboResult.multiplier });
      checkAchievements("gold_change", { gold });

      const specialTowerChance = Math.random();
      if (specialTowerChance < 0.03) {
        transformRandomTower("golden");
      } else if (specialTowerChance < 0.06) {
        transformRandomTower("silver");
      } else if (specialTowerChance < 0.09) {
        transformRandomTower("copper");
      }
    }
  } else {
    clickedBtn.classList.add("incorrect");
    clickedBtn.classList.remove("faded");
    // v5: 정답 + 한 줄 풀이 힌트 (학습 루프) + 재출제 큐 등록
    const hint = learnLoop.getSolutionHint(
      currentProblem ? currentProblem.q : "",
      correctAnswer,
    );
    resultDiv.textContent = `오답! 💡 ${hint}`;
    resultDiv.style.color = "#ff3366";
    // v9: 3/4까지 채운 문제를 틀리면 상자가 1번으로 되돌아간다(라이트너의 핵심).
    //     그 순간이 아이에게 가장 아픈 지점이라, 되돌아간다는 사실을 숨기지 않되
    //     회복 문구를 함께 낸다. 진행 상황은 되돌리기 전에 읽어야 한다.
    const beforeProg = currentProblem
      ? learnLoop.noteProgress(currentProblem, selectedDifficulty)
      : null;
    if (currentProblem)
      learnLoop.recordWrong(currentProblem, currentWave, isNoteReviewProblem);
    if (isReviewProblem && beforeProg && beforeProg.box >= 2) {
      showMessage("아쉬워요! 기본기부터 한 번 더 다져봐요 🔁");
    }
    // v8: 방금 틀린 유형이 다음 문제부터 더 자주 나오게 가중치를 즉시 갱신한다
    currentWeakWeights = problemSelector.weaknessWeights(
      learnLoop.getCumulative(selectedDifficulty),
    );
    focusPoints = simCore.focusAfter(focusPoints, false); // v8: 집중력 하락(0 아래로는 안 간다)
    gold = Math.max(0, gold - simCore.WRONG_PENALTY.gold);
    castleHealth = Math.max(0, castleHealth - simCore.WRONG_PENALTY.castleHp);
    score = Math.max(0, score - simCore.WRONG_PENALTY.score);
    if (simCore.WRONG_PENALTY.deleteTower) deleteWeakestTower();
    sfx.play("math_wrong");
    showMessage(
      `오답 페널티: 골드 -${simCore.WRONG_PENALTY.gold}, 성 체력 -${simCore.WRONG_PENALTY.castleHp}!`,
    );

    // [V2] 콤보 브레이크 + 화면 플래시
    comboSystem.break();
    updateComboDisplay();
    if (particleSystem && claimScreenFlash()) particleSystem.screenFlash("#ff3366", 400, 0.2);

    checkGameOver();
  }

  isForcedProgress = false;

  currentWave++;
  updateFullUI();
  setTimeout(
    () => {
      hideModal(gameElements.mathModal);
      resultDiv.textContent = "";
      gamePaused = false;
      startWave();
    },
    isCorrect ? 2500 : 4200, // v5: 오답은 풀이 읽을 시간 확보
  );
}

function startProblemTimer() {
  clearProblemTimer();
  problemTimerStart = Date.now();
  const timerFill = document.getElementById("mathTimerFill");
  if (timerFill) {
    timerFill.style.transition = "none";
    timerFill.style.width = "100%";
    timerFill.classList.remove("warning");
    // Force reflow
    void timerFill.offsetWidth;
    timerFill.style.transition = `width ${currentProblemTimeLimit}ms linear`;
    timerFill.style.width = "0%";
  }

  // Warning at 10 seconds remaining
  setTimeout(() => {
    if (timerFill && !problemAnswered) {
      timerFill.classList.add("warning");
    }
  }, currentProblemTimeLimit - 10000);

  problemTimerId = setTimeout(() => {
    if (!problemAnswered) {
      handleTimeOut();
    }
  }, currentProblemTimeLimit);
}

function clearProblemTimer() {
  if (problemTimerId) {
    clearTimeout(problemTimerId);
    problemTimerId = null;
  }
}

function handleTimeOut() {
  if (problemAnswered) return;
  problemAnswered = true;

  const resultDiv = document.getElementById("mathResult");
  const optionsContainer = document.getElementById("mathOptions");

  // Show correct answer
  optionsContainer.querySelectorAll(".math-option").forEach((btn) => {
    btn.disabled = true;
    if (String(btn.dataset.value) === String(correctAnswer)) {
      btn.classList.add("correct");
    } else {
      btn.classList.add("faded");
    }
  });

  // v7: 시간 초과도 오답으로 기록한다. 구버전은 recordWrong을 호출하지 않아
  //     시간 초과 문제가 재출제 큐·오답노트·통계 어디에도 남지 않았다(감사 실측).
  //     docs/curriculum-map.md는 "시간 초과 = 오답 처리 + 풀이 힌트"라고 명시하고 있었다.
  const toHint = learnLoop.getSolutionHint(
    currentProblem ? currentProblem.q : "",
    correctAnswer,
  );
  resultDiv.textContent = `⏰ 시간 초과! 💡 ${toHint}`;
  resultDiv.style.color = "#ff8c00";
  if (currentProblem)
    learnLoop.recordWrong(currentProblem, currentWave, isNoteReviewProblem);
  focusPoints = simCore.focusAfter(focusPoints, false); // v8

  // Penalty: same as wrong answer but slightly less harsh
  gold = Math.max(0, gold - 20);
  castleHealth = Math.max(0, castleHealth - 3);
  score = Math.max(0, score - 30);
  sfx.play("math_wrong");
  showMessage("시간 초과 페널티: 골드 -20, 성 체력 -3, 점수 -30!");

  comboSystem.break();
  updateComboDisplay();
  if (particleSystem && claimScreenFlash()) particleSystem.screenFlash("#ff8c00", 400, 0.2);

  checkGameOver();

  isForcedProgress = false;
  currentWave++;
  updateFullUI();
  setTimeout(() => {
    hideModal(gameElements.mathModal);
    resultDiv.textContent = "";
    gamePaused = false;
    startWave();
  }, 4200);   // v7: 풀이 힌트를 읽을 시간 (오답 경로와 동일)
}

// --- 게임 상태 관리 ---
function checkWaveCompletion() {
  if (
    waveInProgress &&
    monstersSpawned >= monstersInWave &&
    monsters.length === 0
  ) {
    waveInProgress = false;
    gameElements.startWaveBtn.disabled = false;
    setStartWaveLabel("🚀 시작");

    // v8: 오늘의 도전 진행 — 깨는 순간 바로 알려 준다
    {
      const newly = dailyQuest.updateProgress(questState());
      for (const q of newly)
        showUpgradeNotification(`🗓️ 오늘의 도전 달성! ${q.icon} ${q.label(q.target)}`);
    }

    // [V2] 웨이브 클리어 업적 체크
    const clearTime = (gameClock - waveStartTime) / 1000;
    checkAchievements("wave_clear", {
      wave: currentWave,
      clearTime,
      damageTaken: waveDamageTaken,
    });

    sfx.play("wave_clear");

    // 보스 웨이브 클리어 후 음악 복귀
    if (musicSystem.currentTrack === "boss") {
      musicSystem.play("gameplay");
    }

    // v5: 무피해 클리어 보너스 — 성 체력 회복 (회복 루프)
    // v9: 연속 카운트를 붙인다. 보상 수치는 그대로다(밸런스 불변) — 바뀌는 건
    //     "잘하고 있다"는 신호가 눈에 보인다는 것뿐이다.
    if (waveDamageTaken === 0 && castleHealth > 0) {
      const heal = simCore.WAVE_CLEAR_HEAL + blessing.healBonus(blessings);
      castleHealth = Math.min(100, castleHealth + heal);
      noDamageStreak++;
      bestNoDamageStreak = Math.max(bestNoDamageStreak, noDamageStreak);
      if (noDamageStreak >= 2) {
        showUpgradeNotification(`🛡️ 무피해 ${noDamageStreak}연속! 성 체력 +${heal}`, "epic");
      } else {
        showMessage(`🛡️ 무피해 방어! 성 체력 +${heal}`);
      }
    } else if (waveDamageTaken > 0) {
      noDamageStreak = 0;
    }

    // [V2] Auto-save after each wave completion
    saveGame(true);

    // v5.1: 스테이지(5웨이브) 클리어 — 다음 스테이지 시작 스냅샷을 체크포인트로 보관.
    // 타워·골드·마법사 상태가 전부 스냅샷에 들어가므로 다음 스테이지에서도 그대로 유지되고,
    // 게임오버가 나도 이 체크포인트부터 다시 시작할 수 있다.
    if (currentWave % stageProgress.WAVES_PER_STAGE === 0) {
      const clearedStage = stageProgress.stageOfWave(currentWave);
      // 체크포인트는 **두 번 찍는다**.
      //  ① 지금 즉시 — 축복 화면에서 탭을 닫아도 스테이지 진행은 반드시 남아야 한다.
      //  ② 축복을 고른 뒤 다시 — 먼저 찍은 스냅샷에는 방금 받은 선물이 없어서,
      //     그대로 두면 이 스테이지를 재도전할 때 선물이 조용히 사라진다.
      // ⚠️ ②만 하면 "안 고르면 체크포인트가 아예 없는" 더 나쁜 상태가 된다(실측: qa-stages 실패).
      const saveCheckpoint = () => {
        const snap = buildGameState();
        snap.currentWave = currentWave + 1;
        stageProgress.recordCheckpoint(selectedDifficulty, clearedStage + 1, snap);
      };
      saveCheckpoint();
      showMessage(
        `🏁 스테이지 ${clearedStage} 클리어! 진행 상황 저장 완료 — 언제든 이어서 할 수 있어요.`,
      );
      sfx.play("powerup");
      if (particleSystem && claimScreenFlash()) particleSystem.screenFlash("#ffd166", 500, 0.15);
      // v9: 스테이지 선물 3택 1 → 고른 뒤에 수학 문제로 넘어간다.
      //     시간 제한 없음(고르기를 재촉하지 않는다).
      openBlessingChooser(() => {
        saveCheckpoint();
        showMathProblem();
      });
      return;
    }

    showMathProblem();
  }
}

function checkGameOver() {
  if (castleHealth <= 0 && gameRunning) {
    gameRunning = false;
    stopSpawnLoop();
    // 여기서 예외가 나면 게임 루프는 이미 멈춘 뒤라 점수 표시·게임오버 모달까지
    // 도달하지 못하고 화면이 그대로 굳는다(사파리 프라이빗 모드 등).
    // 세이브 정리 실패는 게임오버 화면을 막을 만한 일이 아니다.
    try {
      localStorage.removeItem("towerDefenseSave");
      localStorage.removeItem("mathcastle:save");
    } catch (e) {
      console.warn("세이브 정리 실패:", e);
    }
    document.getElementById("finalScore").textContent = score;
    document.getElementById("finalWave").textContent = currentWave;

    // v9: 이번 판이 무엇을 남겼는지 **게임오버 화면에서만** 보여준다.
    //   ⚠️ 플레이 중 "최고 기록까지 N웨이브" 카운트다운은 일부러 넣지 않았다.
    //      그건 아이가 그만두려는 순간을 노리는 압박 장치지 학습 피드백이 아니다
    //      (교차검증 2계열이 같은 지적을 했고, 계획서 스스로 목적을 그렇게 적고 있었다).
    {
      // ⚠️ achievementSystem.bestOf("wave")를 여기서 읽으면 **항상 이번 판 값**이다 —
      //    checkWaveCompletion이 매 웨이브 checkAchievements("wave_clear", {wave})를 부르고
      //    그 안에서 recordBest("wave")가 이미 갱신하기 때문이다(achievements.js:285).
      //    그래서 "이전 최고"는 판이 시작될 때 찍어 둔 값을 쓴다.
      const prevBest = bestWaveAtRunStart;
      const isNewRecord = currentWave > prevBest;
      const modal = gameElements.gameOverModal;
      let runLine = modal.querySelector(".run-summary");
      if (!runLine) {
        runLine = document.createElement("div");
        runLine.className = "run-summary";
        runLine.style.cssText = "margin-top:6px;font-size:14px;color:#a8e6a1;";
        const anchor = modal.querySelector("#finalWave")?.parentElement;
        (anchor || modal.firstElementChild || modal).appendChild(runLine);
      }
      const parts = [];
      if (isNewRecord) parts.push(`🏅 새 기록! 웨이브 ${currentWave} (이전 최고 ${prevBest})`);
      else if (prevBest > 0) parts.push(`이번 웨이브 ${currentWave} · 내 최고 ${prevBest}`);
      if (masteredThisRun > 0) parts.push(`🎓 완전히 내 것이 된 문제 ${masteredThisRun}개`);
      if (bestNoDamageStreak > 0) parts.push(`🛡️ 무피해 방어 최고 ${bestNoDamageStreak}연속`);
      runLine.textContent = parts.join(" · ");
      runLine.style.display = parts.length ? "block" : "none";
    }
    // v5: 학습 리포트 한 줄 (v6: 취약 유형 + 오답노트 확장)
    {
      const modal = gameElements.gameOverModal;
      let learnLine = modal.querySelector(".learn-report");
      if (!learnLine) {
        learnLine = document.createElement("div");
        learnLine.className = "learn-report";
        learnLine.style.cssText = "margin-top:8px;font-size:15px;color:#ffd166;";
        const anchor = modal.querySelector("#finalWave")?.parentElement;
        (anchor || modal.firstElementChild || modal).appendChild(learnLine);
      }
      learnLine.textContent = `📚 ${learnLoop.accuracyText()}`;

      // v6: 유형별 취약점 한 줄
      let weakLine = modal.querySelector(".weakness-line");
      if (!weakLine) {
        weakLine = document.createElement("div");
        weakLine.className = "weakness-line";
        weakLine.style.cssText = "margin-top:4px;font-size:13px;color:#9fc6ff;";
        learnLine.after(weakLine);
      }
      const weakness = learnLoop.weaknessText(selectedDifficulty);
      weakLine.textContent = weakness;
      weakLine.style.display = weakness ? "block" : "none";

      // v6: 오답노트 — 이번 판 틀린 문제 + 풀이 힌트 복습 (localStorage 저장 → 다음 판 복습 퀴즈)
      let noteBox = modal.querySelector(".wrongnote-box");
      if (!noteBox) {
        noteBox = document.createElement("div");
        noteBox.className = "wrongnote-box";
        noteBox.style.cssText =
          "margin-top:10px;max-height:150px;overflow-y:auto;text-align:left;font-size:13px;background:rgba(0,0,0,0.3);border:1px solid rgba(255,209,102,0.25);border-radius:10px;padding:10px;";
        weakLine.after(noteBox);
      }
      const wrongs = learnLoop.getSessionWrongs();
      if (wrongs.length) {
        noteBox.style.display = "block";
        noteBox.innerHTML =
          `<div class="wn-title">📒 오답노트 (${wrongs.length}문제) — 다음 판 시작 때 복습 퀴즈로 나와요</div>` +
          wrongs
            .slice(0, 8)
            .map(
              (w) =>
                `<div class="wn-item"><b>${ui.formatMath(w.q)}</b><br><span class="wn-hint">💡 ${learnLoop.getSolutionHint(w.q, w.a)}</span></div>`,
            )
            .join("") +
          (wrongs.length > 8 ? `<div class="wn-more">…외 ${wrongs.length - 8}문제</div>` : "");
      } else {
        noteBox.style.display = "block";
        noteBox.innerHTML = `<div class="wn-perfect">🎉 이번 판은 틀린 문제가 없어요! 완벽!</div>`;
      }
    }
    // v8: 판이 끝나는 순간에도 도전 진행을 갱신한다(웨이브 클리어 없이 끝날 수 있다)
    dailyQuest.updateProgress(questState());

    // v8: 다시 오게 만드는 한 줄. 오답노트 간격 반복은 잘 만들어 뒀는데
    //     "내일 이게 다시 나온다"는 사실을 아이에게 아무도 알려주지 않았다.
    {
      const modal = gameElements.gameOverModal;
      let comeback = modal.querySelector(".comeback-line");
      if (!comeback) {
        comeback = document.createElement("div");
        comeback.className = "comeback-line";
        (modal.querySelector(".wrongnote-box") || modal.firstElementChild).after(comeback);
      }
      const wrongN = learnLoop.getSessionWrongs().length;
      const doneN = dailyQuest.completedToday().length;
      comeback.textContent = wrongN
        ? `📒 내일 이 문제들이 복습으로 다시 나와요. 그때 맞히면 보너스 골드!`
        : doneN < 3
          ? `🗓️ 오늘의 도전이 ${3 - doneN}개 남았어요. 다음 판에서 도전해 보세요!`
          : `🎯 오늘의 도전을 모두 깼어요! 내일 새 도전이 나와요.`;
    }

    const finalComboEl = document.getElementById("finalCombo");
    if (finalComboEl) finalComboEl.textContent = comboSystem.maxCombo || 0;

    // v5.1: 스테이지 체크포인트는 게임오버에도 남는다 — 현재 스테이지부터 재도전 버튼
    const retryBtn = document.getElementById("retryStageBtn");
    if (retryBtn) {
      const stage = stageProgress.stageOfWave(currentWave);
      retryBtn.dataset.stage = stage;
      retryBtn.dataset.difficulty = selectedDifficulty;
      retryBtn.textContent = `🔁 스테이지 ${stage}부터 다시`;
    }

    // [V2] 게임 오버 음악
    musicSystem.play("defeat");

    paintNickname(currentNickname()); // v7: 랭킹에 올라갈 닉네임을 미리 보여준다
    showModal(gameElements.gameOverModal);
  }
}

function forceNextWave(isFromError = false) {
  if (!isFromError && (!waveInProgress || gamePaused)) {
    return showMessage("다음 웨이브로 강제 진행할 수 없습니다.");
  }
  sfx.play("blip");

  isForcedProgress = true;

  stopSpawnLoop();

  projectiles = [];

  monsters.forEach((m) => {
    if (m.el && m.el.parentNode) m.el.remove(); // (구 세이브 호환: DOM 있던 몬스터만)
  });
  monsters = [];

  towers.forEach((t) => {
    t.target = null;
    if (t.type === "laser" && t.laserBeam) {
      t.laserBeam.remove();
      t.laserBeam = null;
    }
  });

  effects.forEach((e) => {
    if (e.poolObj) returnToPool(e.poolObj);
  });
  effects = [];

  updateFullUI();

  waveInProgress = false;
  if (isFromError) {
    currentWave++;
    gamePaused = false;
    startWave();
  } else {
    gameElements.startWaveBtn.disabled = false;
    setStartWaveLabel("🚀 시작");
    showMathProblem();
  }
}

async function saveAndSubmit() {
  if (!gameRunning) {
    showMessage("게임이 실행 중이지 않습니다.");
    return;
  }

  // v7: prompt() 자유 입력 폐지 — 이 기기의 닉네임을 그대로 쓴다(개인정보 미수집).
  const finalPlayerName = currentNickname();

  try {
    await submitScore(finalPlayerName, score, currentWave, selectedDifficulty);

    gameRunning = false;
    stopSpawnLoop();
    // 여기서 예외가 나면 게임 루프는 이미 멈춘 뒤라 점수 표시·게임오버 모달까지
    // 도달하지 못하고 화면이 그대로 굳는다(사파리 프라이빗 모드 등).
    // 세이브 정리 실패는 게임오버 화면을 막을 만한 일이 아니다.
    try {
      localStorage.removeItem("towerDefenseSave");
      localStorage.removeItem("mathcastle:save");
    } catch (e) {
      console.warn("세이브 정리 실패:", e);
    }

    showMessage("랭킹 등록 완료! 메인 화면으로 돌아갑니다.");
    setTimeout(restartGame, 1500);
  } catch (error) {
    console.error("점수 등록 실패:", error);
    saveGame();
    showMessage(
      "점수 등록에 실패했습니다. 하지만 게임 진행 상황은 안전하게 저장되었습니다. 나중에 다시 시도해주세요.",
    );
  }
}

function loadGame() {
  const savedState = readSavedState();
  if (savedState) {
    initializeGame(savedState.difficulty, savedState);
  } else {
    showMessage("저장된 게임이 없습니다.");
  }
}

// v5: 세이브 읽기 — 신 키({version,data}) 우선, 구 키(v4 무버전) 자동 마이그레이션
function readSavedState() {
  try {
    const v5json = localStorage.getItem("mathcastle:save");
    if (v5json) {
      const wrapped = JSON.parse(v5json);
      if (wrapped && wrapped.version >= 5 && wrapped.data) {
        // v6: 세이브 v5(학년 표기) → v6(학기 표기) 마이그레이션
        wrapped.data.difficulty = migrateDifficulty(wrapped.data.difficulty);
        // v9: 버전별 분기를 실제로 둔다. 구버전은 version >= 5면 그대로 돌려주고
        //     버전 정보를 버렸다 — "무손실 마이그레이션"이라 부를 배선이 없었다.
        //     v7 미만 세이브에는 웨이브 중간 상태가 없다. 없는 채로 두면
        //     복원 코드가 옵셔널 가드로 걸러 웨이브 시작 상태로 이어진다(구 동작과 동일).
        if ((wrapped.version || 0) < 7) {
          wrapped.data.saveVersion = wrapped.version || 5;
          wrapped.data.wave = null;         // 중간 상태 없음을 명시(undefined와 구분)
          wrapped.data.migratedFrom = wrapped.version || 5;
        }
        return wrapped.data;
      }
    }
    const legacy = localStorage.getItem("towerDefenseSave");
    if (legacy) {
      const st = JSON.parse(legacy); // v4 형식 그대로 호환
      if (st) st.difficulty = migrateDifficulty(st.difficulty);
      return st;
    }
  } catch (e) {
    console.warn("세이브 읽기 실패:", e);
  }
  return null;
}

// --- 이벤트 리스너 설정 ---
function setupEventListeners() {
  // 바 위치 캐시는 레이아웃 재생성보다 먼저 버려야 한다 — debounce가 걸린
  // regenerateLayout이 뒤늦게 돌 때 이미 새 값으로 계산되도록.
  window.addEventListener("resize", invalidatePlayfieldBounds);
  window.addEventListener("orientationchange", invalidatePlayfieldBounds);
  document.addEventListener("fullscreenchange", invalidatePlayfieldBounds);
  document.addEventListener("webkitfullscreenchange", invalidatePlayfieldBounds);

  window.addEventListener("resize", debouncedRegenerateLayout);
  // ⚠️ orientationchange를 캐시 무효화에만 걸어두면 비대칭이 생긴다 — worldScale·마법사
  //    위치는 새 값을 쓰는데 길·타일·성 좌표는 옛 값으로 남아 타일이 길 위로 올라탈 수 있다.
  //    (대부분 기기는 회전 시 resize도 함께 오지만, 안 오는 조합이 있다.) 디바운스가
  //    걸려 있어 resize와 겹쳐 와도 재생성은 한 번만 돈다.
  window.addEventListener("orientationchange", debouncedRegenerateLayout);
  document.addEventListener("fullscreenchange", debouncedRegenerateLayout);
  document.addEventListener(
    "webkitfullscreenchange",
    debouncedRegenerateLayout,
  );

  document.getElementById("showRankingBtn").addEventListener("click", () => {
    sfx.init().then(() => sfx.play("blip"));
    fetchAndShowRankings();
  });
  document.querySelectorAll(".difficulty-btn").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      if (gameInitialized) return;
      sfx.init().then(() => sfx.play("blip"));
      // 폰 가로는 주소창이 세로를 80px 넘게 먹어 게임판이 눌린다(실기 실측).
      // 전체화면은 사용자 제스처 안에서만 허용되므로 이 클릭에 얹어 요청한다.
      // iOS Safari는 요소 전체화면을 막아 실패하는데, 실패해도 게임은 그대로 진행된다.
      requestGameFullscreen();
      const difficulty = e.currentTarget.dataset.difficulty;
      const progress = stageProgress.getProgress(difficulty);
      // 도달한 스테이지가 있으면 스테이지 선택, 처음이면 바로 시작
      if (progress.highest > 1) {
        openStageSelect(difficulty, progress);
      } else {
        initializeGame(difficulty);
      }
    }),
  );

  document
    .getElementById("closeStageSelectBtn")
    .addEventListener("click", () => {
      hideModal(document.getElementById("stageSelectModal"));
    });

  document.getElementById("retryStageBtn").addEventListener("click", () => {
    const btn = document.getElementById("retryStageBtn");
    const stage = Number(btn.dataset.stage || 1);
    const difficulty = btn.dataset.difficulty || selectedDifficulty;
    const checkpoint =
      stage > 1 ? stageProgress.getCheckpoint(difficulty, stage) : null;
    sfx.play("blip");
    restartGame();
    initializeGame(difficulty, checkpoint);
  });
  gameElements.startWaveBtn.addEventListener("click", startWave);
  document.getElementById("pauseBtn").addEventListener("click", togglePause);
  const fullscreenBtn = document.getElementById("fullscreenBtn");
  fullscreenBtn.addEventListener("click", (e) => {
    e.preventDefault();
    sfx.play("blip");
    ui.toggleFullScreen();
  });
  fullscreenBtn.addEventListener("touchend", (e) => {
    e.preventDefault();
    sfx.play("blip");
    ui.toggleFullScreen();
  });

  document
    .getElementById("restartGameBtn")
    .addEventListener("click", restartGame);
  document
    .getElementById("restartFromRankingBtn")
    .addEventListener("click", restartGame);
  // v7: 닉네임 다시 뽑기
  const rerollBtn = document.getElementById("rerollNickBtn");
  if (rerollBtn)
    rerollBtn.addEventListener("click", () => {
      paintNickname(rerollNickname());
      sfx.play("blip");
    });

  document
    .getElementById("submitScoreBtn")
    .addEventListener("click", async () => {
      const playerName = currentNickname(); // v7: 뽑은 닉네임만 전송
      const btn = document.getElementById("submitScoreBtn");
      btn.disabled = true;
      btn.textContent = "등록 중...";
      try {
        await submitScore(playerName, score, currentWave, selectedDifficulty);
        localStorage.removeItem("towerDefenseSave");
        localStorage.removeItem("mathcastle:save");
        showMessage("랭킹 등록 완료!");
        sfx.play("powerup");
        // Show rankings after submission
        fetchAndShowRankings();
      } catch (error) {
        console.error("점수 등록 실패:", error);
        showMessage("점수 등록에 실패했습니다. 다시 시도해주세요.");
      } finally {
        btn.disabled = false;
        btn.textContent = "등록";
      }
    });
  document
    .getElementById("closeTowerUpgradeBtn")
    .addEventListener("click", closeUpgradeSelector);

  document
    .getElementById("forceNextWaveBtn")
    .addEventListener("click", () => forceNextWave(false));

  document.getElementById("loadGameBtn").addEventListener("click", loadGame);

  document
    .getElementById("submitAndQuitBtn")
    .addEventListener("click", saveAndSubmit);

  document.getElementById("spellbook-btn").addEventListener("click", () => {
    const spellSelector = document.getElementById("spellSelector");
    const btnRect = document
      .getElementById("spellbook-btn")
      .getBoundingClientRect();

    spellSelector.classList.toggle("show");

    if (spellSelector.classList.contains("show")) {
      const selectorRect = spellSelector.getBoundingClientRect();
      let topPos = btnRect.bottom + 5;

      if (topPos + selectorRect.height > window.innerHeight) {
        topPos = btnRect.top - selectorRect.height - 5;
      }

      spellSelector.style.top = `${topPos}px`;
      spellSelector.style.left = `${btnRect.right - selectorRect.width}px`;
    }
  });

  document.getElementById("upgradeWizardBtn").addEventListener("click", () => {
    const cost = simCore.wizardUpgradeCost(wizardLevel);
    if (gold >= cost) {
      gold -= cost;
      wizardLevel++;
      WIZARD_AUTO_ATTACK_STATS.damage += 2;
      WIZARD_AUTO_ATTACK_STATS.range += 5;
      WIZARD_AUTO_ATTACK_STATS.rangeSq =
        WIZARD_AUTO_ATTACK_STATS.range * WIZARD_AUTO_ATTACK_STATS.range;
      showUpgradeNotification(`🧙‍♂️ 마법사 레벨 ${wizardLevel} 달성!`);
      checkAchievements("wizard_level", { level: wizardLevel });
      sfx.init().then(() => sfx.play("wizard_levelup"));
      wizardSprite.setLevelUp();
      populateSpellbook();
      updateFullUI();
    } else {
      showMessage("골드가 부족합니다!");
    }
  });

  gameElements.gameCanvas.addEventListener("click", handleCanvasClick);
  window.addEventListener("keydown", handleGameKeydown);
  window.addEventListener("keyup", (e) => {
    delete keysPressed[e.key];
    // keydown에서 e.code도 기록했으므로 여기서도 지운다 — 안 지우면 키를 뗐는데도
    // 마법사가 그 방향으로 계속 걸어간다.
    if (e.code) delete keysPressed[e.code];
  });
  // 한/영 전환·탭 이동 중에는 keyup을 못 받는 경우가 있다 — 그러면 그 키가 눌린 채로 남아
  // 마법사가 혼자 걸어간다. 포커스를 잃으면 눌림 상태를 전부 비운다.
  window.addEventListener("blur", () => {
    for (const k of Object.keys(keysPressed)) delete keysPressed[k];
  });

  gameElements.wizardEl.addEventListener(
    "touchstart",
    (e) => {
      e.preventDefault();
      isDraggingWizard = true;
      touchStartTime = Date.now();
      touchMoveDistance = 0;
      const touch = e.touches[0];
      wizardTouchStartX = touch.clientX;
      wizardTouchStartY = touch.clientY;
      wizardStartPosX = wizardPosition.x;
      wizardStartPosY = wizardPosition.y;
    },
    { passive: false },
  );
  gameElements.wizardEl.addEventListener(
    "touchmove",
    (e) => {
      e.preventDefault();
      if (!isDraggingWizard) return;
      const touch = e.touches[0];
      const dx = touch.clientX - wizardTouchStartX,
        dy = touch.clientY - wizardTouchStartY;
      touchMoveDistance = Math.hypot(dx, dy);
      // [V2] 터치 드래그 시 스프라이트 방향 업데이트
      const ndx = dx > 5 ? 1 : dx < -5 ? -1 : 0;
      const ndy = dy > 5 ? 1 : dy < -5 ? -1 : 0;
      wizardSprite.setDirection(ndx, ndy);

      wizardPosition.x = Math.max(
        0,
        Math.min(window.innerWidth - wizardSprite.width, wizardStartPosX + dx),
      );
      wizardPosition.y = Math.max(
        0,
        Math.min(
          window.innerHeight - wizardSprite.height,
          wizardStartPosY + dy,
        ),
      );
      gameElements.wizardEl.style.transform = `translate(${Math.round(wizardPosition.x)}px, ${Math.round(wizardPosition.y)}px)`;
    },
    { passive: false },
  );
  gameElements.wizardEl.addEventListener(
    "touchend",
    (e) => {
      e.preventDefault();
      if (touchMoveDistance < 20 && Date.now() - touchStartTime < 250) {
        if (
          !["teleport", "blackHole", "fireball", "frostNova"].includes(
            activeSpell,
          )
        ) {
          handleWizardAttack();
        } else {
          showMessage(
            `${WIZARD_SPELLS[activeSpell].name} 스킬은 필드를 터치하여 사용하세요.`,
          );
        }
      }
      isDraggingWizard = false;
    },
    { passive: false },
  );
  gameElements.wizardEl.addEventListener("click", (e) => {
    e.stopPropagation();
    if (
      !["teleport", "blackHole", "fireball", "frostNova"].includes(activeSpell)
    ) {
      handleWizardAttack();
    } else {
      showMessage(
        `${WIZARD_SPELLS[activeSpell].name} 스킬은 필드를 클릭하여 사용하세요.`,
      );
    }
  });

  const rankingTabsContainer = document.querySelector(".ranking-tabs");
  if (rankingTabsContainer) {
    rankingTabsContainer.addEventListener("click", (event) => {
      const clickedBtn = event.target.closest(".tab-btn");
      if (!clickedBtn) return;
      rankingTabsContainer
        .querySelectorAll(".tab-btn")
        .forEach((b) => b.classList.remove("active"));
      clickedBtn.classList.add("active");
      document
        .querySelectorAll(".ranking-content")
        .forEach((c) => c.classList.remove("active"));
      document
        .getElementById(clickedBtn.dataset.tab + "Ranking")
        .classList.add("active");
    });
  }

  // ── v9: 탭을 벗어나면 자동으로 멈춘다 ──────────────────
  // 구버전은 blur에서 눌린 키만 비웠다. rAF는 멈춰도 gamePaused가 false라
  // 스폰 타이머는 계속 돌았고, 돌아오면 몬스터가 쌓인 화면을 보게 됐다.
  // ⚠️ 돌아왔을 때 **자동 재개하지 않는다** — 눈을 떼는 순간 성이 깨지는 걸 막는다.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && gameRunning && !gamePaused && !isProblemModalOpen()) {
      togglePause();
      saveGame(true); // 조용한 저장 — 앱을 그대로 닫아도 지금 지점이 남는다
    }
  });
  window.addEventListener("pagehide", () => {
    if (gameRunning) saveGame(true);
  });

  // ── v9: 일시정지 오버레이 버튼 ────────────────────────
  document.getElementById("pauseResumeBtn")?.addEventListener("click", () => {
    if (gamePaused) togglePause();
  });
  document.getElementById("pauseSaveQuitBtn")?.addEventListener("click", () => {
    const saved = saveGame(true);
    showMessage(saved ? "💾 여기까지 저장했어요 — 언제든 이어서 해요" : "⚠️ 저장에 실패했어요");
    setTimeout(() => restartGame(), saved ? 900 : 1500);
  });
  document.getElementById("pauseSettingsBtn")?.addEventListener("click", () => {
    showModal(document.getElementById("settingsModal"));
  });

  // --- Save button handler ---
  const saveGameBtn = document.getElementById("saveGameBtn");
  if (saveGameBtn) {
    saveGameBtn.addEventListener("click", () => {
      if (gameRunning) {
        saveGame();
      } else {
        showMessage("게임이 실행 중이지 않습니다.");
      }
    });
  }

  // --- Game speed toggle handler ---
  const speedBtn = document.getElementById("speedBtn");
  if (speedBtn) {
    speedBtn.addEventListener("click", () => {
      gameSpeed = gameSpeed === 1 ? 2 : 1;
      speedBtn.textContent = gameSpeed === 1 ? "1x" : "2x";
      // v9: 스폰이 게임 시계를 따르므로 배속 토글에 따로 손댈 게 없다.
      //     (구버전은 여기서 startSpawnLoop()을 다시 불렀는데, 그러면 다음 스폰
      //      시각이 '지금'으로 당겨져 배속을 누를 때마다 한 마리가 공짜로 나왔다.)
      sfx.play("blip");
      showMessage(`게임 속도: ${gameSpeed}x`);
    });
  }
}

// --- 유틸리티 및 헬퍼 함수 ---
function updateFullUI() {
  const currentState = {
    gold,
    score,
    castleHealth,
    currentWave,
    monsters,
    monstersInWave,
    wizardLevel,
    focusPoints,
  };
  ui.updateUI(currentState);
  maybeHintWizardUpgrade();
}

// v9: "마법사를 올릴 수 있다는 걸 몰랐다"는 신고. 버튼은 있었지만 ⬆️ 아이콘 하나뿐이라
//     값도, 올리면 뭐가 열리는지도 화면 밖이었다. 처음 살 수 있게 된 그 순간에 **한 번만**
//     알려 준다 — 매번 띄우면 잔소리가 되고, 안 띄우면 지금까지처럼 아무도 모른다.
let wizardHintShownAtLevel = -1;
function maybeHintWizardUpgrade() {
  if (!gameRunning || gamePaused) return;
  if (wizardHintShownAtLevel === wizardLevel) return;
  if (gold < simCore.wizardUpgradeCost(wizardLevel)) return;
  wizardHintShownAtLevel = wizardLevel;
  const next = ui.nextSpellAtLevel(wizardLevel + 1);
  showMessage(
    next
      ? `🧙‍♂️ 마법사를 Lv.${wizardLevel + 1}로 올릴 수 있어요! ` +
        `새 마법 「${next.name}」${ui.particleFor(next.name, "이", "가")} 열려요`
      : `🧙‍♂️ 마법사를 Lv.${wizardLevel + 1}로 올릴 수 있어요!`,
  );
}


/**
 * 수학 문제 모달이 떠 있는가.
 *
 * ⚠️ gamePaused는 "문제 풀이 중"과 "사용자가 멈춤"을 같은 boolean으로 쓴다.
 *    자동 일시정지가 이걸 모르고 토글하면 **문제 화면을 되레 재개**시켜
 *    답을 고르지도 않았는데 게임이 흘러간다(교차검증 지적).
 *    그래서 문제 모달 중에는 일시정지 조작 자체를 받지 않는다.
 */
/**
 * v9: 축복 효과를 지금 있는 것들에 실제로 반영한다.
 *
 * ⚠️ 타워는 생성 시점에 range/splashRadius를 복사해 갖는다(recreateTower). 그래서
 *    축복을 얻은 순간 이미 서 있는 타워에도 다시 발라 줘야 한다 — 안 그러면
 *    "축복을 골랐는데 아무 변화가 없다"가 된다. 원본 수치를 따로 보관해 두고
 *    항상 **원본 × 배수**로 계산한다(누적 곱 방지).
 */
/**
 * 확장하는 충격파 링처럼 **화면을 가로지르는 움직임**을 낼지 판정한다.
 * 파편(explosion)은 제자리에서 튀는 작은 입자라 quality.low만 보지만,
 * 링은 커지며 시야를 훑기 때문에 흔들림·전면 플래시와 같은 a11y 관문을 통과시킨다.
 * (기존 보스 사망 링도 같은 규칙으로 맞춘다 — 한쪽만 막으면 "미사일엔 안 나오는데
 *  보스엔 나오는" 일관성 없는 상태가 된다.)
 */
function heavyFxAllowed() {
  return !quality.low && !prefersReducedMotion();
}

function applyBlessingsToTower(t, rm, sm) {
  // ⚠️ TOWER_STATS에서 **재계산하지 않는다.** 레벨업(×1.1)·각성(×1.1)이 사거리를
  //    곱셈으로 올리므로 원본에서 다시 세우면 그 투자분이 통째로 사라진다.
  //    실측: 레벨10·각성6 대포는 사거리 590인데 재계산하면 252가 나왔다(42.7%) —
  //    "멀리 보는 눈"을 고르면 사거리가 절반 이하로 **줄어드는** 정반대 동작이었다.
  //    배수는 곱셈을 통과해도 살아남으므로((base×rm)×1.1 == (base×1.1)×rm),
  //    지금 발라져 있는 배수를 나눈 뒤 새 배수를 곱한다.
  const prevR = t._blessRange || 1;
  if (prevR !== rm) {
    t.range = (t.range / prevR) * rm;
    t.rangeSq = t.range * t.range;
    t._blessRange = rm;
  }
  const prevS = t._blessSplash || 1;
  if (t.splashRadius > 0 && prevS !== sm) {
    t.splashRadius = (t.splashRadius / prevS) * sm;
    t.splashRadiusSq = t.splashRadius * t.splashRadius;
    t._blessSplash = sm;
  }
  return t;
}

/** 방금 만든 타워 한 대에 이번 판 축복을 바른다(건설·상자 개봉 공통). */
function applyBlessingsToNewTower(t) {
  return applyBlessingsToTower(
    t,
    blessing.rangeMult(blessings),
    blessing.splashMult(blessings),
  );
}

function applyBlessingsToWorld() {
  const rm = blessing.rangeMult(blessings);
  const sm = blessing.splashMult(blessings);
  for (const t of towers) applyBlessingsToTower(t, rm, sm);
  // 마법사 자동공격 속도(쿨다운이 짧아진다)
  WIZARD_AUTO_ATTACK_STATS.cooldown =
    WIZARD_AUTO_ATTACK_STATS.initialCooldown / blessing.wizardSpeedMult(blessings);
}

/** 스테이지 클리어 시 3택 1. 고르면 onDone()으로 원래 흐름(수학 문제)에 넘긴다. */
function openBlessingChooser(onDone) {
  const ov = document.getElementById("blessingOverlay");
  const cards = document.getElementById("blessingCards");
  const owned = document.getElementById("blessingOwned");
  const offers = blessing.offer(blessings, Math.random, 3);
  if (!ov || !cards || offers.length === 0) { onDone(); return; }

  blessingOpen = true;
  gamePaused = true;
  cards.innerHTML = "";
  const focusOnOpen = () => focusIntoDialog(ov);
  for (const b of offers) {
    const el = document.createElement("button");
    el.className = "blessing-card";
    el.dataset.blessingId = b.id;
    const lv = blessings[b.id] || 0;
    // CSP(style-src 'self')가 인라인 style을 막으므로 전부 클래스로만 꾸민다.
    el.innerHTML =
      `<div class="blessing-card-icon">${b.icon}</div>` +
      `<div class="blessing-card-title">${b.title}</div>` +
      `<div class="blessing-card-desc">${b.desc}</div>` +
      `<div class="blessing-card-level">${lv > 0 ? `지금 ${lv}단계 → ${lv + 1}단계` : "새로 배워요"}</div>`;
    el.addEventListener("click", () => {
      blessings = blessing.apply(blessings, b.id);
      applyBlessingsToWorld();
      ov.hidden = true;
      restoreFocusAfterDialog();
      blessingOpen = false;
      gamePaused = false;
      sfx.play("powerup");
      showUpgradeNotification(`${b.icon} ${b.title} — ${b.desc}`, "epic");
      onDone();
    });
    cards.appendChild(el);
  }
  const have = blessing.summary(blessings);
  owned.textContent = have.length
    ? "지금 가진 선물: " + have.map((h) => `${h.icon} ${h.title} ${h.level}단계`).join(" · ")
    : "";
  ov.hidden = false;
  focusOnOpen();
}

function isProblemModalOpen() {
  return !!document.getElementById("mathModal")?.classList.contains("show");
}

/** 일시정지 오버레이 표시/숨김 + 요약 채우기 */
// ── v9 a11y: aria-modal 다이얼로그 포커스 이동 ─────────────────────────────
// aria-modal="true"만 선언하고 포커스를 옮기지 않으면 스크린리더·키보드 사용자에게는
// 포커스가 배경에 남아 "열렸다"는 사실 자체가 전달되지 않는다.
let focusBeforeDialog = null;

function focusIntoDialog(ov) {
  focusBeforeDialog = document.activeElement;
  const first = ov.querySelector(
    'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  if (first) first.focus();
}

function restoreFocusAfterDialog() {
  const el = focusBeforeDialog;
  focusBeforeDialog = null;
  // 오버레이 안에 있던 버튼이면 되돌리지 않는다(숨겨진 요소로 포커스가 가면 사라진다).
  if (el && typeof el.focus === "function" && document.contains(el) && el.offsetParent !== null) {
    el.focus();
  }
}

function renderPauseOverlay(show) {
  const ov = document.getElementById("pauseOverlay");
  if (!ov) return;
  if (show) {
    const stats = document.getElementById("pauseStats");
    if (stats) {
      stats.innerHTML =
        `<span class="pause-stat">🌊 웨이브 ${currentWave}</span>` +
        `<span class="pause-stat">💰 ${gold}</span>` +
        `<span class="pause-stat">❤️ ${castleHealth}</span>` +
        `<span class="pause-stat">🎯 집중력 +${Math.round((simCore.focusDamageMultiplier(focusPoints) - 1) * 100)}%</span>`;
    }
    const sub = document.getElementById("pauseSub");
    if (sub) sub.textContent = waveInProgress ? "몬스터가 기다리고 있어요" : "다음 웨이브 준비 중";
    const wasHidden = ov.hidden;
    ov.hidden = false;
    if (wasHidden) focusIntoDialog(ov);
  } else {
    const wasShown = !ov.hidden;
    ov.hidden = true;
    if (wasShown) restoreFocusAfterDialog();
  }
}

function togglePause() {
  // 문제 화면·축복 선택 중에는 일시정지를 받지 않는다(위 주석 참고).
  // 축복 화면에서 P를 누르면 고르지도 않았는데 게임이 흘러가 버린다.
  if (isProblemModalOpen() || blessingOpen) return;
  sfx.play("blip");
  gamePaused = !gamePaused;
  document.getElementById("pauseBtn").textContent = gamePaused
    ? "▶️"
    : "⏸️ 일시정지";
  renderPauseOverlay(gamePaused);

  if (gamePaused) {
    pauseStartTimePerf = performance.now();
    // 일시정지 중엔 게임 루프가 멈춰 updateTileFocus/updateActionHint가 아예 호출되지 않는다
    // → 여기서 직접 지우지 않으면 하이라이트와 힌트가 화면에 그대로 남는다
    clearTileFocus();
    updateActionHint();
  } else {
    if (pauseStartTimePerf > 0) {
      // ⚠️ 예전엔 여기서 모든 쿨다운·지속시간을 일시정지한 만큼 뒤로 밀어줬다
      //    (adjustPerfTimers). 타이머가 벽시계 기준이라 정지 중에도 흘렀기 때문이다.
      //    이제 전부 게임 시계 기준이고 게임 시계는 정지 중 멈추므로 보정이 필요 없다 —
      //    남겨두면 오히려 정지한 시간만큼 두 번 밀어주는 꼴이 된다.
      lastFrameTime = performance.now();
      pauseStartTimePerf = 0;
    }
  }
}

// v5.1: 스테이지 선택 — 도달한 스테이지 목록에서 골라 체크포인트(타워·골드 유지)로 시작
function openStageSelect(difficulty, progress) {
  const modal = document.getElementById("stageSelectModal");
  const grid = document.getElementById("stageGrid");
  const info = document.getElementById("stageSelectInfo");
  if (!modal || !grid) return initializeGame(difficulty);

  info.textContent = `${difficultyLabel(difficulty)} · 최고 스테이지 ${progress.highest} — 타워와 골드는 그대로 이어집니다`;
  grid.innerHTML = "";
  for (let s = 1; s <= progress.highest; s++) {
    const cleared = s < progress.highest;
    const btn = document.createElement("button");
    btn.className = `stage-btn${cleared ? " cleared" : " frontier"}`;
    btn.innerHTML = `<span class="stage-num">${s}</span><span class="stage-sub">${
      cleared ? "✅ 클리어" : "⚔️ 도전!"
    }</span><span class="stage-waves">웨이브 ${stageProgress.stageStartWave(s)}~${
      s * stageProgress.WAVES_PER_STAGE
    }</span>`;
    btn.addEventListener("click", () => {
      sfx.play("blip");
      hideModal(modal);
      const checkpoint =
        s > 1 ? stageProgress.getCheckpoint(difficulty, s) : null;
      initializeGame(difficulty, checkpoint);
    });
    grid.appendChild(btn);
  }
  showModal(modal);
}

function restartGame() {
  // v9: 오버레이·흔들림 잔재를 지운다. 안 지우면 메뉴 위에 반투명 판이 남거나
  //     화면이 비뚤어진 채로 시작한다.
  renderPauseOverlay(false);
  impactFx.resetShake();
  resetFlashBudget();
  renderDailyPanel(); // v8: 오늘의 도전 진행이 바뀌었을 수 있다
  hideModal(gameElements.gameOverModal);
  hideModal(document.getElementById("stageSelectModal"));
  hideModal(gameElements.rankingModal);
  ui.showDifficultySelector();
  gameInitialized = false;
  safeCleanupAllElements();
  towers = [];
  monsters = [];
  projectiles = [];
  effects = [];
  damageTexts = [];

  // [V2] 메뉴 복귀
  if (particleSystem) particleSystem.clear();
  musicSystem.play("menu");
  musicSystem.setIntensity(0.4);
  initMenuParticles();
  comboSystem.break();
  updateComboDisplay();

  // Reset extended state
  // ⚠️ 쿨다운은 gameClock의 **절대값**으로 저장된다. gameClock은 판이 바뀌어도
  //    리셋하지 않으므로(리셋하면 남은 절대값이 미래로 남아 스킬이 영구 잠긴다),
  //    새 판을 시작할 땐 쿨다운 쪽을 비워야 한다. 안 그러면 직전 판에서 쓴 스펠이
  //    새 게임 시작부터 쿨다운 상태로 남는다(교차검증 3계열 합의).
  wizardCooldowns = {};
  WIZARD_AUTO_ATTACK_STATS.cooldownUntil = 0;
  gameSpeed = 1;
  shownProblemIds = new Set();
  activeSpell = "fireball";
  totalKillCount = 0;
  totalBossKills = 0;
  totalTowersBuilt = 0;

  // v9: 판을 넘어 새면 안 되는 것들.
  //   · delayedTasks — 개봉 대기 중이던 상자가 메뉴 화면에서 터져 타워가 생긴다
  //   · pendingBoxes — 위와 짝
  //   · 히트스톱 잔여 — 새 판 첫 프레임이 슬로모션으로 시작한다
  //   · 스포너 — gameClock은 판을 넘어 이어지므로 nextSpawnAt이 과거로 남으면
  //     새 판 시작과 동시에 따라잡기 스폰이 터진다
  delayedTasks.length = 0;
  pendingBoxes.length = 0;
  wizardHintShownAtLevel = -1;
  hitstopRemainingMs = 0;
  hitstopUsedInWindow = 0;
  hitstopWindowElapsed = 0;
  stopSpawnLoop();
  blessingOpen = false;
  const blessOv = document.getElementById("blessingOverlay");
  if (blessOv) blessOv.hidden = true;
  const speedBtn = document.getElementById("speedBtn");
  if (speedBtn) speedBtn.textContent = "1x";
}

function handleCanvasClick(e) {
  if (e.target.closest(".tower, .placement-tile, .wizard")) return;
  resetBuildProcess();

  const rect = gameElements.gameCanvas.getBoundingClientRect();
  lastClickPos = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };

  if (
    ["teleport", "blackHole", "fireball", "frostNova"].includes(activeSpell)
  ) {
    handleWizardAttack(lastClickPos);
  }
}

function handleTileTap(e) {
  e.preventDefault();
  openTowerSelectorForTile(e.currentTarget);
}

function handleBuildStep(action, type, event) {
  if (action === "reset") {
    resetBuildProcess();
    updateActionHint();
  } else if (action === "preview") {
    // 데스크톱 hover 미리보기 — 아직 짓지 않고 사거리만 보여준다
    if (buildStep !== "idle") showRangeIndicatorFor(type);
  } else if (action === "preview-off") {
    gameElements.rangeIndicator.style.display = "none";
  } else if (action === "select") {
    const currentTowerType = type;
    // 데스크톱: 한 번 클릭하면 바로 건설(사거리는 hover로 이미 확인됨).
    // 모바일: hover가 없으므로 기존대로 선택 → 한 번 더 눌러 확정(오조작 방지).
    if (!isTouchLike && buildStep !== "idle") {
      placeTower(currentTowerType);
      updateActionHint();
      return;
    }
    if (
      buildStep === "confirming_build" &&
      pendingTowerType === currentTowerType
    ) {
      placeTower(currentTowerType);
      updateActionHint();
      return;
    }
    if (
      buildStep === "selecting_tower" ||
      (buildStep === "confirming_build" &&
        pendingTowerType !== currentTowerType)
    ) {
      pendingTowerType = currentTowerType;
      buildStep = "confirming_build";
      document
        .querySelectorAll(".tower-option")
        .forEach((opt) => opt.classList.remove("selected"));
      event.currentTarget.classList.add("selected");
      showRangeIndicatorFor(currentTowerType);
      ui.showTowerInfoTooltip(
        TOWER_STATS[currentTowerType],
        event.clientX,
        event.clientY,
      );
    }
  }
}

function closeUpgradeSelector() {
  hideModal(gameElements.towerUpgradeSelector);
  gameElements.rangeIndicator.style.display = "none";
}

function resetBuildProcess() {
  gameElements.towerSelector.classList.remove("show");
  gameElements.rangeIndicator.style.display = "none";
  ui.hideTowerInfoTooltip();
  if (pendingTile)
    document
      .querySelectorAll(".tower-option")
      .forEach((opt) => opt.classList.remove("selected"));
  buildStep = "idle";
  pendingTile = null;
  pendingTowerType = null;
  // 타워가 서면 그 타일은 숨겨진다 → 포커스를 버리고 다음 프레임에 다시 찾게 한다
  clearTileFocus();
  lastFocusScanPos = { x: -9999, y: -9999 };
}

function showRangeIndicatorFor(type) {
  const { rangeIndicator } = gameElements;
  const towerStat = { ...TOWER_STATS[type] };
  if (isMobile) towerStat.range *= 1.05;

  if (towerStat && pendingTile) {
    rangeIndicator.style.width = `${towerStat.range * 2}px`;
    rangeIndicator.style.height = `${towerStat.range * 2}px`;
    rangeIndicator.style.left = `${pendingTile.x + 20}px`;
    rangeIndicator.style.top = `${pendingTile.y + 20}px`;
    rangeIndicator.style.display = "block";
  }
}

function safeCleanupAllElements() {
  // Canvas 초기화
  if (dynamicCtx) {
    dynamicCtx.clearRect(
      0,
      0,
      dynamicCtx.canvas.width,
      dynamicCtx.canvas.height,
    );
  }

  // effects 풀 정리
  for (const subKey in pools.effects) {
    pools.effects[subKey].forEach(returnToPool);
  }

  // DOM에서 직접 관리되는 요소들 제거
  document
    .querySelectorAll(".monster, .tower, .path, .placement-tile, .laser-beam")
    .forEach((el) => {
      if (el && el.parentNode) {
        el.remove();
      }
    });
}

// --- 게임 저장 및 불러오기 ---
/**
 * v9: 웨이브 **도중**의 몬스터까지 저장한다.
 *
 * 왜 필요한가 — 두 가지가 한꺼번에 풀린다:
 *  ① 사용자가 요청한 "이어서 게임"이 문자 그대로 성립한다. 구버전 오토세이브는
 *     웨이브 완료 시점 1회뿐이라, 웨이브 도중에 나가면 그 웨이브가 통째로 날아갔다.
 *  ② **랜덤 상자 재추첨 구멍이 막힌다.** 저장 지점이 "웨이브 시작"이면,
 *     상자를 사서 나쁜 게 나왔을 때 나갔다 들어와 골드를 되돌려 다시 뽑을 수 있다
 *     (교차검증이 지적, 코드로 확인: 웨이브 중에도 상자 구매가 열려 있다).
 *     되감기 자체를 없애면 그 구멍이 원천적으로 사라진다.
 *
 * 좌표(x,y)는 저장하지 않는다 — 창 크기가 바뀌면 경로가 다시 그려지므로
 * pathIndex(경로상 위치)만 남기고 복원 때 그 자리에서 다시 계산한다.
 * 발사체는 저장하지 않는다(수백 ms 수명이라 복원 이득이 없다).
 */
// 몬스터가 들고 다니는 게임시계 절대시각 필드들. 저장 시 잔여로 바꾸고 복원 시 되돌린다.
const TIMER_KEYS = [
  "lastSummonTime", "lastHealTime", "lastShieldTime", "lastTeleportTime",
  "lastDisruptTime", "lastTimeWarpTime", "lastStealthTime", "hideUntil",
];

function serializeMonsters() {
  return monsters
    .filter((m) => !m.isDead)
    .map((m) => {
      const se = {};
      for (const [k, v] of Object.entries(m.statusEffects || {})) {
        // 지속시간은 절대시각이 아니라 **남은 시간**으로 저장한다.
        // 절대값을 그대로 두면 새 판의 게임 시계에서 이미 지난 시각이 되거나
        // 영영 안 끝나는 상태이상이 된다.
        if (v && typeof v.endTime === "number") se[k] = { ...v, remain: Math.max(0, v.endTime - gameClock) };
        else se[k] = v;
      }
      // 고유 능력 타이머(소환·힐·보호막·순간이동·방해·시간왜곡·은신)는 전부 게임 시계의
      // **절대시각**이라 그대로 저장하면 새 판에서 의미가 없다. 상태이상과 같은 규칙으로
      // 남은 시간을 적는다. 이게 없으면 불러오자마자 소환사가 박쥐를 다시 뱉는다.
      const tm = {};
      for (const k of TIMER_KEYS) {
        if (typeof m[k] === "number") tm[k] = m[k] - gameClock; // 과거면 음수 그대로(=이미 지남)
      }
      return {
        k: m.monsterKey,
        hp: m.hp,
        maxHp: m.maxHp,
        gold: m.gold,
        pathIndex: m.pathIndex,
        // 경로점 개수는 화면 크기에 따라 달라진다(5px 간격). 인덱스를 그대로 쓰면
        // 작은 화면에서 불러올 때 전부 마지막 인덱스로 잘려 **성 앞에 쏟아진다**.
        pathLen: pathPoints.length,
        isElite: !!m.isElite,
        isStealthed: !!m.isStealthed,
        baseSpeed: m.baseSpeed,
        currentSpeed: m.currentSpeed,
        direction: m.direction,
        animPhase: m.animPhase,
        se,
        tm,
      };
    });
}

function restoreMonsters(list) {
  if (!Array.isArray(list) || pathPoints.length === 0) return 0;
  let n = 0;
  for (const d of list) {
    const stats = MONSTER_STATS[d.k];
    if (!stats) continue; // 삭제된 몬스터 종류 — 조용히 건너뛴다(복원이 막히면 안 된다)
    // 저장 당시 경로 길이가 다르면 **비율로 환산**한다. 클램프만 하면 긴 화면에서
    // 저장한 몬스터가 짧은 화면에서 전부 성 앞(마지막 인덱스)에 놓여 즉시 누수된다.
    const savedLen = typeof d.pathLen === "number" && d.pathLen > 1 ? d.pathLen : null;
    const raw = savedLen && pathPoints.length > 1
      ? (d.pathIndex || 0) * ((pathPoints.length - 1) / (savedLen - 1))
      : (d.pathIndex || 0);
    const idx = Math.max(0, Math.min(pathPoints.length - 1, raw));
    const pt = pathPoints[Math.floor(idx)] || pathPoints[0];
    const se = {};
    for (const [k, v] of Object.entries(d.se || {})) {
      if (v && typeof v.remain === "number") {
        const { remain, ...rest } = v;
        se[k] = { ...rest, endTime: gameClock + remain };
      } else se[k] = v;
    }
    monsters.push({
      ...stats,
      id: Date.now() + Math.random(),
      monsterKey: d.k,
      maxHp: d.maxHp,
      hp: d.hp,
      gold: d.gold,
      isDead: false,
      isStealthed: !!d.isStealthed,
      baseSpeed: d.baseSpeed ?? stats.speed,
      currentSpeed: d.currentSpeed ?? d.baseSpeed ?? stats.speed,
      isElite: !!d.isElite,
      x: pt.x,
      y: pt.y,
      pathIndex: idx,
      statusEffects: se,
      direction: d.direction || 0,
      animFrame: 0,
      animTimer: 0,
      animPhase: d.animPhase ?? Math.random() * Math.PI * 2,
      prevX: 0,
      prevY: 0,
      defenseAuraSq: (stats.defenseAuraRadius || 0) ** 2,
      healRadiusSq: (stats.healRadius || 0) ** 2,
      shieldRadiusSq: (stats.shieldRadius || 0) ** 2,
    });
    // 능력 타이머를 잔여 → 새 시계의 절대시각으로 되돌린다.
    // 저장이 없던 v7 이전 세이브면 tm이 비어 있고, 그때는 종전대로 stats 기본값이 남는다.
    const restored = monsters[monsters.length - 1];
    for (const [k, v] of Object.entries(d.tm || {})) {
      if (typeof v === "number") restored[k] = gameClock + v;
    }
    n++;
  }
  return n;
}

function buildGameState() {
  // 개봉 대기 중인 상자를 먼저 터뜨린다. 안 그러면 골드는 이미 깎였는데 타워는
  // 아직 없는 창(최대 1.2초)에 저장이 끼어 **골드만 사라진 세이브**가 만들어진다.
  flushPendingBoxes();
  return {
    difficulty: selectedDifficulty,
    gold,
    score,
    castleHealth,
    currentWave,
    wizardLevel,
    wizardPosition,
    wizardDamage: WIZARD_AUTO_ATTACK_STATS.damage,
    wizardRange: WIZARD_AUTO_ATTACK_STATS.range,
    towers: towers.map((tower) => ({
      type: tower.type,
      level: tower.level,
      awaken: tower.awaken || 0, // v6: 각성 단계
      tile: {
        x: parseInt(tower.el.style.left),
        y: parseInt(tower.el.style.top),
      },
      // 방해자·대악마가 건 디버프의 **남은 시간**. 저장 안 하면 불러오는 순간 풀려서
      // "저장하고 다시 불러오면 디버프가 사라지는" 우회로가 된다.
      dis: Math.max(0, (tower.disabledUntil || 0) - gameClock) || undefined,
      tw: Math.max(0, (tower.timeWarpedUntil || 0) - gameClock) || undefined,
    })),
    // --- Extended save data ---
    activeSpell,
    maxCombo: comboSystem.maxCombo || 0,
    focusPoints, // v8: 이어하기 때 집중력을 잃지 않게
    totalKillCount,
    totalBossKills,
    totalTowersBuilt,
    achievementProgress: achievementSystem
      .getAll()
      .filter((a) => a.unlocked)
      .map((a) => a.id),
    shownProblemIds: shownProblemIds ? [...shownProblemIds] : [],
    gameSpeed,

    // ── v7 세이브: 웨이브 도중까지 이어붙이기 ──────────────
    saveVersion: 7,
    masteredThisRun,
    blessings,
    // 타워 쿨다운은 **남은 시간**으로 (절대 게임시각을 그대로 저장하면 새 판에서
    // 이미 지난 값이 되거나 미래에 박혀 타워가 영영 안 쏜다 — 기록된 결함 1번과 같은 계열)
    towerCooldownLeft: towers.map((t) => Math.max(0, (t.cooldownUntil || 0) - gameClock)),
    wizardCooldownLeft: Object.fromEntries(
      Object.entries(wizardCooldowns || {}).map(([k, v]) => [k, Math.max(0, v - gameClock)]),
    ),
    wizardAutoCooldownLeft: Math.max(0, (WIZARD_AUTO_ATTACK_STATS.cooldownUntil || 0) - gameClock),
    wave: {
      inProgress: waveInProgress,
      composition: waveComposition,
      monstersInWave,
      monstersSpawned,
      spawnCount,
      spawnActive,
      spawnInLeft: Math.max(0, nextSpawnAt - gameClock),
      // 이 웨이브를 지금까지 몇 초 끌었는지. 복원 시 0으로 리셋하면 20초 싸우다 저장하고
      // 불러와 1초 만에 끝냈을 때 "15초 이내 클리어" 업적이 거짓으로 열린다.
      elapsed: Math.max(0, gameClock - waveStartTime),
      damageTaken: waveDamageTaken,
      modifier: currentWaveModifier,
      monsters: serializeMonsters(),
    },
  };
}

function saveGame(silent = false) {
  // v8: 여기가 프로젝트에서 유일하게 try/catch 없는 저장 경로였다.
  //     저장공간이 가득 찬 기기(사파리 프라이빗 모드·용량 부족)에서는
  //     setItem이 QuotaExceededError를 던지고, 이 함수가 checkWaveCompletion 안에서
  //     호출되기 때문에 그 뒤의 스테이지 체크포인트 기록과 클리어 메시지까지
  //     통째로 날아갔다. 아이 눈에는 원인 모를 "먹통"으로 보인다.
  //     예외는 여기서 흡수한다 — 저장 실패가 게임 진행을 막으면 안 된다.
  try {
    const gameState = buildGameState();
    // v5: 게임ID 네임스페이스 + 버전 래퍼 (마이그레이션 체인용)
    localStorage.setItem(
      "mathcastle:save",
      JSON.stringify({ version: 7, data: gameState }),
    );
    localStorage.removeItem("towerDefenseSave"); // 구 키 정리
    if (!silent) {
      showMessage("게임이 저장되었습니다!");
      sfx.play("blip");
    }
    return true;
  } catch (err) {
    console.warn("게임 저장 실패:", err);
    showMessage("⚠️ 저장 공간이 부족해 저장하지 못했어요. 게임은 계속할 수 있어요!");
    return false;
  }
}
