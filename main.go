// powered by dsh - https://github.com/deepseek-ai/deepseek-harness

// Package main 是 Garmin 跑步数据插件后端（清单 v2 / 宿主 API 2.0.0）。
//
// 传输与协议：pmw-plugin-rpc/1，JSON-RPC 2.0 + 换行分帧，本机 IPC。
// 宿主是 socket server，插件主动连上并完成 plugin.hello / host.welcome。
//
// 业务：从 host.secrets 读取 Garmin DI token，用 refresh token 换取访问令牌，
// 经 host.http.request 直连 Garmin Connect API 拉取跑步活动，落到插件私有库。
// 前端通过 /api/plugins/external/garmin_connect/api/* 访问本后端。
package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/url"
	"os"
	"os/signal"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

const (
	protocolVersion = "pmw-plugin-rpc/1"
	pluginAPIRange  = ">=2.0.0 <3.0.0"
	maxFrameBytes   = 8 << 20
	defaultCallTO   = 30 * time.Second
	maxInflight     = 8
	secretScope     = "garmin_connect"
)

var (
	pluginID     = envOr("PMW_PLUGIN_ID", "garmin_connect")
	pluginVer    = envOr("PMW_PLUGIN_VERSION", "0.0.0")
	apiVersion   = envOr("PMW_PLUGIN_API_VERSION", "2.0.0")
	dataDir      = envOr("PMW_PLUGIN_DATA_DIR", "")
	cacheDir     = envOr("PMW_PLUGIN_CACHE_DIR", "")
	hostLogLevel = envOr("PMW_PLUGIN_LOG_LEVEL", "info")
)

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func main() {
	logger := newLogger(hostLogLevel)
	if err := run(logger); err != nil {
		logger.Error("插件进程退出", "err", err)
		os.Exit(1)
	}
	logger.Info("插件进程正常退出", "plugin", pluginID)
}

func newLogger(level string) *slog.Logger {
	var l slog.Level
	switch strings.ToLower(strings.TrimSpace(level)) {
	case "debug":
		l = slog.LevelDebug
	case "warn", "warning":
		l = slog.LevelWarn
	case "error":
		l = slog.LevelError
	default:
		l = slog.LevelInfo
	}
	return slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: l}))
}

func run(logger *slog.Logger) error {
	rw, err := dialHost()
	if err != nil {
		return fmt.Errorf("连接宿主失败：%w", err)
	}

	base, cancelBase := context.WithCancel(context.Background())
	defer cancelBase()
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(sigCh)
	go func() {
		select {
		case <-sigCh:
			logger.Info("收到退出信号")
			cancelBase()
		case <-base.Done():
		}
	}()

	srv := &server{log: logger, cancel: cancelBase, startedAt: time.Now()}
	conn := newRPCConn(rw, logger, srv.handlers())
	conn.onDeactivate = cancelBase
	srv.conn = conn
	conn.start(base)

	helloCtx, cancelHello := context.WithTimeout(base, 10*time.Second)
	defer cancelHello()
	if err := conn.hello(helloCtx); err != nil {
		conn.close()
		return fmt.Errorf("握手失败：%w", err)
	}
	logger.Info("已连接宿主", "plugin", pluginID, "version", pluginVer, "api", apiVersion)

	select {
	case <-base.Done():
	case <-conn.done:
	}
	conn.close()
	conn.wait(5 * time.Second)
	return nil
}

func dialHost() (io.ReadWriteCloser, error) {
	sock := strings.TrimSpace(os.Getenv("PMW_PLUGIN_SOCKET"))
	if sock == "" {
		return nil, errors.New("PMW_PLUGIN_SOCKET 未设置")
	}
	if runtime.GOOS == "windows" {
		return os.OpenFile(sock, os.O_RDWR, 0)
	}
	return net.DialTimeout("unix", sock, 5*time.Second)
}

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 + 换行分帧
// ---------------------------------------------------------------------------

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

func (e *rpcError) Error() string { return e.Message }

