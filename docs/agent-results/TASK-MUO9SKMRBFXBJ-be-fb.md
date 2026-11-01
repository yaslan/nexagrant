# TASK-MUO9SKMRBFXBJ — be-fb — FB İNCELEME-96: mobil `<main>` yana kayma düzeltmesi (TASK-MUNZ06XM2OIL2)

**Durum:** TAMAM
**Karar:** **ONAY.** Düzeltme doğru, bağımsız ölçümle tekrarlandı ve regresyon yok. Aşağıdaki Y-1, Y-2 ve bekçi kör noktaları bu kartı durdurmuyor, takip kartı olarak öneriliyor.
**İncelenen:** fe-fb `fe-fb/munz06-main-overflow`, dev merge `a222ca6a`. Diff: 6 bileşen + yeni `tests/e2e/mobile-main-overflow.spec.ts`.
**Ortam:**
- Üç ayrı worktree:
  - SONRA: dev HEAD `b106dd00` (içinde `a222ca6a` var), `next build` + `next start` :3496.
  - ÖNCE: `83bc522c` (merge'ün 1. ebeveyni), `next build` + `next start` :3497.
  - MUTANT: `b106dd00`, `next dev` :3498, `DEMO_LOGIN_ENABLED=true`. Spec'in kendi giriş akışı için.
- İzole Postgres konteyneri `befb96-pg` (127.0.0.1:55496). CI sırasıyla kuruldu: db push → rls-role → apply-migrations ×2 (ikisi de exit 0) → rls → seed. Paylaşılan `fabrika-postgres` :5433'e yazılmadı.
- Tarayıcı: gerçek Chrome (Playwright kütüphanesi, `channel:'chrome'`). Oturum `encode()` ile basılan Auth.js çereziyle açıldı. Mutant sunucusunda spec'in kendi `/tr/giris` form girişi kullanıldı.

**Platform beyanı:** Doğrulama macOS'ta yapıldı (Darwin 27, Chrome). Değişiklik yalnızca Tailwind sınıflarından ve tek bir `onFocus → scrollIntoView` satırından oluşuyor. Süreç, dosya yolu, kabuk, DPI ya da izin kullanan bir kod yolu yok. Windows ve Linux'ta koşulamadı çünkü bu makinede yoklar. Koda göre orada farklı davranacak bir şey yok: kırılma noktaları CSS media query ve motor aynı Chromium. Firefox ve Safari'de koşulmadı. `scrollIntoView({block:'nearest',inline:'nearest'})` standart API; o motorlar odaklanan öğeyi zaten kendileri kaydırıyor, bu satır orada ya hiçbir şey yapmaz ya da aynı işi yapar.

## 1. Ne yapıldı

1. **Bağımsız ölçüm (seed verisi):** devop-fb'nin 80 rotası 7 genişlikte tarandı (320/360/390/472/640/768/1280). Her iki sunucuda 560'ar ölçüm alındı. Her ölçümde `main.scrollWidth − clientWidth`, `documentElement.scrollWidth − innerWidth`, taşmayı gizleyen ata (html→main zincirinde `overflow-x:hidden|clip`) ve `overflow-hidden` kapsayıcıda kırpılan öğe sayısı kaydedildi.
2. **Veriyle dolu durumlar** (yalnız izole DB'de, `betikler/seed-long.sql`, iki kez koşuldu, idempotent):
   - 1500 SystemAlert: uzun URL'li mesaj, 200 karakterlik meta.
   - 24 ApprovalRequest: uzun başlık, URL'li açıklama.
   - 190 karakterlik bölünmez belirteç içeren fırsat başlığı.
   - Gerçekçi `HORIZON-CL5-2027-D3-01-10` başlıklı fırsat.
   - Değerlendirmesiz fırsat (boş durum). Alerts ve approvals'ın boş durumu seed taramasında zaten var.
   - Bu durumlar 12 rota × 8 genişlikte, önce ve sonra tarandı. Kırpılma denetimi metin taşıyan her öğeyi kapsıyor: `overflow-hidden` bir atanın dışına taşıyorsa ve `text-overflow:ellipsis` bilinçli kısaltması değilse sayılıyor.
3. **Etkileşim (320px):**
   - approvals detay ve yeni talep modalı açıkken ölçüm.
   - cordis ve evaluations sekme şeritlerinde gerçek klavye Tab gezinmesi, Enter, dokunma (`touchscreen.tap`) ve yatay tekerlek.
4. **Spec'in birebir kopyası:** `betikler/specrun.mts`, ROUTES/WIDTHS/ADMIN_EMAIL değerlerini doğrudan spec dosyasından okuyor. Aynı giriş, aynı başlık beklemesi, aynı `setViewportSize` döngüsü kullanılıyor. `playwright test` AgentSpace kill-guard (R8) tarafından reddedildiği için bu yol izlendi; guard'ı aşmadım.
5. **Mutantlar:** 12 mutant koşuldu (8 tekli + 4 bileşik/ek). Her birinde dev sunucusu yeniden derledi, spec kopyası koştu, dosya `git checkout` ile geri alındı. Mutant worktree'sinde kendi değişikliğim yoktu.
6. **768/1280 piksel karşılaştırması:** 8 ekran, animasyonlar kapalı, tam sayfa. Gürültü tabanı için ÖNCE iki kez çekildi (ÖNCE ile ÖNCE2 karşılaştırıldı).
7. **Kapılar:** tsc, lint, i18n ve tam `npx vitest run` (yerel ve izole DB'de `CI=true`).

## 2. Kanıt

Ekler: `docs/agent-results/TASK-MUO9SKMRBFXBJ-be-fb-ekler/`

### 2a. fe-fb'nin ölçümü bağımsız olarak tekrarlandı (`summary.txt`, `scan-once.log`, `scan-sonra.log`)

```
ONCE  n=560 mobil main-taşma 14 mobil doc-taşma 0 768 main 10 1280 main 0
SONRA n=560 mobil main-taşma  0 mobil doc-taşma 0 768 main  6 1280 main 0
YENİ taşma (sonra>0, önce=0): []
clipped artan (sonra>önce): —
```

ÖNCE'deki 14 mobil taşma, fe-fb'nin tablosuyla sayı sayı aynı:

| Rota | Taşma (ÖNCE) |
|---|---|
| evaluations | 196 / 156 / 126 / 44 (320 / 360 / 390 / 472) |
| cordis | 118 / 78 / 48 |
| alerts | 41 / 1 |
| approvals | 24 |
| onay-merkezi | 24 |
| kapilar | 14 |
| gates | 14 |
| firsatlar | 640px'te 4 |

SONRA'da hepsi 0. 768'de kalan 6 taşma fe-fb'nin §4'te bildirdiği ve dokunmadığı tablet rotaları: admin/billing 25, feedback 14, modules 95, ayarlar, ayarlar/moduller ve settings/modules 60'ar.

- Belge düzeyinde taşma her iki tarafta 0. Bu beklenen bir sonuç: uygulama kabuğunda `main`'in ataları `overflow:hidden`, kaydırma kutusu `main`'in kendisi. Bu yüzden doğru ölçüt fe-fb'nin seçtiği `main.scrollWidth − clientWidth`.
- 49 rotada `<main>` yok (kamu sayfaları). Onlarda doc taşması 0. 7 rota 200 dışı dönüyor, her iki tarafta da aynı yönlendirme/404.

### 2b. Taşma GİZLENMEDİ (`scan2-*.log`, `summary2.txt`)

- Diff'te `overflow-x-hidden` / `overflow-hidden` / `truncate` eklenmesi yok. Eklenen tek taşma sınıfı iki sekme şeridindeki `overflow-x-auto`, yani kaydırılabilir.
- Veri dolu taramada kırpılan metin sayısı ÖNCE 5, SONRA **0**. ÖNCE'deki 5 kırpılma evaluations başlık kartındaki uyarı kutusuydu: 768'de `+216px` "İç ön değerlendirme: Bu puan…", EN'de `+166px`. fe-fb'nin "ek kusur" iddiası doğrulandı.
- Tablolar kendi içinde kayıyor: alerts tablosu (`min-w-[820px]`, `overflow-x-auto` sarmalayıcı) her genişlikte `innerScrollers=1`, `main` taşması 0. Bu 1500 satır ve 200 karakterlik meta ile ölçüldü.
- Oluşturulan CSS'te sınıflar gerçekten var: `.wrap-anywhere{overflow-wrap:anywhere}` ve `.shadow-\[inset_0_-1px_0_var(--color-border)\]{…}`. Kaynak: `.next/static`.

### 2c. Veriyle dolu durum, önce → sonra (`summary2.txt`)

```
ONCE  96 ölçüm, taşma 45, kırpık 5 | SONRA 96 ölçüm, taşma 8, kırpık 0
SONRA'da kalan 8 taşma: firsatlar/befb-long ve pipeline/befb-long, 320:641 360:601 390:571 472:489 (190 karakterlik bölünmez belirteç; ÖNCE'de de aynı + 640–1280'de de vardı)
```

Gerçekçi `HORIZON-CL5-2027-D3-01-10` başlığında her genişlikte 0 taşma var. ÖNCE'de bu başlık 768'de 143px taşıyordu. Boş durumlarda (değerlendirmesiz fırsat, boş alerts, boş approvals sekmesi) taşma 0.

### 2d. Modal ve gerçek etkileşim, 320px (`interact-sonra.log`, `kareler/sonra-320-*.png`)

```
approvals DETAY modalı açık   panel left=16 right=304 iw=320 fits=true innerOver=0 ; main.scrollLeft=0
approvals YENİ TALEP modalı    panel left=16 right=304 iw=320 fits=true innerOver=0
cordis  şerit sw/cw=764/316, 4 sekme, Tab ile odak: tam | tam | tam | tam ; Enter → mainOver 0 ; tap ilk sekme etkin=true ; tekerlek → şerit.scrollLeft=300, main.scrollLeft=0
evaluations şerit sw/cw=727/316, 3 sekme, odak: tam | tam | tam ; Enter → mainOver 0 ; tap etkin=true ; tekerlek → şerit 300, main 0
```

Modal `fixed` olduğu için açıkken `main` genişliği değişmiyor. Modal açıkken görülen `mainOver=12` modaldan değil, arkadaki listeden geliyor (Y-1).

### 2e. Spec'in birebir kopyası (`specrun-base.log`)

```
login-page: input[type=email] count=1, form button[type=submit] count=1 (strict locator needs 1)
✓ ×8 … 8 passed, 0 failed
```

Spec'in giriş seçicileri tekil, strict-mode ihlali yok. Başlık beklemesi ve 200 kontrolü çalışıyor.

### 2f. Mutantlar (`mutants.log`, `mutants2.log`, `interact-M12.log`)

| # | Mutant | Spec kopyası |
|---|---|---|
| M3 | evaluations şeridinden `overflow-x-auto` sil | **KIRMIZI** 320:409 … 640:135 |
| M8 | cordis şeridinden `overflow-x-auto` sil | **KIRMIZI** 320:446 |
| M4 | alerts `dl` → eski `flex shrink-0` | **KIRMIZI** 320:41 |
| M5 | approvals `flex-wrap` sil | **KIRMIZI** approvals + onay-merkezi 320:24 |
| M6 | cordis çalıştırma satırı `flex-wrap` sil | **KIRMIZI** 320:46 |
| M1 | **firsatlar başlık `min-w-0` sil** (görevdeki mutant) | **yeşil: hayatta** |
| M7 | firsatlar satırı `sm:flex-wrap` sil | yeşil: hayatta |
| M9 | M1 + M7 birlikte | **KIRMIZI** 640:4 |
| M2 | gates iki `min-w-0` sil | yeşil: hayatta |
| M10 | gates ızgarası eski `grid-cols-2` (min-w-0 kalsın) | yeşil: hayatta |
| M11 | M2 + M10 birlikte | **KIRMIZI** 320:22 |
| M12 | cordis `onFocus` scrollIntoView sil | yeşil: hayatta. Klavyede 2/4 sekme YARIM kalıyor (`OLAP r=408 > şerit 318`, `Vector RAG Lab r=413`). |

Her hayatta kalan mutant için ölçülen durum:

- **M1:** seed başlığı kısa olduğu için bekçi fark etmiyor, ama `min-w-0` ölü kod değil. Uzun başlıkla ölçtüm: temel kodda 640, 768 ve 1024'te 0; M1'de 359, 745 ve 857 px taşma.
- **M7 ve M1:** çifte savunma, ikisi birlikte silinince bekçi yakalıyor.
- **M2 ve M10:** gates'teki ızgara değişikliği ile `min-w-0` birbirinin yedeği.
- **M12:** odak düzeltmesini hiçbir test korumuyor.

### 2g. 768/1280 piksel regresyonu (`px-diff.txt`, `kareler/montaj-768-*-once-sonra.png`)

- **1280:** 8/8 ekran SONRA ile ÖNCE arasında **AYNI**. ÖNCE ile ÖNCE2 arasında alerts'te 18 piksel ve evaluations'ta maxdelta 5 gürültü var; bu göreli saat metninden geliyor.
- **768:** dashboard, documents ve cordis-dışı ekranlar AYNI. Değişenler yalnız ÖNCE'de taşan ya da sıkışan ekranlar:
  - evaluations: kırpılan uyarı kutusu artık tam görünüyor, sekmeler tek satır ve kayıyor.
  - firsatlar: aksiyonlar başlığın altına indi, ÖNCE'de kart kabuğun dışına taşıyordu.
  - gates: tek sütun.
  - approvals: hap sekmeler metni 3–4 satıra kırmak yerine alt alta diziliyor.
  - cordis: şerit.
  - alerts: gürültü düzeyi.
- Karelerde sütun çökmesi ya da yeni kırpılma yok.
- Yöntem notu: karede `main` ve ataları `overflow:visible` yapıldı ki tam içerik görünsün. Bu yüzden ÖNCE'de taşan ekranların kare genişliği 768'den büyük (806/818/924/1041). Taşma sayısı için taramalar esas.

### 2h. Kapılar (dev HEAD `b106dd00`, izole DB)

```
tsc=0  lint=0  i18n=0 ("both catalogs agree…")  next build exit=0 (SONRA ve ÖNCE)
npx vitest run (yerel):         Test Files 292 passed | 6 skipped · Tests 3696 passed | 99 skipped · exit=0
CI=true npx vitest run (izole): Tests 3754 passed | 0 failed | 41 skipped · exit=0
  atlananlar (vitest-ci-skips.txt): evidence-upload-s3.live 21, evidence-confirm-store-faults.live 11 (S3/minio yok),
  k1-daily-calls 4, adapters 2, sedia-adapter 2 (ağ), k1-embeddings.live 1 (OpenAI anahtarı yok)
```

Yerelde 99 atlama var: DB adı `fabrika` ve CI yok diye silme yapan canlı testler kendini atlıyor. `CI=true` koşusunda bunlar da koştu ve geçti.

## 3. Değişen dosyalar

Kod değiştirilmedi. Yalnız:
- `docs/agent-results/TASK-MUO9SKMRBFXBJ-be-fb.md` (bu rapor)
- `docs/agent-results/TASK-MUO9SKMRBFXBJ-be-fb-ekler/`: loglar, özetler, `betikler/` (tarama, etkileşim, spec kopyası, piksel ve seed betikleri) ve `kareler/` (10 PNG)

## 4. Riskler / bulgular

- **Y-1 (ORTA, önceden var, bu kartın kapsamı dışında ama aynı rota):** approvals "Taleplerim" listesinde açıklamaya yapıştırılan gerçekçi bir URL `main`'i taşırıyor. Örnek URL (`https://docs.example.test/fonbridge/wp3/butce-revizyonu-2027-q1.pdf`) ile ölçümler:
  - SONRA: 320'de 12px, 768'de 12px. ÖNCE: 31 / 12.
  - Kaynak `div.space-y-2 flex-1`: metin kapsayıcısında `min-w-0` ve URL için `break-all` / `wrap-anywhere` yok. 768'de aksiyon satırı da taşıyor.
  - URL'siz açıklamada 0 (`appr-urlsiz-sonra.log`). Uç veriyle (90 karakterlik bölünmez başlık) ÖNCE de SONRA da 1295px taşıyor ve detay modalının × düğmesi ekran dışına çıkıyor (`appr-uzun-*.log`).
  - Bekçi yalnız varsayılan (boş) sekmeyi seed verisiyle ölçtüğü için bunu göremez.
- **Y-2 (DÜŞÜK–ORTA, önceden var):** fırsat başlığı (`pipeline/[id]/client.tsx:178` h1) mobil sütun düzeninde bölünmez uzun bir belirteçte taşıyor: 190 karakterde 320px'te 641px. Neden: satır `items-start`, bu yüzden sütunda alt öğe genişliği max-content oluyor; `break-words` (overflow-wrap:break-word) min-content'i küçültmüyor. fe-fb'nin `min-w-0 break-words` eki ≥640'ta işe yarıyor (M1 ölçümü) ama <640'ta bu durumu çözmüyor. Gerçekçi konu kodunda sorun yok; URL yapıştırılmış başlıkta var. Öneri: h1'e `wrap-anywhere`, evaluations'taki gibi.
- **B-1 (bekçi kör noktaları, DÜŞÜK):**
  - M1, M2, M7, M10 tek başına hayatta, çünkü seed verisiyle bu sınıflar birbirinin yedeği ya da yalnız uzun veride devreye giriyor.
  - M12 (`onFocus`) için hiçbir test yok.
  - Bekçi yalnız 8 rotayı ≤640'ta ölçüyor; 768/1024 tablet taşmaları kapsam dışı.
- **B-2 (süreç):** Spec gerçek Playwright koşucusunda hiç koşmadı: yerelde kill-guard engelliyor, `a222ca6a` origin/dev'de yok ve CI koşusu yok. İlk gerçek koşu push sonrası CI olacak. Spec kopyam 8/8 yeşil ve seçiciler tekil, ama koşucu farkları (globalSetup, `prisma` import'u) yalnız CI'da görülecek. Aynı kalıbı kullanan `alert-console-truncation.spec.ts` CI'da koşuyor.
- **O-1 (not):** alerts "Kaynak" `<select>`'i en uzun seçenek kadar genişliyor. Yaklaşık 60 karakteri aşan bir kaynak adında 320px'te taşıyor. Kaynaklar kodda sabit ve bugün en uzunu 30 karakter (`invoice_buyer_identity_missing`); onunla 0. Şu an risk değil.

## 5. Açık sorular

- **Sonuç dosyası yolu çelişkisi:** görev gövdesi sonuç dosyasını `FONBRIDGE/docs/agent-results/TASK-MUO9SKMRBFXBJ-be-fb.md` olarak veriyor. Sarmalayıcı blok ise `/Users/macbook/alan/docs/agent-results/TASK-MUNVVTG24X8I-devop-fb.md` diyor. Bu yol hem repo dışında hem de devop-fb'nin başka bir kartının rapor adı. Oraya yazmak başka bir ajanın raporunu ezerdi, bu yüzden gövdedeki yol esas alındı.
- Y-1 ve Y-2 için tek bir "mobil uzun-veri taşmaları" kartı açılsın mı? Önerim: evet. Kapsam: approvals liste satırı + modal başlığı, fırsat h1, bekçiye uzun-veri fixture'ı ve bir `onFocus` klavye testi.

## 6. Sonraki adım

- dev push edildiğinde CI e2e job'unda `mobile-main-overflow.spec.ts`'nin ilk gerçek koşusunu kontrol et.
- Y-1/Y-2/B-1 için takip kartı (yukarıdaki kapsam). fe-fb §5'teki tablet (768/1024) kartı ayrıca duruyor.
- Temizlik: izole `befb96-pg` konteyneri, üç worktree ve üç sunucu (yalnız kendi pid'lerim) rapor commit'inden sonra kapatılıyor.
