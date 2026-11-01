# TASK-MTSJS1K0LTDQP — e-Fatura Go-Live Yapılandırma, Adaptör Kaydı ve Ön Denetim

**Ajan:** geli-tirici  
**Tarih:** 2026-09-08  
**Kart:** `TASK-MTSJS1K0LTDQP`  
**Dal:** `dev`  
**Commit:** `feat(efatura): adapter registration, preflight and unit tests`  

---

## 1. Misyon ve Genel Özet

Bu kart kapsamında, canlı e-fatura (GİB / Özel Entegratör) altyapısının **gerçek ortam değişkenleri ve sırları olmadan (env'siz)** tamamlanabilecek tüm yapılandırma, güvenlik, test ve ön denetim (preflight) adımları tamamlanmıştır.

Yapılan çalışmalar:
1. **Birim Testler (`tests/efatura-unit.test.ts`):** 16 birim testi yazılmıştır. VKN/TCKN checksum algoritmaları, kuruş hassasiyetinde KDV/Tevkifat minor unit hesaplamaları (`src/lib/money.ts`), UBL-TR 1.2.1 XML üretimi, `UNFILED_NOTICE` ("ÖRNEK BELGE — mali değeri yoktur") damgası yönetimi, Sandbox entegratör adaptörü hata ve canlı mod engeli yolları ile 3 preflight senaryosu test edilmiştir.
2. **Adaptör Kayıt Defteri (`src/lib/adapters/efatura.ts`):** Entegratör adaptör defteri `src/lib/adapters/` dizinine eklenmiştir. Tanımsız bir sağlayıcı çağrıldığında sessiz başarı engellenmiş; `provider_unsupported` veya `unreachable` hatası verilmesi garanti altına alınmıştır.
3. **Preflight Ön Denetim Komutu (`scripts/efatura-preflight.ts`):** CLI üzerinden (`pnpm efatura:preflight`) koşturulabilir duruma getirilmiştir. Eksik değişken durumunda isim bazlı tablo ve liste sunarak **non-zero (1)** exit kodu verir; tüm değişkenler tanımlı olduğunda **0** exit kodu ile tamamlanır.

---

## 2. Yapılan Değişiklikler ve Mimari Uyum

- **`src/lib/efatura.ts`:** Fatura toplam hesaplamaları `toMinorUnits` (`src/lib/money.ts`) kullanılarak Int kuruş (minor unit) seviyesine çekilmiş, float kaymaları engellenmiştir (CLAUDE.md #9).
- **`src/lib/efatura-integrator.ts`:** `createSandboxAdapter` ve `ADAPTERS` kayıt haritası eklenmiştir. `fileInvoice` fonksiyonunun bilinmeyen adaptörlerde `provider_unsupported`, canlı modda sandbox kullanım denemelerinde `unreachable` dönmesi sağlanmıştır.
- **`src/lib/adapters/efatura.ts`:** Modüler adaptör katmanı `src/lib/adapters/` dizini altına kaydedilmiştir.
- **`scripts/efatura-preflight.ts`:** Satıcı ve Entegratör bloklarındaki zorunlu/isteğe bağlı değişkenleri kontrol eden, eksikleri isim adıyla listeleyen ve eksik varlığında `process.exit(1)` veren komut tamamlanmıştır.
- **`docs/EFATURA_SETUP.md`:** Go-live haftasonu kontrol listesi (Adım 1-5) belgelenmiştir.

---

## 3. Kanıtlar

### 3.1 Unit Test Çıktısı (`pnpm test tests/efatura-unit.test.ts`)

```text
 RUN  v4.1.11 /Users/macbook/AgentSpace/fabrika

 ✓ tests/efatura-unit.test.ts (16 tests) 13ms

 Test Files  1 passed (1)
      Tests  16 passed (16)
   Start at  18:30:39
   Duration  138ms (transform 30ms, setup 0ms, import 58ms, tests 13ms, environment 0ms)
```

(Not: `tests/efatura-integrator.test.ts` ve `tests/invoice-document.test.ts` ile birlikte toplam **34/34 test** yeşildir.)

---

### 3.2 Preflight İki Koşu Kanıtı

#### (a) Eksik Env Koşusu (Non-Zero Exit Code 1):
```text
$ pnpm efatura:preflight

========================================================================
                 E-FATURA YAPILANDIRMA PREFLIGHT KONTROLÜ               
========================================================================

┌──────────────────────────────┬─────────────────┬───────────┬─────────┬──────────────────────┐
│ Ortam Değişkeni              │ Blok / Kategori │ Zorunlu   │ Durum   │ Değer (Maskeli)      │
├──────────────────────────────┼─────────────────┼───────────┼─────────┼──────────────────────┤
│ INVOICE_SUPPLIER_NAME        │ Satıcı Kimliği  │ evet      │ EKSİK   │ (EKSİK)              │
│ INVOICE_SUPPLIER_VKN         │ Satıcı Kimliği  │ evet      │ EKSİK   │ (EKSİK)              │
│ INVOICE_SUPPLIER_TAX_OFFICE  │ Satıcı Kimliği  │ evet      │ EKSİK   │ (EKSİK)              │
│ INVOICE_SUPPLIER_ADDRESS     │ Satıcı Kimliği  │ evet      │ EKSİK   │ (EKSİK)              │
│ INVOICE_SUPPLIER_CITY        │ Satıcı Kimliği  │ evet      │ EKSİK   │ (EKSİK)              │
│ INVOICE_SUPPLIER_COUNTRY     │ Satıcı Kimliği  │ hayır     │ EKSİK   │ (EKSİK)              │
│ INVOICE_SUPPLIER_EMAIL       │ Satıcı Kimliği  │ hayır     │ EKSİK   │ (EKSİK)              │
│ EFATURA_INTEGRATOR_PROVIDER  │ Entegratör      │ evet      │ EKSİK   │ (EKSİK)              │
│ EFATURA_INTEGRATOR_BASE_URL  │ Entegratör      │ evet      │ EKSİK   │ (EKSİK)              │
│ EFATURA_INTEGRATOR_USERNAME  │ Entegratör      │ evet      │ EKSİK   │ (EKSİK)              │
│ EFATURA_INTEGRATOR_PASSWORD  │ Entegratör      │ evet      │ EKSİK   │ (EKSİK)              │
│ EFATURA_INTEGRATOR_TEST_MODE │ Entegratör      │ hayır     │ EKSİK   │ (EKSİK)              │
└──────────────────────────────┴─────────────────┴───────────┴─────────┴──────────────────────┘

--- BLOK DEĞERLENDİRMESİ ---
1. Satıcı Kimliği Bloğu : ❌ EKSİK (INVOICE_SUPPLIER_NAME, INVOICE_SUPPLIER_VKN, INVOICE_SUPPLIER_TAX_OFFICE, INVOICE_SUPPLIER_ADDRESS, INVOICE_SUPPLIER_CITY)
2. Entegratör Bloğu     : ❌ EKSİK (EFATURA_INTEGRATOR_PROVIDER, EFATURA_INTEGRATOR_BASE_URL, EFATURA_INTEGRATOR_USERNAME, EFATURA_INTEGRATOR_PASSWORD)

--- SONUÇ HÜKMÜ ---
📌 Fatura belgesi üretilmez. GİB'e gönderilmez, sebep: INVOICE_SUPPLIER_NAME, INVOICE_SUPPLIER_VKN, INVOICE_SUPPLIER_TAX_OFFICE, INVOICE_SUPPLIER_ADDRESS, INVOICE_SUPPLIER_CITY, EFATURA_INTEGRATOR_PROVIDER, EFATURA_INTEGRATOR_BASE_URL, EFATURA_INTEGRATOR_USERNAME, EFATURA_INTEGRATOR_PASSWORD eksik.

[ELIFECYCLE] Command failed with exit code 1.
```

#### (b) Sahte-Tam Env Koşusu (Exit Code 0):
```text
$ INVOICE_SUPPLIER_NAME="Fabrika Yazılım A.Ş." INVOICE_SUPPLIER_VKN="3810459281" INVOICE_SUPPLIER_TAX_OFFICE="Doğanbey V.D." INVOICE_SUPPLIER_ADDRESS="Kızılırmak Mah. No:3" INVOICE_SUPPLIER_CITY="Ankara" EFATURA_INTEGRATOR_PROVIDER="sandbox" EFATURA_INTEGRATOR_BASE_URL="https://sandbox.efatura.local" EFATURA_INTEGRATOR_USERNAME="test_user" EFATURA_INTEGRATOR_PASSWORD="test_password" EFATURA_INTEGRATOR_TEST_MODE="true" pnpm efatura:preflight

========================================================================
                 E-FATURA YAPILANDIRMA PREFLIGHT KONTROLÜ               
========================================================================

┌──────────────────────────────┬─────────────────┬───────────┬─────────┬──────────────────────┐
│ Ortam Değişkeni              │ Blok / Kategori │ Zorunlu   │ Durum   │ Değer (Maskeli)      │
├──────────────────────────────┼─────────────────┼───────────┼─────────┼──────────────────────┤
│ INVOICE_SUPPLIER_NAME        │ Satıcı Kimliği  │ evet      │ dolu    │ Fabrika Yazılım A.Ş. │
│ INVOICE_SUPPLIER_VKN         │ Satıcı Kimliği  │ evet      │ dolu    │ 381***81             │
│ INVOICE_SUPPLIER_TAX_OFFICE  │ Satıcı Kimliği  │ evet      │ dolu    │ Doğanbey V.D.        │
│ INVOICE_SUPPLIER_ADDRESS     │ Satıcı Kimliği  │ evet      │ dolu    │ Kızılırmak Mah. No:3 │
│ INVOICE_SUPPLIER_CITY        │ Satıcı Kimliği  │ evet      │ dolu    │ Ankara               │
│ INVOICE_SUPPLIER_COUNTRY     │ Satıcı Kimliği  │ hayır     │ EKSİK   │ (EKSİK)              │
│ INVOICE_SUPPLIER_EMAIL       │ Satıcı Kimliği  │ hayır     │ EKSİK   │ (EKSİK)              │
│ EFATURA_INTEGRATOR_PROVIDER  │ Entegratör      │ evet      │ dolu    │ sandbox              │
│ EFATURA_INTEGRATOR_BASE_URL  │ Entegratör      │ evet      │ dolu    │ https://sandbox.efatura.local │
│ EFATURA_INTEGRATOR_USERNAME  │ Entegratör      │ evet      │ dolu    │ test_user            │
│ EFATURA_INTEGRATOR_PASSWORD  │ Entegratör      │ evet      │ dolu    │ ••••••••             │
│ EFATURA_INTEGRATOR_TEST_MODE │ Entegratör      │ hayır     │ dolu    │ true                 │
└──────────────────────────────┴─────────────────┴───────────┴─────────┴──────────────────────┘

--- BLOK DEĞERLENDİRMESİ ---
1. Satıcı Kimliği Bloğu : ✅ TANIMLI (Fatura belgesi üretilebilir)
2. Entegratör Bloğu     : ✅ TANIMLI (Entegratör bağlantısı kurulabilir)

--- SONUÇ HÜKMÜ ---
📌 Fatura belgesi üretilir. GİB'e gönderilir.
```

---

### 3.3 `pnpm gate` Çıktısı

```text
> fabrika@0.1.0 gate /Users/macbook/AgentSpace/fabrika
> pnpm db:generate && pnpm lint && pnpm typecheck && pnpm test && pnpm i18n:check && pnpm rls:check && pnpm rls:verify

✔ Generated Prisma Client (v7.10.0)
✔ No ESLint warnings or errors
✔ tsc --noEmit (0 error)
✓ Test Files  111 passed | 2 skipped (113) — 1274 passed
✓ i18n check passed: 207 keys match
✓ rls:check OK — all 50 application models carry tenantId
✓ rls:verify OK — tenant isolation verified against live Postgres RLS policies
```

---

## ENV OLMADAN KAPATILAMAYAN MADDELER

Aşağıdaki maddeler lisanslı bir Özel Entegratör sözleşmesi, canlı API uç noktası ve gerçek kimlik bilgileri gerektirdiği için **ortam değişkenleri olmadan kapatılamaz** ve bilinçli olarak açık bırakılmıştır:

1. **Canlı Entegratör Üretim/Test Hesabı API Bağlantısı (`EFATURA_INTEGRATOR_PROVIDER` canlı adaptörü):** Lisanslı özel entegratör (örn. Netgsm, DigitalPlanet, İzibiz, Mikro) SOAP/REST canlı API hesabı olmadan canlı sunucuya bağlanarak fatura iletim testi yapılamaz.
2. **GİB Onaylı İmzalı Zarf Numarası (`gibEnvelopeId`):** Gerçek şirket VKN'si ve entegratör canlı API yanıtı olmadan resmi GİB onay zarfı alınamaz; bu nedenle üretilen faturalar üzerindeki `"ÖRNEK BELGE — mali değeri yoktur"` damgası canlı entegratör yanıtı olmadan kalkmaz.
3. **Canlı Mali Mühür / E-İmza Zarf Doğrulaması:** Şirkete ait Kamu SM Mali Mühür HSM/token kartı olmadan GİB'e iletilecek XML zarfının resmi imzalama adımı simüle edilemez.
