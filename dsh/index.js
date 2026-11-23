// powered by dsh - https://github.com/deepseek-ai/deepseek-harness

/**
 * Garmin 跑步数据 · DeepSeek Harness（dsh）插件的 Host 半侧。
 *
 * 和 PMW 工作台里的外部插件用同一个 Go 后端二进制：这里扮演 PMW 宿主，
 * 按 pmw-plugin-rpc/1（JSON-RPC 2.0、换行分帧、unix socket / Windows 命名管道）
 * 启动并驱动它，实现它要用的宿主能力：
 *   - host.store.query / exec：本插件私有 sqlite（node:sqlite），启动前按包内 migrations 建表；
 *   - host.secrets.*：Garmin 令牌存 dsh 凭据存储（ctx.credentials 的 grant 记录），没有时落 0600 文件；
 *   - host.http.request：出网请求（不带 Cookie，和 PMW 一致）；
 *   - host.http.chunk / end：大文件（比赛影像）流式回传，这里收齐后整块交给页面；
 *   - host.agent.run：AI 分析走 dsh 的模型（ctx.llm.stream），默认用 dsh 的默认模型。
 *
 * 对外提供：
 *   - 页面 RPC：POST /api/garmin-connect/call（ctx.connection.fetch.register），
 *     浏览器半侧用 ctx.connection.rpc.call 调，把请求原样转给二进制的 plugin.http.request；
 *   - 只读模型工具：garmin_recent_activities / garmin_activity_detail / garmin_training_stats /
 *     garmin_training_calendar / garmin_races，让对话里能直接问跑步数据。
 *
 * 数据目录：$DSH_HOME/cache/garmin-connect/（data.db、media/、bin/、logs/）。
 */

import { spawn, execFileSync } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { appendFileSync, chmodSync, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'garmin-connect'
export const inject = ['tools']

const PKG_DIR = dirname(fileURLToPath(import.meta.url))
const PKG = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8'))
const VERSION = PKG.version
const PLUGIN_ID = 'garmin_connect'
const PROTOCOL = 'pmw-plugin-rpc/1'
const RPC_ENDPOINT = 'garmin-connect/call'
const REPO = 'lizhao903/pmw-plugin-garmin_connect'
const MAX_FRAME = 8 << 20
const CREDENTIAL_KEY = 'garmin-connect/token'

const DEFAULTS = {
  enabled: true,
  // 指定二进制路径时直接用；不填按「仓库 bin/ → 缓存 → 从 GitHub Release 下载」顺序找
  binary: '',
  dataDir: '',
  // AI 分析用的模型；不填用 dsh 的默认模型（设置 → 模型）
  provider: '',
  model: '',
  // 是否从 GitHub Release 自动下载二进制
  autoDownload: true,
  tools: true,
}

const ERR = {
  method_not_found: -32601,
  invalid_params: -32602,
  permission_denied: -32001,
  not_found: -32002,
  validation: -32003,
  unavailable: -32006,
  internal: -32007,
}

function rpcError(code, message) {
  const e = new Error(message)
  e.rpc = { code: ERR[code] ?? ERR.internal, message }
  return e
}

function normalizeConfig(raw) {
  const out = { ...DEFAULTS }
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(DEFAULTS)) if (raw[key] !== undefined) out[key] = raw[key]
  }
  return out
}

// ---------------------------------------------------------------------------
// 日志
// ---------------------------------------------------------------------------

function makeLogger(dir) {
  const file = join(dir, 'logs', 'host.log')
  try { mkdirSync(dirname(file), { recursive: true }) } catch {}
  const write = (level, args) => {
    const line = `${new Date().toISOString()} ${level} ${args.map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`
    try { appendFileSync(file, line, 'utf8') } catch {}
  }
  return {
    file,
    info: (...a) => write('INFO', a),
    warn: (...a) => { write('WARN', a); try { console.warn('[garmin-connect]', ...a) } catch {} },
    raw: (text) => { try { appendFileSync(join(dir, 'logs', 'plugin.log'), text, 'utf8') } catch {} },
  }
}

// ---------------------------------------------------------------------------
// 私有库：node:sqlite + 包内迁移（和 PMW 宿主同一张 _pmw_migrations 表，库文件可以直接互拷）
// ---------------------------------------------------------------------------

