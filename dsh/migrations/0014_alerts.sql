-- 0.11.0：训练预警（同步后按规则生成，页面与今日卡片提示）。
CREATE TABLE IF NOT EXISTS training_alerts (
  day        TEXT NOT NULL,
  kind       TEXT NOT NULL DEFAULT '',
  level      TEXT NOT NULL DEFAULT 'moderate',
  title      TEXT NOT NULL DEFAULT '',
  reason     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY (day, kind)
);
