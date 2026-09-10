# TASK-MTVT0VLF4AP19 — Sahipsiz e2e kırmızısı: DOCX dışa aktarımda "FonBridge"

**Ajan:** cs-fb (Customer Support / QA) · **Tip:** bug (triyaj + düzeltme) · **Sprint:** S12
**Verdict: BAYAT TEST — kiracı sızıntısı YOK.** Belge her alanında doğruydu; kırmızı olan testti.

---

## 1. Ne yapıldı

### 1.1 Kırmızıyı kendim tekrarladım (başkasının raporunu kanıt saymadan)

Kırmızı gerçek ve temel çizgide duruyor. Ham çıktı §2.1'de.

### 1.2 Kök neden — koda kadar izlendi

Testin kızdığı satır:

```ts
expect(text).not.toContain('FonBridge');   // spec:120 (eski)
```

Bu satır "yanlış/uydurma kuruluş" nöbetçisiydi. Ama üretilen DOCX'te `FonBridge` kelimesi
**kuruluş alanında değil**, ürün adı olarak **künye cümlesinde** geçiyor:

```
'Kuruluş: Doc Export E2E Kiracı A'                                    ← DOĞRU, kiracının kendi adı
"Bu belge Doc Export E2E Kiracı A tarafından FonBridge'da hazırlanmıştır. …"   ← ÜRÜN adı
```

Zinciri koda kadar sürdüm — sabit string de değil, seed verisi de değil, yanlış kiracı da değil:

- `src/app/api/documents/export/route.ts:51` → `tx.tenant.findFirst({ where: { id: tenantId } })`,
  **`withTenant(tenantId, …)` transaction'ının içinde**. Kuruluş adı çağıranın KENDİ `Tenant` satırı.
- `src/lib/document-exporter.ts:387` → `field(L.docxOrganizationLabel, orgName)`, `orgName = tenantName`.
- `FonBridge` kelimesinin tek kaynağı `src/lib/document-exporter.ts:164` `provenanceText()` →
  `withBrand()` → `src/lib/brand.ts` `PRODUCT_NAME`.

**Akışı değiştiren commit:**

```
9af3f63  2026-09-10 09:54:45 +0300  feat(brand): restore FonBridge product name and update SMTP addresses
7fede8e  2026-09-08 13:08:08 +0300  fix(documents): stop stamping a Commission badge on the tenant's own draft   ← testin yazıldığı commit
```

Test **2026-09-08**'de, ürün adı `Fabrika` iken yazıldı; o gün `FonBridge` yalnızca uydurma
kuruluşun (`FonBridge Teknoloji A.Ş.`) adıydı ve nöbetçi olarak mantıklıydı. **2026-09-10 09:54**'te
`9af3f63` `PRODUCT_NAME`'i `FonBridge`'e geri aldı; nöbetçi string canlı ürün adına çarptı.

İronisi şu: `src/lib/brand.ts`'in kendi docblock'u tam olarak bunu yasaklıyor —
*"the name is a value read from here, never a string re-typed at the call site."*
Test bir call site'tır ve adı yeniden yazmıştı. **Kök neden budur**, tarih değil.

### 1.3 Aynı kusurun İKİNCİ örneği — seri abort'un arkasında saklıydı

Hedef test düzelince paket 5. teste kadar ilerledi ve ORADA kızardı (§2.3):

```ts
expect(en).toContain('This document is a draft produced in Fabrika');   // spec:254 (eski)
```

Bu sefer **ölü** marka yeniden yazılmış. Aynı sınıf, aynı commit, aynı dosya. Bu kırmızı hiç
raporlanmamıştı çünkü `test.describe.configure({ mode: 'serial' })` ilk kırmızıda kalan 3 testi
hiç koşturmuyordu: **tek bayat assertion 4 kiracı-izolasyon testini birden karartıyordu.**

### 1.4 Düzeltme — assertion GEVŞETİLMEDİ, güçlendirildi

