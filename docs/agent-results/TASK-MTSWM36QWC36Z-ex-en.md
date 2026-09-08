# TASK-MTSWM36QWC36Z — "FonBridge" retired product name

**Ajan:** ex-en (Araştırmacı/Explorer) · **Sprint:** SPRINT-S12 / E10 · **Branch:** `dev`

---

## 1. Ne yapıldı

### ÖLÇÜM — kartın "40 dosya" rakamı ÇÜRÜTÜLDÜ

Kartın rakamı hiçbir okumada tutmuyor. Gerçek sayım (öncesi):

| Kapsam | Satır | Dosya |
|---|---:|---:|
| **TOPLAM** (repo geneli, node_modules/.git hariç) | **117** | **63** |
| Canlı kod (`src/ tests/ messages/ next.config.ts prisma/`) | 52 | 32 |
| — bunun `src/ messages/ next.config.ts` kısmı | 37 | 22 |
| — bunun `tests/` kısmı (regresyon muhafızları) | 15 | 7 |
| Tarihsel kayıt (`docs/agent-results/ .agentspace/ test-artifacts/`) | 67 | 31 |

Kartın "40 dosya"sına en yakın okuma 32 dosya / 52 satır (canlı kod); repo geneli 63 dosya /
117 satır. **40 rakamı ne canlı kodu ne de repo genelini karşılıyor.** Rapor boyunca kullanılan
ölçü canlı koddur; `prisma/schema.prisma`'ya karta göre DOKUNULMADI (o dosya bu turda
geli-tirici'de) — zaten şemada hiç isabet yok.

### SINIFLANDIRMA

Her isabet tek tek açıldı ve üçe ayrıldı. Sayıyı düşürmek için meşru olanı silmedim.

**(a) Kullanıcıya görünen metin → i18n anahtarına taşındı** (sabit string olarak yeni ada
çevrilmedi). Yeni/başkalaştırılan anahtarlar İKİ DİLE de eklendi:

| Anahtar | tr | en |
|---|---|---|
| `Common.logoAlt` (YENİ) | `{brand} logosu` | `{brand} logo` |
| `Common.copyright` (YENİ) | `© {year} {brand} ({brand} SaaS). Tüm hakları saklıdır.` | `© {year} {brand} ({brand} SaaS). All rights reserved.` |
| `Auth.signInTitle` (YENİ) | `{brand} Platformuna Giriş` | `Sign In to {brand}` |
| `landing.ecosystemSubtitle` (YENİ) | `… {brand} iş akışınızı hızlandırır.` | (marka geçmiyor, mevcut EN metni korundu) |
| `landing.closingSubtitle` (YENİ) | `{brand} ile teklif hazırlama sürenizi…` | (marka geçmiyor) |
| `legal.terms.scopeBody` (YENİ) | `{brand}, Horizon Europe ve diğer…` | `{brand} provides discovery…` |
| `partner_portal.footer` | `FonBridge` → `{brand}` | `FonBridge` → `{brand}` |
| `DocumentExport.footer` | `FonBridge` → `{brand}` | `FonBridge` → `{brand}` |
| `DocumentExport.provenanceNotice` | `Fabrika` → `{brand}` | `Fabrika` → `{brand}` |
| `DocumentExport.templateBody` | `Fabrika` → `{brand}` | `Fabrika` → `{brand}` |
| `DocumentExport.docxFallbackBody` | `Fabrika` → `{brand}` | `Fabrika` → `{brand}` |

Katalog artık ürün adını *hiç* yazmıyor — `{brand}` tutuyor. `Fabrika` → `{brand}` satırları da
buradan: kartın (b) maddesi "doğru ürün adını tek bir yerden okusun" diyor; katalogda literal
`Fabrika` bırakmak aynı kusuru yeni ad altında tekrar üretirdi.

**(b) Üretilen müşteri dokümanı → tek kaynak.** Yeni modül **`src/lib/brand.ts`**
(`PRODUCT_NAME` + `withBrand()`). `src/lib/document-exporter.ts` altbilgiyi, köken bildirimini
(provenance) ve DOCX gövde metnini `withBrand()` üzerinden basıyor. 40 yere kopyalanmadı.

**(c) Kod içi tanımlayıcı / fixture → basit yeniden adlandırma**, hepsi `PRODUCT_NAME`'den
okuyacak biçimde:

