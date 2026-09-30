# TASK-MUNZ06XM2OIL2 — fe-fb — FB MOBİL Y-1: sayfa `<main>` içinde yana kayıyor

**Durum:** TAMAM
**Dal:** `fe-fb/munz06-main-overflow` (dev `46eddcea`'dan, ayrı worktree). Kapılar yeşil, dev'e merge edildi, push YOK.
**Ortam:** izole DB `fefb06-pg` 127.0.0.1:55406, CI sırasıyla kuruldu (db push → rls-role → apply-migrations ×2 → rls → seed). Paylaşılan :5433'e yazılmadı. SONRA sunucusu :3406 (bu dal), ÖNCE sunucusu :3407 (aynı DB, dokunulmamış `46eddcea` ikinci worktree'si).
**Platform beyanı:** Doğrulama macOS'ta yapıldı (Darwin 27, Playwright + Chrome kanalı, gerçek tarayıcı, gerçek klavye ve dokunma). Değişiklik Tailwind sınıflarından ve tek bir `onFocus → scrollIntoView` satırından oluşuyor. Süreç, dosya yolu, kabuk, DPI ya da izin kullanan bir kod yolu yok. Windows ve Linux'ta koşulamadı çünkü bu makinede yoklar. Kodda o platformlarda farklı davranacak bir şey yok: kırılma noktaları CSS media query ve motor aynı. İstisna: "yarım görünen öğeye odakta kaydırmama" davranışı Chromium'a özgü. Firefox ve Safari zaten kaydırıyor; `scrollIntoView({block:'nearest',inline:'nearest'})` onlarda ya hiçbir şey yapmaz ya da aynı işi yapar.

## 1. Ne yapıldı

`<main>` bir kaydırma kutusu (`overflow-auto`). İçinde fazla geniş bir öğe olduğunda belge düzeyinde taşma görünmüyor (`documentElement.scrollWidth === innerWidth`), ama parmakla sayfa yana kayıyor. Ölçüt: `main.scrollWidth − main.clientWidth`. Her taşan öğeyi yapısal olarak çözdüm. Hiçbir yerde `overflow-x:hidden` ile gizleme yok.

| Rota | Taşan öğe (ÖNCE ölçümünden) | Çözüm |
|---|---|---|
| opportunities/[id]/evaluations | sekme şeridi (3 buton, 516px) | Şerit kendi kutusunda `overflow-x-auto`, butonlar `shrink-0 whitespace-nowrap`. Alt çizgi `border-b` + `-mb-px` yerine `shadow-[inset_0_-1px_0_var(--color-border)]`: kaydırma kutusu `-mb-px` bindirmesini kırpar ve 1px dikey kaydırma yaratırdı. Bu yol 1280'de piksel olarak aynı. |
| admin/cordis | sekme şeridi (4 buton) + çalıştırma satırında select + limit girişi | Aynı şerit kalıbı. Çalıştırma satırına `flex-wrap`. |
| admin/alerts | başlıktaki 4 sayaç kutusu (`dl flex shrink-0`) | Mobilde `grid grid-cols-2`. sm+ için `sm:flex sm:flex-wrap`, `shrink-0` yalnız `lg:`'de. Başlık satırına `sm:flex-wrap lg:flex-nowrap`. |
| approvals, onay-merkezi | hap sekmeler (`flex gap-2`) | `flex-wrap` |
| settings/gates, ayarlar/kapilar | G0 ağırlık ızgarası (`grid-cols-2`, camelCase anahtarlar) | Hücreye `min-w-0 gap-2`, anahtara `min-w-0 break-words`, değere `shrink-0`. Izgara `grid-cols-1 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2`: md'de kenar çubuğu içeriği daraltıyor. |
| firsatlar/[id] (= pipeline/[id]), **ek bulgu** | 640px'te 4px: başlık sütunu `min-width:auto`, aksiyonlar `shrink-0` | Başlık sütununa `min-w-0 break-words`, satıra `sm:flex-wrap lg:flex-nowrap`: lg altında aksiyonlar alt satıra iner. |

**Aynı sayfada yakalanan ek kusurlar:** önceden vardı, `main`'i taşırmıyordu ama içerik kayboluyordu.
- **evaluations başlık kartı** (`overflow-hidden`): 768'de "İç ön değerlendirme" uyarı kutusu 258px kırpılıyordu. 320/640/1024'te "Değerlendirilmedi" ve "Eksik Değerlendirme" kelimeleri metrik kutusundan taşıyordu. Başlık artık `lg:`'de yan yana (önce `md:`), uyarı kutusu `shrink-0` değil. Metrik ızgarası `md:grid-cols-2` ve `wrap-anywhere`.
- **Klavye erişilebilirliği (WCAG 2.4.11):** Chrome, yarım görünen bir öğeye Tab ile odaklanıldığında kaydırmıyor. Kaydırılabilir şeritte odaklanan sekme kenarda yarım kalıyordu (CORDIS "Vector RAG Lab": r=413 > 320). Şerit kapsayıcısına `onFocus={(e) => e.target.scrollIntoView({ block: 'nearest', inline: 'nearest' })}` eklendi.

