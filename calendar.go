// powered by dsh - https://github.com/deepseek-ai/deepseek-harness

package main

// 训练日历（0.6.0）：某天安排的训练（跑步 / 力量 / 休息 / 其他）。预置训练计划在前端，
// 「应用到日历」时前端按开始日期和每周训练日算好日期，一次 POST 进来，记同一个 plan_run，可整批删除。
// 读日历时一并回这段日期里实际做过的活动，前端据此标「已完成」。

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var dateRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

var calendarKinds = map[string]bool{"run": true, "strength": true, "rest": true, "other": true}

func newID(prefix string) string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return prefix + hex.EncodeToString(b)
}

func validDate(s string) bool {
	if !dateRe.MatchString(s) {
		return false
	}
	_, err := time.Parse("2006-01-02", s)
	return err == nil
}

type calItem struct {
	Date   string `json:"date,omitempty"`
	Kind   string `json:"kind"`
	Title  string `json:"title"`
	Detail string `json:"detail"`
	// Video 是这节课挂的视频链接（可空，0.8.0）
	Video string `json:"video,omitempty"`
	// 目标量（0.10.0）：距离单位米、时长单位秒；都填时达成率取低的一个。
	TargetDistanceM float64 `json:"target_distance_m,omitempty"`
	TargetDurationS int     `json:"target_duration_s,omitempty"`
}

func (it *calItem) check() string {
	it.Title = strings.TrimSpace(it.Title)
	it.Detail = strings.TrimSpace(it.Detail)
	it.Video = strings.TrimSpace(it.Video)
	switch {
	case !validDate(it.Date):
		return "日期格式应为 YYYY-MM-DD"
	case !calendarKinds[it.Kind]:
		return "类型只能是 run / strength / rest / other"
	case it.Title == "":
		return "标题不能为空"
	case len([]rune(it.Title)) > 60:
		return "标题最多 60 个字"
	case len([]rune(it.Detail)) > 2000:
		return "内容最多 2000 个字"
	case !validURL(strings.TrimSpace(it.Video)):
		return "视频链接要是 http(s) 开头的完整地址"
	case it.TargetDistanceM < 0 || it.TargetDistanceM > 1000000:
		return "目标距离应在 0～1000 公里之间"
	case it.TargetDurationS < 0 || it.TargetDurationS > 86400:
		return "目标时长应在 0～24 小时之间"
	}
	return ""
}

func (s *server) apiCalendar(ctx context.Context, from, to string) (int, any) {
	if !validDate(from) || !validDate(to) || from > to {
		return 400, map[string]any{"error": "from、to 应为 YYYY-MM-DD，且 from 不晚于 to"}
	}
	items, err := s.query(ctx, `SELECT id, date, kind, title, detail, video, target_distance_m, target_duration_s,
		plan_key, plan_name, plan_run, done, created_at, updated_at
		FROM calendar_items WHERE date >= ? AND date <= ? ORDER BY date, created_at`, from, to)
	if err != nil {
		return 500, map[string]any{"error": "读取日历失败：" + err.Error()}
	}
	acts, err := s.query(ctx, `SELECT activity_id, start_time, activity_name, type_key,
		COALESCE(corrected_distance_m, distance_m) AS distance_m, duration_s
		FROM runs WHERE substr(start_time, 1, 10) >= ? AND substr(start_time, 1, 10) <= ? ORDER BY start_time`, from, to)
	if err != nil {
		return 500, map[string]any{"error": "读取活动失败：" + err.Error()}
	}
	if items == nil {
		items = []map[string]any{}
	}
	if acts == nil {
		acts = []map[string]any{}
	}
	return 200, map[string]any{"items": items, "activities": acts}
}

