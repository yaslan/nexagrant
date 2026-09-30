# TASK-MUOAYGYXW8PHI — se-fb — FB MOBİL TAKİP (İNCELEME-96 Y-1/Y-2): uzun URL taşması + bekçi mutantları

**Durum:** TAMAM
**Dal:** `se-fb/muoayg-mobile-url` (dev `2c08c956`'dan, ayrı worktree). Kapılar yeşil, dev'e merge edildi, push YOK.
**Ortam:**
- Worktree scratchpad'de, `node_modules` APFS klonu.
- İzole Postgres `sefbay-pg` (127.0.0.1:55431), CI sırasıyla kuruldu: db push → rls-role → apply-migrations ×2 (41/41) → rls → seed. Paylaşılan `fabrika-postgres` :5433'e yazılmadı; worktree `.env`'inde `5433` geçmiyor.
- ÖNCE: dev `2c08c956`, `next build` + `next start` :3431.
- SONRA: bu dal, `next build` + `next start` :3431.
- Spec ve mutantlar: `next dev` :3432, `DEMO_LOGIN_ENABLED=true`, e2e test anahtarıyla. Bu, CI'ın varsayılan e2e sunucusuyla aynı.
- Tarayıcı: gerçek Chrome (`channel:'chrome'`). Ölçümlerde oturum `encode()` ile basılan Auth.js çereziyle, spec koşularında spec'in kendi `/tr/giris` demo girişiyle açıldı.

**Platform beyanı:** Doğrulama macOS'ta yapıldı (Darwin 27, Chrome). Değişiklik yalnız Tailwind sınıflarından oluşuyor. Süreç, dosya yolu, kabuk, DPI ya da izin kullanan kod yolu yok. Windows ve Linux bu makinede olmadığı için koşulamadı. Koda göre orada farklı davranacak bir şey yok: kırılma noktaları CSS media query, `overflow-wrap:break-word` ve `min-width:0` bütün motorlarda standart. Firefox ve Safari'de koşulmadı. Klavye testi (M12) Chromium'un "yarım görünen öğeye odakta kaydırmama" davranışına dayanıyor; CI da Chromium koşuyor.

## 1. Ne yapıldı

### 1a. Düzeltmeler

Yöntem fe-fb'ninkiyle aynı: flex çocuklarına `min-w-0`, uzun metne `break-words`. `overflow-x:hidden` ile gizleme ya da `truncate` yok.

| Yer | Kök neden (ÖNCE ölçümü) | Çözüm |
|---|---|---|
| approvals liste kartı, metin bloğu (`approvals/client.tsx:300`) | Kart telefonda `flex-col items-start`, bu yüzden blok fit-content oluyor ve en uzun bölünmez kelime, yani yapıştırılan URL kadar genişliyor: 320'de +121. md satırında blok `flex-1` ama `min-width:auto` ile URL kadar yer tutuyor ve aksiyonları dışarı itiyor: 768'de +207. | `w-full md:w-auto flex-1 min-w-0 break-words`. `w-full` sütunda bloğu kart genişliğine sabitliyor, `min-w-0` satırda küçülmesine izin veriyor, `break-words` (kalıtımla başlık, açıklama, red gerekçesi, e-posta) URL'yi kart içinde kırıyor. |
| approvals detay modalı başlığı (`:434`) | Başlık kutusu `flex justify-between` içinde `min-width:auto` kalıyor: × düğmesi 320'de `right=470`, yani ekran dışında. | Başlık kutusuna `min-w-0 break-words`, satıra `gap-3`. |
| fırsat detay h1 (`pipeline/[id]/client.tsx:171`) | Y-2 ile aynı mekanizma: sütunda `items-start`, blok URL kadar genişliyor. 320'de +307, 472'de +155. fe-fb'nin `min-w-0 break-words` eki sm ve üstünde çalışıyor ama sütunda işe yaramıyordu. | `w-full sm:w-auto min-w-0 break-words`. sm ve üstünde `w-auto` kaldı, çünkü `w-full` orada flex-basis'i %100 yapıp kısa başlıkta da aksiyonları alta iterdi (seed 768'de piksel regresyonu olurdu). |

Mutant analizinde gereksiz çıkan iki eki geri aldım: aksiyon satırına `flex-wrap`/`md:shrink-0` ve × düğmesine `shrink-0`. Gerekçe §2e'de.

### 1b. Bekçi (`tests/e2e/mobile-main-overflow.spec.ts` + yeni `tests/e2e/fixtures/mobile-long-content.ts`)

- **Fixture:** dosya düzeyindeki `beforeAll` gerçekçi uzun veriyi ekliyor:
  - 1 fırsat: başlıkta `https://docs.example.test/fonbridge/wp3/butce-revizyonu-2027-q1.pdf`, topicId `HORIZON-CL5-2027-D3-01-10`.
  - 2 onay talebi, başlık ve açıklamada aynı URL. Biri adminin kendi talebi (Taleplerim, Geri Çek), biri başka üyenin (Onayımı Bekleyenler, Onayla/Reddet).
  - Kimlikler koşuya özel. `afterAll` yalnız bu kimlikleri siliyor ve silinen satırın 3 olduğunu doğruluyor. Silme `requireId` ile korunuyor; `tests/teardown-where-guard.test.ts` ilk hâlini yakalamıştı.
  - Bu satırlar mevcut 8 rotalık bekçiye de yansıyor: approvals ve onay-merkezi artık URL'li kartla ölçülüyor.
- **Yeni describe "long real-world content stays inside <main>"**, 4 test. Genişlikler 320/360/390/472/640/768/1024/1280.
  1. **approvals:** iki sekmede `main` taşması 0. 320'de detay modalında × ekran içinde ve modal başlığında `scrollWidth − clientWidth = 0`.
  2. **fırsat detay:** taşma 0. Ayrıca aksiyonlar 640/768'de başlığın altında, 1024/1280'de yanında olmalı; bu, fe-fb'nin `sm:flex-wrap lg:flex-nowrap` niyeti (M7).
  3. **gates:** ağırlık adları kod sabiti, eklenecek satır yok. Hidrasyondan sonra adlar yerinde 42 bölünmez karakterle uzatılıyor ve taşmanın 0 kaldığı ölçülüyor (M2). Hidrasyon beklenmezse React metni geri koyabiliyor; ilk mutant koşusunda M2'nin yanlış "hayatta" çıkmasının nedeni buydu, bkz. §4.
  4. **cordis:** 320'de gerçek Tab tuşuyla 4 sekme geziliyor, odaklanan her sekme şeridin içinde tam görünmeli (M12).

## 2. Kanıt

Ekler: `docs/agent-results/TASK-MUOAYGYXW8PHI-se-fb-ekler/`

### 2a. `main.scrollWidth − main.clientWidth`: ÖNCE → SONRA (`olcum-once.log`, `olcum-sonra.log`, next start)

```
ÖNCE
once approvals-onayimi-bekleyen  320 main.scrollWidth=441 main.clientWidth=320 TAŞMA +121  <- div.space-y-2 flex-1 +121
once approvals-onayimi-bekleyen  390 main.scrollWidth=441 main.clientWidth=390 TAŞMA +51
once approvals-onayimi-bekleyen  768 main.scrollWidth=719 main.clientWidth=512 TAŞMA +207  <- div.flex items-center gap-2 self-end md:self-center +207
once approvals-taleplerim        320 … TAŞMA +121 | 360 +81 | 390 +51 | 768 +120
once approvals-detay-modal       320 × right=470 iw=320 EKRAN DIŞI
once firsat-detay-uzun-baslik    320 main.scrollWidth=627 main.clientWidth=320 TAŞMA +307  <- div.min-w-0 break-words +307
once firsat-detay-uzun-baslik    360 +267 | 390 +237 | 472 +155

SONRA: 5 ekran × 8 genişlik = 40 ölçüm, 40 "EŞİT", 0 "TAŞMA"
sonra approvals-onayimi-bekleyen  320 main.scrollWidth=320 main.clientWidth=320 EŞİT doc=320/320
sonra approvals-taleplerim        472 main.scrollWidth=472 main.clientWidth=472 EŞİT doc=472/472
sonra firsat-detay-uzun-baslik    320 main.scrollWidth=320 main.clientWidth=320 EŞİT doc=320/320
sonra firsat-detay-uzun-baslik    640 main.scrollWidth=640 main.clientWidth=640 EŞİT doc=640/640
sonra approvals-detay-modal       320 × right=279 iw=320 görünür panel 16..304
sonra gates: 7 ağırlık adı uzatıldı → 320…1280 hepsi EŞİT
sonra cordis Tab 320: K2 Ingestion r=218/318 tam | OLAP r=318/318 tam | Canlı CORDIS r=256/318 tam | Vector RAG Lab r=318/318 tam
```

İstenen genişliklerin (320/360/390/472/640) hepsi loglarda satır satır var. be-fb'nin ölçtüğü 12px'lik taşma, URL yalnız açıklamadaydı. Benim fixture'ımda başlıkta da URL var, bu yüzden ÖNCE değeri +121.

**Kareler** (`kareler/`):
- `montaj-approvals_taleplerim-320-once-sonra.png`: ÖNCE'de kart ve URL sağdan kesik, SONRA'da URL kart içinde kırılıyor.
- `montaj-firsat_detay_uzun_baslik-320-once-sonra.png`
- `montaj-approvals_detay_modal-320-once-sonra.png`: ÖNCE'de × yok, başlık panelden taşıyor. SONRA'da × görünür.
- Tek tek `once-*`/`sonra-*` kareleri 320 ve 390'da.

### 2b. Bekçi kırmızı → yeşil (`specrun-once.log`, `specrun-sonra.log`)

Spec, kendi kaynağından koşuldu. `betikler/specrun.mts.txt` spec dosyasını olduğu gibi okuyor ve yalnız `@playwright/test` içe aktarımını küçük bir shim'e çeviriyor. Shim test/beforeAll/afterAll/describe/skip çağrılarını topluyor; `expect` gerçek kütüphanenin, timeout 10 sn (config ile aynı). `baseURL` config'teki gibi veriliyor. Koşucu CLI'si AgentSpace kill-guard (R8) tarafından reddediliyor, guard'ı aşmadım.

```
ÖNCE (fix yok):  8 passed, 4 failed
  ✘ /tr/fabrika-beta/approvals at 320px … Received: 121
  ✘ /tr/fabrika-beta/onay-merkezi at 320px … Received: 121
  ✘ approvals: a link pasted … approvals / actionable at 320px … Received: 121
  ✘ opportunity detail: a link pasted … at 320px … Received: 307
SONRA: 12 passed, 0 failed, 0 skipped   (son koşu, requireId düzeltmesinden sonra)
```

ÖNCE'de gates ve cordis testleri yeşil. Bu beklenen sonuç: o düzeltmeler (fe-fb) dev'de zaten var. Bu testler mutantları öldürmek için yazıldı (§2c). Koşudan sonra izole DB'de `mobile-long-%` satırı 0.

### 2c. Mutantlar (`mutants.log`, `betikler/mutants.py.txt`)

Her mutantta dosya yedeklendi, tek değişiklik yapıldı, dev derlemesi için 15 sn beklendi, spec koşuldu, dosya geri kondu ve yine 15 sn beklendi. Koşu sonunda `git diff --stat` başlangıçtakiyle aynı.

| # | Mutant | Sonuç | Öldüren kontrol |
|---|---|---|---|
| **M1** | fırsat başlığı `min-w-0` sil | **KIRMIZI** | opportunity detail 640px: 25 |
| **M2** | gates iki `min-w-0` sil | **KIRMIZI** | gate settings 320px: 204 |
| **M7** | fırsat satırı `sm:flex-wrap` sil | **KIRMIZI** | "actions at 640px below the title" false |
| **M12** | cordis `onFocus` scrollIntoView sil | **KIRMIZI** | "cordis tab 2 fully inside the strip" false |
| N1 | approvals metin `w-full md:w-auto` sil | KIRMIZI | approvals/onay-merkezi/actionable 320: 121 |
| N2 | approvals metin `min-w-0` sil | KIRMIZI | actionable 768: 207 |
| N3 | approvals metin `break-words` sil | KIRMIZI | 320: 121 (3 test) |
| N6 | modal başlık `min-w-0` sil | KIRMIZI | × right=482 > 320 |
| N7 | modal başlık `break-words` sil | KIRMIZI | modal title scrollWidth−clientWidth 204 |
| N9 | fırsat `w-full sm:w-auto` sil | KIRMIZI | 320: 307 |
| N10 | fırsat `break-words` sil | KIRMIZI | 320: 307 |

11/11 kırmızı. Görevdeki M1/M2/M7/M12'nin dördü de öldü.

### 2d. 768/1280 piksel regresyonu (`px-diff.txt`, seed verisi, animasyon kapalı, tam sayfa)

9 ekran: evaluations, cordis, alerts, approvals, gates, kapilar, firsatlar/demo-opp-1, dashboard, onay-merkezi. ÖNCE, ÖNCE2 (gürültü tabanı) ve SONRA çekildi.
- **1280 ve 768: SONRA = ÖNCE**, iki istisna dışında. İkisi de kod değil:
  - `admin/alerts` (her iki genişlik): tek `app-url` uyarısının tekrar sayacı ikinci sunucu açılışında 0'dan 1'e çıkmış ve satıra "×2" rozeti gelmiş (`kareler/px-1280-alerts-once-sonra-veri-farki.png`). Alerts'e dokunulmadı.
  - `768 kapilar/gates`: `maxdelta=2`, `piksel(>8)=0`. Aynı fark ÖNCE ile ÖNCE2 arasında da var, gürültü.
- approvals ve fırsat, seed verisinde (kısa metin) 768/1280'de piksel piksel aynı. Yani `w-full md:w-auto` / `w-full sm:w-auto` geniş ekranda düzeni değiştirmiyor.

### 2e. Geri alınan ekler (eşdeğer mutant = gereksiz sınıf)

İlk düzeltmede üç sınıf daha vardı. Mutantları testte hayatta kaldı, ben de nedenini inceledim:
- **Aksiyon satırına `md:shrink-0`:** metin bloğu `flex-1` (basis 0) ve `min-w-0` olduğu için aksiyonlar zaten küçülmüyor. Gerçekten eşdeğer, sildim.
- **× düğmesine `shrink-0`:** tek karakter, `min-width:auto` zaten o karakterin genişliği. Eşdeğer, sildim.
- **Aksiyon satırına `flex-wrap`:** bugünkü en geniş satır (Detay + Onayla + Reddet) 320'de sığıyor. Ölçemediğim bir savunma sınıfını eklemedim.

Modal satırındaki `gap-3` görsel aralık için. Taşmayla ilgisi yok, bu yüzden mutantı koşulmadı.

### 2f. Kapılar (bu dal, izole DB)

```
tsc=0  lint=0  i18n=0 ("both catalogs agree, every key used in src/ resolves…")
next build exit=0 (ÖNCE ve SONRA)
npx vitest run: Test Files 292 passed | 6 skipped (298) · Tests 3730 passed | 104 skipped · exit 0
```

İlk tam vitest koşusu **1 kırmızı** verdi: `tests/teardown-where-guard.test.ts`, fixture'ın `deleteMany({ where: { id: f.opportunityId } })` satırını yakaladı. Parametre `undefined` gelirse Prisma bu filtreyi düşürür ve tüm tablo silinir. `requireId(...)` ile düzelttim, sonra tam koşu yeşil oldu. Build'den sonra yalnız test dosyası değişti, src değişmedi.

## 3. Değişen dosyalar

- `src/app/[locale]/(app)/[workspace]/approvals/client.tsx`: kart metin bloğu, modal başlığı
- `src/app/[locale]/(app)/[workspace]/pipeline/[id]/client.tsx`: başlık bloğu
- `tests/e2e/mobile-main-overflow.spec.ts`: dosya düzeyi fixture ve giriş, 4 yeni test, `mainOverflow` yardımcısı
- `tests/e2e/fixtures/mobile-long-content.ts` (yeni): fixture, plant/remove, ölçüm yardımcıları
- `docs/agent-results/TASK-MUOAYGYXW8PHI-se-fb.md` ve `-ekler/` (loglar, 20 kare, betikler `.txt` olarak)

## 4. Riskler

- **Spec gerçek koşucuda koşmadı (B-2 ile aynı):** kill-guard nedeniyle spec kaynağını okuyan shim koşucusuyla doğrulandı. Koşucuya özgü farklar yalnız CI'da görülecek: dosya düzeyi `beforeAll`/`afterAll`'un describe'larla sırası ve `workers:1` gibi. Bunlar Playwright'ın belgelenmiş davranışı ve `fullyParallel:false`.
- **Fixture paylaşılan tablolara yazıyor:** demo kiracısının `Opportunity` ve `ApprovalRequest` tablolarına, koşuya özel kimliklerle. Test ortada çökerse `afterAll` yine koşar. Süreç öldürülürse `mobile-long-*` satırları kalabilir, bir sonraki koşunun kimliği farklı olduğu için çakışma olmaz. CI DB'si her koşuda sıfırdan kuruluyor.
- **Hidrasyon yarışı:** gates testi metni DOM'da değiştiriyor. Hidrasyondan önce yapılırsa React metni geri koyuyor ve test yanlış yeşil veriyor; ilk mutant koşusunda M2 bu yüzden "hayatta" göründü. Test artık `expectHydrated` bekliyor ve sonda uzatılmış adların hâlâ sayfada olduğunu doğruluyor. M2 bundan sonra iki ayrı koşuda kırmızı çıktı.
- **Kapsam dışı, dokunulmadı:** be-fb'nin "uç veri" durumu (90 karakterlik bölünmez başlık) artık aynı kodla kırılıyor. `break-words` uzunluktan bağımsız, ama o fixture ayrıca ölçülmedi. fe-fb §5'teki tablet (768/1024) rotaları (admin/billing, feedback, modules, ayarlar) ayrı kartta duruyor.

## 5. Açık sorular

- **Sonuç dosyası yolu çelişkisi:** görev gövdesi `FONBRIDGE/docs/agent-results/TASK-MUOAYGYXW8PHI-se-fb.md` diyor. Sarmalayıcı blok ise `/Users/macbook/alan/docs/agent-results/TASK-MUNZ06XM2OIL2-fe-fb.md` diyor. O yol repo dışında ve fe-fb'nin başka bir kartının rapor adı; oraya yazmak başka ajanın raporunu ezerdi. Bu yüzden gövdedeki repo içi yol esas alındı (be-fb İNCELEME-96'da da aynı çelişkiyi bildirmişti).

## 6. Sonraki adım

- dev push edildiğinde CI e2e job'unda `mobile-main-overflow.spec.ts`'nin ilk gerçek koşusunu (12 test) kontrol et.
- Temizlik: `sefbay-pg` konteyneri, worktree ve kendi sunucularım (:3431/:3432) merge'den sonra kapatılıyor.
