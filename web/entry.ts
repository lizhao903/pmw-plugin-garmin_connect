// powered by dsh - https://github.com/deepseek-ai/deepseek-harness

/**
 * Garmin 跑步数据插件前端入口（清单 v2 / 宿主 API 2.0.0）。
 * 只用 JS 语法子集（类型走 JSDoc），零构建即可作为 ESM 运行。
 * 数据走同源 /api/plugins/external/garmin_connect/api/*，由宿主转发到插件后端。
 */
import { Component, createElement as h, useEffect, useState } from "react";

const PLUGIN_ID = "garmin_connect";
const PLUGIN_NAME = "Garmin 跑步数据";
const API_RANGE = ">=2.0.0 <3.0.0";
const API_BASE = "/api/plugins/external/" + PLUGIN_ID + "/api";

/** @type {Array<{dispose?: () => void}>} */
const disposables = [];

/** @param {string} path @param {RequestInit} [init] @returns {Promise<any>} */
async function api(path, init) {
  const res = await fetch(API_BASE + path, init);
  const data = await res.json().catch(function () { return {}; });
  if (!res.ok) throw new Error((data && data.error) || ("HTTP " + res.status));
  return data;
}

/** @param {number|null|undefined} m @returns {string} */
function fmtDistance(m) {
  if (typeof m !== "number") return "-";
  return (m / 1000).toFixed(2) + " km";
}

/** @param {number|null|undefined} sec @returns {string} */
function fmtDuration(sec) {
  if (typeof sec !== "number") return "-";
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
  if (typeof secPerKm !== "number" || secPerKm <= 0) return "-";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return m + "'" + String(s).padStart(2, "0") + "\"/km";
}

function runKey(run) {
  return run && run.activity_id ? run.activity_id : run && run.start_time;
}

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

/** @param {number|null|undefined} mps @returns {string} 米/秒 → 配速 */
function paceFromSpeed(mps) {
  return typeof mps === "number" && mps > 0 ? fmtPace(1000 / mps) : "-";
}

/** @param {any} v @param {number} [digits] @returns {string} */
function num(v, digits) {
  if (typeof v !== "number" || !isFinite(v)) return "-";
  return digits ? v.toFixed(digits) : String(Math.round(v));
}