var errorCodeNumbers = map[string]int{
	"parse_error":       -32700,
	"invalid_request":   -32600,
	"method_not_found":  -32601,
	"invalid_params":    -32602,
	"internal_error":    -32603,
	"permission_denied": -32001,
	"not_found":         -32002,
	"validation":        -32003,
	"conflict":          -32004,
	"rate_limited":      -32005,
	"unavailable":       -32006,
	"internal":          -32007,
}

func rpcErrorf(code, format string, args ...any) *rpcError {
	msg := fmt.Sprintf(format, args...)
	num, ok := errorCodeNumbers[code]
	if !ok {
		num = errorCodeNumbers["internal_error"]
	}
	return &rpcError{Code: num, Message: msg}
}

type handlerFunc func(ctx context.Context, raw json.RawMessage) (any, error)

type rpcConn struct {
	rw       io.ReadWriteCloser
	br       *bufio.Reader
	log      *slog.Logger
	handlers map[string]handlerFunc

	writeMu sync.Mutex
	nextID  atomic.Int64
	mu      sync.Mutex
	pending map[string]chan rpcResponse

	closed atomic.Bool
	done   chan struct{}
	wg     sync.WaitGroup
	sem    chan struct{}

	onDeactivate func()
}

func newRPCConn(rw io.ReadWriteCloser, log *slog.Logger, handlers map[string]handlerFunc) *rpcConn {
	return &rpcConn{
		rw: rw, br: bufio.NewReaderSize(rw, 64*1024), log: log, handlers: handlers,
		pending: map[string]chan rpcResponse{}, done: make(chan struct{}),
		sem: make(chan struct{}, maxInflight),
	}
}

func (c *rpcConn) start(ctx context.Context) { go c.readLoop(ctx) }

func (c *rpcConn) hello(ctx context.Context) error {
	params := map[string]any{
		"protocol":       protocolVersion,
		"plugin_id":      pluginID,
		"plugin_version": pluginVer,
		"token":          strings.TrimSpace(os.Getenv("PMW_PLUGIN_TOKEN")),
		"api":            pluginAPIRange,
		"capabilities":   []string{},
	}
	reqCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	var welcome struct {
		Protocol string `json:"protocol"`
		Plugin   struct {
			ID string `json:"id"`
		} `json:"plugin"`
	}
	if err := c.call(reqCtx, "plugin.hello", params, &welcome); err != nil {
		return err
	}
	if welcome.Protocol != protocolVersion {
		return fmt.Errorf("协议不匹配：宿主 %q，插件要求 %q", welcome.Protocol, protocolVersion)
	}
	if welcome.Plugin.ID != "" && welcome.Plugin.ID != pluginID {
		return fmt.Errorf("宿主回显的插件 id 不一致：%q", welcome.Plugin.ID)
	}
	return nil
}

func (c *rpcConn) close() {
	if c.closed.CompareAndSwap(false, true) {
		close(c.done)
		_ = c.rw.Close()
	}
}

func (c *rpcConn) wait(timeout time.Duration) {
	ch := make(chan struct{})
	go func() { c.wg.Wait(); close(ch) }()
	select {
	case <-ch:
	case <-time.After(timeout):
		c.log.Warn("有请求处理未在超时内结束")
	}
}

func (c *rpcConn) write(v any) error {
	frame, err := json.Marshal(v)
	if err != nil {
		return err
	}
	if len(frame)+1 > maxFrameBytes {
		return fmt.Errorf("响应超过单帧上限 %d 字节", maxFrameBytes)
	}
	frame = append(frame, '\n')
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	_, err = c.rw.Write(frame)
	return err
}

