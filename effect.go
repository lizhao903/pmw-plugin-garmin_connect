// powered by dsh - https://github.com/deepseek-ai/deepseek-harness

package main

// 训练效果评估：按心率区间归一看配速趋势（同样心率下是否跑得更快），以及每周强度分布。
// 数据源是已落库的 activity_metrics，不额外请求 Garmin。

import (
	"context"
	"math"
	"sort"
	"strconv"
	"time"
)

type effectPoint struct {
	Day      string  `json:"day"`
	Zone     int     `json:"zone"`
	PaceS    float64 `json:"pace_s"`
	HR       float64 `json:"hr"`
	Distance float64 `json:"distance_m"`
}

type effectWeek struct {
	Week  string         `json:"week"`
	Zones map[string]int `json:"zones"` // "1"～"5" 各区间训练次数
	Km    float64        `json:"km"`
}

func hrZoneOf(hr float64, boundaries []float64) int {
	if hr <= 0 {
		return 0
	}
	z := 1
	for i, b := range boundaries {
		if hr >= b {
			z = i + 1
		}
	}
	if z > 5 {
		z = 5
	}
	return z
}

// mondayOf 返回所在周的周一（YYYY-MM-DD）。
func mondayOf(day string) string {
	t, err := time.ParseInLocation("2006-01-02", day, time.Local)
	if err != nil {
		return day
	}
	d := t.AddDate(0, 0, -((int(t.Weekday()) + 6) % 7))
	return d.Format("2006-01-02")
}

func (s *server) apiEffect(ctx context.Context, days int) (int, any) {
	if days < 7 {
		days = 7
	}
	if days > 365 {
		days = 365
	}
	from := time.Now().AddDate(0, 0, -(days - 1)).Format("2006-01-02")
	rows, err := s.query(ctx, `SELECT day, avg_hr, distance_m, duration_s FROM activity_metrics
		WHERE day >= ? AND avg_hr > 0 AND distance_m > 0 AND duration_s > 0 ORDER BY day`, from)
	if err != nil {
		return 500, map[string]any{"error": "读取训练指标失败：" + err.Error()}
	}
	bounds := s.loadHRPrefs(ctx).Boundaries
	points := make([]effectPoint, 0, len(rows))
	weeks := map[string]*effectWeek{}
	for _, r := range rows {
		day, _ := r["day"].(string)
		hr, dist, dur := numField(r, "avg_hr"), numField(r, "distance_m"), numField(r, "duration_s")
		zone := hrZoneOf(hr, bounds)
		pace := dur / (dist / 1000)
		points = append(points, effectPoint{Day: day, Zone: zone, PaceS: pace, HR: hr, Distance: dist})
		wk := mondayOf(day)
		w := weeks[wk]
		if w == nil {
			w = &effectWeek{Week: wk, Zones: map[string]int{"1": 0, "2": 0, "3": 0, "4": 0, "5": 0}}
			weeks[wk] = w
		}
		if zone >= 1 && zone <= 5 {
			w.Zones[strconv.Itoa(zone)]++
		}
		w.Km += dist / 1000
	}
	wkList := make([]*effectWeek, 0, len(weeks))
	for _, w := range weeks {
		w.Km = math.Round(w.Km*10) / 10
		wkList = append(wkList, w)
	}
	sort.Slice(wkList, func(i, j int) bool { return wkList[i].Week < wkList[j].Week })

	// 每个区间给「配速随时间的斜率」：负值表示同样心率越跑越快。回归按天序号算。
	trends := map[string]any{}
	for z := 1; z <= 5; z++ {
		xs, ys := []float64{}, []float64{}
		baseDay := time.Now().AddDate(0, 0, -(days - 1))
		for _, p := range points {
			if p.Zone != z {
				continue
			}
			t, err := time.ParseInLocation("2006-01-02", p.Day, time.Local)
			if err != nil {
				continue
			}
			xs = append(xs, t.Sub(baseDay).Hours()/24)
			ys = append(ys, p.PaceS)
		}
		trends[strconv.Itoa(z)] = map[string]any{
			"count": len(xs), "slope": slope(xs, ys),
			"pace_first": firstLast(ys, true), "pace_last": firstLast(ys, false),
		}
	}

	return 200, map[string]any{
		"days": days, "from": from, "points": points, "weeks": wkList, "trends": trends,
		"hr_source": map[string]any{"calibrated": len(bounds) > 0, "boundaries": bounds},
	}
}

func slope(xs, ys []float64) float64 {
	if len(xs) < 2 || len(xs) != len(ys) {
		return 0
	}
	var sx, sy, sxx, sxy float64
	for i := range xs {
		sx += xs[i]
		sy += ys[i]
		sxx += xs[i] * xs[i]
		sxy += xs[i] * ys[i]
	}
	n := float64(len(xs))
	den := n*sxx - sx*sx
	if den == 0 {
		return 0
	}
	return (n*sxy - sx*sy) / den // 秒/公里/天，负数=越跑越快
}

func firstLast(ys []float64, first bool) float64 {
	if len(ys) == 0 {
		return 0
	}
	if first {
		return ys[0]
	}
	return ys[len(ys)-1]
}
