// firebase.js - Cloudflare D1 API 클라이언트 (v6: 세션 토큰 + 일간·주간·월간 랭킹)
import { showMessage } from "./utils.js";
import * as ui from "./ui.js";

const API_BASE = "/api";

export function initializeFirebase(onAuthReadyCallback) {
  // D1은 인증 불필요 - 바로 준비 상태
  onAuthReadyCallback(true);
}

// ---------- v6: 게임 세션 토큰 (치트 방어 — 서버가 최소 플레이 시간 검증) ----------
let sessionToken = null;
let sessionRetryTimer = null;
// 이어하기 대응: 이 세션에서 실제로 진행한 웨이브 수를 서버에 알려 최소 플레이 시간을 계산한다.
// (총 웨이브로 계산하면 W15 세이브를 불러와 곧 사망한 정상 기록이 거절된다 — 교차검증 지적)
let sessionBaseWave = 1;

export function startGameSession(baseWave = 1) {
  sessionBaseWave = Number.isFinite(baseWave) && baseWave >= 1 ? baseWave : 1;
  // 게임 시작 시 발급. 실패하면 30초 간격 재시도(최대 20회) — 플레이 중 회복되면
  // 토큰 나이가 실플레이 시간과 비슷해져 제출 시 최소시간 검증을 자연 통과한다.
  // (교차검증 수정: 구버전은 제출 직전 재발급 → 최소시간 미달로 100% 거절되던 폴백)
  sessionToken = null;
  if (sessionRetryTimer) clearTimeout(sessionRetryTimer);
  let attempts = 0;
  const tryFetch = () => {
    fetch(`${API_BASE}/session`, { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (data.token) sessionToken = data.token;
        else throw new Error("no token");
      })
      .catch(() => {
        // 로컬 file:// 등 API 없는 환경에서도 게임은 동작
        if (++attempts < 20) sessionRetryTimer = setTimeout(tryFetch, 30e3);
      });
  };
  tryFetch();
}

// 실패하면 반드시 throw 한다 — 호출측(main.js)이 성공으로 오인해 이어하기 세이브를
// 지워버리면 정상 플레이 기록이 그대로 증발하기 때문(교차검증 지적).
export async function submitScore(playerName, score, wave, difficulty) {
  if (!playerName || !playerName.trim()) {
    showMessage("이름을 입력해주세요!");
    throw new Error("이름 없음");
  }

  let data;
  try {
    // 토큰이 없으면(시작 이후 계속 네트워크 실패) 지금 발급받고, 서버 최소시간이 채워질
    // 시간을 안내 — 방금 발급된 토큰으로 즉시 제출하면 서버가 반드시 거절하기 때문.
    if (!sessionToken) {
      const r = await fetch(`${API_BASE}/session`, { method: "POST" });
      const d = await r.json();
      if (d.token) {
        sessionToken = d.token;
        sessionBaseWave = wave; // 지금부터가 이 토큰의 세션 — 최소 대기 20초
        showMessage(
          "네트워크 연결을 다시 확인했어요. 20초 뒤에 '점수 등록'을 다시 눌러주세요!",
        );
      }
      throw new Error("세션 토큰 재발급 — 잠시 후 재시도 필요");
    }

    const res = await fetch(`${API_BASE}/submit-score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: playerName.trim(),
        score,
        wave,
        difficulty,
        token: sessionToken,
        sessionWaves: Math.max(1, wave - sessionBaseWave + 1),
      }),
    });

    data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.shown = true;
      showMessage(data.error || "점수 등록에 실패했습니다.");
      throw err;
    }
    sessionToken = null; // 1회용 토큰 소진
  } catch (e) {
    console.error("점수 등록 오류:", e);
    if (!e.shown) showMessage("점수 등록에 실패했습니다.");
    throw e;
  }

  // 여기부터는 등록 성공 — UI 갱신이 실패해도 기록은 이미 서버에 있으므로 throw 하지 않는다
  if (data.enteredHof) {
    showMessage("명예의 전당에 등극했습니다! 🏆");
  } else {
    showMessage("점수가 등록되었습니다!");
  }
  try {
    document.getElementById("submitScoreBtn").disabled = true;
    ui.hideGameOverModal();
    await fetchAndShowRankings();
  } catch (e) {
    console.error("랭킹 표시 오류:", e);
  }
  return true;
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

    ui.displayRankings({
      hallOfFame: data.hallOfFame || [],
      today: data.today || [],
      yesterday: data.yesterday || [],
      week: data.week || [],
      month: data.month || [],
      nextUpdateTime: new Date(data.nextUpdateTime),
    });
  } catch (e) {
    console.error("랭킹 조회 오류:", e);
    showMessage("랭킹을 불러오는데 실패했습니다. 잠시 후 다시 시도해주세요.");
  }
}
