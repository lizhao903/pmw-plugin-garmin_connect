// powered by dsh - https://github.com/deepseek-ai/deepseek-harness

// Package main 是 Garmin 跑步数据插件后端（清单 v2 / 宿主 API 2.0.0）。
//
// 传输与协议：pmw-plugin-rpc/1，JSON-RPC 2.0 + 换行分帧，本机 IPC。
// 宿主是 socket server，插件主动连上并完成 plugin.hello / host.welcome。
//
// 业务：设置页填 Garmin 邮箱密码，插件按移动端 SSO 流程登录换 DI token，存进宿主保险箱（host.secrets，不存密码）；
// 之后用 refresh token 换访问令牌，经 host.http.request 拉取跑步活动和单次详情（分段、心率区间），落到插件私有库。
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
// 凭证：登录拿到的 DI token 存在宿主保险箱（host.secrets，scope garmin_connect），不存密码
// ---------------------------------------------------------------------------

type credentials struct {
	RefreshToken string `json:"refresh_token"`
	ClientID     string `json:"client_id"`
	AccessToken  string `json:"access_token,omitempty"`
	IsCN         bool   `json:"is_cn"`
	Email        string `json:"email,omitempty"`
	LoggedInAt   string `json:"logged_in_at,omitempty"`
}

func (c *credentials) domain() string {
	if c.IsCN {
		return "garmin.cn"
	}
	return "garmin.com"
}

func (s *server) readSecret(ctx context.Context) (string, error) {
	callCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	var out struct {
		Value string `json:"value"`
	}
	if err := s.conn.call(callCtx, "host.secrets.get", map[string]any{"scope": secretScope}, &out); err != nil {
		return "", err
	}
	return strings.TrimSpace(out.Value), nil
}

func (s *server) loadCredentials(ctx context.Context) (*credentials, error) {
	raw, err := s.readSecret(ctx)
	if err != nil {
		return nil, rpcErrorf("permission_denied", "读取 Garmin 登录信息失败：%v", err)
	}
	if raw == "" {
		return nil, rpcErrorf("validation", "还没登录 Garmin，请先在设置页登录")
	}
	var c credentials
	if err := json.Unmarshal([]byte(raw), &c); err != nil {
		return nil, rpcErrorf("validation", "保存的登录信息损坏，请在设置页重新登录")
	}
	if c.RefreshToken == "" || c.ClientID == "" {
		return nil, rpcErrorf("validation", "登录信息不完整，请在设置页重新登录")
	}
	return &c, nil
}

