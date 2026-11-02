#!/usr/bin/env node
// Gate sonuç önbelleği (FO-339). Aynı git tree + aynı pnpm-lock.yaml için yeşil bir tam gate
// bir kez yeter: yazar, inceleyici ve pre-push aynı kodu üç kez koşmaz.
//
// Kayıt: ~/.cache/fonbridge-gate-pass/<tree>  (FONBRIDGE_GATE_PASS_DIR ile değişir), JSON.
// Yalnız ŞU koşulda yazılır (scripts/gate-lock.mjs): gate:core exit 0, çalışma ağacı baştan sona
// temiz (git status boş, untracked dahil), tree koşu boyunca değişmedi. Kırmızı koşu yazmaz.
//
// Belge-yalnız kısa yol (karar K-575105 = B, daraltma FO-348 K2 lider kararı): fark (origin/dev...HEAD)
// yalnız docs/**/*.md ise tam gate yerine lint + i18n:check. Bunun dışındaki HER dosya (kök dosyalar,
// .github/, content/, messages/, src/, docs/ altındaki .md olmayanlar, FULL_GATE_DOCS) tam gate koşar.
// Çalışma ağacı kirliyse (untracked dahil) ya da fark boşsa kısa yol YOK. Yeniden adlandırma
// (git mv) iki yol olarak raporlanır: kaynak tam gate'i tetikler (--no-renames).
// Kirli ağaçta önbellek kaydı ne okunur ne yazılır (readPass).
//
// CLI:
//   node scripts/gate-cache.mjs hit        exit 0: aynı tree için yeşil kayıt var (satır basar)
//   node scripts/gate-cache.mjs skippable  exit 0: önbellek hit ya da belge-yalnız (gate-isolated için)
import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const PASS_DIR = process.env.FONBRIDGE_GATE_PASS_DIR || path.join(os.homedir(), '.cache', 'fonbridge-gate-pass')
export const DOCS_BASE = process.env.FONBRIDGE_GATE_BASE || 'origin/dev'
// docs/ altında olsa da KOD ya da çalışma zamanı girdisi olan belgeler: tam gate.
// Neden (hangi kod okuyor / render ediyor):
// - docs/BILLING.md → src/lib/billing/catalog.test.ts tablosunu okur.
// - docs/legal/      → src/app/[locale]/(public)/compliance/dpa/page.tsx sayfada render eder.
// - docs/BETA_DATA/  → scripts/beta-pricing-survey.ts girdi olarak okur.
// Eşleşme büyük/küçük harf duyarsız (macOS dosya sistemi); yeni istisna buraya eklenir.
const FULL_GATE_DOCS = ['docs/BILLING.md', 'docs/legal/', 'docs/BETA_DATA/']

function tryGit(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

export function treeHash() {
  return tryGit(['rev-parse', 'HEAD^{tree}'])
}

export function lockHash() {
  const top = tryGit(['rev-parse', '--show-toplevel']) ?? process.cwd()
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(path.join(top, 'pnpm-lock.yaml'))).digest('hex')
  } catch {
    return null
  }
}

// untracked dahil: git status boş değilse koşu bu tree'nin kanıtı değildir.
export function cleanTree() {
  const status = tryGit(['status', '--porcelain'])
  return status !== null && status === ''
}

export function isDocsOnlyPath(file) {
  if (!file.startsWith('docs/') || !file.endsWith('.md')) return false
  const lower = file.toLowerCase()
  return !FULL_GATE_DOCS.some((p) => {
    const q = p.toLowerCase()
    return q.endsWith('/') ? lower.startsWith(q) : lower === q
  })
}

// Belge-yalnız mı? Sebebiyle birlikte döner (ekrana basılır).
export function docsOnly() {
  if (!cleanTree()) return { ok: false, reason: 'çalışma ağacı kirli' }
  if (tryGit(['rev-parse', '--verify', '--quiet', DOCS_BASE]) === null) {
    return { ok: false, reason: `${DOCS_BASE} yok` }
  }
  // --no-renames: git mv src/x.ts docs/x.ts farkta iki yol (silinen kaynak + yeni hedef) olur.
  const diff = tryGit(['diff', '--no-renames', '--name-only', `${DOCS_BASE}...HEAD`])
  if (diff === null) return { ok: false, reason: 'fark alınamadı' }
  const files = diff.split('\n').filter(Boolean)
  if (files.length === 0) return { ok: false, reason: 'fark boş' }
  const bad = files.find((f) => !isDocsOnlyPath(f))
  if (bad) return { ok: false, reason: `kod/yapılandırma dokundu: ${bad}` }
  return { ok: true, reason: `${files.length} belge dosyası (${DOCS_BASE}...HEAD)` }
}

function passFile(tree) {
  return path.join(PASS_DIR, tree)
}

// Kayıt yalnız aynı tree ve aynı lockfile hash'i ile eşleşirse geçerlidir.
// Kirli çalışma ağacı (untracked dahil) hiçbir kaydı okutmaz: yerel kirli kod yeşil sayılmaz (FO-348 K3).
export function readPass(tree = treeHash(), lock = lockHash()) {
  if (!tree || !lock) return null
  if (!cleanTree()) return null
  let rec
  try {
    rec = JSON.parse(fs.readFileSync(passFile(tree), 'utf8'))
  } catch {
    return null
  }
  if (rec.tree !== tree || rec.lockHash !== lock || rec.gateExit !== 0) return null
  return rec
}

export function writePass({ tree, lock, log, command }) {
  fs.mkdirSync(PASS_DIR, { recursive: true })
  const rec = { tree, lockHash: lock, date: new Date().toISOString(), gateExit: 0, log: log ?? null, command }
  const target = passFile(tree)
  const tmp = `${target}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(rec, null, 2))
  fs.renameSync(tmp, target)
  return rec
}

function main() {
  const cmd = process.argv[2]
  if (cmd === 'hit') {
    const rec = readPass()
    if (!rec) process.exit(1)
    console.log(`önbellek: ${rec.tree} ${rec.date}`)
    process.exit(0)
  }
  if (cmd === 'skippable') {
    const rec = readPass()
    if (rec) {
      console.log(`önbellek: ${rec.tree} ${rec.date}`)
      process.exit(0)
    }
    const d = docsOnly()
    if (d.ok) {
      console.log(`belge-yalnız: ${d.reason}`)
      process.exit(0)
    }
    console.log(`tam gate gerekli: ${d.reason}`)
    process.exit(1)
  }
  console.error('kullanım: node scripts/gate-cache.mjs hit|skippable')
  process.exit(2)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
