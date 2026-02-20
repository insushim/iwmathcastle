// ui.js

// 파일 분리에 따른 import 구문 수정
import { gameElements } from './constants.js';
import { TOWER_STATS } from './gameData.js';
import { hideModal, showModal, showMessage } from './utils.js';

const isMobile = /Mobi/i.test(window.navigator.userAgent);
let buildStepCallback = null;
let rankingUpdateInterval = null;

export function initializeUI(callback) {
    buildStepCallback = callback;
}

export function updateUI(state) {
    document.getElementById('castleHealth').textContent = state.castleHealth;
    document.getElementById('currentWave').textContent = state.currentWave;
    document.getElementById('monstersLeft').textContent = `${state.monsters.length}/${state.monstersInWave}`;
    document.getElementById('gold').textContent = state.gold;
    document.getElementById('score').textContent = state.score;
    document.getElementById('wizardLevel').textContent = state.wizardLevel;
    document.getElementById('upgradeWizardBtn').disabled = state.gold < (150 * state.wizardLevel);
}

export function showDifficultySelector() {
    const { gameOverModal, gameCanvas, gameUI, difficultyModal } = gameElements;
    hideModal(gameOverModal);
    gameCanvas.style.display = 'none';
    gameUI.style.display = 'none';
    difficultyModal.style.display = 'flex';
    if (localStorage.getItem('towerDefenseSave')) {
        document.getElementById('loadGameBtn').disabled = false;
    } else {
        document.getElementById('loadGameBtn').disabled = true;
    }
}

export async function showTowerSelector(x, y, sfx) {
    const { towerSelector, gameCanvas } = gameElements;
    await sfx.init();
    towerSelector.innerHTML = '';
    const container = document.createElement('div');
    container.className = 'tower-options-container';

    for (const key in TOWER_STATS) {
        const towerStat = TOWER_STATS[key];
        if (towerStat.cost <= 0 && !towerStat.isRandom) continue;
        if (towerStat.cost <= 0 && towerStat.name.includes("수호자")) continue; // 궁극, 초월 타워는 목록에서 제외
        
        const option = document.createElement('div');
        option.className = 'tower-option';
        option.dataset.towerType = key;
        option.innerHTML = `<div class="tower-option-symbol">${towerStat.symbol}</div><div class="tower-option-cost">${towerStat.cost}G</div>`;
        
        if (towerStat.targetType === 'air') {
            const airLabel = document.createElement('div');
            airLabel.className = 'tower-option-air-label';
            airLabel.textContent = '✈️';
            option.appendChild(airLabel);
        }

        const handleSelect = (e) => {
            e.stopPropagation();
            e.preventDefault();
            buildStepCallback('select', e.currentTarget.dataset.towerType, e);
        };
        option.addEventListener('click', handleSelect);
        option.addEventListener('touchend', handleSelect);
        if (!isMobile) {
            option.addEventListener('mouseover', e => showTowerInfoTooltip(towerStat, e.clientX, e.clientY));
            option.addEventListener('mouseout', hideTowerInfoTooltip);
        }
        container.appendChild(option);
    }
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'control-btn cancel-build-btn';
    cancelBtn.textContent = '취소';
    const handleCancel = (e) => { e.stopPropagation(); e.preventDefault(); buildStepCallback('reset'); };
    cancelBtn.addEventListener('click', handleCancel);
    cancelBtn.addEventListener('touchend', handleCancel);

    towerSelector.appendChild(container);
    towerSelector.appendChild(cancelBtn);
    
    towerSelector.style.visibility = 'hidden';
    towerSelector.classList.add('show');
    
    const canvasRect = gameCanvas.getBoundingClientRect();
    const selectorRect = towerSelector.getBoundingClientRect();

    const tileCenterX = canvasRect.left + x + 20;
    const tileCenterY = canvasRect.top + y + 20;

    let finalX = tileCenterX - (selectorRect.width / 2);
    
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
    towerSelector.style.visibility = 'visible';
}

export function showTowerUpgradeSelector(tower, gold, upgradeCallback, sellCallback) {
    const { towerUpgradeSelector, rangeIndicator } = gameElements;
    const infoDiv = document.getElementById('towerInfo');
    const upgradeBtn = document.getElementById('upgradeTowerBtn');
    const sellBtn = document.getElementById('sellTowerBtn');
    const baseCost = (tower.cost === 0 || tower.type === 'ultimate' || tower.type === 'transcendent') ? 350 : tower.cost;
    const cost = Math.floor(baseCost * (tower.level + 1) * 1.1);
    
    infoDiv.innerHTML = `<b>${tower.name} (레벨 ${tower.level})</b><br>데미지: ${tower.damage || (tower.dps + ' DPS')}<br>사거리: ${tower.range}<br>${tower.type === 'multi-shot' ? '동시 공격: ' + tower.numTargets + '<br>' : ''}공격 속도: ${tower.cooldown ? (tower.cooldown / 1000) + '초' : '연속'}`;
    
    if (tower.level >= 10) {
        upgradeBtn.textContent = `최대 레벨`;
        upgradeBtn.disabled = true;
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
    rangeIndicator.style.display = 'block';

    showModal(towerUpgradeSelector);
}

export function showMathProblemUI(problem, options, answerCallback) {
    document.getElementById('mathQuestion').textContent = problem.q;
    const optionsContainer = document.getElementById('mathOptions');
    optionsContainer.innerHTML = '';
    
    options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'math-option';
        btn.textContent = opt;
        btn.onclick = () => answerCallback(opt, btn);
        optionsContainer.appendChild(btn);
    });
    showModal(gameElements.mathModal);
}

