// powered by dsh - https://github.com/deepseek-ai/deepseek-harness

package main

// 推荐视频库（0.8.0）：用户收录的训练视频链接（B 站、YouTube、抖音等），带 UP 主和主页链接；
// 计划可以关联视频、每节课可以挂一个视频。只存链接，不抓取外站内容。

import (
	"context"
	"encoding/json"
	"net/url"
	"strings"
	"time"
)

var videoCategories = map[string]bool{"run": true, "strength": true, "stretch": true, "other": true}

// validURL：只认 http(s) 绝对地址，最长 500。空串算合法（表示没填）。
func validURL(s string) bool {
	if s == "" {
		return true
	}
	if len(s) > 500 {
		return false
	}
	u, err := url.Parse(s)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}

type videoInput struct {
	Title      string `json:"title"`
	URL        string `json:"url"`
	Creator    string `json:"creator"`
	CreatorURL string `json:"creator_url"`
	Category   string `json:"category"`
	Note       string `json:"note"`
}

func (v *videoInput) check() string {
	for _, p := range []*string{&v.Title, &v.URL, &v.Creator, &v.CreatorURL, &v.Note} {
		*p = strings.TrimSpace(*p)
	}
	if v.Category == "" {
		v.Category = "run"
	}
	switch {
	case v.Title == "":
		return "视频标题不能为空"
	case len([]rune(v.Title)) > 100:
		return "标题最多 100 个字"
	case v.URL == "" || !validURL(v.URL):
		return "视频链接要是 http(s) 开头的完整地址"
	case !validURL(v.CreatorURL):
		return "UP 主主页链接要是 http(s) 开头的完整地址"
	case len([]rune(v.Creator)) > 40:
		return "UP 主名称最多 40 个字"
	case !videoCategories[v.Category]:
		return "类别只能是 run / strength / stretch / other"
	case len([]rune(v.Note)) > 500:
		return "说明最多 500 个字"
	}
	return ""
}

func (s *server) apiVideos(ctx context.Context) (int, any) {
	rows, err := s.query(ctx, "SELECT id, title, url, creator, creator_url, category, note, created_at, updated_at FROM videos ORDER BY created_at DESC")
	if err != nil {
		return 500, map[string]any{"error": "读取视频失败：" + err.Error()}
	}
	if rows == nil {
		rows = []map[string]any{}
	}
	return 200, map[string]any{"videos": rows}
}

func validVideoID(id string) bool {
	return strings.HasPrefix(id, "vid_") && len(id) <= 40 && safeID(id)
}

func (s *server) saveVideo(ctx context.Context, id string, body []byte) (int, any) {
	var in videoInput
	if err := json.Unmarshal(body, &in); err != nil {
		return 400, map[string]any{"error": "请求不是合法 JSON"}
	}
	if msg := in.check(); msg != "" {
		return 400, map[string]any{"error": msg}
	}
	now := time.Now().Format(time.RFC3339)
	if id == "" {
		id = newID("vid_")
		if err := s.exec(ctx, `INSERT INTO videos(id, title, url, creator, creator_url, category, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			id, in.Title, in.URL, in.Creator, in.CreatorURL, in.Category, in.Note, now, now); err != nil {
			return 500, map[string]any{"error": "保存失败：" + err.Error()}
		}
		return 200, map[string]any{"ok": true, "id": id}
	}
	if !validVideoID(id) {
		return 400, map[string]any{"error": "视频 id 不合法"}
	}
	if err := s.exec(ctx, `UPDATE videos SET title=?, url=?, creator=?, creator_url=?, category=?, note=?, updated_at=? WHERE id=?`,
		in.Title, in.URL, in.Creator, in.CreatorURL, in.Category, in.Note, now, id); err != nil {
		return 500, map[string]any{"error": "保存失败：" + err.Error()}
	}
	return 200, map[string]any{"ok": true, "id": id}
}

func (s *server) apiDeleteVideo(ctx context.Context, id string) (int, any) {
	if !validVideoID(id) {
		return 400, map[string]any{"error": "视频 id 不合法"}
	}
	if err := s.exec(ctx, "DELETE FROM videos WHERE id = ?", id); err != nil {
		return 500, map[string]any{"error": "删除失败：" + err.Error()}
	}
	return 200, map[string]any{"ok": true}
}
