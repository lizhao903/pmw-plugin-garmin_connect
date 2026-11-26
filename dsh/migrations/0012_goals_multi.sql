-- 0.11.0：目标比赛从单条改为多条。旧表保留兼容旧版本，数据迁到新表。
CREATE TABLE IF NOT EXISTS race_goals (
  id         TEXT PRIMARY KEY,
  race_name  TEXT NOT NULL DEFAULT '',
  category   TEXT NOT NULL DEFAULT '',
  date       TEXT NOT NULL DEFAULT '',
  target_s   REAL NOT NULL DEFAULT 0,
  note       TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO race_goals(id, race_name, category, date, target_s, created_at, updated_at)
SELECT 'goal_legacy', race_name, category, date, target_s, updated_at, updated_at
FROM training_goals WHERE id = 1 AND (race_name <> '' OR target_s > 0);