**Bekçi:** `tests/e2e/mobile-main-overflow.spec.ts`. Admin demo girişi yapıyor. 8 rota × 320/360/390/472/640'ta önce `main` içinde bir başlığın görünmesini bekliyor (boş `main` sahte 0 verir), sonra `main.scrollWidth − clientWidth === 0` olduğunu doğruluyor. Rota 200 dönmezse de düşüyor (kilitli sayfanın boş render'ı yeşil geçmesin).

## 2. Kanıt

Kanıt klasörü: `docs/agent-results/TASK-MUNZ06XM2OIL2-fe-fb-evidence/`

### 2a. Hedef rotalar, `main.scrollWidth − main.clientWidth`

**ÖNCE** (`scan-once.log`, :3407):
```
               320  360  390  472
evaluations    196  156  126   44
admin/cordis   118   78   48    0
admin/alerts    41    1    0    0
approvals       24    0    0    0
onay-merkezi    24    0    0    0
ayarlar/kapilar 14    0    0    0
settings/gates  14    0    0    0
```

**SONRA**, son kod (`scan-final.log`): 10 rota × 320/360/390/472/640/768/1024/1280 → **72/72 `over=0 OK`**. Örnek satırlar:
```
320 /tr/fabrika-beta/opportunities/demo-opp-1/evaluations st=200 doc=320/320 main.scrollWidth=320 main.clientWidth=320 over=0 OK
320 /tr/admin/cordis st=200 doc=320/320 main.scrollWidth=320 main.clientWidth=320 over=0 OK
320 /tr/admin/alerts st=200 doc=320/320 main.scrollWidth=320 main.clientWidth=320 over=0 OK
768 /tr/admin/alerts st=200 doc=768/768 main.scrollWidth=480 main.clientWidth=480 over=0 OK
```

### 2b. Bekçinin kendisi: kırmızı → yeşil

`playwright test`, AgentSpace kill-guard (R8, canlı uygulama açık) tarafından reddedildi. Bu yüzden spec'in adımlarını birebir tekrarlayan `spec-harness.mjs` iki sunucuda da koşuldu. Adımlar: aynı giriş, aynı başlık beklemesi, aynı `setViewportSize` döngüsü ve aynı ölçüt.
```
ÖNCE  (:3407)  0 passed, 8 failed   ✘ evaluations over 320:196 360:156 390:126 472:44 640:0 … ✘ firsatlar/demo-opp-1 … 640:4
SONRA (:3406)  8 passed, 0 failed
```
(`spec-harness-once.log`, `spec-harness-sonra.log`)

### 2c. Tüm 80 rota, 320–1024 (`scan-once-all.log`, `scan-sonra-all.log`)

devop-fb'nin 80 rotalık listesi 7 genişlikte (560 ölçüm) iki sunucuda tarandı.
- **320/360/390/472/640:** ÖNCE 14 taşma → SONRA **0**.
- **768/1024:** ÖNCE 11 taşma → SONRA'da 8'i kaldı. Bunlar mobil kapsamın dışında, önceden de vardı ve dokunulmadı (bkz. §4). Sonra da alerts@768 kapatıldı: `scan-final.log`.
- **Yeni taşma: 0.** `comm` ile SONRA'daki taşmalar ÖNCE'dekilerin alt kümesi çıktı.

### 2d. 768/1280 regresyon (`px-diff.txt`, `px.mjs`, animasyonlar kapalı, tam sayfa)

- **1280:** 11 ekranın 11'i AYNI. Tek fark evaluations'taki degrade kutusunda `maxdelta=1` gürültüsü; bbox'ı her koşuda değişiyor, ÖNCE-vs-ÖNCE karşılaştırmasında da çıktı.
- **768** (app ve admin kabuğunda kenar çubuğu açık, içerik 480–512px):
  - application, documents ve tto AYNI.
  - Diğer 8 ekran değişti. Hepsi o genişlikte zaten sıkışmış ya da taşan ekranlardı. Kareler: `kareler/768-once-sonra-*.png`.
  - cordis: sekmeler 4 satırlık dar sütunlar yerine tek satır ve kaydırılabilir.
  - evaluations: başlıktaki kırpılma kalktı, sekmeler tek satır.
  - approvals: hap sekmelerde metin 3–4 satıra kırılmıyor, alt satıra iniyor.
  - gates: anahtarlar hücreden taşmıyor, tek sütun.
  - firsatlar: aksiyonlar başlığın altında; önce 156px taşma vardı.
  - alerts: sayaçlar kartın içinde iki satır; önce 118px taşma vardı.
- Bir ara sürüm 768'de fırsat başlığını tek harf genişliğine çökertmişti (`min-w-0` + `shrink-0` aksiyonlar). Kareyle yakalanıp düzeltildi. `scrollWidth` ölçütü bunu göremez, bu yüzden 768/1024/1280 kareleri tek tek incelendi.

### 2e. Gerçek etkileşim (320px, `tabs.mjs`, `tabs2.mjs`, `sekme-klavye.log`)

