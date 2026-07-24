// constants.js

/**
 * 터치 기기 판정. UA의 /Mobi/ 만 보면 **데스크톱 UA를 쓰는 태블릿**(iPad 데스크톱 모드 등)을
 * 놓쳐서, hover가 없는 기기인데 hover 전제 UI(1클릭 즉시 건설)를 태우게 된다(교차검증 지적).
 * "hover가 실제로 되는 기기인가"를 같이 본다.
 */
export const isTouchLike =
  /Mobi/i.test(navigator.userAgent) ||
  !(window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches ?? true);

export const gameElements = {
  gameContent: document.getElementById("game-content"),
  gameCanvas: document.getElementById("gameCanvas"),
  dynamicLayerCanvas: document.getElementById("dynamicLayerCanvas"),
  gameUI: document.getElementById("gameUI"),
  difficultyModal: document.getElementById("difficultyModal"),
  castleEl: document.querySelector(".castle"),
  wizardEl: document.getElementById("wizard"),
  rangeIndicator: document.getElementById("rangeIndicator"),
  towerSelector: document.getElementById("towerSelector"),
  towerUpgradeSelector: document.getElementById("towerUpgradeSelector"),
  mathModal: document.getElementById("mathModal"),
  gameOverModal: document.getElementById("gameOverModal"),
  rankingModal: document.getElementById("rankingModal"),
  startWaveBtn: document.getElementById("startWaveBtn"),
  tooltip: document.getElementById("tower-info-tooltip"),
  // [V2] 새 요소들
  achievementModal: document.getElementById("achievementModal"),
  settingsModal: document.getElementById("settingsModal"),
  comboDisplay: document.getElementById("combo-display"),
  waveAnnounce: document.getElementById("wave-announce"),
  // UX: 상황별 조작 힌트 + 게임 방법 안내
  actionHint: document.getElementById("action-hint"),
  howToPlayModal: document.getElementById("howToPlayModal"),
};
