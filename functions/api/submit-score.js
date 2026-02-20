// POST /api/submit-score - 점수 등록
export async function onRequestPost(context) {
  const { env, request } = context;
  const db = env.DB;

  try {
    const { name, score, wave, difficulty } = await request.json();

    if (
      !name ||
      typeof name !== "string" ||
      name.trim().length === 0 ||
      name.length > 10
    ) {
      return Response.json(
        { error: "유효하지 않은 이름입니다." },
        { status: 400 },
      );
    }
    if (typeof score !== "number" || typeof wave !== "number") {
      return Response.json(
        { error: "유효하지 않은 데이터입니다." },
        { status: 400 },
      );
    }

    // KST 기준 랭킹 날짜 계산
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstNow = new Date(now.getTime() + kstOffset);
    const rankingDate = new Date(
      kstNow.getTime() - (8 * 60 * 60 * 1000 + 50 * 60 * 1000),
    );
    const todayStr = rankingDate.toISOString().split("T")[0];

    // 오늘 랭킹에 추가
    await db
      .prepare(
        "INSERT INTO rankings (name, score, wave, difficulty, ranking_date) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(name.trim(), score, wave, difficulty || null, todayStr)
      .run();

    // 명예의 전당 체크
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
        .bind(name.trim(), score, wave, difficulty || null)
        .run();

      if (hofScores.length >= 5) {
        const lowestId = hofScores.sort((a, b) => a.score - b.score)[0].id;
        await db
          .prepare("DELETE FROM hall_of_fame WHERE id = ?")
          .bind(lowestId)
          .run();
      }
      enteredHof = true;
    }

    // 7일 이전 데이터 정리
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const cutoffStr = sevenDaysAgo.toISOString().split("T")[0];
    await db
      .prepare("DELETE FROM rankings WHERE ranking_date < ?")
      .bind(cutoffStr)
      .run();

    return Response.json({ success: true, enteredHof });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
