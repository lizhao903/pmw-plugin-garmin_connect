// powered by dsh - https://github.com/deepseek-ai/deepseek-harness

/**
 * Garmin 跑步数据 · dsh 插件的浏览器半侧（由 scripts/build.mjs 生成 client.js，不要直接改 client.js）。
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
    const __GC_STYLE = /*__GC_STYLE__*/ ''
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
    /*__GC_ENTRY__*/
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
      const Settings = __gcSlots['settings.section:garmin_connect']
      return __gcH(__gcPage, null,
        __gcH('div', { className: 'gc-dsh-top' },
          __gcH('div', { className: 'gc-dsh-tabs', role: 'tablist' },
            __gcH('button', { type: 'button', role: 'tab', 'aria-selected': tab === 'data', onClick: function () { setTab('data') } }, '跑步数据'),
            __gcH('button', { type: 'button', role: 'tab', 'aria-selected': tab === 'settings', onClick: function () { setTab('settings') } }, '账号与同步'))),
        tab === 'settings'
          ? __gcH('div', { className: 'gc-dsh-settings' }, Settings ? __gcH(Settings) : null)
          : Module ? __gcH(Module) : null)
    }

    function __gcRacesPage() {
      __gcActivatePMW()
      const Races = __gcSlots['module:garmin_connect_races']
      return __gcH(__gcPage, null, Races ? __gcH(Races) : null)
    }

    function __gcRunIcon(props) {
      const size = props.size || 18
      return __gcH('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true,
        style: { display: 'block', color: props.active ? 'var(--dsw-alias-brand-primary)' : 'currentColor' } },
      __gcH('circle', { cx: 14.5, cy: 4.5, r: 2, fill: 'currentColor' }),
      __gcH('path', { d: 'M8 21l3-6 3 2 1 4M6.5 12.5l3-3.5 4 1.5 2.5 3.5 3 .5M10.5 9.5 9 15', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }
    function __gcMedalIcon(props) {
      const size = props.size || 18
      return __gcH('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true,
        style: { display: 'block', color: props.active ? 'var(--dsw-alias-brand-primary)' : 'currentColor' } },
      __gcH('path', { d: 'M8 3l2.5 6M16 3l-2.5 6', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' }),
      __gcH('circle', { cx: 12, cy: 15, r: 5.5, stroke: 'currentColor', strokeWidth: 1.8 }),
      __gcH('path', { d: 'M12 12.5v5M10.5 13.5l1.5-1', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }))
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
          yield ctx.slots.register({ name: 'sidebar.panellist', id: 'garmin-connect-races', order: 31, label: function () { return '比赛' } }, __gcMedalIcon)
        })
        ctx.slots.inject('main', function* () {
          yield ctx.slots.register({ name: 'main', key: 'garmin-connect' }, __gcRunsPage)
          yield ctx.slots.register({ name: 'main', key: 'garmin-connect-races' }, __gcRacesPage)
        })
      },
    }
  },
})
