-- 0002 복구용 (재실행 안전) — 2026-07-24
-- 0002는 ALTER TABLE ADD COLUMN으로 시작하므로 재실행하면 "duplicate column" 에러로
-- 중단되고, 뒤쪽의 sessions/submit_log 테이블 생성이 영영 실행되지 않는다.
-- 0002가 도중에 실패했거나 적용 여부가 불확실하면 이 파일을 대신 실행하면 된다.
-- (컬럼 추가만 별도로: ALTER TABLE rankings ADD COLUMN week_key TEXT; / month_key TEXT;)

CREATE INDEX IF NOT EXISTS idx_rankings_week ON rankings(week_key, score DESC);
CREATE INDEX IF NOT EXISTS idx_rankings_month ON rankings(month_key, score DESC);

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
CREATE INDEX IF NOT EXISTS idx_sessions_created ON sessions(created_at);

UPDATE rankings SET month_key = substr(ranking_date, 1, 7) WHERE month_key IS NULL;