export function showTowerInfoTooltip(towerData, x, y) {
    const { tooltip } = gameElements;
    let data = towerData;
    if (!data) {
        const tile = document.elementFromPoint(x, y);
        if (tile && tile.classList.contains('tower-option')) {
            data = TOWER_STATS[tile.dataset.towerType];
        } else {
            hideTowerInfoTooltip();
            return;
        }
    }
    if (!data) return;

    const range = isMobile ? (data.range * 1.05).toFixed(0) : data.range;
    let special = '';
    if (data.slow) special += `둔화: ${(data.slow.factor) * 100}% `;
    if (data.poison) special += `중독: ${data.poison.dps} DPS `;
    if (data.stun) special += `기절: ${data.stun.chance * 100}% 확률 `;
    if (data.splashRadius) special += `범위 공격: ${data.splashRadius}px`;

    tooltip.innerHTML = `
        <b>${data.name}</b> ${data.level ? `(L${data.level})` : ''}<br>
        비용: ${data.cost}G<br>
        데미지: ${data.damage || (data.dps ? data.dps + ' DPS' : 'N/A')}<br>
        사거리: ${range}<br>
        대상: ${data.targetType === 'air' ? '공중' : data.targetType === 'all' ? '모두' : '지상'}<br>
        ${special ? `특수: ${special.trim()}` : ''}
    `;
    
    tooltip.style.display = 'block';
    tooltip.style.left = `${x + 15}px`;
    tooltip.style.top = `${y + 15}px`;
}

export function hideTowerInfoTooltip() {
    if (gameElements.tooltip) {
        gameElements.tooltip.style.display = 'none';
    }
}

export function toggleFullScreen() {
    const gameContentEl = gameElements.gameContent;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (gameContentEl.requestFullscreen) gameContentEl.requestFullscreen().catch(err => showMessage(`전체화면 오류: ${err.message}`));
        else if (gameContentEl.webkitRequestFullscreen) gameContentEl.webkitRequestFullscreen();
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
    return `⏰ ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} 후 새 랭킹 시작`;
}

function updateRankingTimer(nextUpdateTime) {
    const timerEl = document.getElementById('ranking-timer');
    if (!timerEl) return;
    
    if (rankingUpdateInterval) clearInterval(rankingUpdateInterval);

    rankingUpdateInterval = setInterval(() => {
        const now = new Date();
        const diff = nextUpdateTime.getTime() - now.getTime();
        timerEl.innerHTML = `📅 현재: ${now.toLocaleDateString()} ${now.toLocaleTimeString()} | ${formatTimeDifference(diff)}`;
    }, 1000);
}

function populateRankingList(listElement, scores, limit, emptyMessage) {
    listElement.innerHTML = "";
    if (scores.length === 0) {
        listElement.innerHTML = `<li>${emptyMessage}</li>`;
    } else {
        scores.slice(0, limit).forEach((data, index) => {
            const li = document.createElement('li');
            const difficultyText = data.difficulty ? ` / ${data.difficulty}학년` : '';
            li.innerHTML = `<span>${index + 1}. ${data.name}</span> <span>${data.score}점 (W${data.wave}${difficultyText})</span>`;
            listElement.appendChild(li);
        });
    }
}

export function displayRankings(hallOfFameScores, todayScores, yesterdayScores, nextUpdateTime) {
    const hofList = document.getElementById('hallOfFame');
    const todayList = document.getElementById('todayRankingList');
    const yesterdayList = document.getElementById('yesterdayRankingList');

    hofList.innerHTML = "";
    if (hallOfFameScores.length > 0) {
        const medal = ['🥇', '🥈', '🥉', '🏅', '🏅'];
        hallOfFameScores.slice(0, 5).forEach((data, index) => {
            const entry = document.createElement('div');
            entry.className = 'fame-entry';
            const difficultyText = data.difficulty ? ` (${data.difficulty}학년)` : '';
            entry.innerHTML = `${medal[index]} ${data.name}: ${data.score}점 (W${data.wave})${difficultyText}`;
            hofList.appendChild(entry);
        });
    } else {
        hofList.innerHTML = "<div class='fame-entry'>명예의 전당이 비어있습니다.</div>";
    }

    const now = new Date();
    const rankingDate = new Date(now.getTime() - (8 * 60 * 60 * 1000 + 50 * 60 * 1000));
    const isNewDay = now.toISOString().split('T')[0] === rankingDate.toISOString().split('T')[0];
    const todayEmptyMessage = isNewDay ? "오늘의 랭커가 아직 없습니다!" : "오전 8:50부터 새로운 랭킹이 시작됩니다!";
    
    populateRankingList(todayList, todayScores, 50, todayEmptyMessage);
    populateRankingList(yesterdayList, yesterdayScores, 50, "어제의 랭킹 데이터가 없습니다.");

    updateRankingTimer(nextUpdateTime);
}

export function showRankingModal(isLoading = false) {
    const { difficultyModal, rankingModal } = gameElements;
    difficultyModal.style.display = 'none';
    
    if (isLoading) {
        document.getElementById('hallOfFame').innerHTML = "불러오는 중...";
        document.getElementById('todayRankingList').innerHTML = "<li>불러오는 중...</li>";
        document.getElementById('yesterdayRankingList').innerHTML = "<li>불러오는 중...</li>";
        document.getElementById('ranking-timer').innerHTML = "시간 정보 로딩 중...";
    }
    
    showModal(rankingModal);
}

export function hideGameOverModal() {
    hideModal(gameElements.gameOverModal);
}