// powered by dsh - https://github.com/deepseek-ai/deepseek-harness

package main

// 主观状态：每日睡眠、疲劳、酸痛、状态评分。恢复结论据此交叉校验。

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"time"
)

type wellbeingRow struct {
	Day          string  `json:"day"`
	SleepH       float64 `json:"sleep_h"`
	SleepQuality int     `json:"sleep_quality"`
	Fatigue      int     `json:"fatigue"`
	Soreness     int     `json:"soreness"`
	Mood         int     `json:"mood"`
	Note         string  `json:"note,omitempty"`
}

func scoreRange(v int) bool { return v >= 0 && v <= 5 }

func (w *wellbeingRow) check() string {
	w.Day = strings.TrimSpace(w.Day)
	w.Note = strings.TrimSpace(w.Note)
	switch {
	case !validDate(w.Day):
		return "日期应为 YYYY-MM-DD"
	case w.SleepH < 0 || w.SleepH > 24:
		return "睡眠时长应在 0～24 小时之间"
	case !scoreRange(w.SleepQuality) || !scoreRange(w.Fatigue) || !scoreRange(w.Soreness) || !scoreRange(w.Mood):
		return "各项评分应在 0～5 之间（0 表示未填）"
	case len([]rune(w.Note)) > 500:
		return "备注最多 500 个字"
	}
	return ""
}

func wellbeingFromRow(r map[string]any) wellbeingRow {
	return wellbeingRow{
		Day: strOf(r["day"]), SleepH: numField(r, "sleep_h"),
		SleepQuality: int(numField(r, "sleep_quality")), Fatigue: int(numField(r, "fatigue")),
		Soreness: int(numField(r, "soreness")), Mood: int(numField(r, "mood")), Note: strOf(r["note"]),
	}
}

func (s *server) apiGetWellbeing(ctx context.Context, from, to string) (int, any) {
	if from != "" && !validDate(from) {
		return 400, map[string]any{"error": "from 应为 YYYY-MM-DD"}
	}
	if to != "" && !validDate(to) {
		return 400, map[string]any{"error": "to 应为 YYYY-MM-DD"}
	}
	sql := "SELECT day, sleep_h, sleep_quality, fatigue, soreness, mood, note FROM daily_wellbeing"
	args := []any{}
	if from != "" && to != "" {
		sql += " WHERE day >= ? AND day <= ?"
		args = append(args, from, to)
	} else if from != "" {
		sql += " WHERE day >= ?"
		args = append(args, from)
	}
	sql += " ORDER BY day DESC"
	rows, err := s.query(ctx, sql, args...)
	if err != nil {
		return 500, map[string]any{"error": "读取主观状态失败：" + err.Error()}
	}
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		w := wellbeingFromRow(r)
		out = append(out, map[string]any{
			"day": w.Day, "sleep_h": w.SleepH, "sleep_quality": w.SleepQuality,
			"fatigue": w.Fatigue, "soreness": w.Soreness, "mood": w.Mood, "note": w.Note,
		})
	}
	return 200, map[string]any{"days": out}
}

func (s *server) apiSaveWellbeing(ctx context.Context, body []byte) (int, any) {
	var in wellbeingRow
	if err := json.Unmarshal(body, &in); err != nil {
		return 400, map[string]any{"error": "请求不是合法 JSON"}
	}
	if msg := in.check(); msg != "" {
		return 400, map[string]any{"error": msg}
	}
	now := time.Now().Format(time.RFC3339)
	err := s.exec(ctx, `INSERT INTO daily_wellbeing(day, sleep_h, sleep_quality, fatigue, soreness, mood, note, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(day) DO UPDATE SET sleep_h=excluded.sleep_h, sleep_quality=excluded.sleep_quality,
		fatigue=excluded.fatigue, soreness=excluded.soreness, mood=excluded.mood, note=excluded.note, updated_at=excluded.updated_at`,
		in.Day, in.SleepH, in.SleepQuality, in.Fatigue, in.Soreness, in.Mood, in.Note, now)
	if err != nil {
		return 500, map[string]any{"error": "保存失败：" + err.Error()}
	}
	return 200, map[string]any{"ok": true, "day": in.Day}
}

func (s *server) apiDeleteWellbeing(ctx context.Context, day string) (int, any) {
	if !validDate(day) {
		return 400, map[string]any{"error": "日期应为 YYYY-MM-DD"}
	}
	if err := s.exec(ctx, "DELETE FROM daily_wellbeing WHERE day = ?", day); err != nil {
		return 500, map[string]any{"error": "删除失败：" + err.Error()}
	}
	return 200, map[string]any{"ok": true}
}

// wellbeingCrossCheck 用最近一条主观状态给恢复结论加提示：疲劳高、睡眠差、酸痛重时降低「上强度」建议。
// 返回附加说明与是否建议降强度。
func (s *server) wellbeingCrossCheck(ctx context.Context) (string, bool) {
	rows, err := s.query(ctx, `SELECT sleep_h, sleep_quality, fatigue, soreness, mood, note FROM daily_wellbeing
		ORDER BY day DESC LIMIT 1`)
	if err != nil || len(rows) == 0 {
		return "", false
	}
	w := wellbeingFromRow(rows[0])
	bits := []string{}
	lower := false
	if w.SleepH > 0 && w.SleepH < 6.5 {
		bits = append(bits, "睡眠只有 "+fmt1(w.SleepH)+" 小时")
		lower = true
	}
	if w.SleepQuality >= 4 {
		bits = append(bits, "自评睡眠质量差")
		lower = true
	}
	if w.Fatigue >= 4 {
		bits = append(bits, "疲劳感偏高")
		lower = true
	}
	if w.Soreness >= 4 {
		bits = append(bits, "肌肉酸痛明显")
		lower = true
	}
	if w.Mood == 1 {
		bits = append(bits, "整体状态差")
		lower = true
	}
	if len(bits) == 0 {
		return "", false
	}
	return "主观状态：" + strings.Join(bits, "、") + "；今天别上强度。", lower
}

func fmt1(v float64) string {
	return strconv.FormatFloat(v, 'f', 1, 64)
}
