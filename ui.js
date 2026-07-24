// ui.js

// 파일 분리에 따른 import 구문 수정
import { gameElements } from "./constants.js";
import { TOWER_STATS } from "./gameData.js";
import * as simCore from "./simCore.js";
import { hideModal, showModal, showMessage } from "./utils.js";
import { stageOfWave, waveInStage } from "./stageProgress.js";
import { getSprite } from "./spriteAssets.js";

const isMobile = /Mobi/i.test(window.navigator.userAgent);
let buildStepCallback = null;
let rankingUpdateInterval = null;

// Track previous values for animated number transitions
let prevGold = 100;
let prevScore = 0;

export function initializeUI(callback) {
  buildStepCallback = callback;
}

/**
 * Determine tower tier by cost for color coding
 */
function getTowerTier(key, towerStat) {
  if (towerStat.isRandom) return "random";
  if (key === "ultimate" || key === "transcendent") return "legendary";
  if (key === "golden") return "legendary";
  if (key === "silver" || key === "copper") return "epic";
  const cost = towerStat.cost;
  if (cost <= 100) return "common";
  if (cost <= 200) return "rare";
  if (cost <= 300) return "epic";
  return "legendary";
}

/**
 * Get tier color for dot indicator
 */
function getTierColor(tier) {
  switch (tier) {
    case "common":
      return "#4ade80";
    case "rare":
      return "#60a5fa";
    case "epic":
      return "#c084fc";
    case "legendary":
      return "#fbbf24";
    case "random":
      return "#a855f7";
    default:
      return "#94a3b8";
  }
}

/**
 * Animate a number value change (count up/down effect)
 */
function animateValue(element, start, end, duration = 400) {
  if (start === end) return;
  const range = end - start;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + range * eased);
    element.textContent = current;
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

/**
 * Trigger pulse animation on info item
 */
function triggerValueAnimation(element, isIncrease) {
  element.classList.remove("value-up", "value-down");
  // Force reflow
  void element.offsetWidth;
  element.classList.add(isIncrease ? "value-up" : "value-down");
  setTimeout(() => {
    element.classList.remove("value-up", "value-down");
  }, 500);
}

export function updateUI(state) {
  document.getElementById("castleHealth").textContent = state.castleHealth;
  // v5.1: 스테이지-웨이브 표기 (예: 2-3 = 스테이지 2의 3번째 웨이브)
  document.getElementById("currentWave").textContent =
    `${stageOfWave(state.currentWave)}-${waveInStage(state.currentWave)}`;
  document.getElementById("monstersLeft").textContent =
    `${state.monsters.length}/${state.monstersInWave}`;

  // Animated gold updates
  const goldEl = document.getElementById("gold");
  const newGold = state.gold;
  if (newGold !== prevGold) {
    animateValue(goldEl, prevGold, newGold, 300);
    triggerValueAnimation(goldEl, newGold > prevGold);
    // Pulse the gold info container
    const goldInfo = goldEl.closest(".gold-info");
    if (goldInfo) {
      goldInfo.classList.remove("pulse");
      void goldInfo.offsetWidth;
      goldInfo.classList.add("pulse");
    }
    prevGold = newGold;
  }

  // Animated score updates
  const scoreEl = document.getElementById("score");
  const newScore = state.score;
  if (newScore !== prevScore) {
    animateValue(scoreEl, prevScore, newScore, 400);
    triggerValueAnimation(scoreEl, newScore > prevScore);
    prevScore = newScore;
  }

  document.getElementById("wizardLevel").textContent = state.wizardLevel;
  document.getElementById("upgradeWizardBtn").disabled =
    state.gold < 150 * state.wizardLevel;

  // Update wave progress bar
  updateWaveProgress(state);
}

/**
 * Update the wave progress bar based on monsters killed
 */
function updateWaveProgress(state) {
  const progressBar = document.getElementById("waveProgressBar");
  if (!progressBar) return;

  if (state.monstersInWave > 0) {
    const killed = state.monstersInWave - state.monsters.length;
    const progress = Math.min((killed / state.monstersInWave) * 100, 100);
    progressBar.style.width = `${progress}%`;
  } else {
    progressBar.style.width = "0%";
  }
}

export function showDifficultySelector() {
  const { gameOverModal, gameCanvas, gameUI, difficultyModal } = gameElements;
  hideModal(gameOverModal);
  gameCanvas.style.display = "none";
  gameUI.style.display = "none";
  difficultyModal.style.display = "flex";
  // Reset tracked values
  prevGold = 100;
  prevScore = 0;
  // v5.1: 신 키(mathcastle:save) 우선 확인 — 구 키만 보던 버그 수정
  const hasSave =
    localStorage.getItem("mathcastle:save") ||
    localStorage.getItem("towerDefenseSave");
  document.getElementById("loadGameBtn").disabled = !hasSave;
}

