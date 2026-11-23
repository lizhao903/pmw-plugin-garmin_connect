-- 0.3.0：活动类型（区分室内/室外统计）、跑步机校正后的总距离，以及逐段跑步机速度。
ALTER TABLE runs ADD COLUMN type_key TEXT;
ALTER TABLE runs ADD COLUMN corrected_distance_m REAL;

CREATE TABLE IF NOT EXISTS lap_speeds (
  activity_id  TEXT NOT NULL,
  lap_index    INTEGER NOT NULL,
  speed_kmh    REAL NOT NULL,
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (activity_id, lap_index)
);