async function openStore(dataDir, log) {
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(join(dataDir, 'data.db'))
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
  db.exec(`CREATE TABLE IF NOT EXISTS _pmw_migrations (
    name TEXT PRIMARY KEY, checksum TEXT NOT NULL DEFAULT '', applied_at TEXT NOT NULL)`)
  const dir = join(PKG_DIR, 'migrations')
  const names = readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.sql')).sort()
  for (const n of names) {
    const body = readFileSync(join(dir, n))
    const sum = createHash('sha256').update(body).digest('hex')
    const row = db.prepare('SELECT checksum FROM _pmw_migrations WHERE name = ?').get(n)
    if (row) {
      if (row.checksum && row.checksum !== sum) throw new Error(`迁移 ${n} 应用后被修改（记录 ${row.checksum.slice(0, 8)}，当前 ${sum.slice(0, 8)}）`)
      continue
    }
    if (/\b(ATTACH|DETACH)\b/i.test(body.toString('utf8'))) throw new Error(`迁移 ${n} 不允许 ATTACH/DETACH`)
    db.exec('BEGIN')
    try {
      db.exec(body.toString('utf8'))
      db.prepare('INSERT INTO _pmw_migrations(name, checksum, applied_at) VALUES (?, ?, ?)').run(n, sum, new Date().toISOString())
      db.exec('COMMIT')
      log.info('已应用迁移', n)
    } catch (err) {
      db.exec('ROLLBACK')
      throw new Error(`应用迁移 ${n} 失败：${err.message}`)
    }
  }
  return db
}

const FORBIDDEN = /\b(ATTACH|DETACH|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|VACUUM)\b/i
const DDL = /^\s*(CREATE|DROP|ALTER|PRAGMA)\b/i

function bindArgs(args) {
  if (args === undefined || args === null) return []
  if (!Array.isArray(args)) throw rpcError('invalid_params', 'args 必须是数组')
  return args.map((v) => {
    if (v === null || v === undefined) return null
    if (typeof v === 'boolean') return v ? 1 : 0
    if (typeof v === 'number' || typeof v === 'string' || typeof v === 'bigint') return v
    return JSON.stringify(v)
  })
}

function storeQuery(db, params) {
  const sql = String(params?.sql || '')
  if (!/^\s*(SELECT|WITH|VALUES|EXPLAIN)\b/i.test(sql) || FORBIDDEN.test(sql)) {
    throw rpcError('validation', 'host.store.query 只允许只读查询')
  }
  try {
    const stmt = db.prepare(sql)
    const rows = stmt.all(...bindArgs(params?.args))
    if (rows.length > 10000) throw rpcError('validation', '查询结果超过 10000 行')
    const columns = typeof stmt.columns === 'function' ? stmt.columns().map((c) => c.name) : Object.keys(rows[0] || {})
    return { columns, rows: rows.map((r) => ({ ...r })) }
  } catch (err) {
    if (err.rpc) throw err
    throw rpcError('validation', `查询失败：${err.message}`)
  }
}

function storeExec(db, params) {
  const sql = String(params?.sql || '')
  if (!/^\s*(INSERT|UPDATE|DELETE|REPLACE|WITH)\b/i.test(sql) || FORBIDDEN.test(sql) || DDL.test(sql)) {
    throw rpcError('validation', 'host.store.exec 只允许 INSERT/UPDATE/DELETE/REPLACE')
  }
  try {
    const res = db.prepare(sql).run(...bindArgs(params?.args))
    return { rows_affected: Number(res.changes), last_insert_id: Number(res.lastInsertRowid) }
  } catch (err) {
    throw rpcError('validation', `执行失败：${err.message}`)
  }
}

// ---------------------------------------------------------------------------
// 凭据：优先 dsh 凭据存储（grant 记录），没有该服务时退回 0600 文件
// ---------------------------------------------------------------------------

function makeSecrets(ctx, dataDir) {
  const file = join(dataDir, 'secrets.json')
  const readFile = () => {
    try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return {} }
  }
  const writeFile = (obj) => {
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(obj), { encoding: 'utf8', mode: 0o600 })
    renameSync(tmp, file)
    try { chmodSync(file, 0o600) } catch {}
  }
  const service = () => {
    const c = ctx.get('credentials')
    return c && typeof c.readRecord === 'function' && typeof c.modifyRecord === 'function' ? c : undefined
  }
  return {
    async get(scope) {
      const c = service()
      if (c) {
        const rec = await c.readRecord(CREDENTIAL_KEY)
        const payload = rec && rec.kind === 'grant' ? rec.payload : undefined
        return { value: (payload && typeof payload[scope] === 'string' && payload[scope]) || '' }
      }
      return { value: readFile()[scope] || '' }
    },
    async set(scope, value) {
      const c = service()
      if (c) {
        await c.modifyRecord(CREDENTIAL_KEY, async (cur) => {
          const prev = cur && cur.kind === 'grant' && cur.payload && typeof cur.payload === 'object' ? cur.payload : {}
          return { kind: 'grant', payload: { ...prev, [scope]: String(value) } }
        })
        return { ok: true }
      }
      writeFile({ ...readFile(), [scope]: String(value) })
      return { ok: true }
    },
    async delete(scope) {
      const c = service()
      if (c) {
        await c.modifyRecord(CREDENTIAL_KEY, async (cur) => {
          if (!cur || cur.kind !== 'grant' || !cur.payload) return undefined
          const next = { ...cur.payload }
          delete next[scope]
          return { kind: 'grant', payload: next }
        })
        return { ok: true }
      }
      const obj = readFile()
      delete obj[scope]
      writeFile(obj)
      return { ok: true }
    },
  }
}

// ---------------------------------------------------------------------------
// 出网
// ---------------------------------------------------------------------------