func (c *rpcConn) call(ctx context.Context, method string, params, out any) error {
	id := "pmw-" + strconv.FormatInt(c.nextID.Add(1), 10)
	ch := make(chan rpcResponse, 1)
	c.mu.Lock()
	c.pending[id] = ch
	c.mu.Unlock()
	defer func() {
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
	}()

	req := map[string]any{"jsonrpc": "2.0", "id": id, "method": method}
	if params != nil {
		req["params"] = params
	}
	if err := c.write(req); err != nil {
		return err
	}
	select {
	case <-ctx.Done():
		return fmt.Errorf("调用 %s 超时或被取消：%w", method, ctx.Err())
	case resp := <-ch:
		if resp.Error != nil {
			return resp.Error
		}
		if out != nil && len(resp.Result) > 0 {
			if err := json.Unmarshal(resp.Result, out); err != nil {
				return fmt.Errorf("解析 %s 的响应失败：%w", method, err)
			}
		}
		return nil
	}
}

func (c *rpcConn) readLoop(ctx context.Context) {
	defer c.close()
	for {
		line, err := c.br.ReadBytes('\n')
		if len(line) > maxFrameBytes {
			c.log.Error("收到超过单帧上限的消息，断开", "bytes", len(line))
			return
		}
		line = bytes.TrimSpace(line)
		if len(line) > 0 {
			c.dispatch(ctx, line)
		}
		if err != nil {
			if !errors.Is(err, io.EOF) && !c.closed.Load() {
				c.log.Debug("读取宿主消息结束", "err", err)
			}
			return
		}
	}
}

func (c *rpcConn) dispatch(ctx context.Context, line []byte) {
	var probe struct {
		ID     json.RawMessage `json:"id"`
		Method string          `json:"method"`
	}
	if err := json.Unmarshal(line, &probe); err != nil {
		c.log.Warn("收到无法解析的帧", "err", err)
		return
	}
	if probe.Method == "" {
		if len(probe.ID) > 0 {
			c.deliverResponse(line)
		}
		return
	}
	if len(probe.ID) == 0 || string(probe.ID) == "null" {
		if h, ok := c.handlers[probe.Method]; ok {
			c.wg.Add(1)
			go func() {
				defer c.wg.Done()
				if _, err := h(ctx, nil); err != nil {
					c.log.Warn("处理通知失败", "method", probe.Method, "err", err)
				}
			}()
		}
		return
	}

	c.wg.Add(1)
	go func() {
		defer c.wg.Done()
		select {
		case c.sem <- struct{}{}:
			defer func() { <-c.sem }()
		case <-ctx.Done():
			return
		}
		h, ok := c.handlers[probe.Method]
		if !ok {
			_ = c.write(map[string]any{
				"jsonrpc": "2.0", "id": probe.ID,
				"error": rpcErrorf("method_not_found", "未实现方法 %s", probe.Method),
			})
			return
		}
		var params json.RawMessage
		var full rpcRequest
		if err := json.Unmarshal(line, &full); err == nil {
			params = full.Params
		}
		result, err := h(ctx, params)
		resp := map[string]any{"jsonrpc": "2.0", "id": probe.ID}
		if err != nil {
			var rerr *rpcError
			if !errors.As(err, &rerr) {
				rerr = rpcErrorf("internal", "%s 处理失败：%v", probe.Method, err)
			}
			resp["error"] = rerr
		} else {
			resp["result"] = result
		}
		if werr := c.write(resp); werr != nil {
			c.log.Debug("回写响应失败", "method", probe.Method, "err", werr)
		}
		if probe.Method == "plugin.deactivate" && c.onDeactivate != nil {
			c.onDeactivate()
		}
	}()
}

func (c *rpcConn) deliverResponse(line []byte) {
	var resp rpcResponse
	if err := json.Unmarshal(line, &resp); err != nil {
		c.log.Warn("收到无法解析的响应", "err", err)
		return
	}
	key := idKey(resp.ID)
	c.mu.Lock()
	ch, ok := c.pending[key]
	c.mu.Unlock()
	if !ok {
		return
	}
	select {
	case ch <- resp:
	default:
	}
}

func idKey(raw json.RawMessage) string {
	s := strings.TrimSpace(string(raw))
	if len(s) >= 2 && s[0] == '"' && s[len(s)-1] == '"' {
		if unq, err := strconv.Unquote(s); err == nil {
			return unq
		}
	}
	return s
}

// ---------------------------------------------------------------------------
// 业务：Garmin 同步 + 私有库 + HTTP API
// ---------------------------------------------------------------------------

