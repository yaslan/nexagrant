import { execFileSync, spawn, spawnSync } from 'child_process';
import crypto from 'crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// FO-348 (K5): gate önbelleği ve belge-yalnız kısa yolun invariant'ları.
// scripts/gate-cache.mjs ve scripts/gate-lock.mjs gerçek süreç olarak, geçici git repo fixture'ında koşar.
// Sahte `pnpm` (PATH'in başında) gate:core yerine geçer: çıkış kodu FAKE_GATE_EXIT, koşu sayısı FAKE_PNPM_LOG'a yazılır.
const scripts = path.join(import.meta.dirname, '..', 'scripts');
const CACHE = path.join(scripts, 'gate-cache.mjs');
const LOCK = path.join(scripts, 'gate-lock.mjs');

// Vitest bir gate'in içinde koşabilir: miras gelen git ortamı ve kilit işaretleri fixture'ı bozmasın.
function cleanEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, FONBRIDGE_GATE_LOCK_HELD: '' };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX', 'FONBRIDGE_GATE_NO_CACHE']) delete env[k];
  return { ...env, ...extra };
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    encoding: 'utf8',
    env: cleanEnv({}),
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function writeIn(cwd: string, file: string, content: string) {
  const abs = path.join(cwd, file);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

function commit(cwd: string, msg: string) {
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '--allow-empty', '-m', msg);
}

// main = dev'in yerine geçen base; her senaryo feat dalında değişiklik yapar.
function makeRepo(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'gate-cache-repo-'));
  git(dir, 'init', '-q', '-b', 'main');
  writeIn(dir, 'pnpm-lock.yaml', 'lockfile-v1\n');
  writeIn(dir, 'src/lib/x.ts', 'export const x = 1\n');
  writeIn(dir, 'src/lib/y.md', 'kod-md\n');
  writeIn(dir, 'content/kvkk.md', 'kvkk\n');
  writeIn(dir, 'messages/tr.json', '{}\n');
  writeIn(dir, 'docs/README.md', 'belge\n');
  writeIn(dir, 'docs/BILLING.md', 'fiyat\n');
  writeIn(dir, 'docs/legal/dpa-tr.md', 'dpa\n');
  writeIn(dir, 'docs/BETA_DATA/beta-partners.csv', 'a,b\n');
  writeIn(dir, 'README.md', 'kok\n');
  writeIn(dir, '.github/PULL_REQUEST_TEMPLATE.md', 'pr\n');
  commit(dir, 'base');
  git(dir, 'branch', 'base');
  git(dir, 'checkout', '-q', '-b', 'feat');
  return dir;
}

