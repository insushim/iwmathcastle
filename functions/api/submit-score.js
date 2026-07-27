// POST /api/submit-score - 점수 등록 (v6: 일간·주간·월간 키 + 치트 방어 4중)
// 치트 방어: ① 점수 상한 공식 ② 세션 토큰 + 최소 플레이 시간 + 수명 캡 ③ IP 레이트 리밋 ④ 이름 필터
// 교차검증 수정(2026-07-24): 레이트리밋을 "INSERT 먼저 → COUNT" 순서로 요청 초입에 동기 실행
// (구현 전: 성공 응답 후 waitUntil INSERT → 동시요청 TOCTOU + 실패요청 미집계로 우회 가능했음)
// 교차검증 수정 2차(codex): NAT 형평성(이름별 3회 + IP 전체 40회), 이름 정규화 저장,
//   명예전당 경쟁조건, normalizeDifficulty null 거절, 이어하기 최소시간 오거절.
import {
  kstDayKey,
  weekKeyOf,
  monthKeyOf,
  maxScoreForWave,
  isGeneratedNick,
  normalizeName,
  normalizeDifficulty,
  hashIp,
} from "./_util.js";

// 세션 토큰 수명 캡: 사전 발급해 쌓아두는 우회의 효용 제한 (정상 플레이는 12시간 미만)
const TOKEN_MAX_AGE_MS = 12 * 3600e3;
// 레이트 리밋: 같은 이름은 분당 3회(도배 차단), 같은 IP 전체는 분당 40회
// (학교 NAT 공유 IP에서 한 학급이 동시에 끝내도 통과해야 한다 — 이름별 제한이 실제 방어선)
const RATE_PER_NAME = 3;
const RATE_PER_IP = 40;

