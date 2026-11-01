# TASK-MUOD7E7LCR9CL — fe-fb — FB İNCELEME-109: se-fb mobil takip düzeltmesi (TASK-MUOAYGYXW8PHI, merge e5eaa8a3)

**Durum:** TAMAM
**Karar:** **ONAY (koşullu değil), 2 takip bulgusuyla.** Düzeltme amacına ulaşıyor: 4 uzun veri türünde (URL, boşluksuz kelime, e-posta, Türkçe uzun kelime) approvals iki sekme, detay modalı ve fırsat detay, 320–1280 arasında `<main>`'i taşırmıyor. Metin de gizlenmiyor, kart içinde kırılıyor. M1/M2/M7/M12 artık bekçide ölüyor. Kapılar temiz. Merge'i geri almayı gerektiren bir şey yok. Bulgular:
- **Y-1 (ORTA, önceden var, düzeltmenin kapsamı dışında):** aynı sayfada fırsatın **arşiv onayı** bandı uzun başlıkta hâlâ `<main>`'i taşırıyor (320'de +387).
- **Y-2 (DÜŞÜK, düzeltmenin yan etkisi):** 768px'te ve gerçekçi, kısa metinli bir onay kartında sıradan kelimeler harf ortasından bölünüyor: "revizyon|u", "konsorsiyu|m".
- **B-1 (DÜŞÜK):** bekçi fixture'ında red gerekçesi ve uzun e-posta yok. Bu yüzden K3 mutantı hayatta kalıyor ve gerçek bir taşmayı kaçırıyor.

**Kapsam:** bağımsız inceleme. Kod DEĞİŞTİRİLMEDİ.
**Platform beyanı:** Doğrulama macOS'ta yapıldı (Darwin 27, gerçek Google Chrome, `channel:'chrome'`, headless). Değişiklik yalnız Tailwind sınıfları. Süreç, dosya yolu, kabuk, DPI ya da izin kullanan kod yolu yok. Windows ve Linux bu makinede olmadığı için koşulamadı. Koda göre orada farklı davranacak bir şey yok: `min-width:0`, `overflow-wrap:break-word` ve media query bütün motorlarda standart. Firefox ve Safari koşulmadı. Y-2'deki kelime bölünmesi yazı tipi metriğine bağlı olduğu için bölünmenin olduğu genişlik aralığı sistemden sisteme birkaç px kayabilir.

## Ortam

- **SONRA:** dev `661dbdfc` (merge `e5eaa8a3` + se-fb raporu).
- **ÖNCE:** `e5eaa8a3^1` = `be797148`. `git diff be797148 661dbdfc -- src` yalnız düzeltmenin iki dosyası (10+/4−). Böylece ÖNCE/SONRA farkı yalnız bu düzeltme.
- Ayrı worktree'ler scratchpad'de: `wt109` (SONRA), `wt109once` (ÖNCE), `wt109m` (mutantlar). `node_modules` APFS klonu.
- İzole Postgres `fefb109-pg` (pgvector pg16), 127.0.0.1:55109. CI sırasıyla kuruldu: db push → rls-role → apply-migrations ×2 (41/41) → rls → seed (`db-hazirlik`). Her koşudan önce `DATABASE_URL` echo'landı: `postgresql://fabrika:***@127.0.0.1:55109/fabrika`. Worktree `.env`'lerinde `5433` sayısı 0. Paylaşılan fabrika :5433'e yazılmadı.
- Ölçüm ve piksel: `next build` + `next start`, SONRA :3109, ÖNCE :3110. Oturum, `encode()` ile basılan Auth.js çereziyle açıldı.
- Spec ve mutantlar: `next dev` :3111 (`DEMO_LOGIN_ENABLED=true`, e2e test anahtarı), CI'ın varsayılan e2e sunucusuyla aynı.
- `npx playwright test` AgentSpace kill-guard'ı (R8) tarafından reddedildi (`MURAT_LIVE_OK` onayı yok). Guard'ı aşmadım. Spec, se-fb'nin shim koşucusuyla koşuldu. Shim'i satır satır okudum: spec kaynağı olduğu gibi yükleniyor, yalnız `@playwright/test` içe aktarımı değişiyor, `expect` gerçek kütüphanenin, 10 sn. Kopyası `betikler/` altında değil, se-fb eklerinde.

