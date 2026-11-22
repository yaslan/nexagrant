# E2E testleri — paylaşılan ağaçta paralel koşu

Bu dosya tek bir soruyu cevaplar: **aynı depoda birden fazla kişi/ajan aynı anda
Playwright koşarken kendi dev sunucusunu nasıl alır?** Cevap `git worktree` +
`next dev --webpack`; gerekçesi ve tuzakları aşağıda.

> Ölçümler `docs/agent-results/TASK-MTS6MFER9LQZR-geli-tirici.md` §4.5 ve
> `docs/agent-results/TASK-MTS9C07AQ6DNO-geli-tirici.md`'de.

## 1. Neden ayrı bir worktree gerekiyor

`playwright.config.ts` `webServer.command`'ı `pnpm dev --port $E2E_PORT`, ve
`reuseExistingServer: true`. Yani teoride herkes kendi portunu verip kendi sunucusunu
alır. Pratikte alamaz:

**Next 16 aynı dizinde ikinci bir `next dev`'e izin vermiyor.** Kilit
`<distDir>/dev/lock` dosyasında (`node_modules/next/dist/build/lockfile.js`), içinde
ilk sunucunun pid'i ve portu duruyor. İkinci sunucu — portu farklı olsa bile — şunu
basıp `exit 1` ile ölür:

```
⨯ Another next dev server is already running.
- Local:        http://localhost:3000
- PID:          50803
- Dir:          <repo-kökü>
You can access the existing server at http://localhost:3000,
or run kill 50803 to stop it and start a new one.
```

`next dev`'in `--dist-dir` seçeneği **yok** (`npx next dev --help`), `distDir` yalnız
`next.config.ts`'ten okunuyor — ve o dosya herkesin ortak dosyası, orayı kurcalamak
diğer koşuları bozar. Dolayısıyla kilidi ayırmanın tek temiz yolu **başka bir dizin**:
ayrı bir `git worktree`, kendi `.next`'i, kendi kilidi.

Yan faydası: worktree belirli bir commit'i sunar, yani diğer ajanların yarım kalmış
`src/` düzenlemeleri koşunun ortasında hot-reload'a girip ölçümü kirletmez.

## 2. Reçete

```bash
SC=<kendi scratchpad dizinin>            # oturuma özel, depo dışında
PORT=3120                                # KENDİ portun (başkasıyla çakışmasın)

# 1) HEAD'de bir worktree — detached, yani branch'i kimseden çalmaz
cd /path/to/fabrika
git worktree add --detach "$SC/wt" "$(git rev-parse HEAD)"

# 2) Bağımlılıklar ve ortam: kurulum tekrarlanmaz, symlink + kopya yeter
ln -s /path/to/fabrika/node_modules "$SC/wt/node_modules"
cp /path/to/fabrika/.env "$SC/wt/.env"

# 3) Dev sunucusu — WEBPACK ile (sebebi §3.1)
cd "$SC/wt" && npx next dev --port "$PORT" --webpack &

# 4) Testler ANA AĞAÇTAN koşar; yalnız tarayıcı worktree'nin sunucusuna bakar
cd /path/to/fabrika
E2E_PORT="$PORT" npx playwright test tests/e2e/<seninki>.spec.ts --output="$SC/out"
```

Spec'ler ve seed'ler ana ağaçtan yüklenir (senin düzenlemelerin anında geçerli),
uygulama kodu worktree'den servis edilir (o commit'te sabit). Ürün kodunda da
değişiklik yaptıysan o dosyayı worktree'ye kopyala ya da worktree'yi yeni commit'e al:

```bash
git -C "$SC/wt" checkout --detach "$(git rev-parse HEAD)"
```

Bitince temizle:

```bash
kill %1 2>/dev/null || lsof -ti :"$PORT" | xargs kill -9
git worktree remove --force "$SC/wt"
```

## 3. Tuzaklar

### 3.1 `--webpack` şart: Turbopack symlink'li node_modules'ü reddediyor

Worktree'de `node_modules` bir symlink ve hedefi proje kökünün dışında. Turbopack bunu
kabul etmiyor:

```
Error [TurbopackInternalError]: Symlink [project]/node_modules is invalid,
it points out of the filesystem root
```

İki çıkış var: `node_modules`'ü gerçekten kopyalamak (yavaş, GB'larca) ya da
`--webpack`. `--webpack` seçildi. Bedeli: ilk derleme Turbopack'ten yavaş — ilk
gezinilen rotada 10 sn'lik `expect` zaman aşımlarını aşabilir. Rotaları önceden
ısıtmak istersen `curl` ile bir kez çağır.

### 3.2 `test-results/` ortak: mutlaka `--output` ver

Playwright her koşunun başında `test-results/` dizinini **siler**. İki koşu aynı anda
olursa biri diğerinin trace/screenshot/`error-context.md` çıktısını süpürür — ölçtüğün
hatanın kanıtı elinde kalmaz. Her koşuda `--output=<scratchpad>/…` ver.

### 3.3 Postgres TEK: worktree veritabanını ayırmaz

Worktree yalnız *sunucuyu* ayırır. `.env` aynı, dolayısıyla veritabanı aynı. Paralel
koşular hâlâ birbirinin satırlarını görür. Buradan iki kural çıkıyor:

**Kural 1 — paylaşılan satırı değiştirme, kendi kiracını seed'le.** `demo-tenant`'ın
planını/modül durumunu geçici çevirip geri koymak `afterAll` doğru çalışsa bile
yanlıştır: geri koyma yalnız *arada kimse okumazsa* tutar, ve paralel koşuda "ara"
gerçek bir penceredir. Testin konusu olan durum teste ait olmalı.
Örnek: `scripts/seed-plan-e2e.ts` — biri kalıcı `ultra`, biri planı bilerek çevrilen
`flip` kiracısı.

