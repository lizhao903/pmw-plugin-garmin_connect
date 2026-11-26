package main

// 恢复 / 体能趋势（0.10.0）：把单次详情里的训练指标按天结构化落库，聚合出跨天视图。
// 数据来源两类：activity_metrics（详情指标）+ runs（跑量，含未点开详情的活动）。
// 恢复状态是规则派生，不是 Garmin 官方训练状态；只按本地已有数据解释，不编造指标。

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
)

type recoveryBackfillState struct {
	Running    bool   `json:"running"`
	Done       int    `json:"done"`
	Total      int    `json:"total"`
	Error      string `json:"error,omitempty"`
	StartedAt  string `json:"started_at,omitempty"`
	FinishedAt string `json:"finished_at,omitempty"`
}

// recoveryDay 的指标用指针：null 表示那天没这项数据，前端据此断线，不把缺失当 0。
type recoveryDay struct {
	Date        string   `json:"date"`
	ActivityID  string   `json:"activity_id,omitempty"`
	Name        string   `json:"name,omitempty"`
	Load        *float64 `json:"load"`
	Effect      *float64 `json:"effect"`
	Anaerobic   *float64 `json:"anaerobic"`
	TELabel     string   `json:"te_label,omitempty"`
	BodyBattery *float64 `json:"body_battery"`
	RecoveryHR  *float64 `json:"recovery_hr"`
	RestingHR   *float64 `json:"resting_hr"`
	Stamina     *float64 `json:"stamina"`
	DistanceM   float64  `json:"distance_m"`
	DurationS   float64  `json:"duration_s"`
	High        bool     `json:"high"`
	Strength    bool     `json:"strength"`
}

type recoveryStatus struct {
	Level      string `json:"level"` // good / moderate / low / unknown
	Label      string `json:"label"`
	Reason     string `json:"reason"`
	Suggestion string `json:"suggestion"`
}

type recoverySummary struct {
	WeekKm      float64        `json:"week_km"`
	BaselineKm  float64        `json:"baseline_km"`
	Progress    int            `json:"progress"` // 本周跑量 / 近 4 周周均，百分比
	LastWeekKm  float64        `json:"last_week_km"`
	DaysSince   int            `json:"days_since"` // 距最近一次跑步天数
	HighDays    int            `json:"high_days"`  // 最近 7 天高强度日数
	Load7       float64        `json:"load_7d"`
	LoadBase    float64        `json:"load_base"` // 近 4 周平均周负荷
	EffectLabel string         `json:"effect_label,omitempty"`
	Status      recoveryStatus `json:"status"`
}

// -------- 结构化落库 --------

func fnumPtr(m map[string]any, key string) *float64 {
	v, ok := m[key].(float64)
	if !ok || math.IsNaN(v) || math.IsInf(v, 0) {
		return nil
	}
	return &v
}

// fnumArg 把指针转成 SQL 参数：缺失字段必须是真正的 nil，不能是 (*float64)(nil) 这种带类型的空值。
func fnumArg(m map[string]any, key string) any {
	if p := fnumPtr(m, key); p != nil {
		return *p
	}
	return nil
}

func strField(m map[string]any, key string) string {
	v, _ := m[key].(string)
	return v
}

// metricsFromDetail 从详情 Summary 抽出趋势指标。缺失字段留 NULL，不填 0。
func metricsFromDetail(d *runDetail) []any {
	day := d.StartLocal
	if len(day) >= 10 {
		day = day[:10]
	}
	sm := d.Summary
	label := strField(sm, "trainingEffectLabel")
	return []any{
		d.ActivityID, day, d.StartLocal, d.TypeKey,
		fnumArg(sm, "activityTrainingLoad"),
		fnumArg(sm, "trainingEffect"),
		fnumArg(sm, "anaerobicTrainingEffect"),
		label,
		fnumArg(sm, "differenceBodyBattery"),
		fnumArg(sm, "recoveryHeartRate"),
		fnumArg(sm, "restingHeartRate"),
		fnumArg(sm, "beginPotentialStamina"),
		fnumArg(sm, "endPotentialStamina"),
		fnumArg(sm, "minAvailableStamina"),
		fnumArg(sm, "averageHR"),
		fnumArg(sm, "distance"),
		fnumArg(sm, "duration"),
		time.Now().Format(time.RFC3339),
	}
}

