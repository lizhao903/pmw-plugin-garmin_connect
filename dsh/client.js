// powered by dsh - https://github.com/deepseek-ai/deepseek-harness

/**
 * Garmin 跑步数据 · dsh 插件的浏览器半侧（本文件由 dsh/scripts/build.mjs 从 src/client.template.js + ../web/entry.js 生成，不要直接改）。
 *
 * 复用 PMW 插件前端 web/entry.js：构建时把它嵌进本工厂，并替换三处宿主相关的东西：
 *   - API_BASE 改成 "dsh-gc:"，模块内的 fetch 换成 gcFetch：走 ctx.connection.rpc.call
 *     （POST /api/garmin-connect/call），Host 半侧再转给 Go 后端，桌面壳和 Web GUI 都能用；
 *   - <img>/<video>/<a> 里 "dsh-gc:" 开头的地址（地图瓦片、比赛影像）由 MutationObserver
 *     换成 RPC 取回的 blob URL；
 *   - window.__PMW_PLUGIN__.register 换成本地登记表：把 PMW 的 module / settings.section
 *     槽位组件挂到 dsh 左侧栏（sidebar.panellist）和主面板（main）。
 * 样式沿用 web/style.css（作用域 [data-pmw-plugin="garmin_connect"]），--pmw-* token 映射到 dsh 的 --dsw-*。
 */
window.__ModuleLoader__.load({
  id: '@lizhao903/dsh-garmin-connect',
  factory: (require) => {
    const React = require('react')
    const __gcH = React.createElement

    const __GC_RPC_ENDPOINT = 'garmin-connect/call'
    const __GC_BASE = 'dsh-gc:'
    const __GC_STYLE = "/*\n * PMW 外部插件的样式只允许写在 [data-pmw-plugin=\"<id>\"] 作用域下。\n * 宿主会渲染 <div data-pmw-plugin=\"<id>\"> 包住插件组件；不要改宿主全局样式、\n * 不要给 body/html 设样式、不要用 !important 覆盖别人。\n *\n * 颜色优先用宿主暴露的 --pmw-* token，取不到时给中性兜底，别硬编码品牌色。\n */\n\n[data-pmw-plugin=\"garmin_connect\"] {\n  color: var(--pmw-text, inherits);\n  font-size: var(--pmw-font-size, 14px);\n}\n\n[data-pmw-plugin=\"garmin_connect\"] .pmw-plugin {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}\n\n[data-pmw-plugin=\"garmin_connect\"] .pmw-plugin-header h2 {\n  margin: 0;\n  font-size: 18px;\n}\n\n[data-pmw-plugin=\"garmin_connect\"] .pmw-plugin-hint {\n  margin: 0;\n  color: var(--pmw-text-secondary, #6b7280);\n  font-size: 12px;\n}\n\n[data-pmw-plugin=\"garmin_connect\"] .pmw-plugin-list {\n  margin: 0;\n  padding-left: 18px;\n}\n\n[data-pmw-plugin=\"garmin_connect\"] .pmw-plugin-card {\n  padding: 12px;\n  border: 1px solid var(--pmw-border, #e5e7eb);\n  border-radius: var(--pmw-radius, 8px);\n  background: var(--pmw-panel, #ffffff);\n}\n\n[data-pmw-plugin=\"garmin_connect\"] .pmw-plugin-card h4 {\n  margin: 0 0 6px;\n}\n\n[data-pmw-plugin=\"garmin_connect\"] .pmw-plugin-button {\n  align-self: flex-start;\n  padding: 6px 12px;\n  border: 1px solid var(--pmw-border, #d1d5db);\n  border-radius: var(--pmw-radius, 6px);\n  background: var(--pmw-panel, #f9fafb);\n  color: inherit;\n  cursor: pointer;\n}\n\n[data-pmw-plugin=\"garmin_connect\"] .pmw-plugin-button:hover {\n  background: var(--pmw-panel-hover, #f3f4f6);\n}\n\n[data-pmw-plugin=\"garmin_connect\"] .pmw-plugin-error {\n  padding: 10px;\n  border: 1px solid var(--pmw-danger, #ef4444);\n  border-radius: var(--pmw-radius, 6px);\n  color: var(--pmw-danger, #b91c1c);\n}\n\n[data-pmw-plugin=\"garmin_connect\"] .pmw-plugin-check {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n}\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-table {\n  width: 100%;\n  border-collapse: collapse;\n  font-size: var(--pmw-font-size, 14px);\n}\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-table th,\n[data-pmw-plugin=\"garmin_connect\"] .gc-table td {\n  padding: 6px 8px;\n  text-align: left;\n  border-bottom: 1px solid var(--pmw-border, #e5e7eb);\n}\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-table th {\n  color: var(--pmw-text-secondary, #6b7280);\n  font-weight: 600;\n}\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-field {\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n  font-size: 12px;\n  color: var(--pmw-text-secondary, #6b7280);\n}\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-field input {\n  padding: 6px 8px;\n  border: 1px solid var(--pmw-border, #d1d5db);\n  border-radius: var(--pmw-radius, 6px);\n  background: var(--pmw-panel, #ffffff);\n  color: inherit;\n}\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-card-main {\n  margin: 0;\n  font-size: 16px;\n  font-weight: 600;\n}\n\n/* 0.2.0：列表可点、跑步详情、登录表单 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-row { cursor: pointer; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-row:hover,\n[data-pmw-plugin=\"garmin_connect\"] .gc-row:focus-visible { background: var(--pmw-panel-hover, #f3f4f6); outline: none; }\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-detail-bar { display: flex; gap: 8px; flex-wrap: wrap; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-sub { margin: 8px 0 6px; font-size: 15px; }\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-stats {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));\n  gap: 8px;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-stat {\n  display: flex; flex-direction: column; gap: 4px;\n  padding: 8px 10px;\n  border: 1px solid var(--pmw-border, #e5e7eb);\n  border-radius: var(--pmw-radius, 8px);\n  background: var(--pmw-panel, #ffffff);\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-stat-label { font-size: 12px; color: var(--pmw-text-secondary, #6b7280); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-stat-value { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; }\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-zones { display: flex; flex-direction: column; gap: 8px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-zone { display: grid; grid-template-columns: 110px 1fr 120px; align-items: center; gap: 8px; font-size: 13px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-zone-bar { height: 10px; border-radius: 5px; background: var(--pmw-border, #e5e7eb); overflow: hidden; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-zone-fill { display: block; height: 100%; background: var(--pmw-accent, #6b7280); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-z1 { opacity: 0.35; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-z2 { opacity: 0.5; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-z3 { opacity: 0.65; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-z4 { opacity: 0.8; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-z5 { opacity: 1; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-zone-time { font-variant-numeric: tabular-nums; color: var(--pmw-text-secondary, #6b7280); }\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-login,\n[data-pmw-plugin=\"garmin_connect\"] .gc-account { display: flex; flex-direction: column; gap: 12px; max-width: 420px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-account p { margin: 0; }\n/* 登录表单：字段之间统一 12px，复选框自成一行，不和提交按钮挤在一起 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-login-form { display: flex; flex-direction: column; gap: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-login-form .pmw-plugin-check { align-self: flex-start; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-login-form .pmw-plugin-button { align-self: flex-start; }\n\n/* 统计口径设置：忽略短活动 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-stats-prefs { display: flex; flex-direction: column; gap: 8px; padding: 12px 0; border-top: 1px solid var(--pmw-border, #e5e7eb); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-stats-prefs h4 { margin: 0; font-size: 14px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-stats-prefs-thresholds .gc-field { flex: 0 1 160px; }\n\n@media (max-width: 560px) {\n  [data-pmw-plugin=\"garmin_connect\"] .gc-zone { grid-template-columns: 80px 1fr; }\n  [data-pmw-plugin=\"garmin_connect\"] .gc-zone-time { grid-column: 1 / -1; }\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-scroll { overflow-x: auto; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-scroll .gc-table th,\n[data-pmw-plugin=\"garmin_connect\"] .gc-scroll .gc-table td { white-space: nowrap; }\n\n/* 0.3.0：标题行兜底、分段按钮、统计图、曲线、地图、分段归类、跑步机校正 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-header { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-header > div:first-child { flex: 1 1 auto; }\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-controls { display: flex; flex-wrap: wrap; gap: 8px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-tag {\n  display: inline-block; padding: 0 6px; border-radius: 4px; font-size: 12px; line-height: 18px;\n  background: var(--pmw-panel-hover, #eef0f3); color: var(--pmw-text-secondary, #4b5563);\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-mark { font-size: 11px; color: var(--pmw-text-secondary, #6b7280); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-note {\n  margin: 0; padding: 6px 10px; border-left: 3px solid var(--pmw-border, #d1d5db);\n  background: var(--pmw-panel, #f9fafb); font-size: 13px;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-section-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-speed { width: 78px; padding: 3px 6px; border: 1px solid var(--pmw-border, #d1d5db); border-radius: 4px; font: inherit; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-subtotal td { font-weight: 600; background: var(--pmw-panel, #f9fafb); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-corrected td:nth-child(3),\n[data-pmw-plugin=\"garmin_connect\"] .gc-corrected td:nth-child(5) { font-weight: 600; }\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-chart { margin: 0; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-chart svg { width: 100%; height: auto; display: block; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-grid { stroke: var(--pmw-border, #e5e7eb); stroke-width: 1; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-axis { fill: var(--pmw-text-secondary, #6b7280); font-size: 11px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-bar { fill: var(--pmw-accent, #4b5563); opacity: 0.8; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-bar:hover { opacity: 1; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-charts { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-line {\n  padding: 8px 10px; border: 1px solid var(--pmw-border, #e5e7eb); border-radius: var(--pmw-radius, 8px); background: var(--pmw-panel, #fff);\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-line figcaption { font-size: 12px; color: var(--pmw-text-secondary, #6b7280); margin-bottom: 4px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-line figcaption strong { color: var(--pmw-text, inherit); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-linepath { stroke: var(--pmw-accent, #4b5563); stroke-width: 1.5; stroke-linejoin: round; }\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-map {\n  position: relative; overflow: hidden; border: 1px solid var(--pmw-border, #e5e7eb);\n  border-radius: var(--pmw-radius, 8px); background: #e9ecef;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-tile { position: absolute; width: 256px; height: 256px; max-width: none; user-select: none; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-map-svg { position: absolute; left: 0; top: 0; pointer-events: none; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-route { stroke: #d9480f; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-route-halo { stroke: #fff; stroke-width: 6; stroke-linejoin: round; stroke-linecap: round; opacity: 0.8; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-pin-start { fill: #2b8a3e; stroke: #fff; stroke-width: 2; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-pin-end { fill: #c92a2a; stroke: #fff; stroke-width: 2; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-map-split { pointer-events: auto; cursor: pointer; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-map-split circle { fill: #fff; stroke: #d9480f; stroke-width: 2; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-map-split text {\n  font-size: 10px; font-weight: 600; fill: #111; stroke: #fff; stroke-width: 3px; paint-order: stroke fill;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-map-split.key circle { fill: #d9480f; stroke: #fff; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-map-split.on circle { fill: #ffd43b; stroke: #d9480f; stroke-width: 3; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-map-split.on text { fill: #d9480f; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-table tr.gc-lap-active { background: rgba(217, 72, 15, 0.12); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-map-zoom { position: absolute; right: 8px; top: 8px; display: flex; flex-direction: column; gap: 4px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-map-zoom button {\n  width: 28px; height: 28px; border: 1px solid var(--pmw-border, #d1d5db); border-radius: 4px;\n  background: #fff; color: #111; font-size: 16px; line-height: 1; cursor: pointer;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-map-attr {\n  position: absolute; right: 4px; bottom: 2px; padding: 0 4px; font-size: 10px; color: #333; background: rgba(255, 255, 255, 0.7);\n}\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-all summary { cursor: pointer; font-weight: 600; padding: 6px 0; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-kv th { text-align: left; font-weight: 400; color: var(--pmw-text-secondary, #6b7280); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-kv code { font-size: 11px; }\n\n/* 0.4.0：详细数据分组、编辑表单、描述 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-group {\n  padding: 12px; border: 1px solid var(--pmw-border, #e5e7eb); border-radius: var(--pmw-radius, 8px); background: var(--pmw-panel, #fff);\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-group-title { margin: 0 0 6px; font-size: 13px; color: var(--pmw-text-secondary, #6b7280); font-weight: 600; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-dl { margin: 0; display: flex; flex-direction: column; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-dl-row {\n  display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; border-bottom: 1px dashed var(--pmw-border, #eceef1); font-size: 13px;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-dl-row:last-child { border-bottom: 0; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-dl dt { color: var(--pmw-text-secondary, #6b7280); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-dl dd { margin: 0; text-align: right; font-weight: 500; font-variant-numeric: tabular-nums; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-dl-others { columns: 2 280px; display: block; margin-top: 6px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-dl-others .gc-dl-row { break-inside: avoid; }\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-edit {\n  display: flex; flex-direction: column; gap: 12px; max-width: 640px; padding: 12px;\n  border: 1px solid var(--pmw-border, #e5e7eb); border-radius: var(--pmw-radius, 8px); background: var(--pmw-panel, #fff);\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-edit-row { display: flex; flex-wrap: wrap; gap: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-edit-row .gc-field { flex: 1 1 200px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-field select,\n[data-pmw-plugin=\"garmin_connect\"] .gc-field textarea {\n  padding: 6px 8px; border: 1px solid var(--pmw-border, #d1d5db); border-radius: var(--pmw-radius, 6px);\n  background: var(--pmw-panel, #fff); color: inherit; font: inherit;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-field textarea { resize: vertical; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-primary { font-weight: 600; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-desc { margin: 0; white-space: pre-wrap; font-size: 14px; line-height: 1.6; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-note-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }\n\n/* 0.5.0：列表、详情 tab、图表（指标切换、叠加、读数、暂停与停下）、分段柱 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-list { display: flex; flex-direction: column; gap: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-stats-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-search {\n  padding: 4px 8px; min-width: 160px; border: 1px solid var(--pmw-border, #d1d5db); border-radius: var(--pmw-radius, 6px);\n  background: var(--pmw-panel, #fff); color: inherit; font: inherit; font-size: 13px;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-controls { align-items: center; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-table .num { text-align: right; font-variant-numeric: tabular-nums; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-runs td { vertical-align: middle; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-runs .gc-date small { color: var(--pmw-text-secondary, #6b7280); font-size: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-runs .gc-name { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-month td {\n  padding-top: 14px; border-bottom: 1px solid var(--pmw-border, #e5e7eb); background: transparent; cursor: default;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-month strong { margin-right: 10px; font-size: 13px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-month span { font-size: 12px; color: var(--pmw-text-secondary, #6b7280); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-tag-in { background: #e0e7ff; color: #3730a3; }\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--pmw-border, #e5e7eb); overflow-x: auto; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-tab {\n  padding: 8px 14px; border: 0; border-bottom: 2px solid transparent; margin-bottom: -1px;\n  background: transparent; color: var(--pmw-text-secondary, #6b7280); font: inherit; font-size: 14px; cursor: pointer; white-space: nowrap;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-tab.on { color: var(--pmw-text, #111); border-bottom-color: var(--pmw-accent, #2563eb); font-weight: 600; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-tab-body { display: flex; flex-direction: column; gap: 16px; padding-top: 4px; }\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-chips { display: flex; flex-wrap: wrap; gap: 8px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-chip {\n  display: inline-flex; align-items: center; gap: 8px; padding: 3px 10px; border: 1px solid var(--pmw-border, #d1d5db);\n  border-radius: 999px; background: var(--pmw-panel, #fff); color: var(--pmw-text-secondary, #6b7280); font: inherit; font-size: 13px; cursor: pointer;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-chip.on { font-weight: 600; background: var(--pmw-panel, #fff); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-chip:not(.on) .gc-dot { opacity: 0.35; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-inline { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-readout {\n  display: flex; flex-wrap: wrap; gap: 8px 16px; min-height: 30px; align-items: center; padding: 4px 10px;\n  border-radius: var(--pmw-radius, 6px); background: var(--pmw-panel, #f9fafb); font-size: 13px; font-variant-numeric: tabular-nums;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-chart-box {\n  margin: 0; padding: 12px 12px 8px; border: 1px solid var(--pmw-border, #e5e7eb); border-radius: var(--pmw-radius, 8px); background: var(--pmw-panel, #fff);\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-chart-title { font-size: 13px; font-weight: 600; margin-bottom: 2px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-chart-title small { font-weight: 400; color: var(--pmw-text-secondary, #6b7280); margin-left: 4px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-chart-svg { width: 100%; height: auto; display: block; cursor: crosshair; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-cross { stroke: var(--pmw-text-secondary, #6b7280); stroke-width: 1; stroke-dasharray: 3 3; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-pause { fill: #f59e0b; opacity: 0.22; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-stop { fill: #94a3b8; opacity: 0.28; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-legend { display: flex; flex-wrap: wrap; gap: 4px 16px; align-items: center; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-swatch { display: inline-block; width: 12px; height: 10px; margin-right: 4px; vertical-align: middle; border-radius: 2px; }\n[data-pmw-plugin=\"garmin_connect\"] i.gc-swatch.gc-pause { opacity: 0.6; background: #f59e0b; }\n[data-pmw-plugin=\"garmin_connect\"] i.gc-swatch.gc-stop { opacity: 0.7; background: #94a3b8; }\n[data-pmw-plugin=\"garmin_connect\"] i.gc-swatch.gc-raw { height: 2px; border-radius: 0; opacity: 0.55; background: var(--gc-axis, #94a3b8); }\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-lapbar { fill: #64748b; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-int-warm { fill: #f59e0b; background: #f59e0b; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-int-work { fill: #2563eb; background: #2563eb; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-int-rec { fill: #10b981; background: #10b981; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-int-rest { fill: #94a3b8; background: #94a3b8; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-int-cool { fill: #8b5cf6; background: #8b5cf6; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-int-none { fill: #64748b; background: #64748b; }\n\n@media (max-width: 640px) {\n  [data-pmw-plugin=\"garmin_connect\"] .gc-stats-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }\n  [data-pmw-plugin=\"garmin_connect\"] .gc-stats-3 .gc-stat-value { font-size: 14px; }\n  [data-pmw-plugin=\"garmin_connect\"] .gc-search { min-width: 0; flex: 1 1 120px; }\n}\n\n/* 窄屏卡片列表 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-cards { display: flex; flex-direction: column; gap: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-month-head { display: flex; align-items: baseline; gap: 8px; padding: 4px 2px; font-size: 13px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-month-head span { color: var(--pmw-text-secondary, #6b7280); font-size: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-card-row {\n  display: flex; width: 100%; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 2px;\n  border: 0; border-bottom: 1px solid var(--pmw-border, #eceef1); background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-card-l, [data-pmw-plugin=\"garmin_connect\"] .gc-card-r { display: flex; flex-direction: column; gap: 4px; min-width: 0; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-card-r { align-items: flex-end; flex: none; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-card-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-card-row small { color: var(--pmw-text-secondary, #6b7280); font-size: 12px; font-variant-numeric: tabular-nums; }\n\n/* 0.5.1：平均线、分段悬停与最快最慢、配速分秒输入 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-avgline { stroke: var(--pmw-text, #111); stroke-width: 1; stroke-dasharray: 5 4; opacity: 0.6; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-avgtext { font-weight: 600; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-lapbar.dim { opacity: 0.45; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-lapbar.on { stroke: var(--pmw-text, #111); stroke-width: 1.5; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-lap-tag { font-weight: 600; fill: var(--pmw-text, #111); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-lap-summary { display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 13px; padding: 4px 2px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-lap-summary em {\n  font-style: normal; font-size: 12px; margin-right: 6px; padding: 0 6px; border-radius: 4px;\n  background: var(--pmw-panel-hover, #eef0f3); color: var(--pmw-text-secondary, #4b5563);\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-overlay-avg { display: flex; flex-wrap: wrap; gap: 4px 16px; align-items: center; font-weight: 500; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-pace-input { display: inline-flex; align-items: center; gap: 4px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-pace-input input {\n  width: 46px; padding: 3px 4px; border: 1px solid var(--pmw-border, #d1d5db); border-radius: 4px; font: inherit; text-align: center;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-pace-input small { color: var(--pmw-text-secondary, #6b7280); font-size: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-link { border: 0; background: none; color: var(--pmw-accent, #2563eb); font: inherit; font-size: 13px; cursor: pointer; padding: 0 4px; }\n\n/* 0.6.0：波动区间说明、AI 分析、力量训练组、训练计划、训练日历 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-band-note { margin: 2px 0 4px; font-size: 12px; color: var(--pmw-text-secondary, #4b5563); line-height: 1.6; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-band-note.gc-collapse { color: #b45309; }\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-analysis { display: flex; flex-direction: column; gap: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-analysis-body { padding: 16px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-md { font-size: 14px; line-height: 1.75; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-md p { margin: 4px 0; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-md ul, [data-pmw-plugin=\"garmin_connect\"] .gc-md ol { margin: 4px 0 8px; padding-left: 22px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-md-h { margin: 14px 0 4px; font-size: 15px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-md h4.gc-md-h { font-size: 14px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-md .gc-md-h:first-child { margin-top: 0; }\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-sub-name { color: var(--pmw-text-secondary, #6b7280); font-size: 12px; }\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-k-run { background: #2563eb; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-k-strength { background: #ea580c; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-k-rest { background: #94a3b8; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-k-other { background: #7c3aed; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-plan-kind { display: inline-block; padding: 0 6px; border-radius: 4px; color: #fff; font-size: 12px; line-height: 18px; align-self: flex-start; }\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-plans { display: flex; flex-direction: column; gap: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-plan-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-plan-card {\n  display: flex; flex-direction: column; gap: 4px; padding: 12px; text-align: left; cursor: pointer;\n  border: 1px solid var(--pmw-border, #e5e7eb); border-radius: var(--pmw-radius, 8px); background: var(--pmw-panel, #fff); color: inherit; font: inherit;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-plan-card.on { border-color: var(--pmw-accent, #2563eb); box-shadow: 0 0 0 1px var(--pmw-accent, #2563eb); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-plan-card small { color: var(--pmw-text-secondary, #6b7280); font-size: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-plan-desc { font-size: 13px; line-height: 1.5; color: var(--pmw-text-secondary, #4b5563); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-plan-apply { display: flex; flex-direction: column; gap: 12px; padding: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-plan-weeks { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 8px; max-height: 420px; overflow: auto; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-plan-week { padding: 8px 10px; border: 1px dashed var(--pmw-border, #e5e7eb); border-radius: 6px; font-size: 13px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-plan-week ol { margin: 4px 0 0; padding-left: 18px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-plan-week li { margin: 3px 0; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-plan-week li small { display: block; color: var(--pmw-text-secondary, #6b7280); font-size: 12px; line-height: 1.4; }\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-cal { display: flex; flex-direction: column; gap: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-cal-title { font-size: 15px; min-width: 110px; text-align: center; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-cal-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-cal-head { font-size: 12px; color: var(--pmw-text-secondary, #6b7280); text-align: center; padding: 2px 0; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-cal-cell {\n  display: flex; flex-direction: column; gap: 4px; min-height: 92px; padding: 4px 8px; text-align: left; overflow: hidden; cursor: pointer;\n  border: 1px solid var(--pmw-border, #e5e7eb); border-radius: 6px; background: var(--pmw-panel, #fff); color: inherit; font: inherit;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-cal-cell.out { opacity: 0.45; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-cal-cell.today .gc-cal-day { background: var(--pmw-accent, #2563eb); color: #fff; border-radius: 10px; padding: 0 6px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-cal-cell.sel { border-color: var(--pmw-accent, #2563eb); box-shadow: 0 0 0 1px var(--pmw-accent, #2563eb); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-cal-day { font-size: 12px; font-weight: 600; align-self: flex-start; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-cal-item {\n  display: block; padding: 1px 5px; border-radius: 3px; color: #fff; font-size: 11px; line-height: 16px;\n  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-plan-edit-session { border-bottom: 1px dashed var(--pmw-border, #eceef1); padding-bottom: 4px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-target-row { grid-template-columns: 68px minmax(0, 1fr) minmax(0, 1fr) auto; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-target-row > small { color: var(--pmw-text-secondary, #6b7280); font-size: 11px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-target-row .gc-field { font-size: 11px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-cal-cell.gc-cal-miss { border-color: #dc2626; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-cal-cell.gc-cal-partial { border-color: #d97706; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-cal-item.gc-st-done { opacity: 0.72; color: #fff; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-cal-item.gc-st-partial { opacity: 1; color: #fff; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-cal-item.gc-st-miss { opacity: 1; color: #fff; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-cal-item.gc-st-none { opacity: 0.65; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-cal-more { font-size: 11px; color: var(--pmw-text-secondary, #6b7280); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-cal-act { font-size: 11px; color: #047857; font-weight: 600; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-cal-day-panel { display: flex; flex-direction: column; gap: 8px; padding: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-cal-entry { padding: 8px 0; border-bottom: 1px dashed var(--pmw-border, #eceef1); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-cal-entry-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-cal-entry-head small { color: var(--pmw-text-secondary, #6b7280); font-size: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-cal-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 13px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-cal-compare { margin: 4px 0 0; font-size: 12px; color: var(--pmw-text-secondary, #6b7280); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-tag.gc-st-done { background: #d1fae5; color: #065f46; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-tag.gc-st-partial { background: #fef3c7; color: #92400e; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-tag.gc-st-miss { background: #fee2e2; color: #991b1b; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-tag.gc-st-none { background: var(--gc-soft); color: var(--gc-muted); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-tag.gc-st-fast { background: #fee2e2; color: #991b1b; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-tag.gc-st-on { background: #dbeafe; color: #1e40af; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-tag.gc-st-slow { background: #fef3c7; color: #92400e; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-today-plan { margin-bottom: 8px; }\n\n@media (max-width: 640px) {\n  [data-pmw-plugin=\"garmin_connect\"] .gc-cal-cell { min-height: 58px; padding: 3px; }\n  [data-pmw-plugin=\"garmin_connect\"] .gc-cal-item { font-size: 10px; padding: 0 3px; }\n  [data-pmw-plugin=\"garmin_connect\"] .gc-cal-act { font-size: 10px; }\n  [data-pmw-plugin=\"garmin_connect\"] .gc-target-row { grid-template-columns: 56px minmax(0, 1fr); }\n}\n\n/* 0.7.0：比赛与影像记忆 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-races { display: flex; flex-direction: column; gap: 16px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-stat-btn { text-align: left; cursor: pointer; font: inherit; color: inherit; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-race-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-race-card {\n  display: flex; flex-direction: column; padding: 0; overflow: hidden; text-align: left; cursor: pointer;\n  border: 1px solid var(--pmw-border, #e5e7eb); border-radius: var(--pmw-radius, 10px); background: var(--pmw-panel, #fff); color: inherit; font: inherit;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-race-card:hover { border-color: var(--pmw-accent, #2563eb); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-race-cover { display: block; height: 150px; background: #eef2f7; overflow: hidden; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-race-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-race-cover-empty {\n  display: flex; height: 100%; align-items: center; justify-content: center; font-size: 18px; font-weight: 600; color: #94a3b8;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-race-body { display: flex; flex-direction: column; gap: 4px; padding: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-race-body small { color: var(--pmw-text-secondary, #6b7280); font-size: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-race-result { display: flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-tag-pb { background: #fef3c7; color: #92400e; font-size: 12px; font-weight: 600; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-empty { padding: 28px; text-align: center; border: 1px dashed var(--pmw-border, #e5e7eb); border-radius: 10px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-race-form { max-width: 720px; }\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-media { display: flex; flex-direction: column; gap: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-media-group { padding: 12px; border: 1px solid var(--pmw-border, #e5e7eb); border-radius: 8px; background: var(--pmw-panel, #fff); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-media-head { display: flex; align-items: baseline; gap: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-media-head small { color: var(--pmw-text-secondary, #6b7280); font-size: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-media-head .gc-link { margin-left: auto; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; margin-top: 8px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-media-item { margin: 0; display: flex; flex-direction: column; gap: 4px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-media-thumb {\n  display: block; width: 100%; aspect-ratio: 4 / 3; padding: 0; border: 0; border-radius: 6px; overflow: hidden; background: #eef2f7; cursor: zoom-in;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-media-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-media-icon { display: flex; height: 100%; align-items: center; justify-content: center; font-weight: 600; color: #475569; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-media-item figcaption { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-media-cap { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--pmw-text-secondary, #4b5563); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-upload-queue { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-upload-row { display: grid; grid-template-columns: minmax(0, 1fr) 200px; gap: 12px; align-items: center; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-err { color: #b91c1c; }\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-viewer {\n  position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; background: rgba(15, 23, 42, 0.82);\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-viewer-inner { display: flex; flex-direction: column; gap: 8px; max-width: 92vw; max-height: 92vh; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-viewer-inner img, [data-pmw-plugin=\"garmin_connect\"] .gc-viewer-inner video {\n  max-width: 92vw; max-height: 80vh; object-fit: contain; border-radius: 6px; background: #000;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-viewer-inner iframe { width: 80vw; height: 80vh; border: 0; background: #fff; border-radius: 6px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-viewer-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; color: #fff; font-size: 13px; }\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-viewer-bar .pmw-plugin-button { color: #111; background: #fff; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-viewer-bar .pmw-plugin-button:disabled { opacity: 0.45; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-media-video { position: relative; display: block; width: 100%; height: 100%; background: #0f172a; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-media-video video { width: 100%; height: 100%; object-fit: cover; display: block; pointer-events: none; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-media-play {\n  position: absolute; left: 8px; bottom: 8px; padding: 1px 8px; border-radius: 10px; background: rgba(15, 23, 42, 0.7); color: #fff; font-size: 12px;\n}\n\n/* 0.8.0：我的计划、计划编辑器 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-plan-card { padding: 0; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-plan-card-main {\n  display: flex; flex-direction: column; gap: 4px; padding: 12px 12px 8px; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-plan-actions { padding: 0 12px 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-plan-editor { max-width: none; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-plan-edit-weeks { display: flex; flex-direction: column; gap: 12px; max-height: 560px; overflow: auto; padding-right: 4px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-plan-edit-week { padding: 8px 10px; border: 1px dashed var(--pmw-border, #e5e7eb); border-radius: 6px; display: flex; flex-direction: column; gap: 8px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-plan-edit-row { display: grid; grid-template-columns: 90px minmax(0, 1fr) minmax(0, 2fr) minmax(0, 1fr) auto; gap: 8px; align-items: center; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-plan-edit-row input, [data-pmw-plugin=\"garmin_connect\"] .gc-plan-edit-row select {\n  padding: 5px 7px; border: 1px solid var(--pmw-border, #d1d5db); border-radius: 4px; font: inherit; font-size: 13px; background: var(--pmw-panel, #fff); color: inherit; min-width: 0;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-link:disabled { opacity: 0.4; cursor: default; }\n@media (max-width: 760px) {\n  [data-pmw-plugin=\"garmin_connect\"] .gc-plan-edit-row { grid-template-columns: 80px minmax(0, 1fr); }\n  [data-pmw-plugin=\"garmin_connect\"] .gc-plan-edit-row > input:nth-of-type(2) { grid-column: 1 / -1; }\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-time-kind { font-size: 12px; font-weight: 500; color: var(--pmw-text-secondary, #6b7280); margin-left: 4px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-plan-edit-row.gc-video-row { grid-template-columns: minmax(0, 2fr) minmax(0, 2fr) minmax(0, 1fr) auto; }\n@media (max-width: 760px) {\n  [data-pmw-plugin=\"garmin_connect\"] .gc-plan-edit-row.gc-video-row { grid-template-columns: minmax(0, 1fr) auto; }\n}\n\n/* 0.8.0：来源标记、推荐视频 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-plan-card-more { padding-top: 2px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-plan-source { padding: 0 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-source { display: inline-flex; align-items: center; gap: 0; border-radius: 10px; overflow: hidden; font-size: 12px; border: 1px solid #fbcfe8; vertical-align: middle; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-source-type { padding: 1px 6px; background: #fce7f3; color: #9d174d; font-weight: 600; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-source-name { padding: 1px 8px; color: #9d174d; text-decoration: none; }\n[data-pmw-plugin=\"garmin_connect\"] a.gc-source-name:hover { text-decoration: underline; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-source-coach, [data-pmw-plugin=\"garmin_connect\"] .gc-source-book, [data-pmw-plugin=\"garmin_connect\"] .gc-source-other { border-color: #c7d2fe; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-source-coach .gc-source-type, [data-pmw-plugin=\"garmin_connect\"] .gc-source-book .gc-source-type, [data-pmw-plugin=\"garmin_connect\"] .gc-source-other .gc-source-type { background: #e0e7ff; color: #3730a3; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-source-coach .gc-source-name, [data-pmw-plugin=\"garmin_connect\"] .gc-source-book .gc-source-name, [data-pmw-plugin=\"garmin_connect\"] .gc-source-other .gc-source-name { color: #3730a3; }\n[data-pmw-plugin=\"garmin_connect\"] a.gc-link { text-decoration: none; }\n[data-pmw-plugin=\"garmin_connect\"] a.gc-link:hover { text-decoration: underline; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-strong-link { font-weight: 600; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-inline-video { font-size: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-plan-videos { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; margin: 4px 0 8px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-plan-videos small { color: var(--pmw-text-secondary, #6b7280); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-video-group { margin-top: 14px; display: flex; flex-direction: column; gap: 8px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-video-group .gc-media-head .gc-link { margin-left: 0; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-video-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-video-card { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--pmw-border, #e5e7eb); border-radius: 8px; background: var(--pmw-panel, #fff); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-video-top { display: flex; gap: 8px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-video-title { font-weight: 600; color: inherit; text-decoration: none; line-height: 1.4; }\n[data-pmw-plugin=\"garmin_connect\"] a.gc-video-title:hover { color: var(--pmw-accent, #2563eb); text-decoration: underline; }\n\n/* =========================================================================\n * 0.9.0：浅色 / 深色主题\n * 组件都包在 .gc-root[data-gc-theme] 里。这里先定 --gc-* 主题 token，再把 --pmw-* 映射过去，\n * 前面按 --pmw-* 写的样式自动跟着主题走；下面只覆盖原来写死的颜色和需要变形态的组件。\n * 浅色 = 清新卡片（浮起白卡、指标分色）；深色 = 运动仪表盘（深底、橙色主色、等宽数字）。\n * ========================================================================= */\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-root {\n  --pmw-text: var(--gc-text);\n  --pmw-text-secondary: var(--gc-muted);\n  --pmw-border: var(--gc-border);\n  --pmw-panel: var(--gc-card);\n  --pmw-panel-hover: var(--gc-soft);\n  --pmw-accent: var(--gc-accent);\n  --pmw-danger: var(--gc-bad);\n  --pmw-radius: var(--gc-radius);\n  --line: var(--gc-border);\n  --hover: var(--gc-soft);\n  color: var(--gc-text);\n}\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"light\"] {\n  --gc-bg: transparent;\n  --gc-card: #ffffff;\n  --gc-border: #e7ecf3;\n  --gc-text: #172033;\n  --gc-muted: #6f7a8e;\n  --gc-soft: #eef2f8;\n  --gc-accent: #2f6bff;\n  --gc-on-accent: #ffffff;\n  --gc-good: #0e8a59;\n  --gc-warn: #b45309;\n  --gc-bad: #d92d3f;\n  --gc-radius: 12px;\n  --gc-shadow: 0 1px 2px rgba(16, 24, 40, 0.04), 0 4px 14px rgba(16, 24, 40, 0.06);\n  --gc-shadow-hover: 0 2px 4px rgba(16, 24, 40, 0.06), 0 8px 22px rgba(16, 24, 40, 0.1);\n  --gc-num-font: inherit;\n  --gc-cover: #eef2f8;\n  --gc-tag-in-bg: #e8f0ff; --gc-tag-in: #2f6bff;\n  --gc-tag-pb-bg: #fff4d6; --gc-tag-pb: #a86b00;\n  --gc-src-up-bg: #fde7f1; --gc-src-up: #b4235f; --gc-src-up-border: #f9c6dc;\n  --gc-src-bg: #e8edff; --gc-src: #3a46b5; --gc-src-border: #cdd6ff;\n  /* 指标色：距离蓝、配速青、心率红、步频紫 */\n  --gc-m-pace: #0fa5a0;\n  --gc-m-hr: #f0436a;\n  --gc-m-ele: #16a34a;\n  --gc-m-cad: #8b5cf6;\n  --gc-m-pow: #f97316;\n  --gc-m-gct: #0ea5e9;\n  --gc-m-vo: #ec4899;\n  --gc-m-stride: #65a30d;\n}\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"dark\"] {\n  --gc-bg: #0d1117;\n  --gc-card: #151b24;\n  --gc-border: #243041;\n  --gc-text: #e8edf4;\n  --gc-muted: #8d99ab;\n  --gc-soft: #1d2531;\n  --gc-accent: #ff6a2b;\n  --gc-on-accent: #ffffff;\n  --gc-good: #3ddc97;\n  --gc-warn: #fbbf24;\n  --gc-bad: #ff5c6c;\n  --gc-radius: 10px;\n  --gc-shadow: none;\n  --gc-shadow-hover: 0 0 0 1px #34425a;\n  --gc-num-font: \"SF Mono\", \"JetBrains Mono\", ui-monospace, Menlo, monospace;\n  --gc-cover: #1a2230;\n  --gc-tag-in-bg: rgba(46, 196, 255, 0.14); --gc-tag-in: #5fd3ff;\n  --gc-tag-pb-bg: rgba(255, 106, 43, 0.16); --gc-tag-pb: #ff9a66;\n  --gc-src-up-bg: rgba(244, 114, 182, 0.16); --gc-src-up: #f9a8d4; --gc-src-up-border: rgba(244, 114, 182, 0.35);\n  --gc-src-bg: rgba(129, 140, 248, 0.16); --gc-src: #c7d2fe; --gc-src-border: rgba(129, 140, 248, 0.35);\n  --gc-m-pace: #2ec4ff;\n  --gc-m-hr: #ff4d6d;\n  --gc-m-ele: #3ddc97;\n  --gc-m-cad: #b18cff;\n  --gc-m-pow: #ff8a3d;\n  --gc-m-gct: #22d3ee;\n  --gc-m-vo: #f472b6;\n  --gc-m-stride: #a3e635;\n  color-scheme: dark;\n  background: var(--gc-bg);\n  border-radius: 14px;\n  padding: 16px;\n}\n\n/* ---- 卡片：浅色浮起白卡，深色描边深卡 ---- */\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-stat,\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-group,\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-line,\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-chart-box,\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-plan-card,\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-race-card,\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-media-group,\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-video-card,\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-edit,\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .pmw-plugin-card {\n  border-color: var(--gc-border);\n  border-radius: var(--gc-radius);\n  background: var(--gc-card);\n  box-shadow: var(--gc-shadow);\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"light\"] .gc-stat,\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"light\"] .gc-group,\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"light\"] .gc-chart-box,\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"light\"] .gc-race-card,\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"light\"] .gc-plan-card,\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"light\"] .gc-video-card { border-color: transparent; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-race-card:hover,\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-plan-card:hover,\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-stat-btn:hover { box-shadow: var(--gc-shadow-hover); border-color: var(--gc-border); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-plan-card.on { border-color: var(--gc-accent); box-shadow: 0 0 0 1px var(--gc-accent), var(--gc-shadow); }\n\n/* 统计卡：数字更大；浅色顶部带一点主色渐变，深色左侧主色条 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-stat { padding: 12px; position: relative; overflow: hidden; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-stat-value { font-size: 20px; font-weight: 700; letter-spacing: -0.01em; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"light\"] .gc-stat { background: linear-gradient(165deg, color-mix(in srgb, var(--gc-accent) 7%, #fff) 0%, #fff 60%); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"dark\"] .gc-stat { box-shadow: inset 3px 0 0 var(--gc-accent); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"dark\"] .gc-stat-value { color: #fff; }\n\n/* 数字列：深色用等宽字体 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-table .num,\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-race-result,\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-dl dd { font-family: var(--gc-num-font); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-race-result { font-size: 22px; }\n\n/* 主按钮用主色 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .pmw-plugin-button { border-color: var(--gc-border); background: var(--gc-card); border-radius: calc(var(--gc-radius) - 4px); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .pmw-plugin-button:hover { background: var(--gc-soft); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .pmw-plugin-button.gc-primary { background: var(--gc-accent); border-color: var(--gc-accent); color: var(--gc-on-accent); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .pmw-plugin-button.gc-primary:hover { background: color-mix(in srgb, var(--gc-accent) 88%, #000); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .pmw-plugin-button:disabled { opacity: 0.55; cursor: default; }\n\n/* 表格与列表 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-table th,\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-table td { border-bottom-color: var(--gc-border); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-row:hover,\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-row:focus-visible { background: var(--gc-soft); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-tag { background: var(--gc-soft); color: var(--gc-muted); border-radius: 999px; padding: 0 8px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-tag-in { background: var(--gc-tag-in-bg); color: var(--gc-tag-in); font-weight: 600; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-tag-pb { background: var(--gc-tag-pb-bg); color: var(--gc-tag-pb); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-note { border-left-color: var(--gc-accent); background: var(--gc-soft); border-radius: 0 6px 6px 0; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-readout { background: var(--gc-soft); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-subtotal td { background: var(--gc-soft); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-chip { border-color: var(--gc-border); background: var(--gc-card); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-lap-summary em { background: var(--gc-soft); color: var(--gc-muted); }\n\n/* 图表 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-grid { stroke: var(--gc-border); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-bar { fill: var(--gc-accent); opacity: 0.82; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-bar:hover { opacity: 1; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-avgline { stroke: var(--gc-m-hr); opacity: 0.9; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-lapbar.on,\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-lap-tag { stroke: var(--gc-text); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-lap-tag { fill: var(--gc-text); stroke: none; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-band-note.gc-collapse { color: var(--gc-warn); }\n\n/* 地图：深色主题把瓦片反相成暗色底图，路线和起终点颜色不变 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-map { background: var(--gc-cover); border-color: var(--gc-border); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"dark\"] .gc-tile { filter: invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.88) saturate(0.7); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"dark\"] .gc-route { stroke: var(--gc-accent); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"dark\"] .gc-route-halo { stroke: #0d1117; opacity: 0.7; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"dark\"] .gc-map-split text { fill: #f1f3f5; stroke: #0d1117; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"dark\"] .gc-map-split circle { fill: #0d1117; stroke: var(--gc-accent, #ff922b); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"dark\"] .gc-table tr.gc-lap-active { background: rgba(255, 146, 43, 0.18); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-map-zoom button { background: var(--gc-card); color: var(--gc-text); border-color: var(--gc-border); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-map-attr { background: color-mix(in srgb, var(--gc-card) 75%, transparent); color: var(--gc-muted); }\n\n/* 日历 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-cal-cell { border-color: var(--gc-border); background: var(--gc-card); border-radius: 8px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-cal-cell.today .gc-cal-day { background: var(--gc-accent); color: var(--gc-on-accent); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-cal-cell.sel { border-color: var(--gc-accent); box-shadow: 0 0 0 1px var(--gc-accent); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-cal-act { color: var(--gc-good); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-k-run, [data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-int-work { background: var(--gc-accent); fill: var(--gc-accent); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-cal-cell.gc-cal-miss { border-color: var(--gc-bad, #dc2626); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-cal-cell.gc-cal-partial { border-color: var(--gc-warn, #d97706); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-tag.gc-st-done { background: rgba(16, 185, 129, 0.16); color: var(--gc-good, #34d399); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-tag.gc-st-partial { background: var(--gc-tag-pb-bg); color: var(--gc-tag-pb); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-tag.gc-st-miss { background: rgba(239, 68, 68, 0.16); color: var(--gc-bad, #f87171); }\n\n/* 比赛与影像 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-race-cover,\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-media-thumb { background: var(--gc-cover); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-race-cover-empty,\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-media-icon { color: var(--gc-muted); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"light\"] .gc-race-cover-empty { background: linear-gradient(135deg, color-mix(in srgb, var(--gc-accent) 12%, #fff), #f4f7fb); color: color-mix(in srgb, var(--gc-accent) 70%, #6f7a8e); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"dark\"] .gc-race-cover-empty { background: linear-gradient(135deg, rgba(255, 106, 43, 0.18), #151b24 70%); color: #ff9a66; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-empty { border-color: var(--gc-border); border-radius: var(--gc-radius); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-err { color: var(--gc-bad); }\n\n/* 来源标记 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-source { border-color: var(--gc-src-up-border); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-source-type { background: var(--gc-src-up-bg); color: var(--gc-src-up); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-source-name { color: var(--gc-src-up); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-source-coach, [data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-source-book, [data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-source-other { border-color: var(--gc-src-border); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-source-coach .gc-source-type, [data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-source-book .gc-source-type, [data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-source-other .gc-source-type { background: var(--gc-src-bg); color: var(--gc-src); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-source-coach .gc-source-name, [data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-source-book .gc-source-name, [data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-source-other .gc-source-name { color: var(--gc-src); }\n\n/* 表单控件 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-root input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]),\n[data-pmw-plugin=\"garmin_connect\"] .gc-root select,\n[data-pmw-plugin=\"garmin_connect\"] .gc-root textarea { background: var(--gc-card); color: var(--gc-text); border-color: var(--gc-border); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"dark\"] input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]),\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"dark\"] select,\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"dark\"] textarea { background: #0f141c; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root input[type=checkbox] { accent-color: var(--gc-accent); }\n\n/* 表格放进卡片（记录、统计明细、分段） */\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-scroll {\n  background: var(--gc-card); border: 1px solid var(--gc-border); border-radius: var(--gc-radius); box-shadow: var(--gc-shadow); padding: 2px 10px 6px;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"light\"] .gc-scroll { border-color: transparent; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-scroll .gc-table tr:last-child td { border-bottom: 0; }\n/* 深色主色是橙色，和力量训练的橙色撞了：跑步类改用蓝色 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"dark\"] .gc-k-run,\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"dark\"] .gc-int-work { background: #3b82f6; fill: #3b82f6; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-races .gc-stat-btn .gc-stat-value { white-space: nowrap; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-root .gc-races .gc-stats { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }\n\n/* 统计、图表、视频这几个视图原来没有容器样式，子组件贴在一起：统一纵向间距 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-stats-view,\n[data-pmw-plugin=\"garmin_connect\"] .gc-charts-tab,\n[data-pmw-plugin=\"garmin_connect\"] .gc-videos { display: flex; flex-direction: column; gap: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-charts-tab .gc-legend { margin: -4px 0 0; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-sync { display: flex; flex-direction: column; gap: 8px; padding-top: 4px; }\n/* 同步状态常驻在模块页顶部：失败用警示色整条标出，不能只藏在一行小字里 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-sync-status {\n  display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 12px;\n  margin: 0 0 12px; padding: 8px 12px; border: 1px solid var(--pmw-border, #d1d5db);\n  border-radius: 6px; background: var(--pmw-panel, #f9fafb); font-size: 13px;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-sync-status-main { color: var(--pmw-text, inherit); font-weight: 600; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-sync-status-meta { color: var(--pmw-text-secondary, #6b7280); font-size: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-sync-status-error {\n  border-color: var(--pmw-danger, #ef4444); background: color-mix(in srgb, var(--pmw-danger, #ef4444) 10%, transparent);\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-sync-status-error .gc-sync-status-main { color: var(--pmw-danger, #b91c1c); }\n\n/* 记录页汇总卡片：力量训练次数与时长 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-stat-sub { display: flex; align-items: center; gap: 4px; margin-top: 2px; font-size: 12px; color: var(--pmw-text-secondary, #6b7280); font-variant-numeric: tabular-nums; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-stat-sub .gc-dot { width: 7px; height: 7px; }\n\n/* =========================================================================\n * 数据中心版式（参考 Keep 数据中心）：灰底白卡、分段切换、指标块、环形图、堆叠柱、占比条\n * 记录页概览与活动详情用；类型配色：室外跑绿、室内跑蓝、力量深灰紫、其他红\n * ========================================================================= */\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"light\"] {\n  --gc-bg: #f4f5f7;\n  --gc-shadow: none;\n  --gc-shadow-hover: 0 2px 10px rgba(16, 24, 40, 0.08);\n  --gc-tile: #f6f7f9;\n  --gc-seg-bg: #eceef2;\n  --gc-seg-on: #ffffff;\n  --gc-c-out: #26c281; --gc-c-in: #4f86f7; --gc-c-str: #4b4453; --gc-c-oth: #f2606f;\n  --gc-pref: #9fd356;\n  background: var(--gc-bg);\n  border-radius: 14px;\n  padding: 16px;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"dark\"] {\n  --gc-tile: #1b2230;\n  --gc-seg-bg: #0d1117;\n  --gc-seg-on: #26303f;\n  --gc-c-out: #3ddc97; --gc-c-in: #5b8def; --gc-c-str: #a99fc0; --gc-c-oth: #ff6b7a;\n  --gc-pref: #8fcf4f;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-c-out { --c: var(--gc-c-out, #26c281); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-c-in { --c: var(--gc-c-in, #4f86f7); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-c-str { --c: var(--gc-c-str, #4b4453); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-c-oth { --c: var(--gc-c-oth, #f2606f); }\n[data-pmw-plugin=\"garmin_connect\"] i.gc-swatch[class*=\"gc-c-\"] { background: var(--c); width: 10px; height: 10px; border-radius: 2px; }\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-list,\n[data-pmw-plugin=\"garmin_connect\"] .gc-overview,\n[data-pmw-plugin=\"garmin_connect\"] .gc-kdata { display: flex; flex-direction: column; gap: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-list { gap: 16px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-ksection { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; margin-top: 4px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-ksection h2 { margin: 0; font-size: 18px; font-weight: 500; color: var(--pmw-text-secondary, #6b7280); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-ksection .gc-controls { flex: 1 1 auto; }\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-kgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); align-items: start; gap: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-kgrid-2 { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-kgrid-detail { grid-template-columns: minmax(0, 1.45fr) minmax(380px, 1fr); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-kgrid-nomap { grid-template-columns: minmax(0, 1fr); }\n/* 右栏窄于 380px 时三个大字指标会被省略号截断：提前让地图和总览上下排 */\n@media (max-width: 1180px) {\n  [data-pmw-plugin=\"garmin_connect\"] .gc-kgrid-detail,\n  [data-pmw-plugin=\"garmin_connect\"] .gc-kgrid-2 { grid-template-columns: minmax(0, 1fr); }\n}\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-kpanel {\n  display: flex; flex-direction: column; gap: 16px; min-width: 0;\n  padding: 16px; border: 1px solid var(--gc-card-border, transparent); border-radius: var(--gc-radius, 10px);\n  background: var(--gc-card, #fff); box-shadow: var(--gc-shadow, none);\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-kpanel-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; min-height: 28px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-kpanel-title { margin: 0; font-size: 15px; font-weight: 600; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-kempty { margin: 28px 0; text-align: center; }\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-kseg { display: inline-flex; flex-wrap: wrap; max-width: 100%; gap: 4px; padding: 4px; border-radius: 8px; background: var(--gc-seg-bg, #eceef2); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-kseg button {\n  flex: 0 0 auto;\n  padding: 4px 12px; border: 0; border-radius: 6px; background: transparent; color: var(--pmw-text-secondary, #6b7280);\n  font: inherit; font-size: 13px; line-height: 20px; cursor: pointer; white-space: nowrap;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-kseg button:hover { color: var(--pmw-text, #111); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-kseg button.on { background: var(--gc-seg-on, #fff); color: var(--pmw-text, #111); font-weight: 600; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08); }\n\n/* 指标块：选中的顶部一条深色粗线。4 个块固定 2×2，避免排成 3+1 或把数值挤成省略号 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-ktiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 8px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-ktiles-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-ktiles-sm { grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-ktile {\n  position: relative; display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 12px;\n  border: 1px solid transparent; border-radius: 4px; background: var(--gc-tile, #f6f7f9); color: inherit; font: inherit; text-align: left;\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-ktile.on::before { content: \"\"; position: absolute; left: 0; right: 0; top: 0; height: 4px; background: var(--pmw-text, #111); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-ktile-btn { cursor: pointer; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-ktile-btn:not(.on):hover { border-color: var(--pmw-border, #e5e7eb); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-ktile-label { font-size: 12px; color: var(--pmw-text-secondary, #6b7280); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-ktile-value {\n  font-size: 20px; font-weight: 700; line-height: 1.15; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;\n  font-variant-numeric: tabular-nums; font-family: var(--gc-num-font, inherit);\n}\n[data-pmw-plugin=\"garmin_connect\"] .gc-ktile-value small { margin-left: 3px; font-size: 12px; font-weight: 500; color: var(--pmw-text-secondary, #6b7280); letter-spacing: 0; font-family: inherit; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-ksummary .gc-ktile-value { font-size: 28px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-ktiles-sm .gc-ktile { padding: 12px 10px; }\n/* 天气这类短指标：字号降一级、左右留白收一点，5 个块才能一行放下且值不被省略号吃掉 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-ktiles-sm .gc-ktile-value { font-size: 16px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-ktiles-sm .gc-ktile-value small { margin-left: 2px; font-size: 11px; }\n\n/* 详情：大字指标下面的次要指标 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-kmetrics { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 0 16px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-kmetric { display: flex; flex-direction: column; gap: 4px; padding: 10px 0; border-top: 1px solid var(--pmw-border, #e5e7eb); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-kmetric span { font-size: 12px; color: var(--pmw-text-secondary, #6b7280); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-kmetric b { font-size: 17px; font-weight: 600; font-variant-numeric: tabular-nums; font-family: var(--gc-num-font, inherit); white-space: nowrap; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-kmetric small { margin-left: 3px; font-size: 11px; font-weight: 500; color: var(--pmw-text-secondary, #6b7280); font-family: inherit; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-kmap .gc-map { border: 0; border-radius: 6px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-kpanel .gc-dl-row:first-child { padding-top: 0; }\n\n/* 环形图 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-donut { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 16px 24px; padding: 4px 0; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-donut-svg { width: 150px; height: 150px; flex: none; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-donut-track { fill: none; stroke: var(--gc-tile, #f1f2f4); stroke-width: 18; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-donut-seg { fill: none; stroke: var(--c); stroke-width: 18; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-donut-num { font-size: 24px; font-weight: 700; fill: var(--pmw-text, #111); font-family: var(--gc-num-font, inherit); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-donut-cap { font-size: 11px; fill: var(--pmw-text-secondary, #6b7280); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-donut-legend { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 12px; font-size: 13px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-donut-legend li { display: grid; grid-template-columns: 12px 48px minmax(56px, auto) 36px; align-items: center; gap: 8px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-donut-legend span { color: var(--pmw-text-secondary, #6b7280); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-donut-legend b { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-donut-legend em { font-style: normal; text-align: right; color: var(--pmw-text-secondary, #6b7280); font-variant-numeric: tabular-nums; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-donut-legend .gc-dim { opacity: 0.45; }\n\n/* 堆叠柱 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-ktrend { display: flex; flex-direction: column; gap: 8px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-kbars { width: 100%; height: auto; display: block; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-kaxis { font-size: 11px; fill: var(--pmw-text-secondary, #6b7280); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-kgrid-line { stroke: var(--pmw-border, #e5e7eb); stroke-dasharray: 3 3; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-kgrid-line.base { stroke-dasharray: none; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-kbar { fill: var(--c); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-kbar-hit { fill: transparent; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-kbars g:hover .gc-kbar-hit { fill: var(--gc-tile, #f6f7f9); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-klegend { justify-content: center; font-size: 12px; color: var(--pmw-text-secondary, #6b7280); }\n\n/* 占比条 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-hbars { display: flex; flex-direction: column; gap: 12px; padding-top: 2px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-hbar { display: grid; grid-template-columns: 36px minmax(0, 1fr) 40px 34px; align-items: center; gap: 12px; font-size: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-hbar-label { color: var(--pmw-text-secondary, #6b7280); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-hbar-track { height: 10px; border-radius: 5px; background: var(--gc-tile, #f1f2f4); overflow: hidden; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-hbar-track i { display: block; height: 100%; border-radius: 5px; background: var(--gc-pref, #9fd356); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-hbar-num,\n[data-pmw-plugin=\"garmin_connect\"] .gc-hbar-pct { text-align: right; color: var(--pmw-text-secondary, #6b7280); font-variant-numeric: tabular-nums; }\n\n/* 详情 tab：大一号字，选中下方短粗线 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-detail .gc-tabs { gap: 24px; border-bottom: 0; padding: 0 2px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-detail .gc-tab { position: relative; padding: 6px 2px 10px; border-bottom: 0; margin: 0; font-size: 16px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-detail .gc-tab.on { color: var(--pmw-text, #111); font-weight: 600; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-detail .gc-tab.on::after {\n  content: \"\"; position: absolute; left: 50%; bottom: 2px; width: 24px; height: 3px; border-radius: 2px; background: var(--pmw-text, #111); transform: translateX(-50%);\n}\n@media (max-width: 640px) {\n  [data-pmw-plugin=\"garmin_connect\"] .gc-root[data-gc-theme=\"light\"] { padding: 12px; }\n  [data-pmw-plugin=\"garmin_connect\"] .gc-kpanel { padding: 12px; }\n  [data-pmw-plugin=\"garmin_connect\"] .gc-ksummary .gc-ktile-value { font-size: 22px; }\n  [data-pmw-plugin=\"garmin_connect\"] .gc-kseg button { padding: 4px 10px; font-size: 12px; }\n  [data-pmw-plugin=\"garmin_connect\"] .gc-kpanel-head { gap: 8px; }\n}\n\n/* AI 分析的建议安排：可勾选的课表，排进日历或存为我的计划 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-ai-plan { padding: 16px; margin-top: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-ai-plan-list { list-style: none; margin: 10px 0; padding: 0; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-ai-plan-list li { border-top: 1px solid var(--gc-border, rgba(0,0,0,.08)); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-ai-plan-list li:first-child { border-top: 0; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-ai-plan-list label { display: flex; align-items: flex-start; gap: 8px; padding: 8px 2px; cursor: pointer; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-ai-plan-list input { margin-top: 3px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-ai-plan-list .gc-dot { margin-top: 6px; flex: none; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-ai-plan-list li.off { opacity: 0.45; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-ai-plan-date { flex: none; width: 76px; font-variant-numeric: tabular-nums; color: var(--gc-muted, #6b7280); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-ai-plan-title { display: flex; flex-direction: column; gap: 4px; min-width: 0; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-ai-plan-title small { color: var(--gc-muted, #6b7280); }\n\n/* =========================================================================\n * 恢复 / 体能趋势（0.10.0）：状态横幅、趋势图、今日卡片\n * ========================================================================= */\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-status { border-left: 3px solid var(--pmw-border, #ccc); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-status.gc-rec-good { border-left-color: #2ea36b; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-status.gc-rec-moderate { border-left-color: #d99125; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-status.gc-rec-low { border-left-color: #d6484f; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-status-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px 16px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-status-badge { display: inline-flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 600; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-status-badge i,\n[data-pmw-plugin=\"garmin_connect\"] .gc-today-badge i { display: inline-block; width: 9px; height: 9px; border-radius: 50%; flex: none; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-suggest { margin: 0; font-size: 14px; line-height: 1.5; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-progress { display: flex; align-items: center; gap: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-progress-track { flex: 1; height: 8px; border-radius: 4px; background: var(--gc-tile, #eef0f3); overflow: hidden; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-progress-track i { display: block; height: 100%; border-radius: 4px; background: var(--gc-pref, #9fd356); }\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-chart-wrap { display: flex; flex-direction: column; gap: 8px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-chart { width: 100%; height: auto; display: block; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-week { stroke: var(--gc-border, rgba(127,127,127,.18)); stroke-width: 1; stroke-dasharray: 3 3; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-bar { fill: var(--gc-c-in, #4f86f7); opacity: 0.75; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-bar.high { fill: var(--gc-c-oth, #f2606f); opacity: 0.9; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-line { fill: none; stroke: var(--gc-c-out, #26c281); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-dot { fill: var(--gc-c-out, #26c281); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-dot.high,\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-high { fill: var(--gc-c-oth, #f2606f); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-legend .gc-rec-high { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }\n\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-list { display: flex; flex-direction: column; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-row { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; padding: 8px 0; border-top: 1px solid var(--gc-border, rgba(0,0,0,.07)); font-size: 13px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-row:first-child { border-top: 0; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-date { flex: none; width: 42px; color: var(--pmw-text-secondary, #6b7280); font-variant-numeric: tabular-nums; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-name { flex: 1 1 120px; min-width: 0; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-dim { color: var(--pmw-text-secondary, #6b7280); font-variant-numeric: tabular-nums; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-tag { padding: 1px 6px; border-radius: 4px; font-size: 11px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-rec-tag.high { color: var(--gc-c-oth, #f2606f); background: color-mix(in srgb, var(--gc-c-oth, #f2606f) 14%, transparent); }\n\n/* 今日卡片 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-today-status { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 8px; border-left: 3px solid var(--pmw-border, #ccc); background: var(--gc-tile, rgba(127,127,127,.06)); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-today-status.gc-rec-good { border-left-color: #2ea36b; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-today-status.gc-rec-moderate { border-left-color: #d99125; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-today-status.gc-rec-low { border-left-color: #d6484f; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-today-badge { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-today-week { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12px; color: var(--pmw-text-secondary, #6b7280); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-today-week b { color: var(--pmw-text, inherit); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-today-last { margin-top: 2px; }\n\n/* 目标比赛列表 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-goal-list { display: flex; flex-direction: column; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-goal-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; padding: 8px 0; border-top: 1px solid var(--gc-border, rgba(0,0,0,.07)); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-goal-row:first-child { border-top: 0; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-goal-row.next strong::before { content: \"当前 · \"; color: var(--pmw-accent, #2563eb); font-size: 11px; }\n\n/* 周期化阶段 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-goal-phase { margin: 8px 0 0; padding: 8px 12px; border-radius: 6px; background: color-mix(in srgb, var(--pmw-accent, #2563eb) 10%, transparent); color: var(--pmw-text, inherit); font-size: 13px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-cal-phase { padding: 2px 8px; border-radius: 10px; background: color-mix(in srgb, var(--pmw-accent, #2563eb) 12%, transparent); color: var(--pmw-accent, #2563eb); font-size: 12px; }\n\n/* 主观状态 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-wellbeing { display: flex; flex-direction: column; gap: 8px; padding: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-wellbeing .gc-chip.on { background: color-mix(in srgb, var(--pmw-accent, #2563eb) 20%, transparent); border-color: var(--pmw-accent, #2563eb); color: var(--pmw-accent, #2563eb); }\n\n/* 训练预警 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-alert { margin: 0; padding: 8px 12px; border-radius: 6px; border-left: 3px solid #d97706; background: color-mix(in srgb, #d97706 10%, transparent); font-size: 13px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-alert.gc-alert-high { border-left-color: #dc2626; background: color-mix(in srgb, #dc2626 10%, transparent); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-today-alerts { display: flex; flex-direction: column; gap: 6px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-alert-panel { display: flex; flex-direction: column; gap: 8px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-alert-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-alert-row .gc-alert { flex: 1 1 240px; }\n\n/* 训练效果评估 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-effect { display: flex; flex-direction: column; gap: 8px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-eff-zones { display: flex; flex-direction: column; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-eff-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; padding: 6px 0; border-top: 1px solid var(--gc-border, rgba(0,0,0,.07)); font-size: 13px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-eff-row:first-child { border-top: 0; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-eff-zone { min-width: 60px; font-weight: 600; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-eff-dim { color: var(--pmw-text-secondary, #6b7280); font-size: 12px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-eff-tag { margin-left: auto; padding: 1px 6px; border-radius: 4px; font-size: 11px; background: var(--gc-soft); color: var(--gc-muted); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-eff-tag.good { color: #065f46; background: #d1fae5; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-eff-tag.bad { color: #991b1b; background: #fee2e2; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-eff-weeks { display: flex; flex-direction: column; gap: 6px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-eff-week { display: flex; flex-direction: column; gap: 3px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-eff-bar { display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: var(--gc-soft); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-eff-bar i { display: block; height: 100%; }\n\n/* 比赛预测 */\n[data-pmw-plugin=\"garmin_connect\"] .gc-prediction { margin: 8px 0; padding: 12px; border-radius: 8px; background: var(--gc-tile, rgba(127,127,127,.06)); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-pred-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 8px; margin: 8px 0; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-pred-grid > div { display: flex; flex-direction: column; gap: 4px; padding: 8px; border-radius: 6px; background: var(--gc-tile, rgba(127,127,127,.06)); }\n[data-pmw-plugin=\"garmin_connect\"] .gc-pred-grid small { color: var(--pmw-text-secondary, #6b7280); font-size: 11px; }\n[data-pmw-plugin=\"garmin_connect\"] .gc-pred-grid strong { font-size: 18px; font-variant-numeric: tabular-nums; }\n"
    const __GC_DSH_CSS = `
[data-pmw-plugin="garmin_connect"] {
  --pmw-text: var(--dsw-alias-label-primary, #1f2329);
  --pmw-text-secondary: var(--dsw-alias-label-secondary, #6b7280);
  --pmw-border: var(--dsw-alias-border-l1, #e5e7eb);
  --pmw-panel: var(--dsw-alias-bg-layer-1, #fff);
  --pmw-panel-hover: var(--dsw-alias-interactive-bg-hover, #f3f4f6);
  --pmw-accent: var(--dsw-alias-brand-primary, #4d6bfe);
  --pmw-danger: var(--dsw-alias-state-error-primary, #dc2626);
  --pmw-radius: var(--dsw-radius-md, 8px);
  --line: var(--dsw-alias-border-l2, #d1d5db);
  --hover: var(--dsw-alias-interactive-bg-hover, #eef0f3);
}
.gc-dsh-page { height: 100%; overflow: auto; box-sizing: border-box; padding: 16px 20px 32px; background: var(--dsw-alias-bg-base, transparent); }
.gc-dsh-top { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
/* PMW 宿主给输入框的基础样式，dsh 里补上 */
[data-pmw-plugin="garmin_connect"] input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]),
[data-pmw-plugin="garmin_connect"] select,
[data-pmw-plugin="garmin_connect"] textarea {
  box-sizing: border-box; padding: 5px 8px; border: 1px solid var(--line); border-radius: 6px;
  background: var(--pmw-panel); color: var(--pmw-text); font: inherit; font-size: 13px; min-width: 0;
}
[data-pmw-plugin="garmin_connect"] input:focus, [data-pmw-plugin="garmin_connect"] select:focus, [data-pmw-plugin="garmin_connect"] textarea:focus {
  outline: 2px solid color-mix(in srgb, var(--pmw-accent) 35%, transparent); outline-offset: 0; border-color: var(--pmw-accent);
}
.gc-dsh-tabs { display: inline-flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.gc-dsh-tabs button { padding: 4px 12px; border: 0; background: transparent; color: inherit; font: inherit; font-size: 13px; cursor: pointer; }
.gc-dsh-tabs button + button { border-left: 1px solid var(--line); }
.gc-dsh-tabs button[aria-selected="true"] { background: var(--hover); font-weight: 600; }
.gc-dsh-banner { margin: 0 0 12px; padding: 8px 12px; border-radius: 6px; font-size: 13px; background: color-mix(in srgb, var(--pmw-danger) 10%, transparent); color: var(--pmw-danger); }
.gc-dsh-banner code { font-size: 12px; }
.gc-dsh-settings { max-width: 520px; }

/* ---- 配色跟随 dsh：主题 token 全部取 --dsw-*，明暗随 body[data-ds-dark-theme] 切换 ---- */
.gc-dsh-page[data-pmw-plugin="garmin_connect"] .gc-root[data-gc-theme] {
  --gc-bg: transparent;
  --gc-card: var(--dsw-alias-card-fill, var(--dsw-alias-bg-layer-1));
  --gc-card-border: transparent;
  --gc-border: var(--dsw-alias-border-l2);
  --gc-text: var(--dsw-alias-label-primary);
  --gc-muted: var(--dsw-alias-label-secondary);
  --gc-soft: var(--dsw-alias-interactive-bg-hover);
  --gc-accent: var(--dsw-alias-state-business-primary);
  --gc-on-accent: var(--dsw-alias-label-on-color, #fff);
  --gc-good: var(--dsw-alias-state-success-primary);
  --gc-bad: var(--dsw-alias-state-error-primary);
  --gc-warn: var(--dsw-static-amber-600, #d97706);
  --gc-radius: var(--dsw-radius-lg, 12px);
  --gc-shadow: none;
  --gc-shadow-hover: none;
  --gc-num-font: inherit;
  --gc-tile: color-mix(in srgb, var(--gc-text) 4%, transparent);
  --gc-seg-bg: color-mix(in srgb, var(--gc-text) 7%, transparent);
  --gc-seg-on: var(--dsw-alias-bg-layer-1, #fff);
  --gc-cover: var(--dsw-alias-card-fill-hover, var(--dsw-alias-bg-layer-2));
  --gc-tag-in-bg: color-mix(in srgb, var(--gc-accent) 14%, transparent); --gc-tag-in: var(--gc-accent);
  --gc-tag-pb-bg: color-mix(in srgb, var(--dsw-static-amber-500, #f59e0b) 18%, transparent); --gc-tag-pb: var(--dsw-static-amber-600, #b45309);
  --gc-src-up-bg: color-mix(in srgb, var(--dsw-alias-state-done-primary, #7c3aed) 14%, transparent); --gc-src-up: var(--dsw-alias-state-done-primary, #7c3aed);
  --gc-src-up-border: color-mix(in srgb, var(--dsw-alias-state-done-primary, #7c3aed) 35%, transparent);
  --gc-src-bg: color-mix(in srgb, var(--gc-accent) 12%, transparent); --gc-src: var(--gc-accent); --gc-src-border: color-mix(in srgb, var(--gc-accent) 32%, transparent);
  background: transparent; padding: 0; border-radius: 0;
}
.gc-dsh-page[data-pmw-plugin="garmin_connect"] .gc-root[data-gc-theme] .gc-stat,
.gc-dsh-page[data-pmw-plugin="garmin_connect"] .gc-root[data-gc-theme] .gc-group,
.gc-dsh-page[data-pmw-plugin="garmin_connect"] .gc-root[data-gc-theme] .gc-chart-box,
.gc-dsh-page[data-pmw-plugin="garmin_connect"] .gc-root[data-gc-theme] .gc-race-card,
.gc-dsh-page[data-pmw-plugin="garmin_connect"] .gc-root[data-gc-theme] .gc-plan-card,
.gc-dsh-page[data-pmw-plugin="garmin_connect"] .gc-root[data-gc-theme] .gc-video-card,
.gc-dsh-page[data-pmw-plugin="garmin_connect"] .gc-root[data-gc-theme] .gc-kpanel,
.gc-dsh-page[data-pmw-plugin="garmin_connect"] .gc-root[data-gc-theme] .gc-scroll { background: var(--gc-card); border-color: var(--gc-card-border); box-shadow: none; }
/* 浅色：dsh 底色是白，卡片用浅灰底加细边框（旧版 dsh 没有 card-fill 变量） */
.gc-dsh-page[data-pmw-plugin="garmin_connect"] .gc-root[data-gc-theme="light"] { --gc-card: var(--dsw-alias-card-fill, var(--dsw-static-neutral-bluish-50, #f9fafb)); --gc-card-border: var(--dsw-alias-border-l2, rgba(0, 0, 0, 0.1)); }
.gc-dsh-page[data-pmw-plugin="garmin_connect"] .gc-root[data-gc-theme] .gc-race-card:hover,
.gc-dsh-page[data-pmw-plugin="garmin_connect"] .gc-root[data-gc-theme] .gc-plan-card:hover,
.gc-dsh-page[data-pmw-plugin="garmin_connect"] .gc-root[data-gc-theme] .gc-stat-btn:hover { background: var(--dsw-alias-card-fill-hover, var(--gc-soft)); box-shadow: none; }
.gc-dsh-page[data-pmw-plugin="garmin_connect"] .gc-root[data-gc-theme] .gc-stat-value { color: var(--gc-text); }
.gc-dsh-page[data-pmw-plugin="garmin_connect"] .gc-root[data-gc-theme="dark"] .gc-stat { box-shadow: none; }
.gc-dsh-page[data-pmw-plugin="garmin_connect"] .gc-root[data-gc-theme] .gc-race-cover-empty { background: color-mix(in srgb, var(--gc-accent) 10%, var(--gc-cover)); color: var(--gc-accent); }
.gc-dsh-page[data-pmw-plugin="garmin_connect"] .gc-root[data-gc-theme] input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]),
.gc-dsh-page[data-pmw-plugin="garmin_connect"] .gc-root[data-gc-theme] select,
.gc-dsh-page[data-pmw-plugin="garmin_connect"] .gc-root[data-gc-theme] textarea { background: var(--dsw-alias-bg-layer-1); color: var(--gc-text); border-color: var(--gc-border); }
.gc-dsh-page[data-pmw-plugin="garmin_connect"] .gc-root[data-gc-theme] .pmw-plugin-button { background: var(--dsw-alias-bg-layer-1); }
.gc-dsh-page[data-pmw-plugin="garmin_connect"] .gc-root[data-gc-theme] .pmw-plugin-button:hover { background: var(--gc-soft); }
.gc-dsh-page[data-pmw-plugin="garmin_connect"] .gc-root[data-gc-theme] .pmw-plugin-button.gc-primary { background: var(--gc-accent); color: var(--gc-on-accent); }
.gc-dsh-page[data-pmw-plugin="garmin_connect"] .gc-root[data-gc-theme="dark"] .gc-route-halo { stroke: var(--dsw-alias-bg-base, #0d1117); }
`

    /** 页面调 Host：在 apply 里接上 ctx.connection */
    let __gcRpc = null

    function __gcToB64(bytes) {
      let s = ''
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
      return btoa(s)
    }
    function __gcFromB64(b64) {
      const s = atob(b64 || '')
      const out = new Uint8Array(s.length)
      for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
      return out
    }
    async function __gcBodyB64(body) {
      if (body == null) return ''
      if (typeof body === 'string') return __gcToB64(new TextEncoder().encode(body))
      if (body instanceof Blob) return __gcToB64(new Uint8Array(await body.arrayBuffer()))
      if (body instanceof ArrayBuffer) return __gcToB64(new Uint8Array(body))
      if (ArrayBuffer.isView(body)) return __gcToB64(new Uint8Array(body.buffer, body.byteOffset, body.byteLength))
      if (body instanceof URLSearchParams) return __gcToB64(new TextEncoder().encode(body.toString()))
      throw new Error('dsh 版不支持这种请求体')
    }
    async function __gcCall(payload) {
      if (!__gcRpc) throw new Error('dsh 连接还没就绪')
      const r = await __gcRpc(payload)
      if (!r || r.ok === false) throw new Error((r && r.error && (r.error.message || r.error.code)) || 'Garmin 插件请求失败')
      return r.value
    }

    /** 模块内替换 fetch：dsh-gc: 开头的走 Host RPC，其余照常 */
    async function gcFetch(input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || ''
      if (!url.startsWith(__GC_BASE)) return window.fetch(input, init)
      init = init || {}
      const rest = url.slice(__GC_BASE.length) || '/'
      const q = rest.indexOf('?')
      const headers = {}
      if (init.headers) new Headers(init.headers).forEach(function (v, k) { headers[k] = v })
      const v = await __gcCall({
        op: 'http',
        method: (init.method || 'GET').toUpperCase(),
        path: q >= 0 ? rest.slice(0, q) : rest,
        query: q >= 0 ? rest.slice(q + 1) : '',
        headers: headers,
        body_b64: await __gcBodyB64(init.body),
      })
      const status = v.status || 500
      const nullBody = status === 204 || status === 205 || status === 304
      return new Response(nullBody ? null : __gcFromB64(v.body_b64), { status: status, headers: v.headers || {} })
    }

    /** dsh-gc: 资源 → blob URL（地图瓦片、比赛影像）；按路径缓存，超出上限回收最旧的 */
    const __gcAssets = new Map()
    const __GC_ASSET_MAX = 600
    function __gcAssetURL(path) {
      let hit = __gcAssets.get(path)
      if (hit) { __gcAssets.delete(path); __gcAssets.set(path, hit); return hit }
      hit = gcFetch(__GC_BASE + path).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status)
        return res.blob()
      }).then(function (blob) { return URL.createObjectURL(blob) })
      hit.catch(function () { __gcAssets.delete(path) })
      __gcAssets.set(path, hit)
      while (__gcAssets.size > __GC_ASSET_MAX) {
        const oldest = __gcAssets.keys().next().value
        const p = __gcAssets.get(oldest)
        __gcAssets.delete(oldest)
        p.then(function (u) { URL.revokeObjectURL(u) }, function () {})
      }
      return hit
    }
    function __gcSwap(el, attr) {
      const raw = el.getAttribute(attr)
      if (!raw || !raw.startsWith(__GC_BASE)) return
      const hash = raw.indexOf('#')
      const path = raw.slice(__GC_BASE.length, hash >= 0 ? hash : undefined)
      const frag = hash >= 0 ? raw.slice(hash) : ''
      el.setAttribute('data-gc-src', raw)
      __gcAssetURL(path).then(function (u) {
        if (el.getAttribute(attr) !== raw) return
        if (el.tagName === 'IMG') el.addEventListener('load', function () { el.style.visibility = '' }, { once: true })
        el.setAttribute(attr, u + frag)
        if (el.tagName === 'IMG') el.style.visibility = ''
      }, function () {})
    }
    function __gcScan(root) {
      if (!root || !root.querySelectorAll) return
      if (root.matches && root.matches('[src^="dsh-gc:"]')) __gcSwap(root, 'src')
      if (root.matches && root.matches('a[href^="dsh-gc:"]')) __gcSwap(root, 'href')
      root.querySelectorAll('[src^="dsh-gc:"]').forEach(function (el) { __gcSwap(el, 'src') })
      root.querySelectorAll('a[href^="dsh-gc:"]').forEach(function (el) { __gcSwap(el, 'href') })
    }
    function __gcUseAssets(ref) {
      React.useEffect(function () {
        const root = ref.current
        if (!root) return undefined
        __gcScan(root)
        const ob = new MutationObserver(function (list) {
          for (const m of list) {
            if (m.type === 'attributes') __gcScan(m.target)
            else m.addedNodes.forEach(function (n) { if (n.nodeType === 1) __gcScan(n) })
          }
        })
        ob.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'href'] })
        return function () { ob.disconnect() }
      }, [])
    }

    /** PMW 插件登记表：收下 entry.js 注册的槽位组件 */
    const __gcSlots = {}
    const __GC_PMW = {
      def: null,
      register: function (def) { this.def = def },
    }
    function __gcActivatePMW() {
      if (!__GC_PMW.def || __GC_PMW._active) return
      __GC_PMW._active = true
      __GC_PMW.def.activate({
        slots: {
          register: function (name, meta, comp) {
            __gcSlots[name + ':' + (meta.id || meta.key)] = comp
            return { dispose: function () { delete __gcSlots[name + ':' + (meta.id || meta.key)] } }
          },
        },
      })
    }

    const fetch = gcFetch

    // ===================== 以下嵌入 web/entry.js（构建时替换） =====================
    
    /**
     * Garmin 跑步数据插件前端入口（清单 v2 / 宿主 API 2.0.0）。
     * 只用 JS 语法子集（类型走 JSDoc），零构建即可作为 ESM 运行。
     * 数据走同源 /api/plugins/external/garmin_connect/api/*，由宿主转发到插件后端。
     * 标题和操作用宿主 ctx.ui.PageTitle 放进顶栏标题行；旧宿主没有 ctx.ui 时在页面内画标题。
     */
    const { Component, createElement: h, useEffect, useRef, useState } = React;

    const PLUGIN_ID = "garmin_connect";
    const PLUGIN_NAME = "Garmin 跑步数据";
    const API_RANGE = ">=2.0.0 <3.0.0";
    const API_BASE = __GC_BASE;
    const DEFAULT_INDOOR = ["treadmill_running", "indoor_running", "virtual_run"];

    /** @type {Array<{dispose?: () => void}>} */
    const disposables = [];
    /** 宿主 ctx（activate 时存下，组件里取 ctx.ui） */
    let CTX = null;

    // ---------------------------------------------------------------------------
    // 主题（0.9.0）：浅色 / 深色，默认跟随宿主（<html data-theme>，PMW 和 dsh 都写这个属性），没有再跟系统。
    // 选项存 localStorage；所有插件组件包在 .gc-root[data-gc-theme] 里，样式按它切换 token。
    // ---------------------------------------------------------------------------

    /** 宿主类型：PMW 工作台为 "pmw"；dsh 版构建时替换成 "dsh"，明暗只跟随 dsh 应用（body[data-ds-dark-theme]），不给手动切换 */
    const THEME_HOST = "dsh";
    const THEME_KEY = "gc-theme";
    const THEME_OPTIONS = [["auto", "跟随系统"], ["light", "浅色"], ["dark", "深色"]];
    let themePref = (function () {
      if (THEME_HOST === "dsh") return "auto";
      try { const v = window.localStorage.getItem(THEME_KEY); return v === "light" || v === "dark" ? v : "auto"; } catch (e) { return "auto"; }
    })();
    const themeSubs = new Set();

    function hostTheme() {
      if (THEME_HOST === "dsh") return document.body && document.body.hasAttribute("data-ds-dark-theme") ? "dark" : "light";
      const t = document.documentElement.getAttribute("data-theme");
      if (t === "dark" || t === "light") return t;
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    function resolvedTheme() { return themePref === "auto" ? hostTheme() : themePref; }
    function setThemePref(v) {
      themePref = v;
      try { window.localStorage.setItem(THEME_KEY, v); } catch (e) { /* 存不了就只在本次生效 */ }
      themeSubs.forEach(function (f) { f(); });
    }

    /** 订阅主题变化（手动切换、宿主切换、系统切换），返回当前生效的主题 */
    function useTheme() {
      const [, force] = useState(0);
      useEffect(function () {
        const f = function () { force(function (n) { return n + 1; }); };
        themeSubs.add(f);
        const ob = new MutationObserver(f);
        ob.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        if (document.body) ob.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme"] });
        const mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
        if (mq && mq.addEventListener) mq.addEventListener("change", f);
        return function () {
          themeSubs.delete(f); ob.disconnect();
          if (mq && mq.removeEventListener) mq.removeEventListener("change", f);
        };
      }, []);
      return resolvedTheme();
    }

    function ThemeRoot(props) {
      const theme = useTheme();
      return h("div", { className: "gc-root", "data-gc-theme": theme }, props.children);
    }

    /**
     * 图表按容器实测宽度画：viewBox 宽度 = 实际像素宽度，轴标签不会被缩放拉大或压小。
     * 返回 [ref, width]；量到之前先用 fallback 画一帧。
     */
    function useChartWidth(fallback) {
      const ref = useRef(null);
      const [w, setW] = useState(0);
      useEffect(function () {
        const el = ref.current;
        if (!el) return undefined;
        const read = function () {
          const nw = Math.round(el.getBoundingClientRect().width);
          if (nw > 0) setW(function (old) { return Math.abs(old - nw) > 1 ? nw : old; });
        };
        read();
        if (typeof ResizeObserver === "undefined") {
          window.addEventListener("resize", read);
          return function () { window.removeEventListener("resize", read); };
        }
        const ob = new ResizeObserver(read);
        ob.observe(el);
        return function () { ob.disconnect(); };
      }, []);
      return [ref, w || fallback];
    }

    /** 标题栏上的快速切换：当前深色就给「浅色」，反之亦然（切换后不再跟随） */
    function themeAction(theme) {
      if (THEME_HOST === "dsh") return null;
      return { label: theme === "dark" ? "浅色" : "深色", title: "切换浅色 / 深色主题（在设置里可改回跟随系统）",
        onClick: function () { setThemePref(theme === "dark" ? "light" : "dark"); } };
    }

    // ---------------------------------------------------------------------------
    // 统计口径：忽略短活动。只作用于统计数字（概览 + 统计页），不动运动记录列表。
    // 默认跑步 < 1 km、力量 < 10 min 不计入；阈值可在设置里改，存 localStorage。
    // ---------------------------------------------------------------------------

    const STATS_PREFS_KEY = "gc-stats-prefs";
    const STATS_DEFAULTS = { ignoreShort: true, minRunM: 1000, minStrengthS: 600 };

    function loadStatsPrefs() {
      const d = STATS_DEFAULTS;
      try {
        const v = JSON.parse(window.localStorage.getItem(STATS_PREFS_KEY) || "{}");
        const m = Number(v.minRunM), sec = Number(v.minStrengthS);
        return {
          ignoreShort: typeof v.ignoreShort === "boolean" ? v.ignoreShort : d.ignoreShort,
          minRunM: isFinite(m) && m >= 0 ? m : d.minRunM,
          minStrengthS: isFinite(sec) && sec >= 0 ? sec : d.minStrengthS,
        };
      } catch (e) {
        return { ignoreShort: d.ignoreShort, minRunM: d.minRunM, minStrengthS: d.minStrengthS };
      }
    }

    let statsPrefs = loadStatsPrefs();
    const statsSubs = new Set();

    function setStatsPrefs(patch) {
      statsPrefs = Object.assign({}, statsPrefs, patch);
      try { window.localStorage.setItem(STATS_PREFS_KEY, JSON.stringify(statsPrefs)); } catch (e) { /* 存不了就只在本次生效 */ }
      statsSubs.forEach(function (f) { f(); });
    }

    /** 订阅统计口径变化，返回当前偏好 */
    function useStatsPrefs() {
      const [, force] = useState(0);
      useEffect(function () {
        const f = function () { force(function (n) { return n + 1; }); };
        statsSubs.add(f);
        return function () { statsSubs.delete(f); };
      }, []);
      return statsPrefs;
    }

    /** 单条活动是否计入统计：力量按时长，其余按距离；关掉开关则全计入 */
    function statEligible(r, prefs) {
      const p = prefs || statsPrefs;
      if (!p.ignoreShort) return true;
      if (isStrengthType(r.type_key)) return (Number(r.duration_s) || 0) >= p.minStrengthS;
      return (runView(r).dist || 0) >= p.minRunM;
    }

    /** @param {string} path @param {RequestInit} [init] @returns {Promise<any>} */
    async function api(path, init) {
      const res = await fetch(API_BASE + path, init);
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        const msg = (data && data.error) || ("HTTP " + res.status);
        // 插件升级后宿主可能仍在跑旧的后端进程，新增接口会落到默认分支
        if (res.status === 404 && msg === "未知接口") {
          throw new Error("插件后端还是旧版本，退出并重新打开应用后再试");
        }
        throw new Error(msg);
      }
      return data;
    }

    /** 窄屏（手机）：标题按钮缩短、图表按手机宽度画、列表改卡片 */
    function isNarrow() {
      return typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
    }

    function errText(err) {
      return String((err && err.message) || err);
    }

    // ---------------------------------------------------------------------------
    // 格式化
    // ---------------------------------------------------------------------------

    /** @param {number|null|undefined} m @returns {string} */
    function fmtDistance(m) {
      if (typeof m !== "number" || !isFinite(m)) return "-";
      return (m / 1000).toFixed(2) + " km";
    }

    /** @param {number|null|undefined} sec @returns {string} */
    function fmtDuration(sec) {
      if (typeof sec !== "number" || !isFinite(sec)) return "-";
      const s = Math.round(sec);
      const hh = Math.floor(s / 3600);
      const mm = Math.floor((s % 3600) / 60);
      const ss = s % 60;
      return hh > 0
        ? hh + ":" + String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0")
        : mm + ":" + String(ss).padStart(2, "0");
    }

    // 配速偏好：内部一律存秒/公里，只在展示层换算；订阅让所有已挂载的页面跟着切换。
    const PACE_UNIT_KEY = "gc-pace-unit";
    let paceUnit = (function () {
      try { return window.localStorage.getItem(PACE_UNIT_KEY) === "mile" ? "mile" : "km"; } catch (e) { return "km"; }
    })();
    const paceSubs = new Set();
    function paceUnitLabel() { return paceUnit === "mile" ? "/mile" : "/km"; }
    function setPaceUnit(v) {
      paceUnit = v === "mile" ? "mile" : "km";
      try { window.localStorage.setItem(PACE_UNIT_KEY, paceUnit); } catch (e) { /* 存不了就只在本次生效 */ }
      paceSubs.forEach(function (f) { f(); });
    }
    function usePaceUnit() {
      const [, force] = useState(0);
      useEffect(function () {
        const f = function () { force(function (n) { return n + 1; }); };
        paceSubs.add(f);
        return function () { paceSubs.delete(f); };
      }, []);
      return paceUnit;
    }
    /** @param {number|null|undefined} secPerKm @returns {string} */
    function fmtPace(secPerKm) {
      if (typeof secPerKm !== "number" || !isFinite(secPerKm) || secPerKm <= 0) return "-";
      const v = secPerKm * (paceUnit === "mile" ? 1.609344 : 1);
      const m = Math.floor(v / 60);
      const s = Math.round(v % 60);
      return (s === 60 ? (m + 1) + "'00\"" : m + "'" + String(s).padStart(2, "0") + "\"") + paceUnitLabel();
    }
    /** 不带单位的配速文本，用于紧凑标签 */
    function paceText(secPerKm) { return fmtPace(secPerKm).replace(/\/km|\/mile/, ""); }

    /** 米/秒 → 配速 */
    function paceFromSpeed(mps) {
      return typeof mps === "number" && mps > 0 ? fmtPace(1000 / mps) : "-";
    }

    /** @param {any} v @param {number} [digits] @returns {string} */
    function num(v, digits) {
      if (typeof v !== "number" || !isFinite(v)) return "-";
      return digits ? v.toFixed(digits) : String(Math.round(v));
    }

    function shortTime(s) {
      return String(s || "").replace("T", " ").slice(0, 16);
    }

    function runKey(run) {
      return run && run.activity_id ? run.activity_id : run && run.start_time;
    }

    function isStrengthType(typeKey) {
      return String(typeKey || "").indexOf("strength") >= 0;
    }

    function isIndoor(typeKey, indoorTypes) {
      return (indoorTypes || DEFAULT_INDOOR).indexOf(typeKey || "") >= 0;
    }

    /** 列表行：有跑步机校正时用校正后的距离和配速 */
    function runView(r) {
      if (isStrengthType(r.type_key)) return { dist: 0, pace: 0, corrected: false, strength: true };
      const corrected = typeof r.corrected_distance_m === "number" && r.corrected_distance_m > 0;
      const dist = corrected ? r.corrected_distance_m : r.distance_m;
      const pace = corrected && r.duration_s ? r.duration_s / (dist / 1000) : r.pace_sec_per_km;
      return { dist: dist, pace: pace, corrected: corrected };
    }

    // ---------------------------------------------------------------------------
    // 外壳：错误边界、标题行
    // ---------------------------------------------------------------------------

    class ErrorBoundary extends Component {
      constructor(props) {
        super(props);
        this.state = { error: null };
      }
      static getDerivedStateFromError(error) {
        return { error };
      }
      componentDidCatch(error, info) {
        console.error("[pmw-plugin] 组件异常", PLUGIN_ID, error, info);
      }
      render() {
        if (this.state.error) {
          const message = String((this.state.error && this.state.error.message) || this.state.error);
          return h("div", { className: "pmw-plugin pmw-plugin-error", role: "alert" },
            h("strong", null, "插件界面出错了"), h("p", null, message));
        }
        return this.props.children;
      }
    }

    function guarded(Inner) {
      return function Guarded(props) {
        usePaceUnit(); // 单位切换时重渲染整棵子树
        return h(ThemeRoot, null, h(ErrorBoundary, null, h(Inner, props)));
      };
    }

    /**
     * 标题行：宿主有 ctx.ui 时放进顶栏（PageTitle + 宿主按钮），否则页面内画。
     * actions: [{ label, onClick, disabled, primary, title }]
     */
    function TitleBar(props) {
      const ui = CTX && CTX.ui;
      const actions = (props.actions || []).filter(Boolean);
      if (ui && ui.PageTitle && ui.Button) {
        return h(ui.PageTitle, {
          parent: props.parent,
          desc: props.desc,
          tabs: props.tabs,
          actions: actions.length
            ? h("span", { style: { display: "inline-flex", gap: "8px", alignItems: "center" } }, actions.map(function (a) {
                return h(ui.Button, {
                  key: a.label, size: "sm", variant: a.primary ? "primary" : "ghost",
                  disabled: a.disabled, title: a.title, onClick: a.onClick,
                }, a.label);
              }))
            : null,
        }, props.title);
      }
      return h("header", { className: "pmw-plugin-header gc-header" },
        h("div", null,
          h("h2", null, props.parent ? props.parent + " / " + props.title : props.title),
          props.desc ? h("p", { className: "pmw-plugin-hint" }, props.desc) : null),
        props.tabs || null,
        h("div", { className: "gc-detail-bar" }, actions.map(function (a) {
          return h("button", {
            key: a.label, className: "pmw-plugin-button", type: "button",
            disabled: a.disabled, title: a.title, onClick: a.onClick,
          }, a.label);
        })));
    }

    /** 分段按钮组（可能渲染进宿主顶栏、在插件样式作用域之外，所以用行内样式） */
    const SEG_WRAP = { display: "inline-flex", flexWrap: "wrap", maxWidth: "100%", alignSelf: "flex-start", gap: "2px", padding: "3px", borderRadius: "8px", background: "var(--gc-seg-bg, var(--hover, rgba(127,127,127,0.12)))" };
    function segBtn(on) {
      return {
        flex: "0 0 auto", whiteSpace: "nowrap",
        padding: "3px 12px", border: 0, borderRadius: "6px",
        background: on ? "var(--gc-seg-on, var(--panel, #fff))" : "transparent", color: on ? "inherit" : "var(--gc-muted, var(--muted, inherit))", font: "inherit",
        fontSize: "13px", fontWeight: on ? 600 : 400, cursor: "pointer", opacity: on ? 1 : 0.8,
        boxShadow: on ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
      };
    }

    function Seg(props) {
      return h("div", { style: SEG_WRAP, role: "radiogroup", "aria-label": props.label },
        props.options.map(function (o) {
          return h("button", {
            key: o[0], type: "button", role: "radio", "aria-checked": props.value === o[0],
            style: segBtn(props.value === o[0]),
            onClick: function () { props.onChange(o[0]); },
          }, o[1]);
        }));
    }

    // ---------------------------------------------------------------------------
    // 模块页：记录 / 统计
    // ---------------------------------------------------------------------------

    function ModulePage() {
      const theme = useTheme();
      const [view, setView] = useState("runs");
      const [runs, setRuns] = useState([]);
      const [indoorTypes, setIndoorTypes] = useState(DEFAULT_INDOOR);
      const [hint, setHint] = useState("正在加载跑步记录…");
      const [open, setOpen] = useState(null);
      const [full, setFull] = useState(null);
      const [statsKey, setStatsKey] = useState(0);
      const [status, setStatus] = useState(null);
      const [calFocus, setCalFocus] = useState("");

      async function load() {
        try {
          const data = await api("/runs");
          const list = Array.isArray(data.runs) ? data.runs : [];
          setRuns(list);
          if (Array.isArray(data.indoor_types)) setIndoorTypes(data.indoor_types);
          setHint(list.length ? "" : "还没有跑步记录：先在「账号与同步」里登录 Garmin，再点「同步全部历史」。");
        } catch (err) {
          setHint("读取失败：" + errText(err));
        }
      }

      function refreshStatus() {
        return api("/status").then(function (st) {
          setStatus(st);
          if (st.full_sync && st.full_sync.running) setFull(st.full_sync);
          return st;
        }).catch(function () { return null; });
      }

      // 状态每分钟刷新一次：后台每 6 小时同步，失败不能只藏在小字里
      useEffect(function () {
        load();
        refreshStatus();
        const t = setInterval(refreshStatus, 60000);
        return function () { clearInterval(t); };
      }, []);

      // 全部历史同步在后台跑：每 2 秒看一次进度，结束后刷新列表和统计
      useEffect(function () {
        if (!full || !full.running) return undefined;
        const t = setInterval(function () {
          api("/status").then(function (st) {
            const f = st.full_sync || null;
            setFull(f);
            if (f && !f.running) {
              setHint(f.error ? "全部历史同步出错：" + f.error : "全部历史同步完成，共写入 " + f.written + " 条跑步记录。");
              load();
              setStatsKey(function (k) { return k + 1; });
            }
          }).catch(function () {});
        }, 2000);
        return function () { clearInterval(t); };
      }, [full && full.running]);

      if (open) {
        return h(RunDetail, {
          id: open.activity_id, title: open.activity_name, start: open.start_time,
          onBack: function () { setOpen(null); load(); setStatsKey(function (k) { return k + 1; }); },
        });
      }

      const fullRunning = Boolean(full && full.running);
      // 窄屏顶栏放不下切换标签，挪回页面里
      const narrow = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
      // PMW 版「比赛」是这里的一个视图；dsh 版在外层页签里，不重复放
      const viewOpts = [["runs", "记录"], ["recovery", "体能"], ["stats", "统计"], ["calendar", "日历"], ["plans", "计划"], ["videos", "视频"]];
      if (THEME_HOST !== "dsh") viewOpts.push(["races", "比赛"]);
      const viewSeg = h(Seg, { label: "视图", value: view, onChange: setView, options: viewOpts });
      // 比赛视图有自己的标题栏操作（添加比赛）和详情页，整页交给它，视图切换放进它的标题栏
      if (view === "races" && THEME_HOST !== "dsh") {
        return h(RacesPage, { embedded: true, tabs: narrow ? null : viewSeg, belowTitle: narrow ? viewSeg : null });
      }
      const total = runs.reduce(function (sum, r) { return sum + (runView(r).dist || 0); }, 0);
      const progress = fullRunning
        ? "正在同步全部历史：已翻 " + (full.pages || 0) + " 页，写入 " + (full.written || 0) + " 条…"
        : "";

      return h("div", { className: "pmw-plugin pmw-plugin-module" },
        h(TitleBar, {
          title: PLUGIN_NAME,
          desc: "最近 " + runs.length + " 次，累计 " + fmtDistance(total),
          tabs: narrow ? null : viewSeg,
          // 两端统一：同步按钮只在设置页 / 「账号与同步」里，标题栏不再重复
          actions: [themeAction(theme)],
        }),
        narrow ? viewSeg : null,
        h(SyncStatus, { status: status, progress: progress }),
        hint ? h("p", { className: "pmw-plugin-hint" }, hint) : null,
        view === "recovery"
          ? h(RecoveryView)
          : view === "stats"
          ? h(StatsView, { key: statsKey })
          : view === "calendar"
          ? h(CalendarView, { key: "cal-" + calFocus, focus: calFocus, onOpen: setOpen })
          : view === "plans"
          ? h(PlansView, { onApplied: function (d) { setCalFocus(d); setView("calendar"); } })
          : view === "videos"
          ? h(VideosView)
          : h(RunList, { runs: runs, indoorTypes: indoorTypes, onOpen: setOpen }));
    }

    const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

    function parseLocal(s) {
      const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s || ""));
      return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
    }


    // ---------------------------------------------------------------------------
    // 数据中心风格组件：白卡面板、分段切换、指标块、环形图、堆叠柱、横向占比条
    // ---------------------------------------------------------------------------

    /** 白卡面板：标题行（左标题、右操作），下面放内容 */
    function KPanel(props) {
      return h("section", { className: "gc-kpanel" + (props.className ? " " + props.className : "") },
        props.title || props.extra
          ? h("div", { className: "gc-kpanel-head" },
              props.title ? h("h3", { className: "gc-kpanel-title" }, props.title) : h("span"),
              props.extra || null)
          : null,
        props.children);
    }

    /** 分区标题：灰色大字，右侧可放切换 */
    function KSection(props) {
      return h("div", { className: "gc-ksection" }, h("h2", null, props.title), props.extra || null);
    }

    /** 指标块：数字大、单位小；选中的块顶部一条深色粗线。cols 固定列数，避免 4 个块排成 3+1 */
    function KTiles(props) {
      const cls = "gc-ktiles" + (props.small ? " gc-ktiles-sm" : "") + (props.cols ? " gc-ktiles-" + props.cols : "");
      return h("div", { className: cls }, props.items.map(function (t, i) {
        const on = props.active === (t.key != null ? t.key : i);
        const attrs = {
          key: t.key != null ? t.key : t.label, className: "gc-ktile" + (on ? " on" : "") + (props.onPick ? " gc-ktile-btn" : ""),
        };
        if (props.onPick) {
          attrs.type = "button";
          attrs["aria-pressed"] = on;
          attrs.onClick = function () { props.onPick(t.key != null ? t.key : i); };
        }
        return h(props.onPick ? "button" : "div", attrs,
          h("span", { className: "gc-ktile-label" }, t.label),
          h("span", { className: "gc-ktile-value" }, t.value, t.unit ? h("small", null, t.unit) : null));
      }));
    }

    /** "10.02 km" → ["10.02", "km"]；配速 5'30"/km → ["5'30\"", "/km"] */
    function splitUnit(text) {
      const m = /^(.*?)\s*(km\/h|\/km|\/mile|km|bpm|kcal|kg|步\/分|次|组|°C|%|m)$/.exec(String(text || ""));
      return m && m[1] ? [m[1], m[2]] : [String(text == null ? "-" : text), ""];
    }

    // 活动分类：室外跑 / 室内跑 / 力量 / 其他
    const KCATS = [["out", "室外跑"], ["in", "室内跑"], ["str", "力量"], ["oth", "其他"]];
    function actCat(r, indoorTypes) {
      if (isStrengthType(r.type_key)) return "str";
      if (isIndoor(r.type_key, indoorTypes)) return "in";
      return /run/.test(String(r.type_key || "")) || !r.type_key ? "out" : "oth";
    }

    /** 环形图：parts = [{ key, label, value }] */
    function Donut(props) {
      const total = props.parts.reduce(function (t, p) { return t + p.value; }, 0);
      const r = 52;
      const c = 2 * Math.PI * r;
      let acc = 0;
      return h("div", { className: "gc-donut" },
        h("svg", { viewBox: "0 0 140 140", className: "gc-donut-svg", role: "img", "aria-label": props.label },
          h("circle", { cx: 70, cy: 70, r: r, className: "gc-donut-track" }),
          total > 0 ? props.parts.filter(function (p) { return p.value > 0; }).map(function (p) {
            const len = (p.value / total) * c;
            // 段与段之间留 1.5 的缝
            const gap = props.parts.filter(function (x) { return x.value > 0; }).length > 1 ? Math.min(1.5, len / 2) : 0;
            const el = h("circle", {
              key: p.key, cx: 70, cy: 70, r: r, className: "gc-donut-seg gc-c-" + p.key,
              strokeDasharray: (len - gap) + " " + (c - len + gap), strokeDashoffset: -acc,
              transform: "rotate(-90 70 70)",
            }, h("title", null, p.label + " " + p.text));
            acc += len;
            return el;
          }) : null,
          h("text", { x: 70, y: 66, className: "gc-donut-num", textAnchor: "middle" }, props.center),
          h("text", { x: 70, y: 86, className: "gc-donut-cap", textAnchor: "middle" }, props.caption)),
        h("ul", { className: "gc-donut-legend" }, props.parts.map(function (p) {
          return h("li", { key: p.key, className: p.value > 0 ? "" : "gc-dim" },
            h("i", { className: "gc-swatch gc-c-" + p.key }),
            h("span", null, p.label),
            h("b", null, p.text),
            h("em", null, total > 0 ? Math.round((p.value / total) * 100) + "%" : "-"));
        })));
    }

    function niceMax(v) {
      if (!(v > 0)) return 1;
      const p = Math.pow(10, Math.floor(Math.log10(v)));
      const f = v / p;
      return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 4 ? 4 : f <= 5 ? 5 : 10) * p;
    }

    /** 堆叠柱：buckets = [{ key, label, parts: { out, in, str, oth } }] */
    function StackBars(props) {
      const [ref, cw] = useChartWidth(380);
      const W = Math.max(240, cw), H = 220, L = 30, R = 8, T = 22, B = 24;
      const keys = props.cats;
      const totals = props.buckets.map(function (b) { return keys.reduce(function (t, k) { return t + (b.parts[k] || 0); }, 0); });
      const max = niceMax(Math.max.apply(null, totals.concat([0])) * props.scale);
      const n = props.buckets.length || 1;
      const step = (W - L - R) / n;
      const bw = Math.max(2, Math.min(16, step * 0.62));
      const sy = function (v) { return T + (H - T - B) * (1 - (v * props.scale) / max); };
      const ticks = [0, 0.25, 0.5, 0.75, 1].map(function (f) { return max * f; });
      // 刻度标签：均匀取样，末尾一定带上，且和上一个挤在一起时替换掉它
      // 标签间距按像素兜底：图越窄取样越稀，避免「11/21 11/25」叠在一起
      const every = Math.max(1, Math.ceil(n / 6), Math.ceil(44 / step));
      const labelAt = [];
      for (let k = 0; k < n; k++) if (k % every === 0) labelAt.push(k);
      if (labelAt[labelAt.length - 1] !== n - 1) {
        if (labelAt.length && (n - 1 - labelAt[labelAt.length - 1]) * step < 48) labelAt.pop();
        labelAt.push(n - 1);
      }
      return h("svg", { ref: ref, viewBox: "0 0 " + W + " " + H, className: "gc-kbars", role: "img", "aria-label": props.label,
        style: { height: H + "px" } },
        h("text", { x: 4, y: 12, className: "gc-kaxis" }, props.unit),
        ticks.map(function (t, i) {
          const y = T + (H - T - B) * (1 - t / max);
          return h("g", { key: i },
            h("line", { x1: L, x2: W - R, y1: y, y2: y, className: "gc-kgrid-line" + (i === 0 ? " base" : "") }),
            h("text", { x: L - 6, y: y + 4, className: "gc-kaxis", textAnchor: "end" }, String(Math.round(t * 10) / 10)));
        }),
        props.buckets.map(function (b, i) {
          const x = L + step * i + (step - bw) / 2;
          let base = 0;
          const tip = b.label + "：" + props.fmt(totals[i]) +
            keys.filter(function (k) { return b.parts[k]; }).map(function (k) { return "\n" + props.names[k] + " " + props.fmt(b.parts[k]); }).join("");
          return h("g", { key: b.key },
            h("title", null, tip),
            // 整列透明命中区，悬停更容易
            h("rect", { x: L + step * i, y: T, width: step, height: H - T - B, className: "gc-kbar-hit" }),
            keys.map(function (k) {
              const v = b.parts[k] || 0;
              if (!v) return null;
              const y1 = sy(base + v), y0 = sy(base);
              base += v;
              return h("rect", { key: k, x: x, y: y1, width: bw, height: Math.max(1, y0 - y1), className: "gc-kbar gc-c-" + k });
            }),
            labelAt.indexOf(i) < 0
              ? null
              : h("text", {
                  x: i === 0 ? L : i === n - 1 ? W - R : x + bw / 2, y: H - 6, className: "gc-kaxis",
                  textAnchor: i === 0 ? "start" : i === n - 1 ? "end" : "middle",
                }, b.label));
        }));
    }

    /** 横向占比条：rows = [{ label, value, text }] */
    function HBars(props) {
      const total = props.rows.reduce(function (t, r) { return t + r.value; }, 0);
      const max = Math.max.apply(null, props.rows.map(function (r) { return r.value; }).concat([0]));
      return h("div", { className: "gc-hbars" }, props.rows.map(function (r) {
        return h("div", { className: "gc-hbar", key: r.label },
          h("span", { className: "gc-hbar-label" }, r.label),
          h("span", { className: "gc-hbar-track" }, h("i", { style: { width: (max > 0 ? (r.value / max) * 100 : 0) + "%" } })),
          h("span", { className: "gc-hbar-num" }, r.text),
          h("span", { className: "gc-hbar-pct" }, total > 0 ? Math.round((r.value / total) * 100) + "%" : "-"));
      }));
    }

    // ---- 记录页概览 ----

    const KRANGES = [["week", "本周"], ["month", "本月"], ["7d", "近 7 日"], ["30d", "近 30 日"], ["half", "近半年"], ["year", "近 1 年"]];
    const KMETRICS = [["n", "跑步次数"], ["str", "力量次数"], ["dur", "时长"], ["dist", "距离"]];
    const DAYPARTS = [[0, 5, "凌晨"], [5, 8, "晨练"], [8, 11, "上午"], [11, 14, "午间"], [14, 17, "下午"], [17, 19, "傍晚"], [19, 24, "晚上"]];
    const PREF_TABS = [["time", "时段"], ["week", "星期"]];

    function dayStart(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
    function mondayOf(d) { const x = dayStart(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }

    /** 区间起点和柱子分桶：本周 / 本月 / 近 7 / 近 30 日按天，近半年按周，近 1 年按月 */
    function rangeBuckets(range) {
      const today = dayStart(new Date());
      const out = [];
      if (range === "week" || range === "month") {
        const start = range === "week" ? mondayOf(today) : new Date(today.getFullYear(), today.getMonth(), 1);
        for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
          out.push({ key: ymd(d), label: (d.getMonth() + 1) + "/" + d.getDate(), start: new Date(d) });
        }
      } else if (range === "7d" || range === "30d") {
        const n = range === "7d" ? 7 : 30;
        for (let i = n - 1; i >= 0; i--) {
          const d = new Date(today); d.setDate(d.getDate() - i);
          out.push({ key: ymd(d), label: (d.getMonth() + 1) + "/" + d.getDate(), start: d });
        }
      } else if (range === "half") {
        const mon = mondayOf(today);
        for (let i = 25; i >= 0; i--) {
          const d = new Date(mon); d.setDate(d.getDate() - i * 7);
          out.push({ key: ymd(d), label: (d.getMonth() + 1) + "/" + d.getDate(), start: d });
        }
      } else {
        for (let i = 11; i >= 0; i--) {
          const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
          out.push({ key: d.getFullYear() + "-" + pad2(d.getMonth() + 1), label: (d.getMonth() + 1) + "月", start: d });
        }
      }
      return out;
    }

    function bucketOf(range, d) {
      if (range === "half") return ymd(mondayOf(d));
      if (range === "year") return d.getFullYear() + "-" + pad2(d.getMonth() + 1);
      return ymd(d);
    }

    function runMetric(metric, r) {
      const strength = isStrengthType(r.type_key);
      if (metric === "n") return strength ? 0 : 1;
      if (metric === "str") return strength ? 1 : 0;
      if (metric === "dur") return Number(r.duration_s) || 0;
      return strength ? 0 : (runView(r).dist || 0);
    }

    function metricFmt(metric, v) {
      if (metric === "n" || metric === "str") return Math.round(v) + " 次";
      if (metric === "dur") return fmtDuration(v);
      return num(v / 1000, 1) + " km";
    }

    function Overview(props) {
      const prefs = useStatsPrefs();
      const [range, setRange] = useState("30d");
      const [tile, setTile] = useState("n");
      const [trend, setTrend] = useState("n");
      const [pref, setPref] = useState("time");
      const [all, setAll] = useState(null);
      const [err, setErr] = useState("");

      // 一次取近 1 年（最长区间）的全部记录，切换区间只在前端过滤
      useEffect(function () {
        let alive = true;
        const first = rangeBuckets("year")[0].start;
        api("/runs?from=" + ymd(first)).then(function (d) {
          if (alive) { setAll(Array.isArray(d.runs) ? d.runs : []); setErr(""); }
        }).catch(function (e) { if (alive) setErr(errText(e)); });
        return function () { alive = false; };
      }, [props.version]);

      const buckets = rangeBuckets(range);
      const from = buckets[0].start;
      const runs = (all || []).map(function (r) { return { r: r, d: parseLocal(r.start_time) }; })
        .filter(function (x) { return x.d && x.d >= from && statEligible(x.r, prefs); });
      const cats = KCATS.map(function (c) { return c[0]; });
      const names = {};
      KCATS.forEach(function (c) { names[c[0]] = c[1]; });
      const present = cats.filter(function (k) { return k !== "oth" || runs.some(function (x) { return actCat(x.r, props.indoorTypes) === "oth"; }); });

      const sum = function (metric, pick) {
        return runs.reduce(function (t, x) { return t + (!pick || pick(x) ? runMetric(metric, x.r) : 0); }, 0);
      };
      const runN = sum("n"), strN = sum("str");
      const tiles = [
        { key: "n", label: "跑步次数", value: String(runN), unit: "次" },
        { key: "str", label: "力量次数", value: String(strN), unit: "次" },
        // 大数字要放得下：跑量过百公里不带小数，总时长用小时
        { key: "dist", label: "跑量", value: num(sum("dist") / 1000, sum("dist") >= 100000 ? 0 : 1), unit: "km" },
        { key: "dur", label: "总时长", value: num(sum("dur") / 3600, 1), unit: "h" },
      ];
      const parts = present.map(function (k) {
        const v = sum(tile, function (x) { return actCat(x.r, props.indoorTypes) === k; });
        return { key: k, label: names[k], value: v, text: metricFmt(tile, v).replace(" ", "") };
      });
      const tileTotal = sum(tile);
      const center = tile === "dur" ? num(tileTotal / 3600, 1) : tile === "dist" ? num(tileTotal / 1000, 1) : String(Math.round(tileTotal));
      const caption = tile === "dur" ? "小时" : tile === "dist" ? "公里" : "次";

      const byKey = {};
      const bars = buckets.map(function (b) { const x = { key: b.key, label: b.label, parts: {} }; byKey[b.key] = x; return x; });
      runs.forEach(function (x) {
        const b = byKey[bucketOf(range, x.d)];
        if (!b) return;
        const k = actCat(x.r, props.indoorTypes);
        b.parts[k] = (b.parts[k] || 0) + runMetric(trend, x.r);
      });
      const maxBar = Math.max.apply(null, bars.map(function (b) { return cats.reduce(function (t, k) { return t + (b.parts[k] || 0); }, 0); }).concat([0]));
      const durHours = maxBar >= 3 * 3600;
      const scale = trend === "dur" ? (durHours ? 1 / 3600 : 1 / 60) : trend === "dist" ? 1 / 1000 : 1;
      const unitText = trend === "dur" ? (durHours ? "小时" : "分钟") : trend === "dist" ? "km" : "次";

      let prefRows;
      if (pref === "time") {
        prefRows = DAYPARTS.map(function (p) {
          const n = runs.filter(function (x) { const hr = x.d.getHours(); return hr >= p[0] && hr < p[1]; }).length;
          return { label: p[2], value: n, text: n + "次" };
        });
      } else {
        prefRows = [1, 2, 3, 4, 5, 6, 0].map(function (wd) {
          const n = runs.filter(function (x) { return x.d.getDay() === wd; }).length;
          return { label: WEEKDAYS[wd], value: n, text: n + "次" };
        });
      }

      const empty = all && !runs.length ? h("p", { className: "pmw-plugin-hint gc-kempty" }, "这段时间没有运动记录") : null;
      const loading = !all ? h("p", { className: "pmw-plugin-hint gc-kempty" }, err ? "读取失败：" + err : "正在统计…") : null;

      return h("div", { className: "gc-overview" },
        h(KSection, { title: "运动概览", extra: h(KSeg, { label: "时间范围", value: range, onChange: setRange, options: KRANGES }) }),
        h("div", { className: "gc-kgrid" },
          h(KPanel, { title: "运动总览" },
            h(KTiles, { items: tiles, active: tile, onPick: setTile, cols: 4 }),
            loading || empty || h(Donut, { parts: parts, center: center, caption: caption, label: "按类型分布" })),
          h(KPanel, { title: "趋势分布", extra: h(KSeg, { label: "趋势指标", value: trend, onChange: setTrend, options: KMETRICS }) },
            loading || h("div", { className: "gc-ktrend" },
              h(StackBars, { buckets: bars, cats: present, names: names, scale: scale, unit: unitText, label: "趋势分布",
                fmt: function (v) { return metricFmt(trend, v); } }),
              h("div", { className: "gc-legend gc-klegend" }, present.map(function (k) {
                return h("span", { key: k }, h("i", { className: "gc-swatch gc-c-" + k }), names[k]);
              })))),
          h(KPanel, { title: "运动偏好", extra: h(KSeg, { label: "偏好维度", value: pref, onChange: setPref, options: PREF_TABS }) },
            loading || empty || h(HBars, { rows: prefRows }))));
    }

    /** 面板里的小号分段切换（插件样式作用域内，用 class） */
    function KSeg(props) {
      return h("div", { className: "gc-kseg", role: "radiogroup", "aria-label": props.label },
        props.options.map(function (o) {
          return h("button", {
            key: o[0], type: "button", role: "radio", "aria-checked": props.value === o[0],
            className: props.value === o[0] ? "on" : "", onClick: function () { props.onChange(o[0]); },
          }, o[1]);
        }));
    }

    // ---------------------------------------------------------------------------
    // 恢复 / 体能趋势（0.10.0）：跨天的训练负荷、训练效果、身体电量、恢复/静息心率、跑量。
    // 数据来自 /recovery；缺失指标为 null，图表按 null 断线，不把「没数据」画成 0。
    // ---------------------------------------------------------------------------

    const REC_METRICS = [
      ["load", "训练负荷"], ["effect", "训练效果"], ["body_battery", "身体电量"],
      ["recovery_hr", "恢复心率"], ["resting_hr", "静息心率"], ["stamina", "体能储备"],
    ];
    const REC_LEVEL = {
      good: { cls: "good", dot: "#2ea36b" },
      moderate: { cls: "moderate", dot: "#d99125" },
      low: { cls: "low", dot: "#d6484f" },
      unknown: { cls: "unknown", dot: "#9aa0aa" },
    };

    function recNum(v) { return typeof v === "number" && isFinite(v); }

    /** 恢复趋势折线 / 柱状混合图：有 load 画柱，其余画折线；高强度日用竖标记，缺失断线。 */
    function RecoveryChart(props) {
      const [ref, cw] = useChartWidth(620);
      const W = Math.max(280, cw), H = 240, L = 36, R = 12, T = 20, B = 40;
      const metric = props.metric;
      const days = props.days || [];
      const vals = days.map(function (d) { return d[metric]; });
      const present = vals.filter(recNum);
      let max = 1, min = 0;
      if (present.length) {
        max = Math.max.apply(null, present);
        min = Math.min.apply(null, present);
        if (metric === "body_battery") {
          max = Math.max(max, 0); min = Math.min(min, 0);
        } else if (max === min) {
          min = Math.max(0, min - 1); max = max + 1;
        } else {
          min = Math.max(0, min - (max - min) * 0.15);
        }
      }
      const span = max - min || 1;
      const n = days.length || 1;
      const step = (W - L - R) / n;
      const bw = Math.max(2, Math.min(14, step * 0.6));
      const x = function (i) { return L + step * i + step / 2; };
      const y = function (v) { return T + (H - T - B) * (1 - (v - min) / span); };
      const ticks = [0, 0.5, 1].map(function (f) { return min + span * f; });
      // 日期标签：间距按像素兜底，图越窄取样越稀
      const every = Math.max(1, Math.ceil(n / 8), Math.ceil(56 / step));
      // 依次取样，末尾一定带上，和上一个挤在一起时替换掉它
      const labelAt = [];
      for (let k = 0; k < n; k++) if (k % every === 0) labelAt.push(k);
      if (labelAt[labelAt.length - 1] !== n - 1) {
        if (labelAt.length && (n - 1 - labelAt[labelAt.length - 1]) * step < 48) labelAt.pop();
        labelAt.push(n - 1);
      }
      const unit = metric === "load" ? "" : "";
      const fmt = function (v) { return num(v, metric === "effect" || metric === "body_battery" ? 1 : 0); };

      // 折线：按连续段分组，null 断开
      const segments = [];
      let seg = [];
      vals.forEach(function (v, i) {
        if (recNum(v)) seg.push(i);
        else if (seg.length) { segments.push(seg); seg = []; }
      });
      if (seg.length) segments.push(seg);

      return h("svg", { ref: ref, viewBox: "0 0 " + W + " " + H, className: "gc-rec-chart", role: "img", "aria-label": props.label,
        style: { height: H + "px" } },
        ticks.map(function (t, i) {
          const yy = y(t);
          return h("g", { key: i },
            h("line", { x1: L, x2: W - R, y1: yy, y2: yy, className: "gc-kgrid-line" + (i === 0 ? " base" : "") }),
            h("text", { x: L - 5, y: yy + 4, className: "gc-kaxis", textAnchor: "end" }, fmt(t)));
        }),
        // 周分隔与日期标签
        days.map(function (d, i) {
          const dow = parseLocal(d.date + " 00:00");
          const isMon = dow && dow.getDay() === 1;
          // 首尾标签贴住绘图区两端，避免被裁
          const edge = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
          return h("g", { key: d.date },
            isMon ? h("line", { x1: x(i) - step / 2, x2: x(i) - step / 2, y1: T, y2: H - B, className: "gc-rec-week" }) : null,
            labelAt.indexOf(i) >= 0
              ? h("text", {
                  x: i === 0 ? L : i === n - 1 ? W - R : x(i), y: H - 20, className: "gc-kaxis", textAnchor: edge,
                }, d.date.slice(5).replace("-", "/"))
              : null,
            d.High ? h("circle", { cx: x(i), cy: T + 3, r: 3, className: "gc-rec-high" }) : null,
            h("title", null, d.date + (recNum(vals[i]) ? "：" + fmt(vals[i]) + unit : "：无数据") + (d.High ? "（高强度）" : "")));
        }),
        metric === "load"
          ? days.map(function (d, i) {
              return recNum(vals[i])
                ? h("rect", { key: d.date, x: x(i) - bw / 2, y: y(vals[i]), width: bw,
                    height: Math.max(1, y(min) - y(vals[i])), className: "gc-rec-bar" + (d.High ? " high" : "") })
                : null;
            })
          : segments.map(function (seg, si) {
              return h("polyline", { key: si, className: "gc-rec-line",
                points: seg.map(function (i) { return x(i) + "," + y(vals[i]); }).join(" ") });
            }).concat(segments.map(function (seg, si) {
              return seg.map(function (i) {
                return h("circle", { key: si + "-" + i, cx: x(i), cy: y(vals[i]), r: 2.5,
                  className: "gc-rec-dot" + (days[i].High ? " high" : "") });
              });
            })));
    }

    /** 训练效果评估：同心率区间下配速趋势（斜率负=越跑越快）+ 每周强度分布 */
    function EffectPanel(props) {
      const d = props.data;
      if (!d) return null;
      const points = d.points || [];
      const weeks = d.weeks || [];
      const trends = d.trends || {};
      const bands = [["1", "Z1 恢复", "#9ca3af"], ["2", "Z2 有氧", "#3b82f6"], ["3", "Z3 阈值", "#f59e0b"], ["4", "Z4 无氧", "#ef4444"], ["5", "Z5 极限", "#7c3aed"]];
      const zoneRows = bands.map(function (b) {
        const t = trends[b[0]] || {};
        const n = t.count || 0;
        const slope = Number(t.slope) || 0;
        const improved = n >= 3 && slope < -0.05;
        const worse = n >= 3 && slope > 0.05;
        return h("div", { key: b[0], className: "gc-eff-row" },
          h("span", { className: "gc-eff-zone", style: { color: b[2] } }, b[1]),
          h("span", { className: "gc-eff-dim" }, n ? n + " 次 · 首次 " + fmtPace(t.pace_first) + " → 最近 " + fmtPace(t.pace_last) : "暂无数据"),
          n >= 3 ? h("span", { className: "gc-eff-tag" + (improved ? " good" : worse ? " bad" : "") },
            improved ? "同区间变快" : worse ? "同区间变慢" : "基本持平") : null);
      });
      const recentWeeks = weeks.slice(-8);
      return h(KPanel, { className: "gc-effect" },
        h("h3", { className: "gc-sub" }, "训练效果评估"),
        d.hr_source && !d.hr_source.calibrated
          ? h("p", { className: "pmw-plugin-hint" }, "未校准心率区间，按 Garmin 均心率粗分；在设置里校准后更准。")
          : null,
        h("div", { className: "gc-eff-zones" }, zoneRows),
        h("h4", { className: "gc-sub" }, "每周强度分布（次数）"),
        recentWeeks.length
          ? h("div", { className: "gc-eff-weeks" }, recentWeeks.map(function (w) {
              const total = bands.reduce(function (s, b) { return s + (w.zones[b[0]] || 0); }, 0) || 1;
              return h("div", { key: w.week, className: "gc-eff-week" },
                h("small", null, w.week.slice(5) + " · " + num(w.km, 1) + " km"),
                h("div", { className: "gc-eff-bar" }, bands.map(function (b) {
                  const n = w.zones[b[0]] || 0;
                  return n ? h("i", { key: b[0], style: { width: (n / total * 100) + "%", background: b[2] }, title: b[1] + " " + n + " 次" }) : null;
                })));
            }))
          : h("p", { className: "pmw-plugin-hint" }, "这段时间没有带心率的训练记录。"),
        h("p", { className: "pmw-plugin-hint" }, "同区间配速下降表示同样心率下跑得更快（有氧进步）；每周条带是各心率区间的训练次数占比。"));
    }

    /** 主观状态录入：睡眠/质量/疲劳/酸痛/状态，0～5 分（0=未填），存当天，影响恢复结论 */
    function WellbeingCard() {
      const today = toYMD(new Date());
      const [day, setDay] = useState(today);
      const [val, setVal] = useState({ sleep_h: 0, sleep_quality: 0, fatigue: 0, soreness: 0, mood: 0, note: "" });
      const [msg, setMsg] = useState("");
      const [busy, setBusy] = useState(false);
      useEffect(function () {
        api("/wellbeing?from=" + day + "&to=" + day).then(function (d) {
          const x = (d.days || [])[0];
          if (x) setVal(Object.assign({}, val, x));
        }).catch(function () {});
      }, [day]);
      const set = function (k, v) { setVal(Object.assign({}, val, { [k]: v })); };
      const scale = function (k, label) {
        return h("div", { className: "gc-field" }, label,
          h("div", { className: "gc-inline" }, [1, 2, 3, 4, 5].map(function (n) {
            return h("button", { key: n, type: "button", className: "gc-chip" + (Number(val[k]) === n ? " on" : ""),
              "aria-label": label + " " + n + " 分", onClick: function () { set(k, Number(val[k]) === n ? 0 : n); } }, String(n));
          })));
      };
      async function save(e) {
        e.preventDefault(); setBusy(true); setMsg("");
        try { await api("/wellbeing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({}, val, { day: day })) }); setMsg("已保存，恢复结论已按主观状态修正。"); }
        catch (err) { setMsg("保存失败：" + errText(err)); } finally { setBusy(false); }
      }
      async function remove() {
        try { await api("/wellbeing/" + day, { method: "DELETE" }); setVal({ sleep_h: 0, sleep_quality: 0, fatigue: 0, soreness: 0, mood: 0, note: "" }); setMsg("已删除这天的记录。"); }
        catch (err) { setMsg("删除失败：" + errText(err)); }
      }
      return h("form", { className: "gc-chart-box gc-wellbeing", onSubmit: save, "aria-label": "主观状态" },
        h("div", { className: "gc-section-head" },
          h("h3", { className: "gc-sub" }, "今日主观状态"),
          h("input", { type: "date", value: day, "aria-label": "记录日期", onChange: function (e) { setDay(e.target.value); } })),
        h("div", { className: "gc-controls" },
          h("label", { className: "gc-field" }, "睡眠时长（小时）", h("input", { type: "number", min: "0", max: "24", step: "0.5", value: val.sleep_h || "", placeholder: "如：7.5", onChange: function (e) { set("sleep_h", Number(e.target.value) || 0); } })),
          scale("sleep_quality", "睡眠质量"), scale("fatigue", "疲劳感（高=累）")),
        h("div", { className: "gc-controls" }, scale("soreness", "肌肉酸痛（高=酸）"), scale("mood", "整体状态（高=好）")),
        h("label", { className: "gc-field" }, "备注", h("input", { value: val.note || "", maxLength: 500, placeholder: "睡眠、身体感受…", onChange: function (e) { set("note", e.target.value); } })),
        h("p", { className: "pmw-plugin-hint" }, "5 分制：睡眠质量/整体状态分数越高越好，疲劳/酸痛分数越高越差；0 表示未填。睡眠少于 6.5 小时或疲劳、酸痛达 4 分以上会在恢复结论里提示别上强度。"),
        h("div", { className: "gc-detail-bar" },
          h("button", { className: "pmw-plugin-button gc-primary", type: "submit", disabled: busy }, busy ? "保存中…" : "保存状态"),
          h("button", { className: "pmw-plugin-button", type: "button", onClick: remove }, "删除这天")),
        msg ? h("p", { className: "pmw-plugin-hint", role: "status" }, msg) : null);
    }

    function RecoveryView() {
      const [range, setRange] = useState("28");
      const [metric, setMetric] = useState("load");
      const [data, setData] = useState(null);
      const [err, setErr] = useState("");
      const [busy, setBusy] = useState(false);
      const [alerts, setAlerts] = useState([]);
      const [effect, setEffect] = useState(null);

      async function load() {
        try {
          setData(await api("/recovery?days=" + range));
          setErr("");
        } catch (e) { setErr(errText(e)); }
        api("/alerts").then(function (d) { setAlerts(d.alerts || []); }).catch(function () {});
        api("/effect?days=" + range).then(function (d) { setEffect(d); }).catch(function () {});
      }
      useEffect(function () { load(); }, [range]);

      const backfill = data && data.backfill || {};
      // 回填中：每 1.5 秒刷新一次进度，结束后拉一次数据
      useEffect(function () {
        if (!backfill.running) return undefined;
        const t = setInterval(function () {
          api("/recovery?days=" + range).then(function (d) {
            setData(d);
            if (!d.backfill || !d.backfill.running) load();
          }).catch(function () {});
        }, 1500);
        return function () { clearInterval(t); };
      }, [backfill.running, range]);

      async function backfillNow() {
        setBusy(true);
        try { await api("/recovery/backfill", { method: "POST" }); await load(); }
        catch (e) { setErr(errText(e)); }
        finally { setBusy(false); }
      }

      const sum = data && data.summary || {};
      const st = sum.status || {};
      const tone = REC_LEVEL[st.level] || REC_LEVEL.unknown;
      const days = data && Array.isArray(data.days) ? data.days : [];
      const active = days.filter(function (d) { return d.load != null || d.effect != null || d.distance_m > 0; });

      const recPanels = [
        alerts.length ? h(KPanel, { className: "gc-alert-panel" },
          h("h3", { className: "gc-sub" }, "训练预警"),
          alerts.map(function (a) {
            return h("div", { key: a.kind + a.day, className: "gc-alert-row" },
              h("p", { className: "gc-alert gc-alert-" + a.level },
                h("strong", null, a.title + "："), a.reason, h("small", null, " · " + a.day)),
              h("button", { className: "gc-link", type: "button", onClick: async function () {
                try { await api("/alerts/" + encodeURIComponent(a.kind), { method: "DELETE" }); setAlerts(function (x) { return x.filter(function (y) { return y.kind !== a.kind; }); }); } catch (e) {}
              } }, "忽略"));
          })) : null,
        h(EffectPanel, { data: effect }),
        h(WellbeingCard),
        h(KPanel, { className: "gc-rec-status gc-rec-" + tone.cls },
          h("div", { className: "gc-rec-status-head" },
            h("span", { className: "gc-rec-status-badge" }, h("i", { style: { background: tone.dot } }), st.label || "—"),
            h("span", { className: "pmw-plugin-hint" }, st.reason || "")),
          h("p", { className: "gc-rec-suggest" }, st.suggestion || ""),
          st.level === "unknown" ? null : h(KTiles, { small: true, items: [
            { label: "本周跑量", value: num(sum.week_km, 1), unit: "km" },
            { label: "近 4 周周均", value: num(sum.baseline_km, 1), unit: "km" },
            { label: "本周进度", value: sum.progress == null ? "-" : sum.progress, unit: "%" },
            { label: "距上次跑步", value: sum.days_since == null ? "-" : sum.days_since, unit: "天" },
            { label: "近 7 天负荷", value: num(sum.load_7d, 0), unit: "" },
            { label: "近 7 天高强度", value: sum.high_days || 0, unit: "天" },
          ] }),
          h("div", { className: "gc-rec-progress" },
            h("span", { className: "gc-rec-progress-track" },
              h("i", { style: { width: Math.min(100, Math.max(0, sum.progress || 0)) + "%" } })),
            h("span", { className: "pmw-plugin-hint" }, "本周 / 近 4 周周均")),
          sum.effect_label ? h("p", { className: "pmw-plugin-hint" }, "最近训练效益：" + (teText(sum.effect_label) || sum.effect_label)) : null),
        h(KPanel, { title: "体能趋势", extra: h(KSeg, { label: "指标", value: metric, onChange: setMetric, options: REC_METRICS }) },
          active.length === 0
            ? h("p", { className: "pmw-plugin-hint gc-kempty" }, "暂无训练指标：点开任意一次跑步详情，或点上方「补全训练指标」")
            : h("div", { className: "gc-rec-chart-wrap" },
                h(RecoveryChart, { days: days, metric: metric, label: "恢复趋势" }),
                h("div", { className: "gc-legend gc-klegend" },
                  h("span", null, h("i", { className: "gc-rec-high" }), "高强度日"),
                  h("span", null, "空白 = 无数据")))),
        h(KPanel, { title: "最近训练" },
          active.length === 0
            ? h("p", { className: "pmw-plugin-hint gc-kempty" }, "暂无记录")
            : h("div", { className: "gc-rec-list" }, active.slice(-8).reverse().map(function (d) {
                return h("div", { key: d.date + (d.activity_id || ""), className: "gc-rec-row" },
                  h("span", { className: "gc-rec-date" }, d.date.slice(5)),
                  h("span", { className: "gc-rec-name" }, d.name || (d.strength ? "力量训练" : "跑步")),
                  d.distance_m > 0 ? h("span", { className: "gc-rec-dim" }, fmtDistance(d.distance_m)) : null,
                  d.load != null ? h("span", { className: "gc-rec-dim" }, "负荷 " + num(d.load, 0)) : null,
                  d.effect != null ? h("span", { className: "gc-rec-dim" }, "效果 " + num(d.effect, 1)) : null,
                  d.High ? h("span", { className: "gc-rec-tag high" }, "高强度") : null);
              })))
      ];
      return h("div", { className: "gc-overview gc-recovery" },
        h(KSection, { title: "恢复与体能", extra: h("div", { className: "gc-rec-controls" },
          h(KSeg, { label: "时间范围", value: range, onChange: setRange,
            options: [["14", "14 天"], ["28", "28 天"], ["56", "8 周"], ["90", "90 天"], ["180", "半年"], ["365", "1 年"]] }),
          h("button", { className: "pmw-plugin-button", type: "button", disabled: busy || backfill.running, onClick: backfillNow },
            backfill.running ? "补全中 " + (backfill.done || 0) + "/" + (backfill.total || "?") : "补全训练指标")) }),
        err ? h("p", { className: "pmw-plugin-hint" }, "读取失败：" + err) : null,
        backfill.running
          ? h("p", { className: "pmw-plugin-hint" }, "正在补全最近 4 周的训练指标（后台进行，不阻塞使用）…")
          : backfill.error ? h("p", { className: "pmw-plugin-hint" }, "指标补全：" + backfill.error) : null,
        !data
          ? h("p", { className: "pmw-plugin-hint gc-kempty" }, "正在读取恢复数据…")
          : h("div", { className: "gc-kdata" }, recPanels));
    }

    function RunList(props) {
      const [kind, setKind] = useState("all");
      const [q, setQ] = useState("");
      const word = q.trim().toLowerCase();
      const list = props.runs.filter(function (r) {
        const indoor = isIndoor(r.type_key, props.indoorTypes);
        const strength = isStrengthType(r.type_key);
        if (kind === "indoor" && (!indoor || strength)) return false;
        if (kind === "outdoor" && (indoor || strength)) return false;
        if (kind === "strength" && !strength) return false;
        return !word || String(r.activity_name || "").toLowerCase().indexOf(word) >= 0;
      });
      // 按月分组，组头带小计
      const groups = [];
      list.forEach(function (r) {
        const m = String(r.start_time || "").slice(0, 7);
        let g = groups[groups.length - 1];
        if (!g || g.month !== m) { g = { month: m, runs: [], dist: 0 }; groups.push(g); }
        g.runs.push(r);
        g.dist += runView(r).dist || 0;
        if (isStrengthType(r.type_key)) g.strength = (g.strength || 0) + 1;
      });

      const first = props.runs[0];
      return h("div", { className: "gc-list" },
        h(Overview, { indoorTypes: props.indoorTypes, version: props.runs.length + ":" + (first ? runKey(first) : "") }),
        h(KSection, { title: "运动记录", extra: h("div", { className: "gc-controls" },
          h(KSeg, { label: "类型", value: kind, onChange: setKind, options: [["all", "全部"], ["outdoor", "室外"], ["indoor", "室内"], ["strength", "力量"]] }),
          h("input", { className: "gc-search", type: "search", placeholder: "按名称搜索", value: q, "aria-label": "按名称搜索",
            onChange: function (e) { setQ(e.target.value); } }),
          h("span", { className: "pmw-plugin-hint" }, list.length + " 次" + (props.runs.length >= 200 ? "（显示最近 200 次）" : ""))) }),
        list.length && isNarrow()
          ? h("div", { className: "gc-cards" }, groups.map(function (g) {
              return h("section", { key: g.month },
                h("div", { className: "gc-month-head" }, h("strong", null, g.month.replace("-", " 年 ") + " 月"),
                  h("span", null, g.runs.length + " 次 · " + fmtDistance(g.dist))),
                g.runs.map(function (r) {
                  const v = runView(r);
                  const d = parseLocal(r.start_time);
                  return h("button", { key: runKey(r), type: "button", className: "gc-card-row", onClick: function () { props.onOpen(r); } },
                    h("span", { className: "gc-card-l" },
                      h("span", { className: "gc-card-name" }, r.activity_name || "-"),
                      h("small", null, String(r.start_time || "").slice(5, 10) + (d ? " " + WEEKDAYS[d.getDay()] : "") + " · " + typeName(r.type_key))),
                    h("span", { className: "gc-card-r" },
                      h("strong", null, v.strength ? fmtDuration(r.duration_s) : fmtDistance(v.dist), v.corrected ? h("span", { className: "gc-mark" }, " 校") : null),
                      h("small", null, (v.strength ? "力量训练" : fmtPace(v.pace)) + (r.avg_hr ? " · " + Math.round(r.avg_hr) + " bpm" : ""))));
                }));
            }))
          : list.length
          ? h("div", { className: "gc-scroll" }, h("table", { className: "gc-table gc-runs" },
              h("thead", null, h("tr", null,
                h("th", null, "日期"), h("th", null, "名称"), h("th", null, "类型"), h("th", { className: "num" }, "距离"),
                h("th", { className: "num" }, "时长"), h("th", { className: "num" }, "配速"), h("th", { className: "num" }, "均心率"))),
              groups.map(function (g) {
                return h("tbody", { key: g.month },
                  h("tr", { className: "gc-month" },
                    h("td", { colSpan: 7 },
                      h("strong", null, g.month.replace("-", " 年 ") + " 月"),
                      h("span", null, (g.runs.length - (g.strength || 0)) + " 次跑步 · " + fmtDistance(g.dist) + (g.strength ? " · 力量 " + g.strength + " 次" : "")))),
                  g.runs.map(function (r) {
                    const v = runView(r);
                    const d = parseLocal(r.start_time);
                    return h("tr", {
                      key: runKey(r), className: "gc-row", tabIndex: 0, role: "button",
                      onClick: function () { props.onOpen(r); },
                      onKeyDown: function (e) { if (e.key === "Enter") props.onOpen(r); },
                    },
                      h("td", { className: "gc-date" }, d
                        ? h("span", null, String(r.start_time).slice(5, 10), h("small", null, " " + WEEKDAYS[d.getDay()] + " " + String(r.start_time).slice(11, 16)))
                        : "-"),
                      h("td", { className: "gc-name" }, r.activity_name || "-"),
                      h("td", null, h("span", { className: "gc-tag" + (isIndoor(r.type_key, props.indoorTypes) ? " gc-tag-in" : "") }, typeName(r.type_key))),
                      h("td", { className: "num" }, v.strength ? "-" : h("strong", null, fmtDistance(v.dist)),
                        v.corrected ? h("span", { className: "gc-mark", title: "已按跑步机速度校正" }, " 校") : null),
                      h("td", { className: "num" }, fmtDuration(r.duration_s)),
                      h("td", { className: "num" }, v.strength ? "-" : fmtPace(v.pace)),
                      h("td", { className: "num" }, r.avg_hr ? String(Math.round(r.avg_hr)) : "-"));
                  }));
              })))
          : h("p", { className: "pmw-plugin-hint" }, props.runs.length ? "没有符合条件的跑步" : ""));
    }

    // ---------------------------------------------------------------------------
    // 统计：按周 / 月 / 年，汇总 / 室外 / 室内，柱状图
    // ---------------------------------------------------------------------------

    const PERIODS = [["week", "周"], ["month", "月"], ["year", "年"]];
    const KINDS = [["all", "跑步汇总"], ["outdoor", "室外跑步"], ["indoor", "室内跑步"], ["strength", "力量训练"]];
    const STRENGTH_METRICS = [["duration", "时长"], ["runs", "次数"]];
    const METRICS = [["distance", "距离"], ["duration", "时长"], ["runs", "次数"], ["pace", "平均配速"]];

    function pad2(n) { return String(n).padStart(2, "0"); }
    function ymd(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }

    /** 最近 n 个周期的键（和后端分桶口径一致：周一为一周开始 / YYYY-MM / YYYY） */
    function periodKeys(period, n, firstYear) {
      const now = new Date();
      const keys = [];
      if (period === "week") {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        for (let i = n - 1; i >= 0; i--) {
          const w = new Date(d);
          w.setDate(d.getDate() - i * 7);
          keys.push(ymd(w));
        }
      } else if (period === "month") {
        for (let i = n - 1; i >= 0; i--) {
          const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
          keys.push(m.getFullYear() + "-" + pad2(m.getMonth() + 1));
        }
      } else {
        for (let y = Math.min(firstYear || now.getFullYear(), now.getFullYear()); y <= now.getFullYear(); y++) keys.push(String(y));
      }
      return keys;
    }

    function bucketLabel(period, key) {
      if (period === "week") return key.slice(5).replace("-", "/");
      if (period === "month") return key.slice(2).replace("-", "/");
      return key;
    }

    function metricValue(metric, b) {
      if (!b || !b.runs) return 0;
      if (metric === "distance") return (b.distance_m || 0) / 1000;
      if (metric === "duration") return (b.duration_s || 0) / 3600;
      if (metric === "runs") return b.runs;
      return b.distance_m > 0 ? b.duration_s / (b.distance_m / 1000) : 0;
    }

    function metricText(metric, v) {
      if (metric === "distance") return v.toFixed(1) + " km";
      if (metric === "duration") return v.toFixed(1) + " h";
      if (metric === "runs") return String(v) + " 次";
      return fmtPace(v);
    }

    function StatsView() {
      const prefs = useStatsPrefs();
      const [period, setPeriod] = useState("week");
      const [kind, setKind] = useState("all");
      const [metric, setMetric] = useState("distance");
      const [data, setData] = useState(null);
      const [hint, setHint] = useState("正在统计…");

      useEffect(function () {
        let alive = true;
        setHint("正在统计…");
        let path = "/stats?period=" + period + "&kind=" + kind;
        if (prefs.ignoreShort) {
          path += "&min_run_m=" + prefs.minRunM + "&min_strength_s=" + prefs.minStrengthS;
        }
        api(path)
          .then(function (d) { if (alive) { setData(d); setHint(""); } })
          .catch(function (err) { if (alive) setHint("统计失败：" + errText(err)); });
        return function () { alive = false; };
      }, [period, kind, prefs]);

      const rows = (data && data.buckets) || [];
      const byKey = {};
      rows.forEach(function (b) { byKey[b.bucket] = b; });
      const firstYear = rows.length ? Number(String(rows[0].bucket).slice(0, 4)) : undefined;
      const keys = periodKeys(period, period === "week" ? 16 : 12, firstYear);
      const shown = keys.map(function (k) { return { key: k, b: byKey[k] || null }; });
      const totals = shown.reduce(function (t, x) {
        if (!x.b) return t;
        t.runs += x.b.runs; t.dist += x.b.distance_m || 0; t.dur += x.b.duration_s || 0;
        t.longest = Math.max(t.longest, x.b.longest_m || 0);
        return t;
      }, { runs: 0, dist: 0, dur: 0, longest: 0 });
      const rangeText = period === "week" ? "最近 16 周" : period === "month" ? "最近 12 个月" : "全部年份";
      // 力量训练没有距离和配速，只看时长和次数
      const strength = kind === "strength";
      const metricOpts = strength ? STRENGTH_METRICS : METRICS;
      const m = strength && (metric === "distance" || metric === "pace") ? "duration" : metric;
      const cards = strength
        ? [["范围", rangeText], ["次数", totals.runs + " 次"], ["时长", fmtDuration(totals.dur)],
           ["平均每次", totals.runs ? fmtDuration(totals.dur / totals.runs) : "-"]]
        : [["范围", rangeText], ["次数", totals.runs + " 次"], ["距离", fmtDistance(totals.dist)],
           ["时长", fmtDuration(totals.dur)], ["平均配速", totals.dist > 0 ? fmtPace(totals.dur / (totals.dist / 1000)) : "-"],
           ["最长一次", fmtDistance(totals.longest)]];

      return h("div", { className: "gc-stats-view" },
        h("div", { className: "gc-controls" },
          h(Seg, { label: "类型", value: kind, onChange: setKind, options: KINDS }),
          h(Seg, { label: "周期", value: period, onChange: setPeriod, options: PERIODS }),
          h(Seg, { label: "指标", value: m, onChange: setMetric, options: metricOpts })),
        prefs.ignoreShort
          ? h("p", { className: "pmw-plugin-hint" },
              "统计已忽略短活动：跑步 < " + num(prefs.minRunM / 1000, 1) + " km、力量 < " + num(prefs.minStrengthS / 60, 0) + " 分钟（设置里可改）。")
          : null,
        hint ? h("p", { className: "pmw-plugin-hint" }, hint) : null,
        data && data.unknown_type > 0 && !strength
          ? h("p", { className: "pmw-plugin-hint" },
              "有 " + data.unknown_type + " 条记录还不知道是室内还是室外（按室外算），点「同步全部历史」后会补上类型。")
          : null,
        h("div", { className: "gc-stats" },
          cards.map(function (c) {
            return h("div", { className: "gc-stat", key: c[0] },
              h("span", { className: "gc-stat-label" }, c[0]), h("span", { className: "gc-stat-value" }, c[1]));
          })),
        h(BarChart, { items: shown, period: period, metric: m }),
        h("div", { className: "gc-scroll" }, h("table", { className: "gc-table" },
          h("thead", null, strength
            ? h("tr", null, h("th", null, "周期"), h("th", null, "次数"), h("th", null, "时长"), h("th", null, "平均心率"))
            : h("tr", null,
              h("th", null, "周期"), h("th", null, "次数"), h("th", null, "距离"), h("th", null, "时长"),
              h("th", null, "平均配速"), h("th", null, "平均心率"), h("th", null, "最长"), h("th", null, "爬升"))),
          h("tbody", null, shown.slice().reverse().filter(function (x) { return x.b; }).map(function (x) {
            const b = x.b;
            if (strength) {
              return h("tr", { key: x.key }, h("td", null, period === "week" ? x.key + " 起" : x.key), h("td", null, String(b.runs)),
                h("td", null, fmtDuration(b.duration_s)), h("td", null, b.avg_hr ? num(b.avg_hr) : "-"));
            }
            return h("tr", { key: x.key },
              h("td", null, period === "week" ? x.key + " 起" : x.key),
              h("td", null, String(b.runs)),
              h("td", null, fmtDistance(b.distance_m)),
              h("td", null, fmtDuration(b.duration_s)),
              h("td", null, b.distance_m > 0 ? fmtPace(b.duration_s / (b.distance_m / 1000)) : "-"),
              h("td", null, b.avg_hr ? num(b.avg_hr) : "-"),
              h("td", null, fmtDistance(b.longest_m)),
              h("td", null, typeof b.elevation_m === "number" ? num(b.elevation_m) + " m" : "-"));
          })))));
    }

    function BarChart(props) {
      const [ref, cw] = useChartWidth(720);
      const W = Math.max(280, cw), H = 220, padL = 44, padB = 26, padT = 18;
      const vals = props.items.map(function (x) { return metricValue(props.metric, x.b); });
      const max = Math.max.apply(null, vals.concat([0]));
      const n = props.items.length || 1;
      const slot = (W - padL - 8) / n;
      const bw = Math.max(4, slot * 0.62);
      const y = function (v) { return H - padB - (max > 0 ? (v / max) * (H - padB - padT) : 0); };
      const ticks = [0, 0.5, 1].map(function (f) { return max * f; });
      const every = n > 12 ? 2 : 1;
      return h("figure", { className: "gc-chart" },
        h("svg", { ref: ref, viewBox: "0 0 " + W + " " + H, role: "img", style: { height: H + "px" }, "aria-label": "按周期的" + (METRICS.find(function (m) { return m[0] === props.metric; }) || [0, ""])[1] },
          ticks.map(function (t, i) {
            return h("g", { key: "t" + i },
              h("line", { x1: padL, x2: W - 4, y1: y(t), y2: y(t), className: "gc-grid" }),
              h("text", { x: padL - 6, y: y(t) + 4, className: "gc-axis", textAnchor: "end" },
                props.metric === "pace" ? paceText(t) : (props.metric === "runs" ? Math.round(t) : t.toFixed(t >= 10 ? 0 : 1))));
          }),
          props.items.map(function (x, i) {
            const v = vals[i];
            const cx = padL + slot * i + slot / 2;
            return h("g", { key: x.key },
              v > 0 ? h("rect", { x: cx - bw / 2, y: y(v), width: bw, height: H - padB - y(v), rx: 2, className: "gc-bar" },
                h("title", null, bucketLabel(props.period, x.key) + "：" + metricText(props.metric, v))) : null,
              i % every === 0 ? h("text", { x: cx, y: H - 8, className: "gc-axis", textAnchor: "middle" }, bucketLabel(props.period, x.key)) : null);
          })),
        props.metric === "pace" ? h("figcaption", { className: "pmw-plugin-hint" }, "配速柱越高越慢") : null);
    }

    // ---------------------------------------------------------------------------
    // 详情
    // ---------------------------------------------------------------------------

    /** 顶部关键指标卡片：[标题, 取值函数]，取不到不显示；完整数据在下面「详细数据」 */
    const KEY_FIELDS = [
      ["距离", function (s) { return fmtDistance(s.distance); }],
      ["用时", function (s) { return fmtDuration(s.duration); }],
      ["平均配速", function (s) { return s._pace ? fmtPace(s._pace) : paceFromSpeed(s.averageSpeed); }],
      ["平均心率", function (s) { return s.averageHR ? num(s.averageHR) + " bpm" : null; }],
      ["平均步频", function (s) { return s.averageRunCadence ? num(s.averageRunCadence) + " 步/分" : null; }],
      ["训练负荷", function (s) { return s.activityTrainingLoad ? num(s.activityTrainingLoad) : null; }],
      ["累计爬升", function (s) { return typeof s.elevationGain === "number" ? num(s.elevationGain) + " m" : null; }],
      ["热量", function (s) { return s.calories ? num(s.calories) + " kcal" : null; }],
    ];

    // ---- 详细数据：把 Garmin 的概要字段按主题分组、换算成看得懂的写法 ----

    /** Garmin 训练效果代码（IMPROVING_AEROBIC_BASE_8 这种）翻成中文 */
    const TE_WORDS = [
      ["NO_ANAEROBIC_BENEFIT", "无明显无氧效益"], ["NO_AEROBIC_BENEFIT", "无明显有氧效益"],
      ["LACTATE_THRESHOLD", "乳酸阈值"], ["VO2MAX", "最大摄氧量"], ["ANAEROBIC_CAPACITY", "无氧能力"],
      ["AEROBIC_BASE", "有氧基础"], ["AEROBIC_FITNESS", "有氧体能"], ["AEROBIC_ENDURANCE", "有氧耐力"],
      ["HIGHLY_IMPROVING", "大幅提升"], ["IMPROVING", "提升"], ["MAINTAINING", "保持"], ["MINOR", "轻微"],
      ["NO_", "无"], ["OVERREACHING", "训练过量"], ["RECOVERY", "恢复"], ["TEMPO", "节奏"], ["SPEED", "速度"],
      ["ECONOMY", "跑步经济性"], ["POWER", "爆发力"], ["ANAEROBIC", "无氧"], ["AEROBIC", "有氧"],
      ["BENEFIT", "效益"], ["BASE", "基础"], ["FITNESS", "体能"], ["ENDURANCE", "耐力"], ["CAPACITY", "能力"],
    ];

    function teText(code) {
      if (typeof code !== "string" || !code || code === "UNKNOWN") return null;
      let t = code.replace(/_\d+$/, "");
      TE_WORDS.forEach(function (w) { t = t.split(w[0]).join(w[1]); });
      return t.replace(/_/g, "");
    }

    /** 训练效果分值 → 档位（Garmin 的 0～5 分档） */
    function teLevel(v) {
      if (typeof v !== "number") return null;
      const lv = v < 1 ? "无效益" : v < 2 ? "轻微" : v < 3 ? "保持" : v < 4 ? "提升" : v < 5 ? "大幅提升" : "过量";
      return num(v, 1) + " · " + lv;
    }

    function feelText(v) {
      if (typeof v !== "number") return null;
      return v >= 88 ? "很好" : v >= 63 ? "好" : v >= 38 ? "一般" : v >= 13 ? "差" : "很差";
    }

    function rpeText(v) {
      if (typeof v !== "number" || v <= 0) return null;
      const r = Math.round(v / 10);
      const word = r <= 2 ? "很轻松" : r <= 4 ? "轻松" : r <= 6 ? "适中" : r <= 8 ? "吃力" : r === 9 ? "很吃力" : "极限";
      return r + "/10 · " + word;
    }

    /** 起点、终点之间的直线距离（不展示坐标本身，避免暴露位置） */
    function startEndText(s) {
      if (typeof s.startLatitude !== "number" || typeof s.endLatitude !== "number") return null;
      const R = 6371000, rad = Math.PI / 180;
      const dLat = (s.endLatitude - s.startLatitude) * rad, dLon = (s.endLongitude - s.startLongitude) * rad;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(s.startLatitude * rad) * Math.cos(s.endLatitude * rad) * Math.sin(dLon / 2) ** 2;
      const d = 2 * R * Math.asin(Math.sqrt(a));
      return d < 200 ? "回到起点附近（相距 " + num(d) + " m）" : "终点距起点 " + fmtDistance(d);
    }

    function unit(v, u, digits) { return typeof v === "number" && isFinite(v) ? num(v, digits) + (u ? " " + u : "") : null; }
    function pos(v, u, digits) { return typeof v === "number" && v > 0 ? num(v, digits) + (u ? " " + u : "") : null; }

    /**
     * 分组：[组名, [[标题, 取值函数, 用到的字段...]]]。取值为 null 的行不显示，整组都空就不显示这组。
     * s 是概要（跑步机校正后距离、配速已替换）。
     */
    const DATA_GROUPS = [
      ["时间", [
        ["开始时间", function (s) { return s.startTimeLocal ? shortTime(s.startTimeLocal) : null; }, "startTimeLocal", "startTimeGMT"],
        ["计时用时", function (s) { return pos(s.duration) && fmtDuration(s.duration); }, "duration"],
        ["移动用时", function (s) { return pos(s.movingDuration) && fmtDuration(s.movingDuration); }, "movingDuration"],
        ["总耗时（含暂停）", function (s) { return pos(s.elapsedDuration) && fmtDuration(s.elapsedDuration); }, "elapsedDuration"],
        ["停下的时间", function (s) {
          const p = (s.elapsedDuration || 0) - (s.movingDuration || 0);
          return s.elapsedDuration && s.movingDuration && p >= 1 ? fmtDuration(p) : null;
        }],
        // 最短一圈多半是最后不满一公里的零头，不展示，免得误读成「最快一圈」
        ["", function () { return null; }, "minActivityLapDuration"],
      ]],
      ["配速与速度", [
        ["距离", function (s) { return pos(s.distance) && fmtDistance(s.distance) + (s._corrected ? "（已校正）" : ""); }, "distance"],
        ["平均配速", function (s) { return s._pace ? fmtPace(s._pace) : paceFromSpeed(s.averageSpeed); }, "averageSpeed"],
        ["移动配速", function (s) {
          return s._corrected ? (s.movingDuration && s.distance ? fmtPace(s.movingDuration / (s.distance / 1000)) : null) : paceFromSpeed(s.averageMovingSpeed);
        }, "averageMovingSpeed"],
        ["坡度调整配速", function (s) { return s._corrected ? null : paceFromSpeed(s.avgGradeAdjustedSpeed); }, "avgGradeAdjustedSpeed"],
        ["最快配速", function (s) { return s._corrected ? null : paceFromSpeed(s.maxSpeed); }, "maxSpeed"],
        ["平均速度", function (s) {
          const v = s._corrected ? (s.duration ? s.distance / s.duration : 0) : s.averageSpeed;
          return v > 0 ? num(v * 3.6, 1) + " km/h" : null;
        }],
      ]],
      ["心率", [
        ["平均心率", function (s) { return pos(s.averageHR, "bpm"); }, "averageHR"],
        ["最大心率", function (s) { return pos(s.maxHR, "bpm"); }, "maxHR"],
        ["最低心率", function (s) { return pos(s.minHR, "bpm"); }, "minHR"],
        ["心率恢复（停下后 2 分钟下降）", function (s) { return pos(s.recoveryHeartRate, "bpm"); }, "recoveryHeartRate"],
      ]],
      ["跑步动态", [
        ["平均步频", function (s) { return pos(s.averageRunCadence, "步/分"); }, "averageRunCadence"],
        ["最大步频", function (s) { return pos(s.maxRunCadence, "步/分"); }, "maxRunCadence", "maxDoubleCadence"],
        ["平均步幅", function (s) { return pos(s.strideLength) ? num(s.strideLength / 100, 2) + " m" : null; }, "strideLength"],
        ["触地时间", function (s) { return pos(s.groundContactTime, "ms"); }, "groundContactTime"],
        ["垂直振幅", function (s) { return pos(s.verticalOscillation, "cm", 1); }, "verticalOscillation"],
        ["垂直步幅比", function (s) { return pos(s.verticalRatio, "%", 1); }, "verticalRatio"],
        ["步数", function (s) { return pos(s.steps, "步"); }, "steps"],
      ]],
      ["功率", [
        ["平均功率", function (s) { return pos(s.averagePower, "W"); }, "averagePower"],
        ["最大功率", function (s) { return pos(s.maxPower, "W"); }, "maxPower", "minPower"],
        ["标准化功率", function (s) { return pos(s.normalizedPower, "W"); }, "normalizedPower"],
        ["总做功", function (s) { return pos(s.totalWork, "kJ"); }, "totalWork"],
      ]],
      ["海拔与地形", [
        ["累计爬升", function (s) { return unit(s.elevationGain, "m"); }, "elevationGain"],
        ["累计下降", function (s) { return unit(s.elevationLoss, "m"); }, "elevationLoss"],
        ["最高海拔", function (s) { return unit(s.maxElevation, "m"); }, "maxElevation"],
        ["最低海拔", function (s) { return unit(s.minElevation, "m"); }, "minElevation"],
        ["平均海拔", function (s) { return unit(s.avgElevation, "m"); }, "avgElevation"],
        ["最快爬升速度", function (s) { return pos(s.maxVerticalSpeed) ? num(s.maxVerticalSpeed * 60) + " m/分" : null; }, "maxVerticalSpeed"],
        ["起终点", startEndText, "startLatitude", "startLongitude", "endLatitude", "endLongitude"],
      ]],
      ["训练效果", [
        ["主要训练效益", function (s) { return teText(s.trainingEffectLabel); }, "trainingEffectLabel"],
        ["有氧训练效果", function (s) { return teLevel(s.trainingEffect); }, "trainingEffect"],
        ["有氧效果说明", function (s) { return teText(s.aerobicTrainingEffectMessage); }, "aerobicTrainingEffectMessage"],
        ["无氧训练效果", function (s) { return teLevel(s.anaerobicTrainingEffect); }, "anaerobicTrainingEffect"],
        ["无氧效果说明", function (s) { return teText(s.anaerobicTrainingEffectMessage); }, "anaerobicTrainingEffectMessage"],
        ["训练负荷", function (s) { return pos(s.activityTrainingLoad); }, "activityTrainingLoad"],
        ["强度分钟数", function (s) {
          if (typeof s.moderateIntensityMinutes !== "number" && typeof s.vigorousIntensityMinutes !== "number") return null;
          return "中等强度 " + num(s.moderateIntensityMinutes || 0) + " 分钟 · 高强度 " + num(s.vigorousIntensityMinutes || 0) + " 分钟";
        }, "moderateIntensityMinutes", "vigorousIntensityMinutes"],
      ]],
      ["身体与消耗", [
        ["运动消耗", function (s) { return pos(s.calories, "kcal"); }, "calories"],
        ["其中基础代谢", function (s) { return pos(s.bmrCalories, "kcal"); }, "bmrCalories"],
        ["估算出汗量", function (s) { return pos(s.waterEstimated, "ml"); }, "waterEstimated"],
        ["身体电量变化", function (s) {
          return typeof s.differenceBodyBattery === "number" ? (s.differenceBodyBattery > 0 ? "+" : "") + num(s.differenceBodyBattery) : null;
        }, "differenceBodyBattery"],
        ["开始时体能", function (s) { return unit(s.beginPotentialStamina, "%"); }, "beginPotentialStamina"],
        ["结束时体能", function (s) { return unit(s.endPotentialStamina, "%"); }, "endPotentialStamina"],
        ["最低可用体能", function (s) { return unit(s.minAvailableStamina, "%"); }, "minAvailableStamina"],
      ]],
      ["主观感受与课表", [
        ["跑后感受", function (s) { return feelText(s.directWorkoutFeel); }, "directWorkoutFeel"],
        ["主观用力程度", function (s) { return rpeText(s.directWorkoutRpe); }, "directWorkoutRpe"],
        ["课表完成度", function (s) { return unit(s.directWorkoutComplianceScore, "%"); }, "directWorkoutComplianceScore"],
      ]],
      ["手表测得温度", [
        ["平均", function (s) { return unit(s.averageTemperature, "°C"); }, "averageTemperature"],
        ["最高", function (s) { return unit(s.maxTemperature, "°C"); }, "maxTemperature"],
        ["最低", function (s) { return unit(s.minTemperature, "°C"); }, "minTemperature"],
      ]],
    ];

    /** 已经分进组的字段（其余的收进「其他数据」） */
    const GROUPED_KEYS = {};
    DATA_GROUPS.forEach(function (g) { g[1].forEach(function (row) { row.slice(2).forEach(function (k) { GROUPED_KEYS[k] = true; }); }); });

    /** camelCase 字段名 → 空格分词，至少不是一串连着的代码 */
    function humanKey(k) {
      return String(k).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, function (c) { return c.toUpperCase(); });
    }

    function otherValue(v) {
      if (typeof v === "number") return Math.abs(v) >= 100 || Number.isInteger(v) ? num(v) : num(v, 2);
      if (typeof v === "boolean") return v ? "是" : "否";
      return String(v);
    }

    function DataGroups(props) {
      const s = props.summary;
      const groups = DATA_GROUPS.map(function (g) {
        return [g[0], g[1].map(function (row) { return [row[0], row[1](s)]; }).filter(function (r) { return r[1]; })];
      }).filter(function (g) { return g[1].length; });
      const others = Object.keys(props.raw || {}).filter(function (k) { return !GROUPED_KEYS[k]; }).sort();
      return h("section", { className: "gc-kdata" },
        h(KSection, { title: "详细数据" }),
        h("div", { className: "gc-kgrid" }, groups.map(function (g) {
          return h(KPanel, { key: g[0], title: g[0] },
            h("dl", { className: "gc-dl" }, g[1].map(function (r) {
              return h("div", { className: "gc-dl-row", key: r[0] }, h("dt", null, r[0]), h("dd", null, r[1]));
            })));
        })),
        others.length
          ? h("details", { className: "gc-all" },
              h("summary", null, "其他数据（" + others.length + " 项，Garmin 未说明含义）"),
              h("dl", { className: "gc-dl gc-dl-others" }, others.map(function (k) {
                return h("div", { className: "gc-dl-row", key: k }, h("dt", null, humanKey(k)), h("dd", null, otherValue(props.raw[k])));
              })))
          : null);
    }

    // ---- 编辑 Garmin 上的活动 ----

    const TYPE_NAMES = {
      running: "跑步", street_running: "路跑", treadmill_running: "跑步机", track_running: "操场跑",
      trail_running: "越野跑", indoor_running: "室内跑", virtual_run: "虚拟跑", ultra_run: "超级马拉松",
      obstacle_run: "障碍跑", indoor_track: "室内跑道", wheelchair_push_run: "轮椅跑", canicross: "携犬跑",
      strength_training: "力量训练",
    };
    const EVENT_NAMES = {
      race: "比赛", training: "训练", recreation: "休闲", transportation: "通勤", specialEvent: "特别活动",
      fitness: "健身", touring: "旅行", geocaching: "地理寻宝", uncategorized: "未分类",
    };

    function typeName(k) { return TYPE_NAMES[k] || k || "-"; }
    function eventName(k) { return EVENT_NAMES[k] || k || ""; }

    function EditPanel(props) {
      const d = props.detail;
      const init = props.preset || {};
      const [name, setName] = useState(d.name || "");
      const [desc, setDesc] = useState(init.description != null ? init.description : (d.description || ""));
      const [typeKey, setTypeKey] = useState(init.type_key || d.type_key || "");
      const [eventType, setEventType] = useState(d.event_type || "");
      const [fav, setFav] = useState(Boolean(d.favorite));
      const [opts, setOpts] = useState(null);
      const [msg, setMsg] = useState("");
      const [saving, setSaving] = useState(false);

      useEffect(function () {
        let alive = true;
        api("/edit-options")
          .then(function (o) { if (alive) setOpts(o); })
          .catch(function (err) { if (alive) setMsg("读取可选的类型失败（类型和类别暂不能改）：" + errText(err)); });
        return function () { alive = false; };
      }, []);

      async function save(e) {
        e.preventDefault();
        const body = {};
        if (name.trim() !== (d.name || "")) body.name = name.trim();
        if (desc !== (d.description || "")) body.description = desc;
        if (typeKey && typeKey !== d.type_key) body.type_key = typeKey;
        if (eventType && eventType !== (d.event_type || "")) body.event_type = eventType;
        if (fav !== Boolean(d.favorite)) body.favorite = fav;
        if (!Object.keys(body).length) { setMsg("没有改动"); return; }
        setSaving(true);
        setMsg("正在保存到 Garmin…");
        try {
          await api("/runs/" + encodeURIComponent(d.activity_id) + "/edit", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
          });
          props.onSaved(body);
        } catch (err) {
          setMsg("保存失败：" + errText(err));
        } finally {
          setSaving(false);
        }
      }

      const types = (opts && opts.activity_types) || [];
      const events = (opts && opts.event_types) || [];
      return h("form", { className: "gc-edit", onSubmit: save, "aria-label": "编辑活动" },
        h("p", { className: "gc-note" }, "保存后会同步修改 Garmin Connect 上的这条活动（手表 App 里也会变）。Garmin 只允许改下面这几项，距离和分段改不了。"),
        h("label", { className: "gc-field" }, "名称",
          h("input", { value: name, maxLength: 100, disabled: saving, onChange: function (e) { setName(e.target.value); } })),
        h("div", { className: "gc-edit-row" },
          h("label", { className: "gc-field" }, "活动类型",
            h("select", { value: typeKey, disabled: saving || !types.length, onChange: function (e) { setTypeKey(e.target.value); } },
              (types.some(function (t) { return t.typeKey === typeKey; }) ? [] : [h("option", { key: "cur", value: typeKey }, typeName(typeKey))])
                .concat(types.map(function (t) { return h("option", { key: t.typeKey, value: t.typeKey }, typeName(t.typeKey)); })))),
          h("label", { className: "gc-field" }, "活动类别",
            h("select", { value: eventType, disabled: saving || !events.length, onChange: function (e) { setEventType(e.target.value); } },
              (eventType
                ? (events.some(function (t) { return t.typeKey === eventType; }) ? [] : [h("option", { key: "cur", value: eventType }, eventName(eventType))])
                : [h("option", { key: "none", value: "" }, "未设置")])
                .concat(events.map(function (t) { return h("option", { key: t.typeKey, value: t.typeKey }, eventName(t.typeKey)); }))))),
        h("label", { className: "gc-field" }, "描述",
          h("textarea", { value: desc, rows: 4, maxLength: 2000, disabled: saving, placeholder: "写点这次跑步的感受、课表…",
            onChange: function (e) { setDesc(e.target.value); } })),
        h("label", { className: "pmw-plugin-check" },
          h("input", { type: "checkbox", checked: fav, disabled: saving, onChange: function (e) { setFav(e.target.checked); } }),
          " 收藏"),
        h("div", { className: "gc-detail-bar" },
          h("button", { className: "pmw-plugin-button gc-primary", type: "submit", disabled: saving }, saving ? "保存中…" : "保存到 Garmin"),
          h("button", { className: "pmw-plugin-button", type: "button", disabled: saving, onClick: props.onCancel }, "取消")),
        msg ? h("p", { className: "pmw-plugin-hint", role: "status" }, msg) : null);
    }

    /** Garmin 分段 intensityType → 中文归类（按这个顺序分组） */
    const INTENSITY = [
      ["WARMUP", "热身"], ["ACTIVE", "训练"], ["INTERVAL", "训练"], ["RECOVERY", "恢复"],
      ["REST", "休息"], ["COOLDOWN", "舒缓"],
    ];
    const INTENSITY_ORDER = ["热身", "训练", "恢复", "休息", "舒缓", "未标注"];

    function intensityLabel(t) {
      const hit = INTENSITY.find(function (x) { return x[0] === String(t || "").toUpperCase(); });
      return hit ? hit[1] : "未标注";
    }

    /** 按跑步机速度校正后的分段：{dist, dur, pace, speed} */
    function lapView(l, speed) {
      const dur = typeof l.duration === "number" ? l.duration : 0;
      if (speed > 0) {
        return { dist: speed / 3.6 * dur, dur: dur, pace: 3600 / speed, speed: speed, corrected: true };
      }
      const dist = typeof l.distance === "number" ? l.distance : 0;
      return { dist: dist, dur: dur, pace: dist > 0 ? dur / (dist / 1000) : 0, speed: 0, corrected: false };
    }

    function RunDetail(props) {
      const id = props.id;
      const [resp, setResp] = useState(null);
      const [hint, setHint] = useState("正在读取跑步详情…");
      const [busy, setBusy] = useState(false);
      const [edit, setEdit] = useState(null);
      const [allSpeed, setAllSpeed] = useState("");
      const [saving, setSaving] = useState(false);
      const [editing, setEditing] = useState(null);
      const [tab, setTab] = useState("overview");
      const [marking, setMarking] = useState(false);
      const [activeLap, setActiveLap] = useState(-1);

      async function load(refresh) {
        setBusy(true);
        setHint(refresh ? "正在从 Garmin 重新拉取…" : "正在读取跑步详情…");
        try {
          const data = await api("/runs/" + encodeURIComponent(id) + (refresh ? "?refresh=1" : ""));
          setResp(data);
          setHint(data.warning || "");
        } catch (err) {
          setHint("读取失败：" + errText(err));
        } finally {
          setBusy(false);
        }
      }

      useEffect(function () { load(false); }, [id]);

      const detail = resp && resp.detail;
      const speeds = (resp && resp.lap_speeds) || {};
      const indoor = detail ? isIndoor(detail.type_key, resp.indoor_types) : false;
      const laps = (detail && detail.laps) || [];
      const lapViews = laps.map(function (l, i) { return lapView(l, speeds[String(i)] || 0); });
      const corrected = lapViews.some(function (v) { return v.corrected; });

      const s = Object.assign({}, (detail && detail.summary) || {});
      if (corrected) {
        const dist = lapViews.reduce(function (t, v) { return t + v.dist; }, 0);
        s._origDistance = s.distance;
        s.distance = dist;
        s._corrected = true;
        s._pace = dist > 0 && s.duration ? s.duration / (dist / 1000) : 0;
      }
      const cards = KEY_FIELDS
        .map(function (f) { return [f[0], f[1](s)]; })
        .filter(function (f) { return f[1] && f[1] !== "-"; });

      function startEdit() {
        const m = {};
        laps.forEach(function (_, i) { m[String(i)] = speeds[String(i)] ? String(speeds[String(i)]) : ""; });
        setEdit(m);
        setAllSpeed("");
      }

      async function saveSpeeds(body) {
        setSaving(true);
        try {
          const r = await api("/runs/" + encodeURIComponent(id) + "/lap-speeds", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
          });
          setResp(Object.assign({}, resp, { lap_speeds: r.lap_speeds || {} }));
          setEdit(null);
          setHint(body.clear ? "已清除跑步机校正，恢复 Garmin 原始数据。" : "已按跑步机速度校正，列表和统计同步更新。");
        } catch (err) {
          setHint("保存失败：" + errText(err));
        } finally {
          setSaving(false);
        }
      }

      function submitEdit() {
        const out = {};
        Object.keys(edit).forEach(function (k) {
          const v = parseFloat(edit[k]);
          if (v > 0) out[k] = v;
        });
        saveSpeeds({ speeds: out });
      }

      function applyAll() {
        const v = parseFloat(allSpeed);
        if (!(v > 0)) return;
        const m = {};
        laps.forEach(function (_, i) { m[String(i)] = String(v); });
        setEdit(m);
      }

      function onSaved(body) {
        const d = Object.assign({}, detail);
        if (body.name != null) d.name = body.name;
        if (body.description != null) d.description = body.description;
        if (body.type_key) d.type_key = body.type_key;
        if (body.event_type) d.event_type = body.event_type;
        if (body.favorite != null) d.favorite = body.favorite;
        setResp(Object.assign({}, resp, { detail: d }));
        setEditing(null);
        setHint("已保存到 Garmin。");
        // 类别改成「比赛」时同步收录到比赛（后端按活动去重，重复改不会多出一场）
        if (body.event_type === "race") markRace(d, "已保存到 Garmin，并收录到「比赛」。");
      }

      /** 收录为比赛：名称、日期、类别（按距离猜）、成绩（计时用时）从这次活动带出，影像到「比赛」里补 */
      async function markRace(src, okText) {
        const d = src && src.activity_id ? src : detail;
        setMarking(true);
        try {
          const res = await api("/races", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
            name: d.name || "比赛", date: String(d.start_local || props.start || "").slice(0, 10),
            category: guessCategory(s.distance || 0, d.type_key), status: "finished",
            // 手表计时从过起点开始，更接近净计时
            net_s: s.duration || 0, activity_id: d.activity_id,
          }) });
          setHint(res && res.existing
            ? (okText ? "已保存到 Garmin；这次活动已经在「比赛」里了。" : "这次活动已经收录在「比赛」里了。")
            : (okText || "已收录到「比赛」，可以在那里补充成绩证书、奖牌、照片等影像。"));
        } catch (err) {
          setHint("收录失败：" + errText(err));
        } finally { setMarking(false); }
      }

      /** 把跑步机校正结果写进 Garmin：类型改成跑步机，描述末尾追加校正后的距离和配速 */
      function presetCorrection() {
        const line = "跑步机校正：" + fmtDistance(s.distance) + "，平均配速 " + fmtPace(s._pace) + "（按跑步机速度逐段校正，Garmin 原始 " + fmtDistance(s._origDistance) + "）";
        const old = detail.description || "";
        const kept = old.split("\n").filter(function (l) { return l.indexOf("跑步机校正：") !== 0; }).join("\n").trim();
        setEditing({ description: (kept ? kept + "\n" : "") + line, type_key: indoor ? detail.type_key : "treadmill_running" });
      }

      const metaBits = detail ? [
        shortTime(detail.start_local || props.start),
        typeName(detail.type_key),
        eventName(detail.event_type),
        detail.favorite ? "已收藏" : "",
      ].filter(Boolean).join(" · ") : shortTime(props.start);

      // 力量训练：概览、训练组、图表（心率）、AI 分析；跑步：概览、图表、分段、AI 分析
      const strength = detail ? isStrengthType(detail.type_key) : false;
      const tabs = strength
        ? [["overview", "概览"], ["sets", "训练组"], ["charts", "图表"], ["ai", "AI 分析"]]
        : [["overview", "概览"], ["charts", "图表"], ["laps", "分段"], ["ai", "AI 分析"]];
      const narrow = isNarrow();
      const sst = strength ? strengthStats(detail.sets) : null;
      const shownCards = strength
        ? [["用时", fmtDuration(s.duration)], ["训练组", sst.sets ? sst.sets + " 组" : "-"], ["总次数", sst.reps ? sst.reps + " 次" : "-"],
           ["总容量", sst.volume ? num(sst.volume) + " kg" : "-"], ["平均心率", s.averageHR ? num(s.averageHR) + " bpm" : "-"],
           ["最大心率", s.maxHR ? num(s.maxHR) + " bpm" : "-"], ["热量", s.calories ? num(s.calories) + " kcal" : "-"],
           ["训练负荷", s.activityTrainingLoad ? num(s.activityTrainingLoad) : "-"]].filter(function (c) { return c[1] !== "-"; })
        : cards;
      const fetched = detail && detail.fetched_at
        ? h("p", { className: "pmw-plugin-hint" }, "数据取自 Garmin：" + shortTime(detail.fetched_at) +
            (detail.missing && detail.missing.length ? "；这次活动没有：" + detail.missing.map(missingName).join("、") : ""))
        : null;
      const correctionNote = corrected
        ? h("div", { className: "gc-note gc-note-row" },
            h("span", null, "已按跑步机速度校正：距离 " + fmtDistance(s.distance) + "（Garmin 原始 " + fmtDistance(s._origDistance) + "）；概要、分段、曲线和 AI 分析同口径。这只改本地，Garmin 上还是原始数据。"),
            h("button", { className: "pmw-plugin-button", type: "button", onClick: presetCorrection,
              title: "Garmin 不允许改距离；可以把校正结果写进描述，并把类型改成跑步机" }, "写入 Garmin 描述"))
        : null;

      let body = null;
      if (detail && tab === "overview") {
        // 数据中心版式：左路线、右总览（前三项大字指标块 + 其余指标），下面天气、描述、分组详细数据
        const hasMap = detail.track && detail.track.length > 1;
        const top = shownCards.slice(0, 3).map(function (c) { const p = splitUnit(c[1]); return { label: c[0], value: p[0], unit: p[1] }; });
        const rest = shownCards.slice(3);
        const summaryPanel = h(KPanel, { title: "运动总览", className: "gc-ksummary" },
          h(KTiles, { items: top, active: 0 }),
          rest.length ? h("div", { className: "gc-kmetrics" }, rest.map(function (c) {
            const p = splitUnit(c[1]);
            return h("div", { className: "gc-kmetric", key: c[0] },
              h("span", null, c[0]), h("b", null, p[0], p[1] ? h("small", null, p[1]) : null));
          })) : null,
          !hasMap && !strength ? h("p", { className: "pmw-plugin-hint" }, indoor ? "室内跑步没有路线。" : "这次活动没有 GPS 轨迹。") : null);
        body = h("div", { className: "gc-tab-body" },
          correctionNote,
          h("div", { className: "gc-kgrid gc-kgrid-detail" + (hasMap ? "" : " gc-kgrid-nomap") },
            hasMap ? h(KPanel, { title: "路线", className: "gc-kmap" }, h(RouteMap, {
              track: detail.track, source: resp.map_source || "amap",
              laps: corrected ? [] : lapViews, rawLaps: laps, totalDist: s.distance,
              activeLap: activeLap,
              onPick: function (i) { setActiveLap(i); setTab("laps"); },
            })) : null,
            summaryPanel),
          detail.weather || detail.description
            ? h("div", { className: "gc-kgrid gc-kgrid-2" },
                detail.weather ? h(WeatherCard, { w: detail.weather }) : null,
                detail.description ? h(KPanel, { title: "描述" }, h("p", { className: "gc-desc" }, detail.description)) : null)
            : null,
          h(DataGroups, { summary: s, raw: detail.summary || {} }),
          fetched);
      } else if (detail && tab === "sets") {
        body = h(SetsSection, { sets: detail.sets || [] });
      } else if (detail && tab === "ai") {
        body = h("div", { className: "gc-tab-body" }, h(AnalysisTab, { detail: detail, indoor: indoor || corrected }));
      } else if (detail && tab === "charts") {
        body = h("div", { className: "gc-tab-body" },
          h(ChartsTab, { key: detail.activity_id, series: detail.series, indoor: indoor || corrected,
            zones: resp.hr_zones_effective || detail.hr_zones || [], zoneSource: resp.hr_zone_source }));
      } else if (detail && tab === "laps") {
        body = h("div", { className: "gc-tab-body" },
          h(LapBars, { laps: laps, lapViews: lapViews }),
          correctionNote,
          h(LapsSection, {
            laps: laps, lapViews: lapViews, indoor: indoor, edit: edit, saving: saving, corrected: corrected,
            allSpeed: allSpeed, setAllSpeed: setAllSpeed, applyAll: applyAll,
            setEdit: setEdit, startEdit: startEdit, submitEdit: submitEdit,
            activeLap: activeLap, onPick: function (i) { setActiveLap(i); },
            clear: function () { saveSpeeds({ clear: true }); },
          }));
      }

      return h("div", { className: "pmw-plugin pmw-plugin-module gc-detail" },
        h(TitleBar, {
          parent: PLUGIN_NAME,
          title: (detail && detail.name) || props.title || "活动详情",
          desc: metaBits,
          actions: [
            { label: narrow ? "返回" : "返回列表", onClick: props.onBack },
            detail ? { label: "编辑", disabled: Boolean(editing), onClick: function () { setEditing({}); } } : null,
            detail && !strength ? { label: "标记为比赛", disabled: marking, onClick: function () { markRace(); }, title: "收录到「比赛」，带出名称、日期、类别和成绩" } : null,
            { label: busy ? "读取中…" : (narrow ? "重新拉取" : "从 Garmin 重新拉取"), disabled: busy, onClick: function () { load(true); } },
          ],
        }),
        hint ? h("p", { className: "pmw-plugin-hint", role: "status" }, hint) : null,
        editing && detail ? h(EditPanel, { key: JSON.stringify(editing), detail: detail, preset: editing, onSaved: onSaved, onCancel: function () { setEditing(null); } }) : null,
        detail ? h("div", { className: "gc-tabs", role: "tablist", "aria-label": "详情分组" },
          tabs.map(function (t) {
            return h("button", {
              key: t[0], type: "button", role: "tab", "aria-selected": tab === t[0],
              className: "gc-tab" + (tab === t[0] ? " on" : ""), onClick: function () { setTab(t[0]); },
            }, t[1]);
          })) : null,
        body);
    }

    function missingName(k) {
      return { laps: "分段", hr_zones: "心率区间", weather: "天气", series: "逐点曲线" }[k] || k;
    }

    function LapsSection(p) {
      const laps = p.laps;
      if (!laps.length) {
        return h("section", null, h("h3", { className: "gc-sub" }, "分段"), h("p", { className: "pmw-plugin-hint" }, "这次活动没有分段数据"));
      }
      // 按 Garmin 的 intensityType 归类；只有一类时不分组
      const groups = {};
      laps.forEach(function (l, i) {
        const g = intensityLabel(l.intensityType);
        (groups[g] = groups[g] || []).push(i);
      });
      const names = INTENSITY_ORDER.filter(function (g) { return groups[g]; });
      const grouped = names.length > 1;
      const editing = Boolean(p.edit);

      function row(i) {
        const l = laps[i];
        const v = p.lapViews[i];
        return h("tr", {
          key: i,
          className: (v.corrected ? "gc-corrected " : "") + (p.activeLap === i ? "gc-lap-active" : ""),
          onClick: function () { if (p.onPick) p.onPick(i); },
        },
          h("td", null, String(i + 1)),
          h("td", null, h("span", { className: "gc-tag" }, intensityLabel(l.intensityType))),
          h("td", null, fmtDistance(v.dist)),
          h("td", null, fmtDuration(v.dur)),
          h("td", null, fmtPace(v.pace)),
          h("td", null, l.averageHR ? num(l.averageHR) : "-"),
          h("td", null, l.maxHR ? num(l.maxHR) : "-"),
          h("td", null, l.averageRunCadence ? num(l.averageRunCadence) : "-"),
          h("td", null, typeof l.elevationGain === "number" ? num(l.elevationGain) + " m" : "-"),
          (p.indoor || editing || p.corrected)
            ? h("td", null, editing
                ? h("input", {
                    className: "gc-speed", type: "number", min: "0", max: "30", step: "0.1", inputMode: "decimal",
                    "aria-label": "第 " + (i + 1) + " 段跑步机速度 km/h", value: p.edit[String(i)] || "",
                    onChange: function (e) { const m = Object.assign({}, p.edit); m[String(i)] = e.target.value; p.setEdit(m); },
                  })
                : (v.corrected ? num(v.speed, 1) : "-"))
            : null);
      }

      function subtotal(name, idx) {
        const t = idx.reduce(function (a, i) { const v = p.lapViews[i]; a.d += v.dist; a.s += v.dur; return a; }, { d: 0, s: 0 });
        return h("tr", { key: "sum-" + name, className: "gc-subtotal" },
          h("td", { colSpan: 2 }, name + " 小计 " + idx.length + " 段"),
          h("td", null, fmtDistance(t.d)), h("td", null, fmtDuration(t.s)),
          h("td", null, t.d > 0 ? fmtPace(t.s / (t.d / 1000)) : "-"),
          h("td", { colSpan: (p.indoor || editing || p.corrected) ? 5 : 4 }));
      }

      const body = grouped
        ? names.reduce(function (acc, g) { return acc.concat(groups[g].map(row), [subtotal(g, groups[g])]); }, [])
        : laps.map(function (_, i) { return row(i); });

      return h("section", null,
        h("div", { className: "gc-section-head" },
          h("h3", { className: "gc-sub" }, "分段（" + laps.length + " 段" + (grouped ? "，按 Garmin 原始类型归类" : "") + "）"),
          editing
            ? h("span", { className: "gc-detail-bar" },
                h("input", { className: "gc-speed", type: "number", min: "0", max: "30", step: "0.1", placeholder: "km/h",
                  "aria-label": "全部分段的跑步机速度", value: p.allSpeed, onChange: function (e) { p.setAllSpeed(e.target.value); } }),
                h("button", { className: "pmw-plugin-button", type: "button", onClick: p.applyAll }, "全部设为"),
                h("button", { className: "pmw-plugin-button", type: "button", disabled: p.saving, onClick: p.submitEdit }, p.saving ? "保存中…" : "保存校正"),
                h("button", { className: "pmw-plugin-button", type: "button", onClick: function () { p.setEdit(null); } }, "取消"))
            : h("span", { className: "gc-detail-bar" },
                h("button", { className: "pmw-plugin-button", type: "button", onClick: p.startEdit,
                  title: "跑步机上手表估的距离常常不准：按跑步机显示的速度逐段填，距离和配速按「速度 × 用时」重算" },
                  p.corrected ? "修改跑步机速度" : "按跑步机速度校正"),
                p.corrected ? h("button", { className: "pmw-plugin-button", type: "button", disabled: p.saving, onClick: p.clear }, "清除校正") : null)),
        editing ? h("p", { className: "pmw-plugin-hint" }, "填每段跑步机显示的速度（km/h），留空的段沿用 Garmin 原始距离。") : null,
        h("div", { className: "gc-scroll" }, h("table", { className: "gc-table" },
          h("thead", null, h("tr", null,
            h("th", null, "#"), h("th", null, "类型"), h("th", null, "距离"), h("th", null, "用时"), h("th", null, "配速"),
            h("th", null, "均心率"), h("th", null, "最大心率"), h("th", null, "步频"), h("th", null, "爬升"),
            (p.indoor || editing || p.corrected) ? h("th", null, "跑步机 km/h") : null)),
          h("tbody", null, body))));
    }

    function ZonesSection(props) {
      const zones = props.zones;
      const total = zones.reduce(function (t, z) { return t + (z.secsInZone || 0); }, 0);
      return h("section", null,
        h("h3", { className: "gc-sub" }, "心率区间",
          h("small", { className: "pmw-plugin-hint" }, props.zoneSource === "calibrated" ? "（本地校准）" : "（Garmin 原值）")),
        total > 0
          ? h("div", { className: "gc-zones" }, zones.map(function (z) {
              const pct = Math.round(((z.secsInZone || 0) / total) * 100);
              return h("div", { className: "gc-zone", key: z.zoneNumber },
                h("span", { className: "gc-zone-name" },
                  "区间 " + z.zoneNumber + (z.zoneLowBoundary ? "（≥" + num(z.zoneLowBoundary) + "）" : "")),
                h("span", { className: "gc-zone-bar" },
                  h("span", { className: "gc-zone-fill gc-z" + z.zoneNumber, style: { width: pct + "%" } })),
                h("span", { className: "gc-zone-time" }, fmtDuration(z.secsInZone) + " · " + pct + "%"));
            }))
          : h("p", { className: "pmw-plugin-hint" }, "这次活动没有心率区间数据"));
    }

    const WEATHER_NAMES = {
      "clear": "晴", "sunny": "晴", "mostly clear": "大致晴朗", "mostly sunny": "大致晴朗", "partly cloudy": "局部多云",
      "mostly cloudy": "多云", "cloudy": "阴", "overcast": "阴", "fog": "雾", "haze": "霾", "smoke": "烟霾",
      "drizzle": "毛毛雨", "light rain": "小雨", "rain": "雨", "heavy rain": "大雨", "showers": "阵雨",
      "rain showers": "阵雨", "thunderstorm": "雷雨", "thunderstorms": "雷雨", "snow": "雪", "light snow": "小雪",
      "sleet": "雨夹雪", "windy": "有风", "hail": "冰雹",
    };

    function weatherName(desc) {
      if (!desc) return null;
      return WEATHER_NAMES[String(desc).trim().toLowerCase()] || desc;
    }

    /** Garmin 天气接口温度是华氏度、风速是英里/时，这里换算 */
    function WeatherCard(props) {
      const w = props.w;
      const c = function (f) { return typeof f === "number" ? num((f - 32) * 5 / 9) + " °C" : null; };
      const items = [
        ["天气", weatherName(w.weatherDesc)],
        ["气温", c(w.temp)],
        ["体感", c(w.apparentTemp)],
        ["湿度", typeof w.relativeHumidity === "number" ? num(w.relativeHumidity) + " %" : null],
        ["风", typeof w.windSpeed === "number" ? (w.windDirectionCompassPoint ? String(w.windDirectionCompassPoint).toUpperCase() + " " : "") + num(w.windSpeed * 1.609) + " km/h" : null],
      ].filter(function (x) { return x[1]; });
      if (!items.length) return null;
      return h(KPanel, { title: "天气" },
        h(KTiles, { small: true, items: items.map(function (x) { const p = splitUnit(x[1]); return { label: x[0], value: p[0], unit: p[1] }; }) }));
    }

    // ---------------------------------------------------------------------------
    // 曲线：可选指标、分开 / 叠加、横轴距离 / 时间、去毛刺、暂停与停下标记、同步悬停读数
    // ---------------------------------------------------------------------------

    /**
     * 指标定义。src 是 Garmin 逐点字段；lo/hi 是合理范围（超出算毛刺）；minDev 是判定毛刺的最小偏差（避免平稳数据被误判）；
     * moving 表示人停下时这个指标没意义（停下的点画成断开）。
     */
    const METRIC_DEFS = [
      { key: "pace", src: "directSpeed", label: "配速", unit: "/km", color: "var(--gc-m-pace, #2563eb)", pace: true, minDev: 0.35 },
      { key: "hr", src: "directHeartRate", label: "心率", unit: "bpm", color: "var(--gc-m-hr, #dc2626)", lo: 35, hi: 230, minDev: 8 },
      { key: "ele", src: "directElevation", label: "海拔", unit: "m", color: "var(--gc-m-ele, #059669)", lo: -500, hi: 9000, minDev: 4 },
      { key: "cad", src: "directDoubleCadence", alt: "directRunCadence", label: "步频", unit: "步/分", color: "var(--gc-m-cad, #7c3aed)", lo: 100, hi: 260, minDev: 8, moving: true },
      { key: "pow", src: "directPower", label: "功率", unit: "W", color: "var(--gc-m-pow, #ea580c)", lo: 1, hi: 1500, minDev: 40, moving: true },
      { key: "gct", src: "directGroundContactTime", label: "触地时间", unit: "ms", color: "var(--gc-m-gct, #0891b2)", lo: 100, hi: 500, minDev: 25, moving: true },
      { key: "vo", src: "directVerticalOscillation", label: "垂直振幅", unit: "cm", color: "var(--gc-m-vo, #db2777)", lo: 2, hi: 20, minDev: 1, moving: true, digits: 1 },
      { key: "stride", src: "directStrideLength", label: "步幅", unit: "m", color: "var(--gc-m-stride, #65a30d)", lo: 0.3, hi: 2.5, minDev: 0.12, moving: true, scale: 0.01, digits: 2 },
    ];

    const STOP_SPEED = 0.6; // m/s，低于这个算停下（约 28'/km）
    const PREF_KEY = "gc-chart-prefs";

    function loadPrefs() {
      try { return JSON.parse(window.localStorage.getItem(PREF_KEY) || "{}") || {}; } catch (e) { return {}; }
    }
    function savePrefs(p) {
      try { window.localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* 存不了就算了 */ }
    }

    function median(a) {
      if (!a.length) return NaN;
      const b = a.slice().sort(function (x, y) { return x - y; });
      const m = b.length >> 1;
      return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
    }

    function isNum(v) { return typeof v === "number" && isFinite(v); }

    /** 邻近有效值的中位数（不含自己） */
    function localMedian(vals, i, win) {
      const w = [];
      for (let j = Math.max(0, i - win); j <= Math.min(vals.length - 1, i + win); j++) {
        if (j !== i && isNum(vals[j])) w.push(vals[j]);
      }
      return w.length >= 3 ? median(w) : NaN;
    }

    /**
     * 去毛刺：1) 超出合理范围的点；2) Hampel：和邻近中位数偏差超过 3 倍 MAD 且超过 minDev 的点。都用邻近中位数替换。
     * 返回 { vals, fixed }。
     */
    function despike(raw, lo, hi, minDev) {
      const vals = raw.slice();
      let fixed = 0;
      const win = 5;
      for (let i = 0; i < vals.length; i++) {
        const v = vals[i];
        if (!isNum(v)) continue;
        const out = (isNum(lo) && v < lo) || (isNum(hi) && v > hi);
        const med = localMedian(raw, i, win);
        let spike = out;
        if (!spike && isNum(med)) {
          const w = [];
          for (let j = Math.max(0, i - win); j <= Math.min(raw.length - 1, i + win); j++) if (isNum(raw[j])) w.push(Math.abs(raw[j] - med));
          const mad = median(w) * 1.4826;
          const dev = Math.abs(v - med);
          spike = dev > Math.max(3 * mad, minDev || 0);
        }
        if (spike) {
          vals[i] = isNum(med) && !(isNum(lo) && med < lo) && !(isNum(hi) && med > hi) ? med : null;
          fixed++;
        }
      }
      return { vals: vals, fixed: fixed };
    }

    /** 暂停（计时停了：总耗时涨、计时不涨）和停下（计时在走、速度近零 ≥ 10 秒） */
    function findBreaks(series, n) {
      const E = series.sumElapsedDuration, T = series.sumDuration, V = series.directSpeed;
      const pauses = [], stops = [];
      if (E && T) {
        for (let i = 1; i < n; i++) {
          if (!isNum(E[i]) || !isNum(E[i - 1]) || !isNum(T[i]) || !isNum(T[i - 1])) continue;
          const gap = (E[i] - E[i - 1]) - (T[i] - T[i - 1]);
          if (gap > 3) {
            const last = pauses[pauses.length - 1];
            if (last && last.i1 === i - 1) { last.i1 = i; last.dur += gap; } else pauses.push({ i0: i - 1, i1: i, dur: gap });
          }
        }
      }
      const clock = T || E;
      if (V && clock) {
        let s = -1;
        for (let i = 0; i <= n; i++) {
          const stopped = i < n && isNum(V[i]) && V[i] < STOP_SPEED;
          if (stopped && s < 0) s = i;
          if (!stopped && s >= 0) {
            const e = i - 1;
            const dur = (clock[Math.min(n - 1, e + 1)] || 0) - (clock[Math.max(0, s - 1)] || 0);
            // 开头结尾的零速是开表、停表前后，不算
            if (dur >= 10 && s > 0 && e < n - 1) stops.push({ i0: Math.max(0, s - 1), i1: Math.min(n - 1, e + 1), dur: dur });
            s = -1;
          }
        }
      }
      return { pauses: pauses, stops: stops };
    }

    /** 准备图表数据：横轴、各指标（去毛刺后、显示单位）、暂停与停下 */
    function prepareChart(series, opts) {
      const xRaw = opts.axis === "time" ? (series.sumElapsedDuration || series.sumDuration) : series.sumDistance;
      if (!xRaw) return null;
      const n = xRaw.length;
      const speedRaw = series.directSpeed || null;
      const moving = function (i) { return !speedRaw || !isNum(speedRaw[i]) || speedRaw[i] >= STOP_SPEED; };
      const metrics = [];
      METRIC_DEFS.forEach(function (d) {
        let src = series[d.src];
        let factor = d.scale || 1;
        if (!src && d.alt && series[d.alt]) {
          src = series[d.alt];
          const med = median(src.filter(isNum));
          if (d.key === "cad" && med < 120) factor = 2; // 单脚步频换成双脚
        }
        if (!src || !src.some(function (v) { return isNum(v) && v > 0; })) return;
        let raw = src.map(function (v, i) {
          if (!isNum(v)) return null;
          if (d.pace) return v >= STOP_SPEED ? v : null; // 停下的点不画配速
          if (d.moving && !moving(i)) return null;
          return v * factor;
        });
        // 清洗前的同口径值，供「原始数据 vs 清洗后」叠加对比；配速同样换算成秒/公里
        const rawVals = opts.keepRaw ? (d.pace ? raw.map(function (v) { return isNum(v) && v > 0 ? 1000 / v : null; }) : raw.slice()) : null;
        let fixed = 0;
        if (opts.clean) {
          let lo = d.lo, hi = d.hi;
          if (d.pace) {
            // 配速按速度处理：最快不超过 opts.fast（秒/公里），最慢不慢于 opts.slow
            hi = 1000 / (opts.fast || 150);
            lo = opts.slow ? 1000 / opts.slow : STOP_SPEED;
          }
          const r = despike(raw, lo, hi, d.minDev);
          raw = r.vals;
          fixed = r.fixed;
        }
        const vals = d.pace ? raw.map(function (v) { return isNum(v) && v > 0 ? 1000 / v : null; }) : raw;
        // 平均：配速按平均速度换算（不是配速的算术平均），其余取算术平均
        const ok = raw.filter(isNum);
        const avg = !ok.length ? NaN : d.pace ? 1000 / (ok.reduce(function (t, v) { return t + v; }, 0) / ok.length) : ok.reduce(function (t, v) { return t + v; }, 0) / ok.length;
        metrics.push({ def: d, vals: vals, rawVals: rawVals, fixed: fixed, avg: avg });
      });
      if (opts.bands) {
        const w = pointWeights(series, n);
        metrics.forEach(function (m) { m.bands = segmentBands(m.vals, w, m.def.key); });
      }
      const br = findBreaks(series, n);
      return { x: xRaw, n: n, axis: opts.axis, metrics: metrics, pauses: br.pauses, stops: br.stops };
    }

    // ---- 波动区间：每个指标 80% 时间所在的范围（P10～P90，按时长加权）；前后水平差异明显时分段各算 ----

    /** 判定「分段」的最小差（两段均值差超过它才切）；海拔不分段 */
    const SEG_THRESHOLD = { pace: 20, hr: 8, cad: 6, pow: 25, gct: 15, vo: 0.8, stride: 0.08 };

    /** 每个点代表的时长（秒）：用计时时长的差，没有就当 1 */
    function pointWeights(series, n) {
      const T = series.sumDuration || series.sumElapsedDuration;
      const w = new Array(n).fill(1);
      if (!T) return w;
      for (let i = 0; i < n; i++) {
        const a = T[i], b = i > 0 ? T[i - 1] : null, c = i < n - 1 ? T[i + 1] : null;
        let d = isNum(a) && isNum(b) ? a - b : (isNum(a) && isNum(c) ? c - a : 1);
        // 暂停跨过去的那一段不算进时长
        w[i] = isNum(d) && d > 0 && d < 120 ? d : (isNum(d) && d >= 120 ? 0 : 1);
      }
      return w;
    }

    function wQuantile(pairs, q) {
      const total = pairs.reduce(function (t, p) { return t + p[1]; }, 0);
      if (!total) return NaN;
      let acc = 0;
      for (let i = 0; i < pairs.length; i++) {
        acc += pairs[i][1];
        if (acc >= q * total) return pairs[i][0];
      }
      return pairs[pairs.length - 1][0];
    }

    /** 一段（下标 i0..i1）的区间：P10～P90、落在区间里的时长、这段总时长、均值 */
    function bandOf(vals, w, i0, i1) {
      const pairs = [];
      for (let i = i0; i <= i1; i++) if (isNum(vals[i]) && w[i] > 0) pairs.push([vals[i], w[i]]);
      if (pairs.length < 5) return null;
      const sorted = pairs.slice().sort(function (a, b) { return a[0] - b[0]; });
      const lo = wQuantile(sorted, 0.1), hi = wQuantile(sorted, 0.9);
      let inBand = 0, total = 0, sum = 0;
      pairs.forEach(function (p) {
        total += p[1];
        sum += p[0] * p[1];
        if (p[0] >= lo && p[0] <= hi) inBand += p[1];
      });
      return { i0: i0, i1: i1, lo: lo, hi: hi, inBand: inBand, total: total, mean: sum / total };
    }

    /** 找最佳切点：两边加权均值差最大，且两边都不少于总点数的 15%；差不到阈值不切 */
    function bestSplit(vals, w, a, b, threshold, minLen) {
      const idx = [];
      for (let i = a; i <= b; i++) if (isNum(vals[i]) && w[i] > 0) idx.push(i);
      if (idx.length < minLen * 2) return null;
      // 前缀和，O(n)
      const sw = [0], sv = [0];
      idx.forEach(function (i, k) { sw.push(sw[k] + w[i]); sv.push(sv[k] + vals[i] * w[i]); });
      const n = idx.length;
      let best = null;
      for (let k = minLen; k <= n - minLen; k++) {
        const ml = sv[k] / sw[k], mr = (sv[n] - sv[k]) / (sw[n] - sw[k]);
        const diff = Math.abs(ml - mr);
        if (!best || diff > best.diff) best = { k: idx[k], diff: diff };
      }
      return best && best.diff >= threshold ? best : null;
    }

    /** 分段（最多 3 段）+ 每段区间 */
    function segmentBands(vals, w, key) {
      const n = vals.length;
      const valid = vals.filter(isNum).length;
      const threshold = SEG_THRESHOLD[key];
      const minLen = Math.max(15, Math.floor(valid * 0.15));
      let cuts = [];
      if (isNum(threshold)) {
        const first = bestSplit(vals, w, 0, n - 1, threshold, minLen);
        if (first) {
          cuts.push(first);
          const left = bestSplit(vals, w, 0, first.k - 1, threshold, minLen);
          const right = bestSplit(vals, w, first.k, n - 1, threshold, minLen);
          // 最多再切一刀：两边里差得更多的那边
          const more = [left, right].filter(Boolean).sort(function (x, y) { return y.diff - x.diff; })[0];
          if (more) cuts.push(more);
        }
      }
      cuts = cuts.map(function (c) { return c.k; }).sort(function (x, y) { return x - y; });
      const bounds = [0].concat(cuts, [n]);
      const segs = [];
      for (let j = 0; j < bounds.length - 1; j++) {
        const b = bandOf(vals, w, bounds[j], bounds[j + 1] - 1);
        if (b) segs.push(b);
      }
      return segs;
    }

    /** 配速后段比前段慢 30 秒/公里以上、且发生在全程过半之后，算跑崩；返回出现跑崩的段下标 */
    function collapseIndex(segs, n) {
      for (let j = 1; j < segs.length; j++) {
        if (segs[j].mean - segs[j - 1].mean >= 30 && segs[j].i0 >= n * 0.5) return j;
      }
      return -1;
    }

    function bandText(d, b, unitSuffix) {
      return fmtMetric(d, b.lo) + "～" + fmtMetric(d, b.hi) + unitSuffix;
    }

    /** 一个指标的区间说明，图下和 AI 分析共用 */
    function bandSummary(m, prep) {
      const segs = m.bands || [];
      if (!segs.length) return "";
      const u = m.def.pace ? paceUnitLabel() : " " + m.def.unit;
      if (segs.length === 1) {
        const b = segs[0];
        return "主要区间 " + bandText(m.def, b, u) + "，占 " + Math.round(b.inBand / b.total * 100) + "% 时间（" + fmtDuration(b.inBand) + "）";
      }
      const col = m.def.pace ? collapseIndex(segs, prep.n) : -1;
      return segs.map(function (b, j) {
        const range = xText(prep.axis, prep.x[b.i0]) + "～" + xText(prep.axis, prep.x[Math.min(prep.n - 1, b.i1)]);
        let s = "第 " + (j + 1) + " 段（" + range + "）" + bandText(m.def, b, u) + "，平均 " + fmtMetric(m.def, b.mean) + u + "，" + fmtDuration(b.total);
        if (j === col) s += "；跑崩：比上一段慢 " + paceText(b.mean - segs[j - 1].mean) + paceUnitLabel();
        return s;
      }).join("；");
    }

    /**
     * 去毛刺的配速上限：按这次数据的快端 P5 和目标配速自动算，不再写死 150 秒/公里（2'30"/km）。
     * 目标配速更快的，按目标留 10 秒余量；没有逐点数据时给一个宽松上限。
     */
    function autoFastPace(series, goalPaceSec) {
      const speeds = ((series && series.directSpeed) || []).filter(function (v) { return isNum(v) && v >= STOP_SPEED; });
      const paces = speeds.map(function (v) { return 1000 / v; }).sort(function (a, b) { return a - b; });
      let fast = paces.length ? paces[Math.min(paces.length - 1, Math.floor(paces.length * 0.05))] - 10 : 300;
      if (isNum(goalPaceSec) && goalPaceSec > 0) fast = Math.min(fast, goalPaceSec - 10);
      return Math.round(Math.max(180, Math.min(900, fast)));
    }

    /** 给 AI 分析的曲线摘要：配速、心率、步频等的区间与分段，加暂停和停下 */
    function chartInsights(series, indoor, goalPaceSec) {
      if (!series) return "";
      // 和图表同口径：跑步机默认不清洗，避免 Hampel 把匀速中的真实波动抹平后再喂给模型
      const clean = indoor ? loadPrefs().cleanIndoor === true : loadPrefs().clean !== false;
      const prep = prepareChart(series, { axis: indoor || !seriesHasDistance(series) ? "time" : "distance", clean: clean, fast: autoFastPace(series, goalPaceSec), slow: 0, bands: true });
      if (!prep) return "";
      const lines = prep.metrics.filter(function (m) { return m.def.key !== "ele" || true; }).map(function (m) {
        const s = bandSummary(m, prep);
        return s ? m.def.label + "：" + s : "";
      }).filter(Boolean);
      const pt = prep.pauses.reduce(function (t, b) { return t + b.dur; }, 0);
      const st = prep.stops.reduce(function (t, b) { return t + b.dur; }, 0);
      lines.push("暂停 " + prep.pauses.length + " 次" + (pt ? "，共 " + fmtDuration(pt) : "") + "；计时未停但停下 " + prep.stops.length + " 次" + (st ? "，共 " + fmtDuration(st) : ""));
      return lines.join("\n");
    }

    function fmtMetric(d, v) {
      if (!isNum(v)) return "-";
      if (d.pace) return paceText(v);
      return num(v, d.digits);
    }

    function xText(axis, v) {
      if (!isNum(v)) return "-";
      return axis === "time" ? fmtDuration(v) : (v / 1000).toFixed(2) + " km";
    }

    /** 纵轴范围：1%～99% 分位，上下留 6% */
    function yRange(vals) {
      const a = vals.filter(isNum).sort(function (x, y) { return x - y; });
      if (!a.length) return [0, 1];
      let lo = a[Math.floor(a.length * 0.01)], hi = a[Math.min(a.length - 1, Math.ceil(a.length * 0.99) - 1)];
      if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
      const pad = (hi - lo) * 0.06;
      return [lo - pad, hi + pad];
    }

    function pathFor(prep, vals, sx, sy) {
      let d = "", pen = false;
      for (let i = 0; i < prep.n; i++) {
        const x = prep.x[i], v = vals[i];
        if (!isNum(x) || !isNum(v)) { pen = false; continue; }
        d += (pen ? "L" : "M") + sx(x).toFixed(1) + "," + sy(v).toFixed(1);
        pen = true;
      }
      return d;
    }

    /** 一张图：metrics 里一个（分开）或多个（叠加，各自归一化） */
    function ChartSvg(props) {
      const prep = props.prep, ms = props.metrics;
      const [ref, cw] = useChartWidth(isNarrow() ? 380 : 760);
      const W = Math.max(240, cw);
      const H = props.narrowHeight && isNarrow() ? props.narrowHeight : props.height;
      const padL = props.overlay ? 10 : 46, padR = 10, padT = 10, padB = 22;
      const xs = prep.x.filter(isNum);
      const xmin = xs[0], xmax = xs[xs.length - 1] || 1;
      const sx = function (x) { return padL + ((x - xmin) / ((xmax - xmin) || 1)) * (W - padL - padR); };
      const scales = ms.map(function (m) {
        const r = yRange(m.vals);
        // 配速越快（数值小）越靠上
        return function (v) {
          const t = (v - r[0]) / (r[1] - r[0]);
          return m.def.pace ? padT + t * (H - padT - padB) : H - padB - t * (H - padT - padB);
        };
      });
      const ranges = ms.map(function (m) { return yRange(m.vals); });
      // 纵轴按 1%～99% 分位定范围，极端值（如补给站慢走）会超出：线裁在绘图区内
      const clipRef = useRef("gc-clip-" + Math.random().toString(36).slice(2, 9));
      const clipId = clipRef.current;

      function onMove(e) {
        const el = ref.current;
        if (!el) return;
        const box = el.getBoundingClientRect();
        const fx = ((e.clientX - box.left) / box.width) * W;
        const xv = xmin + ((fx - padL) / (W - padL - padR)) * (xmax - xmin);
        // x 单调递增，二分找最近点
        let lo = 0, hi = prep.n - 1;
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (!isNum(prep.x[mid]) || prep.x[mid] < xv) lo = mid; else hi = mid;
        }
        props.setHover(Math.abs((prep.x[hi] || 0) - xv) < Math.abs((prep.x[lo] || 0) - xv) ? hi : lo);
      }

      const hv = props.hover;
      const band = function (b, cls) {
        const x0 = sx(prep.x[b.i0]), x1 = sx(prep.x[b.i1]);
        const w = Math.max(2, x1 - x0);
        return h("rect", { key: cls + b.i0, x: x1 - x0 < 2 ? x0 - 1 : x0, y: padT, width: w, height: H - padT - padB, className: cls },
          h("title", null, (cls === "gc-pause" ? "暂停 " : "停下 ") + fmtDuration(b.dur)));
      };
      return h("svg", {
        ref: ref, viewBox: "0 0 " + W + " " + H, className: "gc-chart-svg", role: "img", style: { height: H + "px" },
        "aria-label": ms.map(function (m) { return m.def.label; }).join("、") + "曲线",
        onMouseMove: onMove, onMouseLeave: function () { props.setHover(null); },
        onTouchStart: function (e) { if (e.touches[0]) onMove(e.touches[0]); },
        onTouchMove: function (e) { if (e.touches[0]) onMove(e.touches[0]); },
      },
        h("defs", null, h("clipPath", { id: clipId }, h("rect", { x: padL, y: padT - 2, width: W - padL - padR, height: H - padT - padB + 4 }))),
        prep.pauses.map(function (b) { return band(b, "gc-pause"); }),
        prep.stops.map(function (b) { return band(b, "gc-stop"); }),
        // 波动区间：每段一块浅色带（分开显示时画；叠加时太乱不画）
        !props.overlay && props.showBands && ms[0].bands ? h("g", { clipPath: "url(#" + clipId + ")", pointerEvents: "none" }, ms[0].bands.map(function (b, j) {
          const x0 = sx(prep.x[b.i0]), x1 = sx(prep.x[Math.min(prep.n - 1, b.i1)]);
          const y0 = scales[0](b.lo), y1 = scales[0](b.hi);
          return h("rect", { key: "band" + j, x: x0, width: Math.max(1, x1 - x0), y: Math.min(y0, y1), height: Math.abs(y1 - y0),
            fill: ms[0].def.color, opacity: 0.12 });
        })) : null,
        h("line", { x1: padL, x2: W - padR, y1: H - padB, y2: H - padB, className: "gc-grid" }),
        !props.overlay ? [0, 1].map(function (k) {
          const v = ranges[0][k];
          return h("text", { key: "y" + k, x: padL - 6, y: scales[0](v) + 4, className: "gc-axis", textAnchor: "end" }, fmtMetric(ms[0].def, v));
        }) : null,
        // 平均线（虚线，颜色同指标）；分开显示时在右端标数值
        ms.map(function (m, j) {
          if (!isNum(m.avg)) return null;
          const y = scales[j](m.avg);
          return h("g", { key: "avg-" + m.def.key, pointerEvents: "none" },
            h("line", { x1: padL, x2: W - padR, y1: y, y2: y, stroke: m.def.color, strokeWidth: 1, strokeDasharray: "5 4", opacity: 0.85 }),
            !props.overlay ? h("text", { x: W - padR - 2, y: y - 4, className: "gc-axis gc-avgtext", textAnchor: "end", fill: m.def.color }, "平均 " + fmtMetric(m.def, m.avg)) : null);
        }),
        h("g", { clipPath: "url(#" + clipId + ")" }, ms.map(function (m, j) {
          // 原始数据先画、细灰线；清洗后的线盖在上面，差异一眼能看见
          return h("g", { key: m.def.key },
            props.showRaw && m.rawVals ? h("path", { d: pathFor(prep, m.rawVals, sx, scales[j]), fill: "none", stroke: "var(--gc-axis, #94a3b8)", strokeWidth: 1, opacity: 0.55 }) : null,
            h("path", { d: pathFor(prep, m.vals, sx, scales[j]), fill: "none", stroke: m.def.color, strokeWidth: 1.6, strokeLinejoin: "round" }));
        })),
        hv != null && isNum(prep.x[hv]) ? h("g", null,
          h("line", { x1: sx(prep.x[hv]), x2: sx(prep.x[hv]), y1: padT, y2: H - padB, className: "gc-cross" }),
          ms.map(function (m, j) {
            const v = m.vals[hv];
            return isNum(v) ? h("circle", { key: m.def.key, cx: sx(prep.x[hv]), cy: scales[j](v), r: 3.5, fill: m.def.color, stroke: "var(--gc-card, #fff)", strokeWidth: 1.5 }) : null;
          })) : null,
        h("text", { x: padL, y: H - 6, className: "gc-axis" }, xText(prep.axis, xmin)),
        h("text", { x: (padL + W - padR) / 2, y: H - 6, className: "gc-axis", textAnchor: "middle" }, xText(prep.axis, (xmin + xmax) / 2)),
        h("text", { x: W - padR, y: H - 6, className: "gc-axis", textAnchor: "end" }, xText(prep.axis, xmax)));
    }

    /** 有没有真实的距离数据：力量训练等没有 GPS / 步数距离的活动 sumDistance 是一串 0，不能按距离画 */
    function seriesHasDistance(series) {
      const d = series && series.sumDistance;
      if (!Array.isArray(d) || !d.length) return false;
      let max = 0;
      for (let i = 0; i < d.length; i++) if (isNum(d[i]) && d[i] > max) max = d[i];
      return max > 50;
    }

    function ChartsTab(props) {
      const series = props.series || {};
      const hasDist = seriesHasDistance(series);
      const prefs0 = loadPrefs();
      const [sel, setSel] = useState(prefs0.sel || ["pace", "hr", "ele"]);
      const [mode, setMode] = useState(prefs0.mode || "split");
      const [axis, setAxis] = useState(props.indoor || !hasDist ? "time" : (prefs0.axis || "distance"));
      // 跑步机匀速场景下 Hampel 去毛刺容易把真实波动当异常抹平，室内默认不清洗
      const [clean, setClean] = useState(props.indoor ? prefs0.cleanIndoor === true : prefs0.clean !== false);
      const [showRaw, setShowRaw] = useState(prefs0.showRaw === true);
      const [showBands, setShowBands] = useState(prefs0.bands !== false);
      // 配速范围存成秒/公里（0 表示不限）；旧版本存过 "4'30" 文本的，忽略
      const [fast, setFast] = useState(typeof prefs0.fastSec === "number" ? prefs0.fastSec : 0);
      const [slow, setSlow] = useState(typeof prefs0.slowSec === "number" ? prefs0.slowSec : 0);
      const [hover, setHover] = useState(null);

      useEffect(function () {
        savePrefs({ sel: sel, mode: mode, axis: props.indoor ? prefs0.axis : axis,
          clean: props.indoor ? prefs0.clean : clean, cleanIndoor: props.indoor ? clean : prefs0.cleanIndoor,
          showRaw: showRaw, fastSec: fast, slowSec: slow, bands: showBands });
      }, [sel, mode, axis, clean, showRaw, fast, slow, showBands]);

      const prep = prepareChart(series, { axis: axis, clean: clean, keepRaw: showRaw, fast: fast || autoFastPace(series), slow: slow || 0, bands: true });
      if (!prep || !prep.metrics.length) return h("p", { className: "pmw-plugin-hint" }, "这次活动没有逐点数据，画不了曲线。");

      const avail = prep.metrics.map(function (m) { return m.def.key; });
      const chosen = prep.metrics.filter(function (m) { return sel.indexOf(m.def.key) >= 0; });
      const shown = chosen.length ? chosen : prep.metrics.slice(0, 1);
      const toggle = function (k) {
        setSel(sel.indexOf(k) >= 0 ? sel.filter(function (x) { return x !== k; }) : sel.concat([k]));
      };
      const pauseTotal = prep.pauses.reduce(function (t, b) { return t + b.dur; }, 0);
      const stopTotal = prep.stops.reduce(function (t, b) { return t + b.dur; }, 0);
      const fixedTotal = shown.reduce(function (t, m) { return t + m.fixed; }, 0);

      return h("div", { className: "gc-charts-tab" },
        h("div", { className: "gc-chips", role: "group", "aria-label": "选择指标" },
          prep.metrics.map(function (m) {
            const on = sel.indexOf(m.def.key) >= 0;
            return h("button", {
              key: m.def.key, type: "button", className: "gc-chip" + (on ? " on" : ""), "aria-pressed": on,
              style: on ? { borderColor: m.def.color, color: m.def.color } : null,
              onClick: function () { toggle(m.def.key); },
            }, h("span", { className: "gc-dot", style: { background: m.def.color } }), m.def.label);
          })),
        h("div", { className: "gc-controls" },
          h(Seg, { label: "显示方式", value: mode, onChange: setMode, options: [["split", "分开"], ["overlay", "叠加"]] }),
          hasDist ? h(Seg, { label: "横轴", value: axis, onChange: setAxis, options: [["distance", "按距离"], ["time", "按时间"]] }) : null,
          h("label", { className: "pmw-plugin-check gc-inline" },
            h("input", { type: "checkbox", checked: clean, onChange: function (e) { setClean(e.target.checked); } }), " 去除异常值"),
          h("label", { className: "pmw-plugin-check gc-inline", title: "叠加未清洗的原始数据，和清洗后的线对比" },
            h("input", { type: "checkbox", checked: showRaw, onChange: function (e) { setShowRaw(e.target.checked); } }), " 对比原始"),
          h("label", { className: "pmw-plugin-check gc-inline", title: "80% 时间所在的数值范围；前后水平差异明显时分段各算" },
            h("input", { type: "checkbox", checked: showBands, onChange: function (e) { setShowBands(e.target.checked); } }), " 波动区间"),
          clean && avail.indexOf("pace") >= 0 ? h("span", { className: "gc-inline" },
            "配速范围",
            h(PaceInput, { label: "最快", value: fast, onChange: setFast, placeholder: "自动" }),
            "～",
            h(PaceInput, { label: "最慢", value: slow, onChange: setSlow, placeholder: "不限" }),
            fast || slow ? h("button", { type: "button", className: "gc-link", onClick: function () { setFast(0); setSlow(0); } }, "清空") : null) : null),
        // 读数条：悬停时显示这一点各指标的值
        h("div", { className: "gc-readout", "aria-live": "polite" },
          hover != null
            ? [h("strong", { key: "x" }, xText(prep.axis, prep.x[hover]))].concat(shown.map(function (m) {
                return h("span", { key: m.def.key }, h("span", { className: "gc-dot", style: { background: m.def.color } }),
                  m.def.label + " " + fmtMetric(m.def, m.vals[hover]) + (m.def.pace ? paceUnitLabel() : " " + m.def.unit));
              }))
            : h("span", { className: "pmw-plugin-hint" }, isNarrow() ? "点图上任意位置看那一点的数值" : "把鼠标移到图上看每个点的数值")),
        mode === "overlay"
          ? h("div", { className: "gc-chart-box" },
              h("div", { className: "gc-chart-title gc-overlay-avg" }, shown.map(function (m) {
                return h("span", { key: m.def.key }, h("span", { className: "gc-dot", style: { background: m.def.color } }),
                  m.def.label + " 平均 " + fmtMetric(m.def, m.avg) + (m.def.pace ? paceUnitLabel() : " " + m.def.unit));
              }), h("small", null, "虚线为平均值，各指标各用各的刻度")),
              h(ChartSvg, { prep: prep, metrics: shown, overlay: true, height: 300, narrowHeight: 240, hover: hover, setHover: setHover, showRaw: showRaw }))
          : shown.map(function (m) {
              return h("div", { className: "gc-chart-box", key: m.def.key },
                h("div", { className: "gc-chart-title" }, h("span", { className: "gc-dot", style: { background: m.def.color } }),
                  m.def.label + "  平均 " + fmtMetric(m.def, m.avg) + (m.def.pace ? paceUnitLabel() : " " + m.def.unit),
                  h("small", null, m.def.pace ? "（越靠上越快）" : "")),
                h(ChartSvg, { prep: prep, metrics: [m], overlay: false, height: 140, narrowHeight: 150, hover: hover, setHover: setHover, showBands: showBands, showRaw: showRaw }),
                showBands && bandSummary(m, prep) ? h("p", { className: "gc-band-note" + (m.def.pace && collapseIndex(m.bands, prep.n) >= 0 ? " gc-collapse" : "") }, bandSummary(m, prep)) : null);
            }),
        h("p", { className: "pmw-plugin-hint gc-legend" },
          h("span", null, h("i", { className: "gc-swatch gc-pause" }), "暂停 " + prep.pauses.length + " 次" + (pauseTotal ? "，共 " + fmtDuration(pauseTotal) : "")),
          h("span", null, h("i", { className: "gc-swatch gc-stop" }), "停下（计时未停） " + prep.stops.length + " 次" + (stopTotal ? "，共 " + fmtDuration(stopTotal) : "")),
          clean ? h("span", null, "已修正异常点 " + fixedTotal + " 个") : h("span", null, "显示原始数据"),
          showRaw ? h("span", null, h("i", { className: "gc-swatch gc-raw" }), "细灰线为原始数据") : null,
          prep.axis === "distance" && (prep.pauses.length || prep.stops.length) ? h("span", null, "按距离看时暂停是一条竖线，切到按时间看能看到时长") : null),
        h(MetricTable, { metrics: shown, clean: clean, prep: prep }),
        h(ZonesSection, { zones: props.zones || [], zoneSource: props.zoneSource }));
    }

    /** 配速输入：分、秒两个数字框，状态值是秒/公里，0 表示不限 */
    function PaceInput(props) {
      usePaceUnit();
      const scale = paceUnit === "mile" ? 1.609344 : 1;
      const v = (props.value || 0) * scale;
      const [m, setM] = useState(v ? String(Math.floor(v / 60)) : "");
      const [s, setS] = useState(v ? String(Math.round(v % 60)) : "");
      useEffect(function () {
        // 外部清空或单位切换时同步显示值
        if (v) { setM(String(Math.floor(v / 60))); setS(String(Math.round(v % 60))); }
        else { setM(""); setS(""); }
      }, [props.value, paceUnit]);
      const push = function (mm, ss) {
        const mi = parseInt(mm, 10), se = parseInt(ss, 10);
        const total = (isNaN(mi) ? 0 : mi) * 60 + (isNaN(se) ? 0 : Math.min(59, se));
        props.onChange(total > 0 ? Math.round(total / scale) : 0);
      };
      return h("span", { className: "gc-pace-input", title: props.label + "配速（" + paceUnitLabel() + "），" + props.placeholder },
        h("small", null, props.label),
        h("input", { type: "number", min: "1", max: "30", inputMode: "numeric", value: m, placeholder: props.label === "最快" ? "2" : "",
          "aria-label": props.label + "配速的分钟", onChange: function (e) { setM(e.target.value); push(e.target.value, s); } }),
        h("small", null, "分"),
        h("input", { type: "number", min: "0", max: "59", inputMode: "numeric", value: s, placeholder: props.label === "最快" ? "30" : "",
          "aria-label": props.label + "配速的秒", onChange: function (e) { setS(e.target.value); push(m, e.target.value); } }),
        h("small", null, "秒" + paceUnitLabel()));
    }

    /** 各指标的最低 / 平均 / 最高（用去毛刺后的值） */
    function MetricTable(props) {
      return h("div", { className: "gc-scroll" }, h("table", { className: "gc-table" },
        h("thead", null, h("tr", null, h("th", null, "指标"), h("th", { className: "num" }, "最小"), h("th", { className: "num" }, "平均"),
          h("th", { className: "num" }, "最大"), h("th", null, "主要区间（80% 时间）"), props.clean ? h("th", { className: "num" }, "修正点") : null)),
        h("tbody", null, props.metrics.map(function (m) {
          const a = m.vals.filter(isNum);
          const avg = a.length ? (m.def.pace ? 1000 / (a.reduce(function (t, v) { return t + 1000 / v; }, 0) / a.length) : a.reduce(function (t, v) { return t + v; }, 0) / a.length) : NaN;
          const lo = a.length ? Math.min.apply(null, a) : NaN, hi = a.length ? Math.max.apply(null, a) : NaN;
          const u = m.def.pace ? paceUnitLabel() : " " + m.def.unit;
          return h("tr", { key: m.def.key },
            h("td", null, h("span", { className: "gc-dot", style: { background: m.def.color } }), m.def.label),
            // 配速的数值是秒/公里，最小即最快
            h("td", { className: "num" }, fmtMetric(m.def, lo) + u + (m.def.pace ? "（最快）" : "")),
            h("td", { className: "num" }, fmtMetric(m.def, avg) + u),
            h("td", { className: "num" }, fmtMetric(m.def, hi) + u + (m.def.pace ? "（最慢）" : "")),
            h("td", null, (m.bands || []).length > 1
              ? m.bands.map(function (b, j) { return "第 " + (j + 1) + " 段 " + bandText(m.def, b, u); }).join("；")
              : (m.bands && m.bands[0] ? bandText(m.def, m.bands[0], u) + "（" + fmtDuration(m.bands[0].inBand) + "）" : "-")),
            props.clean ? h("td", { className: "num" }, String(m.fixed)) : null);
        }))));
    }

    /** 分段配速柱状图：宽度按用时、高度按速度（越高越快），颜色按 Garmin 的分段类型；悬停看这一段，标最快、最慢，虚线为平均 */
    function LapBars(props) {
      const views = props.lapViews, laps = props.laps;
      const [hv, setHv] = useState(null);
      if (!views.length) return null;
      const narrow = isNarrow();
      const [ref, cw] = useChartWidth(narrow ? 380 : 760);
      const W = Math.max(240, cw), H = 190, padL = 8, padR = 8, padT = 22, padB = 22;
      const total = views.reduce(function (t, v) { return t + (v.dur || 0); }, 0) || 1;
      const speeds = views.map(function (v) { return v.pace > 0 ? 1000 / v.pace : 0; });
      // 最快 / 最慢：不算不满 200 米的零头段和休息段
      const eligible = views.map(function (v, i) {
        return v.dist >= 200 && speeds[i] > 0 && intensityLabel(laps[i].intensityType) !== "休息";
      });
      let fast = -1, slow = -1;
      speeds.forEach(function (sp, i) {
        if (!eligible[i]) return;
        if (fast < 0 || sp > speeds[fast]) fast = i;
        if (slow < 0 || sp < speeds[slow]) slow = i;
      });
      const totDist = views.reduce(function (t, v) { return t + (v.dist || 0); }, 0);
      const avgPace = totDist > 0 ? total / (totDist / 1000) : 0;
      const avgSpeed = avgPace > 0 ? 1000 / avgPace : 0;
      const max = Math.max.apply(null, speeds.concat([avgSpeed])) || 1;
      const pos = speeds.filter(function (v) { return v > 0; });
      const min = pos.length ? Math.min.apply(null, pos) : 0;
      // 纵轴起点：各段速度差很小时（如跑步机全部校正成同一速度）从最快的 60% 起，不然柱子全是 0 高
      const span = max - min;
      const base = span < max * 0.05 ? max * 0.6 : Math.max(0, min - span * 0.6);
      const yOf = function (sp) { return H - padB - (sp > 0 ? ((sp - base) / (max - base || 1)) * (H - padT - padB) : 0); };
      const bars = [];
      let x = padL;
      views.forEach(function (v, i) {
        const w = Math.max(3, ((v.dur || 0) / total) * (W - padL - padR) - 2);
        bars.push({ i: i, x: x, w: w });
        x += w + 2;
      });
      const lap = hv != null ? laps[hv] : null, lv = hv != null ? views[hv] : null;
      const tag = function (i) { return i === fast ? "最快" : i === slow ? "最慢" : ""; };

      return h("figure", { className: "gc-chart-box" },
        h("div", { className: "gc-chart-title" }, "每段配速", h("small", null, "（宽度按用时，越高越快；虚线是平均配速）")),
        h("div", { className: "gc-readout", "aria-live": "polite" },
          lv
            ? [
                h("strong", { key: "n" }, "第 " + (hv + 1) + " 段" + (tag(hv) ? "（" + tag(hv) + "）" : "")),
                h("span", { key: "t" }, intensityLabel(lap.intensityType)),
                h("span", { key: "d" }, "距离 " + fmtDistance(lv.dist)),
                h("span", { key: "u" }, "用时 " + fmtDuration(lv.dur)),
                h("span", { key: "p" }, "配速 " + fmtPace(lv.pace)),
                h("span", { key: "s" }, "速度 " + (lv.pace > 0 ? num(3600 / lv.pace, 1) + " km/h" : "-")),
                lap.averageHR ? h("span", { key: "h" }, "心率 " + num(lap.averageHR) + (lap.maxHR ? " / 最大 " + num(lap.maxHR) : "") + " bpm") : null,
                lap.averageRunCadence ? h("span", { key: "c" }, "步频 " + num(lap.averageRunCadence)) : null,
              ]
            : h("span", { className: "pmw-plugin-hint" }, narrow ? "点柱子看这一段的数据" : "把鼠标移到柱子上看这一段的数据")),
        h("svg", { ref: ref, viewBox: "0 0 " + W + " " + H, className: "gc-chart-svg", role: "img", style: { height: H + "px" }, "aria-label": "每段配速",
          onMouseLeave: function () { setHv(null); } },
          bars.map(function (b) {
            const i = b.i, v = views[i];
            const y = yOf(speeds[i]);
            const cls = "gc-lapbar gc-int-" + intensityClass(laps[i].intensityType) + (hv === i ? " on" : "") + (hv != null && hv !== i ? " dim" : "");
            return h("g", { key: i },
              // 整列都能触发悬停，矮柱子也好指
              h("rect", { x: b.x, y: padT, width: b.w + 2, height: H - padT - padB, fill: "transparent",
                onMouseEnter: function () { setHv(i); }, onClick: function () { setHv(i); } }),
              h("rect", { x: b.x, y: y, width: b.w, height: H - padB - y, rx: 2, className: cls, pointerEvents: "none" }),
              tag(i) ? h("text", { x: b.x + b.w / 2, y: y - 5, className: "gc-axis gc-lap-tag", textAnchor: "middle" }, tag(i)) : null,
              b.w > 14 ? h("text", { x: b.x + b.w / 2, y: H - 6, className: "gc-axis", textAnchor: "middle" }, String(i + 1)) : null);
          }),
          avgSpeed > 0 ? h("g", { pointerEvents: "none" },
            h("line", { x1: padL, x2: W - padR, y1: yOf(avgSpeed), y2: yOf(avgSpeed), className: "gc-avgline" }),
            h("text", { x: W - padR, y: yOf(avgSpeed) - 4, className: "gc-axis gc-avgtext", textAnchor: "end" }, "平均 " + fmtPace(avgPace))) : null),
        h("div", { className: "gc-lap-summary" },
          fast >= 0 ? h("span", null, h("em", null, "最快"), "第 " + (fast + 1) + " 段 " + fmtPace(views[fast].pace) + "（" + num(3600 / views[fast].pace, 1) + " km/h）") : null,
          slow >= 0 && slow !== fast ? h("span", null, h("em", null, "最慢"), "第 " + (slow + 1) + " 段 " + fmtPace(views[slow].pace) + "（" + num(3600 / views[slow].pace, 1) + " km/h）") : null,
          avgPace > 0 ? h("span", null, h("em", null, "平均"), fmtPace(avgPace) + "，平均速度 " + num(avgSpeed * 3.6, 1) + " km/h") : null),
        h("p", { className: "pmw-plugin-hint gc-legend" },
          INTENSITY_ORDER.filter(function (g) { return laps.some(function (l) { return intensityLabel(l.intensityType) === g; }); }).map(function (g) {
            return h("span", { key: g }, h("i", { className: "gc-swatch gc-lapbar gc-int-" + intensityClassByLabel(g) }), g);
          }),
          h("span", null, "最快、最慢不算不满 200 米的零头段和休息段")));
    }

    function intensityClass(t) { return intensityClassByLabel(intensityLabel(t)); }
    function intensityClassByLabel(l) {
      return { "热身": "warm", "训练": "work", "恢复": "rec", "休息": "rest", "舒缓": "cool" }[l] || "none";
    }

    // ---------------------------------------------------------------------------
    // AI 分析（宿主 host.agent.run）：后台任务，轮询结果
    // ---------------------------------------------------------------------------

    const AGENT_KEY = "gc-agent";
    /** 开箱即用：不指定 preset，直接用插件内置教练指令 + 工作台默认模型；只有需要自定义指令时才填 Agent 名称 */
    const DEFAULT_AGENT = "";

    function loadAgent() {
      try {
        const v = window.localStorage.getItem(AGENT_KEY);
        return DEFAULT_AGENT;
      } catch (e) { return DEFAULT_AGENT; }
    }

    /** 极简 Markdown：标题、列表、粗体、段落（模型输出够用；不渲染 HTML，防注入） */
    function MiniMarkdown(props) {
      const lines = String(props.text || "").split("\n");
      const out = [];
      let list = null;
      const inline = function (t, k) {
        const parts = t.split(/(\*\*[^*]+\*\*)/g);
        return parts.map(function (p, i) {
          return /^\*\*[^*]+\*\*$/.test(p) ? h("strong", { key: k + "-" + i }, p.slice(2, -2)) : p;
        });
      };
      const flush = function () {
        if (list) { out.push(h(list.ordered ? "ol" : "ul", { key: "l" + out.length }, list.items)); list = null; }
      };
      lines.forEach(function (raw, i) {
        const l = raw.trim();
        let m;
        if (!l) { flush(); return; }
        if ((m = /^(#{1,4})\s+(.*)$/.exec(l))) {
          flush();
          out.push(h(m[1].length <= 2 ? "h3" : "h4", { key: "h" + i, className: "gc-md-h" }, inline(m[2], "h" + i)));
        } else if ((m = /^[-*+]\s+(.*)$/.exec(l)) || (m = /^(\d+)[.、)]\s+(.*)$/.exec(l))) {
          const ordered = /^\d/.test(l);
          const text = ordered ? m[2] : m[1];
          if (!list || list.ordered !== ordered) { flush(); list = { ordered: ordered, items: [] }; }
          list.items.push(h("li", { key: "i" + i }, inline(text, "i" + i)));
        } else {
          flush();
          out.push(h("p", { key: "p" + i }, inline(l, "p" + i)));
        }
      });
      flush();
      return h("div", { className: "gc-md" }, out);
    }

    function AnalysisTab(props) {
      const d = props.detail;
      const [state, setState] = useState(null);
      const [agentName, setAgentName] = useState(loadAgent());
      const [goalPace, setGoalPace] = useState(0);
      const [hrUpdated, setHrUpdated] = useState("");
      const [msg, setMsg] = useState("");

      useEffect(function () {
        api("/goals").then(function (d) { setGoalPace(d.goal ? d.goal.target_pace_s || 0 : 0); }).catch(function () {});
        api("/status").then(function (s) { setHrUpdated(s.hr_zones_updated_at || ""); }).catch(function () {});
      }, []);
      async function refresh() {
        try {
          setState(await api("/runs/" + encodeURIComponent(d.activity_id) + "/analysis"));
        } catch (err) {
          setMsg("读取分析失败：" + errText(err));
        }
      }

      useEffect(function () { refresh(); }, [d.activity_id]);
      useEffect(function () {
        if (!state || state.status !== "running") return undefined;
        const t = setInterval(refresh, 2500);
        return function () { clearInterval(t); };
      }, [state && state.status]);

      async function start() {
        setMsg("");
        try { window.localStorage.setItem(AGENT_KEY, agentName.trim()); } catch (e) { /* 存不了就算了 */ }
        try {
          await api("/runs/" + encodeURIComponent(d.activity_id) + "/analysis", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ agent: agentName.trim(), unit: paceUnit, insights: chartInsights(d.series, props.indoor, goalPace) }),
          });
          setState(Object.assign({}, state, { status: "running" }));
        } catch (err) {
          setMsg("没能开始分析：" + errText(err));
        }
      }

      const running = state && state.status === "running";
      const has = state && state.content;
      return h("div", { className: "gc-analysis" },
        h("div", { className: "gc-controls" },
          h("button", { className: "pmw-plugin-button gc-primary", type: "button", disabled: running, onClick: start },
            running ? "分析中…" : has ? "重新分析" : "生成分析"),
          null,
          h("span", { className: "pmw-plugin-hint" }, "默认内置可用；会把这次的数据、最近 4 周训练量、目标比赛和 PB 发给 dsh 当前默认模型")),
        running ? h("p", { className: "gc-note", role: "status" }, "正在分析，通常需要 20～60 秒，可以先看别的 tab。") : null,
        state && state.error ? h("p", { className: "gc-note", role: "alert" }, "上次分析失败：" + state.error) : null,
        msg ? h("p", { className: "gc-note", role: "alert" }, msg) : null,
        has && hrUpdated && state.created_at && state.created_at < hrUpdated
          ? h("p", { className: "gc-note" }, "心率区间已校准，这份分析还是旧区间算的，点「重新分析」更新结论。")
          : null,
        has
          ? h("article", { className: "gc-chart-box gc-analysis-body" },
              h(MiniMarkdown, { text: state.content }),
              h("p", { className: "pmw-plugin-hint" }, "生成于 " + shortTime(state.created_at) + (state.agent ? " · Agent：" + state.agent : " · 默认模型") + "。建议仅供参考，身体不适以实际感受为准。"))
          : null,
        has && !running
          ? (state.plan && state.plan.length
              ? h(AiPlanCard, { key: state.created_at, plan: state.plan, detail: d })
              : h("p", { className: "pmw-plugin-hint" }, "这份分析里没有可以直接排进计划的课表（较早生成的分析没有）。点「重新分析」后，可以把建议的课加入训练计划。"))
          : null,
        has ? null
          : (!running ? h("p", { className: "pmw-plugin-hint" }, "还没有分析。点「生成分析」，模型会按教练的角度给出本次概况、问题和后续 1～2 周的训练建议。") : null));
    }

    /**
     * AI 建议的课表：分析末尾的结构化课表（day 为从开始那天算起的第几天）。
     * 选好开始日期和要哪几节，可以排进日历，或存成「我的计划」以后再排。
     */
    function AiPlanCard(props) {
      const plan = props.plan;
      const d = props.detail;
      const tomorrow = new Date(); tomorrow.setHours(0, 0, 0, 0); tomorrow.setDate(tomorrow.getDate() + 1);
      const [start, setStart] = useState(toYMD(tomorrow));
      const [off, setOff] = useState({});
      const [busy, setBusy] = useState("");
      const [msg, setMsg] = useState("");

      const s0 = fromYMD(start);
      const rows = plan.map(function (p, i) {
        const dt = s0 ? new Date(s0) : null;
        if (dt) dt.setDate(dt.getDate() + p.day - 1);
        return { i: i, p: p, date: dt };
      });
      const chosen = rows.filter(function (r) { return !off[r.i] && r.date; });
      const actName = (d.name || "活动").slice(0, 16);
      const actDate = String(d.start_local || "").slice(0, 10);

      async function toCalendar() {
        if (!chosen.length) return;
        setBusy("cal"); setMsg("");
        try {
          await api("/calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
            plan_key: "ai:" + d.activity_id, plan_name: "AI 建议 · " + actName,
            items: chosen.map(function (r) { return {
              date: toYMD(r.date), kind: r.p.kind, title: r.p.title, detail: r.p.detail || "",
              target_pace_lo_s: Number(r.p.pace_lo_s) || 0, target_pace_hi_s: Number(r.p.pace_hi_s) || 0,
              target_hr_zone_lo: Number(r.p.hr_zone_lo) || 0, target_hr_zone_hi: Number(r.p.hr_zone_hi) || 0,
              target_distance_m: Number(r.p.target_distance_m) || 0, target_duration_s: Number(r.p.target_duration_s) || 0,
            }; }),
          }) });
          setMsg("已把 " + chosen.length + " 节课排进日历（" + toYMD(chosen[0].date) + " 起），可以在「日历」里逐条改，或按计划整批删除。");
        } catch (err) { setMsg("没排进去：" + errText(err)); } finally { setBusy(""); }
      }

      /** 存成我的计划：所选开始日期就是第 1 天，day=N 保持原来的相对天数；空位补「休息」 */
      async function toPlan() {
        if (!chosen.length) return;
        setBusy("plan"); setMsg("");
        const byWeek = [];
        const daySet = {};
        chosen.forEach(function (r) {
          const diff = Math.round((r.date - s0) / 86400000);
          const w = Math.floor(diff / 7);
          const wd = diff % 7 + 1;
          daySet[wd] = true;
          while (byWeek.length <= w) byWeek.push({});
          const cur = byWeek[w][wd];
          const session = { kind: r.p.kind, title: r.p.title, detail: r.p.detail || "",
            target_pace_lo_s: Number(r.p.pace_lo_s) || 0, target_pace_hi_s: Number(r.p.pace_hi_s) || 0,
            target_hr_zone_lo: Number(r.p.hr_zone_lo) || 0, target_hr_zone_hi: Number(r.p.hr_zone_hi) || 0,
            target_distance_m: Number(r.p.target_distance_m) || 0, target_duration_s: Number(r.p.target_duration_s) || 0 };
          byWeek[w][wd] = cur
            ? { kind: cur.kind === r.p.kind ? cur.kind : "other", title: (cur.title + " + " + r.p.title).slice(0, 60), detail: (cur.detail + "；" + (r.p.detail || "")).slice(0, 2000),
                target_distance_m: (cur.target_distance_m || 0) + session.target_distance_m, target_duration_s: (cur.target_duration_s || 0) + session.target_duration_s }
            : session;
        });
        const days = Object.keys(daySet).map(Number).sort(function (a, b) { return a - b; });
        const weeks = byWeek.map(function (wk) {
          const list = days.map(function (wd) { return wk[wd] || { kind: "rest", title: "休息", detail: "" }; });
          while (list.length && list[list.length - 1].kind === "rest" && !wk[days[list.length - 1]]) list.pop();
          return list;
        });
        const kinds = {};
        chosen.forEach(function (r) { kinds[r.p.kind] = true; });
        const kind = kinds.run && !kinds.strength && !kinds.other ? "run" : kinds.strength && !kinds.run && !kinds.other ? "strength" : "mixed";
        const name = ("AI 建议 · " + actName).slice(0, 40);
        try {
          await api("/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
            name: name, kind: kind, level: "AI 建议",
            description: "根据 " + actDate + "「" + (d.name || "活动") + "」的 AI 分析生成，共 " + chosen.length + " 节课。",
            days: days, weeks: weeks, videos: [], start_mode: "date",
            source: { type: "other", name: "AI 分析", url: "", note: (actDate + " " + (d.name || "")).trim().slice(0, 200) },
          }) });
          setMsg("已存为「我的计划」里的「" + name + "」，第 1 天就是所选开始日期；到「计划」里可以编辑或重新排期。");
        } catch (err) { setMsg("没存上：" + errText(err)); } finally { setBusy(""); }
      }

      return h("section", { className: "gc-chart-box gc-ai-plan" },
        h("h3", { className: "gc-sub" }, "建议安排（" + plan.length + " 节课）"),
        h("div", { className: "gc-controls" },
          h("label", { className: "gc-inline" }, "从哪天开始",
            h("input", { type: "date", className: "gc-search", value: start, onChange: function (e) { setStart(e.target.value); } })),
          h("span", { className: "pmw-plugin-hint" }, "所选日期就是第 1 天；取消勾选的课不会加入。")),
        h("ul", { className: "gc-ai-plan-list" }, rows.map(function (r) {
          const on = !off[r.i];
          return h("li", { key: r.i, className: on ? "" : "off" },
            h("label", null,
              h("input", { type: "checkbox", checked: on, onChange: function () { const n = Object.assign({}, off); n[r.i] = on; setOff(n); } }),
              h("span", { className: "gc-ai-plan-date" }, r.date ? (r.date.getMonth() + 1) + "/" + r.date.getDate() + " " + DAY_NAMES[(r.date.getDay() + 6) % 7] : "第 " + r.p.day + " 天"),
              h("span", { className: "gc-dot gc-k-" + r.p.kind }),
              h("span", { className: "gc-ai-plan-title" }, r.p.title,
                (r.p.pace_lo_s || r.p.pace_hi_s || r.p.hr_zone_lo || r.p.hr_zone_hi || r.p.phase)
                  ? h("small", null, [
                      r.p.phase,
                      (r.p.pace_lo_s || r.p.pace_hi_s) ? "配速 " + (r.p.pace_lo_s ? fmtPace(r.p.pace_lo_s) : "不限") + "～" + (r.p.pace_hi_s ? fmtPace(r.p.pace_hi_s) : "不限") : "",
                      (r.p.hr_zone_lo || r.p.hr_zone_hi) ? "心率区间 " + (r.p.hr_zone_lo || "?") + "～" + (r.p.hr_zone_hi || "?") : "",
                    ].filter(Boolean).join(" · ")) : null,
                r.p.detail ? h("small", null, r.p.detail) : null)));
        })),
        h("div", { className: "gc-detail-bar" },
          h("button", { className: "pmw-plugin-button gc-primary", type: "button", disabled: !!busy || !chosen.length, onClick: toCalendar },
            busy === "cal" ? "排进日历中…" : "排进日历"),
          h("button", { className: "pmw-plugin-button", type: "button", disabled: !!busy || !chosen.length, onClick: toPlan },
            busy === "plan" ? "保存中…" : "存为我的计划")),
        msg ? h("p", { className: "pmw-plugin-hint", role: "status" }, msg) : null);
    }

    // ---------------------------------------------------------------------------
    // 力量训练：训练组
    // ---------------------------------------------------------------------------

    const EXERCISE_NAMES = {
      BENCH_PRESS: "卧推", SQUAT: "深蹲", DEADLIFT: "硬拉", ROW: "划船", PULL_UP: "引体向上", PUSH_UP: "俯卧撑",
      SHOULDER_PRESS: "肩推", LUNGE: "弓步", CURL: "弯举", PLANK: "平板支撑", CRUNCH: "卷腹", SIT_UP: "仰卧起坐",
      CORE: "核心", LATERAL_RAISE: "侧平举", TRICEPS_EXTENSION: "三头臂屈伸", LEG_CURL: "腿弯举", LEG_RAISE: "举腿",
      CALF_RAISE: "提踵", HIP_RAISE: "臀桥", HIP_STABILITY: "髋部稳定", HIP_SWING: "壶铃摆荡", CARDIO: "有氧",
      CHOP: "劈砍", FLYE: "飞鸟", SHRUG: "耸肩", HYPEREXTENSION: "背伸", OLYMPIC_LIFT: "奥林匹克举", CARRY: "负重行走",
      PLYO: "增强式跳跃", BANDED_EXERCISES: "弹力带训练", TOTAL_BODY: "全身", WARM_UP: "热身", SANDBAG: "沙袋",
      SLED: "雪橇推拉", BATTLE_ROPE: "战绳", BIKE: "单车", ELLIPTICAL: "椭圆机", INDOOR_ROWER: "划船机", RUN: "跑步",
      UNKNOWN: "未识别",
    };

    function exerciseName(st) {
      const cat = String(st.category || "");
      const zh = EXERCISE_NAMES[cat] || (cat ? cat.toLowerCase().replace(/_/g, " ") : "未识别");
      const raw = String(st.name || "");
      const sub = raw && raw !== cat ? raw.toLowerCase().replace(/_/g, " ") : "";
      return { zh: zh, sub: sub };
    }

    /** Garmin 训练组的重量多是克；小于 300 当公斤 */
    function setKg(w) {
      if (!isNum(w) || w <= 0) return 0;
      return w > 300 ? w / 1000 : w;
    }

    function strengthStats(sets) {
      const act = (sets || []).filter(function (s) { return s.set_type !== "REST"; });
      const reps = act.reduce(function (t, s) { return t + (s.reps || 0); }, 0);
      const vol = act.reduce(function (t, s) { return t + (s.reps || 0) * setKg(s.weight); }, 0);
      const groups = {};
      act.forEach(function (s) { const n = exerciseName(s).zh; groups[n] = (groups[n] || 0) + 1; });
      return { sets: act.length, reps: reps, volume: vol, exercises: Object.keys(groups).length };
    }

    function SetsSection(props) {
      const sets = props.sets || [];
      if (!sets.length) return h("p", { className: "gc-note" }, "这次力量训练没有训练组数据（手表没开组数记录，或 Garmin 没识别出动作）。");
      const st = strengthStats(sets);
      let n = 0;
      return h("div", { className: "gc-tab-body" },
        h("div", { className: "gc-stats" },
          [["训练组", st.sets + " 组"], ["动作", st.exercises + " 种"], ["总次数", st.reps + " 次"],
           ["总容量", st.volume ? num(st.volume) + " kg" : "-"]].map(function (c) {
            return h("div", { className: "gc-stat", key: c[0] }, h("span", { className: "gc-stat-label" }, c[0]), h("span", { className: "gc-stat-value" }, c[1]));
          })),
        h("div", { className: "gc-scroll" }, h("table", { className: "gc-table" },
          h("thead", null, h("tr", null, h("th", null, "#"), h("th", null, "动作"), h("th", { className: "num" }, "次数"),
            h("th", { className: "num" }, "重量"), h("th", { className: "num" }, "用时"), h("th", { className: "num" }, "之后休息"))),
          h("tbody", null, sets.map(function (s, i) {
            if (s.set_type === "REST") return null;
            n++;
            const next = sets[i + 1];
            const rest = next && next.set_type === "REST" ? next.duration : 0;
            const nm = exerciseName(s);
            const kg = setKg(s.weight);
            return h("tr", { key: i },
              h("td", null, String(n)),
              h("td", null, nm.zh, nm.sub ? h("small", { className: "gc-sub-name" }, " " + nm.sub) : null),
              h("td", { className: "num" }, s.reps ? num(s.reps) : "-"),
              h("td", { className: "num" }, kg ? num(kg, 1) + " kg" : "自重"),
              h("td", { className: "num" }, s.duration ? fmtDuration(s.duration) : "-"),
              h("td", { className: "num" }, rest ? fmtDuration(rest) : "-"));
          })))),
        h("p", { className: "pmw-plugin-hint" }, "动作由手表自动识别，可能不准；在 Garmin Connect 里改过动作后点「从 Garmin 重新拉取」。"));
    }

    // ---------------------------------------------------------------------------
    // 训练计划库（预置）
    // ---------------------------------------------------------------------------

    function easyRun(min, note) { return ["run", "轻松跑 " + min + " 分钟", "心率区间 2（能完整说话的强度）。" + (note || "")]; }
    function runWalk(run, walk, sets) {
      return ["run", "跑走结合 " + sets + " 组", "每组跑 " + run + " 分钟、走 " + walk + " 分钟，共约 " + (run + walk) * sets + " 分钟；跑的时候能说话即可。"];
    }
    function longRun(km, note) { return ["run", "长距离 " + km + " 公里", "比轻松跑再慢 15～30 秒/公里，心率区间 2，后段不掉速。" + (note || "")]; }
    function tempoRun(min) { return ["run", "节奏跑 " + min + " 分钟", "热身慢跑 10～15 分钟 → 节奏跑 " + min + " 分钟（区间 3～4，「舒服地吃力」，约半马配速）→ 放松 10 分钟。"]; }
    function intervalRun(n, m, rest) {
      return ["run", "间歇 " + n + "×" + m + " 米", "热身 15 分钟加 4 次加速跑 → " + n + " 组 " + m + " 米（约 5 公里比赛配速或更快 5 秒），组间慢跑 " + rest + " → 放松 10 分钟。"];
    }
    function mpRun(km) { return ["run", "马拉松配速 " + km + " 公里", "热身 2 公里 → " + km + " 公里目标马拉松配速 → 放松 2 公里。"]; }
    function race(name) { return ["run", name, "比赛 / 测试日：前一天休息或慢跑 20 分钟，赛前充分热身。"]; }

    const CORE_A = "平板支撑 3×45 秒；侧桥 每侧 3×30 秒；死虫 3×12；鸟狗 3×10（每侧）；臀桥 3×15。组间休息 45 秒。";
    const CORE_B = "反向卷腹 3×12；侧桥抬髋 每侧 3×10；单腿臀桥 每侧 3×12；俄罗斯转体 3×20；超人式 3×12。组间休息 45 秒。";
    const LEG = function (w) {
      const sets = w <= 2 ? 2 : w <= 5 ? 3 : 4;
      const reps = w <= 4 ? "12" : "8～10（加重量）";
      return "高脚杯深蹲 " + sets + "×" + reps + "；罗马尼亚硬拉 " + sets + "×" + reps + "；保加利亚分腿蹲 每侧 " + sets + "×10；单腿提踵 每侧 3×15；侧向弹力带行走 3×15 步。组间休息 60～90 秒。";
    };
    const FULL_A = "深蹲 3×10；俯卧撑 3×10～15；哑铃划船 每侧 3×10；平板支撑 3×45 秒。组间休息 60 秒。";
    const FULL_B = "硬拉 3×8；哑铃肩推 3×10；弓步走 3×12（每侧）；引体向上或弹力带下拉 3×8；死虫 3×12。组间休息 60 秒。";

    /** 计划：sessions 按周给出，每周的课按顺序排到所选的训练日（长距离放最后，落在周末） */
    const PLANS = [
      {
        key: "5k_beginner", kind: "run", name: "5 公里入门", weeks: 8, perWeek: 3, days: [2, 4, 6], level: "入门",
        desc: "从跑走结合开始，8 周后能不停地跑完 5 公里。适合刚开始跑步或长时间没跑的人。",
        sessions: [
          [runWalk(1, 2, 7), runWalk(1, 2, 7), runWalk(1, 1.5, 8)],
          [runWalk(2, 2, 6), runWalk(2, 2, 6), runWalk(2, 1.5, 7)],
          [runWalk(3, 1.5, 5), runWalk(3, 1.5, 5), runWalk(4, 1.5, 4)],
          [runWalk(5, 1, 4), runWalk(5, 1, 4), easyRun(20, "可以中途走 1 分钟。")],
          [runWalk(8, 1, 3), easyRun(20), easyRun(22)],
          [easyRun(24), runWalk(10, 1, 3), easyRun(26)],
          [easyRun(28), easyRun(25, "最后 5 分钟稍快。"), easyRun(30)],
          [easyRun(20), easyRun(15, "加 4 次 20 秒加速跑。"), race("5 公里测试")],
        ],
      },
      {
        key: "10k_improve", kind: "run", name: "10 公里提升", weeks: 8, perWeek: 4, days: [2, 3, 5, 7], level: "进阶",
        desc: "已经能跑 5 公里以上，想把 10 公里跑得更快。每周一次间歇、一次节奏、一次长距离。",
        sessions: [
          [easyRun(35), intervalRun(6, 400, "200 米"), easyRun(30), longRun(8)],
          [easyRun(40), tempoRun(15), easyRun(30), longRun(9)],
          [easyRun(40), intervalRun(5, 800, "400 米"), easyRun(35), longRun(10)],
          [easyRun(30), tempoRun(12), easyRun(30), longRun(8, "减量周。")],
          [easyRun(45), intervalRun(6, 800, "400 米"), easyRun(35), longRun(11)],
          [easyRun(45), tempoRun(25), easyRun(35), longRun(12)],
          [easyRun(40), intervalRun(4, 1000, "400 米"), easyRun(30), longRun(10)],
          [easyRun(30), tempoRun(10), easyRun(20, "加 4 次加速跑。"), race("10 公里比赛 / 测试")],
        ],
      },
      {
        key: "half_marathon", kind: "run", name: "半程马拉松备赛", weeks: 12, perWeek: 4, days: [2, 4, 6, 7], level: "进阶",
        desc: "12 周备战半马：长距离从 10 公里逐步加到 19 公里，节奏跑和间歇交替，最后两周减量。",
        sessions: [10, 11, 12, 10, 13, 14, 15, 12, 16, 18, 19, 0].map(function (km, i) {
          const quality = i % 2 === 0 ? intervalRun(5 + Math.min(3, i >> 1), 800, "400 米") : tempoRun(15 + Math.min(20, i * 2));
          if (i === 11) return [easyRun(35), tempoRun(10), easyRun(20, "加 4 次加速跑。"), race("半程马拉松比赛")];
          if (i === 10) return [easyRun(40), tempoRun(20), easyRun(30), longRun(14, "减量开始。")];
          return [easyRun(40 + Math.min(15, i * 2)), quality, easyRun(35), longRun(km, i === 3 || i === 7 ? "减量周。" : "")];
        }),
      },
      {
        key: "marathon", kind: "run", name: "全程马拉松备赛", weeks: 16, perWeek: 5, days: [1, 2, 4, 6, 7], level: "高阶",
        desc: "16 周备战全马：每周 5 跑，长距离逐步到 32 公里，加入马拉松配速跑，最后 3 周减量。",
        sessions: [16, 18, 20, 16, 22, 24, 26, 20, 28, 30, 24, 32, 26, 20, 14, 0].map(function (km, i) {
          if (i === 15) return [easyRun(30), mpRun(5), easyRun(25), easyRun(20, "加 4 次加速跑。"), race("全程马拉松比赛")];
          const quality = i % 3 === 0 ? intervalRun(5 + Math.min(3, i >> 2), 1000, "400 米") : i % 3 === 1 ? tempoRun(20 + Math.min(20, i * 2)) : mpRun(8 + Math.min(10, i));
          const cut = i === 3 || i === 7 || i === 10 || i >= 13;
          return [easyRun(40), quality, easyRun(50), easyRun(40, "或 30 分钟交叉训练。"), longRun(km, cut ? "减量周。" : (i >= 8 ? "最后 5 公里可跑到马拉松配速。" : ""))];
        }),
      },
      {
        key: "core_runner", kind: "strength", name: "跑者核心稳定", weeks: 6, perWeek: 2, days: [3, 6], level: "入门",
        desc: "每周 2 次、每次约 25 分钟的核心训练，改善跑姿稳定、减少腰和膝的负担。可以放在轻松跑之后。",
        sessions: Array.from({ length: 6 }, function (_, w) {
          return [["strength", "核心训练 A", CORE_A + (w >= 3 ? " 每个动作多加 1 组。" : "")], ["strength", "核心训练 B", CORE_B + (w >= 3 ? " 每个动作多加 1 组。" : "")]];
        }),
      },
      {
        key: "leg_strength", kind: "strength", name: "下肢力量", weeks: 8, perWeek: 2, days: [2, 5], level: "进阶",
        desc: "深蹲、硬拉、单腿练习为主，提升蹬伸力量和跑步经济性。不要排在间歇或长距离的前一天。",
        sessions: Array.from({ length: 8 }, function (_, w) {
          return [["strength", "下肢力量（第 " + (w + 1) + " 周）", LEG(w + 1)], ["strength", "下肢力量 + 核心", LEG(w + 1) + " 结束后加：" + CORE_A]];
        }),
      },
      {
        key: "full_body", kind: "strength", name: "全身基础力量", weeks: 6, perWeek: 3, days: [1, 3, 5], level: "入门",
        desc: "A、B 两套全身训练轮换，每次 40 分钟左右，打基础、提升整体力量。",
        sessions: Array.from({ length: 6 }, function (_, w) {
          const a = ["strength", "全身力量 A", FULL_A], b = ["strength", "全身力量 B", FULL_B];
          return w % 2 === 0 ? [a, b, a] : [b, a, b];
        }),
      },
    ];

    const KIND_NAMES = { run: "跑步", strength: "力量", rest: "休息", other: "其他" };
    const DAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

    function toYMD(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
    function fromYMD(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
    function nextMonday() {
      const d = new Date(); d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
      return d;
    }

    /**
     * 把计划排成日期。week：开始日期所在周的周一为第 1 周，day 是星期几（1=周一…7=周日）；
     * date：开始日期就是第 1 天，day 是相对开始日期的第几天（AI 课表存成的计划用这个口径）。
     */
    function planDates(plan, start, days) {
      const s = fromYMD(start);
      if (!s) return [];
      const anchored = plan.startMode === "date";
      const base = new Date(s);
      if (!anchored) base.setDate(s.getDate() - ((s.getDay() + 6) % 7));
      const ds = days.slice().sort(function (a, b) { return a - b; });
      const out = [];
      plan.sessions.forEach(function (week, w) {
        week.forEach(function (sess, j) {
          if (j >= ds.length) return;
          const d = new Date(base); d.setDate(base.getDate() + w * 7 + ds[j] - 1);
          if (!anchored && d < s) return; // week 口径下开始日期之前的不排
          out.push({ date: toYMD(d), kind: sess[0], title: sess[1], detail: "第 " + (w + 1) + " 周 · " + sess[2], video: sess[3] || "",
            target_distance_m: sess[4] || 0, target_duration_s: sess[5] || 0, target_pace_lo_s: sess[6] || 0, target_pace_hi_s: sess[7] || 0, target_hr_zone_lo: sess[8] || 0, target_hr_zone_hi: sess[9] || 0 });
        });
      });
      return out;
    }

    // ---------------------------------------------------------------------------
    // 推荐视频库：用户收录的训练视频链接（B 站、YouTube、抖音等），带 UP 主和主页
    // ---------------------------------------------------------------------------

    const VIDEO_CATS = [["run", "跑步"], ["strength", "力量"], ["stretch", "拉伸放松"], ["other", "其他"]];
    const SOURCE_TYPES = [["self", "自己"], ["up", "UP 主"], ["coach", "教练"], ["book", "书籍"], ["other", "其他"]];

    /** 从链接认平台 */
    function videoPlatform(u) {
      const s = String(u || "").toLowerCase();
      if (/bilibili\.com|b23\.tv/.test(s)) return "B 站";
      if (/youtube\.com|youtu\.be/.test(s)) return "YouTube";
      if (/douyin\.com/.test(s)) return "抖音";
      if (/xiaohongshu\.com|xhslink/.test(s)) return "小红书";
      if (/ixigua\.com/.test(s)) return "西瓜视频";
      return "链接";
    }

    function isHttp(u) { return /^https?:\/\/\S+$/i.test(String(u || "").trim()); }

    /** 外链：新窗口打开，不带来源页信息 */
    function ExtLink(props) {
      if (!isHttp(props.href)) return h("span", { className: props.className }, props.children);
      return h("a", { href: props.href, target: "_blank", rel: "noopener noreferrer", className: props.className || "gc-link", title: props.title || props.href }, props.children);
    }

    /** 来源标记：「UP 主 · 名称」，名称链到主页 */
    function SourceBadge(props) {
      const s = props.source || {};
      if (!s.type || s.type === "self" || !s.name) return null;
      return h("span", { className: "gc-source gc-source-" + s.type },
        h("span", { className: "gc-source-type" }, labelOf(SOURCE_TYPES, s.type)),
        s.url ? h(ExtLink, { href: s.url, className: "gc-source-name", title: "打开主页" }, s.name) : h("span", { className: "gc-source-name" }, s.name));
    }

    function VideosView() {
      const [list, setList] = useState(null);
      const [cat, setCat] = useState("all");
      const [editing, setEditing] = useState(null);
      const [msg, setMsg] = useState("");

      async function load() {
        try { setList((await api("/videos")).videos || []); } catch (err) { setMsg("读取视频失败：" + errText(err)); }
      }
      useEffect(function () { load(); }, []);

      async function remove(v) {
        if (!window.confirm("从推荐视频里删掉「" + v.title + "」？")) return;
        try { await api("/videos/" + v.id, { method: "DELETE" }); load(); } catch (err) { setMsg("删除失败：" + errText(err)); }
      }

      const all = list || [];
      const shown = all.filter(function (v) { return cat === "all" || v.category === cat; });
      // 按 UP 主分组显示更好找
      const creators = {};
      shown.forEach(function (v) { const k = v.creator || "未填 UP 主"; (creators[k] = creators[k] || { url: v.creator_url, items: [] }).items.push(v); if (!creators[k].url && v.creator_url) creators[k].url = v.creator_url; });

      return h("div", { className: "gc-videos" },
        h("div", { className: "gc-controls" },
          h(Seg, { label: "类别", value: cat, onChange: setCat, options: [["all", "全部"]].concat(VIDEO_CATS) }),
          h("button", { className: "pmw-plugin-button gc-primary", type: "button", onClick: function () { setEditing({ category: cat === "all" ? "run" : cat }); } }, "添加视频"),
          h("span", { className: "pmw-plugin-hint" }, "收录你觉得有用的训练视频（B 站、YouTube、抖音等链接），可以关联到训练计划和某一节课。")),
        editing ? h(VideoForm, { key: editing.id || "new", video: editing, onCancel: function () { setEditing(null); }, onSaved: function () { setEditing(null); load(); } }) : null,
        msg ? h("p", { className: "gc-note", role: "alert" }, msg) : null,
        list && !all.length && !editing ? h("div", { className: "gc-empty" }, h("p", null, "还没有收录视频。"),
          h("p", { className: "pmw-plugin-hint" }, "点「添加视频」粘贴视频链接，填上 UP 主和主页链接，以后在计划里就能直接引用。")) : null,
        Object.keys(creators).map(function (name) {
          const g = creators[name];
          return h("section", { key: name, className: "gc-video-group" },
            h("div", { className: "gc-media-head" },
              h("strong", null, name), g.url ? h(ExtLink, { href: g.url }, "UP 主主页") : null, h("small", null, g.items.length + " 个视频")),
            h("div", { className: "gc-video-grid" }, g.items.map(function (v) {
              return h("div", { key: v.id, className: "gc-video-card" },
                h("div", { className: "gc-video-top" },
                  h("span", { className: "gc-tag" }, videoPlatform(v.url)), h("span", { className: "gc-tag" }, labelOf(VIDEO_CATS, v.category))),
                h(ExtLink, { href: v.url, className: "gc-video-title" }, v.title),
                v.note ? h("p", { className: "gc-plan-desc" }, v.note) : null,
                h("span", { className: "gc-detail-bar" },
                  h(ExtLink, { href: v.url }, "打开视频"),
                  h("button", { className: "gc-link", type: "button", onClick: function () { setEditing(v); } }, "编辑"),
                  h("button", { className: "gc-link", type: "button", onClick: function () { remove(v); } }, "删除")));
            })));
        }));
    }

    function VideoForm(props) {
      const v = props.video || {};
      const [f, setF] = useState({ title: v.title || "", url: v.url || "", creator: v.creator || "", creator_url: v.creator_url || "", category: v.category || "run", note: v.note || "" });
      const [msg, setMsg] = useState("");
      const [busy, setBusy] = useState(false);
      const set = function (k, val) { const n = Object.assign({}, f); n[k] = val; setF(n); };
      async function save(e) {
        e.preventDefault(); setBusy(true); setMsg("");
        try {
          await api(v.id ? "/videos/" + v.id : "/videos", { method: v.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
          props.onSaved();
        } catch (err) { setMsg("保存失败：" + errText(err)); } finally { setBusy(false); }
      }
      return h("form", { className: "gc-edit", onSubmit: save, "aria-label": "视频信息" },
        h("label", { className: "gc-field" }, "视频链接", h("input", { value: f.url, placeholder: "https://www.bilibili.com/video/…", onChange: function (e) { set("url", e.target.value); } })),
        h("label", { className: "gc-field" }, "标题", h("input", { value: f.title, maxLength: 100, onChange: function (e) { set("title", e.target.value); } })),
        h("div", { className: "gc-edit-row" },
          h("label", { className: "gc-field" }, "UP 主", h("input", { value: f.creator, maxLength: 40, onChange: function (e) { set("creator", e.target.value); } })),
          h("label", { className: "gc-field" }, "UP 主主页链接", h("input", { value: f.creator_url, placeholder: "https://space.bilibili.com/…", onChange: function (e) { set("creator_url", e.target.value); } })),
          h("label", { className: "gc-field" }, "类别", h("select", { value: f.category, onChange: function (e) { set("category", e.target.value); } },
            VIDEO_CATS.map(function (c) { return h("option", { key: c[0], value: c[0] }, c[1]); })))),
        h("label", { className: "gc-field" }, "说明", h("textarea", { rows: 2, value: f.note, maxLength: 500, placeholder: "讲了什么、适合什么时候看…", onChange: function (e) { set("note", e.target.value); } })),
        h("div", { className: "gc-detail-bar" },
          h("button", { className: "pmw-plugin-button gc-primary", type: "submit", disabled: busy || !f.title.trim() || !f.url.trim() }, busy ? "保存中…" : "保存"),
          h("button", { className: "pmw-plugin-button", type: "button", onClick: props.onCancel }, "取消")),
        msg ? h("p", { className: "gc-note", role: "alert" }, msg) : null);
    }

    const PLAN_KINDS = [["run", "跑步"], ["strength", "力量"], ["mixed", "混合"]];

    /** 我的计划（后端 weeks:[[{kind,title,detail}]]）转成和预置计划一样的结构 */
    function customToPlan(c) {
      const sessions = (c.weeks || []).map(function (w) { return (w || []).map(function (s) {
        return [s.kind, s.title, s.detail || "", s.video || "", s.target_distance_m || 0, s.target_duration_s || 0, s.target_pace_lo_s || 0, s.target_pace_hi_s || 0, s.target_hr_zone_lo || 0, s.target_hr_zone_hi || 0];
      }); });
      const perWeek = sessions.reduce(function (m, w) { return Math.max(m, w.length); }, 0);
      return {
        key: "custom:" + c.id, id: c.id, custom: true, kind: c.kind, name: c.name, level: c.level || "自定义",
        desc: c.description || "", weeks: sessions.length, perWeek: perWeek,
        days: (c.days && c.days.length ? c.days : [1, 2, 3, 4, 5, 6, 7].slice(0, perWeek)), sessions: sessions,
        source: c.source || {}, videos: c.videos || [], startMode: c.start_mode || "week",
      };
    }

    /** 预置计划转成编辑器用的草稿 */
    function planToDraft(p, copy) {
      return {
        id: copy ? "" : (p.id || ""), name: copy ? p.name + "（我的）" : p.name, kind: p.kind === "strength" ? "strength" : p.kind === "mixed" ? "mixed" : "run",
        level: p.level === "自定义" ? "" : (p.level || ""), description: p.desc || "", days: (p.days || []).slice(),
        weeks: p.sessions.map(function (w) { return w.map(function (s) {
          return { kind: s[0], title: s[1], detail: s[2] || "", video: s[3] || "", target_distance_m: s[4] || 0, target_duration_s: s[5] || 0, target_pace_lo_s: s[6] || 0, target_pace_hi_s: s[7] || 0, target_hr_zone_lo: s[8] || 0, target_hr_zone_hi: s[9] || 0 };
        }); }),
        source: copy && !p.custom ? { type: "self", name: "", url: "", note: "复制自预置计划「" + p.name + "」" } : Object.assign({ type: "self", name: "", url: "", note: "" }, p.source || {}),
        videos: (p.videos || []).slice(), startMode: p.startMode || "week",
      };
    }

    function PlansView(props) {
      const [custom, setCustom] = useState([]);
      const [open, setOpen] = useState(null);
      const [draft, setDraft] = useState(null);
      const [start, setStart] = useState(toYMD(nextMonday()));
      const [days, setDays] = useState([]);
      const [msg, setMsg] = useState("");
      const [busy, setBusy] = useState(false);

      async function loadCustom() {
        try { setCustom(((await api("/plans")).plans || []).map(customToPlan)); } catch (err) { setMsg("读取我的计划失败：" + errText(err)); }
      }
      useEffect(function () { loadCustom(); }, []);

      function choose(p) {
        const t = new Date(); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + 1);
        setOpen(p); setDraft(null); setDays(p.days.slice());
        setStart(p.startMode === "date" ? toYMD(t) : toYMD(nextMonday()));
        setMsg("");
      }
      async function removeCustom(p) {
        if (!window.confirm("删除计划「" + p.name + "」？已经排进日历的安排不受影响。")) return;
        try { await api("/plans/" + p.id, { method: "DELETE" }); setOpen(null); await loadCustom(); } catch (err) { setMsg("删除失败：" + errText(err)); }
      }

      const preview = open ? planDates(open, start, days) : [];
      // 预置计划要选够每周次数；我的计划每周课数可以不同，训练日要不少于最多那周
      const daysOk = open ? (open.custom ? days.length >= open.perWeek : days.length === open.perWeek) : false;
      async function apply() {
        if (!open || !daysOk || !preview.length) return;
        setBusy(true); setMsg("");
        try {
          await api("/calendar", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: preview, plan_key: open.key, plan_name: open.name }) });
          setMsg("已把「" + open.name + "」的 " + preview.length + " 次训练排进日历（" + preview[0].date + " 起）。");
          props.onApplied && props.onApplied(preview[0].date);
        } catch (err) { setMsg("没排进去：" + errText(err)); } finally { setBusy(false); }
      }

      const card = function (p) {
        return h("div", { key: p.key, className: "gc-plan-card" + (open && open.key === p.key ? " on" : "") },
          h("button", { type: "button", className: "gc-plan-card-main", onClick: function () { choose(p); } },
            h("span", { className: "gc-plan-kind gc-k-" + (p.kind === "mixed" ? "other" : p.kind) }, labelOf(PLAN_KINDS, p.kind)),
            h("strong", null, p.name),
            p.videos && p.videos.length ? h("small", null, "关联 " + p.videos.length + " 个视频") : null),
          p.source && p.source.type && p.source.type !== "self" ? h("span", { className: "gc-plan-source" }, h(SourceBadge, { source: p.source })) : null,
          h("button", { type: "button", className: "gc-plan-card-main gc-plan-card-more", onClick: function () { choose(p); } },
            h("small", null, p.level + " · " + p.weeks + " 周 · 每周最多 " + p.perWeek + " 次"),
            p.desc ? h("span", { className: "gc-plan-desc" }, p.desc) : null),
          h("span", { className: "gc-detail-bar gc-plan-actions" },
            p.custom
              ? [h("button", { key: "e", type: "button", className: "gc-link", onClick: function () { setOpen(null); setDraft(planToDraft(p, false)); } }, "编辑"),
                 h("button", { key: "c", type: "button", className: "gc-link", onClick: function () { setOpen(null); setDraft(planToDraft(p, true)); } }, "复制"),
                 h("button", { key: "d", type: "button", className: "gc-link", onClick: function () { removeCustom(p); } }, "删除")]
              : h("button", { type: "button", className: "gc-link", onClick: function () { setOpen(null); setDraft(planToDraft(p, true)); } }, "复制为我的计划")));
      };

      const mine = custom.filter(function (p) { return !p.source || p.source.type !== "up"; });
      const ups = custom.filter(function (p) { return p.source && p.source.type === "up"; });
      return h("div", { className: "gc-plans" },
        h("div", { className: "gc-section-head" },
          h("h3", { className: "gc-sub" }, "我的计划" + (mine.length ? "（" + mine.length + "）" : "")),
          h("button", { className: "pmw-plugin-button gc-primary", type: "button", onClick: function () {
            setOpen(null);
            setDraft({ id: "", name: "", kind: "run", level: "", description: "", days: [2, 4, 7], weeks: [[{ kind: "run", title: "轻松跑 40 分钟", detail: "心率区间 2。" }]], startMode: "week" });
          } }, "新建计划")),
        mine.length
          ? h("div", { className: "gc-plan-grid" }, mine.map(card))
          : h("p", { className: "pmw-plugin-hint" }, "还没有自己的计划。点「新建计划」从头写，或在下面的预置计划上点「复制为我的计划」再改。"),
        draft ? h(PlanEditor, { key: draft.id || "new-" + draft.name, draft: draft, onCancel: function () { setDraft(null); },
          onSaved: async function (id) {
            setDraft(null); await loadCustom(); setMsg("计划已保存。");
            const fresh = ((await api("/plans")).plans || []).map(customToPlan).find(function (x) { return x.id === id; });
            if (fresh) choose(fresh);
          } }) : null,
        h("h3", { className: "gc-sub" }, "UP 主推荐" + (ups.length ? "（" + ups.length + "）" : "")),
        ups.length
          ? h("div", { className: "gc-plan-grid" }, ups.map(card))
          : h("p", { className: "pmw-plugin-hint" }, "还没有收录 UP 主的计划。新建或编辑计划时把「来源」选成 UP 主、填上名称和主页链接，就会出现在这里。"),
        h("h3", { className: "gc-sub" }, "预置计划"),
        h("div", { className: "gc-plan-grid" }, PLANS.map(card)),
        open ? h("section", { className: "gc-chart-box gc-plan-apply" },
          h("h3", { className: "gc-sub" }, "把「" + open.name + "」排进日历"),
          open.source && open.source.type && open.source.type !== "self"
            ? h("p", { className: "pmw-plugin-hint" }, "来源：", h(SourceBadge, { source: open.source }), open.source.note ? " · " + open.source.note : "") : null,
          open.videos && open.videos.length ? h("div", { className: "gc-plan-videos" }, h("small", null, "关联视频："),
            open.videos.map(function (v, i) { return h(ExtLink, { key: i, href: v.url }, (v.title || "视频 " + (i + 1)) + (v.creator ? "（" + v.creator + "）" : "")); })) : null,
          h("div", { className: "gc-controls" },
            h("label", { className: "gc-inline" }, "开始日期", h("input", { type: "date", className: "gc-search", value: start, onChange: function (e) { setStart(e.target.value); } })),
            h("span", { className: "gc-inline" }, open.startMode === "date" ? "每周第几天" : "每周练",
              (open.startMode === "date" ? ["第 1 天", "第 2 天", "第 3 天", "第 4 天", "第 5 天", "第 6 天", "第 7 天"] : DAY_NAMES).map(function (n, i) {
                const on = days.indexOf(i + 1) >= 0;
                return h("button", { key: n, type: "button", className: "gc-chip" + (on ? " on" : ""), "aria-pressed": on,
                  onClick: function () { setDays(on ? days.filter(function (x) { return x !== i + 1; }) : days.concat([i + 1])); } }, n);
              }))),
          !daysOk
            ? h("p", { className: "gc-note" }, open.custom
                ? "这个计划每周最多 " + open.perWeek + " 节课，请至少选 " + open.perWeek + " 天（现在选了 " + days.length + " 天）。每周的课按顺序排到所选日子。"
                : "这个计划每周 " + open.perWeek + " 次，请选 " + open.perWeek + " 天（现在选了 " + days.length + " 天）。长距离会排在所选的最后一天。")
            : h("p", { className: "pmw-plugin-hint" }, "共 " + preview.length + " 次训练，" + (preview[0] ? preview[0].date + " 至 " + preview[preview.length - 1].date : "")
              + "。" + (open.startMode === "date" ? "开始日期就是第 1 天。" : "") + "排进去后可以在日历里逐条改。"),
          h("div", { className: "gc-plan-weeks" }, open.sessions.map(function (week, w) {
            return h("div", { key: w, className: "gc-plan-week" }, h("strong", null, "第 " + (w + 1) + " 周" + (week.length ? "" : "（休息周）")),
              h("ol", null, week.map(function (s, j) {
                return h("li", { key: j }, h("span", { className: "gc-dot gc-k-" + s[0] }), s[1],
                  s[3] ? h(ExtLink, { href: s[3], className: "gc-link gc-inline-video" }, "看视频") : null, h("small", null, s[2]));
              })));
          })),
          h("div", { className: "gc-detail-bar" },
            h("button", { className: "pmw-plugin-button gc-primary", type: "button", disabled: busy || !daysOk || !preview.length, onClick: apply },
              busy ? "排进日历中…" : "排进日历"),
            open.custom ? h("button", { className: "pmw-plugin-button", type: "button", onClick: function () { setDraft(planToDraft(open, false)); setOpen(null); } }, "编辑这个计划") : null,
            h("button", { className: "pmw-plugin-button", type: "button", onClick: function () { setOpen(null); } }, "收起"))) : null,
        msg ? h("p", { className: "pmw-plugin-hint", role: "status" }, msg) : null);
    }

    /** 计划编辑器：基本信息 + 按周编辑课表 */
    function PlanEditor(props) {
      const [d, setD] = useState(function () { return JSON.parse(JSON.stringify(props.draft)); });
      const [msg, setMsg] = useState("");
      const [busy, setBusy] = useState(false);
      const upd = function (fn) { const n = JSON.parse(JSON.stringify(d)); fn(n); setD(n); };

      async function save(e) {
        e.preventDefault();
        setBusy(true); setMsg("");
        try {
          const body = JSON.stringify({ name: d.name, kind: d.kind, level: d.level, description: d.description, days: d.days.slice().sort(), weeks: d.weeks,
            source: d.source || { type: "self" }, videos: (d.videos || []).filter(function (v) { return String(v.url || "").trim(); }),
            start_mode: d.startMode || "week" });
          const res = d.id
            ? await api("/plans/" + d.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: body })
            : await api("/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: body });
          props.onSaved(res.id || d.id);
        } catch (err) { setMsg("保存失败：" + errText(err)); } finally { setBusy(false); }
      }

      const total = d.weeks.reduce(function (t, w) { return t + w.length; }, 0);
      const [library, setLibrary] = useState([]);
      useEffect(function () { api("/videos").then(function (r) { setLibrary(r.videos || []); }).catch(function () {}); }, []);
      const src = d.source || { type: "self" };
      const vids = d.videos || [];
      return h("form", { className: "gc-edit gc-plan-editor", onSubmit: save, "aria-label": "编辑训练计划" },
        h("datalist", { id: "gc-video-lib" }, library.map(function (v) { return h("option", { key: v.id, value: v.url }, v.title + (v.creator ? " · " + v.creator : "")); })),
        h("h3", { className: "gc-sub" }, d.id ? "编辑计划" : "新建计划"),
        h("div", { className: "gc-edit-row" },
          h("label", { className: "gc-field" }, "计划名称", h("input", { value: d.name, maxLength: 40, placeholder: "如：春季半马备赛", onChange: function (e) { upd(function (n) { n.name = e.target.value; }); } })),
          h("label", { className: "gc-field" }, "类型", h("select", { value: d.kind, onChange: function (e) { upd(function (n) { n.kind = e.target.value; }); } },
            PLAN_KINDS.map(function (k) { return h("option", { key: k[0], value: k[0] }, k[1]); }))),
          h("label", { className: "gc-field" }, "难度", h("input", { value: d.level, maxLength: 10, placeholder: "入门 / 进阶 / 高阶", onChange: function (e) { upd(function (n) { n.level = e.target.value; }); } })),
          h("label", { className: "gc-field" }, "排期口径", h("select", { value: d.startMode || "week", onChange: function (e) { upd(function (n) { n.startMode = e.target.value; }); } },
            h("option", { value: "week" }, "按星期排（周一是第 1 周）"), h("option", { value: "date" }, "按开始日期排（第 1 天=开始日期）")))),
        h("label", { className: "gc-field" }, "说明", h("textarea", { rows: 2, value: d.description, maxLength: 500, placeholder: "目标、适合谁、注意事项…", onChange: function (e) { upd(function (n) { n.description = e.target.value; }); } })),
        h("div", { className: "gc-edit-row" },
          h("label", { className: "gc-field" }, "来源", h("select", { value: src.type || "self", onChange: function (e) { upd(function (n) { n.source = Object.assign({}, n.source || {}, { type: e.target.value }); }); } },
            SOURCE_TYPES.map(function (k) { return h("option", { key: k[0], value: k[0] }, k[1]); }))),
          src.type && src.type !== "self" ? h("label", { className: "gc-field" }, src.type === "up" ? "UP 主名称" : "来源名称",
            h("input", { value: src.name || "", maxLength: 40, onChange: function (e) { upd(function (n) { n.source.name = e.target.value; }); } })) : null,
          src.type && src.type !== "self" ? h("label", { className: "gc-field" }, "主页链接",
            h("input", { value: src.url || "", placeholder: "https://space.bilibili.com/…", onChange: function (e) { upd(function (n) { n.source.url = e.target.value; }); } })) : null),
        src.type && src.type !== "self" ? h("label", { className: "gc-field" }, "来源说明",
          h("input", { value: src.note || "", maxLength: 200, placeholder: "如：根据某期视频整理，原视频链接见关联视频", onChange: function (e) { upd(function (n) { n.source.note = e.target.value; }); } })) : null,
        h("div", { className: "gc-field" }, "关联视频（整个计划的讲解、热身、拉伸等；可从推荐视频里选，也可直接粘贴链接）",
          vids.map(function (v, i) {
            return h("div", { key: i, className: "gc-plan-edit-row gc-video-row" },
              h("input", { list: "gc-video-lib", value: v.url || "", placeholder: "视频链接", "aria-label": "关联视频 " + (i + 1) + " 链接", onChange: function (e) {
                const url = e.target.value; const hit = library.find(function (x) { return x.url === url; });
                upd(function (n) { n.videos[i].url = url; if (hit) { n.videos[i].title = n.videos[i].title || hit.title; n.videos[i].creator = n.videos[i].creator || hit.creator; } });
              } }),
              h("input", { value: v.title || "", maxLength: 100, placeholder: "标题", "aria-label": "关联视频 " + (i + 1) + " 标题", onChange: function (e) { upd(function (n) { n.videos[i].title = e.target.value; }); } }),
              h("input", { value: v.creator || "", maxLength: 40, placeholder: "UP 主", "aria-label": "关联视频 " + (i + 1) + " UP 主", onChange: function (e) { upd(function (n) { n.videos[i].creator = e.target.value; }); } }),
              h("button", { type: "button", className: "gc-link", onClick: function () { upd(function (n) { n.videos.splice(i, 1); }); } }, "删除"));
          }),
          h("button", { type: "button", className: "gc-link", disabled: vids.length >= 30, onClick: function () { upd(function (n) { n.videos = (n.videos || []).concat([{ url: "", title: "", creator: "" }]); }); } }, "加一个关联视频")),
        h("div", { className: "gc-field" }, "默认训练日（排进日历时预选，每周的课按顺序排到这些日子）",
          h("span", { className: "gc-chips" }, DAY_NAMES.map(function (nm, i) {
            const on = d.days.indexOf(i + 1) >= 0;
            return h("button", { key: nm, type: "button", className: "gc-chip" + (on ? " on" : ""), "aria-pressed": on,
              onClick: function () { upd(function (n) { n.days = on ? n.days.filter(function (x) { return x !== i + 1; }) : n.days.concat([i + 1]); }); } }, nm);
          }))),
        h("div", { className: "gc-plan-edit-weeks" }, d.weeks.map(function (week, w) {
          return h("div", { key: w, className: "gc-plan-edit-week" },
            h("div", { className: "gc-section-head" },
              h("strong", null, "第 " + (w + 1) + " 周" + (week.length ? "（" + week.length + " 节）" : "（休息周）")),
              h("span", { className: "gc-detail-bar" },
                h("button", { type: "button", className: "gc-link", disabled: week.length >= 7, onClick: function () { upd(function (n) { n.weeks[w].push({ kind: "run", title: "", detail: "" }); }); } }, "加一节课"),
                w > 0 ? h("button", { type: "button", className: "gc-link", onClick: function () { upd(function (n) { n.weeks[w] = JSON.parse(JSON.stringify(n.weeks[w - 1])); }); } }, "照上一周") : null,
                h("button", { type: "button", className: "gc-link", onClick: function () { upd(function (n) { n.weeks.splice(w + 1, 0, JSON.parse(JSON.stringify(n.weeks[w]))); }); } }, "复制本周"),
                d.weeks.length > 1 ? h("button", { type: "button", className: "gc-link", onClick: function () { upd(function (n) { n.weeks.splice(w, 1); }); } }, "删除本周") : null)),
            week.map(function (s, j) {
              return h("div", { key: j, className: "gc-plan-edit-session" },
                h("div", { className: "gc-plan-edit-row" },
                  h("select", { value: s.kind, "aria-label": "第 " + (w + 1) + " 周第 " + (j + 1) + " 节类型", onChange: function (e) { upd(function (n) { n.weeks[w][j].kind = e.target.value; }); } },
                    Object.keys(KIND_NAMES).map(function (k) { return h("option", { key: k, value: k }, KIND_NAMES[k]); })),
                  h("input", { value: s.title, maxLength: 60, placeholder: "标题，如：间歇 6×800 米", "aria-label": "第 " + (w + 1) + " 周第 " + (j + 1) + " 节标题",
                    onChange: function (e) { upd(function (n) { n.weeks[w][j].title = e.target.value; }); } }),
                  h("input", { value: s.detail, maxLength: 2000, placeholder: "内容：配速、心率区间、动作组数…", "aria-label": "第 " + (w + 1) + " 周第 " + (j + 1) + " 节内容",
                    onChange: function (e) { upd(function (n) { n.weeks[w][j].detail = e.target.value; }); } }),
                  h("input", { list: "gc-video-lib", value: s.video || "", placeholder: "视频链接（可选）", "aria-label": "第 " + (w + 1) + " 周第 " + (j + 1) + " 节视频",
                    onChange: function (e) { upd(function (n) { n.weeks[w][j].video = e.target.value; }); } }),
                  h("span", { className: "gc-detail-bar" },
                    h("button", { type: "button", className: "gc-link", disabled: j === 0, title: "上移", onClick: function () { upd(function (n) { const a = n.weeks[w]; const t = a[j - 1]; a[j - 1] = a[j]; a[j] = t; }); } }, "上移"),
                    h("button", { type: "button", className: "gc-link", disabled: j === week.length - 1, title: "下移", onClick: function () { upd(function (n) { const a = n.weeks[w]; const t = a[j + 1]; a[j + 1] = a[j]; a[j] = t; }); } }, "下移"),
                    h("button", { type: "button", className: "gc-link", onClick: function () { upd(function (n) { n.weeks[w].splice(j, 1); }); } }, "删除"))),
                h("div", { className: "gc-plan-edit-row gc-target-row" },
                  h("small", null, "目标（可选）"),
                  h("label", { className: "gc-field" }, "距离 km", h("input", { type: "number", min: "0", max: "1000", step: "0.1", value: s.target_distance_m ? String(s.target_distance_m / 1000) : "", placeholder: "留空按标题认", "aria-label": "第 " + (w + 1) + " 周第 " + (j + 1) + " 节目标距离公里",
                    onChange: function (e) { upd(function (n) { n.weeks[w][j].target_distance_m = Math.round((Number(e.target.value) || 0) * 1000); }); } })),
                  h("label", { className: "gc-field" }, "时长 分钟", h("input", { type: "number", min: "0", max: "1440", step: "1", value: s.target_duration_s ? String(Math.round(s.target_duration_s / 60)) : "", placeholder: "留空按标题认", "aria-label": "第 " + (w + 1) + " 周第 " + (j + 1) + " 节目标时长分钟",
                    onChange: function (e) { upd(function (n) { n.weeks[w][j].target_duration_s = Math.round((Number(e.target.value) || 0) * 60); }); } })),
                  h("span", { className: "gc-inline" },
                    h(PaceInput, { label: "快端", value: s.target_pace_lo_s || 0, placeholder: "", onChange: function (v) { upd(function (n) { n.weeks[w][j].target_pace_lo_s = v; }); } }),
                    h(PaceInput, { label: "慢端", value: s.target_pace_hi_s || 0, placeholder: "", onChange: function (v) { upd(function (n) { n.weeks[w][j].target_pace_hi_s = v; }); } }))),
                h("div", { className: "gc-plan-edit-row gc-target-row" },
                  h("small", null, "强度（可选）"),
                  h("label", { className: "gc-field" }, "心率区间下限", h("input", { type: "number", min: "1", max: "5", value: s.target_hr_zone_lo ? String(s.target_hr_zone_lo) : "", placeholder: "1～5", onChange: function (e) { upd(function (n) { n.weeks[w][j].target_hr_zone_lo = Number(e.target.value) || 0; }); } })),
                  h("label", { className: "gc-field" }, "心率区间上限", h("input", { type: "number", min: "1", max: "5", value: s.target_hr_zone_hi ? String(s.target_hr_zone_hi) : "", placeholder: "1～5", onChange: function (e) { upd(function (n) { n.weeks[w][j].target_hr_zone_hi = Number(e.target.value) || 0; }); } }))));
            }));
        })),
        h("div", { className: "gc-detail-bar" },
          h("button", { type: "button", className: "pmw-plugin-button", disabled: d.weeks.length >= 52, onClick: function () { upd(function (n) { n.weeks.push(n.weeks.length ? JSON.parse(JSON.stringify(n.weeks[n.weeks.length - 1])) : []); }); } }, "加一周（照最后一周）"),
          h("span", { className: "pmw-plugin-hint" }, d.weeks.length + " 周，共 " + total + " 节课")),
        h("div", { className: "gc-detail-bar" },
          h("button", { className: "pmw-plugin-button gc-primary", type: "submit", disabled: busy || !d.name.trim() || !total }, busy ? "保存中…" : "保存计划"),
          h("button", { className: "pmw-plugin-button", type: "button", onClick: props.onCancel }, "取消")),
        msg ? h("p", { className: "gc-note", role: "alert" }, msg) : null);
    }

    // ---------------------------------------------------------------------------
    // 训练日历
    // ---------------------------------------------------------------------------

    const QUICK_ITEMS = [
      ["run", "轻松跑", "心率区间 2，40 分钟左右。"], ["run", "节奏跑", "热身 15 分钟 → 节奏跑 20 分钟（区间 3～4）→ 放松 10 分钟。"],
      ["run", "间歇", "热身 15 分钟 → 6×800 米，组间慢跑 400 米 → 放松 10 分钟。"], ["run", "长距离", "比轻松跑再慢一些，按计划距离。"],
      ["strength", "核心训练", CORE_A], ["strength", "下肢力量", LEG(3)], ["rest", "休息", "完全休息或散步、拉伸。"],
    ];

    /** 文本里认目标：多段（如「热身 15 分钟 → 节奏跑 20 分钟」）取最大值，贴近主训练量。 */
    function maxMatch(text, re, pick) {
      let best = 0, m;
      const reAll = new RegExp(re.source, re.flags.indexOf("g") < 0 ? re.flags + "g" : re.flags);
      while ((m = reAll.exec(text)) !== null) {
        const v = pick(m);
        if (v > best) best = v;
        if (!m[0]) reAll.lastIndex++;
      }
      return best;
    }

    /** 目标量：结构化字段优先，没填就从标题、内容文字里认（预置计划的量都写在标题里）。返回 {dist: 米, dur: 秒}。 */
    function planTarget(it) {
      let dist = Number(it.target_distance_m) || 0;
      let dur = Number(it.target_duration_s) || 0;
      if (!dist || !dur) {
        const text = String(it.title || "") + " " + String(it.detail || "");
        if (!dist) {
          dist = maxMatch(text, /(\d+(?:\.\d+)?)\s*(×|x|X|\*)\s*(\d+(?:\.\d+)?)\s*米/, function (m) { return Number(m[1]) * Number(m[3]); }); // 6×800 米
          if (!dist) dist = maxMatch(text, /(\d+(?:\.\d+)?)\s*(公里|km|千米)/i, function (m) { return Number(m[1]) * 1000; });
          if (!dist) dist = maxMatch(text, /(\d{3,6})\s*米/, function (m) { return Number(m[1]); });
        }
        if (!dur) {
          dur = maxMatch(text, /(\d+(?:\.\d+)?)\s*(小时|h)(?!\w)/i, function (m) { return Number(m[1]) * 3600; });
          if (!dur) dur = maxMatch(text, /(\d+(?:\.\d+)?)\s*(分钟|min|分)(?!\w)/i, function (m) { return Number(m[1]) * 60; });
        }
      }
      return { dist: dist, dur: dur };
    }

    const ACT_RATE_DONE = 0.95, ACT_RATE_PARTIAL = 0.6;
    const ACT_STATES = [[
      "done", "完成", "gc-st-done"
    ], [
      "partial", "部分完成", "gc-st-partial"
    ], [
      "miss", "未达", "gc-st-miss"
    ], [
      "none", "未设目标", "gc-st-none"
    ]];

    /** 计划 vs 实际：当天同类型活动累加，有距离比距离、有时长比时长，两项都有取达成率低的。
     *  level: done(≥95%) / partial(≥60%) / miss(<60%) / none(当天无活动或未设目标)；手动 done 优先按完成显示。 */
    function actStatus(it, acts) {
      const target = planTarget(it);
      const relevant = acts.filter(function (a) {
        return it.kind === "strength" ? isStrengthType(a.type_key) : !isStrengthType(a.type_key);
      });
      const actual = {
        dist: relevant.reduce(function (s, a) { return s + (Number(a.distance_m) || 0); }, 0),
        dur: relevant.reduce(function (s, a) { return s + (Number(a.duration_s) || 0); }, 0),
      };
      const base = { target: target, actual: actual, rate: 0 };
      if (it.done) return Object.assign({}, base, { level: "done", manual: true });
      if (!relevant.length || (!target.dist && !target.dur)) return Object.assign({}, base, { level: "none" });
      const rates = [];
      if (target.dist > 0) rates.push(actual.dist / target.dist);
      if (target.dur > 0) rates.push(actual.dur / target.dur);
      const rate = Math.min.apply(null, rates);
      const level = rate >= ACT_RATE_DONE ? "done" : rate >= ACT_RATE_PARTIAL ? "partial" : "miss";
      return Object.assign({}, base, { level: level, rate: rate });
    }

    /** 强度判定（0.11.0）：目标配速区间 [快端, 慢端] 与目标心率区间，用当天同类型活动的配速/均心率判断。
     *  返回 { level: fast/on/slow/none, pace, hr, text }：快于快端=超强度，慢于慢端=强度不足，区间内=达标。 */
    function intensityStatus(it, acts, hrBoundaries) {
      const relevant = acts.filter(function (a) {
        return it.kind === "strength" ? isStrengthType(a.type_key) : !isStrengthType(a.type_key);
      });
      const lo = Number(it.target_pace_lo_s) || 0, hi = Number(it.target_pace_hi_s) || 0;
      const zlo = Number(it.target_hr_zone_lo) || 0, zhi = Number(it.target_hr_zone_hi) || 0;
      if (!relevant.length || (!lo && !hi && !zlo && !zhi)) return { level: "none", text: "" };
      const dist = relevant.reduce(function (s, a) { return s + (Number(a.distance_m) || 0); }, 0);
      const dur = relevant.reduce(function (s, a) { return s + (Number(a.duration_s) || 0); }, 0);
      const pace = dur > 0 && dist > 0 ? dur / (dist / 1000) : 0;
      const hrs = relevant.filter(function (a) { return Number(a.avg_hr) > 0; }).map(function (a) { return Number(a.avg_hr); });
      const hr = hrs.length ? hrs.reduce(function (s, v) { return s + v; }, 0) / hrs.length : 0;
      const b = Array.isArray(hrBoundaries) ? hrBoundaries : [];
      let zone = 0;
      if (hr > 0 && b.length) { for (let i = 0; i < b.length; i++) { if (hr >= Number(b[i])) zone = i + 1; } if (!zone) zone = 1; }
      const checks = [];
      if (lo > 0 || hi > 0) {
        if (lo > 0 && pace > 0 && pace < lo) checks.push("fast");
        else if (hi > 0 && pace > hi) checks.push("slow");
        else if (pace > 0) checks.push("on");
      }
      if (zlo > 0 || zhi > 0) {
        if (zone > 0 && zlo > 0 && zone < zlo) checks.push("slow");
        else if (zone > 0 && zhi > 0 && zone > zhi) checks.push("fast");
        else if (zone > 0) checks.push("on");
      }
      const level = checks.indexOf("fast") >= 0 ? "fast" : checks.indexOf("slow") >= 0 ? "slow" : checks.indexOf("on") >= 0 ? "on" : "none";
      let text = "";
      if (level !== "none") {
        const parts = [];
        if (pace > 0) parts.push("配速 " + fmtPace(pace));
        if (hr > 0) parts.push(zone > 0 ? "心率区间 " + zone + "（" + Math.round(hr) + " bpm）" : "均心率 " + Math.round(hr) + " bpm");
        const target = [];
        if (lo > 0 || hi > 0) target.push("目标配速 " + (lo > 0 ? fmtPace(lo) : "不限") + "～" + (hi > 0 ? fmtPace(hi) : "不限"));
        if (zlo > 0 || zhi > 0) target.push("目标心率区间 " + zlo + "～" + zhi);
        text = parts.join(" · ") + "；" + target.join(" · ");
      }
      return { level: level, pace: pace, hr: hr, zone: zone, text: text };
    }

    const INTENSITY_STATES = [["fast", "超强度", "gc-st-fast"], ["on", "强度达标", "gc-st-on"], ["slow", "强度不足", "gc-st-slow"]];
    function sessionIntensityLabel(st) { const hit = INTENSITY_STATES.find(function (s) { return s[0] === st.level; }); return hit ? hit[1] : ""; }

    /** 完成度短标签，格子和详情共用："完成 100%" / "部分 72%" / "未达 12%" / "未设目标" */
    function actLabel(st) {
      const hit = ACT_STATES.find(function (s) { return s[0] === st.level; });
      if (!hit || st.level === "none") return "未设目标";
      if (st.manual) return "完成（手动）";
      const short = st.level === "done" ? "完成" : st.level === "partial" ? "部分" : "未达";
      return short + " " + Math.round(st.rate * 100) + "%";
    }

    /** 目标 / 实际的可读串，详情面板用 */
    function actCompare(st) {
      const bits = [];
      if (st.target.dist > 0) bits.push("距离 " + fmtDistance(st.actual.dist) + " / " + fmtDistance(st.target.dist));
      if (st.target.dur > 0) bits.push("时长 " + fmtDuration(Math.round(st.actual.dur)) + " / " + fmtDuration(st.target.dur));
      return bits.join(" · ");
    }

    function CalendarView(props) {
      const today = toYMD(new Date());
      const [month, setMonth] = useState(function () { const d = fromYMD(props.focus || today); d.setDate(1); return d; });
      const [data, setData] = useState({ items: [], activities: [] });
      const [hrBounds, setHrBounds] = useState([]);
      const [phase, setPhase] = useState(null);
      const [sel, setSel] = useState(props.focus || today);
      const [editing, setEditing] = useState(null);
      const [msg, setMsg] = useState("");

      // 月历从这个月第一天所在周的周一画到最后一天所在周的周日
      const first = new Date(month.getFullYear(), month.getMonth(), 1);
      const gridStart = new Date(first); gridStart.setDate(first.getDate() - ((first.getDay() + 6) % 7));
      const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
      const gridEnd = new Date(last); gridEnd.setDate(last.getDate() + (7 - ((last.getDay() + 6) % 7) - 1));
      const from = toYMD(gridStart), to = toYMD(gridEnd);

      async function load() {
        try { setData(await api("/calendar?from=" + from + "&to=" + to)); } catch (err) { setMsg("读取日历失败：" + errText(err)); }
      }
      useEffect(function () { load(); }, [from, to]);
      useEffect(function () { api("/hr-zones").then(function (d) { setHrBounds(d.boundaries || []); }).catch(function () {}); }, []);
      useEffect(function () { api("/goals/phase").then(function (d) { setPhase(d.phase || null); }).catch(function () {}); }, []);

      const byDay = {};
      data.items.forEach(function (it) { (byDay[it.date] = byDay[it.date] || { items: [], acts: [] }).items.push(it); });
      data.activities.forEach(function (a) { const d = String(a.start_time).slice(0, 10); (byDay[d] = byDay[d] || { items: [], acts: [] }).acts.push(a); });

      const cells = [];
      for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) cells.push(toYMD(d));
      const shift = function (n) { setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1)); };

      async function save(body, id) {
        setMsg("");
        try {
          if (id) await api("/calendar/" + id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          else await api("/calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: [body] }) });
          setEditing(null);
          await load();
        } catch (err) { setMsg("保存失败：" + errText(err)); }
      }
      async function remove(it) {
        try { await api("/calendar/" + it.id, { method: "DELETE" }); await load(); } catch (err) { setMsg("删除失败：" + errText(err)); }
      }
      async function removePlan(it) {
        try { await api("/calendar/plan/" + it.plan_run + "?future=1", { method: "DELETE" }); await load(); setMsg("已删除「" + it.plan_name + "」今天及以后的安排。"); }
        catch (err) { setMsg("删除失败：" + errText(err)); }
      }

      const day = byDay[sel] || { items: [], acts: [] };
      const statusOf = function (it) { return actStatus(it, day.acts); };
      const intensityOf = function (it, acts) { return intensityStatus(it, acts, hrBounds); };
      return h("div", { className: "gc-cal" },
        h("div", { className: "gc-controls" },
          h("button", { className: "pmw-plugin-button", type: "button", onClick: function () { shift(-1); } }, "上个月"),
          h("strong", { className: "gc-cal-title" }, month.getFullYear() + " 年 " + (month.getMonth() + 1) + " 月"),
          h("button", { className: "pmw-plugin-button", type: "button", onClick: function () { shift(1); } }, "下个月"),
          h("button", { className: "gc-link", type: "button", onClick: function () { const d = new Date(); d.setDate(1); setMonth(d); setSel(today); } }, "回到今天"),
          phase ? h("span", { className: "gc-cal-phase" }, phase.phase + " · 距比赛 " + phase.days_left + " 天") : h("span", { className: "pmw-plugin-hint" }, "点某一天查看和安排训练；整套计划在「计划」里排进来")),
        h("div", { className: "gc-cal-grid", role: "grid" },
          DAY_NAMES.map(function (n) { return h("div", { key: n, className: "gc-cal-head" }, n); }),
          cells.map(function (c) {
            const info = byDay[c] || { items: [], acts: [] };
            const out = fromYMD(c).getMonth() !== month.getMonth();
            const worst = info.items.reduce(function (w, it) {
              const rank = { none: 0, done: 1, partial: 2, miss: 3 };
              const lv = actStatus(it, info.acts).level;
              return rank[lv] > rank[w] ? lv : w;
            }, "none");
            return h("button", {
              key: c, type: "button", role: "gridcell",
              className: "gc-cal-cell" + (out ? " out" : "") + (c === today ? " today" : "") + (c === sel ? " sel" : "") + " gc-cal-" + worst,
              "aria-label": fromYMD(c).getDate() + " 日，完成度：" + (ACT_STATES.find(function (s) { return s[0] === worst; }) || [])[1],
              onClick: function () { setSel(c); setEditing(null); },
            },
              h("span", { className: "gc-cal-day" }, String(fromYMD(c).getDate())),
              info.items.slice(0, 3).map(function (it) {
                const st = actStatus(it, info.acts);
                const ist = intensityStatus(it, info.acts, hrBounds);
                return h("span", {
                  key: it.id,
                  className: "gc-cal-item gc-k-" + it.kind + " " + (ACT_STATES.find(function (s) { return s[0] === st.level; }) || [])[2],
                  title: it.title + "：" + actLabel(st) + (st.target.dist || st.target.dur ? "（" + actCompare(st) + "）" : "")
                    + (ist.level !== "none" ? " · " + sessionIntensityLabel(ist) + "：" + ist.text : ""),
                }, actLabel(st) + (ist.level !== "none" ? "/" + sessionIntensityLabel(ist) : "") + " · " + it.title);
              }),
              info.items.length > 3 ? h("span", { className: "gc-cal-more" }, "还有 " + (info.items.length - 3) + " 项") : null,
              info.acts.map(function (a) {
                return h("span", { key: a.activity_id, className: "gc-cal-act" },
                  isStrengthType(a.type_key) ? "力量 " + fmtDuration(a.duration_s) : fmtDistance(a.distance_m));
              }));
          })),
        h("section", { className: "gc-chart-box gc-cal-day-panel" },
          h("div", { className: "gc-section-head" },
            h("h3", { className: "gc-sub" }, sel + " " + DAY_NAMES[(fromYMD(sel).getDay() + 6) % 7]),
            !editing ? h("button", { className: "pmw-plugin-button", type: "button", onClick: function () { setEditing({ date: sel, kind: "run", title: "", detail: "" }); } }, "添加训练") : null),
          day.items.length || day.acts.length ? null : h("p", { className: "pmw-plugin-hint" }, "这天没有安排。"),
          day.items.map(function (it) {
            const st = statusOf(it);
            const ist = intensityOf(it, day.acts);
            const state = ACT_STATES.find(function (s) { return s[0] === st.level; }) || ACT_STATES[3];
            const istState = INTENSITY_STATES.find(function (s) { return s[0] === ist.level; });
            return h("div", { key: it.id, className: "gc-cal-entry" },
              h("div", { className: "gc-cal-entry-head" },
                h("span", { className: "gc-plan-kind gc-k-" + it.kind }, KIND_NAMES[it.kind] || it.kind),
                h("strong", null, it.title),
                h("span", { className: "gc-tag " + state[2] }, actLabel(st)),
                istState ? h("span", { className: "gc-tag " + istState[2] }, sessionIntensityLabel(ist)) : null,
                it.plan_name ? h("small", null, "来自计划「" + it.plan_name + "」") : null),
              st.level !== "none" && (st.target.dist || st.target.dur) ? h("p", { className: "gc-cal-compare" }, "计划 vs 实际：" + actCompare(st)) : null,
              ist.level !== "none" ? h("p", { className: "gc-cal-compare" }, "强度：" + ist.text) : null,
              it.detail ? h("p", { className: "gc-desc" }, it.detail) : null,
              h("div", { className: "gc-detail-bar" },
                it.video ? h(ExtLink, { href: it.video, className: "gc-link gc-strong-link" }, "看视频（" + videoPlatform(it.video) + "）") : null,
                h("button", { className: "gc-link", type: "button", onClick: function () { save({ done: !it.done }, it.id); } }, it.done ? "取消完成" : "标为完成"),
                h("button", { className: "gc-link", type: "button", onClick: function () { setEditing(it); } }, "修改"),
                h("button", { className: "gc-link", type: "button", onClick: function () { remove(it); } }, "删除"),
                it.plan_run ? h("button", { className: "gc-link", type: "button", onClick: function () { removePlan(it); } }, "删除这个计划今天及以后的安排") : null));
          }),
          day.acts.length ? h("div", { className: "gc-cal-acts" }, h("small", null, "这天的实际活动："),
            day.acts.map(function (a) {
              return h("button", { key: a.activity_id, type: "button", className: "gc-link", onClick: function () { props.onOpen && props.onOpen(a); } },
                (a.activity_name || "活动") + " · " + (isStrengthType(a.type_key) ? fmtDuration(a.duration_s) : fmtDistance(a.distance_m)));
            })) : null,
          editing ? h(CalendarForm, { key: editing.id || "new", item: editing, onCancel: function () { setEditing(null); }, onSave: function (b) { save(b, editing.id); } }) : null,
          msg ? h("p", { className: "gc-note", role: "alert" }, msg) : null));
    }

    function CalendarForm(props) {
      const it = props.item;
      const [date, setDate] = useState(it.date);
      const [kind, setKind] = useState(it.kind || "run");
      const [title, setTitle] = useState(it.title || "");
      const [detail, setDetail] = useState(it.detail || "");
      const [video, setVideo] = useState(it.video || "");
      const [targetKm, setTargetKm] = useState(it.target_distance_m ? String(it.target_distance_m / 1000) : "");
      const [targetMin, setTargetMin] = useState(it.target_duration_s ? String(Math.round(it.target_duration_s / 60)) : "");
      const [paceLo, setPaceLo] = useState(Number(it.target_pace_lo_s) || 0);
      const [paceHi, setPaceHi] = useState(Number(it.target_pace_hi_s) || 0);
      const [hrLo, setHrLo] = useState(it.target_hr_zone_lo ? String(it.target_hr_zone_lo) : "");
      const [hrHi, setHrHi] = useState(it.target_hr_zone_hi ? String(it.target_hr_zone_hi) : "");
      return h("form", { className: "gc-edit", onSubmit: function (e) {
        e.preventDefault();
        props.onSave({
          date: date, kind: kind, title: title, detail: detail, video: video,
          target_distance_m: Math.round((Number(targetKm) || 0) * 1000),
          target_duration_s: Math.round((Number(targetMin) || 0) * 60),
          target_pace_lo_s: paceLo, target_pace_hi_s: paceHi,
          target_hr_zone_lo: Number(hrLo) || 0, target_hr_zone_hi: Number(hrHi) || 0,
        });
      } },
        !it.id ? h("div", { className: "gc-chips" }, h("small", null, "常用："), QUICK_ITEMS.map(function (q) {
          return h("button", { key: q[1], type: "button", className: "gc-chip", onClick: function () { setKind(q[0]); setTitle(q[1]); setDetail(q[2]); } }, q[1]);
        })) : null,
        h("div", { className: "gc-edit-row" },
          h("label", { className: "gc-field" }, "日期", h("input", { type: "date", value: date, onChange: function (e) { setDate(e.target.value); } })),
          h("label", { className: "gc-field" }, "类型", h("select", { value: kind, onChange: function (e) { setKind(e.target.value); } },
            Object.keys(KIND_NAMES).map(function (k) { return h("option", { key: k, value: k }, KIND_NAMES[k]); })))),
        h("label", { className: "gc-field" }, "标题", h("input", { value: title, maxLength: 60, placeholder: "如：轻松跑 8 公里", onChange: function (e) { setTitle(e.target.value); } })),
        h("label", { className: "gc-field" }, "内容", h("textarea", { rows: 3, value: detail, maxLength: 2000, placeholder: "配速、心率区间、动作组数…", onChange: function (e) { setDetail(e.target.value); } })),
        h("div", { className: "gc-edit-row" },
          h("label", { className: "gc-field" }, "目标距离（公里，可选）", h("input", { type: "number", min: "0", max: "1000", step: "0.1", value: targetKm, placeholder: "如：8", onChange: function (e) { setTargetKm(e.target.value); } })),
          h("label", { className: "gc-field" }, "目标时长（分钟，可选）", h("input", { type: "number", min: "0", max: "1440", step: "1", value: targetMin, placeholder: "如：45", onChange: function (e) { setTargetMin(e.target.value); } }))),
        h("div", { className: "gc-edit-row" },
          h("div", { className: "gc-field" }, "目标配速区间（可选）", h("span", { className: "gc-inline" },
            h(PaceInput, { label: "快端", value: paceLo, placeholder: "轻松跑慢端留空", onChange: setPaceLo }),
            h(PaceInput, { label: "慢端", value: paceHi, placeholder: "间歇快端留空", onChange: setPaceHi }))),
          h("div", { className: "gc-field" }, "目标心率区间（可选）", h("span", { className: "gc-inline" },
            h("input", { type: "number", min: "1", max: "5", value: hrLo, placeholder: "1", "aria-label": "心率区间下限", onChange: function (e) { setHrLo(e.target.value); } }),
            h("small", null, "～"),
            h("input", { type: "number", min: "1", max: "5", value: hrHi, placeholder: "5", "aria-label": "心率区间上限", onChange: function (e) { setHrHi(e.target.value); } })))),
        h("p", { className: "pmw-plugin-hint" }, "留空时从标题、内容里认目标（如「长距离 16 公里」「间歇 6×800 米」）；两项都填时按达成率低的判定。强度区间填了就按实际配速/心率判「达标 / 超强度 / 强度不足」。"),
        h("label", { className: "gc-field" }, "视频链接（可选）", h("input", { value: video, placeholder: "https://…", onChange: function (e) { setVideo(e.target.value); } })),
        h("div", { className: "gc-detail-bar" },
          h("button", { className: "pmw-plugin-button gc-primary", type: "submit", disabled: !title.trim() }, "保存"),
          h("button", { className: "pmw-plugin-button", type: "button", onClick: props.onCancel }, "取消")));
    }

    // ---------------------------------------------------------------------------
    // 比赛（PMW 版是主页面的「比赛」视图，dsh 版是外层「比赛」页签）：比赛信息、成绩、关联活动、影像记忆
    // ---------------------------------------------------------------------------

    const RACE_CATS = [["full", "全程马拉松"], ["half", "半程马拉松"], ["10k", "10 公里"], ["5k", "5 公里"], ["trail", "越野"], ["other", "其他"]];
    const RACE_STATUS = [["finished", "已完赛"], ["registered", "已报名"], ["dnf", "未完赛"], ["dns", "未参赛"]];
    const MEDIA_KINDS = [
      ["certificate", "成绩证书"], ["medal", "完赛奖牌"], ["photo", "参赛照片"], ["video", "视频记录"], ["bib", "号码布"],
      ["shirt", "参赛服"], ["race_pack", "参赛包"], ["finisher_pack", "完赛包"], ["other", "其他"],
    ];
    const MEDIA_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/heic,video/mp4,video/quicktime,video/webm,application/pdf";

    function labelOf(list, k) { const x = list.find(function (o) { return o[0] === k; }); return x ? x[1] : k; }
    function mediaURL(id) { return API_BASE + "/media/" + encodeURIComponent(id) + "/file"; }

    /** 按距离、类型猜比赛类别 */
    function guessCategory(distM, typeKey) {
      if (String(typeKey || "").indexOf("trail") >= 0) return "trail";
      if (distM >= 40000) return "full";
      if (distM >= 20000 && distM <= 22500) return "half";
      if (distM >= 9500 && distM <= 11000) return "10k";
      if (distM >= 4800 && distM <= 5600) return "5k";
      return "other";
    }

    /** 成绩输入：时、分、秒三个数字框，值是秒（0 表示没填） */
    function DurationInput(props) {
      const v = props.value || 0;
      const [hh, setH] = useState(v ? String(Math.floor(v / 3600)) : "");
      const [mm, setM] = useState(v ? String(Math.floor((v % 3600) / 60)) : "");
      const [ss, setS] = useState(v ? String(Math.round(v % 60)) : "");
      const push = function (a, b, c) {
        const t = (parseInt(a, 10) || 0) * 3600 + Math.min(59, parseInt(b, 10) || 0) * 60 + Math.min(59, parseInt(c, 10) || 0);
        props.onChange(t);
      };
      const box = function (val, set, label, max, idx) {
        return [h("input", { key: "i" + idx, type: "number", min: "0", max: String(max), inputMode: "numeric", value: val, "aria-label": "成绩的" + label,
          onChange: function (e) { set(e.target.value); const vals = [hh, mm, ss]; vals[idx] = e.target.value; push(vals[0], vals[1], vals[2]); } }),
          h("small", { key: "l" + idx }, label)];
      };
      return h("span", { className: "gc-pace-input" }, box(hh, setH, "时", 99, 0), box(mm, setM, "分", 59, 1), box(ss, setS, "秒", 59, 2));
    }

    /** 比赛的代表成绩：优先净计时，没有用枪声成绩；{s, net} */
    function raceTime(r) {
      if (isNum(r.net_s) && r.net_s > 0) return { s: r.net_s, net: true };
      if (isNum(r.official_s) && r.official_s > 0) return { s: r.official_s, net: false };
      return null;
    }

    /** 个人最好成绩：每个类别里已完赛的最快一场，优先按净计时比 */
    function personalBests(races) {
      const best = {};
      races.forEach(function (r) {
        const t = raceTime(r);
        if (r.status !== "finished" || !t) return;
        if (!best[r.category] || t.s < raceTime(best[r.category]).s) best[r.category] = r;
      });
      return best;
    }

    /** 目标比赛/成绩：多目标；AI 分析引用最近一场未来目标，具体 PB 从已收录比赛里取 */
    function GoalCard(props) {
      const [goals, setGoals] = useState([]);
      const [phase, setPhase] = useState(null);
      const [prediction, setPrediction] = useState(null);
      const [editing, setEditing] = useState(null);
      const [msg, setMsg] = useState("");
      const [busy, setBusy] = useState(false);
      const pbs = personalBests(props.races || []);
      async function load() {
        try {
          const d = await api("/goals"); setGoals(d.goals || []);
          const p = await api("/goals/phase"); setPhase(p.phase || null);
          const pr = await api("/prediction"); setPrediction(pr.prediction || null);
        } catch (err) { setMsg("读取目标失败：" + errText(err)); }
      }
      useEffect(function () { load(); }, []);
      const today = toYMD(new Date());
      const nextId = function (list) { const f = list.find(function (g) { return g.date && g.date >= today; }); return f ? f.id : (list.length ? list[list.length - 1].id : ""); };

      async function save(g) {
        setBusy(true); setMsg("");
        try {
          await api("/goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(g) });
          setEditing(null); await load(); setMsg("已保存。AI 分析会按最近一场目标的目标配速给建议。");
        } catch (err) { setMsg("保存失败：" + errText(err)); } finally { setBusy(false); }
      }
      async function remove(g) {
        if (!g.id) { setEditing(null); return; }
        if (!window.confirm("删除目标「" + (g.race_name || "未命名") + "」？")) return;
        try { await api("/goals/" + encodeURIComponent(g.id), { method: "DELETE" }); setEditing(null); await load(); }
        catch (err) { setMsg("删除失败：" + errText(err)); }
      }

      const blank = function () { return { id: "", race_name: "", category: "half", date: "", target_s: 0, note: "" }; };
      return h("section", { className: "gc-chart-box gc-goal-form", "aria-label": "目标比赛" },
        h("div", { className: "gc-section-head" },
          h("h3", { className: "gc-sub" }, "目标比赛（" + goals.length + "）"),
          !editing ? h("button", { className: "pmw-plugin-button", type: "button", onClick: function () { setEditing(blank()); } }, "添加目标") : null),
        phase ? h("p", { className: "gc-goal-phase" }, "当前阶段：" + phase.phase + " · 距 " + (phase.goal_name || "目标比赛") + " " + phase.days_left + " 天 · " + phase.focus) : null,
        prediction ? h("div", { className: "gc-prediction" },
          h("h4", { className: "gc-sub" }, labelOf(RACE_CATS, prediction.category) + "完赛预测（近 4 周状态外推）"),
          h("div", { className: "gc-pred-grid" },
            h("div", null, h("small", null, "保守"), h("strong", null, fmtDuration(Math.round(prediction.conservative_s)))),
            h("div", null, h("small", null, "达标"), h("strong", null, fmtDuration(Math.round(prediction.target_s)))),
            h("div", null, h("small", null, "理想"), h("strong", null, fmtDuration(Math.round(prediction.optimistic_s))))),
          prediction.goal_time_s > 0 ? h("p", { className: "pmw-plugin-hint" }, "目标 " + fmtDuration(Math.round(prediction.goal_time_s)) +
            (prediction.goal_time_s > prediction.target_s ? "，比当前状态预测慢 " + fmtDuration(Math.round(prediction.goal_time_s - prediction.target_s)) : "，比当前状态预测快 " + fmtDuration(Math.round(prediction.target_s - prediction.goal_time_s)))) : null,
          h("p", { className: "pmw-plugin-hint" }, "依据：" + prediction.based_on + " · " + prediction.basis_detail + "。预测仅供参考。")) : null,
        goals.length && !editing ? h("div", { className: "gc-goal-list" }, goals.map(function (g) {
          const dist = RACE_DIST[g.category];
          const pace = dist && g.target_s > 0 ? fmtPace(g.target_s / dist) : "";
          const pb = pbs[g.category];
          return h("div", { key: g.id || "new", className: "gc-goal-row" + (g.id === nextId(goals) ? " next" : "") },
            h("div", null,
              h("strong", null, g.race_name || "未命名目标", g.id === nextId(goals) ? h("small", null, " · 最近目标") : null),
              h("small", { className: "pmw-plugin-hint" }, " · " + (RACE_CATS.find(function (c) { return c[0] === g.category; }) || [])[1] + (g.date ? " · " + g.date : "")),
              h("p", { className: "pmw-plugin-hint" }, g.target_s > 0 ? "目标 " + fmtDuration(g.target_s) + (pace ? " · 配速 " + pace : "") : "未填目标成绩",
                pb && RACE_DIST[pb.category] ? " · 这项 PB " + fmtDuration(raceTime(pb).s) : "")),
            h("div", { className: "gc-detail-bar" },
              h("button", { className: "gc-link", type: "button", onClick: function () { setEditing(Object.assign({}, g)); } }, "修改"),
              h("button", { className: "gc-link", type: "button", onClick: function () { remove(g); } }, "删除")));
        })) : null,
        editing ? h(GoalForm, { key: editing.id || "new", goal: editing, busy: busy, onSave: save, onCancel: function () { setEditing(null); }, onDelete: remove }) : null,
        !goals.length && !editing ? h("p", { className: "pmw-plugin-hint" }, "还没有目标比赛，添加一个便于按目标配速给训练建议。") : null,
        msg ? h("p", { className: "pmw-plugin-hint", role: "status" }, msg) : null);
    }

    function GoalForm(props) {
      const g = props.goal;
      const [val, setVal] = useState(g);
      const set = function (k, v) { setVal(Object.assign({}, val, { [k]: v })); };
      const dist = RACE_DIST[val.category];
      const pace = dist && val.target_s > 0 ? fmtPace(val.target_s / dist) : "";
      return h("form", { className: "gc-goal-edit", onSubmit: function (e) { e.preventDefault(); props.onSave(val); } },
        h("div", { className: "gc-controls" },
          h("label", { className: "gc-field" }, "比赛名称", h("input", { value: val.race_name, maxLength: 80, placeholder: "如：2026 北京马拉松", onChange: function (e) { set("race_name", e.target.value); } })),
          h("label", { className: "gc-field" }, "类别", h("select", { value: val.category, onChange: function (e) { set("category", e.target.value); } },
            RACE_CATS.map(function (c) { return h("option", { key: c[0], value: c[0] }, c[1]); }))),
          h("label", { className: "gc-field" }, "日期", h("input", { type: "date", value: val.date || "", onChange: function (e) { set("date", e.target.value); } })),
          h("div", { className: "gc-field" }, "目标成绩", h(DurationInput, { value: val.target_s || 0, onChange: function (v) { set("target_s", v); } }))),
        h("label", { className: "gc-field" }, "备注", h("input", { value: val.note || "", maxLength: 500, placeholder: "目标配速策略、赛道特点…", onChange: function (e) { set("note", e.target.value); } })),
        h("p", { className: "pmw-plugin-hint" }, pace ? "目标平均配速 " + pace : "填目标成绩后自动算目标配速"),
        h("div", { className: "gc-detail-bar" },
          h("button", { className: "pmw-plugin-button gc-primary", type: "submit", disabled: props.busy }, props.busy ? "保存中…" : "保存目标"),
          g.id ? h("button", { className: "pmw-plugin-button", type: "button", onClick: function () { props.onDelete(g); } }, "删除") : null,
          h("button", { className: "pmw-plugin-button", type: "button", onClick: props.onCancel }, "取消")));
    }

    function RacesPage(props) {
      props = props || {};
      const theme = useTheme();
      const [races, setRaces] = useState(null);
      const [open, setOpen] = useState(null);
      const [adding, setAdding] = useState(false);
      const [msg, setMsg] = useState("");
      const [activity, setActivity] = useState(null);
      const [imp, setImp] = useState(null);
      const [impMsg, setImpMsg] = useState("");

      async function load() {
        try { setRaces((await api("/races")).races || []); } catch (err) { setMsg("读取比赛失败：" + errText(err)); }
      }
      useEffect(function () { load(); }, []);

      // 历史比赛导入在后台跑：每 2 秒看一次进度，结束后刷新列表
      useEffect(function () {
        if (!imp || !imp.running) return undefined;
        const t = setInterval(function () {
          api("/status").then(function (s) {
            const x = s.race_import || null;
            setImp(x);
            if (!x || !x.running) {
              setImpMsg(x && x.error ? "导入历史比赛失败：" + x.error
                : "导入完成：找到 " + ((x && x.found) || 0) + " 场比赛，新增 " + ((x && x.imported) || 0) + " 场。");
              load();
            }
          }).catch(function () {});
        }, 2000);
        return function () { clearInterval(t); };
      }, [imp && imp.running]);

      async function importRaces() {
        setImpMsg("");
        try {
          const res = await api("/races/import", { method: "POST" });
          setImp(res.race_import || { running: true, pages: 0, found: 0, imported: 0 });
        } catch (err) { setImpMsg("导入历史比赛失败：" + errText(err)); }
      }

      if (activity) {
        return h(RunDetail, { id: activity.id, title: activity.title, start: activity.start, onBack: function () { setActivity(null); } });
      }
      if (open) {
        return h(RaceDetail, { id: open, onBack: function () { setOpen(null); load(); },
          onOpenActivity: function (a) { setActivity(a); } });
      }
      const list = races || [];
      const pbs = personalBests(list);
      const finished = list.filter(function (r) { return r.status === "finished"; });
      const years = [];
      list.forEach(function (r) {
        const y = String(r.date).slice(0, 4);
        let g = years[years.length - 1];
        if (!g || g.year !== y) { g = { year: y, races: [] }; years.push(g); }
        g.races.push(r);
      });

      return h("div", { className: "pmw-plugin pmw-plugin-module gc-races" },
        h(TitleBar, {
          title: props.embedded ? PLUGIN_NAME : "比赛",
          desc: list.length ? "完赛 " + finished.length + " 场 · 共收录 " + list.length + " 场" : "",
          tabs: props.tabs || null,
          actions: [
            { label: "添加比赛", primary: true, onClick: function () { setAdding(true); } },
            { label: imp && imp.running ? "导入中…" : "从 Garmin 导入历史比赛", disabled: Boolean(imp && imp.running),
              onClick: importRaces, title: "扫描 Garmin 全部活动，把标成比赛的项目补录进来" },
            themeAction(theme),
          ],
        }),
        props.belowTitle || null,
        msg ? h("p", { className: "gc-note", role: "alert" }, msg) : null,
        imp && imp.running ? h("p", { className: "gc-note", role: "status" },
          "正在导入：已翻 " + (imp.pages || 0) + " 页，找到 " + (imp.found || 0) + " 场比赛，新增 " + (imp.imported || 0) + " 场…") : null,
        impMsg ? h("p", { className: "gc-note", role: "status" }, impMsg) : null,
        adding ? h(RaceForm, {
          race: { date: toYMD(new Date()), category: "half", status: "finished" },
          onCancel: function () { setAdding(false); },
          onSaved: function (id) { setAdding(false); load(); setOpen(id); },
        }) : null,
        Object.keys(pbs).length ? h("section", null,
          h("h3", { className: "gc-sub" }, "个人最好成绩"),
          h("div", { className: "gc-stats" }, RACE_CATS.filter(function (c) { return pbs[c[0]]; }).map(function (c) {
            const r = pbs[c[0]];
            return h("button", { key: c[0], type: "button", className: "gc-stat gc-stat-btn", onClick: function () { setOpen(r.id); } },
              h("span", { className: "gc-stat-label" }, c[1]),
              h("span", { className: "gc-stat-value" }, fmtDuration(raceTime(r).s), h("small", { className: "gc-time-kind" }, raceTime(r).net ? " 净时" : " 枪时")),
              h("small", { className: "pmw-plugin-hint" }, r.name + " · " + r.date));
          }))) : null,
        h(GoalCard, { races: list }),
        races && !list.length && !adding
          ? h("div", { className: "gc-empty" },
              h("p", null, "还没有收录比赛。"),
              h("p", { className: "pmw-plugin-hint" }, "同步或打开 Garmin 标成比赛的活动会自动收录；也可以点「从 Garmin 导入历史比赛」一次补齐，或点「添加比赛」手动收录。"))
          : null,
        years.map(function (g) {
          return h("section", { key: g.year },
            h("h3", { className: "gc-sub" }, g.year + " 年 · " + g.races.length + " 场"),
            h("div", { className: "gc-race-grid" }, g.races.map(function (r) {
              const pb = pbs[r.category] && pbs[r.category].id === r.id;
              return h("button", { key: r.id, type: "button", className: "gc-race-card", onClick: function () { setOpen(r.id); } },
                h("span", { className: "gc-race-cover" },
                  r.cover_id ? h("img", { src: mediaURL(r.cover_id), alt: "", loading: "lazy", onError: function (e) { e.currentTarget.style.visibility = "hidden"; } })
                    : h("span", { className: "gc-race-cover-empty" }, labelOf(RACE_CATS, r.category))),
                h("span", { className: "gc-race-body" },
                  h("strong", null, r.name),
                  h("small", null, r.date + (r.city ? " · " + r.city : "") + " · " + labelOf(RACE_CATS, r.category)),
                  h("span", { className: "gc-race-result" },
                    r.status === "finished"
                      ? (raceTime(r) ? [fmtDuration(raceTime(r).s), h("small", { key: "k", className: "gc-time-kind" }, raceTime(r).net ? "净时" : "枪时")] : "已完赛")
                      : labelOf(RACE_STATUS, r.status),
                    pb ? h("span", { className: "gc-tag gc-tag-pb" }, "个人最好") : null),
                  h("small", null, (r.media_count ? r.media_count + " 个影像" : "还没有影像") + (r.activity_id ? " · 已关联活动" : ""))));
            })));
        }));
    }

    function RaceForm(props) {
      const r = props.race || {};
      const [f, setF] = useState({
        name: r.name || "", date: r.date || toYMD(new Date()), city: r.city || "", category: r.category || "other",
        status: r.status || "finished", official_s: r.official_s || 0, net_s: r.net_s || 0, bib_no: r.bib_no || "", rank_overall: r.rank_overall || "",
        rank_group: r.rank_group || "", note: r.note || "", activity_id: r.activity_id || "",
      });
      const [runs, setRuns] = useState([]);
      const [msg, setMsg] = useState("");
      const [busy, setBusy] = useState(false);
      const set = function (k, v) { const n = Object.assign({}, f); n[k] = v; setF(n); };

      useEffect(function () {
        api("/runs").then(function (d) { setRuns((d.runs || []).filter(function (x) { return !isStrengthType(x.type_key); })); }).catch(function () {});
      }, []);
      // 关联活动：比赛日期前后 3 天的跑步，加上当前已关联的
      const near = runs.filter(function (x) {
        const d = fromYMD(String(x.start_time).slice(0, 10)), rd = fromYMD(f.date);
        return x.activity_id === f.activity_id || (d && rd && Math.abs(d - rd) <= 3 * 86400000);
      });

      async function save(e) {
        e.preventDefault();
        setBusy(true); setMsg("");
        try {
          if (props.race && props.race.id) {
            await api("/races/" + props.race.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
            props.onSaved(props.race.id);
          } else {
            const res = await api("/races", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
            props.onSaved(res.id);
          }
        } catch (err) { setMsg("保存失败：" + errText(err)); } finally { setBusy(false); }
      }

      return h("form", { className: "gc-edit gc-race-form", onSubmit: save, "aria-label": "比赛信息" },
        h("label", { className: "gc-field" }, "比赛名称", h("input", { value: f.name, maxLength: 80, placeholder: "如：2026 北京马拉松", onChange: function (e) { set("name", e.target.value); } })),
        h("div", { className: "gc-edit-row" },
          h("label", { className: "gc-field" }, "日期", h("input", { type: "date", value: f.date, onChange: function (e) { set("date", e.target.value); } })),
          h("label", { className: "gc-field" }, "城市", h("input", { value: f.city, maxLength: 40, onChange: function (e) { set("city", e.target.value); } }))),
        h("div", { className: "gc-edit-row" },
          h("label", { className: "gc-field" }, "类别", h("select", { value: f.category, onChange: function (e) { set("category", e.target.value); } },
            RACE_CATS.map(function (c) { return h("option", { key: c[0], value: c[0] }, c[1]); }))),
          h("label", { className: "gc-field" }, "状态", h("select", { value: f.status, onChange: function (e) { set("status", e.target.value); } },
            RACE_STATUS.map(function (c) { return h("option", { key: c[0], value: c[0] }, c[1]); })))),
        h("div", { className: "gc-edit-row" },
          h("div", { className: "gc-field" }, "净计时成绩（过起点到终点，算个人最好用它）", h(DurationInput, { value: f.net_s, onChange: function (v) { set("net_s", v); } })),
          h("div", { className: "gc-field" }, "枪声成绩（发令枪响到终点）", h(DurationInput, { value: f.official_s, onChange: function (v) { set("official_s", v); } }))),
        h("div", { className: "gc-edit-row" },
          h("label", { className: "gc-field" }, "号码", h("input", { value: f.bib_no, maxLength: 20, onChange: function (e) { set("bib_no", e.target.value); } })),
          h("label", { className: "gc-field" }, "总排名", h("input", { value: f.rank_overall, maxLength: 20, placeholder: "如 1203/30000", onChange: function (e) { set("rank_overall", e.target.value); } })),
          h("label", { className: "gc-field" }, "组别排名", h("input", { value: f.rank_group, maxLength: 20, onChange: function (e) { set("rank_group", e.target.value); } }))),
        h("label", { className: "gc-field" }, "关联的 Garmin 活动",
          h("select", { value: f.activity_id, onChange: function (e) { set("activity_id", e.target.value); } },
            [h("option", { key: "none", value: "" }, near.length ? "不关联" : "比赛日期前后 3 天没有跑步记录")].concat(near.map(function (x) {
              return h("option", { key: x.activity_id, value: x.activity_id }, String(x.start_time).slice(0, 16) + " · " + (x.activity_name || "跑步") + " · " + fmtDistance(runView(x).dist));
            })))),
        h("label", { className: "gc-field" }, "备注", h("textarea", { rows: 3, value: f.note, maxLength: 2000, placeholder: "天气、配速策略、补给、感受…", onChange: function (e) { set("note", e.target.value); } })),
        h("div", { className: "gc-detail-bar" },
          h("button", { className: "pmw-plugin-button gc-primary", type: "submit", disabled: busy || !f.name.trim() }, busy ? "保存中…" : "保存"),
          h("button", { className: "pmw-plugin-button", type: "button", onClick: props.onCancel }, "取消")),
        msg ? h("p", { className: "gc-note", role: "alert" }, msg) : null);
    }

    function RaceDetail(props) {
      const [data, setData] = useState(null);
      const [editing, setEditing] = useState(false);
      const [msg, setMsg] = useState("");
      const [viewer, setViewer] = useState(null);

      async function load() {
        try { setData(await api("/races/" + props.id)); } catch (err) { setMsg("读取失败：" + errText(err)); }
      }
      useEffect(function () { load(); }, [props.id]);

      async function remove() {
        if (!window.confirm("删除这场比赛和它的全部影像？删除后不能恢复。")) return;
        try { await api("/races/" + props.id, { method: "DELETE" }); props.onBack(); } catch (err) { setMsg("删除失败：" + errText(err)); }
      }

      const r = data && data.race;
      const media = (data && data.media) || [];
      return h("div", { className: "pmw-plugin pmw-plugin-module gc-races" },
        h(TitleBar, {
          parent: "比赛", title: r ? r.name : "比赛",
          desc: r ? [r.date, r.city, labelOf(RACE_CATS, r.category), labelOf(RACE_STATUS, r.status)].filter(Boolean).join(" · ") : "",
          actions: [
            { label: "返回", onClick: props.onBack },
            r ? { label: "编辑信息", disabled: editing, onClick: function () { setEditing(true); } } : null,
            r ? { label: "删除", onClick: remove } : null,
          ],
        }),
        msg ? h("p", { className: "gc-note", role: "alert" }, msg) : null,
        r && editing ? h(RaceForm, { race: r, onCancel: function () { setEditing(false); }, onSaved: function () { setEditing(false); load(); } }) : null,
        r && !editing ? h("div", { className: "gc-stats" },
          [["净计时成绩", isNum(r.net_s) && r.net_s > 0 ? fmtDuration(r.net_s) : "-"],
           ["枪声成绩", isNum(r.official_s) && r.official_s > 0 ? fmtDuration(r.official_s) : "-"],
           ["平均配速", raceTime(r) && RACE_DIST[r.category] ? fmtPace(raceTime(r).s / RACE_DIST[r.category]) + (raceTime(r).net ? "" : "（按枪时）") : "-"],
           ["号码", r.bib_no || "-"], ["总排名", r.rank_overall || "-"], ["组别排名", r.rank_group || "-"],
           ["手表记录", r.act_distance_m ? fmtDistance(r.act_distance_m) + " · " + fmtDuration(r.act_duration_s) : "-"]].map(function (c) {
            return h("div", { className: "gc-stat", key: c[0] }, h("span", { className: "gc-stat-label" }, c[0]), h("span", { className: "gc-stat-value" }, c[1]));
          })) : null,
        r && !editing && r.activity_id ? h("div", { className: "gc-detail-bar" },
          h("button", { className: "pmw-plugin-button", type: "button",
            onClick: function () { props.onOpenActivity({ id: r.activity_id, title: r.act_name, start: r.act_start }); } }, "查看这次比赛的手表数据（地图、分段、曲线）")) : null,
        r && !editing && r.note ? h("section", null, h("h3", { className: "gc-sub" }, "备注"), h("p", { className: "gc-desc" }, r.note)) : null,
        r ? h(MediaSection, { raceId: r.id, media: media, onChanged: load, onView: setViewer }) : null,
        viewer ? h(MediaViewer, { list: media, index: viewer, onClose: function () { setViewer(null); }, onMove: setViewer }) : null);
    }

    /** 各类别的标准距离（公里），算平均配速用 */
    const RACE_DIST = { full: 42.195, half: 21.0975, "10k": 10, "5k": 5 };

    async function uploadFile(raceId, kind, file, onProgress) {
      const meta = await api("/races/" + raceId + "/media", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: kind, name: file.name, mime: file.type || "", size: file.size }) });
      // 工作台 API 请求体上限 2 MB，块按后端给的大小（1.5 MB）
      const chunk = Math.min(meta.chunk_max || (3 << 19), 3 << 19);
      for (let off = 0; off < file.size; off += chunk) {
        const part = file.slice(off, Math.min(file.size, off + chunk));
        const res = await fetch(API_BASE + "/media/" + meta.id + "/chunk?offset=" + off, { method: "PUT", body: part });
        if (!res.ok) {
          const d = await res.json().catch(function () { return {}; });
          throw new Error(d.error || ("HTTP " + res.status));
        }
        onProgress(Math.min(file.size, off + chunk) / file.size);
      }
      return meta.id;
    }

    function MediaSection(props) {
      const [kind, setKind] = useState("photo");
      const [queue, setQueue] = useState([]);
      const [msg, setMsg] = useState("");
      const inputRef = useRef(null);
      const counts = {};
      props.media.forEach(function (m) { counts[m.kind] = (counts[m.kind] || 0) + 1; });

      async function onFiles(files) {
        const list = Array.prototype.slice.call(files || []);
        if (!list.length) return;
        setMsg("");
        const q = list.map(function (f) { return { name: f.name, p: 0, err: "" }; });
        setQueue(q.slice());
        for (let i = 0; i < list.length; i++) {
          try {
            await uploadFile(props.raceId, kind, list[i], function (p) { q[i].p = p; setQueue(q.slice()); });
          } catch (err) {
            q[i].err = errText(err); setQueue(q.slice());
          }
        }
        if (inputRef.current) inputRef.current.value = "";
        props.onChanged();
        if (!q.some(function (x) { return x.err; })) setQueue([]);
      }

      async function caption(m) {
        const c = window.prompt("这张的说明（最多 200 字）", m.caption || "");
        if (c === null) return;
        try { await api("/media/" + m.id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caption: c }) }); props.onChanged(); }
        catch (err) { setMsg("保存失败：" + errText(err)); }
      }
      async function remove(m) {
        if (!window.confirm("删除「" + m.name + "」？")) return;
        try { await api("/media/" + m.id, { method: "DELETE" }); props.onChanged(); } catch (err) { setMsg("删除失败：" + errText(err)); }
      }

      return h("section", { className: "gc-media" },
        h("div", { className: "gc-section-head" },
          h("h3", { className: "gc-sub" }, "影像记忆"),
          h("span", { className: "gc-detail-bar" },
            h("select", { className: "gc-search", value: kind, "aria-label": "上传到哪一类", onChange: function (e) { setKind(e.target.value); } },
              MEDIA_KINDS.map(function (k) { return h("option", { key: k[0], value: k[0] }, k[1]); })),
            h("button", { className: "pmw-plugin-button gc-primary", type: "button", onClick: function () { inputRef.current && inputRef.current.click(); } }, "上传"),
            h("input", { ref: inputRef, type: "file", multiple: true, accept: MEDIA_ACCEPT, style: { display: "none" },
              onChange: function (e) { onFiles(e.target.files); } }))),
        h("p", { className: "pmw-plugin-hint" }, "支持图片（JPG、PNG、WebP、HEIC，单张最大 40 MB）、视频（MP4、MOV、WebM，最大 1 GB）和 PDF 证书；文件保存在本机 dsh 的插件数据目录（~/.dsh/cache/garmin-connect）；dsh 页面里查看单个文件最大 200 MB。"),
        queue.length ? h("div", { className: "gc-upload-queue" }, queue.map(function (q, i) {
          return h("div", { key: i, className: "gc-upload-row" }, h("span", null, q.name),
            q.err ? h("span", { className: "gc-err" }, "失败：" + q.err)
              : h("span", { className: "gc-zone-bar" }, h("span", { className: "gc-zone-fill", style: { width: Math.round(q.p * 100) + "%" } })));
        })) : null,
        msg ? h("p", { className: "gc-note", role: "alert" }, msg) : null,
        MEDIA_KINDS.map(function (k) {
          const items = props.media.filter(function (m) { return m.kind === k[0]; });
          return h("div", { key: k[0], className: "gc-media-group" },
            h("div", { className: "gc-media-head" },
              h("strong", null, k[1]), h("small", null, items.length ? items.length + " 个" : "还没有"),
              h("button", { className: "gc-link", type: "button", onClick: function () { setKind(k[0]); setTimeout(function () { inputRef.current && inputRef.current.click(); }, 0); } }, "上传" + k[1])),
            items.length ? h("div", { className: "gc-media-grid" }, items.map(function (m) {
              const idx = props.media.indexOf(m);
              const img = String(m.mime).indexOf("image/") === 0, vid = String(m.mime).indexOf("video/") === 0;
              return h("figure", { key: m.id, className: "gc-media-item" },
                h("button", { type: "button", className: "gc-media-thumb", onClick: function () { props.onView(idx + 1); }, "aria-label": "查看 " + m.name },
                  img ? h("img", { src: mediaURL(m.id), alt: m.caption || m.name, loading: "lazy" })
                    // 视频缩略图：只取元数据和首帧（Range 请求，开头一小段）
                    : vid ? h("span", { className: "gc-media-video" },
                        h("video", { src: mediaURL(m.id) + "#t=0.1", preload: "metadata", muted: true, playsInline: true }),
                        h("span", { className: "gc-media-play" }, "视频"))
                    : h("span", { className: "gc-media-icon" }, "PDF")),
                h("figcaption", null,
                  h("span", { className: "gc-media-cap" }, m.caption || m.name),
                  h("span", { className: "gc-detail-bar" },
                    h("button", { className: "gc-link", type: "button", onClick: function () { caption(m); } }, "说明"),
                    h("a", { className: "gc-link", href: mediaURL(m.id), download: m.name }, "下载"),
                    h("button", { className: "gc-link", type: "button", onClick: function () { remove(m); } }, "删除"))));
            })) : null);
        }));
    }

    /** 大图 / 视频查看：左右切换，Esc 关闭 */
    function MediaViewer(props) {
      const i = props.index - 1;
      const m = props.list[i];
      useEffect(function () {
        const onKey = function (e) {
          if (e.key === "Escape") props.onClose();
          if (e.key === "ArrowRight" && i < props.list.length - 1) props.onMove(i + 2);
          if (e.key === "ArrowLeft" && i > 0) props.onMove(i);
        };
        window.addEventListener("keydown", onKey, true);
        return function () { window.removeEventListener("keydown", onKey, true); };
      }, [i]);
      if (!m) return null;
      const img = String(m.mime).indexOf("image/") === 0, vid = String(m.mime).indexOf("video/") === 0;
      return h("div", { className: "gc-viewer", role: "dialog", "aria-label": m.name, onClick: props.onClose },
        h("div", { className: "gc-viewer-inner", onClick: function (e) { e.stopPropagation(); } },
          img ? h("img", { src: mediaURL(m.id), alt: m.caption || m.name })
            : vid ? h("video", { src: mediaURL(m.id), controls: true, autoPlay: true, playsInline: true })
            : h("iframe", { src: mediaURL(m.id), title: m.name }),
          h("div", { className: "gc-viewer-bar" },
            h("span", null, labelOf(MEDIA_KINDS, m.kind) + " · " + (m.caption || m.name) + "（" + (i + 1) + "/" + props.list.length + "）"),
            h("span", { className: "gc-detail-bar" },
              h("button", { className: "pmw-plugin-button", type: "button", disabled: i === 0, onClick: function () { props.onMove(i); } }, "上一个"),
              h("button", { className: "pmw-plugin-button", type: "button", disabled: i === props.list.length - 1, onClick: function () { props.onMove(i + 2); } }, "下一个"),
              h("button", { className: "pmw-plugin-button", type: "button", onClick: props.onClose }, "关闭")))));
    }

    // ---------------------------------------------------------------------------
    // 地图：Web 墨卡托瓦片（插件后端代取）+ SVG 轨迹；高德用 GCJ-02，轨迹从 WGS-84 换算
    // ---------------------------------------------------------------------------

    function outOfChina(lat, lon) {
      return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
    }

    function wgsToGcj(lat, lon) {
      if (outOfChina(lat, lon)) return [lat, lon];
      const a = 6378245.0, ee = 0.00669342162296594323, PI = Math.PI;
      const x = lon - 105.0, y = lat - 35.0;
      let dLat = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
      dLat += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
      dLat += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin(y / 3.0 * PI)) * 2.0 / 3.0;
      dLat += (160.0 * Math.sin(y / 12.0 * PI) + 320 * Math.sin(y * PI / 30.0)) * 2.0 / 3.0;
      let dLon = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
      dLon += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
      dLon += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin(x / 3.0 * PI)) * 2.0 / 3.0;
      dLon += (150.0 * Math.sin(x / 12.0 * PI) + 300.0 * Math.sin(x / 30.0 * PI)) * 2.0 / 3.0;
      const radLat = lat / 180.0 * PI;
      let magic = Math.sin(radLat);
      magic = 1 - ee * magic * magic;
      const sqrtMagic = Math.sqrt(magic);
      dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * PI);
      dLon = (dLon * 180.0) / (a / sqrtMagic * Math.cos(radLat) * PI);
      return [lat + dLat, lon + dLon];
    }

    /** 经纬度 → 世界像素（缩放级 z，瓦片 256） */
    function project(lat, lon, z) {
      const scale = 256 * Math.pow(2, z);
      const sin = Math.sin(lat * Math.PI / 180);
      return [(lon + 180) / 360 * scale, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale];
    }

    /** 轨迹上相邻两点的球面距离（米），用来把 Garmin 分段距离定位到轨迹点 */
    function geoDistance(a, b) {
      const R = 6371000, rad = Math.PI / 180;
      const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
      const s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
    }

    function RouteMap(props) {
      const ref = useRef(null);
      const [width, setWidth] = useState(640);
      const [zoomDelta, setZoomDelta] = useState(0);
      const H = 360;

      useEffect(function () {
        const el = ref.current;
        if (!el) return undefined;
        const update = function () { if (el.clientWidth) setWidth(el.clientWidth); };
        update();
        if (typeof ResizeObserver === "undefined") return undefined;
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return function () { ro.disconnect(); };
      }, []);

      const src = props.source === "osm" ? "osm" : "amap";
      const pts = props.track.map(function (p) { return src === "amap" ? wgsToGcj(p[0], p[1]) : p; });
      // 选能装下整条路线的最大缩放级
      let fit = 3;
      for (let z = 17; z >= 3; z--) {
        const px = pts.map(function (p) { return project(p[0], p[1], z); });
        const xs = px.map(function (p) { return p[0]; }), ys = px.map(function (p) { return p[1]; });
        if (Math.max.apply(null, xs) - Math.min.apply(null, xs) <= width - 48 && Math.max.apply(null, ys) - Math.min.apply(null, ys) <= H - 48) {
          fit = z;
          break;
        }
      }
      const z = Math.min(18, Math.max(3, fit + zoomDelta));
      const px = pts.map(function (p) { return project(p[0], p[1], z); });
      const xs = px.map(function (p) { return p[0]; }), ys = px.map(function (p) { return p[1]; });
      const cx = (Math.max.apply(null, xs) + Math.min.apply(null, xs)) / 2;
      const cy = (Math.max.apply(null, ys) + Math.min.apply(null, ys)) / 2;
      const left = cx - width / 2, top = cy - H / 2;
      const n = Math.pow(2, z);
      const tiles = [];
      for (let tx = Math.floor(left / 256); tx <= Math.floor((left + width) / 256); tx++) {
        for (let ty = Math.floor(top / 256); ty <= Math.floor((top + H) / 256); ty++) {
          if (ty < 0 || ty >= n) continue;
          const wx = ((tx % n) + n) % n;
          tiles.push(h("img", {
            key: z + "/" + tx + "/" + ty, alt: "", draggable: false, className: "gc-tile",
            // 取不到的瓦片隐藏，不显示破图标
            onError: function (e) { e.currentTarget.style.visibility = "hidden"; },
            src: API_BASE + "/tiles/" + src + "/" + z + "/" + wx + "/" + ty,
            style: { left: (tx * 256 - left) + "px", top: (ty * 256 - top) + "px" },
          }));
        }
      }
      const path = px.map(function (p) { return (p[0] - left).toFixed(1) + "," + (p[1] - top).toFixed(1); }).join(" ");
      const start = px[0], end = px[px.length - 1];
      // 分段配速标在对应里程的中点。轨迹与逐点序列抽样不同，这里按轨迹球面距离定位，
      // 并用概要距离校准累计长度（抽稀后的折线比真实路径短）。
      const lapViews = props.laps || [];
      const markers = [];
      if (lapViews.length > 1 && props.track.length > 1) {
        const cum = [0];
        for (let i = 1; i < props.track.length; i++) cum.push(cum[i - 1] + geoDistance(props.track[i - 1], props.track[i]));
        const measured = cum[cum.length - 1];
        const scale = measured > 0 && props.totalDist > 0 ? props.totalDist / measured : 1;
        const finite = lapViews.map(function (v) { return v.pace > 0 ? v.pace : Infinity; });
        const fastest = finite.indexOf(Math.min.apply(null, finite));
        const slowest = finite.indexOf(Math.max.apply(null, finite.filter(function (v) { return isFinite(v); })));
        let endDist = 0;
        lapViews.forEach(function (v, i) {
          const from = endDist;
          endDist += v.dist > 0 ? v.dist : 0;
          if (!(v.pace > 0) || !(v.dist > 0)) return;
          const target = (from + endDist) / 2 * scale;
          let j = 1;
          while (j < cum.length - 1 && cum[j] < target) j++;
          if (cum[j] === cum[j - 1]) return;
          const t = Math.max(0, Math.min(1, (target - cum[j - 1]) / (cum[j] - cum[j - 1])));
          const x = px[j - 1][0] + t * (px[j][0] - px[j - 1][0]) - left;
          const y = px[j - 1][1] + t * (px[j][1] - px[j - 1][1]) - top;
          if (x < 12 || x > width - 12 || y < 12 || y > H - 12) return;
          markers.push({ i: i, x: x, y: y, key: i === fastest || i === slowest });
        });
        const maxLabels = Math.max(5, Math.floor(width / 95));
        if (markers.length > maxLabels) {
          const keep = {};
          markers.forEach(function (m) { if (m.key) keep[m.i] = true; });
          for (let k = 0; k < maxLabels; k++) keep[markers[Math.floor(k * (markers.length - 1) / (maxLabels - 1))].i] = true;
          const kept = markers.filter(function (m) { return keep[m.i]; });
          markers.length = 0;
          kept.forEach(function (m) { markers.push(m); });
        }
      }
      const markerNodes = markers.map(function (m) {
        const raw = (props.rawLaps || [])[m.i] || {};
        return h("g", {
          key: "lap-" + m.i,
          className: "gc-map-split" + (m.i === props.activeLap ? " on" : "") + (m.key ? " key" : ""),
          onClick: function () { if (props.onPick) props.onPick(m.i); },
        },
          h("title", null, "第 " + (m.i + 1) + " 段 · " + fmtDistance(lapViews[m.i].dist) + " · " + fmtPace(lapViews[m.i].pace) +
            (typeof raw.elevationGain === "number" ? " · 爬升 " + num(raw.elevationGain) + " m" : "")),
          h("circle", { cx: m.x, cy: m.y, r: m.key ? 4 : 3 }),
          h("text", { x: m.x + 6, y: m.y - 6 }, paceText(lapViews[m.i].pace)));
      });
      return h("div", { className: "gc-map", ref: ref, style: { height: H + "px" } },
        tiles,
        h("svg", { className: "gc-map-svg", width: width, height: H, viewBox: "0 0 " + width + " " + H },
          h("polyline", { points: path, className: "gc-route-halo", fill: "none" }),
          h("polyline", { points: path, className: "gc-route", fill: "none" }),
          markerNodes,
          h("circle", { cx: start[0] - left, cy: start[1] - top, r: 6, className: "gc-pin-start" }, h("title", null, "起点")),
          h("circle", { cx: end[0] - left, cy: end[1] - top, r: 6, className: "gc-pin-end" }, h("title", null, "终点"))),
        h("div", { className: "gc-map-zoom" },
          h("button", { type: "button", "aria-label": "放大", onClick: function () { setZoomDelta(zoomDelta + 1); } }, "+"),
          h("button", { type: "button", "aria-label": "缩小", onClick: function () { setZoomDelta(zoomDelta - 1); } }, "−")),
        h("span", { className: "gc-map-attr" }, src === "amap" ? "© 高德地图" : "© OpenStreetMap contributors"));
    }

    // ---------------------------------------------------------------------------
    // 今日卡片、设置
    // ---------------------------------------------------------------------------

    function TodayCard() {
      const [rec, setRec] = useState(null);
      const [run, setRun] = useState(null);
      const [plan, setPlan] = useState([]);
      const [alerts, setAlerts] = useState([]);
      const [hint, setHint] = useState("正在读取恢复状态…");
      const noRunHint = "暂无跑步记录，先在「账号与同步」里登录 Garmin";

      useEffect(function () {
        let alive = true;
        // 恢复状态 + 本周跑量进度（一次请求拿齐）
        api("/recovery?days=28")
          .then(function (d) { if (alive) { setRec(d); setHint(""); } })
          .catch(function (err) { if (alive) setHint("读取失败：" + errText(err)); });
        // 保留最近一次跑步，作为卡片底部的快速参考
        api("/runs")
          .then(function (data) {
            if (!alive) return;
            const list = (Array.isArray(data.runs) ? data.runs : []).filter(function (r) { return !isStrengthType(r.type_key); });
            if (list.length) setRun(list[0]);
          })
          .catch(function () {});
        // 今天日历上安排的训练
        const t = toYMD(new Date());
        api("/calendar?from=" + t + "&to=" + t).then(function (d) { if (alive) setPlan(d.items || []); }).catch(function () {});
        // 训练预警（同步后自动生成）
        api("/alerts").then(function (d) { if (alive) setAlerts(d.alerts || []); }).catch(function () {});
        return function () { alive = false; };
      }, []);

      const v = run ? runView(run) : null;
      const sum = rec && rec.summary || {};
      const st = sum.status || {};
      const tone = REC_LEVEL[st.level] || REC_LEVEL.unknown;
      return h("div", { className: "pmw-plugin pmw-plugin-card gc-today" },
        // 恢复状态：今天能不能上强度，放最上面
        rec
          ? h("div", { className: "gc-today-status gc-rec-" + tone.cls },
              h("div", { className: "gc-today-badge" }, h("i", { style: { background: tone.dot } }), h("b", null, st.label || "—")),
              h("p", { className: "gc-card-main" }, st.suggestion || st.reason || ""),
              h("div", { className: "gc-today-week" },
                h("span", null, "本周跑量 ", h("b", null, num(sum.week_km, 1) + " km")),
                h("span", null, "近 4 周周均 ", num(sum.baseline_km, 1) + " km"),
                sum.progress != null ? h("span", null, "进度 ", sum.progress + "%") : null),
              h("div", { className: "gc-rec-progress" },
                h("span", { className: "gc-rec-progress-track" },
                  h("i", { style: { width: Math.min(100, Math.max(0, sum.progress || 0)) + "%" } }))),
              sum.days_since != null && sum.days_since < 0
                ? h("p", { className: "pmw-plugin-hint" }, noRunHint)
                : null)
          : h("p", { className: "pmw-plugin-hint" }, hint),
        alerts.length ? h("div", { className: "gc-today-alerts" }, alerts.map(function (a) {
          return h("p", { key: a.kind, className: "gc-alert gc-alert-" + a.level, role: "alert" },
            h("strong", null, a.title + "："), a.reason);
        })) : null,
        plan.length ? h("div", { className: "gc-today-plan" },
          h("h4", null, "今天的训练"),
          plan.map(function (it) {
            return h("p", { key: it.id, className: "gc-card-main" }, h("span", { className: "gc-dot gc-k-" + it.kind }), it.title + (it.done ? "（已完成）" : ""));
          })) : null,
        // 最近一次跑步降级为一行参考
        run
          ? h("p", { className: "pmw-plugin-hint gc-today-last" },
              "最近跑步：", fmtDistance(v.dist), " · ", fmtPace(v.pace), "　", shortTime(run.start_time))
          : null);
    }

    /** 同步状态：成功/失败都要显眼，后台每 6 小时同步一次 */
    function SyncStatus(props) {
      const st = props.status || {};
      const err = st.last_sync_error || "";
      const last = st.last_sync || "";
      const attempt = st.last_sync_attempt || "";
      const running = Boolean(st.full_sync && st.full_sync.running);
      let main = "还没有同步过";
      if (st.logged_in === false) main = "还没登录 Garmin：到设置页登录后才能同步";
      else if (err) main = "最近一次同步失败：" + err + (last ? "（上次成功 " + shortTime(last) + "）" : "");
      else if (last) main = "数据更新于 " + shortTime(last);
      else if (attempt) main = "上次同步尝试 " + shortTime(attempt) + "，尚未成功";
      const meta = props.progress || ("每 6 小时自动同步" + (running ? " · 全部历史同步中" : ""));
      return h("div", { className: "gc-sync-status" + (err ? " gc-sync-status-error" : ""), role: err ? "alert" : "status" },
        h("span", { className: "gc-sync-status-main" }, main),
        h("span", { className: "gc-sync-status-meta" }, meta));
    }

    /** 同步：增量拉最近的、全量拉全部历史（都在设置页 / 账号与同步里触发） */
    function SyncControls(props) {
      const st = props.status || {};
      const [busy, setBusy] = useState(false);
      const [full, setFull] = useState(st.full_sync && st.full_sync.running ? st.full_sync : null);
      const [msg, setMsg] = useState("");
      const running = Boolean(full && full.running);

      useEffect(function () {
        if (!running) return undefined;
        const t = setInterval(function () {
          api("/status").then(function (s) {
            const f = s.full_sync || null;
            setFull(f);
            if (!f || !f.running) {
              setMsg(f && f.error ? "同步全部历史失败：" + f.error : "全部历史已同步，写入 " + ((f && f.written) || 0) + " 条。");
              props.onChanged && props.onChanged();
            }
          }).catch(function () {});
        }, 2000);
        return function () { clearInterval(t); };
      }, [running]);

      async function syncNow() {
        setBusy(true); setMsg("正在同步最近的跑步…");
        try {
          const res = await api("/sync", { method: "POST" });
          setMsg("同步完成，写入 " + res.written + " 条。");
          props.onChanged && props.onChanged();
        } catch (err) { setMsg("同步失败：" + errText(err)); } finally { setBusy(false); }
      }
      async function syncAll() {
        setMsg("");
        try {
          const res = await api("/sync?full=1", { method: "POST" });
          setFull(res.full_sync || { running: true, pages: 0, written: 0 });
        } catch (err) { setMsg("同步全部历史失败：" + errText(err)); }
      }

      return h("div", { className: "gc-sync" },
        h("div", { className: "gc-detail-bar" },
          h("button", { className: "pmw-plugin-button gc-primary", type: "button", disabled: busy || running, onClick: syncNow,
            title: "只拉近期新活动（补最近 2 天），自动同步也用这种方式" }, busy ? "增量同步中…" : "立即同步（增量）"),
          h("button", { className: "pmw-plugin-button", type: "button", disabled: busy || running, onClick: syncAll,
            title: "拉取 Garmin 上所有历史活动，后台进行；首次登录自动执行一次" }, running ? "全量同步中…" : "同步全部历史（全量）")),
        h("p", { className: "gc-note" }, "增量：只补近期新活动，每 6 小时自动跑一次；全量：拉全部历史，首次登录自动执行。"),
        running ? h("p", { className: "pmw-plugin-hint", role: "status" }, "正在同步全部历史：已翻 " + (full.pages || 0) + " 页，写入 " + (full.written || 0) + " 条…") : null,
        msg ? h("p", { className: "pmw-plugin-hint", role: "status" }, msg) : null);
    }

    /** 数据可移植：导出训练数据 JSON 备份，导入时按主键覆盖同 id 记录 */
    function DataPortability() {
      const [msg, setMsg] = useState("");
      const [busy, setBusy] = useState("");
      async function download() {
        setBusy("export"); setMsg("");
        try {
          const d = await api("/export");
          const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = "garmin-connect-backup-" + toYMD(new Date()) + ".json";
          a.click(); URL.revokeObjectURL(url);
          const n = Object.keys(d.tables || {}).reduce(function (s, k) { return s + (d.tables[k] || []).length; }, 0);
          setMsg("已导出 " + n + " 条记录（不含登录凭证与比赛影像文件）。");
        } catch (err) { setMsg("导出失败：" + errText(err)); } finally { setBusy(""); }
      }
      async function upload(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (!window.confirm("导入会按 id 覆盖同记录、补进新记录，不会删除现有数据。继续？")) return;
        setBusy("import"); setMsg("");
        try {
          const text = await file.text();
          const r = await api("/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: text });
          setMsg("已导入 " + r.imported + " 条" + (r.skipped && r.skipped.length ? "；跳过：" + r.skipped.join("、") : "。"));
        } catch (err) { setMsg("导入失败：" + errText(err)); } finally { setBusy(""); e.target.value = ""; }
      }
      return h("div", { className: "gc-portability" },
        h("h4", null, "数据备份与迁移"),
        h("p", { className: "pmw-plugin-hint" }, "导出为 JSON 文件，换设备或重装时导入；登录凭证和比赛影像文件不在备份里。"),
        h("div", { className: "gc-detail-bar" },
          h("button", { className: "pmw-plugin-button", type: "button", disabled: !!busy, onClick: download },
            busy === "export" ? "导出中…" : "导出训练数据"),
          h("label", { className: "pmw-plugin-button" }, busy === "import" ? "导入中…" : "导入备份文件",
            h("input", { type: "file", accept: "application/json,.json", style: { display: "none" }, disabled: !!busy, onChange: upload }))),
        msg ? h("p", { className: "pmw-plugin-hint", role: "status" }, msg) : null);
    }

    function SettingsSection() {
      useTheme();
      const pace = usePaceUnit();
      const prefs = useStatsPrefs();
      const [mode, setMode] = useState("password");
      const [email, setEmail] = useState("");
      const [password, setPassword] = useState("");
      const [apiKey, setApiKey] = useState("");
      const [isCN, setIsCN] = useState(true);
      const [state, setState] = useState(null);
      const [msg, setMsg] = useState("");
      const [busy, setBusy] = useState(false);
      const [hrMax, setHrMax] = useState("");
      const [hrBounds, setHrBounds] = useState(["", "", "", "", ""]);
      const [hrMsg, setHrMsg] = useState("");

      useEffect(function () {
        api("/hr-zones").then(function (d) {
          setHrMax(d.max_hr ? String(d.max_hr) : "");
          const b = (d.boundaries || []).slice(0, 5);
          setHrBounds([0, 1, 2, 3, 4].map(function (i) { return b[i] ? String(b[i]) : ""; }));
        }).catch(function () {});
      }, []);

      async function saveHrZones() {
        setHrMsg("");
        const max = Number(hrMax) || 0;
        const bounds = hrBounds.map(Number).filter(function (v) { return v > 0; });
        try {
          const r = await api("/hr-zones", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ max_hr: max, boundaries: bounds }),
          });
          const saved = (r.boundaries || []).slice(0, 5);
          setHrBounds([0, 1, 2, 3, 4].map(function (i) { return saved[i] ? String(saved[i]) : ""; }));
          setHrMsg(max ? "已保存，图表和新的 AI 分析按这个区间算。" : "已恢复 Garmin 原值。");
        } catch (err) {
          setHrMsg("保存失败：" + errText(err));
        }
      }

      async function refresh() {
        try {
          setState(await api("/status"));
        } catch (err) {
          setMsg("读取状态失败：" + errText(err));
        }
      }

      async function afterLogin() {
        try {
          await api("/sync?full=1", { method: "POST" });
          setMsg("登录成功，正在后台同步全部历史跑步，到「" + PLUGIN_NAME + "」模块页看进度。");
        } catch (err) {
          setMsg("登录成功，但开始同步失败：" + errText(err));
        }
        await refresh();
      }

      useEffect(function () { refresh(); }, []);

      async function login(e) {
        if (e) e.preventDefault();
        if (!email.trim() || !password) { setMsg("邮箱和密码都要填"); return; }
        setBusy(true);
        setMsg("正在登录 Garmin，大约需要 5～10 秒…");
        try {
          await api("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email.trim(), password: password, is_cn: isCN }),
          });
          setPassword("");
          // 首次登录直接在后台拉全部历史，统计和记录才是全的；到模块页能看进度
          await afterLogin();
        } catch (err) {
          setPassword("");
          setMsg("登录失败：" + errText(err));
        } finally {
          setBusy(false);
        }
      }

      async function loginPersonal(e) {
        if (e) e.preventDefault();
        if (!apiKey.trim()) { setMsg("请填写个人 API Key"); return; }
        setBusy(true);
        setMsg("正在用个人 API Key 登录…");
        try {
          await api("/login/personal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ api_key: apiKey.trim(), is_cn: isCN }),
          });
          setApiKey("");
          await afterLogin();
        } catch (err) {
          setApiKey("");
          setMsg("登录失败：" + errText(err));
        } finally {
          setBusy(false);
        }
      }

      async function logout() {
        setBusy(true);
        try {
          await api("/logout", { method: "POST" });
          setMsg("已退出登录，保存的令牌已删除。");
          await refresh();
        } catch (err) {
          setMsg("退出失败：" + errText(err));
        } finally {
          setBusy(false);
        }
      }

      const loggedIn = Boolean(state && state.logged_in);
      const personal = state && state.read_only === true;
      const keyPage = "https://connect." + (isCN ? "garmin.cn" : "garmin.com") + "/app/settings/personalApiToken";
      return h("section", { className: "pmw-plugin pmw-plugin-settings" },
        h("h3", null, PLUGIN_NAME + " 设置"),
        THEME_HOST === "dsh" ? null : h("div", { className: "gc-controls" },
          h(Seg, { label: "外观", value: themePref, onChange: setThemePref, options: THEME_OPTIONS }),
          h("span", { className: "pmw-plugin-hint" }, "外观：跟随系统时按工作台的明暗模式；只影响本插件页面。")),
        h("div", { className: "gc-controls" },
          h(Seg, { label: "配速单位", value: pace, onChange: setPaceUnit, options: [["km", "min/km"], ["mile", "min/mile"]] }),
          h("span", { className: "pmw-plugin-hint" }, "配速、图表和 AI 分析统一按这个单位显示。")),
        h(DataPortability),
        h("div", { className: "gc-stats-prefs" },
          h("h4", null, "心率区间校准"),
          h("div", { className: "gc-controls" },
            h("label", { className: "gc-field" }, "最大心率 bpm",
              h("input", { type: "number", min: "0", max: "240", step: "1", value: hrMax,
                onChange: function (e) { setHrMax(e.target.value); } })),
            h("button", { className: "pmw-plugin-button", type: "button", onClick: saveHrZones }, "保存区间")),
          h("div", { className: "gc-controls" },
            h("span", { className: "pmw-plugin-hint" }, "区间下界 bpm（可留空，按最大心率 50/60/70/80/90% 自动生成）"),
            hrBounds.map(function (b, i) {
              return h("input", { key: i, className: "gc-speed", type: "number", min: "80", max: "240", step: "1",
                "aria-label": "区间 " + (i + 1) + " 下界 bpm", value: b,
                onChange: function (e) {
                  const next = hrBounds.slice(); next[i] = e.target.value; setHrBounds(next);
                } });
            })),
          h("p", { className: "pmw-plugin-hint" }, "清空最大心率并保存即恢复 Garmin 原值；改完后已有分析需重新生成。"),
          hrMsg ? h("p", { className: "pmw-plugin-hint", role: "status" }, hrMsg) : null),
        h("div", { className: "gc-stats-prefs" },
          h("h4", null, "统计口径"),
          h("label", { className: "pmw-plugin-check" },
            h("input", { type: "checkbox", checked: prefs.ignoreShort,
              onChange: function (e) { setStatsPrefs({ ignoreShort: e.target.checked }); } }),
            " 忽略短活动（不计入概览和统计的次数、跑量、时长，记录列表仍显示全部）"),
          prefs.ignoreShort
            ? h("div", { className: "gc-controls gc-stats-prefs-thresholds" },
                h("label", { className: "gc-field" }, "跑步短于（km）",
                  h("input", { type: "number", min: "0", step: "0.1", value: num(prefs.minRunM / 1000, 2),
                    onChange: function (e) { const v = Number(e.target.value); if (isFinite(v) && v >= 0) setStatsPrefs({ minRunM: v * 1000 }); } })),
                h("label", { className: "gc-field" }, "力量短于（分钟）",
                  h("input", { type: "number", min: "0", step: "1", value: num(prefs.minStrengthS / 60, 0),
                    onChange: function (e) { const v = Number(e.target.value); if (isFinite(v) && v >= 0) setStatsPrefs({ minStrengthS: v * 60 }); } })))
            : null),
        loggedIn
          ? h("div", { className: "gc-account" },
              h("p", null, "已登录：", h("strong", null, state.email || "Garmin 账号"),
                state.is_cn === false ? "（国际区）" : "（中国区）",
                personal ? " · 个人 API Key（只读）" : " · 账号密码"),
              h("p", { className: "pmw-plugin-hint" },
                typeof state.runs === "number" ? "本地 " + state.runs + " 条跑步记录。" : "",
                personal ? "只读模式：不能把活动编辑保存回 Garmin。" : ""),
              h(SyncStatus, { status: state }),
              h(SyncControls, { status: state, onChanged: refresh }),
              h("button", { className: "pmw-plugin-button", type: "button", disabled: busy, onClick: logout }, "退出登录"))
          : h("div", { className: "gc-login" },
              h(Seg, { label: "登录方式", value: mode, onChange: setMode,
                options: [["password", "账号密码"], ["personal", "个人 API Key（支持 MFA）"]] }),
              mode === "personal"
                ? h("form", { className: "gc-login-form", onSubmit: loginPersonal },
                    h("p", { className: "pmw-plugin-hint" },
                      "在 ", h("a", { href: keyPage, target: "_blank", rel: "noreferrer" }, "Garmin Connect 网页"),
                      " 生成个人 API Key（只显示一次），粘贴到下面。支持两步验证，权限只读（不能把编辑写回 Garmin）。"),
                    h("label", { className: "gc-field" }, "个人 API Key",
                      h("input", { type: "password", value: apiKey, autoComplete: "off", disabled: busy,
                        onChange: function (e) { setApiKey(e.target.value); } })),
                    h("label", { className: "pmw-plugin-check" },
                      h("input", { type: "checkbox", checked: isCN, disabled: busy,
                        onChange: function (e) { setIsCN(e.target.checked); } }),
                      " 中国区账号（connect.garmin.cn）"),
                    h("button", { className: "pmw-plugin-button", type: "submit", disabled: busy }, busy ? "登录中…" : "用 API Key 登录"))
                : h("form", { className: "gc-login-form", onSubmit: login },
                    h("p", { className: "pmw-plugin-hint" },
                      "用 Garmin Connect 账号登录。密码只用来换取访问令牌，不会保存；令牌存在 dsh 的凭据存储里。开了 MFA 请改用个人 API Key。"),
                    h("label", { className: "gc-field" }, "邮箱",
                      h("input", { type: "email", value: email, autoComplete: "username", disabled: busy,
                        onChange: function (e) { setEmail(e.target.value); } })),
                    h("label", { className: "gc-field" }, "密码",
                      h("input", { type: "password", value: password, autoComplete: "current-password", disabled: busy,
                        onChange: function (e) { setPassword(e.target.value); } })),
                    h("label", { className: "pmw-plugin-check" },
                      h("input", { type: "checkbox", checked: isCN, disabled: busy,
                        onChange: function (e) { setIsCN(e.target.checked); } }),
                      " 中国区账号（connect.garmin.cn）"),
                    h("button", { className: "pmw-plugin-button", type: "submit", disabled: busy }, busy ? "登录中…" : "登录")),
              h("p", { className: "pmw-plugin-hint" },
                "dsh 已内置出网与凭据存储；同步按钮只在「账号与同步」里。")),
        msg ? h("p", { className: "pmw-plugin-hint", role: "status" }, msg) : null);
    }

    __GC_PMW.register({
      id: PLUGIN_ID,
      api: API_RANGE,

      activate(ctx) {
        CTX = ctx;
        disposables.push(
          ctx.slots.register("module", { id: PLUGIN_ID, title: PLUGIN_NAME }, guarded(ModulePage)),
          // PMW 版比赛在主页面的视图里；独立模块只留给 dsh 版的「比赛」页签用
          THEME_HOST === "dsh" ? ctx.slots.register("module", { id: PLUGIN_ID + "_races", title: "比赛" }, guarded(RacesPage)) : null,
          ctx.slots.register("settings.section", { id: PLUGIN_ID, title: PLUGIN_NAME }, guarded(SettingsSection)),
          ctx.slots.register("today.card", { key: PLUGIN_ID + "_last_run", title: "恢复与本周跑量" }, guarded(TodayCard)),
        );
      },

      deactivate() {
        for (const d of disposables) {
          try { if (d && typeof d.dispose === "function") d.dispose(); }
          catch (err) { console.warn("[pmw-plugin] dispose 失败", err); }
        }
        disposables.length = 0;
        CTX = null;
      },
    });

    // ===================== 嵌入结束 =====================

    function __gcStatus() {
      const [st, setSt] = React.useState(null)
      React.useEffect(function () {
        let alive = true
        let timer = null
        const tick = function () {
          __gcCall({ op: 'status' }).then(function (v) {
            if (!alive) return
            setSt(v)
            if (v && v.state === 'starting') timer = setTimeout(tick, 1500)
          }, function (err) { if (alive) setSt({ state: 'failed', error: err.message }) })
        }
        tick()
        return function () { alive = false; if (timer) clearTimeout(timer) }
      }, [])
      if (!st || st.state === 'running') return null
      if (st.state === 'starting') return __gcH('p', { className: 'pmw-plugin-hint' }, '正在启动 Garmin 插件后端（首次使用会从 GitHub 下载约 10 MB 的二进制）…')
      return __gcH('p', { className: 'gc-dsh-banner', role: 'alert' },
        'Garmin 插件后端没有启动：' + (st.error || st.state) + '。日志在 ',
        __gcH('code', null, (st.dataDir || '~/.dsh/cache/garmin-connect') + '/logs'))
    }

    function __gcPage(props) {
      const ref = React.useRef(null)
      __gcUseAssets(ref)
      return __gcH('div', { ref: ref, className: 'gc-dsh-page', 'data-pmw-plugin': 'garmin_connect' },
        __gcH(__gcStatus), props.children)
    }

    function __gcRunsPage() {
      const [tab, setTab] = React.useState('data')
      __gcActivatePMW()
      const Module = __gcSlots['module:garmin_connect']
      const Races = __gcSlots['module:garmin_connect_races']
      const Settings = __gcSlots['settings.section:garmin_connect']
      return __gcH(__gcPage, null,
        __gcH('div', { className: 'gc-dsh-top' },
          __gcH('div', { className: 'gc-dsh-tabs', role: 'tablist' },
            __gcH('button', { type: 'button', role: 'tab', 'aria-selected': tab === 'data', onClick: function () { setTab('data') } }, '跑步数据'),
            __gcH('button', { type: 'button', role: 'tab', 'aria-selected': tab === 'races', onClick: function () { setTab('races') } }, '比赛'),
            __gcH('button', { type: 'button', role: 'tab', 'aria-selected': tab === 'settings', onClick: function () { setTab('settings') } }, '账号与同步'))),
        tab === 'settings'
          ? __gcH('div', { className: 'gc-dsh-settings' }, Settings ? __gcH(Settings) : null)
          : tab === 'races'
            ? (Races ? __gcH(Races) : null)
            : Module ? __gcH(Module) : null)
    }

    function __gcRunIcon(props) {
      const size = props.size || 18
      return __gcH('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true,
        style: { display: 'block', color: props.active ? 'var(--dsw-alias-brand-primary)' : 'currentColor' } },
      __gcH('circle', { cx: 14.5, cy: 4.5, r: 2, fill: 'currentColor' }),
      __gcH('path', { d: 'M8 21l3-6 3 2 1 4M6.5 12.5l3-3.5 4 1.5 2.5 3.5 3 .5M10.5 9.5 9 15', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }
    return {
      inject: ['slots', 'connection'],
      apply(ctx) {
        __gcRpc = function (payload) { return ctx.connection.rpc.call('/api', __GC_RPC_ENDPOINT, payload) }
        ctx.effect(function () {
          const style = document.createElement('style')
          style.id = 'dsh-garmin-connect-style'
          style.textContent = __GC_STYLE + '\n' + __GC_DSH_CSS
          document.head.appendChild(style)
          return function () { style.remove() }
        }, 'garmin-connect: style')
        ctx.slots.inject('sidebar.panellist', function* () {
          yield ctx.slots.register({ name: 'sidebar.panellist', id: 'garmin-connect', order: 30, label: function () { return 'Garmin 跑步' } }, __gcRunIcon)
        })
        ctx.slots.inject('main', function* () {
          yield ctx.slots.register({ name: 'main', key: 'garmin-connect' }, __gcRunsPage)
        })
      },
    }
  },
})
