# TASK-MTSYAKDK5LV9E — `INVOICE_VAT_RATE` preflight'ın 13. zorunlu değişkeni oldu

**Ajan:** geli-tirici (BE-EN) · **Tip:** bug / go-live kapısı · **Sprint:** SPRINT-S12
**Tarih:** 2026-09-08 · **Branch:** dev

## 1. Ne yapıldı

### Önce: iddia doğrulandı
Karttaki ölçümü körlemesine almadım, HEAD'de kendim doğruladım:

- `grep -n INVOICE_VAT_RATE scripts/efatura-preflight.ts` → **0 sonuç**. Doğru.
- `src/lib/billing/invoice-writer.ts:271-280` gerçekten `parseVatRate` null dönerse
  `{ status: 'skipped', reason: 'vat_rate_not_configured' }` döndürüp `SystemAlert`
  yazıyor — **`Invoice` satırı hiç yazılmıyor**, ödeme etkilenmiyor.
- Kartın "saf fonksiyona çıkar" maddesi **zaten kısmen yapılmıştı**: `parseVatRate`
  invoice-writer.ts:115'te dışa aktarılmış duruyordu. Yani yapılacak iş "çıkarmak"
  değil, preflight'ın onu **çağırabilmesini sağlamaktı**.

### Yapılan değişiklik

**(a) Kural tek dosyaya taşındı — `src/lib/billing/vat-rate.ts` (YENİ).**
`parseVatRate` invoice-writer.ts'ten alınıp kendi modülüne kondu; invoice-writer onu
`export { parseVatRate } from './vat-rate'` ile yeniden dışa aktarıyor (mevcut
importerlar — `invoice-writer.test.ts` — hiç değişmedi).

*Neden doğrudan invoice-writer'dan import etmedim:* invoice-writer
`@/lib/observability/system-alert` → Prisma zincirini çekiyor. Preflight bir CLI
kapısı; bir yüzdeyi kontrol etmek için Prisma client'ı ve `DATABASE_URL`'i yüklemeye
mecbur olmamalı. Kural yine **tek** yerde, ama kapı hafif kaldı.

**(b) Preflight'a 3. blok: "Vergi (KDV)".**
Mevcut bloğa (Satıcı Kimliği) koymadım — **gerekçe:** iki blok boru hattının farklı
noktalarında duruyor ve operatöre hangisi olduğu söylenmeli:

| Eksik olan | Ne olmuyor | Nerede |
|---|---|---|
| `INVOICE_VAT_RATE` | `Invoice` satırı **hiç yazılmıyor** | `invoice-writer.ts:271` |
| `INVOICE_SUPPLIER_*` | Satır yazılıyor, **belge** (UBL-TR/PDF) üretilemiyor | `invoice-document.ts:104` |

Tek boolean'a katlansaydı rapor "belge üretilmez" derdi ve kayıt hiç yazılmadığını
gizlerdi. Doğruladım: `grep -n "supplier" src/lib/billing/invoice-writer.ts` → **0
sonuç**, yani yazıcı satıcı kimliğine hiç bakmıyor. İki ayrı durak gerçekten var.

**(c) "Dolu mu" değil, **kabul edilir mi**.** Preflight `parseVatRate`'i çağırıyor;
dolu ama kullanılamaz bir değer (`abc`, `-1`, `101`) yeni bir `GEÇERSİZ` durumuyla
raporlanıyor ve kapıyı kırmızı yapıyor. Kartın korktuğu yalan yeşilin ikinci hâli buydu.

**(d) SONUÇ HÜKMÜ üçe ayrıldı** (`invoiceRecordVerdict` / `documentGenVerdict` /
`gibSendVerdict`), her biri eksik olan bloğa göre kendi cümlesini kuruyor.

## 2. Kanıt

Tümü gerçek çalıştırma. **`.env`'e hiçbir şey yazılmadı** — hepsi geçici ortam
değişkeniyle koşturuldu (`env VAR=... npx tsx ...`).

### (a) 12 değişken dolu, `INVOICE_VAT_RATE` BOŞ → kırmızı, exit 1

