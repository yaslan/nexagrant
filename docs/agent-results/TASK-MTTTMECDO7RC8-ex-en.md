# TASK-MTTTMECDO7RC8 — `INVOICE_VAT_RATE` koddan ve dokümanlardan **kaldırıldı**

**Ajan:** ex-en (Araştırmacı/Explorer) · **Sprint:** SPRINT-S12 · **Tarih:** 2026-09-09
**Ölçülen taban:** `984ba39` (iş başlangıcı) → `3558018` (kapı koşarken ağaç ilerledi, bkz. Riskler)

---

## 1. Ne yapıldı

Patron kararı: ayar tamamen kaldırılsın. Ayar 2026-09-08'de (TASK-MTT1WUUS7MN7R)
karar verme yetkisini kaybetmişti ama **hâlâ parse ediliyordu** ve asıl tehlike
dokümandaydı: `docs/EFATURA_SETUP.md` onu "zorunlu: evet, boşken fatura kesilmez"
diye anlatıyordu — patron 12-13 Eylül'de entegratör görüşmesine bu dokümanla gidiyor.

### (a) Kod durakları — temizlendi

| Dosya | Ne yapıldı |
|---|---|
| `src/lib/env.ts` | `INVOICE_VAT_RATE: z.string().optional()` + 16 satırlık docblock **silindi**. Şema artık bu anahtarı tanımıyor; `safeParse(process.env)` onu sessizce yok sayar. |
| `src/lib/billing/vat-rate.ts` | `retiredVatRateSetting()` ve docblock'u **silindi** ("hâlâ set mi" raporlaması). Başlık docblock'undaki bölüm, 2026-09-08 gerekçesi ve tarihi korunarak "kaldırıldı" olarak yeniden yazıldı. `parseVatRate` / `resolveVatRate` **dokunulmadı**. |
| `src/lib/billing/vat-rates.ts` | Yalnız başlık yorumundaki tarihsel cümleden ayar **adı** çıkarıldı, kaldırılma tarihi eklendi. **Ülke tablosu ve `regime` alanına DOKUNULMADI** (kart yasağı). |
| `scripts/efatura-preflight.ts` | `retiredVatRateSetting` import'u, `RETIRED_VAT_VARS` sabiti, "YOK SAYILIR" satırını basan döngü ve ayar adını geçen konsol satırı **silindi**. Sahipsiz kalan KDV-bloğu docblock'u `DEFAULT_SUPPLIER_COUNTRY`'ye yeniden bağlandı. |
| `src/lib/iyzico.test.ts` | `vi.hoisted` içindeki `process.env.INVOICE_VAT_RATE = '20'` kurulumu silindi. |
| `src/lib/billing/subscription-sync.test.ts` | Tek işi bu kurulum olan `vi.hoisted` bloğu tamamen silindi. |
| `tests/efatura-unit.test.ts` | Senaryo (b) ve (c) ortamlarından değişken çıkarıldı; `not.toContain('INVOICE_VAT_RATE')` iddiası kaldırıldı; ayarın 9 değerini gezen `test.each` ve "ignored olarak raporlanır" testi **daha güçlü** tek bir testle değiştirildi (aşağıda). |
| `tests/vat-by-country.test.ts` | `describe('INVOICE_VAT_RATE after the decision')` bloğu ve `retiredVatRateSetting`/`parseVatRate` import'ları kaldırıldı (`parseVatRate` kapsamı `src/lib/billing/invoice-writer.test.ts`'te duruyor). |
| `.env.example` | `INVOICE_VAT_RATE=` satırı silindi; KDV yorum bloğu "ayarlanacak değişken YOKTUR" olarak yeniden yazıldı. **Depoda takip edilmiyor** — bkz. Riskler R2. |
| `.env` | **Değişiklik gerekmedi:** dosyada bu anahtar hiç yok (anahtar adı sayımı `0`). Değeri okunmadı, raporlanmadı; yalnız anahtar adı arandı. |