**Kural 2 — seed eden temizler.** `seed()` çağıran her spec `afterAll`'da `rollback()`
çağırmak zorundadır. Aksi hâlde fikstür paylaşılan veritabanında birikir ve *başka*
spec'lerin sayımlarını kaydırır: `demo-workspace`'te geri alınmayan iki fırsat, panoya
ait bir e2e'yi 5 → 7 fırsat kaydırıp "%20.0 → %14.3" diye kırmızıya düşürmüştü
(TASK-MTS6MFER9LQZR §2.2). İnceleme için bırakmak isteyen `<FIXTURE>_KEEP=1` kullanır:

```ts
test.afterAll(async () => {
  if (process.env.F10_E2E_KEEP !== '1') await rollback();
  await prisma.$disconnect();
});
```

Dosya kapsamında birden çok `describe` aynı fikstürü seed ediyorsa `test.afterAll`'ı
**dosya kapsamına** koy — hepsinden sonra bir kez koşar
(`tests/e2e/fabricated-fallbacks.spec.ts`).

### 3.4 `waitForLoadState('networkidle')` kullanma

"500 ms boyunca istek yok" bir dev sunucusunda hiç gerçekleşmiyor; yüklü makinede
doğrudan 60 sn'lik test zaman aşımına dönüyor. Ölçüm: dört spec, aynı kod —
`networkidle` varken **11.3 dk / 2 timeout**, kaldırıldıktan sonra **22 sn / 0 hata**.
Yerine beklediğin şeyi bekle (locator, `waitForURL`); Playwright'ın auto-wait'i zaten
senkronizasyondur.

### 3.5 Ekran görüntülerini `docs/agent-results/` altına YAZMA

Her spec kendi yolunu elle tutuyordu:

```ts
const SHOTS = 'docs/agent-results/TASK-MTQZMLLZE1I29-screenshots';   // YANLIŞ
```

O dizinler **commit'li kanıt** dizinleri. Yani `pnpm test:e2e`, haftalar önce
kapanmış görevlerin kanıt karelerini üzerine yazıyordu: tek bir tam koşu 27 izlenen
dosyayı "değişmiş" bırakıyor, ve bunların hepsi PNG gürültüsü değil —
`TASK-MTQWBAJ2T5XSV-screenshots/02-empty-tenant-dashboard-en.png` 74 927 → 41 503
bayta düşmüştü, yani **başka bir ekran**. Sonradan koşan alakasız bir testin sessizce
değiştirebildiği şey kanıt değildir.

Doğrusu `tests/e2e/fixtures/shots.ts`:

```ts
import { shotsDir } from './fixtures/shots';
const SHOTS = shotsDir('TASK-MTQZMLLZE1I29-screenshots');   // → test-artifacts/… (git yok sayar)
```

Kareyi bir kartın klasörüne *yayımlamak* hâlâ mümkün, ama artık bilinçli bir
eylem — koşunun yan etkisi değil:

```bash
E2E_SHOTS_ROOT=docs/agent-results npx playwright test tests/e2e/seninki.spec.ts
```

Klasör adı olduğu gibi geçer, dolayısıyla yayımlanan kare her zamanki yoluna
düşer ve eski raporların bağlantıları çalışmaya devam eder. `shotsDir()` dizini
kendisi açar: `page.screenshot()` üst dizinleri yaratır ama `writeFileSync`
yaratmaz (`dashboard-outcome-case`'in CSV'si yalnızca commit'li klasör diskte
hazır olduğu için çalışıyordu).

Kontrol: tam bir e2e koşusundan sonra `git status --porcelain -- docs/agent-results`
hiçbir ` M` satırı göstermemeli.

### 3.6 Fikstür kullanıcısı önce var olmalı

Giriş şifresiz ve **tanımadığı e-postaya kullanıcı + kiracı + çalışma alanı yaratıyor**
(`src/lib/auth.ts` `authorize`). Seed'lemediğin bir adresle giriş yapan spec, planı
olmayan yepyeni bir kiracı ölçer ve sebebi görünmez. Fikstür kullanıcısını her zaman
seed et. (Depoda birikmiş `org-…` slug'lı kiracılar bu yolun kalıntısıdır.)

## 4. Fikstür seed'leri

| Script | Ne verir |
|---|---|
| `scripts/seed-plan-e2e.ts` | `plan-e2e-ultra-*` (kalıcı `ultra`) ve `plan-e2e-flip-*` (planı çevrilen) kiracılar, M10 ON |
| `scripts/seed-f10-e2e.ts` | `f10-empty-*` / `f10-full-*` — boş vs dolu çalışma alanı, M5+M6 ON, `full` `pro` planında |
| `scripts/seed-gate-e2e.ts` | `gate-e2e-tenant-a/b` — kiracı izolasyonu için iki kiracı, M5 ON |
| `scripts/seed-saved-search-e2e.ts` | `saved-search-e2e-*` — "Aramayı Kaydet"in yazdığı `SavedSearch` satırı kendi kiracısında kalsın diye (`alerts-daily` bu tabloyu kiracıdan bağımsız okur) |
| `scripts/seed-m6-e2e.ts`, `seed-g0-e2e.ts`, `seed-archive-e2e.ts`, `seed-relationship-e2e.ts` | ilgili modüllerin fikstürleri |

Hepsi aynı sözleşmeye uyar: sabit id'lere `upsert` (idempotent, iki kez koşulabilir) +
`--rollback` (yalnız o id'leri siler).

```bash
pnpm tsx scripts/seed-plan-e2e.ts             # kur
pnpm tsx scripts/seed-plan-e2e.ts --rollback  # kaldır
```
