-- 0.11.0：跑步机逐段速度的来源。auto = 打开详情时按 Garmin 分段平均速度自动填的，manual = 用户确认或手填的。
-- 已在用的活动默认 manual；自动值可随时被手填覆盖或清除。
ALTER TABLE lap_speeds ADD COLUMN source TEXT NOT NULL DEFAULT 'manual';
