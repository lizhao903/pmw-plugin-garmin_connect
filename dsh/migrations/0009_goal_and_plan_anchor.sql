-- 0.10.0：目标比赛/目标成绩（AI 分析按目标配速给建议）。
CREATE TABLE IF NOT EXISTS training_goals (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  race_name  TEXT NOT NULL DEFAULT '',
  category   TEXT NOT NULL DEFAULT '',
  date       TEXT NOT NULL DEFAULT '',
  target_s   REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- 计划排期口径：week=开始日期所在周周一起算（预置计划默认）；date=开始日期就是第 1 天（AI 建议存成的计划）。
ALTER TABLE custom_plans ADD COLUMN start_mode TEXT NOT NULL DEFAULT 'week';