type server struct {
	conn      *rpcConn
	log       *slog.Logger
	cancel    context.CancelFunc
	startedAt time.Time
	bgCancel  context.CancelFunc
	bgMu      sync.Mutex
}

func (s *server) handlers() map[string]handlerFunc {
	return map[string]handlerFunc{
		"plugin.activate":           s.handleActivate,
		"plugin.deactivate":         s.handleDeactivate,
		"plugin.health":             s.handleHealth,
		"plugin.http.request":       s.handleHTTPRequest,
		"plugin.permission_changed": s.handlePermissionChanged,
	}
}

func (s *server) handleActivate(ctx context.Context, _ json.RawMessage) (any, error) {
	s.log.Info("plugin.activate", "plugin", pluginID)
	s.probeStore(ctx)
	s.startBackgroundSync(ctx)
	return map[string]any{"ok": true}, nil
}

func (s *server) handleDeactivate(ctx context.Context, _ json.RawMessage) (any, error) {
	s.log.Info("plugin.deactivate，准备退出")
	s.bgMu.Lock()
	if s.bgCancel != nil {
		s.bgCancel()
		s.bgCancel = nil
	}
	s.bgMu.Unlock()
	s.cancel()
	return map[string]any{"ok": true}, nil
}

func (s *server) handleHealth(_ context.Context, _ json.RawMessage) (any, error) {
	return map[string]any{
		"status": "ok",
		"detail": map[string]any{
			"plugin": pluginID, "version": pluginVer,
			"pid": os.Getpid(), "uptime_ms": time.Since(s.startedAt).Milliseconds(),
		},
	}, nil
}

func (s *server) handlePermissionChanged(_ context.Context, raw json.RawMessage) (any, error) {
	s.log.Info("权限发生变化", "params", string(raw))
	return nil, nil
}

func (s *server) probeStore(ctx context.Context) {
	callCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var out struct {
		Rows []map[string]any `json:"rows"`
	}
	if err := s.conn.call(callCtx, "host.store.query", map[string]any{
		"sql": "SELECT COUNT(*) AS n FROM runs",
	}, &out); err != nil {
		s.log.Warn("私有库探测失败（迁移未执行？）", "err", err)
		return
	}
	s.log.Info("私有库已就绪", "rows", out.Rows)
}

// startBackgroundSync 后台每 6 小时同步一次；activate 内只起 goroutine。
func (s *server) startBackgroundSync(parent context.Context) {
	s.bgMu.Lock()
	defer s.bgMu.Unlock()
	if s.bgCancel != nil {
		return
	}
	ctx, cancel := context.WithCancel(parent)
	s.bgCancel = cancel
	go func() {
		timer := time.NewTimer(30 * time.Second)
		ticker := time.NewTicker(6 * time.Hour)
		defer timer.Stop()
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
				if _, err := s.doSync(ctx); err != nil {
					s.log.Warn("后台同步失败", "err", err)
				}
			case <-ticker.C:
				if _, err := s.doSync(ctx); err != nil {
					s.log.Warn("后台同步失败", "err", err)
				}
			}
		}
	}()
}

// ---------------------------------------------------------------------------
// 凭证
// ---------------------------------------------------------------------------

type credentials struct {
	RefreshToken string `json:"refresh_token"`
	ClientID     string `json:"client_id"`
	AccessToken  string `json:"access_token,omitempty"`
	IsCN         bool   `json:"is_cn"`
	Timezone     string `json:"timezone,omitempty"`
}

