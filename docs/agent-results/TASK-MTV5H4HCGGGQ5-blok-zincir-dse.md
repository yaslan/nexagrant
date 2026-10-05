# TASK-MTV5H4HCGGGQ5 — Seçenek B: tek tip adı, ölü kapsamsız formların sökümü

**Ajan:** blok-zincir-dse (Designer / Opus 5) · **Tip:** refactor (tip birleştirme + ölü kod) · **Sprint:** S12
**Commit:** `1e3dd946` · **Şartname:** kendi spike raporum `docs/agent-results/TASK-MTV4ZJEECXNDE-blok-zincir-dse.md` §2.5, §2.6, §3
**Bağımlılık:** TASK-MTV5GFB75N43S (`cc05f3a`) — kapandı, bu kart onun üstüne bindi
**Platform:** macOS (Darwin 25.6.0) — "Platform beyanı" başlığına bakın

## 1. Ne yapıldı

Spike'ın §3 "Uygulama planı"nın birebir uygulaması. Beş madde, hepsi tamam:

**(1) `TenantTx` yorumu güçlendirildi, MARKA EKLENMEDİ.** `src/lib/db.ts`'de tipin
üstüne, tipin kendisinin söyleyemediği şey yazıldı: garanti **yapısaldır, nominal
değildir** — çıplak `prisma` bu tipi karşılar ve derlenir, `scripts/rescore-g0.ts`
bugün tam olarak bunu yapıyor. Yorum, nominal kapının TASK-MTV5E5PUAJYSS'te
olduğunu ve neden ayrıldığını (19 argüman konumunun 13'ü `as unknown as` ile hem
yapısal hem nominal denetimin dışında) ölçümün durduğu yere işaret ederek söylüyor.
Yanlış güvence tipte değil yorumda kapatıldı — kartın istediği buydu.

**(2) `TenantScopedDb` silindi.** `scoring.ts:21`'deki tanım, `Prisma.TransactionClient`'ın
elle yazılmış kopyasıydı (`Omit` listesi Prisma'nın kendi `ITXClientDenyList`'iyle aynı
işi yapıyordu). Aynı şeklin üç adı vardı; ikisi gitti:

| Ad | Nerede | Durum |
|---|---|---|
| `TenantTx` | `src/lib/db.ts` | **tek kaynak, kaldı** |
| `TenantScopedDb` | `src/modules/m6/server/scoring.ts:21` | **silindi** |
| `type Client = TenantTx` | `src/lib/scoring/g0-compute.ts:63` | **silindi** (madde 4) |

`scoring.ts` + `comparison.ts` artık `TenantTx`'i `@/lib/db`'den alıyor; 19 parametre
konumunun tamamı çevrildi. `PrismaClient` importu `scoring.ts`'te gereksiz kaldı, silindi.
Depo genelinde `TenantScopedDb` **0 referans**.

**(3) 4 string-öncelikli aşırı yükleme ve `typeof dbOr… === 'string'` dalları silindi.**
Spike §2.6 bu formun gerçek çağıran sayısını **0** ölçmüştü (kalan hitler iki doküman
yorumu ve derlemenin *başarısız olmasını* bekleyen negatif testler). `dbOr*` adı depoda
kalmadı (`dbOrCriterionId`, `dbOrEvaluationId`: 0 referans). Silinen dallarla birlikte,
kendisine zaten bir işlem verilmiş bir fonksiyonun içinden yeni bir işlem açan son iki
`withTenant()` çağrısı da gitti.

**(4) `type Client = TenantTx` kaldırıldı** (yorumla gerekçelendirme değil, silme
seçildi): bu kartın işi zaten "aynı şeklin üç adını bire indirmek"; üçüncü adı yorumla
savunmak kartın kendi gerekçesiyle çelişirdi. 6 kullanım yeri doğrudan `TenantTx` oldu.

**(5) İki ölü fonksiyon silindi** (0-çağıran hâli korunmadı):
- `getCalibrationMatrix` (`scoring.ts:640`) — 0 çağıran.
- `validateReviewersTenant` (`comparison.ts:208`) — 0 çağıran.