## 1. Ne yapıldı

1. Düzeltme diff'ini ve se-fb'nin fixture/spec değişikliğini okudum. Kod yolu: approvals kart metin bloğu, detay modal başlığı, fırsat başlık bloğu.
2. **Uzun veri taraması** (`betikler/fefb109-measure.mts.txt`): 4 varyant, her biri için 1 fırsat ve 3 onay talebi ekledim.
   - başkasının talebi (Onayla/Reddet düğmeleri var). Talep edenin adı yok, bu yüzden kartta **92 karakterlik e-posta** görünüyor.
   - adminin kendi talebi.
   - adminin **REDDEDİLMİŞ** talebi, `rejectionReason` = uzun belirteç.

   Ekranlar 320/360/390/472/640/768/1024/1280'de ölçüldü: approvals Onayımı Bekleyenler, approvals Taleplerim, 320'de detay modalı (× konumu, gerçek tıklamayla kapatma), fırsat detay ve fırsat arşiv onayı (gerçek "Arşivle" tıklaması). Her genişlikte ölçülenler:
   - `main.scrollWidth − clientWidth`
   - `documentElement.scrollWidth`
   - **gizlenmiş taşma kontrolü:** belirteci taşıyan her yaprak öğede `text-overflow:ellipsis` var mı, `scrollWidth > clientWidth` mi, sağ kenar `<main>`'i aşıyor mu, bir atada `overflow:hidden/clip` kırpması var mı.
3. **768/1024/1280 piksel regresyonu** (`fefb109-px.mts.txt`, `fefb109-pxdata.mts.txt`): se-fb yalnız seed verisiyle karşılaştırmıştı; seed'de onay talebi yok, yani approvals boş ekrandı. Ben kısa ve orta uzunlukta gerçekçi metinle 3 talep ve 1 fırsat ekledim. 6 ekran × 3 genişlik × ÖNCE / SONRA / ÖNCE2 (gürültü tabanı) karşılaştırıldı.
4. **Mutantlar** (`mutants.py.txt`): M1/M2/M7/M12 ve kendi mutantlarım K1–K5, spec'e karşı. Hayatta kalanların gerçek zararı ölçüm betiğiyle ölçüldü.
5. **Kapılar:** tsc, lint, i18n, next build (ÖNCE ve SONRA), tam `npx vitest run`.

## 2. Kanıt

Ekler: `docs/agent-results/TASK-MUOD7E7LCR9CL-fe-fb-ekler/`

### 2a. Uzun veri: ÖNCE → SONRA (`olcum-once.log`, `olcum-sonra.log`, next start)

Varyantlar:
- `url`: 151 karakter, sorgu dizesi dahil.
- `kelime`: `WP3_ButceRevizyonu_…_2027Q1`, 85 karakter, boşluksuz.
- `eposta`: 92 karakter.
- `turkce`: `Muvaffakiyetsizleştiricileştiriveremeyebileceklerimizdenmişsinizcesine`.

| Ekran (4 varyant × 8 genişlik = 32 ölçüm) | ÖNCE sorunlu | SONRA sorunlu |
|---|---|---|
| approvals / Onayımı Bekleyenler | 20 | **0** |
| approvals / Taleplerim (red gerekçesi dahil) | 18 | **0** |
| fırsat detay | 15 | **0** |
| detay modalı 320 (4 varyant) | 4 (× ekran dışında: 347…862) | **0** (× right=279, panel 16..304, iç taşma 0) |
| fırsat **arşiv onayı** (düzeltme kapsamı dışında) | 21 | 18, bkz. Y-1 |

