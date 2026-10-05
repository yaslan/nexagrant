# TASK-MTSWLWDONWA3W — Yabancı para faturada TCMB kuru alanı (FAZ 1: ölçüm + ADR)

**Ajan:** blockzincir-pm · **Tarih:** 2026-09-08 · **Tip:** spike + ADR
**Sonuç:** Kod yazılmadı (kart yasağına uyuldu). Karar: `docs/adr/ADR-0002-foreign-currency-invoice-fx.md`

## 1. Ne yapıldı

1. Liderin TASK-MTRJSOWFH6B45'te ölçtüğü "kur alanı yok" bulgusu bugünkü koda
   karşı yeniden ölçüldü (bayat değil, hâlâ doğru).
2. Bu ortamdan erişilebilen DB'de para birimi/ülke dağılımı ölçüldü — **bu bir
   dev/seed DB, üretim değil**; bu ayrım raporda ve ADR'de açıkça işaretlendi.
3. UBL-TR/VUK'un yabancı para birimi gereksinimleri web araştırmasıyla
   kaynaklandı (birincil GİB PDF/XSD'sine değil, ikincil entegratör/mali
   müşavir kaynaklarına dayanıyor — aşağıda işaretlendi).
4. `docs/adr/ADR-0002-foreign-currency-invoice-fx.md` yazıldı: 3 seçenek,
   biri (b) gerekçeyle önerildi, karar lidere/patrona bırakıldı.
5. TCMB entegrasyonu için netleştirilmesi gereken muhasebe soruları listelendi
   (cevaplanmadı — bunlar benim kararım değil).
6. Faz 2 DoD taslağı yazıldı (§6).

## 2. Kanıt

### 2.1 Kod ölçümü (bugünkü HEAD, yeniden koşuldu)

```
$ grep -rniE "exchangeRate|PricingExchangeRate|TCMB|TaxExchangeRate" src prisma docs
(çıktı yok)
```

```
src/lib/efatura.ts:36:  currency: 'TRY' | 'EUR' | 'USD';
...
src/lib/efatura.ts:213:  <cbc:DocumentCurrencyCode>${invoice.currency}</cbc:DocumentCurrencyCode>
```

`prisma/schema.prisma:358-390` — `Invoice` modeli:
```
model Invoice {
  ...
  currency      String   @default("TRY")
  ...
  lines         Json                // InvoiceLine[]; unit prices are minor units
  ...
}
```
Kur, TL karşılığı, kur tarihi, kur kaynağı — hiçbiri yok. Lider tespiti
**bayat değil**, hâlâ doğru.

Ek gözlem (kartta istenmedi ama yol üstünde görüldü — düzeltilmedi, adıyla
kaydediliyor): `src/lib/billing/invoice-writer.ts` (TASK-MTSWL8ADKZKDM,
şu an geliştiriliyor — bugün 19:58'de değişti, henüz commit edilmemiş)
`currency`'yi ödeme olayından (`payment.currency`) olduğu gibi yazıyor,
kur/TL karşılığı hesaplamıyor. Yani **bu kartın kapsamı, o kartın bitişiyle
birlikte devreye girecek** — sıralama doğru (kartın kendi notu da bunu
söylüyor).

### 2.2 Para birimi/ülke dağılımı — bu ortamdaki DB

**Önemli sınırlama:** Bu ortamdan üretim veritabanına erişimim yok;
`DATABASE_URL` bu oturumda yerel/dev bağlantıya işaret ediyor
(`src/lib/db.ts:6` varsayılanı: `postgresql://fabrika:fabrika@localhost...`).
Aşağıdaki sayılar `pnpm db:seed`'in yazdığı demo veridir (CLAUDE.md:
"planlar, modül kataloğu, demo kiracı"), **gerçek müşteri dağılımı değildir.**
Gerçek dağılım prod DB erişimi olan biri tarafından ayrıca ölçülmeli —
bkz. §5 Açık sorular.

Sorgu (`src/lib/db.ts`'teki `prisma` singleton'ı üzerinden, Prisma
`groupBy`; script sonuç sonrası silindi, repoya commitlenmedi):

```
=== Invoice.currency ===
[]                                              // hiç fatura yok (invoice-writer henüz yazmıyor)
=== Plan.currency (katalog satırları) ===
[ { currency: 'USD', count: 4 } ]               // basic/pro/ultra/free — hepsi USD
=== PlanVersion.currency ===
[ { currency: 'USD', count: 4 } ]
=== Subscription.lockedCurrency ===
[ { lockedCurrency: null, count: 1 } ]          // kilitli fiyat yok
=== Subscription toplam === 1
=== Abonelik başına etkin para birimi (plan/planVersion üzerinden) ===
Map { 'USD' => 1 }
=== Tenant.country dağılımı ===
[ { country: 'BE', count: 1 }, { country: 'TR', count: 4 } ]
=== Tenant toplam === 5
```