func (s *server) apiAddCalendar(ctx context.Context, body []byte) (int, any) {
	var in struct {
		Items    []calItem `json:"items"`
		PlanKey  string    `json:"plan_key"`
		PlanName string    `json:"plan_name"`
	}
	if err := json.Unmarshal(body, &in); err != nil {
		return 400, map[string]any{"error": "请求不是合法 JSON"}
	}
	if len(in.Items) == 0 || len(in.Items) > 400 {
		return 400, map[string]any{"error": "一次要加 1～400 条"}
	}
	for i := range in.Items {
		if msg := in.Items[i].check(); msg != "" {
			return 400, map[string]any{"error": "第 " + strconv.Itoa(i+1) + " 条：" + msg}
		}
	}
	planRun := ""
	if strings.TrimSpace(in.PlanKey) != "" {
		planRun = newID("run_")
	}
	now := time.Now().Format(time.RFC3339)
	ids := []string{}
	for _, it := range in.Items {
		id := newID("cal_")
		if err := s.exec(ctx, `INSERT INTO calendar_items(id, date, kind, title, detail, video, target_distance_m, target_duration_s, plan_key, plan_name, plan_run, done, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
			id, it.Date, it.Kind, it.Title, it.Detail, it.Video, it.TargetDistanceM, it.TargetDurationS, strings.TrimSpace(in.PlanKey), strings.TrimSpace(in.PlanName), planRun, now, now); err != nil {
			return 500, map[string]any{"error": "保存失败：" + err.Error(), "saved": ids}
		}
		ids = append(ids, id)
	}
	return 200, map[string]any{"ok": true, "ids": ids, "plan_run": planRun}
}

func (s *server) apiUpdateCalendar(ctx context.Context, id string, body []byte) (int, any) {
	if !strings.HasPrefix(id, "cal_") || len(id) > 40 {
		return 400, map[string]any{"error": "日历条目 id 不合法"}
	}
	rows, err := s.query(ctx, "SELECT date, kind, title, detail, video, target_distance_m, target_duration_s, done FROM calendar_items WHERE id = ?", id)
	if err != nil || len(rows) == 0 {
		return 404, map[string]any{"error": "找不到这条安排"}
	}
	cur := calItem{}
	cur.Date, _ = rows[0]["date"].(string)
	cur.Kind, _ = rows[0]["kind"].(string)
	cur.Title, _ = rows[0]["title"].(string)
	cur.Detail, _ = rows[0]["detail"].(string)
	cur.Video, _ = rows[0]["video"].(string)
	cur.TargetDistanceM = numField(rows[0], "target_distance_m")
	cur.TargetDurationS = int(numField(rows[0], "target_duration_s"))
	done := numField(rows[0], "done") != 0
	var in struct {
		Date            *string  `json:"date"`
		Kind            *string  `json:"kind"`
		Title           *string  `json:"title"`
		Detail          *string  `json:"detail"`
		Video           *string  `json:"video"`
		TargetDistanceM *float64 `json:"target_distance_m"`
		TargetDurationS *int     `json:"target_duration_s"`
		Done            *bool    `json:"done"`
	}
	if err := json.Unmarshal(body, &in); err != nil {
		return 400, map[string]any{"error": "请求不是合法 JSON"}
	}
	if in.Date != nil {
		cur.Date = *in.Date
	}
	if in.Kind != nil {
		cur.Kind = *in.Kind
	}
	if in.Title != nil {
		cur.Title = *in.Title
	}
	if in.Detail != nil {
		cur.Detail = *in.Detail
	}
	if in.Video != nil {
		cur.Video = *in.Video
	}
	if in.TargetDistanceM != nil {
		cur.TargetDistanceM = *in.TargetDistanceM
	}
	if in.TargetDurationS != nil {
		cur.TargetDurationS = *in.TargetDurationS
	}
	if in.Done != nil {
		done = *in.Done
	}
	if msg := cur.check(); msg != "" {
		return 400, map[string]any{"error": msg}
	}
	d := 0
	if done {
		d = 1
	}
	if err := s.exec(ctx, "UPDATE calendar_items SET date=?, kind=?, title=?, detail=?, video=?, target_distance_m=?, target_duration_s=?, done=?, updated_at=? WHERE id=?",
		cur.Date, cur.Kind, cur.Title, cur.Detail, cur.Video, cur.TargetDistanceM, cur.TargetDurationS, d, time.Now().Format(time.RFC3339), id); err != nil {
		return 500, map[string]any{"error": "保存失败：" + err.Error()}
	}
	return 200, map[string]any{"ok": true}
}

func (s *server) apiDeleteCalendar(ctx context.Context, id string) (int, any) {
	if !strings.HasPrefix(id, "cal_") || len(id) > 40 {
		return 400, map[string]any{"error": "日历条目 id 不合法"}
	}
	if err := s.exec(ctx, "DELETE FROM calendar_items WHERE id = ?", id); err != nil {
		return 500, map[string]any{"error": "删除失败：" + err.Error()}
	}
	return 200, map[string]any{"ok": true}
}

// apiDeletePlanRun 删掉一次「应用到日历」排进来的全部安排；future 为真时只删今天及以后的。
func (s *server) apiDeletePlanRun(ctx context.Context, planRun string, future bool) (int, any) {
	if !strings.HasPrefix(planRun, "run_") || len(planRun) > 40 {
		return 400, map[string]any{"error": "计划批次 id 不合法"}
	}
	sql := "DELETE FROM calendar_items WHERE plan_run = ?"
	args := []any{planRun}
	if future {
		sql += " AND date >= ?"
		args = append(args, time.Now().Format("2006-01-02"))
	}
	if err := s.exec(ctx, sql, args...); err != nil {
		return 500, map[string]any{"error": "删除失败：" + err.Error()}
	}
	return 200, map[string]any{"ok": true}
}
