# TASK-MUNVVTG24X8I — devop-fb — FB İNCELEME-72: mobil 2px kenar boşluğu (TASK-MUNU027UKJ2AD)

**Durum:** TAMAM
**Karar:** **ONAY.** Regresyon yok. 2px kenar, fe-fb'nin listesinde olmayan 15 ekranda ve 4 mobil genişlikte doğrulandı. 768/1280'de önce ve sonra pikseller aynı. Kapıların hepsi yeşil. Bir orta bulgu var (Y-1): önceden de vardı ve bu iş onu küçülttü. Ayrı kart açılmalı, bu merge'ü bloklamaz.
**İncelenen:** fe-fb `11f4eac1` (+ `bd7ca824`), dev merge `be0d85e2`.
**Ağaçlar:**
- SONRA: dev `6b1341b4`, kod olarak `cb7e0ac8` ile aynı. Ayrı worktree, :3172.
- ÖNCE: aynı ağaç, üzerine `git diff be0d85e2 be0d85e2^1 -- src tests | git apply` uygulandı (63 dosya). Yalnız fe-fb'nin değişikliği geri alındı, :3173.
- İkisi de izole DB kullandı: `devopfb72-pg` 127.0.0.1:5472, CI sırası `db push → db:rls-role → apply-migrations ×2 → db:rls → db:seed`. Paylaşılan :5433'e yazılmadı.
**Platform beyanı:** Doğrulama macOS'ta yapıldı (Darwin 27, Playwright + Chrome kanalı, gerçek tarayıcı). Değişiklik yalnız Tailwind sınıfları ve bir CSS token'ından oluşuyor. Platforma bağlı kod yolu yok: süreç, dosya yolu, kabuk, DPI ya da izin kullanılmıyor. Windows ve Linux'ta koşulamadı çünkü bu makinede yoklar. Kodda o platformlarda farklı çalışacak bir şey yok: kırılma noktası CSS `min-width: 40rem` (640px) ve motor aynı. Bekçi testi yolları `path.sep` ile kuruyor, bu yüzden Windows'ta da çalışması beklenir.

## 1. Ne yapıldı

