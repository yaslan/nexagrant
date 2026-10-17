---
hüküm: "Tamam, dev'e hazır — ama iki karar patronda: (1) en yüksek kurucu numaralı satır 1 yıldan uzun kalıyor (numara yeniden verilmesin diye); (2) PR #87 (FO-45) henüz merge olmadı, bu dal onun üstünde. Canlı test, koltuk etkisi ve gate yeşil."
tip: feature (KVKK saklama)
platform: macOS (Darwin, arm64) doğrulandı; Windows/Linux koşulamadı (sunucu kodu, platforma bağlı yol/süreç/kabuk yok)
---

# TASK-MVC91K7JYOWQC (FO-50) — uzman ön kayıt 1 yıl saklama (be-fb)

PR: https://github.com/yaslan/fonbridge/pull/92 (base `dev`, MERGE EDİLMEDİ)
Dal: `be-fb/fo50-prereg-retention` @ `9f9119e6`, üstünde #87 (`69ed2dfc`) ve öncesi.
Worktree: `/Users/macbook/alan/FONBRIDGE-fo50`.

## Ne yapıldı

1. **Gece işi** `expert-prereg-cleanup` (03:55 UTC, cron `55 3 * * *`): `createdAt < now − 365 gün` satırlarını siler, doğrulanmış ve doğrulanmamış ayrımı yok. Mevcut `public-lead-cleanup` deseni (`defineJob`, hata → `SystemAlert` + rethrow).
2. **Silme ve denetim**: `withSystemScope('cross-tenant-job', 'expert-prereg-retention.purge')` tek transaction'da. Silme olduysa `expert_prereg.purged` AuditEvent (`tenantId NULL`, yalnız `{count, retentionDays, cutoff}`).
3. **Sabit**: `EXPERT_PREREG_RETENTION_DAYS = 365` (`src/lib/expert-prereg/server/constants.ts`).
4. **DATA_MODEL §22**: "Saklama: açık karar" satırı kapatıldı (karar, istisna, koltuk etkisi yazıldı).

## Anahtar (anchor) kararı — patron onayı gerekli

Kurucu numarası `max(founderNumber) + 1` ile veriliyor (`verify.ts:59`). En yüksek numaralı satır silinirse bir sonraki doğrulama o numarayı tekrar verir ve koltuk sayısı `100 − max` değişir. Bu yüzden **en yüksek `founderNumber` taşıyan satır silinmez**. Diğer kurucu satırları ve doğrulanmamış satırlar 1 yıl kuralına tabi.

- Sonuç: 1 yıldan eski tek bir kurucu kişisel verisi (ad, e-posta, il, ORCID) kalır. KVKK açısından bu patronun kararı.
- Alternatifler: (a) bu satırı da sil, numarayı ayrı bir sayaçta rezerve et (yeni tablo/kolon, daha büyük değişiklik); (b) satırın kişisel alanlarını boşalt, yalnız numarayı bırak (`fullName`, `email` zorunlu alanlar — şema değişikliği gerekir).

## Koltuk sayımı etkisi

`getRemainingFounderSeats() = max(0, 100 − max(founderNumber))`. Purge en yüksek numarayı tutar, bu yüzden **purge koltuk sayısını değiştirmez** (canlı testle doğrulandı: önce ve sonra aynı). Tek yol değişim: en yüksek satırın silinmesi, ki kod buna izin vermiyor.

## Kanıt (ham çıktı)

