// main.js - V2 Upgraded

import { gameElements } from "./constants.js";
import {
  TOWER_STATS,
  MONSTER_STATS,
  WIZARD_SPELLS,
  WIZARD_AUTO_ATTACK_STATS,
} from "./gameData.js";
import { mathProblems } from "./problems.js";
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
      this.grid[i] = [];
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
    const nearbyMonsters = new Set(); // 중복 방지를 위해 Set 사용
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
        if (this.grid[index].length > 0) {
          for (const monster of this.grid[index]) {
            // 그리드 셀에 있는 몬스터를 Set에 추가
            nearbyMonsters.add(monster);
          }
        }
      }
    }

    // Set을 배열로 변환하여 반환
    return Array.from(nearbyMonsters);
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
let placementTiles = [];
let pauseStartTimePerf = 0;

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
    menuParticleCtx.globalAlpha = p.alpha;
    menuParticleCtx.fillStyle = p.color;
    menuParticleCtx.shadowBlur = 10;
    menuParticleCtx.shadowColor = p.color;
    menuParticleCtx.beginPath();
    menuParticleCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    menuParticleCtx.fill();
  }
  // 연결선
  menuParticleCtx.shadowBlur = 0;
  for (let i = 0; i < menuParticles.length; i++) {
    for (let j = i + 1; j < menuParticles.length; j++) {
      const dx = menuParticles[i].x - menuParticles[j].x;
      const dy = menuParticles[i].y - menuParticles[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 120) {
        menuParticleCtx.globalAlpha = (1 - dist / 120) * 0.15;
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
  numEl.textContent = waveNum;
  el.classList.remove("hidden");
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "waveAnnounce 2s ease-out forwards";
  setTimeout(() => el.classList.add("hidden"), 2200);
}

// --- [V2] 설정 모달 ---
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
  categorizeAnswers();
  ui.initializeUI(handleBuildStep);

  initializeFirebase((isReady) => {
    document.getElementById("showRankingBtn").disabled = !isReady;
  });

  // [V2] 메뉴 파티클 & 음악
  initMenuParticles();
  setupSettingsModal();
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

function initializeGame(difficulty, savedState = null) {
  const {
    difficultyModal,
    gameCanvas,
    gameUI,
    startWaveBtn,
    dynamicLayerCanvas,
  } = gameElements;
  gameInitialized = true;
  selectedDifficulty = difficulty;
  difficultyModal.style.display = "none";
  gameCanvas.style.display = "block";
  gameUI.style.display = "block";

  safeCleanupAllElements();

  ((towers = []),
    (monsters = []),
    (projectiles = []),
    (effects = []),
    (damageTexts = []));
  ((gold = 300), (score = 0), (castleHealth = 100), (currentWave = 1));
  ((monstersInWave = 10), (monstersSpawned = 0), (wizardLevel = 1));
  wizardPosition = { x: 100, y: 200 };
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

  // [V2] 메뉴 파티클 중지 & 게임플레이 음악 시작
  stopMenuParticles();
  musicSystem.init();
  musicSystem.play("gameplay");
  musicSystem.setIntensity(0.3);

  // [V2] 게임 통계 초기화
  totalKillCount = 0;
  totalBossKills = 0;
  totalTowersBuilt = 0;
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
  startWaveBtn.textContent = "🚀 시작";

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
  createPlacementTiles();
  positionCastle();

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

  towers.forEach((tower) => {
    const tileX = parseInt(tower.el.style.left);
    const tileY = parseInt(tower.el.style.top);
    const matchingTile = placementTiles.find((t) => {
      const tX = parseInt(t.style.left);
      const tY = parseInt(t.style.top);
      return Math.abs(tX - tileX) < 10 && Math.abs(tY - tileY) < 10;
    });
    if (matchingTile) {
      matchingTile.style.display = "none";
    }
  });
}
const debouncedRegenerateLayout = debounce(regenerateLayout, 250);

function generatePath() {
  const { gameCanvas } = gameElements;
  pathPoints = [];
  const pathWidth = 50;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // HUD 여백 확보 (상단 info-bar, 하단 control-bar)
  const topMargin = 55;
  const bottomMargin = 60;
  const playTop = topMargin;
  const playBottom = vh - bottomMargin;
  const playH = playBottom - playTop;

  const points = [
    { x: vw - 10, y: playTop + playH * 0.85 },
    { x: vw * 0.2, y: playTop + playH * 0.85 },
    { x: vw * 0.2, y: playTop + playH * 0.42 },
    { x: vw * 0.8, y: playTop + playH * 0.42 },
    { x: vw * 0.8, y: playTop + playH * 0.05 + pathWidth / 2 },
    { x: 70, y: playTop + playH * 0.05 + pathWidth / 2 },
  ];

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const segment = document.createElement("div");
    segment.className = "path";
    const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const angle = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
    segment.style.width = `${length}px`;
    segment.style.height = `${pathWidth}px`;
    segment.style.left = `${p1.x}px`;
    segment.style.top = `${p1.y - pathWidth / 2}px`;
    segment.style.transformOrigin = "left center";
    segment.style.transform = `rotate(${angle}deg)`;
    gameCanvas.appendChild(segment);
    for (let j = 0; j < length; j += 5) {
      const ratio = j / length;
      pathPoints.push({
        x: p1.x + (p2.x - p1.x) * ratio,
        y: p1.y + (p2.y - p1.y) * ratio,
      });
    }
  }
  pathPoints.push(points[points.length - 1]);
}

function positionCastle() {
  if (pathPoints.length > 0) {
    const { castleEl } = gameElements;
    const lastPoint = pathPoints[pathPoints.length - 1];
    const castleHeight = 100;
    castleCoords = {
      x: Math.max(10, lastPoint.x),
      y: Math.max(10, lastPoint.y - castleHeight / 2),
    };
    castleEl.style.left = `${castleCoords.x}px`;
    castleEl.style.top = `${castleCoords.y}px`;
  }
}

function createPlacementTiles() {
  const { gameCanvas } = gameElements;
  placementTiles.forEach((tile) => tile.remove());
  placementTiles = [];
  const tileSize = 40,
    gap = 10,
    castleBuffer = 120,
    pathBuffer = 50,
    pathBufferSq = pathBuffer * pathBuffer;
  const castleBufferSq = castleBuffer * castleBuffer;

  for (let y = gap; y < window.innerHeight - tileSize; y += tileSize + gap) {
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
    }
  }
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

  tower.el.className = `tower tower-${tower.type}`;
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

  updateFullUI();
}

