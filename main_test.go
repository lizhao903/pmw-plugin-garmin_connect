// powered by dsh - https://github.com/deepseek-ai/deepseek-harness

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
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

func TestParseSets(t *testing.T) {
	b := []byte(`{"exerciseSets":[
	  {"setType":"ACTIVE","repetitionCount":10,"weight":60000,"duration":45,"startTime":"t1",
	   "exercises":[{"category":"BENCH_PRESS","name":"BARBELL_BENCH_PRESS","probability":80},{"category":"PUSH_UP","name":"PUSH_UP","probability":20}]},
	  {"setType":"REST","duration":90,"exercises":[]}]}`)
	sets := parseSets(b)
	if len(sets) != 2 || sets[0]["category"] != "BENCH_PRESS" || sets[0]["name"] != "BARBELL_BENCH_PRESS" || sets[0]["reps"] != 10.0 {
		t.Fatalf("训练组解析不对：%v", sets)
	}
	lines := setLines(sets)
	if len(lines) != 2 || !strings.Contains(lines[0], "重量60.0kg") || !strings.Contains(lines[1], "休息 1:30") {
		t.Fatalf("训练组文字不对：%v", lines)
	}
}

func TestCalItemCheck(t *testing.T) {
	ok := calItem{Date: "2026-11-30", Kind: "run", Title: " 轻松跑 6 公里 ", TargetDistanceM: 6000, TargetDurationS: 1800}
	if msg := ok.check(); msg != "" || ok.Title != "轻松跑 6 公里" {
		t.Fatalf("合法条目被拒：%s", msg)
	}
	for name, it := range map[string]calItem{
		"日期格式":   {Date: "2026/11/30", Kind: "run", Title: "x"},
		"不存在的日期": {Date: "2026-02-30", Kind: "run", Title: "x"},
		"类型":     {Date: "2026-11-30", Kind: "swim", Title: "x"},
		"空标题":    {Date: "2026-11-30", Kind: "rest", Title: "  "},
		"目标距离为负": {Date: "2026-11-30", Kind: "run", Title: "x", TargetDistanceM: -1},
		"目标距离过大": {Date: "2026-11-30", Kind: "run", Title: "x", TargetDistanceM: 1000001},
		"目标时长过大": {Date: "2026-11-30", Kind: "run", Title: "x", TargetDurationS: 86401},
		"配速倒挂":   {Date: "2026-11-30", Kind: "run", Title: "x", TargetPaceLoS: 420, TargetPaceHiS: 360},
		"配速过大":   {Date: "2026-11-30", Kind: "run", Title: "x", TargetPaceLoS: 3601},
		"心率区间越界": {Date: "2026-11-30", Kind: "run", Title: "x", TargetHRZoneLo: 6},
		"心率区间倒挂": {Date: "2026-11-30", Kind: "run", Title: "x", TargetHRZoneLo: 4, TargetHRZoneHi: 2},
	} {
		if it.check() == "" {
			t.Errorf("%s 应拒绝", name)
		}
	}
	for name, it := range map[string]calItem{
		"配速区间": {Date: "2026-11-30", Kind: "run", Title: "x", TargetPaceLoS: 330, TargetPaceHiS: 390},
		"心率区间": {Date: "2026-11-30", Kind: "run", Title: "x", TargetHRZoneLo: 2, TargetHRZoneHi: 3},
	} {
		if msg := it.check(); msg != "" {
			t.Errorf("%s 应通过：%s", name, msg)
		}
	}
}

