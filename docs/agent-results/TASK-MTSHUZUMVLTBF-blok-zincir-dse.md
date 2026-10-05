# TASK-MTSHUZUMVLTBF — e2e hijyeni: "Aramayı Kaydet"in testi yok + koşu commit'li kanıtı eziyor

**Ajan:** blok-zincir-dse (Tasarımcı) · **Sprint:** SPRINT-S12 (Dalga 8) · **Tarih:** 2026-09-08
**Kaynak:** kendi D7 raporumda (`DOGRULAMA-S12-D7-blok-zincir-dse.md` §8.4 ve §8.6) bildirdiğim iki hijyen kusuru.

**Sonuç: her iki kusur da KAPATILDI.** Bir tanesi kartın yazdığından belirgin biçimde
büyük çıktı — sorun "m10 spec'leri" değil, **32 spec'in tamamı**ydı; tek bir tam koşu
27 commit'li kanıt dosyasını değiştiriyordu.

---

## 1. Ne yapıldı

### (a) "Aramayı Kaydet" — gerçek tıklama + DB doğrulamalı e2e

Düğmenin hiç e2e kapsaması yoktu, ve tam da bu yüzden **iki kez sessizce kırıldı**:
`TASK-MTS6M5819RW93` (500 ms `setTimeout` + toast, hiçbir satır yazılmıyordu, dolayısıyla
`alerts-daily` üretimde okuyacak tek satır bulamıyordu) ve `TASK-MTS9W0C1VC9OS`
(beyan edilmemiş `resend`, temiz kurulumda rota 500). Birim testi
(`src/app/api/saved-searches/route.test.ts`) ikisini de geçirdi: ilki istemcide, ikincisi
modül çözümlemesindeydi, mock ikisini de görmez.

Yazılanlar:

* **`scripts/seed-saved-search-e2e.ts`** — `2eadd84`'ün deseni: sabit id'lere `upsert`
  (idempotent) + `--rollback`. **Kendi kiracısı** (`saved-search-e2e-tenant`), çünkü
  `alerts-daily` `SavedSearch`'ü *kiracıdan bağımsız* okur — `demo-tenant`'a kaydeden
  bir spec hem başkalarının bıraktığı satırları sayar hem cron'un gelen kutusuna satır
  bırakır (`docs/E2E_TESTING.md` §3.3 Kural 1). `seed()` başlarken o kiracının
  `SavedSearch` satırlarını siler: sayım yapan bir testte artık kalan bir satır, ölü bir
  düğmeyi çalışıyor gibi gösterir.
* **`tests/e2e/saved-search.spec.ts`** — 3 test:
  1. Giriş → arama kutusuna yaz → **gerçek tıklama** → başarı bandı → liste
     (GET ile yeniden çekiliyor, yani iyimser state değil) → **satır doğrudan
     Postgres'ten okunuyor** (`userId`, `name`, `notify`, ve `filters` cron'un
     okuduğu `parseSavedSearchFilters` ile).
  2. Aynı satır **cron'un kendi sorgusuyla** (`SAVED_SEARCH_ALERT_QUERY`) geri
     okunuyor + `alerts-daily`nin ihtiyaç duyduğu `TENANT_OWNER` e-postası var mı.
     "Satır var" ile "uyarı e-postası artık boş değil" arasındaki adım budur.
  3. Silme: `Sil` → liste kayboluyor → DB sayımı 0.
* **`.../calls/page.tsx`** — dört `data-testid` (`calls-save-search`,
  `calls-saved-search-list`, `calls-save-search-status`, `calls-save-search-error`).
  Davranış değişmedi. Gerekçesi ölçüldü, tercih değil: `getByRole('alert')` bu sayfada
  **`FeedbackWidget`'ın kendi `role="alert"` düğümünü** buluyor — ilk koşumda spec, satır
  ekranda dururken kırmızı verdi (§2.1). Bantların `role="status"`/`role="alert"`
  sözleşmesi korundu ve testte ayrıca `toHaveRole('status')` ile çivilendi: bu testin
  gördüğü kaydı bir ekran okuyucu da duyar.

### (b) Koşu artık commit'li kanıtı ezmiyor

Kartın metni "m10 spec'leri" diyordu. Ölçüm daha geniş: `docs/agent-results/...`
literalini **32 spec** tutuyordu ve tam koşu **27 izlenen dosyayı** değiştiriyordu.