func (s *server) saveCredentials(ctx context.Context, c *credentials) error {
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

func (s *server) clearCredentials(ctx context.Context) error {
	callCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	var out map[string]any
	return s.conn.call(callCtx, "host.secrets.delete", map[string]any{"scope": secretScope}, &out)
}

// ---------------------------------------------------------------------------
// 出网：一律经宿主 host.http.request（需要用户授予 network:any）
// ---------------------------------------------------------------------------

type httpResult struct {
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers"`
	BodyB64 string            `json:"body_b64"`
	body    []byte
}

// httpRaw 发请求，不按状态码判断成败（登录流程要看 401/429 的具体内容）。
func (s *server) httpRaw(ctx context.Context, method, rawURL string, headers map[string]string, body []byte) (*httpResult, error) {
	params := map[string]any{"method": method, "url": rawURL, "timeout_ms": 30000}
	if len(headers) > 0 {
		params["headers"] = headers
	}
	if len(body) > 0 {
		params["body_b64"] = base64.StdEncoding.EncodeToString(body)
	}
	callCtx, cancel := context.WithTimeout(ctx, defaultCallTO+5*time.Second)
	defer cancel()
	var out httpResult
	if err := s.conn.call(callCtx, "host.http.request", params, &out); err != nil {
		var rerr *rpcError
		if errors.As(err, &rerr) && rerr.Code == errorCodeNumbers["permission_denied"] {
			return nil, fmt.Errorf("插件还没有联网权限：在「设置 → 插件 → 外部插件」里给 Garmin 跑步数据授予 network:any（%s）", rerr.Message)
		}
		return nil, err
	}
	out.body, _ = base64.StdEncoding.DecodeString(out.BodyB64)
	return &out, nil
}

func (s *server) httpOK(ctx context.Context, method, rawURL string, headers map[string]string, body []byte) ([]byte, error) {
	res, err := s.httpRaw(ctx, method, rawURL, headers, body)
	if err != nil {
		return nil, err
	}
	if res.Status < 200 || res.Status >= 300 {
		return nil, &garminHTTPError{Status: res.Status, Body: truncate(strings.TrimSpace(string(res.body)), 300)}
	}
	return res.body, nil
}

type garminHTTPError struct {
	Status int
	Body   string
}

func (e *garminHTTPError) Error() string {
	return fmt.Sprintf("Garmin 返回 HTTP %d：%s", e.Status, e.Body)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// ---------------------------------------------------------------------------
// 登录（同 garminconnect 0.3.x 的 iOS 移动端流程）：
// 1. GET sso.<domain>/mobile/sso/en_US/sign-in 2. 停 2~4 秒 3. POST /mobile/api/login（JSON 账号密码）
// 4. 拿 serviceTicketId 到 diauth.<domain> 换 DI OAuth2 token（依次试几个 client_id）
// 宿主出网代理不带 Cookie；实测中国区 SSO 不带 Cookie 也能完成账号密码校验。两步验证要带 SSO 会话，暂不支持。
// ---------------------------------------------------------------------------

const (
	iosSSOClientID = "GCM_IOS_DARK"
	iosLoginUA     = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148"
	nativeUA       = "GCM-Android-5.23"
	nativeXUA      = "com.garmin.android.apps.connectmobile/5.23; ; Google/sdk_gphone64_arm64/google; Android/33; Dalvik/2.1.0"
	diGrantType    = "https://connectapi.garmin.com/di-oauth2-service/oauth/grant/service_ticket"
)

var diClientIDs = []string{
	"GARMIN_CONNECT_MOBILE_ANDROID_DI_2025Q2",
	"GARMIN_CONNECT_MOBILE_ANDROID_DI_2024Q4",
	"GARMIN_CONNECT_MOBILE_ANDROID_DI",
	"GARMIN_CONNECT_MOBILE_IOS_DI",
}

func nativeHeaders(extra map[string]string) map[string]string {
	h := map[string]string{
		"User-Agent":                  nativeUA,
		"X-Garmin-User-Agent":         nativeXUA,
		"X-Garmin-Paired-App-Version": "10861",
		"X-Garmin-Client-Platform":    "Android",
		"X-App-Ver":                   "10861",
		"X-Lang":                      "en",
		"X-GCExperience":              "GC5",
		"Accept-Language":             "en-US,en;q=0.9",
	}
	for k, v := range extra {
		h[k] = v
	}
	return h
}

func basicAuth(clientID string) string {
	return "Basic " + base64.StdEncoding.EncodeToString([]byte(clientID+":"))
}

// loginError 是给用户看的登录失败原因（不含账号、密码、ticket）。
type loginError struct {
	Status int
	Msg    string
}

func (e *loginError) Error() string { return e.Msg }

func (s *server) login(ctx context.Context, email, password string, isCN bool) (*credentials, error) {
	c := &credentials{IsCN: isCN, Email: email}
	sso := "https://sso." + c.domain()
	svc := "https://mobile.integration." + c.domain() + "/gcm/ios"

	signinQ := url.Values{"clientId": {iosSSOClientID}, "service": {svc}}
	signinURL := sso + "/mobile/sso/en_US/sign-in?" + signinQ.Encode()
	page, err := s.httpRaw(ctx, "GET", signinURL, map[string]string{
		"User-Agent":      iosLoginUA,
		"Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
		"Accept-Language": "en-US,en;q=0.9",
	}, nil)
	if err != nil {
		return nil, &loginError{502, "连不上 Garmin 登录页：" + err.Error()}
	}
	if page.Status == 429 || page.Status == 403 {
		return nil, &loginError{429, fmt.Sprintf("Garmin 登录页拒绝了请求（HTTP %d，限流或人机验证），过几分钟再试", page.Status)}
	}

	// 登录页和提交之间停一下，太快会被当成机器人
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case <-time.After(time.Duration(2000+time.Now().UnixNano()%2000) * time.Millisecond):
	}

	loginQ := url.Values{"clientId": {iosSSOClientID}, "locale": {"en-US"}, "service": {svc}}
	body, _ := json.Marshal(map[string]any{
		"username": email, "password": password, "rememberMe": true, "captchaToken": "",
	})
	res, err := s.httpRaw(ctx, "POST", sso+"/mobile/api/login?"+loginQ.Encode(), map[string]string{
		"User-Agent":      iosLoginUA,
		"Accept":          "application/json, text/plain, */*",
		"Accept-Language": "en-US,en;q=0.9",
		"Content-Type":    "application/json",
		"Origin":          sso,
		"Referer":         signinURL,
	}, body)
	if err != nil {
		return nil, &loginError{502, "提交登录失败：" + err.Error()}
	}
	if res.Status == 429 {
		return nil, &loginError{429, "Garmin 限流了（HTTP 429），过几分钟再试"}
	}
	var lr struct {
		ServiceTicketID string `json:"serviceTicketId"`
		ResponseStatus  struct {
			Type string `json:"type"`
		} `json:"responseStatus"`
	}
	if err := json.Unmarshal(res.body, &lr); err != nil {
		return nil, &loginError{502, fmt.Sprintf("Garmin 登录返回了无法识别的内容（HTTP %d），可能被人机验证拦下，稍后再试", res.Status)}
	}
	switch lr.ResponseStatus.Type {
	case "SUCCESSFUL":
	case "INVALID_USERNAME_PASSWORD":
		return nil, &loginError{401, "邮箱或密码不对"}
	case "MFA_REQUIRED":
		return nil, &loginError{409, "这个 Garmin 账号开了两步验证，插件暂不支持；在 Garmin Connect 里关掉两步验证后再登录"}
	case "CAPTCHA_REQUIRED":
		return nil, &loginError{429, "Garmin 要求人机验证，过一会儿再试"}
	default:
		return nil, &loginError{502, fmt.Sprintf("Garmin 登录没有成功（HTTP %d，状态 %s）", res.Status, orDash(lr.ResponseStatus.Type))}
	}
	if lr.ServiceTicketID == "" {
		return nil, &loginError{502, "Garmin 登录成功但没有返回票据"}
	}

	tokenURL := "https://diauth." + c.domain() + "/di-oauth2-service/oauth/token"
	var lastStatus int
	for _, cid := range diClientIDs {
		form := url.Values{
			"client_id": {cid}, "service_ticket": {lr.ServiceTicketID},
			"grant_type": {diGrantType}, "service_url": {svc},
		}
		tr, err := s.httpRaw(ctx, "POST", tokenURL, nativeHeaders(map[string]string{
			"Authorization": basicAuth(cid),
			"Accept":        "application/json,text/html;q=0.9,*/*;q=0.8",
			"Content-Type":  "application/x-www-form-urlencoded",
			"Cache-Control": "no-cache",
		}), []byte(form.Encode()))
		if err != nil {
			return nil, &loginError{502, "换取访问令牌失败：" + err.Error()}
		}
		lastStatus = tr.Status
		if tr.Status == 429 {
			return nil, &loginError{429, "换取访问令牌时被 Garmin 限流，过几分钟再试"}
		}
		if tr.Status < 200 || tr.Status >= 300 {
			continue
		}
		var tok tokenResponse
		if json.Unmarshal(tr.body, &tok) != nil || tok.AccessToken == "" {
			continue
		}
		c.AccessToken = tok.AccessToken
		c.RefreshToken = tok.RefreshToken
		c.ClientID = jwtClientID(tok.AccessToken, cid)
		c.LoggedInAt = time.Now().Format(time.RFC3339)
		if c.RefreshToken == "" {
			return nil, &loginError{502, "Garmin 没有返回刷新令牌，无法定时同步"}
		}
		return c, nil
	}
	return nil, &loginError{502, fmt.Sprintf("登录成功但换取访问令牌失败（最后一次 HTTP %d）", lastStatus)}
}

func orDash(s string) string {
	if s == "" {
		return "-"
	}
	return s
}

// jwtClientID 从 access token 的 JWT 载荷里取 client_id（刷新时要用同一个）；取不到用登录时的。
func jwtClientID(token, fallback string) string {
	parts := strings.Split(token, ".")
	if len(parts) < 2 {
		return fallback
	}
	raw, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(parts[1], "="))
	if err != nil {
		return fallback
	}
	var payload struct {
		ClientID string `json:"client_id"`
	}
	if json.Unmarshal(raw, &payload) != nil || payload.ClientID == "" {
		return fallback
	}
	return payload.ClientID
}