func TestAnalysisText(t *testing.T) {
	if got := fmtPaceSec(359.6); got != "6'00\"/km" {
		t.Fatalf("配速进位不对：%s", got)
	}
	laps := []map[string]any{{"distance": 950.0, "duration": 360.0, "intensityType": "INTERVAL", "averageHR": 150.0, "maxHR": 160.0}}
	lines := lapLines(laps, map[string]float64{"0": 10})
	if len(lines) != 1 || !strings.Contains(lines[0], "1.00km") || !strings.Contains(lines[0], "按跑步机 10.0 km/h 校正") {
		t.Fatalf("分段文字不对：%v", lines)
	}
	sum := summaryLines(map[string]any{"distance": 10000.0, "duration": 3000.0, "averageHR": 150.0, "strideLength": 105.0}, 0)
	joined := strings.Join(sum, "\n")
	if !strings.Contains(joined, "平均配速：5'00\"/km") || !strings.Contains(joined, "平均步幅：1.05 m") {
		t.Fatalf("概要文字不对：%s", joined)
	}
	if !isTracked("strength_training") || isTracked("cycling") {
		t.Fatal("收录范围不对")
	}
}

func TestParseRange(t *testing.T) {
	cases := []struct {
		h          string
		start, end int64
		ok         bool
	}{
		{"bytes=0-99", 0, 99, true}, {"bytes=100-", 100, 999, true}, {"bytes=-200", 800, 999, true},
		{"bytes=900-5000", 900, 999, true}, {"bytes=1000-", 0, 0, false}, {"bytes=5-2", 0, 0, false},
		{"bytes=0-1,5-9", 0, 0, false}, {"items=0-1", 0, 0, false}, {"", 0, 0, false},
	}
	for _, c := range cases {
		s, e, ok := parseRange(c.h, 1000)
		if ok != c.ok || (ok && (s != c.start || e != c.end)) {
			t.Errorf("parseRange(%q) = %d,%d,%v，应为 %d,%d,%v", c.h, s, e, ok, c.start, c.end, c.ok)
		}
	}
}

func TestRaceRowApply(t *testing.T) {
	str := func(s string) *string { return &s }
	sec := 12345.0
	r := raceRow{Category: "other", Status: "finished"}
	if msg := r.apply(raceInput{Name: str(" 北京马拉松 "), Date: str("2026-10-18"), Category: str("full"), OfficialS: &sec}); msg != "" || r.Name != "北京马拉松" || r.OfficialS != 12345.0 {
		t.Fatalf("合法输入被拒：%s %+v", msg, r)
	}
	net := 12300.0
	if msg := r.apply(raceInput{NetS: &net}); msg != "" || r.NetS != 12300.0 || r.OfficialS != 12345.0 {
		t.Fatalf("净计时没存上或动了枪声成绩：%s %+v", msg, r)
	}
	zero := 0.0
	r.apply(raceInput{OfficialS: &zero})
	if r.OfficialS != nil {
		t.Fatal("成绩填 0 应清空")
	}
	for name, in := range map[string]raceInput{
		"类别": {Category: str("ultra")}, "状态": {Status: str("x")}, "日期": {Date: str("10/18")}, "活动": {ActivityID: str("../1")},
	} {
		rr := raceRow{Name: "x", Date: "2026-10-18", Category: "full", Status: "finished"}
		if rr.apply(in) == "" {
			t.Errorf("%s 应拒绝", name)
		}
	}
}

func TestRaceSeedFromGarmin(t *testing.T) {
	raw := []byte(`{"activityId":123,"activityName":"2026 北京马拉松","startTimeLocal":"2026-11-01 07:00:00",
		"distance":42690,"duration":15876,"activityType":{"typeKey":"running"},"eventTypeDTO":{"typeId":1,"typeKey":"race"}}`)
	var a garminActivity
	if err := json.Unmarshal(raw, &a); err != nil {
		t.Fatal(err)
	}
	if a.EventTypeDTO.TypeKey != "race" {
		t.Fatalf("列表里的 eventTypeDTO 没解析出来：%+v", a.EventTypeDTO)
	}
	r, ok := raceSeed{ActivityID: "123", Name: a.ActivityName, StartLocal: a.StartTimeLocal,
		TypeKey: a.ActivityType.TypeKey, DistanceM: a.Distance, DurationS: a.Duration}.raceRowFromSeed()
	if !ok || r.Name != "2026 北京马拉松" || r.Date != "2026-11-01" || r.Category != "full" ||
		r.Status != "finished" || r.ActivityID != "123" || r.NetS != 15876.0 {
		t.Fatalf("自动收录的比赛行不对：ok=%v %+v", ok, r)
	}
	if _, ok := (raceSeed{ActivityID: "123", Name: "x", StartLocal: "11/01", TypeKey: "running"}).raceRowFromSeed(); ok {
		t.Fatal("日期不合法应拒绝")
	}
	if _, ok := (raceSeed{ActivityID: "123", Name: "x", StartLocal: "2026-11-01", TypeKey: "cycling"}).raceRowFromSeed(); ok {
		t.Fatal("非跑步活动不该自动收录为比赛")
	}
}