const HTTP_BODY_LIMIT = 32 << 20

async function hostHTTP(params) {
  let target
  try { target = new URL(String(params?.url || '')) } catch { throw rpcError('validation', 'url 不合法') }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') throw rpcError('validation', '只允许 http(s)')
  const method = String(params?.method || 'GET').toUpperCase()
  const headers = {}
  for (const [k, v] of Object.entries(params?.headers || {})) {
    if (['host', 'cookie', 'content-length', 'connection', 'transfer-encoding'].includes(k.toLowerCase())) continue
    headers[k] = String(v)
  }
  const timeout = Math.min(Math.max(Number(params?.timeout_ms) || 30000, 1000), 120000)
  const body = params?.body_b64 ? Buffer.from(params.body_b64, 'base64') : undefined
  let resp
  try {
    resp = await fetch(target, { method, headers, body, redirect: 'follow', signal: AbortSignal.timeout(timeout) })
  } catch (err) {
    throw rpcError('unavailable', `请求失败：${err.cause?.message || err.message}`)
  }
  const buf = Buffer.from(await resp.arrayBuffer())
  if (buf.length > HTTP_BODY_LIMIT) throw rpcError('validation', `响应超过 ${HTTP_BODY_LIMIT} 字节`)
  const outHeaders = {}
  resp.headers.forEach((v, k) => { outHeaders[k.toLowerCase()] = v })
  return { status: resp.status, headers: outHeaders, body_b64: buf.toString('base64') }
}

// ---------------------------------------------------------------------------
// 模型：host.agent.run → ctx.llm.stream
// ---------------------------------------------------------------------------

async function agentRun(ctx, config, params) {
  const llm = ctx.get('llm')
  if (!llm || typeof llm.stream !== 'function') throw rpcError('unavailable', 'dsh 没有挂载模型服务，AI 分析不可用')
  const prompt = String(params?.prompt || '')
  if (!prompt.trim()) throw rpcError('invalid_params', 'host.agent.run 需要 prompt')
  let provider = String(config.provider || '').trim()
  let model = String(config.model || '').trim()
  if (!provider || !model) {
    const sel = ctx.get('agentDefaultModel')?.currentSelection?.()
    provider = provider || sel?.provider || ''
    model = model || sel?.model || ''
  }
  if (!provider || !model) throw rpcError('unavailable', '没有可用的默认模型：在 dsh 设置里选一个默认模型，或在插件配置里填 provider / model')
  const timeout = Math.min(Math.max(Number(params?.timeout_ms) || 120000, 5000), 300000)
  let text = ''
  for await (const chunk of llm.stream({
    provider,
    model,
    system: params?.system ? String(params.system) : undefined,
    messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    signal: AbortSignal.timeout(timeout),
  })) {
    if (chunk.type === 'text-delta') text += chunk.text
    else if (chunk.type === 'finish') {
      const r = chunk.reason
      if (r && typeof r === 'object' && (r.kind === 'error' || r.kind === 'aborted')) {
        throw rpcError('unavailable', `模型调用失败：${r.failure?.message || r.failure?.code || r.kind}`)
      }
    }
  }
  return { result: text.trim(), provider, model }
}

// ---------------------------------------------------------------------------
// 二进制：仓库 bin/（开发）→ 缓存 → GitHub Release 下载（校验 SHA256SUMS）
// ---------------------------------------------------------------------------

function platformTag() {
  const os = { darwin: 'darwin', linux: 'linux', win32: 'windows' }[process.platform]
  const arch = { arm64: 'arm64', x64: 'amd64' }[process.arch]
  if (!os || !arch) throw new Error(`不支持的平台 ${process.platform}-${process.arch}`)
  return { tag: `${os}-${arch}`, exe: os === 'windows' ? '.exe' : '' }
}

async function download(url, file) {
  const resp = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(300000) })
  if (!resp.ok) throw new Error(`下载 ${url} 失败：HTTP ${resp.status}`)
  const buf = Buffer.from(await resp.arrayBuffer())
  writeFileSync(file, buf)
  return buf
}

