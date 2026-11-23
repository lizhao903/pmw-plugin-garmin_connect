// powered by dsh - https://github.com/deepseek-ai/deepseek-harness

/**
 * 生成 dsh 插件包里的派生文件（都要提交，github: 安装不跑构建）：
 *   - client.js：把 ../web/entry.js 和 ../web/style.css 嵌进 src/client.template.js；
 *   - migrations/：从 ../migrations 原样复制（文件内容决定 checksum，不能改）；
 *   - icon.svg：从 ../assets/icon.svg 复制；
 *   - package.json 的 version 跟 ../plugin.json 同步（Host 半侧按它下载同版本的 Go 二进制）。
 * 用法：node dsh/scripts/build.mjs（或 make dsh）；--check 只校验派生文件是否最新。
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DSH = join(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = join(DSH, '..')
const check = process.argv.includes('--check')
const outputs = new Map()

function replaceOnce(src, from, to, label) {
  const n = src.split(from).length - 1
  if (n !== 1) throw new Error(`替换「${label}」应命中 1 处，实际 ${n} 处：web/entry.js 改过了，更新 dsh/scripts/build.mjs`)
  return src.replace(from, () => to)
}

// ---- client.js ----
let entry = readFileSync(join(ROOT, 'web', 'entry.js'), 'utf8')
entry = entry.replace(/^\/\/ powered by dsh[^\n]*\n/, '')
entry = replaceOnce(entry,
  'import { Component, createElement as h, useEffect, useRef, useState } from "react";',
  'const { Component, createElement: h, useEffect, useRef, useState } = React;', 'react import')
entry = replaceOnce(entry,
  'const API_BASE = "/api/plugins/external/" + PLUGIN_ID + "/api";',
  'const API_BASE = __GC_BASE;', 'API_BASE')
entry = replaceOnce(entry, 'window.__PMW_PLUGIN__.register(', '__GC_PMW.register(', 'register')
if (/^\s*(import|export)\s/m.test(entry)) throw new Error('web/entry.js 还有 import/export，嵌入前要处理')
// 模板和 entry.js 在同一个函数作用域：模板自己的顶层名字一律 __gc 前缀，这里兜底查同名（函数声明会提升覆盖）
{
  const tpl = readFileSync(join(DSH, 'src', 'client.template.js'), 'utf8')
  // entry.js 的顶层在第 0 列，模板工厂函数体的顶层缩进 4 格
  const names = (src, indent) => new Set([...src.matchAll(new RegExp(`^${indent}(?:async\\s+)?(?:function\\*?|const|let|class)\\s+([A-Za-z_$][\\w$]*)`, 'gm'))].map((m) => m[1]))
  const entryNames = names(entry, '')
  const clash = [...names(tpl, ' {4}')].filter((n) => entryNames.has(n))
  if (clash.length) throw new Error('client.template.js 和 web/entry.js 有同名顶层声明：' + clash.join(', '))
}

// 宿主相关的文案：PMW 工作台 → dsh
const TEXTS = [
  ['先在设置页登录 Garmin，再点', '先在「账号与同步」里登录 Garmin，再点'],
  ['暂无跑步记录，先在设置页登录 Garmin', '暂无跑步记录，先在「账号与同步」里登录 Garmin'],
  ['会把这次的数据和最近 4 周训练量发给工作台配置的模型服务商', '会把这次的数据和最近 4 周训练量发给 dsh 当前的默认模型（设置 → 模型）'],
  ['文件保存在本机工作台的插件数据目录。', '文件保存在本机 dsh 的插件数据目录（~/.dsh/cache/garmin-connect）；dsh 页面里查看单个文件最大 200 MB。'],
  ['令牌加密存在工作台的凭证保险箱里。', '令牌存在 dsh 的凭据存储里。'],
  ['需要先在「设置 → 插件 → 外部插件」给本插件授予 network:any；开了两步验证的账号暂不支持。', '开了两步验证的账号暂不支持。'],
]
for (const [from, to] of TEXTS) entry = replaceOnce(entry, from, to, from.slice(0, 16))
// AI 分析：dsh 版不选 PMW 的 Agent，直接用 dsh 默认模型，去掉「使用的 Agent」输入框
entry = entry.replace(
  /h\("label", \{ className: "gc-inline", title: "默认用「跑步数据分析」Agent[^\n]*\n[^\n]*"使用的 Agent",\n[^\n]*setAgentName\(e\.target\.value\); \} \}\)\),\n/,
  'null,\n')
if (entry.includes('"使用的 Agent"')) throw new Error('没去掉「使用的 Agent」输入框：web/entry.js 改过了，更新 dsh/scripts/build.mjs')
entry = replaceOnce(entry, 'const DEFAULT_AGENT = "跑步数据分析";', 'const DEFAULT_AGENT = "";', 'DEFAULT_AGENT')
entry = replaceOnce(entry, 'return v === null ? DEFAULT_AGENT : v;', 'return DEFAULT_AGENT;', 'loadAgent')

const style = readFileSync(join(ROOT, 'web', 'style.css'), 'utf8')
let client = readFileSync(join(DSH, 'src', 'client.template.js'), 'utf8')
client = replaceOnce(client, "/*__GC_STYLE__*/ ''", JSON.stringify(style), 'style 占位')
client = replaceOnce(client, '/*__GC_ENTRY__*/', entry.split('\n').map((l) => (l ? '    ' + l : l)).join('\n'), 'entry 占位')
client = client.replace('由 scripts/build.mjs 生成 client.js，不要直接改 client.js', '本文件由 dsh/scripts/build.mjs 从 src/client.template.js + ../web/entry.js 生成，不要直接改')
outputs.set(join(DSH, 'client.js'), client)

// ---- migrations / icon ----
const migSrc = join(ROOT, 'migrations')
const migNames = readdirSync(migSrc).filter((n) => n.endsWith('.sql')).sort()
for (const n of migNames) outputs.set(join(DSH, 'migrations', n), readFileSync(join(migSrc, n), 'utf8'))
outputs.set(join(DSH, 'icon.svg'), readFileSync(join(ROOT, 'assets', 'icon.svg'), 'utf8'))

// ---- package.json version ----
const version = JSON.parse(readFileSync(join(ROOT, 'plugin.json'), 'utf8')).version
const pkgPath = join(DSH, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
pkg.version = version
outputs.set(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

let stale = []
for (const [file, content] of outputs) {
  const cur = existsSync(file) ? readFileSync(file, 'utf8') : null
  if (cur === content) continue
  if (check) { stale.push(file); continue }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
}
// 多出来的迁移文件（上游删了）
const migDst = join(DSH, 'migrations')
if (existsSync(migDst)) {
  for (const n of readdirSync(migDst)) {
    if (!migNames.includes(n)) { if (check) stale.push(join(migDst, n)); else rmSync(join(migDst, n)) }
  }
}
if (check && stale.length) {
  console.error('dsh 派生文件不是最新，先跑 make dsh：\n' + stale.map((f) => '  ' + f).join('\n'))
  process.exit(1)
}
console.log(check ? 'dsh 派生文件是最新的' : `已生成 dsh 插件派生文件（版本 ${version}）`)
