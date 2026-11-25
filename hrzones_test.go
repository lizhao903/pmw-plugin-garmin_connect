package main

import "testing"

func TestFmtPaceUnit(t *testing.T) {
	if got := fmtPaceUnit(360, "km"); got != "6'00\"/km" {
		t.Fatalf("km 配速 = %q", got)
	}
	if got := fmtPaceUnit(360, "mile"); got != "9'39\"/mile" {
		t.Fatalf("mile 配速 = %q", got)
	}
	if got := fmtPaceSec(359.6); got != "6'00\"/km" {
		t.Fatalf("旧调用 = %q", got)
	}
}

func TestDerivedHRBoundaries(t *testing.T) {
	got := derivedHRBoundaries(180)
	want := []float64{90, 108, 126, 144, 162}
	if len(got) != len(want) {
		t.Fatalf("区间数 = %d", len(got))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("区间 %d 下界 = %.0f，期望 %.0f", i+1, got[i], want[i])
		}
	}
}

func TestHRZoneLines(t *testing.T) {
	zones := []map[string]any{
		{"zoneNumber": 2.0, "zoneLowBoundary": 130.0, "secsInZone": 600.0},
		{"zoneNumber": 1.0, "zoneLowBoundary": 110.0, "secsInZone": 400.0},
	}
	lines := hrZoneLines(zones, "calibrated")
	if len(lines) != 3 || lines[0] != "【心率区间（来源：用户校准）】" {
		t.Fatalf("区间摘要 = %#v", lines)
	}
	if lines[1] != "区间1（≥110 bpm）：6:40，占 40%" {
		t.Fatalf("区间 1 = %q", lines[1])
	}
	if lines[2] != "区间2（≥130 bpm）：10:00，占 60%" {
		t.Fatalf("区间 2 = %q", lines[2])
	}
}