const metricsInsertSQL = `INSERT INTO activity_metrics
	(activity_id, day, start_time, type_key, training_load, training_effect, anaerobic_effect,
	 te_label, body_battery_delta, recovery_hr, resting_hr, stamina_begin, stamina_end, stamina_min,
	 avg_hr, distance_m, duration_s, updated_at)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(activity_id) DO UPDATE SET
	 day=excluded.day, start_time=excluded.start_time, type_key=excluded.type_key,
	 training_load=excluded.training_load, training_effect=excluded.training_effect,
	 anaerobic_effect=excluded.anaerobic_effect, te_label=excluded.te_label,
	 body_battery_delta=excluded.body_battery_delta, recovery_hr=excluded.recovery_hr,
	 resting_hr=excluded.resting_hr, stamina_begin=excluded.stamina_begin,
	 stamina_end=excluded.stamina_end, stamina_min=excluded.stamina_min,
	 avg_hr=excluded.avg_hr, distance_m=excluded.distance_m, duration_s=excluded.duration_s,
	 updated_at=excluded.updated_at`

func (s *server) storeMetrics(ctx context.Context, d *runDetail) {
	if d == nil || d.ActivityID == "" {
		return
	}
	if err := s.exec(ctx, metricsInsertSQL, metricsFromDetail(d)...); err != nil {
		s.log.Warn("写入训练指标失败", "id", d.ActivityID, "err", err)
	}
}

// hasMetrics 判断活动是否已落训练指标，避免同步时重复拉取。
func (s *server) hasMetrics(ctx context.Context, id string) bool {
	rows, err := s.query(ctx, "SELECT 1 FROM activity_metrics WHERE activity_id = ? LIMIT 1", id)
	return err == nil && len(rows) > 0
}

// fillMetricsAsync 后台只拉活动主接口补齐指标，带节流；同步主流程不等它。
func (s *server) fillMetricsAsync(ctx context.Context, ids []string) {
	if len(ids) == 0 {
		return
	}
	bg := ctx
	if bg == nil {
		bg = s.bgCtx
	}
	if bg == nil {
		bg = context.Background()
	}
	go func() {
		c, err := s.authed(bg)
		if err != nil {
			return
		}
		for _, id := range ids {
			if s.hasMetrics(bg, id) {
				continue
			}
			if d := s.cachedDetail(bg, id); d != nil {
				s.storeMetrics(bg, d)
				continue
			}
			d, err := s.fetchSummaryOnly(bg, c, id)
			if err == nil && d != nil {
				s.storeMetrics(bg, d)
			}
			time.Sleep(120 * time.Millisecond)
		}
	}()
}

// -------- 回填：最近 N 天没有指标的活动，优先读缓存，缓存没有只拉主接口（不拉分段/曲线） --------

func (s *server) startRecoveryBackfill(ctx context.Context) bool {
	s.recMu.Lock()
	defer s.recMu.Unlock()
	if s.recBackfill.Running {
		return false
	}
	now := time.Now().Format(time.RFC3339)
	s.recBackfill = recoveryBackfillState{Running: true, StartedAt: now}
	bg := ctx
	if bg == nil {
		bg = s.bgCtx
	}
	if bg == nil {
		bg = context.Background()
	}
	go s.runRecoveryBackfill(bg)
	return true
}

func (s *server) recoveryBackfillSnapshot() recoveryBackfillState {
	s.recMu.Lock()
	defer s.recMu.Unlock()
	return s.recBackfill
}

func (s *server) setBackfillProgress(done int, err string) {
	s.recMu.Lock()
	defer s.recMu.Unlock()
	s.recBackfill.Done = done
	if err != "" {
		s.recBackfill.Error = err
	}
}