```
once   kelime onayimi-bekleyen   320 main 833/320 TAŞMA +513  <- div.space-y-2 flex-1 +513
once   kelime firsat-detay       320 main 1229/320 TAŞMA +909 <- div.min-w-0 break-words +909
once   url    detay-modal        320 ×.right=442 … panel sw-cw=139 SORUN
sonra  kelime onayimi-bekleyen   320 main 320/320 EŞİT doc=320/320 main.ox=auto metin=görünür
sonra  turkce taleplerim         472 main 472/472 EŞİT doc=472/472 main.ox=auto metin=görünür
sonra  eposta firsat-detay       640 main 640/640 EŞİT doc=640/640 main.ox=auto metin=görünür
sonra  url    detay-modal        320 ×.right=279 başlık sw-cw=0 panel=16..304 sw-cw=0 OK ; kapandı=true
```

İstenen 320/360/390/472/640 genişlikleri ve ayrıca 768/1024/1280 loglarda satır satır var. SONRA'da 96 liste/detay ölçümünün tamamında `main.scrollWidth === main.clientWidth`. `main.ox=auto` değişmedi, yani taşma `overflow-hidden` ile gizlenmemiş. `metin=görünür`: ellipsis yok, kırpan ata yok, metin kutusunu aşmıyor.

Kareler: `kareler/montaj-{url,kelime,eposta,turkce}-{onayimi-bekleyen,taleplerim,firsat-detay,detay-modal}-320-once-sonra.png`.

**Uzun e-posta ve red gerekçesi** (`peek-eposta-requester-320.png`, `peek-red-gerekcesi-320.png`): se-fb raporu bunların "kalıtımla" korunduğunu yazıyordu ama ölçmemişti. Ölçtüm, 320'de ikisi de kart içinde kalıyor:
```
bekleyen   main 320/320 | STRONG 23..279 w=256 ws=break-word
taleplerim main 320/320 | DIV 23..297 w=274 ws=break-word
```

### 2b. 768/1024/1280 piksel regresyonu (`px-diff.txt`, next start, gerçekçi kısa/orta veri)

```
1024 / 1280: 12/12 ekran ÖNCE↔SONRA maxdelta=0 (approvals, taleplerim, modal, onay-merkezi, fırsat-kısa, demo-opp-1)
768  fırsat-kısa, demo-opp-1, taleplerim: 0 fark
768  approvals / onay-merkezi: piksel(>8)=22230  <- Y-2
768  approvals-modal: 25436, yalnız bulanık arka plandaki kart; modal kutusu aynı
ÖNCE↔ÖNCE2: 18/18 ekran 0 (gürültü yok)
```

Kare: `kareler/montaj-px-768-approvals-once-sonra.png`.

### 2c. Mutantlar (`mutants.log`, `mutants-zarar.log`, `mutant-loglari/`, spec 12 test)

Temel koşu (`specrun-temel.log`): **12 passed, 0 failed**. Koşudan sonra DB'de `mobile-long-%` satırı 0/0; `afterAll` temizliyor.

| # | Mutant | Bekçi | Not |
|---|---|---|---|
| **M1** | fırsat başlığı `min-w-0` sil | **KIRMIZI** | opportunity detail 640px taşma |
| **M2** | gates iki `min-w-0` sil | **KIRMIZI** | gate settings 320px |
| **M7** | fırsat satırı `sm:flex-wrap` sil | **KIRMIZI** | actions at 640px below the title → false |
| **M12** | cordis `onFocus` scrollIntoView sil | **KIRMIZI** | cordis tab 2 fully inside the strip → false |
| K1 | approvals metin `md:w-auto` sil | hayatta | **Eşdeğer.** Satırda `flex-1` (basis 0%) genişliği zaten yok sayıyor; 768/1024/1280'de 18/18 kare piksel aynı, taşma yok. `md:w-auto` ölü sınıf, zararsız. |
| K2 | fırsat başlığı `sm:w-auto` sil | hayatta | 768/1024/1280'de 0 piksel fark (768'de aksiyonlar zaten alt satırda, lg'de `nowrap`). Etkisi yalnız 640–767 aralığında kısa başlıkta olabilir, ben ölçmedim. |
| **K3** | `break-words` bloktan alınıp yalnız h3+p'ye | **hayatta** | **Gerçek zarar:** red gerekçesinde boşluksuz uzun kelime varken Taleplerim 320'de **+242**, 768'de +88 (`olcum-K3.log`). Bekçi göremiyor, çünkü fixture'da red gerekçesi yok. Bkz. B-1. |
| K4 | modal satırı `gap-3` sil | hayatta | Beklenen: görsel aralık, taşmayla ilgisi yok. |
| K5 | kart `md:flex-row` → `lg:flex-row` (Y-2 önerisi) | hayatta (yeşil) | Önerilen Y-2 düzeltmesi bekçiyi kırmıyor. |

