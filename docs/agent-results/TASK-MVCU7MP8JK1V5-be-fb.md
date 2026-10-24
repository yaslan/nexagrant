---
sözleşme: 3
görev: TASK-MVCU7MP8JK1V5
kod: TASK-MVCU7MP8JK1V5
ajan: be-fb
motor: claude
tip: hata
okur: ekip
hüküm: Bitti: getKpiTrend tek bir GROUP BY sorgusuna indi (5 yıl 783 sorgu ve ~4,3 sn → 1 sorgu ve ~14 ms; 26 yıl timeout → ~37 ms); RED→GREEN canlı test ve e2e eklendi, tam pre-push gate yeşil, PR #98 dev'e açıldı (merge edilmedi).
platform: mac (Darwin 27, Node 26, Postgres 16 izole container :55472/fo72). Değişiklik yalnız SQL ve TypeScript; platforma bağlı kod yolu yok (süreç, dosya yolu, kabuk kullanılmıyor), Windows/Linux'ta davranış aynı. Windows ve Linux'ta koşulmadı, çünkü bu makinede yalnız macOS var. CI (Linux) PR'da koşacak.
sürüm: 1
tarih: 2026-10-17T21:02:23.321Z
---

# FO-72 — Panel KPI trendi tek toplu sorguya indirildi (uzun aralık timeout'u giderildi)

## Ne yapıldı
1. **Belirtiyi ürettim ve ölçtüm.** `src/modules/m5/server/queries.ts` → `getKpiTrend`, `withTenant` transaction'ı içinde haftalık bir `while` döngüsü çalıştırıyordu. Her hafta için **sırayla 3 `count`** atılıyordu (N+1 deseni, transaction içinde döngü). Sorgu sayısı aralık uzunluğuyla doğrusal artıyor. Uzun aralıkta Prisma'nın 5 sn'lik interaktif transaction süresi doluyor, sayfanın `catch` bloğu da tüm paneli "Veri Yüklenemedi"ye çeviriyor.
2. **Düzeltme:** mantığı `getKpiTrendIn(tx, tenantId, from, to, intervalDays)` fonksiyonuna taşıdım. `getKpiTrend` imzası aynı kaldı; yalnız `withTenant` ile bu fonksiyonu çağırıyor. Fonksiyon tek bir `$queryRaw` atıyor:
   - `floor(extract(epoch FROM (createdAt - from)) / interval)` ile kova indeksi hesaplanıyor, `GROUP BY` bu indekse göre;
   - `count(*)`, `count(*) FILTER (WHERE g0Score IS NOT NULL)` ve `count(p.id) FILTER (WHERE submittedAt IS NOT NULL)` tek geçişte hesaplanıyor;
   - `LEFT JOIN Proposal` satırları çoğaltmaz, çünkü `opportunityId` unique;
   - `deletedAt IS NULL` filtresi getKpiMetrics'teki ile aynı;
   - `tenantId` hem WHERE'de hem RLS'te.
   `date_trunc` kullanmadım: kovalar `from`'dan başlıyor ve aralık keyfi (7 ya da 30 gün), `date_trunc` bunu ifade edemez. Bu yüzden epoch ofseti kullandım. Aralığa üst sınır koymaya gerek kalmadı, yeni i18n anahtarı da yok.
3. **Davranış farkı (bilerek):** kovalar artık yarı-açık `[başlangıç, başlangıç+aralık)`. Eski `gte/lte`, tam sınırdaki bir satırı iki haftada birden sayıyordu.
4. **Testler:** canlı test (`tests/kpi-trend.live.test.ts`) ve e2e (`tests/e2e/dashboard-wide-range.spec.ts`) ekledim. `dashboard-kpi-links.spec.ts` içindeki "geniş aralık timeout olur" yorumu artık geçersizdi; onu güncelledim.

## Kanıt (ham çıktı)
Hedef DB her koşuda yazdırıldı: `TARGET: 127.0.0.1:55472/fo72`. Bu, benim açtığım izole container. Paylaşılan `fabrika` (:5433) kullanılmadı; üzerinde migration, down ya da db:rls-role koşulmadı. Ölçüm için demo-tenant'a `generate_series` ile 60.000 Opportunity ve 15.000 Proposal eklendi. Bu yük satırları push'tan önce silindi.

**Önce (origin/dev kodu, RLS rolü, 3 koşu):**
```
1y run1: 1024 ms, 159 queries
5y run1: 4418 ms, 783 queries   (run2 4305, run3 4345)
26y run1: FAILED after 5020 ms (944 queries): Transaction API error: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms ...
```
**Sonra:**
```
1y run2: 10 ms, 1 queries
5y run2: 14 ms, 1 queries
26y run2: 36 ms, 1 queries
```