// ---------------------------------------------------------------------------
// Garmin API
// ---------------------------------------------------------------------------

type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
}

func (s *server) refreshAccessToken(ctx context.Context, c *credentials) error {
	form := url.Values{
		"grant_type": {"refresh_token"}, "client_id": {c.ClientID}, "refresh_token": {c.RefreshToken},
	}
	body, err := s.httpOK(ctx, "POST", "https://diauth."+c.domain()+"/di-oauth2-service/oauth/token",
		nativeHeaders(map[string]string{
			"Authorization": basicAuth(c.ClientID),
			"Accept":        "application/json",
			"Content-Type":  "application/x-www-form-urlencoded",
			"Cache-Control": "no-cache",
		}), []byte(form.Encode()))
	if err != nil {
		var he *garminHTTPError
		if errors.As(err, &he) && (he.Status == 400 || he.Status == 401) {
			return errors.New("登录已失效，请在设置页重新登录 Garmin")
		}
		return err
	}
	var tr tokenResponse
	if err := json.Unmarshal(body, &tr); err != nil || tr.AccessToken == "" {
		return errors.New("刷新令牌的响应里没有 access_token")
	}
	c.AccessToken = tr.AccessToken
	if tr.RefreshToken != "" {
		c.RefreshToken = tr.RefreshToken
	}
	c.ClientID = jwtClientID(tr.AccessToken, c.ClientID)
	return s.saveCredentials(ctx, c)
}