Her mutanttan sonra dosyalar yedekten geri kondu. Son satır `git status -- src: TEMİZ`.

### 2d. Kapılar (SONRA worktree, izole DB)

```
tsc=0  lint=0  i18n=0 ("both catalogs agree, every key used in src/ resolves, and no file gained hard-coded text")
next build exit=0 (SONRA ve ÖNCE)
npx vitest run: Test Files 295 passed | 6 skipped (301) · Tests 3833 passed | 113 skipped (3946) · exit 0  (se-fb merge sonrası sayısıyla birebir)
```

İlk lint koşusu 1 hata verdi. Hata benim worktree'ye koyduğum geçici ölçüm betiğindeydi (`prefer-const`), repo kodunda değildi. Betikleri worktree dışına taşıdım ve lint'i yeniden koştum: 0.

## 3. Bulgular

- **Y-1 (ORTA, önceden var, bu düzeltmenin kapsamı dışında ama aynı sayfa ve aynı veri):** fırsat detayda "Arşivle"ye basınca açılan onay bandının başlığı (`pipeline/[id]/client.tsx`, `role="alertdialog"` içindeki `<p className="font-semibold flex items-center gap-2">` + `t('detail.archive.confirmTitle', { title })`) uzun başlıkta `<main>`'i taşırıyor.
  - Ölçümler: kelime 320 **+387** (1024'e kadar her genişlikte), Türkçe 320 +232, URL 320 +53.
  - URL 390'da `main` eşit, ama metin amber bandın kenarından dışarı akıyor (`montaj-Y1-arsiv-onay.png`).
  - Neden: `<p>` bir flex kapsayıcı. İkondan sonraki metin anonim bir flex öğesi oluyor, `min-width:auto` ile en uzun bölünmez kelime kadar genişliyor ve `break-words` bunu küçültmüyor.
  - Öneri: metni `<span className="min-w-0 break-words">` içine almak. Alternatif: `p`'yi `flex` yerine blok yapıp ikonu inline koymak.
  - Bekçiye ekleme önerisi: fırsat testine "Arşivle → onay bandında taşma 0" adımı.
- **Y-2 (DÜŞÜK, bu düzeltmenin yan etkisi):** 768px'te (iPad dikey; `<main>` 512px) approvals Onayımı Bekleyenler kartında metin bloğu 99px'ten **79px'e** daralıyor. Başlık ve açıklamadaki sıradan kelimeler harf ortasından bölünüyor (`md-kelime-bolunmesi.log`):
  ```
  once  768 metin=99 aksiyon=275 bölünen=[]
  sonra 768 metin=79 aksiyon=295 bölünen=[revizyonu,konsorsiyum]
  800…1024: ÖNCE = SONRA, bölünen yok
  ```
  - Neden: `min-w-0` metin bloğunun min-content altına inmesine izin veriyor. Aksiyon satırı (`Detay / Payload`, `Onayla`, `Reddet`) ise tam genişliğini koruyor. Önceden düğme etiketleri iki satıra kırılıyor, metin 99px kalıyordu.
  - Dar bir band (≈768–790px), ve ÖNCE de sıkışıktı (99px). Yine de 768 en yaygın tablet genişliği ve sonuç okunmuyor.
  - Öneri: kartı `md:flex-row` yerine `lg:flex-row` + `lg:items-center` (K5 mutantı: bekçi yeşil kalıyor). Alternatif: aksiyon satırına `md:flex-wrap md:max-w-[50%]`.
- **B-1 (DÜŞÜK, bekçi kör noktası):** fixture yalnız başlık ve açıklamaya URL koyuyor. Red gerekçesi ve talep edende uzun e-posta (adı olmayan kullanıcı) yok. Bugün ikisi de doğru, çünkü `break-words` blokta kalıtılıyor. Ama K3 gibi bir refactor sınıfı başlığa taşırsa bekçi yakalamaz; ölçülen zarar 320'de +242. Öneri: fixture'a REJECTED + `rejectionReason` = URL/uzun kelime olan bir talep eklemek. URL'de kırılma fırsatı var (`/`, `-`), boşluksuz kelime daha sert bir test.
- **O-1 (not):** K1 `md:w-auto` eşdeğer, yani ölü sınıf. Zararsız, istenirse silinebilir. Yorum satırı "in the md row min-w-0 lets it shrink" doğru; `md:w-auto`'nun gerekçesi yok.
- **O-2 (not, spec sağlamlığı):** approvals testi, Taleplerim'de `getByRole('button', { name: /Detay/ }).first()` ile açtığı modalın LONG talebi olduğunu varsayıyor. CI DB'sinde seed talepsiz olduğu için bugün doğru. Başka bir spec aynı kiracıda talep bırakırsa sıra değişebilir. Kartı `LONG.mineId`/başlık üzerinden seçmek daha sağlam olur.
- Önceden var olan, kapsam dışı bir erişilebilirlik notu: detay modalında × düğmesinin `aria-label`'ı yok, Escape ile kapanmıyor ve odak tuzağı yok. Kapatma gerçek tıklamayla doğrulandı (`kapandı=true`).

## 4. Değişen dosyalar

Kod değiştirilmedi. Yalnız:
- `docs/agent-results/TASK-MUOD7E7LCR9CL-fe-fb.md`
- `docs/agent-results/TASK-MUOD7E7LCR9CL-fe-fb-ekler/`: loglar, `mutant-loglari/`, `kareler/` (23 PNG), `betikler/` (`.txt`)

## 5. Riskler

- Spec gerçek Playwright koşucusunda koşmadı (kill-guard R8), shim ile koşuldu. Koşucuya özgü farklar yalnız CI'da görülecek.
- Ölçümler headless Chrome'da. Y-2'nin bölünme bandı font metriğine bağlı.

## 6. Açık sorular

- **Sonuç dosyası yolu çelişkisi:** görev gövdesi `FONBRIDGE/docs/agent-results/TASK-MUOD7E7LCR9CL-fe-fb.md` diyor. Sarmalayıcı blok ise `/Users/macbook/alan/docs/agent-results/TASK-MUO9SKMRBFXBJ-be-fb.md` diyor. O yol repo dışında ve be-fb'nin başka bir kartının rapor adı; oraya yazmak başka ajanın raporunu ezerdi. Bu yüzden gövdedeki repo içi yol esas alındı (İNCELEME-96 ve se-fb aynı çelişkiyi bildirmişti).
- Y-1 ve Y-2 için ayrı takip kartı açılsın mı? Önerim tek küçük FE kartı: arşiv bandı `span.min-w-0`, kart `lg:flex-row`, fixture'a REJECTED talep, fırsat testine arşiv adımı.

## 7. Sonraki adım

- dev push'tan sonra CI e2e'de `mobile-main-overflow.spec.ts`'nin ilk gerçek koşusunu (12 test) kontrol et.
- Y-1/Y-2/B-1 takip kartı (yukarıda).
- Temizlik yapıldı:
  - Kendi sunucularım (:3109/:3110/:3111) kapatıldı (pid 18405/18265/75552), dinleyen port kalmadı.
  - `fefb109-pg` konteyneri silindi. Silinmeden önce içinde yalnız piksel verisinin 3 satırı kalmıştı; fixture ve ölçüm satırları kendi silme adımlarıyla temizlenmişti.
  - 3 worktree `git worktree remove` ile kaldırıldı.
