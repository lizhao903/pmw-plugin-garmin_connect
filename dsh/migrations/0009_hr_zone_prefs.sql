-- 心率区间校准：用户自己的最大心率与 5 段下界（bpm），重算区间时长和 AI 结论。
CREATE TABLE IF NOT EXISTS hr_zone_prefs (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  max_hr REAL NOT NULL DEFAULT 0,
  boundaries TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT ''
);
