# TASK-MTSWLWDONWA3W — Yabancı para faturada TCMB kuru (QA yeniden doğrulama)

**Ajan:** blok-zincir-denet-i (QA-EN) · **Tarih:** 2026-09-08 · **Tip:** doğrulama
**Önceki turlar:** `-blockzincir-pm.md` / `-blockzincir-pm-2.md` (ölçüm + ADR-0002) ·
`-blok-zincir-denet-i.md` (QA turu: F-1 düzeltildi, kapı eklendi)
**Doğrulanan commit:** `311c902` — *fix(billing): a foreign-currency invoice must state
its own currency, and may not be filed without its TL figures*

## Karar

**Düzeltmeler ayakta, regresyon yok.** Kartın literal talebi (şemaya TCMB kuru +
TL karşılığı alanı) **bilinçli olarak ertelendi** ve ADR-0002'de kayıt altında;
sessiz bir boşluk değil. USD/EUR faturası bugün **düzenlenebilir ama GİB'e
gönderilemez** — bu, mali açıdan doğru olan güvenli taraf.

## 1. Ne yapıldı

Önceki turdaki üç düzeltmeyi **gerçek üretim yolundan geçirip çıktıya bakarak**
yeniden doğruladım (grep ile değil).

```
--- 1. tutar basımı ---
   USD 99 -> $99,00 | TRY 99 -> ₺99,00
--- 2. gönderim kapısı ---
   block: USD faturasi TCMB kuru ve TL karsiligi tasimadigi icin GIB'e gonderilemez
          (VUK 215 / 385 Sira No.lu Genel Teblig). Karar bekliyor: docs/adr/ADR-0002-...
   fileThrough outcome: {"status":"blocked","code":"FOREIGN_CURRENCY_NO_TL_EQUIVALENT",...}
--- 3. üretilen UBL-TR XML ---
   <cbc:Note>ÖRNEK BELGE — GİB'e gönderilmemiştir, mali mühür taşımaz ve mali değeri yoktur.</cbc:Note>
   <cbc:DocumentCurrencyCode>USD</cbc:DocumentCurrencyCode>
   <cbc:TaxExclusiveAmount currencyID="USD">99.00</cbc:TaxExclusiveAmount>
   <cbc:PayableAmount currencyID="USD">118.80</cbc:PayableAmount>
--- ExchangeRate elementi? --- NO
```

| Kontrol | Sonuç |
|---|---|
| F-1 (USD tutarın `₺` ile basılması) düzeldi mi | **evet** — `$99,00`; TRY çıktısı birebir aynı (`₺99,00`), regresyon yok |
| Gönderim kapısı gerçekten uygulanıyor mu, yoksa tanımlı ama çağrılmıyor mu | **uygulanıyor** — `fileThrough` (`efatura-integrator.ts:219`) adaptöre ulaşmadan `blocked` dönüyor |
| Kapıyı atlayan ikinci bir gönderim yolu var mı | **yok** — `fileInvoice` de `fileThrough`'a düşüyor (`:202`); GİB'e giden başka çağrı yok |
| Sandbox adaptörü kötüye kullanılabilir mi | hayır — `EFATURA_INTEGRATOR_TEST_MODE` olmadan `createSandboxAdapter` fırlatıyor |
| Belge üretimi (müşteri makbuzu) etkilendi mi | hayır — export çalışıyor, `ÖRNEK BELGE` damgası duruyor |
| Şemada kur/TL alanı | **hâlâ yok** — bilinçli, ADR-0002 "Öneri (karar bekliyor)" |
| `tsc --noEmit` | temiz |
| Tüm paket | **1370 geçti**, 8 atlandı |

## 2. Bulgular

Bu turda **yeni bulgu yok**. Önceki turun tablosu geçerli: F-1 ve F-3 kapalı,
F-2 (kur/TL alanı) ADR-0002 kararına bağlı olarak **açık ama bloke edilmiş**.

Kalan tek uyarı, kusur değil kapsam kararı: **USD/EUR faturaları bugün hiçbir
şekilde GİB'e gönderilemiyor.** Canlı fiyat kataloğu USD olduğuna göre
(`docs/BILLING.md` §1), ADR-0002 karara bağlanana kadar hiçbir gerçek fatura
mali olarak dosyalanamaz. Bugün için zararsız — hiçbir `Invoice` satırı
dosyalanmadı, `gibEnvelopeId` her satırda NULL — ama ilk gerçek faturadan önce
kararın çıkması gerekiyor.

## 3. Değişen dosyalar

Yok — doğrulama turu. Eklenen tek dosya bu rapor.
Geçici probe (`.qa-usd.mts`) silindi.

## 4. Riskler

- ADR-0002 "Öneri" durumunda bekliyor; karar çıkmazsa USD faturalama mali olarak
  kapalı kalır.
- `InvoiceLineItem.unitPriceTRY` / `subtotalTRY` **isimleri hâlâ yanıltıcı**
  (içeriği artık doğru para biriminde, ama ad `TRY` diyor). Kozmetik, ama kur
  alanı eklenirken kafa karıştırır — ADR-0002 Faz 2'de birlikte düzeltilmeli.

## 5. Açık sorular

1. ADR-0002 kararı ne zaman alınacak? (Faz 2 `TASK-MTSWL8ADKZKDM`'ye bağlıydı; o kart bitti.)
2. İhracat (ISTISNA) faturası kuraldan muaf tutulacak mı — kapı ona göre gevşetilmeli mi?

## 6. Sonraki adım

1. **Lider/patron:** ADR-0002'yi karara bağla (kart bu noktada bekliyor).
2. **PM/DSE:** karar sonrası Faz 2 — `Invoice`'a kur + TL karşılığı alanları,
   `unitPriceTRY`/`subtotalTRY` yeniden adlandırma, kapının tek noktadan gevşetilmesi.
