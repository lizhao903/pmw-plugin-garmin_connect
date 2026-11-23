// powered by dsh - https://github.com/deepseek-ai/deepseek-harness

package main

// 我的训练计划（0.8.0）：用户自己新建、编辑、删除的计划，或从预置计划复制后改。
// 结构和前端预置计划一致：按周的课表，每节课 {kind, title, detail}；排进日历仍走 /calendar。

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
	"time"
)

var planKinds = map[string]bool{"run": true, "strength": true, "mixed": true}

type planSource struct {
	Type string `json:"type"`
	Name string `json:"name"`
	URL  string `json:"url"`
	Note string `json:"note"`
}

type planVideo struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	Creator string `json:"creator"`
}

var sourceTypes = map[string]bool{"": true, "self": true, "up": true, "coach": true, "book": true, "other": true}

type planInput struct {
	Source      planSource  `json:"source"`
	Videos      []planVideo `json:"videos"`
	Name        string      `json:"name"`
	Kind        string      `json:"kind"`
	Level       string      `json:"level"`
	Description string      `json:"description"`
	Days        []int       `json:"days"`
	Weeks       [][]calItem `json:"weeks"`
}

// check 校验并规整；calItem 复用日历条目的校验（日期不校验，给个占位）。
func (p *planInput) check() string {
	p.Name = strings.TrimSpace(p.Name)
	p.Level = strings.TrimSpace(p.Level)
	p.Description = strings.TrimSpace(p.Description)
	switch {
	case p.Name == "":
		return "计划名称不能为空"
	case len([]rune(p.Name)) > 40:
		return "计划名称最多 40 个字"
	case !planKinds[p.Kind]:
		return "类型只能是 run / strength / mixed"
	case len([]rune(p.Level)) > 10:
		return "难度最多 10 个字"
	case len([]rune(p.Description)) > 500:
		return "说明最多 500 个字"
	case len(p.Weeks) == 0 || len(p.Weeks) > 52:
		return "计划要有 1～52 周"
	}
	src := &p.Source
	src.Name, src.URL, src.Note = strings.TrimSpace(src.Name), strings.TrimSpace(src.URL), strings.TrimSpace(src.Note)
	switch {
	case !sourceTypes[src.Type]:
		return "来源类型只能是 self / up / coach / book / other"
	case src.Type == "up" && src.Name == "":
		return "来源是 UP 主时要填 UP 主名称"
	case len([]rune(src.Name)) > 40 || len([]rune(src.Note)) > 200:
		return "来源名称最多 40 个字、说明最多 200 个字"
	case !validURL(src.URL):
		return "主页链接要是 http(s) 开头的完整地址"
	case len(p.Videos) > 30:
		return "关联视频最多 30 个"
	}
	for i := range p.Videos {
		v := &p.Videos[i]
		v.Title, v.URL, v.Creator = strings.TrimSpace(v.Title), strings.TrimSpace(v.URL), strings.TrimSpace(v.Creator)
		if v.URL == "" || !validURL(v.URL) {
			return "关联视频第 " + strconv.Itoa(i+1) + " 个的链接要是 http(s) 开头的完整地址"
		}
		if len([]rune(v.Title)) > 100 || len([]rune(v.Creator)) > 40 {
			return "关联视频第 " + strconv.Itoa(i+1) + " 个的标题或 UP 主太长"
		}
	}
	seen := map[int]bool{}
	for _, d := range p.Days {
		if d < 1 || d > 7 || seen[d] {
			return "默认训练日只能是 1～7（周一到周日），不能重复"
		}
		seen[d] = true
	}
	total := 0
	for w := range p.Weeks {
		if len(p.Weeks[w]) > 7 {
			return "第 " + strconv.Itoa(w+1) + " 周最多 7 节课"
		}
		for j := range p.Weeks[w] {
			it := &p.Weeks[w][j]
			it.Date = "2000-01-01"
			if msg := it.check(); msg != "" {
				return "第 " + strconv.Itoa(w+1) + " 周第 " + strconv.Itoa(j+1) + " 节：" + msg
			}
			it.Date = ""
			total++
		}
	}
	if total == 0 {
		return "计划里至少要有一节课"
	}
	return ""
}