`not.toContain('FonBridge')` kör bir kuraldı: "bu kelime dosyanın herhangi bir yerinde geçmesin".
Yerine, kusurun gerçekten yaşadığı yeri ölçen yapısal kurallar kondu — DOCX'i **paragraf paragraf**
ayrıştıran yeni bir `docxParagraphs()` yardımcısıyla (etiket ve değer ayrı `w:r` run'ları olduğu için
`toContain` "kuruluş alanı X'tir" ile "X dosyada bir yerde geçiyor"u ayırt edemiyor):

```ts
// Kimlik alanları kiracının satırına EŞİT — toContain, "FonBridge Teknoloji A.Ş. / Kiracı A"
// yazan bir antettde de geçerdi.
expect(field('Kuruluş')).toBe(`Kuruluş: ${DOC_E2E.tenantName}`);
expect(field('Proje Başlığı')).toBe(`Proje Başlığı: ${DOC_E2E.opportunityTitle}`);
expect(field('Doküman Ref')).toBe(`Doküman Ref: ${DOC_E2E.partId}`);

// ÜRÜN adı bir KİMLİK değildir: künyede durur, başvuranı/çağrıyı/belgeyi adlandıran alanda asla.
for (const label of DOCX_IDENTITY_LABELS) expect(field(label)).not.toContain(PRODUCT_NAME);
const provenance = paragraphs.find((p) => p.includes('resmî bir belge DEĞİLDİR'));
expect(provenance).toContain(`${DOC_E2E.tenantName} tarafından ${PRODUCT_NAME}`);

expect(text).not.toContain('FonBridge Teknoloji');     // uydurma KURULUŞ — literal kalır (bkz. §4)
expect(text).not.toContain(DOC_E2E.otherTenantName);   // YENİ: B'nin adı da sızmamalı
```

`PRODUCT_NAME` artık `src/lib/brand.ts`'ten **okunuyor**; bir sonraki yeniden adlandırma bu dosyayı
tekrar kıramaz. Uydurma kuruluş literal'i (`FonBridge Teknoloji`) bilerek literal bırakıldı:
marka değişse de o string ölü bir fixture olarak kalır, `PRODUCT_NAME`'den türetilemez.

---

## 2. Kanıt

### 2.1 Temel çizgi — KIRMIZI (ham çıktı)

```
$ E2E_PORT=3311 npx playwright test tests/e2e/document-export-tenant-isolation.spec.ts

  ✓  1 … signed out: the export refuses with 401 and hands over no content (435ms)
  ✘  2 … tenant A clicks "Resmî DOCX İndir" and gets its OWN organisation, not FonBridge (6.9s)
  -  3 … tenant A asking for tenant B’s partId gets 404 and none of B’s text
  -  4 … tenant B asking for tenant A’s partId gets 404 as well
  -  5 … the printable document follows the session language and states nothing was signed

    Error: expect(received).not.toContain(expected) // indexOf
    Expected substring: not "FonBridge"

      120 |     expect(text).not.toContain('FonBridge');
          |                      ^
        at tests/e2e/document-export-tenant-isolation.spec.ts:120:22

  1 failed
  3 did not run
  1 passed (13.0s)
```

Kızan assertion `spec:120`; beklenen `not "FonBridge"`, gerçek → aşağıdaki belge.

### 2.2 İnen DOCX'in söylediği — beklenen/gerçek

Tarayıcının gerçekten indirdiği dosyanın `word/document.xml`'inden, paragraf paragraf
(`docs/agent-results/TASK-MTVT0VLF4AP19-screenshots/02-tenant-a-export.docx`):

```
'PART_B - Part_B_Technical_Proposal'
"Bu belge Doc Export E2E Kiracı A tarafından FonBridge'da hazırlanmıştır. Avrupa Komisyonu,
 TÜBİTAK ya da başka bir fon kuruluşu tarafından düzenlenmiş veya onaylanmış resmî bir belge DEĞİLDİR."
'Proje Başlığı: DOC-EXPORT-E2E-CAGRI-A'
'Kuruluş: Doc Export E2E Kiracı A'          ← beklenen: kiracı A'nın adı · gerçek: kiracı A'nın adı
'Sürüm: v1'
'Doküman Ref: doc-export-e2e-part-a'
'1.1 Objectives and Ambition'
'Lider yazar atanmadı'
'KIRACI-A-PARTB-METNI'
```