async function resolveBinary(config, dataDir, log) {
  const { tag, exe } = platformTag()
  const fileName = `${PLUGIN_ID}-${tag}${exe}`
  if (config.binary) {
    if (!existsSync(config.binary)) throw new Error(`配置的二进制不存在：${config.binary}`)
    return config.binary
  }
  // 开发：dsh/ 在插件仓库里，make build 产物在 ../bin/
  const dev = join(PKG_DIR, '..', 'bin', fileName)
  if (existsSync(dev)) return dev
  const cacheDir = join(dataDir, 'bin', VERSION)
  const cached = join(cacheDir, fileName)
  if (existsSync(cached)) return cached
  if (!config.autoDownload) throw new Error(`找不到 ${fileName}：在插件配置里填 binary，或开启 autoDownload`)
  mkdirSync(cacheDir, { recursive: true })
  const base = `https://github.com/${REPO}/releases/download/v${VERSION}`
  const asset = `${PLUGIN_ID}-${VERSION}-${tag}.tar.gz`
  log.info('下载插件二进制', `${base}/${asset}`)
  const work = join(cacheDir, `.dl-${randomBytes(4).toString('hex')}`)
  mkdirSync(work, { recursive: true })
  try {
    const sums = (await download(`${base}/SHA256SUMS`, join(work, 'SHA256SUMS'))).toString('utf8')
    const want = sums.split('\n').map((l) => l.trim().split(/\s+/)).find((p) => p[1] === asset)?.[0]
    if (!want) throw new Error(`SHA256SUMS 里没有 ${asset}`)
    const archive = join(work, asset)
    const buf = await download(`${base}/${asset}`, archive)
    const got = createHash('sha256').update(buf).digest('hex')
    if (got !== want.toLowerCase()) throw new Error(`${asset} 校验失败（期望 ${want.slice(0, 12)}，实际 ${got.slice(0, 12)}）`)
    execFileSync('tar', ['-xzf', archive, '-C', work, `bin/${fileName}`])
    renameSync(join(work, 'bin', fileName), cached)
    if (!exe) chmodSync(cached, 0o755)
    return cached
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// 插件进程与 JSON-RPC
// ---------------------------------------------------------------------------

class PluginProcess {
  constructor({ ctx, config, dataDir, db, secrets, log }) {
    Object.assign(this, { ctx, config, dataDir, db, secrets, log })
    this.pending = new Map()
    this.streams = new Map()
    this.nextId = 1
    this.ready = null
    this.stopped = false
    this.lastError = ''
  }

  async start() {
    const bin = await resolveBinary(this.config, this.dataDir, this.log)
    const token = randomBytes(16).toString('hex')
    const sock = process.platform === 'win32'
      ? `\\\\.\\pipe\\garmin-connect-dsh-${process.pid}-${randomBytes(3).toString('hex')}`
      : join(tmpdir(), `gc-dsh-${process.pid}-${randomBytes(3).toString('hex')}.sock`)
    let helloResolve, helloReject
    const hello = new Promise((resolve, reject) => { helloResolve = resolve; helloReject = reject })
    this.server = createServer((socket) => {
      if (this.socket) { socket.destroy(); return }
      this.socket = socket
      let buf = Buffer.alloc(0)
      socket.on('data', (data) => {
        buf = Buffer.concat([buf, data])
        let at
        while ((at = buf.indexOf(10)) >= 0) {
          const line = buf.subarray(0, at).toString('utf8').trim()
          buf = buf.subarray(at + 1)
          if (line) this.onFrame(line, token, helloResolve)
        }
        if (buf.length > MAX_FRAME) { this.log.warn('收到超过单帧上限的消息，断开'); socket.destroy() }
      })
      socket.on('close', () => { this.socket = null; this.failAll('插件连接断开') })
      socket.on('error', (err) => this.log.warn('插件连接错误', err))
    })
    await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(sock, resolve) })
    this.sockPath = sock
    const media = join(this.dataDir, 'media')
    mkdirSync(media, { recursive: true })
    mkdirSync(join(this.dataDir, 'plugin-cache'), { recursive: true })
    this.child = spawn(bin, [], {
      cwd: this.dataDir,
      env: {
        ...process.env,
        PMW_PLUGIN_ID: PLUGIN_ID,
        PMW_PLUGIN_VERSION: VERSION,
        PMW_PLUGIN_API_VERSION: '2.0.0',
        PMW_PLUGIN_SOCKET: sock,
        PMW_PLUGIN_TOKEN: token,
        PMW_PLUGIN_DATA_DIR: this.dataDir,
        PMW_PLUGIN_CACHE_DIR: join(this.dataDir, 'plugin-cache'),
        PMW_PLUGIN_LOG_LEVEL: 'info',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    this.child.stdout.on('data', (d) => this.log.raw(d.toString('utf8')))
    this.child.stderr.on('data', (d) => this.log.raw(d.toString('utf8')))
    this.child.on('exit', (code, signal) => {
      this.log.info('插件进程退出', { code, signal })
      this.child = null
      if (!this.stopped) this.lastError = `插件进程意外退出（${signal || code}），查看 ${join(this.dataDir, 'logs', 'plugin.log')}`
      helloReject(new Error(this.lastError || '插件进程退出'))
      this.failAll('插件进程已退出')
    })
    const timer = setTimeout(() => helloReject(new Error('插件 10 秒内没有握手')), 10000)
    try { await hello } finally { clearTimeout(timer) }
    await this.call('plugin.activate', {}, 15000)
    this.log.info('插件已启动', { bin, version: VERSION })
  }

  async stop() {
    this.stopped = true
    try { if (this.socket) await this.call('plugin.deactivate', {}, 3000) } catch {}
    const child = this.child
    if (child) {
      await new Promise((resolve) => {
        const t = setTimeout(() => { try { child.kill('SIGKILL') } catch {} resolve() }, 3000)
        child.once('exit', () => { clearTimeout(t); resolve() })
        try { child.kill('SIGTERM') } catch { resolve() }
      })
    }
    try { this.socket?.destroy() } catch {}
    try { this.server?.close() } catch {}
    if (this.sockPath && process.platform !== 'win32') rmSync(this.sockPath, { force: true })
  }

  write(obj) {
    const frame = JSON.stringify(obj)
    if (Buffer.byteLength(frame) + 1 > MAX_FRAME) throw new Error('消息超过单帧上限')
    if (!this.socket) throw rpcError('unavailable', '插件未连接')
    this.socket.write(frame + '\n')
  }

  call(method, params, timeoutMs = 65000) {
    const id = `dsh-${this.nextId++}`
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(rpcError('unavailable', `调用 ${method} 超时`)) }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.write({ jsonrpc: '2.0', id, method, params })
      } catch (err) {
        clearTimeout(timer); this.pending.delete(id); reject(err)
      }
    })
  }

  failAll(message) {
    for (const [id, p] of this.pending) { clearTimeout(p.timer); p.reject(rpcError('unavailable', message)); this.pending.delete(id) }
    for (const [id, s] of this.streams) { s.reject(new Error(message)); this.streams.delete(id) }
  }

  onFrame(line, token, helloResolve) {
    let msg
    try { msg = JSON.parse(line) } catch { this.log.warn('收到无法解析的帧'); return }
    if (!msg.method) {
      const p = this.pending.get(String(msg.id))
      if (!p) return
      clearTimeout(p.timer); this.pending.delete(String(msg.id))
      if (msg.error) { const e = new Error(msg.error.message || 'RPC 错误'); e.rpc = msg.error; p.reject(e) } else p.resolve(msg.result)
      return
    }
    const reply = (result, error) => {
      if (msg.id === undefined || msg.id === null) return
      try { this.write(error ? { jsonrpc: '2.0', id: msg.id, error } : { jsonrpc: '2.0', id: msg.id, result: result ?? {} }) } catch (err) { this.log.warn('回写失败', err) }
    }
    Promise.resolve()
      .then(() => this.handle(msg.method, msg.params || {}, token, helloResolve))
      .then((r) => reply(r), (err) => reply(null, err.rpc || { code: ERR.internal, message: err.message }))
  }

  async handle(method, p, token, helloResolve) {
    switch (method) {
      case 'plugin.hello':
        if (p.token !== token) throw rpcError('permission_denied', 'token 不匹配')
        helloResolve()
        return { protocol: PROTOCOL, plugin: { id: PLUGIN_ID }, host: { name: 'dsh', version: VERSION } }
      case 'host.store.query': return storeQuery(this.db, p)
      case 'host.store.exec': return storeExec(this.db, p)
      case 'host.secrets.get': return this.secrets.get(String(p.scope || PLUGIN_ID))
      case 'host.secrets.set': return this.secrets.set(String(p.scope || PLUGIN_ID), p.value)
      case 'host.secrets.delete': return this.secrets.delete(String(p.scope || PLUGIN_ID))
      case 'host.http.request': return hostHTTP(p)
      case 'host.agent.run': return agentRun(this.ctx, this.config, p)
      case 'host.http.chunk': {
        const s = this.streams.get(String(p.request_id))
        if (!s) throw rpcError('not_found', '没有这个流')
        const data = Buffer.from(String(p.data_b64 || ''), 'base64')
        s.size += data.length
        if (s.size > s.limit) { this.streams.delete(String(p.request_id)); s.reject(new Error('文件太大，dsh 页面里放不下（上限 200 MB）')); throw rpcError('validation', '超过上限') }
        s.chunks.set(Number(p.seq), data)
        s.check()
        return { ok: true }
      }
      case 'host.http.end': {
        const s = this.streams.get(String(p.request_id))
        if (!s) return { ok: true }
        s.total = Number(p.seq)
        s.check()
        return { ok: true }
      }
      default:
        throw rpcError('method_not_found', `dsh 宿主未实现方法 ${method}`)
    }
  }

  /** 转发一次页面 / 工具请求给插件后端；流式响应收齐后整块返回。 */
  async request({ method = 'GET', path = '/', query = '', headers = {}, bodyB64 = '' }) {
    if (!this.socket) throw rpcError('unavailable', this.lastError || '插件还没启动好')
    const requestId = randomUUID()
    let streamPromise
    const stream = { chunks: new Map(), total: -1, size: 0, limit: 200 << 20 }
    streamPromise = new Promise((resolve, reject) => {
      stream.resolve = resolve
      stream.reject = reject
      stream.check = () => {
        if (stream.total < 0 || stream.chunks.size < stream.total) return
        const parts = []
        for (let i = 0; i < stream.total; i++) parts.push(stream.chunks.get(i) || Buffer.alloc(0))
        this.streams.delete(requestId)
        resolve(Buffer.concat(parts))
      }
    })
    streamPromise.catch(() => {})
    this.streams.set(requestId, stream)
    let res
    try {
      res = await this.call('plugin.http.request', {
        request_id: requestId, method, path, query, headers, body_b64: bodyB64,
      }, 65000)
    } catch (err) {
      this.streams.delete(requestId)
      throw err
    }
    if (!res || !res.stream) {
      this.streams.delete(requestId)
      return { status: res?.status ?? 500, headers: res?.headers || {}, body_b64: res?.body_b64 || '' }
    }
    const timer = setTimeout(() => stream.reject(new Error('文件传输超时')), 300000)
    try {
      const body = await streamPromise
      return { status: res.status, headers: res.headers || {}, body_b64: body.toString('base64') }
    } finally { clearTimeout(timer) }
  }

  async json(method, path, query = '') {
    const r = await this.request({ method, path, query })
    const text = Buffer.from(r.body_b64 || '', 'base64').toString('utf8')
    let data
    try { data = JSON.parse(text) } catch { data = { error: text } }
    if (r.status >= 400) throw new Error(data?.error || `HTTP ${r.status}`)
    return data
  }
}

