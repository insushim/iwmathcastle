// main.js - V2 Upgraded

import { gameElements, isTouchLike } from "./constants.js";
import {
  TOWER_STATS,
  MONSTER_STATS,
  WIZARD_SPELLS,
  WIZARD_AUTO_ATTACK_STATS,
} from "./gameData.js";
import { mathProblems, loadGradeProblems } from "./problems.js";
import * as simCore from "./simCore.js";
import { quality, detectLowEnd, feedFrameTime } from "./perfQuality.js";
import * as learnLoop from "./learnLoop.js";
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
// --- [V2] 새 모듈 임포트 ---
import { ParticleSystem } from "./particles.js";
import { MusicSystem } from "./music.js";
import { AchievementSystem, ComboSystem } from "./achievements.js";
import { WizardSprite } from "./wizardSprite.js";
import { CastleRenderer } from "./castleRenderer.js";
import { MonsterRenderer } from "./monsterRenderer.js";
import { TowerRenderer } from "./towerRenderer.js";
import { ProjectileRenderer } from "./projectileRenderer.js";

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
let currentWaveModifier = null; // v6: 웨이브 변이 (웨이브 30+)
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
let currentProblemTimeLimit = 30000;
function problemTimeLimit(problem) {
  const base = PROBLEM_TIME_BY_TYPE[problem && problem.t] || 30000;
  const grade = parseInt(selectedDifficulty, 10);
  return base + (grade <= 4 ? 5000 : 0);
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
const wizardSprite = new WizardSprite();
const castleRenderer = new CastleRenderer();
const monsterRenderer = new MonsterRenderer();
const towerRenderer = new TowerRenderer();
const projectileRenderer = new ProjectileRenderer();
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
    item.innerHTML = `
            <div class="achievement-icon">${a.unlocked ? "🏆" : "🔒"}</div>
            <div class="achievement-name">${a.name}</div>
            <div class="achievement-desc">${a.description}</div>
        `;
    list.appendChild(item);
  });
}