export async function showTowerSelector(x, y, sfx) {
  const { towerSelector, gameCanvas } = gameElements;
  await sfx.init();
  towerSelector.innerHTML = "";
  const container = document.createElement("div");
  container.className = "tower-options-container";

  for (const key in TOWER_STATS) {
    const towerStat = TOWER_STATS[key];
    if (towerStat.cost <= 0 && !towerStat.isRandom) continue;
    if (towerStat.cost <= 0 && towerStat.name.includes("수호자")) continue;

    const tier = getTowerTier(key, towerStat);
    const option = document.createElement("div");
    option.className = "tower-option";
    option.dataset.towerType = key;
    option.dataset.tier = tier;

    // Tier dot indicator
    const tierDot = document.createElement("div");
    tierDot.className = "tower-option-tier-dot";
    tierDot.style.backgroundColor = getTierColor(tier);
    tierDot.style.boxShadow = `0 0 6px ${getTierColor(tier)}`;

    // v5.1: AI 타워 스프라이트 우선, 없으면 이모지 폴백 (multi-shot 등 스프라이트 미생성 타워)
    const towerSprite = getSprite(`tower_${key}`);
    const symbolHtml = towerSprite
      ? `<img class="tower-option-img" src="${towerSprite.src}" alt="${towerStat.name}">`
      : towerStat.symbol;
    option.innerHTML = `<div class="tower-option-symbol">${symbolHtml}</div><div class="tower-option-name">${towerStat.name}</div><div class="tower-option-cost">${towerStat.cost}G</div>`;
    option.appendChild(tierDot);

    if (towerStat.targetType === "air") {
      const airLabel = document.createElement("div");
      airLabel.className = "tower-option-air-label";
      airLabel.textContent = "✈️";
      option.appendChild(airLabel);
    }

    const handleSelect = (e) => {
      e.stopPropagation();
      e.preventDefault();
      buildStepCallback("select", e.currentTarget.dataset.towerType, e);
    };
    option.addEventListener("click", handleSelect);
    option.addEventListener("touchend", handleSelect);
    if (!isMobile) {
      option.addEventListener("mouseover", (e) =>
        showTowerInfoTooltip(towerStat, e.clientX, e.clientY),
      );
      option.addEventListener("mouseout", hideTowerInfoTooltip);
    }
    container.appendChild(option);
  }
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "cancel-build-btn";
  cancelBtn.textContent = "취소";
  const handleCancel = (e) => {
    e.stopPropagation();
    e.preventDefault();
    buildStepCallback("reset");
  };
  cancelBtn.addEventListener("click", handleCancel);
  cancelBtn.addEventListener("touchend", handleCancel);

  towerSelector.appendChild(container);
  towerSelector.appendChild(cancelBtn);

  towerSelector.style.visibility = "hidden";
  towerSelector.classList.add("show");

  const canvasRect = gameCanvas.getBoundingClientRect();
  const selectorRect = towerSelector.getBoundingClientRect();

  const tileCenterX = canvasRect.left + x + 20;
  const tileCenterY = canvasRect.top + y + 20;

  let finalX = tileCenterX - selectorRect.width / 2;

  if (finalX < 10) {
    finalX = 10;
  }
  if (finalX + selectorRect.width > window.innerWidth - 10) {
    finalX = window.innerWidth - selectorRect.width - 10;
  }

  let finalY = tileCenterY - selectorRect.height - 20;
  if (finalY < 10) {
    finalY = tileCenterY + 40;
  }

  towerSelector.style.left = `${finalX}px`;
  towerSelector.style.top = `${finalY}px`;
  towerSelector.style.visibility = "visible";
}

