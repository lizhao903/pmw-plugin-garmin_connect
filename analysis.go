// powered by dsh - https://github.com/deepseek-ai/deepseek-harness

package main

// AI 分析（0.6.0）：把单次活动整理成文字交给宿主模型（host.agent.run，需 agent:run），按教练角色给分析和后续训练建议。
// 模型可能要几十秒，宿主转发前端请求只等 60 秒，所以做成后台任务：POST 发起、GET 轮询；结果存 analyses 表。

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

type analysisJob struct {
	Running   bool
	Error     string
	StartedAt string
}

const analysisSystemRun = `你是一名有经验的跑步教练，也懂体能训练。用户会给你一次 Garmin 运动记录的数据和最近几周的训练量，请分析这次训练并给出后续训练建议。
要求：
- 用中文，不使用 emoji，语气专业、直接。
- 只根据给出的数据下结论，数据里没有的不要编造；缺数据就直说。
- 结论尽量落到具体数字（配速、心率、距离、时长）。
- 如果提供了目标比赛或目标成绩，训练配速建议要围绕目标配速区间给，并在建议里点明对应的比赛；同时引用给出的个人最好成绩作为参照。没有目标时，按当前训练水平给。
- 用 Markdown 输出，按下面的结构，总长度控制在 700 字以内：
## 本次概况
（2～3 句：这是什么类型的训练、完成得怎么样）
## 亮点
## 问题与风险
（如跑崩、心率漂移、配速波动大、步频偏低、强度过高或训练量增长过快等，没有就写没有明显问题）
## 后续训练建议
（未来 1～2 周的具体安排：每次课的类型、距离或时长、配速或心率区间，标明哪天适合上强度）
## 恢复与注意事项
最后另起一段，输出一个 plan 代码块（不计入上面的字数），把「后续训练建议」里的每节课逐条列成 JSON 数组，供用户一键排进训练计划。格式：
` + "```plan" + `
[{"day":1,"kind":"run","title":"轻松跑 6 km","detail":"配速 6:20～6:40，心率区间 2"}]
` + "```" + `
- day 是从开始执行那天算起的第几天（1～14），一天最多一节课，休息日不用列；
- kind 只能是 run（跑步）、strength（力量）、other（拉伸、交叉训练等）；
- title 不超过 20 个字，写清课的类型和量；detail 写配速、心率区间、组数次数等要点，不超过 80 个字；
- 代码块里只放 JSON 数组，不要注释；和正文的建议保持一致。`

const analysisSystemStrength = `你是一名有经验的体能教练，熟悉跑者的力量训练。用户会给你一次 Garmin 力量训练记录（训练组、心率等）和最近几周的训练量，请分析这次训练并给出后续训练建议。
要求：
- 用中文，不使用 emoji，语气专业、直接。
- 只根据给出的数据下结论，数据里没有的不要编造；动作识别可能不准，提到时说明。
- 力量安排要和给出的目标比赛周期相配；没有目标时按当前训练水平给。
- 用 Markdown 输出，按下面的结构，总长度控制在 600 字以内：
## 本次概况
## 亮点
## 问题与风险
## 后续训练建议
（未来 1～2 周：力量课的频率、动作、组数次数和强度，以及怎么和跑步训练搭配）
## 恢复与注意事项
最后另起一段，输出一个 plan 代码块（不计入上面的字数），把「后续训练建议」里的每节课逐条列成 JSON 数组，供用户一键排进训练计划。格式：
` + "```plan" + `
[{"day":1,"kind":"run","title":"轻松跑 6 km","detail":"配速 6:20～6:40，心率区间 2"}]
` + "```" + `
- day 是从开始执行那天算起的第几天（1～14），一天最多一节课，休息日不用列；
- kind 只能是 run（跑步）、strength（力量）、other（拉伸、交叉训练等）；
- title 不超过 20 个字，写清课的类型和量；detail 写配速、心率区间、组数次数等要点，不超过 80 个字；
- 代码块里只放 JSON 数组，不要注释；和正文的建议保持一致。`

// paceUnitOf 兼容旧调用：不传单位时按 min/km。
func paceUnitOf(unit []string) string {
	if len(unit) > 0 && unit[0] == "mile" {
		return "mile"
	}
	return "km"
}