- `src/lib/auth.ts:31,37` — demo tenant `orgName`'leri (`FonBridge HQ`, `FonBridge SME Ar-Ge Ltd.`)
- `src/app/[locale]/admin/settings/smtp-form.tsx` — `fromName` varsayılanı + placeholder
- `src/app/[locale]/(app)/[workspace]/evidence/evidence-client.tsx:250` — indirilen CSV dosya adı
- `src/lib/blog.ts` — 5 isabet, blog seed markdown gövdesi
- `src/modules/m2/server/actions.ts:268` — YZ şeffaflık beyanı belgesinin altbilgisi
- `src/app/[locale]/admin/layout.tsx:160` — admin altbilgi marka bağlantısı

**DOKUNULMAYANLAR — kasıtlı.** Kalan 9 canlı-kod isabetinin **hepsi yorum**, ve hepsi
*kaldırılmış uydurma kimlik* kaydı ("FonBridge Teknoloji A.Ş.", "FonBridge Editörü",
"FonBridge Demo Kuruluşu"). Bunları yeni ada çevirmek iki hata birden olurdu: kaydı
tahrif etmek + **taze bir uydurma kimlik ("Fabrika Teknoloji A.Ş.") üretmek**. Aynı sebeple
`tests/` altındaki 15 isabete de dokunulmadı — bunlar o dizenin belgeye ASLA basılmadığını
doğrulayan regresyon muhafızları (`tests/document-exporter.test.ts:224,235`,
`tests/fabricated-identity-strings.test.ts:222`, `tests/e2e/document-export-tenant-isolation.spec.ts`).
Yeniden adlandırmak muhafızları etkisizleştirirdi.

### Regresyon kapısı (yeni)

`tests/retired-brand-name.test.ts` (5 test) — canlı kaynakta belgelenmiş kayıt listesi dışında
`FonBridge` yok; iki katalogda da yok; `DocumentExport` anahtarları ürün adını literal
tutmuyor; üretilen belge iki dilde de ürün adını taşıyor.
`tests/brand-surfaces-render.test.tsx` (2 test) — `PublicFooter` gerçek kataloglara karşı
render edilir: `{brand}` yer tutucusunun çağıranı `brand` geçirmeyi unutursa next-intl render
anında patlar, bunu `i18n-check` de `tsc` de göremez.

---

## 2. Kanıt (kopyalanmış gerçek çıktı)

### 2.1 Öncesi / sonrası `grep -rn "FonBridge"` sayımı

```
$ # ÖNCESİ
$ grep -rn "FonBridge" --exclude-dir=node_modules --exclude-dir=.git . | wc -l
     117
$ grep -rln "FonBridge" --exclude-dir=node_modules --exclude-dir=.git . | wc -l
      63
$ grep -rn "FonBridge" src tests messages next.config.ts prisma | wc -l
      52
$ grep -rln "FonBridge" src tests messages next.config.ts prisma | wc -l
      32
```

```
$ # SONRASI
$ grep -rn "FonBridge" src messages next.config.ts prisma | wc -l
       9        # hepsi yorum (aşağıda listeli)
$ grep -rn "FonBridge" tests | wc -l
      15        # regresyon muhafızları, kasıtlı korundu
$ grep -rn "FonBridge" docs .agentspace test-artifacts | wc -l
      67        # tarihsel kayıt, dokunulmadı
$ grep -rn "FonBridge" --exclude-dir=node_modules --exclude-dir=.git . | wc -l
      89
```

`src/` + `messages/` + `next.config.ts`: **37 → 9**, ve kalan 9'un tamamı yorum:

```
$ grep -rn "FonBridge" src messages next.config.ts prisma
src/app/[locale]/(app)/[workspace]/settings/billing/page.tsx:66:  // "FonBridge Demo Kuruluşu", so a failed query greeted a paying customer with
src/app/[locale]/(app)/[workspace]/opportunities/[id]/documents/page.tsx:39:  // called FonBridge Teknoloji A.Ş. That pack rendered for ANY opportunity id,
src/app/[locale]/admin/blog/actions.ts:28:    // filled with "FonBridge Editörü / AB Uzmanı" and a stock portrait, so the
src/app/api/documents/export/route.ts:21: * organisation (`FonBridge Teknoloji A.Ş.`), a real-looking Horizon call id,
src/app/api/invitations/route.ts:12: * *created* a tenant called "FonBridge HQ" and invited into that. So a session
src/lib/brand.ts:4: * The platform shipped under the name "FonBridge" and no longer carries it. The rename found
src/lib/document-exporter.ts:217:  // -looking call id and "FonBridge Teknoloji A.Ş." onto any document exported without them.
src/modules/m10/server/actions.ts:76:  // Puanı: 13.5 / 15.0" for "FonBridge Teknoloji A.Ş.", and an ESR_DEBRIEF
next.config.ts:73:      // processor "FonBridge", a product name this platform no longer carries.
```

Katalogda sıfır:
```
$ grep -c "FonBridge" messages/tr.json messages/en.json
messages/tr.json:0
messages/en.json:0
```

### 2.2 Üretilen müşteri dokümanının altbilgisi yeni adı taşıyor

Gerçek doküman üretildi (`generatePdfHtml` + `generateDocxBuffer`, NDA, iki dil):

```
[tr] PDF/print footer -> Fabrika — Ufuk Avrupa &amp; TÜBİTAK doküman üretim motoru | Sayfa 1 / 1
[tr] grep -c FonBridge = 0
[tr] grep -c Fabrika   = 2
[tr] DOCX bytes = 8956
[en] PDF/print footer -> Fabrika — Horizon Europe &amp; TÜBİTAK document engine | Page 1 / 1
[en] grep -c FonBridge = 0
[en] grep -c Fabrika   = 2
[en] DOCX bytes = 8911
```

Üretilen HTML'in içi:
```
$ grep -n "Fabrika" docs/agent-results/TASK-MTSWM36QWC36Z-evidence/export-nda-tr.html
47:  <div class="provenance">Bu belge Küçük Danışmanlık Ltd. tarafından Fabrika'da hazırlanmıştır. …</div>
89:    Fabrika — Ufuk Avrupa &amp; TÜBİTAK doküman üretim motoru | Sayfa 1 / 1
```

Üretilen DOCX'in içi (`word/document.xml` düz metni):
```
NDA - Gizlilik Sözleşmesi
Bu belge Küçük Danışmanlık Ltd. tarafından Fabrika&apos;da hazırlanmıştır. Avrupa Komisyonu, TÜBİTAK ya da başka bir fon kuruluşu tarafından düzenlenmiş veya onaylanmış resmî bir belge DEĞİLDİR.
Proje Başlığı: HORIZON-CL4-2026-DIGITAL-EMERGING-01
Kuruluş: Küçük Danışmanlık Ltd.
Sürüm: v2
Doküman Ref: part-b-01H9Z
1. DOKÜMAN İÇERİĞİ VE HÜKÜMLER
Taraflar arasında paylaşılan bilgiler gizlidir.
```
`FonBridge` sayımı DOCX içinde **0**.

Dosyalar: `docs/agent-results/TASK-MTSWM36QWC36Z-evidence/export-nda-{tr,en}.{html,docx}`

### 2.3 NEGATİF KONTROL — belge adı GERÇEKTEN tek kaynaktan okuyor

"Altbilgi Fabrika yazıyor" gözlemi, adın `brand.ts`'ten okunduğunu değil, tesadüfen eşleşen bir
literal olmadığını KANITLAMAZ. Tek kaynak geçici olarak değiştirildi:

```
$ sed -i '' "s/PRODUCT_NAME = 'Fabrika'/PRODUCT_NAME = 'ZZTESTBRAND'/" src/lib/brand.ts
$ npx tsx scripts/.tmp-footer-probe.mts
[tr] PDF/print footer -> ZZTESTBRAND — Ufuk Avrupa &amp; TÜBİTAK doküman üretim motoru | Sayfa 1 / 1
[tr] grep -c Fabrika   = 0
[en] PDF/print footer -> ZZTESTBRAND — Horizon Europe &amp; TÜBİTAK document engine | Page 1 / 1
[en] grep -c Fabrika   = 0

$ # DOCX düz metni de takip etti:
Bu belge Küçük Danışmanlık Ltd. tarafından ZZTESTBRAND&apos;da hazırlanmıştır. …
```
Tek satır değişti, HEM altbilgi HEM köken bildirimi HEM DOCX takip etti → belge adı tek yerden
okuyor. Değişiklik geri alındı (`PRODUCT_NAME = 'Fabrika'`), belgeler doğru adla yeniden üretildi.

