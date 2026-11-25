// powered by dsh - https://github.com/deepseek-ai/deepseek-harness

package main

// 比赛收录与影像记忆（0.7.0）。
// 比赛：名称、日期、城市、类别、状态、枪声成绩（official_s）、净计时成绩（net_s，0.8.0）、号码、排名、关联的 Garmin 活动、备注。
// 个人最好成绩优先用净计时，没有再用枪声成绩（前端算）。
// 影像：成绩证书、完赛奖牌、参赛照片、视频、号码布、参赛服、参赛包、完赛包、其他；文件在插件数据目录。
// 工作台 API 请求体上限 2 MB、插件单帧 8 MB，所以上传分块（每块 1.5 MB）、读取大文件用流式分块回传，
// 视频按 Range 请求返回 206（浏览器边下边播、能拖动）。

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

var raceCategories = map[string]bool{"full": true, "half": true, "10k": true, "5k": true, "trail": true, "other": true}
var raceStatuses = map[string]bool{"registered": true, "finished": true, "dns": true, "dnf": true}
var mediaKinds = map[string]bool{
	"certificate": true, "medal": true, "photo": true, "video": true, "bib": true,
	"shirt": true, "race_pack": true, "finisher_pack": true, "other": true,
}

const (
	// 工作台 API 统一限制请求体 2 MB（含插件转发），每块 1.5 MB 留出余量
	mediaChunkMax  = 3 << 19
	mediaImageMax  = 40 << 20
	mediaVideoMax  = 1 << 30
	mediaStreamBuf = 2 << 20
	mediaRangeMax  = 2 << 20
)

var mimeExt = map[string]string{
	"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif", "image/heic": ".heic",
	"video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm", "application/pdf": ".pdf",
}

// 后台批量导入历史比赛的进度（和 fullSyncState 分开，互不占用）
type raceImportState struct {
	Running    bool   `json:"running"`
	Pages      int    `json:"pages"`
	Found      int    `json:"found"`
	Imported   int    `json:"imported"`
	Error      string `json:"error,omitempty"`
	StartedAt  string `json:"started_at,omitempty"`
	FinishedAt string `json:"finished_at,omitempty"`
}

// 自动收录用的活动信息：成绩用手表计时（duration）作净计时。
type raceSeed struct {
	ActivityID, Name, StartLocal, TypeKey string
	DistanceM, DurationS                  float64
}

// 和前端 guessCategory 保持一致：按距离猜比赛类别。
func inferRaceCategory(distM float64, typeKey string) string {
	if strings.Contains(typeKey, "trail") {
		return "trail"
	}
	if distM >= 40000 {
		return "full"
	}
	if distM >= 20000 && distM <= 22500 {
		return "half"
	}
	if distM >= 9500 && distM <= 11000 {
		return "10k"
	}
	if distM >= 4800 && distM <= 5600 {
		return "5k"
	}
	return "other"
}

// raceRowFromSeed 用 Garmin 活动生成比赛行；手表计时作净计时，类别按距离猜。
func (seed raceSeed) raceRowFromSeed() (raceRow, bool) {
	id := strings.TrimSpace(seed.ActivityID)
	if !validActivityID(id) || (seed.TypeKey != "" && !isRun(seed.TypeKey)) {
		return raceRow{}, false
	}
	date := ""
	if len(seed.StartLocal) >= 10 {
		date = seed.StartLocal[:10]
	}
	name := strings.TrimSpace(seed.Name)
	if name == "" {
		name = "比赛"
	}
	if len([]rune(name)) > 80 {
		name = string([]rune(name)[:80])
	}
	var netS any
	if seed.DurationS > 0 && seed.DurationS <= 7*24*3600 {
		netS = seed.DurationS
	}
	r := raceRow{Name: name, Date: date, Category: inferRaceCategory(seed.DistanceM, seed.TypeKey),
		Status: "finished", ActivityID: id, NetS: netS}
	return r, r.apply(raceInput{}) == ""
}