func fmtPaceUnit(secPerKm float64, unit string) string {
	if secPerKm <= 0 || math.IsInf(secPerKm, 0) || math.IsNaN(secPerKm) {
		return "-"
	}
	if unit == "mile" {
		secPerKm *= 1.609344
	}
	m := int(secPerKm) / 60
	s := int(math.Round(secPerKm)) % 60
	if int(math.Round(secPerKm))/60 > m {
		m, s = int(math.Round(secPerKm))/60, 0
	}
	return fmt.Sprintf("%d'%02d\"/%s", m, s, unit)
}

func fmtPaceSec(secPerKm float64) string { return fmtPaceUnit(secPerKm, "km") }

func fmtDur(sec float64) string {
	if sec <= 0 {
		return "-"
	}
	t := int(math.Round(sec))
	if t >= 3600 {
		return fmt.Sprintf("%d:%02d:%02d", t/3600, t%3600/60, t%60)
	}
	return fmt.Sprintf("%d:%02d", t/60, t%60)
}

func numField(m map[string]any, k string) float64 {
	v, _ := m[k].(float64)
	return v
}

// summaryLines 挑概要里对分析有用的字段，换成中文和常用单位。
func summaryLines(sm map[string]any, distOverride float64, unit ...string) []string {
	u := paceUnitOf(unit)
	var out []string
	add := func(label, val string) {
		if val != "" && val != "-" {
			out = append(out, label+"："+val)
		}
	}
	dist := numField(sm, "distance")
	if distOverride > 0 {
		dist = distOverride
	}
	dur := numField(sm, "duration")
	if dist > 0 {
		add("距离", fmt.Sprintf("%.2f km", dist/1000))
	}
	add("计时用时", fmtDur(dur))
	add("移动用时", fmtDur(numField(sm, "movingDuration")))
	if dist > 0 && dur > 0 {
		add("平均配速", fmtPaceUnit(dur/(dist/1000), u))
	}
	if v := numField(sm, "maxSpeed"); v > 0 && distOverride == 0 {
		add("最快配速", fmtPaceUnit(1000/v, u))
	}
	if v := numField(sm, "avgGradeAdjustedSpeed"); v > 0 && distOverride == 0 {
		add("坡度调整配速", fmtPaceUnit(1000/v, u))
	}
	for _, f := range []struct{ k, label, unit string }{
		{"averageHR", "平均心率", "bpm"}, {"maxHR", "最大心率", "bpm"}, {"averageRunCadence", "平均步频", "步/分"},
		{"groundContactTime", "触地时间", "ms"}, {"verticalOscillation", "垂直振幅", "cm"}, {"verticalRatio", "垂直步幅比", "%"},
		{"averagePower", "平均功率", "W"}, {"elevationGain", "累计爬升", "m"}, {"calories", "热量", "kcal"},
		{"activityTrainingLoad", "训练负荷", ""}, {"trainingEffect", "有氧训练效果", "（0～5）"},
		{"anaerobicTrainingEffect", "无氧训练效果", "（0～5）"}, {"averageTemperature", "手表测得温度", "°C"},
	} {
		if v := numField(sm, f.k); v != 0 {
			add(f.label, strings.TrimSpace(strconv.FormatFloat(math.Round(v*10)/10, 'f', -1, 64)+" "+f.unit))
		}
	}
	if v := numField(sm, "strideLength"); v > 0 {
		add("平均步幅", fmt.Sprintf("%.2f m", v/100))
	}
	if v, ok := sm["trainingEffectLabel"].(string); ok && v != "" {
		add("主要训练效益（Garmin 标签）", v)
	}
	if v := numField(sm, "directWorkoutRpe"); v > 0 {
		add("主观用力（RPE）", fmt.Sprintf("%.0f/10", v/10))
	}
	if v, ok := sm["directWorkoutFeel"].(float64); ok {
		add("跑后感受（0 很差～100 很好）", fmt.Sprintf("%.0f", v))
	}
	return out
}