### 2.4 Kullanıcıya görünen yüzey gerçekten render oluyor

`PublicFooter` gerçek kataloglara karşı jsdom'da render edildi:

```
© 2026 Fabrika (Fabrika SaaS). Tüm hakları saklıdır.     [tr]
© 2026 Fabrika (Fabrika SaaS). All rights reserved.      [en]
<img alt="Fabrika logosu" … />
```
Yıl `2026` — `2.026` değil (ICU sayı gruplamasını önlemek için `String(...)` geçiliyor).

### 2.5 Regresyon kapısı GERÇEKTEN reddediyor (sıfır-hata değil, RET kanıtı)

Ölü marka kasıtlı olarak geri kondu:

```
$ # src/components/PublicNavbar.tsx:44 → title={isTr ? "FonBridge Ana Sayfa" : "Home"}
$ npx vitest run tests/retired-brand-name.test.ts
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  tests/retired-brand-name.test.ts > retired product name > no live source file outside the documented record names the retired brand
AssertionError: expected [ 'src/components/PublicNavbar.tsx' ] to deeply equal []
+   "src/components/PublicNavbar.tsx",
      Tests  1 failed | 4 passed (5)
```
Geri alındıktan sonra 5/5 yeşil.

### 2.6 Kapı — `pnpm typecheck && pnpm lint && pnpm test`

```
########## TYPECHECK ##########
$ tsc --noEmit
                                    ← çıktı yok = 0 hata
########## LINT ##########
$ eslint
/Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f4-rag-probe.mts
  5:28  warning  '_url' is defined but never used  @typescript-eslint/no-unused-vars
✖ 3 problems (0 errors, 3 warnings)
                                    ← 0 hata; 3 uyarı ÖNCEDEN VARDI, dokunmadığım dosyalarda
########## TEST ##########
 Test Files  124 passed | 2 skipped (126)
      Tests  1460 passed | 8 skipped (1468)
########## i18n ##########
✅ i18n check passed: both catalogs agree and every key used in src/ resolves.
   Keys in messages/tr.json: 1335
   Keys in messages/en.json: 1335
```

Başlangıç referansı (değişiklikten önce): `122 passed | 2 skipped`, `1453 passed | 8 skipped`.
Fark = bu kartın eklediği 2 dosya / 7 test. Regresyon yok.

---

## 3. Değişen dosyalar

**Yeni**
- `src/lib/brand.ts` — `PRODUCT_NAME` + `withBrand()`, tek doğruluk kaynağı
- `tests/retired-brand-name.test.ts` — regresyon kapısı (5 test)
- `tests/brand-surfaces-render.test.tsx` — render kapısı (2 test)
- `docs/agent-results/TASK-MTSWM36QWC36Z-evidence/export-nda-{tr,en}.{html,docx}` — kanıt belgeleri

**Değişen**
- `messages/tr.json`, `messages/en.json` — 6 yeni anahtar (iki dilde), 5 anahtarda `{brand}` yer tutucusu
- `src/lib/document-exporter.ts` — altbilgi/köken/DOCX gövdesi `withBrand()` üzerinden
- `src/lib/auth.ts`, `src/lib/blog.ts`, `src/modules/m2/server/actions.ts`
- `src/app/[locale]/page.tsx`, `terms/page.tsx`, `login/AuthCard.tsx`, `admin/layout.tsx`,
  `admin/settings/smtp-form.tsx`, `(app)/layout.tsx`,
  `(app)/[workspace]/settings/modules/client.tsx`, `(app)/[workspace]/evidence/evidence-client.tsx`,
  `portal/partner/[token]/page.tsx`
- `src/components/PublicFooter.tsx`, `PublicNavbar.tsx`, `MobileAppHeader.tsx`, `MobileAdminHeader.tsx`

`prisma/schema.prisma` ve migration'lara **dokunulmadı** (karta göre geli-tirici'de).

---

## 4. Riskler