// --- 게임 초기화 및 설정 ---
window.addEventListener("DOMContentLoaded", () => {
  detectLowEnd(); // v5: 웨일북(저사양) 자동 감지 → 품질 강등

  // v5 QA 훅 (고유 전역 키 — window.game 금지 교훈). 프로덕션에서도 무해(읽기+시전 테스트용).
  window.__mathcastle = {
    getState: () => ({
      gold, castleHealth, currentWave, wizardLevel, activeSpell,
      monsters: monsters.length, towers: towers.length,
      gameRunning, gamePaused,
    }),
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
      monsters.slice(0, 5).map((m) => ({
        key: m.monsterKey, x: Math.round(m.x), y: Math.round(m.y),
        direction: +m.direction.toFixed(2), pathIndex: Math.round(m.pathIndex),
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
  };
  window.__spritesReady = preloadSprites(); // v5: AI 스프라이트 로드 (없으면 절차적 폴백)
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
    learnLoop.resetQueue();
    // v6: 지난 판 오답노트에서 최대 3문항을 웨이브 1~3 복습 퀴즈로 (보너스 골드)
    if (!savedState) {
      const seeded = learnLoop.seedReviewFromNote(difficulty);
      if (seeded > 0)
        setTimeout(
          () => showMessage(`📒 지난 판 오답 ${seeded}문제가 복습 퀴즈로 나와요! (맞히면 보너스 골드)`),
          1200,
        );
    }

  // v5: 학년별 AI 배경 (없으면 기존 CSS 배경 유지)
  {
    try { await window.__spritesReady; } catch {}
    const bgKey = { 3: "bg_meadow", 4: "bg_meadow", 5: "bg_canyon", 6: "bg_volcano" }[parseInt(difficulty, 10)];
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

    showMessage("게임을 성공적으로 불러왔습니다!");
  } else {
    WIZARD_AUTO_ATTACK_STATS.damage = WIZARD_AUTO_ATTACK_STATS.initialDamage;
    WIZARD_AUTO_ATTACK_STATS.range = 120;
    WIZARD_AUTO_ATTACK_STATS.rangeSq = 120 * 120;
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
    creationTime: performance.now(),
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

  // 길이 움직이면(창 크기 변경·레이아웃 개편·예전 세이브 불러오기) 예전 자리에
  // 있던 타워가 길 한복판에 남는다(사용자 신고: "타워가 길로 내려왔잖아").
  // 놓을 수 있는 칸이 없어진 타워는 가장 가까운 빈 칸으로 옮긴다 —
  // 지어 둔 타워를 잃지 않으면서 길 위에 걸터앉은 모양도 없앤다.
  const takenTiles = new Set();
  towers.forEach((tower) => {
    const tileX = parseInt(tower.el.style.left);
    const tileY = parseInt(tower.el.style.top);
    let matchingTile = placementTiles.find((t) => {
      const tX = parseInt(t.style.left);
      const tY = parseInt(t.style.top);
      return Math.abs(tX - tileX) < 10 && Math.abs(tY - tileY) < 10;
    });
    if (!matchingTile) {
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

  for (let i = 1; i < tower.level; i++) {
    tower.damage = Math.floor(tower.damage * 1.3);
    if (tower.dps) tower.dps = Math.floor(tower.dps * 1.25);
    tower.range = Math.floor(tower.range * 1.1);
    if (tower.cooldown) tower.cooldown = Math.floor(tower.cooldown * 0.95);
    if (tower.type === "multi-shot" && (i + 1) % 2 === 0) {
      tower.numTargets++;
    }
  }
  tower.rangeSq = tower.range * tower.range;

  // v6: 각성 단계 복원
  const savedAwaken = towerData.awaken || 0;
  for (let i = 0; i < savedAwaken; i++) simCore.applyTowerAwaken(tower);

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
  const deltaTime = rawDeltaTime * gameSpeed;

  // v5: 예외 1회로 루프가 영구 정지하지 않도록 — 재예약은 무조건 (finally)
  try {
    feedFrameTime(rawDeltaTime); // 저사양 런타임 감지
    if (!gamePaused) {
      // [NEW] 게임 루프의 핵심 업데이트 순서 변경
      updateSpatialGrid(); // 1. 몬스터 위치를 그리드에 업데이트
      updateWizard(deltaTime); // 2. 마법사 이동
      updateWizardCooldownVisual(timestamp);
      wizardAutoAttack(timestamp); // 3. 마법사 공격 (그리드 사용)
      updateTowers(timestamp, deltaTime); // 4. 타워 업데이트 (그리드 사용)
      updateProjectiles(deltaTime, timestamp); // 5. 발사체 이동
      updateMonsters(timestamp, deltaTime); // 6. 몬스터 이동 및 상태 업데이트
      updateEffects(timestamp, deltaTime); // 7. 각종 효과 업데이트
      updateDamageTexts(timestamp, deltaTime); // 8. 데미지 텍스트 업데이트
      if (particleSystem) particleSystem.update(deltaTime); // 8.5. [V2] 파티클 업데이트
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
function playfieldBounds() {
  const infoB = document
    .getElementById("info-bar")
    ?.getBoundingClientRect().bottom;
  const ctrlT = document
    .getElementById("control-bar")
    ?.getBoundingClientRect().top;
  const top = infoB > 0 ? Math.round(infoB) : 55;
  const bottom =
    ctrlT > 0 ? Math.round(ctrlT) : window.innerHeight - 60;
  return { top, bottom, height: Math.max(120, bottom - top) };
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
    if (gameRunning && gamePaused && !modalOpen && e.key.toLowerCase() === "p") {
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
      if (particleSystem && p.size >= 10 && (timestamp | 0) % 3 === 0)
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
        gameElements.gameCanvas.style.animation = "shake 0.5s";
        setTimeout(() => (gameElements.gameCanvas.style.animation = ""), 500);
        if (particleSystem) particleSystem.screenFlash("#ff3366", 200, 0.15);
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
        now, // v5.1: 걷기 애니메이션 시간
        phase: m.animPhase, // v5.1: 몬스터별 걷기 위상 (발맞춰 행진 방지)
        isElite: m.isElite, // v5: 엘리트 캔버스 링 (구 CSS 클래스는 미적용 상태였음)
        isShielded: !!m.statusEffects.shielded,
        isPoisoned: !!m.statusEffects.poisoned,
        isSlowed: !!m.statusEffects.slowed,
        isStunned: !!m.statusEffects.stunned,
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
    const elapsed = now - e.startTime;
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
  sfx.play("wave_start");
  const { startWaveBtn } = gameElements;
  waveInProgress = true;
  monstersSpawned = 0;
  waveStartTime = performance.now();
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
  const waveComposition = simCore.buildWaveComposition(currentWave, dailyRng);

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
  let spawnCount = 0;
  const spawnInterval = simCore.spawnIntervalMs(currentWave, gameSpeed);

  if (spawnIntervalId) clearInterval(spawnIntervalId);

  spawnIntervalId = setInterval(
    () => {
      if (gamePaused || !gameRunning) return;

      if (spawnCount < monstersInWave) {
        spawnMonster(waveComposition[spawnCount]);
        spawnCount++;
      } else {
        clearInterval(spawnIntervalId);
        spawnIntervalId = null;
      }
    },
    spawnInterval,
  );
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
    if (monster.isBoss) particleSystem.shockwave(monster.x, monster.y, 100);
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
  const newTowerStat = TOWER_STATS[newTowerType];

  setTimeout(() => {
    boxEl.remove();
    recreateTower({
      type: newTowerType,
      level: 1,
      tile: { x: tile.x, y: tile.y },
    });
    showUpgradeNotification(`✨ ${newTowerStat.name} 타워 획득! ✨`);
    sfx.play("powerup");
  }, 1000);
}

function getRandomTowerType(randomBoxType) {
  const TOWER_TIERS = {
    1: ["plus", "minus"],
    2: ["multiply", "divide", "ice", "poison"],
    3: [
      "stun",
      "meteor",
      "cannon",
      "skyDestroyer",
      "net",
      "laser",
      "multi-shot",
      "goldMine",
      "shredder",
      "repairStation",
    ],
    4: ["golden", "silver", "copper"],
    5: ["ultimate"],
    6: ["transcendent"],
  };

  const PROBABILITY = {
    random_cheap: [0.54, 0.29, 0.12, 0.03, 0.015, 0.005],
    random_medium: [0.235, 0.43, 0.23, 0.07, 0.025, 0.01],
    random_expensive: [0.03, 0.23, 0.46, 0.18, 0.07, 0.03],
  };

  const weights = PROBABILITY[randomBoxType];
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

  const tierPool = TOWER_TIERS[selectedTier];
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
    if (particleSystem) particleSystem.screenFlash("#ffd166", 400, 0.15);
    hideModal(gameElements.towerUpgradeSelector);
    gameElements.rangeIndicator.style.display = "none";
    updateFullUI();
    return;
  }
  const cost = simCore.towerUpgradeCost(tower);
  if (gold < cost) return showMessage("골드가 부족합니다!");
  gold -= cost;
  simCore.applyTowerUpgrade(tower);
  if (tower.type === "multi-shot" && tower.level % 2 === 0) {
    tower.numTargets++;
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

  let damage = source.damage;

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
          endTime: timestamp + tower.slow.duration,
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

  const nowPerf = performance.now();
  const spell = WIZARD_SPELLS[activeSpell];

  if (
    !spell ||
    (wizardCooldowns[activeSpell] && nowPerf < wizardCooldowns[activeSpell])
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

  wizardCooldowns[activeSpell] = nowPerf + spell.cooldown;

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
      particleSystem.screenFlash(fxColor, 350, 0.18);
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
        handleHit({ source: { damage: fireballDamage }, target: m }, nowPerf);
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
        handleHit({ source: { damage: frostNovaDamage }, target: m }, nowPerf);
        if (!m.isBoss)
          m.statusEffects.slowed = {
            factor: 0.1,
            endTime: nowPerf + spell.freezeDuration,
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
          nowPerf,
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
          handleHit({ source: { damage: teleportDamage }, target: m }, nowPerf),
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
        endTime: nowPerf + spell.duration,
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
        setTimeout(() => {
          createMagicEffect(strikePos.x, strikePos.y, spell.aoe, "magic-attack", 450);
          const hitSq = spell.aoe * spell.aoe;
          spatialGrid
            .getNearby(strikePos.x, strikePos.y, spell.aoe)
            .filter((m) => !m.isDead && getDistanceSq(strikePos, m) < hitSq)
            .forEach((m) =>
              handleHit({ source: { damage: meteorDamage }, target: m }, performance.now()),
            );
          if (particleSystem) particleSystem.explosion(strikePos.x, strikePos.y, "#ff8c42", 12);
        }, i * 220);
      }
      break;
    }

    case "timeStop": {
      // 전체 몬스터 정지
      sfx.play("frost");
      monsters.forEach((m) => {
        if (!m.isDead) {
          m.statusEffects.stunned = { endTime: nowPerf + spell.freezeDuration };
          createMagicEffect(m.x, m.y, 25, "time-warp-effect", 400);
        }
      });
      if (particleSystem) particleSystem.screenFlash("#66ccff", 350, 0.18);
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
            endTime: nowPerf + spell.slowDuration,
          };
        }
      });
      if (particleSystem) particleSystem.screenFlash("#ffe066", 400, 0.15);
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
        handleHit({ source: { damage: tornadoDamage }, target: m }, nowPerf);
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
        particleSystem.screenFlash("#ffffff", 500, 0.35);
      }
      const judgeNormal = Math.floor(spell.damage * damageMultiplier);
      const judgeBoss = Math.floor(spell.bossDamage * damageMultiplier);
      monsters.forEach((m) => {
        if (!m.isDead) {
          createMagicEffect(m.x, m.y, 30, "explosion-effect", 400);
          handleHit(
            { source: { damage: m.isBoss ? judgeBoss : judgeNormal }, target: m },
            nowPerf,
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
    startTime: performance.now(),
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

  // Filter out already-shown problems
  while (!problem && currentProblemSet.length > 0) {
    const candidate = currentProblemSet.pop();
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
      shuffleArray(currentProblemSet);
      problem = currentProblemSet.pop();
      if (problem) shownProblemIds.add(problem.q + "||" + problem.a);
    }
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
  const reviewBadge = document.getElementById("mathCombo");
  if (isReviewProblem && reviewBadge) {
    reviewBadge.textContent = isNoteReviewProblem
      ? "📒 지난 판 오답노트 복습! 맞히면 보너스 골드 +100"
      : "🔁 복습 문제! 이번엔 맞혀보자";
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
      // v6: 오답노트 복습 퀴즈 정답 — 보너스 골드 + 노트에서 제거
      if (isNoteReviewProblem && currentProblem) {
        totalGold += 100;
        learnLoop.clearFromNote(selectedDifficulty, currentProblem.q);
        showMessage("📒 오답노트 복습 성공! 보너스 +100골드");
      }
      // v5: 학습=화력 — 정답 시 마법 쿨다운 30% 감소
      learnLoop.recordCorrect(isReviewProblem);
      if (isReviewProblem)
        checkAchievements("review_correct", {
          reviewCleared: learnLoop.stats.reviewCleared,
        });
      const nowCd = performance.now();
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
        particleSystem.screenFlash("#00ff88", 300, 0.15);
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
    if (currentProblem)
      learnLoop.recordWrong(currentProblem, currentWave, isNoteReviewProblem);
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
    if (particleSystem) particleSystem.screenFlash("#ff3366", 400, 0.2);

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

  resultDiv.textContent = `⏰ 시간 초과! 정답은 ${correctAnswer} 입니다.`;
  resultDiv.style.color = "#ff8c00";

  // Penalty: same as wrong answer but slightly less harsh
  gold = Math.max(0, gold - 20);
  castleHealth = Math.max(0, castleHealth - 3);
  score = Math.max(0, score - 30);
  sfx.play("math_wrong");
  showMessage("시간 초과 페널티: 골드 -20, 성 체력 -3, 점수 -30!");

  comboSystem.break();
  updateComboDisplay();
  if (particleSystem) particleSystem.screenFlash("#ff8c00", 400, 0.2);

  checkGameOver();

  isForcedProgress = false;
  currentWave++;
  updateFullUI();
  setTimeout(() => {
    hideModal(gameElements.mathModal);
    resultDiv.textContent = "";
    gamePaused = false;
    startWave();
  }, 2500);
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

    // [V2] 웨이브 클리어 업적 체크
    const clearTime = (performance.now() - waveStartTime) / 1000;
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
    if (waveDamageTaken === 0 && castleHealth > 0) {
      castleHealth = Math.min(100, castleHealth + simCore.WAVE_CLEAR_HEAL);
      showMessage(`🛡️ 무피해 방어! 성 체력 +${simCore.WAVE_CLEAR_HEAL}`);
    }

    // [V2] Auto-save after each wave completion
    saveGame(true);

    // v5.1: 스테이지(5웨이브) 클리어 — 다음 스테이지 시작 스냅샷을 체크포인트로 보관.
    // 타워·골드·마법사 상태가 전부 스냅샷에 들어가므로 다음 스테이지에서도 그대로 유지되고,
    // 게임오버가 나도 이 체크포인트부터 다시 시작할 수 있다.
    if (currentWave % stageProgress.WAVES_PER_STAGE === 0) {
      const clearedStage = stageProgress.stageOfWave(currentWave);
      const snap = buildGameState();
      snap.currentWave = currentWave + 1;
      stageProgress.recordCheckpoint(selectedDifficulty, clearedStage + 1, snap);
      showMessage(
        `🏁 스테이지 ${clearedStage} 클리어! 진행 상황 저장 완료 — 언제든 이어서 할 수 있어요.`,
      );
      sfx.play("powerup");
      if (particleSystem) particleSystem.screenFlash("#ffd166", 500, 0.15);
    }

    showMathProblem();
  }
}

function checkGameOver() {
  if (castleHealth <= 0 && gameRunning) {
    gameRunning = false;
    if (spawnIntervalId) clearInterval(spawnIntervalId);
    localStorage.removeItem("towerDefenseSave");
    localStorage.removeItem("mathcastle:save");
    document.getElementById("finalScore").textContent = score;
    document.getElementById("finalWave").textContent = currentWave;
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
      const weakness = learnLoop.weaknessText();
      weakLine.textContent = weakness;
      weakLine.style.display = weakness ? "block" : "none";

      // v6: 오답노트 — 이번 판 틀린 문제 + 풀이 힌트 복습 (localStorage 저장 → 다음 판 복습 퀴즈)
      learnLoop.saveWrongNote(selectedDifficulty);
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
          `<div style="color:#ffd166;font-weight:700;margin-bottom:6px;">📒 오답노트 (${wrongs.length}문제) — 다음 판 시작 때 복습 퀴즈로 나와요</div>` +
          wrongs
            .slice(0, 8)
            .map(
              (w) =>
                `<div style="margin-bottom:6px;"><b>${ui.formatMath(w.q)}</b><br><span style="color:#8ee08e;">💡 ${learnLoop.getSolutionHint(w.q, w.a)}</span></div>`,
            )
            .join("") +
          (wrongs.length > 8 ? `<div style="color:#889;">…외 ${wrongs.length - 8}문제</div>` : "");
      } else {
        noteBox.style.display = "block";
        noteBox.innerHTML = `<div style="color:#8ee08e;">🎉 이번 판은 틀린 문제가 없어요! 완벽!</div>`;
      }
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

    showModal(gameElements.gameOverModal);
  }
}

function forceNextWave(isFromError = false) {
  if (!isFromError && (!waveInProgress || gamePaused)) {
    return showMessage("다음 웨이브로 강제 진행할 수 없습니다.");
  }
  sfx.play("blip");

  isForcedProgress = true;

  if (spawnIntervalId) {
    clearInterval(spawnIntervalId);
    spawnIntervalId = null;
  }

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

  const playerName = prompt(
    "랭킹에 등록할 이름을 입력하세요 (10자 이내):",
    "익명",
  );
  if (playerName === null) {
    showMessage("랭킹 등록이 취소되었습니다.");
    return;
  }

  const finalPlayerName = playerName.trim() || "익명";

  try {
    learnLoop.saveWrongNote(selectedDifficulty); // v6: 종료 전 오답노트 저장
    await submitScore(finalPlayerName, score, currentWave, selectedDifficulty);

    gameRunning = false;
    if (spawnIntervalId) clearInterval(spawnIntervalId);
    localStorage.removeItem("towerDefenseSave");
    localStorage.removeItem("mathcastle:save");

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
  window.addEventListener("resize", debouncedRegenerateLayout);
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
  document
    .getElementById("submitScoreBtn")
    .addEventListener("click", async () => {
      const nameInput = document.getElementById("playerNameInput");
      const playerName = (nameInput ? nameInput.value.trim() : "") || "익명";
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
    const cost = 150 * wizardLevel;
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
  };
  ui.updateUI(currentState);
}

function adjustPerfTimers(duration) {
  if (duration <= 0) return;

  towers.forEach((t) => {
    if (t.cooldownUntil > 0) t.cooldownUntil += duration;
    if (t.disabledUntil > 0) t.disabledUntil += duration;
    if (t.timeWarpedUntil > 0) t.timeWarpedUntil += duration;
  });

  if (WIZARD_AUTO_ATTACK_STATS.cooldownUntil > 0) {
    WIZARD_AUTO_ATTACK_STATS.cooldownUntil += duration;
  }

  for (const spell in wizardCooldowns) {
    if (wizardCooldowns[spell] > 0) {
      wizardCooldowns[spell] += duration;
    }
  }

  monsters.forEach((m) => {
    if (m.lastHealTime > 0) m.lastHealTime += duration;
    if (m.lastShieldTime > 0) m.lastShieldTime += duration;
    if (m.lastSummonTime > 0) m.lastSummonTime += duration;
    if (m.lastTeleportTime > 0) m.lastTeleportTime += duration;
    if (m.lastDisruptTime > 0) m.lastDisruptTime += duration;
    if (m.lastTimeWarpTime > 0) m.lastTimeWarpTime += duration;
    if (m.lastStealthTime > 0) m.lastStealthTime += duration;
    if (m.stealthEndTime > 0) m.stealthEndTime += duration;
    if (m.lastPoisonTick > 0) m.lastPoisonTick += duration;

    for (const effect in m.statusEffects) {
      if (m.statusEffects[effect].endTime > 0) {
        m.statusEffects[effect].endTime += duration;
      }
    }
  });

  effects.forEach((e) => {
    if (e.lastTick > 0) e.lastTick += duration;
    if (e.endTime > 0) e.endTime += duration;
  });
}

function togglePause() {
  sfx.play("blip");
  gamePaused = !gamePaused;
  document.getElementById("pauseBtn").textContent = gamePaused
    ? "▶️"
    : "⏸️ 일시정지";

  if (gamePaused) {
    pauseStartTimePerf = performance.now();
    // 일시정지 중엔 게임 루프가 멈춰 updateTileFocus/updateActionHint가 아예 호출되지 않는다
    // → 여기서 직접 지우지 않으면 하이라이트와 힌트가 화면에 그대로 남는다
    clearTileFocus();
    updateActionHint();
  } else {
    if (pauseStartTimePerf > 0) {
      const pauseDurationPerf = performance.now() - pauseStartTimePerf;
      adjustPerfTimers(pauseDurationPerf);
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
  gameSpeed = 1;
  shownProblemIds = new Set();
  activeSpell = "fireball";
  totalKillCount = 0;
  totalBossKills = 0;
  totalTowersBuilt = 0;
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
function buildGameState() {
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
    })),
    // --- Extended save data ---
    activeSpell,
    maxCombo: comboSystem.maxCombo || 0,
    currentCombo: comboSystem.getCombo(),
    totalKillCount,
    totalBossKills,
    totalTowersBuilt,
    achievementProgress: achievementSystem
      .getAll()
      .filter((a) => a.unlocked)
      .map((a) => a.id),
    problemSetIndex: currentProblemSet.length,
    shownProblemIds: shownProblemIds ? [...shownProblemIds] : [],
    gameSpeed,
  };
}

function saveGame(silent = false) {
  const gameState = buildGameState();

  // v5: 게임ID 네임스페이스 + 버전 래퍼 (마이그레이션 체인용)
  localStorage.setItem(
    "mathcastle:save",
    JSON.stringify({ version: 6, data: gameState }),
  );
  localStorage.removeItem("towerDefenseSave"); // 구 키 정리
  if (!silent) {
    showMessage("게임이 저장되었습니다!");
    sfx.play("blip");
  }
}