func lapLines(laps []map[string]any, speeds map[string]float64, unit ...string) []string {
	u := paceUnitOf(unit)
	var out []string
	for i, l := range laps {
		if i >= 60 {
			out = append(out, fmt.Sprintf("……其余 %d 段省略", len(laps)-60))
			break
		}
		dur := numField(l, "duration")
		dist := numField(l, "distance")
		note := ""
		if v, ok := speeds[strconv.Itoa(i)]; ok && v > 0 {
			dist = v / 3.6 * dur
			note = fmt.Sprintf("（按跑步机 %.1f km/h 校正）", v)
		}
		pace := "-"
		if dist > 0 {
			pace = fmtPaceUnit(dur/(dist/1000), u)
		}
		typ, _ := l["intensityType"].(string)
		line := fmt.Sprintf("第%d段 %s %.2fkm 用时%s 配速%s", i+1, typ, dist/1000, fmtDur(dur), pace)
		if v := numField(l, "averageHR"); v > 0 {
			line += fmt.Sprintf(" 心率%.0f/%.0f", v, numField(l, "maxHR"))
		}
		if v := numField(l, "averageRunCadence"); v > 0 {
			line += fmt.Sprintf(" 步频%.0f", v)
		}
		out = append(out, line+note)
	}
	return out
}

func setLines(sets []map[string]any) []string {
	var out []string
	n := 0
	for _, st := range sets {
		if t, _ := st["set_type"].(string); t == "REST" {
			if d := numField(st, "duration"); d > 0 {
				out = append(out, fmt.Sprintf("  休息 %s", fmtDur(d)))
			}
			continue
		}
		n++
		name, _ := st["name"].(string)
		cat, _ := st["category"].(string)
		if name == "" {
			name = cat
		}
		w := numField(st, "weight")
		if w > 300 {
			w /= 1000 // Garmin 训练组的重量多是克
		}
		line := fmt.Sprintf("第%d组 %s 次数%.0f", n, name, numField(st, "reps"))
		if w > 0 {
			line += fmt.Sprintf(" 重量%.1fkg", w)
		}
		if d := numField(st, "duration"); d > 0 {
			line += " 用时" + fmtDur(d)
		}
		out = append(out, line)
		if n >= 60 {
			break
		}
	}
	return out
}

// recentLines 是最近 7 天、28 天的训练量（不含这次），给模型判断负荷。
func (s *server) recentLines(ctx context.Context, start string, id string, unit ...string) []string {
	u := paceUnitOf(unit)
	day := start
	if len(day) >= 10 {
		day = day[:10]
	}
	rows, err := s.query(ctx, `SELECT start_time, type_key, COALESCE(corrected_distance_m, distance_m) AS d, duration_s
		FROM runs WHERE activity_id <> ? AND substr(start_time, 1, 10) < ? AND substr(start_time, 1, 10) >= date(?, '-28 days')
		ORDER BY start_time`, id, day, day)
	if err != nil {
		return nil
	}
	type agg struct {
		runs, strength int
		dist, dur      float64
		longest        float64
		fastest        float64 // 单次跑步最快的平均配速（秒/公里）
	}
	var w7, w28 agg
	weekAgo := ""
	if t, err := time.Parse("2006-01-02", day); err == nil {
		weekAgo = t.AddDate(0, 0, -7).Format("2006-01-02")
	}
	for _, r := range rows {
		st, _ := r["start_time"].(string)
		tk, _ := r["type_key"].(string)
		d, du := numField(r, "d"), numField(r, "duration_s")
		for _, a := range []*agg{&w28, &w7} {
			if a == &w7 && (len(st) < 10 || st[:10] < weekAgo) {
				continue
			}
			if isStrength(tk) {
				a.strength++
				continue
			}
			a.runs++
			a.dist += d
			a.dur += du
			if d > a.longest {
				a.longest = d
			}
			if d > 0 && du > 0 {
				if pace := du / (d / 1000); pace > 0 && (a.fastest == 0 || pace < a.fastest) {
					a.fastest = pace
				}
			}
		}
	}
	f := func(label string, a agg) string {
		return fmt.Sprintf("%s：跑步 %d 次，共 %.1f km、%s，最长一次 %.1f km；力量训练 %d 次", label, a.runs, a.dist/1000, fmtDur(a.dur), a.longest/1000, a.strength)
	}
	out := []string{f("这次之前 7 天", w7), f("这次之前 28 天", w28), fmt.Sprintf("28 天平均每周跑量约 %.1f km", w28.dist/1000/4)}
	if w28.dist > 0 && w28.dur > 0 {
		out = append(out, fmt.Sprintf("近 28 天整体平均配速 %s，其中最快的一次平均配速 %s（作为配速范围的历史参照）",
			fmtPaceUnit(w28.dur/(w28.dist/1000), u), fmtPaceUnit(w28.fastest, u)))
	}
	return out
}

