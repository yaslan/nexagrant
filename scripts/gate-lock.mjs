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
//   Kilit alındıktan sonra kayıt yeniden okunur (kuyrukta beklerken yazılmış olabilir; FO-348 K4).
//   Yalnız docs/**/*.md farkında (allowlist: scripts/gate-cache.mjs) tam gate yerine lint + i18n:check koşar.
// - Süre geçmişi: <LOCK_DIR>.history.jsonl; ETA medyanından hesaplanır.
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
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
// FO-388: e2e portu kilit alındıktan sonra seçilir; taban 3400 (gate-isolated.sh ile aynı).
const E2E_PORT_BASE = Number(process.env.FONBRIDGE_E2E_PORT_BASE || 3400)

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
  // FO-388 (3. inceleme): okuma ile taşıma arasında başka bir süreç bayat kilidi temizleyip canlı bir kilit
  // alabilir; o zaman buradaki rename canlı kilidi taşırdı. Önce taşınır, sonra taşınanın sahibine bakılır:
  // hâlâ aynı ölü sahipse silinir, değilse geri adlandırılır.
  const graveyard = `${LOCK_DIR}.stale-${process.pid}-${Date.now()}`
  try {
    fs.renameSync(LOCK_DIR, graveyard)
  } catch {
    return false
  }
  const taken = readOwnerAt(path.join(graveyard, 'owner.json'))
  let stillStale
  if (owner) {
    stillStale = taken !== null && taken.pid === owner.pid && !pidAlive(taken.pid)
  } else {
    // Sahipsiz dizin: hâlâ sahipsiz ve eski olmalı (taze bir mkdir ile yazım arasındaki kilit değil).
    const mtimeMs = fs.statSync(graveyard).mtimeMs
    stillStale = taken === null && Date.now() - mtimeMs > NO_OWNER_STALE_MS
  }
  if (!stillStale) {
    try {
      fs.renameSync(graveyard, LOCK_DIR)
    } catch (err) {
      console.warn(`⚠ Canlı gate kilidi geri yüklenemedi (${err.code}); kilit dizini ${graveyard} altında kaldı, elle kontrol et.`)
    }
    return false
  }
  fs.rmSync(graveyard, { recursive: true, force: true })
  console.log(`🧹 Bayat gate kilidi temizlendi (sahip pid ${owner?.pid ?? '?'} artık çalışmıyor).`)
  return true
}

function readOwnerAt(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
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

// FO-388 (3. inceleme): bir dinleyici yalnız kendi adresinde görünür (macOS ölçümü: 127.0.0.1, 0.0.0.0,
// ::1, :: birbirini görmüyor; Next dev `::` dinler). Bu yüzden port dört adreste de denenir ve ancak
// hepsinde boşsa boş sayılır. Yalnız EADDRINUSE meşgul demektir; IPv6 yoksa (EADDRNOTAVAIL/EAFNOSUPPORT)
// o adres atlanır.
const PROBE_HOSTS = ['127.0.0.1', '0.0.0.0', '::1', '::']

function bindFree(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once('error', (err) => resolve(err.code !== 'EADDRINUSE'))
    srv.once('listening', () => srv.close(() => resolve(true)))
    srv.listen(port, host)
  })
}

async function portFree(port) {
  for (const host of PROBE_HOSTS) {
    if (!(await bindFree(port, host))) return false
  }
  return true
}

async function firstFreePort(from) {
  let p = from
  while (!(await portFree(p))) p += 1
  return p
}