// --- 게임 루프 및 업데이트 ---
function gameLoop(timestamp) {
  if (!gameRunning) {
    gameLoop.isRunning = false;
    return;
  }
  if (!lastFrameTime) lastFrameTime = timestamp;
  const deltaTime = timestamp - lastFrameTime;
  lastFrameTime = timestamp;

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
  requestAnimationFrame(gameLoop);
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
  if (isDraggingWizard) return;
  let dx = 0,
    dy = 0;
  if (keysPressed["w"] || keysPressed["W"] || keysPressed["ArrowUp"]) dy -= 1;
  if (keysPressed["s"] || keysPressed["S"] || keysPressed["ArrowDown"]) dy += 1;
  if (keysPressed["a"] || keysPressed["A"] || keysPressed["ArrowLeft"]) dx -= 1;
  if (keysPressed["d"] || keysPressed["D"] || keysPressed["ArrowRight"])
    dx += 1;

  // [V2] 마법사 스프라이트 방향 및 애니메이션 업데이트
  wizardSprite.setDirection(dx, dy);
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
      // [V2] 발사체 트레일
      if (particleSystem && p.size >= 10)
        particleSystem.trail(p.x, p.y, p.color);
    }
  }
}

function updateMonsters(timestamp, deltaTime) {
  for (let i = monsters.length - 1; i >= 0; i--) {
    const monster = monsters[i];
    if (monster.isDead) {
      if (monster.el && monster.el.parentNode) monster.el.remove();
      monsters.splice(i, 1);
      continue;
    }
    if (!monster.el) continue;

    for (const effect in monster.statusEffects) {
      if (timestamp >= monster.statusEffects[effect].endTime) {
        delete monster.statusEffects[effect];
      }
    }

    let isStunned = false;
    monster.currentSpeed = monster.baseSpeed;

    monster.el.classList.remove(
      "slowed",
      "stunned",
      "poisoned",
      "shielded",
      "shredded",
    );
    monster.el.classList.toggle("stealthed", monster.isStealthed);

    if (monster.statusEffects.slowed) {
      monster.currentSpeed *= monster.statusEffects.slowed.factor;
      monster.el.classList.add("slowed");
    }
    if (monster.statusEffects.stunned) {
      isStunned = true;
      monster.el.classList.add("stunned");
    }
    if (monster.statusEffects.shredded) {
      monster.el.classList.add("shredded");
    }
    if (monster.statusEffects.shielded) {
      monster.el.classList.add("shielded");
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
      monster.el.classList.add("poisoned");
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
        castleHealth -= 15;
        waveDamageTaken += 15;
        score = Math.max(0, score - 75);
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
        const roundedX = Math.round(monster.x - monster.size / 2);
        const roundedY = Math.round(monster.y - monster.size / 2);
        monster.el.style.transform = `translate(${roundedX}px, ${roundedY}px)`;

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

    if (monster.healthBar) {
      monster.healthBar.style.width = `${(monster.hp / monster.maxHp) * 100}%`;
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

function renderDynamicLayer() {
  if (!dynamicCtx) return;
  const canvas = dynamicCtx.canvas;
  const now = performance.now();
  dynamicCtx.clearRect(0, 0, canvas.width, canvas.height);

  // [V2] 캐슬 캔버스 렌더링
  if (castleCoords.x != null) {
    const cx = castleCoords.x - castleRenderer.width / 2 + 50;
    const cy = castleCoords.y - castleRenderer.height + 100;
    castleRenderer.render(dynamicCtx, cx, cy, castleHealth, 100, now);
  }

  // [V3] 타워 캔버스 렌더링
  for (const t of towers) {
    towerRenderer.render(dynamicCtx, t.type, t.x, t.y, t.level, now);
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
        isShielded: !!m.statusEffects.shielded,
        isPoisoned: !!m.statusEffects.poisoned,
        isSlowed: !!m.statusEffects.slowed,
        isStunned: !!m.statusEffects.stunned,
      },
    );
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
    dynamicCtx.font = 'bold 16px "Do Hyeon"';
    dynamicCtx.fillStyle = color;
    dynamicCtx.strokeStyle = "black";
    dynamicCtx.lineWidth = 3;
    dynamicCtx.strokeText(dt.text, dt.x, dt.y);
    dynamicCtx.fillText(dt.text, dt.x, dt.y);
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
  sfx.play("blip");
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

  // [수정] 몬스터 수를 점진적으로 늘리되, 최대 60마리로 제한하여 성능 저하 방지
  monstersInWave = Math.min(60, 10 + Math.floor(currentWave * 1.5));

  let waveComposition = [];
  const highTierBosses = ["ancientDragon", "voidLord", "titanGolem"];
  const midTierBosses = ["archfiend", "boss"];

  if (currentWave > 0 && currentWave % 20 === 0) {
    waveComposition.push("finalBoss");
    for (let i = 0; i < monstersInWave - 1; i++) waveComposition.push("tank");
  } else if (currentWave > 0 && currentWave % 8 === 0) {
    // [수정] 상급 보스 출현 주기 단축 (10 -> 8)
    const bossIndex =
      Math.floor((currentWave / 8 - 1) / 2) % highTierBosses.length;
    waveComposition.push(highTierBosses[bossIndex]);
    for (let i = 0; i < monstersInWave - 1; i++)
      waveComposition.push("general");
  } else if (currentWave > 0 && currentWave % 4 === 0) {
    // [수정] 중급 보스 출현 주기 단축 (5 -> 4)
    const midBossIndex =
      Math.floor((currentWave / 4 - 1) / 2) % midTierBosses.length;
    waveComposition.push(midTierBosses[midBossIndex]);
    for (let i = 0; i < monstersInWave - 1; i++)
      waveComposition.push("shielder");
  } else {
    for (let i = 0; i < monstersInWave; i++)
      waveComposition.push(getMonsterTypeForNormalWave(currentWave));
  }

  shuffleArray(waveComposition);

  startWaveBtn.disabled = true;
  startWaveBtn.textContent = `🌊...`;
  let spawnCount = 0;
  const spawnInterval = 1000 - currentWave * 8;

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
    Math.max(150, spawnInterval),
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

  // [수정] 웨이브에 따라 몬스터의 능력치(HP, 골드)를 강화하는 로직
  // 기본 배율: 웨이브가 진행될수록 점차 강해짐
  let waveHpMultiplier = 1 + currentWave * 0.2;
  // 추가 배율: 특정 웨이브 구간을 넘어서면 더욱 가파르게 강해짐
  if (currentWave > 20) {
    waveHpMultiplier += (currentWave - 20) * 0.1;
  }
  if (currentWave > 40) {
    waveHpMultiplier += (currentWave - 40) * 0.15;
  }

  const difficultyHpMultiplier = 1 + selectedDifficulty * 0.15;
  const finalHpMultiplier = waveHpMultiplier * difficultyHpMultiplier;

  const maxHp = Math.floor(stats.hp * (isSpecialSpawn ? 1 : finalHpMultiplier));

  // [추가] 골드 보상도 웨이브에 따라 증가
  const goldMultiplier = 1 + currentWave / 8;
  const goldReward = Math.ceil(
    stats.gold * (isSpecialSpawn ? 1 : goldMultiplier),
  );

  const monster = {
    ...stats,
    id: Date.now() + Math.random(),
    monsterKey,
    maxHp,
    hp: maxHp,
    gold: goldReward, // [변경] 강화된 골드 보상 적용
    isDead: false,
    isStealthed: false,
    baseSpeed: stats.speed,
    currentSpeed: stats.speed,
    x: position ? position.x : pathPoints[0].x,
    y: position ? position.y : pathPoints[0].y,
    pathIndex: position
      ? pathPoints.findIndex((p) => getDistanceSq(p, position) < 25) || 0
      : 0,
    el: document.createElement("div"),
    healthBar: document.createElement("div"),
    statusEffects: {},
    direction: 0,
    animFrame: 0,
    animTimer: 0,
    prevX: 0,
    prevY: 0,
    defenseAuraSq: (stats.defenseAuraRadius || 0) ** 2,
    healRadiusSq: (stats.healRadius || 0) ** 2,
    shieldRadiusSq: (stats.shieldRadius || 0) ** 2,
  };

  monster.el.className = `monster monster-${monsterKey}`;
  const size = stats.size || 30;
  monster.el.style.width = `${size}px`;
  monster.el.style.height = `${size}px`;
  const roundedX = Math.round(monster.x - size / 2);
  const roundedY = Math.round(monster.y - size / 2);
  monster.el.style.transform = `translate(${roundedX}px, ${roundedY}px)`;
  const healthContainer = document.createElement("div");
  healthContainer.className = "monster-health";
  monster.healthBar.className = "monster-health-bar";
  healthContainer.appendChild(monster.healthBar);
  monster.el.appendChild(healthContainer);
  gameCanvas.appendChild(monster.el);
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

function getMonsterTypeForNormalWave(wave) {
  const pool = [{ type: "normal", weight: 100 }];
  if (wave > 1) pool.push({ type: "speed", weight: 30 });
  if (wave > 2) {
    pool.push({ type: "bat", weight: 25 });
    pool.push({ type: "collector", weight: 15 });
  }
  if (wave > 3) pool.push({ type: "tank", weight: 20 });
  if (wave > 4) {
    pool.push({ type: "shielder", weight: 15 });
    pool.push({ type: "leech", weight: 10 });
    pool.push({ type: "healer", weight: 12 }); // [수정] 힐러 몬스터 등장 로직 추가
  }
  if (wave > 5) pool.push({ type: "dragon", weight: 8 });
  if (wave > 6) {
    pool.push({ type: "teleporter", weight: 12 });
    pool.push({ type: "mirage", weight: 10 });
  }
  if (wave > 7) pool.push({ type: "ghost", weight: 10 });
  if (wave > 8) {
    pool.push({ type: "splitter", weight: 10 });
    pool.push({ type: "chronomancer", weight: 8 });
  }
  if (wave > 9) pool.push({ type: "disruptor", weight: 6 });
  if (wave > 10) {
    pool.push({ type: "mimic", weight: 5 });
    pool.push({ type: "golem", weight: 5 });
  }
  if (wave > 11) pool.push({ type: "summoner", weight: 8 });
  if (wave > 12) pool.push({ type: "assassin", weight: 8 });
  if (wave > 13) pool.push({ type: "general", weight: 4 });
  if (wave > 14) pool.push({ type: "plaguebearer", weight: 8 });

  const totalWeight = pool.reduce((sum, monster) => sum + monster.weight, 0);
  let random = Math.random() * totalWeight;

  for (const monster of pool) {
    if (random < monster.weight) return monster.type;
    random -= monster.weight;
  }
  return "normal";
}

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
  sfx.play("blip");
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
  if (!tower || tower.level >= 10) return;
  const baseCost =
    tower.cost === 0 ||
    tower.type === "ultimate" ||
    tower.type === "transcendent"
      ? 350
      : tower.cost;
  const cost = baseCost * (tower.level + 1);
  if (gold < cost) return showMessage("골드가 부족합니다!");
  gold -= cost;
  tower.level++;
  tower.damage = Math.floor(tower.damage * 1.3);
  if (tower.dps) tower.dps = Math.floor(tower.dps * 1.25);
  tower.range = Math.floor(tower.range * 1.1);
  tower.rangeSq = tower.range * tower.range;
  if (tower.cooldown) tower.cooldown = Math.floor(tower.cooldown * 0.95);
  if (tower.type === "multi-shot" && tower.level % 2 === 0) {
    tower.numTargets++;
    showUpgradeNotification(
      `멀티샷 타워가 이제 ${tower.numTargets}명의 적을 동시 공격합니다!`,
    );
  }
  if (tower.levelIndicator) tower.levelIndicator.textContent = tower.level;
  sfx.play("powerup");
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
  if (matchingTile) matchingTile.style.display = "block";
  if (tower.laserBeam) tower.laserBeam.remove();
  tower.el.remove();
  towers = towers.filter((t) => t.id !== tower.id);
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
  if (matchingTile) matchingTile.style.display = "block";
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
    size: 8,
    color: "#FFFFFF",
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
    monster.el.classList.remove("shielded");
    createDamageText(monster, "Block", "magic");
    return;
  }

  let damage = source.damage;

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
  sfx.play("hit");
  createDamageText(
    monster,
    damage.toFixed(0),
    source.type === "laser-damage"
      ? "laser"
      : source.type === "poison"
        ? "poison"
        : "normal",
  );

  if (monster.hp <= 0) handleMonsterDeath(monster, timestamp);
  updateFullUI();
}

// --- 마법사 관리 ---
function wizardAutoAttack(timestamp) {
  if (timestamp < (WIZARD_AUTO_ATTACK_STATS.cooldownUntil || 0)) return;

  const wizardEl = gameElements.wizardEl;
  const wizardCenterX = wizardPosition.x + wizardEl.offsetWidth / 2;
  const wizardCenterY = wizardPosition.y + wizardEl.offsetHeight / 2;
  const wizardCenter = { x: wizardCenterX, y: wizardCenterY };

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
    createProjectile(
      { ...wizardCenter, damage: WIZARD_AUTO_ATTACK_STATS.damage },
      bestTarget,
    );
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
  const damageMultiplier = 1 + levelBonus * 0.2;

  const wizardEl = gameElements.wizardEl;
  const wizardCenterX = wizardPosition.x + wizardEl.offsetWidth / 2;
  const wizardCenterY = wizardPosition.y + wizardEl.offsetHeight / 2;
  const wizardCenter = { x: wizardCenterX, y: wizardCenterY };

  let spellOrigin = spell.aoe > 0 && clickPos ? clickPos : wizardCenter;
  const aoeSq = spell.aoe * spell.aoe;

  // [MODIFIED] 스킬 효과 적용 시 공간 그리드를 사용하여 효율적으로 대상 탐색
  const affectedMonsters = spatialGrid
    .getNearby(spellOrigin.x, spellOrigin.y, spell.aoe)
    .filter((m) => !m.isDead && getDistanceSq(spellOrigin, m) < aoeSq);

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
        Math.min(window.innerWidth - wizardEl.offsetWidth, wizardPosition.x),
      );
      wizardPosition.y = Math.max(
        0,
        Math.min(window.innerHeight - wizardEl.offsetHeight, wizardPosition.y),
      );
      gameElements.wizardEl.style.transform = `translate(${Math.round(wizardPosition.x)}px, ${Math.round(wizardPosition.y)}px)`;

      sfx.play("blip");
      const newWizardCenter = {
        x: wizardPosition.x + wizardEl.offsetWidth / 2,
        y: wizardPosition.y + wizardEl.offsetHeight / 2,
      };
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
  }
}

