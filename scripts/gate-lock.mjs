#!/usr/bin/env node
// Makine çapında gate kilidi (FO-55): aynı anda tek `pnpm gate` koşar.
//
// Neden: bütün worktree'ler aynı Postgres (:5433/fabrika) ve 3000 portunu kullanır.
// İki gate aynı anda koşarsa zamanlamaya bağlı testler sahte kırmızı verir.
//
// Kullanım: node scripts/gate-lock.mjs <komut> [args...]
// Kilit: ~/.cache/fonbridge-gate.lock (FONBRIDGE_GATE_LOCK_DIR ile değiştirilebilir).
// Kilit bir dizin (mkdir atomik; flock mac'te yok). Sahibin pid'i ölüyse kilit bayat sayılır ve temizlenir.
import { spawn, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const LOCK_DIR = process.env.FONBRIDGE_GATE_LOCK_DIR || path.join(os.homedir(), '.cache', 'fonbridge-gate.lock')
const OWNER_FILE = path.join(LOCK_DIR, 'owner.json')
const POLL_MS = 2000
const NOTIFY_MS = 30_000
// mkdir ile owner.json yazımı arasında çökmüş kilidi bu süre sonra bayat say.
const NO_OWNER_STALE_MS = 15_000

const argv = process.argv.slice(2)
if (argv.length === 0) {
  console.error('kullanım: node scripts/gate-lock.mjs <komut> [args...]')
  process.exit(2)
}

function currentBranch() {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return 'bilinmiyor'
  }
}

function readOwner() {
  try {
    return JSON.parse(fs.readFileSync(OWNER_FILE, 'utf8'))
  } catch {
    return null
  }
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}

function tryAcquire() {
  try {
    // Üst dizin (ör. ~/.cache) yoksa önce oluştur; kilit dizininin kendisi atomiklik için recursive değil.
    fs.mkdirSync(path.dirname(LOCK_DIR), { recursive: true })
    fs.mkdirSync(LOCK_DIR)
  } catch (err) {
    if (err.code === 'EEXIST') return false
    throw err
  }
  const owner = { pid: process.pid, cwd: process.cwd(), branch: currentBranch(), command: argv.join(' '), startedAt: new Date().toISOString() }
  fs.writeFileSync(OWNER_FILE, JSON.stringify(owner, null, 2))
  return true
}

// Bayat kilidi ayrı bir isme taşıyıp siler: rename atomik olduğundan iki bekleyen aynı kilidi iki kez silemez.
function clearIfStale() {
  const owner = readOwner()
  let stale
  if (owner) {
    stale = !pidAlive(owner.pid)
  } else {
    let mtimeMs
    try {
      mtimeMs = fs.statSync(LOCK_DIR).mtimeMs
    } catch (err) {
      // Sahip kilidi o an bırakıyor: dizin zaten yok, yeniden denemek yeterli.
      if (err.code === 'ENOENT') return true
      throw err
    }
    stale = Date.now() - mtimeMs > NO_OWNER_STALE_MS
  }
  if (!stale) return false
  const graveyard = `${LOCK_DIR}.stale-${process.pid}-${Date.now()}`
  try {
    fs.renameSync(LOCK_DIR, graveyard)
    fs.rmSync(graveyard, { recursive: true, force: true })
    console.log(`🧹 Bayat gate kilidi temizlendi (sahip pid ${owner?.pid ?? '?'} artık çalışmıyor).`)
    return true
  } catch {
    return false
  }
}

function elapsed(ms) {
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s} sn` : `${Math.floor(s / 60)} dk ${s % 60} sn`
}

async function acquire() {
  let waitingSince = null
  let lastNotice = 0
  for (;;) {
    if (tryAcquire()) {
      if (waitingSince !== null) console.log(`✅ Kilit alındı (${elapsed(Date.now() - waitingSince)} beklendi).`)
      return
    }
    if (clearIfStale()) continue
    const now = Date.now()
    waitingSince ??= now
    if (now - lastNotice >= NOTIFY_MS) {
      lastNotice = now
      const owner = readOwner()
      const who = owner ? `${owner.cwd} [${owner.branch}] — ${owner.command}` : 'bilinmiyor (kilit yazılıyor)'
      const since = owner ? `${owner.startedAt} (${elapsed(now - Date.parse(owner.startedAt))} önce)` : 'az önce'
      console.log(`⏳ Gate kilidi meşgul — bekliyor: ${who}, ${since} beri. Bu gate bitene kadar sıra bekleniyor.`)
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}

function release() {
  const owner = readOwner()
  if (owner && owner.pid === process.pid) {
    fs.rmSync(LOCK_DIR, { recursive: true, force: true })
  }
}

async function main() {
  // Kilidi tutan bir gate'in içinden çağrılırsa (ör. gate → gate) kendini bekleyip kilitlenmesin.
  const nested = process.env.FONBRIDGE_GATE_LOCK_HELD === '1'
  if (!nested) {
    await acquire()
    process.on('exit', release)
  }

  const child = spawn(argv[0], argv.slice(1), {
    stdio: 'inherit',
    env: { ...process.env, FONBRIDGE_GATE_LOCK_HELD: '1' },
    shell: process.platform === 'win32',
  })
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => child.kill(sig))
  }
  child.on('exit', (code, signal) => {
    if (signal) process.exit(1)
    process.exit(code ?? 1)
  })
}

main()