// Feat dalında `change` çalıştırılır, commit edilir, skippable karar kodu döner (0 = belge-yalnız, 1 = tam gate).
function classify(change: (dir: string) => void): { status: number | null; out: string } {
  const dir = makeRepo();
  try {
    change(dir);
    commit(dir, 'feat');
    const res = spawnSync(process.execPath, [CACHE, 'skippable'], {
      cwd: dir,
      encoding: 'utf8',
      env: cleanEnv({ FONBRIDGE_GATE_BASE: 'base', FONBRIDGE_GATE_PASS_DIR: path.join(dir, '..', `pass-${path.basename(dir)}`) }),
    });
    return { status: res.status, out: `${res.stdout}${res.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('belge-yalnız kısa yol sınıflandırması (FO-348 K1, K2)', () => {
  it('docs/ altındaki düz .md dosyası kısa yoldan geçer', () => {
    expect(classify((d) => writeIn(d, 'docs/yeni-rapor.md', 'x\n')).status).toBe(0);
  });

  it('K1: git mv ile kod dosyasını docs/ altına taşımak tam gate tetikler', () => {
    const r = classify((d) => {
      mkdirSync(path.join(d, 'docs'), { recursive: true });
      git(d, 'mv', 'src/lib/x.ts', 'docs/x.ts');
    });
    // Eski davranışta fark yalnız docs/x.ts görünür ve kısa yol geçerdi; şimdi kaynak da fark'ta.
    expect(r.status).toBe(1);
    expect(r.out).toContain('kod/yapılandırma dokundu');
  });

  it('K1: kod dizinindeki .md dosyasını docs/ altına taşımak tam gate tetikler (yalnız --no-renames yakalar)', () => {
    const r = classify((d) => {
      mkdirSync(path.join(d, 'docs'), { recursive: true });
      git(d, 'mv', 'src/lib/y.md', 'docs/y.md');
    });
    expect(r.status).toBe(1);
    expect(r.out).toContain('src/lib/y.md');
  });

  it('K1: content/ → docs/ ve messages/ → docs/ taşımaları tam gate tetikler', () => {
    expect(
      classify((d) => {
        mkdirSync(path.join(d, 'docs'), { recursive: true });
        git(d, 'mv', 'content/kvkk.md', 'docs/kvkk.md');
      }).status,
    ).toBe(1);
    expect(
      classify((d) => {
        mkdirSync(path.join(d, 'docs'), { recursive: true });
        git(d, 'mv', 'messages/tr.json', 'docs/tr.json');
      }).status,
    ).toBe(1);
  });

  it.each([
    ['docs/BILLING.md değişikliği', (d: string) => writeIn(d, 'docs/BILLING.md', 'yeni\n')],
    ['docs/legal/ altında', (d: string) => writeIn(d, 'docs/legal/dpa-en.md', 'dpa\n')],
    ['docs/BETA_DATA/ altında', (d: string) => writeIn(d, 'docs/BETA_DATA/beta-partners.csv', 'c,d\n')],
    ['docs/ altında .md olmayan dosya', (d: string) => writeIn(d, 'docs/notlar.txt', 'x\n')],
    ['büyük harfli .MD uzantısı', (d: string) => writeIn(d, 'docs/NOT.MD', 'x\n')],
    ['kök README.md', (d: string) => writeIn(d, 'README.md', 'yeni\n')],
    ['.github/ altı', (d: string) => writeIn(d, '.github/PULL_REQUEST_TEMPLATE.md', 'yeni\n')],
    ['content/ altı .md', (d: string) => writeIn(d, 'content/a.md', 'x\n')],
    ['messages/ altı', (d: string) => writeIn(d, 'messages/en.json', '{}\n')],
    ['src/ altı .md (kod dizini)', (d: string) => writeIn(d, 'src/lib/z.md', 'x\n')],
  ])('K2: %s tam gate', (_name, change) => {
    expect(classify(change).status).toBe(1);
  });

  it('karışık fark (docs + bir kod dosyası) tam gate', () => {
    expect(
      classify((d) => {
        writeIn(d, 'docs/rapor.md', 'x\n');
        writeIn(d, 'src/lib/x.ts', 'export const x = 2\n');
      }).status,
    ).toBe(1);
  });
});

// ---- gate-lock: önbellek kaydı, kirli ağaç, kuyruk ----

describe('gate önbelleği (FO-348 K3, K5)', () => {
  let root: string;
  let repo: string;
  let binDir: string;
  let passDir: string;
  let lockDir: string;
  let fakeLog: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'gate-cache-root-'));
    repo = path.join(root, 'repo');
    binDir = path.join(root, 'bin');
    passDir = path.join(root, 'pass');
    lockDir = path.join(root, 'lock');
    fakeLog = path.join(root, 'fake-pnpm.log');
    mkdirSync(repo);
    mkdirSync(binDir);
    // Kod değişikliği: tam gate yolu (kısa yol yok).
    git(repo, 'init', '-q', '-b', 'main');
    writeIn(repo, 'pnpm-lock.yaml', 'lockfile-v1\n');
    writeIn(repo, 'src/lib/x.ts', 'export const x = 1\n');
    commit(repo, 'base');
    git(repo, 'branch', 'base');
    writeIn(repo, 'src/lib/x.ts', 'export const x = 2\n');
    commit(repo, 'feat');
    writeFileSync(path.join(binDir, 'pnpm'), '#!/bin/sh\necho run >> "$FAKE_PNPM_LOG"\nexit "${FAKE_GATE_EXIT:-0}"\n');
    execFileSync('chmod', ['+x', path.join(binDir, 'pnpm')]);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function env(extra: Record<string, string> = {}) {
    return cleanEnv({
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
      FAKE_PNPM_LOG: fakeLog,
      FONBRIDGE_GATE_LOCK_DIR: lockDir,
      FONBRIDGE_GATE_PASS_DIR: passDir,
      FONBRIDGE_GATE_BASE: 'base',
      ...extra,
    });
  }

  function gate(extra: Record<string, string> = {}) {
    return spawnSync(process.execPath, [LOCK, 'pnpm', 'run', 'gate:core'], { cwd: repo, encoding: 'utf8', env: env(extra) });
  }

  // Sahte gate kaç kez koştu?
  function runs(): number {
    try {
      return readFileSync(fakeLog, 'utf8').split('\n').filter(Boolean).length;
    } catch {
      return 0;
    }
  }

  function records(): string[] {
    try {
      return readdirSync(passDir).filter((f) => !f.includes('.tmp'));
    } catch {
      return [];
    }
  }

  function tree(): string {
    return git(repo, 'rev-parse', 'HEAD^{tree}');
  }

  // A koşusunun yazacağı kaydın birebir aynısı (tree + lockfile hash), elle tohumlanır.
  function seedRecord() {
    mkdirSync(passDir, { recursive: true });
    const lockHash = crypto.createHash('sha256').update(readFileSync(path.join(repo, 'pnpm-lock.yaml'))).digest('hex');
    writeFileSync(
      path.join(passDir, tree()),
      JSON.stringify({ tree: tree(), lockHash, date: new Date().toISOString(), gateExit: 0, log: null, command: 'pnpm run gate:core' }),
    );
  }

  it('kırmızı koşu kayıt yazmaz; bir sonraki koşu yeniden koşar', () => {
    const r1 = gate({ FAKE_GATE_EXIT: '1' });
    expect(r1.status).toBe(1);
    expect(records()).toEqual([]);
    const r2 = gate({ FAKE_GATE_EXIT: '1' });
    expect(r2.status).toBe(1);
    expect(r2.stdout).not.toContain('önbellek:');
    expect(runs()).toBe(2);
  });

  it('yeşil ve temiz koşu kayıt yazar; aynı tree ikinci kez tam gate koşmaz', () => {
    const r1 = gate({ FAKE_GATE_EXIT: '0' });
    expect(r1.status).toBe(0);
    expect(records()).toEqual([tree()]);
    const r2 = gate({ FAKE_GATE_EXIT: '0' });
    expect(r2.status).toBe(0);
    expect(r2.stdout).toContain('önbellek:');
    expect(runs()).toBe(1);
  });

  it('K3: kirli ağaçta yeşil koşu kayıt yazmaz', () => {
    writeIn(repo, 'scratch.txt', 'untracked\n');
    const r = gate({ FAKE_GATE_EXIT: '0' });
    expect(r.status).toBe(0);
    expect(records()).toEqual([]);
  });

  it('K3: kirli ağaçta mevcut kayıt okunmaz (tam gate koşar)', () => {
    seedRecord();
    writeIn(repo, 'scratch.txt', 'untracked\n');
    const r = gate({ FAKE_GATE_EXIT: '0' });
    expect(r.stdout).not.toContain('önbellek:');
    expect(runs()).toBe(1);
  });

  it('K3: cache CLI "hit" kirli ağaçta çıkış 1 döner', () => {
    seedRecord();
    const clean = spawnSync(process.execPath, [CACHE, 'hit'], { cwd: repo, encoding: 'utf8', env: env() });
    expect(clean.status).toBe(0);
    writeIn(repo, 'scratch.txt', 'untracked\n');
    const dirty = spawnSync(process.execPath, [CACHE, 'hit'], { cwd: repo, encoding: 'utf8', env: env() });
    expect(dirty.status).toBe(1);
  });

  it('K4: kuyrukta beklerken aynı tree için kayıt yazılırsa kilit alındıktan sonra tam gate koşmaz', async () => {
    // Önden koşan gate'in kilidi: canlı bir süreç sahip. Sahip ölünce kilit bayatlar.
    const holder = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    try {
      mkdirSync(lockDir);
      writeFileSync(path.join(lockDir, 'owner.json'), JSON.stringify({ pid: holder.pid, cwd: '/x', branch: 'x', command: 'x', startedAt: new Date().toISOString() }));

      const child = spawn(process.execPath, [LOCK, 'pnpm', 'run', 'gate:core'], { cwd: repo, env: env({ FAKE_GATE_EXIT: '0' }) });
      let stdout = '';
      child.stdout.on('data', (d) => (stdout += d));
      child.stderr.on('data', (d) => (stdout += d));
      const exited = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));

      // B sıraya girip beklemeye başlasın.
      for (let i = 0; i < 100 && !stdout.includes('⏳'); i++) await new Promise((r) => setTimeout(r, 100));
      expect(stdout).toContain('⏳');

      // A'nın yazacağı yeşil kayıt (aynı tree + lock), sonra sahip ölür: B kilidi alır.
      seedRecord();
      holder.kill();

      const code = await exited;
      expect(code).toBe(0);
      expect(stdout).toContain('kuyrukta beklerken yazıldı');
      expect(runs()).toBe(0);
      expect(existsSync(lockDir)).toBe(false);
    } finally {
      holder.kill();
    }
  }, 30_000);
});

// ---- NG-72: FONBRIDGE_GATE_NO_CACHE=1 önbellek ve belge-yalnız kısa yolunu kapatır; gate-isolated komutsuz yolda uygular ----

describe('FONBRIDGE_GATE_NO_CACHE=1 kısa yolu kapatır (NG-72)', () => {
  let root: string;
  let repo: string;
  let binDir: string;
  let passDir: string;
  let dockerLog: string;
  let pnpmLog: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'gate-nocache-root-'));
    repo = path.join(root, 'repo');
    binDir = path.join(root, 'bin');
    passDir = path.join(root, 'pass');
    dockerLog = path.join(root, 'docker.log');
    pnpmLog = path.join(root, 'pnpm.log');
    mkdirSync(repo);
    mkdirSync(binDir);
    // Betikler gerçek kopyası: gate-isolated.sh kendi deposunu (`dirname/..`) referans alır.
    mkdirSync(path.join(repo, 'scripts'));
    for (const f of ['gate-isolated.sh', 'gate-cache.mjs']) {
      writeFileSync(path.join(repo, 'scripts', f), readFileSync(path.join(scripts, f)));
    }
    git(repo, 'init', '-q', '-b', 'main');
    writeIn(repo, 'pnpm-lock.yaml', 'lockfile-v1\n');
    writeIn(repo, 'src/lib/x.ts', 'export const x = 1\n');
    writeIn(repo, 'docs/README.md', 'belge\n');
    commit(repo, 'base');
    git(repo, 'branch', 'base');
    git(repo, 'checkout', '-q', '-b', 'feat');
    // Yalnız belge değişikliği: belge-yalnız kısa yolu bu koşuda geçerli olurdu.
    writeIn(repo, 'docs/notlar.md', 'yeni\n');
    commit(repo, 'feat');
    // Sahte docker: konteyner açılamaz (izole yolun başladığını kanıtlar, gerçek konteyner yok). Sahte pnpm: çağrıyı kaydeder.
    writeFileSync(path.join(binDir, 'docker'), `#!/bin/sh\necho "docker $*" >> "${dockerLog}"\nexit 1\n`);
    writeFileSync(path.join(binDir, 'pnpm'), `#!/bin/sh\necho "pnpm $*" >> "${pnpmLog}"\nexit 0\n`);
    execFileSync('chmod', ['+x', path.join(binDir, 'docker'), path.join(binDir, 'pnpm')]);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function env(extra: Record<string, string> = {}) {
    return cleanEnv({
      PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
      FONBRIDGE_GATE_BASE: 'base',
      FONBRIDGE_GATE_PASS_DIR: passDir,
      ...extra,
    });
  }

  function skippable(extra: Record<string, string> = {}) {
    return spawnSync(process.execPath, [path.join(repo, 'scripts', 'gate-cache.mjs'), 'skippable'], { cwd: repo, encoding: 'utf8', env: env(extra) });
  }

  function isolated(extra: Record<string, string> = {}) {
    return spawnSync('bash', [path.join(repo, 'scripts', 'gate-isolated.sh')], { cwd: repo, encoding: 'utf8', env: env(extra) });
  }

  function read(file: string): string {
    try {
      return readFileSync(file, 'utf8');
    } catch {
      return '';
    }
  }

  // Koşunun yazacağı kaydın birebir aynısı (HEAD tree + lockfile hash), elle tohumlanır.
  function seedRecord() {
    mkdirSync(passDir, { recursive: true });
    const tree = git(repo, 'rev-parse', 'HEAD^{tree}');
    const lockHash = crypto.createHash('sha256').update(readFileSync(path.join(repo, 'pnpm-lock.yaml'))).digest('hex');
    writeFileSync(path.join(passDir, tree), JSON.stringify({ tree, lockHash, date: new Date().toISOString(), gateExit: 0, log: null, command: 'pnpm run gate:core' }));
  }

  it('ön koşul: yalnız-belge farkında NO_CACHE yokken belge-yalnız kısa yolu geçer (0)', () => {
    expect(skippable().status).toBe(0);
  });

  it('NO_CACHE=1 iken belge-yalnız kısa yolu kapalı: skippable 1 döner', () => {
    const r = skippable({ FONBRIDGE_GATE_NO_CACHE: '1' });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('FONBRIDGE_GATE_NO_CACHE=1');
  });

  it('NO_CACHE=1 iken yeşil önbellek kaydı yok sayılır: skippable 1 döner', () => {
    seedRecord();
    expect(skippable().status).toBe(0);
    expect(skippable({ FONBRIDGE_GATE_NO_CACHE: '1' }).status).toBe(1);
  });

  it('komutsuz + NO_CACHE=1: izole DB yolu koşar (konteyner başlatılır), pnpm gate doğrudan koşmaz', () => {
    seedRecord();
    const r = isolated({ FONBRIDGE_GATE_NO_CACHE: '1' });
    expect(r.stdout).toContain('starting');
    expect(read(dockerLog)).toContain('docker run');
    expect(read(pnpmLog)).toBe('');
    expect(r.status).not.toBe(0);
  });

  it('komutsuz + kısa yol (NO_CACHE yok): geçiş çıktıda açıkça yazılır ve pnpm gate koşar', () => {
    const r = isolated();
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('belge-yalnız');
    expect(read(pnpmLog)).toContain('pnpm gate');
    expect(read(dockerLog)).toBe('');
  });

  // NG-72 regresyonu (crw2 bulgu 1): scripts/ sembolik bağlantıysa ve Node ana modülü symlink'i çözmüyorsa
  // gate-cache.mjs main() koşmaz, boş çıktıyla 0 döner. Bu "kısa yol" sayılmamalı: izole yol koşmalı (fail-closed).
  it('regresyon: scripts/ sembolik bağlantı + --preserve-symlinks-main: boş skippable çıktısı kısa yol sayılmaz, izole yol koşar', () => {
    const real = path.join(repo, 'real-scripts');
    renameSync(path.join(repo, 'scripts'), real);
    symlinkSync(real, path.join(repo, 'scripts'));
    const nodeOpts = '--preserve-symlinks-main';
    const sk = spawnSync(process.execPath, [path.join(repo, 'scripts', 'gate-cache.mjs'), 'skippable'], { cwd: repo, encoding: 'utf8', env: env({ NODE_OPTIONS: nodeOpts }) });
    expect(sk.stdout).toBe(''); // kanıt: CLI koruması eşleşmedi, çıktı yok
    const r = isolated({ NODE_OPTIONS: nodeOpts });
    expect(r.stdout).not.toContain('kısa yol');
    expect(r.stdout).toContain('starting');
    expect(read(dockerLog)).toContain('docker run');
    expect(read(pnpmLog)).toBe('');
  });
});
