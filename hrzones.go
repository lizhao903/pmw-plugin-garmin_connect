// powered by dsh - https://github.com/deepseek-ai/deepseek-harness

package main

// 心率区间校准：用户录入最大心率或 5 段下界后，按活动的逐点心率重算区间用时。
// 未配置或没有逐点心率时，沿用 Garmin 的 hrTimeInZones 原值。

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"time"
)

type hrZonePrefs struct {
	MaxHR      float64   `json:"max_hr"`
	Boundaries []float64 `json:"boundaries"`
	UpdatedAt  string    `json:"updated_at"`
}

func (s *server) loadHRPrefs(ctx context.Context) hrZonePrefs {
	var p hrZonePrefs
	rows, err := s.query(ctx, "SELECT max_hr, boundaries, updated_at FROM hr_zone_prefs WHERE id = 1")
	if err != nil || len(rows) == 0 {
		return p
	}
	p.MaxHR = numField(rows[0], "max_hr")
	p.UpdatedAt, _ = rows[0]["updated_at"].(string)
	if raw, _ := rows[0]["boundaries"].(string); raw != "" {
		_ = json.Unmarshal([]byte(raw), &p.Boundaries)
	}
	return p
}

func (s *server) hrZonesUpdatedAt(ctx context.Context) string {
	return s.loadHRPrefs(ctx).UpdatedAt
}

func (s *server) apiGetHRZones(ctx context.Context) (int, any) {
	p := s.loadHRPrefs(ctx)
	return 200, map[string]any{"max_hr": p.MaxHR, "boundaries": p.Boundaries, "updated_at": p.UpdatedAt}
}

// derivedHRBoundaries 按 Garmin 常用的 50/60/70/80/90% 最大心率生成 5 段下界。
func derivedHRBoundaries(maxHR float64) []float64 {
	out := make([]float64, 0, 5)
	for _, f := range []float64{0.5, 0.6, 0.7, 0.8, 0.9} {
		out = append(out, float64(int(maxHR*f+0.5)))
	}
	return out
}

func (s *server) apiSaveHRZones(ctx context.Context, body []byte) (int, any) {
	var in struct {
		MaxHR      float64   `json:"max_hr"`
		Boundaries []float64 `json:"boundaries"`
	}
	if err := json.Unmarshal(body, &in); err != nil {
		return 400, map[string]any{"error": "请求不是合法 JSON"}
	}
	if in.MaxHR <= 0 {
		// 清空配置：传 max_hr = 0 即恢复 Garmin 原值
		if err := s.exec(ctx, "DELETE FROM hr_zone_prefs WHERE id = 1"); err != nil {
			return 500, map[string]any{"error": "保存失败：" + err.Error()}
		}
		return 200, map[string]any{"ok": true, "max_hr": 0, "boundaries": []float64{}, "updated_at": ""}
	}
	if in.MaxHR < 100 || in.MaxHR > 240 {
		return 400, map[string]any{"error": "最大心率填 100～240 bpm"}
	}
	if len(in.Boundaries) > 5 {
		return 400, map[string]any{"error": "最多 5 个区间下界"}
	}
	for _, b := range in.Boundaries {
		if b < 80 || b > in.MaxHR {
			return 400, map[string]any{"error": "区间下界要在 80～最大心率之间"}
		}
	}
	sort.Float64s(in.Boundaries)
	if len(in.Boundaries) == 0 {
		in.Boundaries = derivedHRBoundaries(in.MaxHR)
	}
	raw, _ := json.Marshal(in.Boundaries)
	updated := time.Now().Format(time.RFC3339)
	err := s.exec(ctx, `INSERT INTO hr_zone_prefs(id, max_hr, boundaries, updated_at) VALUES (1, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET max_hr=excluded.max_hr, boundaries=excluded.boundaries, updated_at=excluded.updated_at`,
		in.MaxHR, string(raw), updated)
	if err != nil {
		return 500, map[string]any{"error": "保存失败：" + err.Error()}
	}
	return 200, map[string]any{"ok": true, "max_hr": in.MaxHR, "boundaries": in.Boundaries, "updated_at": updated}
}

// effectiveHRZones 优先用用户边界重算；逐点数据不足时回退 Garmin 原值并标明来源。
func (s *server) effectiveHRZones(ctx context.Context, d *runDetail) ([]map[string]any, string) {
	p := s.loadHRPrefs(ctx)
	if p.MaxHR <= 0 || len(p.Boundaries) == 0 || d == nil {
		return d.hrZonesOrNil(), "garmin"
	}
	hr := d.Series["directHeartRate"]
	if len(hr) < 2 {
		return d.hrZonesOrNil(), "garmin"
	}
	t := d.Series["sumDuration"]
	if len(t) == 0 {
		t = d.Series["sumElapsedDuration"]
	}
	secs := make([]float64, 5)
	prev := float64(0)
	for i, v := range hr {
		at := float64(i)
		if i < len(t) && t[i] != nil {
			at = *t[i]
		}
		dur := at - prev
		prev = at
		// 没有累计时间时按每点 1 秒；异常间隔不让它吞掉整段
		if dur <= 0 || dur > 300 {
			dur = 1
		}
		if v == nil || *v <= 0 {
			continue
		}
		zone := 1
		for j, b := range p.Boundaries {
			if *v >= b {
				zone = j + 1
			}
		}
		if zone > 5 {
			zone = 5
		}
		secs[zone-1] += dur
	}
	total := float64(0)
	for _, v := range secs {
		total += v
	}
	if total <= 0 {
		return d.hrZonesOrNil(), "garmin"
	}
	out := make([]map[string]any, 0, 5)
	for i, v := range secs {
		out = append(out, map[string]any{
			"zoneNumber":      i + 1,
			"zoneLowBoundary": p.Boundaries[i],
			"secsInZone":      v,
		})
	}
	return out, "calibrated"
}

func (d *runDetail) hrZonesOrNil() []map[string]any {
	if d == nil {
		return nil
	}
	return d.HRZones
}

// hrZoneLines 给 AI 提示词用，按区间编号排序，标出来源。
func hrZoneLines(zones []map[string]any, source string) []string {
	if len(zones) == 0 {
		return nil
	}
	sort.SliceStable(zones, func(i, j int) bool {
		return numField(zones[i], "zoneNumber") < numField(zones[j], "zoneNumber")
	})
	label := "Garmin"
	if source == "calibrated" {
		label = "用户校准"
	}
	out := []string{"【心率区间（来源：" + label + "）】"}
	total := float64(0)
	for _, z := range zones {
		total += numField(z, "secsInZone")
	}
	for _, z := range zones {
		secs := numField(z, "secsInZone")
		pct := float64(0)
		if total > 0 {
			pct = secs / total * 100
		}
		line := fmt.Sprintf("区间%.0f（≥%.0f bpm）：%s，占 %.0f%%",
			numField(z, "zoneNumber"), numField(z, "zoneLowBoundary"), fmtDur(secs), pct)
		out = append(out, line)
	}
	return out
}