export function showTowerUpgradeSelector(
  tower,
  gold,
  upgradeCallback,
  sellCallback,
) {
  const { towerUpgradeSelector, rangeIndicator } = gameElements;
  const infoDiv = document.getElementById("towerInfo");
  const upgradeBtn = document.getElementById("upgradeTowerBtn");
  const sellBtn = document.getElementById("sellTowerBtn");
  const baseCost =
    tower.cost === 0 ||
    tower.type === "ultimate" ||
    tower.type === "transcendent"
      ? 350
      : tower.cost;
  const cost = Math.floor(baseCost * (tower.level + 1) * 1.1);

  // Calculate next level stats for comparison
  const nextDamage = tower.damage ? Math.floor(tower.damage * 1.15) : null;
  const nextDps = tower.dps ? Math.floor(tower.dps * 1.15) : null;
  const nextRange = Math.floor(tower.range * 1.05);

  const awaken = tower.awaken || 0;
  const awakenBadge = awaken > 0 ? ` <span style="color:#ffd166;">★${awaken}</span>` : "";
  let statsHtml = `<b>${tower.name}</b> <span style="color: var(--accent-cyan);">(Lv.${tower.level}${awakenBadge})</span><br>`;

  if (tower.level < 10) {
    if (tower.damage) {
      statsHtml += `데미지: ${tower.damage} <span class="stat-arrow">→</span> <span style="color:var(--accent-green)">${nextDamage}</span><br>`;
    } else if (tower.dps) {
      statsHtml += `DPS: ${tower.dps} <span class="stat-arrow">→</span> <span style="color:var(--accent-green)">${nextDps}</span><br>`;
    }
    statsHtml += `사거리: ${tower.range} <span class="stat-arrow">→</span> <span style="color:var(--accent-green)">${nextRange}</span><br>`;
  } else {
    statsHtml += `데미지: ${tower.damage || tower.dps + " DPS"}<br>`;
    statsHtml += `사거리: ${tower.range}<br>`;
  }

  if (tower.type === "multi-shot")
    statsHtml += `동시 공격: ${tower.numTargets}<br>`;
  statsHtml += `공격 속도: ${tower.cooldown ? tower.cooldown / 1000 + "초" : "연속"}`;

  infoDiv.innerHTML = statsHtml;

  if (tower.level >= 10) {
    // v6: 레벨 10 이후 각성 — 골드 대량 소모로 상위 티어 (최대 3단계)
    if (awaken < simCore.TOWER_MAX_AWAKEN) {
      const awakenCost = simCore.towerAwakenCost(tower);
      upgradeBtn.textContent = `✨ 각성 ${awaken + 1}단계 (${awakenCost}G)`;
      upgradeBtn.disabled = gold < awakenCost;
    } else {
      upgradeBtn.textContent = `최대 각성 (★${awaken})`;
      upgradeBtn.disabled = true;
    }
  } else {
    upgradeBtn.textContent = `업그레이드 (${cost}G)`;
    upgradeBtn.disabled = gold < cost;
  }

  sellBtn.textContent = `판매 (+${Math.floor(baseCost * tower.level * 0.4)}G)`;
  upgradeBtn.onclick = upgradeCallback;
  sellBtn.onclick = sellCallback;

  rangeIndicator.style.width = `${tower.range * 2}px`;
  rangeIndicator.style.height = `${tower.range * 2}px`;
  rangeIndicator.style.left = `${tower.x}px`;
  rangeIndicator.style.top = `${tower.y}px`;
  rangeIndicator.style.display = "block";

  showModal(towerUpgradeSelector);
}

// v5.6: 분수를 진짜 분수(위아래)로 표기. "a/b" → 세로 분수 HTML. 나머지는 그대로.
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function formatMath(str) {
  // 숫자/숫자 패턴을 세로 분수로 (예: 1/3, 19/63). 나눗셈 기호 ÷와 혼동 없음(÷는 별도).
  return escapeHtml(str).replace(
    /(\d+)\/(\d+)/g,
    (_, n, d) => `<span class="frac"><span class="frac-n">${n}</span><span class="frac-d">${d}</span></span>`,
  );
}

export function showMathProblemUI(problem, options, answerCallback) {
  document.getElementById("mathQuestion").innerHTML = formatMath(problem.q);
  const optionsContainer = document.getElementById("mathOptions");
  optionsContainer.innerHTML = "";

  options.forEach((opt, index) => {
    const btn = document.createElement("button");
    btn.className = "math-option";
    btn.innerHTML = formatMath(String(opt));
    btn.dataset.value = opt; // v5.6: 정답 판정은 raw 값으로 (분수 HTML은 textContent가 "13"이 됨)
    // Staggered animation
    btn.style.animation = `slideUp 0.3s ease-out ${index * 0.08}s backwards`;
    btn.onclick = () => answerCallback(opt, btn);
    optionsContainer.appendChild(btn);
  });
  showModal(gameElements.mathModal);

  const timerEl = document.getElementById("mathTimer");
  if (timerEl) timerEl.style.display = "block";
}