1. **Marka değişimi ürün kopyasını değiştirir.** Herkese açık pazarlama sayfaları, kullanım
   koşulları ve blog gövdeleri artık "Fabrika" yazıyor. Bu bir ürün/pazarlama kararıdır; kart
   "artık taşınmayan ürün adı" dediği ve `PROJECT.md:1` ile katalogların çoğu zaten "Fabrika"
   olduğu için doğru ad olarak Fabrika alındı. Yanlışsa tek satır: `src/lib/brand.ts:17`.
2. **`src/lib/auth.ts` demo tenant adları artık `Fabrika HQ` / `Fabrika SME Ar-Ge Ltd.`** —
   yalnız İLK oturum açışta kurulan yeni tenant'ı etkiler; mevcut DB satırları değişmez.
   Prod DB'ye dokunulmadı.
3. **Marka artık üç ayrı yerden geçiyor** (`PRODUCT_NAME`, katalogtaki `{brand}`, `withBrand()`).
   `{brand}` taşıyan bir anahtarın çağıranı `brand` geçirmeyi unutursa next-intl **render anında**
   patlar; `tsc` ve `i18n-check` bunu göremez. Bu yüzden `tests/brand-surfaces-render.test.tsx`
   eklendi — ama yalnız `PublicFooter`'ı kapsıyor (aşağıdaki açık soruya bakınız).
4. Marka geçen 5 satır `src/lib/blog.ts` içinde **markdown gövdesine** interpolasyon
   (`${PRODUCT_NAME}`) ile giriyor; içerik editörden yeniden yazılırsa literal geri gelebilir.

---

## 5. Açık sorular / KAPSAM DIŞI KUSURLAR (düzeltilmedi, adıyla bildiriliyor)

Kartın kuralı gereği yol üstünde görülen ama kapsam dışı kalan kusurlar:

1. **`messages/tr.json` → `partner_portal.footer` TÜRKÇE DEĞİL.** Değeri
   `"Secured by {brand} SaaS — Horizon Europe Engine"` — EN katalogla birebir aynı İngilizce
   cümle. Ortak portalı Türkçe açan bir kullanıcı İngilizce altbilgi görüyor. Yalnız marka
   jetonunu değiştirdim, kopyayı çevirmedim.
2. **Herkese açık sayfalarda i18n borcu — CLAUDE.md kural 8 ihlali.**
   `src/app/[locale]/page.tsx`, `terms/page.tsx`, `PublicFooter.tsx` (16 ternary),
   `PublicNavbar.tsx` (16 ternary) kullanıcı metnini `t()` yerine `isTr ? 'tr' : 'en'` satır-içi
   ternary'siyle taşıyor. Marka geçen cümleleri i18n'e taşıdım; **kardeş cümleler hâlâ gömülü.**
3. **Tamamen gömülü Türkçe yüzeyler.** `settings/modules/client.tsx` (631 satır) ve
   `admin/settings/smtp-form.tsx` (231 satır) hiç `t()` kullanmıyor — etiketler, başlıklar,
   yardım metinleri sabit Türkçe. `/en` bu ekranlarda tamamen Türkçe. Buralarda yalnız marka
   jetonunu tek kaynağa bağladım.
4. **DOCX çıktısında altbilgi HİÇ YOK.** Marka yalnız köken bildirimi satırıyla giriyor;
   `generateDocxBuffer` bir footer üretmiyor (`src/lib/document-exporter.ts:358-412`).
   PDF/print yolunda altbilgi var. Ürün kararı: DOCX'e de altbilgi eklenmeli mi?
5. **`fonbridge.app` alan adı canlı varsayılanlarda.** `smtp-form.tsx` içinde
   `noreply@fonbridge.app` (kullanıcı + gönderen adresi varsayılanı) ve `src/lib/auth.ts:36`
   demo profil anahtarı `mehmet@fonbridge.app`. **Kasıtlı olarak DEĞİŞTİRMEDİM** — alan adı
   altyapıdır; körlemesine yeniden adlandırmak e-postayı kırar. DNS/posta sahibinin kararı.
6. **`DEMO_PROFILES` üretimde açık.** `src/lib/auth.ts:181` — Credentials sağlayıcısında,
   dev bayrağıyla korunmuyor; sabit e-posta adresleri tenant iskelesi (ve platform-admin
   bayrağı) kuruyor. Bu kartın kapsamı dışı, ama isim değişikliğinden bağımsız bir risk.
