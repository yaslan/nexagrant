#!/usr/bin/env node
// Makine çapında gate kilidi (FO-55): aynı anda tek `pnpm gate` koşar.
//
// Neden: bütün worktree'ler aynı Postgres (:5433/fabrika) ve 3000 portunu kullanır.
// İki gate aynı anda koşarsa zamanlamaya bağlı testler sahte kırmızı verir.
//
// Kullanım: node scripts/gate-lock.mjs <komut> [args...]
// Kilit: ~/.cache/fonbridge-gate.lock (FONBRIDGE_GATE_LOCK_DIR ile değiştirilebilir).
// Kilit bir dizin (mkdir atomik; flock mac'te yok). Sahibin pid'i ölüyse kilit bayat sayılır ve temizlenir.
//
// FO-339 (önbellek + sıra):
// - Sıra: bekleyenler <LOCK_DIR>.queue/ altında bilet bırakır (<zaman>-<pid>); kilidi yalnız
//   sıradaki (en eski canlı bilet) alır. Bekleme mesajı sıra no'sunu ve tahmini başlama saatini basar.
//   Kilidi eski sürümle alan bekleyen (bilet bırakmaz) hâlâ araya girebilir; kilit biçimi değişmedi.
// - Önbellek: `pnpm run gate:core` aynı git tree + pnpm-lock için yeşilse tekrar koşmaz (scripts/gate-cache.mjs).
//   Yalnız docs/** ve kod dışı *.md farkında tam gate yerine lint + i18n:check koşar.
// - Süre geçmişi: <LOCK_DIR>.history.jsonl; ETA medyanından hesaplanır.
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { cleanTree, docsOnly, lockHash, readPass, treeHash, writePass } from './gate-cache.mjs'

const LOCK_DIR = process.env.FONBRIDGE_GATE_LOCK_DIR || path.join(os.homedir(), '.cache', 'fonbridge-gate.lock')
const OWNER_FILE = path.join(LOCK_DIR, 'owner.json')
const QUEUE_DIR = `${LOCK_DIR}.queue`
const HISTORY_FILE = `${LOCK_DIR}.history.jsonl`
const POLL_MS = 2000
const NOTIFY_MS = 30_000
// mkdir ile owner.json yazımı arasında çökmüş kilidi bu süre sonra bayat say.
const NO_OWNER_STALE_MS = 15_000
// Geçmiş yoksa tahmin: bir tam gate yaklaşık 25-40 dk (FO-339 ölçümü).
const DEFAULT_EST_MS = 30 * 60_000

const argv = process.argv.slice(2)
if (argv.length === 0) {
  console.error('kullanım: node scripts/gate-lock.mjs <komut> [args...]')
  process.exit(2)
}

const IS_GATE = argv.length === 3 && argv[0] === 'pnpm' && argv[1] === 'run' && argv[2] === 'gate:core'
const TICKET = `${String(Date.now()).padStart(15, '0')}-${process.pid}`

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

// ---- Sıra (FIFO) ----
function enqueue() {
  fs.mkdirSync(QUEUE_DIR, { recursive: true })
  fs.writeFileSync(path.join(QUEUE_DIR, TICKET), JSON.stringify({ pid: process.pid, cwd: process.cwd(), command: argv.join(' '), at: new Date().toISOString() }))
}

function dequeue() {
  fs.rmSync(path.join(QUEUE_DIR, TICKET), { force: true })
}

// Canlı biletler sıra sırasıyla. Sahibi ölmüş bilet bayattır, silinir.
function liveQueue() {
  let names
  try {
    names = fs.readdirSync(QUEUE_DIR).sort()
  } catch {
    return []
  }
  const live = []
  for (const name of names) {
    const pid = Number(name.slice(name.lastIndexOf('-') + 1))
    if (pid === process.pid || pidAlive(pid)) live.push(name)
    else fs.rmSync(path.join(QUEUE_DIR, name), { force: true })
  }
  return live
}

