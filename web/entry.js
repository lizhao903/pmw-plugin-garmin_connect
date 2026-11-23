// powered by dsh - https://github.com/deepseek-ai/deepseek-harness

/**
 * Garmin 跑步数据插件前端入口（清单 v2 / 宿主 API 2.0.0）。
 * 只用 JS 语法子集（类型走 JSDoc），零构建即可作为 ESM 运行。
 * 数据走同源 /api/plugins/external/garmin_connect/api/*，由宿主转发到插件后端。
 * 标题和操作用宿主 ctx.ui.PageTitle 放进顶栏标题行；旧宿主没有 ctx.ui 时在页面内画标题。
 */
import { Component, createElement as h, useEffect, useRef, useState } from "react";

const PLUGIN_ID = "garmin_connect";
const PLUGIN_NAME = "Garmin 跑步数据";
const API_RANGE = ">=2.0.0 <3.0.0";
const API_BASE = "/api/plugins/external/" + PLUGIN_ID + "/api";
const DEFAULT_INDOOR = ["treadmill_running", "indoor_running", "virtual_run"];

/** @type {Array<{dispose?: () => void}>} */
const disposables = [];
/** 宿主 ctx（activate 时存下，组件里取 ctx.ui） */
let CTX = null;

/** @param {string} path @param {RequestInit} [init] @returns {Promise<any>} */
async function api(path, init) {
  const res = await fetch(API_BASE + path, init);
  const data = await res.json().catch(function () { return {}; });
  if (!res.ok) throw new Error((data && data.error) || ("HTTP " + res.status));
  return data;
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

/** @param {number|null|undefined} secPerKm @returns {string} */
function fmtPace(secPerKm) {
  if (typeof secPerKm !== "number" || !isFinite(secPerKm) || secPerKm <= 0) return "-";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return s === 60 ? (m + 1) + "'00\"/km" : m + "'" + String(s).padStart(2, "0") + "\"/km";
}

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

function isIndoor(typeKey, indoorTypes) {
  return (indoorTypes || DEFAULT_INDOOR).indexOf(typeKey || "") >= 0;
}

/** 列表行：有跑步机校正时用校正后的距离和配速 */
function runView(r) {
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
    return h(ErrorBoundary, null, h(Inner, props));
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
const SEG_WRAP = { display: "inline-flex", alignSelf: "flex-start", border: "1px solid var(--line, #d1d5db)", borderRadius: "6px", overflow: "hidden" };
function segBtn(on, last) {
  return {
    padding: "3px 10px", border: 0, borderRight: last ? 0 : "1px solid var(--line, #d1d5db)",
    background: on ? "var(--hover, #eef0f3)" : "transparent", color: "inherit", font: "inherit",
    fontSize: "13px", fontWeight: on ? 600 : 400, cursor: "pointer",
  };
}

function Seg(props) {
  return h("div", { style: SEG_WRAP, role: "radiogroup", "aria-label": props.label },
    props.options.map(function (o, i) {
      return h("button", {
        key: o[0], type: "button", role: "radio", "aria-checked": props.value === o[0],
        style: segBtn(props.value === o[0], i === props.options.length - 1),
        onClick: function () { props.onChange(o[0]); },
      }, o[1]);
    }));
}

// ---------------------------------------------------------------------------
// 模块页：记录 / 统计
// ---------------------------------------------------------------------------

function ModulePage() {
  const [view, setView] = useState("runs");
  const [runs, setRuns] = useState([]);
  const [indoorTypes, setIndoorTypes] = useState(DEFAULT_INDOOR);
  const [hint, setHint] = useState("正在加载跑步记录…");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const [full, setFull] = useState(null);
  const [statsKey, setStatsKey] = useState(0);
  const [syncErr, setSyncErr] = useState("");

  async function load() {
    try {
      const data = await api("/runs");
      const list = Array.isArray(data.runs) ? data.runs : [];
      setRuns(list);
      if (Array.isArray(data.indoor_types)) setIndoorTypes(data.indoor_types);
      setHint(list.length ? "" : "还没有跑步记录：先在设置页登录 Garmin，再点「立即同步」或「同步全部历史」。");
    } catch (err) {
      setHint("读取失败：" + errText(err));
    }
  }

  useEffect(function () {
    load();
    api("/status").then(function (st) {
      if (st.full_sync && st.full_sync.running) setFull(st.full_sync);
      setSyncErr(st.last_sync_error || "");
    }).catch(function () {});
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

  async function syncNow() {
    setBusy(true);
    setHint("正在同步最近的跑步…");
    try {
      const res = await api("/sync", { method: "POST" });
      setHint("同步完成，写入 " + res.written + " 条。");
      setSyncErr("");
      await load();
      setStatsKey(function (k) { return k + 1; });
    } catch (err) {
      setHint("同步失败：" + errText(err));
    } finally {
      setBusy(false);
    }
  }

  async function syncAll() {
    try {
      const res = await api("/sync?full=1", { method: "POST" });
      setFull(res.full_sync || { running: true, pages: 0, written: 0 });
      setHint("");
    } catch (err) {
      setHint("同步全部历史失败：" + errText(err));
    }
  }

  if (open) {
    return h(RunDetail, {
      id: open.activity_id, title: open.activity_name, start: open.start_time,
      onBack: function () { setOpen(null); load(); setStatsKey(function (k) { return k + 1; }); },
    });
  }

  const fullRunning = Boolean(full && full.running);
  // 窄屏顶栏放不下切换标签，挪回页面里
  const narrow = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 640px)").matches;
  const viewSeg = h(Seg, { label: "视图", value: view, onChange: setView, options: [["runs", "记录"], ["stats", "统计"]] });
  const total = runs.reduce(function (sum, r) { return sum + (runView(r).dist || 0); }, 0);
  const progress = fullRunning
    ? "正在同步全部历史：已翻 " + (full.pages || 0) + " 页，写入 " + (full.written || 0) + " 条…"
    : "";

  return h("div", { className: "pmw-plugin pmw-plugin-module" },
    h(TitleBar, {
      title: PLUGIN_NAME,
      desc: "最近 " + runs.length + " 次，累计 " + fmtDistance(total),
      tabs: narrow ? null : viewSeg,
      actions: [
        { label: busy ? "同步中…" : "立即同步", primary: true, disabled: busy || fullRunning, onClick: syncNow },
        { label: fullRunning ? "历史同步中…" : (narrow ? "全部历史" : "同步全部历史"), disabled: busy || fullRunning, onClick: syncAll,
          title: "把 Garmin 上所有跑步记录都拉下来（统计用），在后台进行" },
      ],
    }),
    narrow ? viewSeg : null,
    progress ? h("p", { className: "pmw-plugin-hint", role: "status" }, progress) : null,
    syncErr && !busy ? h("p", { className: "gc-note", role: "alert" }, "最近一次同步失败：" + syncErr) : null,
    hint ? h("p", { className: "pmw-plugin-hint" }, hint) : null,
    view === "stats"
      ? h(StatsView, { key: statsKey })
      : h(RunTable, { runs: runs, indoorTypes: indoorTypes, onOpen: setOpen }));
}

function RunTable(props) {
  return h("div", { className: "gc-scroll" }, h("table", { className: "gc-table" },
    h("thead", null,
      h("tr", null,
        h("th", null, "日期"), h("th", null, "名称"), h("th", null, "类型"), h("th", null, "距离"),
        h("th", null, "时长"), h("th", null, "配速"), h("th", null, "均心率"))),
    h("tbody", null,
      props.runs.map(function (r) {
        const v = runView(r);
        return h("tr", {
          key: runKey(r), className: "gc-row", tabIndex: 0, role: "button",
          onClick: function () { props.onOpen(r); },
          onKeyDown: function (e) { if (e.key === "Enter") props.onOpen(r); },
        },
          h("td", null, String(r.start_time || "").slice(0, 10)),
          h("td", null, r.activity_name || "-"),
          h("td", null, isIndoor(r.type_key, props.indoorTypes) ? h("span", { className: "gc-tag" }, "室内") : (r.type_key ? "室外" : "-")),
          h("td", null, fmtDistance(v.dist), v.corrected ? h("span", { className: "gc-mark", title: "已按跑步机速度校正" }, " 校") : null),
          h("td", null, fmtDuration(r.duration_s)),
          h("td", null, fmtPace(v.pace)),
          h("td", null, r.avg_hr ? String(Math.round(r.avg_hr)) : "-"));
      }))));
}

// ---------------------------------------------------------------------------
// 统计：按周 / 月 / 年，汇总 / 室外 / 室内，柱状图
// ---------------------------------------------------------------------------

const PERIODS = [["week", "周"], ["month", "月"], ["year", "年"]];
const KINDS = [["all", "跑步汇总"], ["outdoor", "室外跑步"], ["indoor", "室内跑步"]];
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
  const [period, setPeriod] = useState("week");
  const [kind, setKind] = useState("all");
  const [metric, setMetric] = useState("distance");
  const [data, setData] = useState(null);
  const [hint, setHint] = useState("正在统计…");

  useEffect(function () {
    let alive = true;
    setHint("正在统计…");
    api("/stats?period=" + period + "&kind=" + kind)
      .then(function (d) { if (alive) { setData(d); setHint(""); } })
      .catch(function (err) { if (alive) setHint("统计失败：" + errText(err)); });
    return function () { alive = false; };
  }, [period, kind]);

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

  return h("div", { className: "gc-stats-view" },
    h("div", { className: "gc-controls" },
      h(Seg, { label: "类型", value: kind, onChange: setKind, options: KINDS }),
      h(Seg, { label: "周期", value: period, onChange: setPeriod, options: PERIODS }),
      h(Seg, { label: "指标", value: metric, onChange: setMetric, options: METRICS })),
    hint ? h("p", { className: "pmw-plugin-hint" }, hint) : null,
    data && data.unknown_type > 0
      ? h("p", { className: "pmw-plugin-hint" },
          "有 " + data.unknown_type + " 条记录还不知道是室内还是室外（按室外算），点「同步全部历史」后会补上类型。")
      : null,
    h("div", { className: "gc-stats" },
      [["范围", rangeText], ["次数", totals.runs + " 次"], ["距离", fmtDistance(totals.dist)],
       ["时长", fmtDuration(totals.dur)], ["平均配速", totals.dist > 0 ? fmtPace(totals.dur / (totals.dist / 1000)) : "-"],
       ["最长一次", fmtDistance(totals.longest)]].map(function (c) {
        return h("div", { className: "gc-stat", key: c[0] },
          h("span", { className: "gc-stat-label" }, c[0]), h("span", { className: "gc-stat-value" }, c[1]));
      })),
    h(BarChart, { items: shown, period: period, metric: metric }),
    h("div", { className: "gc-scroll" }, h("table", { className: "gc-table" },
      h("thead", null, h("tr", null,
        h("th", null, "周期"), h("th", null, "次数"), h("th", null, "距离"), h("th", null, "时长"),
        h("th", null, "平均配速"), h("th", null, "平均心率"), h("th", null, "最长"), h("th", null, "爬升"))),
      h("tbody", null, shown.slice().reverse().filter(function (x) { return x.b; }).map(function (x) {
        const b = x.b;
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
  const W = 720, H = 220, padL = 44, padB = 26, padT = 18;
  const vals = props.items.map(function (x) { return metricValue(props.metric, x.b); });
  const max = Math.max.apply(null, vals.concat([0]));
  const n = props.items.length || 1;
  const slot = (W - padL - 8) / n;
  const bw = Math.max(4, slot * 0.62);
  const y = function (v) { return H - padB - (max > 0 ? (v / max) * (H - padB - padT) : 0); };
  const ticks = [0, 0.5, 1].map(function (f) { return max * f; });
  const every = n > 12 ? 2 : 1;
  return h("figure", { className: "gc-chart" },
    h("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "按周期的" + (METRICS.find(function (m) { return m[0] === props.metric; }) || [0, ""])[1] },
      ticks.map(function (t, i) {
        return h("g", { key: "t" + i },
          h("line", { x1: padL, x2: W - 4, y1: y(t), y2: y(t), className: "gc-grid" }),
          h("text", { x: padL - 6, y: y(t) + 4, className: "gc-axis", textAnchor: "end" },
            props.metric === "pace" ? fmtPace(t).replace("/km", "") : (props.metric === "runs" ? Math.round(t) : t.toFixed(t >= 10 ? 0 : 1))));
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

/** 概要卡片：[标题, 取值函数]，取不到不显示 */
const SUMMARY_FIELDS = [
  ["距离", function (s) { return fmtDistance(s.distance); }],
  ["用时", function (s) { return fmtDuration(s.duration); }],
  ["移动用时", function (s) { return fmtDuration(s.movingDuration); }],
  ["平均配速", function (s) { return s._pace ? fmtPace(s._pace) : paceFromSpeed(s.averageSpeed); }],
  ["最快配速", function (s) { return s._corrected ? null : paceFromSpeed(s.maxSpeed); }],
  ["平均心率", function (s) { return s.averageHR ? num(s.averageHR) + " bpm" : null; }],
  ["最大心率", function (s) { return s.maxHR ? num(s.maxHR) + " bpm" : null; }],
  ["平均步频", function (s) { return s.averageRunCadence ? num(s.averageRunCadence) + " 步/分" : null; }],
  ["最大步频", function (s) { return s.maxRunCadence ? num(s.maxRunCadence) + " 步/分" : null; }],
  ["平均步幅", function (s) { return s.strideLength ? num(s.strideLength / 100, 2) + " m" : null; }],
  ["触地时间", function (s) { return s.groundContactTime ? num(s.groundContactTime) + " ms" : null; }],
  ["垂直振幅", function (s) { return s.verticalOscillation ? num(s.verticalOscillation, 1) + " cm" : null; }],
  ["垂直步幅比", function (s) { return s.verticalRatio ? num(s.verticalRatio, 1) + " %" : null; }],
  ["平均功率", function (s) { return s.averagePower ? num(s.averagePower) + " W" : null; }],
  ["累计爬升", function (s) { return typeof s.elevationGain === "number" ? num(s.elevationGain) + " m" : null; }],
  ["累计下降", function (s) { return typeof s.elevationLoss === "number" ? num(s.elevationLoss) + " m" : null; }],
  ["有氧训练效果", function (s) { return s.trainingEffect ? num(s.trainingEffect, 1) : null; }],
  ["无氧训练效果", function (s) { return s.anaerobicTrainingEffect ? num(s.anaerobicTrainingEffect, 1) : null; }],
  ["训练负荷", function (s) { return s.activityTrainingLoad ? num(s.activityTrainingLoad) : null; }],
  ["热量", function (s) { return s.calories ? num(s.calories) + " kcal" : null; }],
  ["步数", function (s) { return s.steps ? num(s.steps) : null; }],
];

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
  const cards = SUMMARY_FIELDS
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

  return h("div", { className: "pmw-plugin pmw-plugin-module gc-detail" },
    h(TitleBar, {
      parent: PLUGIN_NAME,
      title: (detail && detail.name) || props.title || "跑步详情",
      desc: shortTime((detail && detail.start_local) || props.start) + (indoor ? " · 室内" : ""),
      actions: [
        { label: "返回列表", onClick: props.onBack },
        { label: busy ? "读取中…" : "从 Garmin 重新拉取", disabled: busy, onClick: function () { load(true); } },
      ],
    }),
    hint ? h("p", { className: "pmw-plugin-hint", role: "status" }, hint) : null,
    corrected
      ? h("p", { className: "gc-note" },
          "已按跑步机速度校正：距离 " + fmtDistance(s.distance) + "（Garmin 原始 " + fmtDistance(s._origDistance) + "），配速随之重算。")
      : null,
    detail ? h("div", { className: "gc-stats" },
      cards.map(function (c) {
        return h("div", { className: "gc-stat", key: c[0] },
          h("span", { className: "gc-stat-label" }, c[0]),
          h("span", { className: "gc-stat-value" }, c[1]));
      })) : null,
    detail && detail.weather ? h(WeatherCard, { w: detail.weather }) : null,
    detail && detail.track && detail.track.length > 1
      ? h("section", null,
          h("h3", { className: "gc-sub" }, "路线"),
          h(RouteMap, { track: detail.track, source: resp.map_source || "amap" }))
      : null,
    detail && detail.series ? h(SeriesCharts, { series: detail.series, indoor: indoor || corrected }) : null,
    detail ? h(LapsSection, {
      laps: laps, lapViews: lapViews, indoor: indoor, edit: edit, saving: saving, corrected: corrected,
      allSpeed: allSpeed, setAllSpeed: setAllSpeed, applyAll: applyAll,
      setEdit: setEdit, startEdit: startEdit, submitEdit: submitEdit,
      clear: function () { saveSpeeds({ clear: true }); },
    }) : null,
    detail ? h(ZonesSection, { zones: detail.hr_zones || [] }) : null,
    detail ? h(AllFields, { summary: (detail && detail.summary) || {}, weather: detail.weather }) : null,
    detail && detail.fetched_at
      ? h("p", { className: "pmw-plugin-hint" }, "数据取自 Garmin：" + shortTime(detail.fetched_at) +
          (detail.missing && detail.missing.length ? "；这次活动没有：" + detail.missing.map(missingName).join("、") : ""))
      : null);
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
    return h("tr", { key: i, className: v.corrected ? "gc-corrected" : undefined },
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
    h("h3", { className: "gc-sub" }, "心率区间"),
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

/** Garmin 天气接口温度是华氏度、风速是英里/时，这里换算 */
function WeatherCard(props) {
  const w = props.w;
  const c = function (f) { return typeof f === "number" ? num((f - 32) * 5 / 9) + " °C" : null; };
  const items = [
    ["天气", w.weatherDesc || null],
    ["气温", c(w.temp)],
    ["体感", c(w.apparentTemp)],
    ["湿度", typeof w.relativeHumidity === "number" ? num(w.relativeHumidity) + " %" : null],
    ["风", typeof w.windSpeed === "number" ? (w.windDirectionCompassPoint ? String(w.windDirectionCompassPoint).toUpperCase() + " " : "") + num(w.windSpeed * 1.609) + " km/h" : null],
  ].filter(function (x) { return x[1]; });
  if (!items.length) return null;
  return h("section", null,
    h("h3", { className: "gc-sub" }, "天气"),
    h("div", { className: "gc-stats" }, items.map(function (x) {
      return h("div", { className: "gc-stat", key: x[0] },
        h("span", { className: "gc-stat-label" }, x[0]), h("span", { className: "gc-stat-value" }, x[1]));
    })));
}

/** Garmin 返回的全部概要字段，原样列出（带中文名的在前） */
const FIELD_NAMES = {
  distance: "距离（米）", duration: "用时（秒）", movingDuration: "移动用时（秒）", elapsedDuration: "总耗时（秒）",
  averageSpeed: "平均速度（米/秒）", maxSpeed: "最大速度（米/秒）", averageMovingSpeed: "平均移动速度（米/秒）",
  averageHR: "平均心率", maxHR: "最大心率", minHR: "最低心率", averageRunCadence: "平均步频", maxRunCadence: "最大步频",
  strideLength: "步幅（厘米）", groundContactTime: "触地时间（毫秒）", verticalOscillation: "垂直振幅（厘米）",
  verticalRatio: "垂直步幅比（%）", averagePower: "平均功率", maxPower: "最大功率", normalizedPower: "标准化功率",
  elevationGain: "累计爬升（米）", elevationLoss: "累计下降（米）", minElevation: "最低海拔", maxElevation: "最高海拔",
  calories: "热量", bmrCalories: "基础代谢热量", steps: "步数", trainingEffect: "有氧训练效果",
  anaerobicTrainingEffect: "无氧训练效果", activityTrainingLoad: "训练负荷", aerobicTrainingEffectMessage: "有氧效果说明",
  anaerobicTrainingEffectMessage: "无氧效果说明", trainingEffectLabel: "训练效果标签", startTimeLocal: "开始时间（当地）",
  startTimeGMT: "开始时间（UTC）", startLatitude: "起点纬度", startLongitude: "起点经度", endLatitude: "终点纬度",
  endLongitude: "终点经度", moderateIntensityMinutes: "中强度分钟", vigorousIntensityMinutes: "高强度分钟",
  waterEstimated: "估算出汗量（毫升）", beginPotentialStamina: "开始体能", endPotentialStamina: "结束体能",
  minAvailableStamina: "最低可用体能", directWorkoutFeel: "主观感受", directWorkoutRpe: "主观用力",
  avgGradeAdjustedSpeed: "坡度调整速度（米/秒）", maxDoubleCadence: "最大双脚步频", maxVerticalSpeed: "最大垂直速度",
  differenceBodyBattery: "身体电量变化", recoveryHeartRate: "恢复心率",
};

function AllFields(props) {
  const s = props.summary || {};
  const keys = Object.keys(s).sort(function (a, b) {
    const na = FIELD_NAMES[a] ? 0 : 1, nb = FIELD_NAMES[b] ? 0 : 1;
    return na - nb || a.localeCompare(b);
  });
  const wkeys = Object.keys(props.weather || {}).sort();
  return h("details", { className: "gc-all" },
    h("summary", null, "Garmin 返回的全部字段（" + (keys.length + wkeys.length) + " 项）"),
    h("div", { className: "gc-scroll" }, h("table", { className: "gc-table gc-kv" },
      h("tbody", null,
        keys.map(function (k) {
          return h("tr", { key: k }, h("th", null, FIELD_NAMES[k] || k), h("td", null, h("code", null, k)), h("td", null, String(s[k])));
        }),
        wkeys.map(function (k) {
          return h("tr", { key: "w-" + k }, h("th", null, "天气 · " + k), h("td", null, h("code", null, k)), h("td", null, String(props.weather[k])));
        })))));
}

// ---------------------------------------------------------------------------
// 曲线：心率、配速、海拔、步频、功率…（横轴距离；室内或校正过时用时间，手表估的距离不准）
// ---------------------------------------------------------------------------

const SERIES_DEFS = [
  { key: "directHeartRate", label: "心率", unit: "bpm", fmt: function (v) { return num(v); } },
  { key: "directSpeed", label: "配速", unit: "/km", pace: true, fmt: function (v) { return paceFromSpeed(v).replace("/km", ""); } },
  { key: "directElevation", label: "海拔", unit: "m", fmt: function (v) { return num(v); } },
  { key: "directDoubleCadence", label: "步频", unit: "步/分", fmt: function (v) { return num(v); } },
  { key: "directRunCadence", label: "步频（单脚）", unit: "步/分", skipIf: "directDoubleCadence", fmt: function (v) { return num(v); } },
  { key: "directPower", label: "功率", unit: "W", fmt: function (v) { return num(v); } },
  { key: "directGroundContactTime", label: "触地时间", unit: "ms", fmt: function (v) { return num(v); } },
  { key: "directVerticalOscillation", label: "垂直振幅", unit: "cm", fmt: function (v) { return num(v, 1); } },
];

function SeriesCharts(props) {
  const s = props.series || {};
  const useTime = props.indoor || !s.sumDistance;
  const xs = useTime ? (s.sumDuration || s.sumElapsedDuration) : s.sumDistance;
  if (!xs) return null;
  const defs = SERIES_DEFS.filter(function (d) {
    return s[d.key] && !(d.skipIf && s[d.skipIf]) && s[d.key].some(function (v) { return typeof v === "number" && v > 0; });
  });
  if (!defs.length) return null;
  return h("section", null,
    h("h3", { className: "gc-sub" }, "曲线（横轴：" + (useTime ? "时间" : "距离") + "）"),
    h("div", { className: "gc-charts" }, defs.map(function (d) {
      return h(LineChart, { key: d.key, def: d, xs: xs, ys: s[d.key], useTime: useTime });
    })));
}

function LineChart(props) {
  const d = props.def;
  const W = 360, H = 120, padL = 40, padB = 18, padT = 8;
  const pts = [];
  props.xs.forEach(function (x, i) {
    const y = props.ys[i];
    // 配速曲线去掉近乎停住的点（< 0.5 m/s），不然尺度被拉爆
    if (typeof x === "number" && typeof y === "number" && y > 0 && (!d.pace || y >= 0.5)) pts.push([x, d.pace ? 1000 / y : y]);
  });
  if (pts.length < 2) return null;
  const xmin = pts[0][0], xmax = pts[pts.length - 1][0] || 1;
  const yvals = pts.map(function (p) { return p[1]; }).sort(function (a, b) { return a - b; });
  // 用 2%～98% 分位做纵轴，去掉尖刺
  const ylo = yvals[Math.floor(yvals.length * 0.02)], yhi = yvals[Math.ceil(yvals.length * 0.98) - 1];
  const span = (yhi - ylo) || 1;
  const sx = function (x) { return padL + ((x - xmin) / ((xmax - xmin) || 1)) * (W - padL - 4); };
  // 配速：越快越高（值小在上）
  const sy = function (y) {
    const t = Math.min(1, Math.max(0, (y - ylo) / span));
    return d.pace ? padT + t * (H - padT - padB) : H - padB - t * (H - padT - padB);
  };
  const avg = pts.reduce(function (a, p) { return a + p[1]; }, 0) / pts.length;
  const show = function (v) { return d.pace ? fmtPace(v).replace("/km", "") : d.fmt(v); };
  const xlabel = function (x) { return props.useTime ? fmtDuration(x) : (x / 1000).toFixed(1) + " km"; };
  return h("figure", { className: "gc-chart gc-line" },
    h("figcaption", null, h("strong", null, d.label), " 平均 " + show(avg) + " " + (d.pace ? "/km" : d.unit)),
    h("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": d.label + "曲线" },
      h("line", { x1: padL, x2: W - 4, y1: sy(d.pace ? ylo : yhi), y2: sy(d.pace ? ylo : yhi), className: "gc-grid" }),
      h("line", { x1: padL, x2: W - 4, y1: sy(d.pace ? yhi : ylo), y2: sy(d.pace ? yhi : ylo), className: "gc-grid" }),
      h("text", { x: padL - 4, y: sy(d.pace ? ylo : yhi) + 4, className: "gc-axis", textAnchor: "end" }, show(d.pace ? ylo : yhi)),
      h("text", { x: padL - 4, y: sy(d.pace ? yhi : ylo) + 4, className: "gc-axis", textAnchor: "end" }, show(d.pace ? yhi : ylo)),
      h("polyline", {
        className: "gc-linepath", fill: "none",
        points: pts.map(function (p) { return sx(p[0]).toFixed(1) + "," + sy(p[1]).toFixed(1); }).join(" "),
      }),
      h("text", { x: padL, y: H - 4, className: "gc-axis" }, xlabel(xmin)),
      h("text", { x: W - 4, y: H - 4, className: "gc-axis", textAnchor: "end" }, xlabel(xmax))));
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
        src: API_BASE + "/tiles/" + src + "/" + z + "/" + wx + "/" + ty,
        style: { left: (tx * 256 - left) + "px", top: (ty * 256 - top) + "px" },
      }));
    }
  }
  const path = px.map(function (p) { return (p[0] - left).toFixed(1) + "," + (p[1] - top).toFixed(1); }).join(" ");
  const start = px[0], end = px[px.length - 1];
  return h("div", { className: "gc-map", ref: ref, style: { height: H + "px" } },
    tiles,
    h("svg", { className: "gc-map-svg", width: width, height: H, viewBox: "0 0 " + width + " " + H },
      h("polyline", { points: path, className: "gc-route-halo", fill: "none" }),
      h("polyline", { points: path, className: "gc-route", fill: "none" }),
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
  const [run, setRun] = useState(null);
  const [hint, setHint] = useState("正在读取最近一次跑步…");

  useEffect(function () {
    let alive = true;
    api("/runs")
      .then(function (data) {
        if (!alive) return;
        const list = Array.isArray(data.runs) ? data.runs : [];
        if (list.length) {
          setRun(list[0]);
          setHint("");
        } else {
          setHint("暂无跑步记录，先在设置页登录 Garmin");
        }
      })
      .catch(function (err) {
        if (alive) setHint("读取失败：" + errText(err));
      });
    return function () { alive = false; };
  }, []);

  const v = run ? runView(run) : null;
  return h("div", { className: "pmw-plugin pmw-plugin-card" },
    h("h4", null, "最近一次跑步"),
    run
      ? h("div", null,
          h("p", { className: "gc-card-main" }, fmtDistance(v.dist), " · ", fmtPace(v.pace)),
          h("p", { className: "pmw-plugin-hint" },
            shortTime(run.start_time), "　时长 ", fmtDuration(run.duration_s)))
      : h("p", { className: "pmw-plugin-hint" }, hint));
}

function SettingsSection() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isCN, setIsCN] = useState(true);
  const [state, setState] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      setState(await api("/status"));
    } catch (err) {
      setMsg("读取状态失败：" + errText(err));
    }
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
      try {
        await api("/sync?full=1", { method: "POST" });
        setMsg("登录成功，正在后台同步全部历史跑步，到「" + PLUGIN_NAME + "」模块页看进度。");
      } catch (err) {
        setMsg("登录成功，但开始同步失败：" + errText(err));
      }
      await refresh();
    } catch (err) {
      setPassword("");
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
  return h("section", { className: "pmw-plugin pmw-plugin-settings" },
    h("h3", null, PLUGIN_NAME + " 设置"),
    loggedIn
      ? h("div", { className: "gc-account" },
          h("p", null, "已登录：", h("strong", null, state.email || "Garmin 账号"),
            state.is_cn === false ? "（国际区）" : "（中国区）"),
          h("p", { className: "pmw-plugin-hint" },
            state.last_sync ? ("上次同步 " + shortTime(state.last_sync)) : "还没有同步过",
            typeof state.runs === "number" ? "，本地 " + state.runs + " 条跑步记录" : "",
            "；每 6 小时自动同步一次。"),
          state.last_sync_error ? h("p", { className: "gc-note", role: "alert" }, "最近一次同步失败：" + state.last_sync_error) : null,
          h("button", { className: "pmw-plugin-button", type: "button", disabled: busy, onClick: logout }, "退出登录"))
      : h("form", { className: "gc-login", onSubmit: login },
          h("p", { className: "pmw-plugin-hint" },
            "用 Garmin Connect 账号登录。密码只用来换取访问令牌，不会保存；令牌加密存在工作台的凭证保险箱里。"),
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
          h("button", { className: "pmw-plugin-button", type: "submit", disabled: busy }, busy ? "登录中…" : "登录"),
          h("p", { className: "pmw-plugin-hint" },
            "需要先在「设置 → 插件 → 外部插件」给本插件授予 network:any；开了两步验证的账号暂不支持。")),
    msg ? h("p", { className: "pmw-plugin-hint", role: "status" }, msg) : null);
}

window.__PMW_PLUGIN__.register({
  id: PLUGIN_ID,
  api: API_RANGE,

  activate(ctx) {
    CTX = ctx;
    disposables.push(
      ctx.slots.register("module", { id: PLUGIN_ID, title: PLUGIN_NAME }, guarded(ModulePage)),
      ctx.slots.register("settings.section", { id: PLUGIN_ID, title: PLUGIN_NAME }, guarded(SettingsSection)),
      ctx.slots.register("today.card", { key: PLUGIN_ID + "_last_run", title: "最近跑步" }, guarded(TodayCard)),
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
