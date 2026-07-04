#!/usr/bin/env node
// Branch/worktree dev-server status board.
//
// Lists every git worktree, whether its Vite dev server is running (and on which
// port), and any orphaned dev servers (a leftover Vite on a dev-range port that
// no current worktree claims). Then lets you start/stop a server interactively.
//
// Run it from the repo:  node tools/branch-status.mjs   (or:  npm run branches)
// Plain `node` sidesteps the machine's AllSigned policy that blocks .ps1 shims.
//
// Port model (matches CLAUDE.md §9): each worktree's dev server binds a port read
// from its own .claude/launch.json; if that's absent we fall back to the
// deterministic default 5200 + (sum of the folder name's char codes) % 500. The
// main checkout uses 5174 (its `dev` config) and often a manual host server on 5173.
// A server is "running" iff a node process is listening on one of those ports.

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, mkdirSync, openSync } from 'node:fs'
import { join, basename } from 'node:path'
import { createInterface } from 'node:readline'

const DEV_PORT_LO = 5170
const DEV_PORT_HI = 5700

const C = process.stdout.isTTY
  ? { dim: s => `\x1b[2m${s}\x1b[0m`, green: s => `\x1b[32m${s}\x1b[0m`, yellow: s => `\x1b[33m${s}\x1b[0m`, cyan: s => `\x1b[36m${s}\x1b[0m`, bold: s => `\x1b[1m${s}\x1b[0m` }
  : { dim: s => s, green: s => s, yellow: s => s, cyan: s => s, bold: s => s }

const sleep = ms => new Promise(r => setTimeout(r, ms))

// --- git worktrees -----------------------------------------------------------

function getWorktrees() {
  let out
  try {
    out = execFileSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf8' })
  } catch {
    console.error('Not a git repository (run this from inside the repo).')
    process.exit(1)
  }
  const trees = []
  let cur = null
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      cur = { path: line.slice(9).trim(), branch: null }
      trees.push(cur)
    } else if (line.startsWith('branch ') && cur) {
      cur.branch = line.slice(7).replace('refs/heads/', '').trim()
    } else if (line.startsWith('detached') && cur) {
      cur.branch = '(detached)'
    }
  }
  return trees
}

// --- ports -------------------------------------------------------------------

function formulaPort(name) {
  let sum = 0
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i)
  return 5200 + (sum % 500)
}

// Pull every port mentioned in a worktree's launch.json (dev + preview + any),
// and flag which one is the `dev` server we'd start.
function launchJsonPorts(wtPath) {
  const file = join(wtPath, '.claude', 'launch.json')
  if (!existsSync(file)) return { dev: null, all: [] }
  let json
  try {
    json = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return { dev: null, all: [] }
  }
  const cfgs = []
  for (const cfg of json.configurations ?? []) {
    const args = Array.isArray(cfg.runtimeArgs) ? cfg.runtimeArgs : []
    let port = typeof cfg.port === 'number' ? cfg.port : null
    if (port == null) {
      const i = args.indexOf('--port')
      if (i >= 0) port = Number(args[i + 1]) || null
    }
    if (port == null) continue
    // A worktree has no real node_modules, so a *relative* vite path won't resolve
    // there (§9) — the config with an absolute vite path is the one that works.
    const absolute = args.some(a => typeof a === 'string' && /^[A-Za-z]:[\\/]/.test(a))
    cfgs.push({ port, name: typeof cfg.name === 'string' ? cfg.name : '', absolute })
  }
  const dev =
    cfgs.find(c => c.absolute && c.name.startsWith('dev')) ??
    cfgs.find(c => c.absolute) ??
    cfgs.find(c => c.name.startsWith('dev')) ??
    cfgs[0] ?? null
  return { dev: dev ? dev.port : null, all: cfgs.map(c => c.port) }
}

// Listening TCP ports -> Set<pid>, via netstat (plain exe, no policy issues).
function listeningPorts() {
  let out
  try {
    // No `-p TCP`: that filters to IPv4 only, and Vite binds localhost as IPv6
    // ([::1]) unless `--host` is set. Plain `-ano` lists both; LISTENING is
    // TCP-only anyway (UDP has no state), so the filter below is enough.
    out = execFileSync('netstat', ['-ano'], { encoding: 'utf8' })
  } catch {
    return new Map()
  }
  const map = new Map()
  for (const raw of out.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line.includes('LISTENING')) continue
    const parts = line.split(/\s+/)
    const local = parts[1] ?? ''
    const port = Number(local.slice(local.lastIndexOf(':') + 1))
    const pid = Number(parts[parts.length - 1])
    if (!port || !pid) continue
    if (!map.has(port)) map.set(port, new Set())
    map.get(port).add(pid)
  }
  return map
}