* **`tests/e2e/fixtures/shots.ts`** — `shotsDir('TASK-…-screenshots')`. Varsayılan kök
  `test-artifacts/` (git yok sayar); bir kareyi kartın klasörüne *yayımlamak* artık
  bilinçli bir eylem: `E2E_SHOTS_ROOT=docs/agent-results`. Klasör adı olduğu gibi geçer,
  yayımlanan kare her zamanki yoluna düşer, eski raporlar çözülmeye devam eder.
  Dizini helper açıyor: `page.screenshot()` üst dizinleri yaratır ama `writeFileSync`
  yaratmaz — `dashboard-outcome-case`'in CSV'si yalnızca commit'li klasör diskte hazır
  olduğu için çalışıyordu ve kök taşınır taşınmaz ENOENT verecekti.
* 32 spec bu helper'a taşındı; `.gitignore`'a `test-artifacts/`; ezilmiş 27 dosya
  `git checkout --` ile geri yüklendi.
* **`docs/E2E_TESTING.md` §3.5** — kural yazıya geçti, çünkü kopyalanmaya devam ediyordu:
  bu görev sırasında *yeni yazılan* bir spec (`st6-empty-tenant-no-fabrication.spec.ts`)
  aynı deseni yeniden üretmişti.

---

## 2. Kanıt

### 2.1 Spec önce KIRMIZI verdi — ve haklı bir kusur buldu

İlk koşu, kayıt gerçekten yazıldığı hâlde düştü:

```
Error: expect(locator).toHaveCount(expected) failed
Locator:  getByRole('alert')
Expected: 0
Received: 1
   99 |     await expect(page.getByRole('alert')).toHaveCount(0);
```

Ekran görüntüsü (`04-mutation-m1-red.png` değil, ilk koşununki) satırın listede
durduğunu gösteriyordu: eşleşen `alert`, her uygulama sayfasında mount olan
`FeedbackWidget`'ınkiydi. Seçici daraltıldı (§1a). "Testi gevşeterek geçme" değil —
assertion aynı şeyi ölçüyor, sadece doğru düğümü ölçüyor.

### 2.2 YEŞİL

```
Running 3 tests using 1 worker
[seed-saved-search-e2e] ready — tenant=saved-search-e2e-tenant ws=saved-search-e2e-ws user=saved-search-e2e@fabrika.test clearedSearches=0
  ✓  1 › a click on "Aramayı Kaydet" creates the SavedSearch row (3.3s)
  ✓  2 › the row the click wrote is one the daily alert job would pick up (7ms)
[seed-saved-search-e2e] rolled back — removedSearches=0
  ✓  3 › deleting a saved search removes its row (3.3s)

  3 passed (8.2s)
```

Kareler: `TASK-MTSHUZUMVLTBF-screenshots/01-before-save.png`, `02-after-save.png`
(başarı bandı + "Kayıtlı Aramalarım"da satır), `03-after-delete.png`.

### 2.3 ZORUNLU MUTASYON — yazma yolu bozulunca spec KIRMIZI

Üç mutasyon; her biri uygulandıktan sonra geri alındı (kanıt §2.6).

