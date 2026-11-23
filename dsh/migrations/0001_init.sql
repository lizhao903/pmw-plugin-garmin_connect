CREATE TABLE IF NOT EXISTS runs (
  activity_id      TEXT PRIMARY KEY,
  start_time       TEXT NOT NULL,
  activity_name    TEXT,
  distance_m       REAL,
  duration_s       REAL,
  pace_sec_per_km  REAL,
  avg_hr           REAL,
  max_hr           REAL,
  cadence          REAL,
  elevation_m      REAL,
  calories         REAL,
  synced_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_start ON runs(start_time DESC);

CREATE TABLE IF NOT EXISTS sync_state (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