// ---------------------------------------------------------------------------
// 模型工具（只读）
// ---------------------------------------------------------------------------

const fmtDist = (m) => (m == null ? '-' : `${(Number(m) / 1000).toFixed(2)} km`)
const fmtDur = (s) => {
  if (s == null) return '-'
  s = Math.round(Number(s))
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const ss = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`
}
const fmtPace = (sec) => (sec ? `${Math.floor(sec / 60)}'${String(Math.round(sec % 60)).padStart(2, '0')}"/km` : '-')
const dateArg = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)

function registerTools(ctx, getProc) {
  const proc = () => {
    const p = getProc()
    if (!p || !p.socket) throw new Error('Garmin 插件还没启动好（或启动失败），稍后再试；可在侧栏「Garmin 跑步」页面查看状态')
    return p
  }
  const text = (t) => [{ type: 'text', text: t }]
  const tools = [
    {
      name: 'garmin_recent_activities',
      description: '读取用户从 Garmin Connect 同步的运动记录（跑步、跑步机、力量训练等），按时间倒序。可按日期范围和类型过滤。只读。',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: '开始日期 YYYY-MM-DD（含）' },
          to: { type: 'string', description: '结束日期 YYYY-MM-DD（含）' },
          kind: { type: 'string', enum: ['all', 'outdoor', 'indoor', 'strength'], description: '类型：all 全部（默认）、outdoor 室外跑、indoor 室内跑/跑步机、strength 力量训练' },
          limit: { type: 'number', description: '最多返回几条，默认 20，最多 200' },
        },
        additionalProperties: false,
      },
      run: async (a) => {
        const p = proc()
        const where = []; const args = []
        if (dateArg(a.from)) { where.push('substr(start_time,1,10) >= ?'); args.push(a.from) }
        if (dateArg(a.to)) { where.push('substr(start_time,1,10) <= ?'); args.push(a.to) }
        const indoor = "('treadmill_running','indoor_running','virtual_run')"
        if (a.kind === 'indoor') where.push(`type_key IN ${indoor}`)
        else if (a.kind === 'outdoor') where.push(`COALESCE(type_key,'') NOT IN ${indoor} AND COALESCE(type_key,'') NOT LIKE '%strength%'`)
        else if (a.kind === 'strength') where.push("COALESCE(type_key,'') LIKE '%strength%'")
        const limit = Math.min(Math.max(Number(a.limit) || 20, 1), 200)
        const rows = storeQuery(p.db, {
          sql: `SELECT activity_id, start_time, activity_name, type_key, COALESCE(corrected_distance_m, distance_m) AS distance_m,
            duration_s, pace_sec_per_km, avg_hr, max_hr, cadence, elevation_m, calories
            FROM runs ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY start_time DESC LIMIT ${limit}`,
          args,
        }).rows
        return { count: rows.length, activities: rows }
      },
      render: (v) => text(v.count
        ? `共 ${v.count} 条：\n` + v.activities.map((r) => `- ${String(r.start_time).slice(0, 16).replace('T', ' ')} ${r.activity_name || ''}（${r.type_key || '-'}，id ${r.activity_id}）${fmtDist(r.distance_m)} · ${fmtDur(r.duration_s)} · 配速 ${fmtPace(r.pace_sec_per_km)} · 平均心率 ${r.avg_hr || '-'}`).join('\n')
        : '没有符合条件的记录（可能还没登录 Garmin 或还没同步）。'),
    },
    {
      name: 'garmin_activity_detail',
      description: '读取单次 Garmin 活动的详情摘要：分段（含热身/训练/舒缓/休息归类）、心率、配速、步频、海拔、训练效果，以及已有的 AI 分析。activity_id 来自 garmin_recent_activities。只读。',
      parameters: {
        type: 'object',
        properties: { activity_id: { type: 'string', description: 'Garmin 活动 id（纯数字）' } },
        required: ['activity_id'],
        additionalProperties: false,
      },
      run: async (a) => {
        const p = proc()
        const id = String(a.activity_id || '').trim()
        if (!/^\d{1,20}$/.test(id)) throw new Error('activity_id 应为纯数字')
        const d = await p.json('GET', `/runs/${id}`)
        // 时序数据太长不给模型，只留摘要和分段
        const omit = new Set(['series', 'samples', 'points', 'track', 'polyline', 'hr_series', 'metrics'])
        const slim = (o, depth = 0) => {
          if (Array.isArray(o)) return o.length > 60 ? `[${o.length} 项已省略]` : o.map((x) => slim(x, depth + 1))
          if (o && typeof o === 'object') {
            const out = {}
            for (const [k, v] of Object.entries(o)) if (!omit.has(k)) out[k] = depth > 4 ? '…' : slim(v, depth + 1)
            return out
          }
          return o
        }
        let analysis
        try { analysis = (await p.json('GET', `/runs/${id}/analysis`))?.content } catch {}
        return { activity_id: id, detail: slim(d), analysis: analysis || null }
      },
      render: (v) => text(JSON.stringify(v, null, 1).slice(0, 24000)),
    },
    {
      name: 'garmin_training_stats',
      description: '按周 / 月 / 年汇总 Garmin 运动数据（次数、距离、时长、心率加权平均、最长一次、累计爬升），可选室外 / 室内 / 汇总 / 力量。用于回答「这周跑了多少」「今年每月跑量」之类的问题。只读。',
      parameters: {
        type: 'object',
        properties: {
          period: { type: 'string', enum: ['week', 'month', 'year'], description: '统计周期，默认 week（周一为一周开始）' },
          kind: { type: 'string', enum: ['all', 'outdoor', 'indoor', 'strength'], description: '默认 all（跑步汇总，不含力量）' },
          limit: { type: 'number', description: '返回最近几个周期，默认 8' },
        },
        additionalProperties: false,
      },
      run: async (a) => {
        const p = proc()
        const period = ['week', 'month', 'year'].includes(a.period) ? a.period : 'week'
        const kind = ['all', 'outdoor', 'indoor', 'strength'].includes(a.kind) ? a.kind : 'all'
        const d = await p.json('GET', '/stats', `period=${period}&kind=${kind}`)
        const limit = Math.min(Math.max(Number(a.limit) || 8, 1), 60)
        const buckets = (d.buckets || []).slice(-limit).map((b) => ({
          ...b,
          avg_hr: b.avg_hr ? Math.round(b.avg_hr) : null,
        }))
        return { period, kind, buckets }
      },
      render: (v) => text(v.buckets.length
        ? `${{ week: '每周', month: '每月', year: '每年' }[v.period]}（${v.kind}）：\n` + v.buckets.map((b) => `- ${b.bucket}：${b.runs} 次 · ${fmtDist(b.distance_m)} · ${fmtDur(b.duration_s)} · 平均心率 ${b.avg_hr || '-'} · 最长 ${fmtDist(b.longest_m)} · 爬升 ${Math.round(b.elevation_m || 0)} m`).join('\n')
        : '这个范围没有数据。'),
    },
    {
      name: 'garmin_training_calendar',
      description: '读取训练日历：某段日期里安排的训练（来自训练计划或手动添加，含类型、内容、视频链接、是否完成），以及同期实际完成的活动。用于回答「这周还有什么训练」「计划完成得怎样」。只读。',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: '开始日期 YYYY-MM-DD，默认今天' },
          to: { type: 'string', description: '结束日期 YYYY-MM-DD，默认开始日期后 7 天' },
        },
        additionalProperties: false,
      },
      run: async (a) => {
        const p = proc()
        const today = new Date()
        const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        const from = dateArg(a.from) || ymd(today)
        const to = dateArg(a.to) || ymd(new Date(new Date(from + 'T00:00:00').getTime() + 7 * 86400000))
        const d = await p.json('GET', '/calendar', `from=${from}&to=${to}`)
        return { from, to, items: d.items || [], activities: d.activities || [] }
      },
      render: (v) => text(`${v.from} ~ ${v.to}\n安排（${v.items.length}）：\n` +
        (v.items.map((i) => `- ${i.date} [${i.kind}] ${i.title}${i.done ? '（已完成）' : ''}${i.plan_name ? ` · 计划「${i.plan_name}」` : ''}${i.detail ? `：${i.detail}` : ''}${i.video ? ` · 视频 ${i.video}` : ''}`).join('\n') || '- 无') +
        `\n实际活动（${v.activities.length}）：\n` +
        (v.activities.map((r) => `- ${String(r.start_time).slice(0, 10)} ${r.activity_name || r.type_key} ${fmtDist(r.distance_m)} · ${fmtDur(r.duration_s)}`).join('\n') || '- 无')),
    },
    {
      name: 'garmin_races',
      description: '读取用户收录的比赛：名称、日期、城市、类别、净计时和枪声成绩、排名、影像数量，以及各类别的个人最好成绩（优先按净计时）。只读。',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      run: async () => {
        const p = proc()
        const d = await p.json('GET', '/races')
        return { races: d.races || [] }
      },
      render: (v) => {
        if (!v.races.length) return text('还没有收录比赛。')
        const best = {}
        for (const r of v.races) {
          const t = r.net_s || r.official_s
          if (r.status === 'finished' && t && (!best[r.category] || t < best[r.category].t)) best[r.category] = { t, r }
        }
        return text(`共 ${v.races.length} 场：\n` + v.races.map((r) => `- ${r.date} ${r.name}（${r.city || '-'}，${r.category}，${r.status}）净计时 ${r.net_s ? fmtDur(r.net_s) : '-'} · 枪声 ${r.official_s ? fmtDur(r.official_s) : '-'}${r.rank_overall ? ` · 总排名 ${r.rank_overall}` : ''}`).join('\n') +
          '\n个人最好：\n' + Object.entries(best).map(([c, b]) => `- ${c}：${fmtDur(b.t)}（${b.r.name} ${b.r.date}）`).join('\n'))
      },
    },
  ]
  for (const t of tools) {
    ctx.tools.register({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      output: { schema: { type: 'object' }, render: (_args, value) => t.render(value) },
      async execute(args) { return t.run(args || {}) },
    })
  }
}

