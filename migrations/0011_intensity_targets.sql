-- 训练强度结构化（训练强度达标判定 / 强度机器可读）
-- 目标配速区间按秒/公里存，lo 快 hi 慢；目标心率区间按 1～5 存。
ALTER TABLE calendar_items ADD COLUMN target_pace_lo_s REAL NOT NULL DEFAULT 0;
ALTER TABLE calendar_items ADD COLUMN target_pace_hi_s REAL NOT NULL DEFAULT 0;
ALTER TABLE calendar_items ADD COLUMN target_hr_zone_lo INTEGER NOT NULL DEFAULT 0;
ALTER TABLE calendar_items ADD COLUMN target_hr_zone_hi INTEGER NOT NULL DEFAULT 0;