```
$ env INVOICE_SUPPLIER_NAME="Fabrika Yazılım A.Ş." INVOICE_SUPPLIER_VKN="3810459281" \
      INVOICE_SUPPLIER_TAX_OFFICE="Doğanbey V.D." INVOICE_SUPPLIER_ADDRESS="Kızılırmak Mah. No:3" \
      INVOICE_SUPPLIER_CITY="Ankara" INVOICE_SUPPLIER_COUNTRY="Türkiye" \
      INVOICE_SUPPLIER_EMAIL="muhasebe@ornek.com" EFATURA_INTEGRATOR_PROVIDER="sandbox" \
      EFATURA_INTEGRATOR_BASE_URL="https://efatura-test.ornek.com" \
      EFATURA_INTEGRATOR_USERNAME="fabrika_api" EFATURA_INTEGRATOR_PASSWORD="test_password_123" \
      EFATURA_INTEGRATOR_TEST_MODE="true" pnpm efatura:preflight

========================================================================
                 E-FATURA YAPILANDIRMA PREFLIGHT KONTROLÜ               
========================================================================

┌──────────────────────────────┬─────────────────┬───────────┬───────────┬──────────────────────┐
│ Ortam Değişkeni              │ Blok / Kategori │ Zorunlu   │ Durum     │ Değer (Maskeli)      │
├──────────────────────────────┼─────────────────┼───────────┼───────────┼──────────────────────┤
│ INVOICE_SUPPLIER_NAME        │ Satıcı Kimliği  │ evet      │ dolu      │ Fabrika Yazılım A.Ş. │
│ INVOICE_SUPPLIER_VKN         │ Satıcı Kimliği  │ evet      │ dolu      │ 381***81             │
│ INVOICE_SUPPLIER_TAX_OFFICE  │ Satıcı Kimliği  │ evet      │ dolu      │ Doğanbey V.D.        │
│ INVOICE_SUPPLIER_ADDRESS     │ Satıcı Kimliği  │ evet      │ dolu      │ Kızılırmak Mah. No:3 │
│ INVOICE_SUPPLIER_CITY        │ Satıcı Kimliği  │ evet      │ dolu      │ Ankara               │
│ INVOICE_SUPPLIER_COUNTRY     │ Satıcı Kimliği  │ hayır     │ dolu      │ Türkiye              │
│ INVOICE_SUPPLIER_EMAIL       │ Satıcı Kimliği  │ hayır     │ dolu      │ muhasebe@ornek.com   │
│ INVOICE_VAT_RATE             │ Vergi (KDV)     │ evet      │ EKSİK     │ (EKSİK)              │
│ EFATURA_INTEGRATOR_PROVIDER  │ Entegratör      │ evet      │ dolu      │ sandbox              │
│ EFATURA_INTEGRATOR_BASE_URL  │ Entegratör      │ evet      │ dolu      │ https://efatura-test.ornek.com │
│ EFATURA_INTEGRATOR_USERNAME  │ Entegratör      │ evet      │ dolu      │ fabrika_api          │
│ EFATURA_INTEGRATOR_PASSWORD  │ Entegratör      │ evet      │ dolu      │ ••••••••             │
│ EFATURA_INTEGRATOR_TEST_MODE │ Entegratör      │ hayır     │ dolu      │ true                 │
└──────────────────────────────┴─────────────────┴───────────┴───────────┴──────────────────────┘

--- BLOK DEĞERLENDİRMESİ ---
1. Satıcı Kimliği Bloğu : ✅ TANIMLI (Fatura belgesi üretilebilir)
2. Vergi (KDV) Bloğu    : ❌ EKSİK (INVOICE_VAT_RATE)
3. Entegratör Bloğu     : ✅ TANIMLI (Entegratör bağlantısı kurulabilir)

--- SONUÇ HÜKMÜ ---
📌 Fatura kaydı hiç oluşturulmaz: INVOICE_VAT_RATE 0-100 arası bir yüzde değil. SystemAlert (vat_rate_not_configured) yazılır, ödeme etkilenmez. Fatura belgesi de üretilmez, çünkü üretilecek kayıt yoktur. GİB'e gönderilmez, sebep: INVOICE_VAT_RATE eksik.

[ELIFECYCLE] Command failed with exit code 1.
```