func (s *server) runRecoveryBackfill(ctx context.Context) {
	// 0.11.0：回填窗口从 28 天扩到 180 天，支撑跨月趋势；只补没有指标的活动。
	from := time.Now().AddDate(0, 0, -180).Format("2006-01-02")
	rows, err := s.query(ctx, `SELECT r.activity_id FROM runs r
		LEFT JOIN activity_metrics m ON m.activity_id = r.activity_id
		WHERE substr(r.start_time, 1, 10) >= ? AND m.activity_id IS NULL
		ORDER BY r.start_time DESC`, from)
	if err != nil {
		s.recMu.Lock()
		s.recBackfill.Running = false
		s.recBackfill.Error = "读取待回填活动失败：" + err.Error()
		s.recBackfill.FinishedAt = time.Now().Format(time.RFC3339)
		s.recMu.Unlock()
		return
	}
	s.recMu.Lock()
	s.recBackfill.Total = len(rows)
	s.recMu.Unlock()
	if len(rows) == 0 {
		s.recMu.Lock()
		s.recBackfill.Running = false
		s.recBackfill.FinishedAt = time.Now().Format(time.RFC3339)
		s.recMu.Unlock()
		s.setState(ctx, "metrics_backfill_at", time.Now().Format(time.RFC3339))
		return
	}

	c, err := s.authed(ctx)
	if err != nil {
		s.setBackfillProgress(0, "未登录 Garmin："+err.Error())
		s.recMu.Lock()
		s.recBackfill.Running = false
		s.recBackfill.FinishedAt = time.Now().Format(time.RFC3339)
		s.recMu.Unlock()
		return
	}
	failed := 0
	for i, r := range rows {
		id, _ := r["activity_id"].(string)
		if id == "" {
			continue
		}
		d := s.cachedDetail(ctx, id)
		if d == nil {
			d, err = s.fetchSummaryOnly(ctx, c, id)
			if err != nil {
				failed++
				s.log.Warn("回填指标：拉详情失败", "id", id, "err", err)
			}
		}
		if d != nil {
			s.storeMetrics(ctx, d)
		}
		s.setBackfillProgress(i+1, "")
		// 给 Garmin 一点喘息，避免连续几十次请求被限流
		time.Sleep(120 * time.Millisecond)
	}
	s.setState(ctx, "metrics_backfill_at", time.Now().Format(time.RFC3339))
	s.recMu.Lock()
	s.recBackfill.Running = false
	s.recBackfill.FinishedAt = time.Now().Format(time.RFC3339)
	if failed > 0 {
		s.recBackfill.Error = fmt.Sprintf("%d 次拉取失败，下次可重试", failed)
	}
	s.recMu.Unlock()
	s.log.Info("训练指标回填完成", "total", len(rows), "failed", failed)
}

// fetchSummaryOnly 只拉活动主接口（summaryDTO 里就有训练指标），比 fetchRunDetail 少 4 个请求。
func (s *server) fetchSummaryOnly(ctx context.Context, c *credentials, id string) (*runDetail, error) {
	body, err := s.connectAPI(ctx, c, "/activity-service/activity/"+id)
	if err != nil {
		return nil, err
	}
	var act struct {
		ActivityName   string         `json:"activityName"`
		Description    string         `json:"description"`
		StartTimeLocal string         `json:"startTimeLocal"`
		SummaryDTO     map[string]any `json:"summaryDTO"`
		ActivityType   struct {
			TypeKey string `json:"typeKey"`
		} `json:"activityTypeDTO"`
		EventType struct {
			TypeKey string `json:"typeKey"`
		} `json:"eventTypeDTO"`
	}
	if err := json.Unmarshal(body, &act); err != nil {
		return nil, fmt.Errorf("解析活动概要失败：%w", err)
	}
	start := act.StartTimeLocal
	if v, ok := act.SummaryDTO["startTimeLocal"].(string); ok && v != "" {
		start = v
	}
	return &runDetail{
		V: detailVersion, ActivityID: id, Name: act.ActivityName, StartLocal: start,
		TypeKey: act.ActivityType.TypeKey, EventType: act.EventType.TypeKey, Desc: act.Description,
		Summary: scalars(act.SummaryDTO), FetchedAt: time.Now().Format(time.RFC3339),
	}, nil
}

// -------- 聚合 API --------

func ptrFromRow(row map[string]any, key string) *float64 {
	v, ok := row[key]
	if !ok || v == nil {
		return nil
	}
	f, ok := v.(float64)
	if !ok || math.IsNaN(f) || math.IsInf(f, 0) {
		return nil
	}
	return &f
}

func highIntensity(effect, anaerobic *float64, label string) bool {
	if nump(effect) >= 4 || nump(anaerobic) >= 3 {
		return true
	}
	l := strings.ToUpper(label)
	for _, k := range []string{"OVERREACHING", "VO2MAX", "ANAEROBIC", "SPEED", "MAXEFFORT"} {
		if strings.Contains(l, k) {
			return true
		}
	}
	return false
}

func nump(p *float64) float64 {
	if p == nil {
		return 0
	}
	return *p
}

// weekStart 返回本周一 00:00。
func weekStart(t time.Time) time.Time {
	d := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, t.Location())
	return d.AddDate(0, 0, -int((d.Weekday()+6)%7))
}