// autoCollectRace 把 Garmin 标成比赛的活动收录进 races：只新增，不覆盖用户改过的比赛；
// 用户主动删掉的活动留在 race_skips 里，后续同步不会把它「复活」。
func (s *server) autoCollectRace(ctx context.Context, seed raceSeed) bool {
	r, ok := seed.raceRowFromSeed()
	if !ok {
		return false
	}
	id := r.ActivityID
	if rows, err := s.query(ctx, "SELECT id FROM races WHERE activity_id = ? LIMIT 1", id); err != nil || len(rows) > 0 {
		return false
	}
	// 手动收录过、但没关联活动的同一场（同日期同名称或同净成绩）也不重复加
	if rows, err := s.query(ctx, "SELECT id FROM races WHERE date = ? AND name = ? LIMIT 1", r.Date, r.Name); err == nil && len(rows) > 0 {
		return false
	}
	if r.NetS != nil {
		if rows, err := s.query(ctx, "SELECT id FROM races WHERE date = ? AND net_s = ? LIMIT 1", r.Date, r.NetS); err == nil && len(rows) > 0 {
			return false
		}
	}
	if rows, err := s.query(ctx, "SELECT activity_id FROM race_skips WHERE activity_id = ? LIMIT 1", id); err != nil || len(rows) > 0 {
		return false
	}
	now := time.Now().Format(time.RFC3339)
	err := s.exec(ctx, `INSERT INTO races(id, name, date, city, category, status, official_s, net_s,
		bib_no, rank_overall, rank_group, activity_id, note, created_at, updated_at)
		VALUES (?, ?, ?, '', ?, 'finished', NULL, ?, '', '', '', ?, '', ?, ?)`,
		newID("race_"), r.Name, r.Date, r.Category, r.NetS, id, now, now)
	return err == nil
}

// 打开详情时也能收录：旧缓存里已有 event_type=race 的，补齐名称/距离/时长后收录。
func (s *server) autoCollectRaceFromDetail(ctx context.Context, d *runDetail) bool {
	if d == nil || d.EventType != "race" {
		return false
	}
	seed := raceSeed{
		ActivityID: d.ActivityID, Name: d.Name, StartLocal: d.StartLocal, TypeKey: d.TypeKey,
		DistanceM: numField(d.Summary, "distance"), DurationS: numField(d.Summary, "duration"),
	}
	if seed.Name == "" || seed.StartLocal == "" || seed.TypeKey == "" || seed.DistanceM <= 0 || seed.DurationS <= 0 {
		rows, err := s.query(ctx, `SELECT activity_name, start_time, distance_m, duration_s, type_key
			FROM runs WHERE activity_id = ? LIMIT 1`, d.ActivityID)
		if err == nil && len(rows) > 0 {
			g := func(k string) string { v, _ := rows[0][k].(string); return v }
			if seed.Name == "" {
				seed.Name = g("activity_name")
			}
			if seed.StartLocal == "" {
				seed.StartLocal = g("start_time")
			}
			if seed.TypeKey == "" {
				seed.TypeKey = g("type_key")
			}
			if seed.DistanceM <= 0 {
				seed.DistanceM = numField(rows[0], "distance_m")
			}
			if seed.DurationS <= 0 {
				seed.DurationS = numField(rows[0], "duration_s")
			}
		}
	}
	return s.autoCollectRace(ctx, seed)
}

func mediaRoot() (string, error) {
	if dataDir == "" {
		return "", fmt.Errorf("宿主没有给插件数据目录，存不了文件")
	}
	return filepath.Join(dataDir, "media"), nil
}

func mediaPath(raceID, mediaID, mime string) (string, error) {
	root, err := mediaRoot()
	if err != nil {
		return "", err
	}
	if !validRaceID(raceID) || !validMediaID(mediaID) {
		return "", fmt.Errorf("id 不合法")
	}
	return filepath.Join(root, raceID, mediaID+mimeExt[mime]), nil
}

func validRaceID(id string) bool {
	return strings.HasPrefix(id, "race_") && len(id) <= 40 && safeID(id)
}
func validMediaID(id string) bool {
	return strings.HasPrefix(id, "med_") && len(id) <= 40 && safeID(id)
}

