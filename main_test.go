// powered by dsh - https://github.com/deepseek-ai/deepseek-harness

package main

import (
	"encoding/json"
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