`FonBridge Teknoloji` yok · `HORIZON-CL5-2026-D3-01` yok · kiracı B'nin ne metni ne adı var.
**Kiracı sızıntısı yok.**

### 2.3 Düzeltme sonrası — saklı İKİNCİ kırmızı ortaya çıktı

```
  ✓  1 … signed out: the export refuses with 401 (279ms)
  ✓  2 … tenant A clicks "Resmî DOCX İndir" and every identity field is its OWN (6.7s)
  ✓  3 … tenant A asking for tenant B’s partId gets 404 and none of B’s text (905ms)
  ✓  4 … tenant B asking for tenant A’s partId gets 404 as well (911ms)
  ✘  5 … the printable document follows the session language and states nothing was signed (1.0s)

    Error: expect(received).toContain(expected)
    Expected substring: "This document is a draft produced in Fabrika"
      254 |     expect(en).toContain('This document is a draft produced in Fabrika');

  1 failed
  4 passed (13.6s)
```

### 2.4 Nihai — 5/5 YEŞİL, gerçek Chromium

```
$ E2E_PORT=3311 npx playwright test tests/e2e/document-export-tenant-isolation.spec.ts

Running 5 tests using 1 worker
[seed-doc-export-e2e] ready — A=doc-export-e2e-tenant-a/… B=doc-export-e2e-tenant-b/…
  ✓  1 … signed out: the export refuses with 401 and hands over no content (268ms)
  ✓  2 … tenant A clicks "Resmî DOCX İndir" and every identity field is its OWN, not an invented organisation (6.8s)
  ✓  3 … tenant A asking for tenant B’s partId gets 404 and none of B’s text (904ms)
  ✓  4 … tenant B asking for tenant A’s partId gets 404 as well (812ms)
  ✓  5 … the printable document follows the session language and states nothing was signed (1.1s)
[seed-doc-export-e2e] rolled back

  5 passed (13.5s)
```

Test 2 **gerçek tıklamadır**: `getByRole('link', { name: 'Resmî DOCX İndir' }).click()` + gerçek
`download` olayı. Kare: `01-tenant-a-partb-editor.png` (228 KB, kiracı A oturumuyla Part B editörü),
inen dosya: `02-tenant-a-export.docx` (8 962 B) — ikisi de
`docs/agent-results/TASK-MTVT0VLF4AP19-screenshots/`. İnen dosyadaki kuruluş satırının birebir
alıntısı §2.2'de.

### 2.5 MUTASYON — yeni assertion'ların dişleri var mı? (yeşil test kanıt değildir)

`src/lib/document-exporter.ts` geçici olarak bozuldu, tek test koşuldu, dosya geri alındı.
Geri alma **hash ile** doğrulandı (`4cd2a6ac1f5aa0782cbc46e9bff7a01381a71f13`, her iki turda aynı).

**Mutasyon A — klasik kusur:** `orgName = 'FonBridge Teknoloji A.Ş.'`

```
  ✘  1 … every identity field is its OWN, not an invented organisation (7.0s)
    Error: expect(received).toContain(expected)
    Expected substring: "Doc Export E2E Kiracı A"
        at tests/e2e/document-export-tenant-isolation.spec.ts:146:18
  1 failed
=== RESTORED, hash: 4cd2a6ac1f5aa0782cbc46e9bff7a01381a71f13 ===
```

**Mutasyon D — eski assertion setinin GÖREMEDİĞİ kusur:**
`field(L.docxOrganizationLabel, \`${orgName} / Horizon Europe Consortium\`)` — yani kiracının adı
yerinde duruyor ama antette ikinci, ilgisiz bir kuruluş daha var.

```
  ✘  1 … every identity field is its OWN, not an invented organisation (6.9s)
    Expected: "Kuruluş: Doc Export E2E Kiracı A"
    Received: "Kuruluş: Doc Export E2E Kiracı A / Horizon Europe Consortium"
        at tests/e2e/document-export-tenant-isolation.spec.ts:155:30
  1 failed
=== RESTORED, hash: 4cd2a6ac1f5aa0782cbc46e9bff7a01381a71f13 ===
```