func TestInferRaceCategory(t *testing.T) {
	for _, c := range []struct {
		dist float64
		typ  string
		want string
	}{
		{42690, "running", "full"}, {42630, "running", "full"}, {21320, "running", "half"},
		{10000, "running", "10k"}, {5000, "running", "5k"}, {8000, "running", "other"},
		{10000, "trail_running", "trail"},
	} {
		if got := inferRaceCategory(c.dist, c.typ); got != c.want {
			t.Errorf("inferRaceCategory(%v, %q) = %q，应为 %q", c.dist, c.typ, got, c.want)
		}
	}
}

func TestMediaIDs(t *testing.T) {
	if !validRaceID("race_0123abcd") || validRaceID("race_../x") || validRaceID("race_A") || validMediaID("race_1") {
		t.Fatal("id 校验不对")
	}
	dataDir = t.TempDir()
	defer func() { dataDir = "" }()
	p, err := mediaPath("race_ab", "med_cd", "image/jpeg")
	if err != nil || !strings.HasSuffix(p, "media/race_ab/med_cd.jpg") {
		t.Fatalf("路径不对：%s %v", p, err)
	}
	if _, err := mediaPath("race_ab", "med_../../x", "image/jpeg"); err == nil {
		t.Fatal("越界 id 应拒绝")
	}
}

func TestPlanInputCheck(t *testing.T) {
	ok := planInput{Name: " 我的 10K ", Kind: "run", Days: []int{2, 4, 7},
		Weeks: [][]calItem{{{Kind: "run", Title: "轻松跑"}, {Kind: "strength", Title: "核心"}}, {}}}
	if msg := ok.check(); msg != "" || ok.Name != "我的 10K" || ok.Weeks[0][0].Date != "" {
		t.Fatalf("合法计划被拒：%s %+v", msg, ok)
	}
	for name, p := range map[string]planInput{
		"空名称":    {Name: " ", Kind: "run", Weeks: [][]calItem{{{Kind: "run", Title: "x"}}}},
		"类型":     {Name: "a", Kind: "swim", Weeks: [][]calItem{{{Kind: "run", Title: "x"}}}},
		"没有课":    {Name: "a", Kind: "run", Weeks: [][]calItem{{}}},
		"训练日重复":  {Name: "a", Kind: "run", Days: []int{1, 1}, Weeks: [][]calItem{{{Kind: "run", Title: "x"}}}},
		"一周 8 节": {Name: "a", Kind: "run", Weeks: [][]calItem{make([]calItem, 8)}},
		"课类型":    {Name: "a", Kind: "run", Weeks: [][]calItem{{{Kind: "swim", Title: "x"}}}},
	} {
		if p.check() == "" {
			t.Errorf("%s 应拒绝", name)
		}
	}
}