1. **Yeni ekranlarda ölçüm.** Aşağıdaki ekranlar fe-fb'nin temsilî 12 sayfasında yoktu, ya da onun koşusunda 404 döndü veya etkileşimsiz kaldı. Hepsi 320, 360, 390 ve 472px'te gerçek tarayıcıyla ölçüldü (`probe.mjs`).
   - **Partner portal**, dolu hâliyle: izole DB'ye test token'ı olan bir `ApplicationPart PART_A` eklendi, iş bitince silindi.
   - **Marketing alt sayfaları:** gerçek bir blog yazısı ve `calls/germany`.
   - **Form hataları:** kayıt formu boş gönderildi; girişte hem tarayıcı doğrulaması hem sunucu hatası denendi.
   - **Modal ve sheet:** çerez sheet'i (onay verilmemiş hâl), gizlilik sayfasındaki "hesabı sil" modalı, dashboard'daki tarih aralığı popover'ı.
   - **Uzun tablolar:** admin/audit, reports/person-days, admin/cordis.
   - **Boş durum:** relationships (seed'de 0 satır).
   - **Diğerleri:** fırsat detay sayfası, admin/billing/plans.
2. **Önce/sonra rota taraması.** 80 rota 320 ve 360px'te iki sunucuda da tarandı (`scan.mjs`). Belgenin `scrollWidth` değerine ek olarak **`<main>` içindeki yatay taşma** da ölçüldü.
3. **Odak halkası kırpılması.** 320px'te her ekranda 40 kez Tab'a basıldı. Halkanın genişliği viewport'la ve kırpan üst öğelerle karşılaştırıldı.
4. **Landscape.** 568×261, 667×307 ve 844×388'de 15 ekran ölçüldü.
5. **768/1280 piksel karşılaştırması.** 7 sayfa × 2 genişlikte önce ve sonra karelerinin tam sayfa PNG'si alındı ve PIL `ImageChops.difference` ile karşılaştırıldı. Animasyonlar ve geçişler CSS ile kapatıldı, bu yüzden fe-fb'nin `animate-pulse` gürültüsü oluşmadı.
6. **Bekçi (`tests/mobile-edge-gutter.test.ts`) mutasyonları.** Geçici sayfa dosyalarıyla 6 senaryo denendi, sonra dosyalar silindi (`git status` temiz).
7. **Kapılar:** tsc, lint, i18n, build ve tam `npx vitest run`.

Kod değiştirilmedi.

## 2. Kanıt

### 2a. Yeni ekranlar, mobil (`evidence/probe-sonra.log`)

Ölçülen değerler:
- `card`: ilk geniş çerçeveli/zeminli kutunun sol ve sağ boşluğu.
- `box`: tüm geniş kutuların en dış kenarı.
- `sw`: `documentElement.scrollWidth`.

```
                     320        360        390        472
blog-post            card 2/.   2/.        2/2        2/2      sw=iw
kayit/giris (hata)   2/2        2/2        2/2        12/12   (max-w-md kart; fe-fb Açık soru 2)
tablo-audit          2/2        2/2        2/2        2/2     (tablo kart içinde kayıyor)
tablo-person-days    2/2        2/2        2/2        2/2
tablo-cordis         2/2        2/2        2/2        2/2     (box sağ=-46 → Y-1)
bos-relationships    2/.        2/2        2/2        2/2
detay-firsat         2/2        2/2        2/2        2/2
admin-plans          2/2        2/2        2/2        2/2
portal-partner       kart 2px (kare) · iç p-8 → metin 35px   sw=iw
calls-germany        metin sol=2 · tam genişlik hero          sw=iw
cookie-sheet         tam genişlik alt sheet (fixed, x=0), iç p-4 → metin 16
privacy-modal        16/16 (modal overlay'i p-4)  → D-2
daterange-popover    sol 3.7, taşma yok
```

- 15 ekranın 60 ölçümünün hepsinde `scrollWidth === innerWidth`. `OVER` (viewport dışına taşan öğe) listesi boş.
- Sunucu tarafı giriş hatası kutusu kartın içinde ve okunur (`kareler/giris-sunucu-hata-320.png`).
- Kart içi okunurluk (`kareler/montaj-320.png`): form, tablo, detay, modal ve sheet'te metin kart iç dolgusunun içinde kalıyor; hiçbir yerde kırpılma yok.
- `detay-cagri` (`(app)/cagrilar/[id]`) seed'deki `Call.id` ile 404 döndü. fe-fb bu rotayı `ws-calls-detail` olarak zaten ölçmüştü, o yüzden kapsam dışı tuttum.

### 2b. Önce/sonra, 80 rota (`evidence/scan-once.log`, `scan-sonra.log`)

- 160 ölçümün hepsinde st=200 ve belge düzeyinde `sw === iw`. fe-fb'nin iddiası belge düzeyinde doğru.
- **`<main>` içinde yatay kayma** (`main.scrollWidth − clientWidth`):

| rota | 320 önce → sonra | 360 önce → sonra |
|---|---|---|
| opportunities/demo-opp-1/evaluations | 234 → **196** | 194 → **156** |
| admin/cordis | 132 → **118** | 92 → **78** |
| admin/alerts | 55 → **41** | 15 → **1** |
| approvals, onay-merkezi | 54 → **24** | 14 → 0 |
| ayarlar/kapilar, settings/gates | 14 → **14** | 0 → 0 |
| ayarlar, ayarlar/moduller, settings/modules, admin/modules | 2–8 → 0 | 0 → 0 |

Toplam: 320'de 11 rotadan 7'ye, 360'ta 5 rotadan 3'e düştü. Kalanlar önceden de vardı; hiçbiri bu değişiklikle ortaya çıkmadı.

Kare: `kareler/evaluations-360-sonra-kaydirilmis.png`. `main.scrollLeft=156` iken sayfa yana kaymış görünüyor (önce 194).

### 2c. Odak halkası (320px, Tab ×40 / ekran)

- Tarayıcının varsayılan halkası 3px (genişlik + offset). Halkası kırpılan öğeler yalnız sol kenardan 2px'te duran tam genişlikli bağlantılar: blog'daki ilgili yazı kartları ve ana sayfa CTA'ları.
- Kırpılan kısım `cutL=1` / `cutR=1`, yani halkanın 3px'inden 2px'i görünür kalıyor.
- `tablo-cordis`'teki kırpılmalar Y-1'den geliyor: sekme şeridi `<main>` dışına taşıyor.

### 2d. Landscape (`evidence/probe-landscape.log`)

- **568** (<640): hepsi 2px, `sw=iw`.
- **667 / 844** (≥640, `sm:` devrede): uygulama sayfalarında 24–56px dolgu var. 844'te admin kenar çubuğu açılıyor (card sol=312–320). Kırılma noktası tasarımından kaynaklanıyor, hata değil. Açık soru 1'e bakın.

### 2e. 768/1280 piksel (`evidence/genis-piksel.txt`)

```
admin-audit, blog-post, dashboard, home, opp-documents, portal, settings-privacy × {768,1280}
→ 14/14 IDENTICAL (boyut da aynı)
```

Sınır: dashboard, opp-documents ve settings sayfalarında içerik `<main overflow-auto>` içinde kaydığı için tam sayfa kare yalnız viewport yüksekliğini (900px) yakalıyor. Home ve blog tam uzunlukta karşılaştırıldı (5993 ve 6666 px).

### 2f. Bekçi mutasyonları

```
baseline                                                    6/6 yeşil
M1 (app) kök  "mx-auto max-w-4xl p-4"                       KIRMIZI ✓
M5 public     "mx-auto max-w-5xl px-4 sm:px-6"              KIRMIZI ✓
M2 (app) kök  "p-6 space-y-6"  (max-w yok)                  YEŞİL  ✗ yanlış negatif
M6 public kök "min-h-screen px-4 py-10" (max-w yok)         YEŞİL  ✗ yanlış negatif (portal kökü tam bu kalıpta)
M3 cn("mx-auto max-w-4xl p-4")                              YEŞİL  ✗ (testin yorumunda yazılı sınır)
M4 iç boş-durum bloğu "mx-auto max-w-sm text-center py-6 px-4" (sayfa kökü sm:px-4) KIRMIZI ✗ yanlış pozitif
```

### 2g. Kapılar (`evidence/gates.txt`, `vitest-ozet.txt`)

```
typecheck=0  lint=0  i18n:check=0 ("✅ i18n check passed")  build=0
npx vitest run → Test Files 267 passed | 6 skipped (273) · Tests 3205 passed | 73 skipped (3278)  EXIT=0
```

Vitest koşusundan önce DB seed hâline döndürüldü (portal fixture silindi).

## 3. Bulgular

- **Y-1 (Orta, önceden var, regresyon değil).** App ve admin `<main>` öğeleri `overflow-auto` / `overflow-y-auto` kullanıyor. Bu yüzden içerik taştığında belge değil `<main>` yana kayıyor. `documentElement.scrollWidth === innerWidth` ölçüsü, fe-fb'ninki dahil, bunu görmüyor. 360'ta hâlâ 3 rota yana kayıyor: evaluations 156px, cordis 78px, alerts 1px. 320'de 7 rota kayıyor. Suçlular sayfaların kendi içeriği: sekme şeridi (`button.px-4 py-2.5 … rounded-t-xl`, taşan flex şerit), `div.flex gap-2` buton grubu ve alerts'teki mono kutu. Bu iş durumu iyileştirdi ama kapatmadı. **Öneri:** ayrı kart. Sekme şeritleri kendi `overflow-x-auto` kabına alınsın, buton grupları `flex-wrap` olsun. Bekçiye ya da e2e'ye `main.scrollWidth <= main.clientWidth` ölçüsü eklensin.
- **D-1 (Düşük).** Bekçinin kör noktaları. `max-w-*` taşımayan sayfa kökleri (`p-6 space-y-6`, public `min-h-screen px-4`) yanlış negatif veriyor, `cn()` ile kurulan sınıflar da görünmüyor. Sayfa kökü olmayan ortalanmış bir iç blok ise yanlış pozitif veriyor (`mx-auto max-w-sm px-4`). Bugünkü kodda FP yok (baseline yeşil), ama bu kalıp yazan bir sonraki geliştirici yanlış yere `sm:` koymaya itilir. **Öneri:** her `page.tsx`'in ilk JSX öğesini kök say ve yalnız onu kontrol et; iç blokları muaf tut.
- **D-2 (Düşük, bilgi).** Tam genişlikli bağlantılarda odak halkasının 1px'i ekran dışında kalıyor, 2px'i görünür. A11y açısından kabul edilebilir. İstenirse `outline-offset:-2px` (iç halka) ile çözülür.
- **D-3 (Bilgi, patron kararı).** Modal overlay'i (`p-4`, kutu 16px içeride) ve çerez sheet'inin iç dolgusu (16px) 2px kuralına tabi değil. Overlay tasarımı olarak makul, ama "tüm projede" kapsamına girip girmediği patron kararı.

## 4. Değişen dosyalar

- `docs/agent-results/TASK-MUNVVTG24X8I-devop-fb.md` (bu rapor)
- `docs/agent-results/TASK-MUNVVTG24X8I-devop-fb-evidence/`: betikler (`probe/scan/wide/formerr/evshot.mjs`), loglar ve 6 kare

Kod değişikliği yok.

## 5. Riskler

- Y-1 kullanıcıya görünür: telefonda evaluations ve cordis sayfası parmakla yana sürüklenebiliyor. Önceden daha kötüydü.
- Ölçümler `next dev` ile yapıldı. `next start` bu ortamda çalışmadı: `.env`'deki `DEMO_LOGIN_ENABLED=true` production modda sunucuyu bilerek durduruyor, ayrıca `output: standalone` uyarısı veriyor. CSS aynı Tailwind derlemesinden geliyor. Prod build'in kendisi `pnpm build` ile ayrıca doğrulandı (exit 0).

## 6. Açık sorular (patron)

1. Landscape telefonlar (≥640px, örneğin 667/844) `sm:` dolgusu alıyor (24–56px). "Mobil = 2px" kuralı landscape'i de kapsıyor mu? Kapsıyorsa kırılma noktası `sm` yerine `md` ya da bir `edge` özel breakpoint'i olmalı.
2. Modal overlay'i ve çerez sheet'inin iç dolgusu da 2px'e insin mi (D-3)?

## 7. Sonraki adım

- Y-1 için ayrı kart: evaluations ve cordis sekme şeridi, approvals ve onay-merkezi buton grubu, alerts kutusu. Bunlara `<main>` taşma ölçüsü (e2e) eklensin.
- D-1 için bekçide sayfa kökü tespitinin düzeltilmesi (küçük iş, fe-fb).