**Test silinirken gevşetme yapılmadı.** Kaldırılan iki test, artık var olmayan bir
davranışı (ayarın "set ama yok sayılıyor" diye raporlanması) tarif ediyordu. Yerine
gelen test daha dar değil, **daha geniş** bir mülkiyeti çiviliyor: KDV bloğu tek bir
satır üretir ve o satır bir ortam değişkeni değil, ülkedir —

```ts
const report = evaluatePreflight({ ...everythingElse, SOME_RETIRED_TAX_VAR: '20' });
const vatRows = report.variableResults.filter((r) => r.block === 'Vergi (KDV)');
expect(vatRows).toHaveLength(1);
expect(vatRows[0]?.variable).toBe('KDV oranı (Türkiye)');
```

### (b) Dokümanlar — koda hizalandı (gerekçe ve tarihler korunarak)

- **`docs/EFATURA_SETUP.md`** (patronun görüşmeye götürdüğü dosya):
  - `:45` — "zorunlu: evet / boşken fatura kesilmez" **tablo satırı silindi**.
  - `:27` — "`INVOICE_SUPPLIER_*` ve `INVOICE_VAT_RATE` doldurulsa bile" → `EFATURA_INTEGRATOR_*`.
  - `:106` — `vat-rate.ts` açıklaması "ayar kabul kuralı" değil "alıcının ülkesi → oran"; ayrıca `vat-rates.ts` satırı eklendi (oran **oradan** değişir).
  - `:137` (Adım 1) — değişken maddesi yerine: **"KDV için girilecek değişken YOKTUR"** + kaldırılma tarihi ve kart no.
  - `:154` — durak notu `vat_rate_not_configured` yerine gerçek uyarıyı (`invoice_vat_country_unknown`) anlatıyor; "bu blok hiçbir ortam değişkeni okumaz" eklendi.
  - Sayı düzeltmeleri: **13 değişken → 12** (3 yerde) ve Adım 3'ün beklenen test sayısı **33 → 29** (aşağıda ölçüldü; 33 zaten HEAD'de yanlıştı).
- **`docs/BILLING.md`** `:61` tarihsel gerekçe geçmiş zamana çekildi; `:116` **"emekliye ayrıldı" → "kaldırıldı"** (2026-09-09, kart no), "şemadan silinmedi" cümlesi geçmişe alındı, oranın nereden değiştiği yazıldı.
- **`docs/DATA_MODEL.md`** `:483` paragrafı: başlık artık "ortam değişkeni değil, alıcının ülkesi". 2026-09-08 patron kararı, kaynak/rejim disiplini ve `%0 ≠ bilinmiyor` ayrımı korundu. Sonraki paragraf (KDV-dahil ayrıştırma + "Yuvarlama farkı" kalemi) **doğru olduğu için dokunulmadı** — `invoice-writer.ts:185-201` hâlâ tahsil edilen tutarı ayrıştırıyor.

---

## 2. Kanıt

### K1 — `grep -rn "INVOICE_VAT_RATE" src scripts tests` → **0 sonuç**

```
$ grep -rn "INVOICE_VAT_RATE" src scripts tests || echo "GREP RESULT: 0 hits"
GREP RESULT: 0 hits

$ grep -rn "retiredVatRateSetting\|RETIRED_VAT_VARS" src scripts tests || echo "0 hits"
0 hits
```

(Dokümanlarda ad bilerek duruyor — **kaldırıldığını** söyleyen cümlelerde:
`docs/BILLING.md:63,117`, `docs/DATA_MODEL.md:491`, `docs/EFATURA_SETUP.md:138`.
Operatörün "bu değişken nereye gitti?" sorusunun cevabı orada.)

### K2 — Preflight GERÇEKTEN koşturuldu, iki uçta