// ---- Süre geçmişi ve ETA ----
function estimateMs() {
  let runs = []
  try {
    runs = fs
      .readFileSync(HISTORY_FILE, 'utf8')
      .split('\n')
      .filter(Boolean)
      .slice(-20)
      .map((l) => JSON.parse(l).ms)
      .filter((n) => Number.isFinite(n) && n > 0)
  } catch {
    runs = []
  }
  if (runs.length === 0) return DEFAULT_EST_MS
  const sorted = [...runs].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function recordRun(ms, ok) {
  try {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true })
    fs.appendFileSync(HISTORY_FILE, `${JSON.stringify({ at: new Date().toISOString(), ms, ok, command: argv.join(' ') })}\n`)
  } catch {
    // Geçmiş yazılamadıysa gate'i etkilemez; yalnız ETA kaba kalır.
  }
}

// `ahead` = önümdeki bekleyen iş sayısı. Tahmin: sahibin kalan süresi + ahead × medyan süre.
function etaText(ahead) {
  const est = estimateMs()
  const owner = readOwner()
  const now = Date.now()
  let remaining = 0
  if (owner && pidAlive(owner.pid)) remaining = Math.max(0, est - (now - Date.parse(owner.startedAt)))
  const waitMs = remaining + ahead * est
  const at = new Date(now + waitMs).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  return `~${elapsed(waitMs)} sonra (≈ ${at}; iş başına tahmin ${elapsed(est)})`
}

async function acquire() {
  enqueue()
  process.on('exit', dequeue)
  // Bekleme sırasında Ctrl-C: bileti bırak (Node SIGINT'te 'exit' olayı yaymaz).
  const onWaitSignal = () => {
    dequeue()
    process.exit(130)
  }
  process.on('SIGINT', onWaitSignal)
  process.on('SIGTERM', onWaitSignal)

  let waitingSince = null
  let lastNotice = 0
  for (;;) {
    const queue = liveQueue()
    const pos = queue.indexOf(TICKET)
    if (pos === -1) {
      enqueue()
      continue
    }
    if (pos === 0 && tryAcquire()) {
      dequeue()
      process.off('SIGINT', onWaitSignal)
      process.off('SIGTERM', onWaitSignal)
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
      console.log(`⏳ Gate sırası: #${pos + 1} (önünde ${pos} iş). Kilit meşgul: ${who}. Tahmini başlama: ${etaText(pos)}.`)
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

// Belge-yalnız kısa yol: lint + i18n:check (kilit yok; DB'ye dokunmaz).
function runSteps(steps) {
  for (const step of steps) {
    console.log(`→ ${step.join(' ')}`)
    const res = spawnSync(step[0], step.slice(1), { stdio: 'inherit', shell: process.platform === 'win32' })
    if (res.status !== 0) return res.status ?? 1
  }
  return 0
}

async function main() {
  // Kilidi tutan bir gate'in içinden çağrılırsa (ör. gate → gate) kendini bekleyip kilitlenmesin.
  const nested = process.env.FONBRIDGE_GATE_LOCK_HELD === '1'
  const isGate = !nested && IS_GATE

  let tree0 = null
  let lock0 = null
  if (isGate) {
    if (process.env.FONBRIDGE_GATE_NO_CACHE !== '1') {
      const rec = readPass()
      if (rec) {
        console.log(`önbellek: ${rec.tree} ${rec.date} (aynı tree + pnpm-lock için yeşil kayıt; tam gate atlandı)`)
        process.exit(0)
      }
      const d = docsOnly()
      if (d.ok) {
        console.log(`belge-yalnız: ${d.reason} → lint + i18n:check (tam gate atlandı)`)
        process.exit(runSteps([['pnpm', 'run', 'lint'], ['pnpm', 'run', 'i18n:check']]))
      }
      console.log(`tam gate: ${d.reason}`)
    }
    tree0 = treeHash()
    lock0 = lockHash()
  }

  let runStart = Date.now()
  if (!nested) {
    await acquire()
    process.on('exit', release)
    runStart = Date.now()
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
    const exitCode = signal ? 1 : (code ?? 1)
    if (!nested) recordRun(Date.now() - runStart, exitCode === 0)
    // Yalnız temiz ve koşu boyunca değişmemiş tree'nin yeşili kayda girer.
    if (isGate && exitCode === 0 && tree0 && cleanTree() && treeHash() === tree0) {
      try {
        writePass({ tree: tree0, lock: lock0, command: argv.join(' ') })
        console.log(`önbellek kaydı yazıldı: ${tree0}`)
      } catch (err) {
        console.error(`önbellek kaydı yazılamadı: ${err.message}`)
      }
    }
    process.exit(exitCode)
  })
}

main()
