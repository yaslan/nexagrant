# ADR-0007 — İlkadım pilotu ücretsiz deneme; ücretli satış ve e-Fatura pilot sonrası

- **Durum:** **KABUL**, patron kararı
- **Tarih:** 2026-09-29
- **Bağlam:** ADR-0004 (kamu segmenti önceliği, "pilot ücretsiz yürür"), `docs/kamu/ILKADIM-PILOT.md` (90 günlük pilot planı), ROADMAP "Pilot kapıları" (e) e-Fatura / GİB entegratörü (TASK-MTRJSOWFH6B45)
- **Kayıt kartı:** TASK-MUMABULM5KZX2 · **Uygulama kartı:** TASK-MUMABL78X5JLX (be-fb)
- **Ek kararlar (patron, 29.09.2026):** madde 2 netleştirildi, madde 5 (süre dolumu) ve madde 6 (M6) eklendi — TASK-MUMI52B8UW21O. Kaynak: İNCELEME-17 K-1, K-2, K-3 (`docs/agent-results/TASK-MUMH7665CD7DQ-crw-fb.md` §3)
- **Hazırlayan:** CS-FB · **Karar veren:** patron

## Bağlam

ROADMAP "Pilot kapıları" tablosunda (e) e-Fatura / GİB entegratörü, İlkadım pilotu başlamadan kapanması gereken kapılar arasındaydı. Oysa ADR-0004 ve pilot planı zaten "pilot ücretsiz yürür" diyordu. Ücretsiz bir pilotta fatura kesilmez; e-Fatura yalnız ücretli satışın ön koşuludur. Bu yüzden (e) pilotu gereksiz yere bekletiyordu.

## Karar

1. İlkadım Belediyesi pilotu **ücretsiz deneme** olarak yürür: **90 gün**, **Ekip planı** yetkileri, **6 koltuk**.
2. Pilot, **Ekip planının bütün modüllerini** açar. Kodda pilot planı `public-team` (Belediye Ekip), temel planı `pro`: **M1, M2, M3, M4, M5, M6, M8** (`src/lib/billing/pilot.ts` `PILOT_PLAN_ID`, `src/lib/billing/catalog.ts` `PUBLIC_SECTOR_PLANS` ve `pro` satırı). Pilotun **öncelikli yüzeyleri** şunlardır: **davet koduyla kayıt** (B1), **Fon Hazırlık Karnesi** (`/fon-hazirlik`) ve **belediye çağrı radarı** (`/belediye-cagrilari`). Bu madde "pilot yalnız bu üç yüzeyi açar" diye okunmaz. Bu üç yüzey modül kapısına bağlı değildir (`moduleGate` / `assertModuleAccess` çağırmazlar), plan onları açıp kapatmaz. _(29.09 netleştirme, İNCELEME-17 K-3.)_
3. Pilot süresince ödeme alınmaz, fatura kesilmez, e-Fatura gerekmez.
4. **Ücretli satış** (yıllık TL kamu paketi) ve **e-Fatura / GİB entegrasyonu** pilot sonrasına kalır. e-Fatura işi (TASK-MTRJSOWFH6B45) pilot kapısı değildir; **ücretli satış kapısıdır**.
5. **Süre dolunca çalışma alanı SALT-OKUNUR olur (seçenek A).** _(29.09 ek karar, İNCELEME-17 K-1.)_
   - Veri silinmez. Kullanıcılar kayıtlarını görmeye devam eder.
   - Yazma **sunucuda** reddedilir. Arayüzde bir düğmeyi gizlemek yetmez.
   - Çalışma alanının üstünde turuncu (amber) bir bant çıkar: "Pilot süresi doldu … yeni kayıt ve düzenleme kapalı."
   - Satın alma kapalıdır. Pilot sürerken de süre dolduktan sonra da kiracı kendi başına ödeme yapamaz, plan yükseltemez.
   - Süreyi yalnız **platform yöneticisi**, yönetici panelinden (`/admin/billing/plans`) uzatır. Her uzatma **90 gündür**.
   - Reddedilen seçenekler: **B** süre dolunca otomatik uzatma; **C** süre dolunca ücretsiz Keşif planına düşme. C'de M2 konsept notları bile açılamaz; belediye kendi yazdığı notu okuyamaz.