// goalLines 把用户设的目标比赛/成绩和各项目 PB 放进 prompt，让建议围绕目标配速而不是凭空给数。
func (s *server) goalLines(ctx context.Context, unit ...string) []string {
	u := paceUnitOf(unit)
	var out []string
	rows, err := s.query(ctx, "SELECT race_name, category, date, target_s FROM training_goals WHERE id = 1")
	if err == nil && len(rows) > 0 {
		name, _ := rows[0]["race_name"].(string)
		cat, _ := rows[0]["category"].(string)
		date, _ := rows[0]["date"].(string)
		target := numField(rows[0], "target_s")
		if target > 0 {
			line := "目标比赛"
			if name != "" {
				line += "：" + name
			}
			if cat != "" {
				line += "（" + raceCategoryLabel(cat) + "）"
			}
			if date != "" {
				line += "，日期 " + date
			}
			line += "，目标成绩 " + fmtDur(target)
			if pace := goalPaceSec(cat, target); pace > 0 {
				line += "，目标平均配速 " + fmtPaceUnit(pace, u)
			}
			out = append(out, line)
		}
	}
	rows, err = s.query(ctx, `SELECT name, category, date, COALESCE(net_s, official_s) AS t FROM races
		WHERE status = 'finished' AND COALESCE(net_s, official_s) > 0`)
	if err == nil {
		best := map[string]map[string]any{}
		for _, r := range rows {
			cat, _ := r["category"].(string)
			if !raceCategories[cat] {
				continue
			}
			t := numField(r, "t")
			if b := best[cat]; b == nil || t < numField(b, "t") {
				best[cat] = r
			}
		}
		cats := []string{"full", "half", "10k", "5k", "trail", "other"}
		for _, cat := range cats {
			b := best[cat]
			if b == nil {
				continue
			}
			t := numField(b, "t")
			line := fmt.Sprintf("%s个人最好：%s", raceCategoryLabel(cat), fmtDur(t))
			if pace := goalPaceSec(cat, t); pace > 0 {
				line += "（平均配速 " + fmtPaceUnit(pace, u) + "）"
			}
			if name, _ := b["name"].(string); name != "" {
				line += "，" + name
			}
			if date, _ := b["date"].(string); date != "" {
				line += " " + date
			}
			out = append(out, line)
		}
	}
	return out
}

func raceCategoryLabel(cat string) string {
	return map[string]string{"full": "全马", "half": "半马", "10k": "10 公里", "5k": "5 公里", "trail": "越野", "other": "其他"}[cat]
}

func (s *server) buildAnalysisPrompt(ctx context.Context, d *runDetail, insights, unit string) (string, string) {
	u := paceUnitOf([]string{unit})
	strength := isStrength(d.TypeKey)
	var b strings.Builder
	fmt.Fprintf(&b, "活动：%s（类型 %s，开始 %s）\n", d.Name, d.TypeKey, strings.Replace(d.StartLocal, "T", " ", 1))
	if d.Desc != "" {
		fmt.Fprintf(&b, "用户写的描述：%s\n", d.Desc)
	}
	speeds := s.lapSpeeds(ctx, d.ActivityID)
	corrected := correctedDistance(d.Laps, speeds)
	if corrected > 0 {
		b.WriteString("注意：这是跑步机数据，距离、配速、分段和曲线已按同一套逐段速度校正，四者口径一致，配速以这里给出的数值为准。\n")
	}
	b.WriteString("\n【概要】\n")
	for _, l := range summaryLines(d.Summary, corrected, u) {
		b.WriteString(l + "\n")
	}
	if w := d.Weather; len(w) > 0 {
		if t := numField(w, "temp"); t != 0 {
			fmt.Fprintf(&b, "天气：气温约 %.0f°C，湿度 %.0f%%\n", (t-32)*5/9, numField(w, "relativeHumidity"))
		}
	}
	if strength && len(d.Sets) > 0 {
		b.WriteString("\n【训练组】\n")
		for _, l := range setLines(d.Sets) {
			b.WriteString(l + "\n")
		}
	} else if len(d.Laps) > 0 {
		b.WriteString("\n【分段】\n")
		for _, l := range lapLines(d.Laps, speeds, u) {
			b.WriteString(l + "\n")
		}
	}
	zones, zoneSource := s.effectiveHRZones(ctx, d)
	if lines := hrZoneLines(zones, zoneSource); len(lines) > 0 {
		b.WriteString("\n" + strings.Join(lines, "\n") + "\n")
	}
	if strings.TrimSpace(insights) != "" {
		b.WriteString("\n【曲线分析（插件根据逐点数据算出：主要波动区间、分段变化、暂停与停下）】\n")
		b.WriteString(strings.TrimSpace(insights) + "\n")
	}
	if lines := s.recentLines(ctx, d.StartLocal, d.ActivityID, u); len(lines) > 0 {
		b.WriteString("\n【近期训练量】\n")
		for _, l := range lines {
			b.WriteString(l + "\n")
		}
	}
	if lines := s.goalLines(ctx, u); len(lines) > 0 {
		b.WriteString("\n【目标比赛与历史最好成绩】\n")
		for _, l := range lines {
			b.WriteString(l + "\n")
		}
	}
	sys := analysisSystemRun
	if strength {
		sys = analysisSystemStrength
	}
	sys += "\n- 配速统一用 min/" + u + " 表示（距离仍用 km），不要混用单位。"
	return sys, b.String()
}

