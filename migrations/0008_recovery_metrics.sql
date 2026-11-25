-- 0.10.0：恢复/体能趋势。把每次活动详情 summaryDTO 里的训练指标抽成结构化列，
-- 同步详情时落库；跨天趋势 API 直接查这张表，不必等用户点开详情才有数据。
CREATE TABLE IF NOT EXISTS activity_metrics (
  activity_id          TEXT PRIMARY KEY,
  day                  TEXT NOT NULL,
  start_time           TEXT NOT NULL,
  type_key             TEXT NOT NULL DEFAULT '',
  training_load        REAL,
  training_effect      REAL,
  anaerobic_effect     REAL,
  te_label             TEXT NOT NULL DEFAULT '',
  body_battery_delta   REAL,
  recovery_hr          REAL,
  resting_hr           REAL,
  stamina_begin        REAL,
  stamina_end          REAL,
  stamina_min          REAL,
  avg_hr               REAL,
  distance_m           REAL,
  duration_s           REAL,
  updated_at           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_metrics_day ON activity_metrics(day DESC);
