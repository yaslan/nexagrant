# TASK-MVCH2J271U5VY — FO-60 PS-K2 PartnerSearchIngestor, zamanlayıcı, alarm ve global bayrak

**Ajan:** be-fb · **Sprint:** SPRINT-FONBRIDGE-PS2 · **Dal:** `be-fb/fo60-on-154` (#154 `be-fb/fo113-interreg-review` @ `7dbaa76d` üstünden) · **Platform:** mac (darwin). Sunucu işi; Windows/Linux koşulmadı (kod yolunda platforma bağlı kısım yok: HTTP, DB, cron).

**Hüküm: Bitti.** Kartın kabul maddeleri kanıtlı (yerel). Açık kalanlar: PR açılmadı, pre-push gate sonucu yok, "arşivleme" yerine "silme" (aşağıda karar), tam paket koşulmadı.

## Başlangıç durumu ve sıralama

- **FO-127#push:** Yerel commit `46146d3c` (`be-fb/fo127-module-gate-scan`), worktree temiz; testler `tests/api/v1-module-gate.test.ts` + `tests/modules/machine-viewer-source.test.ts` **29/29 geçti**. Uzak dal yoktu. `git push -u origin` pre-push gate'inde (`githooks/pre-push` → `pnpm gate`, paylaşılan gate kilidi dahil) **reddedildi** ("failed to push some refs"; testlerden biri düştü, çıktı `tail` ile kesildi). İlk deneme yalnız bu hatayı verdi; tam log ile yeniden deneme yapıldı, sonucu aşağıda bildirilecek.
- **PS-K1 bağımlılığı:** Kartta "backlog" yazıyor ama PS-K1 **dev'de**: PR #147 (FO-58, MERGED 2026-10-21) modelleri ve `src/modules/m1/server/partner-search/match-pic.ts` getiriyor. Kart durumu eski.
- **Önceki FO-60 dalı:** `be-fb/fo60-partner-search-ingestor` (dev tabanlı, PR açılmamış) içinde FO-60 commit'leri ve iki önceki koşunun raporu vardı; kart "KISMEN TAMAM" demişti. Bu dal #154'ten değil dev'den türediği için kullanılmadı; commit'ler #154 ucuna taşındı (cherry-pick, çakışma yok).

## Ne yapıldı

Taşınan commit'ler (sırayla):

| Commit (yeni) | Kaynak | İçerik |
|---|---|---|
| `297eb99b` | `b372e736` | Adapter, zod şeması, ingestor, `partner-search` job, `schedule.ts` cron `0 3 * * *`, K1'e olay yayımı (try/catch), global bayrak `partner_search_ingestion_enabled`, `PartnerSearchIngestionRun`, migration'lar |
| `1fa73660` | `8cd93cee` | Ingestor testleri: bayrak kapalı/okunamayan, 403/429 → FAILED + alarm, şema drift → alarm, veri silinmez |
| `ffe4f147` | `78b63a9a` | İnceleme düzeltmeleri: günde en fazla bir kaçırma, taşınan ilanlar, topic bazlı yazma izolasyonu, `missedScanAt` migration'ı |
| `e55b752d` | `5cf0844e` (FO-65 F3) | E-posta/telefon maskeleme (`mask.ts`) — açıklama ve RawFetch maskeli yazılır |
| `f64e473f` | `8c92d84b` (FO-65 F2) | `PlatformSetting` fabrika_app için salt-okunur; `set_platform_setting` SECURITY DEFINER yazıcısı + AuditEvent |
| `4c358dc3` | `a12da65f` (FO-65 F4) | Retention job (`partner-search-retention`, 03:15 UTC), flag kapalıyken no-op |
| `f61259f3` | `2b788030` | Retention where-guard düzeltmesi (geçersiz tarihte silme yapmaz) |

FO-65 commit'lerini neden aldım: FO-60 kodu üzerindeki güvenlik incelemesi (`TASK-MVCH3FSXFEI2K-se-fb.md`, F2–F4) bu düzeltmeleri şart koşuyor; kart da "kapalı topic ilanları 90 gün sonra" istiyor. FO-65 kartı ayrı bir kart; aynı commit'ler artık iki dalda var (`be-fb/fo60-partner-search-ingestor` ve bu dal).

## Kart DoD

- [x] Adaptör + zod + drift alarmı — `src/lib/adapters/partner-search.ts`, `schemas/partner-search.ts`; drift → `reportSchemaDrift`, koşu FAILED, veri silinmez (live test)
- [x] Ingestor + withdrawn + PIC eşleme + org bayrakları — `src/modules/m1/server/partner-search/ingestor.ts`; withdrawn = iki ardışık kaçırma (live test)
- [x] Gece + artımlı job, ayrı kuyruk, bayrak varsayılan kapalı — `schedule.ts`, `events` olayı; `PlatformSetting` varsayılanı `false`
- [x] 403/429 → durdur + alarm (test) — live ve birim testleri
- [x] Kişi verisi yok (SQL kanıtı) — aşağıda
- [ ] Platform beyanı — yukarıda (mac)

## Kanıt

### Birim ve canlı DB testleri

Komut (izole DB, `DATABASE_URL_RLS_TEST` fabrika_app rolüne):
```
DATABASE_URL=postgresql://postgres:***@127.0.0.1:55980/fo60 \
DATABASE_URL_RLS_TEST=postgresql://fabrika_app:***@127.0.0.1:55980/fo60 \
npx vitest run tests/partner-search-ingest.live.test.ts tests/partner-search-ingestor.test.ts \
  tests/partner-search-core.test.ts tests/partner-search-adapter.test.ts tests/partner-search-mask.test.ts

 Test Files  5 passed (5)
      Tests  57 passed (57)
```
Ayrıca `tests/jobs-schedule.test.ts` ve `tests/rls-coverage.test.ts` dahil 6 dosya **96/96** (DB'siz koşu).

İlk canlı koşuda `app role cannot UPDATE PlatformSetting` ve `writer refuses ...` testleri `DATABASE_URL_RLS_TEST` eksik olduğu için düştü; değişken verilince geçti. Kod hatası değildi.

### Typecheck / lint

- `pnpm exec tsc --noEmit` → çıkış 0, 0 satır (Prisma client `prisma generate` ile yenilendi).
- `pnpm exec eslint <partner-search dosyaları>` → çıkış 0.

### Migration idempotency

Izole `pgvector/pgvector:pg16` konteyneri (`fo60-pg-iso`, 127.0.0.1:55980, DB `fo60`; sonunda kaldırıldı). Şema `prisma db push`, sonra `prisma/rls-app-role.sql` (parola `fabrika.app_password` ile) ve `scripts/apply-migrations.sh` **iki kez**:
```
RUN1 EXIT=0 errors=0
RUN2 EXIT=0 errors=0
```
Paylaşımlı 5433 DB'ye yazılmadı.

### Gerçek portal koşusu (izole DB, bayrak yalnızca orada açık)

Topic: `CERV-2026-DAPHNE-PREVENTION` (izole DB'de elle eklenen Programme/Call/Topic satırıyla; topic SEDIA listesinde bulundu).
```
$ pnpm jobs:partner-search -- --topic CERV-2026-DAPHNE-PREVENTION
[jobs:partner-search] run cmvmi1mvb0000unxkfqlt3n91 status=SUCCESS { topicsScanned: 1, created: 206, updated: 0, withdrawn: 0, personAnnouncementCount: 0 }
$ (ikinci koşu)
[jobs:partner-search] run cmvmi2eru0000e6xka9veouhd status=SUCCESS { topicsScanned: 1, created: 0, updated: 206, withdrawn: 0, personAnnouncementCount: 0 }
```
SQL:
```
SELECT count(*) FROM "PartnerSearchAnnouncement";                                   → 206   (ikinci koşu çoğaltmadı)
SELECT count(*) FROM "PartnerSearchAnnouncement" WHERE raw::text ILIKE '%ecas%';     → 0
SELECT count(*) FROM "RawFetch" WHERE payload::text ILIKE '%ecasId%';                → 0
SELECT count(*) FROM "PartnerSearchAnnouncement" WHERE "withdrawnAt" IS NOT NULL;    → 0
```
Not: ikinci koşuda satırlar değişmedi ama `updated=206` yazıyor (upsert sayımı). Veri bozulmuyor; etiket yanıltıcı. Düzeltilmedi (bkz. Riskler).

Ayrıca izole DB'deki `PartnerSearchIngestionRun` tablosunda canlı testlerden gelen ek satırlar ve iki `FAILED` koşusu var; bunlar test senaryoları (şema drift / 403) — beklenen.

## Değişen dosyalar

Bu dal ilk kez #154 üstünde; yukarıdaki commit'lerin tüm dosyaları. Bu rapor: `docs/agent-results/TASK-MVCH2J271U5VY-be-fb.md` (önceki iki koşunun raporları dalda kaldı: `-be-fb-2.md`).

## Riskler

1. **Silme ≠ arşiv.** Kart "90 gün sonra arşivlenir" diyor; `retention.ts` kapalı topic ilanlarını ve RawFetch'i **siler** (kod yorumu bunu "arşiv" sayıyor). Gizlilik açısından silme daha güvenli; ama kart metni farklı. Karar aşağıda.
2. **Upsert sayımı.** Aynı veriyle ikinci koşuda `updated=N` görünüyor. Metriklerde yanlış okunabilir.
3. **Bağımlılık.** Bu dal #154'e bağlı (OPEN, `UNSTABLE`). #154 merge edilmeden ya da rebase edilmeden dev'e alınamaz. #154 değişirse çakışma olabilir.
4. **Bayrak DB'de.** Bayrak `PlatformSetting`'te; izole DB'de elle `UPDATE` ile açıldı. Üretimde açma yolu `set_platform_setting` (FO-65 F2) üzerinden olmalı.
5. **Önceki dal kopyası.** `be-fb/fo60-partner-search-ingestor` hâlâ duruyor (dev tabanlı, PR yok). İki dal aynı commit'lere sahip; birini kapatmak gerekebilir.
6. **Tam paket koşulmadı.** Önceki koşuda 56 DB-bağımlı test düşmüştü; bu koşuda yalnızca partner-search ve zamanlama testleri koşuldu.

## Açık sorular

- **Karar (lider/kullanıcı):** kapalı topic ilanları için "90 gün sonra silme" (mevcut, gizlilik dostu) mi, yoksa "arşiv" tablosuna taşıma (kart metni) mı?
- **PR:** Kart "ayrı branch + PR" istiyor. PR açmadım; #154 merge durumuna göre açılmalı.

## Sonraki adım

1. FO-127 push sonucunu bildir (pre-push gate bitince).
2. #154 merge edilince bu dalı dev'e rebase et; `updated` sayımını düzelt.
3. Arşiv/silme kararını bekle.