Aynı bozuk belgeye **eski** assertion seti uygulandığında (ürün adı `Fabrika` iken, yani `9af3f63`
öncesi dünyada — mutasyonun ürettiği gerçek DOCX üzerinde ölçüldü):

```
PASS  toContain(tenantName)                    PASS  not.toContain('HORIZON-CL5-2026-D3-01')
PASS  toContain(opportunityTitle)              PASS  not.toContain(otherSectionText)
PASS  toContain(sectionText)                   PASS  toContain(partId)
PASS  not.toContain('FonBridge')               PASS  not.toMatch(MINTED_REF)

OLD SET (pre-rename) VERDICT: ALL PASS — the defect slips through
```

**Yani değişiklik bir gevşetme değil:** eski setin kaçırdığı bir anteti yeni set yakalıyor.
Dürüstlük payı: bugünkü ağaçta eski set bu mutasyonda da kızarırdı — ama yalnız
`not.toContain('FonBridge')` yüzünden, ki o assertion **doğru belgede de** kızıyor. Her koşulda
kızan bir assertion doğruyu yanlıştan ayırt edemez; bilgi taşımaz. Ayırt etme gücünü ölçmek için
o assertion'ın anlamlı olduğu tek dünyada — yeniden adlandırma öncesinde — ölçtüm.

### 2.6 `pnpm typecheck` · `pnpm lint`

```
$ pnpm typecheck 2>&1 | grep -E "error TS" | sed 's/(.*//' | sort | uniq -c
   1 src/lib/inngest/jobs/alerts-sweep.test.ts

$ pnpm typecheck 2>&1 | grep -E "^tests/e2e/document-export-tenant-isolation"
NONE — my file is clean

$ npx eslint tests/e2e/document-export-tenant-isolation.spec.ts
ESLINT_EXIT=0
$ pnpm lint
$ eslint          ← çıktı yok, temiz
```

**Kırmızı AYRIMI — hangisi benim, hangisi değil:** `typecheck` kırmızısı **bana ait değil**.
Hatalar `src/lib/inngest/jobs/alerts-sweep.test.ts` içinde ve `src/lib/env.ts`'e eklenmekte olan
`ALERTS_SWEEP_FAILURE_THRESHOLD` (number, `Record<string,string>` imzasıyla uyumsuz) yüzünden.
`git status` üçünü de commit edilmemiş gösteriyor:

```
 M src/lib/env.ts
 M src/lib/inngest/jobs/alerts-sweep.test.ts
 M src/lib/inngest/jobs/alerts-sweep.ts
```

Bunlar **TASK-MTVRC1UGA3B6Y** (alerts sweep sessiz başarısızlık) kartının uçuştaki işidir; benim
kapsamım değil, DOKUNMADIM. Benim dosyamda tek hata yok.

---

## 3. Değişen dosyalar

| Dosya | Ne |
|---|---|
| `tests/e2e/document-export-tenant-isolation.spec.ts` | `PRODUCT_NAME` import'u; `docxParagraphs()` + `unescapeXml()` yardımcıları; kimlik alanlarında eşitlik assertion'ları; `otherTenantName` sızıntı kontrolü; iki bayat marka literal'i (`spec:120`, `spec:254`) `brand.ts`'ten okunur hale getirildi; test adı düzeltildi |
| `docs/agent-results/TASK-MTVT0VLF4AP19-screenshots/01-tenant-a-partb-editor.png` | Kiracı A oturumu, Part B editörü (gerçek Chromium) |
| `docs/agent-results/TASK-MTVT0VLF4AP19-screenshots/02-tenant-a-export.docx` | Tarayıcının indirdiği gerçek dosya |
| `docs/agent-results/TASK-MTVT0VLF4AP19-cs-fb.md` | Bu rapor |

`src/**` altında **hiçbir** değişiklik yok — kusur kaynakta değildi. `src/lib/document-exporter.ts`
yalnız mutasyon ölçümü için geçici bozuldu ve hash ile doğrulanarak geri alındı.

