// powered by dsh - https://github.com/deepseek-ai/deepseek-harness

package main

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
)

func TestRoutePath(t *testing.T) {
	cases := map[string]string{
		"/runs":      "/runs",
		"/runs/123/": "/runs/123",
		"/plugins/external/garmin_connect/api/runs":   "/runs",
		"/plugins/external/garmin_connect/api/status": "/status",
		"/api/login": "/login",
		"/":          "/",
	}
	for in, want := range cases {
		if got := routePath(in); got != want {
			t.Errorf("routePath(%q) = %q，应为 %q", in, got, want)
		}
	}
}

func TestParseQuery(t *testing.T) {
	if q := parseQuery(json.RawMessage(`"refresh=1&x=2"`)); q.Get("refresh") != "1" {
		t.Fatalf("字符串查询串没解析出来：%v", q)
	}
	if q := parseQuery(json.RawMessage(`{"refresh":"1"}`)); q.Get("refresh") != "1" {
		t.Fatalf("对象形式没解析出来：%v", q)
	}
	if q := parseQuery(nil); len(q) != 0 {
		t.Fatalf("空查询应为空：%v", q)
	}
}

func TestValidActivityID(t *testing.T) {
	for _, id := range []string{"123", "21474836470"} {
		if !validActivityID(id) {
			t.Errorf("%s 应合法", id)
		}
	}
	for _, id := range []string{"", "abc", "1/2", "../x", "123456789012345678901"} {
		if validActivityID(id) {
			t.Errorf("%q 应不合法", id)
		}
	}
}

func TestJWTClientID(t *testing.T) {
	// 载荷 {"client_id":"GARMIN_X"}
	tok := "e30.eyJjbGllbnRfaWQiOiJHQVJNSU5fWCJ9.sig"
	if got := jwtClientID(tok, "fb"); got != "GARMIN_X" {
		t.Fatalf("取 client_id 失败：%s", got)
	}
	if got := jwtClientID("bad", "fb"); got != "fb" {
		t.Fatalf("取不到应回退：%s", got)
	}
}

func TestParseDetails(t *testing.T) {
	body := []byte(`{
	  "metricDescriptors":[{"metricsIndex":0,"key":"sumDistance"},{"metricsIndex":1,"key":"directHeartRate"},
	    {"metricsIndex":2,"key":"directLatitude"},{"metricsIndex":3,"key":"directLongitude"},{"metricsIndex":4,"key":"directBodyBattery"}],
	  "activityDetailMetrics":[{"metrics":[0,120,31.2,121.4,50]},{"metrics":[500,null,31.21,121.41,50]},{"metrics":[1000,150,31.22,121.42,49]}],
	  "geoPolylineDTO":null}`)
	series, track, err := parseDetails(body)
	if err != nil {
		t.Fatal(err)
	}
	if len(series["sumDistance"]) != 3 || series["directHeartRate"][1] != nil || *series["directHeartRate"][2] != 150 {
		t.Fatalf("指标数组不对：%+v", series)
	}
	if _, ok := series["directBodyBattery"]; ok {
		t.Fatal("不在白名单的指标不该留")
	}
	if _, ok := series["directLatitude"]; ok {
		t.Fatal("经纬度应并进轨迹，不留在曲线里")
	}
	if len(track) != 3 || track[2] != [2]float64{31.22, 121.42} {
		t.Fatalf("没有 polyline 时应用逐点经纬度拼轨迹：%v", track)
	}
	// 有 polyline 时用 polyline
	body2 := []byte(`{"metricDescriptors":[],"activityDetailMetrics":[],"geoPolylineDTO":{"polyline":[{"lat":1,"lon":2},{"lat":3,"lon":4}]}}`)
	_, track2, _ := parseDetails(body2)
	if len(track2) != 2 || track2[1] != [2]float64{3, 4} {
		t.Fatalf("polyline 轨迹不对：%v", track2)
	}
}