export function showTowerInfoTooltip(towerData, x, y) {
  const { tooltip } = gameElements;
  let data = towerData;
  if (!data) {
    const tile = document.elementFromPoint(x, y);
    if (tile && tile.classList.contains("tower-option")) {
      data = TOWER_STATS[tile.dataset.towerType];
    } else {
      hideTowerInfoTooltip();
      return;
    }
  }
  if (!data) return;

  const range = isMobile ? (data.range * 1.05).toFixed(0) : data.range;

  // Build structured tooltip
  let specialLines = [];
  if (data.slow) specialLines.push(`둔화 ${data.slow.factor * 100}%`);
  if (data.poison) specialLines.push(`중독 ${data.poison.dps} DPS`);
  if (data.stun) specialLines.push(`기절 ${data.stun.chance * 100}%`);
  if (data.splashRadius) specialLines.push(`범위 공격 ${data.splashRadius}px`);

  const targetText =
    data.targetType === "air"
      ? "공중"
      : data.targetType === "all"
        ? "모두"
        : "지상";

  tooltip.innerHTML = `
        <b>${data.name}</b> ${data.level ? `<span class="tooltip-stat">(Lv.${data.level})</span>` : ""}
        <div class="tooltip-divider"></div>
        <span class="tooltip-stat">비용:</span> ${data.cost}G<br>
        <span class="tooltip-stat">데미지:</span> ${data.damage || (data.dps ? data.dps + " DPS" : "N/A")}<br>
        <span class="tooltip-stat">사거리:</span> ${range}<br>
        <span class="tooltip-stat">대상:</span> ${targetText}
        ${specialLines.length > 0 ? `<div class="tooltip-divider"></div><span class="tooltip-special">${specialLines.join(" / ")}</span>` : ""}
    `;

  tooltip.style.display = "block";

  // Position with screen boundary check
  let tooltipX = x + 15;
  let tooltipY = y + 15;
  const tooltipRect = tooltip.getBoundingClientRect();
  if (tooltipX + tooltipRect.width > window.innerWidth - 10) {
    tooltipX = x - tooltipRect.width - 10;
  }
  if (tooltipY + tooltipRect.height > window.innerHeight - 10) {
    tooltipY = y - tooltipRect.height - 10;
  }

  tooltip.style.left = `${tooltipX}px`;
  tooltip.style.top = `${tooltipY}px`;
}

export function hideTowerInfoTooltip() {
  if (gameElements.tooltip) {
    gameElements.tooltip.style.display = "none";
  }
}

export function toggleFullScreen() {
  const gameContentEl = gameElements.gameContent;
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    if (gameContentEl.requestFullscreen)
      gameContentEl
        .requestFullscreen()
        .catch((err) => showMessage(`전체화면 오류: ${err.message}`));
    else if (gameContentEl.webkitRequestFullscreen)
      gameContentEl.webkitRequestFullscreen();
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
}

function formatTimeDifference(diff) {
  if (diff <= 0) {
    return "랭킹이 곧 갱신됩니다!";
  }
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")} 후 새 랭킹 시작`;
}

function updateRankingTimer(nextUpdateTime) {
  const timerEl = document.getElementById("ranking-timer");
  if (!timerEl) return;

  if (rankingUpdateInterval) clearInterval(rankingUpdateInterval);

  rankingUpdateInterval = setInterval(() => {
    const now = new Date();
    const diff = nextUpdateTime.getTime() - now.getTime();
    timerEl.innerHTML = `${now.toLocaleDateString()} ${now.toLocaleTimeString()} | ${formatTimeDifference(diff)}`;
  }, 1000);
}

// v6 교차검증 수정(codex): 랭킹 이름은 다른 사용자가 넣은 값 — innerHTML 직행은 저장형
// 마크업 삽입 경로다. 서버가 정규화·필터링해도 표시 단계에서 한 번 더 이스케이프한다.
function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function populateRankingList(listElement, scores, limit, emptyMessage) {
  listElement.innerHTML = "";
  if (scores.length === 0) {
    listElement.innerHTML = `<li>${emptyMessage}</li>`;
  } else {
    const medals = ["🥇", "🥈", "🥉"];
    scores.slice(0, limit).forEach((data, index) => {
      const li = document.createElement("li");
      const difficultyText = data.difficulty ? ` / ${difficultyBadge(data.difficulty)}` : "";
      const medal = index < 3 ? medals[index] + " " : "";
      li.innerHTML = `<span>${medal}${index + 1}. ${esc(data.name)}</span> <span>${Number(data.score) || 0}점 (W${Number(data.wave) || 0}${esc(difficultyText)})</span>`;
      listElement.appendChild(li);
    });
  }
}

// v5.1: 랭킹 학년 필터 — 마지막 데이터를 들고 있다가 탭 클릭 시 클라이언트에서 재렌더
let lastRankingData = null;
let rankingGradeFilter = 0; // 0 = 전체
let gradeFilterWired = false;