Betik `dotenv` yüklemiyor (`process.env`'i doğrudan okur), bu yüzden `env -i` ile
**tamamen izole** koşuldu: gerçek `.env` hiç okunmadı, hiçbir sır çıktıya girmedi.

**Koşu 1 — eksik env'ler → KIRMIZI, exit 1:**

```
$ env -i PATH="$PATH" HOME="$HOME" npx tsx scripts/efatura-preflight.ts

========================================================================
                 E-FATURA YAPILANDIRMA PREFLIGHT KONTROLÜ               
========================================================================

┌──────────────────────────────┬─────────────────┬───────────┬───────────┬──────────────────────┐
│ Ortam Değişkeni              │ Blok / Kategori │ Zorunlu   │ Durum     │ Değer (Maskeli)      │
├──────────────────────────────┼─────────────────┼───────────┼───────────┼──────────────────────┤
│ INVOICE_SUPPLIER_NAME        │ Satıcı Kimliği  │ evet      │ EKSİK     │ (EKSİK)              │
│ INVOICE_SUPPLIER_VKN         │ Satıcı Kimliği  │ evet      │ EKSİK     │ (EKSİK)              │
│ INVOICE_SUPPLIER_TAX_OFFICE  │ Satıcı Kimliği  │ evet      │ EKSİK     │ (EKSİK)              │
│ INVOICE_SUPPLIER_ADDRESS     │ Satıcı Kimliği  │ evet      │ EKSİK     │ (EKSİK)              │
│ INVOICE_SUPPLIER_CITY        │ Satıcı Kimliği  │ evet      │ EKSİK     │ (EKSİK)              │
│ INVOICE_SUPPLIER_COUNTRY     │ Satıcı Kimliği  │ hayır     │ EKSİK     │ (EKSİK)              │
│ INVOICE_SUPPLIER_EMAIL       │ Satıcı Kimliği  │ hayır     │ EKSİK     │ (EKSİK)              │
│ KDV oranı (Türkiye)          │ Vergi (KDV)     │ evet      │ dolu      │ %20 (TR)             │
│ EFATURA_INTEGRATOR_PROVIDER  │ Entegratör      │ evet      │ EKSİK     │ (EKSİK)              │
│ EFATURA_INTEGRATOR_BASE_URL  │ Entegratör      │ evet      │ EKSİK     │ (EKSİK)              │
│ EFATURA_INTEGRATOR_USERNAME  │ Entegratör      │ evet      │ EKSİK     │ (EKSİK)              │
│ EFATURA_INTEGRATOR_PASSWORD  │ Entegratör      │ evet      │ EKSİK     │ (EKSİK)              │
│ EFATURA_INTEGRATOR_TEST_MODE │ Entegratör      │ hayır     │ EKSİK     │ (EKSİK)              │
└──────────────────────────────┴─────────────────┴───────────┴───────────┴──────────────────────┘

--- BLOK DEĞERLENDİRMESİ ---
1. Satıcı Kimliği Bloğu : ❌ EKSİK (INVOICE_SUPPLIER_NAME, INVOICE_SUPPLIER_VKN, INVOICE_SUPPLIER_TAX_OFFICE, INVOICE_SUPPLIER_ADDRESS, INVOICE_SUPPLIER_CITY)
2. Vergi (KDV) Bloğu    : ✅ TANIMLI (Fatura kaydı yazılabilir)
   ↳ KDV oranı ALICININ ÜLKESİNDEN gelir (kaynaklı ülkeler: TR, KW).
     Kaynaklı satırı olmayan ülkeye fatura KESİLMEZ; ortam değişkeniyle ayarlanamaz.
3. Entegratör Bloğu     : ❌ EKSİK (EFATURA_INTEGRATOR_PROVIDER, EFATURA_INTEGRATOR_BASE_URL, EFATURA_INTEGRATOR_USERNAME, EFATURA_INTEGRATOR_PASSWORD)

--- SONUÇ HÜKMÜ ---
📌 Fatura kaydı oluşturulur. Fatura belgesi üretilmez, sebep: satıcı kimliği eksik (INVOICE_SUPPLIER_NAME, INVOICE_SUPPLIER_VKN, INVOICE_SUPPLIER_TAX_OFFICE, INVOICE_SUPPLIER_ADDRESS, INVOICE_SUPPLIER_CITY). GİB'e gönderilmez, sebep: INVOICE_SUPPLIER_NAME, INVOICE_SUPPLIER_VKN, INVOICE_SUPPLIER_TAX_OFFICE, INVOICE_SUPPLIER_ADDRESS, INVOICE_SUPPLIER_CITY, EFATURA_INTEGRATOR_PROVIDER, EFATURA_INTEGRATOR_BASE_URL, EFATURA_INTEGRATOR_USERNAME, EFATURA_INTEGRATOR_PASSWORD eksik.

EXIT=1
```

**Koşu 2 — 12 değişken dolu (sentetik değerler) → YEŞİL, exit 0:**

```
$ env -i PATH="$PATH" HOME="$HOME" \
    INVOICE_SUPPLIER_NAME='FonBridge Ltd. Şti.' INVOICE_SUPPLIER_VKN='3810459281' \
    INVOICE_SUPPLIER_TAX_OFFICE='Doğanbey V.D.' INVOICE_SUPPLIER_ADDRESS='Kızılırmak Mah. 1450. Cad. No:3' \
    INVOICE_SUPPLIER_CITY='Ankara' INVOICE_SUPPLIER_COUNTRY='Türkiye' \
    INVOICE_SUPPLIER_EMAIL='muhasebe@ornek.com' EFATURA_INTEGRATOR_PROVIDER='sandbox' \
    EFATURA_INTEGRATOR_BASE_URL='https://efatura-test.ornek.com' EFATURA_INTEGRATOR_USERNAME='fabrika_api' \
    EFATURA_INTEGRATOR_PASSWORD='synthetic_test_password' EFATURA_INTEGRATOR_TEST_MODE='true' \
    npx tsx scripts/efatura-preflight.ts

========================================================================
                 E-FATURA YAPILANDIRMA PREFLIGHT KONTROLÜ               
========================================================================

┌──────────────────────────────┬─────────────────┬───────────┬───────────┬──────────────────────┐
│ Ortam Değişkeni              │ Blok / Kategori │ Zorunlu   │ Durum     │ Değer (Maskeli)      │
├──────────────────────────────┼─────────────────┼───────────┼───────────┼──────────────────────┤
│ INVOICE_SUPPLIER_NAME        │ Satıcı Kimliği  │ evet      │ dolu      │ FonBridge Ltd. Şti.  │
│ INVOICE_SUPPLIER_VKN         │ Satıcı Kimliği  │ evet      │ dolu      │ 381***81             │
│ INVOICE_SUPPLIER_TAX_OFFICE  │ Satıcı Kimliği  │ evet      │ dolu      │ Doğanbey V.D.        │
│ INVOICE_SUPPLIER_ADDRESS     │ Satıcı Kimliği  │ evet      │ dolu      │ Kızılırmak Mah. 1450. Cad. No:3 │
│ INVOICE_SUPPLIER_CITY        │ Satıcı Kimliği  │ evet      │ dolu      │ Ankara               │
│ INVOICE_SUPPLIER_COUNTRY     │ Satıcı Kimliği  │ hayır     │ dolu      │ Türkiye              │
│ INVOICE_SUPPLIER_EMAIL       │ Satıcı Kimliği  │ hayır     │ dolu      │ muhasebe@ornek.com   │
│ KDV oranı (Türkiye)          │ Vergi (KDV)     │ evet      │ dolu      │ %20 (TR)             │
│ EFATURA_INTEGRATOR_PROVIDER  │ Entegratör      │ evet      │ dolu      │ sandbox              │
│ EFATURA_INTEGRATOR_BASE_URL  │ Entegratör      │ evet      │ dolu      │ https://efatura-test.ornek.com │
│ EFATURA_INTEGRATOR_USERNAME  │ Entegratör      │ evet      │ dolu      │ fabrika_api          │
│ EFATURA_INTEGRATOR_PASSWORD  │ Entegratör      │ evet      │ dolu      │ ••••••••             │
│ EFATURA_INTEGRATOR_TEST_MODE │ Entegratör      │ hayır     │ dolu      │ true                 │
└──────────────────────────────┴─────────────────┴───────────┴───────────┴──────────────────────┘

--- BLOK DEĞERLENDİRMESİ ---
1. Satıcı Kimliği Bloğu : ✅ TANIMLI (Fatura belgesi üretilebilir)
2. Vergi (KDV) Bloğu    : ✅ TANIMLI (Fatura kaydı yazılabilir)
   ↳ KDV oranı ALICININ ÜLKESİNDEN gelir (kaynaklı ülkeler: TR, KW).
     Kaynaklı satırı olmayan ülkeye fatura KESİLMEZ; ortam değişkeniyle ayarlanamaz.
3. Entegratör Bloğu     : ✅ TANIMLI (Entegratör bağlantısı kurulabilir)

--- SONUÇ HÜKMÜ ---
📌 Fatura kaydı oluşturulur. Fatura belgesi üretilir. GİB'e gönderilir.

EXIT=0
```

**İki çıktının hiçbirinde ayar adı geçmiyor** (satır sayımı `0` / `0`) ve tablo
13 satırdan 13'e değil, **12 ortam değişkeni + 1 ülke satırı**na indi: `INVOICE_VAT_RATE`
satırının yerini `KDV oranı (Türkiye) · %20 (TR)` aldı.

### K3 — Ayar artık **inert**: set etmek çıktıyı bir bayt değiştirmiyor

Kaldırmanın gerçekten kaldırma olduğunun kanıtı, adın kaybolması değil; hâlâ set
eden bir kurulumun **hiçbir farkı görmemesi**:

```
$ env -i ... npx tsx scripts/efatura-preflight.ts > without.txt   # exit 0
$ env -i ... INVOICE_VAT_RATE='99' npx tsx scripts/efatura-preflight.ts > with99.txt   # exit 0
$ diff without.txt with99.txt
IDENTICAL: setting the retired variable changes nothing
$ grep -c "INVOICE_VAT_RATE" without.txt with99.txt
without.txt:0
with99.txt:0
```

### K4 — Test kurulumları silindiğinde testler KIRMIZIYA DÖNMEDİ (ayar gerçekten ölüydü)

Kartın "gevşetme, kırmızıya dönerse DUR" kuralının doğrudan ölçümü. `process.env`
kurulumlarını silip **aynı testleri değiştirmeden** koştum:

```
$ npx vitest run src/lib/iyzico.test.ts src/lib/billing/subscription-sync.test.ts
 Test Files  2 passed (2)
      Tests  27 passed (27)
```

```
$ npx vitest run tests/efatura-unit.test.ts tests/vat-by-country.test.ts src/lib/billing/invoice-writer.test.ts
 Test Files  3 passed (3)
      Tests  75 passed (75)
```

### K5 — Dokümandaki "33/33 test" iddiası HEAD'de zaten yanlıştı; 29 olarak ölçüldü

```
$ npx vitest run tests/efatura-unit.test.ts tests/efatura-integrator.test.ts
 Test Files  2 passed (2)
      Tests  29 passed (29)
```

HEAD'deki sayım (statik, `git show HEAD:<dosya>` üzerinden):

```
tests/efatura-unit.test.ts       HEAD: 20 düz test + 1 test.each(9 vaka) = 29
tests/efatura-integrator.test.ts HEAD:  9 düz test                       =  9
                                                                    TOPLAM 38
```

Yani doküman **33** derken gerçek **38**'di — bu kart öncesinde de yanlıştı, 5 fark.
Bu kartla 38 → **29** oldu (ayarın 9 değerini gezen `test.each` gitti, 1 test 1 testle
değişti) ve doküman ölçülen değere (**29**) çekildi.

### K6 — `pnpm gate` → exit 0, lint uyarısı **hâlâ 2** (artmadı)

```
$ pnpm gate
GATE_EXIT=0

/Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f1-e2e-probe.mts
  10:7  warning  'R' is assigned a value but never used  @typescript-eslint/no-unused-vars

/Users/macbook/AgentSpace/fabrika/docs/agent-results/TASK-MTSYH8LDGV5YU-evidence/f4-rag-probe.mts
  5:28  warning  '_url' is defined but never used  @typescript-eslint/no-unused-vars

✖ 2 problems (0 errors, 2 warnings)

 Test Files  132 passed | 2 skipped (134)
      Tests  1559 passed | 8 skipped (1567)

✅ SUCCESS: All 43 tenant-scoped models have RLS policies registered.
✅ 43 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
```

İki uyarı da bildirilen kalıntı dosyalar; sayı artmadı, yeni uyarı gelmedi.

---

## 3. Değişen dosyalar

```
 docs/BILLING.md                           | 19 +++++++-----
 docs/DATA_MODEL.md                        | 21 ++++++++-----
 docs/EFATURA_SETUP.md                     | 33 ++++++++++++---------
 scripts/efatura-preflight.ts              | 42 +++++++++-----------------
 src/lib/billing/subscription-sync.test.ts |  6 ----
 src/lib/billing/vat-rate.ts               | 27 ++++-------------
 src/lib/billing/vat-rates.ts              |  3 +-
 src/lib/env.ts                            | 17 -----------
 src/lib/iyzico.test.ts                    |  3 --
 tests/efatura-unit.test.ts                | 49 +++++++++++++------------------
 tests/vat-by-country.test.ts              | 12 +-------
 11 files changed, 88 insertions(+), 144 deletions(-)
```

Ayrıca `.env.example` (depoda **takip edilmiyor**, commit'e giremez — R2).

**Kartın DOKUNMA listesine harfiyen uyuldu:** `src/lib/money.ts`, `src/lib/efatura.ts`,
`src/lib/billing/invoice-list.ts` ve `vat-rates.ts`'in ülke tablosu / `regime` alanı
**değiştirilmedi** (üçü de bu kartta paralel koşan başka bir ajanın çalışma alanı).

---

## 4. Riskler

**R1 — Kapı, benim değişikliğimi TEK BAŞINA ölçmedi.** `pnpm gate` exit 0 verdi ama
çalışma ağacında aynı anda **iki başka ajanın işi** vardı (`git status`: `src/lib/money.ts`,
`src/lib/efatura.ts`, `src/lib/billing/invoice-list.ts` — stopaj/yuvarlama kartı;
`src/app/[locale]/(app)/[workspace]/relationships/*` — üçüncü kart). Kanıt: iki kapı koşusu
3 dakika arayla **1550** ve **1559** test saydı; HEAD de `984ba39` → `3558018` ilerledi.
Kendi dilimimi ayrıca izole ölçtüm (K2/K3/K4: dokunduğum her test dosyası + preflight'ın
gerçek koşusu) ama "kapı yeşil" ifadesi **karışık bir ağacın** ölçümüdür. Kesin
atıf isteniyorsa üç kart birleştikten sonra tek bir temiz kapı koşusu gerekir.

**R2 — `.env.example` depoda hiç takip edilmiyor** (`.gitignore:34` → `.env*`).
Bu dosyadaki düzeltmem bu makinede duruyor, commit'e **giremiyor**; başka bir geliştirici
`.env.example`'ı klonladığında hâlâ eski hâlini görür. Daha önce iki kez bildirilmiş
(`docs/agent-results/ADR-0002-geli-tirici-2.md:388`), hâlâ açık. Düzeltmesi tek satır:
`.gitignore`'a `!.env.example` istisnası. **Kart açılmalı** — kendi kartımın kapsamı değil.

**R3 — `parseVatRate` artık üretimde ölü.** `retiredVatRateSetting` gidince tek çağıranı
kalmadı; yalnız `src/lib/billing/invoice-writer.ts:139`'daki re-export ve iki test
kullanıyor. Dahası o re-export'un yorumu (`invoice-writer.ts:135`) hâlâ
*"parseVatRate stays exported for the preflight's 'this setting is now ignored' report"*
diyor — artık **yanlış bir iddia**. Düzeltmedim: `invoice-writer.ts` bu sprintte paralel
koşan stopaj/yuvarlama kartının (TASK-MTTT8H82Y7P1E) dosyası; oraya dokunmak onun işini
bozardı. **Kart açılmalı.**

**R4 — `tsconfig.exen-probe.json` kök dizinde takipsiz duruyor** (oturum başında da
oradaydı, bu kartın ürünü değil). Adı benim kimliğimi taşıyor, yani daha eski bir ex-en
probe kalıntısı. Kapıya bugün etki etmiyor (`pnpm typecheck` `tsconfig.json` kullanıyor)
ama bir sonraki tsconfig sorununda yanıltır. Silmedim — başka bir ajanın koşumunda
kullanılıyor olabilir. **Kart açılmalı.**

**R5 — Ortam yöneticilerinde kalan değer sessizce ölür.** Vercel/secrets tarafında
`INVOICE_VAT_RATE` hâlâ tanımlıysa artık **hiçbir yerde raporlanmıyor** (raporlayan
satırı bu kartla sildik — patron kararı buydu). Bunun kabul edilen bedeli: bir operatör
o değeri görüp hâlâ işe yaradığını sanabilir. Karşı önlem olarak `docs/EFATURA_SETUP.md`
Adım 1'e ve `docs/BILLING.md` §1.2'ye "artık kalmışsa etkisizdir ve silinebilir"
cümlesi yazıldı; go-live gününde ortam yöneticisinden **elle** silinmesi öneriliyor.

---

## 5. Açık sorular

1. **Go-live gününde ortam yöneticisinden silinsin mi?** Kod artık umursamıyor; sorun
   yalnızca insanın gördüğü liste. Öneri: 12-13 Eylül kontrol listesine "eski KDV
   değişkenini secrets'tan sil" maddesi. Karar patronun.
2. **`.gitignore` istisnası açılacak mı?** (R2) `.env.example` takip edilmedikçe bu
   dosyadaki her düzeltme tek makinede kalıyor — üçüncü kez aynı borç bildiriliyor.
3. `docs/EFATURA_SETUP.md`'nin "beklenen test sayısı" satırı doğası gereği eskiyor
   (bu kartta 33→29). Sayı yerine "hepsi yeşil" ölçütü mü yazılmalı? Küçük ama tekrar
   eden bir yalan-yeşil kaynağı.

---

## 6. Sonraki adım

1. **Patron/operatör:** 12-13 Eylül görüşmesine giden `docs/EFATURA_SETUP.md` artık
   doğru: doldurulacak **12** değişken var ve KDV **onlardan biri değil**. Adım 1'de
   mali müşavirden KDV oranı istemeye gerek yok; oran `vat-rates.ts`'te kaynaklı.
2. **Lider:** R2 (`.env.example` takip edilmiyor), R3 (`parseVatRate` ölü + yanlış
   yorum, `invoice-writer.ts`), R4 (`tsconfig.exen-probe.json` kalıntısı) için kart.
3. Üç paralel kart birleştikten sonra **tek bir temiz `pnpm gate`** koşusu (R1).