export async function onRequestPost(context) {
  const { env, request } = context;
  const db = env.DB;

  try {
    const nowMs = Date.now();

    let body;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "유효하지 않은 요청입니다." }, { status: 400 });
    }
    const { name, score, wave, difficulty, token, sessionWaves } = body || {};

    // --- ④ 닉네임 화이트리스트 (DB 접근 전에 — CPU만 쓰는 검사를 먼저 통과시킨다) ---
    // v7: 자유 입력 폐지. nickname.js 목록으로 만들 수 있는 조합만 받는다.
    // 실명·욕설·사칭·마크업이 여기서 전부 걸린다(블랙리스트와 달리 우회 경로가 없다).
    if (!name || typeof name !== "string" || name.length > 10) {
      return Response.json({ error: "유효하지 않은 이름입니다." }, { status: 400 });
    }
    const cleanName = normalizeName(name).slice(0, 10);
    if (!isGeneratedNick(cleanName)) {
      return Response.json(
        { error: "닉네임이 올바르지 않습니다. 게임을 새로고침한 뒤 다시 등록해주세요." },
        { status: 400 },
      );
    }

    // --- ③ 레이트 리밋: 검증 성공/실패 무관하게 모든 시도를 집계 ---
    // 로그 키 = "IP해시|닉네임" 1행. 닉네임별은 동등 비교, 출처 전체는 접두 범위 스캔(인덱스 사용).
    // v7: IP 원문 대신 일자별 솔트 해시를 저장한다 (개인정보 최소화).
    const ip = await hashIp(request.headers.get("CF-Connecting-IP") || "unknown");
    const nameKey = `${ip}|${cleanName}`;
    await db
      .prepare("INSERT INTO submit_log (ip, ts) VALUES (?, ?)")
      .bind(nameKey, nowMs)
      .run();
    const [byName, byIp] = await Promise.all([
      db
        .prepare("SELECT COUNT(*) AS c FROM submit_log WHERE ip = ? AND ts > ?")
        .bind(nameKey, nowMs - 60e3)
        .first(),
      db
        .prepare(
          "SELECT COUNT(*) AS c FROM submit_log WHERE ip >= ? AND ip < ? AND ts > ?",
        )
        .bind(`${ip}|`, `${ip}|￿`, nowMs - 60e3)
        .first(),
    ]);
    if ((byName?.c || 0) > RATE_PER_NAME || (byIp?.c || 0) > RATE_PER_IP) {
      return Response.json(
        { error: "잠시 후 다시 시도해주세요. (제출 제한)" },
        { status: 429 },
      );
    }
    // 1시간 지난 로그 청소 (응답과 무관 — 백그라운드, 5% 확률로만)
    if (Math.random() < 0.05) {
      context.waitUntil(
        db.prepare("DELETE FROM submit_log WHERE ts < ?").bind(nowMs - 3600e3).run(),
      );
    }

    if (
      typeof score !== "number" ||
      typeof wave !== "number" ||
      !Number.isInteger(score) ||
      !Number.isInteger(wave) ||
      wave < 1 ||
      wave > 300 ||
      score < 0
    ) {
      return Response.json({ error: "유효하지 않은 데이터입니다." }, { status: 400 });
    }

    // --- 학기 값 화이트리스트: 알 수 없는 값은 저장하지 않고 거절 ---
    const diff = normalizeDifficulty(difficulty);
    if (!diff) {
      return Response.json({ error: "유효하지 않은 학기입니다." }, { status: 400 });
    }

    // --- ① 점수 상한: 웨이브 대비 이론 최대점수 초과 차단 (핵심 방어선) ---
    if (score > maxScoreForWave(wave)) {
      return Response.json(
        { error: "점수 검증에 실패했습니다." },
        { status: 400 },
      );
    }

    // --- ② 세션 토큰: 1회용 + 최소 플레이 시간 + 수명 캡 ---
    // 최소 플레이 시간 = 20초 × min(이번 세션에 진행한 웨이브 수, 10)
    // ⚠️ 이어하기(세이브 W15 로드 → 곧바로 사망)는 총 웨이브로 계산하면 200초를 못 채워
    //    정상 기록이 거절된다(교차검증 지적). 그래서 "이번 세션 웨이브 수"를 쓰되
    //    최소 20초는 항상 요구하고, 값이 이상하면 총 웨이브 기준으로 되돌린다.
    const sw =
      Number.isInteger(sessionWaves) && sessionWaves >= 1 && sessionWaves <= wave
        ? sessionWaves
        : wave;
    const minPlayMs = 20e3 * Math.min(sw, 10);
    // ⚠️ 알려진 한계: 토큰 발급 후 대기만 해도 통과 가능(실플레이 추적 아님) — 그래서
    // 점수 상한(①)이 1차 방어선이고, 토큰은 "봇의 즉시 대량 제출"을 막는 속도 제한 역할.
    if (!token || typeof token !== "string") {
      return Response.json(
        { error: "게임 세션이 확인되지 않습니다. 새로고침 후 다시 플레이해주세요." },
        { status: 400 },
      );
    }
    const sess = await db
      .prepare("SELECT created_at, used FROM sessions WHERE token = ?")
      .bind(token)
      .first();
    const age = sess ? nowMs - sess.created_at : 0;
    if (!sess || sess.used || age < minPlayMs || age > TOKEN_MAX_AGE_MS) {
      return Response.json(
        { error: "플레이 기록 검증에 실패했습니다. 새로고침 후 다시 플레이해주세요." },
        { status: 400 },
      );
    }
    // 1회용 소진: 이미 used=1이면 갱신 행이 0 → 동시 재사용 경쟁을 여기서 탈락시킨다
    const consume = await db
      .prepare("UPDATE sessions SET used = 1 WHERE token = ? AND used = 0")
      .bind(token)
      .run();
    if (!(consume.meta?.changes > 0)) {
      return Response.json(
        { error: "플레이 기록 검증에 실패했습니다. 새로고침 후 다시 플레이해주세요." },
        { status: 400 },
      );
    }

    // --- 랭킹 저장 (일·주·월 키) ---
    const dayKey = kstDayKey();
    await db
      .prepare(
        "INSERT INTO rankings (name, score, wave, difficulty, ranking_date, week_key, month_key) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(cleanName, score, wave, diff, dayKey, weekKeyOf(dayKey), monthKeyOf(dayKey))
      .run();

    // --- 명예의 전당 (TOP 5 유지) ---
    const hofResult = await db
      .prepare("SELECT id, score FROM hall_of_fame ORDER BY score DESC LIMIT 5")
      .all();
    const hofScores = hofResult.results || [];
    let enteredHof = false;

    if (hofScores.length < 5 || score > hofScores[hofScores.length - 1].score) {
      await db
        .prepare(
          "INSERT INTO hall_of_fame (name, score, wave, difficulty) VALUES (?, ?, ?, ?)",
        )
        .bind(cleanName, score, wave, diff)
        .run();

      // 교차검증 수정: "최저 1건 DELETE"는 동시 제출 시 6건 이상 남았다.
      // TOP 5 밖 전체를 지우면 몇 건이 동시에 들어와도 항상 5건으로 수렴한다.
      await db
        .prepare(
          "DELETE FROM hall_of_fame WHERE id NOT IN (SELECT id FROM hall_of_fame ORDER BY score DESC, id ASC LIMIT 5)",
        )
        .run();
      enteredHof = true;
    }

    // --- 보존기간 정리: 400일 (월간 랭킹 유지 — 구 7일 삭제가 주·월간을 불가능하게 했음) ---
    if (Math.random() < 0.05) {
      const cutoff = new Date(nowMs - 400 * 24 * 3600e3).toISOString().split("T")[0];
      context.waitUntil(
        db.prepare("DELETE FROM rankings WHERE ranking_date < ?").bind(cutoff).run(),
      );
    }

    // 방금 등록한 기록이 60초 캐시에 가려 안 보이는 문제 방지 (같은 콜로 한정 무효화)
    try {
      const origin = new URL(request.url).origin;
      context.waitUntil(
        caches.default.delete(new Request(`${origin}/api/rankings/v6/${dayKey}`)),
      );
    } catch {}

    return Response.json({ success: true, enteredHof });
  } catch (e) {
    console.error("submit-score error:", e);
    return Response.json(
      { error: "점수 등록 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
}
