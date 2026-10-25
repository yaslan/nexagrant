# FO-73 · TASK-MVCW3ANV1JU6Y — PR #133 QA incelemesi ve test doğrulaması

**HÜKÜM: ONAY** (bloke eden bulgu yok; aşağıda 3 düşük öncelikli not var, merge'i engellemez)

- **Ajan:** qa-bulsam
- **Tip:** QA / inceleme + test doğrulaması
- **PR:** #133 `be-gnd/fo73-trend-bucket-cap` → `dev` · başlık: `fix(m5): cap dashboard trend at 120 buckets on long ranges (FO-73)`
- **İncelenen commit (PR head):** `e52c8f1befc1ca83c110fc243f43f258546d0b61`
- **Kapsam:** Kod değiştirilmedi, merge edilmedi. Yalnız bu rapor dosyası commit'lenir.
- **Platform beyanı:** Doğrulama **macOS (darwin, Darwin 27.0.0)** üzerinde yapıldı. Dokunulan kod (`range.ts`, `queries.ts`) saf tarih/sayı aritmetiği ve Postgres sorgusu; platforma bağlı yol, süreç, kabuk veya dosya yolu içermiyor. Windows/Linux için ayrı koşu yapılmadı: **koşulamadı (kapsam dışı, kod platforma bağlı değil)**.

## Kart kabul kriteri ve durum

| Kabul kriteri (kart) | Durum | Kanıt |
|---|---|---|
| Kova sayısı sabit üst sınırı (≤ 120) geçmiyor | Sağlandı | `trendIntervalDays` formülü; birim testi "never exceeds the cap…" ve canlı DB testi `year-1000 … capped at 120` geçti |
| Birim testi var | Sağlandı | `tests/modules/m5-dashboard-range.test.ts` — 19/19 geçti |

Not: Kart "ör. 2 yıldan uzunsa aylık" diyordu; uygulama ay yerine 7'nin katı (haftalık → 21 gün → …) kullanıyor. Kartta "ör." olduğundan ve kabul kriteri yalnız üst sınır olduğundan bu bir sapma sayılmadı.

## Koşulan testler (süre sınırlı, gerçek çıktı)

Worktree: `/tmp/fo73-wt` (PR head, `--detach`), `node_modules` ana repodan sembolik bağlantı.

1. `perl -e 'alarm 900;exec @ARGV' pnpm exec vitest run tests/modules/m5-dashboard-range.test.ts`
   ```
   Test Files  1 passed (1)
        Tests  19 passed (19)
   ```
2. `.env` ortamıyla (`DATABASE_URL`, `DATABASE_URL_RLS_TEST` — yerel DB `127.0.0.1:5433`) `pnpm exec vitest run tests/kpi-trend.live.test.ts --reporter=verbose`
   ```
   ✓ a five-year range is read in a bounded number of queries, not one batch per bucket
   ✓ the five-year numbers: per-bucket offers and hit rate, archived and out-of-range rows left out
   ✓ an opportunity created exactly on a bucket boundary counts once, in the later bucket
   ✓ the last bucket stops at `to`: the trend sums to the "total offers" card
   ✓ a 26-year range completes inside the default 5 s transaction timeout
   ✓ a year-1000 `from` is capped at 120 buckets and still counts every row in range
   ✓ bound to tenant B, a read for tenant A's id returns only zeros: RLS, not only the WHERE
   ✓ tenant B sees its own opportunity, not A's
   Test Files  1 passed (1)
        Tests  8 passed (8)
   ```
   Not: `.env.test` tek başına `DATABASE_URL_RLS_TEST` içermediği için ilk koşuda bu 8 test **sessizce atlandı** (`19 passed | 8 skipped`). Doğru ortamla yeniden koşulup 8/8 geçti.
3. Geçici sınır probu (`tests/zz-fo73-bound.test.ts`, koşulduktan sonra silindi): 120 / 121 / 240 / 241 haftalık aralıklar ve `1000-01-01 → 2026-09-06` aralığı için kova sayısı `≤ 120` doğrulandı.

**Koşulamayan:** `tests/e2e/fo73-trend-bucket-cap.spec.ts` (Playwright). Dev sunucusu + oturum açma gerektirdiği için bu turda koşulmadı. Bu nedenle "sayfa payload'u ≤120 ve grafik çiziliyor" iddiası **kanıtlanmış değil**; yalnız kod okunarak incelendi.

## Kod incelemesi (sınır durumları)

- **Tam 120 kova:** `span = 119 hafta` → adım 7 gün, kova = 120 ✔. `span = 120 hafta` → kova 121 olurdu, adım 14 güne çıkıyor ✔.
- **121+ kova:** adım, `floor(span / (120·7 gün)) + 1` katı 7 gün; formül `buckets ≤ 120` garantiliyor (`span/(adım) < 120` ispatlandı) ✔.
- **2 yıldan uzun aralık:** 2 yıl ≈ 104 hafta → haftalık kalıyor; daha uzunda adım otomatik büyüyor ✔.
- **1000-01-01:** ~53.000 haftalık kova yerine ≤120 kova; sorgu sayısı sınırlı, testte toplam 5 satır korunuyor ✔.
- **Toplamların korunumu:** Kovalar `from + k·adım` ile yarı-açık aralıklar; son kova `to`'da kesiliyor (`createdAt <= to` ile aynı). Canlı testte trend toplamı = "total offers" kartı ✔.
- **Yaz saati geçişi:** Hesap tamamen UTC milisaniye (`Date.getTime()`) üzerinden; sorgu da aynı milisaniye aritmetiğini kullanıyor. Yerel saat dilimi kovaları etkilemiyor ✔. (Test `NOW` yerel saatle kurulsa da kova sayısı yalnız fark üzerinden hesaplanıyor.)
- **Ay sonları:** Kovalar takvim ayına değil sabit gün katlarına hizalı. Kova üyeliği milisaniyeye dayalı olduğundan çift sayım yok; ancak 21 günlük kovalar ay sınırlarına denk gelmez. Ürün kararı olarak not düşüldü (aşağıda N-1).
- **Sabit rakam gömülmesi:** `MAX_TREND_BUCKETS = 120` bir **kapasite sınırı**, istatistik değil; kullanıcıya gösterilen bir oran/sayı değil. Canlı testteki `3`, `87`, `5` gibi değerler test fikstürünün beklenen sonucu, ürün kodunda gömülü değil ✔.
- **Geriye dönük uyum:** Varsayılan `intervalDays = 7` ve `span <= 0` dalı eski davranışı koruyor; `getKpiTrendIn` imzası değişmedi. Çağıran `dashboard/page.tsx:84` değişmeden çalışır.
- **UI:** `Dashboard.tsx` ve `KpiCard.tsx` içinde "haftalık" yazan bir metin yok; kova adımı değişikliği görünür bir metni bozmuyor.

## Bulgular

Bloke eden bulgu yok. Düşük öncelikli notlar:

- **N-1 (düşük, ürün kararı):** Uzun aralıklarda kova adımı 7'nin katları (21, 28, …) olarak büyüyor; kovalar takvim ayı/çeyrek sınırlarına hizalanmıyor. Kart "aylık" önerdiği için bu bir tercih farkı. Doğruluk etkilemiyor; grafik okunurluğunu etkileyebilir. Öneri: tercih olarak PR açıklamasında belirtilsin.
- **N-2 (düşük, kanıt boşluğu):** E2E spec koşulmadı (yukarıda). Merge öncesi dev/CI'da koşması önerilir. Spec ayrıca yalnız `offers` metriğini sayıyor; `success_rate` için 120 sınırı spec'te doğrulanmıyor (aynı sınır iki metrik için ortak olduğundan risk düşük).
- **N-3 (düşük, doküman):** `queries.ts` içindeki JSDoc yeniden sarılırken cümle ortadan kırılmış ("…`MAX_TREND_BUCKETS` points; the last one starts on or / before `to`…"). Anlamı bozmuyor; biçim düzeltmesi.

## Ortam notları (yan etkiler, dürüst bildirim)

- Worktree içinde `pnpm exec` çalıştırılırken `pnpm` sembolik bağlı `node_modules`'a `@tiptap/extension-image` ve `@tiptap/extension-list` (3.31.0) eklemiş olabilir ("added 1"). Ana repodaki `node_modules` bu nedenle değişmiş olabilir.
- Worktree (`/tmp/fo73-wt`) koşu sonrası kaldırıldı; `/tmp/pr133.diff` geçici dosyası silinecek.

## Sonraki adım

1. Merge öncesi: E2E spec'i (`tests/e2e/fo73-trend-bucket-cap.spec.ts`) dev sunucusunda koş ve sonucu PR'a ekle (N-2).
2. N-1 ve N-3 için geliştiriciye not; bloke etmez.
3. Hüküm: **ONAY**.