func (s *server) loadCredentials(ctx context.Context) (*credentials, error) {
	callCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	var out struct {
		Value string `json:"value"`
	}
	if err := s.conn.call(callCtx, "host.secrets.get", map[string]any{"scope": secretScope}, &out); err != nil {
		return nil, rpcErrorf("permission_denied", "读取 Garmin 凭证失败，请在设置页填写 token：%v", err)
	}
	if strings.TrimSpace(out.Value) == "" {
		return nil, rpcErrorf("validation", "尚未配置 Garmin token，请在设置页填写")
	}
	var c credentials
	if err := json.Unmarshal([]byte(out.Value), &c); err != nil {
		return nil, rpcErrorf("validation", "Garmin token 格式不是合法 JSON：%v", err)
	}
	if c.RefreshToken == "" {
		return nil, rpcErrorf("validation", "token 缺少 refresh_token")
	}
	if c.ClientID == "" {
		c.ClientID = "GARMIN_CONNECT_MOBILE_ANDROID_DI_2025Q2"
	}
	if c.Timezone == "" {
		c.Timezone = "Asia/Shanghai"
	}
	return &c, nil
}

func (s *server) saveCredentials(ctx context.Context, c *credentials) error {
	if c.ClientID == "" {
		c.ClientID = "GARMIN_CONNECT_MOBILE_ANDROID_DI_2025Q2"
	}
	payload, err := json.Marshal(c)
	if err != nil {
		return err
	}
	callCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	var out map[string]any
	return s.conn.call(callCtx, "host.secrets.set", map[string]any{
		"scope": secretScope, "value": string(payload),
	}, &out)
}

// ---------------------------------------------------------------------------
// Garmin API
// ---------------------------------------------------------------------------

type httpResult struct {
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers"`
	BodyB64 string            `json:"body_b64"`
}

type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
}

func (s *server) httpRequest(ctx context.Context, method, rawURL string, headers map[string]string, body []byte) (*httpResult, error) {
	params := map[string]any{
		"method": method, "url": rawURL, "timeout_ms": 30000,
	}
	if len(headers) > 0 {
		params["headers"] = headers
	}
	if len(body) > 0 {
		params["body_b64"] = base64.StdEncoding.EncodeToString(body)
	}
	callCtx, cancel := context.WithTimeout(ctx, defaultCallTO)
	defer cancel()
	var out httpResult
	if err := s.conn.call(callCtx, "host.http.request", params, &out); err != nil {
		return nil, err
	}
	if out.Status < 200 || out.Status >= 300 {
		decoded, _ := base64.StdEncoding.DecodeString(out.BodyB64)
		return nil, fmt.Errorf("Garmin API 返回 HTTP %d：%s", out.Status, strings.TrimSpace(string(decoded)))
	}
	return &out, nil
}

func (s *server) refreshAccessToken(ctx context.Context, c *credentials) error {
	domain := "garmin.com"
	if c.IsCN {
		domain = "garmin.cn"
	}
	tokenURL := "https://diauth." + domain + "/di-oauth2-service/oauth/token"
	form := url.Values{}
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", c.RefreshToken)
	form.Set("client_id", c.ClientID)

	headers := map[string]string{
		"Content-Type":  "application/x-www-form-urlencoded",
		"Authorization": "Basic " + base64.StdEncoding.EncodeToString([]byte(c.ClientID+":")),
		"Accept":        "application/json",
	}
	res, err := s.httpRequest(ctx, "POST", tokenURL, headers, []byte(form.Encode()))
	if err != nil {
		return err
	}
	decoded, err := base64.StdEncoding.DecodeString(res.BodyB64)
	if err != nil {
		return fmt.Errorf("解码 token 响应失败：%w", err)
	}
	var tr tokenResponse
	if err := json.Unmarshal(decoded, &tr); err != nil {
		return fmt.Errorf("解析 token 响应失败：%w", err)
	}
	if tr.AccessToken == "" {
		return errors.New("token 响应缺少 access_token")
	}
	c.AccessToken = tr.AccessToken
	if tr.RefreshToken != "" {
		c.RefreshToken = tr.RefreshToken
	}
	return s.saveCredentials(ctx, c)
}

type garminActivity struct {
	ActivityID     int64   `json:"activityId"`
	StartTimeLocal string  `json:"startTimeLocal"`
	ActivityName   string  `json:"activityName"`
	Distance       float64 `json:"distance"`
	Duration       float64 `json:"duration"`
	AvgSpeed       float64 `json:"averageSpeed"`
	AvgHR          float64 `json:"averageHR"`
	MaxHR          float64 `json:"maxHR"`
	Cadence        float64 `json:"averageRunningCadenceInStepsPerMinute"`
	ElevationGain  float64 `json:"elevationGain"`
	Calories       float64 `json:"calories"`
}

