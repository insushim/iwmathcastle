-- v6 마이그레이션: 주간·월간 랭킹 + 치트 방어 테이블
-- 적용: npx wrangler d1 execute mathcastle-db --remote --file=migrations/0002_weekly_monthly.sql
-- ⚠️ ALTER TABLE ADD COLUMN은 재실행 시 오류 — 1회만 실행

ALTER TABLE rankings ADD COLUMN week_key TEXT;
ALTER TABLE rankings ADD COLUMN month_key TEXT;

CREATE INDEX IF NOT EXISTS idx_rankings_week ON rankings(week_key, score DESC);
CREATE INDEX IF NOT EXISTS idx_rankings_month ON rankings(month_key, score DESC);

-- 기존 행 백필: 월간은 날짜에서 정확히 유도 가능. 주간은 신규 제출부터 시작(ISO 주차는 JS에서 계산).
UPDATE rankings SET month_key = substr(ranking_date, 1, 7) WHERE month_key IS NULL;

-- 치트 방어 테이블
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  used INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS submit_log (
  ip TEXT NOT NULL,
  ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_submit_log_ip_ts ON submit_log(ip, ts);