func (s *server) analysisSnapshot(id string) analysisJob {
	s.anMu.Lock()
	defer s.anMu.Unlock()
	if j := s.anJobs[id]; j != nil {
		return *j
	}
	return analysisJob{}
}

func (s *server) apiStartAnalysis(ctx context.Context, id string, body []byte) (int, any) {
	if !validActivityID(id) {
		return 400, map[string]any{"error": "活动 id 不合法"}
	}
	var in struct {
		Agent    string `json:"agent"`
		Insights string `json:"insights"`
		Unit     string `json:"unit"`
	}
	_ = json.Unmarshal(body, &in)
	if len(in.Insights) > 8000 {
		in.Insights = in.Insights[:8000]
	}
	d := s.cachedDetail(ctx, id)
	if d == nil {
		return 409, map[string]any{"error": "先打开一次详情把数据拉下来，再分析"}
	}
	s.anMu.Lock()
	if s.anJobs == nil {
		s.anJobs = map[string]*analysisJob{}
	}
	if j := s.anJobs[id]; j != nil && j.Running {
		s.anMu.Unlock()
		return 409, map[string]any{"error": "这次活动的分析正在进行"}
	}
	s.anJobs[id] = &analysisJob{Running: true, StartedAt: time.Now().Format(time.RFC3339)}
	s.anMu.Unlock()

	bg := s.bgCtx
	if bg == nil {
		bg = context.Background()
	}
	agentName := strings.TrimSpace(in.Agent)
	go func() {
		_, err := s.runAnalysis(bg, d, agentName, in.Insights, in.Unit)
		s.anMu.Lock()
		j := s.anJobs[id]
		j.Running = false
		if err != nil {
			j.Error = err.Error()
		}
		s.anMu.Unlock()
	}()
	return 202, map[string]any{"ok": true, "status": "running"}
}

func (s *server) runAnalysis(ctx context.Context, d *runDetail, agentName, insights, unit string) (string, error) {
	sys, prompt := s.buildAnalysisPrompt(ctx, d, insights, unit)
	callCtx, cancel := context.WithTimeout(ctx, 200*time.Second)
	defer cancel()
	call := func(preset string) (string, error) {
		var out struct {
			Result string `json:"result"`
		}
		params := map[string]any{"system": sys, "prompt": prompt, "timeout_ms": 180000}
		if preset != "" {
			params["preset_id"] = preset
		}
		if err := s.conn.call(callCtx, "host.agent.run", params, &out); err != nil {
			return "", err
		}
		return strings.TrimSpace(out.Result), nil
	}
	usedAgent := strings.TrimSpace(agentName)
	content, err := call(usedAgent)
	if err != nil {
		var rerr *rpcError
		if ok := asRPC(err, &rerr); ok && rerr.Code == errorCodeNumbers["permission_denied"] {
			return "", fmt.Errorf("插件还没有调用模型的权限：到「设置 → 插件 → 外部插件」重新确认权限（agent:run）")
		}
		if ok := asRPC(err, &rerr); ok && rerr.Code == errorCodeNumbers["method_not_found"] {
			return "", fmt.Errorf("当前工作台版本还不支持插件调用模型（host.agent.run），需要升级工作台")
		}
		// 指定的 Agent 没建或被删了，回退到内置分析，不让第一次使用卡住。
		if usedAgent != "" && presetMissing(err) {
			content, err = call("")
			usedAgent = ""
		}
		if err != nil {
			return "", fmt.Errorf("模型分析失败：%v", err)
		}
	}
	if content == "" {
		return "", fmt.Errorf("模型没有返回内容")
	}
	return usedAgent, s.exec(ctx, `INSERT INTO analyses(activity_id, content, agent, created_at) VALUES (?, ?, ?, ?)
		ON CONFLICT(activity_id) DO UPDATE SET content=excluded.content, agent=excluded.agent, created_at=excluded.created_at`,
		d.ActivityID, content, usedAgent, time.Now().Format(time.RFC3339))
}