7. **Task Board'dan kart gövdesi okunamadı.** `list_tasks` yalnız başlık döndürüyor,
   `description` alanını veren bir okuma aracı yok (`attach_to_task` yalnız görsel iliştiriyor).
   Görev tanımı olarak spawn metnindeki tam brief kullanıldı.

---

## 6. Sonraki adım

- Ürün sahibi onayı: "Fabrika" kesin ad mı? (`src/lib/brand.ts:17` tek satır)
- Açık soru 1 (TR portal altbilgisi İngilizce) küçük ve tek satırlık — ayrı kart açılabilir.
- Açık soru 2–3 (i18n borcu) ölçülüp E10 altında ayrı bir karta bağlanmalı; bu kart kapsamında
  düzeltilmedi.
- `pnpm test:e2e` bu turda KOŞULMADI (çalışan sunucu + seed gerektiriyor, paralel kartlar aynı
  worktree'de). Marka değişimi 4 e2e dosyasının `not.toContain('FonBridge')` iddialarını
  gevşetmez — o iddialar uydurma KİMLİK dizesini hedefliyor ve dokunulmadı.

---

## 7. Commit notu (paylaşılan worktree kazası)

Bu kartın tüm değişiklikleri `dev` üzerinde — ama **kendi commit'inde değil.** `git add` ile
yalnız kendi dosyalarımı stage'ledikten sonra, aynı worktree'de paralel çalışan başka bir ajan
`git commit` çalıştırdı ve stage'imi kendi commit'ine süpürdü:

```
$ git log --oneline -1
aa4341f docs(memory): a cross-session send can report success and still never arrive

$ git log --oneline --all -- src/lib/brand.ts
aa4341f docs(memory): a cross-session send can report success and still never arrive
```

`aa4341f` bu kartın 25 dosyasının tamamını içeriyor (`src/lib/brand.ts`, iki katalog, 2 test
dosyası, 16 bileşen/sayfa, kanıt belgeleri) — yani **içerik kaybı YOK**, mesaj yanıltıcı.
İçerik bütünlüğü doğrulandı:

```
$ git show HEAD:src/lib/brand.ts | grep -n "PRODUCT_NAME ="
17:export const PRODUCT_NAME = 'Fabrika';
$ git show HEAD:messages/tr.json | grep -c "FonBridge"
0
$ git show HEAD:messages/en.json | grep -c "FonBridge"
0
$ git diff HEAD --stat -- src/lib/brand.ts messages tests/ src/lib/document-exporter.ts
                                    ← boş: çalışma ağacı = commit
```

**Geçmişi DÜZELTMEDİM.** `dev` paylaşılan bir dalda ve başka ajanlar şu anda aynı worktree'ye
commit atıyor; `reset`/`rebase` onların işini yok edebilirdi. Hazırladığım commit mesajı
(gerekçeyi taşıyan uzun metin) bu raporun git geçmişindeki karşılığı olarak kayboldu —
gerekçenin tamamı yukarıdaki 1–6. bölümlerde duruyor.

**Takım için:** paylaşılan worktree'de `git add <yol>` + `git commit` atomik DEĞİL. İki ajan aynı
anda commit ediyorsa stage birbirine karışır.

---

**DoD kontrolü**

- [x] Kartın "40 dosya" rakamı doğrulandı/çürütüldü, gerçek sayı raporlandı (117/63 toplam; 52/32 canlı kod)
- [x] Her isabet (a)/(b)/(c) olarak sınıflandırıldı
- [x] Kullanıcıya görünen metin i18n anahtarına taşındı, sabit string olarak yeni ada çevrilmedi
- [x] i18n anahtarları İKİ DİLE de eklendi (`i18n-check` 1335 = 1335)
- [x] Müşteri dokümanı altbilgisi tek kaynaktan okuyor (negatif kontrolle kanıtlı)
- [x] Öncesi/sonrası `grep -rn "FonBridge"` sayımı raporda
- [x] Üretilen gerçek dokümanın altbilgisi yeni adı taşıyor (HTML + DOCX çıktısı raporda)
- [x] `prisma/schema.prisma` ve migration'lara dokunulmadı
- [x] `pnpm typecheck && pnpm lint && pnpm test` çıktısı raporda (0 hata, 1460 passed)
- [x] Kapsam dışı kusurlar düzeltilmedi, adıyla bildirildi (7 madde)
