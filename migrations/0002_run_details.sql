-- 跑步详情缓存（0.2.0）：概要、逐圈分段、心率区间整体存一份 JSON，点开详情时先读这里，没有再去 Garmin 拉。
CREATE TABLE IF NOT EXISTS run_details (
  activity_id  TEXT PRIMARY KEY,
  detail_json  TEXT NOT NULL,
  fetched_at   TEXT NOT NULL
);
