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

function ModulePage() {
  const [runs, setRuns] = useState([]);
  const [hint, setHint] = useState("正在加载跑步记录…");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const data = await api("/runs");
      const list = Array.isArray(data.runs) ? data.runs : [];
      setRuns(list);
      setHint(list.length ? "" : "还没有跑步记录，去设置页配置 token 后同步。");
    } catch (err) {
      setHint("读取失败：" + String((err && err.message) || err));
    }
  }

  useEffect(function () {
    let alive = true;
    api("/runs")
      .then(function (data) {
        if (!alive) return;
        const list = Array.isArray(data.runs) ? data.runs : [];
        setRuns(list);
        setHint(list.length ? "" : "还没有跑步记录，去设置页配置 token 后同步。");
      })
      .catch(function (err) {
        if (alive) setHint("读取失败：" + String((err && err.message) || err));
      });
    return function () { alive = false; };
  }, []);

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

  const total = runs.reduce(function (sum, r) { return sum + (r.distance_m || 0); }, 0);
  return h("div", { className: "pmw-plugin pmw-plugin-module" },
    h("header", { className: "pmw-plugin-header" },
      h("h2", null, PLUGIN_NAME),
      h("p", { className: "pmw-plugin-hint" },
        "共 " + runs.length + " 次跑步，累计 " + fmtDistance(total))),
    hint ? h("p", { className: "pmw-plugin-hint" }, hint) : null,
    h("button", { className: "pmw-plugin-button", type: "button", onClick: syncNow, disabled: busy },
      busy ? "同步中…" : "立即同步"),
    h("table", { className: "gc-table" },
      h("thead", null,
        h("tr", null,
          h("th", null, "日期"), h("th", null, "距离"), h("th", null, "时长"),
          h("th", null, "配速"), h("th", null, "均心率"))),
      h("tbody", null,
        runs.map(function (r) {
          return h("tr", { key: runKey(r) },
            h("td", null, String(r.start_time || "").slice(0, 10)),
            h("td", null, fmtDistance(r.distance_m)),
            h("td", null, fmtDuration(r.duration_s)),
            h("td", null, fmtPace(r.pace_sec_per_km)),
            h("td", null, r.avg_hr ? String(Math.round(r.avg_hr)) : "-"));
        }))));
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
          setHint("暂无跑步记录");
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
  const [refreshToken, setRefreshToken] = useState("");
  const [clientID, setClientID] = useState("");
  const [isCN, setIsCN] = useState(true);
  const [status, setStatus] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(function () {
    let alive = true;
    api("/status")
      .then(function (data) {
        if (!alive) return;
        setSaved(Boolean(data.configured));
        setStatus(data.last_sync ? ("上次同步 " + data.last_sync) : "尚未同步");
      })
      .catch(function () {});
    return function () { alive = false; };
  }, []);

  async function save() {
    setStatus("保存中…");
    try {
      await api("/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refresh_token: refreshToken.trim(),
          client_id: clientID.trim(),
          is_cn: isCN,
        }),
      });
      setSaved(true);
      setStatus("已保存 token，点击「立即同步」拉取数据");
      setRefreshToken("");
    } catch (err) {
      setStatus("保存失败：" + String((err && err.message) || err));
    }
  }

  return h("section", { className: "pmw-plugin pmw-plugin-settings" },
    h("h3", null, PLUGIN_NAME + " 设置"),
    h("p", { className: "pmw-plugin-hint" },
      saved ? "token 已配置" : "从 Garmin 登录脚本导出的 token 中获取 refresh_token 后填入"),
    h("label", { className: "gc-field" },
      "refresh_token",
      h("input", {
        type: "password", value: refreshToken,
        placeholder: "粘贴 refresh_token",
        onChange: function (e) { setRefreshToken(e.target.value); },
      })),
    h("label", { className: "gc-field" },
      "client_id（可选）",
      h("input", {
        type: "text", value: clientID,
        placeholder: "GARMIN_CONNECT_MOBILE_ANDROID_DI_2025Q2",
        onChange: function (e) { setClientID(e.target.value); },
      })),
    h("label", { className: "pmw-plugin-check" },
      h("input", { type: "checkbox", checked: isCN,
        onChange: function (e) { setIsCN(e.target.checked); } }),
      " 中国区账号（connect.garmin.cn）"),
    h("button", { className: "pmw-plugin-button", type: "button", onClick: save }, "保存 token"),
    status ? h("p", { className: "pmw-plugin-hint" }, status) : null);
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
