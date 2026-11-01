# TASK-MULRRNIHVZM1Z — FB KAMU B4: Ortak marka (fe-fb)

Sprint FB-KAMU-2 · dal `dev` · commit'ler: `0dde7031`, `edfa581e`, `abbbd818`, `5ac3c6cc`, `c5aa48d7` (+ bu rapor)

## 1. Ne yapıldı

Seçenek A (ortak marka, `docs/kamu/OKA-KANAL-ONERISI.md` §3). Ajansa bağlı kurumların uygulama kabuğundaki üst çubukta ajans logosu ve "<kısa ad> iş birliğiyle" satırı görünüyor. FonBridge logosu (kenar çubuğu ve mobil başlık) yerinde kalıyor. Ortak marka ek olarak gösteriliyor, ürün logosunun yerini almıyor.

- **Depolama, şema değişikliği yok.** Kayıt ajans kiracısının `Tenant.settings.cobrand` alanında: `{ logoKey, name, updatedAt }`. Bu alan yalnız ajansın kendi verisini tutuyor. Okuma sırasında ayarların geri kalanı birleştiriliyor (`src/lib/sso.ts` ile aynı desen), yani mevcut ayarlar silinmiyor. Logo baytları `storage.ts` üzerinden saklanıyor. Bunun için yeni `putObjectBytes` / `getObjectBytes` / `deleteObjectBytes` fonksiyonları var. R2 yapılandırılmışsa R2 kullanılıyor. R2 yoksa yalnız production dışında `.dev-objects/` klasörüne yazılıyor (gitignore'da). Production'da R2 yoksa yükleme "Logo şu an saklanamıyor" hatasıyla reddediliyor, anahtar kaydedilmiyor.
- **Güvenli yükleme** (`src/lib/agency/cobrand.ts` → `sanitizeLogoPng`):
  - Yalnız PNG kabul ediliyor. **SVG hiç kabul edilmiyor.** Dosya türü baytlardan okunuyor; dosya adına ve tarayıcının bildirdiği MIME türüne bakılmıyor.
  - Boyut sınırı ≤ 200 KB. Sınır, dosya belleğe okunmadan önce denetleniyor. Her kenar en fazla 1024 px.
  - Chunk'lar tek tek geziliyor (uzunluk, 4 harfli tür, CRC32). IHDR ilk chunk olmalı. IEND dosyanın son baytı olmalı; sonrasında veri varsa (PNG/HTML poliglotu) dosya reddediliyor.
  - Saklanan dosya yalnız görüntü chunk'larından yeniden kuruluyor (IHDR, PLTE, tRNS, gAMA, cHRM, sRGB, pHYs, IDAT, IEND). tEXt, eXIf, iCCP ve animasyon chunk'ları atılıyor.
- **Yetki:** Kaydetmeyi yalnız ajans kiracısının `TENANT_OWNER` ve `TENANT_ADMIN` rollü üyeleri yapabiliyor. Kontrol sunucu eyleminde (`cobrand-actions.ts`) yapılıyor; form gizli olsa da eylem ayrıca reddediyor. Kiracı ajans değilse sonuç `notAgency`. Diğer roller panelde yalnız salt-okunur metni görüyor.
- **Sunum:** `GET /api/agency/cobrand-logo` URL'de kimlik taşımıyor. Hangi logonun döneceğine oturumun kiracısı karar veriyor: ajansın kendi logosu ya da kurumun bağlı olduğu ajansın logosu. Başka bir ajansın logosu istenemiyor. Yanıt başlıkları: `Content-Type: image/png`, `nosniff`, `CSP: default-src 'none'; sandbox`, `Cache-Control: private`. Bağlı olmayan kurum 404, anonim istek 401 alıyor.
- **Kabuk:** `src/app/[locale]/(app)/layout.tsx` masaüstünde başlığın boş sol yuvasında, `MobileAppHeader` ise mobilde logonun yanında `CoBrandBadge`'i gösteriyor. Mobilde metin yalnız ekran okuyucuya okunuyor. Logo her iki temada beyaz bir karo üzerinde duruyor; böylece koyu temada koyu renkli logolar kaybolmuyor. Metin `text-ink-2` rengiyle yazılıyor.
- **Ajans panosu:** `/tr/ajans` → "Ortak marka" bölümü: önizleme, kısa ad (≤ 40 karakter; boşsa hesap adı kullanılıyor), PNG dosya seçici, "Logoyu kaldır" seçeneği. Logo değiştirilince ya da kaldırılınca eski nesne siliniyor. Bölüm yeni dosyalarda (`cobrand-panel.tsx`, `cobrand-actions.ts`); `page.tsx`'e yalnız 14 satır eklendi. Böylece se-fb'nin B3 "Raporlar" işiyle çakışma olasılığı düşük tutuldu.
- **Gizlilik:** Veri tek yönde akıyor: ajans → bağlı kurumlar. Logo gösterimi hiçbir kayıt yazmıyor ve ajansa bilgi göndermiyor. Yeni bir sayı ya da kurum bilgisi yayımlanmıyor. Önizleme yalnız ajansın kendi girdiği adı ve logoyu gösteriyor.

## 2. Kanıt

### Birim testleri ve mutasyonlar

```
src/lib/agency/cobrand.test.ts                        11 passed
src/app/[locale]/(app)/ajans/cobrand-actions.test.ts   8 passed
  MEMBER/WRITER/PIPELINE_MANAGER/GUEST_PARTNER → forbidden, hiçbir şey saklanmadı
  ajans olmayan kiracının OWNER'ı → notAgency
  TENANT_OWNER / TENANT_ADMIN → kaydedildi
  image/png + .png adlı SVG → notPng (baytlardan)
```

| Mutasyon (önce commit, sonra `git checkout` ile geri alındı) | Sonuç                   |
| ------------------------------------------------------------ | ----------------------- |
| Eylemde rol kontrolü kapatıldı                               | `4 failed \| 4 passed`  |
| IEND sonrası veri kontrolü kaldırıldı                        | `1 failed \| 10 passed` |
| Metadata chunk'ları atılmadan her chunk kopyalandı           | `1 failed \| 10 passed` |

### Kapılar

```
npx tsc --noEmit                  → çıkış 0, hata yok
npm run lint                      → temiz
npm run i18n:check                → ✅ both catalogs agree … no file gained hard-coded text
scripts/check-tenant-bypass.ts    → ✅ no new tenant bypass
set -a; source .env; set +a; npm test
  Test Files  198 passed | 2 skipped (200)
  Tests  2288 passed | 8 skipped (2296)
```

### Gerçek tarayıcı (http://localhost:3000, Playwright + Chrome, gerçek dosya seçimi ve tıklama; her kurum ayrı bir tarayıcı bağlamında)

Ajans kullanıcısı `/tr/kayit` sayfasından kaydoldu. Kiracısı, B2'de olduğu gibi, yalnız yerel veritabanında SQL ile `kind='AGENCY'` yapıldı. Davet kodu arayüzden üretildi. Bağlı kurum `?kod=` ile, bağsız kurum ise normal yoldan kaydoldu. Koşu kimliği: `mum6fb9d`.

```
reject evil.svg:        OK → Dosya bir PNG değil. Yalnız PNG yüklenebilir; SVG kabul edilmez.
reject svg-renamed.png: OK → (aynı)
reject polyglot.png:    OK → PNG dosyası bozuk ya da içinde fazladan veri var.
reject big.png:         OK → Dosya 200 KB'tan büyük.        (360 KB)
reject wide.png:        OK → Görsel çok büyük: her kenar en fazla 1024 piksel olmalı.  (1500×2)
settings after rejections: null
stored entry: {"name": "OKA", "logoKey": "cmum6fc5b…/agency/cobrand/446594b9-….png", "updatedAt": "2026-09-29T04:28:51.043Z"}
stored bytes 401 (upload 441) SECRET-META occurrences 0      ← tEXt chunk'ı atıldı
agency header badge: 0                                          ← ajansın kendi kabuğunda yok
linked tenant cmum6fekt…|ORGANIZATION|cmum6fc5b…               ← agencyId bağlı
linked header text: OKA iş birliğiyle | img alt: OKA logosu
logo naturalWidth: 240
light colors { c: 'rgb(51, 65, 85)', b: 'rgb(255, 255, 255)' }     = 10.35:1 (AA ≥ 4.5)
linked GET logo 200 image/png nosniff default-src 'none'; sandbox private, max-age=3600
dark colors  { c: 'rgb(203, 213, 225)', b: 'rgb(11, 19, 36)' }     = 12.49:1
mobile sw/vw [ 390, 390 ] sr text: OKA iş birliğiyle              ← yatay kaydırma yok
unlinked tenant cmum6fgdc…|ORGANIZATION|-
unlinked badge count: 0 | "iş birliğiyle" in body: false
unlinked GET logo 404
anonymous GET logo 401
after remove file exists? no                                     ← eski nesne silindi
linked after remove: logo 0 text OKA iş birliğiyle
```

Salt-okunur rol testi: Rol SQL ile `MEMBER` yapıldı ve kullanıcı **yeniden giriş yaptı**. Rol JWT'den okunduğu için eski oturum eski rolü taşıyor; bu yüzden aynı oturumdaki ilk ölçüm (`MEMBER sees form? 1`) geçerli sayılmadı. Yeniden girişten sonraki sonuç: `MEMBER form count: 0 | readOnly shown: true`. Rol sonra `TENANT_OWNER`'a geri alındı ve bu SQL ile doğrulandı.

Klavye: Kaydetme, `Kaydet` düğmesine odaklanıp `Enter` basılarak yapıldı. Tüm denetimler `min-h-11` (44 px) yüksekliğinde. Odak halkası mevcut panellerle aynı (`focus-visible:outline-accent`).

Kareler (`docs/agent-results/TASK-MULRRNIHVZM1Z-screenshots/`):

| Kare                       | Ne gösteriyor                                      |
| -------------------------- | -------------------------------------------------- |
| `01-panel-once.png`        | Ortak marka bölümü, logo yok                       |
| `02-svg-reddedildi.png`    | SVG reddi, hata metni                              |
| `03-panel-kaydedildi.png`  | OKA + logo kaydedildi, önizleme                    |
| `04-bagli-kurum-acik.png`  | Bağlı kurum, açık tema: logo + "OKA iş birliğiyle" |
| `05-bagli-kurum-koyu.png`  | Bağlı kurum, koyu tema                             |
| `06-bagli-kurum-mobil.png` | Bağlı kurum, 390 px mobil                          |
| `07-bagsiz-kurum.png`      | Bağsız kurum: üst çubukta ortak marka yok          |
| `08-uye-salt-okunur.png`   | Ajansın MEMBER üyesi: form yok, salt-okunur metin  |

### Doğrulama sırasında bulunan ve düzeltilen hata

İlk kare turunda panel açıklaması ham anahtar olarak görünüyordu (`agency.cobrand.description`). Metindeki `<ajans>` ifadesini next-intl bir zengin metin etiketi olarak okuyor ve çeviri başarısız oluyor. `i18n:check` bu durumu yakalamıyor. Düzeltme `c5aa48d7`'de: metin, "OKA iş birliğiyle" gibi bir örnekle yeniden yazıldı.

## 3. Değişen dosyalar

- `src/lib/agency/cobrand.ts` (yeni): kurallar, PNG temizleme, ayar okuma
- `src/lib/agency/cobrand-store.ts` (yeni): veritabanı ve depolama okuma/yazma
- `src/lib/agency/cobrand.test.ts` (yeni)
- `src/lib/storage.ts`: `putObjectBytes`, `getObjectBytes`, `deleteObjectBytes` ve geliştirme ortamında yerel diske yazma
- `src/app/api/agency/cobrand-logo/route.ts` (yeni)
- `src/app/[locale]/(app)/ajans/cobrand-panel.tsx`, `cobrand-actions.ts`, `cobrand-actions.test.ts` (yeni); `page.tsx` (+14 satır)
- `src/components/CoBrandBadge.tsx` (yeni), `src/components/MobileAppHeader.tsx`, `src/app/[locale]/(app)/layout.tsx`
- `messages/tr.json`, `messages/en.json` (`coBrand.*`, `agency.cobrand.*`)
- `.gitignore` (`/.dev-objects/`)

## 4. Riskler

- **Production depolama:** Dev ortamında R2 yapılandırılmamış, bu yüzden R2 yolu (`PutObject`/`GetObject`) canlı ortamda koşulamadı. Kod SDK'nın standart çağrılarını kullanıyor. Production'da R2 yoksa yükleme reddediliyor; sessizce diske yazılmıyor.
- **Kabuk sorgusu:** Uygulama kabuğu (layout) her sayfada bağlı ajansın ayarlarını tek bir `findUnique` ile okuyor. Ajansın `settings` JSON'u büyürse bu sorgu da büyür. Bugün küçük.
- **Rol değişikliği:** Rol JWT'den okunuyor. OWNER/ADMIN rolünden düşürülen bir kullanıcı, oturumu yenilenene kadar formu görmeye devam eder. Bu, uygulamanın genel davranışı (B1 eylemleri de aynı şekilde çalışıyor); B4'e özgü değil.
- **Kapsam dışı gözlem:** Koyu temada panel sayfasının "Panel" başlığının kontrastı düşük ve kartlar beyaz görünüyor (bkz. `05-…koyu.png`). Bu B4 ile ilgili değil, ayrı bir iş.

## 5. Açık sorular

- Ajans kendi kabuğunda ortak markayı görmüyor; görmesi gerekiyor mu? Kart "bağlı olmayan kiracıda görünmez" diyor, ajans da bağlı değil. Bugün ajans bunu yalnız panodaki önizlemede görüyor.
- Kısa adın varsayılanı hesap adı (`Tenant.name`). Bu değer kayıtta otomatik üretiliyor, örn. "X Kuruluşu". Ajans kısa adı boş bırakırsa bağlı kurumlar bu otomatik adı görür.

## 6. Sonraki adım

- Production'a çıkmadan önce, R2 yapılandırılmış bir ortamda bir kez yükleme ve gösterim yapılmalı.
- İsteğe bağlı: `i18n:check`, mesajlarda `<kelime>` biçimindeki etiket benzeri ifadeleri de işaretleyebilir (bu kartta yaşanan hata sınıfı).

**Platform beyanı:** Doğrulama macOS'ta (Darwin 27, Chrome, Node 26.5) yapıldı. Dokunulan kod platforma bağlı değil. Tek dosya sistemi yolu, geliştirme ortamının yerel diske yazma yedeği: `${process.cwd()}/.dev-objects/<key>`. Anahtar `[A-Za-z0-9_/.-]` karakterleriyle sınırlı ve `..` içeremiyor. Windows'ta Node `/` ayırıcısını kabul ettiği için bu yolun çalışması beklenir. Windows ve Linux'ta koşulamadı: bu makinede yalnız macOS var. Production'da bu yol hiç kullanılmıyor (R2 ya da ret).