// pid -> image name (so we only count node-backed ports as dev servers).
function processNames() {
  let out
  try {
    out = execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8' })
  } catch {
    return new Map()
  }
  const map = new Map()
  for (const line of out.split(/\r?\n/)) {
    if (!line.startsWith('"')) continue
    const cols = line.split('","')
    const name = cols[0].replace(/^"/, '')
    const pid = Number(cols[1])
    if (pid) map.set(pid, name.toLowerCase())
  }
  return map
}

// --- tunnels (phone preview: ngrok / localtunnel) ----------------------------

// Returns [{ source, public, port }] for any running tunnel we can see.
async function detectTunnels() {
  const tunnels = []

  // ngrok publishes a local inspection API listing each tunnel + its local target.
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 800)
    const res = await fetch('http://127.0.0.1:4040/api/tunnels', { signal: ctrl.signal }).finally(() => clearTimeout(timer))
    if (res.ok) {
      const data = await res.json()
      for (const t of data.tunnels ?? []) {
        const addr = String(t.config?.addr ?? '')
        const port = Number(addr.slice(addr.lastIndexOf(':') + 1)) || null
        // ngrok lists http + https as two tunnels for one addr; keep one, prefer https.
        const dup = port != null && tunnels.find(x => x.source === 'ngrok' && x.port === port)
        if (dup) {
          if (String(t.public_url).startsWith('https')) dup.public = t.public_url
          continue
        }
        tunnels.push({ source: 'ngrok', public: t.public_url ?? null, port })
      }
    }
  } catch { /* ngrok not running */ }

  // localtunnel has no local API — read node command lines for `--port` / `--subdomain`.
  try {
    const out = execFileSync('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object CommandLine | ConvertTo-Json -Compress",
    ], { encoding: 'utf8' })
    let rows = []
    try { const j = JSON.parse(out); rows = Array.isArray(j) ? j : [j] } catch { /* no node procs */ }
    for (const row of rows) {
      const cmd = String(row?.CommandLine ?? '')
      if (!/localtunnel|loca\.lt/i.test(cmd)) continue
      const pm = cmd.match(/--port\s+(\d+)/)
      const sm = cmd.match(/--subdomain\s+([\w-]+)/)
      tunnels.push({
        source: 'localtunnel',
        public: sm ? `https://${sm[1]}.loca.lt` : null,
        port: pm ? Number(pm[1]) : null,
      })
    }
  } catch { /* powershell/CIM unavailable */ }

  return tunnels
}

// --- scan (assemble the whole picture) ---------------------------------------

function scan() {
  const trees = getWorktrees()
  const listening = listeningPorts()
  const names = processNames()

  const isNodePort = port => {
    const pids = listening.get(port)
    if (!pids) return false
    for (const pid of pids) if ((names.get(pid) ?? '').includes('node')) return true
    return false
  }

  let mainPath = null
  const claimed = new Set()

  const branches = trees.map(t => {
    const isMain = !t.path.replace(/\\/g, '/').includes('/.claude/worktrees/')
    if (isMain) mainPath = t.path
    const name = basename(t.path.replace(/\\/g, '/'))
    const lj = launchJsonPorts(t.path)
    const startPort = lj.dev ?? (isMain ? 5174 : formulaPort(name))
    // Every port this worktree could legitimately own (so we don't mis-flag it as orphaned).
    const candidates = new Set([startPort, ...lj.all])
    if (isMain) { candidates.add(5173); candidates.add(5174) }
    else candidates.add(formulaPort(name))
    for (const p of candidates) claimed.add(p)
    const runningPorts = [...candidates].filter(isNodePort).sort((a, b) => a - b)
    return { label: t.branch ?? name, isMain, startPort, wtPath: t.path, runningPorts }
  })

  const orphans = []
  for (const [port, pids] of listening) {
    if (port < DEV_PORT_LO || port > DEV_PORT_HI) continue
    if (claimed.has(port)) continue
    if (!isNodePort(port)) continue // ignore non-Vite / System-reserved ports
    orphans.push({ port, pids: [...pids] })
  }
  orphans.sort((a, b) => a.port - b.port)

  return { branches, orphans, mainPath, listening }
}

// --- actions -----------------------------------------------------------------

function startServer(branch, mainPath) {
  const viteJs = join(mainPath ?? 'E:/Code/exploroboros', 'node_modules', 'vite', 'bin', 'vite.js')
  if (!existsSync(viteJs)) {
    console.log(C.yellow(`  ! can't find vite at ${viteJs}`))
    return
  }
  const dotClaude = join(branch.wtPath, '.claude')
  if (!existsSync(dotClaude)) mkdirSync(dotClaude, { recursive: true })
  const log = openSync(join(dotClaude, 'dev-server.log'), 'a')
  // detached + unref so the server outlives this tool.
  const child = spawn(process.execPath, [viteJs, '--port', String(branch.startPort), '--strictPort'], {
    cwd: branch.wtPath,
    detached: true,
    stdio: ['ignore', log, log],
  })
  child.unref()
  console.log(C.dim(`  starting ${branch.label} on :${branch.startPort} — cold start re-optimizes deps, give it a few seconds`))
  console.log(C.dim(`  log: ${join(dotClaude, 'dev-server.log')}`))
}

