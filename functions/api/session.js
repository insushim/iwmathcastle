// POST /api/session - 게임 세션 토큰 발급 (치트 방어 ②)
// 게임 시작 시 클라이언트가 호출. 점수 제출 시 이 토큰을 요구해
// API 직접 호출의 "즉시 대량 제출"을 막고 최소 플레이 시간을 검증한다.
// 교차검증 수정(2026-07-24): 발급 IP 레이트리밋 + 인덱스·확률적 청소로 DoS 표면 축소
//   ⚠️ 한도는 "한 학급 30명이 동시에 접속"을 통과시켜야 한다(학교 NAT = 공유 IP 1개).
//      분당 10회였던 초안은 3교시 동시 시작 시 대부분의 학생이 토큰을 못 받는다 → 60회.
const SESSION_RATE_PER_MIN = 60;

export async function onRequestPost(context) {
  const { env, request } = context;
  const db = env.DB;
  try {
    const now = Date.now();
    const ip = "sess:" + (request.headers.get("CF-Connecting-IP") || "unknown");

    // INSERT 먼저 → COUNT (동시요청 TOCTOU 축소, submit-score와 동일 패턴·같은 테이블 재사용)
    await db
      .prepare("INSERT INTO submit_log (ip, ts) VALUES (?, ?)")
      .bind(ip, now)
      .run();
    const rl = await db
      .prepare("SELECT COUNT(*) AS c FROM submit_log WHERE ip = ? AND ts > ?")
      .bind(ip, now - 60e3)
      .first();
    if ((rl?.c || 0) > SESSION_RATE_PER_MIN) {
      return Response.json(
        { error: "잠시 후 다시 시도해주세요." },
        { status: 429 },
      );
    }

    const token = crypto.randomUUID();
    await db
      .prepare("INSERT INTO sessions (token, created_at, used) VALUES (?, ?, 0)")
      .bind(token, now)
      .run();
    // 24시간 지난 토큰 청소 (테이블 무한 성장 방지)
    // 교차검증 수정: 매 요청 실행 → 5% 확률 실행. sessions(created_at) 인덱스도 추가해
    // 풀스캔 DELETE가 발급 엔드포인트의 증폭 DoS 지렛대가 되지 않게 한다.
    if (Math.random() < 0.05) {
      context.waitUntil(
        db
          .prepare("DELETE FROM sessions WHERE created_at < ?")
          .bind(now - 24 * 3600e3)
          .run(),
      );
    }
    return Response.json({ token });
  } catch (e) {
    console.error("session error:", e);
    return Response.json(
      { error: "세션 발급 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