func presetMissing(err error) bool {
	msg := strings.ToLower(err.Error())
	for _, k := range []string{"preset", "not found", "unknown agent", "不存在", "找不到", "没有这个"} {
		if strings.Contains(msg, k) {
			return true
		}
	}
	return false
}

func asRPC(err error, target **rpcError) bool {
	for e := err; e != nil; {
		if r, ok := e.(*rpcError); ok {
			*target = r
			return true
		}
		u, ok := e.(interface{ Unwrap() error })
		if !ok {
			return false
		}
		e = u.Unwrap()
	}
	return false
}

// aiSession 是分析末尾 plan 代码块里的一节课：day 为从开始执行那天算起的第几天
type aiSession struct {
	Day    int    `json:"day"`
	Kind   string `json:"kind"`
	Title  string `json:"title"`
	Detail string `json:"detail"`
}

var planBlockRe = regexp.MustCompile("(?s)```(?:plan|json)[ \\t]*\\n(.*?)```")

// splitAnalysisPlan 把模型输出里的 plan 代码块拆出来：返回去掉代码块的正文和校验过的课表。
// 解析不了就当没有课表，正文照常显示。
func splitAnalysisPlan(content string) (string, []aiSession) {
	plan := []aiSession{}
	m := planBlockRe.FindStringSubmatchIndex(content)
	if m == nil {
		return content, plan
	}
	var raw []aiSession
	if err := json.Unmarshal([]byte(strings.TrimSpace(content[m[2]:m[3]])), &raw); err != nil {
		return content, plan
	}
	text := strings.TrimSpace(content[:m[0]] + content[m[1]:])
	cut := func(s string, n int) string {
		s = strings.TrimSpace(s)
		if r := []rune(s); len(r) > n {
			return string(r[:n])
		}
		return s
	}
	for _, x := range raw {
		if x.Day < 1 || x.Day > 28 || strings.TrimSpace(x.Title) == "" {
			continue
		}
		switch x.Kind {
		case "run", "strength", "other":
		case "rest":
			continue
		default:
			x.Kind = "other"
		}
		x.Title, x.Detail = cut(x.Title, 60), cut(x.Detail, 500)
		plan = append(plan, x)
		if len(plan) >= 40 {
			break
		}
	}
	sort.SliceStable(plan, func(i, j int) bool { return plan[i].Day < plan[j].Day })
	return text, plan
}

func (s *server) apiGetAnalysis(ctx context.Context, id string) (int, any) {
	if !validActivityID(id) {
		return 400, map[string]any{"error": "活动 id 不合法"}
	}
	j := s.analysisSnapshot(id)
	resp := map[string]any{"status": "idle"}
	if rows, err := s.query(ctx, "SELECT content, agent, created_at FROM analyses WHERE activity_id = ?", id); err == nil && len(rows) > 0 {
		resp["status"] = "done"
		content, _ := rows[0]["content"].(string)
		text, plan := splitAnalysisPlan(content)
		resp["content"], resp["plan"], resp["agent"], resp["created_at"] = text, plan, rows[0]["agent"], rows[0]["created_at"]
	}
	if j.Running {
		resp["status"] = "running"
		resp["started_at"] = j.StartedAt
	} else if j.Error != "" {
		resp["error"] = j.Error
		if resp["status"] == "idle" {
			resp["status"] = "error"
		}
	}
	return 200, resp
}
