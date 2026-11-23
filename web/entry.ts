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
      : h(RunList, { runs: runs, indoorTypes: indoorTypes, onOpen: setOpen }));
}

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function parseLocal(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s || ""));
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
}

/** 本周（周一起）、本月的跑量，从列表算；今年用统计接口（列表最多 200 条） */
function periodTotals(runs) {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const t = { week: { n: 0, d: 0 }, month: { n: 0, d: 0 } };
  runs.forEach(function (r) {
    const d = parseLocal(r.start_time);
    if (!d) return;
    const dist = runView(r).dist || 0;
    if (d >= monday) { t.week.n++; t.week.d += dist; }
    if (d >= monthStart) { t.month.n++; t.month.d += dist; }
  });
  return t;
}

function RunList(props) {
  const [kind, setKind] = useState("all");
  const [q, setQ] = useState("");
  const [year, setYear] = useState(null);

  useEffect(function () {
    let alive = true;
    api("/stats?period=year&kind=all").then(function (d) {
      if (!alive) return;
      const y = String(new Date().getFullYear());
      const b = (d.buckets || []).find(function (x) { return x.bucket === y; });
      setYear(b || { runs: 0, distance_m: 0 });
    }).catch(function () {});
    return function () { alive = false; };
  }, [props.runs.length]);

  const totals = periodTotals(props.runs);
  const word = q.trim().toLowerCase();
  const list = props.runs.filter(function (r) {
    const indoor = isIndoor(r.type_key, props.indoorTypes);
    if (kind === "indoor" && !indoor) return false;
    if (kind === "outdoor" && indoor) return false;
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
  });

  return h("div", { className: "gc-list" },
    h("div", { className: "gc-stats gc-stats-3" },
      [["本周", totals.week.n, totals.week.d], ["本月", totals.month.n, totals.month.d],
       ["今年", year ? year.runs : null, year ? year.distance_m : null]].map(function (c) {
        return h("div", { className: "gc-stat", key: c[0] },
          h("span", { className: "gc-stat-label" }, c[0] + (c[1] != null ? " · " + c[1] + " 次" : "")),
          h("span", { className: "gc-stat-value" }, c[2] != null ? fmtDistance(c[2]) : "-"));
      })),
    h("div", { className: "gc-controls" },
      h(Seg, { label: "类型", value: kind, onChange: setKind, options: [["all", "全部"], ["outdoor", "室外"], ["indoor", "室内"]] }),
      h("input", { className: "gc-search", type: "search", placeholder: "按名称搜索", value: q, "aria-label": "按名称搜索",
        onChange: function (e) { setQ(e.target.value); } }),
      h("span", { className: "pmw-plugin-hint" }, list.length + " 次" + (props.runs.length >= 200 ? "（列表显示最近 200 次）" : ""))),
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
                  h("strong", null, fmtDistance(v.dist), v.corrected ? h("span", { className: "gc-mark" }, " 校") : null),
                  h("small", null, fmtPace(v.pace) + (r.avg_hr ? " · " + Math.round(r.avg_hr) + " bpm" : ""))));
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
                  h("span", null, g.runs.length + " 次 · " + fmtDistance(g.dist)))),
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
                  h("td", { className: "num" }, h("strong", null, fmtDistance(v.dist)),
                    v.corrected ? h("span", { className: "gc-mark", title: "已按跑步机速度校正" }, " 校") : null),
                  h("td", { className: "num" }, fmtDuration(r.duration_s)),
                  h("td", { className: "num" }, fmtPace(v.pace)),
                  h("td", { className: "num" }, r.avg_hr ? String(Math.round(r.avg_hr)) : "-"));
              }));
          })))
      : h("p", { className: "pmw-plugin-hint" }, props.runs.length ? "没有符合条件的跑步" : ""));
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
  return h("section", null,
    h("h3", { className: "gc-sub" }, "详细数据"),
    h("div", { className: "gc-groups" }, groups.map(function (g) {
      return h("div", { className: "gc-group", key: g[0] },
        h("h4", { className: "gc-group-title" }, g[0]),
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

  const tabs = [["overview", "概览"], ["charts", "图表"], ["laps", "分段"]];
  const narrow = isNarrow();
  const fetched = detail && detail.fetched_at
    ? h("p", { className: "pmw-plugin-hint" }, "数据取自 Garmin：" + shortTime(detail.fetched_at) +
        (detail.missing && detail.missing.length ? "；这次活动没有：" + detail.missing.map(missingName).join("、") : ""))
    : null;
  const correctionNote = corrected
    ? h("div", { className: "gc-note gc-note-row" },
        h("span", null, "已按跑步机速度校正：距离 " + fmtDistance(s.distance) + "（Garmin 原始 " + fmtDistance(s._origDistance) + "），配速随之重算。这只改本地，Garmin 上还是原始数据。"),
        h("button", { className: "pmw-plugin-button", type: "button", onClick: presetCorrection,
          title: "Garmin 不允许改距离；可以把校正结果写进描述，并把类型改成跑步机" }, "写入 Garmin 描述"))
    : null;

  let body = null;
  if (detail && tab === "overview") {
    // 先图（路线），后数据（关键指标、天气、描述）
    body = h("div", { className: "gc-tab-body" },
      detail.track && detail.track.length > 1
        ? h(RouteMap, { track: detail.track, source: resp.map_source || "amap" })
        : h("p", { className: "gc-note" }, indoor ? "室内跑步没有路线。" : "这次活动没有 GPS 轨迹。"),
      correctionNote,
      h("div", { className: "gc-stats" },
        cards.map(function (c) {
          return h("div", { className: "gc-stat", key: c[0] },
            h("span", { className: "gc-stat-label" }, c[0]),
            h("span", { className: "gc-stat-value" }, c[1]));
        })),
      detail.weather ? h(WeatherCard, { w: detail.weather }) : null,
      detail.description ? h("section", null, h("h3", { className: "gc-sub" }, "描述"), h("p", { className: "gc-desc" }, detail.description)) : null,
      h(DataGroups, { summary: s, raw: detail.summary || {} }),
      fetched);
  } else if (detail && tab === "charts") {
    body = h("div", { className: "gc-tab-body" },
      h(ChartsTab, { key: detail.activity_id, series: detail.series, indoor: indoor || corrected, zones: detail.hr_zones || [] }));
  } else if (detail && tab === "laps") {
    body = h("div", { className: "gc-tab-body" },
      h(LapBars, { laps: laps, lapViews: lapViews }),
      correctionNote,
      h(LapsSection, {
        laps: laps, lapViews: lapViews, indoor: indoor, edit: edit, saving: saving, corrected: corrected,
        allSpeed: allSpeed, setAllSpeed: setAllSpeed, applyAll: applyAll,
        setEdit: setEdit, startEdit: startEdit, submitEdit: submitEdit,
        clear: function () { saveSpeeds({ clear: true }); },
      }));
  }

  return h("div", { className: "pmw-plugin pmw-plugin-module gc-detail" },
    h(TitleBar, {
      parent: PLUGIN_NAME,
      title: (detail && detail.name) || props.title || "跑步详情",
      desc: metaBits,
      actions: [
        { label: narrow ? "返回" : "返回列表", onClick: props.onBack },
        detail ? { label: "编辑", disabled: Boolean(editing), onClick: function () { setEditing({}); } } : null,
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
  return h("section", null,
    h("h3", { className: "gc-sub" }, "天气"),
    h("div", { className: "gc-stats" }, items.map(function (x) {
      return h("div", { className: "gc-stat", key: x[0] },
        h("span", { className: "gc-stat-label" }, x[0]), h("span", { className: "gc-stat-value" }, x[1]));
    })));
}

// ---------------------------------------------------------------------------
// 曲线：可选指标、分开 / 叠加、横轴距离 / 时间、去毛刺、暂停与停下标记、同步悬停读数
// ---------------------------------------------------------------------------

/**
 * 指标定义。src 是 Garmin 逐点字段；lo/hi 是合理范围（超出算毛刺）；minDev 是判定毛刺的最小偏差（避免平稳数据被误判）；
 * moving 表示人停下时这个指标没意义（停下的点画成断开）。
 */
const METRIC_DEFS = [
  { key: "pace", src: "directSpeed", label: "配速", unit: "/km", color: "#2563eb", pace: true, minDev: 0.35 },
  { key: "hr", src: "directHeartRate", label: "心率", unit: "bpm", color: "#dc2626", lo: 35, hi: 230, minDev: 8 },
  { key: "ele", src: "directElevation", label: "海拔", unit: "m", color: "#059669", lo: -500, hi: 9000, minDev: 4 },
  { key: "cad", src: "directDoubleCadence", alt: "directRunCadence", label: "步频", unit: "步/分", color: "#7c3aed", lo: 100, hi: 260, minDev: 8, moving: true },
  { key: "pow", src: "directPower", label: "功率", unit: "W", color: "#ea580c", lo: 1, hi: 1500, minDev: 40, moving: true },
  { key: "gct", src: "directGroundContactTime", label: "触地时间", unit: "ms", color: "#0891b2", lo: 100, hi: 500, minDev: 25, moving: true },
  { key: "vo", src: "directVerticalOscillation", label: "垂直振幅", unit: "cm", color: "#db2777", lo: 2, hi: 20, minDev: 1, moving: true, digits: 1 },
  { key: "stride", src: "directStrideLength", label: "步幅", unit: "m", color: "#65a30d", lo: 0.3, hi: 2.5, minDev: 0.12, moving: true, scale: 0.01, digits: 2 },
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
    metrics.push({ def: d, vals: vals, fixed: fixed, avg: avg });
  });
  const br = findBreaks(series, n);
  return { x: xRaw, n: n, axis: opts.axis, metrics: metrics, pauses: br.pauses, stops: br.stops };
}

function fmtMetric(d, v) {
  if (!isNum(v)) return "-";
  if (d.pace) return fmtPace(v).replace("/km", "");
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
  const W = isNarrow() ? 380 : 760, H = props.narrowHeight && isNarrow() ? props.narrowHeight : props.height;
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
  const ref = useRef(null);
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
    ref: ref, viewBox: "0 0 " + W + " " + H, className: "gc-chart-svg", role: "img",
    "aria-label": ms.map(function (m) { return m.def.label; }).join("、") + "曲线",
    onMouseMove: onMove, onMouseLeave: function () { props.setHover(null); },
    onTouchStart: function (e) { if (e.touches[0]) onMove(e.touches[0]); },
    onTouchMove: function (e) { if (e.touches[0]) onMove(e.touches[0]); },
  },
    h("defs", null, h("clipPath", { id: clipId }, h("rect", { x: padL, y: padT - 2, width: W - padL - padR, height: H - padT - padB + 4 }))),
    prep.pauses.map(function (b) { return band(b, "gc-pause"); }),
    prep.stops.map(function (b) { return band(b, "gc-stop"); }),
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
      return h("path", { key: m.def.key, d: pathFor(prep, m.vals, sx, scales[j]), fill: "none", stroke: m.def.color, strokeWidth: 1.6, strokeLinejoin: "round" });
    })),
    hv != null && isNum(prep.x[hv]) ? h("g", null,
      h("line", { x1: sx(prep.x[hv]), x2: sx(prep.x[hv]), y1: padT, y2: H - padB, className: "gc-cross" }),
      ms.map(function (m, j) {
        const v = m.vals[hv];
        return isNum(v) ? h("circle", { key: m.def.key, cx: sx(prep.x[hv]), cy: scales[j](v), r: 3.5, fill: m.def.color, stroke: "#fff", strokeWidth: 1.5 }) : null;
      })) : null,
    h("text", { x: padL, y: H - 6, className: "gc-axis" }, xText(prep.axis, xmin)),
    h("text", { x: (padL + W - padR) / 2, y: H - 6, className: "gc-axis", textAnchor: "middle" }, xText(prep.axis, (xmin + xmax) / 2)),
    h("text", { x: W - padR, y: H - 6, className: "gc-axis", textAnchor: "end" }, xText(prep.axis, xmax)));
}

function ChartsTab(props) {
  const series = props.series || {};
  const hasDist = Boolean(series.sumDistance);
  const prefs0 = loadPrefs();
  const [sel, setSel] = useState(prefs0.sel || ["pace", "hr", "ele"]);
  const [mode, setMode] = useState(prefs0.mode || "split");
  const [axis, setAxis] = useState(props.indoor || !hasDist ? "time" : (prefs0.axis || "distance"));
  const [clean, setClean] = useState(prefs0.clean !== false);
  // 配速范围存成秒/公里（0 表示不限）；旧版本存过 "4'30" 文本的，忽略
  const [fast, setFast] = useState(typeof prefs0.fastSec === "number" ? prefs0.fastSec : 0);
  const [slow, setSlow] = useState(typeof prefs0.slowSec === "number" ? prefs0.slowSec : 0);
  const [hover, setHover] = useState(null);

  useEffect(function () {
    savePrefs({ sel: sel, mode: mode, axis: props.indoor ? prefs0.axis : axis, clean: clean, fastSec: fast, slowSec: slow });
  }, [sel, mode, axis, clean, fast, slow]);

  const prep = prepareChart(series, { axis: axis, clean: clean, fast: fast || 150, slow: slow || 0 });
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
      clean && avail.indexOf("pace") >= 0 ? h("span", { className: "gc-inline" },
        "配速范围",
        h(PaceInput, { label: "最快", value: fast, onChange: setFast, placeholder: "2 分 30 秒" }),
        "～",
        h(PaceInput, { label: "最慢", value: slow, onChange: setSlow, placeholder: "不限" }),
        fast || slow ? h("button", { type: "button", className: "gc-link", onClick: function () { setFast(0); setSlow(0); } }, "清空") : null) : null),
    // 读数条：悬停时显示这一点各指标的值
    h("div", { className: "gc-readout", "aria-live": "polite" },
      hover != null
        ? [h("strong", { key: "x" }, xText(prep.axis, prep.x[hover]))].concat(shown.map(function (m) {
            return h("span", { key: m.def.key }, h("span", { className: "gc-dot", style: { background: m.def.color } }),
              m.def.label + " " + fmtMetric(m.def, m.vals[hover]) + (m.def.pace ? "/km" : " " + m.def.unit));
          }))
        : h("span", { className: "pmw-plugin-hint" }, isNarrow() ? "点图上任意位置看那一点的数值" : "把鼠标移到图上看每个点的数值")),
    mode === "overlay"
      ? h("div", { className: "gc-chart-box" },
          h("div", { className: "gc-chart-title gc-overlay-avg" }, shown.map(function (m) {
            return h("span", { key: m.def.key }, h("span", { className: "gc-dot", style: { background: m.def.color } }),
              m.def.label + " 平均 " + fmtMetric(m.def, m.avg) + (m.def.pace ? "/km" : " " + m.def.unit));
          }), h("small", null, "虚线为平均值，各指标各用各的刻度")),
          h(ChartSvg, { prep: prep, metrics: shown, overlay: true, height: 300, narrowHeight: 240, hover: hover, setHover: setHover }))
      : shown.map(function (m) {
          return h("div", { className: "gc-chart-box", key: m.def.key },
            h("div", { className: "gc-chart-title" }, h("span", { className: "gc-dot", style: { background: m.def.color } }),
              m.def.label + "  平均 " + fmtMetric(m.def, m.avg) + (m.def.pace ? "/km" : " " + m.def.unit),
              h("small", null, m.def.pace ? "（越靠上越快）" : "")),
            h(ChartSvg, { prep: prep, metrics: [m], overlay: false, height: 140, narrowHeight: 150, hover: hover, setHover: setHover }));
        }),
    h("p", { className: "pmw-plugin-hint gc-legend" },
      h("span", null, h("i", { className: "gc-swatch gc-pause" }), "暂停 " + prep.pauses.length + " 次" + (pauseTotal ? "，共 " + fmtDuration(pauseTotal) : "")),
      h("span", null, h("i", { className: "gc-swatch gc-stop" }), "停下（计时未停） " + prep.stops.length + " 次" + (stopTotal ? "，共 " + fmtDuration(stopTotal) : "")),
      clean ? h("span", null, "已修正异常点 " + fixedTotal + " 个") : h("span", null, "显示原始数据"),
      prep.axis === "distance" && (prep.pauses.length || prep.stops.length) ? h("span", null, "按距离看时暂停是一条竖线，切到按时间看能看到时长") : null),
    h(MetricTable, { metrics: shown, clean: clean }),
    h(ZonesSection, { zones: props.zones || [] }));
}

