# Garmin 跑步数据（PMW 外部插件）

PMW（一人之下）外部插件，遵循 **PMW Plugin 2.0**（清单 `manifest_version: 2`，宿主插件 API `2.0.0`）。

- 插件 id：`garmin_connect`
- 版本：`0.1.0`
- 作者：lizhao903
- 许可证：MIT

> 状态：本插件已完成本地校验与三平台打包。需要宿主支持外部插件（插件 API 2.0.0）；宿主若是开发构建（版本号为 `dev`），需包含「非正式版本号不按 `pmw` 范围拦」的兼容修复，否则解析预览会报「pmw 不包含当前 PMW 版本 dev」。安装：「设置 → 插件 → 外部插件」选本地目录、tar.gz 或 GitHub 仓库地址；`network:any` 安装时不授予，装好后在插件设置里单独申请。

## 能做什么

- 模块页「Garmin 跑步数据」：表格展示最近 50 条跑步活动（日期、距离、时长、配速、均心率），显示累计距离，提供「立即同步」；
- 今日卡片「最近跑步」：展示最近一次跑步的距离、配速、时间与时长；
- 设置分节：填写 Garmin 的 `refresh_token`（可选 `client_id`、中国区开关），保存到宿主密钥保险箱；
- 后端每 6 小时自动同步一次，也可在模块页手动触发；数据落在插件私有 SQLite，按 `activity_id` 去重。

## 数据来源与凭证

插件直连 Garmin Connect API，不依赖任何外部脚本，但首次使用需要一次性提供凭证：

1. 用 Garmin 官方 App 或已有登录工具完成一次登录，拿到 DI OAuth 的 `refresh_token`（长期有效）；
2. 在插件设置里粘贴 `refresh_token`，按需填 `client_id`（默认 `GARMIN_CONNECT_MOBILE_ANDROID_DI_2025Q2`），勾选「中国区账号」；
3. 保存后点「立即同步」。插件用 refresh token 换取访问令牌并刷新回写，凭证只存 `secrets:garmin_connect` scope，不进日志、不进前端。

插件沙箱内无法完成 Garmin SSO 的浏览器交互与 MFA，因此凭证获取放在插件外完成一次；之后同步完全由插件自身承担。

## 权限说明

| 权限 | 理由 |
|---|---|
| `network:any` | Garmin 中国区 SSO/API 域名（connect.garmin.cn 等）不在宿主预置网络分组内。高风险权限，安装时不自动授予，需装后单独申请并二次确认 |
| `secrets:garmin_connect` | 保存 Garmin 登录凭证与令牌，仅本插件可读写 |
| `schedule` | 注册定时同步（后端当前用进程内 ticker，权限为后续接入宿主调度器预留） |

## 目录结构

```text
pmw-plugin-garmin_connect/
  plugin.json              清单 v2
  main.go                  后端：RPC 协议 + Garmin 同步 + 私有库 + HTTP API
  migrations/0001_init.sql 私有库表结构（runs / sync_state）
  web/entry.ts             前端入口（ESM，零构建 JS 子集）
  web/entry.js             由 make web 生成
  web/style.css            作用域样式
  bin/                     三平台后端二进制（make build-all）
  scripts/pmw_plugin.py    SDK 自带的校验/打包工具副本
```

## 本地开发

```bash
make build-all          # 构建 darwin-arm64 / linux-amd64 / windows-amd64
make web                # 由 entry.ts 生成 entry.js
make lint               # gofmt + go vet + validate
python3 scripts/pmw_plugin.py validate . --strict
make pack               # 打当前平台发布包到 dist/，含 SHA256SUMS
```

## 发布

1. 更新 `plugin.json` 的 `version` 与 `CHANGELOG.md`；
2. 提交并以 `v<version>` 打 tag；
3. GitHub Actions 按矩阵构建打包、汇总 `SHA256SUMS`、创建 Release；
4. 把仓库地址与 Release 信息提交到 PMW 社区索引（见 `pmw-plugins-index` 的 `CONTRIBUTING.md`）。

## 许可证

MIT，见 [LICENSE](LICENSE)。

由 DeepSeek Harness（dsh）协助完成。

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