// CSS 클래스명 → Canvas 스펠 타입 매핑
const SPELL_CLASS_MAP = {
  "fireball-effect": "fireball",
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
function showMathProblem() {
  gamePaused = true;
  problemAnswered = false;
  if (currentProblemSet.length === 0) {
    currentProblemSet = [...mathProblems[selectedDifficulty]];
    shuffleArray(currentProblemSet);
    showMessage("새로운 문제 세트가 로드되었습니다!");
  }
  let problem = currentProblemSet.pop();

  if (!problem) {
    currentProblemSet = [...mathProblems[selectedDifficulty]];
    shuffleArray(currentProblemSet);
    problem = currentProblemSet.pop();
    if (!problem) {
      console.error("Failed to load problem. Forcing next wave.");
      forceNextWave(true);
      return;
    }
  }

  correctAnswer = problem.a;
  const wrongOptions = generateWrongAnswers(correctAnswer);
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

  ui.showMathProblemUI(problem, options, checkAnswer);
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

  const optionsContainer = document.getElementById("mathOptions");
  const resultDiv = document.getElementById("mathResult");
  const isCorrect = String(answer) === String(correctAnswer);

  optionsContainer.querySelectorAll(".math-option").forEach((btn) => {
    btn.disabled = true;
    if (String(btn.textContent) === String(correctAnswer)) {
      btn.classList.add("correct");
    } else {
      btn.classList.add("faded");
    }
  });

  if (isCorrect) {
    if (isForcedProgress) {
      resultDiv.textContent = `정답! 하지만 강제 진행으로 보상은 없습니다.`;
      resultDiv.style.color = "#2ecc71";
      sfx.play("blip");
    } else {
      // [V2] 콤보 시스템 적용
      const comboResult = comboSystem.addCorrect();
      const baseGold = 150 + currentWave * 10;
      const totalGold =
        Math.floor(baseGold * comboResult.multiplier) + comboResult.bonusGold;
      resultDiv.textContent = `정답! 💰 +${totalGold} 골드${comboResult.combo >= 3 ? ` (${comboResult.combo}x 콤보!)` : ""}`;
      resultDiv.style.color = "#00ff88";
      gold += totalGold;
      score += 100 * comboResult.multiplier;
      sfx.play("powerup");
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
    resultDiv.textContent = `오답! 정답은 ${correctAnswer} 입니다.`;
    resultDiv.style.color = "#ff3366";
    gold = Math.max(0, gold - 30);
    castleHealth = Math.max(0, castleHealth - 5);
    score = Math.max(0, score - 50);
    deleteWeakestTower();
    sfx.play("hit");
    showMessage("오답으로 인한 페널티: 골드 -30, 성 체력 -5, 점수 -50!");

    // [V2] 콤보 브레이크 + 화면 플래시
    comboSystem.break();
    updateComboDisplay();
    if (particleSystem) particleSystem.screenFlash("#ff3366", 400, 0.2);

    checkGameOver();
  }

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
    gameElements.startWaveBtn.textContent = "🚀 시작";

    // [V2] 웨이브 클리어 업적 체크
    const clearTime = (performance.now() - waveStartTime) / 1000;
    checkAchievements("wave_clear", {
      wave: currentWave,
      clearTime,
      damageTaken: waveDamageTaken,
    });

    // 보스 웨이브 클리어 후 음악 복귀
    if (musicSystem.currentTrack === "boss") {
      musicSystem.play("gameplay");
    }

    showMathProblem();
  }
}

function checkGameOver() {
  if (castleHealth <= 0 && gameRunning) {
    gameRunning = false;
    if (spawnIntervalId) clearInterval(spawnIntervalId);
    localStorage.removeItem("towerDefenseSave");
    document.getElementById("finalScore").textContent = score;
    document.getElementById("finalWave").textContent = currentWave;
    const finalComboEl = document.getElementById("finalCombo");
    if (finalComboEl) finalComboEl.textContent = comboSystem.maxCombo || 0;

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
    if (m.el && m.el.parentNode) m.el.remove();
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
    gameElements.startWaveBtn.textContent = "🚀 시작";
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
    await submitScore(finalPlayerName, score, currentWave, selectedDifficulty);

    gameRunning = false;
    if (spawnIntervalId) clearInterval(spawnIntervalId);
    localStorage.removeItem("towerDefenseSave");

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
  const savedGameJSON = localStorage.getItem("towerDefenseSave");
  if (savedGameJSON) {
    const savedState = JSON.parse(savedGameJSON);
    initializeGame(savedState.difficulty, savedState);
  } else {
    showMessage("저장된 게임이 없습니다.");
  }
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
      initializeGame(e.currentTarget.dataset.difficulty);
    }),
  );
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
    .addEventListener("click", () =>
      submitScore(
        document.getElementById("playerNameInput").value,
        score,
        currentWave,
        selectedDifficulty,
      ),
    );
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
      sfx.init().then(() => sfx.play("powerup"));
      populateSpellbook();
      updateFullUI();
    } else {
      showMessage("골드가 부족합니다!");
    }
  });

  gameElements.gameCanvas.addEventListener("click", handleCanvasClick);
  window.addEventListener("keydown", (e) => {
    keysPressed[e.key] = true;
    if (e.code === "Space" && gameRunning && !gamePaused) {
      e.preventDefault();
      handleWizardAttack();
    }
  });
  window.addEventListener("keyup", (e) => {
    delete keysPressed[e.key];
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
  } else {
    if (pauseStartTimePerf > 0) {
      const pauseDurationPerf = performance.now() - pauseStartTimePerf;
      adjustPerfTimers(pauseDurationPerf);
      lastFrameTime = performance.now();
      pauseStartTimePerf = 0;
    }
  }
}

function restartGame() {
  hideModal(gameElements.gameOverModal);
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
  const tile = e.currentTarget;
  const x = parseInt(tile.style.left);
  const y = parseInt(tile.style.top);
  if (pendingTile && (pendingTile.x !== x || pendingTile.y !== y))
    resetBuildProcess();
  pendingTile = { x, y };
  buildStep = "selecting_tower";
  ui.showTowerSelector(x, y, sfx);
  if (isMobile) ui.showTowerInfoTooltip(null, x, y);
}

function handleBuildStep(action, type, event) {
  if (action === "reset") {
    resetBuildProcess();
  } else if (action === "select") {
    const currentTowerType = type;
    if (
      buildStep === "confirming_build" &&
      pendingTowerType === currentTowerType
    ) {
      placeTower(currentTowerType);
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
function saveGame() {
  const gameState = {
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
      tile: {
        x: parseInt(tower.el.style.left),
        y: parseInt(tower.el.style.top),
      },
    })),
  };

  localStorage.setItem("towerDefenseSave", JSON.stringify(gameState));
  showMessage("게임이 저장되었습니다!");
  sfx.play("blip");
}