func (s *server) apiPlans(ctx context.Context) (int, any) {
	rows, err := s.query(ctx, "SELECT id, name, kind, level, description, days, weeks, source, videos, created_at, updated_at FROM custom_plans ORDER BY created_at")
	if err != nil {
		return 500, map[string]any{"error": "读取计划失败：" + err.Error()}
	}
	out := []map[string]any{}
	for _, r := range rows {
		var days []int
		var weeks [][]calItem
		_ = json.Unmarshal([]byte(strOf(r["days"])), &days)
		_ = json.Unmarshal([]byte(strOf(r["weeks"])), &weeks)
		var src planSource
		var vids []planVideo
		_ = json.Unmarshal([]byte(strOf(r["source"])), &src)
		_ = json.Unmarshal([]byte(strOf(r["videos"])), &vids)
		if vids == nil {
			vids = []planVideo{}
		}
		r["days"], r["weeks"], r["source"], r["videos"] = days, weeks, src, vids
		out = append(out, r)
	}
	return 200, map[string]any{"plans": out}
}

func strOf(v any) string {
	s, _ := v.(string)
	return s
}

func (s *server) savePlan(ctx context.Context, id string, body []byte) (int, any) {
	var in planInput
	if err := json.Unmarshal(body, &in); err != nil {
		return 400, map[string]any{"error": "请求不是合法 JSON"}
	}
	if msg := in.check(); msg != "" {
		return 400, map[string]any{"error": msg}
	}
	if in.Days == nil {
		in.Days = []int{}
	}
	if in.Videos == nil {
		in.Videos = []planVideo{}
	}
	days, _ := json.Marshal(in.Days)
	weeks, _ := json.Marshal(in.Weeks)
	src, _ := json.Marshal(in.Source)
	vids, _ := json.Marshal(in.Videos)
	now := time.Now().Format(time.RFC3339)
	if id == "" {
		id = newID("plan_")
		if err := s.exec(ctx, `INSERT INTO custom_plans(id, name, kind, level, description, days, weeks, source, videos, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, in.Name, in.Kind, in.Level, in.Description, string(days), string(weeks), string(src), string(vids), now, now); err != nil {
			return 500, map[string]any{"error": "保存失败：" + err.Error()}
		}
		return 200, map[string]any{"ok": true, "id": id}
	}
	if !validPlanID(id) {
		return 400, map[string]any{"error": "计划 id 不合法"}
	}
	if rows, err := s.query(ctx, "SELECT id FROM custom_plans WHERE id = ?", id); err != nil || len(rows) == 0 {
		return 404, map[string]any{"error": "找不到这个计划"}
	}
	if err := s.exec(ctx, `UPDATE custom_plans SET name=?, kind=?, level=?, description=?, days=?, weeks=?, source=?, videos=?, updated_at=? WHERE id=?`,
		in.Name, in.Kind, in.Level, in.Description, string(days), string(weeks), string(src), string(vids), now, id); err != nil {
		return 500, map[string]any{"error": "保存失败：" + err.Error()}
	}
	return 200, map[string]any{"ok": true, "id": id}
}

func validPlanID(id string) bool {
	return strings.HasPrefix(id, "plan_") && len(id) <= 40 && safeID(id)
}

func (s *server) apiDeletePlan(ctx context.Context, id string) (int, any) {
	if !validPlanID(id) {
		return 400, map[string]any{"error": "计划 id 不合法"}
	}
	if err := s.exec(ctx, "DELETE FROM custom_plans WHERE id = ?", id); err != nil {
		return 500, map[string]any{"error": "删除失败：" + err.Error()}
	}
	return 200, map[string]any{"ok": true}
}