// ---------------------------------------------------------------------------
// 页面 RPC
// ---------------------------------------------------------------------------

function registerPanelRpc(ctx, getProc, getStatus, log) {
  const register = (scopeCtx) => {
    const connection = (scopeCtx && scopeCtx.connection) || ctx.get('connection')
    if (!connection?.fetch?.register) { log.warn('connection.fetch 不可用，页面 RPC 未注册'); return }
    const effectCtx = scopeCtx && typeof scopeCtx.effect === 'function' ? scopeCtx : ctx
    effectCtx.effect(() => {
      const dispose = connection.fetch.register({
        path: `/api/${RPC_ENDPOINT}`,
        methods: ['POST'],
        requestBody: 'buffered',
        async fetch(request) {
          let body
          try { body = await request.json() } catch { return new Response('body is not JSON', { status: 400 }) }
          const rpcId = typeof body?.rpcId === 'string' ? body.rpcId : 'invalid-request'
          const respond = (result) => Response.json({ type: 'server-response', rpcId, result })
          if (!body || body.type !== 'client-request' || body.method !== RPC_ENDPOINT || !body.payload) {
            return respond({ ok: false, error: { code: 'gateway/bad-request', message: 'Invalid Garmin request.' } })
          }
          const pl = body.payload
          try {
            if (pl.op === 'status') return respond({ ok: true, value: getStatus() })
            const p = getProc()
            if (!p || !p.socket) return respond({ ok: true, value: { status: 503, headers: { 'content-type': 'application/json' }, body_b64: Buffer.from(JSON.stringify({ error: getStatus().error || 'Garmin 插件还没启动好' })).toString('base64') } })
            const value = await p.request({
              method: String(pl.method || 'GET').toUpperCase(),
              path: String(pl.path || '/'),
              query: String(pl.query || ''),
              headers: pl.headers && typeof pl.headers === 'object' ? pl.headers : {},
              bodyB64: typeof pl.body_b64 === 'string' ? pl.body_b64 : '',
            })
            return respond({ ok: true, value })
          } catch (err) {
            return respond({ ok: false, error: { code: 'garmin/failed', message: err.message } })
          }
        },
      })
      log.info('页面 RPC 已注册', `/api/${RPC_ENDPOINT}`)
      return () => { try { dispose?.() } catch {} }
    }, 'garmin-connect: panel RPC')
  }
  try {
    const pending = ctx.inject(['connection'], register)
    pending?.catch?.((err) => log.warn('等待 connection 服务失败', err))
  } catch (err) {
    log.warn('注入 connection 失败', err)
    register(ctx)
  }
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

export function apply(ctx, rawConfig) {
  const config = normalizeConfig(rawConfig)
  if (!config.enabled) return
  const dataDir = config.dataDir || join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'cache', 'garmin-connect')
  mkdirSync(dataDir, { recursive: true })
  const log = makeLogger(dataDir)
  let proc = null
  let db = null
  const status = { state: 'starting', error: '', version: VERSION, dataDir }
  const getStatus = () => ({ ...status, error: status.error || proc?.lastError || '' })

  registerPanelRpc(ctx, () => proc, getStatus, log)
  if (config.tools) registerTools(ctx, () => proc)

  ctx.effect(() => {
    let disposed = false
    ;(async () => {
      try {
        db = await openStore(dataDir, log)
        const p = new PluginProcess({ ctx, config, dataDir, db, secrets: makeSecrets(ctx, dataDir), log })
        proc = p
        await p.start()
        if (disposed) { await p.stop(); return }
        status.state = 'running'
      } catch (err) {
        status.state = 'failed'
        status.error = err.message
        log.warn('启动失败', err)
      }
    })()
    return () => {
      disposed = true
      const p = proc
      proc = null
      status.state = 'stopped'
      Promise.resolve(p?.stop()).catch(() => {}).finally(() => { try { db?.close() } catch {} db = null })
    }
  }, 'garmin-connect: plugin process')
}