/** 概要里要展示的字段：取不到的不显示。值是 [标题, 取值函数] */
const SUMMARY_FIELDS = [
  ["距离", function (s) { return fmtDistance(s.distance); }],
  ["用时", function (s) { return fmtDuration(s.duration); }],
  ["移动用时", function (s) { return fmtDuration(s.movingDuration); }],
  ["平均配速", function (s) { return paceFromSpeed(s.averageSpeed); }],
  ["最快配速", function (s) { return paceFromSpeed(s.maxSpeed); }],
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

function RunDetail(props) {
  const id = props.id;
  const [detail, setDetail] = useState(null);
  const [hint, setHint] = useState("正在读取跑步详情…");
  const [busy, setBusy] = useState(false);

  async function load(refresh) {
    setBusy(true);
    setHint(refresh ? "正在从 Garmin 重新拉取…" : "正在读取跑步详情…");
    try {
      const data = await api("/runs/" + encodeURIComponent(id) + (refresh ? "?refresh=1" : ""));
      setDetail(data.detail || null);
      setHint("");
    } catch (err) {
      setHint("读取失败：" + String((err && err.message) || err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(function () { load(false); }, [id]);

  const s = (detail && detail.summary) || {};
  const laps = (detail && detail.laps) || [];
  const zones = (detail && detail.hr_zones) || [];
  const zoneTotal = zones.reduce(function (t, z) { return t + (z.secsInZone || 0); }, 0);
  const cards = SUMMARY_FIELDS
    .map(function (f) { return [f[0], f[1](s)]; })
    .filter(function (f) { return f[1] && f[1] !== "-"; });

  return h("div", { className: "pmw-plugin pmw-plugin-module" },
    h("div", { className: "gc-detail-bar" },
      h("button", { className: "pmw-plugin-button", type: "button", onClick: props.onBack }, "← 返回列表"),
      h("button", { className: "pmw-plugin-button", type: "button", disabled: busy, onClick: function () { load(true); } },
        busy ? "读取中…" : "从 Garmin 重新拉取")),
    h("header", { className: "pmw-plugin-header" },
      h("h2", null, (detail && detail.name) || props.title || "跑步详情"),
      h("p", { className: "pmw-plugin-hint" },
        String((detail && detail.start_local) || props.start || "").replace("T", " ").slice(0, 16))),
    hint ? h("p", { className: "pmw-plugin-hint" }, hint) : null,
    detail ? h("div", { className: "gc-stats" },
      cards.map(function (c) {
        return h("div", { className: "gc-stat", key: c[0] },
          h("span", { className: "gc-stat-label" }, c[0]),
          h("span", { className: "gc-stat-value" }, c[1]));
      })) : null,
    detail ? h("section", null,
      h("h3", { className: "gc-sub" }, "分段" + (laps.length ? "（" + laps.length + " 段）" : "")),
      laps.length
        ? h("div", { className: "gc-scroll" }, h("table", { className: "gc-table" },
            h("thead", null, h("tr", null,
              h("th", null, "#"), h("th", null, "距离"), h("th", null, "用时"), h("th", null, "配速"),
              h("th", null, "均心率"), h("th", null, "最大心率"), h("th", null, "步频"), h("th", null, "爬升"))),
            h("tbody", null, laps.map(function (l, i) {
              return h("tr", { key: i },
                h("td", null, String(i + 1)),
                h("td", null, fmtDistance(l.distance)),
                h("td", null, fmtDuration(l.duration)),
                h("td", null, paceFromSpeed(l.averageSpeed)),
                h("td", null, l.averageHR ? num(l.averageHR) : "-"),
                h("td", null, l.maxHR ? num(l.maxHR) : "-"),
                h("td", null, l.averageRunCadence ? num(l.averageRunCadence) : "-"),
                h("td", null, typeof l.elevationGain === "number" ? num(l.elevationGain) + " m" : "-"));
            }))))
        : h("p", { className: "pmw-plugin-hint" }, "这次活动没有分段数据")) : null,
    detail ? h("section", null,
      h("h3", { className: "gc-sub" }, "心率区间"),
      zoneTotal > 0
        ? h("div", { className: "gc-zones" }, zones.map(function (z) {
            const pct = Math.round(((z.secsInZone || 0) / zoneTotal) * 100);
            return h("div", { className: "gc-zone", key: z.zoneNumber },
              h("span", { className: "gc-zone-name" },
                "区间 " + z.zoneNumber + (z.zoneLowBoundary ? "（≥" + num(z.zoneLowBoundary) + "）" : "")),
              h("span", { className: "gc-zone-bar" },
                h("span", { className: "gc-zone-fill gc-z" + z.zoneNumber, style: { width: pct + "%" } })),
              h("span", { className: "gc-zone-time" }, fmtDuration(z.secsInZone) + " · " + pct + "%"));
          }))
        : h("p", { className: "pmw-plugin-hint" }, "这次活动没有心率区间数据")) : null,
    detail && detail.fetched_at
      ? h("p", { className: "pmw-plugin-hint" }, "数据取自 Garmin：" + String(detail.fetched_at).replace("T", " ").slice(0, 16))
      : null);
}

function ModulePage() {
  const [runs, setRuns] = useState([]);
  const [hint, setHint] = useState("正在加载跑步记录…");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);

  async function load() {
    try {
      const data = await api("/runs");
      const list = Array.isArray(data.runs) ? data.runs : [];
      setRuns(list);
      setHint(list.length ? "" : "还没有跑步记录：先在设置页登录 Garmin，再点「立即同步」。");
    } catch (err) {
      setHint("读取失败：" + String((err && err.message) || err));
    }
  }

  useEffect(function () { load(); }, []);

  async function syncNow() {
    setBusy(true);
    setHint("正在同步 Garmin…");
    try {
      const res = await api("/sync", { method: "POST" });
      setHint("同步完成，写入 " + res.written + " 条。");
      await load();
    } catch (err) {
      setHint("同步失败：" + String((err && err.message) || err));
    } finally {
      setBusy(false);
    }
  }

  if (open) {
    return h(RunDetail, {
      id: open.activity_id, title: open.activity_name, start: open.start_time,
      onBack: function () { setOpen(null); },
    });
  }

  const total = runs.reduce(function (sum, r) { return sum + (r.distance_m || 0); }, 0);
  return h("div", { className: "pmw-plugin pmw-plugin-module" },
    h("header", { className: "pmw-plugin-header" },
      h("h2", null, PLUGIN_NAME),
      h("p", { className: "pmw-plugin-hint" },
        "共 " + runs.length + " 次跑步，累计 " + fmtDistance(total) + "；点一行看详情")),
    hint ? h("p", { className: "pmw-plugin-hint" }, hint) : null,
    h("button", { className: "pmw-plugin-button", type: "button", onClick: syncNow, disabled: busy },
      busy ? "同步中…" : "立即同步"),
    h("div", { className: "gc-scroll" }, h("table", { className: "gc-table" },
      h("thead", null,
        h("tr", null,
          h("th", null, "日期"), h("th", null, "名称"), h("th", null, "距离"), h("th", null, "时长"),
          h("th", null, "配速"), h("th", null, "均心率"))),
      h("tbody", null,
        runs.map(function (r) {
          return h("tr", {
            key: runKey(r), className: "gc-row", tabIndex: 0, role: "button",
            onClick: function () { setOpen(r); },
            onKeyDown: function (e) { if (e.key === "Enter") setOpen(r); },
          },
            h("td", null, String(r.start_time || "").slice(0, 10)),
            h("td", null, r.activity_name || "-"),
            h("td", null, fmtDistance(r.distance_m)),
            h("td", null, fmtDuration(r.duration_s)),
            h("td", null, fmtPace(r.pace_sec_per_km)),
            h("td", null, r.avg_hr ? String(Math.round(r.avg_hr)) : "-"));
        })))));
}

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
        if (alive) setHint("读取失败：" + String((err && err.message) || err));
      });
    return function () { alive = false; };
  }, []);

  return h("div", { className: "pmw-plugin pmw-plugin-card" },
    h("h4", null, "最近一次跑步"),
    run
      ? h("div", null,
          h("p", { className: "gc-card-main" },
            fmtDistance(run.distance_m), " · ", fmtPace(run.pace_sec_per_km)),
          h("p", { className: "pmw-plugin-hint" },
            String(run.start_time || "").slice(0, 16), "　时长 ", fmtDuration(run.duration_s)))
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
      setMsg("读取状态失败：" + String((err && err.message) || err));
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
      setMsg("登录成功，正在同步跑步记录…");
      try {
        const res = await api("/sync", { method: "POST" });
        setMsg("登录成功，已同步 " + res.written + " 条跑步记录。");
      } catch (err) {
        setMsg("登录成功，但首次同步失败：" + String((err && err.message) || err));
      }
      await refresh();
    } catch (err) {
      setPassword("");
      setMsg("登录失败：" + String((err && err.message) || err));
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
      setMsg("退出失败：" + String((err && err.message) || err));
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
            state.last_sync ? ("上次同步 " + String(state.last_sync).replace("T", " ").slice(0, 16)) : "还没有同步过",
            "；每 6 小时自动同步一次。"),
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
  },
});