func (s *server) apiRecovery(ctx context.Context, days int) (int, any) {
	if days < 7 {
		days = 7
	}
	if days > 365 {
		days = 365
	}
	today := time.Now()
	from := today.AddDate(0, 0, -(days - 1)).Format("2006-01-02")
	to := today.Format("2006-01-02")

	metricRows, err := s.sQueryMetrics(ctx, from, to)
	if err != nil {
		return 500, map[string]any{"error": "读取训练指标失败：" + err.Error()}
	}
	runRows, err := s.query(ctx, `SELECT substr(start_time, 1, 10) AS day, activity_id, type_key,
		COALESCE(corrected_distance_m, distance_m) AS d, start_time
		FROM runs WHERE substr(start_time, 1, 10) >= ? AND substr(start_time, 1, 10) <= ?
		ORDER BY start_time`, from, to)
	if err != nil {
		return 500, map[string]any{"error": "读取跑步记录失败：" + err.Error()}
	}

	// 同一天可能多次活动：指标取负荷最高那次，跑量累加。
	type agg struct {
		row      *recoveryDay
		distance float64
	}
	byDay := map[string]*agg{}
	get := func(day string) *agg {
		a := byDay[day]
		if a == nil {
			a = &agg{}
			byDay[day] = a
		}
		return a
	}
	for _, r := range metricRows {
		day, _ := r["day"].(string)
		if day == "" {
			continue
		}
		a := get(day)
		load := ptrFromRow(r, "training_load")
		if a.row == nil || nump(load) > nump(a.row.Load) {
			id, _ := r["activity_id"].(string)
			name, _ := r["name"].(string)
			tk, _ := r["type_key"].(string)
			a.row = &recoveryDay{
				Date: day, ActivityID: id, Name: name,
				Load: load, Effect: ptrFromRow(r, "training_effect"),
				Anaerobic: ptrFromRow(r, "anaerobic_effect"), TELabel: strFromRow(r, "te_label"),
				BodyBattery: ptrFromRow(r, "body_battery_delta"), RecoveryHR: ptrFromRow(r, "recovery_hr"),
				RestingHR: ptrFromRow(r, "resting_hr"), Stamina: ptrFromRow(r, "stamina_end"),
				Strength: isStrength(tk),
			}
			a.row.High = highIntensity(a.row.Effect, a.row.Anaerobic, a.row.TELabel)
		}
	}
	for _, r := range runRows {
		day, _ := r["day"].(string)
		if day == "" {
			continue
		}
		a := get(day)
		if isRun(strFromRow(r, "type_key")) {
			a.distance += num(r["d"])
		}
	}

	// 连续日期序列，缺失天给空壳（指标 null），前端按 null 断线。
	out := make([]recoveryDay, 0, days)
	high7, load7, loadTotal := 0, 0.0, 0.0
	lastRunDay := ""
	effectLabel := ""
	for i := days - 1; i >= 0; i-- {
		day := today.AddDate(0, 0, -i).Format("2006-01-02")
		a := byDay[day]
		d := recoveryDay{Date: day, DistanceM: 0}
		if a != nil {
			d.DistanceM = a.distance
			if a.row != nil {
				d = *a.row
				d.DistanceM = a.distance
			}
		}
		out = append(out, d)
		if d.Load != nil {
			loadTotal += *d.Load
			if i < 7 {
				load7 += *d.Load
			}
		}
		if i < 7 && d.High {
			high7++
		}
		if d.DistanceM > 0 && lastRunDay == "" {
			lastRunDay = day
		}
		if d.TELabel != "" && effectLabel == "" {
			effectLabel = d.TELabel
		}
	}

	// 周跑量：本周 vs 近 4 周周均（含本周）。上周单独给，便于看「掉量」。
	mon := weekStart(today)
	weekFrom := mon.Format("2006-01-02")
	prevFrom := mon.AddDate(0, 0, -7).Format("2006-01-02")
	weekKm, lastKm := 0.0, 0.0
	for _, r := range runRows {
		day := strFromRow(r, "day")
		if !isRun(strFromRow(r, "type_key")) {
			continue
		}
		if day >= weekFrom {
			weekKm += num(r["d"])
		} else if day >= prevFrom {
			lastKm += num(r["d"])
		}
	}
	baseline := 0.0
	if len(runRows) > 0 {
		// 近 4 周：从今天往前 28 天跑步总量 / 4（不足 4 周按实际天数折算，避免虚高）
		span := days
		if span > 28 {
			span = 28
		}
		total28 := 0.0
		for _, r := range runRows {
			if isRun(strFromRow(r, "type_key")) {
				total28 += num(r["d"])
			}
		}
		baseline = total28 / 1000 / math.Max(1, float64(span)/7)
	}
	weekKm /= 1000
	lastKm /= 1000
	progress := 0
	if baseline > 0 {
		progress = int(math.Round(weekKm / baseline * 100))
	}
	daysSince := -1
	if lastRunDay != "" {
		if t, err := time.ParseInLocation("2006-01-02", lastRunDay, today.Location()); err == nil {
			daysSince = int(today.Sub(t).Hours() / 24)
		}
	}

	loadBase := loadTotal / math.Max(1, float64(days)/7)
	status := deriveRecoveryStatus(effectLabel, high7, daysSince, weekKm, baseline, load7, loadBase, len(metricRows))
	// 主观状态交叉校验：睡眠差/疲劳高/酸痛重时把「上强度」结论降级。
	if note, lower := s.wellbeingCrossCheck(ctx); lower {
		if status.Level == "good" {
			status.Level = "moderate"
		}
		status.Suggestion = note + " " + status.Suggestion
	}

	backfill := s.recoveryBackfillSnapshot()
	// 有跑步记录、却一条指标都没有：自动回填一次（后台跑，不阻塞页面）
	if len(runRows) > 0 && len(metricRows) == 0 && !backfill.Running && backfill.FinishedAt == "" {
		s.startRecoveryBackfill(ctx)
		backfill = s.recoveryBackfillSnapshot()
	}

	return 200, map[string]any{
		"days": out, "summary": recoverySummary{
			WeekKm: round1(weekKm), BaselineKm: round1(baseline), Progress: progress,
			LastWeekKm: round1(lastKm), DaysSince: daysSince, HighDays: high7,
			Load7: round1(load7), LoadBase: round1(loadBase), EffectLabel: effectLabel,
			Status: status,
		},
		"backfill": backfill, "from": from, "to": to,
	}
}