function filterByGrade(scores) {
  if (!rankingGradeFilter) return scores;
  // v6: 학기 표기("3-1")·구 학년 표기("3") 모두 학년 자리로 매칭
  return scores.filter((d) => parseInt(d.difficulty, 10) === rankingGradeFilter);
}

// v6: 난이도 표기 ("3-1" → "3-1", 구 "3" → "3학년")
function difficultyBadge(d) {
  if (!d) return "";
  return String(d).includes("-") ? String(d) : `${d}학년`;
}

function wireGradeFilter() {
  if (gradeFilterWired) return;
  const wrap = document.getElementById("gradeFilter");
  if (!wrap) return;
  gradeFilterWired = true;
  wrap.querySelectorAll(".gf-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      rankingGradeFilter = Number(btn.dataset.grade) || 0;
      wrap
        .querySelectorAll(".gf-btn")
        .forEach((b) => b.classList.toggle("active", b === btn));
      if (lastRankingData) renderRankings();
    }),
  );
}

// v6: 일간·주간·월간 — 객체 하나로 받는다 { hallOfFame, today, yesterday, week, month, nextUpdateTime }
export function displayRankings(data) {
  lastRankingData = data;
  wireGradeFilter();
  renderRankings();
}

function renderRankings() {
  const {
    hallOfFame: hallOfFameScores,
    today: todayScores,
    yesterday: yesterdayScores,
    week: weekScores = [],
    month: monthScores = [],
    nextUpdateTime,
  } = lastRankingData;
  const hofList = document.getElementById("hallOfFame");
  const todayList = document.getElementById("todayRankingList");
  const yesterdayList = document.getElementById("yesterdayRankingList");
  const weekList = document.getElementById("weekRankingList");
  const monthList = document.getElementById("monthRankingList");

  const hofFiltered = filterByGrade(hallOfFameScores);
  hofList.innerHTML = "";
  if (hofFiltered.length > 0) {
    const medal = ["🥇", "🥈", "🥉", "🏅", "🏅"];
    hofFiltered.slice(0, 5).forEach((data, index) => {
      const entry = document.createElement("div");
      entry.className = "fame-entry";
      const difficultyText = data.difficulty ? ` (${difficultyBadge(data.difficulty)})` : "";
      entry.innerHTML = `${medal[index]} ${esc(data.name)}: ${Number(data.score) || 0}점 (W${Number(data.wave) || 0})${esc(difficultyText)}`;
      hofList.appendChild(entry);
    });
  } else {
    hofList.innerHTML = rankingGradeFilter
      ? `<div class='fame-entry'>${rankingGradeFilter}학년 명예의 전당 기록이 없습니다.</div>`
      : "<div class='fame-entry'>명예의 전당이 비어있습니다.</div>";
  }

  // v6 교차검증 수정: KST(+9h) 변환 누락으로 UTC 8:50 기준이 되던 버그 — 서버 kstDayKey와 동일 로직
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 3600e3);
  const isAfterCut =
    kstNow.getUTCHours() * 60 + kstNow.getUTCMinutes() >= 8 * 60 + 50;
  const todayEmptyMessage = isAfterCut
    ? "오늘의 랭커가 아직 없습니다!"
    : "오전 8:50부터 새로운 랭킹이 시작됩니다!";

  populateRankingList(todayList, filterByGrade(todayScores), 50, todayEmptyMessage);
  populateRankingList(
    yesterdayList,
    filterByGrade(yesterdayScores),
    50,
    "어제의 랭킹 데이터가 없습니다.",
  );
  // v6: 주간·월간 (이름별 최고 기록)
  if (weekList)
    populateRankingList(weekList, filterByGrade(weekScores), 50, "이번 주 랭킹이 아직 없습니다!");
  if (monthList)
    populateRankingList(monthList, filterByGrade(monthScores), 50, "이번 달 랭킹이 아직 없습니다!");

  updateRankingTimer(nextUpdateTime);
}

export function showRankingModal(isLoading = false) {
  const { difficultyModal, rankingModal } = gameElements;
  difficultyModal.style.display = "none";

  if (isLoading) {
    document.getElementById("hallOfFame").innerHTML = "불러오는 중...";
    document.getElementById("todayRankingList").innerHTML =
      "<li>불러오는 중...</li>";
    document.getElementById("yesterdayRankingList").innerHTML =
      "<li>불러오는 중...</li>";
    document.getElementById("ranking-timer").innerHTML = "시간 정보 로딩 중...";
  }

  showModal(rankingModal);
}

export function hideGameOverModal() {
  hideModal(gameElements.gameOverModal);
}
