# TASK-MTSWIFJKGTYC — A1+A2: Aydınlatma metni KVKK md.10 eksiklik analizi

**Ajan:** seo-en · **Tip:** analiz (doküman) · **Tarih:** 2026-09-10
**PLATFORM BEYANI:** macOS (darwin 25.6.0), Node v26.5.0, pnpm dev + curl ile **mac üzerinde**
doğrulandı. Windows/Linux koşulmadı ve **koşulmasına gerek yok**: dokunulan tek şey iki markdown
dosyası; ölçüm yolu platforma bağlı değil (Next.js dev sunucusu + HTTP `curl` + `node`/`python3`
metin işleme — süreç öldürme, kabuk-özel yol, DPI/izin yüzeyi yok). Tek platforma bağlı ayrıntı
kendi başlattığım dev sunucusunu kapatırken kullandığım `lsof -ti tcp:3117` çağrısıdır; bu
raporun bir çıktısı değil, temizlik adımıdır ve Windows'ta `netstat`/`Get-NetTCPConnection`
karşılığı gerekirdi.

---

## 1. Ne yapıldı

Kart "HUKUK GİRDİSİ BEKLİYOR" işaretliydi ve bu doğru — ama beklemeyen yarısı yapıldı:
hukukçunun önüne **ölçülmüş bir eksiklik analizi + doldurulacak boşlukları adıyla işaretlenmiş
şablon** kondu. **Hukuki metin yazılmadı, taslak cümle önerilmedi.**

(a) **Mevcut yüzeyler okundu ve bugün ne dedikleri çıkarıldı** — `src/app/[locale]/privacy/page.tsx`,
`src/app/[locale]/(app)/[workspace]/settings/privacy/{page,client}.tsx`; metin gövdeleri
`messages/tr.json` ve `messages/en.json` → `legal.privacy` / `settings.privacy` altından iki dil
ayrı ayrı çıkarıldı.

(b) **KVKK md.10'un beş unsuru madde madde listelendi**, her biri için VAR/KISMİ/YOK hükmü
alıntıyla verildi; ayrıca md.11'in 9 bendi tek tek tarandı.

(c) **`processing-register.md`'nin 18 faaliyeti ve §21'in 8 alıcısı** aydınlatma metniyle çapraz
kontrol edildi.

(d) **Veri sorumlusu kimliği ölçüldü** — kodda/dokümanlarda hangi unvan/adres/VKN/KEP geçiyor,
`INVOICE_SUPPLIER_*` ile tutarlı mı; üç ayrı çelişki ölçüldü.

(e) **`docs/legal/privacy-notice-gap-analysis.md` yazıldı** (413 satır) — `<<HUKUK: …>>` işaretli
şablon, her boşluğun yanında "hukukçudan ne isteniyor" tek cümlesiyle.