Kareler kendi kart klasörüme yazıldı, `TASK-MTS9VGEKE8N3B-screenshots/`'a **değil**:
`tests/e2e/fixtures/shots.ts`'in uyardığı gibi kapanmış bir kartın kanıtını ezmek kanıtı yok eder.
Koşular varsayılan (git-ignored) `test-artifacts/` köküne yazdı; oradan bilerek kopyalandı.

---

## 4. `grep -rn "FonBridge" src prisma` — kalan artıklar (bu kartta DÜZELTİLMEDİ)

51 satır. Marka `9af3f63` ile **FonBridge'e geri döndüğü için** bunların çoğu artık doğru; sorun
"yanlış isim" değil, **ismin yeniden yazılmış olması** — `brand.ts`'in önlemek için var olduğu şey.

- **(A) 28 satır — yalnız yorum/docblock.** Tarihsel notlar (`FonBridge Teknoloji A.Ş.` uydurma
  kuruluşunun anlatıldığı yerler dâhil). İşlem gerekmez.
- **(C) 11 satır — test fixture'ı** (`src/lib/billing/*.test.ts`, `src/lib/llm.generate.test.ts`).
  Düşük öncelik; yeniden adlandırmada kırılırlar.
- **(B) 12 satır — CANLI çalışma zamanı kodunda yeniden yazılmış marka literal'i.** Asıl borç:

  ```
  src/lib/feedback/digest-run.ts:95        from: env.EMAIL_FROM || 'FonBridge <no-reply@fabrika.app>'
  src/lib/feedback/digest.ts:117,123       e-posta konusu + <h2> başlığı
  src/lib/inngest/jobs/alerts-daily.ts:193,197,206   <h2>, imza, from adresi   ← TASK-MTVRC1UGA3B6Y'nin dosyası
  src/lib/beta/esr-survey.ts:92,95,96,288  anket konusu + gövde + CSV başlığı
  src/lib/adapters/eurostars.ts:147        User-Agent: 'FonBridge/1.0'
  src/lib/adapters/tubitak.ts:172          User-Agent: 'FonBridge/1.0'
  ```

  Hepsi `PRODUCT_NAME` okumalı. `alerts-daily.ts` başka bir ajanın uçuştaki dosyası —
  o karta bırakılmalı, ayrıca düzeltilmemeli.

### 4.1 KAPSAMIM DIŞINDA bulunan GERÇEK üretim hatası — kart açıldı

Temel çizgi koşusunun dev-server logunda, her sayfa yüklemesinde:

```
Error: FORMATTING_ERROR: The intl string context variable "brand" was not provided to the string
"{brand} — AB Finansman Platformu (Horizon Europe, Eurostars)"
    at Module.generateMetadata (src/app/[locale]/page.tsx:18:17)
  18 |   const title = t('metaTitle');
```

`9af3f63` katalog metinlerine `{brand}` yer tutucusu ekledi, ama `src/app/[locale]/page.tsx`
`generateMetadata`'sı `t('metaTitle')`'ı **interpolasyon değeri vermeden** çağırıyor. Ana sayfanın
`<title>` ve `<meta description>`'ı çalışma zamanında patlıyor — SEO'nun tam kalbi.
`messages/tr.json`'da 29, `messages/en.json`'da 27 `{brand}` yer tutucusu var; kaç çağrı yerinin
değeri geçirmediği sayılmadı.

Kapsamım `tests/e2e/document-export-*` + belge dışa aktarım katmanı olduğu için **düzeltmedim**.
Devretmenin kendisi düzeltme değildir: bu yüzden panoda kart açtım (§6).

---

## 5. Riskler

1. **`docxParagraphs()` regex ile OOXML ayrıştırıyor.** `docx` kütüphanesinin ürettiği düz
   paragraflar için yeterli; ileride tablo/iç içe yapı eklenirse yardımcının gözden geçirilmesi
   gerekir. Gerçek bir XML ayrıştırıcı bağımlılık eklerdi, e2e'de değmez.