Silerken iki doküman yorumu yalan söyler hâle geldi, ikisi de düzeltildi:
`scoring.ts:24`'teki formül-tekilleştirme notu artık "since-deleted" diyor, ve
`src/modules/m6/server/__tests__/comparison.test.ts:7`'deki
"`validateReviewersTenant` … actions.test.ts'te entegrasyon testiyle kapsanıyor"
cümlesi **doğru değildi** — öyle bir çağıran hiç olmamıştı; yorum bunu artık söylüyor.

**Davranış değişikliği yok:** hiçbir sorgu, `where` cümlesi ya da dönüş tipi kımıldamadı.
`getScoreDistribution` db-formunun ilan ettiği `Record<ScoreValue, number>` dönüş tipi
korundu (implementasyon `Record<number, number>` döndürüyor ve buna atanabilir) — birleştirmede
gözden kaçarsa kamuya açık tipi daraltacak tek yer burasıydı.

**Ölçü:** 8 dosya, **+89 / −228 satır** (net −139).

## 2. Kanıt

### 2.1 EN BÜYÜK RİSK — `@ts-expect-error`'lar boşa düştü mü? Hayır, mutasyonla kanıtlandı

Kartın işaret ettiği risk: string formu silindikten sonra
`tests/modules/m6/scoring-tenant-scope.test.ts`'teki her `@ts-expect-error` hâlâ **bir tip
hatasına oturmalı**; biri boşa düşerse `tsc` TS2578 der. Önce durumu ölçtüm:

```
$ pnpm typecheck 2>&1 | grep -c "TS2578"
0
```

Ama "0" tek başına zayıf kanıttır — muhafız yük taşıyor mu? **Mutasyon:** dört fonksiyonun
hepsinde `tenantId`'yi yeniden opsiyonel yaptım:

```
$ pnpm typecheck 2>&1 | grep TS2578
tests/modules/m6/comparison-tenant-scope.test.ts(67,5): error TS2578: Unused '@ts-expect-error' directive.
tests/modules/m6/scoring-tenant-scope.test.ts(51,5): error TS2578: Unused '@ts-expect-error' directive.
tests/modules/m6/scoring-tenant-scope.test.ts(56,5): error TS2578: Unused '@ts-expect-error' directive.
tests/modules/m6/scoring-tenant-scope.test.ts(61,5): error TS2578: Unused '@ts-expect-error' directive.
```