func (s *server) fetchActivities(ctx context.Context, c *credentials) ([]garminActivity, error) {
	domain := "garmin.com"
	if c.IsCN {
		domain = "garmin.cn"
	}
	apiURL := "https://connectapi." + domain + "/activitylist-service/activities/search/activities?start=0&limit=20&activityType=running"
	headers := map[string]string{
		"Authorization": "Bearer " + c.AccessToken,
		"Accept":        "application/json",
	}
	res, err := s.httpRequest(ctx, "GET", apiURL, headers, nil)
	if err != nil {
		return nil, err
	}
	decoded, err := base64.StdEncoding.DecodeString(res.BodyB64)
	if err != nil {
		return nil, fmt.Errorf("解码活动响应失败：%w", err)
	}
	var list []garminActivity
	if err := json.Unmarshal(decoded, &list); err != nil {
		return nil, fmt.Errorf("解析活动响应失败：%w", err)
	}
	return list, nil
}

// doSync 拉一次活动并落库，返回写入条数。
func (s *server) doSync(ctx context.Context) (int, error) {
	c, err := s.loadCredentials(ctx)
	if err != nil {
		return 0, err
	}
	if err := s.refreshAccessToken(ctx, c); err != nil {
		return 0, fmt.Errorf("刷新 token 失败：%w", err)
	}
	activities, err := s.fetchActivities(ctx, c)
	if err != nil {
		return 0, fmt.Errorf("拉取活动失败：%w", err)
	}

	now := time.Now().Format(time.RFC3339)
	added := 0
	for _, a := range activities {
		if a.ActivityID == 0 {
			continue
		}
		pace := 0.0
		if a.AvgSpeed > 0 {
			pace = 1000.0 / a.AvgSpeed
		}
		callCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
		var out map[string]any
		err := s.conn.call(callCtx, "host.store.exec", map[string]any{
			"sql": `INSERT INTO runs
				(activity_id, start_time, activity_name, distance_m, duration_s,
				 pace_sec_per_km, avg_hr, max_hr, cadence, elevation_m, calories, synced_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT(activity_id) DO UPDATE SET
				 start_time=excluded.start_time, activity_name=excluded.activity_name,
				 distance_m=excluded.distance_m, duration_s=excluded.duration_s,
				 pace_sec_per_km=excluded.pace_sec_per_km, avg_hr=excluded.avg_hr,
				 max_hr=excluded.max_hr, cadence=excluded.cadence,
				 elevation_m=excluded.elevation_m, calories=excluded.calories,
				 synced_at=excluded.synced_at`,
			"args": []any{
				strconv.FormatInt(a.ActivityID, 10), a.StartTimeLocal, a.ActivityName,
				a.Distance, a.Duration, pace, a.AvgHR, a.MaxHR, a.Cadence,
				a.ElevationGain, a.Calories, now,
			},
		}, &out)
		cancel()
		if err != nil {
			s.log.Warn("写入活动失败", "id", a.ActivityID, "err", err)
			continue
		}
		added++
	}

	callCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	var out map[string]any
	_ = s.conn.call(callCtx, "host.store.exec", map[string]any{
		"sql":  "INSERT INTO sync_state(key, value) VALUES('last_sync', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
		"args": []any{now},
	}, &out)
	cancel()

	s.log.Info("同步完成", "activities", len(activities), "written", added)
	return added, nil
}

// ---------------------------------------------------------------------------
// HTTP API（前端 fetch 同源路径）
// ---------------------------------------------------------------------------

