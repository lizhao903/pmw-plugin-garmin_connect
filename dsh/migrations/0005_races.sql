-- 0.7.0：比赛收录与影像记忆。
CREATE TABLE IF NOT EXISTS races (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  date           TEXT NOT NULL,
  city           TEXT NOT NULL DEFAULT '',
  category       TEXT NOT NULL DEFAULT 'other',
  status         TEXT NOT NULL DEFAULT 'finished',
  official_s     REAL,
  bib_no         TEXT NOT NULL DEFAULT '',
  rank_overall   TEXT NOT NULL DEFAULT '',
  rank_group     TEXT NOT NULL DEFAULT '',
  activity_id    TEXT NOT NULL DEFAULT '',
  note           TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_races_date ON races(date DESC);

-- 影像记忆：文件放在插件数据目录 media/<race_id>/<id>.<ext>；分块上传，ready=1 才算传完。
CREATE TABLE IF NOT EXISTS race_media (
  id          TEXT PRIMARY KEY,
  race_id     TEXT NOT NULL,
  kind        TEXT NOT NULL,
  name        TEXT NOT NULL,
  mime        TEXT NOT NULL,
  size        INTEGER NOT NULL,
  received    INTEGER NOT NULL DEFAULT 0,
  ready       INTEGER NOT NULL DEFAULT 0,
  caption     TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_race_media_race ON race_media(race_id, created_at);
