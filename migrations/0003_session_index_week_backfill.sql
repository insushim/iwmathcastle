-- v6 교차검증 후속 마이그레이션 (2026-07-24)
-- 적용: npx wrangler d1 execute mathcastle-db --remote --file=migrations/0003_session_index_week_backfill.sql
-- ✅ 전 구문 재실행 안전 (ALTER TABLE 없음 — 0002의 재실행 실패 문제를 여기서는 만들지 않는다)

-- ① sessions 청소 쿼리 풀스캔 제거 (/api/session DoS 지렛대 차단)
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);

-- ② 0002에서 빠졌던 구 데이터 week_key 백필 (ISO 8601 주차 = 목요일이 속한 해/주)
--    JS weekKeyOf()와 동일 정의: 그 날짜가 속한 주의 목요일을 구하고,
--    그 목요일의 연도 1월 1일로부터의 경과일 // 7 + 1 을 주차로 쓴다.
UPDATE rankings
SET week_key = (
  SELECT strftime('%Y', thu) || '-W' || substr(
    '0' || CAST(
      CAST((julianday(thu) - julianday(strftime('%Y', thu) || '-01-01')) / 7 AS INTEGER) + 1
      AS TEXT),
    -2, 2)
  FROM (
    SELECT date(
      rankings.ranking_date,
      '-' || ((CAST(strftime('%w', rankings.ranking_date) AS INTEGER) + 6) % 7) || ' days',
      '+3 days'
    ) AS thu
  )
)
WHERE week_key IS NULL AND ranking_date IS NOT NULL;
