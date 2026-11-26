// powered by dsh - https://github.com/deepseek-ai/deepseek-harness

package main

// 目标比赛/目标成绩：可设多条，AI 分析引用「最近一场未来目标」，没有未来目标时用最后一条。

import (
	"context"
	"encoding/json"
	"sort"
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
	ID       string  `json:"id,omitempty"`
	RaceName string  `json:"race_name"`
	Category string  `json:"category"`
	Date     string  `json:"date"`
	TargetS  float64 `json:"target_s"`
	Note     string  `json:"note,omitempty"`
}

func (g *goalRow) check() string {
	g.RaceName = strings.TrimSpace(g.RaceName)
	g.Category = strings.TrimSpace(g.Category)
	g.Date = strings.TrimSpace(g.Date)
	g.Note = strings.TrimSpace(g.Note)
	switch {
	case len([]rune(g.RaceName)) > 80:
		return "目标比赛名称最多 80 个字"
	case g.Category != "" && !raceCategories[g.Category]:
		return "比赛类别不合法"
	case g.TargetS < 0 || g.TargetS > 7*24*3600:
		return "目标成绩要在 0～7 天之间"
	case g.Date != "" && !validDate(g.Date):
		return "比赛日期要是 YYYY-MM-DD"
	case len([]rune(g.Note)) > 500:
		return "备注最多 500 个字"
	}
	return ""
}

func goalView(g goalRow) map[string]any {
	return map[string]any{
		"id": g.ID, "race_name": g.RaceName, "category": g.Category, "date": g.Date,
		"target_s": g.TargetS, "target_pace_s": goalPaceSec(g.Category, g.TargetS), "note": g.Note,
	}
}

func goalFromRow(r map[string]any) goalRow {
	return goalRow{
		ID: strOf(r["id"]), RaceName: strOf(r["race_name"]), Category: strOf(r["category"]),
		Date: strOf(r["date"]), TargetS: numField(r, "target_s"), Note: strOf(r["note"]),
	}
}

// allGoals 按日期升序（无日期排最后），供前端列出与周期化倒推用。
func (s *server) allGoals(ctx context.Context) []goalRow {
	rows, err := s.query(ctx, `SELECT id, race_name, category, date, target_s, note FROM race_goals`)
	if err != nil {
		return []goalRow{}
	}
	out := make([]goalRow, 0, len(rows))
	for _, r := range rows {
		out = append(out, goalFromRow(r))
	}
	sort.SliceStable(out, func(i, j int) bool {
		a, b := out[i].Date, out[j].Date
		if a == "" {
			a = "9999-12-31"
		}
		if b == "" {
			b = "9999-12-31"
		}
		return a < b
	})
	return out
}

// currentGoal 取最近一场未来目标；都过期或没日期时用最后一条。
func (s *server) currentGoal(ctx context.Context) goalRow {
	goals := s.allGoals(ctx)
	if len(goals) == 0 {
		return goalRow{}
	}
	today := time.Now().Format("2006-01-02")
	for _, g := range goals {
		if g.Date != "" && g.Date >= today {
			return g
		}
	}
	return goals[len(goals)-1]
}

func (s *server) apiGetGoals(ctx context.Context) (int, any) {
	goals := s.allGoals(ctx)
	list := make([]map[string]any, 0, len(goals))
	for _, g := range goals {
		list = append(list, goalView(g))
	}
	cur := s.currentGoal(ctx)
	var one any
	if cur.TargetS > 0 || cur.RaceName != "" {
		one = goalView(cur)
	}
	return 200, map[string]any{"goal": one, "goals": list}
}

func (s *server) apiSaveGoals(ctx context.Context, body []byte) (int, any) {
	var in goalRow
	if err := json.Unmarshal(body, &in); err != nil {
		return 400, map[string]any{"error": "请求不是合法 JSON"}
	}
	if msg := in.check(); msg != "" {
		return 400, map[string]any{"error": msg}
	}
	now := time.Now().Format(time.RFC3339)
	id := strings.TrimSpace(in.ID)
	if id == "" || id == "goal_legacy" {
		id = newID("goal_")
	}
	if !strings.HasPrefix(id, "goal_") || len(id) > 40 {
		return 400, map[string]any{"error": "目标 id 不合法"}
	}
	err := s.exec(ctx, `INSERT INTO race_goals(id, race_name, category, date, target_s, note, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET race_name=excluded.race_name, category=excluded.category,
		date=excluded.date, target_s=excluded.target_s, note=excluded.note, updated_at=excluded.updated_at`,
		id, in.RaceName, in.Category, in.Date, in.TargetS, in.Note, now, now)
	if err != nil {
		return 500, map[string]any{"error": "保存失败：" + err.Error()}
	}
	in.ID = id
	return 200, map[string]any{"ok": true, "goal": goalView(in)}
}

// goalPhase 按距目标比赛的天数倒推训练阶段：>84 基础期、43～84 强化期、22～42 专项期、8～21 减量期、0～7 比赛周。
// 返回阶段名、剩余天数与训练重点；没有有效日期时返回空。
func goalPhase(g goalRow, today time.Time) map[string]any {
	if g.Date == "" || g.ID == "" {
		return nil
	}
	d, err := time.ParseInLocation("2006-01-02", g.Date, today.Location())
	if err != nil {
		return nil
	}
	days := int(d.Sub(time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, today.Location())).Hours() / 24)
	phase, focus := "", ""
	switch {
	case days < 0:
		phase, focus = "比赛已过", "更新下一场目标；这段时间按恢复与有氧维持安排"
	case days <= 7:
		phase, focus = "比赛周", "减量、保持强度感、保证睡眠，不再堆跑量"
	case days <= 21:
		phase, focus = "减量期", "总量下调 20%～30%，保留目标配速的短段落"
	case days <= 42:
		phase, focus = "专项期", "按目标配速跑专项段落，长距离里安排配速段"
	case days <= 84:
		phase, focus = "强化期", "有氧容量与阈值课并重，逐步加入目标配速段"
	default:
		phase, focus = "基础期", "以有氧轻松跑和力量为主，稳步加量"
	}
	return map[string]any{"phase": phase, "days_left": days, "focus": focus, "goal_id": g.ID, "goal_name": g.RaceName}
}

func (s *server) apiPhase(ctx context.Context) (int, any) {
	p := goalPhase(s.currentGoal(ctx), time.Now())
	if p == nil {
		return 200, map[string]any{"phase": nil}
	}
	return 200, map[string]any{"phase": p}
}

func (s *server) apiDeleteGoal(ctx context.Context, id string) (int, any) {
	if !strings.HasPrefix(id, "goal_") || len(id) > 40 {
		return 400, map[string]any{"error": "目标 id 不合法"}
	}
	if err := s.exec(ctx, "DELETE FROM race_goals WHERE id = ?", id); err != nil {
		return 500, map[string]any{"error": "删除失败：" + err.Error()}
	}
	return 200, map[string]any{"ok": true}
}
