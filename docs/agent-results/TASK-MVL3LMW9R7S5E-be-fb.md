# TASK-MVL3LMW9R7S5E (FO-120) — FO-60 düzeltmeleri: F2 yazma yetkisi, F3 maskeleme, F4 saklama işi

**Hüküm:** Bitti: F2, F3 ve F4 canlı izole DB'de doğrulandı, tam `pnpm gate` exit 0; PR dev'e açıldı, merge edilmedi.

**Platform:** mac (darwin, Docker'daki izole Postgres 16 + pgvector). Kod sunucu + DB tarafında; OS'a bağlı yol yok. Windows/Linux koşulmadı (sunucu/DB işi, platform bağımlılığı beklenmiyor).

## Ne yapıldı

- **Dal/temel:** Kartın andığı SHA'lar (`5cf0844e`…`2b788030`) pre-#154 çizgisinde. Crw-fb'nin ONAY verdiği `4bf777eb` (`be-fb/fo60-on-154`) ise PR #154 (dev'e merge) üstünde ve F2–F4 commit'lerini zaten içeriyor (`f64e473f`, `e55b752d`, `4c358dc3`, `f61259f3`). Bu çizgiyi `origin/dev` (265cac4a) üstüne rebase ettim; 9 commit uygulandı. Çakışmalar: `prisma/migrations/apply-order.txt` (dev'in `add-expert-founder-counter.sql` satırı korundu, FO-60 migration'ları sona eklendi) ve `prisma/rls-app-role.sql` (ExpertFounderCounter REVOKE bloğu ve PlatformSetting REVOKE bloğu ayrı `IF` olarak ikisi de korundu).
- **F2:** `prisma/migrations/platform-setting-write-guard.sql` — `set_platform_setting()` tek yazma yolu, her yazma `AuditEvent` üretir; `fabrika_app` PlatformSetting üzerinde INSERT/UPDATE/DELETE yetkisi yok.
- **F3:** `src/modules/m1/server/partner-search/mask.ts` — `maskContact()` tek fonksiyon; `ingestor.ts` özeti ve RawFetch payload'unu yazmadan önce maskeler. Not: UI tarafında henüz kullanılmıyor (kartın "UI gösteriminde de" maddesi bu PR'da değil).
- **F4:** `src/modules/m1/server/partner-search/retention.ts` + `src/lib/jobs/tasks/partner-search-retention.ts` + `schedule.ts` kaydı. Kapalı topic satırları 90 gün, withdrawn 30 gün, `source='partner_search'` RawFetch 90 gün; bayrak kapalıyken no-op.

## Ortam

- Docker: `pgvector/pgvector:pg16`, konteyner `fo120-pg`, `127.0.0.1:55420`, veritabanı `fabrika_fo120` (ortak 5433 ve `fabrika` adı kullanılmadı).
- Worktree: `.claude/worktrees/fo120-ps`, dal `be-fb/fo120-partner-search-fixes`.

## Kanıt (ham çıktı)

`pnpm db:setup` — iki kez koşuldu, ikisi de exit 0:
```
db-setup: done (127.0.0.1:55420/fabrika_fo120)
```

`pnpm rls:check`:
```
✅ SUCCESS: every one of them carries ENABLE + FORCE + tenant_isolation in its own migration.
CHECK 4c — 9 policy-less tables ... PlatformSetting ...
✅ SUCCESS: every one of them DISABLEs row level security in its own migration.
EXIT 0
```

`pnpm rls:verify --require-db`:
```
Ölçüm rolü: fabrika_app (rolsuper=false, rolbypassrls=false) — kaynak: DATABASE_URL_RLS_TEST
✅ 48 kiracıya özel tabloda politika yerinde ve izolasyon fabrika_app rolüyle GERÇEKTEN ölçüldü
EXIT 0
```

Canlı test (`tests/partner-search-ingest.live.test.ts`): **15 passed, 0 skipped.** Kartın DoD kalemleri bu testlerle karşılanıyor:
- fabrika_app UPDATE/INSERT reddi (SQLSTATE 42501) + `set_platform_setting` ile AuditEvent — `app role cannot UPDATE PlatformSetting; the writer does, and leaves an AuditEvent`
- e-posta/telefon maskeleme — `e-mail and phone in a summary are masked in the row and in RawFetch (FO-65 F3)`
- closed 91 gün siliniyor / 89 kalıyor; withdrawn 31 siliniyor / 29 kalıyor — `flag ON: closed-topic rows at 91 days go, at 89 days stay; withdrawn at 31 go, at 29 stay`
- OPEN topic eski satırlarını korur; bayrak kapalıyken no-op.

Hedefli vitest (8 dosya, partner-search + where-guard + rls-coverage + jobs-schedule):
```
Test Files  8 passed (8)
Tests  133 passed (133)
```
skipped: 0.

Tam `pnpm gate` (tek başına koşuldu, log: scratchpad `gate.log`):
```
GATE EXIT 0
  395 passed (9.9m)   # e2e
  11 skipped          # e2e
  Test Files  402 passed | 3 skipped (405)
  Tests  5256 passed | 111 skipped (5367)
```
e2e failure sayısı: 0.

## Kart ile brief arasında fark

Brief "90/89 gün ve withdrawn+30 gün" diyordu; kart "91 siliniyor/89 kalıyor, withdrawn+31 siliniyor/29 kalıyor" diyor. Kart geçerlidir; testler kartın sınırlarını doğruluyor. Kod sabitleri 90 ve 30 gün, karşılaştırma "daha eski" (strict) olduğu için sınır davranışı kartla uyumlu.

## Riskler

- Kartın andığı eski commit'ler (`5cf0844e`…`2b788030`, `be-fb/fo60-partner-search-ingestor`) pre-#154 çizgisinde; bu PR'da kullanılmıyor, dal yerelde duruyor.
- Maskeleme UI'da henüz kullanılmıyor (yukarıda).
- `fo120-pg` konteyneri koşuyor; işi kapatınca silinebilir.

## Açık sorular

- FO-60 için ayrı bir PR yok; bu PR FO-60 round-4'ü (ONAY @4bf777eb) ve F2–F4'ü tek seferde içeriyor. FO-60 ile aynı PR'da olmasının gerekçesi: FO-60'ın kendi PR'ı hiç açılmamıştı ve F2–F4 onun üstünde ONAY almış çizginin parçası.

## Sonraki adım

PR incelemesi ve merge (merge bu işte yapılmadı).

## Definition of Done

- [x] F2: fabrika_app UPDATE reddi + admin yazmasında AuditEvent (canlı test çıktısı yukarıda)
- [x] F3: maskeleme testi (e-posta + telefon) yeşil; maske tek fonksiyonda (`mask.ts`)
- [x] F4: 90 gün / withdrawn+30 gün sınır testleri yeşil; cron kaydı (`schedule.ts`)
- [x] rls:check + rls:verify temiz
- [x] Gate tek başına yeşil; PR dev'e açık (FO-60 ile aynı PR, gerekçe yukarıda)
- [x] Platform beyanı: mac'te ölçüldü; sunucu + DB
