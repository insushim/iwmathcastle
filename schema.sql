-- 랭킹 테이블
CREATE TABLE IF NOT EXISTS rankings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  wave INTEGER NOT NULL,
  difficulty TEXT,
  ranking_date TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 명예의 전당 테이블
CREATE TABLE IF NOT EXISTS hall_of_fame (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  wave INTEGER NOT NULL,
  difficulty TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_rankings_date_score ON rankings(ranking_date, score DESC);
CREATE INDEX IF NOT EXISTS idx_hof_score ON hall_of_fame(score DESC);