/** 配速输入：分、秒两个数字框，值是秒/公里，0 表示不限 */
function PaceInput(props) {
  const v = props.value || 0;
  const [m, setM] = useState(v ? String(Math.floor(v / 60)) : "");
  const [s, setS] = useState(v ? String(v % 60) : "");
  useEffect(function () {
    // 外部清空时同步
    if (!props.value) { setM(""); setS(""); }
  }, [props.value]);
  const push = function (mm, ss) {
    const mi = parseInt(mm, 10), se = parseInt(ss, 10);
    const total = (isNaN(mi) ? 0 : mi) * 60 + (isNaN(se) ? 0 : Math.min(59, se));
    props.onChange(total > 0 ? total : 0);
  };
  return h("span", { className: "gc-pace-input", title: props.label + "配速，" + props.placeholder },
    h("small", null, props.label),
    h("input", { type: "number", min: "1", max: "30", inputMode: "numeric", value: m, placeholder: props.label === "最快" ? "2" : "",
      "aria-label": props.label + "配速的分钟", onChange: function (e) { setM(e.target.value); push(e.target.value, s); } }),
    h("small", null, "分"),
    h("input", { type: "number", min: "0", max: "59", inputMode: "numeric", value: s, placeholder: props.label === "最快" ? "30" : "",
      "aria-label": props.label + "配速的秒", onChange: function (e) { setS(e.target.value); push(m, e.target.value); } }),
    h("small", null, "秒"));
}

