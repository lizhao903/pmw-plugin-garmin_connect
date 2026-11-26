// powered by dsh - https://github.com/deepseek-ai/deepseek-harness

package main

// 训练预警：同步完成后按最近训练指标跑规则，结果落 training_alerts（每天每类一条）。
// 规则：静息心率抬升、负荷激增、连续高强度；只提醒，不替用户决策。

import (
	"context"
	"sort"
	"strconv"
	"time"
)

var alertLevels = map[string]bool{"moderate": true, "high": true}

type trainingAlert struct {
	Day       string `json:"day"`
	Kind      string `json:"kind"`
	Level     string `json:"level"`
	Title     string `json:"title"`
	Reason    string `json:"reason"`
	CreatedAt string `json:"created_at,omitempty"`
}

// evalAlerts 按最近 60 天指标算规则，返回当天要保留的预警；结果整体替换表中近 60 天数据。
func (s *server) evalAlerts(ctx context.Context) []trainingAlert {
	to := time.Now().Format("2006-01-02")
	from := time.Now().AddDate(0, 0, -59).Format("2006-01-02")
	rows, err := s.query(ctx, `SELECT day, resting_hr, training_load, te_label FROM activity_metrics
		WHERE day >= ? AND day <= ? ORDER BY day`, from, to)
	if err != nil || len(rows) == 0 {
		return []trainingAlert{}
	}
	today := time.Now()
	byDay := map[string]map[string]any{}
	for _, r := range rows {
		day, _ := r["day"].(string)
		cur := byDay[day]
		if cur == nil || numField(r, "training_load") > numField(cur, "training_load") {
			byDay[day] = r
		}
	}
	days := make([]string, 0, len(byDay))
	for d := range byDay {
		days = append(days, d)
	}
	sort.Strings(days)
	if len(days) == 0 {
		return []trainingAlert{}
	}

	out := []trainingAlert{}
	todayStr := today.Format("2006-01-02")
	avg := func(list []string, key string) float64 {
		sum, n := 0.0, 0
		for _, d := range list {
			v := numField(byDay[d], key)
			if v > 0 {
				sum += v
				n++
			}
		}
		if n == 0 {
			return 0
		}
		return sum / float64(n)
	}
	window := func(end int, size int) []string {
		hi := len(days) - end
		lo := hi - size
		if lo < 0 {
			lo = 0
		}
		if hi <= lo {
			return nil
		}
		return days[lo:hi]
	}

	// 静息心率：最近 3 次均值 vs 之前 14 次均值，抬高 ≥5 bpm。
	recent := window(0, 3)
	base := window(3, 14)
	rhr, rhrBase := avg(recent, "resting_hr"), avg(base, "resting_hr")
	if rhr > 0 && rhrBase > 0 && rhr >= rhrBase+5 {
		out = append(out, trainingAlert{Day: todayStr, Kind: "resting_hr", Level: "high",
			Title:  "静息心率抬升",
			Reason: "最近几次静息心率约 " + fmt1(rhr) + " bpm，比之前基线 " + fmt1(rhrBase) + " bpm 高 " + fmt1(rhr-rhrBase) + " bpm，留意睡眠与疲劳。"})
	}

	// 负荷激增：近 7 天日均负荷 vs 之前 28 天日均，>1.3 倍。
	load7, loadBase := avg(window(0, 7), "training_load"), avg(window(7, 28), "training_load")
	if load7 > 0 && loadBase > 0 && load7 > loadBase*1.3 {
		out = append(out, trainingAlert{Day: todayStr, Kind: "load_spike", Level: "high",
			Title:  "训练负荷增长过快",
			Reason: "近 7 天平均负荷 " + fmt1(load7) + "，是此前日均 " + fmt1(loadBase) + " 的 " + fmt1(load7/loadBase) + " 倍，建议这周别再加量。"})
	}

	// 连续高强度：最近连续 ≥3 个训练日被标高强度。
	streak := 0
	for i := len(days) - 1; i >= 0; i-- {
		if highIntensity(ptrFromRow(byDay[days[i]], "training_effect"), ptrFromRow(byDay[days[i]], "anaerobic_effect"), strOf(byDay[days[i]]["te_label"])) {
			streak++
		} else {
			break
		}
	}
	if streak >= 3 {
		out = append(out, trainingAlert{Day: todayStr, Kind: "high_streak", Level: "moderate",
			Title:  "连续高强度训练 " + strconv.Itoa(streak) + " 天",
			Reason: "最近 " + strconv.Itoa(streak) + " 个训练日都是高强度，安排一天轻松跑或休息更稳。"})
	}

	// 整体替换近 60 天的旧预警，避免升级规则后留着过期提醒。
	now := time.Now().Format(time.RFC3339)
	if err := s.exec(ctx, "DELETE FROM training_alerts WHERE day >= ?", from); err != nil {
		s.log.Warn("清理旧预警失败", "err", err)
	}
	for _, a := range out {
		if !alertLevels[a.Level] {
			a.Level = "moderate"
		}
		if err := s.exec(ctx, `INSERT INTO training_alerts(day, kind, level, title, reason, created_at)
			VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT(day, kind) DO UPDATE SET level=excluded.level, title=excluded.title, reason=excluded.reason, created_at=excluded.created_at`,
			a.Day, a.Kind, a.Level, a.Title, a.Reason, now); err != nil {
			s.log.Warn("写入预警失败", "kind", a.Kind, "err", err)
		}
	}
	return out
}

func (s *server) apiAlerts(ctx context.Context) (int, any) {
	rows, err := s.query(ctx, `SELECT day, kind, level, title, reason, created_at FROM training_alerts
		ORDER BY day DESC, kind LIMIT 30`)
	if err != nil {
		return 500, map[string]any{"error": "读取预警失败：" + err.Error()}
	}
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		out = append(out, map[string]any{
			"day": r["day"], "kind": r["kind"], "level": r["level"],
			"title": r["title"], "reason": r["reason"], "created_at": r["created_at"],
		})
	}
	return 200, map[string]any{"alerts": out}
}

func (s *server) apiDismissAlert(ctx context.Context, kind string) (int, any) {
	if kind == "" || len(kind) > 40 {
		return 400, map[string]any{"error": "预警类型不合法"}
	}
	if err := s.exec(ctx, "DELETE FROM training_alerts WHERE kind = ?", kind); err != nil {
		return 500, map[string]any{"error": "忽略失败：" + err.Error()}
	}
	return 200, map[string]any{"ok": true}
}