**Bu, kartın tarif ettiği yalan yeşilin tam olarak kapandığı satır:** eskiden bu env ile
kapı `exit 0` verirdi (12/12 dolu), şimdi `exit 1`.

### (b) `INVOICE_VAT_RATE=20` → yeşil, exit 0

```
########## INVOICE_VAT_RATE=20 ##########
│ INVOICE_VAT_RATE             │ Vergi (KDV)     │ evet      │ dolu      │ 20                   │
--- BLOK DEĞERLENDİRMESİ ---
1. Satıcı Kimliği Bloğu : ✅ TANIMLI (Fatura belgesi üretilebilir)
2. Vergi (KDV) Bloğu    : ✅ TANIMLI (Fatura kaydı yazılabilir)
3. Entegratör Bloğu     : ✅ TANIMLI (Entegratör bağlantısı kurulabilir)

--- SONUÇ HÜKMÜ ---
📌 Fatura kaydı oluşturulur. Fatura belgesi üretilir. GİB'e gönderilir.
>>> EXIT=0
```

### (c) Sınır durumları — `abc`, `-1`, `101` üçü de kırmızı

```
########## INVOICE_VAT_RATE=abc ##########
│ INVOICE_VAT_RATE             │ Vergi (KDV)     │ evet      │ GEÇERSİZ  │ abc (0-100 değil)    │
2. Vergi (KDV) Bloğu    : ❌ EKSİK (INVOICE_VAT_RATE)
📌 Fatura kaydı hiç oluşturulmaz: INVOICE_VAT_RATE 0-100 arası bir yüzde değil. SystemAlert (vat_rate_not_configured) yazılır, ödeme etkilenmez. Fatura belgesi de üretilmez, çünkü üretilecek kayıt yoktur. GİB'e gönderilmez, sebep: INVOICE_VAT_RATE eksik.
>>> EXIT=1

########## INVOICE_VAT_RATE=-1 ##########
│ INVOICE_VAT_RATE             │ Vergi (KDV)     │ evet      │ GEÇERSİZ  │ -1 (0-100 değil)     │
2. Vergi (KDV) Bloğu    : ❌ EKSİK (INVOICE_VAT_RATE)
>>> EXIT=1

########## INVOICE_VAT_RATE=101 ##########
│ INVOICE_VAT_RATE             │ Vergi (KDV)     │ evet      │ GEÇERSİZ  │ 101 (0-100 değil)    │
2. Vergi (KDV) Bloğu    : ❌ EKSİK (INVOICE_VAT_RATE)
>>> EXIT=1
```

Birim test tarafında ayrıca `''`, `'   '`, `'NaN'`, `'1e999'` reddediliyor; `'0'`,
`'20'`, `' 18 '`, `'100'` kabul ediliyor — ve her vakada `parseVatRate(raw)` ile
`report.vatConfigured` **aynı** kararı veriyor (testin kendisi bu eşitliği doğruluyor,
iki kuralın ayrışmasını yakalar).

### (d) Kapı: typecheck / lint / test

```
$ pnpm typecheck
$ tsc --noEmit
(çıktı yok — 0 hata)

$ pnpm lint
$ eslint
(çıktı yok — 0 uyarı/hata)

$ pnpm test
$ vitest run --passWithNoTests
 Test Files  121 passed | 2 skipped (123)
      Tests  1416 passed | 8 skipped (1424)
   Duration  6.49s
```

## 3. Değişen dosyalar

| Dosya | Ne oldu |
|---|---|
| `src/lib/billing/vat-rate.ts` | **YENİ** — `parseVatRate`, kabul kuralının tek kaynağı |
| `src/lib/billing/invoice-writer.ts` | Kural buradan çıktı; `./vat-rate`'ten import + yeniden dışa aktarım (davranış aynı) |
| `scripts/efatura-preflight.ts` | 3. blok "Vergi (KDV)", `GEÇERSİZ` durumu, `vatConfigured`/`missingVatVars`/`invoiceRecordVerdict`, ayrışmış sonuç hükmü, genişletilmiş Durum sütunu |
| `tests/efatura-unit.test.ts` | 3 senaryo yeni alanlara göre güncellendi + `INVOICE_VAT_RATE` için 4 test (13. değişken, hüküm cümlesi, 7 geçersiz değer, 4 geçerli değer) |
| `docs/EFATURA_SETUP.md` | Go-live Adım 1 "13 değişken", Adım 2 beklenen çıktısı 3 bloklu + exit kodu + üç-durak notu; ilgili dosyalara `vat-rate.ts` |

