// powered by dsh - https://github.com/deepseek-ai/deepseek-harness

package main

import (
	"math"
	"testing"
	"time"
)

func TestGoalPhase(t *testing.T) {
	today := time.Date(2026, 11, 26, 12, 0, 0, 0, time.Local)
	cases := []struct {
		date string
		want string
	}{
		{"2026-11-30", "比赛周"},
		{"2026-12-10", "减量期"},
		{"2026-12-30", "专项期"},
		{"2027-02-10", "强化期"},
		{"2027-05-10", "基础期"},
	}
	for _, c := range cases {
		p := goalPhase(goalRow{ID: "goal_1", Date: c.date}, today)
		if p == nil || p["phase"] != c.want {
			t.Errorf("%s 阶段=%v，应为 %s", c.date, p, c.want)
		}
	}
	if goalPhase(goalRow{ID: "goal_1"}, today) != nil {
		t.Error("没有日期的目标不应有阶段")
	}
	if goalPhase(goalRow{Date: "2026-12-01"}, today) != nil {
		t.Error("没有 id 的目标不应有阶段")
	}
}

func TestRiegel(t *testing.T) {
	got := riegel(3600, 10, 21.0975, 1.06)
	if got < 7800 || got > 8200 {
		t.Fatalf("10km 1h 外推半马应约 2h，实际 %.0f s", got)
	}
	if riegel(3600, 10, 21, 1.10) <= got {
		t.Error("保守指数应给出更慢成绩")
	}
	if riegel(3600, 10, 21, 1.02) >= got {
		t.Error("理想指数应给出更快成绩")
	}
	if riegel(0, 10, 21, 1.06) != 0 || riegel(3600, 0, 21, 1.06) != 0 {
		t.Error("缺基准值应返回 0")
	}
}

func TestHRZoneOf(t *testing.T) {
	// 5 个边界分别是 Z1～Z5 的下界（与 hrzones.go 一致）
	b := []float64{100, 120, 140, 160, 180}
	for hr, want := range map[float64]int{100: 1, 125: 2, 145: 3, 165: 4, 185: 5, 0: 0} {
		if got := hrZoneOf(hr, b); got != want {
			t.Errorf("hr=%.0f 区间=%d，应为 %d", hr, got, want)
		}
	}
	if hrZoneOf(150, nil) != 1 {
		t.Error("没有校准边界时应全部落在区间 1")
	}
}

func TestEffectSlope(t *testing.T) {
	// 配速逐次下降 5 秒/公里 → 斜率为负（越跑越快）
	xs, ys := []float64{0, 1, 2, 3}, []float64{360, 355, 350, 345}
	if got := slope(xs, ys); math.Abs(got+5) > 0.01 {
		t.Fatalf("斜率应为 -5，实际 %.2f", got)
	}
	if slope([]float64{1}, []float64{360}) != 0 {
		t.Error("单点不应有斜率")
	}
	if slope(nil, nil) != 0 {
		t.Error("空数据不应有斜率")
	}
}

func TestWellbeingCheck(t *testing.T) {
	ok := wellbeingRow{Day: "2026-11-26", SleepH: 7.5, SleepQuality: 2, Fatigue: 1, Soreness: 0, Mood: 4}
	if msg := ok.check(); msg != "" {
		t.Fatalf("合法主观状态被拒：%s", msg)
	}
	for _, w := range []wellbeingRow{
		{Day: "2026/11/26"},
		{Day: "2026-11-26", SleepH: 25},
		{Day: "2026-11-26", Fatigue: 6},
		{Day: "2026-11-26", SleepQuality: -1},
	} {
		if w.check() == "" {
			t.Errorf("%+v 应拒绝", w)
		}
	}
}
