// powered by dsh - https://github.com/deepseek-ai/deepseek-harness

package main

// 数据可移植：训练数据导出为 JSON、从 JSON 导入（按主键 upsert，不碰凭证与媒体文件）。

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

// portTables 每张表的导出列与导入用的主键；导入时用 INSERT ... ON CONFLICT(主键) DO UPDATE。
var portTables = []struct {
	Name    string
	Columns string
	Key     string
}{
	{"runs", "activity_id, start_time, activity_name, distance_m, duration_s, pace_sec_per_km, avg_hr, max_hr, cadence, elevation_m, calories, synced_at, type_key, corrected_distance_m, event_type", "activity_id"},
	{"activity_metrics", "activity_id, day, start_time, type_key, training_load, training_effect, anaerobic_effect, te_label, body_battery_delta, recovery_hr, resting_hr, stamina_begin, stamina_end, stamina_min, avg_hr, distance_m, duration_s, updated_at", "activity_id"},
	{"calendar_items", "id, date, kind, title, detail, video, target_distance_m, target_duration_s, target_pace_lo_s, target_pace_hi_s, target_hr_zone_lo, target_hr_zone_hi, plan_key, plan_name, plan_run, done, created_at, updated_at", "id"},
	{"race_goals", "id, race_name, category, date, target_s, note, created_at, updated_at", "id"},
	{"custom_plans", "id, name, kind, level, description, days, weeks, created_at, updated_at, start_mode, source, videos", "id"},
	{"races", "id, name, date, city, category, status, official_s, net_s, bib_no, rank_overall, rank_group, activity_id, note, created_at, updated_at", "id"},
	{"videos", "id, title, url, creator, creator_url, category, note, created_at, updated_at", "id"},
	{"daily_wellbeing", "day, sleep_h, sleep_quality, fatigue, soreness, mood, note, updated_at", "day"},
	{"training_alerts", "day, kind, level, title, reason, created_at", "day, kind"},
}

type exportBundle struct {
	Format  string                      `json:"format"`
	Version string                      `json:"version"`
	Tables  map[string][]map[string]any `json:"tables"`
}

func (s *server) apiExport(ctx context.Context) (int, any) {
	out := exportBundle{Format: "garmin_connect-backup", Version: "1", Tables: map[string][]map[string]any{}}
	for _, t := range portTables {
		rows, err := s.query(ctx, "SELECT "+t.Columns+" FROM "+t.Name)
		if err != nil {
			// 旧库可能缺新列，跳过该表而不是整个导出失败。
			continue
		}
		if rows == nil {
			rows = []map[string]any{}
		}
		out.Tables[t.Name] = rows
	}
	return 200, out
}

func (s *server) apiImport(ctx context.Context, body []byte) (int, any) {
	var in exportBundle
	if err := json.Unmarshal(body, &in); err != nil {
		return 400, map[string]any{"error": "文件不是合法的备份 JSON"}
	}
	if in.Format != "garmin_connect-backup" || len(in.Tables) == 0 {
		return 400, map[string]any{"error": "不是 Garmin 跑步数据的备份文件"}
	}
	counts := map[string]int{}
	skipped := []string{}
	for _, t := range portTables {
		rows := in.Tables[t.Name]
		if len(rows) == 0 {
			continue
		}
		cols := strings.Split(t.Columns, ", ")
		for i := range cols {
			cols[i] = strings.TrimSpace(cols[i])
		}
		placeholders := make([]string, len(cols))
		for i := range placeholders {
			placeholders[i] = "?"
		}
		updates := []string{}
		keys := strings.Split(t.Key, ", ")
		for _, c := range cols {
			isKey := false
			for _, k := range keys {
				if strings.TrimSpace(k) == c {
					isKey = true
					break
				}
			}
			if !isKey {
				updates = append(updates, c+"=excluded."+c)
			}
		}
		sql := fmt.Sprintf("INSERT INTO %s(%s) VALUES (%s) ON CONFLICT(%s) DO UPDATE SET %s",
			t.Name, strings.Join(cols, ", "), strings.Join(placeholders, ", "), t.Key, strings.Join(updates, ", "))
		ok := 0
		for _, r := range rows {
			args := make([]any, len(cols))
			for j, c := range cols {
				args[j] = r[c]
			}
			if err := s.exec(ctx, sql, args...); err != nil {
				continue
			}
			ok++
		}
		counts[t.Name] = ok
		if ok < len(rows) {
			skipped = append(skipped, fmt.Sprintf("%s %d 条", t.Name, len(rows)-ok))
		}
	}
	total := 0
	for _, n := range counts {
		total += n
	}
	return 200, map[string]any{"ok": true, "imported": total, "counts": counts, "skipped": skipped}
}