func TestSampleIdx(t *testing.T) {
	if got := sampleIdx(3, 10); len(got) != 3 {
		t.Fatalf("不足 n 个时全取：%v", got)
	}
	got := sampleIdx(1000, 5)
	if len(got) != 5 || got[0] != 0 || got[4] != 999 {
		t.Fatalf("应含首尾均匀取：%v", got)
	}
}

func TestCorrectedDistance(t *testing.T) {
	laps := []map[string]any{
		{"distance": 950.0, "duration": 360.0}, // 跑步机 10 km/h、6 分钟 → 1000 m
		{"distance": 1020.0, "duration": 300.0},
	}
	if got := correctedDistance(laps, nil); got != 0 {
		t.Fatalf("没有校正应回 0：%v", got)
	}
	got := correctedDistance(laps, map[string]float64{"0": 10})
	if got < 2019.9 || got > 2020.1 {
		t.Fatalf("第 1 段按 10 km/h 重算、第 2 段用原始距离，应为 2020：%v", got)
	}
}

func TestApiTileValidation(t *testing.T) {
	s := &server{}
	for _, p := range []string{"bad/1/0/0", "osm/0/0/0", "osm/19/0/0", "amap/3/8/0", "osm/3/-1/0", "osm/3/0", "osm/a/b/c"} {
		if code, _ := s.apiTile(context.Background(), p); code != 400 {
			t.Errorf("%s 应回 400，得到 %d", p, code)
		}
	}
	if u := tileURL("amap", 3, 1, 2); !strings.Contains(u, "autonavi.com") || !strings.Contains(u, "x=1&y=2&z=3") {
		t.Errorf("高德瓦片地址不对：%s", u)
	}
	if u := tileURL("osm", 3, 1, 2); u != "https://tile.openstreetmap.org/3/1/2.png" {
		t.Errorf("OSM 瓦片地址不对：%s", u)
	}
}

func TestIsRun(t *testing.T) {
	for _, k := range []string{"running", "treadmill_running", "trail_running", "virtual_run", "indoor_running"} {
		if !isRun(k) {
			t.Errorf("%s 应算跑步", k)
		}
	}
	for _, k := range []string{"cycling", "lap_swimming", "walking", ""} {
		if isRun(k) {
			t.Errorf("%s 不该算跑步", k)
		}
	}
}

func TestEditPayload(t *testing.T) {
	runs := []typeOption{{TypeID: 1, TypeKey: "running", ParentTypeID: 17}, {TypeID: 18, TypeKey: "treadmill_running", ParentTypeID: 1}}
	events := []typeOption{{TypeID: 1, TypeKey: "race"}, {TypeID: 9, TypeKey: "training"}}
	str := func(s string) *string { return &s }
	yes := true

	p, err := editPayload("123", editRequest{Name: str("  晨跑  "), TypeKey: str("treadmill_running"), EventType: str("race"), Favorite: &yes, Description: str("")}, runs, events)
	if err != nil {
		t.Fatal(err)
	}
	if p["activityId"] != "123" || p["activityName"] != "晨跑" || p["description"] != "" {
		t.Fatalf("名称应去空格、空描述也要发（用来清空）：%v", p)
	}
	at := p["activityTypeDTO"].(map[string]any)
	if at["typeId"] != 18 || at["typeKey"] != "treadmill_running" || at["parentTypeId"] != 1 {
		t.Fatalf("活动类型应带 Garmin 的 id：%v", at)
	}
	if p["eventTypeDTO"].(map[string]any)["typeId"] != 1 || p["metadataDTO"].(map[string]any)["favorite"] != true {
		t.Fatalf("类别、收藏不对：%v", p)
	}
	// 只改一项时只带这一项
	p, _ = editPayload("1", editRequest{Favorite: &yes}, nil, nil)
	if len(p) != 2 {
		t.Fatalf("只应带 activityId 和 metadataDTO：%v", p)
	}
	for name, in := range map[string]editRequest{
		"空名称":   {Name: str("  ")},
		"未知类型":  {TypeKey: str("cycling")},
		"未知类别":  {EventType: str("nope")},
		"什么都没改": {},
	} {
		if _, err := editPayload("1", in, runs, events); err == nil {
			t.Errorf("%s 应报错", name)
		}
	}
}
