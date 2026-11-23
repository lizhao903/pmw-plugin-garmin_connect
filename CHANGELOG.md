# 变更记录

本文件格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.2.0]

### Added

- 设置页用 Garmin Connect 邮箱和密码登录（移动端 SSO 流程 + DI OAuth2 换令牌），登录后自动同步一次；可退出登录。
- 跑步详情：概要、逐圈分段、心率区间；首次打开从 Garmin 拉取并缓存到 `run_details`（迁移 `0002_run_details.sql`），可手动重新拉取。
- 列表多一列活动名称，行可点开详情。

### Changed

- 去掉粘贴 `refresh_token` / `client_id` 的配置方式和对应的 `/api/credentials` 接口。
- 请求 Garmin 时带上 App 的原生请求头；刷新令牌失效时提示重新登录。

### Fixed

- 0.1.0 依赖的 `host.secrets.*` 宿主此前没实现，token 实际保存不了；需配合 PMW 2026-11-23 起的宿主。

## [0.1.0]

### Added

- 首个版本，对应 tag `v0.1.0`。
- 后端：pmw-plugin-rpc/1 协议、Gar DI token 刷新与活动拉取、私有库落库、定时同步、HTTP API。
- 前端：模块页（跑步列表与累计距离）、今日卡片（最近一次跑步）、设置分节（token 配置）。
- 迁移：`runs` 与 `sync_state` 表。
