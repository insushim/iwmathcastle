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
    // 🔴 방금 내 점수가 서버에 들어갔다 — 캐시를 반드시 버린다(grok 교차검증 지적).
    //    안 버리면 등록 직후 뜨는 랭킹이 최대 15초 전 것이라 **내 점수가 없다.**
    //    아이가 가장 확인하고 싶은 순간에 없는 것으로 보인다.
    invalidateRankingCache();
    await fetchAndShowRankings();
  } catch (e) {
    console.error("랭킹 표시 오류:", e);
  }
  return true;
}

// ---------- v10: 랭킹 조회는 한 곳으로 ----------
// 첫 화면 상주 패널과 「전체 보기」 모달이 같은 `/api/rankings` 를 쓴다. 각자 fetch 하면
// 메뉴에 들어오자마자 전체 보기를 누른 아이가 같은 응답을 두 번 받는다 — 진행 중인 요청이
// 있으면 그 약속을 같이 쓰고(inflight 공유), 방금 받은 것은 짧게 재사용한다.
// 시계는 performance.now() 를 쓴다 — 시스템 시각이 뒤로 가면 경과가 음수가 되어
// 「아직 신선함」으로 영원히 통과한다(codex 교차검증 지적). 이건 단조 증가한다.
const monoNow = () =>
  typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();

const RANK_FETCH_TIMEOUT_MS = 12e3;
let rankCache = { at: -Infinity, data: null };
let rankInFlight = null;
// 🔴 **세대**(2R codex·grok 공통 지적). inflight 공유만 두면 이런 일이 난다:
//    폴링이 T 에 요청을 띄운다 → T+0.1초에 아이가 점수를 등록한다 → 캐시를 비워도
//    「진행 중인 요청」이 있으니 그 약속에 합류한다 → **등록 전 순위**가 돌아오고,
//    그게 새 시각으로 캐시에 다시 박힌다. 무효화가 아무 일도 못 한 셈이다.
//    세대가 다른 응답은 재사용하지도, 캐시에 쓰지도 않는다.
let rankGeneration = 0;
let rankInFlightGen = -1;

export async function fetchRankings({ maxAgeMs = 0 } = {}) {
  if (rankCache.data && maxAgeMs > 0 && monoNow() - rankCache.at < maxAgeMs) {
    return rankCache.data;
  }
  if (rankInFlight && rankInFlightGen === rankGeneration) return rankInFlight;

  const gen = rankGeneration;
  const p = (async () => {
    // 제한시간이 없으면 응답 없는 요청 하나가 rankInFlight 를 영구 점유해
    // 이후 폴링과 모달 재시도가 **전부** 멈춘다(codex 교차검증 지적).
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), RANK_FETCH_TIMEOUT_MS);
    let res, raw;
    try {
      res = await fetch(`${API_BASE}/rankings`, { signal: ac.signal });
      raw = await res.json();
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(raw?.error || `HTTP ${res.status}`);
    const data = {
      hallOfFame: raw.hallOfFame || [],
      today: raw.today || [],
      yesterday: raw.yesterday || [],
      week: raw.week || [],
      month: raw.month || [],
      nextUpdateTime: new Date(raw.nextUpdateTime),
    };
    // 내가 뜬 뒤에 무효화가 지나갔다면 이 응답은 이미 낡았다 — 캐시에 쓰지 않는다.
    if (gen === rankGeneration) rankCache = { at: monoNow(), data };
    return data;
  })();

  rankInFlight = p;
  rankInFlightGen = gen;
  try {
    return await p;
  } finally {
    // 나보다 새 요청이 자리를 잡았으면 그것을 지우면 안 된다
    if (rankInFlight === p) {
      rankInFlight = null;
      rankInFlightGen = -1;
    }
  }
}

// 점수가 서버에 들어갔으면 캐시는 그 순간 낡은 것이다.
// ⚠️ data 는 **남긴다**(2R codex 지적) — 시각만 만료시킨다. 다음 조회가 실패했을 때
//    보여 줄 것이 사라져 멀쩡히 보이던 순위가 오류 안내로 바뀌기 때문이다.
export function invalidateRankingCache() {
  rankGeneration += 1;
  rankCache = { at: -Infinity, data: rankCache.data };
  rankInFlight = null; // 낡은 세대의 요청에 합류하지 않는다
  rankInFlightGen = -1;
  // ⓘ 버려진 요청을 abort 하지 **않는다**(3R codex 지적을 검토 후 기각).
  //   ① 위의 12초 제한시간이 수명을 이미 묶는다 ② 무효화는 점수 등록 성공 때만 일어나고
  //   서버가 이름당 분 3회로 제한한다 → 겹쳐야 3개 ③ abort 하면 마침 열려 있던
  //   「전체 보기」 요청이 취소되어 **아무 문제 없는데 실패 안내**가 뜬다.
  //   버려진 요청은 응답이 와도 세대가 달라 캐시에 못 쓴다 — 조용히 사라진다.
}

// 첫 화면 상주 패널 전용 — 실패해도 **조용히** 접는다.
// 랭킹을 못 불러온 것이 게임을 못 하는 이유가 되면 안 된다(오프라인·file:// 포함).
export async function refreshRankingPanel({ maxAgeMs = 0 } = {}) {
  try {
    ui.renderRankingPanel(await fetchRankings({ maxAgeMs }));
  } catch (e) {
    console.error("랭킹 패널 조회 오류:", e);
    // 한 번 실패했다고 멀쩡히 보이던 순위를 지우지 않는다(grok 교차검증 지적).
    // 패널은 늘 떠 있어서, 잠깐의 끊김에 비우면 최대 한 주기(90초) 동안 빈 채로 남는다.
    if (rankCache.data) ui.renderRankingPanel(rankCache.data);
    else ui.renderRankingPanelError();
  }
}

export async function fetchAndShowRankings() {
  ui.showRankingModal(true);

  try {
    // 방금 패널이 받아 둔 것이 있으면 그대로 쓴다(모달을 여는 데 15초 넘게 걸리진 않는다)
    const data = await fetchRankings({ maxAgeMs: 15e3 });
    ui.displayRankings(data);
    ui.renderRankingPanel(data); // 패널도 같은 데이터로 맞춘다
  } catch (e) {
    console.error("랭킹 조회 오류:", e);
    showMessage("랭킹을 불러오는데 실패했습니다. 잠시 후 다시 시도해주세요.");
  }
}
