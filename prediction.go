// powered by dsh - https://github.com/deepseek-ai/deepseek-harness

package main

// 比赛预测：用近 4 周训练里最长的一次跑步（Riegel 公式）与历史 PB 外推目标距离的完赛区间。
// 三档指数：保守 1.10、达标 1.06、理想 1.02；只做参考，不保证成绩。

import (
	"context"
	"math"
	"time"
)

type racePrediction struct {
	Category     string  `json:"category"`
	DistanceKM   float64 `json:"distance_km"`
	Conservative float64 `json:"conservative_s"`
	Target       float64 `json:"target_s"`
	Optimistic   float64 `json:"optimistic_s"`
	BasedOn      string  `json:"based_on"`
	BasisDetail  string  `json:"basis_detail"`
	GoalTime     float64 `json:"goal_time_s,omitempty"`
}

func riegel(baseTime, baseKM, targetKM, exponent float64) float64 {
	if baseTime <= 0 || baseKM <= 0 || targetKM <= 0 {
		return 0
	}
	return baseTime * math.Pow(targetKM/baseKM, exponent)
}

// apiPrediction 取当前目标比赛；没有目标时用最近一场已完赛比赛的距离。
func (s *server) apiPrediction(ctx context.Context) (int, any) {
	goal := s.currentGoal(ctx)
	cat := goal.Category
	targetKM := goalDistKM[cat]
	goalTime := goal.TargetS
	if targetKM <= 0 {
		// 没目标比赛：用最近一次已完赛比赛的类别
		rows, _ := s.query(ctx, `SELECT category, COALESCE(net_s, official_s) AS t FROM races
			WHERE status = 'finished' AND category IN ('full','half','10k','5k') AND COALESCE(net_s, official_s) > 0
			ORDER BY date DESC LIMIT 1`)
		if len(rows) > 0 {
			cat, _ = rows[0]["category"].(string)
			targetKM = goalDistKM[cat]
		}
	}
	if targetKM <= 0 {
		return 200, map[string]any{"prediction": nil, "reason": "先设一场目标比赛，或收录一场已完赛比赛"}
	}

	// 近 28 天最长的跑步做基准（按净距离/净时长的平均配速外推）
	from := time.Now().AddDate(0, 0, -28).Format("2006-01-02")
	rows, err := s.query(ctx, `SELECT start_time, activity_name, COALESCE(NULLIF(corrected_distance_m,0), distance_m) AS d, duration_s
		FROM runs WHERE substr(start_time,1,10) >= ? AND duration_s > 0
		AND COALESCE(NULLIF(corrected_distance_m,0), distance_m) > 1000
		ORDER BY d DESC LIMIT 1`, from)
	if err != nil || len(rows) == 0 {
		return 200, map[string]any{"prediction": nil, "reason": "近 4 周没有可用的跑步记录"}
	}
	r := rows[0]
	baseKM, baseTime := numField(r, "d")/1000, numField(r, "duration_s")
	day, _ := r["start_time"].(string)
	name, _ := r["activity_name"].(string)
	basedOn, detail := "近 4 周最长跑步", day[:minLen(10, len(day))]+" "+name+" · "+fmt1(baseKM)+" km / "+fmtDur(baseTime)

	// 有同类别 PB 时优先用 PB 作第二组基准，取两组预测的中值更稳。
	pbRows, _ := s.query(ctx, `SELECT COALESCE(net_s, official_s) AS t, date, name FROM races
		WHERE status = 'finished' AND category = ? AND COALESCE(net_s, official_s) > 0
		ORDER BY COALESCE(net_s, official_s) ASC LIMIT 1`, cat)
	if len(pbRows) > 0 {
		pb := numField(pbRows[0], "t")
		if pb > 0 {
			// 若 PB 与训练外推差距在 20% 内，取两者平均；差距大时保留训练外推并说明。
			train := riegel(baseTime, baseKM, targetKM, 1.06)
			if math.Abs(train-pb)/math.Max(train, pb) < 0.2 {
				blendBase := (train + pb) / 2
				// 反推一个等效基准时间，再按三档指数展开
				baseTime = blendBase / math.Pow(targetKM/baseKM, 1.06)
				basedOn = "近 4 周训练 + 同类别 PB"
				pbDate, _ := pbRows[0]["date"].(string)
				detail += "；PB " + fmtDur(pb) + "（" + pbDate + "）"
			}
		}
	}

	p := racePrediction{
		Category: cat, DistanceKM: targetKM,
		Conservative: riegel(baseTime, baseKM, targetKM, 1.10),
		Target:       riegel(baseTime, baseKM, targetKM, 1.06),
		Optimistic:   riegel(baseTime, baseKM, targetKM, 1.02),
		BasedOn:      basedOn, BasisDetail: detail, GoalTime: goalTime,
	}
	return 200, map[string]any{"prediction": p}
}

func minLen(a, b int) int {
	if a < b {
		return a
	}
	return b
}
