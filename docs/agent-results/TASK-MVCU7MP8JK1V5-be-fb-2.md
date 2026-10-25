---
sözleşme: 3
görev: TASK-MVCU7MP8JK1V5
kod: TASK-MVCU7MP8JK1V5
ajan: be-fb
motor: claude
tip: hata
okur: ekip
hüküm: Bitti: son kova artık `createdAt <= to` ile kesiliyor (sorgu sayısı 1). İki yeni canlı test önce KIRMIZI, sonra YEŞİL gösterildi. Tam pre-push gate geçti ve PR #98 head bbb112c8 MERGEABLE; merge yapılmadı.
platform: mac (Darwin 27, Postgres 16 izole container fo72-pg :55472). Değişiklik yalnız SQL ve TypeScript, platforma bağlı kod yolu yok; Windows/Linux'ta davranış aynı. Windows ve Linux'ta koşulmadı, çünkü bu makinede yalnız macOS var. CI (Linux) PR'da koşacak.
sürüm: 1
tarih: 2026-10-17T21:30:21.240Z
---

# FO-72 #fix — PR #98 inceleme Ö-2/Ö-3: son trend kovası aralık içinde

## Ne yapıldı
1. **Ö-2** (`src/modules/m5/server/queries.ts`): getKpiTrendIn WHERE'inde `AND o."createdAt" < ${end}` satırı `AND o."createdAt" <= ${pgTimestamp(to)}::timestamp` oldu. Bu, getKpiMetrics "Toplam teklif" kartının `createdAt: { lte: to }` karşılaştırmasıyla birebir aynı (ikisi de timestamp(3), ms dahil). Son kovanın başı ≤ `to` olduğu için `end > to`; yani eski `< end` sınırı yeni koşulun içinde kalıyor. Bu yüzden `end` değişkeni silindi. Doc yorumu güncellendi. Sorgu sayısı 1: "bounded number of queries" testi geçiyor, sorgu hâlâ tek `$queryRaw`.
2. **getKpiMetricsIn ayrımı:** `getKpiMetrics` artık yalnız `withTenant(tenantId, tx => getKpiMetricsIn(tx, …))` çağırıyor. Neden: global `prisma` `process.env.DATABASE_URL`'i okuyor, yoksa `localhost:5432/fabrika`'ya düşüyor. Test oradan çağırsaydı gate'te yanlış DB'ye gidebilirdi. Bunun yerine RLS istemcisiyle ve trendle aynı transaction'da çağrılıyor. Gövde yalnız bir seviye geri çekildi. Diff'i `git diff -w` ile okuyun: 12+/2-.
3. **Ö-3** (`tests/kpi-trend.live.test.ts`): fikstüre iki satır eklendi: `boundary` (2021-01-11T00:00:00Z) ve `after-range` (2026-01-02, `to`'dan sonra ama son kovanın 7 günü içinde). Eklenen testler:
   - (a) `an opportunity created exactly on a bucket boundary counts once, in the later bucket`: 2021-01-04 kovasında 2, 2021-01-11 kovasında 1 bekleniyor.
   - (b) `the last bucket stops at \`to\`: the trend sums to the "total offers" card`: son kova (2025-12-29) 0 olmalı ve trend toplamı `getKpiMetricsIn(...).totalOffers` ile eşit olmalı (4).
   - Var olan toplamlar fikstüre göre güncellendi: 5 yıl 3→4, 26 yıl 4→5.

## Kanıt (ham çıktı)
DB hedefi (her koşuda yazdırıldı):
```
DATABASE_URL -> 127.0.0.1:55472/fo72
DATABASE_URL_RLS_TEST -> 127.0.0.1:55472/fo72
DATABASE_URL_MIGRATE -> 127.0.0.1:55472/fo72
DIRECT_URL -> 127.0.0.1:55472/fo72
```
Shell'de `DATABASE_URL` başta boştu (`echo` çıktısı `DATABASE_URL=`). Paylaşılan :5433'te hiçbir şey koşulmadı. Gate'in `db:rls-role` adımı da yalnız izole fo72 DB'de koştu.

**KIRMIZI (b): Ö-2 satırı olmadan, eski `< end` sınırıyla:**
```
× the five-year numbers ...            AssertionError: expected 5 to be 4
× the last bucket stops at `to` ...    - "value": 0,  + "value": 1,   (2025-12-29 kovası)
× a 26-year range ...                  AssertionError: expected 6 to be 5
Tests  3 failed | 4 passed (7)
```
**KIRMIZI (a): kova sınırı geçici bozuldu (`floor(x)` → `ceil(x)-1`, sınırdaki satır önceki kovaya kayar):**
```
× the five-year numbers ...                                   (2021-01-04 offers 3 ≠ 2)
× an opportunity created exactly on a bucket boundary ...     AssertionError: expected 3 to be 2
Tests  2 failed | 5 passed (7)
```
**YEŞİL (kod geri yüklendi):**
```
tests/kpi-trend.live.test.ts               Tests  7 passed (7)
+ kpi-metrics + dashboard-tenantless + dashboard-kpi-links   Test Files 4 passed (4)  Tests 22 passed (22)
pnpm typecheck → exit 0 · eslint (2 dosya) → exit 0
```
**Pre-push tam gate (normal `git push`, `--no-verify` YOK):**
```
Test Files  358 passed | 2 skipped (360)   Tests  4654 passed | 54 skipped (4708)
✅ i18n check passed · ✅ no new tenant bypass
✅ 47 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
e2e: 345 passed | 8 skipped (6.5m)
✅ Öksüz alarm yok
2b766e44..bbb112c8  be-fb/fo72-kpi-trend-range -> be-fb/fo72-kpi-trend-range
```
**İlk push denemesi (dürüstlük notu):** exit 1 verdi: `6 failed | 339 passed`. Düşenler auth.spec (Google butonu yok), expert-prereg ve team-members-ui (mail gönderilmedi). Neden: worktree'de `.env` yok ve ana `.env` aynı kabukta yüklenmemişti, bu yüzden AUTH_GOOGLE_ID boş kaldı. Hata koddan değil ortamdan geliyordu. `set -a; . FONBRIDGE/.env; set +a` ve ardından izole DB override'ıyla tekrar push edildi ve gate yeşil döndü.

**PR durumu:**
```
gh pr view 98 --json headRefOid,mergeable
{"headRefOid":"bbb112c87586646f50b716d90dd46fc790a7bf19","mergeable":"MERGEABLE"}
```
Merge yapılmadı.

## Değişen dosyalar
- `src/modules/m5/server/queries.ts`: Ö-2 sınırı, `end` kaldırıldı, `getKpiMetricsIn` ayrıldı.
- `tests/kpi-trend.live.test.ts`: iki fikstür satırı, iki test, güncellenen toplamlar.
- Commit: `bbb112c8 fix(m5): keep the last trend bucket inside the range`

## Riskler
- `getKpiMetrics` gövdesinin girintisi değişti (whitespace diff ~300 satır). Mantık aynı; `git diff -w` 12+/2- gösteriyor.
- Davranış değişikliği bilerek yapıldı: `to`'dan sonraki ama son kovanın içinde kalan satırlar artık trendde sayılmıyor. Trend toplamı artık kartla eşit.

## Açık sorular
Yok.

## Sonraki adım
- crw2-fb hızlı yeniden bakış, ardından merge (lider).
- `fo72-pg` container'ı açık bırakıldı; merge sonrası silinecek.
