-- 0.6.0：AI 分析结果、训练日历。
CREATE TABLE IF NOT EXISTS analyses (
  activity_id  TEXT PRIMARY KEY,
  content      TEXT NOT NULL,
  agent        TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL
);

-- 训练日历：某天安排的一次训练。plan_key / plan_run 记它来自哪个预置计划、哪一次「应用到日历」，方便整批删除。
CREATE TABLE IF NOT EXISTS calendar_items (
  id          TEXT PRIMARY KEY,
  date        TEXT NOT NULL,
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  detail      TEXT NOT NULL DEFAULT '',
  plan_key    TEXT NOT NULL DEFAULT '',
  plan_name   TEXT NOT NULL DEFAULT '',
  plan_run    TEXT NOT NULL DEFAULT '',
  done        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_calendar_date ON calendar_items(date);