// FO-388: kilit alındıktan sonra e2e portu. Otomatik seçimde (FONBRIDGE_E2E_PORT_AUTO=1, gate-isolated.sh)
// taban portun dolu olduğu, kuyrukta beklerken de değişmiş olabilir: seçim burada, test adımlarından önce
// yapılır. Elle verilen E2E_PORT değiştirilmez; doluysa hata atılır. Hiçbiri yoksa undefined (eski davranış).
async function resolveE2ePort() {
  if (process.env.FONBRIDGE_E2E_PORT_AUTO === '1') {
    // FO-388 (3. inceleme): gate-isolated.sh kendi ön seçimini E2E_PORT'a yazıp FONBRIDGE_E2E_PORT_PREPICK
    // ile işaretler; o değer sessizce yok sayılır. İşaretsiz bir E2E_PORT elle verilmiştir: yok sayılır,
    // ama görünür uyarı basılır (hata değil: git push ve pre-push gate'i kırılmasın).
    const explicit = process.env.E2E_PORT
    const port = await firstFreePort(E2E_PORT_BASE)
    if (explicit && explicit !== process.env.FONBRIDGE_E2E_PORT_PREPICK) {
      console.warn(`⚠ E2E_PORT=${explicit} elle verilmiş ama FONBRIDGE_E2E_PORT_AUTO=1; yok sayıldı, e2e portu ${port} seçildi.`)
    }
    return port
  }
  const explicit = process.env.E2E_PORT
  if (explicit) {
    if (await portFree(Number(explicit))) return Number(explicit)
    throw new Error(`E2E_PORT ${explicit} dolu; kilit alındı ama port boş değil, koşu başlatılmadı`)
  }
  return undefined
}

// FO-397: node_modules sembolik bağsa Turbopack `next/package.json`'ı bulamaz; e2e sunucusu her sayfada
// 500 döner ve 180 sn sonra zaman aşımına uğrar. Bu yüzden önce açık hata, kilit ve kuyruk yok.
function assertRealNodeModules() {
  const nm = path.join(import.meta.dirname, '..', 'node_modules')
  let link = false
  try {
    link = fs.lstatSync(nm).isSymbolicLink()
  } catch {
    link = false
  }
  if (!link) return
  console.error(`✖ node_modules sembolik bağ (${fs.readlinkSync(nm)}); gerçek kurulum gerekli: pnpm install --frozen-lockfile`)
  process.exit(1)
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

  const useCache = isGate && process.env.FONBRIDGE_GATE_NO_CACHE !== '1'
  if (useCache) {
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

  let runStart = Date.now()
  let e2ePort
  // FO-397: sembolik bağlı node_modules ile tam gate kuyruğa girmeden açık hatayla durur (15-60 dk kayıp olmasın).
  if (isGate) assertRealNodeModules()
  if (!nested) {
    await acquire()
    process.on('exit', release)
    runStart = Date.now()
    try {
      e2ePort = await resolveE2ePort()
    } catch (err) {
      console.error(`✖ ${err.message}`)
      process.exit(1)
    }
    if (e2ePort !== undefined) console.log(`e2e portu: ${e2ePort} (kilit alındıktan sonra seçildi)`)
  }

  // Ağaç ve kilit hash'i kilit alındıktan SONRA alınır: kuyrukta beklerken değişen ağaç bu koşunun değil.
  let tree0 = null
  let lock0 = null
  if (isGate) {
    tree0 = treeHash()
    lock0 = lockHash()
    // FO-348 K4: kuyrukta bekleyen aynı tree, önden koşan gate yeşil kaydı yazdıktan sonra kilidi alabilir.
    // Kayıt varsa ikinci kez koşmak yerine çık (kilit bu süreçte: release).
    if (useCache && tree0 && lock0) {
      const rec = readPass(tree0, lock0)
      if (rec) {
        console.log(`önbellek: ${rec.tree} ${rec.date} (kuyrukta beklerken yazıldı; tam gate atlandı)`)
        release()
        process.exit(0)
      }
    }
  }

  // NG-350: FONBRIDGE_GATE_RUN=1 tells the live suites they are inside the gate, where a missing
  // migration/function/seed row fails the file instead of skipping it (tests/helpers/require-db-object.ts).
  const child = spawn(argv[0], argv.slice(1), {
    stdio: 'inherit',
    env: {
      ...process.env,
      FONBRIDGE_GATE_LOCK_HELD: '1',
      ...(IS_GATE ? { FONBRIDGE_GATE_RUN: '1' } : {}),
      ...(e2ePort !== undefined ? { E2E_PORT: String(e2ePort) } : {}),
    },
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