func TestVideoAndSourceChecks(t *testing.T) {
	v := videoInput{Title: " 跑姿讲解 ", URL: "https://www.bilibili.com/video/BV1xx", Creator: "某 UP", CreatorURL: "https://space.bilibili.com/1"}
	if msg := v.check(); msg != "" || v.Title != "跑姿讲解" || v.Category != "run" {
		t.Fatalf("合法视频被拒：%s", msg)
	}
	for name, in := range map[string]videoInput{
		"无链接": {Title: "a"}, "非 http": {Title: "a", URL: "javascript:alert(1)"}, "主页非 http": {Title: "a", URL: "https://x.com/v", CreatorURL: "ftp://x"},
		"类别": {Title: "a", URL: "https://x.com/v", Category: "swim"},
	} {
		if in.check() == "" {
			t.Errorf("%s 应拒绝", name)
		}
	}
	p := planInput{Name: "a", Kind: "run", Source: planSource{Type: "up"}, Weeks: [][]calItem{{{Kind: "run", Title: "x"}}}}
	if p.check() == "" {
		t.Fatal("UP 主来源没填名称应拒绝")
	}
	p.Source = planSource{Type: "up", Name: "某 UP", URL: "https://space.bilibili.com/1"}
	p.Weeks[0][0].Video = "https://www.bilibili.com/video/BV1xx"
	p.Videos = []planVideo{{Title: "热身", URL: "https://www.bilibili.com/video/BV2"}}
	if msg := p.check(); msg != "" {
		t.Fatalf("合法来源和视频被拒：%s", msg)
	}
	p.Weeks[0][0].Video = "data:text/html,x"
	if p.check() == "" {
		t.Fatal("课时视频非 http 应拒绝")
	}
}

func TestSplitAnalysisPlan(t *testing.T) {
	in := "## 本次概况\n不错。\n\n```plan\n[{\"day\":3,\"kind\":\"strength\",\"title\":\"核心力量\",\"detail\":\"3 组\"},{\"day\":1,\"kind\":\"run\",\"title\":\"轻松跑 6 km\",\"detail\":\"区间 2\"},{\"day\":2,\"kind\":\"rest\",\"title\":\"休息\"},{\"day\":0,\"kind\":\"run\",\"title\":\"x\"},{\"day\":5,\"kind\":\"swim\",\"title\":\"游泳\"}]\n```\n"
	text, plan := splitAnalysisPlan(in)
	if text != "## 本次概况\n不错。" {
		t.Fatalf("text = %q", text)
	}
	if len(plan) != 3 || plan[0].Day != 1 || plan[1].Kind != "strength" || plan[2].Kind != "other" {
		t.Fatalf("plan = %+v", plan)
	}
	// 没有代码块或 JSON 坏了：正文原样返回，课表为空
	for _, c := range []string{"## 只有正文", "正文\n```plan\n[{bad\n```"} {
		if txt, p := splitAnalysisPlan(c); txt != c || len(p) != 0 {
			t.Fatalf("%q -> %q %+v", c, txt, p)
		}
	}
}

func TestGoals(t *testing.T) {
	g := goalRow{RaceName: " 2026 北京马拉松 ", Category: "half", Date: "2026-11-01", TargetS: 1*3600 + 54*60 + 45}
	if msg := g.check(); msg != "" || g.RaceName != "2026 北京马拉松" {
		t.Fatalf("合法目标被拒：%s %+v", msg, g)
	}
	p := goalPaceSec(g.Category, g.TargetS)
	if p <= 325 || p >= 327 { // 1:54:45 / 21.0975 ≈ 326 秒/公里
		t.Fatalf("半马目标配速算错：%v", p)
	}
	if goalPaceSec("trail", g.TargetS) != 0 || goalPaceSec("half", 0) != 0 {
		t.Fatal("没有距离或成绩时不该给配速")
	}
	for name, v := range map[string]goalRow{
		"类别": {Category: "swim"}, "日期": {Date: "11/01"}, "成绩": {TargetS: -1}, "名称": {RaceName: strings.Repeat("长", 81)},
	} {
		v2 := v
		if v2.check() == "" {
			t.Errorf("%s 应拒绝", name)
		}
	}
}

func TestPresetMissing(t *testing.T) {
	for _, msg := range []string{"preset 跑步数据分析 not found", "agent 不存在", "找不到 preset"} {
		if !presetMissing(fmt.Errorf("%s", msg)) {
			t.Errorf("%q 应识别为 Agent 不存在", msg)
		}
	}
	for _, msg := range []string{"网络超时", "模型没有返回内容", "permission denied"} {
		if presetMissing(fmt.Errorf("%s", msg)) {
			t.Errorf("%q 不该回退", msg)
		}
	}
}

