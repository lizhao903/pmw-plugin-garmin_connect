-- 0.10.0：训练日历的目标量，供「计划 vs 实际」三档完成度判定。
-- 距离单位米、时长单位秒，0 表示这一项没设目标。
ALTER TABLE calendar_items ADD COLUMN target_distance_m REAL NOT NULL DEFAULT 0;
ALTER TABLE calendar_items ADD COLUMN target_duration_s INTEGER NOT NULL DEFAULT 0;