/** 各指标的最低 / 平均 / 最高（用去毛刺后的值） */
function MetricTable(props) {
  return h("div", { className: "gc-scroll" }, h("table", { className: "gc-table" },
    h("thead", null, h("tr", null, h("th", null, "指标"), h("th", { className: "num" }, "最小"), h("th", { className: "num" }, "平均"),
      h("th", { className: "num" }, "最大"), props.clean ? h("th", { className: "num" }, "修正点") : null)),
    h("tbody", null, props.metrics.map(function (m) {
      const a = m.vals.filter(isNum);
      const avg = a.length ? (m.def.pace ? 1000 / (a.reduce(function (t, v) { return t + 1000 / v; }, 0) / a.length) : a.reduce(function (t, v) { return t + v; }, 0) / a.length) : NaN;
      const lo = a.length ? Math.min.apply(null, a) : NaN, hi = a.length ? Math.max.apply(null, a) : NaN;
      const u = m.def.pace ? "/km" : " " + m.def.unit;
      return h("tr", { key: m.def.key },
        h("td", null, h("span", { className: "gc-dot", style: { background: m.def.color } }), m.def.label),
        // 配速的数值是秒/公里，最小即最快
        h("td", { className: "num" }, fmtMetric(m.def, lo) + u + (m.def.pace ? "（最快）" : "")),
        h("td", { className: "num" }, fmtMetric(m.def, avg) + u),
        h("td", { className: "num" }, fmtMetric(m.def, hi) + u + (m.def.pace ? "（最慢）" : "")),
        props.clean ? h("td", { className: "num" }, String(m.fixed)) : null);
    }))));
}

/** 分段配速柱状图：宽度按用时、高度按速度（越高越快），颜色按 Garmin 的分段类型；悬停看这一段，标最快、最慢，虚线为平均 */
function LapBars(props) {
  const views = props.lapViews, laps = props.laps;
  const [hv, setHv] = useState(null);
  if (!views.length) return null;
  const narrow = isNarrow();
  const W = narrow ? 380 : 760, H = 190, padL = 8, padR = 8, padT = 22, padB = 22;
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
    h("svg", { viewBox: "0 0 " + W + " " + H, className: "gc-chart-svg", role: "img", "aria-label": "每段配速",
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
        // 取不到的瓦片隐藏，不显示破图标
        onError: function (e) { e.currentTarget.style.visibility = "hidden"; },
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