func (s *server) handleHTTPRequest(ctx context.Context, raw json.RawMessage) (any, error) {
	var p struct {
		RequestID string            `json:"request_id"`
		Method    string            `json:"method"`
		Path      string            `json:"path"`
		Query     map[string]string `json:"query"`
		BodyB64   string            `json:"body_b64"`
	}
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, rpcErrorf("invalid_params", "HTTP 请求参数不是合法 JSON：%v", err)
	}

	var status int
	var payload any
	body, _ := base64.StdEncoding.DecodeString(p.BodyB64)

	switch {
	case p.Method == "GET" && (p.Path == "/api/runs" || p.Path == "/api/runs/"):
		status, payload = s.apiRuns(ctx)
	case p.Method == "GET" && strings.HasPrefix(p.Path, "/api/status"):
		status, payload = s.apiStatus(ctx)
	case p.Method == "POST" && strings.HasPrefix(p.Path, "/api/credentials"):
		status, payload = s.apiSetCredentials(ctx, body)
	case p.Method == "POST" && strings.HasPrefix(p.Path, "/api/sync"):
		status, payload = s.apiSync(ctx)
	default:
		status = 404
		payload = map[string]any{"error": "未知接口"}
	}

	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, rpcErrorf("internal", "编码 HTTP 响应失败：%v", err)
	}
	return map[string]any{
		"stream":   false,
		"status":   status,
		"headers":  map[string]string{"Content-Type": "application/json; charset=utf-8"},
		"body_b64": base64.StdEncoding.EncodeToString(encoded),
	}, nil
}

func (s *server) queryRuns(ctx context.Context, limit int) ([]map[string]any, error) {
	callCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	var out struct {
		Columns []string         `json:"columns"`
		Rows    []map[string]any `json:"rows"`
	}
	sql := "SELECT activity_id, start_time, activity_name, distance_m, duration_s, pace_sec_per_km, avg_hr, max_hr, cadence, elevation_m, calories, synced_at FROM runs ORDER BY start_time DESC LIMIT ?"
	if err := s.conn.call(callCtx, "host.store.query", map[string]any{
		"sql": sql, "args": []any{limit},
	}, &out); err != nil {
		return nil, err
	}
	return out.Rows, nil
}

func (s *server) apiRuns(ctx context.Context) (int, any) {
	rows, err := s.queryRuns(ctx, 50)
	if err != nil {
		return 500, map[string]any{"error": "读取跑步记录失败：" + err.Error()}
	}
	return 200, map[string]any{"runs": rows, "count": len(rows)}
}

func (s *server) apiStatus(ctx context.Context) (int, any) {
	callCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	var sec struct {
		Value string `json:"value"`
	}
	configured := false
	if err := s.conn.call(callCtx, "host.secrets.get", map[string]any{"scope": secretScope}, &sec); err == nil && strings.TrimSpace(sec.Value) != "" {
		configured = true
	}
	cancel()

	lastSync := ""
	callCtx2, cancel2 := context.WithTimeout(ctx, 15*time.Second)
	defer cancel2()
	var st struct {
		Rows []map[string]any `json:"rows"`
	}
	if err := s.conn.call(callCtx2, "host.store.query", map[string]any{
		"sql": "SELECT value FROM sync_state WHERE key='last_sync'",
	}, &st); err == nil && len(st.Rows) > 0 {
		lastSync, _ = st.Rows[0]["value"].(string)
	}
	return 200, map[string]any{"configured": configured, "last_sync": lastSync}
}

func (s *server) apiSetCredentials(ctx context.Context, body []byte) (int, any) {
	var c credentials
	if err := json.Unmarshal(body, &c); err != nil {
		return 400, map[string]any{"error": "凭证不是合法 JSON：" + err.Error()}
	}
	if strings.TrimSpace(c.RefreshToken) == "" {
		return 400, map[string]any{"error": "refresh_token 不能为空"}
	}
	if err := s.saveCredentials(ctx, &c); err != nil {
		return 500, map[string]any{"error": "保存凭证失败：" + err.Error()}
	}
	return 200, map[string]any{"ok": true}
}

func (s *server) apiSync(ctx context.Context) (int, any) {
	added, err := s.doSync(ctx)
	if err != nil {
		return 502, map[string]any{"error": err.Error()}
	}
	return 200, map[string]any{"ok": true, "written": added}
}
