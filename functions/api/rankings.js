// GET /api/rankings - 랭킹 조회
export async function onRequestGet(context) {
  const { env } = context;
  const db = env.DB;

  try {
    // KST 기준 8:50 AM 기준으로 랭킹 날짜 계산
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstNow = new Date(now.getTime() + kstOffset);

    // 8:50 기준으로 하루를 나눔
    const rankingDate = new Date(
      kstNow.getTime() - (8 * 60 * 60 * 1000 + 50 * 60 * 1000),
    );
    const todayStr = rankingDate.toISOString().split("T")[0];

    const yesterdayDate = new Date(rankingDate);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split("T")[0];

    const [hofResult, todayResult, yesterdayResult] = await Promise.all([
      db
        .prepare(
          "SELECT name, score, wave, difficulty FROM hall_of_fame ORDER BY score DESC LIMIT 5",
        )
        .all(),
      db
        .prepare(
          "SELECT name, score, wave, difficulty FROM rankings WHERE ranking_date = ? ORDER BY score DESC LIMIT 50",
        )
        .bind(todayStr)
        .all(),
      db
        .prepare(
          "SELECT name, score, wave, difficulty FROM rankings WHERE ranking_date = ? ORDER BY score DESC LIMIT 50",
        )
        .bind(yesterdayStr)
        .all(),
    ]);

    // 다음 갱신 시간 (KST 8:50 AM = UTC 23:50)
    let nextUpdate = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        23,
        50,
        0,
        0,
      ),
    );
    if (now.getTime() > nextUpdate.getTime()) {
      nextUpdate.setUTCDate(nextUpdate.getUTCDate() + 1);
    }

    return Response.json({
      hallOfFame: hofResult.results || [],
      today: todayResult.results || [],
      yesterday: yesterdayResult.results || [],
      nextUpdateTime: nextUpdate.toISOString(),
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
