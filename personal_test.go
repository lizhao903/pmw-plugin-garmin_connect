// powered by dsh - https://github.com/deepseek-ai/deepseek-harness

package main

import (
	"encoding/base64"
	"encoding/json"
	"testing"
)

func TestJwtExp(t *testing.T) {
	payload, _ := json.Marshal(map[string]any{"exp": 1893456000})
	token := "eyJhbGciOiJub25lIn0." + base64.RawURLEncoding.EncodeToString(payload) + ".sig"
	if got := jwtExp(token); got != 1893456000 {
		t.Fatalf("jwtExp = %d，应为 1893456000", got)
	}
	if got := jwtExp("not-a-jwt"); got != 0 {
		t.Fatalf("无效 token 应返回 0，实际 %d", got)
	}
}

func TestPersonalCredentials(t *testing.T) {
	p := &credentials{PersonalKey: "key", AuthMode: "personal", IsCN: true}
	if !p.isPersonal() || p.apiBase() != "https://personal.connectapi.garmin.cn" {
		t.Fatalf("中国区个人 API 凭证解析错误：personal=%v base=%s", p.isPersonal(), p.apiBase())
	}
	p.IsCN = false
	if p.apiBase() != "https://personal.connectapi.garmin.com" {
		t.Fatalf("国际区个人 API 地址错误：%s", p.apiBase())
	}
	di := &credentials{RefreshToken: "r", ClientID: "c", IsCN: true}
	if di.isPersonal() || di.apiBase() != "https://connectapi.garmin.cn" {
		t.Fatalf("账号密码模式不应走个人 API：personal=%v base=%s", di.isPersonal(), di.apiBase())
	}
}