(f) **Uygulama kartı taslağı** (başlık + 10 maddelik kabul kriteri + bağımlılık sırası) hazır
bırakıldı; **kart AÇILMADI** (Task Board'a dokunulmadı).

### Ölçümün ürettiği, kartın beklemediği bulgular

**⛔ ENGELLEYİCİ:** Aydınlatma metninin "1. Veri Sorumlusu" bölümünün gövdesi bugün kullanıcıya
**hiç basılmıyor** — `privacy/page.tsx` `PRODUCT_NAME` import etmiyor ve `{brand}` taşıyan üç
katalog dizesini interpolasyonsuz çağırıyor; next-intl mesaj yerine anahtar yolunu render ediyor.
Yani md.10/1-a unsuru "eksik" değil, **hiç yok**. Aynı kusur `/terms` ve `/compliance/dpa`
sayfalarının `<title>` etiketlerinde de var. Bu bir **ürün kodu** kusuru ve hukuk girdisi
beklemez; kartın kuralı gereği koda dokunulmadı, uygulama kartı taslağının 1. maddesi olarak
kayda geçti.

---

## 2. Kanıt

### 2.1 Canlı render — `{brand}` interpolasyon kusuru (her iki dil)

```
$ pnpm dev -p 3117   # kendi başlattığım izole sunucu, iş sonunda kapatıldı
$ for L in tr en; do curl -s http://localhost:3117/$L/privacy | python3 …; done
===== /tr/privacy — rendered <title> and controller section =====
TITLE: legal.privacy.metaTitle
META-DESC: legal.privacy.metaDescription
BODY-P: legal.privacy.controllerBody
BODY-P: Kullanıcı hesabı açma, oturum doğrulama, AB hibe çağrılarıyla eşleştirme, yapay zeka destekli teklif taslağı oluşturma ve abonelik faturalandırması sü
===== /en/privacy — rendered <title> and controller section =====
TITLE: legal.privacy.metaTitle
META-DESC: legal.privacy.metaDescription
BODY-P: legal.privacy.controllerBody
BODY-P: Account registration, session authentication, EU funding call matching, AI-assisted concept note drafting, and subscription billing processes involve
```

Görünür metindeki (script blokları atılmış) sızıntı:

```
$ curl -s http://localhost:3117/tr/privacy | python3 …
literal {brand} in VISIBLE text: 0
key-path leaks in VISIBLE text: ['legal.privacy.metaTitle', 'legal.privacy.controllerBody']
```

Sunucu günlüğü:

```
$ grep -c "FORMATTING_ERROR" dev.log
18
$ grep -o 'was not provided to the string "[^"]\{0,60\}' dev.log | sort -u
was not provided to the string "{brand} SaaS Platform, in compliance with GDPR and applicabl
was not provided to the string "{brand} SaaS Platformu olarak, 6698 sayılı Kişisel Verilerin
was not provided to the string "{brand}'nın KVKK ve GDPR uyumlu gizlilik politikası: işlenen
was not provided to the string "{brand}'s GDPR and KVKK compliant privacy policy: what we pr
was not provided to the string "Gizlilik Politikası ve KVKK Aydınlatma Metni — {brand}
was not provided to the string "Privacy Policy & GDPR Disclosure — {brand}
```

Üç yasal sayfanın üçü de aynı kusuru taşıyor + hiçbirinde iletişim kanalı (footer) yok:

```
===== /tr/privacy =====     HTTP 200
has PublicFooter (info@usfinbridge.com): False
key-path leaks: ['legal.privacy.controllerBody', 'legal.privacy.metaTitle']
===== /tr/terms =====       HTTP 200
has PublicFooter (info@usfinbridge.com): False
key-path leaks: ['legal.terms.metaTitle']
===== /tr/compliance/dpa ===== HTTP 200
has PublicFooter (info@usfinbridge.com): False
key-path leaks: ['legal.dpa.metaTitle']
first 260: legal.dpa.metaTitle Veri İşleme Sözleşmesi (DPA) … platformu işleten Fabrika ("Veri İşleyen") arasındadır.
```

Karşılaştırma — `terms/page.tsx` interpolasyonu **doğru** yapıyor, `privacy/page.tsx` yapmıyor:

```
$ grep -n "PRODUCT_NAME" "src/app/[locale]/terms/page.tsx"
3:import { PRODUCT_NAME } from '@/lib/brand';
56:            {t('scopeBody', { brand: PRODUCT_NAME })}
$ grep -n "brand\|PRODUCT_NAME" "src/app/[locale]/privacy/page.tsx"
(çıktı yok)
```

### 2.2 Alıcı / yurt dışı aktarım taraması — `legal.*` namespace içinde 8 alıcının 8'i de yok

```
Anthropic        repo-wide messages/*.json: 0    | inside legal.* namespace: 0
OpenAI           repo-wide messages/*.json: 0    | inside legal.* namespace: 0
Google           repo-wide messages/*.json: 2    | inside legal.* namespace: 0
Microsoft        repo-wide messages/*.json: 0    | inside legal.* namespace: 0
Stripe           repo-wide messages/*.json: 38   | inside legal.* namespace: 0
Resend           repo-wide messages/*.json: 0    | inside legal.* namespace: 0
Cloudflare       repo-wide messages/*.json: 0    | inside legal.* namespace: 0
iyzico           repo-wide messages/*.json: 0    | inside legal.* namespace: 0
yurt dışı        repo-wide messages/*.json: 0    | inside legal.* namespace: 0
third country    repo-wide messages/*.json: 0    | inside legal.* namespace: 0
ABD              repo-wide messages/*.json: 0    | inside legal.* namespace: 0
alt işleyen      repo-wide messages/*.json: 0    | inside legal.* namespace: 0
SCC              repo-wide messages/*.json: 0    | inside legal.* namespace: 0
```

`aktarım` için `legal.*` içinde 1 eşleşme çıktı — kontrol edildi, **alıcı aktarımı değil**:

```
legal.* aktarım context: …iptal edebilirsiniz. Güvenlik gereği dışa aktarım dosyasına kimlik doğrulama anahta…
```

`alıcı` için 4 eşleşme çıktı — dördü de **"k-alıcı"** yanlış pozitifi (`kalıcı olarak silinir`),
bağlam tek tek basıldı ve doğrulandı.

### 2.3 md.10 / md.11 anahtar kelime taraması (`legal.privacy` + `settings.privacy`, TR+EN)

```
YOK      hukuki sebep/legal basis
YOK      md.5 / art.6 atfı
YOK      meşru menfaat / legitimate interest
YOK      açık rıza / consent
YOK      sözleşmenin ifası / performance of contract
YOK      toplama yöntemi / collection method
YOK      çerez / cookie
YOK      otomatik yollarla / automated means
VAR(1)  saklama süresi / retention  → saklama sür        ← yalnız metaDescription'daki VAAT
YOK      başvuru kanalı / application channel
VAR(3)  KVKK md.11 atfı  → 11. madde, art. 11
YOK      düzeltme hakkı / rectification
YOK      itiraz hakkı / object
YOK      tazminat / compensation
VAR(4)  aktarılan üçüncü kişiler / recipients → alıcı    ← 4'ü de "kalıcı" yanlış pozitifi
```

Kimlik unsurları:

```
e-mail addresses in messages/*.json: NONE
KEP mentions: 1          ← EN "kept" kelimesinden yanlış pozitif (bağlam basıldı, doğrulandı)
MERSIS mentions: 0
```

### 2.4 Veri sorumlusu kimliği çelişkileri

```
$ grep -n "PRODUCT_NAME =" src/lib/brand.ts
19:export const PRODUCT_NAME = 'FonBridge';       # "returned to FonBridge on 2026-09-10"

$ grep -n "INVOICE_SUPPLIER_NAME" docs/EFATURA_SETUP.md
38:| `INVOICE_SUPPLIER_NAME` | … **`FonBridge Ltd. Şti.`** (patron, 2026-09-08). Bu **tüzel kişi
     unvanıdır**, ürün adı değil: ürün **Fabrika**. |          ← "ürün Fabrika" bugün ESKİMİŞ

$ grep -rn "Fabrika" docs/legal/dpa-tr.md docs/legal/dpa-en.md
dpa-en.md:7: …the organisation using the Fabrika SaaS platform … and Fabrika, which operates…
dpa-tr.md:7: …Fabrika SaaS platformunu kullanan kurumsal müşteri … platformu işleten Fabrika…

$ curl -s http://localhost:3117/tr | …
© 2026 FonBridge (FonBridge SaaS). Tüm hakları saklıdır
```

→ Aynı sitede üç farklı taraf adı: aydınlatma `{brand}`(=FonBridge, basılmıyor), footer
"FonBridge", DPA "Fabrika"; tüzel kişi unvanı yalnızca bir kurulum dokümanında.

Dört ayrı alan adı (test dosyaları hariç `src/`):

```
src/components/PublicFooter.tsx:135: mailto:info@usfinbridge.com
src/lib/env.ts:49:  Defaults to noreply@usfinbridge.com
src/lib/beta/constants.ts:49-51: support@fabrika.dev / feedback@fabrika.dev / app.fabrika.dev
src/app/[locale]/(app)/[workspace]/settings/api-keys/client.tsx:295: https://fabrika.app/api/v1/…
src/lib/auth.ts:30: "admin@yasinaslan.com.tr"
```

`INVOICE_SUPPLIER_*` gerçekten bir kimlik taşıyor:

```
src/lib/env.ts:65-71   INVOICE_SUPPLIER_{NAME,VKN,TAX_OFFICE,ADDRESS,CITY,COUNTRY,EMAIL}
src/app/api/billing/invoices/[id]/export/route.ts:119-125   → fatura belgesine basılıyor
```

**`.env*` dosyaları bilinçli olarak OKUNMADI** (sır sızdırma riski); canlı değerlerin gerçek
tüzel kişiyi taşıyıp taşımadığı "ölçülemedi + nasıl ölçülür" olarak §5'e yazıldı.

### 2.5 Toplama anında aydınlatma yüzeyi — 0 eşleşme

```
$ grep -niE "kvkk|aydınlat|onay|consent|privacy|gizlilik|terms|koşul" "src/app/[locale]/login/AuthCard.tsx"
(çıktı yok)
```

### 2.6 Envanterin kendi beklentisiyle örtüşme

`processing-register.md` §12 madde 10 zaten şunu yazıyordu: onay kaydı aydınlatma cümlesi
*"A1/TASK-MTSWIFJKGTYC ile yayına alınacaktır … henüz `messages/*.json`'a eklenmemiştir."*
Bu kartta ölçüldü: **bugün de eklenmemiş** (§3.1 satır 12). Envanter §12 madde 8'deki
TBK md.146 (10 yıl) saklama süresi de kendi ifadesiyle "VARSAYIM — A1 hukuk girdisiyle
kesinleşecek"; şablonun Bölüm 6'sında `<<HUKUK: …>>` olarak bekliyor.

### 2.7 Doküman-dışı hiçbir şeye dokunulmadığının kanıtı

```
$ git status --porcelain -- docs/legal/privacy-notice-gap-analysis.md docs/agent-results/TASK-MTSWIFJKGTYC-blockzincir-pm.md
?? docs/agent-results/TASK-MTSWIFJKGTYC-blockzincir-pm.md
?? docs/legal/privacy-notice-gap-analysis.md
```

Commit sonrası `git show --name-only` çıktısı §6'da.

---

## 3. Değişen dosyalar

| Dosya | Durum |
|---|---|
| `docs/legal/privacy-notice-gap-analysis.md` | **YENİ** (413 satır) — asıl çıktı |
| `docs/agent-results/TASK-MTSWIFJKGTYC-blockzincir-pm.md` | **YENİ** — bu rapor |

**Ürün koduna, `messages/*.json`'a, `prisma/`'ya, Task Board'a dokunulmadı.**
Geçici dosyalar (`brandprobe.tmp.mjs`, dev sunucu günlüğü) silindi / scratchpad'de bırakıldı.

---

## 4. Riskler

1. **⛔ Aydınlatma metninin veri sorumlusu bölümü bugün üretimde `legal.privacy.controllerBody`
   basıyor.** Kart kapsamı analizle sınırlı olduğu için düzeltilmedi. Bu, KVKK md.10 açısından
   "eksik metin"den daha ağır bir durumdur ve **hukuk girdisi beklemeden** düzeltilebilir.
   Devredildi ≠ düzeltildi: bu satırın kimsenin üstüne alınmadan ağaçta kalma riski gerçektir.
2. **Yurt dışı aktarım metne yazılamaz** — envanter §21 hiçbir alıcı için imzalı SCC/ek
   bulunamadığını ölçmüş. Mekanizma kararı (açık rıza mı, md.9/2 güvenceleri mi) verilmeden
   şablonun Bölüm 3'ü doldurulamaz; sıra bağımlılığı şablonda ve kart taslağında kayıtlı.
   Açık rıza seçilirse **ürün tarafında yeni bir yüzey** (kayıt akışında rıza) gerekir —
   bugün kayıt ekranında hiçbir aydınlatma yüzeyi yok.
3. **Kullanıcıya gösterilen doğrulanmamış iddia:** PublicFooter her kamuya açık sayfada
   "Frankfurt & Istanbul Data Centers" basıyor; envanter §15 R2 için AB bölgesi zorlamasının
   kodda olmadığını ve Frankfurt iddiasının repoda doğrulanamadığını ölçmüş. Çerez banner'ı da
   olmayan bir analitik işlemesini beyan ediyor (envanter §19: stub). İkisi de **fazla beyan**
   ve düzeltmeleri hukuk beklemez — ama bu kartın kapsamında değil.
4. **Şablon eskime riski:** §6'daki boşluklar envanterin bugünkü hâline dayanıyor. Envanter
   değişirse (yeni alıcı, yeni faaliyet) şablon da güncellenmeli; kart taslağının kabul
   kriterlerinden biri envanter §12 madde 10'un güncellenmesidir.
5. **Ölçüm tek ortamda:** render kusuru dev sunucusunda ölçüldü. Üretim derlemesinde next-intl'in
   hata davranışı farklı olsaydı çıktı da farklı olurdu — ancak kök neden (eksik interpolasyon
   argümanı) derleme moduna bağlı değil; kaynak kodda doğrudan görülüyor.

---

## 5. Açık sorular (hukuk / patron kararı gerekiyor)

1. **Kanonik tüzel kişi kimliği nedir?** Unvan `FonBridge Ltd. Şti.` mi; MERSİS, KEP, tebligat
   adresi ne; `INVOICE_SUPPLIER_*` canlı değerleriyle aynı tüzel kişi mi?
2. **Başvuru kanalı hangi alan adı olacak?** Dört aday ölçüldü: `usfinbridge.com`,
   `fabrika.app`, `fabrika.dev`, `yasinaslan.com.tr`.
3. **DPA'daki taraf adı `Fabrika` düzeltilecek mi?** Ürün 2026-09-10'da `FonBridge`'e döndü;
   DPA metinleri (`dpa-tr.md:7`, `dpa-en.md:7`) hâlâ `Fabrika` diyor. Bu bir **sözleşme
   metnidir** — yeniden adlandırma taramasıyla değil, bilinçli kararla değişmeli.
4. **Yurt dışı aktarım mekanizması:** açık rıza mı, md.9/2 güvenceleri mi? Cevap ürün kapsamını
   değiştirir (rıza → yeni kayıt yüzeyi).
5. **Alıcılar adıyla mı, kategori olarak mı sayılacak?** Ad ile sayım her sağlayıcı
   değişiminde metin güncellemesi gerektirir.
6. **M4 CRM muhatapları (platform kullanıcısı olmayan üçüncü kişiler) nasıl aydınlatılacak?**
   Envanter §10 bunların "rızası/bilgisi olmayabileceğini" beyan ediyor;
   `SECURITY_COMPLIANCE.md:101`'de iddia edilen muhatap silme formu kod tabanında bulunamamış.

---

## 6. Sonraki adım

1. **Hukuk girdisi beklemeyen düzeltme ayrı kart olarak açılmalı** (bu kart kart açmaz):
   `privacy/page.tsx` interpolasyon kusuru + `terms`/`compliance/dpa` `<title>` kusuru.
   Ölçülebilir kabul kriteri: `/tr/privacy` ve `/en/privacy` görünür metninde `legal.` ile
   başlayan anahtar yolu **0**, sunucu günlüğünde `FORMATTING_ERROR` **0**.
2. `docs/legal/privacy-notice-gap-analysis.md` §6 şablonu hukuk ekibine iletilir.
3. Hukuk girdisi döndüğünde §7'deki başlık + 10 maddelik kabul kriteri ile uygulama kartı açılır.
4. §5'teki "ölçülemedi" kalemleri (R2 bölgesi, Resend bölgesi, canlı `INVOICE_SUPPLIER_*`)
   ilgili sahiplerinden istenir.

### Commit kanıtı

Bkz. aşağıya eklenen `git show --name-only` çıktısı.

```
$ git show --name-only --oneline HEAD
c07c71b docs(legal): measure the privacy notice against KVKK art.10, leave the gaps named
docs/agent-results/TASK-MTSWIFJKGTYC-blockzincir-pm.md
docs/legal/privacy-notice-gap-analysis.md
```

Yalnızca iki doküman; ürün kodu, `messages/*.json`, `prisma/` ve Task Board dokunulmadan kaldı.