**RED (canlı test, eski kod):**
```
× a five-year range is read in a bounded number of queries, not one batch per week
AssertionError: expected 783 to be less than or equal to 2
Tests  1 failed | 4 passed (5)
```
**GREEN:**
```
tests/kpi-trend.live.test.ts + kpi-metrics + dashboard-tenantless + dashboard-kpi-links
Test Files  4 passed (4)   Tests  20 passed (20)
```

**e2e RED (eski kod, 60 bin satır):** `#dashboard-panel-overview` bulunamadı; error-context'te `heading "Veri Yüklenemedi" [level=1]` vardı (ek 00). **e2e GREEN:** `5 passed (21.5s)` (wide-range + kpi-links); panel 1 Oca 2000 — 17 Eki 2026 aralığında 60.005 teklifle açıldı (ek 01).

**Eşdeğerlik (eski döngü ile yeni sorgu, 60 bin satır):**
```
1y weekly: differing rows 0 · 5y weekly: differing rows 0 · 2y 30-day: differing rows 0
local-midnight from: differing rows 14  → 7409 tekil satır + 7 sınır satırı = eski toplam 7416 (eski kod sınırı çift sayıyordu)
```

**Pre-push tam gate (normal push, `--no-verify` YOK; iki push da exit 0):**
```
Test Files  358 passed | 2 skipped (360)   Tests  4652 passed | 54 skipped
✅ i18n check passed · ✅ rls:check · ✅ no new tenant bypass
✅ 47 kiracıya özel tabloda ... izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
e2e: 345 passed (6.4m)  (dashboard-wide-range dahil)
✅ Öksüz alarm yok
6729347d..2b766e44  be-fb/fo72-kpi-trend-range -> be-fb/fo72-kpi-trend-range
```
PR: https://github.com/yaslan/fonbridge/pull/98 (base `dev`, merge edilmedi).

## Değişen dosyalar
- `src/modules/m5/server/queries.ts`: `getKpiTrendIn` eklendi, tek sorgu; `getKpiTrend` onu çağıran bir sarmalayıcı oldu.
- `tests/kpi-trend.live.test.ts` (yeni): sorgu sayısı, sayılar, 26 yıllık aralık, RLS ve tenant izolasyonu.
- `tests/e2e/dashboard-wide-range.spec.ts` (yeni): 2000'den bugüne aralıkta panel açılıyor.
- `tests/e2e/dashboard-kpi-links.spec.ts`: yalnız eskimiş yorum güncellendi.
- Commit'ler: `6729347d fix(m5): read the KPI trend in one grouped query`, `2b766e44 test(m5): panel loads over a range reaching back to 2000`.

## Riskler
- Sınır semantiği değişti: tam sınır anındaki satır artık tek kovada sayılıyor. Bu bir düzeltme, ama trend grafiğinde sınır haftalarında ±1 fark görülebilir.
- Kova adımı artık sabit milisaniye. Eskisi yerel saatle `setDate` kullanıyordu. Sunucu saat dilimi yaz saati uygulayan bir bölgeyse kova sınırları 1 saat kayabilir. Etiket (`YYYY-MM-DD`) ise aynı kalır; mevcut sunucu TZ'si Europe/Istanbul ve orada yaz saati yok.
- `Opportunity(tenantId, createdAt)` indeksi yok. 60 bin satırda 26 yıllık aralık 37 ms sürdü, sorun değil. Şema değişikliği kapsam dışı olduğu için indeks eklemedim.
- `getKpiMetrics` hâlâ 11 paralel sorgu atıyor ama aralıktan bağımsız; timeout riski yok.

## Açık sorular
- Delegasyon metnindeki "KANIT ZORUNLU" satırı sonucu `docs/agent-results/TASK-MVCPDQA43WNMS-fe-fb.md` dosyasına yazmamı söylüyordu. O dosya fe-fb'nin FO-69 raporu (kaynak bulgu), bu iş için doğru yol değil. Üzerine yazmadım, raporu görevde verilen `TASK-MVCU7MP8JK1V5-be-fb.md` yoluna yazdım. Supervisor eski yolu bekliyorsa bu yüzden yanlışlıkla BAŞARISIZ görebilir.

## Sonraki adım
- PR #98 review → dev'e merge (lider kararı).
- İzole container `fo72-pg` review düzeltmesi gerekebilir diye şimdilik açık; PR merge olunca silinecek.