Bununla birlikte `docs/BILLING.md` §4.2 (açık karar `TRY-FX-1`) bugünkü
tarihle (2026-09-07) şunu zaten belgeliyor: **her `Subscription.provider`
`'stripe'`**, iyzico (TL tahsilat) henüz açılmadı — yani TL tahsilat riski o
belgede "bugün teorik" diye işaretli. Bu, benim ölçtüğüm dev-DB sonucuyla
tutarlı: **canlıya çıkacak ilk fatura akışının tamamı USD üzerinden
olacak** — "USD müşteri var mı yok mu" sorusu değil, "USD tek para birimi
mi" sorusu; cevap evet görünüyor (prod'da doğrulanmalı).

### 2.3 UBL-TR / VUK araştırması (kaynaklı)

**Doğrulandı** (birden fazla bağımsız kaynak birbirini teyit ediyor —
[Faturaport](https://faturaport.com/blog/e-fatura/dovizli-e-fatura-duzenlerken-tl-karsiligi-gostermek-zorunlu-mu),
web araması sonuçları):

- **Yasal dayanak:** VUK madde 215 — "Belgeler, Türk parası karşılığı
  gösterilmek şartıyla, yabancı para biriminde de düzenlenebilir."
- **Zorunluluk:** 385 Sıra No.lu VUK Genel Tebliği, **yurt içi işlemlerde**
  TL karşılığının faturada gösterilmesini zorunlu kılıyor. İhracat
  faturalarında bu zorunluluk yok.
- **Kur:** VUK madde 280 uygulamasına göre **faturanın düzenlendiği
  tarihteki TCMB Döviz ALIŞ kuru** esas alınır — ödeme/tahsilat tarihindeki
  kur veya serbest piyasa/banka kuru DEĞİL.
- **KDV:** KDV matrahı TL karşılığı üzerinden hesaplanır.
- **Yaptırım:** TL karşılığı yoksa VUK 352. madde II-7 bendi uyarınca
  **ikinci derece usulsüzlük cezası.**

**Doğrulanamadı / ikincil kaynağa dayanıyor** — GİB'in birincil UBL-TR
1.2.1 XSD/kılavuz PDF'ine bu oturumda ulaşmadım, yalnız entegratör/danışmanlık
özetlerine ulaştım:
- `PricingExchangeRate` (belge seviyesinde, 0..1 opsiyonel) — satır fiyatları
  `DocumentCurrencyCode`'dan farklı bir para biriminde gösterildiğinde
  kullanılıyor.
- `TaxExchangeRate` (`cac:TaxTotal` içinde) — vergi tutarının TL karşılığı
  için.
- İkisi de `ExchangeRate` bileşik tipini kullanıyor: zorunlu
  `SourceCurrencyCode`, `TargetCurrencyCode`, `CalculationRate`; opsiyonel
  `Date`.
- Bu alan adlarını/yapıyı **P2'de kod yazmadan önce GİB'in resmi UBL-TR
  1.2.1 kılavuzundan (veya kullanılan e-fatura entegratörünün — kartta adı
  geçmiyor, hangisi kullanılacaksa onun — şema dokümanından) birebir teyit
  etmek gerekiyor.** Ben bunu "doğrulanamadı" olarak işaretliyorum, P2'yi
  yürütecek kişi ilk adım olarak teyit etmeli.

## 3. Değişen dosyalar

- `docs/adr/ADR-0002-foreign-currency-invoice-fx.md` (yeni)
- `docs/agent-results/TASK-MTSWLWDONWA3W-blockzincir-pm.md` (bu dosya, yeni)

Yasak listesindeki hiçbir dosyaya dokunulmadı. `git status --porcelain`
çıktısında görünen `prisma/schema.prisma`, `src/lib/iyzico.ts`,
`src/lib/billing/subscription-sync.ts` vb. değişiklikler **benim değil** —
bu oturumun başında zaten çalışan başka bir ajanın (muhtemelen
TASK-MTSWL8ADKZKDM / geliştirici) sürmekte olan işi; onlara dokunmadım.
Ölçüm sırasında `.tmp-pm-check/` altında bir sorgu betiği oluşturuldu, sonuç
alındıktan sonra silindi (repoda iz yok).

## 4. TCMB girdi soruları — muhasebe kararı, netleştirilmesi gerekiyor

Bunlar benim vereceğim kararlar değil; P2'yi açacak kişi bir mali
müşavire/patrona sormalı:

1. **Kur tipi:** Araştırma "döviz ALIŞ kuru" gösteriyor (VUK 280) — TCMB'nin
   hangi seri/yayınına karşılık geliyor bu net teyit edilmeli: "Gösterge
   Niteliğindeki TCMB Kurları" mı, "Bankalararası Döviz Alım Satım Kurları"
   mı? İkisi farklı sayı verebilir.
2. **Tarih:** Fatura düzenleme tarihi mi (VUK 280'in işaret ettiği), yoksa
   hizmet ifa/dönem başlangıç tarihi mi? Fabrika aylık SaaS aboneliği olduğu
   için genelde çakışabilir ama netleşmeli.
3. **Hafta sonu/resmi tatil:** TCMB o günler kur yayınlamıyor — fatura o gün
   kesilirse hangi günün kuru kullanılacak (bir önceki iş günü mü)?
4. **Erişim şekli:** Günde kaç kez çekilecek, nasıl cache'lenecek, TCMB
   erişilemezse (bakım/kesinti) fatura kesme akışı ne yapacak
   (`SystemAlert` üretip fatura kesmeyi durdurmak mı, son bilinen kuru mu
   kullanmak — CLAUDE.md kural 6 "işi kırma" ile çelişebilir, netleşmeli)?

## 5. Açık sorular

- **Üretimdeki gerçek para birimi/ülke dağılımı** ölçülmedi (bu ortamdan
  erişim yok). Karar (b) mi (c) mi ağırlıklı olmalı, bu ölçülmeden netleşmez.
  Kim ölçecek: prod DB erişimi olan biri (lider/patron) `Tenant.country` +
  `Subscription` join'i ile ölçmeli.
- **UBL-TR alan adları** ikincil kaynaktan; GİB'in birincil kılavuzundan
  teyit gerekiyor.
- **Kullanılan e-fatura entegratörü** kartta/kod içinde belirtilmemiş
  (`docs/EFATURA_SETUP.md` kontrol edilebilir) — entegratöre özgü şema kısıtı
  olabilir, P2'de kontrol edilmeli.
- Seçenek (c) için "gerçek yurt dışı mukimlik" nasıl doğrulanacak
  (`tenant.country` kendi beyanı mı, VKN/TCKN + adres mi) netleşmedi.

## 6. Faz 2 DoD taslağı (karar (b) ve/veya (c) çıkarsa)

**Dosyalar:**
- `prisma/schema.prisma` — `Invoice`'a: `exchangeRate Decimal` (veya minor-unit
  int, `src/lib/money.ts` kuralına uyarak), `tlEquivalentMinor Int?`,
  `exchangeRateDate DateTime?`, `exchangeRateSource String?`
- `prisma/migrations/<isim>.sql` + `.down.sql`
- yeni: `src/lib/billing/tcmb-rate.ts` (ya da benzeri) — TCMB kur istemcisi;
  ham yanıt `RawFetch`'e yazılmalı (CLAUDE.md kural 6)
- `src/lib/efatura.ts` — `EfaturaDocument` tipine kur alanları,
  `PricingExchangeRate`/`TaxExchangeRate` XML blokları (GİB kılavuzundan
  teyit edilmiş adlarla)
- `src/lib/billing/invoice-writer.ts` — `currency !== 'TRY'` olduğunda kur
  hesaplama + TL karşılığı yazma adımı
- `docs/BILLING.md`, `docs/DATA_MODEL.md`, `docs/EFATURA_SETUP.md` güncellemesi

**Testler:**
- Kur hesaplama birim testi (yuvarlama kuralı dahil, `money.ts` ile tutarlı)
- XML snapshot testi — `PricingExchangeRate`/`TaxExchangeRate` bloklarının
  doğru üretildiği
- Mukimlik/segment ayrımı testi (yurt içi USD → kur+TL karşılığı; gerçek
  yurt dışı → `ISTISNA`, kur alanı yok)
- En az 1 e2e mutlu yol: yurt içi USD abonelik faturası kesildiğinde TL
  karşılığı + kur + kur tarihi dolu

**Kapı:** `pnpm gate` yeşil; migration sonrası `pnpm rls:verify` tekrar
koşulmalı (yeni alanlar `tenantId` kapsamını değiştirmiyor ama disiplin
gereği).

## Sonraki adım

Lider/patron ADR-0002'yi okuyup (b)/(c) kombinasyonunu ya da farklı bir
seçeneği onaylamalı; TASK-MTSWL8ADKZKDM (Invoice yazma yolu) bittikten sonra
P2 kartı bu ADR'ye referansla açılabilir.