// authed 取凭证并刷新一次访问令牌。
func (s *server) authed(ctx context.Context) (*credentials, error) {
	c, err := s.loadCredentials(ctx)
	if err != nil {
		return nil, err
	}
	if err := s.refreshAccessToken(ctx, c); err != nil {
		return nil, fmt.Errorf("刷新登录失败：%w", err)
	}
	return c, nil
}

func (s *server) connectAPI(ctx context.Context, c *credentials, path string) ([]byte, error) {
	return s.httpOK(ctx, "GET", "https://connectapi."+c.domain()+path, nativeHeaders(map[string]string{
		"Authorization": "Bearer " + c.AccessToken,
		"Accept":        "application/json",
	}), nil)
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
	body, err := s.connectAPI(ctx, c, "/activitylist-service/activities/search/activities?start=0&limit=20&activityType=running")
	if err != nil {
		return nil, err
	}
	var list []garminActivity
	if err := json.Unmarshal(body, &list); err != nil {
		return nil, fmt.Errorf("解析活动响应失败：%w", err)
	}
	return list, nil
}

// doSync 拉一次活动并落库，返回写入条数。
func (s *server) doSync(ctx context.Context) (int, error) {
	c, err := s.authed(ctx)
	if err != nil {
		return 0, err
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
// 跑步详情：概要（summaryDTO）、逐圈分段（splits 的 lapDTOs）、心率区间（hrTimeInZones）。
// 拉一次缓存进 run_details（0002），再打开直接读缓存；?refresh=1 重拉。
// 只留标量字段，丢掉 GPS 轨迹、逐秒曲线这类大数组。
// ---------------------------------------------------------------------------

type runDetail struct {
	ActivityID string           `json:"activity_id"`
	Name       string           `json:"name"`
	StartLocal string           `json:"start_local"`
	TypeKey    string           `json:"type_key"`
	Summary    map[string]any   `json:"summary"`
	Laps       []map[string]any `json:"laps"`
	HRZones    []map[string]any `json:"hr_zones"`
	FetchedAt  string           `json:"fetched_at"`
	Missing    []string         `json:"missing,omitempty"`
}

func scalars(m map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range m {
		switch v.(type) {
		case float64, string, bool:
			out[k] = v
		}
	}
	return out
}

func (s *server) fetchRunDetail(ctx context.Context, c *credentials, id string) (*runDetail, error) {
	base := "/activity-service/activity/" + id
	body, err := s.connectAPI(ctx, c, base)
	if err != nil {
		var he *garminHTTPError
		if errors.As(err, &he) && he.Status == 404 {
			return nil, &loginError{404, "Garmin 上找不到这次活动（可能已删除）"}
		}
		return nil, err
	}
	var act struct {
		ActivityName string         `json:"activityName"`
		SummaryDTO   map[string]any `json:"summaryDTO"`
		ActivityType struct {
			TypeKey string `json:"typeKey"`
		} `json:"activityTypeDTO"`
	}
	if err := json.Unmarshal(body, &act); err != nil {
		return nil, fmt.Errorf("解析活动详情失败：%w", err)
	}
	d := &runDetail{
		ActivityID: id, Name: act.ActivityName, TypeKey: act.ActivityType.TypeKey,
		Summary: scalars(act.SummaryDTO), FetchedAt: time.Now().Format(time.RFC3339),
		Laps: []map[string]any{}, HRZones: []map[string]any{},
	}
	if v, ok := act.SummaryDTO["startTimeLocal"].(string); ok {
		d.StartLocal = v
	}
	// 分段和心率区间拿不到不算失败（老设备、手动录入的活动没有），记进 missing
	if b, err := s.connectAPI(ctx, c, base+"/splits"); err == nil {
		var sp struct {
			Laps []map[string]any `json:"lapDTOs"`
		}
		if json.Unmarshal(b, &sp) == nil {
			for _, l := range sp.Laps {
				d.Laps = append(d.Laps, scalars(l))
			}
		}
	} else {
		d.Missing = append(d.Missing, "laps")
		s.log.Warn("拉分段失败", "id", id, "err", err)
	}
	if b, err := s.connectAPI(ctx, c, base+"/hrTimeInZones"); err == nil {
		var zones []map[string]any
		if json.Unmarshal(b, &zones) == nil {
			for _, z := range zones {
				d.HRZones = append(d.HRZones, scalars(z))
			}
		}
	} else {
		d.Missing = append(d.Missing, "hr_zones")
		s.log.Warn("拉心率区间失败", "id", id, "err", err)
	}
	return d, nil
}

func (s *server) cachedDetail(ctx context.Context, id string) *runDetail {
	callCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	var out struct {
		Rows []map[string]any `json:"rows"`
	}
	if err := s.conn.call(callCtx, "host.store.query", map[string]any{
		"sql": "SELECT detail_json FROM run_details WHERE activity_id = ?", "args": []any{id},
	}, &out); err != nil || len(out.Rows) == 0 {
		return nil
	}
	raw, _ := out.Rows[0]["detail_json"].(string)
	var d runDetail
	if json.Unmarshal([]byte(raw), &d) != nil {
		return nil
	}
	return &d
}

func (s *server) storeDetail(ctx context.Context, d *runDetail) {
	raw, err := json.Marshal(d)
	if err != nil {
		return
	}
	callCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	var out map[string]any
	if err := s.conn.call(callCtx, "host.store.exec", map[string]any{
		"sql": `INSERT INTO run_details(activity_id, detail_json, fetched_at) VALUES (?, ?, ?)
			ON CONFLICT(activity_id) DO UPDATE SET detail_json=excluded.detail_json, fetched_at=excluded.fetched_at`,
		"args": []any{d.ActivityID, string(raw), d.FetchedAt},
	}, &out); err != nil {
		s.log.Warn("缓存跑步详情失败", "id", d.ActivityID, "err", err)
	}
}

// ---------------------------------------------------------------------------
// HTTP API（前端 fetch 同源路径）
// ---------------------------------------------------------------------------

func (s *server) handleHTTPRequest(ctx context.Context, raw json.RawMessage) (any, error) {
	var p struct {
		RequestID string          `json:"request_id"`
		Method    string          `json:"method"`
		Path      string          `json:"path"`
		Query     json.RawMessage `json:"query"`
		BodyB64   string          `json:"body_b64"`
	}
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, rpcErrorf("invalid_params", "HTTP 请求参数不是合法 JSON：%v", err)
	}

	var status int
	var payload any
	body, _ := base64.StdEncoding.DecodeString(p.BodyB64)
	path := routePath(p.Path)
	query := parseQuery(p.Query)

	switch {
	case p.Method == "GET" && path == "/runs":
		status, payload = s.apiRuns(ctx)
	case p.Method == "GET" && strings.HasPrefix(path, "/runs/"):
		status, payload = s.apiRunDetail(ctx, strings.TrimPrefix(path, "/runs/"), query.Get("refresh") == "1")
	case p.Method == "GET" && path == "/status":
		status, payload = s.apiStatus(ctx)
	case p.Method == "POST" && path == "/login":
		status, payload = s.apiLogin(ctx, body)
	case p.Method == "POST" && path == "/logout":
		status, payload = s.apiLogout(ctx)
	case p.Method == "POST" && path == "/sync":
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

// routePath 把宿主给的 path 规整成 /runs 这种形式。规范里宿主给的是 /api/plugins/external/<id>/api 之后的部分；
// 2026-11-23 之前的宿主给的是 /plugins/external/<id>/api/...，两种都认，再去掉可能多出来的 /api 前缀。
func routePath(raw string) string {
	p := strings.TrimSuffix(strings.TrimSpace(raw), "/")
	marker := "/" + pluginID + "/api"
	if i := strings.Index(p, marker); i >= 0 {
		p = p[i+len(marker):]
	}
	if rest, ok := strings.CutPrefix(p, "/api"); ok && (rest == "" || rest[0] == '/') {
		p = rest
	}
	if p == "" || p[0] != '/' {
		p = "/" + p
	}
	return p
}

// parseQuery 认宿主给的原始查询串（"refresh=1"），也认对象形式（{"refresh":"1"}）。
func parseQuery(raw json.RawMessage) url.Values {
	var s string
	if json.Unmarshal(raw, &s) == nil {
		v, _ := url.ParseQuery(strings.TrimPrefix(s, "?"))
		return v
	}
	var m map[string]string
	out := url.Values{}
	if json.Unmarshal(raw, &m) == nil {
		for k, val := range m {
			out.Set(k, val)
		}
	}
	return out
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

func validActivityID(id string) bool {
	if id == "" || len(id) > 20 {
		return false
	}
	for _, r := range id {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func (s *server) apiRunDetail(ctx context.Context, id string, refresh bool) (int, any) {
	if !validActivityID(id) {
		return 400, map[string]any{"error": "活动 id 不合法"}
	}
	if !refresh {
		if d := s.cachedDetail(ctx, id); d != nil {
			return 200, map[string]any{"detail": d, "cached": true}
		}
	}
	c, err := s.authed(ctx)
	if err != nil {
		return 502, map[string]any{"error": err.Error()}
	}
	d, err := s.fetchRunDetail(ctx, c, id)
	if err != nil {
		var le *loginError
		if errors.As(err, &le) {
			return le.Status, map[string]any{"error": le.Msg}
		}
		return 502, map[string]any{"error": "拉取跑步详情失败：" + err.Error()}
	}
	s.storeDetail(ctx, d)
	return 200, map[string]any{"detail": d, "cached": false}
}

func (s *server) apiStatus(ctx context.Context) (int, any) {
	resp := map[string]any{"logged_in": false, "configured": false, "last_sync": ""}
	if raw, err := s.readSecret(ctx); err != nil {
		resp["error"] = "读取登录信息失败：" + err.Error()
	} else if raw != "" {
		var c credentials
		if json.Unmarshal([]byte(raw), &c) == nil && c.RefreshToken != "" {
			resp["logged_in"] = true
			resp["configured"] = true
			resp["email"] = c.Email
			resp["is_cn"] = c.IsCN
			resp["logged_in_at"] = c.LoggedInAt
		}
	}
	callCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	var st struct {
		Rows []map[string]any `json:"rows"`
	}
	if err := s.conn.call(callCtx, "host.store.query", map[string]any{
		"sql": "SELECT value FROM sync_state WHERE key='last_sync'",
	}, &st); err == nil && len(st.Rows) > 0 {
		resp["last_sync"], _ = st.Rows[0]["value"].(string)
	}
	return 200, resp
}

func (s *server) apiLogin(ctx context.Context, body []byte) (int, any) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		IsCN     *bool  `json:"is_cn"`
	}
	if err := json.Unmarshal(body, &in); err != nil {
		return 400, map[string]any{"error": "请求不是合法 JSON"}
	}
	email := strings.TrimSpace(in.Email)
	if email == "" || in.Password == "" {
		return 400, map[string]any{"error": "邮箱和密码都要填"}
	}
	isCN := true
	if in.IsCN != nil {
		isCN = *in.IsCN
	}
	c, err := s.login(ctx, email, in.Password, isCN)
	in.Password = ""
	if err != nil {
		var le *loginError
		if errors.As(err, &le) {
			return le.Status, map[string]any{"error": le.Msg}
		}
		return 502, map[string]any{"error": "登录失败：" + err.Error()}
	}
	if err := s.saveCredentials(ctx, c); err != nil {
		return 500, map[string]any{"error": "登录成功但保存失败：" + err.Error()}
	}
	s.log.Info("Garmin 登录成功", "cn", isCN)
	return 200, map[string]any{"ok": true, "email": c.Email, "is_cn": c.IsCN}
}

func (s *server) apiLogout(ctx context.Context) (int, any) {
	if err := s.clearCredentials(ctx); err != nil {
		return 500, map[string]any{"error": "退出登录失败：" + err.Error()}
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
