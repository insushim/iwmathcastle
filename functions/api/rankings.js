// GET /api/rankings - 랭킹 조회 (v6: 일간·주간·월간 + 60초 엣지 캐싱)
// 캐싱: Cache API 60초 — D1 읽기가 트래픽과 무관하게 분당 상수로 고정 (동접 최적화 핵심)
import { kstDayKey, weekKeyOf, monthKeyOf, nextUpdateTime } from "./_util.js";

export async function onRequestGet(context) {
  const { env, request } = context;
  const db = env.DB;

  try {
    const todayStr = kstDayKey();

    // --- 60초 엣지 캐시 ---
    // 교차검증 수정(2026-07-24, codex): 캐시 키에서 쿼리스트링 제거.
    //   `?n=1,2,3…`으로 키가 무한 분기해 요청마다 D1 쿼리 5개가 나가던 우회를 막는다.
    //   키에 KST 컷 날짜를 넣어, 08:49:59에 담긴 응답이 08:50 이후로 새어나오지 않게 한다.
    const cache = caches.default;
    const origin = new URL(request.url).origin;
    const cacheKey = new Request(`${origin}/api/rankings/v6/${todayStr}`);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    const yesterdayDate = new Date(todayStr + "T00:00:00Z");
    yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().split("T")[0];
    const weekKey = weekKeyOf(todayStr);
    const monthKey = monthKeyOf(todayStr);

    // 주간·월간은 이름별 최고 점수 1건만 (같은 학생 도배 방지)
    // SQLite: GROUP BY + MAX(score) 시 bare 컬럼은 MAX가 나온 행에서 선택된다
    const [hofResult, todayResult, yesterdayResult, weekResult, monthResult] =
      await Promise.all([
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
        db
          .prepare(
            "SELECT name, MAX(score) AS score, wave, difficulty FROM rankings WHERE week_key = ? GROUP BY name ORDER BY score DESC LIMIT 50",
          )
          .bind(weekKey)
          .all(),
        db
          .prepare(
            "SELECT name, MAX(score) AS score, wave, difficulty FROM rankings WHERE month_key = ? GROUP BY name ORDER BY score DESC LIMIT 50",
          )
          .bind(monthKey)
          .all(),
      ]);

    const response = Response.json(
      {
        hallOfFame: hofResult.results || [],
        today: todayResult.results || [],
        yesterday: yesterdayResult.results || [],
        week: weekResult.results || [],
        month: monthResult.results || [],
        weekKey,
        monthKey,
        nextUpdateTime: nextUpdateTime().toISOString(),
      },
      { headers: { "Cache-Control": "public, max-age=60" } },
    );

    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (e) {
    console.error("rankings error:", e);
    return Response.json(
      { error: "랭킹 조회 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }
}