2. **Kimlik etiketleri (`Kuruluş`, `Proje Başlığı`, `Doküman Ref`) testte Türkçe literal.** Test URL'i
   `locale=tr` sabitliyor ve dosya zaten `'resmî bir belge DEĞİLDİR'` gibi Türkçe literaller
   kullanıyor; bu bilinçli — render edilen dili de sabitliyor. Katalog anahtarı yeniden
   adlandırılırsa test kızarır (doğru davranış).
3. **12 canlı marka literal'i (§4-B) yerinde duruyor.** Bir sonraki yeniden adlandırmada aynı sınıf
   kırılma tekrar yaşanır — bu sefer e-posta ve anket metinlerinde, yani müşteriye giden yüzeyde.
4. **`test.describe … mode: 'serial'`** bu dosyada duruyor: tek kırmızı hâlâ kalan testleri
   karartır. Fixture paylaşımı bunu gerektiriyor; ama bu kartta görüldüğü gibi bir kırmızı
   diğerlerini gizleyebilir. Kırmızı görüldüğünde "kaç test koşmadı" satırı okunmalı.

---

## 6. Açık sorular

1. `src/app/[locale]/page.tsx` `{brand}` FORMATTING_ERROR'ı için kart açtım
   (**TASK-MTVTIU3LAYFOA**, backlog). Sahibi kim olacak — marka değişikliğini yapan ajan mı,
   yoksa frontend mi?
2. §4-B'deki 12 literal tek bir "brand hygiene" kartında mı toplansın? `alerts-daily.ts` satırları
   TASK-MTVRC1UGA3B6Y ile çakışıyor; sırayla gitmeli.
3. `brand.ts`'in kuralını (`PRODUCT_NAME` yeniden yazılmaz) `pnpm gate`'te statik bir kapı yapmak
   mantıklı mı? TASK-MTVRAZSUVLL9R'nin kapı betiği bunun için doğal ev olabilir.

---

## 7. Sonraki adım

- §4.1 kartı (TASK-MTVTIU3LAYFOA) triyaj edilip birine atansın — ana sayfa metadata'sı bugün patlıyor.
- §4-B marka hijyeni kartı açılsın (`alerts-daily.ts` hariç, o karta bırakılsın).
- Kapı önerisi: "marka adı literal'i yasak" statik kuralı, TASK-MTVRAZSUVLL9R kapı betiğine ek madde.

---

## 8. Platform beyanı

**Doğrulama platformu: mac (Darwin 25.6.0, arm64)** — Node 26.5.0, pnpm, Postgres (docker
compose `db`), Playwright/Chromium, gerçek tıklama ve gerçek `download` olayı.

Dokunduğum kod yolu **platforma bağlı değil**: değişiklik tek bir Playwright spec dosyasında —
`unzipper` ile zip okuma, string/regex karşılaştırma ve `src/lib/brand.ts`'ten bir sabit okuma.
Süreç öldürme, kabuk/ikili adı, mutlak dosya yolu, kısayol metni, ekran/DPI ya da mikrofon-kamera
izni yok. Dosya yolları `tests/e2e/fixtures/shots.ts`'in kendi yardımcısı üzerinden şablon dizgiyle
üretiliyor (POSIX ayraç; Windows'ta Node bunu da kabul eder).

**Windows ve Linux'ta koşulamadı** — bu makinede yalnız mac var, kardeş pane'ler aynı ağacı
paylaşıyor ve izole bir Windows/Linux ortamı mevcut değil. Koddan beklenen davranış üç platformda
da aynı: DOCX baytları ve Postgres yanıtı işletim sisteminden bağımsız; tek platforma bağlı unsurlar
Playwright'ın Chromium indirmesi ve Postgres'e TCP bağlantısı, ikisi de üçünde de aynı çalışır.
Türkçe karakterli assertion'lar (`Kuruluş`, `DEĞİLDİR`) UTF-8 kaynak dosyadan okunuyor; Windows'ta
kod sayfası etkisi yok, çünkü karşılaştırma konsola değil bellekteki string'e yapılıyor.