- Tab tuşuyla şeritte gezinildi. SONRA'da 8 sekmenin 8'i odakta tam görünür (`tamGorunur=true`).
  - Düzeltmeden önce: `OLAP … r=408 tamGorunur=false`, `Vector RAG Lab r=413 tamGorunur=false`.
- Son sekmede Enter → sekme etkin (`lastActive:true`), `mainOver:0`.
- Şerit başa kaydırıldı, ilk sekmeye gerçek dokunma (`tap`) → etkin.
- Kare: `kareler/sekme-klavye-320-*.png`.
- Başlık kartı ve kart içi kırpılma kontrolü (`clip.mjs`, `card.mjs`): evaluations başlığında ve alerts sayaçlarında 320–1280 arası 0 taşma.

### 2f. Önce/sonra kareleri

- `kareler/montaj-320-once-sonra.png` ve `montaj-360-once-sonra.png`: ÖNCE kareleri `main.scrollLeft` en sağdayken alındı (sayfa yana kaymış). SONRA karelerinde kayma yok. Rotalar: evaluations, cordis, alerts, approvals, kapilar.
- `kareler/768-once-sonra-*.png`

### 2g. Kapılar (son kod, `gates.txt`)

```
tsc=0  lint=0  i18n=0  build exit=0
vitest: Test Files 291 passed | 6 skipped (297) · Tests 3636 passed | 96 skipped (3732) · exit=0
```

96 atlanan testin tamamı ortama bağlı canlı testler (`vitest-skips.txt`): evidence-upload-s3 (21), public-lead (16), stale-relationship-reminder (14), evidence-confirm-store-faults (11), k1-embeddings (11), topic-match-nightly (9), invitation-retention (6), k1-daily-calls, adapters, sedia-adapter. Hiçbiri UI değil ya da bu değişiklikle ilgili değil.

## 3. Değişen dosyalar

- `src/app/[locale]/(app)/[workspace]/opportunities/[id]/evaluations/client.tsx`: sekme şeridi, başlık kartı, metrik ızgarası
- `src/app/[locale]/admin/cordis/client.tsx`: sekme şeridi, çalıştırma satırı
- `src/app/[locale]/admin/alerts/client.tsx`: başlık satırı, sayaç `dl`
- `src/app/[locale]/(app)/[workspace]/approvals/client.tsx`: hap sekmeler (onay-merkezi aynı bileşeni kullanıyor)
- `src/app/[locale]/(app)/[workspace]/settings/gates/page.tsx`: ağırlık ızgarası (ayarlar/kapilar aynı sayfayı kullanıyor)
- `src/app/[locale]/(app)/[workspace]/pipeline/[id]/client.tsx`: başlık satırı (firsatlar/[id] aynı sayfayı kullanıyor)
- `tests/e2e/mobile-main-overflow.spec.ts` (yeni bekçi)
- `docs/agent-results/TASK-MUNZ06XM2OIL2-fe-fb.md` ve `…-evidence/`

## 4. Riskler

- **Bekçi yerelde `playwright test` ile koşulmadı** (kill-guard R8). Adımları birebir `spec-harness.mjs` ile iki yönde kanıtlandı. CI e2e job'unda ilk koşu bu spec'in gerçek ilk koşusu olacak. Giriş, alert-console-truncation.spec'teki kalıpla yapılıyor; seed'de `admin@yasinaslan.com.tr` yoksa spec kendini atlıyor.
- **Tablet taşmaları kaldı:** önceden vardı, mobil kapsam dışında, dokunulmadı. `main` taşması şöyle:
  - 768: admin/billing 25, admin/feedback 14, admin/modules 95, ayarlar, ayarlar/moduller ve settings/modules 60'ar
  - 1024: admin/billing/plans 182

  Hepsinin kaynağı md'de açılan kenar çubuğunun içeriği daraltması. Bekçi yalnız ≤640'ı koruyor.
- `scrollWidth` ölçütü kart içi `overflow-hidden` kırpılmasını ve sütun çökmesini görmez. Bu iş için kare ve kart düzeyi ölçümle ayrıca bakıldı; bekçi bunları yakalamaz.
- evaluations'taki `wrap-anywhere` uzun kelimeyi gerektiğinde ortasından kırar ("Değerlendiril-medi"). Kaybolmaktan iyi, ama tipografik olarak ideal değil.

## 5. Açık sorular

- Tablet (768/1024) taşmaları için ayrı kart açılsın mı? Liste ve ölçümler §4'te; 7 rota var.
- Kaydırılabilir sekme şeridi için ortak bir `<TabStrip>` bileşeni istenir mi? Şu an 5 dosyada elle yazılmış şerit var: tto, application ve documents eski `-mb-px` kalıbında. documents bugün sığıyor. tto ve application `overflow-x-auto` kullanıyor ama alt çizgisi kırpılıyor ve odak kaydırması yok.

## 6. Sonraki adım

- CI'da `mobile-main-overflow.spec.ts`'nin ilk koşusunu izle.
- Tablet taşmaları kartı (yukarıdaki 7 rota), bekçiye 768/1024 genişlikleri eklenerek.