function killPids(pids) {
  for (const pid of pids) {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/F', '/T'], { stdio: 'ignore' })
    } catch { /* already gone */ }
  }
}

async function toggleBranch(branch, mainPath) {
  if (branch.runningPorts.length) {
    const listening = listeningPorts()
    const pids = new Set()
    for (const p of branch.runningPorts) for (const pid of listening.get(p) ?? []) pids.add(pid)
    console.log(C.dim(`  stopping ${branch.label} on :${branch.runningPorts.join(', :')} ...`))
    killPids(pids)
    await sleep(400)
  } else {
    startServer(branch, mainPath)
    // A cold Vite start re-optimizes deps before binding, which can take ~15s;
    // poll up to 20s (breaking as soon as it's up). If it's still not up, the
    // next render just shows "not running" and `r` will pick it up once bound.
    for (let i = 0; i < 40; i++) {
      await sleep(500)
      if (listeningPorts().has(branch.startPort)) break
    }
  }
}

async function stopOrphan(orphan) {
  console.log(C.dim(`  stopping orphan on :${orphan.port} ...`))
  killPids(orphan.pids)
  await sleep(400)
}

// --- render ------------------------------------------------------------------

function render(state, tunnels) {
  const { branches, orphans } = state
  console.clear()
  console.log(C.bold('  Branch dev-server status') + C.dim('   (node tools/branch-status.mjs)'))
  console.log(C.dim('  ' + '-'.repeat(56)))

  const selectable = []
  branches.forEach(b => {
    const n = selectable.length + 1
    selectable.push({ kind: 'branch', ref: b })
    const tag = b.isMain ? C.cyan(' (main)') : ''
    const status = b.runningPorts.length
      ? C.green(`running on port: ${b.runningPorts.join(', ')}`)
      : C.dim(`not running`) + C.dim(` (:${b.startPort})`)
    console.log(`  ${String(n).padStart(2)}. ${b.label}${tag}  —  ${status}`)
  })

  console.log('')
  if (orphans.length) {
    console.log('  ' + C.yellow(`orphaned servers running on ${orphans.map(o => o.port).join(', ')}`))
    orphans.forEach(o => {
      const n = selectable.length + 1
      selectable.push({ kind: 'orphan', ref: o })
      console.log(`  ${String(n).padStart(2)}. ` + C.yellow(`orphan :${o.port}`) + C.dim('  —  select to stop'))
    })
  } else {
    console.log('  ' + C.dim('orphaned servers: none'))
  }

  if (tunnels && tunnels.length) {
    console.log('')
    console.log('  ' + C.cyan('tunnels:'))
    for (const t of tunnels) {
      const b = branches.find(x => x.runningPorts.includes(t.port)) ?? branches.find(x => x.startPort === t.port)
      const who = b
        ? (b.runningPorts.includes(t.port) ? b.label : C.yellow(`${b.label} — but its server is down!`))
        : C.yellow('no local server on that port')
      const url = t.public ?? C.dim(`(public URL shows only in its own terminal)`)
      console.log(`   ${C.cyan(url)}  ->  :${t.port ?? '?'} ${C.dim('(' + t.source + ')')}  ${who}`)
    }
  }

  console.log('')
  console.log(C.dim('  1-n: start/stop selected server   ·   r: refresh   ·   q: exit'))
  return selectable
}

// --- main loop ---------------------------------------------------------------

const rl = createInterface({ input: process.stdin, output: process.stdout })
let closed = false
rl.on('close', () => { closed = true })
// Resolve to 'q' if stdin closes (EOF / piped input / Ctrl-Z) so the loop exits
// cleanly instead of throwing ERR_USE_AFTER_CLOSE.
const ask = q => new Promise(res => {
  if (closed) return res('q')
  const onClose = () => res('q')
  rl.once('close', onClose)
  try {
    rl.question(q, a => { rl.removeListener('close', onClose); res(a) })
  } catch {
    res('q')
  }
})

let running = true
while (running) {
  const state = scan()
  const tunnels = await detectTunnels()
  const selectable = render(state, tunnels)
  const ans = (await ask('\n  > ')).trim().toLowerCase()

  if (ans === 'q') {
    running = false
  } else if (ans === '' || ans === 'r') {
    continue
  } else {
    const n = Number(ans)
    const pick = Number.isInteger(n) && n >= 1 && n <= selectable.length ? selectable[n - 1] : null
    if (!pick) {
      console.log(C.yellow('  ? not a valid choice'))
      await sleep(700)
      continue
    }
    if (pick.kind === 'branch') await toggleBranch(pick.ref, state.mainPath)
    else await stopOrphan(pick.ref)
  }
}

rl.close()
console.log(C.dim('  bye.'))
