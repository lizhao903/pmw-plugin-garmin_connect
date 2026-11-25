// powered by dsh - https://github.com/deepseek-ai/deepseek-harness

package main

// 目标比赛/目标成绩：全局一条，AI 分析用它推算目标配速区间。

import (
	"context"
	"encoding/json"
	"strings"
	"time"
)

var goalDistKM = map[string]float64{
	"full": 42.195, "half": 21.0975, "10k": 10, "5k": 5,
}

func goalPaceSec(cat string, seconds float64) float64 {
	d, ok := goalDistKM[cat]
	if !ok || d <= 0 || seconds <= 0 {
		return 0
	}
	return seconds / d
}

type goalRow struct {
	RaceName string  `json:"race_name"`
	Category string  `json:"category"`
	Date     string  `json:"date"`
	TargetS  float64 `json:"target_s"`
}

func (g *goalRow) check() string {
	g.RaceName = strings.TrimSpace(g.RaceName)
	g.Category = strings.TrimSpace(g.Category)
	g.Date = strings.TrimSpace(g.Date)
	switch {
	case len([]rune(g.RaceName)) > 80:
		return "目标比赛名称最多 80 个字"
	case g.Category != "" && !raceCategories[g.Category]:
		return "比赛类别不合法"
	case g.TargetS < 0 || g.TargetS > 7*24*3600:
		return "目标成绩要在 0～7 天之间"
	case g.Date != "" && !validDate(g.Date):
		return "比赛日期要是 YYYY-MM-DD"
	}
	return ""
}

func goalView(g goalRow) map[string]any {
	return map[string]any{
		"race_name": g.RaceName, "category": g.Category, "date": g.Date,
		"target_s": g.TargetS, "target_pace_s": goalPaceSec(g.Category, g.TargetS),
	}
}

func (s *server) currentGoal(ctx context.Context) goalRow {
	rows, err := s.query(ctx, "SELECT race_name, category, date, target_s FROM training_goals WHERE id = 1")
	if err != nil || len(rows) == 0 {
		return goalRow{}
	}
	r := rows[0]
	return goalRow{
		RaceName: strOf(r["race_name"]), Category: strOf(r["category"]),
		Date: strOf(r["date"]), TargetS: numField(r, "target_s"),
	}
}

func (s *server) apiGetGoals(ctx context.Context) (int, any) {
	g := s.currentGoal(ctx)
	if g.TargetS <= 0 && g.RaceName == "" {
		return 200, map[string]any{"goal": nil}
	}
	return 200, map[string]any{"goal": goalView(g)}
}

func (s *server) apiSaveGoals(ctx context.Context, body []byte) (int, any) {
	var in goalRow
	if err := json.Unmarshal(body, &in); err != nil {
		return 400, map[string]any{"error": "请求不是合法 JSON"}
	}
	if msg := in.check(); msg != "" {
		return 400, map[string]any{"error": msg}
	}
	err := s.exec(ctx, `INSERT INTO training_goals(id, race_name, category, date, target_s, updated_at)
		VALUES (1, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET race_name=excluded.race_name, category=excluded.category,
		date=excluded.date, target_s=excluded.target_s, updated_at=excluded.updated_at`,
		in.RaceName, in.Category, in.Date, in.TargetS, time.Now().Format(time.RFC3339))
	if err != nil {
		return 500, map[string]any{"error": "保存失败：" + err.Error()}
	}
	return 200, map[string]any{"ok": true, "goal": goalView(in)}
}
