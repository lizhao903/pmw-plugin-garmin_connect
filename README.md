# Garmin 跑步数据（PMW 外部插件）

PMW（一人之下）外部插件，遵循 **PMW Plugin 2.0**（清单 `manifest_version: 2`，宿主插件 API `2.0.0`）。

- 插件 id：`garmin_connect`
- 版本：`0.10.0`
- 作者：lizhao903
- 许可证：MIT

> 状态：本插件已完成本地校验与三平台打包。需要宿主支持外部插件（插件 API 2.0.0）；宿主若是开发构建（版本号为 `dev`），需包含「非正式版本号不按 `pmw` 范围拦」的兼容修复，否则解析预览会报「pmw 不包含当前 PMW 版本 dev」。安装：「设置 → 插件 → 外部插件」选本地目录、tar.gz 或 GitHub 仓库地址；`network:any` 安装时不授予，装好后在插件设置里单独申请。

## 能做什么

- 记录：最近 200 次跑步（日期、名称、室内 / 室外、距离、时长、配速、均心率），「立即同步」拉最近的，「同步全部历史」在后台拉全部；
- 统计：按周 / 月 / 年，分跑步汇总、室外、室内，柱状图（距离、时长、次数、平均配速）加明细表；
- 统计口径：概览可选本周 / 本月 / 近 7 日 / 近 30 日 / 近半年 / 近 1 年，跑步次数与力量次数分开算；设置里可开启「忽略短活动」（默认跑步 < 1 km、力量 < 10 min 不计入统计，阈值可改，记录列表不受影响）；
- 跑步详情（点一行打开）：
  - 概要：用时、配速、心率、步频、步幅、触地时间、垂直振幅、功率、爬升下降、训练效果与负荷、热量等；
  - 路线地图（中国区高德、国际区 OpenStreetMap）、天气；轨迹上按里程标出各段配速，点标签跳到对应分段并高亮；
  - 图表：指标多选，分开或叠加看，横轴按距离或时间，悬停同步读数；自动去除异常值（配速可设范围），标出暂停和中途停下；
  - 分段：按 Garmin 原始类型归为热身、训练、恢复、休息、舒缓，带小计；
  - 跑步机校正：按跑步机显示的 km/h 逐段校正距离和配速；
  - 心率区间（设置里可按最大心率或 5 个 bpm 下界校准，图表与 AI 同口径），按主题分组的详细数据（时间、配速、心率、跑步动态、功率、海拔、训练效果、身体消耗、主观感受等）；
  - 编辑：名称、活动类型、活动类别、描述、收藏，保存后同步到 Garmin Connect；
- 配速单位：设置里选 min/km 或 min/mile，列表、详情、图表、分段、地图标签和 AI 分析统一换算；
- 波动区间：每个指标 80% 时间所在范围，自动分段并识别跑崩；
- 体能（主页面的「体能」视图）：跨天看训练负荷、训练效果、身体电量差、恢复 / 静息心率、体能储备与跑量趋势，标出高强度日；顶部恢复状态回答「今天能不能上强度」并给出建议，本周跑量对比近 4 周周均；训练指标从单次详情落库，老数据可一键后台补全最近 4 周；
- AI 分析：默认用内置教练指令 + 默认模型，无需先建 Agent；可设目标比赛/目标成绩，分析会引用 PB 与目标配速给训练建议（需要宿主支持 host.agent.run）；
- 力量训练：收录力量训练活动，详情看训练组，统计单列；
- 比赛（主页面的「比赛」视图，和记录、统计、日历并列）：Garmin 标成比赛的活动会自动收录（手表计时作净计时），也可一键导入全部历史比赛；收录净计时 / 枪声成绩、排名，关联活动，记录成绩证书、奖牌、照片、视频、号码布、参赛服、参赛包、完赛包；
- 训练计划与日历：预置跑步、力量训练计划，也可自己新建 / 编辑计划、标注来源（如 UP 主及主页链接），一键排进日历，日历上逐日安排、对照实际完成情况；
- 推荐视频：收录训练视频链接和 UP 主，关联到计划和每节课，日历上直接打开；
- 今日卡片显示恢复状态、今天该练什么、本周跑量进度与今天的训练（底部一行最近跑步参考）；登录在设置页（dsh 为「账号与同步」）完成；首次登录拉全部历史，后端每 6 小时增量同步。

> **也能装进 DeepSeek Harness**：`dsh/` 目录是同一插件的 dsh 客户端版本（左侧栏页面 + 对话里可用的只读跑步数据工具），安装与说明见 [dsh/README.md](dsh/README.md)。

## 登录与凭证

1. 安装后先在「设置 → 插件 → 外部插件」给本插件授予 `network:any`（访问 sso / diauth / connectapi / personal.connectapi 的 garmin.cn 或 garmin.com 域名）；dsh 版已内置出网与凭据存储，无需手动授予；
2. 在设置页（dsh 为「账号与同步」）选登录方式：
   - **账号密码**：填 Garmin Connect 邮箱和密码，按手机 App 的 SSO 流程换 DI OAuth2 令牌，可读写活动；
   - **个人 API Key（支持 MFA）**：在 Garmin Connect 网页的 Personal API Key 页面生成 Key（只显示一次），粘贴登录。走 Garmin 官方 Personal API，24 小时 access token 由插件自动换取；权限只读，不能把活动编辑保存回 Garmin。
3. 首次登录自动全量同步；之后每 6 小时增量同步。只补近期新活动用「立即同步（增量）」，补全部历史用「同步全部历史（全量）」，按钮只在设置页 / 「账号与同步」里，模块页顶部常驻同步状态与失败提示。

- 密码和 API Key 只用来换令牌，不保存、不写日志；令牌存在宿主凭证保险箱（`host.secrets`，scope `garmin_connect`），用户可在设置里退出登录删除。
- DI 刷新令牌失效（长时间没用或改过密码）时同步会提示「登录已失效」，重新登录即可；个人 API Key 过期时提示在 Garmin 网页重新生成。
- 宿主需要实现 `host.secrets.*`（PMW 2026-11-23 起）；旧宿主上登录会报「宿主未实现方法 host.secrets.set」。

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
