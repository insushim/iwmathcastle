// firebase.js - Cloudflare D1 API로 교체
import { showMessage } from "./utils.js";
import * as ui from "./ui.js";

const API_BASE = "/api";

export function initializeFirebase(onAuthReadyCallback) {
  // D1은 인증 불필요 - 바로 준비 상태
  onAuthReadyCallback(true);
}

export async function submitScore(playerName, score, wave, difficulty) {
  if (!playerName || !playerName.trim()) {
    showMessage("이름을 입력해주세요!");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/submit-score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: playerName.trim(),
        score,
        wave,
        difficulty,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      showMessage(data.error || "점수 등록에 실패했습니다.");
      return;
    }

    if (data.enteredHof) {
      showMessage("명예의 전당에 등극했습니다! 🏆");
    } else {
      showMessage("점수가 등록되었습니다!");
    }

    document.getElementById("submitScoreBtn").disabled = true;
    ui.hideGameOverModal();
    await fetchAndShowRankings();
  } catch (e) {
    console.error("점수 등록 오류:", e);
    showMessage("점수 등록에 실패했습니다.");
  }
}

export async function fetchAndShowRankings() {
  ui.showRankingModal(true);

  try {
    const res = await fetch(`${API_BASE}/rankings`);
    const data = await res.json();

    if (!res.ok) {
      showMessage("랭킹을 불러오는데 실패했습니다.");
      return;
    }

    const nextUpdate = new Date(data.nextUpdateTime);
    ui.displayRankings(data.hallOfFame, data.today, data.yesterday, nextUpdate);
  } catch (e) {
    console.error("랭킹 조회 오류:", e);
    showMessage("랭킹을 불러오는데 실패했습니다. 잠시 후 다시 시도해주세요.");
  }
}