**Değişken tablosu (`docs/EFATURA_SETUP.md`) zaten 13 satırdı** — `INVOICE_VAT_RATE`
orada "zorunlu" olarak duruyordu. Yani doküman doğruydu, **kod dokümanın gerisindeydi**.
Uydurulan doküman yok.

## 4. Riskler

- **`GEÇERSİZ` yeni bir durum değeri.** `PreflightVariableResult['status']` birliğine
  eklendi. Bu tipi tüketen başka kod yok (`grep`: yalnız script + test), ama çıktıyı
  metin olarak ayrıştıran bir CI adımı varsa "Durum" sütunu 7 → 9 karaktere genişledi.
- **`summarySentence` biçimi değişti** (2 cümle → 3 cümle). Eski cümleyi birebir
  bekleyen dış bir kontrol varsa kırılır; repo içindeki tek tüketici olan test güncellendi.
- **Kapı artık gerçekten kırmızı.** `pnpm gate` / CI, `INVOICE_VAT_RATE` set edilmemiş
  bir ortamda `efatura:preflight` çağırıyorsa bundan sonra düşecektir — bu istenen
  davranış, ama beklenmedik bir yerde patlarsa sebebi budur.
- Fatura yazıcısının davranışı **değişmedi**; sadece kuralın yeri değişti.

## 5. Açık sorular / yol üstünde görülen, DÜZELTİLMEYEN kusurlar

1. **`tsconfig.exen-probe.json` depoda takipsiz duruyor** (kök dizin, 8 Eylül 13:50,
   82 bayt, `incremental: false` sondası). Benim değil — EX-EN'in bıraktığı sonda
   dosyası. Karta göre dokunmadım ve commit'e almadım. Silinmesi gerekiyor.
2. **Preflight hâlâ ortam değişkenlerinden ötesini görmüyor.** `EFATURA_SETUP.md`'nin
   kendi uyarısına göre go-live'ı asıl bloke eden iki şey ayarlarda değil:
   (a) `TenantBillingIdentity` satırını dolduran ürün ekranı **yok** → 13/13 yeşil olsa
   bile canlıda kesilecek fatura sayısı sıfır; (b) canlı fiyat kataloğu USD ve TRY dışı
   fatura GİB'e gönderilemiyor (ADR-0002 karar bekliyor). Kapı "ayarlar tamam" diyor,
   "fatura kesilir" demiyor. Bunları bu kartın kapsamında düzeltmedim — ayrı kart konusu.
3. **KDV oranı tek ve global.** Tek bir `INVOICE_VAT_RATE` var; farklı ürün/hizmet
   kalemleri farklı oranlara tabiyse bu model yetmez. Bugün tek abonelik kalemi
   olduğu için sorun değil, ama katalog genişlerse yeniden bakılmalı.
4. **`INVOICE_VAT_RATE`'in doğru değeri hâlâ bilinmiyor** — mali müşavirden gelecek
   ve depoda ilan edilen fiyatların KDV dahil mi hariç mi olduğunu söyleyen kayıt yok
   (`docs/DATA_MODEL.md:415`). Kod bunu uydurmuyor, doğru davranış bu; ama go-live'da
   yanlış bir oran girilirse kapı yeşil verir — kapı **oranın doğruluğunu** değil,
   **kullanılabilirliğini** kontrol eder. Bu ayrım bilinçli.

## 6. Sonraki adım

- Patron/operatör: go-live gününde `INVOICE_VAT_RATE`'i mali müşavirin verdiği oranla
  doldursun; `pnpm efatura:preflight` exit 0 vermeden Adım 3'e geçmesin.
- `TenantBillingIdentity` doldurma ekranı için ayrı kart açılmalı (yukarıda madde 2a) —
  o olmadan preflight'ın yeşili "fatura kesilecek" anlamına gelmiyor.
- `tsconfig.exen-probe.json` sahibi tarafından silinmeli.