func TestPlanStartMode(t *testing.T) {
	p := planInput{Name: "AI 建议", Kind: "run", StartMode: "date", Days: []int{1, 3},
		Weeks: [][]calItem{{{Kind: "run", Title: "轻松跑"}}}}
	if msg := p.check(); msg != "" {
		t.Fatalf("date 口径被拒：%s", msg)
	}
	p.StartMode = "monday"
	if p.check() == "" {
		t.Fatal("非法排期口径应拒绝")
	}
}

func TestQueryFloat(t *testing.T) {
	cases := map[string]float64{
		"": 0, "abc": 0, "-3": 0, "NaN": 0, "Inf": 0, "0": 0,
		"1000": 1000, "1.5": 1.5, "0.25": 0.25,
	}
	for in, want := range cases {
		if got := queryFloat(in); got != want {
			t.Errorf("queryFloat(%q) = %v, want %v", in, got, want)
		}
	}
}

func TestGarminLapSpeed(t *testing.T) {
	cases := []struct {
		in   float64
		want float64
	}{
		{2.9, 10.4}, {3.0, 10.8}, {0, 0}, {-1, 0}, {0.2, 0}, {12, 0},
	}
	for _, c := range cases {
		if got := garminLapSpeed(map[string]any{"averageSpeed": c.in}); got != c.want {
			t.Errorf("garminLapSpeed(%v) = %v, want %v", c.in, got, c.want)
		}
	}
	// 任一段没速度就不给自动值，避免半套数据当已校正
	partial := autoLapSpeeds([]map[string]any{
		{"averageSpeed": 2.9}, {"averageSpeed": 0},
	})
	if len(partial) != 0 {
		t.Errorf("缺速度的跑步机不该自动填，得到 %v", partial)
	}
}

func fptr(v float64) *float64 { return &v }

func TestCorrectedDetailAlignsPace(t *testing.T) {
	// 两段各 600 秒：原始速度 2.0 / 4.0 m/s，校正成 2.5 / 2.5 m/s（9 km/h）
	d := &runDetail{
		TypeKey: "treadmill_running",
		Laps: []map[string]any{
			{"duration": 600.0, "distance": 1200.0},
			{"duration": 600.0, "distance": 2400.0},
		},
		Series: map[string][]*float64{
			"directSpeed": {fptr(2.0), fptr(2.0), fptr(4.0), fptr(4.0)},
			"sumDistance": {fptr(0), fptr(100), fptr(200), fptr(300)},
			"sumDuration": {fptr(0), fptr(1), fptr(601), fptr(602)},
		},
	}
	speeds := map[string]float64{"0": 9, "1": 9}
	got := correctedDetail(d, speeds)
	if got == d {
		t.Fatal("校正应返回新副本")
	}
	spd := got.Series["directSpeed"]
	for i, v := range spd {
		if v == nil || math.Abs(*v-2.5) > 1e-6 {
			t.Errorf("第 %d 点校正后速度 = %v, want 2.5", i, v)
		}
	}
	// 原始 detail 不能被改动
	if *d.Series["directSpeed"][0] != 2.0 {
		t.Fatal("不该改缓存里的原始逐点数据")
	}
	// 距离按校正速度积分重算：两个 1 秒有效间隔 × 2.5 m/s；跨段的大间隔按暂停跳过
	dist := got.Series["sumDistance"]
	if dist[3] == nil || math.Abs(*dist[3]-5) > 1e-6 {
		t.Errorf("校正后累计距离 = %v, want 5", dist[3])
	}
}

func TestSeriesLapIndex(t *testing.T) {
	b := []float64{0, 600, 1200}
	for _, c := range []struct {
		t    float64
		want int
	}{{-1, 0}, {0, 0}, {599, 0}, {600, 1}, {1199, 1}, {1200, 1}, {9999, 1}} {
		if got := seriesLapIndex(c.t, b); got != c.want {
			t.Errorf("seriesLapIndex(%v) = %d, want %d", c.t, got, c.want)
		}
	}
}