func (s *server) sQueryMetrics(ctx context.Context, from, to string) ([]map[string]any, error) {
	return s.query(ctx, `SELECT m.activity_id, m.day, m.type_key, m.training_load, m.training_effect,
		m.anaerobic_effect, m.te_label, m.body_battery_delta, m.recovery_hr, m.resting_hr,
		m.stamina_end, r.activity_name AS name
		FROM activity_metrics m LEFT JOIN runs r ON r.activity_id = m.activity_id
		WHERE m.day >= ? AND m.day <= ? ORDER BY m.day`, from, to)
}

func strFromRow(row map[string]any, key string) string {
	v, _ := row[key].(string)
	return v
}

func round1(v float64) float64 { return math.Round(v*10) / 10 }

// deriveRecoveryStatus 是可解释的规则派生：证据优先用标签与高强度日，其次看负荷/跑量比。
func deriveRecoveryStatus(label string, high7, daysSince int, weekKm, baseline, load7, loadBase float64, metricCount int) recoveryStatus {
	if metricCount == 0 {
		return recoveryStatus{"unknown", "暂无恢复数据", "最近没有可分析的训练指标", "点开任意一次跑步详情，或在页面上触发一次指标补全"}
	}
	l := strings.ToUpper(label)
	if strings.Contains(l, "OVERREACHING") {
		return recoveryStatus{"low", "需要恢复", "最近一次训练被标记为过度伸展", "今天休息或超慢轻松跑，先别上强度；等身体电量回升再加量"}
	}
	if high7 >= 2 && loadBase > 0 && load7 > loadBase*1.25 {
		return recoveryStatus{"low", "负荷偏高", "近 7 天高强度日偏多、负荷高于近 4 周均值", "今天安排轻松跑或休息，把强度课往后挪一天"}
	}
	if high7 >= 1 && daysSince >= 0 && daysSince <= 2 {
		return recoveryStatus{"moderate", "恢复中", "近 7 天有高强度训练，身体还在回补", "今天以有氧轻松跑为主，留意静息心率与身体电量"}
	}
	if daysSince >= 4 {
		return recoveryStatus{"good", "状态良好", "已有数天没有跑步，恢复窗口充足", "可以安排一次质量课，强度循序渐进"}
	}
	if baseline > 0 && weekKm < baseline*0.55 {
		return recoveryStatus{"moderate", "减量期", "本周跑量明显低于近 4 周均值", "保持轻松跑，确认睡眠和恢复后再逐步加量"}
	}
	return recoveryStatus{"good", "状态稳定", "训练负荷与跑量都在常态区间", "按计划训练；想上强度就放在下一次质量课"}
}

// 给 API 路由用：解析 days 参数。
func recoveryDaysParam(raw string) int {
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || n <= 0 {
		return 28
	}
	return n
}
