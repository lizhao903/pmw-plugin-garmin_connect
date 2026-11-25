package main

import (
	"testing"
	"time"
)

func mustTime(s string) time.Time {
	t, err := time.ParseInLocation("2006-01-02 15:04", s, time.Local)
	if err != nil {
		panic(err)
	}
	return t
}

func TestHighIntensity(t *testing.T) {
	cases := []struct {
		effect    *float64
		anaerobic *float64
		label     string
		want      bool
	}{
		{f(4.8), nil, "", true},
		{nil, f(3.1), "", true},
		{nil, nil, "IMPROVING_VO2MAX_7", true},
		{nil, nil, "OVERREACHING", true},
		{f(3.2), f(2.4), "TEMPO", false},
		{nil, nil, "", false},
	}
	for _, c := range cases {
		if got := highIntensity(c.effect, c.anaerobic, c.label); got != c.want {
			t.Errorf("highIntensity(%v,%v,%q) = %v, want %v", c.effect, c.anaerobic, c.label, got, c.want)
		}
	}
}

func f(v float64) *float64 { return &v }

func TestDeriveRecoveryStatus(t *testing.T) {
	// 无指标
	if s := deriveRecoveryStatus("", 0, -1, 0, 0, 0, 0, 0); s.Level != "unknown" {
		t.Fatalf("无指标应为 unknown，得 %+v", s)
	}
	// 过度伸展：最高优先级
	if s := deriveRecoveryStatus("OVERREACHING", 0, 0, 30, 60, 100, 100, 10); s.Level != "low" || s.Label != "需要恢复" {
		t.Fatalf("OVERREACHING 应为需要恢复，得 %+v", s)
	}
	// 负荷偏高：高强度日 >= 2 且负荷超均值 25%
	if s := deriveRecoveryStatus("TEMPO", 3, 0, 70, 70, 130, 100, 10); s.Level != "low" || s.Label != "负荷偏高" {
		t.Fatalf("负荷偏高判定失败，得 %+v", s)
	}
	// 恢复中：1 个高强度日 + 最近 2 天跑过
	if s := deriveRecoveryStatus("TEMPO", 1, 1, 40, 60, 90, 100, 10); s.Level != "moderate" || s.Label != "恢复中" {
		t.Fatalf("恢复中判定失败，得 %+v", s)
	}
	// 减量期：本周跑量不足均值 55%
	if s := deriveRecoveryStatus("EASY", 0, 3, 24, 72, 50, 100, 10); s.Level != "moderate" || s.Label != "减量期" {
		t.Fatalf("减量期判定失败，得 %+v", s)
	}
	// 状态良好：休息 4 天以上
	if s := deriveRecoveryStatus("EASY", 0, 5, 30, 60, 40, 100, 10); s.Level != "good" || s.Label != "状态良好" {
		t.Fatalf("状态良好判定失败，得 %+v", s)
	}
	// 默认稳定
	if s := deriveRecoveryStatus("EASY", 0, 1, 60, 60, 100, 100, 10); s.Level != "good" || s.Label != "状态稳定" {
		t.Fatalf("默认应为状态稳定，得 %+v", s)
	}
}

func TestMetricsFromDetail(t *testing.T) {
	d := &runDetail{
		ActivityID: "123", StartLocal: "2026-11-10 07:30:00", TypeKey: "running",
		Summary: map[string]any{
			"activityTrainingLoad":  float64(120.5),
			"trainingEffect":        float64(5),
			"trainingEffectLabel":   "OVERREACHING",
			"differenceBodyBattery": float64(-40),
			"recoveryHeartRate":     float64(58),
			"distance":              float64(42195),
		},
	}
	args := metricsFromDetail(d)
	if len(args) != 18 {
		t.Fatalf("指标列数应为 18，得 %d", len(args))
	}
	if args[1] != "2026-11-10" {
		t.Errorf("day = %v，应为 2026-11-10", args[1])
	}
	if v, ok := args[4].(float64); !ok || v != 120.5 {
		t.Errorf("training_load = %v", args[4])
	}
	if args[7] != "OVERREACHING" {
		t.Errorf("te_label = %v", args[7])
	}
	if v, ok := args[8].(float64); !ok || v != -40 {
		t.Errorf("body_battery_delta = %v", args[8])
	}
	if args[10] != nil {
		t.Errorf("缺失的 resting_hr 应为 nil，得 %v", args[10])
	}
}

func TestWeekStart(t *testing.T) {
	// 2026-11-25 是周三，本周一应为 11-23
	in := mustTime("2026-11-25 14:00")
	got := weekStart(in).Format("2006-01-02")
	if got != "2026-11-23" {
		t.Errorf("weekStart = %s，应为 2026-11-23", got)
	}
	// 周日仍归当周（周一）
	in = mustTime("2026-11-29 10:00")
	got = weekStart(in).Format("2006-01-02")
	if got != "2026-11-23" {
		t.Errorf("周日 weekStart = %s，应为 2026-11-23", got)
	}
}