func safeID(id string) bool {
	for _, r := range id {
		if !(r == '_' || (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')) {
			return false
		}
	}
	return true
}

type raceInput struct {
	Name        *string  `json:"name"`
	Date        *string  `json:"date"`
	City        *string  `json:"city"`
	Category    *string  `json:"category"`
	Status      *string  `json:"status"`
	OfficialS   *float64 `json:"official_s"`
	NetS        *float64 `json:"net_s"`
	BibNo       *string  `json:"bib_no"`
	RankOverall *string  `json:"rank_overall"`
	RankGroup   *string  `json:"rank_group"`
	ActivityID  *string  `json:"activity_id"`
	Note        *string  `json:"note"`
}

type raceRow struct {
	Name, Date, City, Category, Status, BibNo, RankOverall, RankGroup, ActivityID, Note string
	OfficialS, NetS                                                                     any
}

func (r *raceRow) apply(in raceInput) string {
	set := func(dst *string, v *string, max int) {
		if v != nil {
			s := strings.TrimSpace(*v)
			if len([]rune(s)) > max {
				s = string([]rune(s)[:max])
			}
			*dst = s
		}
	}
	set(&r.Name, in.Name, 80)
	set(&r.Date, in.Date, 10)
	set(&r.City, in.City, 40)
	set(&r.Category, in.Category, 10)
	set(&r.Status, in.Status, 12)
	set(&r.BibNo, in.BibNo, 20)
	set(&r.RankOverall, in.RankOverall, 20)
	set(&r.RankGroup, in.RankGroup, 20)
	set(&r.ActivityID, in.ActivityID, 20)
	set(&r.Note, in.Note, 2000)
	secs := func(dst *any, v *float64) {
		if v != nil {
			if *v <= 0 {
				*dst = nil
			} else {
				*dst = *v
			}
		}
	}
	secs(&r.OfficialS, in.OfficialS)
	secs(&r.NetS, in.NetS)
	switch {
	case r.Name == "":
		return "比赛名称不能为空"
	case !validDate(r.Date):
		return "日期格式应为 YYYY-MM-DD"
	case !raceCategories[r.Category]:
		return "类别只能是 full / half / 10k / 5k / trail / other"
	case !raceStatuses[r.Status]:
		return "状态只能是 registered / finished / dns / dnf"
	case r.ActivityID != "" && !validActivityID(r.ActivityID):
		return "关联活动 id 不合法"
	}
	for _, x := range []any{r.OfficialS, r.NetS} {
		if v, ok := x.(float64); ok && v > 7*24*3600 {
			return "成绩不合理"
		}
	}
	return ""
}

func (s *server) apiRaces(ctx context.Context) (int, any) {
	rows, err := s.query(ctx, `SELECT r.id, r.name, r.date, r.city, r.category, r.status, r.official_s, r.net_s, r.bib_no, r.rank_overall,
		r.rank_group, r.activity_id, r.note, r.created_at, r.updated_at,
		(SELECT COUNT(*) FROM race_media m WHERE m.race_id = r.id AND m.ready = 1) AS media_count,
		(SELECT m.id FROM race_media m WHERE m.race_id = r.id AND m.ready = 1 AND m.mime LIKE 'image/%'
		   ORDER BY CASE m.kind WHEN 'medal' THEN 0 WHEN 'photo' THEN 1 WHEN 'certificate' THEN 2 ELSE 3 END, m.created_at LIMIT 1) AS cover_id,
		a.distance_m AS act_distance_m, a.duration_s AS act_duration_s, a.activity_name AS act_name
		FROM races r LEFT JOIN runs a ON a.activity_id = r.activity_id
		ORDER BY r.date DESC, r.created_at DESC`)
	if err != nil {
		return 500, map[string]any{"error": "读取比赛失败：" + err.Error()}
	}
	if rows == nil {
		rows = []map[string]any{}
	}
	return 200, map[string]any{"races": rows}
}

func (s *server) raceImportSnapshot() raceImportState {
	s.raceImpMu.Lock()
	defer s.raceImpMu.Unlock()
	return s.raceImp
}

// 从 Garmin 全量活动里补录比赛，后台跑、前端轮询 /status 看进度。
func (s *server) startRaceImport() bool {
	s.raceImpMu.Lock()
	if s.raceImp.Running {
		s.raceImpMu.Unlock()
		return false
	}
	s.raceImp = raceImportState{Running: true, StartedAt: time.Now().Format(time.RFC3339)}
	s.raceImpMu.Unlock()
	ctx := s.bgCtx
	if ctx == nil {
		ctx = context.Background()
	}
	go func() {
		found, imported, err := s.importRacesFromGarmin(ctx, func(pages, f, i int) {
			s.raceImpMu.Lock()
			s.raceImp.Pages, s.raceImp.Found, s.raceImp.Imported = pages, f, i
			s.raceImpMu.Unlock()
		})
		s.raceImpMu.Lock()
		s.raceImp.Running = false
		s.raceImp.Found, s.raceImp.Imported = found, imported
		s.raceImp.FinishedAt = time.Now().Format(time.RFC3339)
		if err != nil {
			s.raceImp.Error = err.Error()
		}
		s.raceImpMu.Unlock()
	}()
	return true
}

func (s *server) apiRaceImport() (int, any) {
	if !s.startRaceImport() {
		return 409, map[string]any{"error": "历史比赛导入已经在跑了", "race_import": s.raceImportSnapshot()}
	}
	return 202, map[string]any{"ok": true, "started": true, "race_import": s.raceImportSnapshot()}
}

// importRacesFromGarmin 逐页扫 Garmin 活动；列表没给 eventTypeDTO 时用本地 runs / 详情缓存兜底。
func (s *server) importRacesFromGarmin(ctx context.Context, progress func(pages, found, imported int)) (int, int, error) {
	c, err := s.authed(ctx)
	if err != nil {
		return 0, 0, err
	}
	local := map[string]string{}
	if rows, err := s.query(ctx, "SELECT activity_id, event_type FROM runs WHERE event_type IS NOT NULL AND event_type != ''"); err == nil {
		for _, r := range rows {
			id, _ := r["activity_id"].(string)
			et, _ := r["event_type"].(string)
			local[id] = et
		}
	}
	const limit, maxPages = 100, 100
	found, imported := 0, 0
	for page := 0; page < maxPages; page++ {
		list, err := s.fetchActivities(ctx, c, page*limit, limit)
		if err != nil {
			return found, imported, fmt.Errorf("拉取 Garmin 活动失败（第 %d 页）：%w", page+1, err)
		}
		for _, a := range list {
			if a.ActivityID == 0 || !isRun(a.ActivityType.TypeKey) {
				continue
			}
			id := strconv.FormatInt(a.ActivityID, 10)
			et := a.EventTypeDTO.TypeKey
			if et == "" {
				et = local[id]
			}
			if et == "" {
				if d := s.cachedDetail(ctx, id); d != nil {
					et = d.EventType
				}
			}
			if et != "race" {
				continue
			}
			found++
			if s.autoCollectRace(ctx, raceSeed{
				ActivityID: id, Name: a.ActivityName, StartLocal: a.StartTimeLocal,
				TypeKey: a.ActivityType.TypeKey, DistanceM: a.Distance, DurationS: a.Duration,
			}) {
				imported++
			}
		}
		if progress != nil {
			progress(page+1, found, imported)
		}
		if len(list) < limit {
			break
		}
	}
	return found, imported, nil
}

func (s *server) apiRace(ctx context.Context, id string) (int, any) {
	if !validRaceID(id) {
		return 400, map[string]any{"error": "比赛 id 不合法"}
	}
	rows, err := s.query(ctx, `SELECT r.*, a.distance_m AS act_distance_m, a.duration_s AS act_duration_s, a.activity_name AS act_name, a.start_time AS act_start
		FROM races r LEFT JOIN runs a ON a.activity_id = r.activity_id WHERE r.id = ?`, id)
	if err != nil || len(rows) == 0 {
		return 404, map[string]any{"error": "找不到这场比赛"}
	}
	media, err := s.query(ctx, `SELECT id, kind, name, mime, size, caption, created_at FROM race_media
		WHERE race_id = ? AND ready = 1 ORDER BY created_at`, id)
	if err != nil {
		return 500, map[string]any{"error": "读取影像失败：" + err.Error()}
	}
	if media == nil {
		media = []map[string]any{}
	}
	return 200, map[string]any{"race": rows[0], "media": media}
}

func (s *server) apiCreateRace(ctx context.Context, body []byte) (int, any) {
	var in raceInput
	if err := json.Unmarshal(body, &in); err != nil {
		return 400, map[string]any{"error": "请求不是合法 JSON"}
	}
	r := raceRow{Category: "other", Status: "finished"}
	if msg := r.apply(in); msg != "" {
		return 400, map[string]any{"error": msg}
	}
	// 同一次活动只收录一场比赛：重复标记（或把类别改成比赛）时返回已有的那场
	if r.ActivityID != "" {
		if rows, err := s.query(ctx, "SELECT id FROM races WHERE activity_id = ? LIMIT 1", r.ActivityID); err == nil && len(rows) > 0 {
			return 200, map[string]any{"ok": true, "id": rows[0]["id"], "existing": true}
		}
		// 手动重新标记时允许收录之前被自动同步删掉的活动
		_ = s.exec(ctx, "DELETE FROM race_skips WHERE activity_id = ?", r.ActivityID)
	}
	id := newID("race_")
	now := time.Now().Format(time.RFC3339)
	if err := s.exec(ctx, `INSERT INTO races(id, name, date, city, category, status, official_s, net_s, bib_no, rank_overall, rank_group, activity_id, note, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, r.Name, r.Date, r.City, r.Category, r.Status, r.OfficialS, r.NetS, r.BibNo, r.RankOverall, r.RankGroup, r.ActivityID, r.Note, now, now); err != nil {
		return 500, map[string]any{"error": "保存失败：" + err.Error()}
	}
	return 200, map[string]any{"ok": true, "id": id}
}

func (s *server) apiUpdateRace(ctx context.Context, id string, body []byte) (int, any) {
	if !validRaceID(id) {
		return 400, map[string]any{"error": "比赛 id 不合法"}
	}
	rows, err := s.query(ctx, "SELECT * FROM races WHERE id = ?", id)
	if err != nil || len(rows) == 0 {
		return 404, map[string]any{"error": "找不到这场比赛"}
	}
	g := func(k string) string { v, _ := rows[0][k].(string); return v }
	r := raceRow{Name: g("name"), Date: g("date"), City: g("city"), Category: g("category"), Status: g("status"), BibNo: g("bib_no"),
		RankOverall: g("rank_overall"), RankGroup: g("rank_group"), ActivityID: g("activity_id"), Note: g("note"),
		OfficialS: rows[0]["official_s"], NetS: rows[0]["net_s"]}
	var in raceInput
	if err := json.Unmarshal(body, &in); err != nil {
		return 400, map[string]any{"error": "请求不是合法 JSON"}
	}
	if msg := r.apply(in); msg != "" {
		return 400, map[string]any{"error": msg}
	}
	if err := s.exec(ctx, `UPDATE races SET name=?, date=?, city=?, category=?, status=?, official_s=?, net_s=?, bib_no=?, rank_overall=?, rank_group=?,
		activity_id=?, note=?, updated_at=? WHERE id=?`,
		r.Name, r.Date, r.City, r.Category, r.Status, r.OfficialS, r.NetS, r.BibNo, r.RankOverall, r.RankGroup, r.ActivityID, r.Note,
		time.Now().Format(time.RFC3339), id); err != nil {
		return 500, map[string]any{"error": "保存失败：" + err.Error()}
	}
	return 200, map[string]any{"ok": true}
}

func (s *server) apiDeleteRace(ctx context.Context, id string) (int, any) {
	if !validRaceID(id) {
		return 400, map[string]any{"error": "比赛 id 不合法"}
	}
	if rows, err := s.query(ctx, "SELECT activity_id FROM races WHERE id = ?", id); err == nil && len(rows) > 0 {
		if activityID, _ := rows[0]["activity_id"].(string); activityID != "" {
			_ = s.exec(ctx, "INSERT OR IGNORE INTO race_skips(activity_id, created_at) VALUES (?, ?)",
				activityID, time.Now().Format(time.RFC3339))
		}
	}
	if err := s.exec(ctx, "DELETE FROM race_media WHERE race_id = ?", id); err != nil {
		return 500, map[string]any{"error": "删除失败：" + err.Error()}
	}
	if err := s.exec(ctx, "DELETE FROM races WHERE id = ?", id); err != nil {
		return 500, map[string]any{"error": "删除失败：" + err.Error()}
	}
	if root, err := mediaRoot(); err == nil {
		_ = os.RemoveAll(filepath.Join(root, id))
	}
	return 200, map[string]any{"ok": true}
}

// ---- 影像 ----

func (s *server) apiCreateMedia(ctx context.Context, raceID string, body []byte) (int, any) {
	if !validRaceID(raceID) {
		return 400, map[string]any{"error": "比赛 id 不合法"}
	}
	if rows, err := s.query(ctx, "SELECT id FROM races WHERE id = ?", raceID); err != nil || len(rows) == 0 {
		return 404, map[string]any{"error": "找不到这场比赛"}
	}
	var in struct {
		Kind    string `json:"kind"`
		Name    string `json:"name"`
		Mime    string `json:"mime"`
		Size    int64  `json:"size"`
		Caption string `json:"caption"`
	}
	if err := json.Unmarshal(body, &in); err != nil {
		return 400, map[string]any{"error": "请求不是合法 JSON"}
	}
	in.Mime = strings.ToLower(strings.TrimSpace(in.Mime))
	switch {
	case !mediaKinds[in.Kind]:
		return 400, map[string]any{"error": "影像类别不对"}
	case mimeExt[in.Mime] == "":
		return 400, map[string]any{"error": "只支持 JPG、PNG、WebP、GIF、HEIC 图片，MP4、MOV、WebM 视频和 PDF"}
	case in.Size <= 0:
		return 400, map[string]any{"error": "文件是空的"}
	case strings.HasPrefix(in.Mime, "video/") && in.Size > mediaVideoMax:
		return 400, map[string]any{"error": "视频最大 1 GB"}
	case !strings.HasPrefix(in.Mime, "video/") && in.Size > mediaImageMax:
		return 400, map[string]any{"error": "图片和 PDF 最大 40 MB"}
	}
	name := strings.TrimSpace(filepath.Base(in.Name))
	if len([]rune(name)) > 120 {
		name = string([]rune(name)[:120])
	}
	id := newID("med_")
	path, err := mediaPath(raceID, id, in.Mime)
	if err != nil {
		return 500, map[string]any{"error": err.Error()}
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return 500, map[string]any{"error": "建目录失败：" + err.Error()}
	}
	if err := os.WriteFile(path, nil, 0o644); err != nil {
		return 500, map[string]any{"error": "建文件失败：" + err.Error()}
	}
	if err := s.exec(ctx, `INSERT INTO race_media(id, race_id, kind, name, mime, size, received, ready, caption, created_at)
		VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`, id, raceID, in.Kind, name, in.Mime, in.Size, strings.TrimSpace(in.Caption), time.Now().Format(time.RFC3339)); err != nil {
		return 500, map[string]any{"error": "保存失败：" + err.Error()}
	}
	return 200, map[string]any{"ok": true, "id": id, "chunk_max": mediaChunkMax}
}

type mediaRow struct {
	ID, RaceID, Kind, Name, Mime string
	Size, Received               int64
	Ready                        bool
}

func (s *server) loadMedia(ctx context.Context, id string) (*mediaRow, error) {
	if !validMediaID(id) {
		return nil, fmt.Errorf("影像 id 不合法")
	}
	rows, err := s.query(ctx, "SELECT id, race_id, kind, name, mime, size, received, ready FROM race_media WHERE id = ?", id)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, fmt.Errorf("找不到这个文件")
	}
	r := rows[0]
	m := &mediaRow{Size: int64(numField(r, "size")), Received: int64(numField(r, "received")), Ready: numField(r, "ready") != 0}
	m.ID, _ = r["id"].(string)
	m.RaceID, _ = r["race_id"].(string)
	m.Kind, _ = r["kind"].(string)
	m.Name, _ = r["name"].(string)
	m.Mime, _ = r["mime"].(string)
	return m, nil
}

// apiMediaChunk 追加一块：offset 必须等于已收到的字节数（断了从 received 续传）。
func (s *server) apiMediaChunk(ctx context.Context, id string, q url.Values, body []byte) (int, any) {
	m, err := s.loadMedia(ctx, id)
	if err != nil {
		return 404, map[string]any{"error": err.Error()}
	}
	if m.Ready {
		return 409, map[string]any{"error": "文件已经传完了"}
	}
	off, err := strconv.ParseInt(q.Get("offset"), 10, 64)
	if err != nil || off != m.Received {
		return 409, map[string]any{"error": "块的位置不对", "received": m.Received}
	}
	if len(body) == 0 || len(body) > mediaChunkMax || off+int64(len(body)) > m.Size {
		return 400, map[string]any{"error": "块大小不对"}
	}
	path, err := mediaPath(m.RaceID, m.ID, m.Mime)
	if err != nil {
		return 500, map[string]any{"error": err.Error()}
	}
	f, err := os.OpenFile(path, os.O_WRONLY, 0o644)
	if err != nil {
		return 500, map[string]any{"error": "打开文件失败：" + err.Error()}
	}
	_, werr := f.WriteAt(body, off)
	cerr := f.Close()
	if werr != nil || cerr != nil {
		return 500, map[string]any{"error": "写文件失败"}
	}
	received := off + int64(len(body))
	ready := 0
	if received == m.Size {
		ready = 1
	}
	if err := s.exec(ctx, "UPDATE race_media SET received = ?, ready = ? WHERE id = ?", received, ready, m.ID); err != nil {
		return 500, map[string]any{"error": "更新进度失败：" + err.Error()}
	}
	return 200, map[string]any{"ok": true, "received": received, "ready": ready == 1}
}

func (s *server) apiUpdateMedia(ctx context.Context, id string, body []byte) (int, any) {
	m, err := s.loadMedia(ctx, id)
	if err != nil {
		return 404, map[string]any{"error": err.Error()}
	}
	var in struct {
		Kind    *string `json:"kind"`
		Caption *string `json:"caption"`
	}
	if err := json.Unmarshal(body, &in); err != nil {
		return 400, map[string]any{"error": "请求不是合法 JSON"}
	}
	kind := m.Kind
	if in.Kind != nil {
		if !mediaKinds[*in.Kind] {
			return 400, map[string]any{"error": "影像类别不对"}
		}
		kind = *in.Kind
	}
	if in.Caption != nil {
		c := strings.TrimSpace(*in.Caption)
		if len([]rune(c)) > 200 {
			return 400, map[string]any{"error": "说明最多 200 个字"}
		}
		if err := s.exec(ctx, "UPDATE race_media SET caption = ? WHERE id = ?", c, id); err != nil {
			return 500, map[string]any{"error": "保存失败：" + err.Error()}
		}
	}
	if err := s.exec(ctx, "UPDATE race_media SET kind = ? WHERE id = ?", kind, id); err != nil {
		return 500, map[string]any{"error": "保存失败：" + err.Error()}
	}
	return 200, map[string]any{"ok": true}
}

func (s *server) apiDeleteMedia(ctx context.Context, id string) (int, any) {
	m, err := s.loadMedia(ctx, id)
	if err != nil {
		return 404, map[string]any{"error": err.Error()}
	}
	if path, err := mediaPath(m.RaceID, m.ID, m.Mime); err == nil {
		_ = os.Remove(path)
	}
	if err := s.exec(ctx, "DELETE FROM race_media WHERE id = ?", id); err != nil {
		return 500, map[string]any{"error": "删除失败：" + err.Error()}
	}
	return 200, map[string]any{"ok": true}
}

// serveMedia 回文件：带 Range 时回 206（每次最多 2 MB，视频播放用）；不带 Range 时流式分块回整个文件。
func (s *server) serveMedia(ctx context.Context, requestID, id string, headers map[string]string) (map[string]any, error) {
	plain := func(status int, msg string) (map[string]any, error) {
		b, _ := json.Marshal(map[string]any{"error": msg})
		return map[string]any{"stream": false, "status": status,
			"headers": map[string]string{"Content-Type": "application/json; charset=utf-8"}, "body_b64": base64.StdEncoding.EncodeToString(b)}, nil
	}
	m, err := s.loadMedia(ctx, id)
	if err != nil {
		return plain(404, err.Error())
	}
	if !m.Ready {
		return plain(409, "文件还没传完")
	}
	path, err := mediaPath(m.RaceID, m.ID, m.Mime)
	if err != nil {
		return plain(500, err.Error())
	}
	f, err := os.Open(path)
	if err != nil {
		return plain(404, "文件不见了")
	}
	base := map[string]string{
		"Content-Type":        m.Mime,
		"Accept-Ranges":       "bytes",
		"Cache-Control":       "private, max-age=86400",
		"Content-Disposition": "inline; filename*=UTF-8''" + url.PathEscape(m.Name),
	}
	rng := ""
	for k, v := range headers {
		if strings.EqualFold(k, "range") {
			rng = v
		}
	}
	if start, end, ok := parseRange(rng, m.Size); ok {
		defer f.Close()
		if end-start+1 > mediaRangeMax {
			end = start + mediaRangeMax - 1
		}
		buf := make([]byte, end-start+1)
		n, err := f.ReadAt(buf, start)
		if err != nil && err != io.EOF {
			return plain(500, "读文件失败")
		}
		buf = buf[:n]
		base["Content-Range"] = fmt.Sprintf("bytes %d-%d/%d", start, start+int64(n)-1, m.Size)
		base["Content-Length"] = strconv.Itoa(n)
		return map[string]any{"stream": false, "status": 206, "headers": base, "body_b64": base64.StdEncoding.EncodeToString(buf)}, nil
	}
	base["Content-Length"] = strconv.FormatInt(m.Size, 10)
	// 流式：先回开始帧，后台按序号推块（宿主会把先到的块缓存好），最后 end 带总块数
	go func() {
		defer f.Close()
		seq := 0
		buf := make([]byte, mediaStreamBuf)
		for {
			n, err := f.Read(buf)
			if n > 0 {
				cctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
				var out map[string]any
				cerr := s.conn.call(cctx, "host.http.chunk", map[string]any{
					"request_id": requestID, "seq": seq, "data_b64": base64.StdEncoding.EncodeToString(buf[:n]),
				}, &out)
				cancel()
				if cerr != nil {
					s.log.Warn("推送文件块失败", "media", id, "err", cerr)
					return
				}
				seq++
			}
			if err != nil {
				break
			}
		}
		cctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		var out map[string]any
		_ = s.conn.call(cctx, "host.http.end", map[string]any{"request_id": requestID, "seq": seq}, &out)
	}()
	return map[string]any{"stream": true, "status": 200, "headers": base}, nil
}

// parseRange 只认单段 bytes=start-end / bytes=start- / bytes=-suffix。
func parseRange(h string, size int64) (int64, int64, bool) {
	h = strings.TrimSpace(h)
	if !strings.HasPrefix(h, "bytes=") || strings.Contains(h, ",") || size <= 0 {
		return 0, 0, false
	}
	spec := strings.TrimPrefix(h, "bytes=")
	a, b, ok := strings.Cut(spec, "-")
	if !ok {
		return 0, 0, false
	}
	var start, end int64
	var err error
	switch {
	case a == "" && b != "":
		n, err := strconv.ParseInt(b, 10, 64)
		if err != nil || n <= 0 {
			return 0, 0, false
		}
		if n > size {
			n = size
		}
		start, end = size-n, size-1
	default:
		start, err = strconv.ParseInt(a, 10, 64)
		if err != nil || start < 0 || start >= size {
			return 0, 0, false
		}
		end = size - 1
		if b != "" {
			end, err = strconv.ParseInt(b, 10, 64)
			if err != nil || end < start {
				return 0, 0, false
			}
			if end >= size {
				end = size - 1
			}
		}
	}
	return start, end, true
}
