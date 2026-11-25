-- 保存 Garmin 的 event_type（race/training/...），同步与详情里标记为比赛的活动自动收录。
ALTER TABLE runs ADD COLUMN event_type TEXT;

-- 用户主动删掉的自动收录比赛不再被下一次同步「复活」；手动重新标记时清除。
CREATE TABLE IF NOT EXISTS race_skips (
  activity_id TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL
);