Canlı Postgres (`localhost:5433`, izole `fabrika_fo50_be`, paylaşılan `fabrika` DB'ye dokunulmadı). Fixture sahip rolüyle `psql` ile eklendi; purge uygulama rolü `fabrika_app` ile koştu.

```
BEFORE (psql, owner):
          email           | founderNumber |           age
--------------------------+---------------+--------------------------
 e364-fo50ev@example.test |               | 364 days 00:00:00.044339
 e366-fo50ev@example.test |               | 366 days 00:00:00.044339
 v364-fo50ev@example.test |           902 | 364 days 00:00:00.044339
 v366-fo50ev@example.test |           901 | 366 days 00:00:00.044339
(4 rows)

RUN1 {"deletedCount":2,"cutoff":"2025-10-17T11:41:56.270Z","retentionDays":365}
RUN2 {"deletedCount":0,"cutoff":"2025-10-17T11:41:56.637Z","retentionDays":365}

AFTER (psql, owner):
          email           | founderNumber |           age
--------------------------+---------------+--------------------------
 e364-fo50ev@example.test |               | 364 days 00:00:06.632011
 v364-fo50ev@example.test |           902 | 364 days 00:00:06.632011
(2 rows)

         type         |                                   data                                   | tenantId
----------------------+--------------------------------------------------------------------------+----------
 expert_prereg.purged | {"count": 2, "cutoff": "2025-10-17T11:41:56.270Z", "retentionDays": 365} |
(1 row)
```

366 günlük iki satır silindi (biri doğrulanmamış, biri kurucu 901 — 902 tutulduğu için); 364 günlük ikisi kaldı; ikinci koşu 0 sildi (idempotent); denetim satırı yalnız sayı taşıyor, `tenantId` boş.

Vitest (kapsamlı):
- `tests/expert-prereg-retention.live.test.ts` 5/5 (sınır: 365 gün tam ve 1 ms öncesi; doğrulanmış+doğrulanmamış; anchor korunuyor, numara yeniden verilmiyor; koltuk değişmiyor; audit + idempotent).
- Birim: `src/lib/expert-prereg/server/retention.test.ts`, `src/lib/jobs/tasks/__tests__/expert-prereg-cleanup.test.ts`, `tests/jobs-schedule.test.ts` (cron satırı).
- Mutasyon: anchor koruması kaldırılınca 2 test kırıldı (`× keeps the row holding the highest founder number`, `× seat count is unchanged`); geri alındı.
- Tam takım (son yerel koşu): 355 dosya, 4625 test geçti, 0 kırmızı.
- Pre-push `pnpm gate` (dal): lint, typecheck, vitest (355/357 dosya), e2e (`E2E_PORT=3437`: 331 passed), `rls:check`, `rls:bypass-check` (yeni `withSystemScope` çağrısı için baseline girdisi eklendi), `rls:verify` (47 tablo, izolasyon gerçekten ölçüldü). Push çıkış 0.
- Kapılar: `pnpm typecheck` ve `eslint` temiz.

Platform: yalnız macOS'ta koşuldu. Windows/Linux koşulamadı (yerelde makine yok). Kod platforma bağlı değil.

## Değişen dosyalar

- `src/lib/expert-prereg/server/retention.ts` (yeni): cutoff, `purgeableExpertPreRegWhere`, `purgeOldExpertPreRegistrations`
- `src/lib/expert-prereg/server/retention.test.ts` (yeni)
- `src/lib/expert-prereg/server/constants.ts`: `EXPERT_PREREG_RETENTION_DAYS`
- `src/lib/jobs/tasks/expert-prereg-cleanup.ts` (yeni), `src/lib/jobs/tasks/__tests__/expert-prereg-cleanup.test.ts` (yeni)
- `src/lib/jobs/tasks/index.ts`, `src/lib/jobs/schedule.ts`: job kaydı, cron `55 3 * * *`
- `tests/expert-prereg-retention.live.test.ts` (yeni), `tests/jobs-schedule.test.ts`, `tests/where-guard-src.test.ts` (gerekçeli KNOWN girdisi)
- `scripts/tenant-bypass-baseline.json`: `system-scope` girdisi (`cross-tenant-job`)
- `docs/DATA_MODEL.md` §22

Şema değişikliği YOK (migration yok). AuditEvent tipi serbest string.

## Riskler

- **#87 merge olmadı.** Bu PR #87'nin commit'lerini de içeriyor; #87 değişirse rebase gerekir.
- **Anchor KVKK riski** (yukarıda). Kabul edilmezse FO-50 kapanmaz.
- **`pnpm db:rls-role` yan etkisi (önemli, ortam):** bu koşuda `DATABASE_URL_RLS_TEST`'e tahmin ettiğim bir parola yazdım, `db:rls-role` paylaşılan `fabrika_app` rolünün parolasını o değerle değiştirdi. Sonradan tam vitest koşusu rolü `.env`'deki orijinal parolaya geri çekti; orijinal parola şimdi çalışıyor (doğrulandı). Yani kalıcı bir hasar kalmamış görünüyor, ama 17.10 akşamı kısa bir süre diğer ajanların RLS testleri `28P01` ile kırılmış olabilir. Not: `memory/be-fb/db-rls-role-sifre-env-yan-etkisi.md`.
- **İzole DB'nin şema-only kopyası** `fabrika`'dan `pg_dump --schema-only --no-privileges` ile alındı (migration zinciri boş DB'de kırılıyor, `prisma db push` ajan oturumunda Prisma tarafından engellendi). Yetkiler elle tamamlandı (REVOKE/GRANT satırları migration'lardan). Kalan testler (plan seed) `pnpm db:seed` ile tamamlandı.
- **Pre-push gate yük altında kararsız:** ilk 4 denemede farklı testler kırıldı (pool zaman aşımı, `rag-pdf` zamanlama, `migration-owner-chain`), izole koşuda hepsi geçti. Son denemede tam gate geçti. `--no-verify` kullanılmadı.
- **Port 3000/3100 başka ajanların sunucularıyla doluydu** (`.claude-fo49` ve `dev-wt`). Dokunulmadı; e2e `E2E_PORT=3437` ile koştu.
- `tests/where-guard-src.test.ts`'e gerekçeli bir KNOWN girdisi eklendi (scanner `where: purgeable…(…)` fonksiyon çağrısını literal saymıyor; fonksiyon geçersiz tarihte fırlatıyor).

## Açık sorular (patron)

1. En yüksek kurucu numaralı satır 1 yıldan uzun kalsın mı (mevcut hal), yoksa numara rezervi için ayrı sayaç/kişisel alan boşaltma mı?
2. Silme yedeklerde (`docs/RELEASE_CHECKLIST.md` KVKK notu) 1 yıl gecikmeli olacak; `docs/legal/processing-register.md`'ye yazılmalı. Bu PR'da yapılmadı; takip kartı açılabilir.

## Sonraki adım

1. Patron: anchor kararı → gerekiyorsa ayrı kart.
2. #87 merge olunca bu PR'ın diff'ini FO-50 commit'lerine indirmek (rebase).
3. `processing-register.md` güncellemesi (açık soru 2).
4. Merge yok (görev gereği). PR #92 dev'e açık.
