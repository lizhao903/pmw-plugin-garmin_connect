-- 0.11.0：每日主观状态（睡眠/疲劳/酸痛/状态评分），与训练指标交叉校验恢复结论。
CREATE TABLE IF NOT EXISTS daily_wellbeing (
  day        TEXT PRIMARY KEY,
  sleep_h    REAL NOT NULL DEFAULT 0,
  sleep_quality INTEGER NOT NULL DEFAULT 0,
  fatigue    INTEGER NOT NULL DEFAULT 0,
  soreness   INTEGER NOT NULL DEFAULT 0,
  mood       INTEGER NOT NULL DEFAULT 0,
  note       TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