Bu dört satır tam olarak **db-formu** muhafızları (`(db, 'crit-1')`, `(db, 'eval-1')` …).
Yani hâlâ zorunlu `tenantId`'yi tutuyorlar — silme onları sessizce çürütmemiş. Diğer dört
muhafız (`('crit-1')`, `('eval-1')` …) TS2578 vermedi, çünkü **başka bir sebeple** hâlâ
hata: bir string `TenantTx` değil. Sekiz muhafızın sekizi de yük taşıyor, ama artık iki
farklı sebeple — bu yüzden yorum metinlerini de gerçeğe uydurdum ("a string is not a
TenantTx"), yoksa testin yorumu kodun yalanı olurdu.

Mutasyon geri alındı; sonrası temiz.

### 2.2 Typecheck ve birim testler

```
$ pnpm typecheck 2>&1 | grep -E "TS2578|modules/m6|lib/db|g0-compute"
(boş — dokunduğum hiçbir dosyada hata yok, hiçbir muhafız boşta değil)

$ npx vitest run tests/modules/m6
 Test Files  4 passed (4)
      Tests  44 passed (44)
```

Depo genelinde birim suite (yabancı worktree'ler hariç — §5.1):

```
$ npx vitest run --exclude '**/node_modules/**' --exclude '**/.claude/worktrees/**'
 Test Files  3 failed | 140 passed | 2 skipped (145)
      Tests  5 failed | 1691 passed | 8 skipped (1704)
 FAIL tests/brand-surfaces-render.test.tsx
 FAIL tests/document-exporter.test.ts
 FAIL tests/retired-brand-name.test.ts
```

Toplam test sayısı değişiklik öncesiyle **birebir aynı** (1704) — iki fonksiyon ve dört
aşırı yükleme silinirken hiçbir test düşmedi. 5 hatanın üçü de marka-adı yeniden
adlandırma işinin uçuşan hâli (§5.2), benim değil.

ESLint, tam olarak dokunduğum dosyalarda:

```
$ npx eslint src/modules/m6/server/scoring.ts src/modules/m6/server/comparison.ts \
    src/modules/m6/server/__tests__/comparison.test.ts src/lib/db.ts \
    src/lib/scoring/g0-compute.ts tests/modules/m6/
(boş — 0 error, 0 warning)
```

### 2.3 Silinen sembollerin artık hiçbir referansı yok

```
TenantScopedDb: 0        dbOrCriterionId: 0        dbOrEvaluationId: 0
getCalibrationMatrix: 1  ← yalnız scoring.ts:24'teki "since-deleted" doküman notu
validateReviewersTenant: 1 ← yalnız comparison.test.ts:7'deki düzeltilmiş doküman notu
```

### 2.4 GERÇEK e2e — M6 mutlu yolu kırılmadı (gerçek tarayıcı, gerçek DB)

Ana ağaçta koşulamadı: komşu bir ajanın dev sunucusu :3000'i tutuyor ve `414e705`
`reuseExistingServer`'ı kapattı; Next 16 aynı dizinde ikinci dev sunucusunu reddediyor.
Kardeş süreçleri **öldürmek yasak**, o yüzden kendi hafızamdaki tarifle
(`fabrika-parallel-dev-server-needs-a-worktree`) **izole** bir worktree kurdum:
`git worktree add --detach` (kendi commit'im `1e3dd946`), `node_modules` + `.env`
symlink, **kendi portum 3200**, `next dev --webpack` (turbopack kök-dışı symlink'i
reddediyor — tarifin atladığım detayı buydu).

```
Running 6 tests using 1 worker
  ✓  1 g0-computed-score.spec.ts:78  › the screen shows the computed score, and says so when it cannot be computed (9.5s)
  ✓  2 g0-computed-score.spec.ts:200 › two opportunities on one topic keep their own score (5.7s)
  ✓  3 m6-evaluator.spec.ts:49       › a seated reviewer scores a proposal and sees it on the dashboard (4.5s)
  ✓  4 m6-evaluator.spec.ts:160      › the English locale renders the English M6 copy (2.8s)
  ✓  5 m6-evaluator.spec.ts:197      › the Evaluator Lens page states it is an internal pre-assessment (tr) (4.2s)
  ✓  6 m6-evaluator.spec.ts:197      › … (en) (2.7s)
  6 passed (30.6s)
```

`g0-computed-score` özellikle önemli: `g0-compute.ts` bu kartta değişti ve o dosya
**gerçek puan yazma yolunun** tek yeri. Gerçek tıklama, gerçek Postgres, gerçek tohum.

Temizlik kanıtı: sunucumu (yalnız kendi portumdaki süreç) durdurdum, symlink'leri sildim,
`git worktree remove --force` + `prune`. Komşuların iki worktree'si ve :3100'deki
sunucusu **dokunulmadan** duruyor:

```
$ lsof -ti tcp:3200 | wc -l   → 0   (benim sunucum gitti)
$ lsof -ti tcp:3100 | wc -l   → 1   (komşununki yaşıyor)
```

### 2.5 Kapının kalan ayakları

`1e3dd946` üzerinde:

| Aşama | Sonuç |
|---|---|
| `lint` (dokunduğum dosyalar) | ✅ 0/0 |
| `typecheck` | ✅ dokunduğum dosyalarda 0 hata, TS2578 yok |
| `test` (birim) | ✅ m6 44/44; depo 1691/1704 (5 hata marka işinden, §5.2) |
| `i18n:check` | ✅ iki katalog uyuşuyor |
| `rls:check` | ✅ 44 modelin hepsinde politika kayıtlı |
| `rls:verify` | ✅ izolasyon `fabrika_app` rolüyle GERÇEKTEN ölçüldü |
| `test:e2e` (M6+G0 mutlu yol) | ✅ 6/6, izole worktree'de (§2.4) |
| `test:e2e` (tam suite) | ⛔ ana ağaçta **koşulamadı** — :3000 komşuda; §5.3 |

Pre-commit hook `1e3dd946`'da: `→ eslint (staged files)` + `→ tsc --noEmit` →
`✓ Kapı temiz (staged kapsamı).`

## 3. Değişen dosyalar

| Dosya | Δ | Ne |
|---|---|---|
| `src/modules/m6/server/scoring.ts` | −151/+? | `TenantScopedDb` tanımı, 3 string aşırı yükleme, `getCalibrationMatrix` |
| `src/modules/m6/server/comparison.ts` | −68 | string aşırı yükleme, `validateReviewersTenant`, `TenantTx`'e geçiş |
| `src/lib/db.ts` | +23 | `TenantTx` yorumu (yapısal≠nominal) |
| `src/lib/scoring/g0-compute.ts` | 12 | `type Client` silindi, 6 kullanım `TenantTx` |
| `src/modules/m6/server/__tests__/comparison.test.ts` | 6 | yanlış doküman notu düzeltildi |
| `tests/modules/m6/scoring.test.ts` | 18 | `TenantTx`'e geçiş |
| `tests/modules/m6/scoring-tenant-scope.test.ts` | 28 | `TenantTx` + muhafız yorumları gerçeğe uyduruldu |
| `tests/modules/m6/comparison-tenant-scope.test.ts` | 11 | aynı |

**Toplam: 8 dosya, +89 / −228.** `scripts/rescore-g0.ts`'ye DOKUNULMADI (A kartının konusu).

## 4. ÖNCEKİ KARTIMDA BİLDİRDİĞİM BULGUNUN DÜZELTMESİ (önemli)

`docs/agent-results/TASK-MTV5GFB75N43S-blok-zincir-dse.md` §5.1'de, 13 fatura e2e'sinin
503 vermesini "`.env`'de `INVOICE_SUPPLIER_*` yok, yerel ortam kurulumu boşluğu" diye
raporlamış ve `.env`'e sekiz anahtar eklenmesini önermiştim. **Bu teşhis eksikti ve
önerisi yanlıştı.** İzole worktree'de kesin ölçüm:

```
# sunucu supplier değişkenleri OLMADAN başlatıldı
  2 failed  (invoice-write-path.spec.ts:131, :192)

# AYNI kod, AYNI commit — sunucu supplier değişkenleriyle başlatıldı
  ✓ 1 a tenant with no billing identity is paid-up but not invoiced (70ms)
  ✓ 2 a payment issues one invoice, and the export route serves it (1.4s)
  ✓ 3 a redelivered webhook does not issue a second invoice (7ms)
  ✓ 4 two concurrent payments get two distinct numbers (47ms)
  4 passed (2.4s)
```

Sebep kodda da `.env`'de de değil: **`playwright.config.ts` bu değişkenleri zaten kendi
başlattığı web sunucusuna enjekte ediyor** (`testEnv` bloğu, TASK-MTU26XBVZ6H1O). Kırmızı,
`reuseExistingServer: true` iken testlerin **başkasının başlattığı, bu değişkenleri
taşımayan** dev sunucusuna bağlanmasından geliyordu. `414e705` ("disable
reuseExistingServer to prevent stale dev server env loss") tam olarak bunu düzeltti.
`.env`'e anahtar eklemek gereksizdi ve gerçek ortam değerlerini yerel dosyaya yazdırma
riski taşıyordu. Önerimi geri çekiyorum.

Kanıt dosyaları bu depoda **bir kez yazılır** (pre-commit hook bunu zorluyor — ana raporu
düzenlemeye çalıştım, kapı haklı olarak durdurdu), o yüzden düzeltme ana raporun içine
değil kendi dosyasına yazıldı:
`docs/agent-results/TASK-MTV5GFB75N43S-blok-zincir-dse-2.md`.

## 5. Riskler ve yolda görülen bitişik sorunlar (DÜZELTİLMEDİ, adıyla bildiriliyor)

1. **Depo İÇİNE açılmış iki yabancı worktree `pnpm test` ve `pnpm lint`'i anlamsız
   kılıyor.** `.claude/worktrees/e2e-fix/` ve `.claude/worktrees/zztest-validation/`
   depo ağacının içinde duruyor ve hem vitest hem eslint onları gezip **ikinci ve üçüncü
   kez** tarıyor:
   ```
   $ pnpm test   → Test Files 75 failed | 354 passed (435)   ← 435 dosya!
   (yabancı worktree'ler hariç tutulunca)  → 145 dosya, gerçek sayı
   $ pnpm lint   → ✖ 17079 problems (1456 errors, 15623 warnings)
   ```
   Yani **`pnpm gate` bugün bu makinede yapısal olarak kırmızı** ve 287 "hata" gerçek
   değil. Benim worktree'im depo dışında (`/private/tmp/...`) ve iş biter bitmez
   kaldırıldı — tarifin bu yüzden `$SCRATCH` dediğini şimdi daha iyi anlıyorum.
   **Öneri:** ya worktree'ler depo dışına alınsın, ya `.claude/` vitest/eslint
   `exclude` listesine eklensin. Kapsamım dışı, dokunmadım.
2. **Marka-adı birim testleri (5 hata / 3 dosya)** — `tests/brand-surfaces-render.test.tsx`,
   `tests/document-exporter.test.ts`, `tests/retired-brand-name.test.ts`. Devam eden
   FonBridge yeniden adlandırma işi (`4a33249`, `9af3f63`). Benim değil, dokunmadım.
3. **Tam e2e suite ana ağaçta koşulamadı** — :3000'i komşu tutuyor, `414e705`
   `reuseExistingServer`'ı kapattı, Next 16 aynı dizinde ikinci sunucuya izin vermiyor.
   M6+G0 mutlu yolunu izole worktree'de koştum (§2.4); geri kalan spec'ler için
   "koşulamadı" diyorum, "geçti" demiyorum.
4. **Kalan risk (bu kart):** `TenantTx` hâlâ yapısal. Çıplak `prisma` derlenir;
   `scripts/rescore-g0.ts:73,97` bunu bugün yapıyor. Bu kart bunu **bilerek**
   kapatmadı — TASK-MTV5E5PUAJYSS'in konusu — ve yorum artık bunu okuyana açıkça
   söylüyor. Yani boşluk kapanmadı, **görünür** hâle geldi.
5. **`checkNoDuplicateScore`** (önceki karttan devreden gözlem): sorgusunda hiç kiracı
   koşulu yok, izolasyonun tamamı çağıranın verdiği tx'e emanet. Hâlâ öyle, hâlâ kapsam dışı.

## 6. Açık sorular

- Madde 5.1: worktree'leri `.claude/` altında tutmak isteniyorsa vitest/eslint `exclude`
  listesine `.claude/**` eklenmeli mi? Bu, `pnpm gate`'in bugünkü yapısal kırmızısını
  tek satırda çözer ama kapının kapsamını değiştirir — karar liderin.
- `type Client` gibi yerel okunabilirlik aliaslarına dair genel bir kural var mı? Bu
  kartta sildim; başka modüllerde benzerleri olabilir.

## 7. Sonraki adım

**TASK-MTV5E5PUAJYSS (Seçenek A — markalama).** Bu kart onu ucuzlattı: markalanacak
yüzey artık **tek** bir tip (`TenantTx`), `TenantScopedDb` ve `Client` ortadan kalktı,
ve `db.ts`'deki yorum markanın nereye (— `withTenantOn`, `set_config` satırının yanına —)
basılacağını ve neyi kaçıracağını (19 konumun 13'ü `as unknown as`) yazılı bırakıyor.
Spike'ın ölçtüğü 3 typecheck hatasının 2'si (`scripts/rescore-g0.ts:73,97`) hâlâ orada ve
o kartın asıl kararı bu ikisi.

## Platform beyanı

**macOS (Darwin 25.6.0, arm64) üzerinde doğrulandı** — birim testler, typecheck, lint ve
gerçek tarayıcılı e2e (Chromium, izole worktree, port 3200) dahil.

Dokunulan kod yolu (`scoring.ts`, `comparison.ts`, `db.ts` tip yorumu,
`g0-compute.ts` alias) saf TypeScript'tir: süreç öldürme, dosya yolu, kabuk/ikili adı,
kısayol metni, ekran/DPI ya da cihaz izni içermez. Platforma bağlı hiçbir dal yok,
dolayısıyla Windows ve Linux'ta **koddan** aynı davranış beklenir.

**Koşulamayanlar, sebebiyle:** Windows ve Linux — bu ofiste yalnız macOS makinesi var.
Ana ağaçta tam `pnpm gate` — :3000 komşu ajanda ve kardeş süreç öldürmek yasak (§5.3);
ayrıca depo içi yabancı worktree'ler yüzünden `pnpm test`/`pnpm lint` bugün yapısal
olarak kırmızı (§5.1). Sessiz atlama yok — beyan budur.

Not: doğrulama sırasında kullandığım izole worktree ve dev sunucusu **yalnız kendi
doğurduğum süreçlerdi** ve iş bitince kaldırıldı; komşuların worktree'lerine ve
:3100'deki sunucusuna dokunulmadı (§2.4'teki `lsof` kanıtı).