6. **M6 (Evaluator Lens) pilotta açıktır.** Kamu kataloğunda Belediye Ekip (`public-team`) `pro` modüllerini açar; M6 bunların içindedir. _(29.09 ek karar, İNCELEME-17 K-2.)_
   - **Fark (not):** `docs/BUSINESS_MODEL.md` §5.1 tablosunda M6 Ekip'in değil İşletme planının modülüdür. §5.2'de Ekip için €99/ay'lık **eklentidir** ("M6 Ekip için eklenti"). Kamu paketi bu kuralı izlemez: Belediye Ekip M6'yı ek ücret olmadan içerir.
   - Sonuç: pilot sonrası Belediye Ekip teklifi M6'yı pakete dahil yazar. Bu fark yalnız kamu paketi içindir; özel sektör Ekip planı BUSINESS_MODEL'deki gibi kalır.

## Sonuçlar

- **ROADMAP:** (e) "Pilot kapıları" tablosundan çıkar, yeni "Ücretli satış kapısı" bölümüne taşınır. Pilotu kiracıya atama işi tabloya satır olarak eklenir (TASK-MUMABL78X5JLX).
- **Ürün:** Platform yöneticisi bir kiracıya 90 günlük Ekip planı pilotu atar. Süre dolunca kiracı salt-okunur olur (madde 5). Bu akışta ödeme ve e-Fatura adımı yoktur (TASK-MUMABL78X5JLX; `a6b22241`, `f4a5eecc`). Koddaki karşılıkları:
  - Salt-okunur: `requireTenantAction()` süresi dolmuş pilotta `PilotExpiredError` fırlatır; yazma route'ları `requireTenantApi({ write: true })` ile 403 `PILOT_EXPIRED` döner; `pipeline/actions.ts` ayrıca `assertTenantWritable` çağırır (`src/lib/tenant.ts`, `src/lib/billing/pilot.ts`).
  - Bant: `src/components/PilotBanner.tsx` (süren pilotta indigo, süresi dolmuşta amber; metin `messages/*.json` `pilot.expiredBody`).
  - Satın alma: `POST /api/billing/checkout` pilot kiracıya 403 `PILOT_CHECKOUT_CLOSED` döner.
  - Uzatma: `grantPilot(..., { extend: true })` bitişi, "şimdi" ile mevcut bitişten geç olanın 90 gün sonrasına taşır; audit `billing.pilot.extended`. Yönetici panelinde "Süreyi 90 gün uzat" kutusu (`admin/billing/plans/pilot-panel.tsx`).
  - **Açık iş (29.09):** İNCELEME-17 **B-1** — M11 ortak portalı (`/portal/partner/[token]`) süresi dolmuş pilot kiracısına hâlâ yazabiliyor. Madde 5'teki "yazma sunucuda reddedilir" kuralı bu yolda henüz uygulanmıyor. Düzeltme be-fb'de (TASK-MUMABL78X5JLX). İlk pilot en erken 27.12.2026'da biter.
- **Satış:** Pilot sonrası fiyat, `ILKADIM-PILOT.md` §6.2'deki patron onaylı kamu paketlerinden verilir. Ücretli geçiş tarihi, e-Fatura canlıya alınmadan verilmez.
- **Risk:** Pilot biterken e-Fatura hazır değilse belediye ücretli pakete geçemez. Salt-okunur dönem (madde 5) bu boşluğu kapatır; veri silinmez, gerekirse yönetici süreyi 90 gün uzatır. Öneri (karar değil): e-Fatura kartı pilotun ilk haftalarında başlatılsın.
- **Değişmeyen:** ADR-0004'teki segment kararı ve ADR-0006'daki giriş yöntemi aynen geçerlidir.