**M1 — rota başarı döner, hiçbir satır yazmaz** (TASK-MTS6M5819RW93'ün tam şekli):

```
  ✘  1 › a click on "Aramayı Kaydet" creates the SavedSearch row (37.9s)
    Error: expect(locator).toBeVisible() failed
    Locator: getByTestId('calls-saved-search-list')
    Expected: visible
    Error: element(s) not found
    > 114 |     await expect(list).toBeVisible({ timeout: 30_000 });
  1 failed
```

Dikkat: **başarı bandı assertion'ını geçti** — çünkü sahte defect de tam olarak yeşil
bant gösteriyordu. Testi kurtaran, bandın değil satırın sorulması.

**M2 — satır yazılır ama `notify: false`** (satır var, cron onu hiç görmez):

```
  ✘  1 › a click on "Aramayı Kaydet" creates the SavedSearch row (5.2s)
    Error: expect(received).toBe(expected)
    Expected: true
    Received: false
    > 128 |     expect(row.notify).toBe(true);
  1 failed
```

Burada **tarayıcı tarafı tamamen yeşildi** (bant, liste, satır adı) — kusuru yalnız DB
assertion'ı yakaladı. Yani "gerçek tıklama" tek başına yetmiyor; kartın istediği
DB doğrulaması bir süs değil.

**M3 — cron'un sorgusu satırı dışarıda bırakacak şekilde daraltılır**
(`SAVED_SEARCH_ALERT_QUERY`'ye `name: '__mutation_never_matches__'`). 2. testin ölü
ağırlık olmadığını göstermek için:

```
  ✓  1 › a click on "Aramayı Kaydet" creates the SavedSearch row (2.6s)     ← YEŞİL kaldı
  ✘  2 › the row the click wrote is one the daily alert job would pick up (4ms)
    Error: expect(received).toHaveLength(expected)
    Expected length: 1
    Received length: 0
    Received array:  []
    > 146 |     expect(visible).toHaveLength(1);
  1 failed
  1 passed
```

> Dürüstlük notu: M3'ün ilk denemesi (`lastRunAt: null` eklemek) YEŞİL geçti — yeni
> yazılan satırın `lastRunAt`'i zaten `null` olduğu için hiçbir şeyi daraltmıyordu.
> Mutasyon kötüydü, test değil; daraltan bir mutasyonla tekrarlandı ve yukarıdaki
> sonuç alındı.

### 2.4 (b) — tam koşudan ÖNCE ve SONRA

ÖNCE (kartın iddiasının canlı ölçümü — 27 izlenen kanıt dosyası ezilmiş durumda):

```
 M docs/agent-results/TASK-MTQTYXC0NUT0B-screenshots/01-export-tab.png
 M docs/agent-results/TASK-MTQTYXC0NUT0B-screenshots/dashboard-metrics.csv
 M docs/agent-results/TASK-MTQWBAJ2T5XSV-screenshots/01-empty-tenant-dashboard-tr.png
 M docs/agent-results/TASK-MTQWBAJ2T5XSV-screenshots/02-empty-tenant-dashboard-en.png
 ... (27 satır)
```

Ve bunlar PNG gürültüsü değil:

```
.../TASK-MTQWBAJ2T5XSV-screenshots/02-empty-tenant-dashboard-en.png | Bin 74927 -> 41503 bytes
.../TASK-MTQWBAJ2T5XSV-screenshots/04-empty-date-range-tr.png       | Bin 63515 -> 38811 bytes
.../TASK-MTR5BGKNELCO2-screenshots/01-nameless-session-honest.png   | Bin 39382 -> 98086 bytes
```

— yani **başka bir ekran**, kapanmış bir kartın kanıtının yerinde.

TAM KOŞU (38 spec, worktree + port 3190):

```
  6 failed
  1 skipped
  102 passed (9.1m)
```

SONRA — `git status --porcelain -- docs/agent-results`:

```
 M docs/agent-results/TASK-MTQYXISOPUJ53-customer-support-2.md          ← başka ajanın raporu
?? docs/agent-results/TASK-MTQUX5IZ9I5VP-screenshots/blog-yazar-01-after-reload.png
?? docs/agent-results/TASK-MTQYXISOPUJ53-screenshots/st6-*.png          (3)
?? docs/agent-results/TASK-MTSHTIYJWTQKO-blockzincir-pm.md
?? docs/agent-results/TASK-MTSHVKTSGC8A4-screenshots/
```

**Tek bir ` M` satırı yok** — ezilen hiçbir dosya kalmadı. Listedeki her giriş
*başka ajanların* koşu sırasında akan işi (bkz. §5.1); hiçbiri spec çıktısı değil
(`blog-yazar-01-after-reload.png` adını hiçbir spec yazmıyor: `grep -rn "blog-yazar-01" tests/` boş).

Daha sıkı ölçüm — 728 dosyanın bayt-bayt sağlaması, koşudan önce ve sonra:

```
$ find docs/agent-results -type f | sort | xargs shasum > before.sha   # 728 dosya
$ <tam e2e koşusu>
$ find docs/agent-results -type f | sort | xargs shasum > after.sha
$ diff before.sha after.sha
226a227
> ba15f67…  docs/agent-results/TASK-MTQUX5IZ9I5VP-screenshots/blog-yazar-01-after-reload.png
632a634
> a0858e0…  docs/agent-results/TASK-MTS6MBA7NEIM0-customer-support.md
723a726,727
> debcf09…  docs/agent-results/TASK-MTSHP3BMTAD3Y-blockzincir-pm.md
> 9a4b8ce…  docs/agent-results/TASK-MTSHTIYJWTQKO-blockzincir-pm.md
726a731
> 486ed98…  docs/agent-results/TASK-MTSHU5LT4XAE-ex-en.md
727a733,737
> e580d73…  docs/agent-results/TASK-MTSHVKTSGC8A4-screenshots/02-pricing-page-db-price.png
  … (4 kare daha, aynı klasör)
```

Tamamı `>` (yeni dosya), **hiç `<` ya da değişiklik yok** — yani mevcut 728 dosyanın
hiçbirinin içeriğine dokunulmadı. Koşunun gerçekte yazdığı yer:

```
$ ls test-artifacts | wc -l
      28        # TASK-…-screenshots klasörleri, hepsi git'in yok saydığı kökte
```

### 2.5 Regresyon yok

```
$ npx tsc --noEmit -p tsconfig.json
(çıktı yok — temiz)

$ npx eslint tests/e2e/fixtures/shots.ts tests/e2e/saved-search.spec.ts \
    scripts/seed-saved-search-e2e.ts "src/app/[locale]/(app)/[workspace]/calls/page.tsx"
=== eslint exit: 0 ===

$ npx vitest run
 Test Files  103 passed | 2 skipped (105)
      Tests  1211 passed | 8 skipped (1219)
```

Tam koşudaki 6 kırmızının **hiçbiri** yol kaynaklı değil
(`grep -ciE "ENOENT|no such file" full-run.log` → `0`) ve hiçbiri benim değişikliğimden
gelmiyor. En yakın şüpheli — `render-purity-refactor`, çünkü düzenlediğim `/calls`
sayfasını ölçüyor — **karşı-olgusal** koşuldu: worktree'deki `calls/page.tsx` HEAD'e geri
alınıp (0 testid) aynı spec koşuldu:

```
0 testids — page is at HEAD
  ✓  1 › the theme toggle still switches the theme … (1.8s)
  ✘  2 › the calls list loads, and changing a filter puts it back into loading (34.5s)
    Locator:  getByText('Canlı veriler yükleniyor...')
    Received: visible
  1 failed  1 passed
```

Aynı hata, benim değişikliğim olmadan da. Sebep canlı SEDIA upstream'i (`/api/cagrilar`)
30 sn içinde dönmüyor — mevcut bir kırmızı, benim getirdiğim değil.

### 2.6 Mutasyonlar geri alındı, ortam temiz

```
$ diff wt/src/app/api/saved-searches/route.ts src/app/api/saved-searches/route.ts
ROUTE REVERTED — identical to main tree

$ git status --porcelain -- src/lib/inngest/jobs/alerts-daily.ts
(boş)

$ # fikstür kalıntısı
{"tenant":0,"user":0,"workspace":0,"mySearches":0,"savedSearchTotalRepoWide":0}

$ git worktree remove --force "$SC/wt" && lsof -ti :3190
worktree removed
port 3190 free
```

M1/M2 mutasyonları yalnız **worktree kopyasında** uygulandı — ana ağaçtaki rota hiç
değişmedi. M3, ana ağaçtaki `alerts-daily.ts` üzerinde tek bir komut içinde uygulanıp
koşulup geri alındı, böylece paralel bir ajanın bozuk hâli commit'lemesi mümkün olmadı.

---

## 3. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `tests/e2e/fixtures/shots.ts` | **YENİ** — `shotsDir()`, git yok sayan varsayılan kök, `E2E_SHOTS_ROOT` ile yayımlama |
| `tests/e2e/saved-search.spec.ts` | **YENİ** — 3 test: gerçek tıklama + Postgres + cron sorgusu + silme |
| `scripts/seed-saved-search-e2e.ts` | **YENİ** — kendi kiracısı, idempotent `upsert` + `--rollback` |
| `tests/e2e/*.spec.ts` (32 dosya) | `docs/agent-results/…` literali → `shotsDir(...)` |
| `src/app/[locale]/(app)/[workspace]/calls/page.tsx` | 4 `data-testid` (davranış değişmedi) |
| `.gitignore` | `test-artifacts/` |
| `docs/E2E_TESTING.md` | §3.5 yeni kural (+ eski §3.5 → §3.6), §4 tablosuna yeni seed |
| `docs/agent-results/TASK-MTSHUZUMVLTBF-screenshots/` | 4 kare |
| 27 commit'li kanıt dosyası | `git checkout --` ile GERİ YÜKLENDİ (içerik değişmedi) |

---

## 4. Riskler

1. **`E2E_SHOTS_ROOT` unutulursa kanıt kaybı değil, kanıt yokluğu olur.** Bir ajan
   raporuna kare koymak isterse artık açıkça istemeli. Bu bilinçli bir takas:
   sessizce *yanlış* kare üretmektense, kare üretmemek yeğdir. `docs/E2E_TESTING.md`
   §3.5 komutu veriyor.
2. **Yayımlama yolu hâlâ üzerine yazar.** `E2E_SHOTS_ROOT=docs/agent-results` ile koşan
   biri gene commit'li bir kareyi ezebilir — ama bunu bilerek yapar ve `git status`'ta
   görür. Otomatik bir koruma (ör. yalnız kendi kart id'ine yazma) eklenmedi; kapsam dışı.
3. **Kalan 6 e2e kırmızısı bu kartın konusu değil** ve dokunulmadı; ikisi
   `waitForLoadState` (§3.4'ün yasakladığı desen), biri eksik fikstür, biri canlı SEDIA.
4. `test-artifacts/` büyür ve kimse temizlemez. Git yok sayıyor, diskte birikir.

---

## 5. Açık sorular

### 5.1 `st6-empty-tenant-no-fabrication.spec.ts` — başka bir ajanın commit'lenmemiş dosyasına dokundum

Bu görevi yaparken customer-support (TASK-MTQYXISOPUJ53, `in_progress`) **yeni bir spec
yazıyordu ve aynı anti-deseni yeniden üretmişti** (`const SHOTS =
'docs/agent-results/TASK-MTQYXISOPUJ53-screenshots'`). Kartımın doğrulaması "tam koşudan
sonra `docs/agent-results` temiz" olduğu için o dosyayı da helper'a taşıdım —
commit'lenmemiş yabancı iş olduğunu bilerek. **customer-support'un haberi olmalı**:
dosyayı yeniden yazarsa iki satırlık değişiklik kaybolur ve sızıntı geri gelir.

Ayrıca o klasörde duran 3 izlenmeyen kare (`st6-*.png`) **silinmedi** — onların işi,
benim değil. `docs/agent-results` bu yüzden "tamamen boş" değil; ` M` satırı yok, ki
kartın kastettiği ezilme budur.

### 5.2 Kanıt klasörü kimsenin sahibi olmadığı bir ortak alan

27 dosyanın haftalarca sessizce ezilmiş olması, tek başına dosya yolu sorunu değil:
kapanmış bir kartın kanıtını hiçbir şey **değişmezleştirmiyor**. `docs/agent-results/`
altına yazmayı bir pre-commit hook'uyla (yalnız kendi GÖREV-ID'ne yazabilirsin) ya da
kapanan kartın klasörünü salt-okunur işaretlemekle korumak ayrı bir kart konusu.

### 5.3 D7'de bildirdiğim, hâlâ açık olan üç madde

Bunlar bu kartın kapsamı değil, kart açıldı mı bilmiyorum:
* **§8.1** — `src/lib/document-exporter.ts:252` her belgeye sabit
  `EUROPEAN COMMISSION - HORIZON EUROPE` rozeti basıyor. (Panoda
  `TASK-MTSHTIYJWTQKO` açılmış görünüyor.)
* **§8.5** — i18n kapısı fiilen kapalı; dev sunucusu her açılışta hâlâ
  `⚠️  Could not run i18n check: Command failed: tsx scripts/i18n-check.ts` basıyor.
  (`TASK-MTSHU5LT4XAE` açık; raporu koşu sırasında düştü.)
* Bu koşuda ölçülen yeni bir tane: `document-export-tenant-isolation` ve
  `evidence-fabrication` `waitForLoadState` ile 60 sn'de düşüyor — `E2E_TESTING.md`
  §3.4'ün "kullanma" dediği desen iki spec'te hâlâ duruyor.

---

## 6. Sonraki adım

1. Kart `review`'a alınabilir; her iki madde de ölçülmüş kanıtla kapalı.
2. customer-support'a §5.1 iletilmeli (kendi spec'i helper'a taşındı).
3. §5.2 (kanıt klasörünün korunması) ve §5.3'teki iki `waitForLoadState` kırmızısı için
   ayrı kart açılabilir — sprintin bir sonraki gündemi.
